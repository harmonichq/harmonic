"""Evidence-population policy contract for the behavioral lever set (#202)."""

import unittest

from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.levers import Exposure
from ciq_autotune.analyzers.scenario.evidence_population import policy_for


class EvidencePopulationPolicyContractTest(unittest.TestCase):
    def test_every_lever_declares_its_complete_evidence_population_contract(self):
        expected = {
            Lever.CARB_UNDERCOUNT: (Exposure.MEALS, "meals", "Other completed carb-bolus meals", "completed_carb_bolus", False),
            Lever.LATE_BOLUS: (Exposure.MEALS, "meals", "Other completed carb-bolus meals", "completed_carb_bolus", False),
            Lever.MEAL_OVER_DELIVERY: (Exposure.MEALS, "meals", "Other completed carb-bolus meals", "completed_carb_bolus", False),
            Lever.OVER_TREATED_LOW: (Exposure.LOWS, "lows", "Other low excursions", "excursion_nadir", False),
            Lever.CORRECTION_ON_IOB: (Exposure.LOWS, "lows", "Other low excursions", "excursion_nadir", False),
            Lever.CORRECTION_STACKING: (Exposure.CORRECTION_CLUSTERS, "correction_clusters", "Other back-to-back correction pairs", "correction_pair", False),
            Lever.MISSED_MEAL: (Exposure.HIGHS, "highs", "Completed carb-bolus meals", "completed_carb_bolus", True),
            Lever.MEAL_BOLUS_SHORT: (None, "meals", "Other completed carb-bolus meals", "completed_carb_bolus", False),
        }
        self.assertEqual(set(expected), set(Lever))
        for lever, values in expected.items():
            row = policy_for(lever)
            self.assertEqual((row.recurrence_family, row.recurrence_noun,
                              row.comparison_name, row.comparison_anchor_kind,
                              row.cross_population), values)


if __name__ == "__main__":
    unittest.main()
