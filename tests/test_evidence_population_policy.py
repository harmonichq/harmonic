"""Evidence-population policy contract for the behavioral lever set (#202)."""

import unittest
from datetime import datetime
from types import SimpleNamespace

from ciq_autotune.events import BolusEvent
from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.levers import Exposure
from ciq_autotune.analyzers.scenario.evidence_population import policy_for


class EvidencePopulationPolicyContractTest(unittest.TestCase):
    def test_every_lever_declares_its_complete_evidence_population_contract(self):
        expected = {
            Lever.CARB_UNDERCOUNT: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", "completed_carb_bolus", (-60, 300), False, "episode-1"),
            Lever.LATE_BOLUS: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", "completed_carb_bolus", (-60, 300), False, "episode-1"),
            Lever.MEAL_OVER_DELIVERY: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", "completed_carb_bolus", (-60, 300), False, "episode-1"),
            Lever.OVER_TREATED_LOW: (Exposure.LOWS, "lows", Exposure.LOWS, "Other low excursions", "excursion_nadir", (-60, 120), False, "episode-1"),
            Lever.CORRECTION_ON_IOB: (Exposure.LOWS, "lows", Exposure.LOWS, "Other low excursions", "excursion_nadir", (-60, 120), False, "episode-1"),
            Lever.CORRECTION_STACKING: (Exposure.CORRECTION_CLUSTERS, "correction_clusters", Exposure.CORRECTION_CLUSTERS, "Other back-to-back correction pairs", "correction_pair", (-120, 180), False, "episode-1"),
            Lever.MISSED_MEAL: (Exposure.HIGHS, "highs", None, "Completed carb-bolus meals", "completed_carb_bolus", (-60, 300), True, "episode-1"),
            Lever.MEAL_BOLUS_SHORT: (None, "meals", None, "Other completed carb-bolus meals", "completed_carb_bolus", (-60, 300), False, "meal-42"),
        }
        episode = SimpleNamespace(id="episode-1")
        meal = BolusEvent(
            t=datetime(2026, 6, 1, 12), insulin=5, carbs=50,
            completion="Completed", seq_num=42,
        )
        self.assertEqual(set(expected), set(Lever))
        for lever, values in expected.items():
            row = policy_for(lever)
            self.assertEqual((row.recurrence_family, row.recurrence_noun,
                              row.comparison_family,
                              row.comparison_name, row.comparison_anchor_kind,
                              row.comparison_window,
                              row.cross_population,
                              row.occurrence_id(
                                  meal if lever is Lever.MEAL_BOLUS_SHORT else episode
                              )), values)
            self.assertTrue(callable(row.recurrence_members))
            self.assertTrue(callable(row.comparison_members))


if __name__ == "__main__":
    unittest.main()
