"""Uncertainty quantification tests (F4).

Every estimate ships as a point value with a confidence interval and the sample
size behind it. The whole gating philosophy (ROADMAP §8) rests on this: thin data
is shown with a wide CI, never blanked. Bootstrap is seeded so the CIs are
deterministic and testable.
"""

import unittest

from ciq_autotune.uncertainty import (
    Confidence,
    Estimate,
    estimate_mean,
    estimate_median,
    finding_severity,
    wilson,
)


class EstimateMedianTest(unittest.TestCase):
    def test_empty_samples_give_no_estimate(self):
        e = estimate_median([])
        self.assertIsNone(e.value)
        self.assertEqual(e.n, 0)
        self.assertEqual(e.method, "none")

    def test_point_estimate_is_the_median(self):
        e = estimate_median([0.6, 0.6, 0.7, 0.6, 0.6])
        self.assertAlmostEqual(e.value, 0.6)
        self.assertEqual(e.n, 5)

    def test_ci_brackets_the_point_estimate(self):
        e = estimate_median([0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.72])
        self.assertLessEqual(e.lo, e.value)
        self.assertLessEqual(e.value, e.hi)

    def test_more_spread_widens_the_interval(self):
        tight = estimate_median([0.60, 0.60, 0.61, 0.59, 0.60, 0.60, 0.61, 0.59])
        wide = estimate_median([0.2, 0.9, 0.3, 0.8, 0.4, 1.0, 0.1, 0.7])
        self.assertGreater(wide.hi - wide.lo, tight.hi - tight.lo)

    def test_single_sample_is_flagged_wide(self):
        e = estimate_median([0.6])
        self.assertEqual(e.n, 1)
        self.assertAlmostEqual(e.value, 0.6)
        self.assertTrue(e.wide)

    def test_is_deterministic(self):
        xs = [0.5, 0.55, 0.6, 0.62, 0.65, 0.7, 0.72]
        self.assertEqual(estimate_median(xs).to_dict(), estimate_median(xs).to_dict())


class EstimateMeanTest(unittest.TestCase):
    def test_point_estimate_is_the_mean(self):
        e = estimate_mean([30.0, 32.0, 28.0, 30.0])
        self.assertAlmostEqual(e.value, 30.0)
        self.assertEqual(e.method, "bootstrap-mean")

    def test_ci_brackets_mean(self):
        e = estimate_mean([28, 30, 32, 31, 29, 33, 27])
        self.assertLessEqual(e.lo, e.value)
        self.assertLessEqual(e.value, e.hi)


class EstimateSerializationTest(unittest.TestCase):
    def test_to_dict_is_json_shaped(self):
        e = estimate_median([0.5, 0.6, 0.7])
        d = e.to_dict()
        self.assertEqual(set(d), {"value", "lo", "hi", "n", "confidence", "method", "wide"})
        self.assertIsInstance(d["value"], float)
        self.assertIsInstance(d["wide"], bool)

    def test_estimate_is_a_frozen_dataclass(self):
        e = Estimate(value=1.0, lo=0.9, hi=1.1, n=5, confidence=0.8, method="bootstrap-mean")
        with self.assertRaises(Exception):
            e.value = 2.0  # type: ignore[misc]


class WilsonTest(unittest.TestCase):
    """The Finding-side analog of the bootstrap CI: an n-aware Bernoulli interval
    at DEFAULT_CONFIDENCE (z=1.2816). Same 80% mass as an Estimate's CI."""

    def test_empty_denominator_is_maximally_uncertain(self):
        self.assertEqual(wilson(0, 0), (0.0, 0.0, 1.0))

    def test_point_rate_is_k_over_n(self):
        p, _, _ = wilson(1, 4)
        self.assertAlmostEqual(p, 0.25)

    def test_thin_data_gives_a_wide_interval(self):
        p, lo, hi = wilson(2, 4)
        self.assertAlmostEqual(p, 0.5)
        self.assertAlmostEqual(lo, 0.23, places=2)
        self.assertAlmostEqual(hi, 0.77, places=2)

    def test_ample_data_gives_a_tight_interval(self):
        p, lo, hi = wilson(100, 200)
        self.assertAlmostEqual(p, 0.5)
        self.assertAlmostEqual(lo, 0.45, places=2)
        self.assertAlmostEqual(hi, 0.55, places=2)

    def test_interval_stays_inside_unit_range(self):
        _, lo, hi = wilson(4, 4)
        self.assertGreaterEqual(lo, 0.0)
        self.assertLessEqual(hi, 1.0)


class ConfidenceTest(unittest.TestCase):
    def test_severity_is_scored_on_the_lower_bound(self):
        # High point rate but effect small enough that lo*effect lands "low".
        c = Confidence(n=200, k=100, effect=0.1)  # lo≈0.45 → score≈0.045
        self.assertEqual(c.severity, "low")

    def test_thin_data_cannot_earn_high(self):
        # Same rate and effect but n=4: the lower bound drops the score.
        thin = Confidence(n=4, k=2, effect=1.0)     # lo≈0.23 → score≈0.23 → medium
        ample = Confidence(n=200, k=100, effect=1.0)  # lo≈0.45 → score≈0.45 → high
        self.assertEqual(ample.severity, "high")
        self.assertEqual(thin.severity, "medium")

    def test_score_is_lo_times_effect(self):
        c = Confidence(n=200, k=100, effect=0.5)
        self.assertAlmostEqual(c.score, c.lo * 0.5)

    def test_wide_matches_estimate_semantics(self):
        # n below _WIDE_MIN_N is wide, same as Estimate.
        self.assertTrue(Confidence(n=2, k=1, effect=1.0).wide)
        self.assertFalse(Confidence(n=200, k=100, effect=1.0).wide)

    def test_to_dict_shape(self):
        d = Confidence(n=200, k=100, effect=0.5).to_dict()
        self.assertEqual(
            set(d),
            {"rate", "lo", "hi", "n", "k", "effect", "score", "wide", "confidence"},
        )
        self.assertEqual(d["confidence"], 0.8)
        self.assertEqual(d["k"], 100)
        self.assertIsInstance(d["wide"], bool)

    def test_severity_thresholds(self):
        self.assertEqual(finding_severity(0.40), "high")
        self.assertEqual(finding_severity(0.20), "medium")
        self.assertEqual(finding_severity(0.05), "low")
        self.assertEqual(finding_severity(0.01), "info")


if __name__ == "__main__":
    unittest.main()
