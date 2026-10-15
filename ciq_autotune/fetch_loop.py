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
import sys
from datetime import timedelta
from typing import Callable, Optional

from .credentials import DEFAULT_KEY_PATH
from .store import Store, wall_clock_now

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 3600
FETCH_WINDOW_DAYS = 120
# A failed fetch is tried again this soon, at most this many times in a row,
# before the loop falls back to hourly: a container's network can come up a few
# seconds after the first fetch, which then left Settings Failed for the hour.
RETRY_SECONDS = 300
EARLY_RETRIES = 3

# The short label Settings shows for a failed fetch, beside its raw text. One
# per way the fetch fails: the connection never opened, it opened and timed out,
# the vendor refused the sign-in, the vendor answered with an HTTP error, the
# fetch refused to start, or anything else.
NO_CONNECTION = "No connection"
TIMED_OUT = "Timed out"
SIGN_IN_REFUSED = "Sign-in refused"
NOT_SET_UP = "Not set up"
UNKNOWN = "Unknown"


def fetch_error_label(error: BaseException) -> str:
    """The short label for what stopped a fetch; a partial fetch is labelled by
    what stopped its failed window."""
    from . import sync as sync_mod

    if isinstance(error, sync_mod.PartialFetchError):
        error = error.cause
    # Only an installed sync extra can raise these, and raising one imported it.
    requests = sys.modules.get("requests")
    vendor = sys.modules.get("tconnectsync.api.common")
    if requests is not None and isinstance(error, requests.exceptions.Timeout):
        return TIMED_OUT
    if requests is not None and isinstance(error, requests.exceptions.ConnectionError):
        return NO_CONNECTION
    if isinstance(error, sync_mod.SignInRefused):
        return SIGN_IN_REFUSED
    if vendor is not None and isinstance(error, vendor.ApiException) and error.status_code:
        return f"HTTP {error.status_code}"
    if isinstance(error, sync_mod.NotSetUp):
        return NOT_SET_UP
    return UNKNOWN


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

    # One reading on the pump's wall clock stamps the attempt and ends its window
    # (ADR 443), whatever zone this process runs in.
    reading = wall_clock_now()
    end = sync_mod.window_end(reading)
    start = end - timedelta(days=days)
    attempted_at = reading.strftime("%Y-%m-%d %H:%M:%S")
    with Store.open(db_path) as store:
        # The store's durable revision advances inside every upsert's own
        # transaction, so comparing it against this baseline says whether the
        # attempt committed anything. Read the comparison FIRST in each failure
        # branch: ``record_fetch_result`` advances the revision itself, so a
        # reading taken after it is always higher and every failed fetch would
        # look like a write (#146).
        baseline = store.input_data_revision()
        reconcile_needed = False
        try:
            written = sync_mod.pull_from_tconnect(store, start=start, end=end, key_path=key_path)
        except sync_mod.PartialFetchError as e:
            committed = store.input_data_revision() > baseline
            reconcile_needed = committed
            # Some windows landed before a later one failed — the completed
            # windows are already persisted (idempotent upserts), so this is not
            # a total failure, but not a success either: record ok=False (so the
            # last-known-good counts stand) with a summary of how far it got.
            logger.warning("Hourly fetch partial: %s", e)
            summary = (f"{e.windows_completed} of {e.windows_total} windows succeeded, "
                       f"partial data kept: {e.cause}")
            store.record_fetch_result(attempted_at=attempted_at, ok=False, error=summary,
                                      error_label=fetch_error_label(e))
            # Fetch status is an input revision too.  Complete the same durable
            # frontier before returning the historical no-row sentinel.
            reconcile_needed = True
            if committed:
                return e.written
        except Exception as e:  # any failure must not kill the loop
            committed = store.input_data_revision() > baseline
            reconcile_needed = committed
            logger.warning("Hourly fetch failed: %s", e)
            store.record_fetch_result(attempted_at=attempted_at, ok=False, error=str(e),
                                      error_label=fetch_error_label(e))
            reconcile_needed = True
            if committed:
                # Rows landed — the settings snapshot, or part of a window — but
                # this path carries no counts to report them by.
                return {}
        else:
            reconcile_needed = True
            store.record_fetch_result(attempted_at=attempted_at, ok=True, written=written)
            return written
        finally:
            from .watched_change import reconcile_ingested_follow_up
            try:
                if reconcile_needed:
                    reconcile_ingested_follow_up(store)
            except Exception:
                # Ingestion commits window by window. Reconciliation rolls back
                # independently; callers must still invalidate committed inputs.
                logger.exception("Follow-up reconciliation failed after fetch")
    return None


def _last_attempt_failed(db_path: str) -> bool:
    """Whether the attempt just recorded failed, as ``/api/status`` reads it."""
    with Store.open(db_path) as store:
        status = store.fetch_status()
    return status is not None and status["last_error"] is not None


async def run_fetch_loop(db_path: str, *, key_path: str = DEFAULT_KEY_PATH,
                          interval_seconds: float = INTERVAL_SECONDS,
                          retry_seconds: float = RETRY_SECONDS,
                          on_write: Optional[Callable[[], None]] = None) -> None:
    """Fetch on startup, then every ``interval_seconds``, until cancelled.

    A failed fetch is tried again after ``retry_seconds`` instead, up to
    ``EARLY_RETRIES`` times in a row; one that still fails then waits the full
    interval, and the next success starts the count again.

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
    retries = 0
    while True:
        written = await asyncio.to_thread(run_fetch_once, db_path, key_path=key_path)
        if written is not None and on_write is not None:
            await asyncio.to_thread(on_write)
        if not await asyncio.to_thread(_last_attempt_failed, db_path):
            retries = 0
        elif retries < EARLY_RETRIES:
            retries += 1
            await asyncio.sleep(retry_seconds)
            continue
        await asyncio.sleep(interval_seconds)
