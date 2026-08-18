"""ADR 681 Meal-owned suspend selection contract."""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.scenario.meal_suspend import classify_meal_owned_suspend
from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier, SilenceReason
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.events import BasalEvent, BolusEvent

from tests.test_scenario_engine import cgm_flat, cgm_ramp, suspend_run


class ExactTimestampMealOwnershipTest(unittest.TestCase):
    def test_suspend_at_meal_time_is_owned(self):
        meal = BolusEvent(
            t=datetime(2026, 6, 15, 12, 0), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = cgm_ramp(15, 12, 55, 110.0, -1.4, 30)

        verdict = classify_meal_owned_suspend(meal, [meal], cgm, basal)

        self.assertTrue(verdict.matched)
        self.assertEqual(verdict.suspend_start, meal.t)

    def test_higher_seq_num_owns_even_when_input_order_is_reversed(self):
        at = datetime(2026, 6, 15, 11, 30)
        earlier = BolusEvent(
            t=at, insulin=4.0, carbs=40.0, completion="Completed", seq_num=5
        )
        later = BolusEvent(
            t=at, insulin=5.0, carbs=50.0, completion="Completed", seq_num=9
        )
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = (
            cgm_flat(15, 11, 30, 110.0, 85)
            + cgm_ramp(15, 12, 55, 110.0, -1.4, 30)
        )
        reversed_rows = [later, earlier]

        earlier_verdict = classify_meal_owned_suspend(
            earlier, reversed_rows, cgm, basal
        )
        later_verdict = classify_meal_owned_suspend(
            later, reversed_rows, cgm, basal
        )

        self.assertFalse(earlier_verdict.matched)
        self.assertTrue(later_verdict.matched)

    def test_latest_eligible_atomic_meal_owns_shared_suspend(self):
        earlier = BolusEvent(
            t=datetime(2026, 6, 15, 10, 30), insulin=4.0, carbs=40.0,
            completion="Completed", seq_num=5,
        )
        later = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=9,
        )
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = (
            cgm_flat(15, 10, 30, 110.0, 145)
            + cgm_ramp(15, 12, 55, 110.0, -1.4, 30)
        )

        earlier_verdict = classify_meal_owned_suspend(
            earlier, [earlier, later], cgm, basal
        )
        later_verdict = classify_meal_owned_suspend(
            later, [earlier, later], cgm, basal
        )

        self.assertFalse(earlier_verdict.matched)
        self.assertTrue(later_verdict.matched)

    def test_independent_reads_choose_same_exact_timestamp_owner(self):
        at = datetime(2026, 6, 15, 11, 30)
        first_read = [
            BolusEvent(t=at, insulin=4.0, carbs=40.0, completion="Completed", seq_num=5),
            BolusEvent(t=at, insulin=5.0, carbs=50.0, completion="Completed", seq_num=9),
        ]
        second_read = [
            BolusEvent(t=at, insulin=5.0, carbs=50.0, completion="Completed", seq_num=9),
            BolusEvent(t=at, insulin=4.0, carbs=40.0, completion="Completed", seq_num=5),
        ]
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = cgm_ramp(15, 12, 55, 110.0, -1.4, 30)

        first = classify_meal_owned_suspend(first_read[1], first_read, cgm, basal)
        second = classify_meal_owned_suspend(second_read[0], second_read, cgm, basal)

        self.assertTrue(first.matched)
        self.assertTrue(second.matched)
        self.assertEqual(first.suspend_start, second.suspend_start)


class OwnershipBoundaryTest(unittest.TestCase):
    def setUp(self):
        self.meal = BolusEvent(
            t=datetime(2026, 6, 15, 10, 0), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )

    def test_suspend_one_second_before_meal_is_not_owned(self):
        basal = suspend_run(15, 9, 59, rows=4)
        basal[0] = BasalEvent(
            t=self.meal.t - timedelta(seconds=1),
            delivery_type=basal[0].delivery_type,
            basal_rate=basal[0].basal_rate,
            profile_basal_rate=basal[0].profile_basal_rate,
        )

        verdict = classify_meal_owned_suspend(self.meal, [self.meal], [], basal)

        self.assertFalse(verdict.matched)
        self.assertIsNone(verdict.suspend_start)

    def test_suspend_one_second_after_horizon_is_not_owned(self):
        start = self.meal.t + timedelta(minutes=120, seconds=1)
        basal = [
            BasalEvent(
                t=start + timedelta(minutes=5 * index),
                delivery_type=CIQ_SUSPEND_TYPE,
                basal_rate=0.0,
                profile_basal_rate=0.9,
            )
            for index in range(4)
        ]

        verdict = classify_meal_owned_suspend(self.meal, [self.meal], [], basal)

        self.assertFalse(verdict.matched)
        self.assertIsNone(verdict.suspend_start)

    def test_unknown_completion_cannot_steal_ownership(self):
        confirmed = self.meal
        unknown = BolusEvent(
            t=datetime(2026, 6, 15, 11, 0), insulin=3.0, carbs=30.0,
            completion=None, seq_num=9,
        )
        basal = suspend_run(15, 11, 30, rows=12)
        cgm = cgm_ramp(15, 12, 25, 110.0, -1.4, 30)

        verdict = classify_meal_owned_suspend(
            confirmed, [confirmed, unknown], cgm, basal
        )

        self.assertTrue(verdict.matched)
        self.assertEqual(verdict.suspend_start, datetime(2026, 6, 15, 11, 30))


class MultipleSuspendSelectionTest(unittest.TestCase):
    def test_routine_trim_does_not_hide_later_qualifying_suspend(self):
        meal = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )
        basal = (
            suspend_run(15, 12, 0, rows=4)
            + suspend_run(15, 12, 45, rows=12)
        )
        cgm = (
            cgm_flat(15, 11, 30, 110.0, 130)
            + cgm_ramp(15, 13, 40, 110.0, -1.4, 30)
        )

        verdict = classify_meal_owned_suspend(meal, [meal], cgm, basal)

        self.assertTrue(verdict.matched)
        self.assertEqual(verdict.suspend_start, datetime(2026, 6, 15, 12, 45))

    def test_earliest_owned_routine_suspend_supplies_nonmatch(self):
        meal = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )
        basal = (
            suspend_run(15, 12, 0, rows=4)
            + suspend_run(15, 12, 45, rows=4)
        )
        cgm = cgm_flat(15, 11, 30, 110.0, 180)

        verdict = classify_meal_owned_suspend(meal, [meal], cgm, basal)

        self.assertFalse(verdict.matched)
        self.assertEqual(verdict.suspend_start, datetime(2026, 6, 15, 12, 0))


class NoOwnedSuspendTest(unittest.TestCase):
    def test_absent_suspend_preserves_not_in_data_tier(self):
        meal = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )

        verdict = classify_meal_owned_suspend(meal, [meal], [], [])

        self.assertFalse(verdict.matched)
        self.assertEqual(verdict.evidence_tier, EvidenceTier.NOT_IN_DATA)
        self.assertEqual(verdict.silence_reason, SilenceReason.INSUFFICIENT_DATA)

    def test_pre_meal_suspend_is_not_substituted(self):
        meal = BolusEvent(
            t=datetime(2026, 6, 15, 11, 30), insulin=5.0, carbs=50.0,
            completion="Completed", seq_num=5,
        )
        basal = suspend_run(15, 11, 0, rows=4)
        cgm = cgm_flat(15, 11, 0, 68.0, 90)

        verdict = classify_meal_owned_suspend(meal, [meal], cgm, basal)

        self.assertFalse(verdict.matched)
        self.assertIsNone(verdict.suspend_start)
        self.assertEqual(verdict.evidence_tier, EvidenceTier.NOT_IN_DATA)
        self.assertEqual(verdict.silence_reason, SilenceReason.INSUFFICIENT_DATA)


if __name__ == "__main__":
    unittest.main()
