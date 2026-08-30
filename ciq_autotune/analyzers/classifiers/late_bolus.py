"""Late-bolus instance classifier (#71) — the foundation classifier of epic #70.

Judges **one** meal bolus: was it given *late* — into a real, from-flat meal rise
that a pre-bolus would have blunted — or was the pre-bolus rise actually the tail
of an observable upstream event (a rescued low, a defensive suspend) that a bolus
could not and should not have pre-empted?

The old ``not_pre_bolusing`` detector flagged *any* meal bolus given while the
20-min pre-bolus CGM slope cleared ~1 mg/dL/min, with **no notion of why** BG was
rising. On real data that over-flagged a rescue-rebound case: a low bottomed out
after a defensive suspend, was treated, and overshot; the meal bolus given at
eating time was accused of being late into the rescue rebound. This classifier
fixes that by running the **shared context gate** (:mod:`.context_gate`) before
ever calling a bolus late.

Pure function, no I/O, no registry — the scenario engine (#70) does the wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ...model import CgmSeries
from ..scenario_config import ScenarioConfig
from .context_gate import GateResult, upstream_cause
from .evidence import EvidenceTier, SilenceReason, Verdict

# The rising-slope / slope-lookback / high-start thresholds, the prior-carb-bolus
# lookback (#167), and the CGM staleness guard now live on ``ScenarioConfig`` (the
# ``late_bolus_*`` and shared ``cgm_max_stale_min`` fields). ``high_start`` is set
# well *above* the 180 range line (#117): a first pass gated at 180 suppressed ~10-12
# genuine near-range late boluses, while the cases this gate exists for (a meal
# stacking onto a prior undercount) start much higher.


def _owning_prior_carb_bolus(
    meal: BolusEvent,
    bolus_events: Sequence[BolusEvent],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Optional[BolusEvent]:
    """The most recent completed carb bolus that owns ``meal``'s pre-bolus rise.

    Qualifying prior bolus (#167): a **completed** bolus (``completion ==
    "Completed"``) carrying carbs (``carbs`` present and > 0), timestamped strictly
    before ``meal`` and within ``late_bolus_prior_carb_bolus_lookback_min`` minutes of
    it, and not ``meal`` itself. Requiring carbs naturally excludes Control-IQ automatic
    boluses (they carry none) — no separate automatic-bolus check needed.

    Returns the latest such bolus (closest to the meal), or ``None`` when the day's
    ``bolus_events`` hold none — which reproduces today's behavior.
    """
    window_start = meal.t - timedelta(
        minutes=scenario_config.late_bolus_prior_carb_bolus_lookback_min
    )
    owner: Optional[BolusEvent] = None
    for b in bolus_events:
        if b is meal:
            continue
        if b.completion != "Completed":
            continue
        if b.carbs is None or b.carbs <= 0:
            continue
        if not (window_start <= b.t < meal.t):
            continue
        if owner is None or b.t > owner.t:
            owner = b
    return owner


@dataclass(frozen=True)
class LateBolusVerdict(Verdict):
    """A :class:`Verdict` for the late-bolus judgment, with the shape it rests on.

    * ``matched`` — True iff this meal bolus was genuinely late (into a real
      from-flat rise the gate could not explain).
    * ``pre_bolus_slope`` — the fitted pre-bolus CGM slope (mg/dL/min), or ``None``
      when the window was too sparse to judge.
    * ``pre_bolus_bg`` — the CGM reading nearest the bolus (mg/dL), or ``None``
      when no reading is close enough.
    * ``gate`` — the context-gate result, so a caller can see *what* explained the
      rise when ``matched`` is False.
    """

    pre_bolus_slope: Optional[float] = None
    pre_bolus_bg: Optional[float] = None
    gate: Optional[GateResult] = None


def classify_late_bolus(
    meal: BolusEvent,
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    bolus_events: Sequence[BolusEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> LateBolusVerdict:
    """Was ``meal`` bolused late into a real meal rise?

    Judges a single meal bolus against its CGM/basal context:

    1. Fit the pre-bolus CGM slope over the ``slope_lookback_min`` window ending at
       the bolus. Too sparse to fit → **not late** (can't judge; ``NOT_IN_DATA``).
    2. Slope at/under ``rising_slope`` → BG was ~flat, the bolus led the rise →
       **not late** (``OBSERVED`` — the flat pre-bolus curve is a hard fact).
    3. Slope rising, but the **context gate** finds an observable upstream cause (a
       recent low and/or a defensive suspend) → the rise is a recovery, not a meal
       climb → **not late** (``INFERRED`` — the gate's trigger is observed, but
       attributing the rise to it rather than to a meal is a shape inference).
    4. Slope rising, gate finds nothing, but a **completed carb bolus** landed
       within :data:`PRIOR_CARB_BOLUS_LOOKBACK_MIN` minutes before this one → the
       rise is owned by that earlier dose's fast-carb excursion, still in flight,
       not a from-flat meal climb → **not late** (``INFERRED`` — the prior bolus row
       is observed, but attributing *this* rise to it is a shape inference; #167).
    5. Slope rising, gate/prior-bolus find nothing, but BG at the bolus is already
       above ``HIGH_START_MGDL`` (clearly high, not merely near-range) → the rise is
       from an already-high baseline (prior undercount, bad-BG day), not a
       from-flat meal spike a pre-bolus could have blunted → **not late**
       (``OBSERVED`` — the BG reading is a hard fact).
    6. Slope rising, start not clearly high, gate/prior-bolus find nothing →
       **late** into a real from-flat (or near-range) rise (``INFERRED``).

    ``bolus_events`` is the day's bolus sequence, threaded through so step 4 can see
    a preceding carb dose; it defaults to empty, which reproduces the pre-#167
    behavior (steps 1-3, 5-6 only). Returns a :class:`LateBolusVerdict`. Never
    asserts rescue carbs — it gates on the observable low/suspend (ADR 0003).
    """
    rising_slope = scenario_config.late_bolus_rising_slope_mgdl_min
    slope_lookback_min = scenario_config.late_bolus_slope_lookback_min
    series = CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    slope = series.slope(meal.t, timedelta(minutes=slope_lookback_min))
    bg_at_bolus = series.nearest(meal.t)

    if slope is None:
        return LateBolusVerdict(
            matched=False,
            detail="not enough CGM around the bolus to judge whether it was late",
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
            pre_bolus_slope=None,
            pre_bolus_bg=bg_at_bolus,
            gate=None,
        )

    if slope <= rising_slope:
        return LateBolusVerdict(
            matched=False,
            detail=(
                f"glucose was ~flat ({slope:.1f} mg/dL/min) before the bolus — the "
                "dose led the rise"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            pre_bolus_slope=slope,
            pre_bolus_bg=bg_at_bolus,
            gate=None,
        )

    gate = upstream_cause(meal.t, cgm_readings, basal_events)
    if gate.explained:
        return LateBolusVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min before the bolus, but "
                f"{gate.detail} — not a late meal bolus"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            pre_bolus_slope=slope,
            pre_bolus_bg=bg_at_bolus,
            gate=gate,
        )

    prior = _owning_prior_carb_bolus(meal, bolus_events, scenario_config=scenario_config)
    if prior is not None:
        mins_before = (meal.t - prior.t).total_seconds() / 60.0
        return LateBolusVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min before the bolus, but a "
                f"carb bolus ({prior.carbs:.0f} g) {mins_before:.0f} min earlier is "
                "still absorbing — this rise is owned by that earlier dose, not a "
                "late meal bolus"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.OWNED_BY_PRIOR_BOLUS,
            pre_bolus_slope=slope,
            pre_bolus_bg=bg_at_bolus,
            gate=gate,
        )

    if bg_at_bolus is not None and bg_at_bolus > scenario_config.late_bolus_high_start_mgdl:
        return LateBolusVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min before the bolus, but BG "
                f"was already {bg_at_bolus:.0f} mg/dL (clearly high) at bolus time — "
                "rise is from a prior high baseline, not a from-flat meal spike"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.PRIOR_HIGH_BASELINE,
            pre_bolus_slope=slope,
            pre_bolus_bg=bg_at_bolus,
            gate=None,
        )

    return LateBolusVerdict(
        matched=True,
        detail=(
            f"glucose was already rising {slope:.1f} mg/dL/min before the bolus, with "
            "no recent low or suspend to explain it — bolusing ~15 min before eating "
            "would blunt the spike"
        ),
        evidence_tier=EvidenceTier.INFERRED,
        pre_bolus_slope=slope,
        pre_bolus_bg=bg_at_bolus,
        gate=gate,
    )
