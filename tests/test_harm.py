"""Unit tests for the harm layer primitive (ADR 0038): printed-low detection,
attribution, the basal-arm aggregate, and the gate + capped-nudge safety math.

All synthetic and deterministic — no store, no fetch.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.harm import (
    BasalHarm,
    HarmAction,
    HarmArm,
    HarmConfig,
    apply_harm_gate_nudge,
    basal_harm,
    find_printed_lows,
)
from ciq_autotune.safety import SafetyConfig, Status, apply_harm

SLOT_MIN = 30


def _cgm(day, hh, mm, bg, n=1):
    """``n`` consecutive 5-min CGM readings starting at ``day hh:mm``."""
    t0 = datetime(2022, 6, day, hh, mm, 0)
    return [CgmReading(t=t0 + timedelta(minutes=5 * k), bg=bg, type="EGV") for k in range(n)]


class FindPrintedLowsTest(unittest.TestCase):
    def test_fasting_low_attributes_to_basal(self):
        # A 03:00 nadir with no bolus anywhere → fasting → basal arm.
        cgm = _cgm(1, 3, 0, 52.0, n=3)
        lows = find_printed_lows(cgm, [])
        self.assertEqual(len(lows), 1)
        self.assertEqual(lows[0].arm, HarmArm.BASAL)
        self.assertEqual(lows[0].bg, 52.0)
        self.assertLessEqual(lows[0].iob_u, HarmConfig().fasting_iob_floor_u)

    def test_low_with_bolus_iob_is_not_basal(self):
        # A big bolus 30 min before the nadir leaves IOB on board → not the basal arm.
        bolus = [BolusEvent(t=datetime(2022, 6, 1, 2, 30, 0), insulin=6.0)]
        cgm = _cgm(1, 3, 0, 52.0, n=3)
        lows = find_printed_lows(cgm, bolus)
        self.assertEqual(len(lows), 1)
        self.assertNotEqual(lows[0].arm, HarmArm.BASAL)
        self.assertGreater(lows[0].iob_u, HarmConfig().fasting_iob_floor_u)

    def test_dominant_residual_bolus_beats_nearest_dose(self):
        # Large meal bolus at t-90 dominates residual IOB; a tiny correction at t-20
        # must not steal attribution just because it is nearer (issue #313).
        bolus = [
            BolusEvent(t=datetime(2022, 6, 1, 1, 30, 0), insulin=6.0, carbs=60.0),
            BolusEvent(t=datetime(2022, 6, 1, 2, 40, 0), insulin=0.4,
                       carbs=None, bg=220.0),
        ]
        lows = find_printed_lows(_cgm(1, 3, 0, 52.0, n=3), bolus)
        self.assertEqual(lows[0].arm, HarmArm.IC)
        self.assertEqual(lows[0].dominant_bolus_t, bolus[0].t)

    def test_splitless_no_carb_high_context_routes_to_isf(self):
        bolus = [BolusEvent(t=datetime(2022, 6, 1, 2, 30, 0), insulin=4.0,
                            carbs=None, bg=241.0)]
        lows = find_printed_lows(_cgm(1, 3, 0, 52.0, n=3), bolus)
        self.assertEqual(lows[0].arm, HarmArm.ISF)
        self.assertEqual(lows[0].attribution_reason, "correction-like-no-carb-bolus")

    def test_splitless_carb_bearing_high_context_routes_to_isf(self):
        # Historical pre-Msg3 boluses can carry carbs but no food/correction split.
        # If the shape ran high before the crash, ADR 0038 routes the low to ISF
        # rather than forcing every carb-bearing split-less low onto I:C.
        bolus = [BolusEvent(t=datetime(2022, 6, 1, 2, 0, 0), insulin=6.0,
                            carbs=45.0, correction_insulin=None)]
        cgm = (
            _cgm(1, 2, 5, 188.0)
            + _cgm(1, 2, 30, 171.0)
            + _cgm(1, 3, 0, 52.0, n=3)
        )
        lows = find_printed_lows(cgm, bolus)
        self.assertEqual(lows[0].arm, HarmArm.ISF)
        self.assertEqual(lows[0].attribution_reason, "mixed-bolus-ran-high")

    def test_splitless_no_carb_without_correction_context_is_unattributed(self):
        bolus = [BolusEvent(t=datetime(2022, 6, 1, 2, 30, 0), insulin=4.0,
                            carbs=None, bg=120.0)]
        lows = find_printed_lows(_cgm(1, 3, 0, 52.0, n=3), bolus)
        self.assertEqual(lows[0].arm, HarmArm.UNATTRIBUTED)

    def test_nadir_is_lowest_of_a_run(self):
        cgm = (_cgm(1, 3, 0, 65.0) + _cgm(1, 3, 5, 49.0) + _cgm(1, 3, 10, 58.0))
        lows = find_printed_lows(cgm, [])
        self.assertEqual(len(lows), 1)
        self.assertEqual(lows[0].bg, 49.0)
        self.assertEqual(lows[0].t, datetime(2022, 6, 1, 3, 5, 0))

    def test_gap_splits_runs(self):
        # Two dips two hours apart are two lows, not one.
        cgm = _cgm(1, 3, 0, 50.0, n=2) + _cgm(1, 5, 0, 55.0, n=2)
        lows = find_printed_lows(cgm, [])
        self.assertEqual(len(lows), 2)

    def test_in_range_readings_are_not_lows(self):
        self.assertEqual(find_printed_lows(_cgm(1, 3, 0, 120.0, n=6), []), [])


class BasalHarmTest(unittest.TestCase):
    def test_single_night_gates_but_does_not_nudge(self):
        # One printed fasting low → the slot is gated (no raise) but not yet nudged.
        cgm = _cgm(1, 3, 0, 50.0, n=3)
        h = basal_harm(cgm, [], SLOT_MIN)
        self.assertEqual(h.gated_slots, frozenset({6}))  # 03:00 = slot 6
        self.assertEqual(h.nudged_slots, frozenset())
        self.assertEqual(h.nights, 1)

    def test_recurrence_across_nights_nudges(self):
        cgm = _cgm(1, 3, 0, 50.0, n=3) + _cgm(2, 3, 0, 51.0, n=3)
        h = basal_harm(cgm, [], SLOT_MIN)
        self.assertIn(6, h.nudged_slots)
        self.assertEqual(h.nights, 2)

    def test_slot_epoch_resets_nudge_recurrence(self):
        # ADR 412: two lows both predate an edit to the 03:00 slot. After the edit
        # (epoch on day 3) neither counts toward that slot's *nudge* recurrence, so a
        # second cut can't fire off the same lows — but the slot is still gated.
        cgm = _cgm(1, 3, 0, 50.0, n=3) + _cgm(2, 3, 0, 51.0, n=3)
        epochs = {6: datetime(2022, 6, 3, 3, 0, 0)}  # 03:00 rate changed on day 3
        h = basal_harm(cgm, [], SLOT_MIN, slot_epochs=epochs)
        self.assertEqual(h.gated_slots, frozenset({6}))  # still gated (reads all lows)
        self.assertEqual(h.nudged_slots, frozenset())    # pre-epoch lows don't nudge
        self.assertEqual(h.nights, 2)

    def test_post_epoch_lows_still_nudge(self):
        # Lows on/after the slot's epoch date do count toward the nudge.
        cgm = _cgm(3, 3, 0, 50.0, n=3) + _cgm(4, 3, 0, 51.0, n=3)
        epochs = {6: datetime(2022, 6, 3, 0, 0, 0)}
        h = basal_harm(cgm, [], SLOT_MIN, slot_epochs=epochs)
        self.assertIn(6, h.nudged_slots)

    def test_band_aggregation_3_2_1_nudges_the_singleton_slot(self):
        # Lows spread 3 nights @ 03:00, 2 @ 03:30, 1 @ 04:00 (ADR 0038 criterion 5).
        # Per-slot, 04:00 recurs only once — but the *band* cleared 6 distinct nights,
        # so the slot that saw a low is nudged anyway (evidence pooled across the band).
        cgm = []
        for d in (1, 2, 3):
            cgm += _cgm(d, 3, 0, 50.0, n=2)
        for d in (4, 5):
            cgm += _cgm(d, 3, 30, 50.0, n=2)
        cgm += _cgm(6, 4, 0, 50.0, n=2)
        h = basal_harm(cgm, [], SLOT_MIN)
        self.assertEqual(h.nights, 6)
        # slots 6 (03:00), 7 (03:30), 8 (04:00) all nudged
        self.assertEqual(h.nudged_slots, frozenset({6, 7, 8}))
        self.assertEqual(h.slot_nights[8], 1)  # 04:00 saw only one night

    def test_daytime_low_is_outside_the_band(self):
        h = basal_harm(_cgm(1, 14, 0, 50.0, n=3), [], SLOT_MIN)
        self.assertEqual(h.gated_slots, frozenset())
        self.assertEqual(h.nights, 0)

    def test_non_basal_low_is_ignored(self):
        # A low with bolus IOB is attributed elsewhere; the basal arm sees nothing.
        bolus = [BolusEvent(t=datetime(2022, 6, 1, 2, 30, 0), insulin=6.0)]
        h = basal_harm(_cgm(1, 3, 0, 50.0, n=3), bolus, SLOT_MIN)
        self.assertEqual(h.gated_slots, frozenset())

    def test_below_recurrence_threshold_gates_only(self):
        cfg = HarmConfig(min_recurrence_nights=3)
        cgm = _cgm(1, 3, 0, 50.0, n=3) + _cgm(2, 3, 0, 50.0, n=3)
        h = basal_harm(cgm, [], SLOT_MIN, cfg)
        self.assertEqual(h.gated_slots, frozenset({6}))
        self.assertEqual(h.nudged_slots, frozenset())

    def test_band_crossing_midnight_is_rejected(self):
        with self.assertRaises(ValueError):
            basal_harm([], [], SLOT_MIN, HarmConfig(overnight_start_min=1200,
                                                    overnight_end_min=360))

    def test_empty_input_is_a_clean_verdict(self):
        h = basal_harm([], [], SLOT_MIN)
        self.assertEqual(h, BasalHarm())


class ApplyHarmTest(unittest.TestCase):
    cfg = SafetyConfig()

    def test_nudge_with_no_median_keeps_the_full_step(self):
        # ADR 412: with no clean median to defer to, the one full step stands.
        rec, status = apply_harm(0.72, None, Status.NO_DATA, self.cfg,
                                 nudge=True, median=None)
        self.assertEqual(status, Status.HARM_LOWER)
        self.assertAlmostEqual(rec, round(0.72 * 0.8, 3))  # 0.576
        self.assertTrue(status.actionable)

    def test_nudge_defers_to_a_median_below_current(self):
        # ADR 412: magnitude is the clean median, not the fabricated full step.
        rec, status = apply_harm(0.72, 0.66, Status.LOWER, self.cfg,
                                 nudge=True, median=0.66)
        self.assertEqual(status, Status.HARM_LOWER)
        self.assertAlmostEqual(rec, 0.66)   # the median, not 0.576

    def test_nudge_floors_a_low_median_at_one_step(self):
        # A median well below current is floored at one 20% step (never more).
        rec, status = apply_harm(0.72, 0.40, Status.CAPPED_LOWER, self.cfg,
                                 nudge=True, median=0.40)
        self.assertEqual(status, Status.HARM_LOWER)
        self.assertAlmostEqual(rec, round(0.72 * 0.8, 3))  # 0.576, the step floor

    def test_nudge_holds_when_median_is_at_or_above_current(self):
        # ADR 412: no invented cut against a median that reads == / > current; the
        # recurring-low gate holds at current instead (a raise stays blocked).
        rec, status = apply_harm(0.72, 0.72, Status.NO_CHANGE, self.cfg,
                                 nudge=True, median=0.72)
        self.assertEqual(status, Status.HARM_GATED)
        self.assertEqual(rec, 0.72)
        self.assertFalse(status.actionable)

    def test_nudge_never_raises_even_when_median_is_high(self):
        # Safety asymmetry: a median above current holds, never adds insulin.
        rec, status = apply_harm(0.72, 0.86, Status.CAPPED_RAISE, self.cfg,
                                 nudge=True, median=0.90)
        self.assertEqual(status, Status.HARM_GATED)
        self.assertEqual(rec, 0.72)

    def test_gate_withholds_a_raise(self):
        rec, status = apply_harm(0.72, 0.86, Status.CAPPED_RAISE, self.cfg, nudge=False)
        self.assertEqual(status, Status.HARM_GATED)
        self.assertEqual(rec, 0.72)  # held at current
        self.assertFalse(status.actionable)  # holds; carries current forward

    def test_gate_leaves_a_lower_untouched(self):
        rec, status = apply_harm(0.72, 0.60, Status.CAPPED_LOWER, self.cfg, nudge=False)
        self.assertEqual(status, Status.CAPPED_LOWER)  # the gate never blocks a cut
        self.assertEqual(rec, 0.60)

    def test_gate_leaves_no_change_untouched(self):
        rec, status = apply_harm(0.72, 0.72, Status.NO_CHANGE, self.cfg, nudge=False)
        self.assertEqual(status, Status.NO_CHANGE)

    def test_no_current_baseline_is_a_noop(self):
        rec, status = apply_harm(None, 1.2, Status.NO_BASELINE, self.cfg, nudge=True)
        self.assertEqual(status, Status.NO_BASELINE)
        self.assertEqual(rec, 1.2)

    def test_nudge_respects_absolute_min(self):
        rec, _ = apply_harm(0.11, 0.11, Status.NO_CHANGE, self.cfg, nudge=True)
        self.assertGreaterEqual(rec, self.cfg.abs_min)

    def test_scalar_gate_blocks_more_insulin_when_lower_value_is_stronger(self):
        # ISF/I:C polarity: lower scalar means more insulin. A drop from 40 → 32
        # is therefore gated back to current when a correction/meal low printed.
        adj = apply_harm_gate_nudge(40.0, 32.0, max_step_frac=0.2,
                                    less_insulin_sign=1, nudge=False, ndigits=1)
        self.assertEqual(adj.action, HarmAction.GATED)
        self.assertEqual(adj.recommended, 40.0)

    def test_scalar_nudge_weakens_when_lower_value_is_stronger(self):
        adj = apply_harm_gate_nudge(40.0, None, max_step_frac=0.2,
                                    less_insulin_sign=1, nudge=True, ndigits=1)
        self.assertEqual(adj.action, HarmAction.NUDGED)
        self.assertEqual(adj.recommended, 48.0)


if __name__ == "__main__":
    unittest.main()
