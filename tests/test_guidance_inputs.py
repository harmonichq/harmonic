"""Public source inputs consumed by the future guidance projection."""

import unittest

from ciq_autotune.analyzers.scenario.levers import Lever, action_id
from ciq_autotune.analyzers.scenario.payload import Pattern
from ciq_autotune.uncertainty import Confidence


class GuidanceInputsTest(unittest.TestCase):
    def test_pattern_keeps_action_seriousness_and_evidence_separate_from_advice(self):
        pattern = Pattern(
            lever=Lever.LATE_BOLUS,
            confidence=Confidence(n=20, k=12, effect=0.8),
            rank=1,
            recommendation="Rendered advice may change without changing the action.",
            hero_episode="episode-1",
            occurrences=["episode-1", "episode-2"],
        )

        payload = pattern.to_dict()

        self.assertEqual(payload["guidance"], {
            "action_id": action_id(Lever.LATE_BOLUS),
            "seriousness": pattern.confidence.severity,
            "citation_episode_ids": ["episode-1", "episode-2"],
        })
        self.assertNotEqual(payload["guidance"]["action_id"], payload["recommendation"])
