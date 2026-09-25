"""Carb-undercount instance classifier (#76, epic #70) — a NEW signal.

Judges **one** meal (ADR 470: its first bolus plus its same-meal top-ups) that ran
away high *despite* being dosed: were the carbs badly undercounted? This is the
single highest-value insight of the real-data pass (#70) and the one shape **no
existing detector emits** — the case where BG ran away high on a modest logged carb
count for a heavily underestimated restaurant meal had no wire to fire on.

The judgment, per the epic's lever taxonomy: a meal that ran away high with an
**implied I:C far looser than the programmed one** is a carb undercount. We infer
the carbs that *would* explain the runaway and compare to what was logged.

    implied_correction_u = (peak_bg - baseline_bg) / isf     # the insulin the
                                                             # runaway still owed
    implied_insulin_u    = meal_dose + implied_correction_u  # what the meal needed
    implied_carbs        = implied_insulin_u * meal.carb_ratio  # dose-stamped I:C

This reuses the exact ``(bg_error) / isf`` primitive :mod:`~ciq_autotune.analyzers.ic`
uses for its signed ``bg_outcome_u`` (an excursion → insulin-units read), just off
the *peak* of a runaway rather than a *settled* BG. A large gap between
``implied_carbs`` and the logged ``meal.carbs`` — either a big **ratio** or a big
**absolute** grams gap — is a carb undercount.

**Honesty (ADR 0003 / #70 §4).** The true carb count is invisible on Tandem Source
— carbs ride only on the bolus request, and the user's real estimate comes from
*knowing the food*, not from the curve. So the excursion-implied estimate is always
:data:`~...evidence.EvidenceTier.INFERRED`, hedged ("implied ~150 g vs 30 g
logged"), **never asserted**. And a runaway that is actually a rebound off a recent
low / defensive suspend is not a meal at all — the shared :func:`upstream_cause`
gate excludes it before we ever call it an undercount.

Pure function, no I/O, no registry — the scenario engine (#70) supplies ``isf``;
the historical I:C witness rides on ``meal.carb_ratio`` (this classifier never
projects today's profile backward).
"""

from __future__ import annotations

import bisect
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ...model import CgmSeries
from ..meals import Meal, next_meal_t
from ..scenario_config import ScenarioConfig
from .context_gate import GateResult, upstream_cause
from .evidence import EvidenceTier, SilenceReason, Verdict

# The undercount ratio / grams-gap / runaway-peak thresholds, the peak look-ahead,
# and the CGM staleness guard now live on ``ScenarioConfig`` (the ``carb_undercount_*``
# and shared ``cgm_max_stale_min`` fields).


@dataclass(frozen=True)
class CarbUndercountVerdict(Verdict):
    """A :class:`Verdict` for the carb-undercount judgment, with the shape behind it.

    * ``matched`` — True iff this meal ran away high with an implied carb load far
      above what was logged (and no upstream low/suspend explains the rise).
    * ``implied_carbs`` — the carbs the excursion implies were eaten (``INFERRED``;
      never the true count). ``None`` when the meal couldn't be judged.
    * ``logged_carbs`` — what the bolus actually carried (observed).
    * ``peak_bg`` / ``baseline_bg`` — the runaway the inference rests on.
    * ``gate`` — the context-gate result, so a caller can see when a "runaway" was
      really a rebound off a low/suspend (``matched`` False).
    """

    implied_carbs: Optional[float] = None
    logged_carbs: Optional[float] = None
    peak_bg: Optional[float] = None
    baseline_bg: Optional[float] = None
    gate: Optional[GateResult] = None


def _peak_after(series: CgmSeries, start, end) -> Optional[float]:
    """The highest CGM value in ``(start, end]``, or ``None`` if empty."""
    lo = bisect.bisect_right(series.times, start)
    hi = bisect.bisect_right(series.times, end)
    vals = series.values[lo:hi]
    return max(vals) if vals else None


def _owned_window_end(
    meal: Meal | BolusEvent,
    bolus_events: Sequence[BolusEvent],
    *,
    scenario_config: ScenarioConfig,
) -> datetime:
    """When the excursion this meal *owns* ends — where its peak search must stop.

    The meal owns the excursion from its first bolus up to
    ``min(carb_undercount_peak_lookahead_min, the next meal's first bolus)``, the next
    meal as :func:`~..meals.group_meals` forms it (ADR 470). Its own top-ups inside the
    same-meal grace are members, so they never self-cap the window (ADR 0030).

    Capping here — not on the CGM shape — keeps the read to observable logged carb
    boluses (ADR 0008): where a later meal owns the peak, the cap truncates only the
    part of the excursion that belongs to someone else. With no meal after it (the
    common case, and an empty ``bolus_events``), the window is the full look-ahead.
    """
    end = meal.t + timedelta(minutes=scenario_config.carb_undercount_peak_lookahead_min)
    following = next_meal_t(meal.t, bolus_events, scenario_config=scenario_config)
    return end if following is None else min(end, following)


def classify_carb_undercount(
    meal: Meal | BolusEvent,
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    bolus_events: Sequence[BolusEvent] = (),
    *,
    isf: Optional[float],
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> CarbUndercountVerdict:
    """Did ``meal`` run away high because the carbs were badly undercounted?

    ``meal`` is the :class:`~..meals.Meal` the engine passes (ADR 470); a unit test
    that hands one bolus gets a one-member meal's judgement. ``isf`` is the effective
    correction factor. I:C comes only from ``meal.carb_ratio``: the setting the pump
    stamped on the meal's first bolus. ``meal.carbs`` and ``meal.insulin`` are the
    logged carbs and delivered dose, summed over the meal's members.

    ``bolus_events`` is the day's bolus sequence (the engine's padded slice). It only
    bounds the peak search: the excursion read stops at the next meal so a meal never
    claims the next meal's spike (:func:`_owned_window_end`, ADR 0030, ADR 470). An
    empty sequence reads the full look-ahead — the common, no-later-meal case.

    The judgment:

    1. Missing settings, no logged carbs/dose, or too little CGM to read a baseline
       and a post-meal peak → **can't judge** (``NOT_IN_DATA``).
    2. Peak under ``runaway_peak`` → the meal did not run away → **not an
       undercount** (``OBSERVED`` — the in-range curve is a hard fact).
    3. Ran away, but the **context gate**, judged under ``scenario_config``, finds an
       observable upstream cause (a recent low and/or a defensive suspend) → the rise
       is a recovery, not a meal the bolus under-covered → **not an undercount**
       (``INFERRED``).
    4. Ran away from flat with no upstream cause: infer the carbs the excursion
       implies. Implied ≥ ``undercount_ratio`` × logged **or** implied − logged ≥
       ``undercount_gap_g`` → **carb undercount** (``INFERRED`` — the true carbs are
       invisible, ADR 0003; only the excursion is observed).

    Returns a :class:`CarbUndercountVerdict`. Never asserts the true carb count.
    """
    undercount_ratio = scenario_config.carb_undercount_ratio
    undercount_gap_g = scenario_config.carb_undercount_gap_g
    runaway_peak = scenario_config.carb_undercount_runaway_peak_mgdl
    logged = meal.carbs
    dose = meal.insulin
    meal_ic = meal.carb_ratio
    if (isf is None or isf <= 0 or meal_ic is None or meal_ic <= 0
            or logged is None or logged <= 0 or dose is None or dose <= 0):
        return CarbUndercountVerdict(
            matched=False,
            detail="missing carbs, dose, correction factor or carb ratio, so the carb count can't be judged",
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
            logged_carbs=logged,
        )

    series = CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    baseline = series.nearest(meal.t)
    # Read only the excursion this meal owns: from the bolus to the look-ahead horizon,
    # capped at the next meal so a meal never claims the next meal's spike (ADR 0030,
    # ADR 470).
    window_end = _owned_window_end(meal, bolus_events, scenario_config=scenario_config)
    peak = _peak_after(series, meal.t, window_end)
    if baseline is None or peak is None:
        return CarbUndercountVerdict(
            matched=False,
            detail="not enough CGM around the meal to read its excursion",
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
            logged_carbs=logged,
        )

    if peak < runaway_peak:
        return CarbUndercountVerdict(
            matched=False,
            detail=(
                f"the meal peaked at {peak:.0f} mg/dL and didn't run away, so the "
                "logged carbs look about right"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            logged_carbs=logged,
            peak_bg=peak,
            baseline_bg=baseline,
        )

    gate = upstream_cause(meal.t, cgm_readings, basal_events, scenario_config=scenario_config)
    if gate.explained:
        return CarbUndercountVerdict(
            matched=False,
            detail=(
                f"the meal ran to {peak:.0f} mg/dL, but {gate.detail}; the rise is a "
                "recovery, not an under-covered meal"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            logged_carbs=logged,
            peak_bg=peak,
            baseline_bg=baseline,
            gate=gate,
        )

    # The insulin the runaway still owed on top of the delivered dose, then the
    # carbs that whole insulin amount covers at the programmed ratio. Same
    # (bg_error)/isf → units → carbs primitive analyze_ic uses, off the peak.
    implied_correction = (peak - baseline) / isf
    implied_insulin = dose + implied_correction
    implied_carbs = implied_insulin * meal_ic

    ratio = implied_carbs / logged
    gap = implied_carbs - logged
    matched = ratio >= undercount_ratio or gap >= undercount_gap_g
    if not matched:
        return CarbUndercountVerdict(
            matched=False,
            detail=(
                f"peaked at {peak:.0f} mg/dL but the excursion implies only "
                f"~{implied_carbs:.0f} g vs {logged:.0f} g logged, within counting "
                "range"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UNDER_THRESHOLD,
            implied_carbs=round(implied_carbs, 1),
            logged_carbs=logged,
            peak_bg=peak,
            baseline_bg=baseline,
            gate=gate,
        )

    return CarbUndercountVerdict(
        matched=True,
        detail=(
            f"ran away to {peak:.0f} mg/dL despite the bolus; the excursion implies "
            f"~{implied_carbs:.0f} g vs {logged:.0f} g logged "
            f"({ratio:.1f}x), a likely carb undercount"
        ),
        evidence_tier=EvidenceTier.INFERRED,
        implied_carbs=round(implied_carbs, 1),
        logged_carbs=logged,
        peak_bg=peak,
        baseline_bg=baseline,
        gate=gate,
    )
