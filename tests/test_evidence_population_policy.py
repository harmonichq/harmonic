"""Evidence-population policy contract for the behavioral lever set (#202)."""

import unittest

from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.levers import Exposure
from ciq_autotune.analyzers.scenario.evidence_population import policy_for


class EvidencePopulationPolicyContractTest(unittest.TestCase):
    def test_every_lever_declares_its_complete_evidence_population_contract(self):
        expected = {
            Lever.CARB_UNDERCOUNT: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", (-60, 300), False),
            Lever.LATE_BOLUS: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", (-60, 300), False),
            Lever.MEAL_OVER_DELIVERY: (Exposure.MEALS, "meals", Exposure.MEALS, "Other meal opportunities", (-60, 300), False),
            Lever.OVER_TREATED_LOW: (Exposure.LOWS, "lows", Exposure.LOWS, "Other low excursions", (-60, 120), False),
            Lever.CORRECTION_ON_IOB: (Exposure.LOWS, "lows", Exposure.LOWS, "Other low excursions", (-60, 120), False),
            Lever.CORRECTION_STACKING: (Exposure.CORRECTION_CLUSTERS, "correction_clusters", Exposure.CORRECTION_CLUSTERS, "Other back-to-back correction pairs", (-120, 180), False),
            Lever.MISSED_MEAL: (Exposure.HIGHS, "highs", None, "Completed carb-bolus meals", (-60, 300), True),
        }
        self.assertEqual(set(expected), set(Lever))
        for lever, values in expected.items():
            row = policy_for(lever)
            self.assertEqual((row.recurrence_family, row.recurrence_noun,
                              row.comparison_family,
                              row.comparison_name,
                              row.comparison_window,
                              row.cross_population), values)
            self.assertTrue(callable(row.recurrence_members))
            self.assertTrue(callable(row.comparison_members))


if __name__ == "__main__":
    unittest.main()
