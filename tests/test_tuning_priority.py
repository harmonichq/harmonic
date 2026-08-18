"""Tuning-Lever priority builders — analyzer evidence in one insulin currency."""

import random
import unittest
from dataclasses import replace
from datetime import datetime, timedelta

from ciq_autotune.analyzers.basal import analyze_basal
from ciq_autotune.analyzers.ic import (
    BLOCK_WINDOW_DAYS,
    analyze_ic_blocks,
    ic_asserts_move,
)
from ciq_autotune.analyzers.isf import IsfConfig, analyze_isf
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.analyzers.tuning_priority import (
    basal_lever,
    build_tuning_levers,
    ic_headline_block,
    ic_lever,
    isf_lever,
    price_ic_blocks,
    robust_daily_insulin,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.insulin import InsulinActivity, basal_microdoses
from ciq_autotune.rest_window import RestWindow
from ciq_autotune.result import IcBlock, SegmentEstimate, SlotEstimate
from ciq_autotune.safety import Status
from ciq_autotune.uncertainty import Estimate


_MEASURED_RECOMMENDATION = object()


def _derive_status(current, recommended, wide):
    """The cap() verdict this slot would carry, so the shared `asserts_move`
    predicate (the impact tally now keys on it) sees the real Status."""
    if wide:
        return Status.INSUFFICIENT
    if recommended is None or current is None:
        return Status.NO_DATA
    if recommended > current:
        return Status.RAISE
    if recommended < current:
        return Status.LOWER
    return Status.NO_CHANGE


def _slot(slot, current, recommended, *, wide=False, nights=0, on_side=0, dir_up=None,
          status=None):
    """A basal SlotEstimate with `nights` clean-night points, `on_side` of which ran on
    the recommended side of `current`. `status` mirrors what cap() would return
    (derived from `wide` + direction unless given); pass it to exercise the
    CI-spans-current INSUFFICIENT case that isn't `wide`."""
    if dir_up is None:
        dir_up = recommended is not None and current is not None and recommended > current
    lo, hi = (current - 0.5, current + 0.5) if wide else (current - 0.02, current + 0.02)
    est = Estimate(value=current, lo=lo, hi=hi, n=max(nights, 1),
                   method="bootstrap-median")
    points = []
    for i in range(nights):
        on = i < on_side  # this night ran on the recommended side of current
        sign = 1.0 if (on == dir_up) else -1.0
        points.append({"date": f"2026-06-{i + 1:02d}", "rate": current + sign * 0.3})
    if status is None:
        status = _derive_status(current, recommended, wide)
    return SlotEstimate(slot=slot, label=f"{slot // 2:02d}:{'30' if slot % 2 else '00'}",
                        current=current, estimate=est, recommended=recommended,
                        annotation="", days=nights, evidence={"points": points},
                        status=status)


class BasalImpactTest(unittest.TestCase):
    def test_impact_sums_only_well_supported_slots(self):
        # Two changed slots: one well-supported (0.2 U/h off), one wide (0.4 off).
        # Only the well-supported slot's U/day feeds impact. 0.2 U/h * 0.5 h = 0.1 U/day.
        slots = [
            _slot(0, 0.6, 0.8, nights=20, on_side=18),   # well-supported, +0.2
            _slot(10, 1.0, 0.6, wide=True, nights=20),   # wide → excluded from impact
        ]
        lever = basal_lever(slots, slot_minutes=30)
        self.assertAlmostEqual(lever.impact_u_day, 0.1, places=6)

    def test_wide_slot_alone_gives_zero_impact(self):
        slots = [_slot(0, 0.6, 0.9, wide=True, nights=20)]
        lever = basal_lever(slots, slot_minutes=30)
        self.assertEqual(lever.impact_u_day, 0.0)
        self.assertEqual(lever.impact, 0.0)
        self.assertEqual(lever.priority, 0)

    def test_ci_spans_current_slot_is_held_out_of_impact(self):
        # #264: a slot marked INSUFFICIENT because its CI spans current — NOT `wide`
        # — was counted by the old `not wide` predicate. It must now be held out,
        # the same as the deliverable holds it (one shared `asserts_move` set).
        slots = [_slot(0, 0.6, 0.9, nights=20, on_side=18,
                       status=Status.INSUFFICIENT)]
        lever = basal_lever(slots, slot_minutes=30)
        self.assertEqual(lever.impact_u_day, 0.0)
        self.assertEqual(lever.priority, 0)

    def test_recurrence_uses_wilson_lower_bound_over_window(self):
        # 18 of 20 clean nights on the suggested side, window denominator 30.
        slots = [_slot(0, 0.6, 0.9, nights=20, on_side=18)]
        cfg = ScenarioConfig()
        lever = basal_lever(slots, slot_minutes=30, scenario_config=cfg)
        from ciq_autotune.uncertainty import wilson
        expected = wilson(18, cfg.priority_recurrence_window_days)[1]
        self.assertAlmostEqual(lever.recurrence, expected, places=6)

    def test_large_impact_uses_a_soft_tail(self):
        # A whole profile far off programmed approaches 1.0 without a hard clamp.
        slots = [_slot(s, 0.6, 2.6, nights=20, on_side=20) for s in range(0, 12, 2)]
        lever = basal_lever(slots, slot_minutes=30)
        self.assertGreater(lever.impact_u_day, 1.0)
        self.assertGreater(lever.impact, 0.7)
        self.assertLess(lever.impact, 1.0)

    def test_soft_saturation_preserves_low_currency_and_orders_high_currency(self):
        low = basal_lever([_slot(0, 1.0, 1.23, nights=30, on_side=15)], slot_minutes=60)
        formerly_pinned = basal_lever(
            [_slot(0, 1.0, 2.1, nights=30, on_side=15)], slot_minutes=60)
        much_larger = basal_lever(
            [_slot(0, 1.0, 4.6, nights=30, on_side=15)], slot_minutes=60)
        self.assertAlmostEqual(low.impact, 0.23, places=6)
        self.assertLess(formerly_pinned.impact, much_larger.impact)
        self.assertLess(much_larger.impact, 1.0)

    def test_no_slots_returns_none(self):
        self.assertIsNone(basal_lever([], slot_minutes=30))


def _isf_row(current, recommended, *, corrections_per_day, median_mgdl,
             corr_low_days=0, rescue_days=0, covered_days=30,
             side_k=0, side_n=0, measurement_asserts=False, priced_target=None):
    """An ISF SegmentEstimate carrying the #413 window-grounded impact inputs and
    night-honest recurrence channels the calibrated lever reads."""
    ref = recommended if recommended is not None else current
    est = Estimate(value=ref, lo=ref * 0.9, hi=ref * 1.1, n=12, method="bootstrap")
    ev = {
        "night_median": recommended,
        "impact_inputs": {"corrections_per_day": corrections_per_day,
                          "median_mgdl_over_target": median_mgdl,
                          "covered_days": covered_days,
                          "priced_target": priced_target},
        "recurrence_channels": {"corr_low_days": corr_low_days,
                                "rescue_days": rescue_days,
                                "covered_days": covered_days,
                                "side_k": side_k, "side_n": side_n,
                                "measurement_asserts": measurement_asserts},
    }
    return SegmentEstimate(start_min=0, label="Fasting", parameter="isf",
                           current=current, estimate=est, recommended=recommended,
                           annotation="", evidence=ev)


def _ic_block(current, value, lo, hi, recommended, *, start_min=12 * 60,
              end_min=1440, members=None, n_runs=29, n_meals=None,
              carbs_per_day=174.4, low_days=0, rescue_days=0, rescue_grams=0.0,
              admitted_rescue=0.0, side_k=0, side_n=0, on_regime=True,
              state="numeric"):
    """One :class:`IcBlock` carrying exactly the evidence ``analyze_ic_blocks`` stamps.

    ``asserts_move`` is **never** hand-set here: it is derived through the real
    :func:`ic_asserts_move` predicate off this evidence, so a pricing fixture can never
    quietly encode an eligibility assumption the analyzer would not make. That is the
    exact trap #273 fell into for four passes and #465 re-opened for I:C.
    """
    est = Estimate(value=value, lo=lo, hi=hi, n=n_runs, n_clusters=n_runs,
                   method="bootstrap-pooled-ratio-clustered")
    band_excludes = bool(
        value is not None and not est.wide and lo is not None and hi is not None
        and current is not None and not (lo <= current <= hi))
    regime_supported = bool(on_regime and value is not None and current is not None
                            and value != current)
    points = [{"carbs": 60.0, "rescue_carbs": 0.0} for _ in range(side_n)]
    if admitted_rescue:
        points.append({"carbs": 60.0, "rescue_carbs": admitted_rescue})
    rescues = [{"t": f"2026-07-{d + 1:02d}T12:00:00",
                "grams": rescue_grams / rescue_days} for d in range(rescue_days)]
    block = IcBlock(
        block_id=start_min, start_min=start_min, end_min=end_min, label="block",
        member_start_mins=list(members or [start_min]),
        current_values=[current], estimate=est, recommended=recommended,
        n_runs=n_runs, n_meals=n_meals if n_meals is not None else n_runs,
        state=state, asserts_move=False, annotation="",
        harm={"arm_days": low_days, "row_days": low_days} if low_days else {},
        evidence={
            "eligibility": {
                "runs_floor_met": n_runs >= 8,
                "runs_floor": 8,
                "n_runs": n_runs,
                "band_excludes_programmed": band_excludes,
                "regime_supported": regime_supported,
                "names_a_move": recommended is not None and recommended != current,
            },
            "recurrence_channels": {
                "window_days": BLOCK_WINDOW_DAYS,
                "side_k": side_k, "side_n": side_n,
                "low_days": low_days, "rescue_days": rescue_days,
                "measurement_asserts": band_excludes,
            },
            "preempted_low_gate": {"gated": bool(rescues), "count": len(rescues),
                                   "rescues": rescues},
            "impact_inputs": {"carbs": carbs_per_day * BLOCK_WINDOW_DAYS,
                              "window_days": BLOCK_WINDOW_DAYS},
            "points": points,
        },
    )
    return replace(block,
                   asserts_move=state == "numeric" and ic_asserts_move(block))


class SegmentCurrencyTest(unittest.TestCase):
    def _seg(self, parameter, current, measured, *, wide=False,
             recommended=_MEASURED_RECOMMENDATION):
        if recommended is _MEASURED_RECOMMENDATION:
            recommended = measured
        lo, hi = (measured * 0.5, measured * 1.5) if wide else (measured * 0.98, measured * 1.02)
        est = Estimate(value=measured, lo=lo, hi=hi, n=12, method="bootstrap")
        return SegmentEstimate(start_min=0, label="seg", parameter=parameter,
                               current=current, estimate=est, recommended=recommended,
                               annotation="")

    def test_confirming_isf_has_zero_impact_and_priority(self):
        # A confirm/hold read (no directional `recommended`) has no actionable currency.
        row = _isf_row(36.0, None, corrections_per_day=4.2, median_mgdl=76.0)
        lever = isf_lever([row])
        self.assertEqual(lever.impact_u_day, 0.0)
        self.assertEqual(lever.priority, 0)

    def test_weaken_isf_scores_from_window_inputs_in_the_tail(self):
        # Reference-snapshot shape: 36 → 43.2, 4.2 corrections/day, 76 mg/dL over
        # target, 4-of-30 correction-low days. Impact enters the soft tail; recurrence is
        # the Wilson lower bound of 4/30 — the priority lands in the tail, below 30, not 0.
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=4)
        lever = isf_lever([row])
        expected = 4.2 * 76.0 * abs(1 / 36.0 - 1 / 43.2)
        self.assertAlmostEqual(lever.impact_u_day, expected, places=6)
        self.assertGreater(lever.priority, 0)
        self.assertLess(lever.priority, 30)          # below the actionable line
        self.assertGreaterEqual(lever.priority, 18)  # ≈ 25

    def test_isf_impact_prices_the_recommended_move_not_the_measurement(self):
        # ADR 435: ISF impact prices the recommended move (36 → 43.2) — the step-capped,
        # harm-gated target derived from the robust night median — NOT the fragile pooled
        # estimate (24.8, which reads the wrong way, #413) and NOT the raw night median
        # (57.9, which overstates the per-cycle move basal would never make in one step).
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=4)
        row = replace(row, estimate=Estimate(value=24.8, lo=17.7, hi=35.2, n=1994,
                                              method="bootstrap"))
        row.evidence["night_median"] = 57.9
        lever = isf_lever([row])
        expected = 4.2 * 76.0 * abs(1 / 36.0 - 1 / 43.2)   # the recommended move
        self.assertAlmostEqual(lever.impact_u_day, expected, places=6)
        # explicitly neither the fragile pooled fit nor the raw night median
        self.assertNotAlmostEqual(
            lever.impact_u_day, 4.2 * 76.0 * abs(1 / 36.0 - 1 / 24.8), places=4)
        self.assertNotAlmostEqual(
            lever.impact_u_day, 4.2 * 76.0 * abs(1 / 36.0 - 1 / 57.9), places=4)

    def test_direction_only_weaken_keeps_the_priority_the_number_had(self):
        # #468: the harm-owned weaken no longer carries a number, but the ranking must
        # be identical — the lever prices the analyzer's pricing-only capped target
        # instead of a `recommended` it may no longer publish.
        numbered = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                            corr_low_days=4)
        direction_only = _isf_row(36.0, None, corrections_per_day=4.2,
                                  median_mgdl=76.0, corr_low_days=4,
                                  priced_target=43.2)
        was, now = isf_lever([numbered]), isf_lever([direction_only])
        self.assertAlmostEqual(now.impact_u_day, was.impact_u_day, places=9)
        self.assertEqual(now.priority, was.priority)
        self.assertGreater(now.priority, 0)

    def test_dense_correction_lows_lift_isf_above_the_line(self):
        # At this user's typical historical level (7 low-days/30) the card rises above
        # the actionable line — recurrence, not impact, does the lifting.
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=7)
        self.assertGreaterEqual(isf_lever([row]).priority, 30)

    def test_held_ic_has_zero_impact(self):
        # A block whose measurement matches its programmed value names no move, so the
        # one predicate holds it: currency 0, priority 0.
        lever = ic_lever([_ic_block(10.0, 10.0, 9.9, 10.1, 10.0)])
        self.assertEqual(lever.impact_u_day, 0.0)
        self.assertEqual(lever.priority, 0)

    def test_ic_lever_ignores_unmeasured_block(self):
        # Frozen #299 reproduction at block scope: the underpowered midnight block has
        # the larger inverse divergence, but `recommended=None` means it never cleared
        # the pool gate and must not drive the Lever headline. The midday block's band
        # excludes programmed (5.4 outside [5.02, 5.20]) and its on-regime evidence
        # agrees, so it asserts and headlines.
        thin = _ic_block(5.0, 3.36, 3.0, 3.72, None, start_min=0, end_min=12 * 60,
                         n_runs=2, state="collecting")
        midday = _ic_block(5.4, 5.11, 5.02, 5.20, 5.1, n_runs=28, low_days=8)
        blocks = price_ic_blocks([thin, midday])
        cfg = ScenarioConfig(priority_impact_unit_u_day=20.0,
                             priority_impact_linear_u_day=14.0)

        lever = ic_lever(price_ic_blocks(blocks, scenario_config=cfg),
                         scenario_config=cfg)

        # ADR 435: impact prices the recommended move (5.4 -> 5.1), not the measurement.
        expected_impact_u_day = 174.4 * abs(1 / 5.4 - 1 / 5.1)
        from ciq_autotune.uncertainty import wilson
        expected_recurrence = wilson(8, BLOCK_WINDOW_DAYS)[1]
        self.assertAlmostEqual(lever.impact_u_day, expected_impact_u_day, places=4)
        self.assertAlmostEqual(lever.recurrence, expected_recurrence, places=6)
        self.assertGreater(lever.priority, 0)
        self.assertEqual(lever.headline_start_min, 12 * 60)

    def test_ic_lever_serializes_the_headline_block(self):
        # #428 reference reproduction, re-keyed to blocks: midnight carries the LARGER
        # inverse divergence but its wide band covers programmed, so it never asserts.
        # Midday asserts, so the Lever must carry midday's identity and the frontend
        # renders that exact stretch — never the more-divergent midnight one.
        midnight = _ic_block(5.1, 5.84, 4.22, 7.92, 5.5, start_min=0, end_min=12 * 60,
                             n_runs=3, state="below-floor")
        midday = _ic_block(5.4, 5.82, 5.52, 6.12, 5.6, n_runs=29, low_days=11)
        self.assertFalse(midnight.asserts_move)

        lever = ic_lever(price_ic_blocks([midnight, midday]))

        self.assertGreater(lever.priority, 0)
        self.assertEqual(lever.headline_start_min, 12 * 60)
        self.assertEqual(lever.to_dict()["headline_start_min"], 12 * 60)

    def test_held_ic_lever_still_names_a_block(self):
        # A held (priority-0) I:C Lever surfaces the most-divergent measured block as its
        # identity, so a consumer reads one consistent stretch.
        blocks = price_ic_blocks([
            _ic_block(5.0, 5.05, 4.95, 5.15, 5.05, start_min=0, end_min=12 * 60),
            _ic_block(10.0, 9.0, 8.5, 10.6, 9.0),
        ])
        # Neither block asserts: each band covers its programmed value.
        self.assertFalse(any(b.asserts_move for b in blocks))
        lever = ic_lever(blocks)
        self.assertEqual(lever.priority, 0)
        self.assertEqual(lever.headline_start_min, 12 * 60)

    def test_ic_lever_returns_none_when_there_are_no_blocks(self):
        self.assertIsNone(ic_lever([]))

    def test_none_rows_return_none(self):
        self.assertIsNone(isf_lever([]))
        self.assertIsNone(ic_lever([]))


class IcEligibilityRanksTest(unittest.TestCase):
    """I:C is calibrated (#410) and ranks by default; only its own gate holds it.

    Post-#518 that gate is the four-condition block predicate, so this class asserts
    what makes a block rank rather than what a suppression flag did.
    """

    def test_ic_ranks_by_default_when_a_block_asserts(self):
        block = _ic_block(5.4, 5.82, 5.52, 6.12, 5.6, n_runs=29, low_days=12)
        self.assertTrue(block.asserts_move)
        lever = ic_lever(price_ic_blocks([block]))
        self.assertGreater(lever.priority, 0)
        self.assertGreater(lever.recurrence, 0.0)
        self.assertGreater(lever.impact_u_day, 0.0)

    def test_isf_ranks_by_default_when_the_pattern_is_dense(self):
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=7)
        self.assertGreater(isf_lever([row]).priority, 0)

    def test_basal_is_unaffected_by_the_ic_gate(self):
        slots = [_slot(0, 0.6, 0.9, nights=20, on_side=18)]
        self.assertGreater(basal_lever(slots, slot_minutes=30).priority, 0)


class IcLeverCalibratedTest(unittest.TestCase):
    """The calibrated I:C Lever at block scope (#410/#518): the four-condition gate, the
    per-block impact plus the arm-wide rescue surcharge, and the run/day recurrence."""

    def test_reference_midday_ranks_above_threshold_and_above_basal(self):
        # 5.4 -> recommended 5.6, band [5.52, 6.12] EXCLUDES programmed and the on-regime
        # evidence agrees, so the block asserts. Recurrence is the 12/90 meal-low Wilson
        # bound. Rescue load is the reference snapshot's: 67 g pre-empted (8 days) + 192 g
        # admitted printed-low = 259 g over the block's own 90 days. ADR 435: the base
        # term prices the recommended move (5.4 -> 5.6), not the measured 5.82.
        block = _ic_block(5.4, 5.8227, 5.52, 6.12, 5.6, n_runs=29,
                          low_days=12, rescue_days=8, rescue_grams=67.0,
                          admitted_rescue=192.0)
        cfg = ScenarioConfig()
        lever = ic_lever(price_ic_blocks([block], scenario_config=cfg),
                         scenario_config=cfg)
        basal = basal_lever([_slot(0, 0.6, 0.7, nights=20, on_side=15)], slot_minutes=30)
        expected = (174.4 * abs(1 / 5.4 - 1 / 5.6)
                    + (259.0 / BLOCK_WINDOW_DAYS) / 5.8227)
        self.assertAlmostEqual(lever.impact_u_day, expected, places=4)
        self.assertGreaterEqual(lever.priority, cfg.priority_active_threshold)
        self.assertGreater(lever.priority, basal.priority)
        self.assertLess(lever.impact, 1.0)

    def test_no_asserted_direction_reads_priority_zero(self):
        # Band [5.2, 5.8] covers programmed 5.4 -> gate 2 fails -> held at priority 0,
        # no false-alarm card for a well-tuned coin-flip user.
        lever = ic_lever(price_ic_blocks([_ic_block(5.4, 5.5, 5.2, 5.8, 5.4)]))
        self.assertEqual(lever.priority, 0)
        self.assertEqual(lever.recurrence, 0.0)

    def test_recurring_rescues_cannot_manufacture_a_direction(self):
        # The masked user: pre-emptive meal rescues recur on 6 days, but the measured
        # band still covers programmed. Post-#518 EVERY condition must hold, so the
        # rescues surface currency without inventing a dosing move — the surcharge is
        # visible, the priority stays 0.
        block = _ic_block(5.4, 5.42, 5.15, 5.7, 5.4, rescue_days=6, rescue_grams=180.0)
        self.assertFalse(block.asserts_move)
        lever = ic_lever(price_ic_blocks([block]))
        self.assertEqual(lever.priority, 0)
        self.assertGreater(lever.impact_u_day, 0.0)   # the rescue surcharge alone

    def test_band_excludes_uses_on_suggested_side_run_recurrence(self):
        # A clean divergent read: band [5.0, 5.25] excludes 5.4, and 24 of 30 RUNS land
        # on the suggested (tighter) side. Recurrence comes from that on-side Wilson
        # bound over runs, not meals — a mid-chain meal has no ratio of its own to vote.
        block = _ic_block(5.4, 5.11, 5.0, 5.25, 5.25, n_runs=30,
                          side_k=24, side_n=30)
        lever = ic_lever(price_ic_blocks([block]))
        from ciq_autotune.uncertainty import wilson
        self.assertAlmostEqual(lever.recurrence, wilson(24, 30)[1], places=6)
        self.assertEqual(lever.recurrence_channel["kind"], "ic_runs")
        self.assertGreater(lever.priority, 0)

    def test_thin_block_is_held_however_narrow_its_band(self):
        # #273's exact failure, at I:C block scope: a narrow band at n = 3-7 clears
        # `wide` and would stage. The 8-run floor is what stops it.
        thin = _ic_block(5.4, 5.11, 5.05, 5.18, 5.25, n_runs=5, state="below-floor")
        self.assertFalse(thin.estimate.wide)
        self.assertFalse(thin.asserts_move)
        self.assertEqual(ic_lever(price_ic_blocks([thin])).priority, 0)

    def test_regime_straddle_holds_a_block_that_otherwise_asserts(self):
        # Every other condition holds; only the compare-side regime bracket straddles.
        held = _ic_block(5.4, 5.11, 5.0, 5.25, 5.25, n_runs=30, on_regime=False)
        self.assertFalse(held.asserts_move)
        released = _ic_block(5.4, 5.11, 5.0, 5.25, 5.25, n_runs=30, on_regime=True)
        self.assertTrue(released.asserts_move)


class AnalyzerArchetypeCurrencyGridTest(unittest.TestCase):
    """ADR 435 acceptance grid: observations run through all three real analyzers."""

    WINDOW = 30
    BASE = datetime(2026, 5, 1)

    @classmethod
    def _basal_rows(cls, delivered, programmed=0.6, *, active_days=30,
                    duration_mins=360):
        basal, cgm = [], []
        for i in range(cls.WINDOW):
            t0 = cls.BASE + timedelta(days=i)
            observed = delivered if i < active_days else programmed
            basal.append(BasalEvent(t=t0, delivery_type="algorithmDelivery",
                                    duration_mins=duration_mins, basal_rate=observed,
                                    profile_basal_rate=programmed))
            cgm.extend(CgmReading(t=t0 + timedelta(minutes=5 * k), bg=120.0, type="EGV")
                       for k in range(duration_mins // 5 + 1))
        return analyze_basal(basal, cgm, [], [])

    @classmethod
    def _isf_rows(cls, true_isf, corrections_per_night, low_days, correction_bg=250.0):
        cfg = IsfConfig()
        bolus, basal, cgm, windows = [], [], [], []
        templates = [(0, 30, .2), (1, 15, .35), (2, 0, .5),
                     (3, 15, .65), (4, 0, .8)]
        rng = random.Random(435 + corrections_per_night)
        for i in range(cls.WINDOW):
            t0 = cls.BASE + timedelta(days=i)
            ba = [BasalEvent(t=t0 + timedelta(minutes=5 * k),
                             delivery_type="algorithmDelivery", duration_mins=5,
                             basal_rate=.6, profile_basal_rate=.6)
                  for k in range(72)]
            bs = [BolusEvent(t=t0 + timedelta(hours=h, minutes=m), insulin=u,
                             carbs=None, bg=correction_bg)
                  for h, m, u in templates[:corrections_per_night]]
            activity = InsulinActivity(
                [(b.t, b.insulin) for b in bs] + basal_microdoses(ba),
                cfg.peak_min, cfg.dia_min)
            times = [t0 + timedelta(minutes=5 * k) for k in range(72)]
            bg = 250.0
            readings = [CgmReading(t=times[0], bg=bg, type="EGV")]
            for left, right in zip(times, times[1:]):
                bg += -true_isf * activity.acted(left, right) + .4 + rng.gauss(0, .4)
                readings.append(CgmReading(t=right, bg=round(bg, 1), type="EGV"))
            bolus.extend(bs); basal.extend(ba); cgm.extend(readings)
            windows.append(RestWindow(date=t0.date(), start=t0,
                                      end=t0 + timedelta(hours=6)))
        lows = [PrintedLow(cls.BASE + timedelta(days=i, hours=3), 60.0, 1.2,
                           HarmArm.ISF) for i in range(low_days)]
        return analyze_isf(
            bolus, basal, cgm, [(0, 36.0)], rest_windows=windows,
            harm_config=HarmConfig(), harm_lows=lows, window_days=cls.WINDOW)

    @classmethod
    def _ic_blocks(cls, measured=6.0, rescue_days=0, meal_carbs=60.0):
        """I:C blocks through the REAL block analyzer over a full block window.

        One meal a day at 12:00 with a flat programmed schedule, so the profile
        degenerates to a single 24 h block and every meal is its own run. Each bolus
        carries the pump's stamped ratio (#159) at the programmed value, which is what
        the regime bracket reads — an unstamped fixture would be held by gate 3 and
        could never rank, hiding whatever the test meant to measure.
        """
        bolus, entries = [], []
        for i in range(BLOCK_WINDOW_DAYS):
            t = cls.BASE + timedelta(days=i, hours=12)
            bolus.append(BolusEvent(t=t, insulin=meal_carbs / measured,
                                    carbs=meal_carbs, carb_ratio=6.0))
            if i < rescue_days:
                entries.append(CarbEntry(t=t + timedelta(hours=1), grams=15.0,
                                         certainty="estimate", source="manual"))
        blocks, _runs = analyze_ic_blocks(
            bolus, [(0, 6.0)], carb_entries=entries,
            analysis_start=cls.BASE, observed_days=BLOCK_WINDOW_DAYS)
        return blocks

    @classmethod
    def _user(cls, *, basal=0.6, isf=36.0, isf_corrections=2,
              isf_low_days=0, ic=6.0, rescue_days=0):
        basal_rows = cls._basal_rows(basal)
        isf_rows = cls._isf_rows(isf, isf_corrections, isf_low_days)
        ic_blocks = price_ic_blocks(cls._ic_blocks(ic, rescue_days))
        return {lever.parameter: lever for lever in build_tuning_levers(
            basal_rows, isf_rows, ic_blocks, slot_minutes=30)}

    def test_well_tuned_user_surfaces_no_actionable_lever(self):
        levers = self._user()
        self.assertTrue(all(lever.priority < 30 for lever in levers.values()))

    def test_one_lever_off_isolates_plausible_basal_signal(self):
        levers = self._user(basal=.66)
        self.assertGreaterEqual(levers["basal_rate"].priority, 30)
        self.assertLess(levers["isf"].priority, 30)
        self.assertLess(levers["carb_ratio"].priority, 30)

    def test_two_levers_off_both_rank_without_hard_saturation(self):
        levers = self._user(isf=60.0, isf_corrections=5, isf_low_days=7, ic=5.0)
        for name in ("isf", "carb_ratio"):
            self.assertGreaterEqual(levers[name].priority, 30)
            self.assertLess(levers[name].impact, 1.0)

    def test_masker_rescue_currency_survives_without_inventing_direction(self):
        levers = self._user(rescue_days=12)
        ic = levers["carb_ratio"]
        self.assertEqual(ic.priority, 0)
        self.assertGreater(ic.impact_u_day, 0.0)

    def test_formerly_saturated_analyzer_outputs_remain_ordered(self):
        low = isf_lever(self._isf_rows(60.0, 2, 15))
        high = isf_lever(self._isf_rows(60.0, 5, 15))
        self.assertGreater(low.impact_u_day, 1.0)
        self.assertGreater(high.impact_u_day, low.impact_u_day)
        self.assertGreater(high.impact, low.impact)
        self.assertLess(high.impact, 1.0)

    def test_equal_analyzer_currencies_land_at_the_same_priority(self):
        basal = basal_lever(
            self._basal_rows(.65, active_days=29, duration_mins=120),
            slot_minutes=30)
        isf = isf_lever(self._isf_rows(60.0, 1, 30, correction_bg=130.0))
        ic = ic_lever(price_ic_blocks(self._ic_blocks(5.8, meal_carbs=33.0)))

        # Independent N-window observations are tuned to the action line. If all three
        # analyzers price the same currency honestly, Priority 30 requires approximately
        # the same actionable U/day despite their different native parameter units.
        currencies = [lever.impact_u_day for lever in (basal, isf, ic)]
        priorities = [lever.priority for lever in (basal, isf, ic)]
        self.assertLess(max(currencies) - min(currencies), 0.02)
        self.assertEqual(priorities, [30, 30, 30])


class RecurrenceChannelTest(unittest.TestCase):
    """#438: each lever carries its winning recurrence channel's kind + observed k/n, so
    Diagnose transcribes a plain-count line. Built from N-night/segment analyzer output,
    never a hand-set flag — the count must survive the observed-vs-padded distinction."""

    def test_basal_channel_shows_observed_count_not_padded_denominator(self):
        # 20 clean nights existed (< the 30-day window), 15 ran on the suggested side.
        # The bar's Wilson bound pads n to 30, but the sentence's channel must carry the
        # REAL observed n = 20 and k = 15 — never 15 of 30.
        slots = [_slot(0, 0.6, 0.9, nights=20, on_side=15)]
        lever = basal_lever(slots, slot_minutes=30)
        ch = lever.recurrence_channel
        self.assertEqual(ch["kind"], "basal_raise")
        self.assertEqual(ch["k"], 15)
        self.assertEqual(ch["n"], 20)   # observed nights, NOT the padded 30
        self.assertEqual(lever.to_dict()["recurrence_channel"], ch)

    def test_basal_lower_direction_channel(self):
        slots = [_slot(0, 1.0, 0.7, nights=20, on_side=15)]
        ch = basal_lever(slots, slot_minutes=30).recurrence_channel
        self.assertEqual(ch["kind"], "basal_lower")
        self.assertEqual((ch["k"], ch["n"]), (15, 20))

    def test_basal_no_headline_block_is_thin(self):
        # Nothing well-supported to change → no headline block → the thin marker.
        slots = [_slot(0, 0.6, 0.9, wide=True, nights=20)]
        lever = basal_lever(slots, slot_minutes=30)
        self.assertEqual(lever.recurrence_channel, {"kind": "basal_thin"})

    def test_isf_channel_is_correction_lows_over_the_window(self):
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=4)
        ch = isf_lever([row]).recurrence_channel
        self.assertEqual(ch, {"kind": "isf_corr_lows", "k": 4, "n": 30})

    def test_isf_tie_prefers_lows_over_rescues(self):
        # Equal k and equal Wilson bound → the tie rule orders lows before rescues.
        row = _isf_row(36.0, 43.2, corrections_per_day=4.2, median_mgdl=76.0,
                       corr_low_days=4, rescue_days=4)
        self.assertEqual(isf_lever([row]).recurrence_channel["kind"], "isf_corr_lows")

    def test_ic_channel_is_meal_lows_over_the_block_window(self):
        # Winning channel = meal-caused low days (11), displayed over the BLOCK's own
        # 90-day span. Reading 11 against a 30-day denominator would overstate the bound.
        block = _ic_block(5.4, 5.11, 5.02, 5.20, 5.1, n_runs=28, low_days=11)
        ch = ic_lever(price_ic_blocks([block])).recurrence_channel
        self.assertEqual(ch, {"kind": "ic_meal_lows", "k": 11, "n": BLOCK_WINDOW_DAYS})

    def test_ic_day_channels_use_ninety_days_and_clamp_their_count(self):
        from ciq_autotune.uncertainty import wilson

        for low_days, expected_k in ((11, 11), (31, 31), (120, BLOCK_WINDOW_DAYS)):
            block = _ic_block(5.4, 5.11, 5.02, 5.20, 5.1, n_runs=28, low_days=low_days)
            lever = ic_lever(price_ic_blocks([block]))
            self.assertEqual(lever.recurrence_channel,
                             {"kind": "ic_meal_lows", "k": expected_k,
                              "n": BLOCK_WINDOW_DAYS})
            self.assertAlmostEqual(lever.recurrence,
                                   wilson(expected_k, BLOCK_WINDOW_DAYS)[1])

    def test_ic_rescue_channel_uses_the_block_window(self):
        from ciq_autotune.uncertainty import wilson

        block = _ic_block(5.4, 5.11, 5.02, 5.20, 5.1, n_runs=28,
                          rescue_days=21, rescue_grams=315.0)
        lever = ic_lever(price_ic_blocks([block]))
        self.assertEqual(lever.recurrence_channel,
                         {"kind": "ic_rescues", "k": 21, "n": BLOCK_WINDOW_DAYS})
        self.assertAlmostEqual(lever.recurrence, wilson(21, BLOCK_WINDOW_DAYS)[1])

    def test_held_ic_channel_is_held_marker(self):
        lever = ic_lever(price_ic_blocks([_ic_block(10.0, 10.0, 9.9, 10.1, 10.0)]))
        self.assertEqual(lever.recurrence_channel, {"kind": "held"})

    def test_unstamped_ic_block_fails_closed_even_when_evidence_asserts(self):
        # A block with no eligibility evidence at all (a legacy/hand-built payload) must
        # read as held, never as asserting: insulin advice fails closed.
        bare = IcBlock(
            block_id=0, start_min=0, end_min=1440, label="block",
            member_start_mins=[0], current_values=[5.4],
            estimate=Estimate(5.11, 5.02, 5.20, 28, method="b"),
            recommended=5.1, n_runs=28, n_meals=60, state="numeric",
            asserts_move=ic_asserts_move(IcBlock(
                block_id=0, start_min=0, end_min=1440, label="block",
                member_start_mins=[0], current_values=[5.4],
                estimate=Estimate(5.11, 5.02, 5.20, 28, method="b"),
                recommended=5.1, n_runs=28, n_meals=60, state="numeric",
                asserts_move=False, annotation="")),
            annotation="")
        self.assertFalse(bare.asserts_move)
        lever = ic_lever(price_ic_blocks([bare]))
        self.assertEqual(lever.priority, 0)
        self.assertEqual(lever.recurrence_channel, {"kind": "held"})


class ScaleInvariantCurrencyTest(unittest.TestCase):
    """#446: one shared user-level insulin baseline makes the currency scale-invariant.

    A physiologically identical user whose *every* insulin quantity is scaled by ``k`` (k×
    the dose) must read the **same** Priority per lever — the knee is now a fraction of the
    user's own total dose, not an absolute 0.7 U/day. Exercised through the public lever
    builders with a low/high dose pair (~20 vs ~100 U/day baseline).
    """

    def _isf(self, current, recommended, base_u):
        # ISF is mg/dL per U, so scaling insulin ×k scales ISF ÷k. corrections/day and
        # mg/dL-over-target are physiology → unchanged, so the impact currency scales ×k.
        return _isf_row(current, recommended, corrections_per_day=4.2,
                        median_mgdl=76.0, corr_low_days=7)

    def _ic(self, current, recommended, value):
        # I:C is g per U, so scaling insulin ×k scales I:C ÷k. Same carbs/day (physiology).
        return _ic_block(current, value, value * 0.98, value * 1.02, recommended,
                         start_min=0, n_runs=29, low_days=12)

    def _levers(self, k, baseline):
        # Every insulin quantity scaled by k: basal rates ×k, ISF ÷k, I:C ÷k, baseline ×k.
        basal = basal_lever([_slot(0, 1.0 * k, 1.4 * k, nights=20, on_side=18)],
                            slot_minutes=60, robust_daily_insulin_u=baseline)
        isf = isf_lever([self._isf(36.0 / k, 43.2 / k, k)],
                        robust_daily_insulin_u=baseline)
        ic = ic_lever(
            price_ic_blocks([self._ic(5.4 / k, 5.1 / k, 5.11 / k)],
                            robust_daily_insulin_u=baseline),
            robust_daily_insulin_u=baseline)
        return {"basal_rate": basal, "isf": isf, "carb_ratio": ic}

    def test_priority_is_invariant_across_dose_scales(self):
        low = self._levers(1.0, baseline=20.0)     # ~20 U/day user
        high = self._levers(5.0, baseline=100.0)   # same physiology, 5× the dose
        for name in ("basal_rate", "isf", "carb_ratio"):
            # The raw U/day currency differs 5× between the two users …
            self.assertNotAlmostEqual(low[name].impact_u_day, high[name].impact_u_day, places=3)
            # … but the scale-invariant Priority is identical.
            self.assertEqual(low[name].priority, high[name].priority)
            self.assertGreater(low[name].priority, 0)

    def test_absolute_knee_would_have_diverged(self):
        # Guard the test's own premise: without a user-level denominator (the old absolute
        # knee — pass no baseline, so the reference stands in for both), the same relative
        # move reads *different* impact at the two dose scales.
        low = basal_lever([_slot(0, 1.0, 1.4, nights=20, on_side=18)], slot_minutes=60)
        high = basal_lever([_slot(0, 5.0, 7.0, nights=20, on_side=18)], slot_minutes=60)
        self.assertNotEqual(low.impact, high.impact)


class SelfDampeningGuardTest(unittest.TestCase):
    """#446: an already-excessive insulin setting must not suppress its own Priority.

    The shared denominator is *total* delivered insulin, so a single excessive lever inflates
    it only fractionally (bolus dominates the day) while the corrective move — the numerator —
    grows in full. The excessive setting still reads an actionable Priority.
    """

    WINDOW = 30
    BASE = datetime(2026, 5, 1)

    def _events(self, basal_rate):
        """A full window: basal at ``basal_rate`` all day + a steady ~35 U/day of bolus."""
        basal, bolus = [], []
        for i in range(self.WINDOW):
            t0 = self.BASE + timedelta(days=i)
            basal.extend(
                BasalEvent(t=t0 + timedelta(minutes=5 * k), delivery_type="algorithmDelivery",
                           duration_mins=5, basal_rate=basal_rate, profile_basal_rate=basal_rate)
                for k in range(288))
            bolus.extend(
                BolusEvent(t=t0 + timedelta(hours=h), insulin=7.0, carbs=60.0, bg=None)
                for h in (8, 12, 18, 21, 23))
        return basal, bolus

    def test_excessive_basal_still_ranks_actionable(self):
        # Basal runs 3.0 U/h (grossly excessive; should be ~1.0). The recommendation cuts it
        # hard. The excessive delivery inflates the shared TDD denominator, but the lever
        # still clears the actionable line — it is not silenced by its own excess.
        basal_events, bolus_events = self._events(basal_rate=3.0)
        baseline = robust_daily_insulin(basal_events, bolus_events)
        self.assertGreater(baseline, 100.0)  # excess + bolus inflate the denominator
        slots = [_slot(s, 3.0, 1.0, nights=20, on_side=18) for s in range(0, 48, 2)]
        lever = basal_lever(slots, slot_minutes=30, robust_daily_insulin_u=baseline)
        self.assertGreaterEqual(lever.priority, 30)

    def test_median_is_robust_to_a_suspended_day_and_a_mega_bolus(self):
        # A robust windowed statistic: one zero-delivery (suspended) day and one huge bolus
        # day do not move the median TDD off the steady daily total.
        _, bolus = self._events(basal_rate=0.0)  # bolus-only, 35 U/day
        bolus.append(BolusEvent(t=self.BASE + timedelta(days=40, hours=12),
                                insulin=400.0, carbs=None, bg=None))  # mega-bolus outlier
        self.assertAlmostEqual(robust_daily_insulin([], bolus), 35.0, places=6)

    def test_thin_data_falls_back_to_the_reference(self):
        # Below the min-days floor the noisy few-day estimate is not trusted.
        cfg = ScenarioConfig()
        bolus = [BolusEvent(t=self.BASE + timedelta(days=i, hours=12), insulin=9.0,
                            carbs=None, bg=None) for i in range(2)]
        self.assertEqual(robust_daily_insulin([], bolus, cfg),
                         cfg.priority_baseline_reference_u_day)


class BuildTuningLeversTest(unittest.TestCase):
    def test_collects_present_flavors(self):
        basal = [_slot(0, 0.6, 0.8, nights=20, on_side=18)]
        isf = [SegmentEstimate(start_min=0, label="Fasting", parameter="isf", current=40.0,
                               estimate=Estimate(40.0, 39.0, 41.0, 12, method="b"),
                               recommended=None, annotation="")]
        levers = build_tuning_levers(basal, isf, [], slot_minutes=30)
        params = [lv.parameter for lv in levers]
        self.assertEqual(params, ["basal_rate", "isf"])  # no I:C blocks → omitted


if __name__ == "__main__":
    unittest.main()
