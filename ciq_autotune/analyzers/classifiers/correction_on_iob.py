"""Lone-correction-on-IOB crash classifier (#150) — the ``n=1`` sibling of stacking.

The over-bolus crash :mod:`.correction_stacking` misses: a **single** user
correction dropped onto insulin still working, that then drove a low.
``correction_stacking`` needs a *pair* (>= 2 corrections within 60 min), so a lone
correction on live IOB — the far more common real mistake — produced zero findings
(issue #150; an evening crash off one correction landing on a dinner's residual
IOB).

This is that classifier with the pair requirement relaxed to a single correction,
anchored the other way round: instead of scanning forward from a stack for a low,
it **back-scans from a sub-70 nadir** for the lone correction that drove it. It
lives in :func:`~ciq_autotune.analyzers.scenario.attribute._low_lever`, competing
only with the other low levers — so cause (the correction) and effect (the low)
land in one place even when the raw episode split them (spec §1), and it never
overrides a meal/high lever (those win by earliest-actionable-by-time).

It **reuses ``correction_stacking``'s primitives** — :class:`BolusIob`,
:class:`CgmSeries` slope, and the shared :func:`upstream_cause` gate — with one
tightening: the slope guard is **stricter**. ``correction_stacking`` only excludes
a rising chase when BG is *also* >= 180 (a runaway); a *lone* correction needs
stronger proof it wasn't a rational spike-chase, so **any** BG rising faster than
``RISING_SLOPE_MGDL_MIN`` at the dose — at any level — disqualifies it (spec §2.5).

Coexistence is structural (spec §3): partitioned from ``correction_stacking`` by
**count** (>= 2 in 60 min -> defer entirely to stacking; exactly one lone -> here),
and from ``over_treated_low`` by ordering in ``_low_lever`` (it fires **last**, so
the observable rebound behavior wins first). Time of day does not hide an actionable
correction. Rescue carbs stay invisible (ADR 0003): the IOB and the low are
observed/reconstructed, but "the correction caused the low" is a shape inference
(``INFERRED``). Pure function, no I/O, no registry — the scenario engine wires it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional, Sequence

from ...events import BasalEvent, BolusEvent, CgmReading
from ...insulin import ACCOUNTING_DIA_MIN, BolusIob
from ...model import CgmSeries
from ..scenario_config import ScenarioConfig
from .context_gate import GateResult, upstream_cause
from .correction_stacking import _user_corrections
from .evidence import EvidenceTier, SilenceReason, Verdict
from .user_override import override_enrichment

# The lone-correction rising-slope guard now lives on ``ScenarioConfig`` as
# ``correction_on_iob_rising_slope_mgdl_min`` — STRICTER than ``correction_stacking``'s
# runaway rule (which only excludes a rising chase when BG is ALSO >= 180): a lone
# correction is weaker evidence of an over-stack, so any rise faster than this — at
# any level — is a rational spike-chase and excluded (spec §2.5). The stack window,
# low line, slope lookback, IOB floor, IOB peak, and user-correction floor it shares
# with the stacking classifier are the ``stacking_*`` fields; DIA is ``ACCOUNTING_DIA_MIN``.


@dataclass(frozen=True)
class CorrectionOnIobVerdict(Verdict):
    """A :class:`Verdict` for the lone-correction-on-IOB judgment.

    * ``matched`` — True iff a lone user correction landed on meaningful bolus IOB,
      with BG not rising, and a sub-70 low then followed (the crash it drove).
    * ``correction_t`` — when the driving correction landed, or ``None`` when no
      qualifying correction was found before the low.
    * ``iob_at_correction`` — reconstructed **prior** bolus IOB (units) on board when
      the correction landed (the insulin it stacked onto; excludes the correction
      itself). ``None`` when no correction.
    * ``pre_slope`` — the fitted CGM slope (mg/dL/min) before the correction, for the
      rising-chase guard. ``None`` when too sparse.
    * ``bg_at_correction`` — CGM value nearest the correction. ``None`` when none near.
    * ``nadir_bg`` / ``nadir_t`` — the low that followed (the anchor's nadir).
    * ``mins_to_low`` — minutes from the correction to the nadir. ``None`` when no
      qualifying correction.
    * ``gate`` — the context-gate result at the correction (a correction landing
      mid-recovery from an upstream low/suspend is not a fresh over-bolus).
    """

    correction_t: Optional[datetime] = None
    iob_at_correction: Optional[float] = None
    pre_slope: Optional[float] = None
    bg_at_correction: Optional[float] = None
    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    mins_to_low: Optional[float] = None
    gate: Optional[GateResult] = None


def classify_correction_on_iob(
    nadir_t: datetime,
    nadir_bg: Optional[float],
    cgm_readings: Sequence[CgmReading],
    bolus_events: Sequence[BolusEvent],
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> CorrectionOnIobVerdict:
    """Did one lone correction on live IOB drive this sub-70 low? (#150)

    Back-scans from a low's nadir for the lone user correction that crashed it. The
    decision, in order (spec §2):

    1. **Real low?** ``nadir_bg`` must be at/under ``low_mgdl`` (70). A near-low
       (71–75) is not a "low you had" -> **not matched** (``OBSERVED``).
    2. **A lone correction on board?** Take the *nearest* user correction (no carbs,
       >= ``user_correction_floor_u``) in ``[nadir − dia, nadir]``. None -> **not
       matched** (``OBSERVED`` — no user correction preceded the low).
    3. **Loneness (partition vs stacking).** If any *other* user correction lands
       within ``stack_window_min`` (60 min) of it, this is a >= 2 stack ->
       **defer entirely** to ``correction_stacking`` (**not matched**, ``OBSERVED``).
    4. **IOB gate.** The reconstructed **prior** bolus IOB (all boluses *before* the
       correction — a meal, an earlier dose) must be >= ``stack_iob_floor_u`` at the
       correction: the "landed on insulin still working" signature. Below it -> the
       correction stood alone, no stacking -> **not matched** (``OBSERVED``).
    5. **Rising-chase guard (stricter than stacking).** If BG was rising faster than
       ``rising_slope`` at the correction — at any level — it was chasing a spike,
       not stacking on a settled BG -> **not matched** (``INFERRED``).
    6. **Recovery guard.** If the shared context gate finds an observable upstream
       low/suspend the correction was landing into a recovery from, it isn't a fresh
       over-bolus -> **not matched** (``INFERRED``).

    All clear -> **matched**: a lone correction on live IOB, BG not rising, that drove
    the sub-70 low (``INFERRED`` — the IOB and low are observed/reconstructed, but
    "the correction caused the low" is a shape read; grams stay invisible, ADR 0003).

    Returns a :class:`CorrectionOnIobVerdict`.
    """
    dia_min = ACCOUNTING_DIA_MIN
    stack_window_min = scenario_config.stacking_window_min
    user_correction_floor_u = scenario_config.stacking_user_correction_floor_u
    rising_slope = scenario_config.correction_on_iob_rising_slope_mgdl_min
    slope_lookback_min = scenario_config.stacking_slope_lookback_min
    low_mgdl = scenario_config.stacking_low_mgdl
    stack_iob_floor_u = scenario_config.stacking_iob_floor_u
    iob_peak_min = scenario_config.stacking_iob_peak_min
    iob_dia_min = ACCOUNTING_DIA_MIN
    # 1. A real (sub-70) low is the outcome this lever explains. Near-lows (71–75,
    # anchored only to catch over-treated rebounds, #112) are not "a low you had".
    if nadir_bg is None or nadir_bg > low_mgdl:
        return CorrectionOnIobVerdict(
            matched=False,
            detail=(
                f"the nadir ({nadir_bg:.0f} mg/dL) did not reach the {low_mgdl:.0f} "
                "low line — no crash to attribute"
                if nadir_bg is not None
                else "no CGM nadir to judge"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
        )

    # 2. The nearest user correction in the DIA window before the low (the causal
    # dose is the one closest to the nadir). Meals are excluded by _user_corrections.
    window_start = nadir_t - timedelta(minutes=dia_min)
    corr = _user_corrections(bolus_events, scenario_config=scenario_config)
    priors = [c for c in corr if window_start <= c.t <= nadir_t]
    if not priors:
        return CorrectionOnIobVerdict(
            matched=False,
            detail=(
                f"no user correction (>= {user_correction_floor_u:.0f} U) landed in "
                f"the {dia_min / 60:.0f} h before the low"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
        )
    driver = priors[-1]
    mins_to_low = (nadir_t - driver.t).total_seconds() / 60.0

    # 3. Loneness — the hard partition from correction_stacking. Two user corrections
    # within the window are a >= 2 stack; that is stacking's territory, so we defer.
    for c in corr:
        if c is driver:
            continue
        if abs((c.t - driver.t).total_seconds()) <= stack_window_min * 60.0:
            return CorrectionOnIobVerdict(
                matched=False,
                detail=(
                    "a second user correction landed within "
                    f"{stack_window_min:.0f} min — this is a >= 2 stack, deferred to "
                    "correction_stacking"
                ),
                evidence_tier=EvidenceTier.OBSERVED,
                # A >= 2 stack is not the lone-correction behavior this classifier
                # judges — its trigger is absent (partitioned to correction_stacking).
                silence_reason=SilenceReason.NO_TRIGGER,
                correction_t=driver.t,
                nadir_bg=nadir_bg,
                nadir_t=nadir_t,
                mins_to_low=mins_to_low,
            )

    series = CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    bg_at_correction = series.nearest(driver.t)
    slope = series.slope(driver.t, timedelta(minutes=slope_lookback_min))

    # 4. IOB gate. Reconstruct the *prior* IOB — every bolus BEFORE the correction (a
    # meal, an earlier dose) — so we measure the insulin the correction stacked onto,
    # not the correction itself. Below the floor: the correction stood alone.
    prior = [b for b in bolus_events if b.t < driver.t]
    iob_at_correction = BolusIob(prior, iob_peak_min, iob_dia_min).at(driver.t)
    if iob_at_correction < stack_iob_floor_u:
        return CorrectionOnIobVerdict(
            matched=False,
            detail=(
                f"the correction landed with only {iob_at_correction:.1f} U on board "
                "— it did not stack onto meaningful active insulin"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            # The stack-onto-live-insulin trigger is absent (IOB below the floor).
            silence_reason=SilenceReason.NO_TRIGGER,
            correction_t=driver.t,
            iob_at_correction=iob_at_correction,
            pre_slope=slope,
            bg_at_correction=bg_at_correction,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
            mins_to_low=mins_to_low,
        )

    # 5. Rising-chase guard (stricter than stacking's runaway rule — any level).
    if slope is not None and slope > rising_slope:
        return CorrectionOnIobVerdict(
            matched=False,
            detail=(
                f"BG was rising ({slope:.1f} mg/dL/min) at the correction — a rational "
                "spike-chase, not a stack onto settled insulin"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            # NO_TRIGGER, not UPSTREAM_CAUSE: a rising BG makes the correction a
            # rational spike-chase, so the over-stack-onto-settled-insulin behavior
            # didn't happen. UPSTREAM_CAUSE is reserved for the context gate's recent
            # low/suspend (ADR 0009), which a rise is not.
            silence_reason=SilenceReason.NO_TRIGGER,
            correction_t=driver.t,
            iob_at_correction=iob_at_correction,
            pre_slope=slope,
            bg_at_correction=bg_at_correction,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
            mins_to_low=mins_to_low,
        )

    # 6. Recovery from an observable upstream low/suspend -> not a fresh over-bolus.
    gate = upstream_cause(driver.t, cgm_readings, basal_events, scenario_config=scenario_config)
    if gate.explained:
        return CorrectionOnIobVerdict(
            matched=False,
            detail=(
                f"the correction landed while {gate.detail} — a recovery, not a fresh "
                "over-bolus"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            correction_t=driver.t,
            iob_at_correction=iob_at_correction,
            pre_slope=slope,
            bg_at_correction=bg_at_correction,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
            mins_to_low=mins_to_low,
            gate=gate,
        )

    # All clear: a lone correction on live IOB, BG not rising, drove the sub-70 low.
    # Provenance enrichment (#161): when the driving correction was a flagged override
    # of a pump rec of ~0, sharpen the message from "you corrected on IOB" to "you
    # overrode the pump's ‘no correction needed’ call and it dropped you" (ADR 0015).
    # Appends to the detail only — it never changes the verdict or the attribution.
    return CorrectionOnIobVerdict(
        matched=True,
        detail=(
            f"a correction landed with {iob_at_correction:.1f} U of insulin still on "
            f"board and BG not high/rising — it then drove BG to {nadir_bg:.0f} mg/dL "
            f"{mins_to_low:.0f} min later. Give one correction ~1–2 h to act before "
            "adding more"
        ) + (override_enrichment(driver, scenario_config=scenario_config) or ""),
        evidence_tier=EvidenceTier.INFERRED,
        correction_t=driver.t,
        iob_at_correction=iob_at_correction,
        pre_slope=slope,
        bg_at_correction=bg_at_correction,
        nadir_bg=nadir_bg,
        nadir_t=nadir_t,
        mins_to_low=mins_to_low,
        gate=gate,
    )
