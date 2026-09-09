"""Local SQLite store for synced t:connect data.

One file on disk, no server. Re-syncing is safe: every write is an idempotent
upsert keyed on the event's natural identity, so overlapping pulls merge rather
than duplicate.

Time model
----------
Every timestamp is normalized to a naive **local wall-clock** string,
``"YYYY-MM-DD HH:MM:SS"``. That choice is deliberate:

* A basal profile is a wall-clock schedule (00:00, 00:30, ...), so analysis
  wants local time-of-day, not UTC.
* The CGM feed has no timezone offset; pump feeds carry a UTC offset. Converting
  both to local wall clock makes them directly comparable.
* Fixed-width zero-padded strings sort lexicographically in chronological order,
  so the text column doubles as the range/sort key — no separate epoch needed.

The pump serial number present in the raw CGM rows is intentionally **not**
stored.
"""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Iterable, List, Optional

from .events import (
    BasalEvent,
    BolusEvent,
    CarbEntry,
    CgmReading,
    IobEvent,
    PumpEvent,
    format_t,
    parse_t,
)
from .settings import (
    ProfileSegment,
    ProfileSettings,
    PumpSettings,
    SleepSchedule,
    Snapshot,
)

# The IOB feed interleaves several therapy-timeline EventIDs at the same
# timestamps: EventID 81 is the regular ~5-10 min snapshot of total
# insulin-on-board (the continuous series), while others (20, 55, 64, 9, 16)
# are IOB tagged to individual bolus/correction events and can report a
# different value at the same instant. Keying IOB on (t, event_id) keeps all of
# them; the clean-window logic reads the continuous series via Store.iob_series.
CONTINUOUS_IOB_EVENT_ID = "81"

# --- value coercion ---------------------------------------------------------


class TimezoneNotConfigured(RuntimeError):
    """A tz-aware timestamp reached the store with ``TIMEZONE_NAME`` unset.

    Raised instead of silently converting against a ``UTC`` default — that default
    is *always* wrong for a real pump (it is never in UTC) and, when a fetch ran
    from a cwd with no ``.env``, stored every event at UTC wall time (+7 h for a
    Phoenix pump), doubling the whole bolus/iob/pump history as phantoms (#198)."""


class FocusAlreadyActive(RuntimeError):
    """A Focus pin was attempted while another Focus is already active (#244).

    At most one watched change is active at a time (ADR 0029); the ``focus``
    table's partial unique index rejects a second active pin. Surfaced as a 409 by
    the API's pin endpoint."""


class FollowUpConflict(RuntimeError):
    """A durable follow-up write could not use the caller's input state."""

    def __init__(self, reason: str, actual_revision: int):
        super().__init__(reason)
        self.reason = reason
        self.actual_revision = actual_revision


PLAN_ITEM_FAMILIES = frozenset(("basal", "isf", "ic", "target"))


def _validate_ic_block_groups(items: list) -> None:
    """Cross-check every I:C row's optional ``ic_block_provenance`` claim (#581).

    An unannotated ``ic`` row (no ``ic_block_provenance``) is untouched — a
    manual pick or a Revert-style draft carries none. When present, every row
    claiming the same block (same captured bounds + member list) must form a
    complete, internally consistent group: exactly one row per listed member
    (no duplicates, no stray extra), an identical provenance object and an
    identical proposed value (normalized to 4-decimal precision) on every row,
    an integer ``block_start_min`` and member starts in ``[0, 1440)`` with an
    integer ``block_end_min`` in ``(0, 1440]``, and every listed member inside
    the block's wrap-aware arc ``[block_start_min, block_end_min)`` (a wrap
    past midnight is signalled by ``block_end_min < block_start_min``; the arc
    must be non-empty). A malformed or inconsistent group is rejected outright
    — this runs on both draft save and apply.
    """
    # The two bounds are different domains: a start is an inclusive minute of
    # day, while the end is the arc's *exclusive* close, so the all-day block
    # the I:C analyzer publishes for a flat profile ends at 1440 (#357). These
    # are the domains ``ic_history.HistoryIdentity`` enforces on the same
    # fields — that module is the authority on I:C block identity.
    def _int(value):
        return isinstance(value, int) and not isinstance(value, bool)

    def _minute(value):
        return _int(value) and 0 <= value < 1440

    def _exclusive_end(value):
        return _int(value) and 0 < value <= 1440

    groups: dict = {}
    for idx, item in enumerate(items):
        if item.get("type") != "ic":
            continue
        prov = item.get("ic_block_provenance")
        if prov is None:
            continue
        if not isinstance(prov, dict):
            raise ValueError(f"plan item {idx} has an invalid ic_block_provenance")
        start = prov.get("block_start_min")
        end = prov.get("block_end_min")
        members = prov.get("block_member_start_mins")
        if not _minute(start) or not _exclusive_end(end):
            raise ValueError(
                f"plan item {idx} has an invalid I:C block bounds {prov!r}")
        if (not isinstance(members, list) or not members
                or any(not _minute(m) for m in members)):
            raise ValueError(
                f"plan item {idx} has an invalid I:C block member list {prov!r}")
        if end == start:
            raise ValueError(
                f"plan item {idx}'s I:C block arc {start}-{end} is empty")
        groups.setdefault((start, end, tuple(members)), []).append((idx, item, prov))

    for (start, end, members), rows in groups.items():
        wrap = end < start
        for m in members:
            in_arc = (m >= start or m < end) if wrap else (start <= m < end)
            if not in_arc:
                raise ValueError(
                    f"I:C block member {m} falls outside its claimed block {start}-{end}")

        seen_starts: dict = {}
        for idx, item, _prov in rows:
            s = item.get("start_min")
            if s in seen_starts:
                raise ValueError(
                    f"plan item {idx} duplicates I:C block member {s} "
                    f"already claimed by item {seen_starts[s]}")
            seen_starts[s] = idx

        member_set = set(members)
        if len(rows) != len(members) or set(seen_starts) != member_set:
            raise ValueError(
                f"I:C block {start}-{end} is incompletely staged: expected "
                f"members {sorted(member_set)}, got {sorted(seen_starts)}")

        first_idx, first_item, first_prov = rows[0]
        try:
            first_value = round(float(first_item.get("value")), 4)
        except (TypeError, ValueError):
            raise ValueError(f"plan item {first_idx} has a non-numeric I:C value")
        for idx, item, prov in rows:
            if prov != first_prov:
                raise ValueError(
                    f"plan item {idx} has an ic_block_provenance inconsistent "
                    f"with the rest of I:C block {start}-{end}")
            try:
                value = round(float(item.get("value")), 4)
            except (TypeError, ValueError):
                raise ValueError(f"plan item {idx} has a non-numeric I:C value")
            if value != first_value:
                raise ValueError(
                    f"plan item {idx} has a value inconsistent with the rest "
                    f"of I:C block {start}-{end}")


def validate_plan_items(items: list) -> Optional[str]:
    """Return the draft's one tuning family, or ``None`` for an empty draft.

    ADR 0042 makes the Plan itself the one-variable commit: multiple rows are
    allowed only when they are all the same pump-setting family (for example a
    multi-slot basal edit or ISF fan-out across all segments). #581 adds a
    second, orthogonal check: any row carrying an ``ic_block_provenance``
    claim must belong to a complete, internally consistent block group (see
    ``_validate_ic_block_groups``) — unannotated rows are unaffected.
    """
    if not isinstance(items, list):
        raise ValueError("plan items must be a list")
    family = None
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise ValueError(f"plan item {idx} must be an object")
        item_family = item.get("type")
        if item_family not in PLAN_ITEM_FAMILIES:
            allowed = ", ".join(sorted(PLAN_ITEM_FAMILIES))
            raise ValueError(
                f"plan item {idx} has unsupported tuning family {item_family!r}; "
                f"expected one of {allowed}")
        if family is None:
            family = item_family
        elif item_family != family:
            raise ValueError(
                f"plan draft mixes tuning families: {family!r} and {item_family!r}")
    _validate_ic_block_groups(items)
    return family


def normalize_time(s: Optional[str]) -> Optional[str]:
    """Normalize either input timestamp format to local wall-clock text.

    Handles both ``"2022-05-27T00:00:00Z"`` / ``"2022-05-27 00:00:00+00:00"``
    (UTC pump feeds) and ``"2022-05-27T00:04:28"`` (naive CGM feed, already
    local). Tz-aware timestamps are converted to the local timezone set by
    ``TIMEZONE_NAME`` before stripping tzinfo; naive timestamps are assumed
    already local and passed through as-is.

    Converting a tz-aware timestamp needs ``TIMEZONE_NAME``; if it is unset we
    raise :class:`TimezoneNotConfigured` rather than fall back to ``UTC``. The old
    silent fallback stored every record 7 h off the pump's clock (#198).
    """
    if not s:
        return None
    dt = datetime.fromisoformat(s.replace("T", " ").replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        tz_name = os.environ.get("TIMEZONE_NAME")
        if not tz_name:
            raise TimezoneNotConfigured(
                "TIMEZONE_NAME is not set; refusing to convert a tz-aware "
                "timestamp. Defaulting to UTC would store every record off the "
                "pump's local wall clock (#198). Set TIMEZONE_NAME to the pump's "
                "timezone (see .env.example).")
        dt = dt.astimezone(ZoneInfo(tz_name)).replace(tzinfo=None)
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def _f(v) -> Optional[float]:
    """Float, or None for empty/missing."""
    if v is None or v == "":
        return None
    return float(v)


def _i(v) -> Optional[int]:
    """Int, or None for empty/missing."""
    if v is None or v == "":
        return None
    return int(v)


def _seq_key(r: dict, kind: str) -> int:
    """The pump ``seq_num`` that keys a pump-feed row, or fail loudly.

    seq_num is the natural key for the ``basal``/``bolus``/``iob``/``pump`` tables
    (#194/#198). Each is a single-column INTEGER primary key — a SQLite rowid alias
    — so a NULL would be *auto-assigned* a distinct rowid rather than merged,
    silently re-opening the re-pull doubling the key exists to prevent. Every real
    pump event carries a seqNum, so a missing one is a mapping bug, not data."""
    seq = _i(r.get("seq_num"))
    if seq is None:
        raise ValueError(
            f"{kind} row is missing seq_num — the pump's stable event sequence "
            "number is the row's natural key (#194/#198)")
    return seq


# --- schema -----------------------------------------------------------------

_SCHEMA = """
-- The unbolused-carb log (#125): a real MANUAL carb source, the exclusion signal
-- ADR 0003 said to revisit once one existed. This reintroduces a `carb_entries`
-- table, but nothing like the dead LidCarbsEntered (event 48) feed 0003 dropped.
-- 0003's `DROP TABLE IF EXISTS carb_entries` is retired: every live DB already
-- shed the empty event-48 orphan on a prior open, so create-if-absent is clean.
-- Used only to de-bias the analyzers (fasting-ISF window), never a modeling input.
CREATE TABLE IF NOT EXISTS carb_entries (
    id         INTEGER PRIMARY KEY,
    t          TEXT NOT NULL,           -- wall-clock time of the carbs (user-editable)
    grams      REAL,                    -- NULL only when certainty = 'unknown'
    certainty  TEXT NOT NULL,           -- exact | estimate | unknown
    source     TEXT NOT NULL,           -- manual | rise-prompt | low-prompt
    note       TEXT,
    created_at TEXT NOT NULL
);

-- A user's answer to a recomputed detector prompt (#125). Prompt identity is
-- (detector, anchor_t) with a time tolerance — instances are recomputed, never
-- stored — so this table records only the ANSWER. "no" / "not-sure" are
-- first-class stored answers (negative / abstain labels), not dismissals. When the
-- answer is "carbs", carb_entry_id references the entry created in the same
-- transaction; deleting that entry cascades this row away so the prompt resurrects.
CREATE TABLE IF NOT EXISTS prompt_responses (
    id            INTEGER PRIMARY KEY,
    detector      TEXT NOT NULL,        -- missed-meal | low
    anchor_t      TEXT NOT NULL,
    answer        TEXT NOT NULL,        -- carbs | no | not-sure | false-low (#381: sensor artifact)
    carb_entry_id INTEGER REFERENCES carb_entries(id) ON DELETE CASCADE,
    answered_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS basal_events (
    seq_num           INTEGER NOT NULL, -- pump's stable per-event sequence number
    t                 TEXT NOT NULL,
    delivery_type     TEXT NOT NULL,   -- profileDelivery | algorithmDelivery
    duration_mins     REAL,
    basal_rate        REAL,            -- delivered (commandedRate)
    profile_basal_rate REAL,           -- programmed (profileBasalRate)
    -- Keyed on the pump's seqNum, not (t, delivery_type): a delivery's
    -- eventTimestamp is not stable across pulls, so keying on it let a re-pull
    -- insert a jittered duplicate and double the stream (#194). seqNum is
    -- identical across pulls of the same event, so re-pulls merge losslessly.
    PRIMARY KEY (seq_num)
);

CREATE TABLE IF NOT EXISTS bolus_events (
    seq_num           INTEGER NOT NULL, -- pump's stable per-event sequence number (#198)
    t                 TEXT NOT NULL,   -- request (or extended-start) time
    description       TEXT NOT NULL,
    completion        TEXT,
    insulin           REAL,
    requested_insulin REAL,
    carbs             REAL,
    bg                REAL,            -- empty for some automatic CIQ boluses
    user_override     INTEGER,
    extended          INTEGER,
    completion_t      TEXT,
    bolus_options     INTEGER,         -- raw LidBolusRequestedMsg2.options provenance code; NULL pre-#135 / no Msg2
    correction_insulin REAL,           -- LidBolusRequestedMsg3.correctionbolussize (requested); NULL pre-#160 / no Msg3
    food_insulin      REAL,            -- LidBolusRequestedMsg3.foodbolussize (requested); NULL pre-#160 / no Msg3
    pump_iob          REAL,            -- LidBolusRequestedMsg1.IOB: pump's reported IOB anchor; NULL pre-#162 / no Msg1
    selected_iob      INTEGER,         -- LidBolusRequestedMsg2.selectediobRaw curve family (0=Mudaliar,1=Swan); NULL pre-#162 / no Msg2
    standard_percent  INTEGER,         -- LidBolusRequestedMsg2.standardpercent (extended shape); NULL pre-#162 / no Msg2
    extended_duration INTEGER,         -- LidBolusRequestedMsg2.duration (extended shape); NULL pre-#162 / no Msg2
    declined_correction INTEGER,       -- LidBolusRequestedMsg2.declinedcorrection: user declined the recommended correction (raw only; wired to nothing, ADR 0015); NULL pre-#161 / no Msg2
    isf               REAL,            -- LidBolusRequestedMsg2.ISF the pump used at this dose (mg/dL per U, whole); 0-sentinel stored NULL; NULL pre-#159 / no Msg2
    target_bg         REAL,            -- LidBolusRequestedMsg2.targetbg at this dose (mg/dL, whole); 0-sentinel stored NULL; persisted for completeness, no analyzer reads it (#159)
    carb_ratio        REAL,            -- LidBolusRequestedMsg1.carbratioRaw÷1000 (g/U, snapshot scale) at this dose; only on carb-bearing doses; NULL pre-#159 / no Msg1 / correction-only
    -- Keyed on seqNum, not (t, description, insulin): a fetch with the wrong tz
    -- shifted every bolus's t and re-inserted the whole history as +7h phantoms
    -- (#198). seqNum is stable across pulls, so a re-pull merges instead.
    PRIMARY KEY (seq_num)
);

CREATE TABLE IF NOT EXISTS cgm_readings (
    t    TEXT PRIMARY KEY,
    bg   REAL,
    type TEXT                          -- e.g. EGV
);

CREATE TABLE IF NOT EXISTS iob_events (
    seq_num  INTEGER NOT NULL, -- pump's stable per-event sequence number (#198)
    t        TEXT NOT NULL,
    iob      REAL,
    event_id TEXT NOT NULL,   -- raw therapy-timeline EventID (see CONTINUOUS_IOB_EVENT_ID)
    PRIMARY KEY (seq_num)     -- not (t, event_id): survives a wrong-tz re-pull (#198)
);

CREATE TABLE IF NOT EXISTS pump_events (
    seq_num       INTEGER NOT NULL,    -- pump's stable per-event sequence number (#198)
    t             TEXT NOT NULL,
    event_type    TEXT NOT NULL,       -- Sleep | Exercise | Site/Cartridge Change | ...
    duration_mins REAL,
    -- Keyed on seqNum, not (t, event_type), to survive a wrong-tz re-pull (#198).
    -- One consequence: the cartridge/cannula/tubing sub-events of a single site
    -- change no longer collapse onto one row (distinct seqNums) — harmless, they
    -- share an instant so they yield the same exclusion window / chart marker.
    PRIMARY KEY (seq_num)
);

-- Append-only settings snapshots: one row per profile (IDP) per fetch. There is
-- no settings-change event in Tandem Source, so successive snapshots are diffed
-- (settings.changelog) to reconstruct the forward-only ISF/IC/target change-log.
CREATE TABLE IF NOT EXISTS profile_settings (
    captured_at   TEXT NOT NULL,       -- fetch wall-clock instant
    idp           INTEGER NOT NULL,
    active_idp    INTEGER NOT NULL,    -- which IDP was active at capture
    name          TEXT,
    dia_min       INTEGER,
    carb_entry    INTEGER,
    max_bolus     REAL,
    segments_json TEXT NOT NULL,       -- JSON [[start_min,basal_rate,isf,carb_ratio,target_bg],...]
    control_iq_json TEXT,              -- JSON [[start_min,end_min,[weekday,...]],...] sleep schedules (pump-wide, same on every row)
    PRIMARY KEY (captured_at, idp)
);

-- Single-row: the encrypted Tandem credentials (credentials.py). The
-- password is a Fernet token, not plaintext; the key that decrypts it lives
-- outside the DB (tconnect-data/secret.key).
CREATE TABLE IF NOT EXISTS credentials (
    id                 INTEGER PRIMARY KEY CHECK (id = 1),
    email              TEXT NOT NULL,
    password_encrypted BLOB NOT NULL,
    region             TEXT NOT NULL,
    updated_at         TEXT NOT NULL
);

-- Single-row: the hourly background fetch loop's last attempt (fetch_loop.py).
CREATE TABLE IF NOT EXISTS fetch_status (
    id                INTEGER PRIMARY KEY CHECK (id = 1),
    last_attempt_at   TEXT,
    last_success_at   TEXT,
    last_error        TEXT,
    last_written_json TEXT
);

-- "My plan" cart (#15) — a single current draft plus a timestamped apply
-- history. This is a UX nicety only: the settings-snapshot diff above
-- (profile_settings / settings.changelog) is the real source of truth for
-- what changed and when, this table does not feed back into analysis.
CREATE TABLE IF NOT EXISTS plan_draft (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    items_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_history (
    applied_at TEXT PRIMARY KEY,
    items_json TEXT NOT NULL
);

-- Legacy Focus identity/status (#244, ADR 0029). The existing trend derives
-- metrics from its lever at read time. ADR 386's retained comparison context and
-- ending assessment live separately in follow_up_records; legacy responses keep
-- this row's shape. The partial unique index permits at most one active Focus.
CREATE TABLE IF NOT EXISTS focus (
    id        INTEGER PRIMARY KEY,
    lever     TEXT NOT NULL,           -- a behavioral-flavored lever id (see watched_change.pinnable_levers)
    pinned_at TEXT NOT NULL,
    status    TEXT NOT NULL DEFAULT 'active'  -- active | resolved | dropped
);
CREATE UNIQUE INDEX IF NOT EXISTS focus_one_active
    ON focus(status) WHERE status = 'active';

-- Pattern-sweep human sign-off (#378). The sweep re-prices a generated candidate
-- grammar every reporting window; its per-cell verdicts and gate evidence are
-- fully RE-COMPUTABLE and never stored. The one irreplaceable thing is the human
-- decision on a cell that cleared the bar: approve (ship a card) or dismiss. A
-- decision is scoped to the era it was made against — a fresh era boundary
-- restarts a cell's accrual, so an old approve/dismiss must not silently carry a
-- card into a new regime. UNIQUE(cell_id, era_start) keeps the latest decision.
CREATE TABLE IF NOT EXISTS pattern_reviews (
    id         INTEGER PRIMARY KEY,
    cell_id    TEXT NOT NULL,           -- stable grammar-cell id (e.g. low__overnight__late-meal)
    era_start  TEXT NOT NULL,           -- the era boundary the decision was made against (YYYY-MM-DD)
    decision   TEXT NOT NULL,           -- approved | dismissed
    decided_at TEXT NOT NULL,
    UNIQUE (cell_id, era_start)
);

-- Audit dispositions are deliberately tiny: an item stays dismissed only while
-- the exact server-evidence fingerprint it was reviewed against is current.
CREATE TABLE IF NOT EXISTS audit_dismissals (
    item_id TEXT PRIMARY KEY,
    evidence_fingerprint TEXT NOT NULL,
    dismissed_at TEXT NOT NULL
);

-- ADR 383's durable user choice.  This is intentionally one bounded row per
-- subject, not a history of refreshes or a copy of analyzer output.
CREATE TABLE IF NOT EXISTS guidance_preferences (
    subject TEXT PRIMARY KEY,
    decided_at TEXT NOT NULL,
    reason TEXT,
    comparison_version TEXT NOT NULL,
    state_json TEXT NOT NULL
);

-- Monotonic generation for durable derivations.  It advances in the same
-- transaction as every Store-owned committed mutation, so a sidecar artifact
-- can never claim a primary-store snapshot it did not read.
CREATE TABLE IF NOT EXISTS input_data_revision (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    revision INTEGER NOT NULL
);
INSERT OR IGNORE INTO input_data_revision (id, revision) VALUES (1, 0);

-- Bounded historical facts, separate from the legacy Plan/Focus response shapes.
CREATE TABLE IF NOT EXISTS follow_up_records (
    kind TEXT NOT NULL CHECK (kind IN ('plan', 'trial', 'focus')),
    id TEXT NOT NULL,
    record_json TEXT NOT NULL,
    PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS follow_up_frontier (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    trial_id TEXT,
    detected_at TEXT,
    reconciled_input_revision INTEGER NOT NULL,
    CHECK ((trial_id IS NULL) = (detected_at IS NULL))
);
CREATE TABLE IF NOT EXISTS follow_up_requests (
    request_id TEXT PRIMARY KEY,
    operation TEXT NOT NULL,
    kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    result_json TEXT NOT NULL
);
"""

# Additive columns introduced after the first release, applied to pre-existing
# databases in :meth:`Store._migrate` (CREATE TABLE IF NOT EXISTS never alters an
# existing table). Each entry is (table, column, type).
_ADDED_COLUMNS = [
    ("profile_settings", "control_iq_json", "TEXT"),
    # A NEW column on a seqNum-rekeyed table (basal/bolus/iob/pump) DOES belong here.
    # `_rekey_seq_num_tables` only drops+recreates a table that *lacks* seq_num (legacy
    # pre-#194/#198 rows) — once every row carries seq_num it is a no-op, so it never
    # picks up a column added to the CREATE TABLE afterwards. Without this ALTER an
    # existing DB keeps the old table shape and the next `fetch` dies on
    # "table bolus_events has no column named isf" (#159 shipped this bug). On a still-
    # legacy DB the ALTER runs first and the rekey then recreates cleanly from the full
    # schema, so it is harmless there.
    ("bolus_events", "isf", "REAL"),          # #159 dose-stamped ISF
    ("bolus_events", "target_bg", "REAL"),    # #159 dose-stamped target BG
    ("bolus_events", "carb_ratio", "REAL"),   # #159 dose-stamped carb ratio
    ("focus", "pattern_key", "TEXT"),
]


_FOLLOW_UP_FIELDS = {
    'plan': {'applied_at', 'items', 'decision_context', 'deliverable',
             'reconciliation', 'withdrawal'},
    'trial': {'parameter', 'slot', 'changed_at', 'before', 'after',
              'block', 'members', 'first_observed_at', 'observed_context',
              'comparison_context', 'reconciliation', 'ending'},
    'focus': {'lever', 'pattern_key', 'pinned_at', 'status', 'decision_context',
              'comparison_context', 'ending'},
}
_FOLLOW_UP_ENVELOPES = frozenset((
    'decision_context', 'observed_context', 'comparison_context',
    'deliverable', 'reconciliation', 'withdrawal', 'ending',
))


class Store:
    """A connection to the local SQLite store.

    Usable as a context manager::

        with Store.open("data.db") as store:
            store.upsert_cgm(rows)
    """

    def __init__(self, conn: sqlite3.Connection, readonly: bool = False):
        self.conn = conn
        self._readonly = readonly
        self._follow_up_start_changes = None
        self._follow_up_failed = False
        self._follow_up_frontier_written = False
        self._follow_up_new_frontier_at = None
        self._follow_up_resolved_focuses = set()
        self.conn.row_factory = sqlite3.Row
        # ON DELETE CASCADE (prompt_responses -> carb_entries, #125) needs
        # foreign-key enforcement, which SQLite leaves off per-connection by
        # default; set it before any transaction opens.
        self.conn.execute("PRAGMA foreign_keys = ON")
        if readonly:
            # No schema creation or migration on a read-only connection: the
            # caller takes the file's schema as-is (see :meth:`open_readonly`).
            return
        self.conn.executescript(_SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        """Add post-release columns to a database created by an earlier schema."""
        additions = [(table, column, coltype) for table, column, coltype in _ADDED_COLUMNS
                     if column not in {r["name"] for r in
                                       self.conn.execute(f"PRAGMA table_info({table})")}]
        stale = self._stale_seq_num_tables()
        if additions or stale:
            statements = ["BEGIN"]
            statements.extend(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"
                              for table, column, coltype in additions)
            statements.extend(f"DROP TABLE {table}" for table in stale)
            if stale:
                statements.append(_SCHEMA)
            # The Pattern Focus compatibility key and its identity migration run
            # before a serving cache exists; unlike analyzer-input migrations it
            # must not create a synthetic analysis generation.
            if stale or any((table, column) != ("focus", "pattern_key")
                            for table, column, _type in additions):
                statements.append("UPDATE input_data_revision SET revision = revision + 1 WHERE id = 1")
            statements.append("COMMIT")
            self.conn.executescript(";\n".join(statements) + ";")
        from .analyzers.scenario.outcome_patterns import _ROSTER
        from hashlib import sha256
        owner = {lever: key for key, _title, levers, _rates, _setting, _family in _ROSTER
                 for lever in levers}
        pattern_rows = [row for row in self.conn.execute("SELECT subject, decided_at, reason, comparison_version, state_json FROM guidance_preferences WHERE subject LIKE 'habit:%'").fetchall()
                        if row["subject"].split(":", 1)[1] in owner]
        focus_rows = [row for row in self.conn.execute("SELECT id, lever FROM focus WHERE status = 'active' AND pattern_key IS NULL").fetchall()
                      if row["lever"] in owner]
        if not pattern_rows and not focus_rows:
            return
        grouped = {}
        for row in pattern_rows:
            key = owner.get(row["subject"].split(":", 1)[1])
            if key:
                grouped.setdefault(key, []).append(row)
        with self.conn:
            for key, rows in grouped.items():
                winner = min(rows, key=lambda row: row["decided_at"])
                _key, _title, levers, _rates, setting, _family = next(item for item in _ROSTER if item[0] == key)
                members = [f"habit:{lever}" for lever in levers] + ([f"setting:{setting}"] if setting else [])
                old = json.loads(winner["state_json"])
                state = {"kind": "pattern", "action": old.get("action"), "seriousness": old.get("seriousness"),
                         "member_set_fingerprint": sha256(",".join(sorted(members)).encode()).hexdigest()[:16]}
                self.conn.execute("INSERT INTO guidance_preferences (subject, decided_at, reason, comparison_version, state_json) VALUES (?, ?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET decided_at=excluded.decided_at, reason=excluded.reason, comparison_version=excluded.comparison_version, state_json=excluded.state_json",
                                  (f"pattern:{key}", winner["decided_at"], winner["reason"], winner["comparison_version"], json.dumps(state, sort_keys=True)))
                self.conn.executemany("DELETE FROM guidance_preferences WHERE subject=?", [(row["subject"],) for row in rows])
            for row in focus_rows:
                key = owner.get(row["lever"])
                if key:
                    self.conn.execute("UPDATE focus SET pattern_key=? WHERE id=?", (key, row["id"]))
                    record = self.follow_up_record("focus", row["id"])
                    if record is not None and record.get("pattern_key") != key:
                        self.conn.execute(
                            "UPDATE follow_up_records SET record_json=? WHERE kind='focus' AND id=?",
                            (json.dumps({**record, "pattern_key": key}, sort_keys=True), str(row["id"])),
                        )

    # The pump-feed tables re-keyed on the pump's stable ``seq_num`` — basal by
    # #194, the rest by #198. Each is a re-fetchable cache keyed on its own event
    # identity; see :meth:`_rekey_seq_num_tables`.
    _SEQ_NUM_TABLES = ("basal_events", "bolus_events", "iob_events", "pump_events")

    def _stale_seq_num_tables(self) -> list[str]:
        return [t for t in self._SEQ_NUM_TABLES
                if "seq_num" not in {r["name"] for r in
                                     self.conn.execute(f"PRAGMA table_info({t})")}]

    @classmethod
    def open(cls, path: str) -> "Store":
        # `ciq-autotune serve` runs the API and the hourly fetch loop in one
        # process, each opening its own connection to this file: many API reads
        # plus one background writer doing large multi-window upserts (#241). In
        # SQLite's default rollback-journal mode a writer's lock blocks readers
        # and vice-versa, so a read overlapping a window commit (or a manual
        # "Fetch now" overlapping the hourly loop) surfaced as
        # `database is locked` and killed the fetch mid-run. WAL lets the readers
        # and the single writer proceed without blocking each other; the 30s
        # busy_timeout makes the rarer writer-vs-writer overlap wait it out
        # instead of erroring. WAL is a no-op on `:memory:`; it writes -wal/-shm
        # sidecars next to a file DB, so the DB directory must be writable.
        conn = sqlite3.connect(path, timeout=30.0)
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA busy_timeout = 30000")
        return cls(conn)

    @classmethod
    def open_readonly(cls, path: str) -> "Store":
        """Open a snapshot for reading without touching the file at all.

        :meth:`open` writes -wal/-shm sidecars and runs schema/migration DDL, so
        pointing it at a snapshot from an external read-only pull tool mutates the
        very file the grounding workflow promises to leave untouched. This opens
        the file via SQLite's read-only+immutable URI mode instead: no sidecars,
        no schema writes, and any write attempt raises ``sqlite3.OperationalError``.
        ``immutable=1`` asserts nothing else is writing the file — true for a
        pulled snapshot; never point this at the live DB a ``serve`` is writing.
        A snapshot older than the current schema surfaces as a missing table or
        column on read — re-pull the snapshot rather than migrating it.
        """
        conn = sqlite3.connect(f"file:{path}?mode=ro&immutable=1", uri=True)
        return cls(conn, readonly=True)

    @classmethod
    def open_queryonly(cls, path: str) -> "Store":
        """Open the live database for a read transaction without schema writes.

        Unlike :meth:`open_readonly`, this connection does not claim the file is
        immutable: it observes the live WAL while ``serve``'s fetch loop may write.
        URI read-only mode and ``query_only`` prevent DDL or data mutation, while
        the transaction chosen by the caller fixes one coherent SQLite snapshot.
        """
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30.0)
        conn.execute("PRAGMA busy_timeout = 30000")
        conn.execute("PRAGMA query_only = ON")
        return cls(conn, readonly=True)

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    @contextmanager
    def _write_transaction(self):
        """Legacy writers retain their commit boundary, or join follow-up."""
        if self._follow_up_start_changes is None:
            with self.conn:
                yield
        else:
            try:
                yield
            except BaseException:
                self._follow_up_failed = True
                raise

    @contextmanager
    def follow_up_transaction(self, *, expected_revision=None):
        """Reserve one writer; joined writes publish one revision or nothing.

        Inside the scope input_data_revision includes its pending advance, so a
        reconciliation receipt can name the state that will actually be committed.
        A caught failure in a joined scope still aborts the outer transaction.
        """
        if self._readonly:
            raise sqlite3.OperationalError("attempt to write a readonly database")
        if self._follow_up_start_changes is not None:
            with self._write_transaction():
                revision = self.input_data_revision()
                if expected_revision is not None and expected_revision != revision:
                    raise FollowUpConflict("stale_input_revision", revision)
                yield self
            return
        self.conn.execute("BEGIN IMMEDIATE")
        self._follow_up_start_changes = self.conn.total_changes
        self._follow_up_failed = False
        self._follow_up_frontier_written = False
        self._follow_up_new_frontier_at = None
        self._follow_up_resolved_focuses = set()
        try:
            revision = self.input_data_revision()
            if expected_revision is not None and expected_revision != revision:
                raise FollowUpConflict("stale_input_revision", revision)
            yield self
            if self._follow_up_failed:
                raise FollowUpConflict("transaction_aborted", self.input_data_revision())
            if self.conn.total_changes != self._follow_up_start_changes:
                if self._follow_up_frontier_written:
                    self.conn.execute(
                        "UPDATE follow_up_frontier SET reconciled_input_revision = ? WHERE singleton = 1",
                        (revision + 1,))
                self.conn.execute(
                    "UPDATE input_data_revision SET revision = revision + 1 WHERE id = 1")
            self.conn.commit()
        except BaseException:
            self.conn.rollback()
            raise
        finally:
            self._follow_up_start_changes = None
            self._follow_up_frontier_written = False
            self._follow_up_failed = False
            self._follow_up_resolved_focuses.clear()

    # --- writers (idempotent upserts) --------------------------------------

    def _upsert(self, table: str, cols: list, conflict: list, rows: Iterable[tuple]) -> int:
        rows = list(rows)
        if not rows:
            return 0
        placeholders = ", ".join("?" * len(cols))
        updates = ", ".join(
            f"{c}=excluded.{c}" for c in cols if c not in conflict
        )
        sql = (
            f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({placeholders}) "
            f"ON CONFLICT ({', '.join(conflict)}) DO UPDATE SET {updates}"
        )
        with self._write_transaction():
            self.conn.executemany(sql, rows)
            self._advance_revision()
        return len(rows)

    def _advance_revision(self) -> None:
        """Advance the durable derivation key inside the caller's transaction."""
        if self._follow_up_start_changes is None:
            self.conn.execute(
                "UPDATE input_data_revision SET revision = revision + 1 WHERE id = 1")

    def input_data_revision(self) -> int:
        """Store generation, including a pending follow-up transaction advance."""
        row = self.conn.execute(
            "SELECT revision FROM input_data_revision WHERE id = 1").fetchone()
        pending = (self._follow_up_start_changes is not None
                   and self.conn.total_changes != self._follow_up_start_changes)
        return int(row["revision"]) + int(pending)

    def upsert_basal(self, raw: Iterable[dict]) -> int:
        cols = ["seq_num", "t", "delivery_type", "duration_mins", "basal_rate",
                "profile_basal_rate"]

        def build(r):
            return (
                _seq_key(r, "basal"),
                normalize_time(r["time"]),
                r["delivery_type"],
                _f(r.get("duration_mins")),
                _f(r.get("basal_rate")),
                _f(r.get("profile_basal_rate")),
            )

        return self._upsert("basal_events", cols, ["seq_num"], (build(r) for r in raw))

    def upsert_settings_snapshot(self, captured_at: str, settings: PumpSettings) -> int:
        """Append one ``profile_settings`` row per profile for this fetch.

        ``captured_at`` is a wall-clock string (normalized like every other time).
        Idempotent on (captured_at, idp), so re-running a fetch in the same second
        merges rather than duplicates; distinct fetches append a new generation.
        """
        cap = normalize_time(captured_at)
        cols = ["captured_at", "idp", "active_idp", "name", "dia_min",
                "carb_entry", "max_bolus", "segments_json", "control_iq_json"]
        # Pump-wide sleep schedules; denormalized onto every profile row for this
        # capture so any single row reconstructs them.
        control_iq_json = json.dumps(
            [[s.start_min, s.end_min, list(s.active_days)]
             for s in settings.sleep_schedules])
        rows = [
            (
                cap, p.idp, settings.active_idp, p.name, p.dia_min,
                1 if p.carb_entry else 0, p.max_bolus,
                json.dumps([[s.start_min, s.basal_rate, s.isf, s.carb_ratio, s.target_bg]
                            for s in p.segments]),
                control_iq_json,
            )
            for p in settings.profiles
        ]
        return self._upsert("profile_settings", cols,
                            ["captured_at", "idp"], rows)

    def upsert_bolus(self, raw: Iterable[dict]) -> int:
        cols = [
            "seq_num", "t", "description", "completion", "insulin", "requested_insulin",
            "carbs", "bg", "user_override", "extended", "completion_t",
            "bolus_options", "correction_insulin", "food_insulin",
            "pump_iob", "selected_iob", "standard_percent", "extended_duration",
            "declined_correction", "isf", "target_bg", "carb_ratio",
        ]

        def build(r):
            extended = 1 if r.get("extended_bolus") == "1" else 0
            t = r.get("request_time") if not extended else r.get("bolex_start_time")
            return (
                _seq_key(r, "bolus"),
                normalize_time(t),
                r["description"],
                r.get("completion"),
                _f(r.get("insulin")),
                _f(r.get("requested_insulin")),
                _f(r.get("carbs")),
                _f(r.get("bg")),
                _i(r.get("user_override")),
                extended,
                normalize_time(r.get("completion_time")),
                _i(r.get("bolus_options")),
                _f(r.get("correction_insulin")),
                _f(r.get("food_insulin")),
                _f(r.get("pump_iob")),
                _i(r.get("selected_iob")),
                _i(r.get("standard_percent")),
                _i(r.get("extended_duration")),
                _i(r.get("declined_correction")),
                _f(r.get("isf")),
                _f(r.get("target_bg")),
                _f(r.get("carb_ratio")),
            )

        return self._upsert("bolus_events", cols, ["seq_num"], (build(r) for r in raw))

    def upsert_cgm(self, raw: Iterable[dict]) -> int:
        # Note: SerialNumber / DeviceType are intentionally discarded here.
        cols = ["t", "bg", "type"]
        rows = (
            (
                normalize_time(r["EventDateTime"]),
                _f(r.get("Readings (CGM / BGM)")),
                r.get("Description"),
            )
            for r in raw
        )
        return self._upsert("cgm_readings", cols, ["t"], rows)

    def upsert_iob(self, raw: Iterable[dict]) -> int:
        cols = ["seq_num", "t", "iob", "event_id"]
        rows = (
            (_seq_key(r, "iob"), normalize_time(r["time"]), _f(r.get("iob")),
             r.get("event_id"))
            for r in raw
        )
        return self._upsert("iob_events", cols, ["seq_num"], rows)

    def upsert_pump(self, raw: Iterable[dict]) -> int:
        cols = ["seq_num", "t", "event_type", "duration_mins"]
        rows = (
            (_seq_key(r, "pump"), normalize_time(r["time"]), r["event_type"],
             _f(r.get("duration_mins")))
            for r in raw
        )
        return self._upsert("pump_events", cols, ["seq_num"], rows)

    # --- readers ------------------------------------------------------------

    def _select(self, table: str, start: Optional[str], end: Optional[str]):
        """Rows for ``table`` in ``[start, end)``, chronological. Internal — the
        public readers wrap each row in its typed :mod:`~ciq_autotune.events` form."""
        sql = f"SELECT * FROM {table}"
        clauses, params = [], []
        if start:
            clauses.append("t >= ?")
            params.append(start)
        if end:
            clauses.append("t < ?")
            params.append(end)
        if clauses:
            sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY t"
        if table == "bolus_events":
            sql += ", seq_num"
        return self.conn.execute(sql, params).fetchall()

    def basal_events(self, start=None, end=None) -> List[BasalEvent]:
        return [
            BasalEvent(parse_t(r["t"]), r["delivery_type"],
                       r["duration_mins"], r["basal_rate"], r["profile_basal_rate"])
            for r in self._select("basal_events", start, end)
        ]

    def latest_cgm_or_basal_timestamp(self) -> Optional[datetime]:
        """The latest timestamp in the two streams that define a data horizon.

        The scalar query avoids materializing either event stream when callers
        need only the latest observed instant.
        """
        row = self.conn.execute(
            "SELECT MAX(t) AS latest FROM ("
            "SELECT MAX(t) AS t FROM cgm_readings "
            "UNION ALL "
            "SELECT MAX(t) AS t FROM basal_events"
            ")"
        ).fetchone()
        return parse_t(row["latest"]) if row["latest"] is not None else None

    def settings_snapshots(self) -> List[Snapshot]:
        """Every settings snapshot, oldest first, grouped back into typed
        :class:`~ciq_autotune.settings.Snapshot` objects (one per fetch)."""
        rows = self.conn.execute(
            "SELECT * FROM profile_settings ORDER BY captured_at, idp").fetchall()
        by_capture: "dict[str, list]" = {}
        active_by_capture: "dict[str, int]" = {}
        for r in rows:
            by_capture.setdefault(r["captured_at"], []).append(r)
            active_by_capture[r["captured_at"]] = r["active_idp"]
        snaps: List[Snapshot] = []
        for cap, group in by_capture.items():
            profiles = tuple(
                ProfileSettings(
                    idp=r["idp"], name=r["name"], dia_min=r["dia_min"],
                    carb_entry=bool(r["carb_entry"]), max_bolus=r["max_bolus"],
                    segments=tuple(
                        ProfileSegment(start_min=int(s[0]), basal_rate=s[1],
                                       isf=int(s[2]), carb_ratio=s[3], target_bg=int(s[4]))
                        for s in json.loads(r["segments_json"])
                    ),
                )
                for r in group
            )
            # Pump-wide sleep schedules are the same on every row; read the first.
            raw_ciq = group[0]["control_iq_json"] if "control_iq_json" in group[0].keys() else None
            sleep = tuple(
                SleepSchedule(start_min=int(s[0]), end_min=int(s[1]),
                              active_days=tuple(s[2]))
                for s in json.loads(raw_ciq or "[]")
            )
            snaps.append(Snapshot(
                captured_at=parse_t(cap),
                settings=PumpSettings(active_idp=active_by_capture[cap],
                                      profiles=profiles, sleep_schedules=sleep),
            ))
        return snaps

    def bolus_events(self, start=None, end=None) -> List[BolusEvent]:
        return [
            BolusEvent(parse_t(r["t"]), r["description"], r["completion"],
                       r["insulin"], r["requested_insulin"], r["carbs"], r["bg"],
                       r["user_override"], r["extended"], r["completion_t"],
                       r["bolus_options"], r["correction_insulin"],
                       r["food_insulin"], r["pump_iob"], r["selected_iob"],
                       r["standard_percent"], r["extended_duration"],
                       declined_correction=r["declined_correction"],
                       isf=r["isf"], target_bg=r["target_bg"],
                       carb_ratio=r["carb_ratio"], seq_num=r["seq_num"])
            for r in self._select("bolus_events", start, end)
        ]

    def cgm_readings(self, start=None, end=None) -> List[CgmReading]:
        return [
            CgmReading(parse_t(r["t"]), r["bg"], r["type"])
            for r in self._select("cgm_readings", start, end)
        ]

    def cgm_day_bounds(self) -> tuple:
        """Return (earliest_day, latest_day) as YYYY-MM-DD pump-local strings.

        Both are None when the table is empty. The day is taken directly from
        the naive pump-local wall-clock string in cgm_readings.t — no tz
        conversion, matching the day the vendor UI buckets a reading into.
        """
        row = self.conn.execute(
            "SELECT date(MIN(t)) AS earliest, date(MAX(t)) AS latest FROM cgm_readings"
        ).fetchone()
        return (row["earliest"], row["latest"])

    def iob_events(self, start=None, end=None) -> List[IobEvent]:
        """Every IOB row, all EventIDs. Use iob_series for analysis."""
        return [
            IobEvent(parse_t(r["t"]), r["iob"], r["event_id"])
            for r in self._select("iob_events", start, end)
        ]

    def iob_series(self, start=None, end=None) -> List[IobEvent]:
        """The continuous total-IOB time-series only (EventID 81)."""
        return [r for r in self.iob_events(start, end)
                if r.event_id == CONTINUOUS_IOB_EVENT_ID]

    def pump_events(self, start=None, end=None) -> List[PumpEvent]:
        return [
            PumpEvent(parse_t(r["t"]), r["event_type"], r["duration_mins"])
            for r in self._select("pump_events", start, end)
        ]

    # --- carb log (#125) ----------------------------------------------------
    # Unlike the sync feeds above (idempotent upserts on a natural key), carb
    # entries are user-authored CRUD keyed on a surrogate id. The prompt-response
    # rows are the label flywheel; a "carbs" answer creates an entry + its response
    # atomically (record_carb_entry_with_response), and deleting the entry cascades
    # the response away so the sourcing prompt resurrects.

    def upsert_carb_entry(self, entry: CarbEntry, *, id: Optional[int] = None) -> int:
        """Insert a carb entry (``id=None``) or update an existing one; returns its id.

        ``created_at`` is stamped once at insert (from the entry, else now) and is
        never moved by an update — editing ``t``/``grams``/``note`` leaves it intact.
        """
        t = format_t(entry.t)
        created = format_t(entry.created_at or datetime.now())
        with self._write_transaction():
            if id is None:
                cur = self.conn.execute(
                    "INSERT INTO carb_entries (t, grams, certainty, source, note, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (t, entry.grams, entry.certainty, entry.source, entry.note, created),
                )
                self._advance_revision()
                return int(cur.lastrowid)
            self.conn.execute(
                "INSERT INTO carb_entries (id, t, grams, certainty, source, note, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET t=excluded.t, grams=excluded.grams, "
                "certainty=excluded.certainty, source=excluded.source, note=excluded.note",
                (id, t, entry.grams, entry.certainty, entry.source, entry.note, created),
            )
            self._advance_revision()
            return id

    def carb_entries(self, start=None, end=None) -> List[CarbEntry]:
        """Carb entries in ``[start, end)``, chronological — the exclusion stream
        threaded into :func:`~ciq_autotune.analyze.analyze`."""
        return [
            CarbEntry(parse_t(r["t"]), r["grams"], r["certainty"], r["source"],
                      r["note"], parse_t(r["created_at"]))
            for r in self._select("carb_entries", start, end)
        ]

    def list_carb_entries(self, start=None, end=None) -> List[dict]:
        """Carb entries in ``[start, end)`` as id-bearing dicts — the shape the
        HTTP CRUD layer (#126) serializes and the frontend edits/deletes by id.

        The typed :meth:`carb_entries` reader deliberately drops the surrogate id
        (the analyzers key on ``t``, not id); the API needs it, so this returns the
        raw ``{id, t, grams, certainty, source, note, created_at}`` row instead."""
        return [
            {k: r[k] for k in r.keys()}
            for r in self._select("carb_entries", start, end)
        ]

    def get_carb_entry(self, id: int) -> Optional[dict]:
        """One carb entry as an id-bearing dict, or ``None`` — the read a PATCH
        merges partial edits onto (#126)."""
        r = self.conn.execute(
            "SELECT * FROM carb_entries WHERE id = ?", (id,)).fetchone()
        return {k: r[k] for k in r.keys()} if r is not None else None

    def delete_carb_entry(self, id: int) -> int:
        """Delete a carb entry by id; its ``prompt_responses`` row cascades away so
        the sourcing prompt resurrects. Returns the number of entries deleted (0/1)."""
        with self._write_transaction():
            cur = self.conn.execute("DELETE FROM carb_entries WHERE id = ?", (id,))
            if cur.rowcount:
                self._advance_revision()
        return cur.rowcount

    def record_prompt_response(self, *, detector: str, anchor_t: datetime, answer: str,
                               carb_entry_id: Optional[int] = None,
                               answered_at: Optional[datetime] = None) -> int:
        """Store a user's answer to a recomputed (detector, anchor_t) prompt; returns
        its id. ``carb_entry_id`` is set only when ``answer == 'carbs'``."""
        with self._write_transaction():
            cur = self.conn.execute(
                "INSERT INTO prompt_responses "
                "(detector, anchor_t, answer, carb_entry_id, answered_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (detector, format_t(anchor_t), answer, carb_entry_id,
                 format_t(answered_at or datetime.now())),
            )
            self._advance_revision()
        return int(cur.lastrowid)

    def prompt_responses(self) -> List[dict]:
        """Every prompt response, ordered by the anchor it answers then id."""
        rows = self.conn.execute(
            "SELECT * FROM prompt_responses ORDER BY anchor_t, id").fetchall()
        return [{k: r[k] for k in r.keys()} for r in rows]

    def record_carb_entry_with_response(
        self, entry: CarbEntry, *, detector: str, anchor_t: datetime,
        answer: str = "carbs", answered_at: Optional[datetime] = None,
    ) -> tuple:
        """Create a carb entry and its prompt response in ONE transaction (the
        atomicity slice 4 / #128 enforces at the API). Returns
        ``(carb_entry_id, prompt_response_id)``; the response references the entry."""
        created = format_t(entry.created_at or datetime.now())
        answered = format_t(answered_at or datetime.now())
        with self._write_transaction():
            cur = self.conn.execute(
                "INSERT INTO carb_entries (t, grams, certainty, source, note, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (format_t(entry.t), entry.grams, entry.certainty, entry.source,
                 entry.note, created),
            )
            carb_id = int(cur.lastrowid)
            resp = self.conn.execute(
                "INSERT INTO prompt_responses "
                "(detector, anchor_t, answer, carb_entry_id, answered_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (detector, format_t(anchor_t), answer, carb_id, answered),
            )
            self._advance_revision()
        return carb_id, int(resp.lastrowid)

    def clear_prompt_response(self, *, detector: str, anchor_t: datetime,
                              tolerance_min: float = 10.0) -> int:
        """Delete the answer(s) to a ``(detector, anchor_t)`` prompt so it resurrects.

        The inverse of :meth:`record_prompt_response` /
        :meth:`record_carb_entry_with_response` — the "delete-resurrects" half of the
        #128 revise/clear-answer flow. A ``carbs`` answer is cleared by deleting its
        carb entry (its response row cascades away, the #125 invariant); a ``no`` /
        ``not-sure`` answer, which has no entry, is deleted directly. Matches within
        ``tolerance_min`` of ``anchor_t`` (mirrors the queue's anchor tolerance: the
        caller sends the live-recomputed anchor, which can drift from the stored one).
        Returns the number of answers cleared.
        """
        lo = format_t(anchor_t - timedelta(minutes=tolerance_min))
        hi = format_t(anchor_t + timedelta(minutes=tolerance_min))
        with self._write_transaction():
            rows = self.conn.execute(
                "SELECT id, carb_entry_id FROM prompt_responses "
                "WHERE detector = ? AND anchor_t BETWEEN ? AND ?",
                (detector, lo, hi),
            ).fetchall()
            for r in rows:
                if r["carb_entry_id"] is not None:
                    # cascade removes the response row (ON DELETE CASCADE)
                    self.conn.execute(
                        "DELETE FROM carb_entries WHERE id = ?", (r["carb_entry_id"],))
                else:
                    self.conn.execute(
                        "DELETE FROM prompt_responses WHERE id = ?", (r["id"],))
            if rows:
                self._advance_revision()
        return len(rows)

    def set_credentials(self, *, email: str, password_encrypted: bytes,
                        region: str, updated_at: str) -> None:
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO credentials (id, email, password_encrypted, region, updated_at) "
                "VALUES (1, ?, ?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET email=excluded.email, "
                "password_encrypted=excluded.password_encrypted, region=excluded.region, "
                "updated_at=excluded.updated_at",
                (email, password_encrypted, region, updated_at),
            )
            self._advance_revision()

    def get_credentials(self) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT * FROM credentials WHERE id = 1").fetchone()

    def record_fetch_result(self, *, attempted_at: str, ok: bool,
                            error: Optional[str] = None,
                            written: Optional[dict] = None) -> None:
        """Record one fetch attempt. ``last_success_at``/``last_written_json``
        only advance on success — a failed attempt updates ``last_attempt_at``
        and ``last_error`` but leaves the last-known-good state in place."""
        written_json = json.dumps(written) if written is not None else None
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO fetch_status "
                "(id, last_attempt_at, last_success_at, last_error, last_written_json) "
                "VALUES (1, ?, ?, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET "
                "last_attempt_at=excluded.last_attempt_at, "
                "last_success_at=CASE WHEN ? THEN excluded.last_success_at "
                "                 ELSE fetch_status.last_success_at END, "
                "last_error=excluded.last_error, "
                "last_written_json=CASE WHEN ? THEN excluded.last_written_json "
                "                   ELSE fetch_status.last_written_json END",
                (attempted_at, attempted_at if ok else None, None if ok else error,
                 written_json, ok, ok),
            )
            self._advance_revision()

    def fetch_status(self) -> Optional[dict]:
        row = self.conn.execute("SELECT * FROM fetch_status WHERE id = 1").fetchone()
        if row is None:
            return None
        return {
            "last_attempt_at": row["last_attempt_at"],
            "last_success_at": row["last_success_at"],
            "last_error": row["last_error"],
            "last_written": json.loads(row["last_written_json"]) if row["last_written_json"] else None,
        }

    def get_plan_draft(self) -> Optional[dict]:
        row = self.conn.execute("SELECT * FROM plan_draft WHERE id = 1").fetchone()
        if row is None:
            return None
        return {"items": json.loads(row["items_json"]), "updated_at": row["updated_at"]}

    def save_plan_draft(self, items: list, updated_at: str) -> None:
        validate_plan_items(items)
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO plan_draft (id, items_json, updated_at) VALUES (1, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET items_json=excluded.items_json, "
                "updated_at=excluded.updated_at",
                (json.dumps(items), updated_at),
            )

    def apply_plan(self, applied_at: str) -> dict:
        """Snapshot the current draft into history and clear it, starting a
        fresh empty draft. Raises ValueError if there's no draft (or it's
        empty) to apply."""
        draft = self.get_plan_draft()
        if not draft or not draft["items"]:
            raise ValueError("no plan draft to apply")
        validate_plan_items(draft["items"])
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO plan_history (applied_at, items_json) VALUES (?, ?)",
                (applied_at, json.dumps(draft["items"])),
            )
            self.conn.execute("DELETE FROM plan_draft WHERE id = 1")
            self._advance_revision()
        return {"applied_at": applied_at, "items": draft["items"]}

    def plan_history(self) -> List[dict]:
        """Every applied plan, newest first."""
        rows = self.conn.execute(
            "SELECT * FROM plan_history ORDER BY applied_at DESC").fetchall()
        return [{"applied_at": r["applied_at"], "items": json.loads(r["items_json"])}
                for r in rows]

    # --- Legacy Focus identity and status (#244, ADR 0029) -------------------

    def pin_focus(self, lever: str, pinned_at: str, pattern_key: Optional[str] = None) -> dict:
        """Pin a behavioral lever as the active Focus and return the stored row.

        Enforces one active Focus at a time via the ``focus_one_active`` partial
        unique index — a second active pin raises ``FocusAlreadyActive``. The
        broader Trial-XOR-Focus invariant (reject a pin while a *Trial* is live) is
        enforced above this by the caller, which has the event data a Trial needs.
        """
        with self._write_transaction():
            try:
                cur = self.conn.execute(
                    "INSERT INTO focus (lever, pattern_key, pinned_at, status) VALUES (?, ?, ?, 'active')",
                    (lever, pattern_key, pinned_at),
                )
            except sqlite3.IntegrityError as exc:
                # sqlite_errorname is unavailable on supported Python 3.9/3.10.
                # Match this index's failure, leaving other SQL errors intact.
                if str(exc) != "UNIQUE constraint failed: focus.status":
                    raise
                raise FocusAlreadyActive("a Focus is already active") from exc
            self._advance_revision()
            return {"id": cur.lastrowid, "lever": lever, "pattern_key": pattern_key,
                    "pinned_at": pinned_at, "status": "active"}

    def active_focus(self) -> Optional[dict]:
        """The single active Focus, or ``None`` if nothing is pinned."""
        row = self.conn.execute(
            "SELECT * FROM focus WHERE status = 'active'").fetchone()
        return self._focus_row(row) if row is not None else None

    def resolve_focus(self, focus_id: int, status: str = "resolved") -> bool:
        """Close a Focus (``resolved`` on unpin, ``dropped`` on Trial preemption).

        Only an ``active`` Focus can be closed; returns True if a row moved. Both
        terminal states are final — a dropped Focus is not paused/resumable
        (ADR 0029): the user re-pins by hand if the intent still holds.
        """
        if status not in ("resolved", "dropped"):
            raise ValueError(f"invalid focus status: {status!r}")
        with self._write_transaction():
            cur = self.conn.execute(
                "UPDATE focus SET status = ? WHERE id = ? AND status = 'active'",
                (status, focus_id),
            )
            if cur.rowcount:
                self._advance_revision()
                if self._follow_up_start_changes is not None:
                    self._follow_up_resolved_focuses.add(focus_id)
        return cur.rowcount > 0

    def list_focuses(self) -> List[dict]:
        """Every Focus ever pinned, newest first (active + closed)."""
        rows = self.conn.execute(
            "SELECT * FROM focus ORDER BY pinned_at DESC, id DESC").fetchall()
        return [self._focus_row(r) for r in rows]

    # --- Guidance set-aside preferences (ADR 383) --------------------------

    def guidance_preferences(self) -> List[dict]:
        rows = self.conn.execute("SELECT * FROM guidance_preferences ORDER BY subject").fetchall()
        return [{"subject": row["subject"], "decided_at": row["decided_at"],
                 "reason": row["reason"], "comparison_version": row["comparison_version"],
                 "state": json.loads(row["state_json"])} for row in rows]

    def save_guidance_preference(self, subject: str, *, decided_at: str,
                                 reason: Optional[str], comparison_version: str,
                                 state: dict, expected_revision: Optional[int] = None) -> None:
        starts_transaction = not self.conn.in_transaction
        with self._write_transaction():
            if starts_transaction:
                # Reserve the one WAL writer before reading the generation.  A
                # deferred transaction would not lock until INSERT and would
                # leave a check-to-write window for another Store connection.
                self.conn.execute("BEGIN IMMEDIATE")
            if (expected_revision is not None
                    and self.input_data_revision() != expected_revision):
                raise ValueError("guidance changed; read it again")
            self.conn.execute(
                "INSERT INTO guidance_preferences (subject, decided_at, reason, comparison_version, state_json) "
                "VALUES (?, ?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET "
                "decided_at=excluded.decided_at, reason=excluded.reason, "
                "comparison_version=excluded.comparison_version, state_json=excluded.state_json",
                (subject, decided_at, reason, comparison_version, json.dumps(state, sort_keys=True)),
            )
            self._advance_revision()

    def restore_guidance_preference(self, subject: str) -> bool:
        with self._write_transaction():
            cur = self.conn.execute("DELETE FROM guidance_preferences WHERE subject=?", (subject,))
            if cur.rowcount:
                self._advance_revision()
        return bool(cur.rowcount)

    @staticmethod
    def _focus_row(row: sqlite3.Row) -> dict:
        return {"id": row["id"], "lever": row["lever"],
                "pattern_key": row["pattern_key"], "pinned_at": row["pinned_at"], "status": row["status"]}

    # --- Durable Plan / Trial / Focus history (ADR 386) -------------------

    @staticmethod
    def _follow_up_identity(kind, id):
        if kind not in ('plan', 'trial', 'focus'):
            raise ValueError('invalid follow-up kind')
        if kind == 'focus':
            if type(id) is not int or id <= 0:
                raise ValueError('invalid Focus id')
        elif not isinstance(id, str) or not id.strip() or len(id) > 512:
            raise ValueError('invalid follow-up id')

    @staticmethod
    def _follow_up_time(value):
        if not isinstance(value, str):
            raise ValueError('follow-up time must be a pump-local timestamp')
        try:
            parsed = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        except ValueError:
            raise ValueError('follow-up time must be a pump-local timestamp') from None
        if parsed.strftime('%Y-%m-%d %H:%M:%S') != value:
            raise ValueError('follow-up time must be a pump-local timestamp')

    @staticmethod
    def _follow_up_json(value):
        # The owner supplies summaries, never raw evidence or refresh snapshots.
        # Bound each durable record/result without imposing clinical row policy.
        encoded = json.dumps(value, sort_keys=True, allow_nan=False)
        if len(encoded.encode('utf-8')) > 262144:
            raise ValueError('follow-up record exceeds 256 KiB')
        return encoded

    @staticmethod
    def _follow_up_unavailable(reason='not_recorded'):
        return {'version': '386:1', 'state': 'unavailable', 'reason': reason}

    @staticmethod
    def _follow_up_availability(envelope):
        if (not isinstance(envelope, dict) or envelope.get('version') != '386:1'
                or envelope.get('state') not in ('available', 'unavailable')):
            raise ValueError('invalid follow-up availability envelope')
        if envelope['state'] == 'unavailable' and not envelope.get('reason'):
            raise ValueError('unavailable follow-up field requires a reason')

    @classmethod
    def _validate_follow_up_context(cls, field, context):
        """Check retained structure only; source owners supply and judge the facts."""
        cls._follow_up_availability(context)
        if context['state'] == 'unavailable':
            return
        cls._follow_up_time(context.get('captured_at'))
        if type(context.get('input_revision')) is not int:
            raise ValueError('available context requires its input revision')
        if field == 'comparison_context':
            # The comparison producer retains executable inputs, not guidance.
            isf = context.get('programmed_isf')
            if (not isinstance(isf, dict) or type(isf.get('value')) not in (int, float)
                    or not isinstance(isf.get('unit'), str) or not isf['unit']
                    or not context.get('source_snapshot') or not context.get('code_version')
                    or not context.get('configuration')):
                raise ValueError('available comparison context requires ISF, units, snapshot and code/config identity')
            return
        required = {'action', 'explanation', 'source_window', 'policy', 'subjects',
                    'occurrences', 'settings', 'support', 'unknowns'}
        if (not required <= context.keys() or not context['explanation'] or not context['policy']
                or not isinstance(context['source_window'], dict)
                or not all(isinstance(context[key], list)
                           for key in ('subjects', 'occurrences', 'settings', 'unknowns'))
                or not isinstance(context['support'], (dict, list))):
            raise ValueError('available context is missing retained decision or observation facts')
        for boundary in ('start', 'end'):
            cls._follow_up_time(context['source_window'].get(boundary))
        for setting in context['settings']:
            if (not isinstance(setting, dict) or 'value' not in setting
                    or not isinstance(setting.get('unit'), str) or not setting['unit']):
                raise ValueError('retained setting requires a value and units')

    @classmethod
    def _validate_follow_up_assessment(cls, assessment):
        cls._follow_up_availability(assessment)
        if assessment['state'] == 'unavailable':
            return
        required = {'periods', 'comparison_context', 'outcomes', 'assessment', 'limitations',
                    'data_cutoff', 'input_revision'}
        if (not required <= assessment.keys() or not isinstance(assessment['periods'], dict)
                or not isinstance(assessment['limitations'], list)
                or not isinstance(assessment['assessment'], (str, dict))
                or not assessment['assessment'] or type(assessment['input_revision']) is not int):
            raise ValueError('available ending assessment requires periods, context, rows and limits')
        cls._follow_up_time(assessment['data_cutoff'])
        cls._validate_follow_up_context('comparison_context', assessment['comparison_context'])
        for arm in ('before', 'after'):
            period = assessment['periods'].get(arm)
            if not isinstance(period, dict):
                raise ValueError('ending assessment requires both selected periods')
            if period.get('state') == 'unavailable':
                cls._follow_up_availability(period)
                continue
            for boundary in ('start', 'end'):
                cls._follow_up_time(period.get(boundary))
            if not period.get('boundary_reasons'):
                raise ValueError('selected period requires its boundary reasons')
        for name in ('outcomes', 'adherence'):
            rows = assessment.get(name, [])
            if not isinstance(rows, (dict, list)):
                raise ValueError('ending assessment rows must be keyed objects or a list')
            for row in rows.values() if isinstance(rows, dict) else rows:
                if not isinstance(row, dict):
                    raise ValueError('invalid ending assessment row')
                availability = row.get('availability')
                if availability is not None:
                    # #340 producer row availability is not a versioned context.
                    if (not isinstance(availability, dict)
                            or availability.get('state') not in ('available', 'unavailable')
                            or (availability['state'] == 'unavailable' and not availability.get('reason'))):
                        raise ValueError('invalid ending assessment row availability')
                    if availability['state'] == 'unavailable':
                        continue
                denominator = row.get('denominator', row.get('denominators'))
                if (not isinstance(row.get('unit'), str) or not row['unit']
                        or not isinstance(denominator, (str, dict)) or not denominator):
                    raise ValueError('displayed assessment row requires units and a named denominator')

    def _follow_up_table_exists(self, table):
        # Old readonly stores must not migrate merely to inspect their history.
        return self.conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,)).fetchone() is not None

    def _require_follow_up_transaction(self):
        if self._readonly:
            raise sqlite3.OperationalError('attempt to write a readonly database')
        if self._follow_up_start_changes is None:
            raise FollowUpConflict('transaction_required', self.input_data_revision())

    def follow_up_record(self, kind, id):
        """Read retained facts, adding explicit unknowns to legacy base rows."""
        self._follow_up_identity(kind, id)
        base = None
        if kind == 'plan':
            row = self.conn.execute(
                'SELECT * FROM plan_history WHERE applied_at = ?', (id,)).fetchone()
            if row is not None:
                base = {'applied_at': row['applied_at'], 'items': json.loads(row['items_json'])}
        elif kind == 'focus':
            row = self.conn.execute('SELECT * FROM focus WHERE id = ?', (id,)).fetchone()
            if row is not None:
                base = self._focus_row(row)
        retained = None
        if self._follow_up_table_exists('follow_up_records'):
            row = self.conn.execute(
                'SELECT record_json FROM follow_up_records WHERE kind = ? AND id = ?',
                (kind, str(id))).fetchone()
            if row is not None:
                retained = json.loads(row['record_json'])
        if base is None and retained is None:
            return None
        fields = _FOLLOW_UP_FIELDS[kind] & _FOLLOW_UP_ENVELOPES
        reason = 'legacy_not_recorded' if retained is None else 'not_recorded'
        record = {field: self._follow_up_unavailable(reason) for field in fields}
        record.update({'kind': kind, 'id': id, 'version': '386:1'})
        if retained is not None:
            record.update(retained)
        if base is not None:
            record.update(base)
        return record

    def follow_up_records(self, kind):
        """Newest first; Trial ties use ascending canonical identity."""
        if kind not in ('plan', 'trial', 'focus'):
            raise ValueError('invalid follow-up kind')
        if kind == 'plan':
            ids = [row['applied_at'] for row in self.plan_history()]
        elif kind == 'focus':
            ids = [row['id'] for row in self.list_focuses()]
        elif self._follow_up_table_exists('follow_up_records'):
            ids = [row['id'] for row in self.conn.execute(
                "SELECT id FROM follow_up_records WHERE kind = 'trial' ORDER BY id")]
        else:
            ids = []
        records = [self.follow_up_record(kind, id) for id in ids]
        if kind == 'trial':
            records.sort(key=lambda record: record['changed_at'], reverse=True)
        return records

    def save_follow_up_record(self, record):
        """Capture once; only absent relationships and terminal receipts may fill.

        Clinical eligibility, schedule matching and the ending verdict belong to
        the lifecycle owner. Store verifies identities and preserves the winner.
        """
        self._require_follow_up_transaction()
        with self._write_transaction():
            if not isinstance(record, dict):
                raise ValueError('follow-up record must be an object')
            kind, id = record.get('kind'), record.get('id')
            self._follow_up_identity(kind, id)
            if record.get('version') != '386:1':
                raise ValueError('invalid follow-up version')
            fields = _FOLLOW_UP_FIELDS[kind]
            if record.keys() - fields - {'kind', 'id', 'version'}:
                raise ValueError('unknown follow-up record field')
            self._follow_up_json(record)
            old = self.follow_up_record(kind, id)
            if kind != 'trial' and old is None:
                raise FollowUpConflict('orphan_base_record', self.input_data_revision())
            base_fields = {'plan': ('applied_at', 'items'),
                           'focus': ('lever', 'pinned_at', 'status'), 'trial': ()}[kind]
            for field in base_fields:
                if field in record and record[field] != old[field]:
                    raise FollowUpConflict('base_record_mismatch', self.input_data_revision())
            row = self.conn.execute(
                'SELECT record_json FROM follow_up_records WHERE kind = ? AND id = ?',
                (kind, str(id))).fetchone()
            if row is None:
                if kind == 'trial':
                    required = {'parameter', 'slot', 'changed_at', 'before', 'after',
                                'first_observed_at', 'observed_context'}
                    if not required <= record.keys() or not isinstance(record['parameter'], str):
                        raise ValueError('missing Trial observation fields')
                    self._follow_up_time(record['changed_at'])
                    self._follow_up_time(record['first_observed_at'])
                winner = dict(record)
            else:
                winner = json.loads(row['record_json'])
                for field in ('reconciliation', 'ending', 'withdrawal'):
                    prior = winner.get(field, {})
                    proposed = record.get(field, {})
                    if not isinstance(proposed, dict):
                        raise ValueError('invalid follow-up availability envelope')
                    # An observed ending with explicitly unknown event timing is
                    # still a first ending. Its availability is not permission
                    # for a later request to replace the retained facts.
                    captured = 'kind' if field == 'ending' else 'withdrawn_at'
                    prior_captured = field != 'reconciliation' and captured in prior
                    proposed_captured = field != 'reconciliation' and captured in proposed
                    if (prior.get('state') != 'available' and not prior_captured
                            and (proposed.get('state') == 'available' or proposed_captured)):
                        winner[field] = proposed
            for field in fields & _FOLLOW_UP_ENVELOPES:
                envelope = winner.setdefault(field, self._follow_up_unavailable())
                if field in ('decision_context', 'observed_context', 'comparison_context'):
                    self._validate_follow_up_context(field, envelope)
                else:
                    self._follow_up_availability(envelope)
            relationship = winner.get('reconciliation', {})
            if relationship.get('state') == 'available':
                plan_id, trial_id = relationship.get('applied_at'), relationship.get('trial_id')
                self._follow_up_identity('plan', plan_id)
                self._follow_up_identity('trial', trial_id)
                if ((kind == 'plan' and plan_id != id) or (kind == 'trial' and trial_id != id)
                        or self.follow_up_record('plan', plan_id) is None
                        or (kind == 'plan' and self.follow_up_record('trial', trial_id) is None)):
                    raise FollowUpConflict('invalid_reconciliation_identity', self.input_data_revision())
            if (kind == 'focus' and old['status'] != 'active'
                    and 'kind' not in old['ending']
                    and id not in self._follow_up_resolved_focuses
                    and 'kind' in winner['ending']):
                raise FollowUpConflict('legacy_ending_unavailable', self.input_data_revision())
            terminal = winner.get('ending', {})
            if terminal.get('state') == 'available' or 'kind' in terminal:
                self._follow_up_time(terminal.get('recorded_at'))
                if terminal['state'] == 'available' or terminal.get('effective_at') is not None:
                    self._follow_up_time(terminal.get('effective_at'))
                ending_kinds = {'trial': ('user_finished', 'reverted', 'superseded', 'expired_unreviewed'),
                                'focus': ('manual', 'trial_preempted', 'lever_unavailable')}
                if terminal.get('kind') not in ending_kinds[kind]:
                    raise ValueError('invalid follow-up ending kind')
                if (terminal['kind'] not in ('user_finished', 'manual')
                        and terminal.get('conclusion') is not None):
                    raise ValueError('automatic ending cannot supply a user conclusion')
                self._validate_follow_up_assessment(terminal.get('assessment'))
            withdrawal = winner.get('withdrawal', {})
            if withdrawal.get('state') == 'available':
                self._follow_up_time(withdrawal.get('withdrawn_at'))
            encoded = self._follow_up_json(winner)
            if row is None:
                self.conn.execute(
                    'INSERT INTO follow_up_records (kind, id, record_json) VALUES (?, ?, ?)',
                    (kind, str(id), encoded))
            elif encoded != row['record_json']:
                self.conn.execute(
                    'UPDATE follow_up_records SET record_json = ? WHERE kind = ? AND id = ?',
                    (encoded, kind, str(id)))
            return self.follow_up_record(kind, id)

    def follow_up_frontier(self):
        if not self._follow_up_table_exists('follow_up_frontier'):
            return None
        row = self.conn.execute(
            'SELECT trial_id, detected_at, reconciled_input_revision FROM follow_up_frontier '
            'WHERE singleton = 1').fetchone()
        return dict(row) if row is not None else None

    def advance_follow_up_frontier(self, trial_id, detected_at, *, reconciled_input_revision):
        """Retain committed admission; only a later instant replaces its Trial.

        The lifecycle owner supplies its selected candidate. During the first
        admission at an instant, calls in this transaction settle ties by id.
        Later refreshes cannot promote a peer of an already committed admission.
        """
        self._require_follow_up_transaction()
        with self._write_transaction():
            revision = self.input_data_revision()
            if type(reconciled_input_revision) is not int or reconciled_input_revision != revision:
                raise FollowUpConflict('stale_input_revision', revision)
            if (trial_id is None) != (detected_at is None):
                raise ValueError('frontier identity and time must both be present or absent')
            if trial_id is not None:
                self._follow_up_identity('trial', trial_id)
                self._follow_up_time(detected_at)
                trial = self.follow_up_record('trial', trial_id)
                if trial is None or trial['changed_at'] != detected_at:
                    raise FollowUpConflict('invalid_frontier_trial', revision)
            previous = self.follow_up_frontier()
            winner = dict(previous) if previous else {
                'trial_id': None, 'detected_at': None, 'reconciled_input_revision': revision}
            if trial_id is not None and (winner['detected_at'] is None
                    or detected_at > winner['detected_at']
                    or (self._follow_up_new_frontier_at == detected_at
                        and detected_at == winner['detected_at'] and trial_id < winner['trial_id'])):
                winner.update(trial_id=trial_id, detected_at=detected_at)
                self._follow_up_new_frontier_at = detected_at
            winner['reconciled_input_revision'] = revision
            if previous != winner:
                # This write itself advances the input state if it is the first
                # durable change in the scope; the final commit fixes the stamp.
                if self.conn.total_changes == self._follow_up_start_changes:
                    winner['reconciled_input_revision'] += 1
                self.conn.execute(
                    'INSERT INTO follow_up_frontier VALUES (1, ?, ?, ?) '
                    'ON CONFLICT(singleton) DO UPDATE SET trial_id=excluded.trial_id, '
                    'detected_at=excluded.detected_at, '
                    'reconciled_input_revision=excluded.reconciled_input_revision',
                    (winner['trial_id'], winner['detected_at'], winner['reconciled_input_revision']))
            self._follow_up_frontier_written = True
            return winner

    def follow_up_request(self, request_id):
        if not isinstance(request_id, str) or not request_id.strip() or len(request_id) > 512:
            raise ValueError('invalid follow-up request id')
        if not self._follow_up_table_exists('follow_up_requests'):
            return None
        row = self.conn.execute(
            'SELECT * FROM follow_up_requests WHERE request_id = ?', (request_id,)).fetchone()
        if row is None:
            return None
        return {'request_id': request_id, 'operation': row['operation'], 'kind': row['kind'],
                'id': int(row['subject_id']) if row['kind'] == 'focus' else row['subject_id'],
                'result': json.loads(row['result_json'])}

    def save_follow_up_request(self, request_id, *, operation, kind, id, result):
        """Save the first successful result; an operation/subject mismatch conflicts."""
        self._require_follow_up_transaction()
        with self._write_transaction():
            self._follow_up_identity(kind, id)
            if not isinstance(operation, str) or not operation.strip() or len(operation) > 128:
                raise ValueError('invalid follow-up operation')
            previous = self.follow_up_request(request_id)
            if previous is not None:
                if (previous['operation'], previous['kind'], previous['id']) != (operation, kind, id):
                    raise FollowUpConflict('request_identity_mismatch', self.input_data_revision())
                return previous['result']
            if self.follow_up_record(kind, id) is None:
                raise FollowUpConflict('unknown_request_subject', self.input_data_revision())
            if not isinstance(result, dict):
                raise ValueError('follow-up result must be an object')
            encoded = self._follow_up_json(result)
            self.conn.execute(
                'INSERT INTO follow_up_requests VALUES (?, ?, ?, ?, ?)',
                (request_id, operation, kind, str(id), encoded))
            return json.loads(encoded)

    # --- pattern-sweep sign-off (#378) --------------------------------------
    # Only the human approve/dismiss decision persists; the sweep's verdicts are
    # recomputed each run. A decision is keyed on (cell_id, era_start) so it is
    # scoped to the regime it was judged in.

    def record_pattern_review(self, *, cell_id: str, era_start: str, decision: str,
                              decided_at: Optional[str] = None) -> None:
        """Approve or dismiss a cleared sweep cell for one era (upsert on re-decide)."""
        if decision not in ("approved", "dismissed"):
            raise ValueError(f"invalid pattern-review decision: {decision!r}")
        when = decided_at or format_t(datetime.now())
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO pattern_reviews (cell_id, era_start, decision, decided_at) "
                "VALUES (?, ?, ?, ?) "
                "ON CONFLICT (cell_id, era_start) DO UPDATE SET "
                "decision=excluded.decision, decided_at=excluded.decided_at",
                (cell_id, era_start, decision, when),
            )
            self._advance_revision()

    def pattern_reviews(self, era_start: Optional[str] = None) -> dict:
        """Human decisions as ``{cell_id: {'decision', 'decided_at', 'era_start'}}``.

        Filtered to ``era_start`` when given (the only decisions that bind the
        current era); unfiltered returns every era's decisions."""
        if era_start is None:
            rows = self.conn.execute("SELECT * FROM pattern_reviews").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM pattern_reviews WHERE era_start = ?", (era_start,)
            ).fetchall()
        return {
            r["cell_id"]: {"decision": r["decision"], "decided_at": r["decided_at"],
                           "era_start": r["era_start"]}
            for r in rows
        }

    # --- Audit dismissal (#586) -------------------------------------------

    def dismiss_audit_item(self, item_id: str, evidence_fingerprint: str,
                           dismissed_at: Optional[str] = None) -> None:
        if not item_id or not evidence_fingerprint:
            raise ValueError("item_id and evidence_fingerprint are required")
        with self._write_transaction():
            self.conn.execute(
                "INSERT INTO audit_dismissals "
                "(item_id, evidence_fingerprint, dismissed_at) VALUES (?, ?, ?) "
                "ON CONFLICT(item_id) DO UPDATE SET "
                "evidence_fingerprint=excluded.evidence_fingerprint, "
                "dismissed_at=excluded.dismissed_at",
                (item_id, evidence_fingerprint, dismissed_at or format_t(datetime.now())),
            )
            self._advance_revision()

    def audit_dismissals(self) -> dict:
        rows = self.conn.execute("SELECT * FROM audit_dismissals").fetchall()
        return {r["item_id"]: {"evidence_fingerprint": r["evidence_fingerprint"],
                                "dismissed_at": r["dismissed_at"]} for r in rows}

    def counts(self) -> dict:
        tables = [
            "basal_events", "bolus_events", "cgm_readings",
            "iob_events", "pump_events", "profile_settings",
        ]
        return {
            t: self.conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
            for t in tables
        }
