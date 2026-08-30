"""The brain: turn synced data into a suggested basal profile.

Pure analysis. Nothing here reads files or the network — it takes already-loaded
event lists (exactly what :class:`~ciq_autotune.store.Store` returns) and returns
a :class:`ProfileSuggestion`. That keeps it trivially testable and reusable from
the CLI today or a dashboard later.

The method:

1. Rebuild the delivered-basal timeline from the contiguous basal segments.
2. Keep only "clean" minutes — background insulin need and nothing else:
   reconstructed *bolus* insulin-on-board has decayed to ~0 (no meal/correction
   still acting), glucose is in range and flat, basal isn't suspended, and we're
   clear of site changes / suspensions / exercise. (Tandem Source has no dense
   IOB feed, so bolus IOB is computed from the bolus log — see ``insulin.py``.)
3. Bucket clean minutes into half-hour slots.
4. Median delivered basal per slot = the suggested rate. (One sample per clean
   minute, so the median is duration-weighted.) Median, not mean: CIQ's clean
   delivery is right-skewed — it adds corrective basal when glucose runs
   high-but-in-range, a long upper tail that is CIQ *working*, not baseline need.
   The mean chases that tail and over-suggests; the median tracks the typical
   maintenance rate.
5. Gate on confidence; thin slots get no suggestion rather than a guess.

Safety caps and the backtest live in Phase 3 (report.py), not here.
"""

from __future__ import annotations

import bisect
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

from .carbs import (
    CARB_ONSET_DELAY_MIN,
    CARB_TRAILING_GUARD_MIN,
    FAST_CARB_RATE_G_PER_H,
    MEAL_CARB_RATE_G_PER_H,
    CarbsOnBoard,
    carb_doses,
)
from .events import BasalEvent, BolusEvent, CarbEntry, CgmReading, PumpEvent
from .insulin import BolusIob

# Basal delivery_types that mean "no insulin / rail-pinned low", excluded.
_ZERO_DELIVERY = {"manual suspension", "algorithmDelivery (control-iq suspension)"}

# Basal delivery_type that reveals the user's programmed profile rate.
_PROFILE_DELIVERY = "profileDelivery"


@dataclass(frozen=True)
class ModelConfig:
    """Tunable knobs for the clean-window filter and confidence gating.

    Defaults target a Novolog/Humalog Control-IQ user.

    Insulin-curve knobs — ``insulin_peak_min`` (time to peak activity) and
    ``insulin_dia_min`` (duration of insulin action) — set how fast reconstructed
    bolus IOB decays and so how long after a bolus a minute is barred from the
    clean window. They are **per-user-calibratable**, not fixed constants:

    * Both are overridable via the constructor, the ``basal`` CLI (``--insulin-dia``
      / ``--insulin-peak``), and the whole analysis facade (``analyze(config=...)``).
    * DIA is the dominant **coverage** lever. The default is **180 min** — validated
      via ``dia-sweep`` as recovering the full daytime coverage gain (+14 slots) with
      no robust-slot drift past the noise floor (ADR 0004). The pump's programmed
      ``insulinDuration`` is Tandem's UI default (300 min / 5 h), which overstates how
      long a rapid analog actually acts and buries recoverable daytime coverage. Calibrate
      away from 180 against the user's own bolus response with ``dia-sweep``
      (:func:`~ciq_autotune.backtest.dia_sweep`), which reports coverage gained vs.
      estimate-drift as a function of DIA so a non-default value is validated, not guessed.
      See ADR 0004. Fiasp users would additionally lower ``insulin_peak_min``.
    * Constraint: ``0 < insulin_peak_min < insulin_dia_min / 2`` (the exponential
      IOB model in ``insulin.py``); the sweep clamps the peak below ``dia/2`` where a
      short DIA would otherwise violate it.

    ``bolus_clear_u`` is the residual bolus IOB at/below which a minute counts as
    bolus-free (near zero, since bolus-only IOB really does clear).
    """

    bolus_clear_u: float = 0.1
    insulin_peak_min: float = 75.0
    # Duration of insulin action, minutes. 180 is the validated rapid-analog default
    # (ADR 0004); the pump's programmed 300 min / 5 h overstates true pharmacokinetics.
    # Calibrate per user via `dia-sweep`; Fiasp users should also lower insulin_peak_min.
    insulin_dia_min: float = 180.0
    bg_low: float = 70.0
    bg_high: float = 180.0
    bg_max_stale_min: int = 10
    flat_slope_per_min: float = 0.5     # mg/dL/min over slope_window_min
    slope_window_min: int = 30
    event_margin_min: int = 60
    excluded_events: frozenset = field(default_factory=lambda: frozenset({
        "Site/Cartridge Change",
        "Empty Cartridge/Pump Shutdown",
        "User Suspended",
        "Exercise",
    }))
    slot_minutes: int = 30
    high_min_clean_minutes: int = 90
    high_min_days: int = 3
    med_min_clean_minutes: int = 30
    med_min_days: int = 2
    # Slope-guard knobs — protect against ±720 mg/dL/min artifacts from sparse CGM
    # clusters. CGM samples every 5 min so a genuine rate is O(1); two points 30 s
    # apart are physically impossible. Demand ≥ ``slope_min_points`` samples spread
    # over at least ``slope_min_span_frac`` of the slope window; otherwise the fit is
    # not trustworthy and the minute is skipped (same as a CGM gap).
    slope_min_points: int = 3
    slope_min_span_frac: float = 0.5
    # One-sided BG threshold — flag a slot when this fraction of its clean minutes
    # have BG above the window midpoint (bg_low + bg_high) / 2. Matches the empirical
    # fraction observed in the dawn band (06:00–08:30) during an internal data
    # review.
    onesided_bg_threshold: float = 0.65
    # Manual carb-log exclusion window (#125/#127). The clean-window filter never
    # consults carbs otherwise, so an unbolused snack sneaks into clean minutes
    # whenever BG stays in-range and flat-ish. The forward span is now grams-scaled
    # via a static forward-decay COB (ADR 0011 / #169): bar [t − back, clearance]
    # where clearance = onset + grams/rate + trailing guard.
    #
    # COB sees the **Carb-log stream only** — pump bolus carbs are intentionally NOT
    # fed here (do not "fix" without re-deriving). This filter already masks every
    # bolus via bolus IOB (DIA ~300 min), and under this decay curve bolus carbs
    # always clear before the insulin that covered them (75 g ≈ 4.7 h < 5 h DIA), so
    # bolus-carb COB would be strictly redundant. The ISF gate reaches the same
    # conclusion from the other side: feeding it bolus carbs collapsed the fit
    # (fasting ISF sharply lower on real data) by admitting the post-meal descent, so
    # it too masks boluses by insulin (its flat ~DIA carb-bolus lookback) and hands
    # COB the Carb-log stream only. Both consumers are symmetric; #169.
    #
    # The −15 back-buffer is kept (logging clock skew: a low treatment is often
    # logged a few minutes after eating it); only the old flat +120 forward is
    # replaced. Carb-log source keys the rate (rise-prompt → meal, low/manual →
    # fast). NULL-gram entries are never decayed (ADR 0011 §2) and keep the flat
    # [t − back, t + fwd] window below.
    carb_onset_min: float = CARB_ONSET_DELAY_MIN
    carb_guard_min: float = CARB_TRAILING_GUARD_MIN
    meal_carb_rate: float = MEAL_CARB_RATE_G_PER_H
    fast_carb_rate: float = FAST_CARB_RATE_G_PER_H
    carb_exclusion_back_min: int = 15
    carb_exclusion_fwd_min: int = 120

    def describe_gate(self) -> Dict:
        """Structured descriptor of the basal sufficiency gate (#95).

        A basal slot reaches its firmest tier (HIGH confidence, the directional
        recommendation) only with ≥ ``high_min_days`` distinct clean days, each
        contributing ≥ ``high_min_clean_minutes`` of clean-window delivery.
        Countdown unit is clean days. Every string interpolates this config's own
        constants, so the text cannot drift from the gate."""
        return {
            "unit": "clean days",
            "needed": self.high_min_days,
            "soft": False,
            "criteria": [
                f"≥{self.high_min_clean_minutes} clean minutes per day in the slot",
                f"≥{self.high_min_days} distinct clean days",
            ],
            "label": "clean days",
        }


@dataclass
class SlotSuggestion:
    slot: int
    label: str                       # "HH:MM"
    current: Optional[float]         # programmed profile rate, if recoverable
    suggested: Optional[float]       # None when confidence is LOW
    clean_minutes: int
    days: int                        # distinct calendar days contributing
    confidence: str                  # HIGH | MEDIUM | LOW


@dataclass
class ProfileSuggestion:
    slots: List[SlotSuggestion]
    span: Tuple[Optional[str], Optional[str]]
    config: ModelConfig


@dataclass
class CleanSample:
    """One clean minute and its delivered/as-of programmed basal."""
    t: datetime
    slot: int
    rate: float
    programmed_rate: Optional[float] = None


# --- time helpers -----------------------------------------------------------


def _slot_of(t: datetime, slot_minutes: int) -> int:
    return (t.hour * 60 + t.minute) // slot_minutes


def _slot_label(slot: int, slot_minutes: int) -> str:
    mins = slot * slot_minutes
    return f"{mins // 60:02d}:{mins % 60:02d}"


# --- index structures -------------------------------------------------------


class _BasalTimeline:
    """Contiguous delivered-basal segments; rate as of the segment covering t."""

    def __init__(self, events: List[BasalEvent]):
        segs = []
        for e in events:
            start = e.t
            dur = e.duration_mins or 0.0
            rate = 0.0 if e.delivery_type in _ZERO_DELIVERY else (e.basal_rate or 0.0)
            segs.append((start, start + timedelta(minutes=dur), rate,
                         e.profile_basal_rate))
        segs.sort(key=lambda seg: seg[0])
        self.starts = [s[0] for s in segs]
        self.ends = [s[1] for s in segs]
        self.rates = [s[2] for s in segs]
        self.programmed_rates = [s[3] for s in segs]

    def _index_at(self, t: datetime) -> Optional[int]:
        i = bisect.bisect_right(self.starts, t) - 1
        if i < 0 or t >= self.ends[i]:
            return None
        return i

    def at(self, t: datetime) -> Optional[float]:
        i = self._index_at(t)
        return self.rates[i] if i is not None else None

    def programmed_at(self, t: datetime) -> Optional[float]:
        i = self._index_at(t)
        return self.programmed_rates[i] if i is not None else None


class CgmSeries:
    # Default slope-guard parameters (mirror ModelConfig defaults). Callers that
    # don't have a ModelConfig (e.g. the behavioral classifiers in analyzers/) use
    # these class-level defaults; clean_samples() passes the live config values.
    _SLOPE_MIN_POINTS = 3
    _SLOPE_MIN_SPAN_FRAC = 0.5

    def __init__(
        self,
        readings: List[CgmReading],
        max_stale: timedelta,
        slope_min_points: Optional[int] = None,
        slope_min_span_frac: Optional[float] = None,
    ):
        pairs = sorted((r.t, r.bg) for r in readings if r.bg is not None)
        self.times = [p[0] for p in pairs]
        self.values = [p[1] for p in pairs]
        self.max_stale = max_stale
        # Instance-level slope-guard values; fall back to class defaults.
        self._slope_min_points = (
            slope_min_points if slope_min_points is not None else self._SLOPE_MIN_POINTS
        )
        self._slope_min_span_frac = (
            slope_min_span_frac if slope_min_span_frac is not None else self._SLOPE_MIN_SPAN_FRAC
        )

    def nearest(self, t: datetime) -> Optional[float]:
        i = bisect.bisect_left(self.times, t)
        best = None
        for j in (i - 1, i):
            if 0 <= j < len(self.times):
                d = abs(self.times[j] - t)
                if d <= self.max_stale and (best is None or d < best[0]):
                    best = (d, self.values[j])
        return best[1] if best else None

    def slope(self, t: datetime, window: timedelta) -> Optional[float]:
        """Least-squares slope (mg/dL per minute) over [t - window, t].

        Returns ``None`` (skip) when the window is too sparse to fit a trustworthy
        slope: fewer than ``slope_min_points`` samples (``ModelConfig.slope_min_points``,
        default 3), or a point span covering less than ``slope_min_span_frac``
        (``ModelConfig.slope_min_span_frac``, default 0.5) of the window.  This
        guards against the ±720 mg/dL/min artifacts a 2-point sparse cluster would
        otherwise emit.  A slope fit needs enough points across enough of the window
        to be real — CGM samples every 5 min, so a genuine rate is O(1); demand
        ≥ ``slope_min_points`` and a spread covering at least ``slope_min_span_frac``
        of the window; otherwise the data is too sparse/stale to trust and we return
        None (skip), same as a gap.
        """
        lo = bisect.bisect_left(self.times, t - window)
        hi = bisect.bisect_right(self.times, t)
        xs = [(self.times[k] - t).total_seconds() / 60.0 for k in range(lo, hi)]
        ys = [self.values[k] for k in range(lo, hi)]
        n = len(xs)
        if n < self._slope_min_points:
            return None
        span_min = xs[-1] - xs[0]
        if span_min < self._slope_min_span_frac * (window.total_seconds() / 60.0):
            return None
        mx = sum(xs) / n
        my = sum(ys) / n
        sxx = sum((x - mx) ** 2 for x in xs)
        if sxx == 0:
            return None
        sxy = sum((xs[k] - mx) * (ys[k] - my) for k in range(n))
        return sxy / sxx


class _ExcludedWindows:
    """Time spans (event +/- margin) where minutes can never be clean."""

    def __init__(self, pump_events: List[PumpEvent], excluded: frozenset, margin: timedelta):
        self.spans = []
        for e in pump_events:
            if e.event_type not in excluded:
                continue
            start = e.t
            dur = timedelta(minutes=e.duration_mins or 0.0)
            self.spans.append((start - margin, start + dur + margin))
        self.spans.sort()

    def contains(self, t: datetime) -> bool:
        return any(lo <= t <= hi for lo, hi in self.spans)


class _CarbExclusionWindows:
    """Spans around manual carb-log entries where minutes can never be clean.

    An unbolused snack (or low treatment) leaves no bolus IOB, so the clean-window
    filter would otherwise admit its in-range flat minutes as maintenance basal.

    The forward span is grams-scaled via a static forward-decay COB (ADR 0011 /
    #169): a minute ``t`` is barred while carbs are still on board plus a trailing
    guard — ``not cob.cleared_since(t, guard)`` — instead of a flat +120 min. The
    ``−back`` buffer (logging clock skew) is kept as an explicit span since COB is 0
    before a dose lands. Fed the **Carb-log stream only** (see the asymmetry note on
    ``ModelConfig.carb_exclusion_*``); ``source`` keys the decay rate.

    NULL-gram (``certainty='unknown'``) entries are never decayed (ADR 0011 §2):
    they drop out of the COB and keep the flat ``[t − back, t + fwd]`` window.
    """

    def __init__(self, carb_entries: List[CarbEntry], back: timedelta, fwd: timedelta,
                 *, onset_min: float, guard_min: float,
                 meal_rate: float, fast_rate: float):
        entries = carb_entries or []
        self._cob = CarbsOnBoard(
            carb_doses(carb_entries=entries, meal_rate=meal_rate, fast_rate=fast_rate),
            onset_min,
        )
        self._guard = guard_min
        # −back clock-skew buffer, for every entry (COB reads 0 before a dose lands).
        self._back_spans = sorted((c.t - back, c.t) for c in entries)
        # NULL-gram entries: never decayed, keep the flat forward window.
        self._flat_spans = sorted(
            (c.t - back, c.t + fwd) for c in entries if c.grams is None
        )

    def contains(self, t: datetime) -> bool:
        if any(lo <= t <= hi for lo, hi in self._back_spans):
            return True
        if not self._cob.cleared_since(t, self._guard):
            return True
        return any(lo <= t <= hi for lo, hi in self._flat_spans)


# --- programmed profile recovery -------------------------------------------


def _programmed_profile(events: List[BasalEvent], slot_minutes: int) -> Dict[int, float]:
    """Map slot -> programmed rate from profileDelivery segments (latest wins)."""
    profile: Dict[int, Tuple[datetime, float]] = {}
    for e in events:
        if e.delivery_type != _PROFILE_DELIVERY:
            continue
        start = e.t
        dur = e.duration_mins or 0.0
        rate = e.basal_rate
        # Walk the half-hour slots this segment touches.
        t = start
        end = start + timedelta(minutes=dur)
        step = timedelta(minutes=slot_minutes)
        while t < end:
            slot = _slot_of(t, slot_minutes)
            if slot not in profile or start > profile[slot][0]:
                profile[slot] = (start, rate)
            t += step
    return {slot: rate for slot, (_, rate) in profile.items()}


# --- the public entry point -------------------------------------------------


def data_span(basal_events: List[BasalEvent],
              cgm_readings: List[CgmReading]) -> Tuple[Optional[datetime], Optional[datetime]]:
    """First/last instant covered across the basal and CGM streams."""
    times = [e.t for e in basal_events] + [r.t for r in cgm_readings]
    if not times:
        return None, None
    return min(times).replace(second=0, microsecond=0), max(times)


def clean_samples(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    config: ModelConfig = ModelConfig(),
    *,
    carb_entries: Optional[List[CarbEntry]] = None,
) -> List[CleanSample]:
    """Every clean minute and the basal delivered during it.

    A minute is clean only if basal is flowing (not suspended/rail-pinned low),
    we're clear of excluded pump events, reconstructed *bolus* IOB has decayed to
    ``bolus_clear_u`` (so no meal/correction is still active), and glucose is in
    range and flat. This is the shared primitive behind both the profile
    suggestion and the backtest.

    ``carb_entries`` (#125/#127) are the manual unbolused-carb log. Because they
    carry no bolus IOB, the filter above can't see them — so each entry excludes a
    ``−back`` clock-skew buffer plus a grams-scaled forward span (static
    forward-decay COB, ADR 0011 / #169; NULL-gram entries keep the flat window).
    Pure exclusion: it only ever drops minutes, never adds them.
    """
    cfg = config
    timeline = _BasalTimeline(basal_events)
    bolus_iob = BolusIob(bolus_events, cfg.insulin_peak_min, cfg.insulin_dia_min)
    cgm = CgmSeries(
        cgm_readings,
        timedelta(minutes=cfg.bg_max_stale_min),
        slope_min_points=cfg.slope_min_points,
        slope_min_span_frac=cfg.slope_min_span_frac,
    )
    excluded = _ExcludedWindows(pump_events, cfg.excluded_events,
                                timedelta(minutes=cfg.event_margin_min))
    carb_excluded = _CarbExclusionWindows(
        carb_entries or [],
        timedelta(minutes=cfg.carb_exclusion_back_min),
        timedelta(minutes=cfg.carb_exclusion_fwd_min),
        onset_min=cfg.carb_onset_min,
        guard_min=cfg.carb_guard_min,
        meal_rate=cfg.meal_carb_rate,
        fast_rate=cfg.fast_carb_rate,
    )

    all_times = timeline.starts + cgm.times
    if not all_times:
        return []
    span_start = min(all_times).replace(second=0, microsecond=0)
    span_end = max(all_times)
    slope_window = timedelta(minutes=cfg.slope_window_min)

    samples: List[CleanSample] = []
    t = span_start
    minute = timedelta(minutes=1)
    while t <= span_end:
        rate = timeline.at(t)
        if (rate is not None and rate > 0 and not excluded.contains(t)
                and not carb_excluded.contains(t)):
            bg_now = cgm.nearest(t)
            if (bg_now is not None and cfg.bg_low <= bg_now <= cfg.bg_high
                    and bolus_iob.at(t) <= cfg.bolus_clear_u):
                slope = cgm.slope(t, slope_window)
                if slope is not None and abs(slope) <= cfg.flat_slope_per_min:
                    samples.append(CleanSample(
                        t, _slot_of(t, cfg.slot_minutes), rate,
                        timeline.programmed_at(t),
                    ))
        t += minute
    return samples


def suggest_basal_profile(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    config: ModelConfig = ModelConfig(),
) -> ProfileSuggestion:
    """Compute a suggested basal profile from clean delivered-basal minutes.

    ``bolus_events`` (Store.bolus_events) drives reconstructed bolus IOB: a recent
    meal/correction keeps bolus IOB above ``bolus_clear_u`` and so excludes its own
    window. CIQ's automatic corrections are in this stream too, so they exclude
    correctly.
    """
    cfg = config
    n_slots = 24 * 60 // cfg.slot_minutes
    samples = clean_samples(basal_events, cgm_readings, bolus_events, pump_events, cfg)
    programmed = _programmed_profile(basal_events, cfg.slot_minutes)

    rates_by_slot: Dict[int, List[float]] = {s: [] for s in range(n_slots)}
    days_by_slot: Dict[int, set] = {s: set() for s in range(n_slots)}
    for smp in samples:
        rates_by_slot[smp.slot].append(smp.rate)
        days_by_slot[smp.slot].add(smp.t.date())

    slots = []
    for s in range(n_slots):
        rates = rates_by_slot[s]
        clean_minutes = len(rates)
        days = len(days_by_slot[s])
        confidence = _confidence(clean_minutes, days, cfg)
        suggested = statistics.median(rates) if (confidence != "LOW" and clean_minutes) else None
        slots.append(SlotSuggestion(
            slot=s,
            label=_slot_label(s, cfg.slot_minutes),
            current=programmed.get(s),
            suggested=round(suggested, 3) if suggested is not None else None,
            clean_minutes=clean_minutes,
            days=days,
            confidence=confidence,
        ))

    start, end = data_span(basal_events, cgm_readings)
    span = (start.strftime("%Y-%m-%d %H:%M:%S") if start else None,
            end.strftime("%Y-%m-%d %H:%M:%S") if end else None)
    return ProfileSuggestion(slots=slots, span=span, config=cfg)


def _confidence(clean_minutes: int, days: int, cfg: ModelConfig) -> str:
    if clean_minutes >= cfg.high_min_clean_minutes and days >= cfg.high_min_days:
        return "HIGH"
    if clean_minutes >= cfg.med_min_clean_minutes and days >= cfg.med_min_days:
        return "MEDIUM"
    return "LOW"
