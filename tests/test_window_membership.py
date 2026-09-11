"""One source-owned consequence timestamp serves every clock consumer."""

import unittest

from ciq_autotune.window_membership import outcome_minute, outcome_timestamp


class OutcomeTimestampTest(unittest.TestCase):
    def test_attributed_target_resolves_its_real_episode_landing(self):
        exposures = {"exposures": {
            "meals": {"occurrences": [{
                "ep_id": "episode-1", "t": "2024-04-30 23:00:00", "kind": "meal",
                "attributed_levers": ["late_bolus"],
            }]},
            "highs": {"occurrences": [{
                "ep_id": "episode-1", "t": "2024-05-01 18:00:00", "kind": "high",
            }]},
        }}
        occurrence = exposures["exposures"]["meals"]["occurrences"][0]
        self.assertEqual(outcome_timestamp(occurrence, exposures), "2024-05-01 18:00:00")
        self.assertEqual(outcome_minute(occurrence, exposures), 18 * 60)

    def test_sequence_keeps_its_existing_no_landing_semantics(self):
        occurrence = {"ep_id": "sequence-1", "t": "2024-05-01 06:00:00",
                      "cause_lever": "high_carb_sequence"}
        exposures = {"exposures": {"meals": {"occurrences": [occurrence]}}}
        self.assertIsNone(outcome_timestamp(occurrence, exposures))
        self.assertIsNone(outcome_minute(occurrence, exposures))
