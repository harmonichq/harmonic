"""Meal-bolus-fell-short instance classifier (#63, epic #70).

Judges **one** CGM-detected rise that :mod:`.missed_meal` has already declined: the
rise carries a *counted meal bolus* in its digestion window, so it is announced —
but it kept climbing anyway, and a correction was needed behind it. That pair (a
dose that was given, an outcome that still needed rescuing) is the whole claim:
**the meal dose did not cover what followed.**

**This is deliberately NOT carb undercount.** :mod:`.carb_undercount` asserts a
*quantified carb shortfall* — it runs implied-I:C inference and says the dose covered
fewer grams than the meal held. This classifier makes no claim about carbs at all: it
never infers grams, never reads I:C, and never implies an I:C adjustment. It says only
that the observed dose fell short of the observed outcome, and it points at the
correction as the evidence. Two different claims from two different mechanisms; keep
the copy on both sides so a reader can tell them apart at a glance.

The two exits of :func:`~.missed_meal.classify_missed_meal`'s digestion check are
mirror images by construction, which is what keeps the taxonomy clean: where a counted
meal bolus suppresses the missed-meal verdict ("this rise was announced"), this
classifier picks the rise up and asks whether the announcement was *enough*. The
window and the meal floor MUST therefore match missed-meal's — see the
``meal_bolus_short_*`` fields on :class:`~..scenario_config.ScenarioConfig`.

The rise and the correction are **observed** (a slope and a bolus row are hard feed
facts), but "the dose fell short" is a judgment laid over them, so a positive verdict
is ``INFERRED``. Measured on a 30-day window: of the 10 rising digestion-window highs
the missed-meal classifier declined, 7 took a correction bolus 9–83 min later.

Pure function, no I/O, no registry — the scenario engine (#70) does the wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ...model import _CgmSeries
from ..scenario_config import ScenarioConfig
from ..scenario.evidence_population import completed_carb_bolus
from .context_gate import GateResult, upstream_cause
from .evidence import EvidenceTier, SilenceReason, Verdict


@dataclass(frozen=True)
class MealBolusShortVerdict(Verdict):
    """A :class:`Verdict` for the meal-bolus-fell-short judgment.

    * ``matched`` — True iff a counted meal bolus sits in the digestion window, the
      rise continued anyway, and a correction followed inside the horizon.
    * ``rise_slope`` — the fitted CGM slope at the anchor (mg/dL/min), or ``None``
      when the window was too sparse to judge.
    * ``gate`` — the context-gate result (rebound check), or ``None`` when the
      classifier resolved before reaching the gate.
    * ``meal_t`` — the counted meal bolus whose dose is judged, once one is found.
    * ``correction_t`` — the correction bolus that evidences the shortfall, when one
      landed inside the horizon.
    * ``digestion_window_start`` — the start of the ``[anchor − digestion_lookback,
      anchor)`` span scanned for that meal bolus (the span the chart shades), set once
      the rise clears the slope + gate checks.
    """

    rise_slope: Optional[float] = None
    gate: Optional[GateResult] = None
    meal_t: Optional[datetime] = None
    correction_t: Optional[datetime] = None
    digestion_window_start: Optional[datetime] = None


def _most_recent_meal_in_window(
    bolus_events: Sequence[BolusEvent],
    window_start: datetime,
    anchor: datetime,
    min_carbs: float,
) -> Optional[BolusEvent]:
    """Most recent carb-tagged bolus in ``[window_start, anchor)``, or ``None``.

    Excludes the anchor itself for the same reason missed-meal does: a bolus at the
    rise onset has not had time to be the dose that fell short.
    """
    best: Optional[BolusEvent] = None
    for b in bolus_events:
        # The recurrence policy owns the eligible meal identity.  Keep the
        # classifier on that same population so a cancelled or zero-dose row can
        # neither attribute a high nor enter the denominator.
        if not completed_carb_bolus(b, scenario_config=ScenarioConfig(anchor_meal_min_carbs=min_carbs)):
            continue
        if window_start <= b.t < anchor and (best is None or b.t > best.t):
            best = b
    return best


def _first_correction_after(
    bolus_events: Sequence[BolusEvent],
    window_start: datetime,
    horizon_end: datetime,
    min_carbs: float,
    correction_floor_u: float,
) -> Optional[BolusEvent]:
    """The earliest carb-free bolus of real size in ``(window_start, horizon_end]``.

    Carb-free is what makes it a correction rather than the next meal: a dose carrying
    counted carbs is a new meal story and says nothing about the previous dose. The
    size floor keeps a rounding-scale dose from standing as evidence.

    The window **opens at the meal bolus** (past its dose-split grace), not at the rise
    onset. A person watching glucose climb corrects while it is still climbing, so the
    correction routinely lands BEFORE the high run the anchor sits on begins — scanning
    only forward from the onset would miss the ordinary case and keep the detector
    silent on exactly the rises it was built for.
    """
    best: Optional[BolusEvent] = None
    for b in bolus_events:
        if b.carbs is not None and b.carbs >= min_carbs:
            continue
        if b.insulin is None or b.insulin < correction_floor_u:
            continue
        if window_start < b.t <= horizon_end and (best is None or b.t < best.t):
            best = b
    return best


def classify_meal_bolus_short(
    anchor: datetime,
    cgm_readings: Sequence[CgmReading],
    bolus_events: Sequence[BolusEvent] = (),
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> MealBolusShortVerdict:
    """Did the meal dose behind the rise at ``anchor`` fall short of the outcome?

    Evaluates in order:

    1. Fit the CGM slope at ``anchor``. Too sparse → **not matched**
       (``NOT_IN_DATA`` / ``INSUFFICIENT_DATA``).
    2. Slope at/under ``rise_slope`` → BG is ~flat; nothing ran away from the dose →
       **not matched** (``OBSERVED`` / ``NO_TRIGGER``).
    3. The shared **context gate** finds a recent low or defensive suspend → the rise
       is a recovery, not a dose that fell short → **not matched** (``INFERRED`` /
       ``UPSTREAM_CAUSE``). This is what keeps a defensive-suspend rebound out (#63 D1).
    4. **No** counted meal bolus in the digestion window → there was no meal dose to
       fall short; that rise is missed-meal's to judge → **not matched** (``OBSERVED``
       / ``NO_TRIGGER``).
    5. No carb-free correction between the meal bolus (past its dose-split grace) and
       ``correction_horizon_min`` past the anchor → the shortfall was never
       corroborated, so it is not claimed → **not matched** (``OBSERVED`` /
       ``HORIZON_EXPIRED``).
    6. All four hold → **matched** (``INFERRED``): the dose did not cover what
       followed, evidenced by the correction that was needed.

    Returns a :class:`MealBolusShortVerdict`.
    """
    rise_slope = scenario_config.meal_bolus_short_rise_slope_mgdl_min
    slope_lookback_min = scenario_config.meal_bolus_short_slope_lookback_min
    digestion_lookback_min = scenario_config.meal_bolus_short_digestion_lookback_min
    meal_min_carbs = scenario_config.meal_bolus_short_min_carbs
    horizon_min = scenario_config.meal_bolus_short_correction_horizon_min
    correction_floor_u = scenario_config.meal_bolus_short_correction_floor_u
    split_grace_min = scenario_config.meal_bolus_short_dose_split_grace_min
    series = _CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    slope = series.slope(anchor, timedelta(minutes=slope_lookback_min))

    if slope is None:
        return MealBolusShortVerdict(
            matched=False,
            detail=(
                "not enough CGM data around the rise to judge whether the meal dose "
                "fell short"
            ),
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
        )

    if slope <= rise_slope:
        return MealBolusShortVerdict(
            matched=False,
            detail=(
                f"glucose was ~flat ({slope:.1f} mg/dL/min) — nothing ran away from "
                "the meal dose"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            rise_slope=slope,
        )

    gate = upstream_cause(anchor, cgm_readings, basal_events)
    if gate.explained:
        return MealBolusShortVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min, but {gate.detail} — "
                "the rise is a post-low/post-suspend recovery, not a meal dose that "
                "fell short"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            rise_slope=slope,
            gate=gate,
        )

    digestion_window_start = anchor - timedelta(minutes=digestion_lookback_min)
    meal = _most_recent_meal_in_window(
        bolus_events, digestion_window_start, anchor, meal_min_carbs
    )
    if meal is None:
        return MealBolusShortVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min with no counted meal bolus "
                f"in the prior {digestion_lookback_min} min — there was no meal dose "
                "to fall short"
            ),
            # NO_TRIGGER, not UNDER_THRESHOLD: the behavior needs a meal dose to be
            # about, and there wasn't one. An unannounced rise is missed-meal's claim.
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            rise_slope=slope,
            gate=gate,
            digestion_window_start=digestion_window_start,
        )

    horizon_end = anchor + timedelta(minutes=horizon_min)
    correction = _first_correction_after(
        bolus_events, meal.t + timedelta(minutes=split_grace_min), horizon_end,
        meal_min_carbs, correction_floor_u,
    )
    meal_min_ago = round((anchor - meal.t).total_seconds() / 60.0)
    if correction is None:
        return MealBolusShortVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min after a meal bolus "
                f"{meal_min_ago} min earlier, but no correction followed it — "
                "nothing corroborates a dose that fell short"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.HORIZON_EXPIRED,
            rise_slope=slope,
            gate=gate,
            meal_t=meal.t,
            digestion_window_start=digestion_window_start,
        )

    correction_min = round((correction.t - meal.t).total_seconds() / 60.0)
    return MealBolusShortVerdict(
        matched=True,
        detail=(
            f"glucose kept rising {slope:.1f} mg/dL/min despite a meal bolus "
            f"{meal_min_ago} min earlier, and a correction was needed "
            f"{correction_min} min after that dose — the meal dose did not cover "
            "what followed"
        ),
        evidence_tier=EvidenceTier.INFERRED,
        rise_slope=slope,
        gate=gate,
        meal_t=meal.t,
        correction_t=correction.t,
        digestion_window_start=digestion_window_start,
    )
