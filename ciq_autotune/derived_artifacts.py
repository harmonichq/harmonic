"""Durable, disposable cache for fixed Diagnose derivations (#123).

This is deliberately the only module which knows the sidecar layout.  A hit is
an exact match on the Store revision, complete ResultCache coordinates, and the
model marker; any damaged bytes are a cache miss, never advisory input.
"""
from __future__ import annotations

import hashlib
import inspect
import json
import sqlite3
import weakref
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .store import Store

DERIVED_ARTIFACT_STORE_SCHEMA_VERSION = 3
_MAX_SNAPSHOT_ATTEMPTS = 3
_FINGERPRINT: str | None = None
_SIDECAR_REBUILDS: dict[int, weakref.ReferenceType] = {}


class InputRevisionChanged(RuntimeError):
    """Every bounded artifact snapshot crossed a primary-data revision."""


@dataclass(frozen=True)
class InputDataAge:
    schema_version: int
    revision: int
    covers_to: str
    newest_covers_to: str | None = None


@dataclass(frozen=True)
class FixedResult:
    """One fixed payload and the input horizon it was computed from."""
    value: Any
    input_data_age: InputDataAge | None
    revision: int | None = None
    covers_to: str | None = None


def sidecar_path(db_path: str) -> str:
    return f"{Path(db_path).resolve()}.derived.sqlite"


def source_fingerprint() -> str:
    """One stable, process-cached hash of package Python sources."""
    global _FINGERPRINT
    if _FINGERPRINT is None:
        digest = hashlib.sha256()
        root = Path(__file__).resolve().parent
        for path in sorted(root.rglob("*.py")):
            digest.update(path.relative_to(root).as_posix().encode())
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
        _FINGERPRINT = digest.hexdigest()
    return _FINGERPRINT


def _open(path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(path, timeout=30.0)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("""CREATE TABLE IF NOT EXISTS artifacts (
        revision INTEGER NOT NULL, coordinates TEXT NOT NULL, marker TEXT NOT NULL,
        payload TEXT NOT NULL, digest TEXT NOT NULL, covers_to TEXT,
        UNIQUE(revision, coordinates, marker)
    )""")
    return conn


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(payload: str, covers_to: str | None) -> str:
    """Authenticate both the result bytes and their claimed input horizon."""
    return hashlib.sha256(_canonical((payload, covers_to)).encode()).hexdigest()


def _transient(error: sqlite3.Error) -> bool:
    return "locked" in str(error).lower() or "busy" in str(error).lower()


def _corrupt(error: sqlite3.Error) -> bool:
    text = str(error).lower()
    return ("malformed" in text or "not a database" in text
            or "database disk image is malformed" in text
            or "no such table: artifacts" in text or "no such column" in text
            or "has no column named" in text)


def _recreate_if_exclusive(path: str) -> bool:
    try:
        conn = sqlite3.connect(path, timeout=0.0)
        try:
            conn.execute("BEGIN IMMEDIATE")
            Path(path).unlink(missing_ok=True)
            conn.rollback()
        finally:
            conn.close()
        return True
    except (sqlite3.Error, OSError):
        return False


def _call(compute: Callable, store: Store):
    return compute(store) if inspect.signature(compute).parameters else compute()


def _mark_sidecar_rebuilt(value: Any) -> None:
    if isinstance(value, tuple):
        for item in value:
            _mark_sidecar_rebuilt(item)
        return
    try:
        identity = id(value)
        _SIDECAR_REBUILDS[identity] = weakref.ref(
            value, lambda _, identity=identity: _SIDECAR_REBUILDS.pop(identity, None))
    except TypeError:
        pass


def is_sidecar_rebuilt(value: Any) -> bool:
    if isinstance(value, tuple):
        return any(is_sidecar_rebuilt(item) for item in value)
    ref = _SIDECAR_REBUILDS.get(id(value))
    return ref is not None and ref() is value


def discard_artifact(db_path: str, coordinates: tuple, shape_marker: str) -> None:
    """Best-effort removal of one damaged exact-key artifact."""
    try:
        with Store.open_queryonly(db_path) as primary:
            revision = primary.input_data_revision()
        with closing(_open(sidecar_path(db_path))) as sidecar:
            with sidecar:
                sidecar.execute("DELETE FROM artifacts WHERE revision=? AND coordinates=? AND marker=?",
                                (revision, _canonical(coordinates), _canonical(
                                    (shape_marker, DERIVED_ARTIFACT_STORE_SCHEMA_VERSION,
                                     source_fingerprint()))))
    except sqlite3.Error:
        pass


def load_or_compute(db_path: str, coordinates: tuple, compute: Callable,
                    *, shape_marker: str, dump: Callable[[Any], Any] | None = None,
                    rebuild: Callable[[Any], Any] | None = None,
                    readonly: bool = False, before_persist: Callable[[], None] | None = None,
                    before_commit: Callable[[], None] | None = None,
                    with_age: bool = False) -> Any:
    """Return an exact durable hit or compute from one query-only Store snapshot.

    ``compute`` may accept the pinned Store snapshot or no arguments for simple
    callers.  Read-only snapshots intentionally never create a sidecar.
    """
    for _ in range(_MAX_SNAPSHOT_ATTEMPTS):
        result = _load_or_compute_once(
            db_path, coordinates, compute, shape_marker=shape_marker,
            dump=dump, rebuild=rebuild, readonly=readonly,
            before_persist=before_persist, before_commit=before_commit,
            with_age=with_age,
        )
        if result is not _REVISION_CHANGED:
            return result
    raise InputRevisionChanged(
        "input data changed during every derived-artifact snapshot")


_REVISION_CHANGED = object()


def _load_or_compute_once(db_path: str, coordinates: tuple, compute: Callable,
                          *, shape_marker: str,
                          dump: Callable[[Any], Any] | None = None,
                          rebuild: Callable[[Any], Any] | None = None,
                          readonly: bool = False,
                          before_persist: Callable[[], None] | None = None,
                          before_commit: Callable[[], None] | None = None,
                          with_age: bool = False) -> Any:
    if readonly:
        with Store.open_readonly(db_path) as snapshot:
            value = _call(compute, snapshot)
            return FixedResult(value, None, covers_to=None) if with_age else value
    # Fixed API reads historically opened Store themselves, which initializes a
    # newly named database before its first read. Preserve that behavior before
    # the query-only snapshot (and never do it for explicit readonly snapshots).
    with Store.open(db_path):
        pass
    marker = _canonical((shape_marker, DERIVED_ARTIFACT_STORE_SCHEMA_VERSION, source_fingerprint()))
    coords = _canonical(coordinates)
    path = sidecar_path(db_path)
    durable_hit = False
    try:
        with Store.open_queryonly(db_path) as primary:
            primary.conn.execute("BEGIN")
            revision = primary.input_data_revision()
            covers_to_value = primary.latest_cgm_or_basal_timestamp()
            covers_to = covers_to_value.strftime("%Y-%m-%d %H:%M:%S") if covers_to_value else None
            try:
                with closing(_open(path)) as sidecar:
                    row = sidecar.execute(
                        "SELECT payload, digest, covers_to FROM artifacts WHERE revision=? AND coordinates=? AND marker=?",
                        (revision, coords, marker)).fetchone()
                    if row is not None and _digest(row[0], row[2]) == row[1]:
                        try:
                            plain = json.loads(row[0])
                            value = rebuild(plain) if rebuild else plain
                            if rebuild is not None:
                                _mark_sidecar_rebuilt(value)
                            covers_to = row[2]
                            durable_hit = True
                        except (ValueError, TypeError, KeyError):
                            pass
            except sqlite3.Error as error:
                if not _corrupt(error):
                    # contention and unclassified failures are cache misses; never
                    # delete bytes that another local process may own.
                    pass
            if not durable_hit:
                value = _call(compute, primary)
                primary.conn.execute("COMMIT")
    except Exception:
        raise
    if durable_hit:
        try:
            with Store.open_queryonly(db_path) as fresh:
                if fresh.input_data_revision() != revision:
                    return _REVISION_CHANGED
        except sqlite3.Error:
            return _REVISION_CHANGED
        return FixedResult(value, None, revision, covers_to) if with_age else value
    plain = dump(value) if dump else value
    try:
        payload = _canonical(plain)
    except (TypeError, ValueError):
        payload = None
    # The post-snapshot revision is deliberately fresh: a crossed write makes
    # this computation unusable, while a later write leaves an old exact key.
    if before_persist is not None and payload is not None:
        before_persist()
    try:
        with Store.open_queryonly(db_path) as fresh:
            if fresh.input_data_revision() != revision:
                return _REVISION_CHANGED
    except sqlite3.Error:
        # Without the fresh revision proof these bytes cannot be returned as a
        # current, unlabeled result. Retry from a new snapshot instead.
        return _REVISION_CHANGED
    if payload is None:
        return FixedResult(value, None, revision, covers_to) if with_age else value
    try:
        with closing(_open(path)) as sidecar:
            with sidecar:
                sidecar.execute("""INSERT INTO artifacts(revision,coordinates,marker,payload,digest,covers_to)
                    VALUES(?,?,?,?,?,?) ON CONFLICT(revision,coordinates,marker)
                    DO UPDATE SET payload=excluded.payload,digest=excluded.digest,covers_to=excluded.covers_to""",
                    (revision, coords, marker, payload, _digest(payload, covers_to), covers_to))
                if before_commit is not None:
                    before_commit()
    except sqlite3.Error as error:
        if _corrupt(error):
            # A malformed sidecar is disposable, but only remove it after opening
            # failed; a locked sidecar is never recreated.
            if _recreate_if_exclusive(path):
                try:
                    with closing(_open(path)) as sidecar:
                        with sidecar:
                            sidecar.execute("""INSERT INTO artifacts(revision,coordinates,marker,payload,digest,covers_to)
                                VALUES(?,?,?,?,?,?) ON CONFLICT(revision,coordinates,marker)
                                DO UPDATE SET payload=excluded.payload,digest=excluded.digest,covers_to=excluded.covers_to""",
                                (revision, coords, marker, payload,
                                 _digest(payload, covers_to), covers_to))
                except sqlite3.Error:
                    pass
        # Return fresh computation for every persistence failure.
    return FixedResult(value, None, revision, covers_to) if with_age else value


def load_latest_prior(db_path: str, coordinates: tuple, *, shape_marker: str,
                      rebuild: Callable[[Any], Any] | None = None) -> FixedResult | None:
    """Return the newest prior-revision exact artifact, never a partial match."""
    marker = _canonical((shape_marker, DERIVED_ARTIFACT_STORE_SCHEMA_VERSION, source_fingerprint()))
    path = sidecar_path(db_path)
    try:
        # Initialize/validate the disposable sidecar before opening the stable
        # primary snapshot. The selection below then reads both databases in one
        # SQLite statement, so its revision bound and chosen predecessor cannot
        # straddle a fetch commit.
        with closing(_open(path)):
            pass
        with Store.open_queryonly(db_path) as primary:
            primary.conn.execute("ATTACH DATABASE ? AS derived_artifacts", (path,))
            row = primary.conn.execute(
                "SELECT revision,payload,digest,covers_to,"
                "(SELECT MAX(t) FROM ("
                "SELECT MAX(t) AS t FROM main.cgm_readings UNION ALL "
                "SELECT MAX(t) AS t FROM main.basal_events)) AS newest_covers_to "
                "FROM derived_artifacts.artifacts "
                "WHERE revision < (SELECT revision FROM main.input_data_revision WHERE id=1) "
                "AND coordinates=? AND marker=? "
                "ORDER BY revision DESC LIMIT 1",
                (_canonical(coordinates), marker)).fetchone()
        if row is None or row[3] is None or _digest(row[1], row[3]) != row[2]:
            return None
        value = json.loads(row[1])
        value = rebuild(value) if rebuild else value
        return FixedResult(value, InputDataAge(DERIVED_ARTIFACT_STORE_SCHEMA_VERSION,
                                               row[0], row[3], row[4]),
                           row[0], row[3])
    except (sqlite3.Error, ValueError, TypeError, KeyError):
        return None


# PreparedCases intentionally has no adapter: it retains domain objects and
# non-plain collections, and its recomputation is acceptable (#122 pre-warms it).
def dump_event_comparison(value):
    return {"exposures": value._exposures, "catalog": value._catalog}


def rebuild_event_comparison(value):
    from .event_comparison import EventComparisonPreparation
    if not _event_comparison_shape(value):
        raise ValueError("invalid event-comparison artifact")
    return EventComparisonPreparation(_exposures=value["exposures"], _catalog=value["catalog"])


def _event_comparison_shape(value: Any) -> bool:
    return (isinstance(value, dict) and isinstance(value.get("exposures"), dict)
            and isinstance(value.get("catalog"), dict))


def dump_findings(value):
    return {"analysis": value._analysis, "exposures": value._exposures, "scenarios": value._scenarios}


def rebuild_findings(value):
    from .findings_projection import FindingsProjection
    if (not isinstance(value, dict) or not isinstance(value.get("analysis"), dict)
            or not isinstance(value.get("exposures"), dict)
            or not isinstance(value.get("scenarios"), dict)):
        raise ValueError("invalid findings artifact")
    return FindingsProjection(_analysis=value["analysis"], _exposures=value["exposures"], _scenarios=value["scenarios"])


def dump_ic_history(value):
    return {"catalog": list(value._catalog), "series": value._series}


def rebuild_ic_history(value):
    from .ic_history_events import IcHistoryEventProjection
    if (not isinstance(value, dict) or not isinstance(value.get("catalog"), list)
            or not isinstance(value.get("series"), dict)
            or any(not isinstance(series, list) for series in value["series"].values())):
        raise ValueError("invalid I:C history artifact")
    return IcHistoryEventProjection(_catalog=tuple(value["catalog"]), _series={k: tuple(v) for k, v in value["series"].items()})


def dump_ic_block_evidence(value):
    return {"blocks": list(value._blocks), "series": value._series}


def rebuild_ic_block_evidence(value):
    from .ic_block_evidence import IcBlockEvidenceProjection
    if (not isinstance(value, dict) or not isinstance(value.get("blocks"), list)
            or not isinstance(value.get("series"), dict)
            or any(not isinstance(series, list) for series in value["series"].values())):
        raise ValueError("invalid I:C block evidence artifact")
    return IcBlockEvidenceProjection(
        _blocks=tuple(value["blocks"]),
        _series={int(key): tuple(rows) for key, rows in value["series"].items()},
    )
