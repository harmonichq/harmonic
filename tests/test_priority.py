"""Unit tests for the unified Lever Priority core (ADR 0032)."""

import math
import unittest

from ciq_autotune.analyzers.scenario.priority import (
    Priority,
    behavioral_priority,
    priority_score,
)
from ciq_autotune.uncertainty import Confidence


class PriorityScoreTest(unittest.TestCase):
    def test_is_geometric_mean_times_100(self):
        # 100·√(0.5·0.5) = 100·0.5 = 50
        self.assertEqual(priority_score(0.5, 0.5), 50)
        # 100·√(0.36·0.64) = 100·0.48 = 48
        self.assertEqual(priority_score(0.36, 0.64), 48)

    def test_either_factor_zero_zeroes_the_score(self):
        self.assertEqual(priority_score(0.0, 0.9), 0)
        self.assertEqual(priority_score(0.9, 0.0), 0)

    def test_factors_clamped_to_unit_interval(self):
        # impact 5.0 clamps to 1.0; recurrence 1.0 → 100·√1 = 100
        self.assertEqual(priority_score(5.0, 1.0), 100)
        # negative clamps to 0
        self.assertEqual(priority_score(-3.0, 0.8), 0)

    def test_perfect_lever_is_100(self):
        self.assertEqual(priority_score(1.0, 1.0), 100)


class PriorityDataclassTest(unittest.TestCase):
    def test_to_dict_carries_both_factors_and_score(self):
        p = Priority(impact=0.36, recurrence=0.64)
        self.assertEqual(
            p.to_dict(), {"priority": 48, "impact": 0.36, "recurrence": 0.64}
        )

    def test_to_dict_clamps_displayed_factors(self):
        p = Priority(impact=2.0, recurrence=0.5)
        d = p.to_dict()
        self.assertEqual(d["impact"], 1.0)
        self.assertEqual(d["priority"], round(100 * math.sqrt(0.5)))


class BehavioralPriorityTest(unittest.TestCase):
    def test_maps_effect_and_wilson_lower_bound(self):
        c = Confidence(n=12, k=5, effect=0.6)
        p = behavioral_priority(c)
        self.assertEqual(p.impact, c.effect)
        self.assertEqual(p.recurrence, c.lo)
        self.assertEqual(p.value, priority_score(c.effect, c.lo))

    def test_priority_is_monotonic_in_score(self):
        # √(effect·lo) is monotonic in score = lo·effect, so ranking by priority
        # reproduces ranking by score — the ADR 0032 rank-preservation guarantee.
        confs = [
            Confidence(n=20, k=12, effect=0.7),
            Confidence(n=20, k=3, effect=0.9),
            Confidence(n=8, k=6, effect=0.4),
            Confidence(n=40, k=30, effect=0.5),
        ]
        by_score = sorted(confs, key=lambda c: c.score)
        by_priority = sorted(confs, key=lambda c: behavioral_priority(c).value)
        self.assertEqual(
            [id(c) for c in by_score], [id(c) for c in by_priority]
        )


if __name__ == "__main__":
    unittest.main()
