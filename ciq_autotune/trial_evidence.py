"""The per-period breakdown the Verify workstation renders (#660).

One front door — :func:`trial_breakdown` — answering "what does one Trial's
Before period look like beside its Trial period?" in the four shapes the ★ LOCKED
Verify surface's data-bindings contract binds it to:

* **changes** — the engine-derived constituent settings diff ("what changed").
* **envelopes** — paired glucose-by-clock medians, the read Diagnose teaches.
* **meal_arcs** — the same read anchored on meals, for ``arc``-target Trials.
* **rescue** — the manual carb log (#125) counted per period.
* **day_rows** — the per-day accrual breakdown, and the day counts the pane
  header's ``DAYS a → b`` meta prints.

PORT: this is the locked mockup's capture script moved onto the store, which
is where the mock's header always said it belonged ("the scoped backend
extension ... derived here offline from the same snapshot"). Two deliberate
narrowings from the capture: the envelopes drop ``p25``/``p75`` (lock term 5
retired the quartile bands), and the day rows drop the capture's ``covered``
flag — a display-side 70%-coverage floor that contradicted the backend's own
``gap_count``. Gaps come from ``maturing.gap_count``, once.

PORT DEVIATION: a meal is :func:`_is_meal` here — the engine's own definition,
already used by this same detail's arc evidence and by the roster's ``arc``
maturity accrual — where the capture counted any bolus carrying carbs at all.
Two meal definitions inside one payload is the defect; the ``MEALS a → b`` meta
therefore reads a shade lower than the frozen mock render on the same data.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from .analyzers.scenario.anchors import _is_meal
from .settings import changelog, diff_profiles, resample_schedule

_DT_FMT = "%Y-%m-%d %H:%M:%S"

# The clock envelope's resolution: 48 half-hour bins, the grid Diagnose's own
# time-of-day read uses.
_CLOCK_BIN_MINUTES = 30
_CLOCK_BINS = 24 * 60 // _CLOCK_BIN_MINUTES

# The meal envelope's window: one hour before the bolus through four hours
# after, in quarter-hour bins.
_ARC_START_MINUTES = -60
_ARC_END_MINUTES = 240
_ARC_BIN_MINUTES = 15
_ARC_BINS = (_ARC_END_MINUTES - _ARC_START_MINUTES) // _ARC_BIN_MINUTES

# A profile switch is attributed from the change-log entries either side of the
# switch instant; snapshots are captured per fetch, so the boundary is fuzzy by
# about a day. Same tolerance the roster's own profile matching uses.
_ATTRIBUTION_TOLERANCE = timedelta(days=1)

_SLOTS_PER_DAY = 48


def trial_breakdown(store, *, parameter: str, slot: Optional[str],
                    changed_at: datetime, target_metrics: Sequence[str],
                    before_period: dict, trial_period: dict,
                    before: Optional[float] = None,
                    after: Optional[float] = None,
                    block: Optional[Tuple[int, int]] = None) -> dict:
    """The Before-vs-Trial breakdown for one detected Trial.

    ``before_period`` / ``trial_period`` are the roster's own ``{"start", "end"}``
    bounds, so every read here is scoped to the same windows the rest of the
    detail reports — a period that has not accrued yet simply yields empty bins
    rather than borrowing observations from outside it.

    ``block`` is the block-bound I:C Trial's captured wrap-aware arc (#581). When
    given it is the *only* source of the meal-arc block — the durable identity read
    off the applied Plan provenance, never reconstructed from current settings, so
    a later profile repartition cannot silently move the arc under a live Trial.
    """
    periods = {"before_period": before_period, "trial_period": trial_period}
    spans = {key: _span(period) for key, period in periods.items()}
    outer_start = min(start for start, _ in spans.values())
    outer_end = max(end for _, end in spans.values())

    cgm = store.cgm_readings(start=outer_start, end=outer_end)
    bolus = store.bolus_events(start=outer_start, end=outer_end)
    carbs = store.carb_entries(start=outer_start, end=outer_end)
    snapshots = store.settings_snapshots()

    day_rows = {key: _day_rows(cgm, bolus, spans[key]) for key in periods}
    breakdown = {
        "changes": _constituent_changes(
            snapshots, parameter=parameter, slot=slot, changed_at=changed_at,
            before=before, after=after),
        "envelopes": {key: _clock_envelope(cgm, spans[key]) for key in periods},
        "rescue": {key: _rescue_counts(carbs, spans[key]) for key in periods},
        "day_rows": day_rows,
        "days": {key: len(rows) for key, rows in day_rows.items()},
    }
    if "arc" in target_metrics:
        # #581: a block-bound I:C Trial carries its captured arc; only fall back to
        # snapshot reconstruction for the legacy general-arc path (no captured block).
        if block is None and slot:
            block = _block_bounds(snapshots, changed_at, slot)
        breakdown["meal_arcs"] = {
            "block": list(block) if block else None,
            **{key: _meal_envelope(cgm, bolus, spans[key], block) for key in periods},
        }
    return breakdown


# --- what changed ------------------------------------------------------------


def _constituent_changes(snapshots, *, parameter: str, slot: Optional[str],
                         changed_at: datetime, before: Optional[float],
                         after: Optional[float]) -> List[dict]:
    """The Trial's settings diff, one row per constituent parameter.

    A single-parameter Trial already carries its own pair. A ``profile`` Trial is
    a switch between two whole profiles, so it is attributed with the engine's own
    machinery: an ``active_idp`` switch diffs the outgoing against the incoming
    profile (:func:`diff_profiles`, #331), and an in-place edit falls back to the
    change-log entries at the boundary.
    """
    if parameter != "profile":
        return [{"parameter": parameter, "slot": slot,
                 "before": before, "after": after}]

    by_parameter: Dict[str, dict] = {}
    for change in changelog(snapshots):
        if abs(change.at - changed_at) > _ATTRIBUTION_TOLERANCE:
            continue
        if change.parameter == "active_idp":
            snapshot = next(
                (s for s in sorted(snapshots, key=lambda s: s.captured_at)
                 if s.captured_at == change.at), None)
            if snapshot is None:
                continue
            old = snapshot.settings.by_idp(change.old_schedule)
            new = snapshot.settings.by_idp(change.new_schedule)
            if old is None or new is None:
                continue
            for moved in diff_profiles(old, new):
                by_parameter[moved.parameter] = _slot_diff(
                    moved.parameter, old.schedule(moved.parameter),
                    new.schedule(moved.parameter))
        else:
            by_parameter.setdefault(change.parameter, _slot_diff(
                change.parameter, change.old_schedule, change.new_schedule))
    return [row for row in by_parameter.values() if row["slots_changed"]]


def _slot_diff(parameter: str, old_schedule, new_schedule) -> dict:
    """One parameter's move, resampled onto the shared 30-min slot grid.

    ``slots_changed`` is how much of the day moved (the surface reads ≥40 as
    "all day"); ``uniform`` says whether every changed slot took the same
    old→new pair, and when it did not, ``before``/``after`` carry the first
    changed slot's pair so the row still prints a real number beside "varies".
    """
    old_grid = resample_schedule(old_schedule)
    new_grid = resample_schedule(new_schedule)
    moved = [i for i in range(_SLOTS_PER_DAY) if old_grid[i] != new_grid[i]]
    pairs = {(old_grid[i], new_grid[i]) for i in moved}
    first = moved[0] if moved else 0
    value_before, value_after = (
        next(iter(pairs)) if len(pairs) == 1 else (old_grid[first], new_grid[first]))
    return {
        "parameter": parameter,
        "slot": "%02d:%02d" % (first // 2, first % 2 * 30),
        "slots_changed": len(moved),
        "uniform": len(pairs) <= 1,
        "before": value_before,
        "after": value_after,
    }


# --- the paired envelopes ----------------------------------------------------


def _clock_envelope(cgm, span: Tuple[datetime, datetime]) -> List[dict]:
    """Glucose by time of day across one period: 48 half-hour median bins."""
    start, end = span
    bins: List[List[float]] = [[] for _ in range(_CLOCK_BINS)]
    for reading in cgm:
        if reading.bg is None or not (start <= reading.t < end):
            continue
        bins[(reading.t.hour * 60 + reading.t.minute) // _CLOCK_BIN_MINUTES].append(reading.bg)
    return [_bin_row("%02d:%02d" % (i // 2, (i % 2) * 30), values)
            for i, values in enumerate(bins)]


def _meal_envelope(cgm, bolus, span: Tuple[datetime, datetime],
                   block: Optional[Tuple[int, int]]) -> dict:
    """Glucose by minutes since a carb bolus across one period.

    ``block`` restricts the anchors to meals bolused inside the Trial's own I:C
    block, so a slot-scoped Trial reads the meals its change could have touched.
    """
    start, end = span
    meals = [dose.t for dose in bolus
             if start <= dose.t < end and _is_meal(dose)
             and (block is None or _in_block(dose.t, block))]
    readings = [(r.t, r.bg) for r in cgm if r.bg is not None and start <= r.t < end]
    bins: List[List[float]] = [[] for _ in range(_ARC_BINS)]
    for meal in meals:
        for t, bg in readings:
            offset = (t - meal).total_seconds() / 60
            if _ARC_START_MINUTES <= offset < _ARC_END_MINUTES:
                bins[int((offset - _ARC_START_MINUTES) // _ARC_BIN_MINUTES)].append(bg)
    return {
        "n_meals": len(meals),
        "bins": [_bin_row(_ARC_START_MINUTES + i * _ARC_BIN_MINUTES, values)
                 for i, values in enumerate(bins)],
    }


def _bin_row(t, values: List[float]) -> dict:
    """One envelope bin: its label, its median, and how much it rests on.

    ``n`` is load-bearing, not diagnostic — the surface drops empty bins, so a
    period with no observations draws no line rather than a flat one at zero.
    """
    row = {"t": t, "n": len(values)}
    if values:
        row["med"] = round(statistics.median(values))
    return row


def _in_block(when: datetime, block: Tuple[int, int]) -> bool:
    """Whether a wall-clock instant falls inside an I:C block that may wrap midnight."""
    start, end = block
    return (when.hour * 60 + when.minute - start) % 1440 < end - start


def _block_bounds(snapshots, changed_at: datetime,
                  slot: str) -> Optional[Tuple[int, int]]:
    """The I:C block containing ``slot`` in the profile active at the change.

    Read off the real segment boundaries rather than a fixed grid, so the block
    the surface names is the one the pump actually runs; the end wraps past
    midnight for a final segment.
    """
    candidates = [s for s in snapshots if s.captured_at <= changed_at]
    snapshot = (max(candidates, key=lambda s: s.captured_at) if candidates
                else max(snapshots, key=lambda s: s.captured_at, default=None))
    if snapshot is None:
        return None
    schedule = sorted(snapshot.settings.active_schedule("carb_ratio"))
    if not schedule:
        return None
    slot_minutes = int(slot[:2]) * 60 + int(slot[3:5])
    starts = [minutes for minutes, _ in schedule]
    start = max((m for m in starts if m <= slot_minutes), default=starts[-1])
    later = [m for m in starts if m > start]
    return start, (later[0] if later else starts[0] + 1440)


# --- rescue carbs and per-day accrual ----------------------------------------


def _rescue_counts(carbs, span: Tuple[datetime, datetime]) -> dict:
    """The manual carb log (#125) inside one period.

    Counted, never modelled: this is the user's own unbolused-carb stream, and
    the surface prints it beside the outcomes as context for them, not as an
    input to anything.
    """
    start, end = span
    inside = [entry for entry in carbs if start <= entry.t < end]
    return {
        "n": len(inside),
        "grams": round(sum(entry.grams or 0 for entry in inside)),
        "n_unknown": sum(1 for entry in inside if entry.certainty == "unknown"),
        "n_low_prompt": sum(1 for entry in inside if entry.source == "low-prompt"),
    }


def _day_rows(cgm, bolus, span: Tuple[datetime, datetime]) -> List[dict]:
    """Per-day accrual across one period, one row per calendar day it touches.

    Deliberately carries no coverage verdict: whether a day counts as a gap is
    the roster's call (``maturing.gap_count``), and a second floor here would be
    a display-side rule contradicting it — the #273 lesson applied to display.
    """
    start, end = span
    rows: Dict[str, dict] = {}
    day = start.date()
    last = end.date()
    while day <= last:
        rows[day.isoformat()] = {"date": day.isoformat(), "n_readings": 0,
                                 "n_in_range": 0, "n_below": 0, "meals": 0}
        day += timedelta(days=1)
    for reading in cgm:
        row = rows.get(reading.t.date().isoformat())
        if row is None or reading.bg is None or not (start <= reading.t < end):
            continue
        row["n_readings"] += 1
        if 70 <= reading.bg <= 180:
            row["n_in_range"] += 1
        elif reading.bg < 70:
            row["n_below"] += 1
    for dose in bolus:
        row = rows.get(dose.t.date().isoformat())
        if row is not None and start <= dose.t < end and _is_meal(dose):
            row["meals"] += 1
    for row in rows.values():
        n = row["n_readings"]
        row["tir"] = round(100.0 * row["n_in_range"] / n, 1) if n else None
        row["tbr"] = round(100.0 * row["n_below"] / n, 1) if n else None
    return list(rows.values())


def _span(period: dict) -> Tuple[datetime, datetime]:
    return (datetime.strptime(period["start"], _DT_FMT),
            datetime.strptime(period["end"], _DT_FMT))
