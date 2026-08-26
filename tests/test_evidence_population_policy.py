"""Evidence-population policy contract for the behavioral lever set (#202)."""

import unittest

from ciq_autotune.analyzers.scenario.levers import Lever
from ciq_autotune.analyzers.scenario.evidence_population import policy_for


class EvidencePopulationPolicyContractTest(unittest.TestCase):
    def test_every_lever_declares_its_complete_evidence_population_contract(self):
        rows = {lever: policy_for(lever) for lever in Lever}
        self.assertEqual(set(rows), set(Lever))
        for row in rows.values():
            self.assertTrue(row.recurrence_noun)
            self.assertTrue(row.comparison_name)
            self.assertTrue(row.comparison_anchor_kind)
            self.assertIsNotNone(row.comparison_window)
            self.assertTrue(callable(row.recurrence_members))
            self.assertTrue(callable(row.occurrence_id))
        meal_short = rows[Lever.MEAL_BOLUS_SHORT]
        self.assertEqual(meal_short.recurrence_noun, "meals")
        self.assertEqual(meal_short.comparison_anchor_kind, "completed_carb_bolus")
        self.assertFalse(meal_short.cross_population)
        self.assertTrue(rows[Lever.MISSED_MEAL].cross_population)


if __name__ == "__main__":
    unittest.main()
