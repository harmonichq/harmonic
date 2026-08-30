"""A3 · I:C ratio and carb-counting — one engine (ROADMAP §2).

Under-bolusing a meal is ambiguous: either the I:C is too weak, or the carbs were
undercounted. *Consistency* separates them, so one engine reads both off the same
signal — the post-meal CIQ-correction burden on carb-tagged meals:

* For an isolated carb-tagged meal, sum the insulin-only correction insulin (manual
  or CIQ auto-correction) Control-IQ delivered in the hours after it. The total
  insulin the meal really needed is ``meal_dose + post_correction``, so the implied
  ratio is ``true_ic = carbs / (meal_dose + post_correction)`` — tighter than
  programmed whenever CIQ had to clean up after the bolus.
* A **systematic** excess (low spread) is an I:C signal -> a capped tighter-I:C
  recommendation. **High variance** is a carb-counting signal -> a behavioral
  Finding, not a ratio, because no stable ratio explains scattered burdens.

Carbs stay fuzzy and bolus-time only (ROADMAP §4), which caps I:C confidence by
design — the variance flag is the safety valve and will often, correctly, decline
to recommend a ratio.
"""

from __future__ import annotations

import bisect
import math
import statistics
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional, Sequence, Tuple

from ..events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ..harm import (
    HarmAction,
    HarmArm,
    HarmConfig,
    PrintedLow,
    apply_harm_gate_nudge,
    arm_harm,
    arm_harm_evidence,
    find_printed_lows,
)
from ..insulin import (
    ACCOUNTING_DIA_MIN,
    ACCOUNTING_PEAK_MIN,
    BolusIob,
    InsulinActivity,
)
from ..model import CgmSeries
from ..ic_history import (
    HistoryIdentity,
    RunEvidence,
    RunIdentity,
    encode_history_id,
    encode_run_id,
    programmed_values_over_span,
    prove_runs,
    schedule_blocks,
)
from ..result import (
    Finding,
    IcBlock,
    IcHistory,
    IcHistoryRunRecord,
    Occurrence,
    SegmentEstimate,
)
from ..safety import _MIN_SUPPORTED_BLOCK_RUNS
from ..settings import Snapshot
from ..uncertainty import (
    Estimate,
    estimate_pooled_ratio,
    estimate_pooled_ratio_clustered,
)
from .scenario.preempted import PreemptedLowEntry, preempted_low_entries

# CIQ's built-in setpoint (ROADMAP §3). NOTE (#175): this is *not* the meal-outcome
# baseline — the outcome is measured against the meal's own starting BG (bg0), not a
# fixed target, so insulin spent fixing a pre-meal high isn't miscounted as carb
# coverage. TARGET_BG is retained as the CIQ reference the setpoint is documented at.
TARGET_BG = 110.0
_CIQ_SUSPEND_TYPE = "algorithmDelivery (control-iq suspension)"

# --- the one I:C eligibility decision (#465, moved to block scope by #518) ---------
# A carb-ratio BLOCK may move a deliverable schedule only when its evidence asserts a
# direction. This is the I:C twin of `SlotEstimate.asserts_move`: the active block
# estimator stamps it on every block, and ranking (`tuning_priority.ic_lever`), the consolidated
# pump profile (`basal._param_schedule`) and Plan staging
# (`frontend/diagnose-workspaces.js`, `stageItemsFor`) all read that one flag. See
# `ic_asserts_move` below for the four conditions.
IC_MIN_RECURRENCE_DAYS = 2

# The whole circular day, in minutes — the clock every block arc is drawn on.
DAY_MINUTES = 1440

# Blocks measure over a FIXED trailing 90 days, independent of the request's
# `window_days` (adr-518-ic-meal-run-ledger, decision 10). The run ledger needs that depth: at 30
# days three of four pools on the reference data starve. This is a NEW convention —
# no window-independent estimate existed in this codebase before — adopted on its own
# merits and labelled on screen (the pump lane stays request-windowed, so two windows
# share one screen and each is named where it is shown). EVERYTHING the block decision
# reads follows this same span: its harm lows, its pre-empted rescues, its impact
# denominator and its recurrence day-channels. A quantity mixed across the two spans
# — 90 days of carbs over a 30-day divisor, `wilson(k, 30)` over 90 days of lows — is
# a defect, not a detail.
BLOCK_WINDOW_DAYS = 90


def ic_band_excludes_programmed(row: SegmentEstimate) -> bool:
    """Whether the measured band clearly excludes the programmed ratio (a directional read)."""
    est = row.estimate
    return (
        est.value is not None
        and not est.wide
        and est.lo is not None
        and est.hi is not None
        and row.current is not None
        and not (est.lo <= row.current <= est.hi)
    )


def ic_asserts_move(block: "IcBlock") -> bool:
    """**The** I:C eligibility decision — one predicate, on the block (#518).

    A carb-ratio **block** (a maximal contiguous group of programmed segments sharing
    one value, on the circular day) may move a deliverable schedule only when all four
    of ADR 518's conditions hold, and they all live here:

    0. The block's ``state`` is ``numeric``. A block that is still collecting, below
       the floor, or unmeasurable alone can never assert, whatever the other flags
       say — and that requirement lives HERE, not at the call site, because a
       condition a consumer has to remember to re-apply is the second predicate all
       over again.
    1. The estimator-stamped effective run count meets
       ``safety._MIN_SUPPORTED_BLOCK_RUNS``. ``n_runs`` carries its floored integer
       display value. #273's lesson is that a narrow CI below the floor clears
       ``wide`` and stages anyway.
    2. The clustered band excludes the block's programmed value.
    3. The **regime bracket** does not straddle programmed and its on-regime sub-pool
       is not empty (decision 13) — a compare-side hold that decays by design as
       post-edit meals accrue.
    4. ``recommended`` names a real move off ``current`` (half-gap + cap, ADR 435).

    :func:`_analyze_ic_blocks_shared` computes each condition, stamps the verdict on
    the block and records *why* in ``evidence['eligibility']``; this function is the
    single reader of that evidence. Ranking (``tuning_priority.ic_lever``), the consolidated
    pump profile (``basal._param_schedule``) and Plan staging
    (``frontend/diagnose-workspaces.js``) all read the one flag it produces. Keeping every
    condition here — beside the block that carries it — is what stops the
    two-predicate drift that kept the basal thin-slot leak (#273) alive for four
    passes and re-opened it for I:C at segment scope (#465).

    Blocks are the ONLY thing that asserts post-#518: ``SegmentEstimate`` rows for
    ``carb_ratio`` are window-scoped pump-lane display and always read ``False``.
    """
    e = (block.evidence or {}).get("eligibility") or {}
    if not e:
        return False
    return bool(
        block.state == "numeric"
        and e.get("runs_floor_met")
        and e.get("band_excludes_programmed")
        and e.get("regime_supported")
        and e.get("names_a_move")
    )


@dataclass(frozen=True)
class IcConfig:
    # The isolation/attribution window (post_meal_min) is coupled to the outcome
    # read: it must stay >= outcome_at_min + outcome_tol_min — isolation is what
    # guarantees no *other* meal lands between the bolus and the full-DIA outcome
    # read; a shorter window would let a follow-on meal sit inside the read window
    # and poison outcome_bg. See __post_init__. Real breakfast-then-lunch spacing
    # makes 5h isolation cost sample (210 of 360 otherwise-isolated meals survive
    # on the reference DB), but the settle-read alternative it replaced kept fewer
    # (130) AND carried a structural loosening bias — see ADR 0017.
    post_meal_min: int = 315       # window after a meal to gather correction burden
    min_carbs: float = 10.0        # below this is a low-treatment / snack, not a meal
    min_meal_dose_u: float = 0.3
    # Prior meal-bolus action at the start of this meal is insulin still coupled
    # to carbs from the earlier meal. Above this floor, plausible choices about
    # crediting that action can reverse I:C direction, so the meal remains
    # coverage but leaves the numeric pool (#481). Correction-only action is
    # tracked separately and never disqualifies the meal. Fresh endpoint-as-of
    # grounding kept the admitted-pool bracket flat throughout 0.3–0.5 U; 0.5 U
    # preserves the larger, still-stable correction-only subset.
    max_prior_meal_action_u: float = 0.5
    # Non-completed carb-bolus exclusion (#219). A partial abort / alarm-kill
    # truncates the delivered dose, so true_ic = carbs / delivered is inflated — the
    # leg (and any truncated re-issue) must leave the meal pool. reissue_window_min
    # is how long after a contaminating abort a Completed re-issue is still treated
    # as the same (truncated) bolus; abort_contaminates_dose_u (ε) is the delivered
    # floor above which an abort leaves its re-issue truncated. Both are grounded in
    # a year of real data: every genuine re-issue lands within a few minutes of its
    # aborted leg, well inside the next unrelated bolus, and non-completed carb legs
    # cluster at exactly 0.0 U or well above the chosen floor — nothing in the gap
    # between them, so any ε placed in that gap is equivalent. A 0-U abort delivered
    # nothing to subtract, so its re-issue is a clean meal and stays.
    reissue_window_min: int = 5
    abort_contaminates_dose_u: float = 0.1
    max_step_frac: float = 0.20    # cap the recommendation move from programmed
    min_meals: int = 3             # need this many isolated meals to say anything
    # Numeric-pool floor in MEAL RUNS (#518). `min_meals` stays the meal-unit gate
    # for the two pooled meal-list findings (meals-start-high, correction burden),
    # which count meals; `min_runs` is the unit the run ledger's pooled ratio and
    # its clustered band are measured in (a run is one closed balance sheet, one
    # bootstrap cluster). NOT YET CONSUMED: `analyze_ic` still estimates from
    # `meal_burdens` per segment. PR-B of #518 (per-value I:C blocks) is the
    # caller — it gates the numeric pool and the settling countdown on this.
    min_runs: int = 3
    # Post-meal correction-burden Finding (#186): the *known-provenance* correction
    # insulin (user + CIQ-auto) summed across the pool must reach this before the
    # burden finding fires. Below it there is nothing meaningful to report; the split
    # ignores unknown-provenance corrections entirely (no Msg2 = we can't say who).
    min_post_correction_u: float = 5.0
    # A hypo confirmed by the outcome BG (bg_outcome_u < 0) can drive the effective
    # insulin below the meal+correction floor, which would produce a nonsensical
    # (even negative) I:C. Floor the denominator at this fraction of meal+correction
    # so the meal stays in as over-coverage evidence rather than being dropped.
    hypo_floor_frac: float = 0.1
    # --- Full-DIA outcome read (#181 / ADR 0017) ---
    # The meal's outcome BG is the mean of the CGM readings within outcome_tol_min
    # of bolus + outcome_at_min. outcome_at_min equals the Accounting DIA (300,
    # ADR 0013) so the meal bolus is *fully* acted at the read — that closure is
    # what lets the balance sheet count the meal's carbs at face value without a
    # carb-absorption model (carbs still raising BG past 5 h — slow fat/protein
    # tails — are the residual it can't see). The earlier "settled BG" read (first
    # flat CGM run 90–180 min post-bolus) was tried and rejected: flat BG mid-meal
    # means absorption rate ≈ action rate, NOT that the meal is over, so counting
    # full carbs against the ~42–62 % of the bolus acted by then inflated I:C
    # ~1.6–2.4×. See ADR 0017.
    outcome_at_min: int = 300      # keep equal to insulin.ACCOUNTING_DIA_MIN
    outcome_tol_min: int = 15      # half-width of the averaging window at the read
    outcome_min_readings: int = 3  # readings required inside the window to trust it
    # The meal's *starting* BG (bg0) baselines the outcome (#175): the outcome must
    # measure BG travelled over the meal, not distance from CIQ's target. Resolution
    # order is the bolus row's own `bg`, else the nearest CGM reading within this many
    # minutes of the bolus; a wider gap is not a trustworthy pre-meal BG.
    bg0_max_gap_min: int = 10
    # IOB-aware correction guard (#181). Post-meal corrections are zeroed only when
    # the pump's own reported IOB at the meal bolus (`BolusEvent.pump_iob`) exceeds
    # this threshold — i.e. the meal was dosed on top of substantial prior insulin,
    # so the corrections after it are cleaning up that overhang, not this meal. This
    # REPLACES the old time-only "prior meal within 2 h" guard (which zeroed on 132
    # meals in 35 d regardless of how much insulin was actually on board, wrongly
    # dropping corrections that belonged to the current meal at long gaps with low
    # IOB). The pooled I:C on the reference DB is near-flat across the tested range,
    # so the choice is not load-bearing; the mid-range value is kept. A meal with no
    # `pump_iob`
    # (historical rows / no Msg1) never trips it.
    guard_pump_iob_u: float = 3.0
    # --- Printed-and-rescued meal admission (ADR 0038 §5) ---
    # A meal that printed a low, was rescued with carbs, and had recovered to
    # baseline by the full-DIA read is normally evicted by post-meal isolation (the
    # rescue carb log sits in its window; see the eviction check below). ADR 0038 §5
    # re-admits such a meal — its rescue grams counted as carbs-covered, the ADR 0017
    # numerator — instead of dropping it, because the print is real but transient (the
    # nadir is gone by the full-DIA read; the grams are the only surviving carrier).
    # But only through THREE gates, because an ungated re-admission blows up g/U on
    # correction-context meals (a correction-context meal hit an extreme g/U value
    # through the hypo floor):
    #   (a) it started near target — bg0 in [rescue_bg0_band_lo, rescue_bg0_band_hi],
    #       a meal band, not a correction (>= _hi is a correction context, e.g. 233);
    #   (b) no rebound-high — BG never runs at/above rescue_rebound_bg between the
    #       rescue and the outcome read (a rebound means the rescue over-treated, so
    #       the grams aren't clean carb coverage);
    #   (c) the low is attributable to this meal's own bolus IOB — the harm layer's
    #       I:C arm owns a printed low whose dominant residual bolus is this meal.
    # A rescue carb log within rescue_low_proximity_min of that meal-owned low nadir
    # is the rescue admitted for grams. All three must pass; a failing gate leaves the
    # meal evicted (the ~40% correctly guarded out), the harm I:C arm still gating it.
    rescue_bg0_band_lo: float = 70.0
    rescue_bg0_band_hi: float = 180.0
    rescue_rebound_bg: float = 180.0
    rescue_low_proximity_min: float = 30.0

    def describe_gate(self) -> Dict:
        """Structured descriptor of I:C's sufficiency gate (#95, re-based on runs #518).

        I:C says nothing until ``min_runs`` closed **meal runs** accrue. A run is a
        whole chain of qualifying meals read once at the end, so the countdown unit is
        runs, not meals — the criteria below describe what closes a chain, not what
        isolates a lone meal. In particular there is no "no other meal within N h"
        criterion any more: a following meal now EXTENDS the run instead of evicting
        it, which is the whole point of the ledger. Every string interpolates this
        config's constants, so the text cannot drift from the gate."""
        return {
            "unit": "meal runs",
            "needed": self.min_runs,
            "soft": False,
            "criteria": [
                f"≥{self.min_carbs:g} g carbs",
                f"≥{self.min_meal_dose_u:g} U bolus",
                (
                    f"a {self.post_meal_min // 60} h gap after the last meal of the "
                    "chain, so its outcome can be read"
                ),
                "the pump finished delivering every bolus in the chain",
                "no unbolused carbs logged inside the chain",
                (
                    f"<{self.max_prior_meal_action_u:g} U prior-meal action at the "
                    "start (correction-only prehistory allowed)"
                ),
            ],
            "label": "closed meal runs",
        }

    def __post_init__(self) -> None:
        # Isolation must cover the whole outcome-read window, or a follow-on meal
        # can land inside it and contaminate outcome_bg (measuring post-*next-meal*
        # BG). ``post_meal_min`` is ALSO the meal-run gap (:func:`run_burdens`, the
        # #518 ledger): a run ends where the next meal is further away than this, so
        # the same inequality is what makes a run's outcome read DIA-clean by
        # construction. One constant, welded here, so the two can never drift apart.
        if self.post_meal_min < self.outcome_at_min + self.outcome_tol_min:
            raise ValueError(
                f"post_meal_min ({self.post_meal_min}) must be >= outcome_at_min + "
                f"outcome_tol_min ({self.outcome_at_min + self.outcome_tol_min}): "
                "isolation (and the meal-run gap it doubles as) has to protect the "
                "outcome read from a following meal."
            )


@dataclass(frozen=True)
class MealBurden:
    t: datetime
    carbs: float                 # total carbs covered by the closed ledger
    meal_carbs: float
    meal_dose: float
    post_correction: float
    true_ic: float                 # carbs / effective_insulin
    effective_insulin: float       # full-ledger insulin denominator, floored; carried so
                                   # the I:C estimate can pool it (Σcarbs / Σinsulin)
                                   # instead of averaging ratios.
    # Logged rescue carbs that were attributable to this meal's pre-empted low and
    # admitted into a closed full meal ledger (ADR 0041). Unknown/unclosed rescues
    # stay out of this number and instead feed the gate-only fallback.
    rescue_carbs: float = 0.0
    rescue_carb_times: Tuple[datetime, ...] = ()
    # CIQ basal compensation inside the meal ledger: delivered minus programmed,
    # positive for extra basal and negative for withheld basal. ``*_acted_u`` is
    # the term that enters the denominator at the full-DIA outcome read.
    ciq_basal_delta_u: float = 0.0
    ciq_basal_delta_acted_u: float = 0.0
    # Signed insulin-equivalent of the BG *travelled* over the meal: (outcome_bg -
    # bg0) / isf, where bg0 is the meal's starting BG (#175). Positive = ran higher
    # than it started (under-covered), negative = ran lower (over-covered). None when
    # the meal was excluded from the outcome signal (CGM gap at the full-DIA read,
    # not isolated over the read window, or no starting BG could be resolved) —
    # true_ic then falls back to the old correction-only method and this flags it as
    # unconfirmed.
    bg_outcome_u: Optional[float] = None
    outcome_bg: Optional[float] = None  # the BG at the full-DIA read, for transparency
    # The meal's starting BG (#175): the bolus row's own `bg` or the nearest CGM
    # within cfg.bg0_max_gap_min. The outcome baseline; carried for the UI scatter.
    bg0: Optional[float] = None
    # Provenance split of `post_correction` (#186): the same window's correction
    # insulin decomposed into user-delivered vs Control-IQ auto vs unknown (no Msg2),
    # gated on BolusEvent.is_automatic_bolus (#135), never the sub-1U heuristic. The
    # three U buckets reconcile to `post_correction`. Carried per-meal so the pool
    # finding can total them and a future UI can drill down; the I:C burden math
    # itself keeps using the undifferentiated `post_correction`.
    post_correction_user: float = 0.0
    post_correction_ciq: float = 0.0
    post_correction_unknown: float = 0.0
    n_correction_user: int = 0
    n_correction_ciq: int = 0
    n_correction_unknown: int = 0
    # I:C identifiability at meal start (#481). Residual action is reconstructed
    # with the Accounting-DIA curve and split by its originating bolus: carb-bearing
    # prior boluses can still be covering prior carbs, while correction-only boluses
    # have no unbooked carb side and remain admissible. ``None`` means the preceding
    # Accounting-DIA span was not observable, so the meal is unknown, never clean.
    prior_meal_action_u: Optional[float] = 0.0
    prior_correction_action_u: Optional[float] = 0.0
    prior_action_status: str = "supported"

    @property
    def has_outcome(self) -> bool:
        """Whether the full-DIA BG outcome was read vs. a correction-only fallback.

        The outcome and fallback subpopulations have different centers, so the I:C
        point estimate keys off this to avoid folding a mixture into one mean."""
        return self.bg_outcome_u is not None


def _is_meal(b: BolusEvent, cfg: IcConfig) -> bool:
    return (b.carbs is not None and b.carbs >= cfg.min_carbs
            and b.insulin is not None and b.insulin >= cfg.min_meal_dose_u)


def _is_noncompleted(b: BolusEvent) -> bool:
    """A bolus the pump did NOT finish delivering (User Aborted / Terminated by
    Alarm, …) (#219). ``completion is None`` — historical rows / no completion
    status — is treated as completed and kept: the exclusion fires only on a
    *known* non-completed status, so it can never silently drop the whole
    pre-completion-status history (or a test fixture that omits the field)."""
    return b.completion is not None and b.completion != "Completed"


def _is_correction(b: BolusEvent) -> bool:
    return b.insulin is not None and b.insulin > 0 and not b.carbs


def _contaminating_aborts(bolus_events: Sequence[BolusEvent],
                          cfg: IcConfig) -> List[BolusEvent]:
    """Non-completed carb legs that already delivered enough to truncate a re-issue.

    #219: an abort that delivered >= ``abort_contaminates_dose_u`` leaves the pump's
    calculator subtracting the partial from the immediate re-issue, so that re-issue
    is itself truncated. A 0-U abort delivered nothing to subtract, so its re-issue
    is a clean meal.
    """
    return [
        b for b in bolus_events
        if _is_noncompleted(b)
        and b.carbs is not None and b.carbs > 0
        and b.insulin is not None and b.insulin >= cfg.abort_contaminates_dose_u
    ]


def _dose_is_untrustworthy(m: BolusEvent, aborts: Sequence[BolusEvent],
                           cfg: IcConfig) -> bool:
    """Whether ``m``'s delivered dose can't carry a carb ledger (#219).

    True for a non-completed leg (the pump never finished it, so ``carbs /
    delivered`` inflates ``true_ic``) and for a Completed bolus re-issued within
    ``reissue_window_min`` of a contaminating abort (truncated by the calculator).
    :func:`meal_burdens` drops such a meal from the pool; :func:`run_burdens` drops
    the whole run it sits in. One predicate for both, so the #219 semantics cannot
    drift between the meal and run ledgers.
    """
    if _is_noncompleted(m):
        return True
    reissue_window = timedelta(minutes=cfg.reissue_window_min)
    return any(c.t < m.t <= c.t + reissue_window for c in aborts)


def _outcome_bg(cgm: CgmSeries, meal_t: datetime,
                cfg: IcConfig) -> Optional[Tuple[float, datetime]]:
    """The meal's outcome BG at full DIA, or ``None`` when it can't be read.

    Returns ``(mean_bg, mean_time)`` over the CGM readings within
    ``outcome_at_min ± outcome_tol_min`` of the bolus: the outcome BG plus the
    readings' time centroid, which the #181 balance sheet uses as the instant to
    curve-weight the post-corrections out to. At ``outcome_at_min`` = Accounting
    DIA the meal bolus is fully acted at the read, so the ledger closes without a
    carb-absorption model (see :class:`IcConfig`). No flatness requirement — BG
    still moving at +5 h is a fact about the meal's tail, not a reason to exclude
    it; averaging the window denoises the read. Fewer than
    ``outcome_min_readings`` readings means a CGM gap at the read: the meal is
    excluded, not guessed.
    """
    lo = meal_t + timedelta(minutes=cfg.outcome_at_min - cfg.outcome_tol_min)
    hi = meal_t + timedelta(minutes=cfg.outcome_at_min + cfg.outcome_tol_min)
    i = bisect.bisect_left(cgm.times, lo)
    j = bisect.bisect_right(cgm.times, hi)
    times = cgm.times[i:j]
    values = cgm.values[i:j]
    if len(times) < cfg.outcome_min_readings:
        return None
    mean_bg = round(statistics.fmean(values), 1)
    # Time centroid of the window: matches the mean BG's instant so the balance
    # sheet weights the corrections out to when the outcome was actually read.
    mean_offset = statistics.fmean([(t - times[0]).total_seconds() for t in times])
    return mean_bg, times[0] + timedelta(seconds=mean_offset)


def _acted(doses: List[Tuple[datetime, float]],
           t0: datetime, t1: Optional[datetime]) -> float:
    """Units of insulin from ``doses`` absorbed over ``(t0, t1]``, Accounting DIA.

    Thin wrapper over :class:`~ciq_autotune.insulin.InsulinActivity` at the
    units-accurate curve (300 / 75, ADR 0013) — the #181 balance sheet's curve
    weighting. ``doses`` here is deliberately **bolus-only** (I:C reasons about
    bolus insulin; CONTEXT "IOB … always bolus-only"), unlike ISF's use of the same
    class over bolus+basal. Returns 0 for no doses or a non-positive interval.
    """
    if not doses or t1 is None or t1 <= t0:
        return 0.0
    return InsulinActivity(doses, ACCOUNTING_PEAK_MIN, ACCOUNTING_DIA_MIN).acted(t0, t1)


def _acted_signed(doses: List[Tuple[datetime, float]],
                  t0: datetime, t1: Optional[datetime]) -> float:
    """Signed acted insulin over ``(t0, t1]``.

    :class:`InsulinActivity` intentionally ignores non-positive doses for its
    total-insulin consumers. CIQ basal deltas can be negative (withheld basal), so
    the I:C ledger reads positive and negative micro-doses separately and nets the
    two acted quantities.
    """
    pos = [(t, amt) for t, amt in doses if amt > 0]
    neg = [(t, -amt) for t, amt in doses if amt < 0]
    return _acted(pos, t0, t1) - _acted(neg, t0, t1)


class _BasalWindowIndex:
    """Time-sorted basal events with a bisect lookup for one meal's window.

    Each meal ledger reads only the basal deliveries overlapping its own few hours,
    but the feed is a 5-min stream over the whole analysis span. Scanning all of it
    per meal is O(meals × events) — invisible at 30 days and the dominant cost of the
    whole read at 90 (#518). Sorting once and bisecting makes it proportional to the
    window instead. ``_max_duration`` is the widest event in the feed, so an event
    that STARTS before the window but still overlaps it is never skipped.
    """

    __slots__ = ("events", "starts", "lookback")

    def __init__(self, basal_events: Sequence[BasalEvent]):
        self.events = sorted(basal_events, key=lambda e: e.t)
        self.starts = [e.t for e in self.events]
        widest = max((float(e.duration_mins or 0) for e in self.events), default=0.0)
        self.lookback = timedelta(minutes=widest)

    def between(self, t0: datetime, t1: datetime) -> Sequence[BasalEvent]:
        i = bisect.bisect_left(self.starts, t0 - self.lookback)
        j = bisect.bisect_right(self.starts, t1)
        return self.events[i:j]


def _ciq_basal_delta_doses(
    basal_events: Sequence[BasalEvent],
    t0: datetime,
    t1: Optional[datetime],
) -> List[Tuple[datetime, float]]:
    """Signed delivered-minus-programmed basal micro-doses inside a meal window."""
    if t1 is None or t1 <= t0:
        return []
    if isinstance(basal_events, _BasalWindowIndex):
        basal_events = basal_events.between(t0, t1)
    out: List[Tuple[datetime, float]] = []
    for e in basal_events:
        if (
            e.basal_rate is None
            or e.profile_basal_rate is None
            or e.duration_mins is None
            or e.duration_mins <= 0
        ):
            continue
        if e.delivery_type == "tempDelivery":
            continue
        ciq_owned = (
            e.delivery_type == "algorithmDelivery"
            or e.delivery_type == _CIQ_SUSPEND_TYPE
            or (
                e.basal_rate == 0
                and e.profile_basal_rate is not None
                and e.profile_basal_rate > 0
            )
        )
        if not ciq_owned:
            continue
        start = e.t
        end = e.t + timedelta(minutes=float(e.duration_mins))
        overlap_start = max(start, t0)
        overlap_end = min(end, t1)
        if overlap_end <= overlap_start:
            continue
        delta_rate = float(e.basal_rate) - float(e.profile_basal_rate)
        minutes = (overlap_end - overlap_start).total_seconds() / 60.0
        units = delta_rate * minutes / 60.0
        if units:
            out.append((overlap_start, units))
    return out


def _preempted_rescues(
    carb_entries: Sequence[CarbEntry],
    bolus_events: Sequence[BolusEvent],
    cgm_readings: Optional[Sequence[CgmReading]],
) -> List[PreemptedLowEntry]:
    return preempted_low_entries(carb_entries, bolus_events, cgm_readings or [])


def _meal_printed_lows(
    meal_t: datetime,
    window_end: datetime,
    harm_lows: Sequence[PrintedLow],
) -> List[PrintedLow]:
    """Printed lows the harm layer attributed to this exact meal (ADR 0038 §5 gate c).

    A re-admitted rescue meal must *own* its low. A harm :class:`PrintedLow` is
    meal-owned when its arm is I:C (meal bolus IOB dominant at the nadir) and its
    dominant residual bolus is this meal, with the nadir inside the isolation window.
    """
    return [
        low for low in harm_lows
        if low.arm is HarmArm.IC
        and low.dominant_bolus_t == meal_t
        and meal_t < low.t <= window_end
    ]


def _peak_bg_between(
    cgm: Optional["CgmSeries"], lo: datetime, hi: datetime
) -> Optional[float]:
    """Max CGM value in ``(lo, hi]``, or None when no reading falls there."""
    if cgm is None or hi <= lo:
        return None
    i = bisect.bisect_right(cgm.times, lo)
    j = bisect.bisect_right(cgm.times, hi)
    vals = cgm.values[i:j]
    return max(vals) if vals else None


def _rescue_evidence(rescues: Sequence[PreemptedLowEntry]) -> dict:
    return {
        "gated": bool(rescues),
        "count": len(rescues),
        "rescues": [
            {
                "t": r.entry.t.isoformat(),
                "grams": r.entry.grams,
                "certainty": r.entry.certainty,
                "bolus_t": r.bolus_t.isoformat() if r.bolus_t else None,
                "residual_u": r.residual_u,
            }
            for r in rescues
        ],
    }


def meal_start_bg(bolus: BolusEvent,
                  cgm: Optional["CgmSeries"]) -> Optional[float]:
    """A meal's starting BG (``bg0``): the bolus row's own ``bg``, else the nearest CGM
    reading within ``IcConfig.bg0_max_gap_min`` of the bolus, else ``None``.

    This is the single resolution :func:`meal_burdens` and :func:`_meals_start_high_finding`
    use for the pre-meal-high signal. Extracted (#302) so the Outcomes trend's per-window
    median reads the *same* ``bg0`` — never a second, subtly-different pre-meal BG. ``cgm``
    is a :class:`~ciq_autotune.model.CgmSeries` built with ``bg0_max_gap_min`` as its
    max-stale, or ``None`` when no CGM is available (then only the bolus row's ``bg``
    can supply a start).
    """
    if bolus.bg is not None:
        return bolus.bg
    if cgm is not None:
        return cgm.nearest(bolus.t)
    return None


def meal_burdens(bolus_events: List[BolusEvent],
                 config: IcConfig = IcConfig(),
                 *,
                 cgm_readings: Optional[List[CgmReading]] = None,
                 isf_effective: Optional[float] = None,
                 carb_entries: Optional[List[CarbEntry]] = None,
                 basal_events: Optional[List[BasalEvent]] = None,
                 harm_lows: Optional[Sequence[PrintedLow]] = None,
                 prior_action_observed_from: Optional[datetime] = None,
                 ) -> List[MealBurden]:
    """Post-meal correction burden per *isolated* carb-tagged meal.

    When ``cgm_readings`` and ``isf_effective`` are both given, each isolated meal
    with a readable outcome gets the **insulin-acted balance sheet** (#181, ADR
    0017): the insulin the carbs truly demanded is reconstructed over the
    meal→outcome interval as

        carbs_covered = meal carbs + attributable rescue carbs

        carb_insulin = meal bolus (fully acted at the read)
                     + post-corrections acted by the read
                     + acted CIQ basal delta versus programmed
                     + (outcome_bg − bg0) / ISF

    The outcome is read at **full Accounting DIA** (bolus + 300 min, ADR 0013), so
    the meal bolus is 100 % absorbed at the read and enters at face value; only the
    post-corrections need curve-weighting (one delivered near the read has barely
    acted and must not count in full). ``true_ic = carbs / carb_insulin``.

    Reading at full DIA is what lets the carbs side stay at face value with no
    carb-absorption model. The first #181 cut instead read the outcome at a
    "settled BG" (first flat CGM run 90–180 min post-bolus) and curve-weighted the
    bolus down to that instant — but flat BG mid-meal means absorption rate ≈
    action rate, not that the meal is over, so counting *all* the carbs against
    the partial fraction of the bolus acted by then inflated I:C by roughly
    1.6–2.4× on the reference DB. See ADR 0017's rejected-alternative note.

    **Prior-bolus IOB is deliberately NOT credited**, though the #181 plan (Q4)
    called for it. Isolation here is asymmetric (post-only — a meal 1–2 h earlier
    is allowed), so prior bolus IOB acting through the window is usually a *prior
    meal's* insulin covering *prior* carbs; crediting that residual to this meal
    double-books separate carbs and only adds variance. Symmetric isolation would
    be needed to credit it honestly, and that decimates the sample. See ADR 0017.

    Meals whose outcome can't be read (a CGM gap at the full-DIA read, or no
    resolvable starting BG) keep the old correction-only ``true_ic`` (full
    ``meal_dose + post_correction``, no curve weighting) and are flagged
    (``bg_outcome_u=None``). Omitting either argument preserves the original
    correction-only behaviour.

    ``carb_entries`` (#125/#127) remain the manual unbolused-carb log, not a food
    diary. A post-window entry still excludes the meal unless it passes the
    pre-empted-low attribution gate for this exact meal. A known-grams attributed
    rescue enters only a closed full ledger; unknown/unclosed rescues stay out of
    the numeric pool and are left for ``analyze_ic``'s gate-only fallback.

    ``harm_lows`` (ADR 0038 §5) re-admits a **printed-and-rescued** meal that
    post-meal isolation would otherwise evict: one that printed a low, was rescued
    with logged carbs, and recovered to baseline by the full-DIA read. It re-enters
    the balance sheet with its rescue grams as carbs-covered, but only through the
    three gates documented on :class:`IcConfig` (started near target, no
    rebound-high, low attributable to this meal's own IOB). Without ``harm_lows``
    (no harm layer) these meals stay evicted, and the harm I:C arm still gates them.
    """
    cfg = config
    # Isolation is computed over the *unfiltered* meal set (every _is_meal bolus,
    # including the non-completed legs dropped from the burden pool below): a partial
    # abort and its re-issue are still a real eating event whose corrections and CGM
    # rise would contaminate a neighbouring meal, so they must keep breaking isolation
    # even though neither itself yields a burden (#219).
    carb_entries = carb_entries or []
    basal_events = basal_events or []
    harm_lows = harm_lows or []
    # ``bolus_events`` includes one Accounting-DIA of lead-in when called through
    # the public facade. Direct analyzer callers historically pass a complete
    # synthetic stream without declaring its coverage; preserve that interface by
    # treating the span before their first row as observed.
    if prior_action_observed_from is None:
        first_bolus = min((b.t for b in bolus_events), default=None)
        if first_bolus is not None:
            prior_action_observed_from = first_bolus - timedelta(
                minutes=ACCOUNTING_DIA_MIN)
    prior_iob = BolusIob(bolus_events, ACCOUNTING_PEAK_MIN, ACCOUNTING_DIA_MIN)
    candidate_meals = [b for b in bolus_events if _is_meal(b, cfg)]
    meal_times = sorted(m.t for m in candidate_meals)
    preempted_rescues = _preempted_rescues(carb_entries, bolus_events, cgm_readings)
    # #219: keep non-completed carb legs out of the I:C pool. A partial abort /
    # alarm-kill truncated the delivered dose, so carbs / delivered inflates
    # true_ic; and a Completed bolus that immediately re-issues a *contaminating*
    # abort (one that already delivered ≥ abort_contaminates_dose_u) is itself
    # truncated, because the pump's calculator subtracted the already-delivered
    # partial. A 0-U abort delivered nothing to subtract, so its re-issue is a clean,
    # correct meal and is kept (the ε switch is exactly that distinction).
    aborts = _contaminating_aborts(bolus_events, cfg)
    meals = [m for m in candidate_meals if not _dose_is_untrustworthy(m, aborts, cfg)]
    # Each correction carries its provenance (is_automatic_bolus: True=CIQ auto,
    # False=user, None=unknown/no Msg2) so the per-meal burden can be split (#186).
    corrections = sorted(((b.t, b.insulin, b.is_automatic_bolus)
                          for b in bolus_events if _is_correction(b)),
                         key=lambda r: r[0])
    # One CGM view. The outcome read bisects `times` over its own window, so the
    # series' max_stale only governs `nearest` — which is used solely to resolve
    # the pre-meal bg0, hence ±bg0_max_gap_min.
    cgm = (CgmSeries(cgm_readings, timedelta(minutes=cfg.bg0_max_gap_min))
           if cgm_readings is not None and isf_effective else None)

    out: List[MealBurden] = []
    window = timedelta(minutes=cfg.post_meal_min)
    for m in meals:
        window_end = m.t + window
        # Asymmetric (post-only) isolation: exclude this meal if any *other* meal
        # falls in the post-meal window (m.t, m.t + 4h]. A preceding meal does NOT
        # contaminate the CGM outcome path, so no pre-meal look-back is needed.
        if any(other != m.t and m.t < other <= window_end
               for other in meal_times):
            continue

        history_complete = (
            prior_action_observed_from is not None
            and prior_action_observed_from
            <= m.t - timedelta(minutes=ACCOUNTING_DIA_MIN)
        )
        prior_meal_action: Optional[float]
        prior_correction_action: Optional[float]
        prior_action_status: str
        if history_complete:
            prior_meal_action = 0.0
            prior_correction_action = 0.0
            for source, residual in prior_iob.contributions_at(m.t):
                if source.t >= m.t:
                    continue
                if source.carbs is not None and source.carbs > 0:
                    prior_meal_action += residual
                else:
                    prior_correction_action += residual
            prior_action_status = (
                "supported"
                if prior_meal_action < cfg.max_prior_meal_action_u
                else "contaminated"
            )
        else:
            # Sparse pump IOB cannot separate correction-only from carb-bearing
            # action, so it cannot substitute for the observable source history.
            prior_meal_action = None
            prior_correction_action = None
            prior_action_status = "unknown"

        window_entries = [c for c in carb_entries if m.t < c.t <= window_end]
        meal_rescues = [
            r for r in preempted_rescues
            if r.bucket == "ic" and r.bolus_t == m.t and m.t < r.entry.t <= window_end
        ]
        rescue_entries = {r.entry for r in meal_rescues}

        # Starting BG (#175) and the full-DIA outcome are resolved up front because
        # the printed-and-rescued admission gate below (ADR 0038 §5) reads bg0 (gate
        # a) and the outcome-window CGM (gate b). bg0 is the bolus row's own reading,
        # else a CGM reading within ±bg0_max_gap_min of the bolus. The outcome is the
        # BG travelled from bg0 to the full-DIA read; without a starting BG there is
        # no baseline, so the meal falls back to correction-only rather than assuming
        # it started at target (the exact bias #175 removes).
        bg0: Optional[float] = meal_start_bg(m, cgm)
        bg_outcome_u: Optional[float] = None
        outcome_bg: Optional[float] = None
        outcome_t: Optional[datetime] = None
        if cgm is not None:
            outcome = _outcome_bg(cgm, m.t, cfg)
            if outcome is not None:
                outcome_bg, outcome_t = outcome
            if outcome_bg is not None and bg0 is not None:
                bg_outcome_u = round((outcome_bg - bg0) / isf_effective, 3)

        # ADR 0038 §5: re-admit a printed-and-rescued meal through three gates,
        # counting its rescue grams as carbs-covered instead of letting the rescue
        # carb log evict it via the isolation check below. The gates: this meal owns
        # an attributable printed low (c), it started near target (a), and BG did not
        # rebound high after the rescue (b). A failing gate leaves the meal evicted
        # (correctly guarded out); the harm I:C arm still gates it separately.
        printed_rescues: List[CarbEntry] = []
        meal_lows = _meal_printed_lows(m.t, window_end, harm_lows)
        started_near_target = (
            bg0 is not None
            and cfg.rescue_bg0_band_lo <= bg0 <= cfg.rescue_bg0_band_hi
        )
        if meal_lows and cgm is not None and started_near_target:
            proximity = timedelta(minutes=cfg.rescue_low_proximity_min)
            candidates = [
                c for c in window_entries
                if c not in rescue_entries and c.source == "manual"
                and any(abs(low.t - c.t) <= proximity for low in meal_lows)
            ]
            if candidates:
                rebound_hi = m.t + timedelta(
                    minutes=cfg.outcome_at_min + cfg.outcome_tol_min)
                peak = _peak_bg_between(cgm, min(c.t for c in candidates), rebound_hi)
                if peak is None or peak < cfg.rescue_rebound_bg:
                    printed_rescues = candidates

        rescue_carb_entries = [r.entry for r in meal_rescues] + printed_rescues
        admitted = rescue_entries | set(printed_rescues)
        if any(c not in admitted for c in window_entries):
            continue
        # IOB-aware correction guard (#181): zero the post-meal corrections only when
        # the pump's own reported IOB at the meal exceeds cfg.guard_pump_iob_u — the
        # meal was dosed on top of substantial prior insulin, so those corrections are
        # cleaning up that overhang, not this meal. Replaces the old time-only "prior
        # meal within 2 h" guard, which zeroed regardless of how much was actually on
        # board. A meal with no pump_iob never trips it (corrections are kept).
        guard_fires = m.pump_iob is not None and m.pump_iob > cfg.guard_pump_iob_u
        if guard_fires:
            in_window: List[Tuple[datetime, float, Optional[bool]]] = []
        else:
            in_window = [(t, amt, auto) for (t, amt, auto) in corrections
                         if m.t < t <= window_end]
        post = sum(amt for _, amt, _ in in_window)
        post_user = sum(amt for _, amt, auto in in_window if auto is False)
        post_ciq = sum(amt for _, amt, auto in in_window if auto is True)
        post_unknown = sum(amt for _, amt, auto in in_window if auto is None)
        n_user = sum(1 for _, _, auto in in_window if auto is False)
        n_ciq = sum(1 for _, _, auto in in_window if auto is True)
        n_unknown = sum(1 for _, _, auto in in_window if auto is None)
        total = m.insulin + post
        if total <= 0:
            continue

        rescue_carbs = sum(
            float(c.grams) for c in rescue_carb_entries if c.grams is not None
        )
        # Rescue-bearing meals only become numeric when the full ledger closes:
        # known grams, attributable to this meal, and a readable full-DIA outcome.
        # Otherwise the rescue is a censored (pre-empted or printed-and-rescued) low
        # that analyze_ic can use as a gate-only safety fact, not as a fabricated
        # denominator/numerator.
        if rescue_carb_entries and (
            any(c.grams is None for c in rescue_carb_entries)
            or bg_outcome_u is None
        ):
            continue

        ciq_basal_delta_u = 0.0
        ciq_basal_delta_acted = 0.0
        if bg_outcome_u is not None:
            # Insulin-acted balance sheet (#181/ADR 0017), read at full DIA: the
            # meal bolus is fully acted by outcome_t so it enters at face value
            # (_acted of the whole curve), while the post-corrections are weighted
            # by the fraction absorbed by the read — one delivered near the read
            # has barely acted and must not count in full. CIQ basal delta is the
            # signed meal compensation term from ADR 0041: extra basal positive,
            # withheld basal negative. Prior-bolus IOB is intentionally excluded
            # (see the function docstring) — only this meal's own ledger counts.
            bolus_acted = _acted([(m.t, m.insulin)], m.t, outcome_t)
            post_corr_acted = _acted(
                [(t, amt) for (t, amt, _) in in_window], m.t, outcome_t)
            basal_delta_doses = _ciq_basal_delta_doses(basal_events, m.t, outcome_t)
            ciq_basal_delta_u = sum(amt for _, amt in basal_delta_doses)
            ciq_basal_delta_acted = _acted_signed(basal_delta_doses, m.t, outcome_t)
            insulin_acted = bolus_acted + post_corr_acted + ciq_basal_delta_acted
            corrected_total = insulin_acted + bg_outcome_u
            # A large negative outcome (confirmed severe hypo) would drive the
            # effective insulin to zero or below — a nonsensical ratio. Dropping it
            # to the correction-only true_ic would make an over-covered meal look
            # perfectly covered, biasing toward over-coverage exactly on the meals
            # that prove it. Instead floor the denominator at a small fraction of the
            # positive meal/correction/extra-basal insulin so the meal stays in as
            # (extreme) over-coverage evidence.
            floor_base = bolus_acted + post_corr_acted + max(ciq_basal_delta_acted, 0.0)
            effective_insulin = max(corrected_total,
                                    cfg.hypo_floor_frac * floor_base)
        else:
            effective_insulin = total
        carbs_covered = float(m.carbs) + rescue_carbs
        true_ic = carbs_covered / effective_insulin

        out.append(MealBurden(t=m.t, carbs=round(carbs_covered, 3),
                              meal_carbs=m.carbs, meal_dose=m.insulin,
                              post_correction=round(post, 3),
                              true_ic=round(true_ic, 3),
                              effective_insulin=round(effective_insulin, 4),
                              rescue_carbs=round(rescue_carbs, 3),
                              rescue_carb_times=tuple(c.t for c in rescue_carb_entries),
                              ciq_basal_delta_u=round(ciq_basal_delta_u, 4),
                              ciq_basal_delta_acted_u=round(ciq_basal_delta_acted, 4),
                              bg_outcome_u=bg_outcome_u,
                              outcome_bg=outcome_bg,
                              bg0=bg0,
                              post_correction_user=round(post_user, 3),
                              post_correction_ciq=round(post_ciq, 3),
                              post_correction_unknown=round(post_unknown, 3),
                              n_correction_user=n_user,
                              n_correction_ciq=n_ciq,
                              n_correction_unknown=n_unknown,
                              prior_meal_action_u=(
                                  round(prior_meal_action, 4)
                                  if prior_meal_action is not None else None
                              ),
                              prior_correction_action_u=(
                                  round(prior_correction_action, 4)
                                  if prior_correction_action is not None else None
                              ),
                              prior_action_status=prior_action_status))
    return out


@dataclass(frozen=True)
class RunMeal:
    """One member meal of a :class:`MealRun`, with its own raw facts retained.

    A mid-chain meal has no closed ledger of its own — its insulin is still acting
    when the next meal lands, which is exactly why the run is the unit that closes.
    What it *does* have is raw, per-meal facts, and the pooled meal-list findings
    (meals-start-high, post-meal correction burden) count meals, not runs. So every
    member keeps its own starting BG, correction burden and provenance split, its
    own sub-window CIQ basal delta, and its own prior-action reconstruction.
    """

    t: datetime
    carbs: float
    dose: float
    bg0: Optional[float] = None
    # Correction insulin inside this meal's own sub-window — (meal, next meal] for a
    # mid-chain meal, the full ``post_meal_min`` for the last. The sub-windows
    # partition the run's span, so the run total never double-counts a correction.
    post_correction: float = 0.0
    post_correction_user: float = 0.0
    post_correction_ciq: float = 0.0
    post_correction_unknown: float = 0.0
    n_correction_user: int = 0
    n_correction_ciq: int = 0
    n_correction_unknown: int = 0
    # The IOB-aware correction guard (#181) is applied PER MEMBER: it zeroes only
    # the window contribution of the meal that was dosed on a big IOB overhang.
    guard_fired: bool = False
    ciq_basal_delta_u: float = 0.0
    rescue_carbs: float = 0.0
    rescue_carb_times: Tuple[datetime, ...] = ()
    prior_meal_action_u: Optional[float] = 0.0
    prior_correction_action_u: Optional[float] = 0.0
    prior_action_status: str = "supported"


@dataclass(frozen=True)
class MealRun:
    """The ADR 0017 balance sheet closed over a maximal *chain* of meals (#518).

    :class:`MealBurden` closes the same ledger over a single post-isolated meal,
    which admits only chain-terminal meals: on the reference data a small minority
    of qualifying meals carry the number at 30 days, and breakfast contributes none
    of them. A run keeps the chain intact instead of discarding it — carbs in, insulin
    out, read once at full DIA after the LAST bolus, when every member's insulin is
    spent. A run of one meal is exactly a :class:`MealBurden` (pinned by test).

    ``carbs_covered`` is :attr:`MealBurden.carbs` under a name that says what it is;
    ``effective_insulin`` is the same floored denominator, so ``true_ic`` is the same
    ratio in the same units (g/U).
    """

    t: datetime                      # first member bolus — the run's start, its bg0
    end_t: datetime                  # last member bolus — the outcome is read off it
    meals: Tuple[RunMeal, ...]
    carbs_covered: float             # member carbs + attributed rescue grams
    meal_carbs: float
    meal_dose: float                 # summed member boluses
    post_correction: float
    true_ic: float                   # carbs_covered / effective_insulin
    effective_insulin: float
    rescue_carbs: float = 0.0
    rescue_carb_times: Tuple[datetime, ...] = ()
    ciq_basal_delta_u: float = 0.0
    ciq_basal_delta_acted_u: float = 0.0
    bg_outcome_u: Optional[float] = None
    outcome_bg: Optional[float] = None
    bg0: Optional[float] = None
    # Hypo-floor demotion. The outcome BG can confirm a hypo deep enough to drive the
    # ledger's insulin to zero or below; the denominator is then floored (as in
    # :func:`meal_burdens`) so the run survives as over-coverage evidence, but the
    # floored number is an assumption, not a measurement. A directional-only run is
    # therefore real evidence for harm gating and the over-coverage direction, and is
    # excluded from the numeric pool rather than pooled behind a fabricated
    # denominator. The consuming gate lands in PR-B of #518.
    directional_only: bool = False
    post_correction_user: float = 0.0
    post_correction_ciq: float = 0.0
    post_correction_unknown: float = 0.0
    n_correction_user: int = 0
    n_correction_ciq: int = 0
    n_correction_unknown: int = 0
    # Prior-meal identifiability (#481) at the RUN's start. A run begins where no
    # meal preceded it inside ``post_meal_min``, so this is the same quantity #481
    # reads on an isolated meal; mid-chain members are covered by their own run's
    # insulin by construction and carry their (uninformative) reconstruction on
    # :class:`RunMeal` for display only.
    prior_meal_action_u: Optional[float] = 0.0
    prior_correction_action_u: Optional[float] = 0.0
    prior_action_status: str = "supported"

    @property
    def has_outcome(self) -> bool:
        """Whether the full-DIA BG outcome was read vs. a correction-only fallback."""
        return self.bg_outcome_u is not None

    @property
    def n_meals(self) -> int:
        return len(self.meals)


def run_burdens(bolus_events: List[BolusEvent],
                config: IcConfig = IcConfig(),
                *,
                cgm_readings: Optional[List[CgmReading]] = None,
                isf_effective: Optional[float] = None,
                carb_entries: Optional[List[CarbEntry]] = None,
                basal_events: Optional[List[BasalEvent]] = None,
                harm_lows: Optional[Sequence[PrintedLow]] = None,
                prior_action_observed_from: Optional[datetime] = None,
                ) -> List[MealRun]:
    """The ADR 0017 ledger closed over maximal meal *chains* (#518).

    A **run** is a maximal chain of qualifying meals whose consecutive boluses sit
    no more than ``post_meal_min`` apart. Because that gap is welded to
    ``outcome_at_min + outcome_tol_min`` (:meth:`IcConfig.__post_init__`), the meal
    that ends a run has no follow-on meal inside its outcome window — a run's read
    is DIA-clean by construction, the same guarantee post-only isolation buys a
    lone meal, without throwing the chain away.

    The balance sheet is :func:`meal_burdens`'s, summed over the members:

        carbs_covered = Σ member carbs + attributable rescue carbs

        effective_insulin = Σ member boluses (acted)
                          + post-corrections acted by the read
                          + acted CIQ basal delta versus programmed
                          + (outcome_bg − bg0) / ISF

    with ``bg0`` the FIRST member's starting BG and the outcome read at full
    Accounting DIA after the LAST member's bolus, so every member's bolus is spent
    at the read and enters at face value. Corrections and the CIQ basal delta are
    gathered per member over that member's own sub-window, clipped at the next
    member — the sub-windows partition the run's span (no double count) and each
    keeps ADR 0041's 5 h justification at any run length.

    Admission mirrors :func:`meal_burdens` exactly, at run scope:

    * a member whose delivered dose can't be trusted (#219 non-completed leg or
      truncated re-issue) **breaks the run without contributing** — the whole chain
      is dropped, which is what post-only isolation already does to such a meal's
      neighbours today;
    * a carb-log entry anywhere in the run's span that isn't an attributed rescue
      **evicts the run** (#125/#127 — an unbolused-carb entry means the ledger's
      carb side is incomplete);
    * rescue grams enter the numerator only through the shipped ADR 0038 §5
      attribution, gated per member meal on that meal's own ``bg0``, rebound and
      meal-owned printed low;
    * the IOB-aware correction guard (#181) applies per member;
    * a hypo-floored denominator marks the run ``directional_only`` instead of
      pooling a fabricated number.

    **A single-meal run reproduces :func:`meal_burdens` field for field** — the
    generalization regression, pinned by test.

    This is measurement machinery only: ``analyze_ic`` does not call it yet. PR-B of
    #518 rewires the estimate onto it.
    """
    cfg = config
    carb_entries = carb_entries or []
    basal_events = basal_events or []
    harm_lows = harm_lows or []
    if prior_action_observed_from is None:
        first_bolus = min((b.t for b in bolus_events), default=None)
        if first_bolus is not None:
            prior_action_observed_from = first_bolus - timedelta(
                minutes=ACCOUNTING_DIA_MIN)
    prior_iob = BolusIob(bolus_events, ACCOUNTING_PEAK_MIN, ACCOUNTING_DIA_MIN)
    # Sorted once for the whole run, then bisected per member window (see
    # :class:`_BasalWindowIndex`) — at 90 days the naive per-meal scan of the 5-min
    # basal feed is the single dominant cost of the read.
    basal_index = _BasalWindowIndex(basal_events)
    window = timedelta(minutes=cfg.post_meal_min)
    # Chains form over the UNFILTERED meal set, exactly as isolation does today: a
    # non-completed leg is still a real eating event whose CGM rise and corrections
    # sit inside the run, so it has to break the chain rather than be skipped over.
    candidate_meals = sorted(
        (b for b in bolus_events if _is_meal(b, cfg)), key=lambda b: b.t)
    aborts = _contaminating_aborts(bolus_events, cfg)
    preempted_rescues = _preempted_rescues(carb_entries, bolus_events, cgm_readings)
    corrections = sorted(((b.t, b.insulin, b.is_automatic_bolus)
                          for b in bolus_events if _is_correction(b)),
                         key=lambda r: r[0])
    cgm = (CgmSeries(cgm_readings, timedelta(minutes=cfg.bg0_max_gap_min))
           if cgm_readings is not None and isf_effective else None)

    # Two meal boluses sharing a timestamp to the second (distinct seqNums, #194)
    # sit at a zero gap and therefore CHAIN — one run whose members are both legs of
    # what the pump recorded at one instant, their carbs and doses both counted.
    # ``meal_burdens``'s isolation check reads the other way (``other != m.t`` means a
    # same-instant meal does not evict), which is the one place the two ledgers
    # differ: the run keeps both legs' evidence where isolation silently kept one
    # meal's carbs against both meals' insulin.
    chains: List[List[BolusEvent]] = []
    for m in candidate_meals:
        if chains and m.t - chains[-1][-1].t <= window:
            chains[-1].append(m)
        else:
            chains.append([m])

    out: List[MealRun] = []
    for members in chains:
        if any(_dose_is_untrustworthy(m, aborts, cfg) for m in members):
            continue
        first, last = members[0], members[-1]
        run_end = last.t + window

        bg0 = meal_start_bg(first, cgm)
        bg_outcome_u: Optional[float] = None
        outcome_bg: Optional[float] = None
        outcome_t: Optional[datetime] = None
        if cgm is not None:
            outcome = _outcome_bg(cgm, last.t, cfg)
            if outcome is not None:
                outcome_bg, outcome_t = outcome
            if outcome_bg is not None and bg0 is not None:
                bg_outcome_u = round((outcome_bg - bg0) / isf_effective, 3)

        # Rescue attribution stays MEAL-scoped (the shipped ADR 0038 §5 gates read a
        # meal's own start BG and its own owned low); the run just unions what its
        # members legitimately claim.
        #
        # Keyed by member POSITION, never by ``m.t``: two boluses can carry the same
        # timestamp to the second (they are keyed on distinct pump seqNums, #194), and
        # a rescue attributed to that instant matches every member sharing it. Keyed by
        # time, one logged rescue would then be emitted once per colliding member and
        # its grams counted twice on the carb side of the ledger.
        #
        # A rescue that two members could claim goes to the EARLIEST — ``claimed``
        # grows as the loops walk members in time order. That is the conservative
        # choice: the earlier bolus is the one whose insulin had been acting longest
        # when the rescue was logged, and crediting the later member would move grams
        # toward a meal that had barely started to act. Either way the grams enter the
        # run's numerator exactly once, so the run's own ratio is unaffected — the
        # choice only decides which member displays them.
        member_bg0 = [meal_start_bg(m, cgm) for m in members]
        attributed: List[List[CarbEntry]] = [[] for _ in members]
        claimed: set = set()
        for i, m in enumerate(members):
            m_end = m.t + window
            m_rescues = [
                r for r in preempted_rescues
                if r.bucket == "ic" and r.bolus_t == m.t and m.t < r.entry.t <= m_end
                and r.entry not in claimed
            ]
            attributed[i] = [r.entry for r in m_rescues]
            claimed |= {r.entry for r in m_rescues}
        for i, m in enumerate(members):
            m_end = m.t + window
            m_bg0 = member_bg0[i]
            meal_lows = _meal_printed_lows(m.t, m_end, harm_lows)
            started_near_target = (
                m_bg0 is not None
                and cfg.rescue_bg0_band_lo <= m_bg0 <= cfg.rescue_bg0_band_hi
            )
            if not (meal_lows and cgm is not None and started_near_target):
                continue
            proximity = timedelta(minutes=cfg.rescue_low_proximity_min)
            candidates = [
                c for c in carb_entries
                if m.t < c.t <= m_end and c not in claimed and c.source == "manual"
                and any(abs(low.t - c.t) <= proximity for low in meal_lows)
            ]
            if not candidates:
                continue
            rebound_hi = m.t + timedelta(
                minutes=cfg.outcome_at_min + cfg.outcome_tol_min)
            peak = _peak_bg_between(cgm, min(c.t for c in candidates), rebound_hi)
            if peak is None or peak < cfg.rescue_rebound_bg:
                attributed[i] = attributed[i] + candidates
                claimed |= set(candidates)

        # An unattributable carb-log entry anywhere in the run's span evicts the run.
        if any(c not in claimed for c in carb_entries if first.t < c.t <= run_end):
            continue
        rescue_carb_entries = [c for entries in attributed for c in entries]
        # A rescue-bearing run only becomes numeric when the ledger closes: known
        # grams and a readable full-DIA outcome. Otherwise the rescue is a censored
        # low, a gate-only safety fact rather than a fabricated numerator.
        if rescue_carb_entries and (
            any(c.grams is None for c in rescue_carb_entries)
            or bg_outcome_u is None
        ):
            continue

        run_meals: List[RunMeal] = []
        correction_doses: List[Tuple[datetime, float]] = []
        basal_delta_doses: List[Tuple[datetime, float]] = []
        for i, m in enumerate(members):
            # Each member's own sub-window, clipped at the next member.
            m_end = m.t + window
            corr_end = min(m_end, members[i + 1].t) if i + 1 < len(members) else m_end
            guard_fired = m.pump_iob is not None and m.pump_iob > cfg.guard_pump_iob_u
            in_window = ([] if guard_fired else
                         [(t, amt, auto) for (t, amt, auto) in corrections
                          if m.t < t <= corr_end])
            correction_doses.extend((t, amt) for (t, amt, _) in in_window)
            # ADR 0041's basal term, per member over the same clipped sub-window —
            # the last member's runs out to the read instant, as it does today. Only
            # a closed (outcome-confirmed) ledger carries a basal term at all.
            m_basal: List[Tuple[datetime, float]] = []
            if bg_outcome_u is not None and outcome_t is not None:
                m_basal_end = (outcome_t if i + 1 == len(members)
                               else min(corr_end, outcome_t))
                m_basal = _ciq_basal_delta_doses(basal_index, m.t, m_basal_end)
            basal_delta_doses.extend(m_basal)

            history_complete = (
                prior_action_observed_from is not None
                and prior_action_observed_from
                <= m.t - timedelta(minutes=ACCOUNTING_DIA_MIN)
            )
            if history_complete:
                prior_meal_action: Optional[float] = 0.0
                prior_correction_action: Optional[float] = 0.0
                for source, residual in prior_iob.contributions_at(m.t):
                    if source.t >= m.t:
                        continue
                    if source.carbs is not None and source.carbs > 0:
                        prior_meal_action += residual
                    else:
                        prior_correction_action += residual
                prior_action_status = (
                    "supported"
                    if prior_meal_action < cfg.max_prior_meal_action_u
                    else "contaminated"
                )
            else:
                prior_meal_action = None
                prior_correction_action = None
                prior_action_status = "unknown"

            m_rescues = attributed[i]
            run_meals.append(RunMeal(
                t=m.t,
                carbs=m.carbs,
                dose=m.insulin,
                bg0=member_bg0[i],
                post_correction=round(sum(amt for _, amt, _ in in_window), 3),
                post_correction_user=round(
                    sum(amt for _, amt, auto in in_window if auto is False), 3),
                post_correction_ciq=round(
                    sum(amt for _, amt, auto in in_window if auto is True), 3),
                post_correction_unknown=round(
                    sum(amt for _, amt, auto in in_window if auto is None), 3),
                n_correction_user=sum(1 for _, _, auto in in_window if auto is False),
                n_correction_ciq=sum(1 for _, _, auto in in_window if auto is True),
                n_correction_unknown=sum(1 for _, _, auto in in_window if auto is None),
                guard_fired=guard_fired,
                ciq_basal_delta_u=round(sum(amt for _, amt in m_basal), 4),
                rescue_carbs=round(
                    sum(float(c.grams) for c in m_rescues if c.grams is not None), 3),
                rescue_carb_times=tuple(c.t for c in m_rescues),
                prior_meal_action_u=(
                    round(prior_meal_action, 4)
                    if prior_meal_action is not None else None
                ),
                prior_correction_action_u=(
                    round(prior_correction_action, 4)
                    if prior_correction_action is not None else None
                ),
                prior_action_status=prior_action_status,
            ))

        meal_dose = sum(m.insulin for m in members)
        post = sum(amt for _, amt in correction_doses)
        total = meal_dose + post
        if total <= 0:
            continue

        rescue_carbs = sum(
            float(c.grams) for c in rescue_carb_entries if c.grams is not None)
        ciq_basal_delta_u = 0.0
        ciq_basal_delta_acted = 0.0
        directional_only = False
        if bg_outcome_u is not None:
            bolus_acted = _acted([(m.t, m.insulin) for m in members],
                                 first.t, outcome_t)
            post_corr_acted = _acted(correction_doses, first.t, outcome_t)
            ciq_basal_delta_u = sum(amt for _, amt in basal_delta_doses)
            ciq_basal_delta_acted = _acted_signed(
                basal_delta_doses, first.t, outcome_t)
            insulin_acted = bolus_acted + post_corr_acted + ciq_basal_delta_acted
            corrected_total = insulin_acted + bg_outcome_u
            floor_base = bolus_acted + post_corr_acted + max(ciq_basal_delta_acted, 0.0)
            floor = cfg.hypo_floor_frac * floor_base
            directional_only = corrected_total < floor
            effective_insulin = max(corrected_total, floor)
        else:
            effective_insulin = total
        carbs_covered = float(sum(m.carbs for m in members)) + rescue_carbs

        out.append(MealRun(
            t=first.t,
            end_t=last.t,
            meals=tuple(run_meals),
            carbs_covered=round(carbs_covered, 3),
            meal_carbs=sum(m.carbs for m in members),
            meal_dose=meal_dose,
            post_correction=round(post, 3),
            true_ic=round(carbs_covered / effective_insulin, 3),
            effective_insulin=round(effective_insulin, 4),
            rescue_carbs=round(rescue_carbs, 3),
            rescue_carb_times=tuple(c.t for c in rescue_carb_entries),
            ciq_basal_delta_u=round(ciq_basal_delta_u, 4),
            ciq_basal_delta_acted_u=round(ciq_basal_delta_acted, 4),
            bg_outcome_u=bg_outcome_u,
            outcome_bg=outcome_bg,
            bg0=bg0,
            directional_only=directional_only,
            post_correction_user=round(
                sum(rm.post_correction_user for rm in run_meals), 3),
            post_correction_ciq=round(
                sum(rm.post_correction_ciq for rm in run_meals), 3),
            post_correction_unknown=round(
                sum(rm.post_correction_unknown for rm in run_meals), 3),
            n_correction_user=sum(rm.n_correction_user for rm in run_meals),
            n_correction_ciq=sum(rm.n_correction_ciq for rm in run_meals),
            n_correction_unknown=sum(rm.n_correction_unknown for rm in run_meals),
            prior_meal_action_u=run_meals[0].prior_meal_action_u,
            prior_correction_action_u=run_meals[0].prior_correction_action_u,
            prior_action_status=run_meals[0].prior_action_status,
        ))
    return out


# Static cross-reference the I:C card appends to a *confirmed* or *loosened* segment
# when the meals-start-high finding fires: there the ratio is not the problem, so point
# at the lever that is. Never appended to a tightened segment (the ratio itself is being
# flagged) — see analyze_ic. Plain-ASCII to match the rest of the copy in this module.
_START_HIGH_XREF = (
    " Pre-meal BG is the bigger lever here — see the 'meals start high' finding."
)


def _meals_start_high_finding(burdens: List[MealBurden]) -> Optional[Finding]:
    """The pre-meal-high signal #175 displaced from the I:C outcome math, as a Finding.

    #175 stopped booking insulin-spent-on-a-pre-meal-high as carb coverage, which was
    biasing every I:C rec toward 'tighten'. That real signal (most meals starting well
    above CIQ's 110 target) then had no home. This surfaces it as a *behavioral* finding
    framed as a delta — "meals start X points above target" — when the median starting
    BG across the meals with a known start (``bg0`` is not None) exceeds the target.

    The copy is coaching, not a parameter prescription: it names pre-bolus timing and a
    pre-meal correction as the levers and never tells the user to change their ratio.
    ``correction_insulin`` is deliberately *not* read to split or qualify the finding —
    the pump's correction split is IOB-netted and hides the pre-meal-high insulin inside
    the food component (see #175, "Why the Msg3 split does NOT fix this"), so it cannot
    tell whether the user already corrected. ``bg0`` is the only input.
    """
    bg0s = [b.bg0 for b in burdens if b.bg0 is not None]
    if not bg0s:
        return None
    median_bg0 = statistics.median(bg0s)
    if median_bg0 <= TARGET_BG:
        return None
    delta = median_bg0 - TARGET_BG
    summary = (
        f"Your meals start high: the median pre-meal BG is {median_bg0:.0f} mg/dL — "
        f"about {delta:.0f} points above CIQ's {TARGET_BG:.0f} target. That pre-meal "
        f"gap, not the ratio, is doing most of the work. Bolusing a little earlier "
        f"(pre-bolus timing) and bringing a high down before you eat (a pre-meal "
        f"correction) both start the meal closer to target."
    )
    occurrences = sorted(
        [Occurrence(t=b.t,
                    detail=f"started at {b.bg0:.0f} mg/dL ({b.bg0 - TARGET_BG:+.0f} "
                           f"vs target)")
         for b in burdens if b.bg0 is not None],
        key=lambda o: o.t, reverse=True,
    )[:20]
    return Finding(
        detector="meals-start-high",
        severity="medium",
        summary=summary,
        evidence={
            "median_bg0": round(median_bg0, 1),
            "target": TARGET_BG,
            "delta": round(delta, 1),
            "n_meals": len(bg0s),
            # Per-meal starting BGs for the UI scatter (if/when one is added).
            "start_bgs": bg0s,
            # The related *post-meal* signal — how much CIQ cleans up after meals.
            "see_also": "#65-B (CIQ is cleaning up after your meals)",
        },
        occurrences=occurrences,
    )


def _segment_label(start_min: int) -> str:
    return f"{start_min // 60:02d}:{start_min % 60:02d}"


def _segment_for(tod_min: int, segments: List[Tuple[int, float]]) -> int:
    idx = 0
    for i, (start, _) in enumerate(segments):
        if start <= tod_min:
            idx = i
    return idx


def _recommend(programmed: Optional[float], measured: Optional[float],
               cfg: IcConfig) -> Tuple[Optional[float], str]:
    if measured is None:
        return None, "not enough isolated carb-tagged meals to estimate I:C"
    if programmed is None:
        return round(measured, 1), "implied I:C from post-meal correction burden"
    # Half the gap toward the measured ratio, still capped at ±max_step_frac (#410). Moving
    # only halfway each window converges without the ping-pong a full-step chase produces
    # (forecast: full steps reversed 2–3× per 12 weeks; half-gap ~3% final error, fewest
    # reversals). The gap decides the safe recommendation; Priority then prices that
    # concrete step to decide whether it is actionable now. Priority never scales the step
    # a second time — later windows re-measure and price the next half-gap (ADR 435).
    half_gap = programmed + (measured - programmed) / 2.0
    step_lo = programmed * (1.0 - cfg.max_step_frac)
    step_hi = programmed * (1.0 + cfg.max_step_frac)
    rec = round(min(max(half_gap, step_lo), step_hi), 1)
    if measured < programmed:
        ann = ("post-meal corrections imply meals are under-covered — a tighter "
               "(smaller) I:C would dose more per carb")
    elif measured > programmed:
        ann = "meals look slightly over-covered relative to programmed I:C"
    else:
        ann = "measured matches programmed"
    return rec, ann


def _ic_pool(seg_burdens: List[MealBurden]) -> List[MealBurden]:
    """The supported, mixture-consistent meals that may set numeric I:C direction."""
    supported = [
        burden for burden in seg_burdens
        if burden.prior_action_status == "supported"
    ]
    confirmed = [burden for burden in supported if burden.has_outcome]
    return confirmed if confirmed else supported


def _ic_estimate(seg_burdens: List[MealBurden]) -> Estimate:
    """Pooled carb-weighted I:C over a segment's meals.

    Two mixture-aware choices vs. the old ``estimate_mean([true_ic])``:

    * **Point estimate is pooled** (``Σcarbs / Σinsulin`` via
      :func:`estimate_pooled_ratio`), not a mean of per-meal ``carbs/insulin``
      ratios. Mean-of-ratios overweights small meals and is biased high (~9%);
      pooling is the unbiased whole-dataset estimator.
    * **Fallback meals are excluded from the point estimate.** Meals whose
      outcome couldn't be read (``bg_outcome_u is None``) fall back to a
      correction-only ``true_ic`` and centre differently from outcome-confirmed
      meals; folding both into one estimate understates uncertainty (uncaptured
      mixture variance). When any meal has an outcome, estimate on that
      subpopulation alone; only when none do (correction-only mode, e.g. no CGM)
      do we use all of them.
    """
    used = _ic_pool(seg_burdens)
    return estimate_pooled_ratio([(b.carbs, b.effective_insulin) for b in used])


def _prior_action_evidence(
    seg_burdens: List[MealBurden],
    programmed: Optional[float],
    cfg: IcConfig,
) -> dict:
    """Coverage and 0–100% prior-meal-action sensitivity for one I:C segment."""
    supported = [
        burden for burden in seg_burdens
        if burden.prior_action_status == "supported"
    ]
    used = _ic_pool(seg_burdens)
    uncredited = None
    fully_credited = None
    if used:
        carbs = sum(burden.carbs for burden in used)
        insulin = sum(burden.effective_insulin for burden in used)
        prior_meal = sum(float(burden.prior_meal_action_u or 0.0) for burden in used)
        if insulin > 0:
            uncredited = carbs / insulin
            fully_credited = carbs / (insulin + prior_meal)
    bracket = [value for value in (uncredited, fully_credited) if value is not None]
    includes_programmed = bool(
        programmed is not None
        and len(bracket) == 2
        and abs(bracket[0] - bracket[1]) > 1e-9
        and min(bracket) <= programmed <= max(bracket)
    )
    return {
        "floor_u": cfg.max_prior_meal_action_u,
        "total_meals": len(seg_burdens),
        # ``supported_meals`` is the actual numeric pool and therefore matches
        # Estimate.n/runway. Supported meals without a readable outcome remain
        # coverage, but do not inflate the exit count when confirmed meals exist.
        "supported_meals": len(used),
        "supported_coverage_meals": len(supported),
        "contaminated_meals": sum(
            burden.prior_action_status == "contaminated"
            for burden in seg_burdens
        ),
        "unknown_meals": sum(
            burden.prior_action_status == "unknown"
            for burden in seg_burdens
        ),
        "correction_only_prehistory_meals": sum(
            bool(burden.prior_correction_action_u)
            for burden in used
        ),
        "required_supported_meals": cfg.min_meals,
        "additional_supported_meals_needed": max(0, cfg.min_meals - len(used)),
        "hold_reason": None,
        "sensitivity_bracket": {
            "uncredited": round(uncredited, 4) if uncredited is not None else None,
            "fully_credited": (
                round(fully_credited, 4) if fully_credited is not None else None
            ),
            "span": (
                round(abs(uncredited - fully_credited), 4)
                if uncredited is not None and fully_credited is not None else None
            ),
            "includes_programmed": includes_programmed,
        },
    }


def analyze_ic(
    bolus_events: List[BolusEvent],
    ic_segments: List[Tuple[int, float]],
    *,
    config: IcConfig = IcConfig(),
    cgm_readings: Optional[List[CgmReading]] = None,
    isf_effective: Optional[float] = None,
    carb_entries: Optional[List[CarbEntry]] = None,  # exclusion signal (#125/#127)
    basal_events: Optional[List[BasalEvent]] = None,
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
    analysis_start: Optional[datetime] = None,
    prior_action_observed_from: Optional[datetime] = None,
) -> Tuple[List[SegmentEstimate], List[Finding]]:
    """Per-segment I:C estimate plus any carb-counting Finding.

    ``ic_segments`` is the active profile's programmed I:C schedule
    (``[(start_min, carb_ratio)]``). When ``cgm_readings`` and ``isf_effective`` are
    supplied, each meal's ``true_ic`` folds in a signed BG-outcome (ran high/low),
    not just correction boluses — see :func:`meal_burdens`.
    """
    cfg = config
    segments = sorted(ic_segments) or [(0, None)]
    # The per-value blocks these segments group into (#518). Pure — it reads the
    # programmed schedule only — so the display rows can name their owner without any
    # of the block machinery's 90-day evidence.
    blocks = ic_blocks_from_segments(segments)
    carb_entries = carb_entries or []
    basal_events = basal_events or []
    # Printed lows the harm layer detected, computed once and shared by the
    # printed-and-rescued admission (ADR 0038 §5, in meal_burdens) and the I:C harm
    # arm below. Only available when the harm layer is on.
    lows: Optional[Sequence[PrintedLow]] = None
    if harm_config is not None:
        lows = (harm_lows if harm_lows is not None
                else find_printed_lows(cgm_readings or [], bolus_events, harm_config))
    burdens = meal_burdens(bolus_events, cfg,
                           cgm_readings=cgm_readings, isf_effective=isf_effective,
                           carb_entries=carb_entries, basal_events=basal_events,
                           harm_lows=lows,
                           prior_action_observed_from=prior_action_observed_from)
    if analysis_start is not None:
        burdens = [burden for burden in burdens if burden.t >= analysis_start]
    numeric_rescue_times = {
        t for b in burdens for t in b.rescue_carb_times
    }
    gate_only_rescues: Dict[int, List[PreemptedLowEntry]] = {}
    for rescue in _preempted_rescues(carb_entries, bolus_events, cgm_readings):
        if rescue.bucket != "ic" or rescue.bolus_t is None:
            continue
        if rescue.entry.t in numeric_rescue_times:
            continue
        tod = rescue.bolus_t.hour * 60 + rescue.bolus_t.minute
        gate_only_rescues.setdefault(_segment_for(tod, segments), []).append(rescue)

    harm = None
    if harm_config is not None:

        def _key(low: PrintedLow) -> Optional[int]:
            if low.dominant_bolus_t is None:
                return None
            tod = low.dominant_bolus_t.hour * 60 + low.dominant_bolus_t.minute
            return _segment_for(tod, segments)

        harm = arm_harm(
            lows,
            HarmArm.IC,
            _key,
            min_recurrence_nights=harm_config.min_recurrence_nights,
        )

    per_segment: List[List[MealBurden]] = [[] for _ in segments]
    for b in burdens:
        tod = b.t.hour * 60 + b.t.minute
        per_segment[_segment_for(tod, segments)].append(b)

    # The pre-meal-high behavioral signal (#178) is pooled across all segments; compute
    # it up front so the per-segment annotations can cross-reference it. It fires off the
    # median starting BG, independent of any segment's I:C direction.
    start_high = _meals_start_high_finding(burdens)

    out: List[SegmentEstimate] = []
    for idx, ((start_min, programmed), seg_burdens) in enumerate(zip(segments, per_segment)):
        est = _ic_estimate(seg_burdens)
        measured = est.value if est.n >= cfg.min_meals else None
        rec, ann = _recommend(programmed, measured, cfg)
        prior_action = _prior_action_evidence(seg_burdens, programmed, cfg)
        # When meals-start-high fires and this segment is confirmed (measured ==
        # programmed) or loosened (measured > programmed), the ratio isn't the lever —
        # point at the pre-meal high instead. A tightened segment (measured <
        # programmed) is left alone: there the ratio itself is under suspicion.
        if (start_high is not None and measured is not None
                and programmed is not None and measured >= programmed):
            ann = ann + _START_HIGH_XREF
        evidence = {"n_meals": est.n,
                    "prior_meal_action": prior_action,
                    # Carbs-vs-correction-burden scatter for the evidence modal.
                    # `t` is the meal's own timestamp, carried through so the
                    # unified evidence/occurrence drill-down (#20) can jump to
                    # that moment in the Daily report.
                    "points": [{"carbs": b.carbs, "burden": b.post_correction,
                               "meal_carbs": b.meal_carbs,
                               "rescue_carbs": b.rescue_carbs,
                               "ciq_basal_delta_u": b.ciq_basal_delta_u,
                               "ciq_basal_delta_acted_u": b.ciq_basal_delta_acted_u,
                               "effective_insulin": b.effective_insulin,
                               "bg_outcome_u": b.bg_outcome_u,
                               "outcome_bg": b.outcome_bg,
                               "start_bg": b.bg0,
                               "prior_meal_action_u": b.prior_meal_action_u,
                               "prior_correction_action_u": b.prior_correction_action_u,
                               "prior_action_status": b.prior_action_status,
                               "t": b.t.isoformat()}
                              for b in seg_burdens]}
        if harm is not None and idx in harm.gated_keys:
            # The harm arm keeps its **hold** but no longer emits its own step (#410): the
            # old "meal lows recur → one full ≤20% step weaker" nudge is superseded by the
            # ranked I:C card, whose half-gap step already loosens the ratio without the
            # over-loosening two rules together produced. So the gate stays (a tighter
            # meal-bolus move is withheld while meal-caused lows recur) and the nudge is
            # gone — always ``nudge=False``, regardless of the recurrence bar.
            adj = apply_harm_gate_nudge(
                programmed,
                rec,
                max_step_frac=cfg.max_step_frac,
                less_insulin_sign=1,
                nudge=False,
                ndigits=1,
            )
            if adj.action is HarmAction.GATED:
                rec = adj.recommended
                ann = "meal-owned low; held at current"
            evidence["harm"] = arm_harm_evidence(harm, idx)
        if idx in gate_only_rescues:
            rescues = gate_only_rescues[idx]
            adj = apply_harm_gate_nudge(
                programmed,
                rec,
                max_step_frac=cfg.max_step_frac,
                less_insulin_sign=1,
                nudge=False,
                ndigits=1,
            )
            if adj.action is HarmAction.GATED:
                rec = adj.recommended
                ann = "pre-empted low; held at current"
            evidence["preempted_low_gate"] = _rescue_evidence(rescues)
        row = SegmentEstimate(
            start_min=start_min,
            label=_segment_label(start_min),
            parameter="carb_ratio",
            current=programmed,
            estimate=est,
            recommended=rec,
            annotation=ann,
            evidence=evidence,
        )
        sensitivity = prior_action["sensitivity_bracket"]
        prior_action["numeric_direction_supported"] = bool(
            prior_action["supported_meals"] >= cfg.min_meals
            and not sensitivity["includes_programmed"]
        )
        has_prior_action_exclusions = bool(
            prior_action["contaminated_meals"] + prior_action["unknown_meals"]
        )
        if (
            (
                prior_action["additional_supported_meals_needed"] > 0
                or has_prior_action_exclusions
                or sensitivity["includes_programmed"]
                or not ic_band_excludes_programmed(row)
            )
            and (
                not prior_action["numeric_direction_supported"]
                or not ic_band_excludes_programmed(row)
            )
        ):
            supported = prior_action["supported_meals"]
            needed = prior_action["additional_supported_meals_needed"]
            if needed:
                prior_action["hold_reason"] = "insufficient_supported_meals"
                exit_text = (
                    f"{supported} clean-start/correction-only meals are available; "
                    f"{needed} more needed before direction can be tested"
                )
                hold_intro = (
                    "Prior-meal insulin cannot be separated from this meal — "
                    if has_prior_action_exclusions
                    else "I:C direction needs more identifiable meals — "
                )
            elif sensitivity["includes_programmed"]:
                prior_action["hold_reason"] = "sensitivity_includes_programmed"
                exit_text = (
                    f"{supported} clean-start/correction-only meals are available, "
                    "but their prior-action sensitivity bracket includes the "
                    "programmed I:C"
                )
                hold_intro = "Prior-meal insulin cannot be separated from this meal — "
            else:
                prior_action["hold_reason"] = "supported_band_includes_programmed"
                exit_text = (
                    f"{supported} clean-start/correction-only meals are available, "
                    "but their band still includes the programmed I:C"
                )
                hold_intro = "Prior-meal insulin cannot be separated from this meal — "
            row = replace(
                row,
                annotation=(
                    f"{hold_intro}{exit_text}. Held at the programmed I:C."
                    + (_START_HIGH_XREF if _START_HIGH_XREF in row.annotation else "")
                ),
            )
        # Post-#518 a segment row is PUMP-LANE DISPLAY: it says what the profile is
        # programmed to at this boundary and what this window's meals read there, and
        # it never moves anything. `asserts_move` is therefore always False here — the
        # one live flag rides the owning I:C block result, because adjacent segments
        # sharing a value are one thing on the pump and the meals cannot tell them
        # apart. Naming the owner in the annotation is what keeps that honest on screen:
        # a segment with no number of its own says which stretch reads for it.
        owner = _block_of(start_min, blocks)
        row_evidence = dict(row.evidence or {})
        row_evidence["block_id"] = owner
        owner_block = next((b for b in blocks if b["start_min"] == owner), None)
        annotation = row.annotation
        if owner_block is not None and len(owner_block["member_start_mins"]) > 1:
            annotation = (
                f"Read with the {_block_label(owner_block['start_min'], owner_block['end_min'])} "
                f"stretch — the meals can't tell these hours apart. " + annotation
            )
        out.append(replace(row, asserts_move=False, evidence=row_evidence,
                           annotation=annotation, block_id=owner))

    findings: List[Finding] = []
    # Carb counting is a statement about the *implied I:C dispersion*, not about the
    # burden-per-carb CV. That old CV was sd/mean of a zero-inflated, heavy-tailed
    # burden (most meals need zero correction), so it measured skew and fired HIGH
    # for almost any healthy user. Instead: fit the whole-dataset I:C once and flag
    # only when its confidence interval is `wide` — i.e. the ratio won't stabilise,
    # which is exactly the "no stable ratio explains the scatter" carb-counting
    # signal. A tight CI (consistent counting) does not fire.
    ic_est = _ic_estimate(burdens)
    # Gated on `min_runs`, not `min_meals` (#518 D2). This is the whole-day NUMERIC
    # POOL's sufficiency question — "is there enough closed evidence to say the ratio
    # won't settle?" — and `min_runs` is the gate that pool is measured against
    # everywhere else. `min_meals` still gates the two pooled meal-LIST findings
    # below, which count meals; the two are different units and both are real, so the
    # comparison is named here rather than left to look like a typo.
    if ic_est.n >= cfg.min_runs and ic_est.wide:
        occurrences = sorted(
            [Occurrence(t=b.t,
                        detail=f"{b.carbs:.0f}g carbs, implied I:C {b.true_ic:.1f}")
             for b in burdens if b.carbs],
            key=lambda o: o.t, reverse=True,
        )[:20]
        findings.append(Finding(
            detector="carb-counting",
            severity="medium",
            summary=("The implied I:C scatters widely across meals — no single ratio "
                     "settles out. That points at inconsistent carb counting rather "
                     "than a wrong I:C; a steadier counting habit will help more than "
                     "changing the ratio."),
            evidence={"ic_estimate": ic_est.to_dict(), "n_meals": ic_est.n},
            occurrences=occurrences,
        ))
    if start_high is not None:
        findings.append(start_high)

    # Post-meal correction burden (#186): decompose the correction insulin spent in
    # the post-meal windows across the pool into user-delivered vs Control-IQ auto.
    # A *reporting* finding — no rec math — framed honestly on whichever share
    # dominates, and the pre-meal counterpart of the "meals start high" signal (#178):
    # meals that start above target get corrected down afterward, and this quantifies
    # who pays for that. The split gates on real Msg2 provenance, so unknown-provenance
    # corrections (no Msg2) are excluded from the totals entirely rather than guessed.
    user_u = sum(b.post_correction_user for b in burdens)
    ciq_u = sum(b.post_correction_ciq for b in burdens)
    unknown_u = sum(b.post_correction_unknown for b in burdens)
    n_user = sum(b.n_correction_user for b in burdens)
    n_ciq = sum(b.n_correction_ciq for b in burdens)
    n_unknown = sum(b.n_correction_unknown for b in burdens)
    known_u = user_u + ciq_u
    if len(burdens) >= cfg.min_meals and known_u >= cfg.min_post_correction_u:
        hours = cfg.post_meal_min // 60
        if user_u >= ciq_u:
            summary = (
                f"After your meals, about {known_u:.0f} U of extra correction insulin "
                f"goes in over the next {hours} h to bring BG back down — and you "
                f"deliver most of it yourself: {user_u:.0f} U across {n_user} manual "
                f"corrections vs {ciq_u:.0f} U from Control-IQ's {n_ciq} auto-corrections. "
                f"This isn't Control-IQ cleaning up after your meals; the manual cleanup "
                f"is yours. It's the downstream cost of meals that start above target "
                f"(see the pre-meal 'meals start high' finding) — starting closer to "
                f"target is the same lever that shrinks this correction burden.")
        else:
            summary = (
                f"After your meals, about {known_u:.0f} U of extra correction insulin "
                f"goes in over the next {hours} h to bring BG back down — most of it "
                f"delivered automatically by Control-IQ: {ciq_u:.0f} U across {n_ciq} "
                f"auto-corrections vs {user_u:.0f} U from your {n_user} manual corrections. "
                f"Starting meals closer to target (see the pre-meal 'meals start high' "
                f"finding) is the lever that shrinks this correction burden.")
        occ = sorted(
            [Occurrence(t=b.t,
                        detail=(f"{b.carbs:.0f}g meal — {b.post_correction:.1f} U "
                                f"correction after (you {b.post_correction_user:.1f} U / "
                                f"CIQ {b.post_correction_ciq:.1f} U)"))
             for b in burdens if b.post_correction > 0],
            key=lambda o: o.t, reverse=True,
        )[:20]
        findings.append(Finding(
            detector="post-meal-correction-burden",
            severity="info",
            summary=summary,
            evidence={"user_u": round(user_u, 1), "ciq_u": round(ciq_u, 1),
                      "unknown_u": round(unknown_u, 1), "total_u": round(known_u, 1),
                      "n_user": n_user, "n_ciq": n_ciq, "n_unknown": n_unknown,
                      "n_meals": len(burdens), "window_h": hours,
                      # The pre-meal counterpart (#178). Structured so a UI can link
                      # it; kept out of the patient-facing summary prose.
                      "cross_refs": [178]},
            occurrences=occ,
        ))
    return out, findings


# ---------------------------------------------------------------------------------
# I:C blocks — the unit that decides (#518, adr-518-ic-meal-run-ledger)
# ---------------------------------------------------------------------------------
#
# `analyze_ic` above still reads the programmed schedule segment by segment, over the
# request window, and that view survives as the pump lane's display: it is what the
# user's profile literally says. But a *decision* cannot live there. Adjacent segments
# carrying the same ratio are one thing on the pump — editing one edits all of them —
# and, more importantly, the meals cannot tell them apart: an 07:00 and an 07:30
# segment with the same value have no evidence that separates them, so printing a
# number for each invents a distinction the data does not carry.
#
# So the block is the unit: a maximal contiguous group of programmed segments sharing
# ONE value, on the circular day. It is what the user can edit and what the evidence
# can speak about, and it is the only thing that asserts a move.


def _block_span_minutes(start_min: int, end_min: int) -> int:
    """Length of a block's arc, wrap-aware (``end_min <= start_min`` wraps midnight)."""
    return (end_min - start_min if end_min > start_min
            else (DAY_MINUTES - start_min) + end_min)


def _in_block(tod_min: int, start_min: int, end_min: int) -> bool:
    """Whether a time-of-day falls inside a block's arc, wrap-aware."""
    if end_min > start_min:
        return start_min <= tod_min < end_min
    return tod_min >= start_min or tod_min < end_min


# Plain-language names for the arcs, keyed on the block's own MIDPOINT so a block is
# named for where it actually sits rather than where it happens to start (a
# 12:00–24:00 block reads "Evening", not "Midday"). Upper edges, in minutes.
_BLOCK_LABEL_BANDS: Tuple[Tuple[int, str], ...] = (
    (300, "Overnight"),     # 00:00 – 05:00
    (660, "Morning"),       # 05:00 – 11:00
    (780, "Midday"),        # 11:00 – 13:00
    (1020, "Afternoon"),    # 13:00 – 17:00
    (1320, "Evening"),      # 17:00 – 22:00
    (DAY_MINUTES, "Overnight"),
)


def _block_label(start_min: int, end_min: int) -> str:
    if _block_span_minutes(start_min, end_min) >= DAY_MINUTES:
        return "All day"
    mid = (start_min + _block_span_minutes(start_min, end_min) / 2.0) % DAY_MINUTES
    for edge, name in _BLOCK_LABEL_BANDS:
        if mid < edge:
            return name
    return "Overnight"


def _same_ratio(a: Optional[float], b: Optional[float]) -> bool:
    if a is None or b is None:
        return a is b
    return abs(float(a) - float(b)) < 1e-9


def ic_blocks_from_segments(
    ic_segments: Sequence[Tuple[int, Optional[float]]],
) -> List[Dict]:
    """Partition the programmed I:C schedule into per-value blocks on the CIRCULAR day.

    Returns ``[{start_min, end_min, value, member_start_mins}]`` in clock order, with
    ``end_min <= start_min`` marking the one block that may wrap past midnight. Pure —
    it reads the programmed schedule and nothing else, which is why the surface can
    never draw a boundary the user did not program.

    A flat profile degenerates to a single 24 h block (``start_min == 0``,
    ``end_min == 1440``) — a safe no-op, not a special case. Consecutive segments with
    equal values merge; if the first and last groups then share a value they are one
    block that wraps, whose members read start-first around the clock.
    """
    return [
        {
            "start_min": block.start_min,
            "end_min": block.end_min,
            "value": block.value,
            "member_start_mins": list(block.member_start_mins),
        }
        for block in schedule_blocks(ic_segments)
    ]


def _block_of(tod_min: int, blocks: Sequence[Dict]) -> Optional[int]:
    """The ``block_id`` (== ``start_min``) whose arc contains ``tod_min``."""
    for b in blocks:
        if _in_block(tod_min, b["start_min"], b["end_min"]):
            return b["start_min"]
    return None


def _tod(t: datetime) -> int:
    return t.hour * 60 + t.minute


def _run_pool(runs: Sequence[MealRun]) -> List[MealRun]:
    """The runs that may set a numeric direction — the run-scope twin of :func:`_ic_pool`.

    A run leaves the numeric pool when its prior-meal action cannot be separated from
    this chain's own carbs (#481) or when its denominator was hypo-floored
    (``directional_only``, ADR 518 decision 5) — the floored number is an assumption,
    so the run stays as over-coverage evidence and harm-gating input without being
    pooled behind a fabricated denominator. Outcome-confirmed runs are preferred whole
    (they centre differently from the correction-only fallback); only when none has an
    outcome do the fallbacks estimate.
    """
    supported = [r for r in runs if _run_is_numeric_candidate(r)]
    confirmed = [r for r in supported if r.has_outcome]
    return confirmed if confirmed else supported


@dataclass(frozen=True)
class _IcBlockFit:
    """Estimator-owned numeric inputs consumed by the shared block stamper."""

    estimate: Estimate
    eligible_runs: Tuple[MealRun, ...]
    pool_runs: Tuple[MealRun, ...]
    roster_runs: Tuple[MealRun, ...]
    ownership_by_run: Dict[RunIdentity, float]
    effective_run_count: float
    whole_runs: int
    fractional_run_ownership: float
    fit_meals: int
    on_regime_value: Optional[float]
    n_runs_on_regime: int


def _incumbent_block_fits(
    groups: Sequence[Dict],
    runs: Sequence[MealRun],
    run_blocks: Sequence[set],
    members_by_run: Dict[RunIdentity, List[BolusEvent]],
    identity_by_run: Dict[RunIdentity, HistoryIdentity],
    snapshots: Optional[Sequence[Snapshot]],
    cfg: IcConfig,
) -> Dict[int, _IcBlockFit]:
    """Build the shipped whole-run-only pools without stamping block decisions."""
    fits: Dict[int, _IcBlockFit] = {}
    for group in groups:
        bid = group["start_min"]
        programmed = group["value"]
        inside = [run for run, ids in zip(runs, run_blocks) if ids == {bid}]
        if snapshots is not None:
            if programmed is None:
                inside = []
            else:
                current_identity = HistoryIdentity(
                    group["start_min"], group["end_min"], float(programmed))
                inside = [
                    run for run in inside
                    if identity_by_run.get(RunIdentity(run.t)) == current_identity
                ]
        pool = _run_pool(inside)
        estimate = estimate_pooled_ratio_clustered([
            [(run.carbs_covered, run.effective_insulin)] for run in pool
        ])
        on_regime = [
            run for run in pool
            if _run_is_on_regime(members_by_run.get(RunIdentity(run.t), []), programmed)
        ]
        on_carbs = sum(run.carbs_covered for run in on_regime)
        on_insulin = sum(run.effective_insulin for run in on_regime)
        fits[bid] = _IcBlockFit(
            estimate=estimate,
            eligible_runs=tuple(inside),
            pool_runs=tuple(pool),
            roster_runs=tuple(inside),
            ownership_by_run={RunIdentity(run.t): 1.0 for run in inside},
            effective_run_count=float(len(pool)),
            whole_runs=len(pool),
            fractional_run_ownership=0.0,
            fit_meals=sum(run.n_meals for run in pool),
            on_regime_value=(
                round(on_carbs / on_insulin, 4) if on_insulin > 0 else None
            ),
            n_runs_on_regime=len(on_regime),
        )
    return fits


def _run_is_numeric_candidate(run: MealRun) -> bool:
    return run.prior_action_status == "supported" and not run.directional_only


def _run_is_on_regime(members: Sequence[BolusEvent],
                      programmed: Optional[float]) -> bool:
    """Whether every member bolus of a run was dosed under ``programmed`` (#159).

    Reads the pump's own per-dose stamped ``carb_ratio`` — a dense retroactive witness
    of the setting in force at the instant of each bolus, unlike the snapshot log which
    only starts at the first fetch. A run with any unstamped member is NOT on-regime:
    unknown is not agreement.
    """
    if programmed is None or not members:
        return False
    return all(_same_ratio(b.carb_ratio, programmed) for b in members)


def _block_annotation(state: str, label: str, recommend_ann: str,
                      hold_reason: Optional[str]) -> str:
    if state == "collecting":
        return (f"Not enough meals yet to tell {label} apart from the rest of "
                "your day.")
    if state == "below-floor":
        return ("Below the floor for a dosing change — evidence shown, no move "
                "suggested.")
    if state == "unmeasured-alone":
        return ("Meals here always chain into neighbouring hours — read with the "
                "rest of the day.")
    if hold_reason:
        return hold_reason
    return recommend_ann


def _run_members(
    runs: Sequence[MealRun], bolus_events: Sequence[BolusEvent], cfg: IcConfig,
) -> Dict[RunIdentity, List[BolusEvent]]:
    """Match analyzer-built run members back to their dose-stamped source rows."""
    bolus_at: Dict[datetime, List[BolusEvent]] = {}
    for bolus in bolus_events:
        if _is_meal(bolus, cfg):
            bolus_at.setdefault(bolus.t, []).append(bolus)
    out: Dict[RunIdentity, List[BolusEvent]] = {}
    for run in runs:
        members: List[BolusEvent] = []
        # Same-second meal legs form one run. Include that source bucket once rather
        # than once per RunMeal, or two legs would be published four times.
        for member_t in dict.fromkeys(meal.t for meal in run.meals):
            members.extend(bolus_at.get(member_t, []))
        out[RunIdentity(run.t)] = members
    return out


def _history_run_record(run: MealRun, cfg: IcConfig) -> IcHistoryRunRecord:
    duration = (run.end_t - run.t).total_seconds() / 60.0
    offsets = [(meal.t - run.t).total_seconds() / 60.0 for meal in run.meals]
    return IcHistoryRunRecord(
        run_id=encode_run_id(RunIdentity(run.t)),
        first_member_at=run.t.isoformat(),
        last_member_at=run.end_t.isoformat(),
        member_offsets_min=offsets,
        cgm_start_min=-float(cfg.bg0_max_gap_min),
        cgm_end_min=duration + cfg.post_meal_min,
        outcome_min=duration + cfg.outcome_at_min,
    )


def _history_annotation(
    past_setting: float,
    estimate: Optional[Estimate],
    support: Optional[int],
) -> Optional[str]:
    """Finished ADR 22 conclusion for a current historical measurement."""
    if estimate is None or estimate.value is None or support is None:
        return None

    def number(value: float) -> str:
        return format(float(value), "g")

    interval = ""
    if estimate.lo is not None and estimate.hi is not None:
        interval = f" (CI {number(estimate.lo)}–{number(estimate.hi)})"
    run_noun = "meal run" if support == 1 else "meal runs"
    return (
        f"When Carb ratio was {number(past_setting)} g/U, "
        f"{support} {run_noun} measured {number(estimate.value)} g/U"
        f"{interval}. Past setting. No change suggested."
    )


def _ever_publishable(runs: Sequence[MealRun], cfg: IcConfig) -> bool:
    """Whether one retained 90-day slice ever produced a non-null regime estimate."""
    ordered = sorted(runs, key=lambda run: run.t)
    left = 0
    supported = 0
    confirmed = 0
    span = timedelta(days=BLOCK_WINDOW_DAYS)
    for right, run in enumerate(ordered):
        if _run_is_numeric_candidate(run):
            supported += 1
            confirmed += int(run.has_outcome)
        while run.t - ordered[left].t > span:
            leaving = ordered[left]
            if _run_is_numeric_candidate(leaving):
                supported -= 1
                confirmed -= int(leaving.has_outcome)
            left += 1
        qualifying = (confirmed >= cfg.min_runs
                      or (confirmed == 0 and supported >= cfg.min_runs))
        if qualifying:
            window_pool = _run_pool(ordered[left:right + 1])
            estimate = estimate_pooled_ratio_clustered([
                [(item.carbs_covered, item.effective_insulin)]
                for item in window_pool
            ])
            if estimate.value is not None:
                return True
    return False


def _history_catalog(
    all_runs: Sequence[MealRun],
    members: Dict[RunIdentity, List[BolusEvent]],
    snapshots: Sequence[Snapshot],
    current_schedule: Sequence[Tuple[int, float]],
    *,
    window_start: datetime,
    window_end: datetime,
    cfg: IcConfig,
) -> Tuple[List[IcHistory], Dict[RunIdentity, HistoryIdentity]]:
    evidence = []
    by_id = {RunIdentity(run.t): run for run in all_runs}
    for run_id, run in by_id.items():
        source = members.get(run_id, [])
        evidence.append(RunEvidence(
            started_at=run.t,
            # The closed ledger keeps reading corrections/CGM through this terminal
            # window. A setting change anywhere inside it makes regime attribution
            # ambiguous even when every member bolus preceded the boundary.
            ended_at=run.end_t + timedelta(minutes=cfg.post_meal_min),
            member_times=tuple(meal.t for meal in run.meals),
            stamped_ratios=tuple(bolus.carb_ratio for bolus in source),
        ))
    proven = prove_runs(evidence, snapshots)
    identity_by_run = {run_id: proof.history_id for run_id, proof in proven.items()}

    pools: Dict[HistoryIdentity, List[MealRun]] = {}
    regime_ends: Dict[HistoryIdentity, List[datetime]] = {}
    for run_id, proof in proven.items():
        run = by_id.get(run_id)
        if run is None:
            continue
        pools.setdefault(proof.history_id, []).append(run)
        if proof.regime_end is not None:
            regime_ends.setdefault(proof.history_id, []).append(proof.regime_end)

    current_identities = {
        HistoryIdentity(group["start_min"], group["end_min"], float(group["value"]))
        for group in ic_blocks_from_segments(current_schedule)
        if group["value"] is not None
    }
    catalog: List[IcHistory] = []
    for identity, identity_runs in pools.items():
        if identity in current_identities or not _ever_publishable(identity_runs, cfg):
            continue
        current_runs = _run_pool([
            run for run in identity_runs if window_start <= run.t <= window_end
        ])
        estimate = estimate_pooled_ratio_clustered([
            [(run.carbs_covered, run.effective_insulin)] for run in current_runs
        ])
        measured = estimate if len(current_runs) >= cfg.min_runs else None
        programmed = programmed_values_over_span(identity, current_schedule)
        if len(programmed) != 1:
            lifecycle = "unavailable"
            programmed_now = None
        elif measured is None or measured.value is None:
            lifecycle = "aged_out"
            programmed_now = programmed[0]
        else:
            lifecycle = "active"
            programmed_now = programmed[0]
        visible_runs = current_runs if measured is not None else []
        support = len(visible_runs) if measured is not None else None
        ended = max(regime_ends.get(identity, []), default=None)
        if ended is None:
            ended = max((run.end_t for run in identity_runs), default=None)
        catalog.append(IcHistory(
            history_id=encode_history_id(identity),
            block_start_min=identity.block_start_min,
            block_end_min=identity.block_end_min,
            label=_block_label(identity.block_start_min, identity.block_end_min),
            past_setting=identity.ratio,
            programmed_now=programmed_now,
            estimate=measured,
            support=support,
            annotation=_history_annotation(identity.ratio, measured, support),
            lifecycle=lifecycle,
            regime_end=ended.isoformat() if ended is not None else None,
            runs=[_history_run_record(run, cfg) for run in visible_runs],
        ))
    catalog.sort(key=lambda row: (row.block_start_min, row.regime_end or ""),
                 reverse=False)
    return catalog, identity_by_run


def _analyze_ic_blocks_shared(
    bolus_events: List[BolusEvent],
    ic_segments: List[Tuple[int, float]],
    *,
    config: IcConfig = IcConfig(),
    cgm_readings: Optional[List[CgmReading]] = None,
    isf_effective: Optional[float] = None,
    carb_entries: Optional[List[CarbEntry]] = None,
    basal_events: Optional[List[BasalEvent]] = None,
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
    analysis_start: Optional[datetime] = None,
    prior_action_observed_from: Optional[datetime] = None,
    observed_days: Optional[int] = None,
    snapshots: Optional[Sequence[Snapshot]] = None,
    analysis_end: Optional[datetime] = None,
    history_catalog: Optional[List[IcHistory]] = None,
    history_harm_lows: Optional[Sequence[PrintedLow]] = None,
    _fit_builder: Callable[..., Dict[int, _IcBlockFit]] = _incumbent_block_fits,
) -> Tuple[List[IcBlock], int]:
    """Per-programmed-value carb-ratio blocks off the meal-run ledger (#518).

    Returns ``(blocks, whole_day_run_count)``. Without ``snapshots``, streams retain
    the legacy convention of arriving pre-sliced to the fixed block window. With
    ``snapshots``, streams carry retained local evidence once; ``analysis_start`` and
    ``analysis_end`` select the current 90-day measurement while the same run-ledger
    pass recognizes ever-publishable retired regimes.

    The estimate is :func:`run_burdens` pooled per block by
    :func:`~ciq_autotune.uncertainty.estimate_pooled_ratio_clustered`, with the RUN as
    the bootstrap cluster — meals inside one run share a starting BG, one outcome read
    and one Control-IQ response, so treating them as independent understates the 80%
    interval by 1.6–1.8×.

    The incumbent fit admits only runs wholly inside a block to its numeric pool: a
    pro-rata split of one run's ratio is identically the whole-run ratio and carries no
    block-level information. Cross-block estimators may instead admit chained runs
    through ``_fit_builder`` when their combined evidence separates the block ratios.
    Every touching run still counts toward coverage (``n_meals``).

    The returned ``whole_day_run_count`` is different: it counts each qualifying
    closed ledger once, including a run that crosses a block boundary. It feeds the
    whole-day settling gate and is never assembled from per-block pools.

    ``observed_days`` is how many days of history actually exist (capped at the block
    window by the caller); below the full window every block reads ``collecting``,
    because a pool that has not had 90 days to fill cannot be called short.
    """
    cfg = config
    carb_entries = carb_entries or []
    basal_events = basal_events or []
    groups = ic_blocks_from_segments(ic_segments)
    if not groups:
        return [], 0

    lows: Optional[Sequence[PrintedLow]] = None
    if harm_config is not None:
        lows = (harm_lows if harm_lows is not None
                else find_printed_lows(cgm_readings or [], bolus_events, harm_config))

    if snapshots is not None and prior_action_observed_from is None:
        # Retained history starts at the first stored event. Claiming a lead-in before
        # it would turn unknown prior meal action into supported evidence.
        prior_action_observed_from = min(
            (bolus.t for bolus in bolus_events), default=None)
    all_runs = run_burdens(bolus_events, cfg,
                       cgm_readings=cgm_readings, isf_effective=isf_effective,
                       carb_entries=carb_entries, basal_events=basal_events,
                       harm_lows=(history_harm_lows
                                  if history_harm_lows is not None else lows),
                       prior_action_observed_from=prior_action_observed_from)
    members_by_run = _run_members(all_runs, bolus_events, cfg)
    identity_by_run: Dict[RunIdentity, HistoryIdentity] = {}
    if snapshots is not None:
        if analysis_start is None or analysis_end is None:
            raise ValueError("snapshot-proven history requires analysis_start and analysis_end")
        catalog, identity_by_run = _history_catalog(
            all_runs, members_by_run, snapshots, ic_segments,
            window_start=analysis_start, window_end=analysis_end, cfg=cfg,
        )
        if history_catalog is not None:
            history_catalog.extend(catalog)
    runs = [run for run in all_runs
            if (analysis_start is None or run.t >= analysis_start)
            and (analysis_end is None or run.t <= analysis_end)]

    # Assign every run to the set of blocks its member meals fall in. The fit builder
    # decides which of those runs its numeric estimate consumes; every touching run
    # counts toward coverage.
    run_blocks: List[set] = []
    for run in runs:
        ids = {_block_of(_tod(m.t), groups) for m in run.meals}
        run_blocks.append({i for i in ids if i is not None})

    # Rescue holds re-keyed from segments to BLOCKS (#518). Leaving this per-segment
    # after the revamp would silently drop a live safety hold, because segment rows no
    # longer gate anything. Direction semantics are unchanged: a meal-attributed
    # pre-empted low withholds a move toward MORE insulin (a tighter ratio).
    numeric_rescue_times = {t for r in runs for t in r.rescue_carb_times}
    gate_only_rescues: Dict[int, List[PreemptedLowEntry]] = {}
    for rescue in _preempted_rescues(carb_entries, bolus_events, cgm_readings):
        if rescue.bucket != "ic" or rescue.bolus_t is None:
            continue
        if analysis_start is not None and rescue.bolus_t < analysis_start:
            continue
        if analysis_end is not None and rescue.bolus_t > analysis_end:
            continue
        if rescue.entry.t in numeric_rescue_times:
            continue
        bid = _block_of(_tod(rescue.bolus_t), groups)
        if bid is not None:
            gate_only_rescues.setdefault(bid, []).append(rescue)

    harm = None
    if harm_config is not None:
        def _key(low: PrintedLow) -> Optional[int]:
            if low.dominant_bolus_t is None:
                return None
            return _block_of(_tod(low.dominant_bolus_t), groups)

        harm = arm_harm(lows, HarmArm.IC, _key,
                        min_recurrence_nights=harm_config.min_recurrence_nights)

    block_fits = _fit_builder(
        groups, runs, run_blocks, members_by_run, identity_by_run, snapshots, cfg,
    )
    observed = (BLOCK_WINDOW_DAYS if observed_days is None
                else max(0, int(observed_days)))
    out: List[IcBlock] = []
    for g in groups:
        bid = g["start_min"]
        programmed = g["value"]
        label = _block_label(bid, g["end_min"])
        touching = [r for r, ids in zip(runs, run_blocks) if bid in ids]
        coverage_meals = [m for r in touching for m in r.meals
                          if _block_of(_tod(m.t), groups) == bid]
        fit = block_fits[bid]
        inside = list(fit.eligible_runs)
        roster = list(fit.roster_runs)
        pool = list(fit.pool_runs)
        pool_ids = {id(r) for r in pool}
        est = fit.estimate
        effective_runs = fit.effective_run_count
        n_runs = math.floor(effective_runs)
        n_meals = len(coverage_meals)

        if observed < BLOCK_WINDOW_DAYS:
            state = "collecting"
        elif est.value is not None and effective_runs >= _MIN_SUPPORTED_BLOCK_RUNS:
            state = "numeric"
        elif est.value is not None and effective_runs >= cfg.min_runs:
            state = "below-floor"
        elif n_meals >= cfg.min_runs:
            # Meals happen here, but the admitted evidence carries no contrast from
            # which this estimator can separate a numeric ratio for the block.
            state = "unmeasured-alone"
        else:
            state = "collecting"

        # The number and its band PRINT from `min_runs` up — the 8-run floor gates
        # assertion, never display (ADR 518 decision 12).
        measured = est.value if n_runs >= cfg.min_runs else None
        rec, recommend_ann = _recommend(programmed, measured, cfg)

        # --- gate 3: the regime bracket (compare-side only; measurement stays
        # full-window, so ADR 0039/#288 are untouched). At 90 days only a minority of a
        # block's evidence was typically dosed under the value now programmed, and the
        # estimator hugs the dosed ratio — so a move is held while the full-window and
        # on-regime readings still bracket the programmed value. The hold decays by
        # design: it releases exactly when post-change meals themselves support the move.
        regime: Optional[Dict] = None
        regime_supported = False
        if measured is not None:
            # The on-regime side needs only its POINT estimate: the bracket asks
            # whether the two readings sit on the same side of programmed, which is a
            # comparison of two numbers. Bootstrapping a band nobody reads would
            # double this analyzer's cost for no decision and no display.
            on_value = fit.on_regime_value
            straddles: Optional[bool] = None
            if on_value is not None and programmed is not None:
                lo_b = min(est.value, on_value)
                hi_b = max(est.value, on_value)
                straddles = lo_b <= programmed <= hi_b
                regime_supported = not straddles
            regime = {
                "full": {"value": est.value, "lo": est.lo, "hi": est.hi},
                "on_regime": None if on_value is None else {"value": on_value},
                "n_runs_on_regime": fit.n_runs_on_regime,
                "straddles_programmed": straddles,
            }

        # --- harm. A TIGHTEN (smaller ratio — more insulin per carb) is withheld by a
        # meal-attributed low ANYWHERE on the arm: the insulin lands in a body, not in a
        # time slot, so a low at 19:00 is a real reason not to dose breakfast harder. A
        # LOOSEN is judged on the block's own lows — it moves toward *less* insulin, so
        # arm-wide low evidence has no claim on it.
        harm_evidence: Dict = {}
        hold_reason: Optional[str] = None
        if harm is not None:
            tightening = (rec is not None and programmed is not None
                          and rec < programmed)
            gated = bool(harm.gated_keys) if tightening else bid in harm.gated_keys
            if gated:
                adj = apply_harm_gate_nudge(
                    programmed, rec, max_step_frac=cfg.max_step_frac,
                    less_insulin_sign=1, nudge=False, ndigits=1)
                if adj.action is HarmAction.GATED:
                    rec = adj.recommended
                    hold_reason = "meal-owned low; held at current"
            if gated or bid in harm.gated_keys:
                harm_evidence = arm_harm_evidence(harm, bid)
        if bid in gate_only_rescues:
            adj = apply_harm_gate_nudge(
                programmed, rec, max_step_frac=cfg.max_step_frac,
                less_insulin_sign=1, nudge=False, ndigits=1)
            if adj.action is HarmAction.GATED:
                rec = adj.recommended
                hold_reason = "pre-empted low; held at current"

        # --- the four conditions, each stamped so the one predicate can read them and
        # the pane can say which one is holding.
        band_excludes = bool(
            est.value is not None and not est.wide
            and est.lo is not None and est.hi is not None
            and programmed is not None
            and not (est.lo <= programmed <= est.hi)
        )
        eligibility = {
            "runs_floor_met": effective_runs >= _MIN_SUPPORTED_BLOCK_RUNS,
            "runs_floor": _MIN_SUPPORTED_BLOCK_RUNS,
            "n_runs": n_runs,
            "effective_run_count": round(effective_runs, 6),
            "whole_runs": fit.whole_runs,
            "fractional_run_ownership": round(fit.fractional_run_ownership, 6),
            "fit_meals": fit.fit_meals,
            "band_excludes_programmed": band_excludes,
            "regime_supported": regime_supported,
            "names_a_move": bool(rec is not None and programmed is not None
                                 and not _same_ratio(rec, programmed)),
        }
        if (eligibility["runs_floor_met"] and band_excludes
                and eligibility["names_a_move"] and not regime_supported):
            hold_reason = hold_reason or "meals still bracket the current ratio"

        # --- recurrence channels, ALL keyed to runs / the block's own 90-day span.
        # `tuning_priority` turns these into a Wilson bound; the denominator is fixed
        # here so a 30-day divisor can never reach a 90-day count.
        side_k = side_n = 0
        if band_excludes and measured is not None and programmed is not None:
            direction = 1.0 if measured > programmed else -1.0
            for r in pool:
                side_n += 1
                if (r.true_ic - programmed) * direction > 0:
                    side_k += 1
        rescue_days = len({r.entry.t.date() for r in gate_only_rescues.get(bid, [])})
        channels = {
            "window_days": BLOCK_WINDOW_DAYS,
            "side_k": side_k,
            "side_n": side_n,
            "low_days": int((harm_evidence or {}).get("row_days") or 0),
            "rescue_days": rescue_days,
            "measurement_asserts": band_excludes,
        }

        # Evidence: per-MEAL raw facts (each carrying its `run_id`, so a scatter can
        # group them) plus the per-RUN closed ledger rows the evidence table binds. The
        # meal rows are raw facts only — a mid-chain meal has no closed ledger of its
        # own, which is the whole reason the run is the unit.
        meal_points = []
        run_rows = []
        for r in touching:
            run_id = r.t.isoformat()
            for m in r.meals:
                if _block_of(_tod(m.t), groups) != bid:
                    continue
                meal_points.append({
                    "t": m.t.isoformat(), "run_id": run_id,
                    "carbs": m.carbs, "dose": m.dose, "start_bg": m.bg0,
                    "burden": m.post_correction,
                    "rescue_carbs": m.rescue_carbs,
                    "ciq_basal_delta_u": m.ciq_basal_delta_u,
                    "prior_meal_action_u": m.prior_meal_action_u,
                    "prior_action_status": m.prior_action_status,
                })
        for r in roster:
            duration = (r.end_t - r.t).total_seconds() / 60.0
            run_rows.append({
                "run_id": r.t.isoformat(), "t": r.t.isoformat(),
                "end_t": r.end_t.isoformat(), "n_meals": r.n_meals,
                "carbs": r.carbs_covered, "effective_insulin": r.effective_insulin,
                "true_ic": r.true_ic, "start_bg": r.bg0, "outcome_bg": r.outcome_bg,
                "bg_outcome_u": r.bg_outcome_u,
                "directional_only": r.directional_only,
                "in_pool": id(r) in pool_ids,
                "ownership": fit.ownership_by_run[RunIdentity(r.t)],
                # The current-block evidence canvas consumes these analyzer-owned
                # display facts verbatim.  Keep them beside the closed ledger so
                # no projection has to reconstruct its member chain or horizon.
                "member_offsets_min": [
                    (meal.t - r.t).total_seconds() / 60.0 for meal in r.meals
                ],
                "cgm_start_min": -float(cfg.bg0_max_gap_min),
                "cgm_end_min": duration + cfg.post_meal_min,
                "outcome_min": duration + cfg.outcome_at_min,
            })

        block = IcBlock(
            block_id=bid,
            start_min=bid,
            end_min=g["end_min"],
            label=label,
            member_start_mins=list(g["member_start_mins"]),
            current_values=[] if programmed is None else [float(programmed)],
            estimate=est,
            recommended=rec,
            n_runs=n_runs,
            n_meals=n_meals,
            state=state,
            asserts_move=False,
            annotation=_block_annotation(state, label, recommend_ann, hold_reason),
            harm=harm_evidence,
            regime=regime,
            days_observed=observed if state == "collecting" else None,
            days_needed=BLOCK_WINDOW_DAYS if state == "collecting" else None,
            evidence={
                "eligibility": eligibility,
                "recurrence_channels": channels,
                "preempted_low_gate": _rescue_evidence(gate_only_rescues.get(bid, [])),
                # The block's own 90-day attributed carb load — the impact denominator
                # (`tuning_priority.ic_lever`). Per block and over its OWN span: a
                # 30-day divisor here would inflate every block's currency threefold.
                "impact_inputs": {
                    "carbs": round(sum(m.carbs for m in coverage_meals), 3),
                    "window_days": BLOCK_WINDOW_DAYS,
                },
                "n_runs_touching": len(touching),
                # The roster includes every analyzer-examined run. Keep its rejected
                # count separate from support: a rejected run is evidence that was
                # examined, never evidence that did not exist.
                "n_runs_excluded": len(roster) - len(pool),
                "points": meal_points,
                "runs": run_rows,
            },
        )
        # Stamp the one eligibility decision here, off the evidence just assembled —
        # its RESULT and nothing else, so no consumer ever re-applies a condition.
        block = replace(block, asserts_move=ic_asserts_move(block))
        if block.asserts_move:
            block = replace(block, days_observed=observed)
        # #523: display-only held_reason, transcribed from the annotation this block
        # already carries (which is `hold_reason` verbatim whenever a gate set one —
        # see `_block_annotation` above) — never a second copy of the gate logic. Set
        # only when the evidence actively disagrees with the setting (band excludes
        # programmed) and the gates are correctly withholding the move.
        held_reason = (
            block.annotation
            if (block.state == "numeric" and band_excludes and not block.asserts_move)
            else None
        )
        out.append(replace(block, held_reason=held_reason))

    # Settling speaks in ONE whole-day run total. Block membership and dose-stamp
    # proof govern numeric regime pools above; they must not drop a qualifying run
    # that crosses a block or count one once per block here.
    return out, len(_run_pool(runs))


def analyze_ic_blocks(
    bolus_events: List[BolusEvent],
    ic_segments: List[Tuple[int, float]],
    *,
    config: IcConfig = IcConfig(),
    cgm_readings: Optional[List[CgmReading]] = None,
    isf_effective: Optional[float] = None,
    carb_entries: Optional[List[CarbEntry]] = None,
    basal_events: Optional[List[BasalEvent]] = None,
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
    analysis_start: Optional[datetime] = None,
    prior_action_observed_from: Optional[datetime] = None,
    observed_days: Optional[int] = None,
    snapshots: Optional[Sequence[Snapshot]] = None,
    analysis_end: Optional[datetime] = None,
    history_catalog: Optional[List[IcHistory]] = None,
    history_harm_lows: Optional[Sequence[PrintedLow]] = None,
) -> Tuple[List[IcBlock], int]:
    """Run the whole-run I:C estimator through the shared block stamper.

    Superseded on the shipped path by `ic_regression.analyze_ic_blocks_fuzzy`
    (ADR 117); kept as the admission ladder's incumbent reference, which every
    candidate replays against.
    """
    return _analyze_ic_blocks_shared(
        bolus_events,
        ic_segments,
        config=config,
        cgm_readings=cgm_readings,
        isf_effective=isf_effective,
        carb_entries=carb_entries,
        basal_events=basal_events,
        harm_config=harm_config,
        harm_lows=harm_lows,
        analysis_start=analysis_start,
        prior_action_observed_from=prior_action_observed_from,
        observed_days=observed_days,
        snapshots=snapshots,
        analysis_end=analysis_end,
        history_catalog=history_catalog,
        history_harm_lows=history_harm_lows,
        _fit_builder=_incumbent_block_fits,
    )
