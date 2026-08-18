"""Missed-meal instance classifier (#72, epic #70).

Judges **one** CGM-detected rise: is it an unannounced / missed meal — a HIGH
with no insulin anywhere in the digestion window — or is it a false positive that
one of two observable causes explains away?

False positive A — **rebound rise** (post-low / post-suspend recovery): the
shared :func:`~.context_gate.upstream_cause` gate looks back 90 min for a recent
sub-70 nadir or a CIQ defensive-suspend episode. When either is found the rise is
a recovery, not a new meal.

False positive B — **meal-digestion tail**: a prior bolused meal is still driving
BG up; this rise is the *continuation* of that meal, not a new unannounced one.
Detected by scanning for any carb-tagged bolus within a ``digestion_lookback_min``
window (default 150 min ≈ 2.5 h) before the rise anchor. The acceptance case that
prompted this issue is a ~44-min gap from bolus to flagged rise; 150 min
comfortably covers it.

The rise itself is **observed** (BG slope ≥ threshold is a hard feed fact). But
calling it "from an unannounced meal" is a shape inference (the invisible carbs
are the mechanism, per ADR 0003), so a positive verdict is ``INFERRED``. A
negative verdict driven by a gate hit or a known prior bolus is also ``INFERRED``
(the attribution of the rise to recovery or digestion tail is a shape inference;
only the nadir/suspend row is observed). A negative verdict driven by too-sparse
CGM is ``NOT_IN_DATA``.

Pure function, no I/O, no registry — the scenario engine (#70) does the wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ...model import _CgmSeries
from ..scenario_config import ScenarioConfig
from .context_gate import GateResult, upstream_cause
from .evidence import EvidenceTier, SilenceReason, Verdict

# The rise-slope / slope-lookback / meal-floor thresholds and the CGM staleness guard
# now live on ``ScenarioConfig`` (the ``missed_meal_*`` and shared ``cgm_max_stale_min``
# fields).

# Back-compat re-export: the digestion-tail lookback now lives on
# ``ScenarioConfig.missed_meal_digestion_lookback_min`` (the live value the classifier
# reads). Kept here as a module alias because the scenario-engine tests import it.
DIGESTION_LOOKBACK_MIN = ScenarioConfig().missed_meal_digestion_lookback_min


@dataclass(frozen=True)
class MissedMealVerdict(Verdict):
    """A :class:`Verdict` for the missed-meal judgment.

    * ``matched`` — True iff this rise looks like an unannounced / missed meal
      (a real from-flat rise with no bolus anywhere in the digestion window and
      no observable rebound cause).
    * ``rise_slope`` — the fitted CGM slope at the anchor (mg/dL/min), or ``None``
      when the window was too sparse to judge.
    * ``gate`` — the context-gate result (rebound check), or ``None`` when the
      classifier resolved before reaching the gate.
    * ``prior_meal_t`` — the timestamp of the most recent carb-tagged bolus in the
      digestion window when the rise was suppressed as a digestion tail, else ``None``.
    * ``digestion_window_start`` — the start of the ``[anchor − digestion_lookback,
      anchor)`` span the classifier scanned for a prior bolus, set once the rise
      clears the slope + gate checks (the span the chart shades as a lookback band,
      #118); ``None`` when the classifier resolved before scanning it.
    """

    rise_slope: Optional[float] = None
    gate: Optional[GateResult] = None
    prior_meal_t: Optional[datetime] = None
    digestion_window_start: Optional[datetime] = None


def _most_recent_meal_in_window(
    bolus_events: Sequence[BolusEvent],
    window_start: datetime,
    anchor: datetime,
    min_carbs: float,
) -> Optional[datetime]:
    """Most recent carb-tagged bolus in ``[window_start, anchor)``.

    Returns the bolus timestamp or ``None``.  Excludes the anchor itself so a
    simultaneous bolus (eating exactly at anchor time) doesn't self-suppress.
    """
    best: Optional[datetime] = None
    for b in bolus_events:
        if b.carbs is None or b.carbs < min_carbs:
            continue
        if window_start <= b.t < anchor:
            if best is None or b.t > best:
                best = b.t
    return best


def classify_missed_meal(
    anchor: datetime,
    cgm_readings: Sequence[CgmReading],
    bolus_events: Sequence[BolusEvent] = (),
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> MissedMealVerdict:
    """Is the CGM rise at ``anchor`` an unannounced / missed meal?

    Evaluates in order:

    1. Fit the CGM slope at ``anchor`` over the ``slope_lookback_min`` window.
       Too sparse → **not matched** (can't judge; ``NOT_IN_DATA``).
    2. Slope at/under ``rise_slope`` → BG is ~flat; no rise to explain →
       **not matched** (``OBSERVED`` — the flat curve is a hard fact).
    3. Slope rising, but the **context gate** finds a recent low or defensive
       suspend → the rise is a rebound recovery, not an unannounced meal →
       **not matched** (``INFERRED``).
    4. Slope rising and a **prior carb-tagged bolus** exists within
       ``digestion_lookback_min`` → the rise is the tail of that already-bolused
       meal → **not matched** (``INFERRED``).
    5. Slope rising, no gate hit, no prior bolus → **matched** as an unannounced
       / missed meal (``INFERRED`` — "meal" is shape-derived; carbs are invisible
       per ADR 0003).

    Returns a :class:`MissedMealVerdict`.
    """
    rise_slope = scenario_config.missed_meal_rise_slope_mgdl_min
    slope_lookback_min = scenario_config.missed_meal_slope_lookback_min
    digestion_lookback_min = scenario_config.missed_meal_digestion_lookback_min
    meal_min_carbs = scenario_config.missed_meal_min_carbs
    series = _CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    slope = series.slope(anchor, timedelta(minutes=slope_lookback_min))

    if slope is None:
        return MissedMealVerdict(
            matched=False,
            detail=(
                "not enough CGM data around the rise to judge whether it was an "
                "unannounced meal"
            ),
            evidence_tier=EvidenceTier.NOT_IN_DATA,
            silence_reason=SilenceReason.INSUFFICIENT_DATA,
            rise_slope=None,
            gate=None,
            prior_meal_t=None,
        )

    if slope <= rise_slope:
        return MissedMealVerdict(
            matched=False,
            detail=(
                f"glucose was ~flat ({slope:.1f} mg/dL/min) — no significant rise "
                "to attribute to a missed meal"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            rise_slope=slope,
            gate=None,
            prior_meal_t=None,
        )

    # Check for rebound / post-low / post-suspend recovery (shared gate).
    gate = upstream_cause(anchor, cgm_readings, basal_events)
    if gate.explained:
        return MissedMealVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min, but {gate.detail} — "
                "the rise is a post-low/post-suspend recovery, not a missed meal"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            rise_slope=slope,
            gate=gate,
            prior_meal_t=None,
        )

    # Check for a prior bolused meal still being digested (digestion tail).
    digestion_window_start = anchor - timedelta(minutes=digestion_lookback_min)
    prior_meal_t = _most_recent_meal_in_window(
        bolus_events, digestion_window_start, anchor, meal_min_carbs
    )
    if prior_meal_t is not None:
        minutes_ago = round((anchor - prior_meal_t).total_seconds() / 60.0)
        return MissedMealVerdict(
            matched=False,
            detail=(
                f"glucose was rising {slope:.1f} mg/dL/min, but a meal bolus "
                f"{minutes_ago} min ago is still likely driving absorption — "
                "the rise is a digestion tail, not a new unannounced meal"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            # NO_TRIGGER, not UPSTREAM_CAUSE: the missed-meal trigger is an
            # *unbolused* rise, and a prior meal bolus means it was announced — the
            # behavior didn't happen. UPSTREAM_CAUSE is specifically the context
            # gate's recent low/suspend (ADR 0009), which this is not.
            silence_reason=SilenceReason.NO_TRIGGER,
            rise_slope=slope,
            gate=gate,
            prior_meal_t=prior_meal_t,
            digestion_window_start=digestion_window_start,
        )

    return MissedMealVerdict(
        matched=True,
        detail=(
            f"glucose rising {slope:.1f} mg/dL/min with no bolus in the prior "
            f"{digestion_lookback_min} min and no recent low or suspend to explain "
            "it — likely an unannounced or missed meal"
        ),
        evidence_tier=EvidenceTier.INFERRED,
        rise_slope=slope,
        gate=gate,
        prior_meal_t=None,
        digestion_window_start=digestion_window_start,
    )
