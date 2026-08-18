"""Rest-window detector — behavioral sleep inference from bolus + CGM data.

Emits at most one permissive ``RestWindow`` per calendar night, inferred from
carb-bearing bolus absence and CGM edge-trimming.  Pure primitive; does NOT
read ``settings.sleep_schedules`` or ``pump_events`` "Sleep".  No Finding /
Lever / estimate — consumers (#108, #110) layer their own strictness.

Algorithm (locked per issue #109):
- Candidate span = last evening carb-bearing bolus → first morning carb-bearing
  bolus (bolus-absence spine).
- Clamped to a nocturnal envelope (default 22:00–08:00, configurable).
- CGM edge-trim: advance start past a post-dinner meal-shaped rise (≥30 mg/dL
  over ≈30 min); pull end back before a morning meal-shaped rise.
- Mid-night carb bolus splits the window; keep the longest sub-span ≥ 3 h.
- Require ≥ 50 % CGM coverage; else emit nothing.
- Minimum duration: 3 h.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from .events import BolusEvent, CgmReading


@dataclass(frozen=True)
class RestWindowConfig:
    # Nocturnal envelope — minutes past midnight on *each side* of midnight.
    # env_start_min is on the evening side (22:00 = 1320); env_end_min is on
    # the morning side (08:00 = 480).
    env_start_min: int = 1320   # 22:00
    env_end_min: int = 480      # 08:00

    # Meal-shaped rise threshold: ≥ rise_thr mg/dL over rise_window_min minutes
    # triggers an edge trim.
    rise_thr: float = 30.0
    rise_window_min: int = 30

    # Minimum window duration to emit.
    min_duration_h: float = 3.0

    # Minimum fraction of final window that must have CGM readings.
    min_cgm_coverage: float = 0.5

    # Maximum gap between consecutive CGM readings to count as covered
    # (a gap wider than this is not counted toward coverage).
    max_gap_min: float = 10.0


@dataclass(frozen=True)
class RestWindow:
    # Calendar date of the *evening* that starts this rest (e.g. 2024-01-15
    # for a window starting at 22:00 on Jan 15 and ending at 07:00 on Jan 16).
    date: date
    start: datetime
    end: datetime


def detect_rest_windows(
    cgm: Sequence[CgmReading],
    boluses: Sequence[BolusEvent],
    *,
    config: RestWindowConfig = RestWindowConfig(),
) -> List[RestWindow]:
    """Detect rest windows from CGM and bolus streams.

    Parameters
    ----------
    cgm:
        All CGM readings in the analysis period (unsorted OK).
    boluses:
        All bolus events (unsorted OK).
    config:
        Tunable constants; defaults match issue #109 locked spec.

    Returns
    -------
    list[RestWindow]
        At most one per calendar night, sorted chronologically.
    """
    cgm_sorted = sorted(cgm, key=lambda r: r.t)
    boluses_sorted = sorted(boluses, key=lambda b: b.t)

    carb_boluses = [b for b in boluses_sorted if b.carbs and b.carbs > 0]

    if not cgm_sorted and not carb_boluses:
        return []

    nights = _candidate_nights(cgm_sorted, carb_boluses, config)
    results: List[RestWindow] = []
    for night_date, raw_start, raw_end in nights:
        w = _process_night(night_date, raw_start, raw_end,
                           cgm_sorted, carb_boluses, config)
        if w is not None:
            results.append(w)

    return results


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _env_start(d: date, config: RestWindowConfig) -> datetime:
    """Evening envelope start on calendar date *d* (e.g. 22:00 on day d)."""
    return datetime(d.year, d.month, d.day) + timedelta(minutes=config.env_start_min)


def _env_end(d: date, config: RestWindowConfig) -> datetime:
    """Morning envelope end on the day *after* calendar date *d*."""
    next_day = d + timedelta(days=1)
    return datetime(next_day.year, next_day.month, next_day.day) + timedelta(minutes=config.env_end_min)


def _candidate_nights(
    cgm_sorted: List[CgmReading],
    carb_boluses: List[BolusEvent],
    config: RestWindowConfig,
) -> List[Tuple[date, datetime, datetime]]:
    """Return (night_date, candidate_start, candidate_end) tuples.

    night_date is the calendar date of the *evening*.  candidate_start /
    candidate_end are already clamped to the envelope.
    """
    # Collect all timestamps to bound the search range.
    all_ts: List[datetime] = []
    if cgm_sorted:
        all_ts += [cgm_sorted[0].t, cgm_sorted[-1].t]
    if carb_boluses:
        all_ts += [carb_boluses[0].t, carb_boluses[-1].t]
    if not all_ts:
        return []

    first_ts, last_ts = min(all_ts), max(all_ts)
    first_date = first_ts.date()
    last_date = last_ts.date()

    results = []
    d = first_date
    while d <= last_date:
        env_s = _env_start(d, config)
        env_e = _env_end(d, config)

        # Last carb-bearing bolus *before* the envelope start (evening anchor).
        # We look any time on that date or earlier.
        pre_boluses = [b for b in carb_boluses if b.t <= env_s]
        last_pre = pre_boluses[-1].t if pre_boluses else None

        # First carb-bearing bolus *after* the envelope end (morning anchor).
        post_boluses = [b for b in carb_boluses if b.t >= env_e]
        first_post = post_boluses[0].t if post_boluses else None

        # candidate start = max(last_pre, env_s) — if dinner was after envelope
        # start, push start to dinner time.
        cand_start = max(last_pre, env_s) if last_pre is not None else env_s
        # candidate end = min(first_post, env_e)
        cand_end = min(first_post, env_e) if first_post is not None else env_e

        # Only keep if the candidate is inside the envelope (clamped above) and
        # at least nominally positive duration.
        if cand_end > cand_start:
            results.append((d, cand_start, cand_end))

        d += timedelta(days=1)

    return results


def _cgm_in(cgm_sorted: List[CgmReading],
            start: datetime, end: datetime) -> List[CgmReading]:
    return [r for r in cgm_sorted if start <= r.t <= end]


def _detect_rise_start(readings: List[CgmReading],
                       config: RestWindowConfig) -> Optional[datetime]:
    """Return the *start* time of the first meal-shaped rise, or None.

    A meal-shaped rise = ≥ rise_thr mg/dL over ≈ rise_window_min minutes.
    We look for the *first* window start whose BG rise exceeds the threshold.
    """
    w = timedelta(minutes=config.rise_window_min)
    for i, r0 in enumerate(readings):
        # Find the reading closest to r0.t + rise_window_min.
        target = r0.t + w
        candidates = [r for r in readings[i:] if r.t <= target]
        if len(candidates) < 2:
            continue
        r_end = candidates[-1]
        if r0.bg is not None and r_end.bg is not None:
            if r_end.bg - r0.bg >= config.rise_thr:
                return r0.t
    return None


def _detect_rise_end(readings: List[CgmReading],
                     config: RestWindowConfig) -> Optional[datetime]:
    """Return the *end* time (latest reading) of the last meal-shaped rise, or None.

    Scans from the end backward; the *start* of the earliest trailing rise
    becomes the trim point (we pull end back to before the rise started).
    """
    w = timedelta(minutes=config.rise_window_min)
    # Scan backward for a rise that ends at or near the tail.
    for i in range(len(readings) - 1, -1, -1):
        r_end = readings[i]
        target = r_end.t - w
        candidates = [r for r in readings[:i+1] if r.t >= target]
        if len(candidates) < 2:
            continue
        r0 = candidates[0]
        if r0.bg is not None and r_end.bg is not None:
            if r_end.bg - r0.bg >= config.rise_thr:
                # Trim back to just before this rise started.
                return r0.t
    return None


def _cgm_coverage(readings: List[CgmReading],
                  start: datetime, end: datetime,
                  config: RestWindowConfig) -> float:
    """Fraction of [start, end] covered by CGM readings (gap-aware)."""
    span = (end - start).total_seconds()
    if span <= 0:
        return 0.0
    window_r = [r for r in readings if start <= r.t <= end]
    if not window_r:
        return 0.0
    max_gap = timedelta(minutes=config.max_gap_min)
    covered = timedelta()
    prev = start
    for r in window_r:
        gap = r.t - prev
        if gap <= max_gap:
            covered += gap
        prev = r.t
    # Trailing segment from last reading to end.
    gap = end - prev
    if gap <= max_gap:
        covered += gap
    return covered.total_seconds() / span


def _process_night(
    night_date: date,
    raw_start: datetime,
    raw_end: datetime,
    cgm_sorted: List[CgmReading],
    carb_boluses: List[BolusEvent],
    config: RestWindowConfig,
) -> Optional[RestWindow]:
    """Apply mid-night split, edge-trim, duration + coverage checks."""
    min_dur = timedelta(hours=config.min_duration_h)

    # Mid-night carb boluses split the window; keep the longest sub-span ≥ 3 h.
    interior_carbs = sorted(
        [b for b in carb_boluses if raw_start < b.t < raw_end],
        key=lambda b: b.t,
    )

    if interior_carbs:
        # Build sub-spans between split points.
        boundaries = [raw_start] + [b.t for b in interior_carbs] + [raw_end]
        sub_spans: List[Tuple[datetime, datetime]] = []
        for i in range(len(boundaries) - 1):
            s, e = boundaries[i], boundaries[i + 1]
            if e - s >= min_dur:
                sub_spans.append((s, e))
        if not sub_spans:
            return None
        # Keep the longest.
        span_start, span_end = max(sub_spans, key=lambda se: se[1] - se[0])
    else:
        span_start, span_end = raw_start, raw_end

    if span_end - span_start < min_dur:
        return None

    # CGM edge-trim.  Each trim scans only its own edge (2× rise_window_min),
    # so a morning rise doesn't accidentally fire the evening start-trim.
    edge = timedelta(minutes=config.rise_window_min * 2)

    # Advance start past a post-dinner meal-shaped rise (look at start edge).
    start_edge_cgm = _cgm_in(cgm_sorted, span_start, span_start + edge)
    rise_s = _detect_rise_start(start_edge_cgm, config)
    if rise_s is not None and rise_s > span_start:
        span_start = rise_s

    # Pull end back before a morning meal-shaped rise (look at end edge).
    end_edge_cgm = _cgm_in(cgm_sorted, span_end - edge, span_end)
    rise_e = _detect_rise_end(end_edge_cgm, config)
    if rise_e is not None and rise_e < span_end:
        span_end = rise_e

    window_cgm = _cgm_in(cgm_sorted, span_start, span_end)

    if span_end - span_start < min_dur:
        return None

    # CGM coverage gate.
    cov = _cgm_coverage(cgm_sorted, span_start, span_end, config)
    if cov < config.min_cgm_coverage:
        return None

    return RestWindow(date=night_date, start=span_start, end=span_end)
