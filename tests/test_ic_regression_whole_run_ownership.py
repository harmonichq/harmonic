"""Public regression for discrete whole-run ownership in the fuzzy estimator."""

from datetime import datetime, timedelta
import unittest

from ciq_autotune.analyzers.ic import BLOCK_WINDOW_DAYS, IcConfig
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy
from ciq_autotune.events import BolusEvent


class FuzzyWholeRunOwnershipTest(unittest.TestCase):
    def test_float_hostile_same_block_meals_count_as_whole_runs(self):
        start = datetime(2026, 1, 1, 8)
        programmed_ratio = 5.6
        events = []
        for run_index in range(8):
            run_start = start + timedelta(days=run_index * 2)
            for offset_hours, carbs in enumerate((6.0, 23.0, 1.0)):
                events.append(BolusEvent(
                    t=run_start + timedelta(hours=offset_hours * 2),
                    insulin=carbs / programmed_ratio,
                    carbs=carbs,
                    carb_ratio=programmed_ratio,
                    completion="Completed",
                ))

        blocks, whole_day_run_count = analyze_ic_blocks_fuzzy(
            events,
            [(0, programmed_ratio)],
            config=IcConfig(min_carbs=1.0, min_meal_dose_u=0.1),
            observed_days=BLOCK_WINDOW_DAYS,
            analysis_start=start,
            analysis_end=start + timedelta(days=BLOCK_WINDOW_DAYS),
            prior_action_observed_from=start - timedelta(days=1),
            history_catalog=[],
        )

        self.assertEqual(8, whole_day_run_count)
        self.assertEqual(1, len(blocks))
        block = blocks[0]
        eligibility = block.evidence["eligibility"]
        self.assertEqual(8, eligibility["whole_runs"])
        self.assertEqual(0.0, eligibility["fractional_run_ownership"])
        self.assertEqual(8.0, eligibility["effective_run_count"])
        self.assertEqual(8, block.n_runs)
        self.assertTrue(eligibility["runs_floor_met"])


if __name__ == "__main__":
    unittest.main()
