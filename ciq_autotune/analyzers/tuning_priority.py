"""Tuning-Lever **Priority** builders — basal / ISF / I:C in one insulin currency (ADR 0032).

The unified priority core (:mod:`.scenario.priority`) turns two ``[0, 1]`` factors into a
0–100 score. This module maps each *tuning* flavor's evidence — the
:class:`~ciq_autotune.result.SlotEstimate` / :class:`~ciq_autotune.result.SegmentEstimate`
rows ``analyze()`` already built — onto those factors, in **one shared insulin currency**:
the U/day implicated by the change the analyzer can recommend now. Basal, ISF and I:C are
therefore directly comparable and interleave with behavioral Levers on the Diagnose queue.

The currency is honest across levers because all three price the **recommended move** —
``|f(current) − f(recommended)|`` — and pass through **one** soft-saturation curve, so
identical U/day reads identical impact no matter which lever (ADR 435). The exception is
I:C's existing rescue surcharge: logged rescue carbs are converted to insulin-equivalent
U/day because they reveal masked excess meal insulin even when the harm gate holds the
numeric recommendation at current. The curve replaces the hard ``1.0`` clamp, which made
a 1.1 and a 3.6 U/day card identical, without halving every low-end basal priority.

Each flavor rolls up into **one** Lever (all of its slot/segment changes stage into one
Plan — the mockup's decision #1):

* **Basal** (concrete, grounded): impact = U/day mis-delivered summed over
  *well-supported* slots only (``wide`` slots still ride the Consolidated profile, they
  just don't inflate the rank), each slot priced by its own move ``|recommended − current|``.
  Recurrence = the Wilson lower bound of the headline block's "clean nights that ran on the
  suggested side of the programmed rate" — the *same*
  :func:`~ciq_autotune.uncertainty.wilson` behavioral uses.
* **ISF** (#413): the same currency, with corrections/day and the representative correction
  size read **from the window** (the analyzer stashes them in ``evidence.impact_inputs``),
  and the divergence priced against the **recommended move** — the robust, step-capped,
  harm-gated target derived from the night median, *not* the fragile pooled
  ``estimate.value`` (#413) nor the raw ``night_median`` (which overstates the per-cycle
  move, ADR 435). Recurrence is the strongest Wilson lower bound of ISF's three night-honest
  channels (correction-caused low days, correction-attributed rescue-log days, per-night
  suggested-side votes). It ranks in the tail, or above the line when the low pattern is
  dense, instead of being forced to 0.
* **I:C** (#410) against the first real unlocked-I:C case. Impact = ``carbs/day ·
  |1/current − 1/recommended|`` (the real windowed carb load, threaded) plus a rescue
  surcharge = ``logged meal-rescue g/day ÷ measured`` — the insulin-equivalent of the
  rescues that catch the "masked" user whose pre-emptive rescue carbs keep the measured ratio
  looking on-target. A segment ranks only when it **asserts a direction** (its band excludes
  programmed, or meal-caused lows recur, or meal-attributed rescues recur) — the exact
  ``asserts_move`` discipline basal uses; otherwise it is held at priority 0. Recurrence is
  the strongest of three Wilson lower bounds (meals on the suggested side when the band
  excludes programmed, days with meal-caused lows, days with meal-attributed rescues) — the
  same :func:`~ciq_autotune.uncertainty.wilson` basal uses.

Reads the result rows (not the raw feeds), so it lives at ``analyzers/`` (whose
``__init__`` is inert) rather than inside the ``scenario`` package — the same reasoning
:mod:`.scenario_config` documents.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date as date_cls
from statistics import median
from typing import Iterable, List, Optional, Sequence

from ..insulin import basal_microdoses
from ..result import IcBlock, SegmentEstimate, SlotEstimate, TuningLever
from ..uncertainty import wilson
from . import ic as ic_module
from .scenario_config import ScenarioConfig
from .scenario.priority import priority_score

# Well-supported = a slot cap() actually asserted a direction on. Keys on the real
# Status (via SlotEstimate.asserts_move), the *same* "this slot moves" predicate the
# consolidated deliverable uses (issue #264) — so the impact tally, the deliverable's
# moved set, and the frontend's held set are one set. This closes the old `not wide`
# gap: a CI-spans-current slot (INSUFFICIENT but not `wide`) is held here too.


def _is_supported_change(slot: SlotEstimate) -> bool:
    return (
        slot.asserts_move
        and slot.current is not None
        and slot.recommended is not None
    )


def _block_gap(a: SlotEstimate, b: SlotEstimate) -> int:
    return b.slot - a.slot


def _basal_blocks(supported: List[SlotEstimate]) -> List[List[SlotEstimate]]:
    """Group well-supported changed slots into contiguous same-direction blocks.

    Mirrors the frontend's grouping (≤2-slot gaps, one direction), so the backend
    headline block matches what Diagnose renders. ``supported`` must be slot-ordered.
    """
    blocks: List[List[SlotEstimate]] = []
    cur: List[SlotEstimate] = []
    cur_dir = 0
    for s in supported:
        d = 1 if s.recommended - s.current > 0 else -1
        if cur and d == cur_dir and _block_gap(cur[-1], s) <= 2:
            cur.append(s)
        else:
            if cur:
                blocks.append(cur)
            cur = [s]
            cur_dir = d
    if cur:
        blocks.append(cur)
    return blocks


def _headline_block(blocks: List[List[SlotEstimate]]) -> Optional[List[SlotEstimate]]:
    """The strongest, best-supported block: most clean nights, then most U/day off."""
    if not blocks:
        return None
    return max(
        blocks,
        key=lambda b: (sum(s.days for s in b), sum(abs(s.recommended - s.current) for s in b)),
    )


def _on_suggested_side_nights(block: List[SlotEstimate]) -> int:
    """Distinct clean nights whose block delivery ran on the suggested side of programmed.

    One vote per date (nights are autocorrelated within, so a night that appears in
    several block slots still counts once): the date is on-side when the block's mean
    signed gap ``rate − current`` points the block's recommended direction.
    """
    block_dir = 1 if sum(s.recommended - s.current for s in block) > 0 else -1
    gaps_by_date: dict[date_cls, List[float]] = {}
    for s in block:
        for pt in s.evidence.get("points", []):
            try:
                d = date_cls.fromisoformat(pt["date"])
            except (KeyError, ValueError, TypeError):
                continue
            rate = pt.get("rate")
            if rate is None:
                continue
            gaps_by_date.setdefault(d, []).append(rate - s.current)
    k = 0
    for gaps in gaps_by_date.values():
        mean_gap = sum(gaps) / len(gaps)
        if mean_gap * block_dir > 0:
            k += 1
    return k


def _observed_nights(block: List[SlotEstimate]) -> int:
    dates: set = set()
    for s in block:
        for pt in s.evidence.get("points", []):
            try:
                dates.add(date_cls.fromisoformat(pt["date"]))
            except (KeyError, ValueError, TypeError):
                continue
    return len(dates)


def _clamp01(x: float) -> float:
    return 0.0 if x < 0.0 else 1.0 if x > 1.0 else x


def robust_daily_insulin(
    basal_events: Iterable,
    bolus_events: Iterable,
    scenario_config: ScenarioConfig = ScenarioConfig(),
) -> float:
    """One robust user-level daily insulin baseline (U/day) — the shared denominator (#446).

    Total delivered insulin per local day = bolus units + reconstructed basal micro-doses
    (:func:`~ciq_autotune.insulin.basal_microdoses`), then the **median** across days that
    saw delivery. The median (not mean) shrugs off sparse edge days, a suspended day, or a
    single mega-bolus, and is stable across setting epochs. Below
    ``priority_baseline_min_days`` days with data it degrades to the calibrated reference
    (``priority_baseline_reference_u_day``) rather than trust a noisy few-day estimate.

    It is **total** delivered insulin, shared by all three levers, so no single setting under
    test dominates the denominator: for the reference account bolus is ~2/3 of the day, so an
    excessive *basal* inflates its own denominator only fractionally while the corrective move
    (the numerator) grows in full — the self-dampening guard (#446, ADR 435).
    """
    daily: dict = {}
    for b in bolus_events:
        if getattr(b, "insulin", None):
            daily[b.t.date()] = daily.get(b.t.date(), 0.0) + float(b.insulin)
    for t, units in basal_microdoses(list(basal_events)):
        daily[t.date()] = daily.get(t.date(), 0.0) + units
    totals = [v for v in daily.values() if v > 0.0]
    if len(totals) < scenario_config.priority_baseline_min_days:
        return scenario_config.priority_baseline_reference_u_day
    return median(totals)


def _impact_factor(
    impact_u_day: float,
    scenario_config: ScenarioConfig,
    robust_daily_insulin_u: Optional[float] = None,
) -> float:
    """Map the shared insulin currency to ``[0, 1)`` without burying its low end.

    **Scale-invariant (#446):** the raw U/day currency is first normalized to the
    reference dose scale — ``impact_u_day · reference / robust_daily_insulin_u`` — so the
    knee is a *fraction of the user's own total dose*, not an absolute U/day. The same
    *relative* mis-dose reads the same impact whether the user takes 20 or 100 U/day. When
    no baseline is threaded (unit fixtures) the reference stands in, so the normalized
    currency equals the raw U/day and every established calibration is preserved exactly.

    The curve is identity through the configured knee. Above it, a rational tail spends the
    remaining headroom monotonically but never reaches 1 for finite currency. Its value and
    first derivative are continuous at the knee.
    """
    unit = scenario_config.priority_impact_unit_u_day
    if impact_u_day <= 0.0 or unit <= 0.0:
        return 0.0
    reference = scenario_config.priority_baseline_reference_u_day
    baseline = (robust_daily_insulin_u
                if robust_daily_insulin_u and robust_daily_insulin_u > 0.0
                else reference)
    scaled = impact_u_day * reference / baseline
    x = scaled / unit
    knee = _clamp01(scenario_config.priority_impact_linear_u_day / unit)
    if x <= knee:
        return x
    headroom = 1.0 - knee
    if headroom <= 0.0:
        return min(x, 1.0)
    excess = x - knee
    return knee + headroom * excess / (excess + headroom)


# The winning **recurrence channel** for Diagnose's plain-count line (#438). The bar value is
# still the strongest Wilson lower bound; this only names which channel earned it and carries
# that channel's *observed* k/n so the frontend can transcribe the agreed copy. Each candidate
# is ``(wilson_bound, order_rank, kind, k, display_n)``; `order_rank` breaks exact bound+k ties
# in the agreed order (lows < rescues < votes/meals).
def _pick_channel(candidates):
    """``(bound, channel_dict_or_None)`` — the max-Wilson channel, ties → larger k → lower rank."""
    if not candidates:
        return 0.0, None
    bound, _rank, kind, k, n = max(candidates, key=lambda c: (c[0], c[3], -c[1]))
    return bound, {"kind": kind, "k": k, "n": n}


def basal_lever(
    slots: Sequence[SlotEstimate],
    *,
    slot_minutes: int,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    robust_daily_insulin_u: Optional[float] = None,
) -> Optional[TuningLever]:
    """The single Basal tuning Lever's :class:`~ciq_autotune.result.TuningLever` (ADR 0032).

    ``None`` when there are no basal rows at all. Impact tallies only well-supported
    changed slots; recurrence is the headline block's Wilson lower bound over the
    recurrence window. A profile with nothing well-supported to change reads impact 0 /
    priority 0 (it collapses into the Diagnose tail).
    """
    if not slots:
        return None
    slot_hours = slot_minutes / 60.0
    supported = [s for s in sorted(slots, key=lambda s: s.slot) if _is_supported_change(s)]
    impact_u_day = sum(abs(s.recommended - s.current) * slot_hours for s in supported)
    impact = _impact_factor(impact_u_day, scenario_config, robust_daily_insulin_u)

    block = _headline_block(_basal_blocks(supported))
    if block is None:
        recurrence = 0.0
        channel = {"kind": "basal_thin"}
    else:
        observed = _observed_nights(block)
        n = max(scenario_config.priority_recurrence_window_days, observed)
        on_side = _on_suggested_side_nights(block)
        k = min(on_side, n)
        recurrence = wilson(k, n)[1]  # Wilson lower bound — behavioral's exact function
        # The sentence shows the REAL observed count (on-side of the clean nights that
        # existed), never the padded Wilson denominator `n` (#438): 15 of 20, not 15 of 30.
        block_dir = 1 if sum(s.recommended - s.current for s in block) > 0 else -1
        channel = {
            "kind": "basal_raise" if block_dir > 0 else "basal_lower",
            "k": min(on_side, observed),
            "n": observed,
        }

    return TuningLever(
        parameter="basal_rate",
        title="Basal profile",
        impact=impact,
        recurrence=recurrence,
        priority=priority_score(impact, recurrence),
        impact_u_day=impact_u_day,
        recurrence_channel=channel,
    )


def isf_lever(
    rows: Sequence[SegmentEstimate],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    robust_daily_insulin_u: Optional[float] = None,
) -> Optional[TuningLever]:
    """The single ISF tuning Lever (ADR 0032, #413; currency recalibrated ADR 435). ``None`` with no ISF row.

    Currency (U/day implicated by the current recommendation) = ``corrections/day · mg-dL-over-target
    · |1/current − 1/recommended|`` — corrections/day and the representative correction size
    read **from the window** (#413 §4): the analyzer stashed them in
    ``evidence.impact_inputs`` (the old 3.0/day and 50 mg/dL provisional constants are now
    only a fallback when the window is empty). The divergence prices the **recommended move**
    (ADR 435), not the raw ``night_median`` — see the body. Recurrence is the strongest
    Wilson lower bound of the three night-honest channels the analyzer counted —
    correction-caused low days, correction-attributed rescue-log days, or per-night
    suggested-side votes when the measurement asserts. Unlike I:C, ISF is no longer
    priority-suppressed: it has a real, day-based recurrence, so it ranks in the tail
    (or above the line when the pattern is dense) instead of being forced to 0.
    """
    row = rows[0] if rows else None
    if row is None:
        return None
    ev = row.evidence if isinstance(row.evidence, dict) else {}
    inputs = ev.get("impact_inputs") or {}
    per_day = inputs.get("corrections_per_day")
    if per_day is None:
        per_day = scenario_config.priority_isf_corrections_per_day
    mgdl = inputs.get("median_mgdl_over_target")
    if not mgdl:
        mgdl = scenario_config.priority_isf_delta_bg_mgdl
    # Impact prices the **recommended move** — the same basis basal uses — not the raw
    # measured target: the currency is the insulin implicated by this cycle's recommendation
    # (ADR 435). ``recommended`` is the step-capped half-gap toward the robust night
    # median (see :func:`~ciq_autotune.analyzers.isf._recommend`), then harm-gated, so it
    # stays robust (never the fragile pooled ``estimate.value``, #413) while being the
    # move we will actually deliver. A confirm/hold read (``recommended is None`` or
    # ``recommended == current``) redistributes nothing → zero divergence → zero impact.
    #
    # #468: a harm-owned weaken is **direction-only** — it carries no ``recommended``
    # because its capped target is not a number we may advise. Its ranking must not
    # collapse to zero, so fall back to the analyzer's pricing-only ``priced_target``
    # (the very same capped move), stashed in evidence and never surfaced anywhere.
    # Strengthen rows keep ``recommended`` and are unaffected.
    target = (row.recommended if row.recommended is not None
              else inputs.get("priced_target"))
    divergence = _inverse_values(row.current, target) if target is not None else 0.0
    impact_u_day = per_day * mgdl * divergence
    impact = _impact_factor(impact_u_day, scenario_config, robust_daily_insulin_u)
    recurrence, channel = _isf_recurrence(ev.get("recurrence_channels") or {})
    return TuningLever(
        parameter="isf",
        title="ISF",
        impact=impact,
        recurrence=recurrence,
        priority=priority_score(impact, recurrence),
        impact_u_day=impact_u_day,
        recurrence_channel=channel,
    )


def _isf_recurrence(channels: dict) -> tuple:
    """The strongest Wilson lower bound across ISF's night-honest channels (#413 §4).

    Each channel is a k-of-n day/night rate: correction-caused low days, correction-
    attributed rescue-log days, and — only when the *measurement* asserts a direction
    in silence — the per-night suggested-side votes. Nothing here counts 5-min steps.
    Returns ``(bound, channel_dict_or_None)`` (#438) so the winning channel's identity and
    observed k/n reach Diagnose. Day channels display ``covered_days``; the vote channel
    displays its own ``side_n``.
    """
    covered = channels.get("covered_days") or 0
    cands = []
    if covered > 0:
        cl = min(channels.get("corr_low_days", 0), covered)
        cands.append((wilson(cl, covered)[1], 0, "isf_corr_lows", cl, covered))
        rd = min(channels.get("rescue_days", 0), covered)
        cands.append((wilson(rd, covered)[1], 1, "isf_rescues", rd, covered))
    if channels.get("measurement_asserts") and channels.get("side_n"):
        n = channels["side_n"]
        sk = min(channels.get("side_k", 0), n)
        cands.append((wilson(sk, n)[1], 2, "isf_votes", sk, n))
    bound, channel = _pick_channel(cands)
    return _clamp01(bound), channel


def _ic_block_rescue_grams(block: IcBlock) -> float:
    """Meal-attributed rescue grams on this block: pre-empted (gate) + admitted ledger.

    Both ride on the block's own ``evidence`` — the pre-empted-low gate carries the
    masked (censored) rescues, and each closed run ledger carries the admitted
    printed-and-rescued grams. The two streams are disjoint (a rescue admitted into the
    numeric pool is excluded from the gate), so summing them does not double-count.
    """
    ev = block.evidence or {}
    gate = ev.get("preempted_low_gate") or {}
    grams = sum(float(r.get("grams") or 0.0) for r in gate.get("rescues", []))
    grams += sum(float(p.get("rescue_carbs") or 0.0) for p in ev.get("points", []))
    return grams


def _ic_block_recurrence(block: IcBlock) -> tuple:
    """The strongest of a block's three confidence-adjusted recurrence bounds (#410/#518).

    Every channel is measured over the BLOCK's own span — a fixed trailing 90 days
    (``evidence.recurrence_channels.window_days``), never the request window. Reading a
    90-day count against a 30-day Wilson denominator saturates the bound at 1.0 and
    would rank a quiet block as urgent, so the analyzer fixes the denominator and this
    function only ever reads it.

    The suggested-side channel counts **runs**, not meals: a mid-chain meal has no
    closed per-meal ledger, so it has no implied ratio of its own to vote with.
    Returns ``(bound, channel_dict_or_None)`` (#438).
    """
    ch = (block.evidence or {}).get("recurrence_channels") or {}
    window = int(ch.get("window_days") or 0)
    cands = []
    if ch.get("measurement_asserts") and ch.get("side_n"):
        n = int(ch["side_n"])
        k = min(int(ch.get("side_k") or 0), n)
        cands.append((wilson(k, n)[1], 2, "ic_runs", k, n))
    if window:
        low_days = int(ch.get("low_days") or 0)
        if low_days:
            k = min(low_days, window)
            cands.append((wilson(k, window)[1], 0, "ic_meal_lows", k, window))
        rescue_days = int(ch.get("rescue_days") or 0)
        if rescue_days:
            k = min(rescue_days, window)
            cands.append((wilson(k, window)[1], 1, "ic_rescues", k, window))
    bound, channel = _pick_channel(cands)
    return _clamp01(bound), channel


def _ic_block_impact_u_day(block: IcBlock) -> float:
    """U/day implicated by THIS block's recommendation: its own carbs/day × the move.

    The denominator is the block's own attributed carb load over its own 90-day span
    (``evidence.impact_inputs``), which is what replaces the old whole-day,
    request-windowed carb rate: a block covering four hours of the day must not be
    priced as if every carb the user ate went through it, and 90 days of carbs over a
    30-day divisor would inflate every block threefold.
    """
    inputs = (block.evidence or {}).get("impact_inputs") or {}
    days = inputs.get("window_days") or 0
    carbs = float(inputs.get("carbs") or 0.0)
    per_day = (carbs / days) if days else 0.0
    return per_day * _inverse_values(block.current, block.recommended)


def price_ic_blocks(
    blocks: Sequence[IcBlock],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    robust_daily_insulin_u: Optional[float] = None,
) -> List[IcBlock]:
    """Stamp each block's server-computed ``impact_u_day`` / ``recurrence`` / ``priority``.

    ADR 0032 puts the score on the server so the client ranks by reading, never by
    deriving — and #518 makes that load-bearing in a new way: the client picks the
    headline block by maximum PRIORITY, and :func:`ic_lever`, ``_param_schedule`` and
    ``consolidate_profile`` pick it the same way off the same numbers, so server and
    client cannot disagree about which block wears the flag or which value lands in the
    consolidated profile.

    A block that does not assert keeps priority 0 — its currency is still surfaced
    (informational), exactly as a held basal slot's is.
    """
    out: List[IcBlock] = []
    for b in blocks:
        impact_u_day = _ic_block_impact_u_day(b)
        impact = _impact_factor(impact_u_day, scenario_config, robust_daily_insulin_u)
        if b.asserts_move:
            recurrence, channel = _ic_block_recurrence(b)
            priority = priority_score(impact, recurrence)
        else:
            recurrence, channel, priority = 0.0, {"kind": "held"}, 0
        out.append(replace(b, impact_u_day=impact_u_day, recurrence=recurrence,
                           recurrence_channel=channel, priority=priority))
    return out


def ic_headline_block(blocks: Sequence[IcBlock]) -> Optional[IcBlock]:
    """The one asserting block the machine may speak for: highest emitted PRIORITY.

    Ties break to the earliest block on the clock, so the choice is deterministic.
    ``None`` when nothing asserts — which is the launch posture (ADR 518 consequences),
    and the reason the consolidated profile can carry the programmed ratio forward
    untouched. Selection moved here from the old raw-divergence key so that the server's
    headline and the client's "Decide now" are the same computation on the same field.
    """
    # `asserts_move` ALONE. It already means "this block names a real move it is
    # allowed to make"; re-testing `recommended` here would be a second eligibility
    # predicate, which is exactly how #273 and #465 stayed alive.
    eligible = [b for b in blocks if b.asserts_move]
    if not eligible:
        return None
    return max(eligible, key=lambda b: (b.priority, -b.start_min))


def ic_lever(
    blocks: Sequence[IcBlock],
    *,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    robust_daily_insulin_u: Optional[float] = None,
) -> Optional[TuningLever]:
    """The single I:C tuning Lever, off the per-value blocks (ADR 0032, #410/#518).

    ``None`` when there are no blocks at all. Impact is the basal-style tally over every
    **asserting** block, each priced by its OWN 90-day attributed carbs ÷ 90 (see
    :func:`_ic_block_impact_u_day`), plus one arm-wide rescue surcharge — ``Σ
    meal-rescue g ÷ 90 ÷ measured``. The surcharge is arm-wide and never per block: it
    exists to catch the "masked" user whose pre-emptive rescue carbs keep the measured
    ratio looking on-target, and that masking is a property of the person, not of an
    hour.

    There is ONE carb-ratio Lever, ever. Its headline is :func:`ic_headline_block` — the
    highest-priority asserting block — and the same block is what
    ``basal.consolidate_profile`` delivers, so machine-initiated advice carries exactly
    one block. User-staged blocks reach the pump through the existing Plan path instead.
    """
    if not blocks:
        return None
    priced = [b for b in blocks if b.estimate.value is not None]
    # The surcharge rides on the block window, like everything else a block reads.
    rescue_days = ic_module.BLOCK_WINDOW_DAYS
    total_rescue_grams = sum(_ic_block_rescue_grams(b) for b in blocks)
    rescue_per_day = total_rescue_grams / rescue_days if rescue_days else 0.0

    headline = ic_headline_block(blocks)
    if headline is None:
        # Held: surface the currency (informational) at priority 0 / recurrence 0 — the
        # same shape a held basal slot carries. The identity still travels with the
        # Lever so the surface can name the stretch that came closest.
        stand_in = (max(priced, key=lambda b: abs(_inverse_values(b.current, b.recommended)))
                    if priced else blocks[0])
        val = stand_in.estimate.value
        impact_u_day = (rescue_per_day / val) if val else 0.0
        return TuningLever(
            parameter="carb_ratio",
            title="Carb ratio (I:C)",
            impact=_impact_factor(impact_u_day, scenario_config, robust_daily_insulin_u),
            recurrence=0.0,
            priority=0,
            impact_u_day=impact_u_day,
            headline_start_min=stand_in.start_min,
            recurrence_channel={"kind": "held"},
        )

    impact_u_day = sum(b.impact_u_day for b in blocks if b.asserts_move)
    val = headline.estimate.value
    impact_u_day += (rescue_per_day / val) if val else 0.0
    impact = _impact_factor(impact_u_day, scenario_config, robust_daily_insulin_u)
    recurrence, channel = _ic_block_recurrence(headline)
    return TuningLever(
        parameter="carb_ratio",
        title="Carb ratio (I:C)",
        impact=impact,
        recurrence=recurrence,
        priority=priority_score(impact, recurrence),
        impact_u_day=impact_u_day,
        # Name the exact block that earned this score so the surface renders it verbatim
        # (#428): the headline identity travels with the Lever, held or ranked.
        headline_start_min=headline.start_min,
        recurrence_channel=channel,
    )


def _inverse_values(programmed: Optional[float], suggested: Optional[float]) -> float:
    """``|1/programmed − 1/suggested|`` — 0 if either value is unusable."""
    if not programmed or not suggested or programmed <= 0 or suggested <= 0:
        return 0.0
    return abs(1.0 / programmed - 1.0 / suggested)


def build_tuning_levers(
    basal: Sequence[SlotEstimate],
    isf: Sequence[SegmentEstimate],
    ic_blocks: Sequence[IcBlock],
    *,
    slot_minutes: int,
    scenario_config: ScenarioConfig = ScenarioConfig(),
    robust_daily_insulin_u: Optional[float] = None,
) -> List[TuningLever]:
    """All present tuning Levers (basal, ISF, I:C) as one list for the /analyze payload.

    ``ic_blocks`` are the **priced** carb-ratio blocks (:func:`price_ic_blocks`) — each
    already carries its own 90-day carb denominator and its own emitted priority, so no
    carb rate or window needs threading in from the caller any more (#518). Pass the
    same priced list to ``consolidate_profile`` so the deliverable profile and the
    Lever's headline are the same block by construction.

    ``robust_daily_insulin_u`` (#446) is the **one** user-level insulin baseline
    (:func:`robust_daily_insulin`), computed once by the caller and shared by all three
    levers so the currency is scale-invariant — never a per-lever denominator. Omitted, each
    lever falls back to the calibrated reference, preserving the reference account's behavior.
    """
    levers: List[TuningLever] = []
    for lever in (
        basal_lever(basal, slot_minutes=slot_minutes, scenario_config=scenario_config,
                    robust_daily_insulin_u=robust_daily_insulin_u),
        isf_lever(isf, scenario_config=scenario_config,
                  robust_daily_insulin_u=robust_daily_insulin_u),
        ic_lever(ic_blocks, scenario_config=scenario_config,
                 robust_daily_insulin_u=robust_daily_insulin_u),
    ):
        if lever is not None:
            levers.append(lever)
    return levers
