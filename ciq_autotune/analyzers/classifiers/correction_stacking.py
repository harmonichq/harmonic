"""Correction-stacking instance classifier (#73, epic #70).

Judges **one** cluster of user correction boluses given close together: was it a
genuine *over-stack* — repeated corrections piled on with insufficient regard for
the insulin already on board, that later drove a low — or were those corrections
the **rational** response to a real *runaway high* (a badly under-bolused meal
climbing away), which is appropriate dosing, not a stacking error?

The old ``correction_stacking`` detector (:mod:`...analyzers.behavioral`) counted
*any* run of user corrections within 60 min as risky "stacking," with **no check
on whether BG was high and still climbing** at the time. On real data that
over-flagged the headline case of epic #70:

    **An evening episode** where BG ran markedly higher off a heavily
    carb-undercounted meal. The stacked corrections were the *rational* chase of a
    runaway high; no low followed from the stack. The real lever was
    carb-undercount (I:C / #61), which a "stacking" warning has no business
    claiming.

This classifier fixes that with two guards the old detector lacked:

1. a **runaway-high exclusion** — a stack given while BG is high *and still
   rising* is chasing a real runaway, so it is **excluded** (not a stacking
   error); and
2. an **IOB-aware, outcome-gated** verdict — a stack only flags when the later
   correction landed on meaningful reconstructed **bolus IOB** (:class:`BolusIob`,
   the "insufficient regard for IOB" signature) *and* a real **low followed**
   within a few hours. No low, no flag: the stacking warning is about the lows a
   stack causes, not about the act of correcting twice.

Rescue carbs stay invisible (ADR 0003); the runaway is judged from the observable
CGM *shape*, the harm from the observable later low. Pure function, no I/O, no
registry — the scenario engine (#70) does the wiring.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import List, Optional, Sequence, Tuple

from ...events import BasalEvent, BolusEvent, CgmReading
from ...insulin import ACCOUNTING_DIA_MIN, BolusIob
from ...model import _CgmSeries
from ..scenario_config import ScenarioConfig
from .context_gate import GateResult, upstream_cause
from .evidence import EvidenceTier, SilenceReason, Verdict

# The correction-stacking thresholds now live on ``ScenarioConfig`` (the ``stacking_*``
# and shared ``cgm_max_stale_min`` fields): the user-correction floor, the stack window,
# the runaway-high line + rising-slope gate, the slope lookback, the low look-ahead, the
# low line, the IOB floor, and the IOB-curve peak. DIA stays the shared
# ``ACCOUNTING_DIA_MIN`` (insulin.py, ADR 0013).


@dataclass(frozen=True)
class CorrectionStackingVerdict(Verdict):
    """A :class:`Verdict` for the correction-stacking judgment.

    * ``matched`` — True iff this cluster was a genuine over-stack: corrections
      piled onto meaningful IOB, *not* chasing a runaway high, that a real low
      followed.
    * ``stack_t`` — when the later (stacking) correction landed, or ``None`` when
      no stack was present.
    * ``gap_min`` — minutes between the two stacked corrections, or ``None``.
    * ``iob_at_stack`` — reconstructed bolus IOB (units) on board when the stacking
      correction landed. ``None`` when no stack.
    * ``pre_stack_slope`` — the fitted CGM slope (mg/dL/min) before the stacking
      dose, used for the runaway judgment. ``None`` when too sparse.
    * ``bg_at_stack`` — CGM value nearest the stacking dose, for the runaway
      judgment. ``None`` when no reading is near.
    * ``nadir_bg`` / ``nadir_t`` — the low that followed the stack, if any.
    * ``gate`` — the context-gate result at the stacking dose (defensive: a stack
      landing mid-recovery from an upstream low/suspend is not a fresh over-stack).
    """

    stack_t: Optional[datetime] = None
    gap_min: Optional[float] = None
    iob_at_stack: Optional[float] = None
    pre_stack_slope: Optional[float] = None
    bg_at_stack: Optional[float] = None
    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    gate: Optional[GateResult] = None
    previous_seq_num: Optional[int] = None
    second_seq_num: Optional[int] = None


def _is_user_correction(
    b: BolusEvent, *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> bool:
    """A deliberate user correction — a pure correction *or* a mixed bolus's part.

    Pure corrections (no carbs) gate on real Msg2 provenance
    (``BolusEvent.is_automatic_bolus``): a Control-IQ automatic bolus is never a
    user correction whatever its magnitude, a user-initiated one is; with no
    provenance it falls back to the ``stacking_user_correction_floor_u`` magnitude
    heuristic. A mixed food+correction bolus is admitted when its Msg3 correction
    *component* (``correction_insulin``) clears the floor and it isn't a CIQ automatic
    dose (#160); no Msg3 split -> meal-only. IOB is reconstructed off the full delivered
    ``insulin`` elsewhere — only this admission/floor gate looks at the component.
    Kept byte-for-byte in sync with ``scenario.anchors._is_user_correction``.
    """
    floor_u = scenario_config.stacking_user_correction_floor_u
    if b.insulin is None:
        return False
    auto = b.is_automatic_bolus
    if b.carbs:
        if b.correction_insulin is None or auto:
            return False
        return b.correction_insulin >= floor_u
    if auto is not None:
        return not auto
    return b.insulin >= floor_u


def _user_corrections(
    boluses: Sequence[BolusEvent], *, scenario_config: ScenarioConfig = ScenarioConfig()
) -> List[BolusEvent]:
    """User correction boluses (see :func:`_is_user_correction`), sorted by time."""
    return sorted(
        (b for b in boluses if _is_user_correction(b, scenario_config=scenario_config)),
        key=lambda b: (b.t, b.seq_num),
    )


def _first_low_after(
    readings: Sequence[CgmReading], anchor: datetime, horizon: datetime, low_mgdl: float
):
    """The nadir CGM reading in ``(anchor, horizon]`` at/under ``low_mgdl``.

    Returns ``(nadir_bg, nadir_t)`` or ``(None, None)``. The low a stack drives
    trails the stacking dose, so any reading in the look-ahead — not just the
    instant after — counts, and we report the deepest.
    """
    nadir_bg: Optional[float] = None
    nadir_t: Optional[datetime] = None
    for r in readings:
        if r.bg is None:
            continue
        if anchor < r.t <= horizon and r.bg <= low_mgdl:
            if nadir_bg is None or r.bg < nadir_bg:
                nadir_bg = r.bg
                nadir_t = r.t
    return nadir_bg, nadir_t


def classify_correction_stacking(
    corrections: Sequence[BolusEvent],
    cgm_readings: Sequence[CgmReading],
    basal_events: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> CorrectionStackingVerdict:
    """Was this cluster of corrections a genuine over-stack, or a rational runaway chase?

    Judges one cluster of correction boluses (``corrections``) against its
    CGM/basal context. The decision, in order:

    1. **Is there a stack at all?** Keep only user corrections (no carbs, >= the
       user floor); find the last pair within ``stack_window_min`` of each other.
       No such pair -> **not matched** (nothing stacked; ``OBSERVED`` — the dose
       spacing is a hard fact).
    2. **Was it chasing a runaway high?** At the stacking (second) dose, if BG is
       at/above ``runaway_high_mgdl`` *and* still rising (pre-dose slope above
       ``runaway_rising_slope``), the corrections were the rational chase of a real
       runaway — **excluded, not matched** (``INFERRED`` — "this was a runaway, not
       an over-stack" is a shape read; the harmless verified case above).
    3. **Was it a recovery, not a fresh stack?** If the shared context gate finds
       an observable upstream low/suspend the stacking dose was landing into a
       recovery from, it isn't a fresh over-stack either -> **not matched**
       (``INFERRED``).
    4. **IOB-aware harm.** Otherwise the stack was *not* chasing a runaway. If the
       stacking dose landed on meaningful reconstructed bolus IOB (>=
       ``stack_iob_floor_u`` — the "insufficient regard for IOB" signature) *and* a
       real low (<= ``low_mgdl``) followed within ``low_lookahead_min`` ->
       **matched**: a genuine over-stack (``INFERRED`` — the IOB and the low are
       observed/reconstructed, but "the stack caused the low" is a shape
       inference). No qualifying IOB, or no low followed -> **not matched**
       (``OBSERVED`` when a stack existed but no low followed; the warning is about
       the lows a stack causes).

    Returns a :class:`CorrectionStackingVerdict`. Never asserts rescue carbs or a
    carb-undercount — the runaway it excludes belongs to the I:C / carb-undercount
    lever, not here (ADR 0003).
    """
    stack_window_min = scenario_config.stacking_window_min
    runaway_high_mgdl = scenario_config.stacking_runaway_high_mgdl
    runaway_rising_slope = scenario_config.stacking_runaway_rising_slope_mgdl_min
    slope_lookback_min = scenario_config.stacking_slope_lookback_min
    low_lookahead_min = scenario_config.stacking_low_lookahead_min
    low_mgdl = scenario_config.stacking_low_mgdl
    stack_iob_floor_u = scenario_config.stacking_iob_floor_u
    iob_peak_min = scenario_config.stacking_iob_peak_min
    iob_dia_min = ACCOUNTING_DIA_MIN
    corr = _user_corrections(corrections, scenario_config=scenario_config)

    # 1. Find the *last* stacked pair (the stacking dose is the one whose IOB and
    # downstream low we judge). Consecutive user corrections within the window.
    stack_idx: Optional[int] = None
    for i in range(1, len(corr)):
        if corr[i].t - corr[i - 1].t <= timedelta(minutes=stack_window_min):
            stack_idx = i
    if stack_idx is None:
        return CorrectionStackingVerdict(
            matched=False,
            detail=(
                "no two user corrections landed within "
                f"{stack_window_min:.0f} min — nothing stacked to judge"
            ),
            evidence_tier=EvidenceTier.OBSERVED,
            silence_reason=SilenceReason.NO_TRIGGER,
        )

    prev = corr[stack_idx - 1]
    stack = corr[stack_idx]
    gap_min = (stack.t - prev.t).total_seconds() / 60.0

    series = _CgmSeries(cgm_readings, timedelta(minutes=scenario_config.cgm_max_stale_min))
    bg_at_stack = series.nearest(stack.t)
    slope = series.slope(stack.t, timedelta(minutes=slope_lookback_min))

    # 2. Rational runaway chase — high AND still rising -> exclude.
    if (
        bg_at_stack is not None
        and bg_at_stack >= runaway_high_mgdl
        and slope is not None
        and slope > runaway_rising_slope
    ):
        return CorrectionStackingVerdict(
            matched=False,
            detail=(
                f"the second correction landed with BG high ({bg_at_stack:.0f} mg/dL) "
                f"and still rising ({slope:.1f} mg/dL/min) — a rational chase of a "
                "runaway high, not an over-stack"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            # NO_TRIGGER, not UPSTREAM_CAUSE: chasing a runaway high is rational
            # dosing, so the over-stack behavior didn't happen. UPSTREAM_CAUSE is
            # the context gate's recent low/suspend (ADR 0009); a high is not that.
            silence_reason=SilenceReason.NO_TRIGGER,
            stack_t=stack.t,
            previous_seq_num=prev.seq_num,
            second_seq_num=stack.seq_num,
            gap_min=gap_min,
            pre_stack_slope=slope,
            bg_at_stack=bg_at_stack,
        )

    # 3. Recovery from an observable upstream low/suspend -> not a fresh over-stack.
    gate = upstream_cause(stack.t, cgm_readings, basal_events, scenario_config=scenario_config)
    if gate.explained:
        return CorrectionStackingVerdict(
            matched=False,
            detail=(
                f"the second correction landed while {gate.detail} — a recovery, "
                "not a fresh over-stack"
            ),
            evidence_tier=EvidenceTier.INFERRED,
            silence_reason=SilenceReason.UPSTREAM_CAUSE,
            stack_t=stack.t,
            previous_seq_num=prev.seq_num,
            second_seq_num=stack.seq_num,
            gap_min=gap_min,
            pre_stack_slope=slope,
            bg_at_stack=bg_at_stack,
            gate=gate,
        )

    # 4. IOB-aware, outcome-gated harm. Reconstruct bolus IOB from *all* prior
    # boluses so the first correction (and any meal) counts toward what was on
    # board when the stacking dose landed.
    iob = BolusIob(list(corrections), iob_peak_min, iob_dia_min)
    iob_at_stack = iob.at(stack.t)

    nadir_bg, nadir_t = _first_low_after(
        cgm_readings,
        stack.t,
        stack.t + timedelta(minutes=low_lookahead_min),
        low_mgdl,
    )

    if iob_at_stack >= stack_iob_floor_u and nadir_bg is not None:
        mins_to_low = (nadir_t - stack.t).total_seconds() / 60.0
        # Provenance enrichment (#161): when the stacking correction was a flagged
        # override of a pump rec of ~0, add that it overrode the pump's call
        # (ADR 0015). Function-local import breaks the module cycle (user_override
        # imports this module's `_is_user_correction` / `_first_low_after`). Detail-
        # only; the verdict and attribution are unchanged.
        from .user_override import override_enrichment

        return CorrectionStackingVerdict(
            matched=True,
            detail=(
                f"a second correction landed {gap_min:.0f} min after the first with "
                f"{iob_at_stack:.1f} U still on board and BG not high/rising — it then "
                f"drove BG to {nadir_bg:.0f} mg/dL {mins_to_low:.0f} min later. Give "
                "corrections time to act before adding more"
            ) + (override_enrichment(stack, scenario_config=scenario_config) or ""),
            evidence_tier=EvidenceTier.INFERRED,
            stack_t=stack.t,
            previous_seq_num=prev.seq_num,
            second_seq_num=stack.seq_num,
            gap_min=gap_min,
            iob_at_stack=iob_at_stack,
            pre_stack_slope=slope,
            bg_at_stack=bg_at_stack,
            nadir_bg=nadir_bg,
            nadir_t=nadir_t,
            gate=gate,
        )

    # A stack existed but did no harm (no meaningful IOB overlap, or no low
    # followed). The warning is about the lows a stack causes, so: not matched.
    if iob_at_stack < stack_iob_floor_u:
        reason = (
            f"the first correction had essentially cleared ({iob_at_stack:.1f} U on "
            "board) when the second landed"
        )
        # No meaningful IOB overlap: the over-stack behavior didn't happen.
        silence = SilenceReason.NO_TRIGGER
    else:
        reason = f"no low followed within {low_lookahead_min / 60:.0f} h"
        # A real stack, but its harmful outcome (a low) never arrived in the horizon.
        silence = SilenceReason.HORIZON_EXPIRED
    return CorrectionStackingVerdict(
        matched=False,
        detail=f"corrections landed {gap_min:.0f} min apart but {reason} — not a risky stack",
        evidence_tier=EvidenceTier.OBSERVED,
        silence_reason=silence,
        stack_t=stack.t,
        previous_seq_num=prev.seq_num,
        second_seq_num=stack.seq_num,
        gap_min=gap_min,
        iob_at_stack=iob_at_stack,
        pre_stack_slope=slope,
        bg_at_stack=bg_at_stack,
        nadir_bg=nadir_bg,
        nadir_t=nadir_t,
        gate=gate,
    )


def count_correction_stacks(
    window_boluses: Sequence[BolusEvent],
    context_boluses: Sequence[BolusEvent],
    context_cgm: Sequence[CgmReading],
    context_basal: Sequence[BasalEvent] = (),
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> Tuple[int, int]:
    """Count ``(behavior, harm)`` stacked correction pairs in one window (#131).

    The Outcomes-trend split of ``correction_stacking`` into the **behavior** it is
    (repeatedly correcting onto meaningful insulin still on board) and the rare
    **harm** it causes (a stack that then drove a low). The outcome-gated
    :func:`classify_correction_stacking` verdict, read against the plain meaning of
    "am I stacking?", scores a green "~never" on real data — perfection at the exact
    thing being done constantly — because harm (~3/yr) is far rarer than the behavior
    (~91/yr). This surfaces both, as two numerators over the **same**
    ``correction_clusters`` denominator (issue #131's resolved caveat).

    It scans every *consecutive user-correction pair* within ``window_boluses`` — the
    exact population ``engine._exposure_counts`` denominates ``correction_clusters``
    on — and buckets each pair whose two doses land within ``stack_window_min``:

    * **behavior** — the second (stacking) dose landed on meaningful reconstructed
      bolus IOB (``>= stack_iob_floor_u``) and was **not** a runaway chase (BG high
      *and* still rising). Counted **regardless of outcome** — the recurring impulse
      the green tile was papering over. Runaway-excluded pairs count toward neither
      bucket: those are the rational chase of a climbing under-bolused meal, which is
      ``carb_undercount``'s story, not stacking (ADR 0003).
    * **harm** — a *behavior* pair the shared context gate did not explain as a
      recovery **and** a real low (``<= low_mgdl``) followed within
      ``low_lookahead_min``: the existing outcome-gated verdict, unchanged.
      ``harm <= behavior`` by construction (harm only adds the recovery-gate and
      low-followed conditions on top of behavior's).

    Pairs are enumerated from ``window_boluses`` (so the count can never exceed the
    window's ``correction_clusters`` denominator), but IOB / slope / gate / low
    context are read from the padded ``context_*`` slices so a stack near a window
    edge still sees the boluses and CGM around it. Pure; no store, no I/O.
    """
    stack_window_min = scenario_config.stacking_window_min
    runaway_high_mgdl = scenario_config.stacking_runaway_high_mgdl
    runaway_rising_slope = scenario_config.stacking_runaway_rising_slope_mgdl_min
    slope_lookback_min = scenario_config.stacking_slope_lookback_min
    low_lookahead_min = scenario_config.stacking_low_lookahead_min
    low_mgdl = scenario_config.stacking_low_mgdl
    stack_iob_floor_u = scenario_config.stacking_iob_floor_u
    iob_peak_min = scenario_config.stacking_iob_peak_min
    iob_dia_min = ACCOUNTING_DIA_MIN
    pairs = _user_corrections(window_boluses, scenario_config=scenario_config)
    series = _CgmSeries(context_cgm, timedelta(minutes=scenario_config.cgm_max_stale_min))
    # IOB rides on *all* prior boluses (meals + the first correction), so the padded
    # context slice — not the window slice — feeds the reconstruction.
    iob = BolusIob(list(context_boluses), iob_peak_min, iob_dia_min)

    behavior = 0
    harm = 0
    for i in range(1, len(pairs)):
        prev, stack = pairs[i - 1], pairs[i]
        if stack.t - prev.t > timedelta(minutes=stack_window_min):
            continue  # not stacked — the first had time to act

        bg_at_stack = series.nearest(stack.t)
        slope = series.slope(stack.t, timedelta(minutes=slope_lookback_min))
        # Runaway-high chase — high AND still rising — is rational dosing, excluded.
        if (
            bg_at_stack is not None
            and bg_at_stack >= runaway_high_mgdl
            and slope is not None
            and slope > runaway_rising_slope
        ):
            continue

        # "Insufficient regard for IOB" is the behavior's signature; a cleared first
        # dose is not a real stack.
        if iob.at(stack.t) < stack_iob_floor_u:
            continue
        behavior += 1

        # Harm adds the existing outcome gate: not a recovery from an upstream
        # low/suspend, and a real low actually followed.
        gate = upstream_cause(
            stack.t, context_cgm, context_basal, scenario_config=scenario_config
        )
        if gate.explained:
            continue
        nadir_bg, _ = _first_low_after(
            context_cgm,
            stack.t,
            stack.t + timedelta(minutes=low_lookahead_min),
            low_mgdl,
        )
        if nadir_bg is not None:
            harm += 1

    return behavior, harm
