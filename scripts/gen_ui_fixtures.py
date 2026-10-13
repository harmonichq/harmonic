#!/usr/bin/env python3
"""Generate the component library's fixtures and its word allowlist (#483).

Two committed outputs, one generator, one ``--check``:

* ``frontend/ui/__fixtures__/ui-fixtures.json`` holds the served answers the
  stories render. Their source is ``scripts/ui_patient.py``: a seeded synthetic
  Control-IQ wearer whose history is ingested into a scratch SQLite store and
  read back through the public HTTP API, in process, with the fetch loop off.
  Nothing is served on a port, nothing is fetched, and no real data is read.
  Two stores are built from the one wearer:

  - ``wearer`` changes the 03:00 basal on the simulator's Trial day, which the
    engine detects as a Trial. The person also logs a few treated lows in the
    manual carb log and answers one prompt, through ``POST /api/carbs`` and
    ``POST /api/prompts/answer``. Every top-level block (status, prompts,
    outcomes, guidance) is read from this store.
  - ``wearer-pinned`` is the same history without the profile change, with a
    Focus pinned through ``POST /api/focus`` (one change is active at a time,
    so the Trial and the Focus cannot share a store).

  Two more stores serve the Overview states the full history cannot:

  - ``wearer-first-days`` is the same wearer's first five days only, as a sync
    early on would hold: too few days for the glucose profile to support.
  - ``wearer-unsynced`` is a store before its first sync, with no readings, so
    every outcome metric is served as null.

  ``overview`` holds the Overview components' answers by store:
  ``/api/explore/time-of-day`` and ``/api/day-navigator`` for the wearer's
  latest month, and ``/api/outcomes`` for each window where the top-level
  ``outcomes`` (the wearer's) does not already hold it.

  ``changes`` holds the Changes components' answers by store (the admission,
  the active or ended Trial, the Focus records with their served titles):
  ``wearer`` with its matured Trial and that Trial's retained comparison;
  ``wearer-ended`` the same store once the person ends that Trial through
  ``POST /api/verify/trials/{id}/finish``; ``wearer-pinned`` with its Focus;
  ``wearer-focus``, a Focus pinned on the Trial day with four weeks synced
  after it, and ``wearer-focus-maturing``, the same cut a day after the pin;
  ``wearer-ended-pinned``, a Focus pinned after that Trial was ended, so the
  ended Trial is the last change beside an active one; ``wearer-first-days``
  with no active change; ``wearer-trial-maturing``,
  the wearer's history cut six days after the Trial day, so the Trial is still
  maturing; and ``wearer-worse``, the second wearer, whose wrong-direction
  Trial matures Worse. The two matured results are checked: the generator
  fails if either stops being served. ``wearer-worse`` also has its Queue
  answers in ``queue``.

  ``day`` holds ``/api/timeline`` and ``/api/carbs`` for four of the wearer's
  days, picked by rule: the latest day with readings, a site change and no
  logged carbs, the latest of the days with the most logged carbs, the first
  day after the history ends, and the latest day with readings. ``day.prompts``
  holds ``/api/prompts`` for the Day screen's Prompts: ``wearer-pending``, read
  before the person answers the one prompt the top-level ``prompts`` shows
  answered, and ``wearer-answered``, read after every other read of the wearer
  once the person answers the rest Yes. With the top-level answer they serve
  two, one and no unanswered lows.

  ``settings`` holds the Settings screens' answers, read from the wearer's
  store after every other read of it: ``/api/credentials`` unset and then set
  with an invented address on a reserved domain (masked before it is written;
  the ``.env`` fallback is blocked, so no real credential is ever read),
  ``/api/status`` after a successful sync and after a later failed one, and
  ``/api/pump-settings`` for the wearer and for the unsynced store (no
  profile). ``snooze`` is a pattern the pinned store's person snoozes through
  ``PUT /api/guidance/preferences``, with the decision time the engine serves.
  ``glossary`` is §1.5's rows, for the Glossary page. For the Queue screen,
  each store's candidates carry their rank, admission and snooze; the pinned
  store's Queue is read again after its snooze (``wearer-pinned-snoozed``);
  ``wearer-first-days-snoozed`` is the first days with everything snoozed (an
  empty Queue); and the unsynced store records its guidance disposition. Each
  Queue store also holds ``cases``: every admitted Pattern's event-aligned case
  file from ``/api/diagnose/finding-case-file``, trimmed to the median traces
  of its matched and comparison cohorts, for the open card's impact line.

  ``status.failed`` adds one invented failed sync attempt, through
  ``Store.record_fetch_result``, so the Settings alert has a served
  ``last_error``. The wall clock every write stamps is pinned to one hour after
  the wearer's last reading, so the output is byte-reproducible.

  ``states`` names, for each story state, the store and the pattern or basal
  block that serves it, chosen by rule from what the engine served. A state
  the stories need that the engine no longer serves fails the generator; a
  state that does not arise naturally is ``null`` and its story is absent.
* ``frontend/ui/__fixtures__/ui-allowlist.json`` is every word a story may
  display. It is built from the glossary (§1.5) and the tab names (§1.1) of
  ``docs/design/recommendations-redesign.md``, plus the engine titles, nouns
  and units in the fixture above, plus the window unit and the "of" of a
  magnitude from §4.2.

    uv run python scripts/gen_ui_fixtures.py          # rewrite in place
    uv run python scripts/gen_ui_fixtures.py --check  # CI-style drift check
"""

from __future__ import annotations

import argparse
import contextlib
import json
import pathlib
import re
import sys
import tempfile
from datetime import datetime, timedelta
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from fastapi.testclient import TestClient  # noqa: E402

import ui_patient  # noqa: E402
from ciq_autotune.api import create_app  # noqa: E402
from ciq_autotune.store import Store  # noqa: E402
from ciq_autotune.watched_change import reconcile_ingested_follow_up  # noqa: E402

DESIGN = ROOT / "docs" / "design" / "recommendations-redesign.md"
OUT_DIR = ROOT / "frontend" / "ui" / "__fixtures__"
FIXTURES = OUT_DIR / "ui-fixtures.json"
ALLOWLIST = OUT_DIR / "ui-allowlist.json"
GENERATED_BY = "scripts/gen_ui_fixtures.py"

WINDOWS = (14, 30, 90)
# The pinned wall clock: one hour after the wearer's last reading.
CLOCK = ui_patient.START + timedelta(days=ui_patient.DAYS, hours=1)
FAILED_ERROR = "synthetic sync failure"
# The person logs the treated lows of the last fortnight by hand, all but the
# most recent few, which stay as prompts: about four entries a week, the rate
# a real wearer's manual carb log runs at.
LOGGING_DAYS = 14
UNLOGGED_LOWS = 2
# §4.2 SegmentedControl: "14 / 30 / 90 d", and QueueRow's magnitude "9 of 71 lows".
UNITS = ("d",)
CONNECTIVES = ("of",)
# EvidenceChart labels its two marks with the served field each one plots:
# analyze.basal[].current and analyze.basal[].estimate (approved 2026-10-12;
# not yet in glossary §1.5).
MARK_FIELDS = ("current", "estimate")
# §4.2 GlucoseProfile's insufficient-data label, quoted there; "data" is not yet
# in glossary §1.5.
STATE_LABELS = ("No data",)
# §1.3 Queue's empty-state label, "0 patterns".
QUEUE_LABELS = ("patterns",)
# §4.2 DayTile: "a weekday and date". The weekday abbreviations are not yet in
# glossary §1.5.
WEEKDAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
# Dates print as "26 Sep" (§1.1 "To 30 Sep", §1.3 "Until <date>"); the month
# abbreviations are plain interface words (§2.5, 2026-10-13).
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
# Plain interface words the Changes and Day components quote from §1.2, §1.3
# and §4.2, exempt from glossary §1.5 by the 2026-10-13 amendment (§2.5):
# ChangeCard's "Before/After values" and "Days 0 / 14", the Prompt's "Next" text
# action, Log carbs' "Time" row (default now) and "Save", the write-failed
# "Not saved" with "Retry", "Cancel" beneath End's confirmation (§1.3a), and
# "Previous" and "Next", the names of the Day navigator's ‹ › (§1.4).
CHANGE_DAY_LABELS = ("Before", "After", "Days", "Next", "Time", "Now", "Save", "Not saved", "Retry", "Cancel",
                     "Previous")
# The wearer's first days: fewer than the glucose profile's eight supported days.
FIRST_DAYS = 5
# A Trial still maturing: the wearer's history cut this many days after the
# Trial day, short of the engine's fourteen.
MATURING_DAYS = 6
# Settings (§1.1, §1.2, §1.3, and the Settings section of the brief): the root
# list's Glossary row, the sync rows,
# the account rows, the pump profile, the screen header's date ("To 30 Sep"),
# the snooze bar ("Snoozed · Until <date>") and the screen-level "Unavailable".
# Plain interface words (§2.5), but for DIA, a pump field the brief names.
SETTINGS_LABELS = ("State", "OK", "Failed", "Last success", "Last attempt", "Error", "Data",
                   "Email", "Region", "Password", "Set", "Not set", "Update", "Start", "Target",
                   "Max bolus", "DIA", "No profile", "Unavailable", "Snoozed", "Until", "To",
                   "Glossary")
# The account the stories show as set: an invented address on a reserved
# domain, posted through the API and masked before it is written anywhere.
SYNTHETIC_EMAIL = "wearer@example.invalid"
MASK = "••••••••"
# A successful sync after the failed one above, then a later failure: the
# Tandem Source screen's OK and Failed states.
SYNC_OK_AT = CLOCK + timedelta(minutes=10)
SYNC_FAILED_AT = CLOCK + timedelta(minutes=20)
# The day navigator's month: the month of the wearer's last day.
NAVIGATOR_MONTH = (ui_patient.START + timedelta(days=ui_patient.DAYS - 1)).strftime("%Y-%m")

WORD = re.compile(r"[A-Za-z][A-Za-z'’-]*")

# Every module that imported the server's wall clock by name.
_CLOCK_MODULES = ("analyze", "api", "cli", "credentials", "fetch_loop", "pattern_sweep",
                  "pending_prompts", "store", "sync", "watched_change")


# The wall clock's current reading: CLOCK, except inside ``clock_at``.
_now = [CLOCK]


def _clock(after=None):
    return max(_now[0], after + timedelta(seconds=1)) if after else _now[0]


@contextlib.contextmanager
def clock_at(moment: datetime):
    """Read the pinned wall clock as ``moment`` for the writes inside: a person
    acting earlier in the wearer's history, before the rest of it synced."""
    _now[0] = moment
    try:
        yield
    finally:
        _now[0] = CLOCK


@contextlib.contextmanager
def pinned_clock():
    with contextlib.ExitStack() as stack:
        for module in _CLOCK_MODULES:
            stack.enter_context(patch(f"ciq_autotune.{module}.wall_clock_now", _clock))
        yield


def _get(client: TestClient, path: str, **params) -> object:
    response = client.get(path, params=params or None)
    response.raise_for_status()
    return response.json()


def _post(client: TestClient, path: str, payload: dict) -> object:
    response = client.post(path, json=payload)
    response.raise_for_status()
    return response.json()


def _serve(database: pathlib.Path) -> TestClient:
    # The credential key lives beside the scratch store, never in tconnect-data/.
    return TestClient(create_app(
        db_path=str(database), token=None, enable_fetch_loop=False,
        analysis_incarnation="ui-fixtures", key_path=f"{database}.key",
    ))


def _wearer(scratch: pathlib.Path, name: str, *, trial: bool, days: int = ui_patient.DAYS, answer: bool = True,
            **change):
    """Ingest the wearer into a scratch store, as a sync would, and serve it.
    ``answer=False`` leaves the one prompt the person answers to the caller."""
    database = scratch / f"{name}.sqlite"
    with Store.open(str(database)) as store:
        history = ui_patient.materialize(store, trial=trial, days=days, **change)
        reconcile_ingested_follow_up(store)
    client = _serve(database)
    # The person's own writes: the fortnight's treated lows logged by hand, bar
    # the latest few, and one remaining prompt answered.
    window_start = ui_patient.START + timedelta(days=ui_patient.DAYS - LOGGING_DAYS)
    logged = [low for low in history.treated_lows if low[0] >= window_start][:-UNLOGGED_LOWS]
    for at, grams in logged:
        _post(client, "/api/carbs", {"t": at.strftime("%Y-%m-%d %H:%M:%S"), "grams": grams,
                                     "certainty": "estimate", "source": "manual"})
    if answer:
        _answer_prompts(client, "no", count=1)
    return database, client


def _answer_prompts(client: TestClient, answer: str, *, count: int | None = None) -> None:
    """The person answers the first ``count`` unanswered prompts (all, unset).
    Yes ("carbs") records carbs of unknown grams at once, as the Prompt's Yes does."""
    pending = [p for p in _get(client, "/api/prompts") if p.get("answer") is None]
    entry = {"entry": {"grams": None, "certainty": "unknown"}} if answer == "carbs" else {}
    for prompt in pending[:count]:
        _post(client, "/api/prompts/answer", {"detector": prompt["detector"],
                                              "anchor_t": prompt["anchor_t"], "answer": answer, **entry})


def fixtures() -> dict:
    """Build both wearer stores and read every endpoint the stories render."""
    with pinned_clock(), tempfile.TemporaryDirectory() as scratch:
        scratch = pathlib.Path(scratch)
        database, client = _wearer(scratch, "wearer", trial=True, answer=False)
        # The Day screen's Prompts before the person answers one, as the top-level
        # `prompts` serves them after it.
        day_prompts = {"wearer-pending": _get(client, "/api/prompts")}
        _answer_prompts(client, "no", count=1)
        status_ok = _get(client, "/api/status")
        outcomes = {str(w): _get(client, "/api/outcomes", window=w) for w in WINDOWS}
        prompts = _get(client, "/api/prompts")
        guidance = _get(client, "/api/guidance")
        queue = {"wearer": _queue_store(client)}
        # The matured Trial, then the same Trial once the person ends it; read
        # before the failed sync below, which leaves the watch to reconcile.
        changes = {"wearer": _changes_store(client)}
        _end_active_trial(client)
        changes["wearer-ended"] = _changes_store(client)
        with Store.open(str(database)) as store:
            store.record_fetch_result(attempted_at=CLOCK.strftime("%Y-%m-%d %H:%M:%S"),
                                      ok=False, error=FAILED_ERROR)
        status_failed = _get(client, "/api/status")

        overview = {"wearer": {
            "time_of_day": _time_of_day(client),
            "day_navigator": _day_navigator(client),
        }}
        day = _days(client, overview["wearer"]["day_navigator"])
        settings = _settings(database, client)
        # After every other read of the wearer: the person answers the rest Yes,
        # and Day's Prompts row is gone.
        _answer_prompts(client, "carbs")
        day_prompts["wearer-answered"] = _get(client, "/api/prompts")
        day["prompts"] = _require_lows({**day_prompts, "wearer": prompts})

        _, pinned = _wearer(scratch, "wearer-pinned", trial=False)
        _pin(pinned)
        queue["wearer-pinned"] = _queue_store(pinned)
        overview["wearer-pinned"] = {"outcomes": _outcomes(pinned)}
        changes["wearer-pinned"] = _changes_store(pinned)
        snooze = _snooze(pinned, pinned_pattern=next(
            f["pattern_key"] for f in changes["wearer-pinned"]["focuses"] if f["status"] == "active"))
        queue["wearer-pinned-snoozed"] = _queue_store(pinned)

        _, first_days = _wearer(scratch, "wearer-first-days", trial=False, days=FIRST_DAYS)
        overview["wearer-first-days"] = {"time_of_day": _time_of_day(first_days)}
        changes["wearer-first-days"] = _changes_store(first_days)
        # Everything the first days admit, snoozed: an empty Queue whose
        # Snoozed list holds them all (§1.3 Queue empty, Queue · Snoozed).
        _snooze_all(first_days)
        queue["wearer-first-days-snoozed"] = _queue_store(first_days)

        # The Changes screen's last change beside an active one: the wearer
        # ends the matured Trial, then pins a Focus (one change is active at a
        # time).
        _, ended_pinned = _wearer(scratch, "wearer-ended-pinned", trial=True)
        _end_active_trial(ended_pinned)
        _pin(ended_pinned)
        changes["wearer-ended-pinned"] = _changes_store(ended_pinned)

        # A Focus pinned on the Trial day, as the person would pin it then,
        # with the rest of the history synced after: matured, and cut a day
        # after the pin, still maturing.
        changes["wearer-focus"] = _changes_store(_focus_wearer(scratch, "wearer-focus"))
        changes["wearer-focus-maturing"] = _changes_store(
            _focus_wearer(scratch, "wearer-focus-maturing", days=ui_patient.TRIAL_DAY + 1))

        _, maturing = _wearer(scratch, "wearer-trial-maturing", trial=True,
                              days=ui_patient.TRIAL_DAY + MATURING_DAYS)
        changes["wearer-trial-maturing"] = _changes_store(maturing)

        _, worse = _wearer(scratch, "wearer-worse", trial=True,
                           profile=ui_patient.trial_profile(ui_patient.WORSE_PROFILE_BASAL),
                           trial_basal=ui_patient.WORSE_TRIAL_BASAL)
        changes["wearer-worse"] = _changes_store(worse)
        queue["wearer-worse"] = _queue_store(worse)
        # Its wrong-direction Trial adds lows: the Overview's served worsening.
        overview["wearer-worse"] = {"outcomes": _outcomes(worse)}
        _require_result(changes["wearer"], "favorable")
        _require_result(changes["wearer-worse"], "concerning")

        unsynced = scratch / "wearer-unsynced.sqlite"
        with Store.open(str(unsynced)):
            pass
        unsynced_client = _serve(unsynced)
        overview["wearer-unsynced"] = {"outcomes": _outcomes(unsynced_client),
                                       "guidance": {"disposition": _get(unsynced_client, "/api/guidance")["disposition"]}}
        settings["pump_settings"]["wearer-unsynced"] = _pump_settings(unsynced_client)
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Synthetic only: a seeded simulated Control-IQ wearer "
                  "(scripts/ui_patient.py) ingested into scratch stores and served "
                  "by the public API, in process. status.failed adds one invented "
                  "failed sync attempt."),
        "status": {"ok": status_ok, "failed": status_failed},
        "prompts": prompts,
        "outcomes": {key: _outcome(answer) for key, answer in outcomes.items()},
        "guidance": {
            "candidates": [
                {field: candidate[field] for field in ("subject", "kind", "title", "priority")}
                for candidate in guidance["candidates"]
            ],
        },
        "queue": queue,
        "overview": overview,
        "changes": changes,
        "day": day,
        "settings": settings,
        "snooze": snooze,
        "glossary": glossary(),
        "states": states(queue),
    }


def _credentials(client: TestClient) -> dict:
    """The account rows' answer, the email fully masked. The .env fallback is
    blocked (as in an api-only install) so no real credential is ever read."""
    with patch.dict(sys.modules, {"tconnectsync": None}):
        answer = _get(client, "/api/credentials")
    return {"configured": answer["configured"], "region": answer["region"],
            "email": MASK if answer["email"] else None}


def _pump_settings(client: TestClient) -> dict:
    answer = _get(client, "/api/pump-settings")
    if not answer["configured"]:
        return {"configured": False}
    profile = answer["profile"]
    return {"configured": True, "fetched_at": answer["fetched_at"],
            "profile": {**{field: profile[field] for field in ("name", "dia_hours", "max_bolus")},
                        "segments": profile["segments"]}}


def _status(answer: dict) -> dict:
    return {field: answer[field] for field in
            ("last_attempt_at", "last_success_at", "last_error",
             "earliest_data_day", "latest_data_day", "data_day_count")}


def _settings(database: pathlib.Path, client: TestClient) -> dict:
    """The Settings screens' answers from the wearer's store, read after every
    other read of it: the account unset and then set, a sync that succeeds and
    then a later one that fails, and the pump profile."""
    unset = _credentials(client)
    _post(client, "/api/credentials", {"email": SYNTHETIC_EMAIL, "password": "synthetic", "region": "US"})
    configured = _credentials(client)
    stamp = "%Y-%m-%d %H:%M:%S"
    with Store.open(str(database)) as store:
        store.record_fetch_result(attempted_at=SYNC_OK_AT.strftime(stamp), ok=True)
    synced = _status(_get(client, "/api/status"))
    with Store.open(str(database)) as store:
        store.record_fetch_result(attempted_at=SYNC_FAILED_AT.strftime(stamp), ok=False, error=FAILED_ERROR)
    failed = _status(_get(client, "/api/status"))
    return {
        "credentials": {"unset": unset, "set": configured},
        "status": {"synced": synced, "failed": failed},
        "pump_settings": {"wearer": _pump_settings(client)},
    }


def _snooze(client: TestClient, *, pinned_pattern: str) -> dict:
    """The person snoozes the first admitted pattern other than the one their
    Focus watches, and the engine serves the decision time the snooze bar dates
    from."""
    answer = _get(client, "/api/guidance")
    candidate = next(c for c in answer["candidates"] if c["kind"] == "pattern" and c["admitted"]
                     and not c["preference"]["set_aside"] and c["subject"] != f"pattern:{pinned_pattern}")
    response = client.put(f"/api/guidance/preferences/{candidate['subject']}",
                          json={"generation": answer["analysis_generation"]})
    response.raise_for_status()
    after = next(c for c in _get(client, "/api/guidance")["candidates"] if c["subject"] == candidate["subject"])
    return {"subject": after["subject"], "title": after["title"],
            "set_aside": after["preference"]["set_aside"], "decided_at": after["decision"]["decided_at"]}


def _snooze_all(client: TestClient) -> None:
    """The person snoozes every candidate the Queue holds."""
    answer = _get(client, "/api/guidance")
    for candidate in answer["candidates"]:
        if candidate["admitted"] and not candidate["preference"]["set_aside"]:
            client.put(f"/api/guidance/preferences/{candidate['subject']}",
                       json={"generation": answer["analysis_generation"]}).raise_for_status()
            answer = _get(client, "/api/guidance")


def glossary() -> list[dict]:
    """§1.5's rows, the Glossary page's terms and their one-line definitions."""
    rows = []
    for line in _section(DESIGN.read_text(), "### 1.5 Glossary").splitlines():
        match = re.match(r"\|\s*\*\*(.+?)\*\*\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", line)
        if match:
            # The table's Markdown code spans print as plain words.
            rows.append({"term": match.group(1), "kind": match.group(2),
                         "meaning": match.group(3).replace("`", "")})
    return sorted(rows, key=lambda row: row["term"].lower())


def _outcome(answer: dict) -> dict:
    return {field: answer[field] for field in
            ("window_days", "span_start", "span_end", "coverage", "metrics")}


def _outcomes(client: TestClient) -> dict:
    return {str(w): _outcome(_get(client, "/api/outcomes", window=w)) for w in WINDOWS}


def _time_of_day(client: TestClient) -> dict:
    """The glucose profile's answer: the pooled 15-minute bins and meal buckets."""
    answer = _get(client, "/api/explore/time-of-day")
    pooled = answer["pooled"]
    return {
        "window": answer["window"],
        "target_range": answer["target_range"],
        "pooled": pooled and {
            "bin_minutes": pooled["bin_minutes"],
            "bins": [{field: b[field] for field in ("minute", "supported", "median", "p10", "p25", "p75", "p90")}
                     for b in pooled["bins"]],
            "meals": [{field: m[field] for field in ("minute", "count")} for m in pooled["meals"]],
        },
    }


def _day_navigator(client: TestClient) -> dict:
    answer = _get(client, "/api/day-navigator", month=NAVIGATOR_MONTH)
    return {
        "month": answer["month"],
        "days": [{field: d[field] for field in ("iso", "has_data", "lows", "highs", "tir", "curve")}
                 for d in answer["days"]],
    }


def _outcome_rows(rows: list[dict]) -> list[dict]:
    """A Trial comparison's outcome rows: Before, After and the per-outcome verdict."""
    return [{"key": r["key"], "unit": r["unit"], "before": r["before"], "after": r["after"],
             "assessment": {"state": r["assessment"]["state"]}} for r in rows]


def _changes_store(client: TestClient) -> dict:
    """The Changes components' answers from one store: the admission, the
    active or ended Trial (a matured active one with its retained comparison),
    and the Focus records with their served titles."""
    answer = _get(client, "/api/verify/trials")
    admission = answer["admission"]
    trials = []
    for t in answer["trials"]:
        ending = t["ending"]
        if t["watch_disposition"] != "active" and "kind" not in ending:
            continue
        row = {field: t[field] for field in
               ("id", "parameter", "slot", "changed_at", "before", "after", "state", "maturing",
                "target_metrics")}
        row["ending"] = ({"kind": ending["kind"], "effective_at": ending["effective_at"],
                          "assessment": {"outcomes": _outcome_rows(ending["assessment"]["outcomes"])}}
                         if "kind" in ending else {"state": ending["state"]})
        if t["watch_disposition"] == "active" and admission["can_finish_trial"]:
            selected = _get(client, "/api/verify/trials", selected=t["id"], assessment="retained")
            row["reassessment"] = {"outcomes": _outcome_rows(
                selected["selected"]["reassessment"]["comparison"]["outcomes"])}
        trials.append(row)
    focuses = []
    for f in answer["focuses"]:
        detail = _get(client, "/api/verify/trials", kind="focus", selected=str(f["id"]))["selected"]
        focuses.append({**{field: f[field] for field in ("id", "lever", "pattern_key", "pinned_at", "status")},
                        "title": detail["title"], "lever_title": detail["lever_title"],
                        **({"tracking": _focus_tracking(client, f["id"])} if f["status"] == "active" else {})})
    return {
        "admission": {field: admission[field] for field in
                      ("state", "active_kind", "active_id", "can_finish_trial", "maturity")},
        "trials": trials,
        "focuses": focuses,
    }


def _focus_wearer(scratch: pathlib.Path, name: str, *, days: int = ui_patient.DAYS) -> TestClient:
    """The wearer synced up to the Trial day, a Focus pinned then through
    ``POST /api/focus``, and the rest of the history (to ``days``) synced after,
    so the Focus has its own after period. No profile change: no Trial."""
    database = scratch / f"{name}.sqlite"
    with Store.open(str(database)) as store:
        ui_patient.materialize(store, trial=False, days=ui_patient.TRIAL_DAY)
        reconcile_ingested_follow_up(store)
    with clock_at(ui_patient.START + timedelta(days=ui_patient.TRIAL_DAY, hours=1)):
        _pin(_serve(database))
    with Store.open(str(database)) as store:
        ui_patient.materialize(store, trial=False, days=days)
        reconcile_ingested_follow_up(store)
    return _serve(database)


# The outcome rows a Focus card shows: the glossary metrics, and the peak and
# nadir a meal Pattern's Focus maps to.
FOCUS_OUTCOMES = ("tir", "tbr", "tar", "peak", "nadir")


def _focus_tracking(client: TestClient, focus_id: int) -> dict:
    """A Focus's served comparison, trimmed to what its card shows: the after
    period's readiness (meals counted against the engine's gate), adherence
    before and after with its verdict, and the outcome rows with their role;
    or, before any after period exists, the served unavailability."""
    comparison = _get(client, "/api/verify/trials", kind="focus", selected=str(focus_id),
                      assessment="retained")["selected"]["reassessment"]["comparison"]
    if "readiness" not in comparison:
        # Pinned at the end of the history: no after period to compare yet.
        return {"availability": comparison["availability"]}
    after = comparison["readiness"]["after"]
    adherence = comparison["adherence"]
    return {
        "readiness": {field: after[field] for field in ("unit", "count", "required", "criterion_met")},
        "adherence": {
            **{arm: {field: adherence[arm][field] for field in ("numerator", "opportunities", "rate")}
               for arm in ("before", "after")},
            "assessment": {"state": adherence["assessment"]["state"]},
        },
        "outcomes": [{**{field: row[field] for field in ("key", "unit", "before", "after", "role")},
                      "assessment": {"state": row["assessment"]["state"]}}
                     for row in comparison["outcomes"] if row["key"] in FOCUS_OUTCOMES],
    }


def _require_result(store: dict, state: str) -> None:
    """Fail unless the store's matured Trial serves ``state`` on its target metric:
    the ChangeCard's matured story reads it, and a story must never quietly
    show a result the engine no longer serves."""
    trial = next(t for t in store["trials"] if t["id"] == store["admission"]["active_id"])
    served = {row["assessment"]["state"] for row in trial["reassessment"]["outcomes"]
              if row["key"] in trial["target_metrics"]}
    if served != {state}:
        raise SystemExit(f"the simulated Trial {trial['id']} no longer serves {state}: {served}")


def _end_active_trial(client: TestClient) -> None:
    """The person ends the matured active Trial, as the End action posts it."""
    answer = _get(client, "/api/verify/trials")
    active = answer["admission"]["active_id"]
    _post(client, f"/api/verify/trials/{active}/finish",
          {"request_id": "ui-fixtures-end", "input_revision": answer["input_revision"]})


def _days(client: TestClient, navigator: dict) -> dict:
    """One day's timeline and logged carbs for each Day story, by rule: the
    latest day with readings, a site change and no logged carbs, the latest of
    the days with the most logged carbs, the first day after the history ends,
    and the latest day with readings (the Day screen's default)."""
    logged: dict = {}
    for entry in _get(client, "/api/carbs")["carb_entries"]:
        logged[entry["t"][:10]] = logged.get(entry["t"][:10], 0) + 1
    with_data = [d["iso"] for d in navigator["days"] if d["has_data"]]

    def site_change(iso: str) -> bool:
        start = datetime.fromisoformat(f"{iso}T00:00:00")
        return bool(_get(client, "/api/timeline", start=start.isoformat(),
                         end=(start + timedelta(days=1)).isoformat())["pump_events"])

    picks = {
        "default": next(iso for iso in reversed(with_data) if iso not in logged and site_change(iso)),
        "with_carbs": max((iso for iso in with_data if iso in logged), key=lambda iso: (logged[iso], iso)),
        "no_data": next(d["iso"] for d in navigator["days"] if not d["has_data"] and d["iso"] > with_data[-1]),
        "latest": with_data[-1],
    }
    days = {}
    for iso in sorted(set(picks.values())):
        start = f"{iso}T00:00:00"
        end = (datetime.fromisoformat(start) + timedelta(days=1)).isoformat()
        timeline = _get(client, "/api/timeline", start=start, end=end)
        carbs = _get(client, "/api/carbs", start=start, end=end)
        days[iso] = {
            "timeline": {
                "cgm": timeline["cgm"],
                "boluses": [{field: b[field] for field in ("t", "insulin", "carbs")} for b in timeline["boluses"]],
                "basal": [{field: b[field] for field in ("t", "duration_mins", "basal_rate", "profile_basal_rate")}
                          for b in timeline["basal"]],
                "pump_events": timeline["pump_events"],
                "sleep_windows": timeline["sleep_windows"],
            },
            "carbs": {"carb_entries": [{field: e[field] for field in ("id", "t", "grams", "certainty", "source")}
                                       for e in carbs["carb_entries"]]},
        }
    return {"states": picks, "days": days}


def _require_lows(stores: dict) -> dict:
    """Day's Prompts: every served prompt is a low (§1.5 Prompt), and the three
    stores step one answer apart from two unanswered to none, so a prompt's place
    ("1 / 2") is the difference of two served counts. ``wearer`` is the
    top-level ``prompts`` and is not repeated."""
    if any(p["detector"] != "low" for served in stores.values() for p in served):
        raise SystemExit("the wearer serves a prompt that is not a low")
    counts = [sum(p["answer"] is None for p in stores[name])
              for name in ("wearer-pending", "wearer", "wearer-answered")]
    if counts != [2, 1, 0]:
        raise SystemExit(f"the Day prompt stores serve {counts} unanswered, not [2, 1, 0]")
    return {name: served for name, served in stores.items() if name != "wearer"}


def _pin(client: TestClient) -> None:
    """Pin a Focus on the first pattern whose habit the engine lets the person pin."""
    for candidate in _get(client, "/api/guidance")["candidates"]:
        if candidate["kind"] != "pattern":
            continue
        response = client.post("/api/focus", json={
            "pattern_key": candidate["pattern_key"],
            "outcome_window": {"start_min": 0, "end_min": 1440},
        })
        if response.status_code == 200:
            return
    raise SystemExit("the engine lets the wearer pin no pattern")


ROW_FIELDS = ("id", "kind", "title", "chips", "claimed_by", "lever", "parameter",
              "count_sentences", "fold_sentences", "span", "members")


def _queue_store(client: TestClient) -> dict:
    """The Queue components' answers from one store, trimmed to what they read."""
    findings = _get(client, "/api/diagnose/findings")
    guidance = _get(client, "/api/guidance")
    analyze = _get(client, "/api/analyze")
    trials = _get(client, "/api/verify/trials")
    focus = _get(client, "/api/focus")
    # A pattern that collapses to its one member is served as that member's
    # habit row ("finding:<lever>"), which the Queue reads it through.
    collapsed = {f"finding:{p['action'].split(':', 1)[1]}" for p in findings["outcome_patterns"]
                 if p.get("collapse") == "collapse_to_member" and p.get("action")}
    return {
        "findings": {
            "outcome_patterns": [
                {**{field: p[field] for field in ("key", "subject", "title", "k", "n")},
                 "wide": p.get("wide"), "collapse": p.get("collapse"), "action": p.get("action")}
                for p in findings["outcome_patterns"]
            ],
            "rows": [
                {field: r.get(field) for field in ROW_FIELDS}
                for r in findings["rows"]
                if r["kind"] == "pattern" or r.get("claimed_by") or r["id"] in collapsed
                or (r["kind"] == "setting" and r.get("parameter") == "basal_rate" and r.get("members"))
            ],
        },
        "guidance": {
            "candidates": [
                {"subject": c["subject"], "kind": c["kind"], "title": c["title"], "units": c["units"],
                 "priority": c["priority"], "admitted": c["admitted"],
                 "set_aside": c["preference"]["set_aside"],
                 "decided_at": (c.get("decision") or {}).get("decided_at"),
                 # The Queue's order rule (the brief's Queue section): admitted
                 # and not set aside, ranked by priority.
                 "queued": c["admitted"] and not c["preference"]["set_aside"]}
                for c in guidance["candidates"]
            ],
        },
        "analyze": {
            "basal": [
                {**{field: b[field] for field in
                    ("slot", "label", "current", "recommended", "estimate", "days")},
                 "evidence": {"night_roster": [
                     {field: night[field] for field in ("date", "delivered_rate", "programmed_rate")}
                     for night in b["evidence"]["night_roster"]
                 ]}}
                for b in analyze["basal"] if b.get("asserts_move")
            ],
        },
        "trials": {
            "trials": [
                {field: t[field] for field in
                 ("id", "parameter", "slot", "changed_at", "before", "after", "state", "maturing")}
                for t in trials["trials"]
            ],
        },
        "focus": {
            "focuses": [
                {field: f[field] for field in ("id", "lever", "pattern_key", "status")}
                for f in focus["focuses"]
            ],
        },
        "cases": _pattern_cases(client, [c["subject"] for c in guidance["candidates"]
                                         if c["kind"] == "pattern" and c["admitted"]]),
    }


# The two cohorts the open Pattern card's impact line compares (§4.2
# PatternCard): the Pattern's own episodes and the comparison episodes.
IMPACT_COHORTS = ("matched", "comparison")


def _pattern_cases(client: TestClient, subjects: list[str]) -> dict:
    """Each admitted Pattern's event-aligned case file, trimmed to its two
    cohorts' median traces, by pattern key. A Pattern whose case file serves
    no inspectable member (404) has no entry."""
    preparation = _get(client, "/api/diagnose/finding-case-file-preparation")
    cases = {}
    for subject in subjects:
        response = client.get("/api/diagnose/finding-case-file", params={
            "projection_id": preparation["projection_id"], "finding_id": subject, "alignment": "event"})
        if response.status_code == 404:
            continue
        response.raise_for_status()
        projection = response.json()["projection"]
        cases[subject.removeprefix("pattern:")] = {
            "comparison": {"state": projection["comparison"]["state"]},
            "cohorts": [
                {"key": cohort["key"], "support": cohort["support"],
                 "points": [{"minute": point["minute"], "median": point["median"]}
                            for point in cohort["points"]]}
                for cohort in projection["cohorts"] if cohort["key"] in IMPACT_COHORTS
            ],
        }
    return cases


def _patterns(store: dict) -> list[dict]:
    """Counted patterns with their pattern-scope cause shares."""
    out = []
    for row in store["findings"]["rows"]:
        if row["kind"] != "pattern" or not row["count_sentences"]:
            continue
        shares = [s["count"] for r in store["findings"]["rows"] if r.get("claimed_by") == row["id"]
                  for s in r["fold_sentences"] or () if s["scope"] == "pattern"]
        out.append({"key": row["id"].removeprefix("pattern:"),
                    "count": row["count_sentences"][0]["count"], "shares": shares})
    return out


def _clock_label(minute: int) -> str:
    return f"{minute // 60:02d}:{minute % 60:02d}"


def _blocks(store: dict) -> list[dict]:
    """Admitted basal blocks: their start, range, nights and whether a Trial matured there."""
    out = []
    for row in store["findings"]["rows"]:
        if row["kind"] != "setting" or not row.get("members"):
            continue
        start = row["span"]["start_min"]
        slot = next(b for b in store["analyze"]["basal"] if b["slot"] * 30 == start)
        estimate = row["members"][0]["estimate"]
        out.append({
            "start": start,
            "collapsed": estimate["lo"] == estimate["hi"],
            "spread": len({n["delivered_rate"] for n in slot["evidence"]["night_roster"]}) > 1,
            "trial": any(t["parameter"] == "basal_rate" and t["slot"] == _clock_label(start)
                         and t["state"] == "complete" for t in store["trials"]["trials"]),
        })
    return out


def states(queue: dict) -> dict:
    """The store and subject behind each story state, chosen from the served
    answers: the wearer's, or else the first other store that serves it."""
    stores = ("wearer", "wearer-pinned", "wearer-worse")
    patterns = _patterns(queue["wearer"])
    blocks = [{**b, "store": store} for store in stores for b in _blocks(queue[store])]

    def pattern(rule):
        for store in stores:
            found = sorted((p for p in _patterns(queue[store]) if rule(p)), key=lambda p: -p["count"])
            if found:
                return {"store": store, "pattern": found[0]["key"]}
        return None

    def block(rule):
        found = [b for b in blocks if rule(b)]
        return {"store": found[0]["store"], "start_min": found[0]["start"]} if found else None

    pinned = next((f["pattern_key"] for f in queue["wearer-pinned"]["focus"]["focuses"]
                   if f["status"] == "active"), None)
    uncertain = next((p["key"] for p in queue["wearer"]["findings"]["outcome_patterns"]
                      if p.get("wide") is True and any(q["key"] == p["key"] for q in patterns)), None)
    found = {
        "multi_cause": pattern(lambda p: len(p["shares"]) >= 2),
        "single_cause": pattern(lambda p: len(p["shares"]) == 1),
        "no_cause": pattern(lambda p: not p["shares"] and p["count"] > 0),
        "pinned": {"store": "wearer-pinned", "pattern": pinned} if pinned else None,
        "setting": block(lambda b: b["spread"] and not b["collapsed"] and not b["trial"]),
        "setting_trial": block(lambda b: b["trial"]),
        # Optional: these arise only if the engine serves them naturally.
        "uncertain": {"store": "wearer", "pattern": uncertain} if uncertain else None,
        "range_collapsed": block(lambda b: b["collapsed"]),
        "zero_variance": block(lambda b: not b["spread"]),
    }
    required = ("multi_cause", "single_cause", "no_cause", "pinned", "setting", "setting_trial")
    missing = [name for name in required if found[name] is None]
    if missing:
        raise SystemExit(f"the simulated wearer no longer serves: {', '.join(missing)}")
    return found


def _table_first_column(section: str) -> list[str]:
    """The bold first-column cells of the first table in ``section``."""
    cells = []
    for line in section.splitlines():
        match = re.match(r"\|\s*\*\*(.+?)\*\*\s*\|", line)
        if match:
            cells.append(match.group(1))
    return cells


def _section(text: str, heading: str) -> str:
    start = text.index(heading)
    end = text.find("\n### ", start + len(heading))
    return text[start:end if end != -1 else len(text)]


def allowlist(data: dict) -> dict:
    text = DESIGN.read_text()
    stores = data["queue"].values()
    rows = [r for store in stores for r in store["findings"]["rows"]]
    sentences = [s for r in rows for s in (r["count_sentences"] or []) + (r["fold_sentences"] or [])]
    sources = {
        "glossary §1.5": _table_first_column(_section(text, "### 1.5 Glossary")),
        "tabs §1.1": _table_first_column(_section(text, "### 1.1 Tabs")),
        "engine titles": [c["title"] for c in data["guidance"]["candidates"]]
        + [c["title"] for store in stores for c in store["guidance"]["candidates"]]
        + [r["title"] for r in rows if r["kind"] == "habit"],  # causes, and a collapsed pattern's member
        "engine nouns": [s["noun"] for s in sentences],
        "engine units": [c["units"] for store in stores for c in store["guidance"]["candidates"]
                         if c["units"]],
        "units §4.2": list(UNITS),
        "connectives §4.2": list(CONNECTIVES),
        "state labels §4.2": list(STATE_LABELS),
        "Queue labels §1.3": list(QUEUE_LABELS),
        "weekdays §4.2": list(WEEKDAYS),
        "months §1.1": list(MONTHS),
        "labels §1.2–§4.2": list(CHANGE_DAY_LABELS),
        "engine habit titles": [f["lever_title"] for store in data["changes"].values()
                                for f in store["focuses"] if f["lever_title"]],
        "labels Settings": list(SETTINGS_LABELS),
        "served pump profile names": [p["profile"]["name"] for p in data["settings"]["pump_settings"].values()
                                      if p["configured"]],
        "served account regions": [c["region"] for c in data["settings"]["credentials"].values() if c["region"]],
        "served sync errors": [s["last_error"] for s in data["settings"]["status"].values() if s["last_error"]],
        "chart mark fields": [field for field in MARK_FIELDS
                              if all(field in slot for store in stores
                                     for slot in store["analyze"]["basal"])],
    }
    # The metric row is one cell listing every metric, comma-separated; the
    # answer and result rows are slash-separated. Words are what is checked.
    words = sorted({word.lower() for cells in sources.values()
                    for cell in cells for word in WORD.findall(cell)})
    return {
        "_generated_by": GENERATED_BY,
        "_note": ("Every word a component story may display: the redesign "
                  "glossary, its tab names, the engine titles, nouns and units "
                  "served in ui-fixtures.json, the window unit, the \"of\" "
                  "of a magnitude, the served fields the evidence chart's "
                  "marks plot, the glucose profile's \"No data\", the day "
                  "tile's weekdays, the month abbreviations of a date, the "
                  "Changes and Day labels quoted in §1.2–§4.2, the "
                  "engine's habit titles, the Settings labels, and the "
                  "served pump profile name, account region and sync error."),
        "words": words,
    }


def render(document: dict) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = fixtures()
    outputs = {FIXTURES: render(data), ALLOWLIST: render(allowlist(data))}
    if args.check:
        stale = [path for path, body in outputs.items()
                 if not path.exists() or path.read_text() != body]
        for path in stale:
            print(f"{path.relative_to(ROOT)} is stale; rerun {pathlib.Path(__file__).name}")
        return 1 if stale else 0
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for path, body in outputs.items():
        path.write_text(body)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
