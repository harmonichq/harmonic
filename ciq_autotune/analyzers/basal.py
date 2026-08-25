"""A1 · Basal analyzer (hardened).

Same method as the original model (PLAN §6): the median of clean delivered-basal
minutes per half-hour slot, the honest mimic-CIQ maintenance rate. The hardening
the roadmap asks for (A1, F4) is in how it *reports*:

* every slot is an :class:`~ciq_autotune.uncertainty.Estimate` (median + bootstrap
  CI + n) — thin slots show a wide CI, they are never blanked;
* ``current`` is read from the dense **programmed** ``profileBasalRate`` feed, not
  inferred from sparse profileDelivery segments;
* the safety cap is demoted from a gate to a one-step *annotation* — "a
  conservative one-step move from current would be X" — alongside the full estimate.

No target knob: basal holds you flat at wherever you are; aiming at a setpoint is
the ISF lever (ROADMAP §3). Windowing/epoch grounding is the facade's job — this
runs on whatever slice it is handed.
"""

from __future__ import annotations

import bisect
import statistics
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Sequence, Tuple

from ..events import BasalEvent, BolusEvent, CarbEntry, CgmReading, PumpEvent
from ..harm import BasalHarm, HarmConfig, PrintedLow, basal_harm, basal_harm_evidence
from ..model import CleanSample, ModelConfig, _slot_label, _slot_of, clean_samples
from ..result import (
    ConsolidatedProfile,
    IcBlock,
    ProfileSegment,
    SegmentEstimate,
    SlotEstimate,
)
from ..safety import (
    _MIN_DIRECTIONAL_DAYS,
    SafetyConfig,
    Status,
    apply_harm,
    basal_sign_directions,
    cap,
)
from ..uncertainty import Estimate, estimate_median

# The magnitude below which a computed lean is not worth reporting: the safety
# noise floor (safety.SafetyConfig.noise_floor), the same threshold that turns a
# basal move into "no change".
_LEAN_NOISE_FLOOR = SafetyConfig().noise_floor

# The Tandem pump accepts at most this many basal segments (settings.py:17-18,
# tDependentSegs zero-padded to 16). Applying all 48 per-slot rates is literally
# impossible on the pump, so #87 consolidates down to fit this cap.
MAX_PUMP_SEGMENTS = 16


def schedule_by_slot(schedule: List["Tuple[int, float]"],
                     slot_minutes: int) -> Dict[int, float]:
    """Expand a ``[(start_min, rate), ...]`` profile schedule into slot -> rate.

    Each slot takes the rate of the last segment whose ``start_min`` is at or
    before the slot's start minute; slots before the first segment are left
    unset. This is the *active programmed* baseline — the same source the pump's
    "Active profile" table shows — as opposed to :func:`programmed_basal_by_slot`,
    which reconstructs it from delivered-basal events and can lag the active
    profile when a window spans more than one profile (#69).
    """
    n_slots = 24 * 60 // slot_minutes
    segs = sorted(schedule)
    out: Dict[int, float] = {}
    for s in range(n_slots):
        slot_start = s * slot_minutes
        rate = None
        for start_min, r in segs:
            if start_min <= slot_start:
                rate = r
            else:
                break
        if rate is not None:
            out[s] = float(rate)
    return out


def programmed_basal_by_slot(basal_events: List[BasalEvent],
                             slot_minutes: int) -> Dict[int, float]:
    """Slot -> programmed rate, from the most recent profileBasalRate per slot.

    The dense feed carries the programmed rate at every instant; a segment covers
    every slot in ``[t, t+duration)`` (one slot for a 5-min real sample, several
    for a long synthetic segment), and the latest segment wins each slot.
    """
    latest: Dict[int, "tuple" ] = {}
    step = timedelta(minutes=slot_minutes)
    for e in basal_events:
        if e.profile_basal_rate is None:
            continue
        t, end = e.t, e.t + timedelta(minutes=e.duration_mins or slot_minutes)
        while t < end:
            s = _slot_of(t, slot_minutes)
            if s not in latest or e.t > latest[s][0]:
                latest[s] = (e.t, e.profile_basal_rate)
            t += step
    return {s: rate for s, (_, rate) in latest.items()}


def _annotation_for(status: Status) -> str:
    """The one sentence each status prints, in the canonical user register.

    These strings are *user copy*, not engine vocabulary: they surface verbatim in
    the Settings audit evidence pane, the CLI table and the Markdown report, so they
    follow ``DESIGN.md``'s voice and user-copy register (no prose em dashes, no
    engine jargon, no "clean", no user-facing "ISF" or "slot"). The engine's own
    terms stay in the code around them.
    """
    return {
        Status.NO_DATA: "no nights of steady data at this time yet",
        Status.NO_BASELINE: "no set rate to step from, so only the measured range is shown",
        Status.NO_CHANGE: "the measured rate and the set rate agree, so no change is suggested",
        Status.INSUFFICIENT: "not enough nights of steady data yet to point one way",
        Status.RAISE: "one cautious step up is supported at this time",
        Status.LOWER: "one cautious step down is supported at this time",
        Status.CAPPED_RAISE: "a step up, limited to 20% above the set rate",
        Status.CAPPED_LOWER: "a step down, limited to 20% below the set rate",
        Status.HARM_LOWER: "lows keep happening at this hour, so the rate steps down toward the measured rate (20% at most)",
        Status.HARM_GATED: "a low printed at this hour, so a step up is withheld and the rate stays as it is",
    }[status]


def _pool_decision(pre: Estimate, post: Estimate) -> "Tuple[bool, Optional[str]]":
    """Decide whether pre-edit and post-edit clean deliveries measure the same need.

    Both are day-collapsed :class:`~ciq_autotune.uncertainty.Estimate`s (80% bootstrap
    CIs). This distinguishes the two reasons a slot's programmed rate was edited:

    * **Regime A** — the profile was fixed to match a need the data already showed
      (e.g. applying this tool's own recommendation). Pre- and post-edit clean
      delivery still measure the *same* body need, so the pre-edit samples are not
      stale and dropping them is pure information loss.
    * **Regime B** — the body's need genuinely changed at the edit. Pre-edit
      delivery measures an obsolete need; only post-edit data is valid.

    Returns ``(should_pool, note)``. We pool only when the regimes *agree*:

    1. the post-edit subset is thick enough to run the test at all
       (``post.n >= _MIN_DIRECTIONAL_DAYS``, mirroring the directional-days guard) —
       a too-thin post subset can't confirm agreement, so we refuse to pool; and
    2. the two 80% CIs overlap — the data does not distinguish the two rates.

    ``note`` is a human-readable divergence reason when we decline to pool despite a
    testable post subset (regime B); ``None`` otherwise (agreed pool, or a post
    subset too thin to have been tested).
    """
    if post.n < _MIN_DIRECTIONAL_DAYS:
        # Too thin to test: keep current behavior (post-edit only), no assertion.
        return False, None
    if (pre.value is None or post.value is None
            or pre.lo is None or pre.hi is None
            or post.lo is None or post.hi is None):
        return False, None
    overlap = pre.lo <= post.hi and post.lo <= pre.hi
    if overlap:
        return True, None
    return False, (
        f"pre-edit delivery (~{pre.value:g} U/h) disagrees with post-edit "
        f"(~{post.value:g} U/h) — using post-edit data only"
    )


def _day_medians(day_map: Dict[object, List[float]]) -> List[float]:
    """Collapse a ``{date: [rate, ...]}`` map to one median per day, date-sorted."""
    return [statistics.median(rs) for _, rs in sorted(day_map.items())]


def _slot_lean_magnitude(
    pairs: List[Tuple[float, float]],
) -> Optional[float]:
    """Estimate how much a one-sided slot's clean median may lean high, in U/h.

    ``pairs`` are the ``(rate, BG)`` clean minutes for one slot. The shipped
    estimate is the median of all clean rates. Minutes whose BG sits in the
    **bottom half** of this slot's observed clean-BG range are closer to
    "CIQ satisfied" territory (less corrective basal riding along), so their
    median is a lower-corruption proxy for true maintenance need. The lean is
    the gap: ``full_median - bottom_half_median``, clamped at zero (a negative
    gap means the estimate does not lean high).

    Returns ``None`` when the slot has no BG spread (all readings identical, so
    there is no "bottom half" to separate) or too few points to split.
    """
    if len(pairs) < 2:
        return None
    bgs = [bg for _, bg in pairs]
    bg_min, bg_max = min(bgs), max(bgs)
    if bg_max <= bg_min:
        return None  # no spread — bottom half is undefined
    bg_mid = (bg_min + bg_max) / 2.0
    bottom = [rate for rate, bg in pairs if bg <= bg_mid]
    if not bottom:
        return None
    full_median = statistics.median(rate for rate, _ in pairs)
    bottom_median = statistics.median(bottom)
    return max(0.0, full_median - bottom_median)


def _onesided_verdicts(
    samples: List[CleanSample],
    cgm_readings: List[CgmReading],
    cfg: ModelConfig,
) -> Dict[int, dict]:
    """One-sided / dawn-band lean verdict per basal slot (ADR 0001, one-sided
    window / #56).

    A slot's clean-BG distribution is *one-sided* when a fraction above
    ``cfg.onesided_bg_threshold`` (default 0.65) of its clean minutes have BG
    above the window midpoint ``(bg_low + bg_high) / 2``. One-sided distributions
    arise when the user runs high so the clean-window filter ``[bg_low, bg_high]``
    is left-truncated (few readings below midpoint but many near the top of
    range). This inflates the apparent median toward the corrective-basal end of
    the distribution and can produce an over-suggestion, most notably in the dawn
    band. The verdict flags the slot for human review; it does not block the
    estimate.

    Returns ``{slot: {"frac": ..., "lean": ..., "note": ...}}`` for each slot that
    exceeds the threshold. Rides on the same ``SlotEstimate.evidence`` shelf as the
    ``pooling`` verdict; ``analyze.py`` rolls the notes into the report.

    The default threshold of 0.65 matches the empirical fraction observed in the
    dawn band (06:00–08:30) during an internal data review. Override via
    ``ModelConfig(onesided_bg_threshold=...)``.
    """
    if not samples:
        return {}

    midpoint = (cfg.bg_low + cfg.bg_high) / 2.0
    max_stale = timedelta(minutes=cfg.bg_max_stale_min)

    # Build a sorted CGM lookup (time → bg) for fast nearest-reading queries.
    cgm_sorted = sorted((r.t, r.bg) for r in cgm_readings if r.bg is not None)
    cgm_times = [p[0] for p in cgm_sorted]
    cgm_bgs = [p[1] for p in cgm_sorted]

    def _nearest_bg(t: datetime) -> Optional[float]:
        i = bisect.bisect_left(cgm_times, t)
        best: Optional[Tuple[timedelta, float]] = None
        for j in (i - 1, i):
            if 0 <= j < len(cgm_times):
                d = abs(cgm_times[j] - t)
                if d <= max_stale and (best is None or d < best[0]):
                    best = (d, cgm_bgs[j])
        return best[1] if best else None

    # Accumulate per-slot counts and keep the (rate, BG) pairs so a flagged slot
    # can be re-scanned for a magnitude estimate (see _slot_lean_magnitude).
    above: Dict[int, int] = {}
    total: Dict[int, int] = {}
    pairs: Dict[int, List[Tuple[float, float]]] = {}
    for smp in samples:
        bg = _nearest_bg(smp.t)
        if bg is None:
            continue
        s = smp.slot
        total[s] = total.get(s, 0) + 1
        pairs.setdefault(s, []).append((smp.rate, bg))
        if bg > midpoint:
            above[s] = above.get(s, 0) + 1

    verdicts: Dict[int, dict] = {}
    slot_minutes = cfg.slot_minutes
    for s in sorted(total):
        n = total[s]
        if n < 1:
            continue
        frac = above.get(s, 0) / n
        if frac > cfg.onesided_bg_threshold:
            label = f"{(s * slot_minutes) // 60:02d}:{(s * slot_minutes) % 60:02d}"
            pct = f"{frac * 100:.1f}"
            note = (
                f"Slot {label}: {pct}% of clean minutes have BG > {midpoint:.0f} "
                f"(midpoint of [{cfg.bg_low:.0f}, {cfg.bg_high:.0f}] window) — "
                "clean-BG distribution is one-sided; the estimate may lean high. "
                "Review with appropriate skepticism."
            )
            lean = _slot_lean_magnitude(pairs[s])
            if lean is None or lean < _LEAN_NOISE_FLOOR:
                note += " Lean within noise."
            else:
                note += f" Estimated lean: may lean high by ~{lean:.2f} U/h."
            verdicts[s] = {"frac": frac, "lean": lean, "note": note}
    return verdicts


def analyze_basal(
    basal_events: List[BasalEvent],
    cgm_readings: List[CgmReading],
    bolus_events: List[BolusEvent],
    pump_events: List[PumpEvent],
    *,
    config: ModelConfig = ModelConfig(),
    safety: SafetyConfig = SafetyConfig(),
    slot_starts: Optional[Dict[int, datetime]] = None,
    active_basal: Optional[List[Tuple[int, float]]] = None,
    pool_agreeing_regimes: bool = False,
    carb_entries: Optional[List[CarbEntry]] = None,  # exclusion signal (#125/#127)
    harm_config: Optional[HarmConfig] = None,
    harm_lows: Optional[Sequence[PrintedLow]] = None,
) -> List[SlotEstimate]:
    """Per-slot basal estimates with CI, current rate, and a one-step annotation.

    ``slot_starts`` optionally cuts each slot's samples to that slot's own basal
    epoch (see :func:`~ciq_autotune.epochs.basal_slot_epochs`) — an edit to one
    segment then only shortens the slots it actually moved.

    ``active_basal`` is the active profile's basal schedule
    (``[(start_min, rate)]``, from ``PumpSettings.active_schedule("basal_rate")``).
    When given, it — not the delivered-basal reconstruction — is the ``current``
    baseline for each slot, so the diff view matches the "Active profile" table
    even when the window spans more than one profile (#69). The reconstructed
    ``programmed_basal_by_slot`` is kept as the fallback when no settings snapshot
    is available.

    ``pool_agreeing_regimes`` (#85) relaxes the hard pre-edit cut on a per-slot,
    data-driven basis. A ``slot_starts`` cut normally drops every clean minute that
    predates a slot's current programmed rate (issue #56's mitigation for the
    "edit means the body's need changed" case). But many edits merely fix the
    profile to match a need the data already showed, so the pre-edit samples still
    measure current need. When this flag is on and a slot has a cut, the pre- and
    post-edit clean deliveries are each day-collapsed and estimated; if their 80%
    CIs overlap (and the post subset is thick enough to test — see
    :func:`_pool_decision`) the two subsets are pooled and the full-window n is
    recovered. If they diverge, post-edit-only behavior is kept and a divergence
    note is recorded under ``evidence["pooling"]``. While the post subset is too
    thin to test, current behavior (post-edit only) stands. Defaults **off**;
    with it off the pre-edit cut is unchanged.

    ``harm_config`` wires the **harm layer** (ADR 0038, :mod:`~ciq_autotune.harm`):
    printed overnight lows attributed to basal (fasting nadirs, no bolus IOB acting)
    **gate** their slot (a would-be raise is withheld) and, when they recur across the
    band, **nudge** it down one step cap — a downward-only safety adjustment applied on
    top of the clean-window verdict, never rewriting the median. Pass a ``HarmConfig``
    to enable it; ``None`` (the default) skips it entirely, so the clean-window verdict
    stands unchanged.
    """
    cfg = config
    n_slots = 24 * 60 // cfg.slot_minutes
    samples = clean_samples(basal_events, cgm_readings, bolus_events, pump_events, cfg,
                            carb_entries=carb_entries)
    # Direction is a per-night departure from the programmed basal that was in
    # force on that night — never today's active schedule. Ties are Control-IQ
    # simply delivering the profile and carry no directional information. Missing
    # as-of rates make that night unavailable. This uses the full requested
    # window: unlike the estimate's epoch cut below, each night is normalized to
    # its own programmed basal before the family-wide sign test (#469/#480).
    sign_nights: Dict[int, Dict[object, List[float]]] = {
        s: {} for s in range(n_slots)
    }
    for smp in samples:
        if smp.programmed_rate is None:
            continue
        sign_nights[smp.slot].setdefault(smp.t.date(), []).append(
            smp.rate - smp.programmed_rate
        )
    signs_by_slot: List[List[int]] = []
    night_signs: Dict[int, Dict[object, int]] = {s: {} for s in range(n_slots)}
    for s in range(n_slots):
        signs = []
        for night, departures in sign_nights[s].items():
            night_departure = statistics.median(departures)
            if night_departure != 0.0:
                sign = 1 if night_departure > 0.0 else -1
                signs.append(sign)
                night_signs[s][night] = sign
        signs_by_slot.append(signs)
    supported_directions = basal_sign_directions(signs_by_slot)
    # Harm layer (ADR 0038): the basal arm's gate/nudge verdict over the overnight
    # band, from the printed lows in the *raw* CGM (not the clean window — the whole
    # point is that the clean-window filter never sees these lows). Computed once here
    # and applied per slot after cap(). Skipped when no HarmConfig is supplied.
    harm: BasalHarm = (
        basal_harm(cgm_readings, bolus_events, cfg.slot_minutes, harm_config,
                   lows=harm_lows, slot_epochs=slot_starts)
        if harm_config is not None else BasalHarm()
    )
    # One-sided / dawn-band lean verdict per slot (ADR 0001). Computed here in the
    # same pass — reusing the clean_samples the estimate rides on — and attached to
    # each SlotEstimate.evidence, the same shelf the pooling verdict uses.
    onesided = _onesided_verdicts(samples, cgm_readings, cfg)
    reconstructed = programmed_basal_by_slot(basal_events, cfg.slot_minutes)
    active_by_slot = schedule_by_slot(active_basal, cfg.slot_minutes) if active_basal else {}
    programmed = active_by_slot or reconstructed
    slot_starts = slot_starts or {}

    # Keep the source-night roster beside the clean samples.  The evidence
    # projection reads these analyzer-owned facts; it must never run the window
    # classifier again just to explain a published estimate.  Source minutes use
    # the same duration and per-minute cut semantics as the clean-sample pass.
    source_nights: Dict[int, set] = {s: set() for s in range(n_slots)}
    pre_source_nights: Dict[int, set] = {s: set() for s in range(n_slots)}
    for event in basal_events:
        end = event.t + timedelta(minutes=event.duration_mins or 0.0)
        t = event.t
        while t < end:
            slot = _slot_of(t, cfg.slot_minutes)
            target = pre_source_nights if (slot_starts.get(slot) is not None
                                            and t < slot_starts[slot]) else source_nights
            target[slot].add(t.date())
            t += timedelta(minutes=1)

    # Clean minutes within one night are autocorrelated, so bootstrapping over
    # them would understate uncertainty. Reduce each (slot, day) to that day's
    # median first; the per-slot estimate then bootstraps over independent *days*,
    # and n is the day count — one night honestly reads as n=1, wide.
    #
    # Pre-edit minutes (those predating the slot's cut) are held in a parallel
    # ``pre_day_rates`` rather than dropped, so #85's pooling can reconsider them.
    day_rates: Dict[int, Dict[object, List[float]]] = {s: {} for s in range(n_slots)}
    pre_day_rates: Dict[int, Dict[object, List[float]]] = {s: {} for s in range(n_slots)}
    day_programmed: Dict[int, Dict[object, List[float]]] = {s: {} for s in range(n_slots)}
    pre_day_programmed: Dict[int, Dict[object, List[float]]] = {s: {} for s in range(n_slots)}
    for smp in samples:
        cut = slot_starts.get(smp.slot)
        if cut is not None and smp.t < cut:
            # Predates the slot's current programmed rate. Kept aside for #85's
            # pre/post pooling; still excluded from the post-edit estimate.
            pre_day_rates[smp.slot].setdefault(smp.t.date(), []).append(smp.rate)
            if smp.programmed_rate is not None:
                pre_day_programmed[smp.slot].setdefault(smp.t.date(), []).append(
                    smp.programmed_rate)
            continue
        day_rates[smp.slot].setdefault(smp.t.date(), []).append(smp.rate)
        if smp.programmed_rate is not None:
            day_programmed[smp.slot].setdefault(smp.t.date(), []).append(smp.programmed_rate)

    out: List[SlotEstimate] = []
    for s in range(n_slots):
        post_map = day_rates[s]
        pre_map = pre_day_rates[s]
        programmed_map = day_programmed[s]
        pooling_note: Optional[str] = None

        # Default: post-edit-only (the current behavior / issue #56 cut).
        day_map = post_map
        if pool_agreeing_regimes and pre_map:
            pre_est = estimate_median(_day_medians(pre_map))
            post_est = estimate_median(_day_medians(post_map))
            should_pool, note = _pool_decision(pre_est, post_est)
            if should_pool:
                # Merge by date so a day split across the cut collapses to one
                # median, exactly as an uncut slot's day would.
                merged: Dict[object, List[float]] = {
                    d: list(rs) for d, rs in post_map.items()
                }
                for d, rs in pre_map.items():
                    merged.setdefault(d, []).extend(rs)
                day_map = merged
                merged_programmed: Dict[object, List[float]] = {
                    d: list(rs) for d, rs in day_programmed[s].items()
                }
                for d, rs in pre_day_programmed[s].items():
                    merged_programmed.setdefault(d, []).extend(rs)
                programmed_map = merged_programmed
            else:
                pooling_note = note  # None when post was merely too thin to test

        days_sorted = sorted(day_map.items())
        per_day = [statistics.median(rs) for _, rs in days_sorted]
        est = estimate_median(per_day)
        current: Optional[float] = programmed.get(s)
        # The same family-corrected direction verdict drives status and therefore
        # SlotEstimate.asserts_move. Slots that do not clear it keep their estimate
        # visible but hold everywhere downstream.
        recommended, status = cap(
            current, est.value, safety, est,
            supported_direction=supported_directions.get(s, 0),
        )
        # Harm layer (ADR 0038): if this slot printed an overnight fasting low, gate a
        # raise; if such lows recurred across the band, nudge it down one step. Applied
        # on top of the clean verdict and only ever toward less insulin. It overrides
        # the clean-window sufficiency gate on purpose — an observed recurring low is
        # direct evidence, independent of how many *clean* nights the slot has.
        harm_verdict: Optional[dict] = None
        if s in harm.gated_slots:
            recommended, status = apply_harm(
                current, recommended, status, safety,
                nudge=(s in harm.nudged_slots),
                median=est.value,
            )
            harm_verdict = basal_harm_evidence(harm, s, cfg.slot_minutes)
        evidence: Dict = {"points": [
            {"date": d.isoformat(),
             "t": datetime.combine(d, datetime.min.time())
                  .replace(hour=(s * cfg.slot_minutes) // 60,
                           minute=(s * cfg.slot_minutes) % 60).isoformat(),
             "rate": r}
            # One (date, rate) point per clean day, for the Settings audit's
            # per-slot clean-night scatter.
            # `t` pins it to this slot's actual time-of-day on that date (not just
            # midnight) so the unified drill-down (#20) can jump straight to the
            # moment in the Daily report, same as basal/ISF/I:C now all support.
            for (d, _), r in zip(days_sorted, per_day)]}
        evidence["night_roster"] = [
            {"date": d.isoformat(),
             "t": datetime.combine(d, datetime.min.time())
                  .replace(hour=(s * cfg.slot_minutes) // 60,
                           minute=(s * cfg.slot_minutes) % 60).isoformat(),
             "delivered_rate": rate,
             "programmed_rate": (statistics.median(programmed_map[d])
                                 if programmed_map.get(d) else None),
             "sign": night_signs[s].get(d)}
            for (d, _), rate in zip(days_sorted, per_day)
        ]
        estimate_dates = {d for d, _ in days_sorted}
        # This count names every source night absent from the final estimate,
        # including epoch and Regime-B exclusions.  Pooling merely decides which
        # source nights return to the estimate; it never changes the accounting.
        source_dates = source_nights[s] | pre_source_nights[s]
        evidence["excluded_night_count"] = len(source_dates - estimate_dates)
        # This is deliberately not the roster size: the sign test uses the full
        # non-tie, as-of-programmed pool before any setting-epoch estimate cut.
        evidence["directional_support_count"] = len(signs_by_slot[s])
        if pooling_note is not None:
            # Regime B: divergence detected, post-edit-only kept. Surfaced as a
            # per-slot data-quality note (analyze.py rolls these into the report).
            evidence["pooling"] = {
                "pooled": False,
                "note": f"slot {_slot_label(s, cfg.slot_minutes)}: {pooling_note}",
            }
        elif pool_agreeing_regimes and pre_map and day_map is not post_map:
            evidence["pooling"] = {"pooled": True}
        verdict = onesided.get(s)
        if verdict is not None:
            evidence["onesided"] = verdict
        if harm_verdict is not None:
            evidence["harm"] = harm_verdict
        out.append(SlotEstimate(
            slot=s,
            label=_slot_label(s, cfg.slot_minutes),
            current=current,
            estimate=est,
            recommended=recommended,
            annotation=_annotation_for(status),
            days=len(per_day),
            evidence=evidence,
            status=status,
        ))
    return out


def _deliverable_rate(slot: SlotEstimate) -> Optional[float]:
    """The rate we'd actually program for one slot.

    We only take the moved recommendation when :func:`~ciq_autotune.safety.cap`
    asserted a **direction** (RAISE/LOWER/CAPPED_*, i.e. ``slot.asserts_move``).
    ``cap()`` returns a moved, capped number even for a slot it holds — an
    ``INSUFFICIENT`` estimate (wide, thin-n, or a CI that spans current) — so the
    recommendation is **not** safe to program on its own (issue #264). For any
    held slot with a baseline we therefore carry the **current programmed rate**
    forward, so the consolidated/deliverable profile moves exactly the slots the
    Diagnose/Plan surface stages and no others.

    With no current rate on file (``NO_BASELINE``) the recommendation is the only
    number we have, so we still use it; and as a last resort (no recommendation
    either) we take the raw estimate so the slot contributes a number, not a hole.
    """
    if slot.asserts_move and slot.recommended is not None:
        return float(slot.recommended)
    if slot.current is not None:
        return float(slot.current)
    if slot.recommended is not None:
        return float(slot.recommended)
    if slot.estimate.value is not None:
        return float(slot.estimate.value)
    return None


class _Seg:
    """Mutable working segment during consolidation (slot indices + their rates)."""

    __slots__ = ("slots", "rates", "rate")

    def __init__(self, slot: int, rate: float):
        self.slots = [slot]
        self.rates = [rate]
        self.rate = rate

    def absorb(self, other: "_Seg") -> None:
        self.slots.extend(other.slots)
        self.rates.extend(other.rates)
        # Duration-weighted mean over the merged slots (all slots share one
        # duration, so this is a plain mean of the per-slot deliverable rates).
        self.rate = sum(self.rates) / len(self.rates)

    def max_deviation(self) -> float:
        return max(abs(r - self.rate) for r in self.rates)


def _basal_segments(
    slots: List[SlotEstimate], slot_minutes: int, noise_floor: float,
) -> List[_Seg]:
    """Run-length + noise-floor merge of the 48 half-hour basal slots into working
    :class:`_Seg`s (steps 1–2 of the old basal-only consolidation). No pump cap yet
    — the cap is applied later against the four-parameter *union*."""
    n_slots = 24 * 60 // slot_minutes
    pairs: List[Tuple[int, float]] = []
    for s in range(n_slots):
        row = next((r for r in slots if r.slot == s), None)
        if row is None:
            continue
        rate = _deliverable_rate(row)
        if rate is not None:
            pairs.append((s, rate))
    if not pairs:
        return []
    # Compare each slot to the running segment mean so a slow drift can't silently
    # accumulate past the floor.
    segs: List[_Seg] = [_Seg(pairs[0][0], pairs[0][1])]
    for slot, rate in pairs[1:]:
        if abs(rate - segs[-1].rate) < noise_floor:
            segs[-1].absorb(_Seg(slot, rate))
        else:
            segs.append(_Seg(slot, rate))
    return segs


def _collapse_islands(segs: List[_Seg], noise_floor: float) -> List[_Seg]:
    """Absorb single-slot **interior** segments whose two neighbors are within
    ``noise_floor`` of each other (#180).

    :func:`_basal_segments` merges only *adjacent* rates within the noise floor of
    the running mean, so nothing catches a per-slot-median rate that dips for one
    slot and immediately returns to the neighbor level — a 30-min zig-zag that is
    noise, not a programmable baseline. This pass folds ``prev + island + next``
    into one segment keeping the **larger neighbor's rate** (not a weighted mean,
    which would drag the level toward the excursion). Single-slot only: a
    two-slot window over-reaches and swallows genuine short bumps. Runs after the
    noise-floor merge and before the pump-cap force-merge."""
    segs = list(segs)
    changed = True
    while changed and len(segs) >= 3:
        changed = False
        for i in range(1, len(segs) - 1):
            island, prev, nxt = segs[i], segs[i - 1], segs[i + 1]
            if len(island.slots) == 1 and abs(prev.rate - nxt.rate) < noise_floor:
                # _Seg.__init__ sets .rate to the larger neighbor; then widen the
                # slot/rate coverage so max_deviation() still reflects the excursion.
                merged = _Seg(min(prev.slots), max(prev.rate, nxt.rate))
                merged.slots = sorted(prev.slots + island.slots + nxt.slots)
                merged.rates = prev.rates + island.rates + nxt.rates
                segs[i - 1 : i + 2] = [merged]
                changed = True
                break
    return segs


def _param_schedule(
    rows: Optional[List[SegmentEstimate]],
    programmed: Optional[List[Tuple[int, float]]],
) -> List[Tuple[int, Optional[float]]]:
    """The deliverable ``[(start_min, value)]`` step function for one non-basal
    parameter (ISF / I:C / target), carrying **unchanged** boundaries forward.

    Values come from the analyzer recommendations (:class:`SegmentEstimate`) where
    present — the ``recommended`` value, or the segment's ``current`` when the
    analyzer asserted no move — and fall back to the programmed active schedule
    (``programmed``, the #105 ``settings.active_schedule`` seam) elsewhere. When an
    analyzer produced no rows, the schedule *is* the programmed one (pure carry
    forward). Sorted by ``start_min``; empty when nothing is known.

    Carb ratio does NOT come through here — it is written by :func:`_ic_schedule` off
    the headline :class:`~ciq_autotune.result.IcBlock` (#518), because the unit that
    decides a carb ratio is the block, not the segment."""
    sched: Dict[int, Optional[float]] = {}
    for start, val in (programmed or []):
        sched[int(start)] = float(val)
    for r in (rows or []):
        val = r.recommended if r.recommended is not None else r.current
        sched[int(r.start_min)] = None if val is None else float(val)
    return sorted(sched.items())


def _ic_schedule(
    headline: Optional["IcBlock"],
    programmed: Optional[List[Tuple[int, float]]],
) -> List[Tuple[int, Optional[float]]]:
    """The deliverable carb-ratio step function: the programmed schedule, with the
    HEADLINE block's recommendation written at every one of its member boundaries (#518).

    Two things make this different from :func:`_param_schedule`:

    * **The block writes every member boundary, not one.** A block covers several
      programmed segments, and the deliverable is a step function — writing only the
      block's start would leave the later members carrying their old value, so the pump
      would run the new ratio for half an hour and the old one for the rest of the
      stretch. Every member gets the same number, which is what "one value across the
      block" means on a pump.
    * **Only the headline block is here at all.** Machine-initiated advice is one change
      at a time (ADR 0032/ADR 518 decision 14). Other asserting blocks are visible and
      individually stageable, but they reach the pump through the Plan path where the
      user chose them — never by being folded into the consolidated profile silently.

    ``headline`` is ``None`` whenever nothing asserts (the launch posture), and the
    schedule is then pure carry-forward. The block's own ``asserts_move`` is the single
    gate that put it here: this function never re-derives eligibility (#273/#465).
    """
    sched: Dict[int, Optional[float]] = {}
    for start, val in (programmed or []):
        sched[int(start)] = float(val)
    # `asserts_move` ALONE decides. It already carries "names a real move", so adding
    # a `recommended is not None` test here would be a second eligibility predicate
    # (#273/#465). The `is None` line below is payload-SHAPE validation, not
    # eligibility: a block that asserts without a number is a malformed producer, and
    # dropping it keeps the programmed value rather than writing `None` into a
    # deliverable pump schedule.
    if headline is not None and headline.asserts_move:
        if headline.recommended is None:
            return sorted(sched.items())
        for start in headline.member_start_mins:
            sched[int(start)] = float(headline.recommended)
    return sorted(sched.items())


def _value_at(schedule: List[Tuple[int, Optional[float]]], minute: int) -> Optional[float]:
    """Sample a ``[(start_min, value)]`` step function at ``minute``: the value of
    the last segment starting at or before ``minute`` (``None`` before the first)."""
    val: Optional[float] = None
    for start, v in schedule:
        if start <= minute:
            val = v
        else:
            break
    return val


def consolidate_profile(
    slots: List[SlotEstimate],
    *,
    isf: Optional[List[SegmentEstimate]] = None,
    carb_ratio: Optional["IcBlock"] = None,
    programmed_isf: Optional[List[Tuple[int, float]]] = None,
    programmed_ic: Optional[List[Tuple[int, float]]] = None,
    programmed_target: Optional[List[Tuple[int, float]]] = None,
    slot_minutes: int = 30,
    noise_floor: float = SafetyConfig().noise_floor,
    max_segments: int = MAX_PUMP_SEGMENTS,
) -> ConsolidatedProfile:
    """Roll the current recommendations into a single unified **four-parameter**
    ≤``max_segments``-segment profile the pump can actually accept (#98).

    A Tandem profile is one ``tDependentSegs`` array where each segment names basal +
    ISF + I:C + target at one ``start_min`` (``settings.py``), so consolidation must
    speak all four at every boundary:

    1. Basal is run-length + noise-floor merged from the 48 :class:`SlotEstimate`s
       (:func:`_basal_segments`): the deliverable rate per slot
       (:func:`_deliverable_rate`) merged where adjacent rates differ by less than
       ``noise_floor``.
    2. ISF / I:C / target each become a ``[(start_min, value)]`` step function: the
       analyzer recommendation where present, else the value **carried forward** from
       the current programmed profile — the #105 effective-settings seam, passed in as
       ``programmed_*`` from ``settings.active_schedule``. Target has no analyzer, so it
       is pure carry forward. I:C comes from :func:`_ic_schedule` and carries the
       **headline block only**, written at every one of that block's member boundaries
       (#518); ``carb_ratio`` is therefore a single
       :class:`~ciq_autotune.result.IcBlock`, not a list of rows. This function does
       **not** re-derive the current profile itself.
    3. Boundaries = the **union** of all four step functions' change points. Each
       union boundary becomes one segment carrying every param's value at that time.
    4. If the union exceeds ``max_segments``, iteratively merge the adjacent pair
       with the smallest basal-duration-weighted rate delta until the cap is met,
       keeping the earlier boundary's four values (forced merge). ``forced_merges``
       is then set and ``note`` carries the caveat with the worst forced-merge basal
       deviation — the same semantics as the basal-only version, extended to 4-param.

    Segment boundaries are 30-min-aligned. A fully empty input (no basal, no ISF/IC
    recommendations, no programmed schedules) yields an empty profile.
    """
    basal_segs = _collapse_islands(
        _basal_segments(slots, slot_minutes, noise_floor), noise_floor
    )
    # #180: ISF is carried forward from the *programmed* schedule only — the analyzer
    # `isf` rows are deliberately NOT fed into the pump-profile schedule. The ISF
    # analyzer returns a single rest-window regression as a one-row list with
    # start_min=0 (ADR 0001), which _param_schedule would write as sched[0] only,
    # producing a synthetic short ISF segment bounded by an unrelated programmed
    # boundary. The consolidated profile carries only numbers defended as a full-day
    # schedule; the fasting-ISF rec is surfaced advisory-only on the Recommendations
    # tab instead (see frontend/index.html; formalized by the #142 redesign). The
    # `isf` param is retained for call-site compatibility but intentionally unused.
    isf_sched = _param_schedule(None, programmed_isf)
    ic_sched = _ic_schedule(carb_ratio, programmed_ic)
    target_sched = _param_schedule(None, programmed_target)

    # Basal's own boundaries (the first slot's start of each merged basal segment),
    # mapped to the working _Seg so we can read rate/slots/deviation at each.
    basal_by_start: Dict[int, _Seg] = {
        min(seg.slots) * slot_minutes: seg for seg in basal_segs
    }

    # The boundaries the headline I:C block CANNOT survive without (#518): every
    # member it writes, and — the one that bites — its EXIT, the boundary that
    # restores the neighbouring block's ratio. The forced merge below removes
    # boundaries by basal delta alone, so without this it will happily delete the
    # 12:00 boundary that ends a 07:00–12:00 block and leave the tighter recommended
    # ratio running into the afternoon, which is a dosing error, not a rounding one.
    # `end_min == 1440` needs no protection: the day ends there and nothing follows.
    def _protected_ic_boundaries() -> set:
        if carb_ratio is None or not carb_ratio.asserts_move:
            return set()
        out = {int(m) for m in carb_ratio.member_start_mins}
        if carb_ratio.end_min != 24 * 60:
            out.add(int(carb_ratio.end_min))
        return out

    class _Row:
        __slots__ = ("start", "basal", "slots", "dev", "isf", "ic", "target")

    def _merge_rows(rows_, i) -> float:
        """Fold ``rows_[i+1]`` into ``rows_[i]`` and return the merged basal deviation.

        The earlier boundary wins (its start and all four parameter values survive);
        the later one's basal is folded in as a duration-weighted mean over the union
        of covered slots.
        """
        a, b = rows_[i], rows_[i + 1]
        merged_slots = a.slots + b.slots
        if merged_slots:
            rates: List[float] = []
            if a.basal is not None:
                rates += [a.basal] * (len(a.slots) or 1)
            if b.basal is not None:
                rates += [b.basal] * (len(b.slots) or 1)
            if rates:
                a.basal = round(sum(rates) / len(rates), 3)
            a.slots = sorted(merged_slots)
            if rates and a.basal is not None:
                a.dev = round(max(abs(a.basal - r) for r in rates), 3)
        del rows_[i + 1]
        return a.dev

    def _assemble(ic_schedule, protected):
        """Rows for one I:C schedule, force-merged to the cap. ``None`` when the cap
        cannot be met without deleting a protected boundary."""
        boundaries = set(basal_by_start)
        for sched in (isf_schedule_, ic_schedule, target_sched):
            boundaries.update(start for start, _ in sched)
        ordered_ = sorted(boundaries)
        if not ordered_:
            return [], False, 0.0
        rows_: List[_Row] = []
        active: Optional[_Seg] = None
        for start in ordered_:
            if start in basal_by_start:
                active = basal_by_start[start]
            row = _Row()
            row.start = start
            row.basal = round(active.rate, 3) if active else None
            row.slots = sorted(active.slots) if active else []
            row.dev = round(active.max_deviation(), 3) if active else 0.0
            row.isf = _value_at(isf_schedule_, start)
            row.ic = _value_at(ic_schedule, start)
            row.target = _value_at(target_sched, start)
            rows_.append(row)

        # Force-merge the smallest basal-weighted adjacent pair until we fit the pump
        # cap. Weight by merged basal slot count so a merge touching more minutes is
        # costlier; boundaries with no basal fall back to slot-count 1. A pair whose
        # RIGHT boundary is protected is never a candidate — merging deletes that
        # boundary.
        forced = False
        worst = 0.0
        while len(rows_) > max_segments:
            best_i, best_cost = None, None
            for i in range(len(rows_) - 1):
                if rows_[i + 1].start in protected:
                    continue
                a_, b_ = rows_[i], rows_[i + 1]
                weight = (len(a_.slots) or 1) + (len(b_.slots) or 1)
                da = a_.basal if a_.basal is not None else 0.0
                db = b_.basal if b_.basal is not None else 0.0
                cost = abs(da - db) * weight
                if best_cost is None or cost < best_cost:
                    best_i, best_cost = i, cost
            if best_i is None:
                # Every remaining boundary is load-bearing for the I:C move. There is
                # no safe merge, so the caller falls back to the programmed ratio.
                return None
            forced = True
            merged = _merge_rows(rows_, best_i)
            worst = max(worst, merged)
        return rows_, forced, worst

    isf_schedule_ = isf_sched
    protected_ic = _protected_ic_boundaries()
    assembled = _assemble(ic_sched, protected_ic)
    if assembled is None:
        # FAIL CLOSED for the carb-ratio dimension only: the profile still consolidates
        # basal/ISF/target, but it delivers the PROGRAMMED ratio rather than a move
        # whose restoring boundary the pump cannot hold. Advising a tighter ratio the
        # schedule would then run past its stretch is worse than advising nothing.
        ic_sched = _ic_schedule(None, programmed_ic)
        assembled = _assemble(ic_sched, set())
    rows, forced_merges, forced_worst_dev = assembled
    if not rows:
        return ConsolidatedProfile(
            segments=[], max_segments=max_segments, noise_floor=noise_floor,
            total_daily_basal=0.0, forced_merges=False, note=None,
        )
    total = 0.0
    for i, row in enumerate(rows):
        if row.basal is None:
            continue
        end = rows[i + 1].start if i + 1 < len(rows) else 24 * 60
        total += row.basal * ((end - row.start) / 60.0)

    out_segments = [
        ProfileSegment(
            start_min=row.start,
            label=_slot_label(row.start // slot_minutes, slot_minutes),
            basal_rate=row.basal,
            isf=row.isf,
            carb_ratio=row.ic,
            target_bg=row.target,
            basal_slots=row.slots,
            basal_max_deviation=row.dev,
        )
        for row in rows
    ]

    note: Optional[str] = None
    if forced_merges:
        note = (
            "recommendations span more distinct rates than the pump's "
            f"{max_segments}-segment limit; merged with max deviation "
            f"{forced_worst_dev:.2f} U/h"
        )

    return ConsolidatedProfile(
        segments=out_segments,
        max_segments=max_segments,
        noise_floor=noise_floor,
        total_daily_basal=round(total, 3),
        forced_merges=forced_merges,
        note=note,
    )
