"""Raw event-stream slice for the Daily report's ECharts treatment timeline (#14).

A thin reader over the store — no analysis, just the CGM/bolus/basal rows in
``[start, end)`` shaped for the frontend's multi-grid chart. Parameterized by
an arbitrary window rather than a calendar day, so the same function can later
power a behavioral finding's "View occurrences" or an evidence-chart
click-through into a narrower slice of the same timeline.

Carb markers on the chart come from bolus-attached carbs (``bolus_events.carbs``),
which is where Tandem Source carries all carb data — via ``LidBolusRequestedMsg1``
paired with ``LidBolusCompleted``. The standalone ``LidCarbsEntered`` event (event 48)
is never emitted by the Tandem Source BFF (see ADR 0003).
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Tuple

from .carbs import carb_log_exclusion_spans
from .false_low import false_low_span_records
from .rest_window import RestWindowConfig, detect_rest_windows
from .settings import SleepSchedule, Snapshot
from .events import BasalEvent, BolusEvent
from .store import Store
from .tandemsource_map import _BASAL_GAP_CAP_MIN

_FMT = "%Y-%m-%d %H:%M:%S"


def _fmt(dt: datetime) -> str:
    return dt.strftime(_FMT)


def sleep_windows(schedules: Sequence[SleepSchedule], start: datetime,
                  end: datetime) -> List[Tuple[datetime, datetime]]:
    """Concrete sleep intervals overlapping ``[start, end)``, from the schedules.

    Each enabled schedule paints a window per day it is active on: from
    ``start_min`` on that day to ``end_min`` (the next day when the window wraps
    past midnight, e.g. 23:00 -> 09:00). Windows are clipped to ``[start, end)``
    so the caller gets exactly what falls inside the requested span. Computed here,
    in local wall-clock, so the frontend renders a band without any tz math.
    """
    out: List[Tuple[datetime, datetime]] = []
    # A window can begin the day before ``start`` and reach into it, so scan from
    # one day earlier through the last day the range touches.
    day = datetime(start.year, start.month, start.day) - timedelta(days=1)
    last = datetime(end.year, end.month, end.day)
    while day <= last:
        for sch in schedules:
            if day.weekday() not in sch.active_days:
                continue
            w_start = day + timedelta(minutes=sch.start_min)
            w_end = day + timedelta(minutes=sch.end_min)
            if sch.end_min <= sch.start_min:      # wraps past midnight
                w_end += timedelta(days=1)
            lo, hi = max(w_start, start), min(w_end, end)
            if lo < hi:
                out.append((lo, hi))
        day += timedelta(days=1)
    out.sort()
    return out


def _meal_units(b: BolusEvent) -> float:
    """The meal part of a user bolus's *delivered* insulin (ADR 492).

    The pump records the food and correction sizes it *requested*; the delivered
    dose is split in that same proportion, so a bolus cut short keeps its mix.
    With no recorded split (both absent or zero), a bolus with carbs is all meal
    and one without is all correction. The correction part is the remainder, so
    the two always add up to the delivered dose.
    """
    food = max(b.food_insulin or 0.0, 0.0)
    correction = max(b.correction_insulin or 0.0, 0.0)
    if food + correction > 0:
        return b.insulin * food / (food + correction)
    return b.insulin if b.carbs else 0.0


def insulin_totals(basal: Sequence[BasalEvent], boluses: Sequence[BolusEvent],
                   start: datetime, end: datetime,
                   programmed_before: Optional[float]) -> Optional[dict]:
    """The window's insulin in units: delivered basal, meal, correction and
    Control-IQ automatic boluses, which add up to ``total`` exactly as served, plus
    ``basal_programmed`` beside them and outside ``total`` (#492, ADR 492).

    ``basal`` is chronological and may start before ``start``; each row's delivered
    (``basal_rate``) and programmed (``profile_basal_rate``) rate count over the part
    of its own duration inside ``[start, end)``. A row with no programmed rate (the
    pump's suspension sentinel) carries the last one reported, seeded by
    ``programmed_before``; ``basal_programmed`` is ``None`` when no rate is known
    for an overlapping row. Boluses are those in the window with delivered insulin,
    filed by :attr:`~ciq_autotune.events.BolusEvent.is_automatic_bolus`; anything
    not tagged automatic is a user bolus split by :func:`_meal_units`. ``None`` when
    the window holds no basal and no delivered bolus.
    """
    delivered_basal = programmed_basal = 0.0
    programmed_known = True
    any_basal = False
    carried = programmed_before
    for e in basal:
        if e.profile_basal_rate is not None:
            carried = e.profile_basal_rate
        if not e.duration_mins:
            continue
        lo = max(e.t, start)
        hi = min(e.t + timedelta(minutes=e.duration_mins), end)
        if hi <= lo:
            continue
        any_basal = True
        hours = (hi - lo).total_seconds() / 3600.0
        delivered_basal += (e.basal_rate or 0.0) * hours
        if carried is None:
            programmed_known = False
        else:
            programmed_basal += carried * hours

    meal = correction = control_iq_bolus = 0.0
    delivered = [b for b in boluses if b.insulin]
    for b in delivered:
        if b.is_automatic_bolus is True:
            control_iq_bolus += b.insulin
        else:
            m = _meal_units(b)
            meal += m
            correction += b.insulin - m

    if not any_basal and not delivered:
        return None
    return {
        "basal": delivered_basal,
        "meal": meal,
        "correction": correction,
        "control_iq_bolus": control_iq_bolus,
        # Summed in the served order, so a reader adding the four parts left to
        # right gets this exact float.
        "total": delivered_basal + meal + correction + control_iq_bolus,
        "basal_programmed": programmed_basal if programmed_known else None,
    }


def timeline(
    store: Store,
    start: datetime,
    end: datetime,
    *,
    false_low_records: Optional[Sequence[dict]] = None,
    snaps: Optional[Sequence[Snapshot]] = None,
) -> dict:
    """Raw CGM/bolus/carb/basal events in ``[start, end)``.

    ``start``/``end`` are treated as local wall-clock instants, same as every
    other read path in :mod:`~ciq_autotune.store` — any tz offset on an
    incoming aware ``datetime`` (e.g. from the ``/api/timeline`` API, whose query
    params FastAPI parses as offset-aware-capable) is dropped, not converted,
    matching :func:`~ciq_autotune.store.normalize_time`.

    ``false_low_records`` and ``snaps`` are the two **window-invariant** inputs
    this function otherwise re-reads over the *whole* CGM/settings history on
    every call: the per-flag false-low excursion records
    (:func:`~ciq_autotune.false_low.false_low_span_records`, off the full CGM
    feed) and the settings snapshots. A caller that builds many timelines over
    one store — :func:`~ciq_autotune.analyzers.scenario.engine.build_scenarios`
    rebuilds a per-episode timeline 20+ times — computes these once and passes
    them in, saving one full-history CGM read per call (#426). Both default to
    ``None`` → computed in-line here, so the standalone ``/api/timeline`` path is
    unchanged. The false-low records are still clamped to ``[start, end)`` per
    call below; only the *record derivation* is hoisted.
    """
    if start.tzinfo is not None:
        start = start.replace(tzinfo=None)
    if end.tzinfo is not None:
        end = end.replace(tzinfo=None)
    start_s, end_s = _fmt(start), _fmt(end)
    cgm = store.cgm_readings(start_s, end_s)
    bolus = store.bolus_events(start_s, end_s)
    basal = store.basal_events(start_s, end_s)
    pump = store.pump_events(start_s, end_s)
    # A basal row starting before the window can reach into it by at most the
    # mapper's gap cap, so the insulin totals read that far back and clip.
    basal_lo = _fmt(start - timedelta(minutes=_BASAL_GAP_CAP_MIN))
    totals = insulin_totals(
        store.basal_events(basal_lo, end_s), bolus, start, end,
        store.latest_profile_basal_rate_before(basal_lo))

    # Sleep bands come from the Control-IQ sleep *schedule* (authoritative,
    # local wall-clock), not the flaky mode-change events in pump_events. The
    # snapshots are window-invariant, so a batch caller passes them in (#426).
    if snaps is None:
        snaps = store.settings_snapshots()
    schedules = snaps[-1].settings.sleep_schedules if snaps else ()
    sleep = sleep_windows(schedules, start, end)

    # Rest-window detection needs look-back/look-ahead beyond the returned span:
    # the morning fasting stretch visible on a day panel belongs to the night
    # anchored on the *previous* evening (a 22:00 → 08:00 envelope), which a
    # single-day 00:00–24:00 fetch never contains — starving the detector (#147,
    # regression from #136). So feed detect_rest_windows a *padded* CGM/bolus
    # slice: start − 4 h (reaches back past the prior evening's 22:00 anchor,
    # with CGM for its coverage gate) through end + the morning-envelope width
    # (the next morning's 08:00 edge). The returned cgm/bolus series and
    # start/end stay clamped to the requested day; the frontend clips windows to
    # the visible panel, so the wider detection input changes nothing downstream.
    _rw_cfg = RestWindowConfig()
    rest_lo = _fmt(start - timedelta(hours=4))
    rest_hi = _fmt(end + timedelta(minutes=_rw_cfg.env_end_min))
    rest = detect_rest_windows(
        store.cgm_readings(rest_lo, rest_hi),
        store.bolus_events(rest_lo, rest_hi),
    )

    # Carb-log exclusion spans for the rest-band display: the intervals an
    # unbolused Carb-log entry's COB covers. Computed over the same
    # padded window as rest detection so entries that straddle day boundaries are
    # captured, then clamped to the requested span before emission.
    carb_entries = store.carb_entries(rest_lo, rest_hi)
    _excl_raw = carb_log_exclusion_spans(carb_entries)
    carb_excl = [
        {"start": _fmt(max(lo, start)), "end": _fmt(min(hi, end))}
        for lo, hi in _excl_raw
        if lo < end and hi > start
    ]

    # False-low excursion spans (#381) for the Day chart's greyed sensor-artifact
    # render. Unlike the exclusion the tuning paths apply, this display path KEEPS the
    # readings (they stay drawn, greyed, so a misflag can be eyeballed and undone) and
    # only surfaces the span. Computed off the full CGM so the anchor's whole excursion
    # resolves, then clamped to the requested span. The record derivation reads the whole
    # CGM feed and is window-invariant, so a batch caller hoists it and passes it in
    # (#426); the per-window clamp below still runs every call.
    if false_low_records is None:
        false_low_records = false_low_span_records(
            store.cgm_readings(), store.prompt_responses())
    fl_records = false_low_records
    false_low_excl = [
        {"anchor_t": _fmt(rec["anchor_t"]),
         "start": _fmt(max(rec["start"], start)), "end": _fmt(min(rec["end"], end))}
        for rec in fl_records
        if rec["start"] < end and rec["end"] > start
    ]

    return {
        "start": start_s,
        "end": end_s,
        "cgm": [{"t": _fmt(r.t), "bg": r.bg} for r in cgm],
        # Bolus rows carry carbs directly (bolus_events.carbs, from the paired
        # LidBolusRequestedMsg1.carbAmount). The frontend builds carb chart markers
        # directly from this list — there is no separate carbs timeline array.
        # Standalone LidCarbsEntered (event 48) is never emitted by the Tandem
        # Source BFF; see ADR 0003.
        "boluses": [
            {"t": _fmt(b.t), "insulin": b.insulin, "carbs": b.carbs,
             "bg": b.bg, "extended": bool(b.extended)}
            for b in bolus if b.insulin
        ],
        # Suspend contract (#82): a Control-IQ defensive suspend is a
        # ``basal_rate == 0`` *run* of these rows (247 in the 30-day capture) —
        # NOT the ``delivery_type`` string, which carried the "control-iq
        # suspension" label on only 7 of them. Consumers (the frontend, the
        # scenario suspend beat) detect suspends as contiguous zero-rate runs;
        # a beat cites the run's first zero-rate ``t`` and the run extends over
        # the following zero rows. This is the supported contract; there is no
        # separate ``suspends[]`` array.
        "basal": [
            {"t": _fmt(e.t), "delivery_type": e.delivery_type,
             "duration_mins": e.duration_mins, "basal_rate": e.basal_rate,
             "profile_basal_rate": e.profile_basal_rate}
            for e in basal
        ],
        # Exercise bars + auto-suspend context for the daily report (#22), and
        # the Day chart's site changes: one "Site/Cartridge Change" per fill
        # sequence, as Store.pump_events joins them. Sleep comes from
        # sleep_windows.
        "pump_events": [
            {"t": _fmt(p.t), "event_type": p.event_type, "duration_mins": p.duration_mins}
            for p in pump
        ],
        # Concrete sleep intervals for the viewed span, from the CIQ sleep schedule.
        "sleep_windows": [{"start": _fmt(lo), "end": _fmt(hi)} for lo, hi in sleep],
        # Detected rest windows for the viewed span.
        # One per calendar night; the frontend clips to the visible day panel.
        "rest_windows": [{"start": _fmt(w.start), "end": _fmt(w.end)} for w in rest],
        # Carb-log COB-exclusion intervals (#202): spans unbolused Carb-log entries
        # cover. The frontend subtracts these from the rest-window band.
        "carb_exclusion_spans": carb_excl,
        # False-low excursions (#381): the Day chart greys these as sensor artifacts
        # (still drawn) with an inline undo. The readings stay in ``cgm`` above.
        "false_low_exclusion_spans": false_low_excl,
        # The window's insulin split in units for the Day screen's insulin bar
        # (#492): basal + meal + correction + control_iq_bolus == total, with the
        # programmed basal beside it. None for a window with no insulin data.
        "insulin_totals": totals,
    }
