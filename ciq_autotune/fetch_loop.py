"""The hourly background fetch loop: fetch on startup, then every hour, for as
long as the API process (``ciq-autotune serve``) runs.

This is the dumb, fixed-interval loop the frontend's first phase ships — not
the configurable-cron + notifier-integration version (issue #7), which stays
deferred. A single fetch failure (bad credentials, network, 2FA prompt) must
not kill the loop, so :func:`run_fetch_once` always records its outcome to
:meth:`~ciq_autotune.store.Store.record_fetch_result` instead of raising.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Callable, Optional

from .credentials import DEFAULT_KEY_PATH
from .store import Store

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 3600
FETCH_WINDOW_DAYS = 120


def run_fetch_once(db_path: str, *, key_path: str = DEFAULT_KEY_PATH,
                    days: int = FETCH_WINDOW_DAYS) -> Optional[dict]:
    """One fetch attempt, recording its outcome regardless of success or
    failure so ``/api/status`` always reflects the last attempt.

    Returns the written summary on a successful fetch, and on a failed one that
    committed rows before it stopped — possibly an empty summary, when the counts
    are not recoverable from the failure. That return is the signal the loop uses
    to invalidate a running server's result cache (#267), so it follows what was
    committed rather than whether the pull returned (#146): the pull commits window
    by window, and rows already in the store must not be served around. An attempt
    that committed nothing returns ``None``."""
    from . import sync as sync_mod

    end = date.today()
    start = end - timedelta(days=days)
    attempted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with Store.open(db_path) as store:
        # The store's durable revision advances inside every upsert's own
        # transaction, so comparing it against this baseline says whether the
        # attempt committed anything. Read the comparison FIRST in each failure
        # branch: ``record_fetch_result`` advances the revision itself, so a
        # reading taken after it is always higher and every failed fetch would
        # look like a write (#146).
        baseline = store.input_data_revision()
        try:
            written = sync_mod.pull_from_tconnect(store, start=start, end=end, key_path=key_path)
        except sync_mod.PartialFetchError as e:
            committed = store.input_data_revision() > baseline
            # Some windows landed before a later one failed — the completed
            # windows are already persisted (idempotent upserts), so this is not
            # a total failure, but not a success either: record ok=False (so the
            # last-known-good counts stand) with a summary of how far it got.
            logger.warning("Hourly fetch partial: %s", e)
            summary = (f"{e.windows_completed} of {e.windows_total} windows succeeded, "
                       f"partial data kept: {e.cause}")
            store.record_fetch_result(attempted_at=attempted_at, ok=False, error=summary)
            if committed:
                return e.written
        except Exception as e:  # any failure must not kill the loop
            committed = store.input_data_revision() > baseline
            logger.warning("Hourly fetch failed: %s", e)
            store.record_fetch_result(attempted_at=attempted_at, ok=False, error=str(e))
            if committed:
                # Rows landed — the settings snapshot, or part of a window — but
                # this path carries no counts to report them by.
                return {}
        else:
            store.record_fetch_result(attempted_at=attempted_at, ok=True, written=written)
            return written
    return None


async def run_fetch_loop(db_path: str, *, key_path: str = DEFAULT_KEY_PATH,
                          interval_seconds: int = INTERVAL_SECONDS,
                          on_write: Optional[Callable[[], None]] = None) -> None:
    """Fetch on startup, then every ``interval_seconds``, until cancelled.

    ``run_fetch_once`` is blocking (synchronous HTTP via tconnectsync), so it
    runs in a worker thread via :func:`asyncio.to_thread` and never blocks the
    event loop the rest of the API serves requests on.

    ``on_write`` (optional, zero-arg) is called after any fetch that committed
    anything — the seam the app uses to invalidate its result cache without the
    loop importing the app (#267). A fetch that committed nothing does not fire
    it; a failed one that committed rows before it stopped does, because those
    rows are durably in the store (#146). It runs in a worker thread like the
    fetch itself, because it now also pre-warms the cache (#424) and that is
    seconds of pure-Python compute the event loop must not stall on.
    """
    while True:
        written = await asyncio.to_thread(run_fetch_once, db_path, key_path=key_path)
        if written is not None and on_write is not None:
            await asyncio.to_thread(on_write)
        await asyncio.sleep(interval_seconds)
