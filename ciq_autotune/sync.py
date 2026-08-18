"""Get raw t:connect data into the local store.

:func:`pull_from_tconnect` does a live pull through upstream ``tconnectsync``
(Tandem Source): it fetches the pump's event log, maps the typed events to store
rows, and funnels them through idempotent
:class:`~ciq_autotune.store.Store` upserts, so re-pulling an overlapping window
merges rather than duplicates. Long spans are fetched as <=31-day windows, each
upserted on its own so a mid-run failure keeps the windows that already landed
(surfaced as :class:`PartialFetchError`). Needs the ``sync`` extra and credentials, either
stored (encrypted) in the DB or in a ``.env`` — see
:func:`~ciq_autotune.credentials.load_credentials`.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta
from typing import Dict, Iterator, Tuple, Union

logger = logging.getLogger(__name__)

from .credentials import DEFAULT_KEY_PATH
from .store import Store

# t:connect rejects a pump-event request whose window spans more than 31 days, so
# anything longer is fetched as a sequence of <=31-day windows and merged.
_MAX_WINDOW_DAYS = 31

_DateLike = Union[str, date, datetime]

# The event tables a window pull accumulates counts for (``profile_settings`` is
# captured once, not per window, and folded in by :func:`pull_from_tconnect`).
# Used to seed the per-table counter dict.
_EVENT_TABLES = (
    "basal_events", "bolus_events", "cgm_readings", "iob_events", "pump_events",
)


class PartialFetchError(Exception):
    """A multi-window pull that persisted some windows before a later one failed.

    Carries the counts upserted before the failure (:attr:`written`) and how far
    the run got (:attr:`windows_completed` / :attr:`windows_total`). Upserts are
    idempotent, so the completed windows are left in place and a re-pull is safe
    — this only signals that ``/status`` should report partial progress, not that
    the store is inconsistent. Raised only when at least one window completed; a
    failure on the very first window is an ordinary error (nothing to preserve).
    """

    def __init__(self, cause, *, written, windows_completed, windows_total,
                 failed_window):
        self.cause = cause
        self.written = written
        self.windows_completed = windows_completed
        self.windows_total = windows_total
        self.failed_window = failed_window
        window_start, window_end = failed_window
        super().__init__(
            f"fetch failed after {windows_completed} of {windows_total} windows "
            f"({window_start}–{window_end}): {cause}"
        )


def _as_date(value: _DateLike) -> date:
    """Coerce a ``date`` / ``datetime`` / ``"YYYY-MM-DD"`` string to a ``date``."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(value)


def _date_windows(start: _DateLike, end: _DateLike) -> Iterator[Tuple[date, date]]:
    """Tile ``[start, end]`` into inclusive windows of at most ``_MAX_WINDOW_DAYS``.

    Yields ``(window_start, window_end)`` date pairs covering the whole span with
    no gaps and no overlap; a span that already fits yields a single window.
    """
    start, end = _as_date(start), _as_date(end)
    if start > end:
        raise ValueError(f"start {start} is after end {end}")
    span = timedelta(days=_MAX_WINDOW_DAYS - 1)
    window_start = start
    while window_start <= end:
        window_end = min(window_start + span, end)
        yield window_start, window_end
        window_start = window_end + timedelta(days=1)


def pull_from_tconnect(store: Store, *, start, end, region=None,
                       key_path: str = DEFAULT_KEY_PATH) -> Dict[str, int]:
    """Live pull from t:connect (Tandem Source) via upstream ``tconnectsync``.

    Fetches the pump's event log for ``[start, end]`` (``datetime``/``date`` or
    ``"YYYY-MM-DD"`` strings), maps the typed events to store rows with
    :func:`~ciq_autotune.tandemsource_map.events_to_rows`, and funnels them
    through idempotent upserts. Returns a map of table -> rows written.

    Windows longer than 31 days are split into <=31-day requests (t:connect
    rejects longer ones) and each window is fetched, mapped, and upserted on its
    own (see :func:`_pull_windows`), so a mid-run failure keeps the windows that
    already landed instead of discarding the whole pull. If a later window fails
    after earlier ones persisted, a :class:`PartialFetchError` is raised carrying
    the partial counts and how far the run got. The one cost of per-window
    upserts: basal gap-sizing no longer spans window seams, so a reporting hole
    that straddles a 31-day boundary is sized at the 5-min cadence instead of
    flagged as a >10-min basal reporting gap — one segment, at one seam, only
    when an outage lands exactly on a monthly boundary. Bounded and negligible.

    Credentials come from :func:`~ciq_autotune.credentials.load_credentials`
    (the encrypted DB store, falling back to a ``.env`` with ``TCONNECT_EMAIL``
    / ``TCONNECT_PASSWORD`` / ``TCONNECT_REGION``; see ``.env.example``). The
    login is OAuth PKCE against Tandem Source and may prompt for 2FA on first
    run. ``TIMEZONE_NAME`` (also from ``.env``) sets the wall clock independent
    of these credentials.

    Imports of the ``sync`` extra are deferred to call time so the rest of the
    package stays importable (and the model/CLI run) without it installed.
    """
    # Refuse to fetch without TIMEZONE_NAME. Pump event timestamps are tz-aware;
    # normalize_time would otherwise convert them against a UTC default and store
    # every record off the pump's local clock — a full re-pull from a cwd with no
    # .env once stored the whole history +7 h and doubled bolus/iob/pump as
    # phantoms (#198). Fail fast here, before the network login, and log the tz we
    # will bucket against so it is visible in the fetch output.
    tz_name = os.environ.get("TIMEZONE_NAME")
    if not tz_name:
        raise RuntimeError(
            "TIMEZONE_NAME is not set — refusing to fetch. Every tz-aware pump "
            "timestamp would be stored off the pump's local wall clock (#198). "
            "Set TIMEZONE_NAME to the pump's timezone in .env (e.g. "
            "TIMEZONE_NAME=America/Phoenix) or the environment, then retry.")
    logger.info("Fetching %s -> %s with TIMEZONE_NAME=%s", start, end, tz_name)

    try:
        from tconnectsync import secret
        from tconnectsync.api import TConnectApi
        from tconnectsync.sync.tandemsource.choose_device import ChooseDevice
    except ImportError as e:  # pragma: no cover - depends on the optional extra
        raise RuntimeError(
            "Live pull needs the 'sync' extra: install with "
            "`uv sync --extra sync` (or `pip install harmonic[sync]`)."
        ) from e

    from .credentials import load_credentials
    from .tandemsource_map import events_to_rows

    creds = load_credentials(store, key_path=key_path)
    if creds is None:
        raise RuntimeError(
            "t:connect credentials are not configured. Create a .env with "
            "TCONNECT_EMAIL and TCONNECT_PASSWORD (see .env.example), or "
            "store credentials via the API's /credentials endpoint."
        )

    # Keep JWTs/tokens out of tconnectsync's on-disk pickle: the Fernet store is
    # the only place credentials should live. The read/write guards live in the
    # tandemsource module, which binds CACHE_CREDENTIALS by value at its import
    # (`from ..secret import CACHE_CREDENTIALS`), so setting `secret.*` here would
    # be a no-op — override the name where it is actually consulted. Cost is a
    # fresh login each fetch, which the hourly loop effectively does anyway.
    from tconnectsync.api import tandemsource as _tandemsource_api
    _tandemsource_api.CACHE_CREDENTIALS = False

    tconnect = TConnectApi(creds.email, creds.password, region or creds.region)
    device = ChooseDevice(secret, tconnect).choose()
    if not device:
        raise RuntimeError("No Tandem pump found on this t:connect account.")
    # Tandem's BFF pump list keys the pump-logs path segment as `assignmentId`
    # (a UUID) — it replaced the old numeric `tconnectDeviceId`. In tconnectsync
    # 3.0.0, `ChooseDevice.choose()` returns the raw `BffPump` dict, so we read
    # `assignmentId` directly (2.3.5 pre-normalized it to `deviceId`).
    device_id = device["assignmentId"]

    # Snapshot the *current* settings every fetch (append-only). Tandem exposes no
    # settings history or change event, so this forward-only log is the only way to
    # reconstruct ISF/I:C/target epochs (F1, ROADMAP §4). Best-effort: a settings
    # blob that can't be parsed must not sink an otherwise-good event pull.
    settings_written = _capture_settings_snapshot(store, device)

    # Fetch, map, and upsert each <=31-day window on its own so a later failure
    # keeps the windows that already landed (see _pull_windows). The one-time
    # settings snapshot is folded into the counts either way.
    try:
        written = _pull_windows(store, tconnect, device_id, start, end)
    except PartialFetchError as e:
        e.written["profile_settings"] = settings_written
        raise
    written["profile_settings"] = settings_written
    return written


def _pull_windows(store: Store, tconnect, device_id, start, end) -> Dict[str, int]:
    """Fetch → map → upsert each ``_date_windows`` window of ``[start, end]``.

    Accumulates the per-table counts into the ``_EVENT_TABLES`` return shape.
    Each window's rows are upserted before the next window is fetched, so if a
    later window raises, the earlier windows are already persisted (upserts are
    idempotent). In that case — at least one window completed — a
    :class:`PartialFetchError` is raised carrying the counts so far and how far
    the run got. A failure on the *first* window (nothing persisted) propagates
    as the raw error, an ordinary total failure.
    """
    from .tandemsource_map import events_to_rows

    written = {table: 0 for table in _EVENT_TABLES}
    windows = list(_date_windows(start, end))
    windows_total = len(windows)
    for windows_completed, (window_start, window_end) in enumerate(windows):
        try:
            events = tconnect.tandemsource.pump_events(
                device_id, window_start, window_end, fetch_all_event_types=True
            )
            rows = events_to_rows(events)
            window_counts = {
                "basal_events": store.upsert_basal(rows["basal"]),
                "bolus_events": store.upsert_bolus(rows["bolus"]),
                "cgm_readings": store.upsert_cgm(rows["cgm"]),
                "iob_events": store.upsert_iob(rows["iob"]),
                "pump_events": store.upsert_pump(rows["pump"]),
            }
        except Exception as e:
            if windows_completed == 0:
                raise  # nothing persisted yet — ordinary total failure
            raise PartialFetchError(
                e, written=written, windows_completed=windows_completed,
                windows_total=windows_total,
                failed_window=(window_start, window_end),
            ) from e
        # Only merge once the whole window succeeded, so `written` reflects
        # fully-completed windows.
        for table, count in window_counts.items():
            written[table] += count
    return written


def _capture_settings_snapshot(store: Store, device: dict) -> int:
    """Parse the active device's ``settings`` blob and append a snapshot.

    Returns the number of profile rows written (0 if the device carried no usable
    settings blob). Pure-core :func:`~ciq_autotune.settings.parse_pump_settings`
    does the unit-correct parsing; this only locates the blob and timestamps it.

    In tconnectsync 3.0.0, ``device["settings"]`` is the raw ``PumpSettingsEnvelope``
    ``{settingsHash, details}`` — the ``details`` blob (with ``profiles``,
    ``controlIqSettings``, …) that :func:`parse_pump_settings` expects lives at
    ``device["settings"]["details"]``, so we unwrap it here. (2.3.5's
    ``pump_metadata()`` used to pre-unwrap ``details``; 3.0.0's ``choose()`` no
    longer does.) A pump that has never uploaded carries no usable blob here.
    """
    from datetime import datetime

    from .settings import parse_pump_settings

    envelope = device.get("settings")
    raw = envelope.get("details") if envelope else None
    if not raw:
        return 0
    pump_settings = parse_pump_settings(raw)
    active = pump_settings.active()
    if active is not None and not active.segments:
        logger.warning(
            "Settings snapshot for IDP %d (%s) has no segments. "
            "Check that the BFF response includes timeDependentSegments.",
            active.idp, active.name,
        )
    captured_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return store.upsert_settings_snapshot(captured_at, pump_settings)
