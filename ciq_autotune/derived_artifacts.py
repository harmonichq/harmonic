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
from pathlib import Path
from typing import Any, Callable

from .store import Store

DERIVED_ARTIFACT_STORE_SCHEMA_VERSION = 1
_FINGERPRINT: str | None = None


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
        payload TEXT NOT NULL, digest TEXT NOT NULL,
        UNIQUE(revision, coordinates, marker)
    )""")
    return conn


def _canonical(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _digest(payload: str) -> str:
    return hashlib.sha256(payload.encode()).hexdigest()


def _transient(error: sqlite3.Error) -> bool:
    return "locked" in str(error).lower() or "busy" in str(error).lower()


def _corrupt(error: sqlite3.Error) -> bool:
    text = str(error).lower()
    return "malformed" in text or "not a database" in text or "database disk image is malformed" in text


def _call(compute: Callable, store: Store):
    return compute(store) if inspect.signature(compute).parameters else compute()


def load_or_compute(db_path: str, coordinates: tuple, compute: Callable,
                    *, shape_marker: str, dump: Callable[[Any], Any] | None = None,
                    rebuild: Callable[[Any], Any] | None = None,
                    readonly: bool = False) -> Any:
    """Return an exact durable hit or compute from one query-only Store snapshot.

    ``compute`` may accept the pinned Store snapshot or no arguments for simple
    callers.  Read-only snapshots intentionally never create a sidecar.
    """
    if readonly:
        with Store.open_readonly(db_path) as snapshot:
            return _call(compute, snapshot)
    marker = _canonical((shape_marker, DERIVED_ARTIFACT_STORE_SCHEMA_VERSION, source_fingerprint()))
    coords = _canonical(coordinates)
    path = sidecar_path(db_path)
    try:
        with Store.open_queryonly(db_path) as primary:
            primary.conn.execute("BEGIN")
            revision = primary.input_data_revision()
            try:
                with _open(path) as sidecar:
                    row = sidecar.execute(
                        "SELECT payload, digest FROM artifacts WHERE revision=? AND coordinates=? AND marker=?",
                        (revision, coords, marker)).fetchone()
                    if row is not None and _digest(row[0]) == row[1]:
                        try:
                            plain = json.loads(row[0])
                            return rebuild(plain) if rebuild else plain
                        except (ValueError, TypeError, KeyError):
                            pass
            except sqlite3.Error as error:
                if not _corrupt(error):
                    # contention and unclassified failures are cache misses; never
                    # delete bytes that another local process may own.
                    pass
            value = _call(compute, primary)
            primary.conn.execute("COMMIT")
    except Exception:
        raise
    plain = dump(value) if dump else value
    try:
        payload = _canonical(plain)
    except (TypeError, ValueError):
        return value
    # The post-snapshot revision is deliberately fresh: a crossed write makes
    # this computation non-durable, while a later write leaves an old exact key.
    try:
        with Store.open_queryonly(db_path) as fresh:
            if fresh.input_data_revision() != revision:
                return value
        with _open(path) as sidecar:
            with sidecar:
                sidecar.execute("""INSERT INTO artifacts(revision,coordinates,marker,payload,digest)
                    VALUES(?,?,?,?,?) ON CONFLICT(revision,coordinates,marker)
                    DO UPDATE SET payload=excluded.payload,digest=excluded.digest""",
                    (revision, coords, marker, payload, _digest(payload)))
    except sqlite3.Error as error:
        if _corrupt(error):
            # A malformed sidecar is disposable, but only remove it after opening
            # failed; a locked sidecar is never recreated.
            try:
                Path(path).unlink(missing_ok=True)
            except OSError:
                pass
        # Return fresh computation for every persistence failure.
    return value


# PreparedCases intentionally has no adapter: it retains domain objects and
# non-plain collections, and its recomputation is acceptable (#122 pre-warms it).
def dump_event_comparison(value):
    return {"exposures": value._exposures, "catalog": value._catalog}


def rebuild_event_comparison(value):
    from .event_comparison import EventComparisonPreparation
    return EventComparisonPreparation(_exposures=value["exposures"], _catalog=value["catalog"])


def dump_findings(value):
    return {"analysis": value._analysis, "exposures": value._exposures, "scenarios": value._scenarios}


def rebuild_findings(value):
    from .findings_projection import FindingsProjection
    return FindingsProjection(_analysis=value["analysis"], _exposures=value["exposures"], _scenarios=value["scenarios"])


def dump_ic_history(value):
    return {"catalog": list(value._catalog), "series": value._series}


def rebuild_ic_history(value):
    from .ic_history_events import IcHistoryEventProjection
    return IcHistoryEventProjection(_catalog=tuple(value["catalog"]), _series={k: tuple(v) for k, v in value["series"].items()})
