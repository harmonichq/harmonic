"""Suspend instance classifier tests (#75, epic #70).

The core acceptance contract:

* A suspend that preceded a real/near low (BG nadir < 75 mg/dL within the
  suspend window + 45 min) **must** count as an over-delivery signal.
* A routine precautionary suspend where BG stayed ≥90 **must not** count.
* A trivial ≤10-min cut **must not** count regardless of what BG does.
* A suspend with no CGM evidence at all (no readings) reports NOT_IN_DATA if
  there are no basal events, or OBSERVED non-match if BG stayed high.

Mirrored after tests/test_classifier_late_bolus.py conventions.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.suspend import (
    NEAR_LOW_MGDL,
    MIN_SUSPEND_DURATION_MIN,
    classify_suspend,
)
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier
from ciq_autotune.events import BasalEvent, CgmReading


# --- builders ---------------------------------------------------------------


def cgm_ramp(day, start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(
            t=t0 + timedelta(minutes=5 * k),
            bg=start_bg + slope_per_min * 5 * k,
            type="EGV",
        )
        for k in range(minutes // 5 + 1)
    ]


def flat_cgm(day, start_h, start_min, bg, minutes):
    """Flat CGM series at a constant BG level."""
    return cgm_ramp(day, start_h, start_min, bg, 0.0, minutes)


def suspend_run(day, hh, mm, rows=6, cadence=5):
    """A run of ``rows`` consecutive CIQ-suspended basal rows, ``cadence`` min apart."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(
            t=t0 + timedelta(minutes=cadence * k),
            delivery_type=CIQ_SUSPEND_TYPE,
            basal_rate=0.0,
            profile_basal_rate=0.9,
        )
        for k in range(rows)
    ]


def normal_run(day, hh, mm, rows=6, cadence=5):
    """A run of non-suspend basal rows (normal algorithm delivery)."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(
            t=t0 + timedelta(minutes=cadence * k),
            delivery_type="algorithmDelivery",
            basal_rate=0.9,
            profile_basal_rate=0.9,
        )
        for k in range(rows)
    ]


# --- tests ------------------------------------------------------------------


class SuspendPrecedesRealLowTest(unittest.TestCase):
    """Core acceptance: suspend → near-low must match; suspend → stayed-high must not."""

    def test_suspend_followed_by_near_low_matches(self):
        # Suspend 12:00–13:00 (12 rows × 5 min = 60 min), BG falls to 68 by 13:30.
        # Gate window: [12:00, 13:00 + 45 min] = [12:00, 13:45]. Nadir at 13:30 ✓.
        basal = suspend_run(15, 12, 0, rows=12)  # 12:00–13:00
        cgm = (
            flat_cgm(15, 12, 0, 110, 60)         # flat during suspend
            + cgm_ramp(15, 13, 0, 110, -1.4, 30) # drops to ~68 by 13:30
        )
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertTrue(v.matched)
        self.assertIsNotNone(v.nadir_bg)
        self.assertLess(v.nadir_bg, NEAR_LOW_MGDL)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("preceded a real/near low", v.detail)

    def test_routine_suspend_bg_stays_high_does_not_match(self):
        # Suspend 12:00–13:00. BG stays at 110 throughout and after (stays ≥90).
        # This is routine predictive trimming — must NOT count.
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = flat_cgm(15, 11, 30, 110, 120)   # flat 110 the whole window
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)
        self.assertIsNone(v.nadir_bg)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("routine predictive trimming", v.detail)

    def test_bg_at_exactly_threshold_matches(self):
        # Nadir exactly at NEAR_LOW_MGDL (75) — boundary must match.
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = flat_cgm(15, 12, 0, 75, 90)  # stays at 75 the whole time
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertTrue(v.matched)
        self.assertEqual(v.nadir_bg, 75.0)

    def test_bg_one_above_threshold_does_not_match(self):
        # Nadir just above NEAR_LOW_MGDL (76) — must not count.
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = flat_cgm(15, 12, 0, 76, 90)
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)


class TrivialSuspendTest(unittest.TestCase):
    """Trivial ≤10-min cuts must be excluded."""

    def test_short_suspend_does_not_match_even_with_low_bg(self):
        # Only 2 rows = 5 min episode — trivial cut.
        basal = suspend_run(15, 12, 0, rows=2)  # 12:00–12:05 (5 min)
        cgm = (
            flat_cgm(15, 12, 0, 110, 30)
            + cgm_ramp(15, 12, 30, 110, -2.0, 30)  # drops well below 75 later
        )
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("trivial cut", v.detail)

    def test_exactly_threshold_duration_does_not_match(self):
        # Exactly MIN_SUSPEND_DURATION_MIN (10 min) = 2 rows cadence 5 → end - start = 5
        # 3 rows → 10 min. The threshold is "≤ 10 min", so 10 min → excluded.
        basal = suspend_run(15, 12, 0, rows=3)  # 12:00, 12:05, 12:10 → 10 min episode
        cgm = cgm_ramp(15, 12, 0, 110, -2.0, 60)
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)
        self.assertIsNotNone(v.suspend_duration_min)
        self.assertLessEqual(v.suspend_duration_min, MIN_SUSPEND_DURATION_MIN)

    def test_one_row_over_threshold_duration_is_eligible(self):
        # 4 rows cadence 5 → 15-min episode. Eligible for the BG gate.
        # With a low nadir following, it should match.
        basal = suspend_run(15, 12, 0, rows=4)  # 12:00–12:15 (15 min)
        cgm = (
            flat_cgm(15, 12, 0, 110, 30)
            + cgm_ramp(15, 12, 30, 110, -1.4, 30)   # drops to ~68 by 13:00
        )
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertTrue(v.matched)


class PostSuspendWindowTest(unittest.TestCase):
    """Low must be within the post-suspend window (suspend_end + 45 min)."""

    def test_low_within_post_suspend_window_matches(self):
        # Suspend 12:00–12:30, nadir at 12:50 (20 min after end — within 45 min).
        basal = suspend_run(15, 12, 0, rows=7)  # 12:00–12:30 (30 min)
        t0 = datetime(2026, 6, 15, 12, 30, 0)
        cgm = flat_cgm(15, 12, 0, 110, 30) + [
            CgmReading(t=t0 + timedelta(minutes=m), bg=68.0, type="EGV")
            for m in [5, 10, 15, 20]
        ]
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertTrue(v.matched)
        self.assertEqual(v.nadir_bg, 68.0)

    def test_low_outside_post_suspend_window_does_not_match(self):
        # Suspend 12:00–12:30, nadir at 14:00 (90 min after end — outside 45 min).
        basal = suspend_run(15, 12, 0, rows=7)  # 12:00–12:30 (30 min)
        cgm = flat_cgm(15, 12, 0, 110, 50) + [
            CgmReading(t=datetime(2026, 6, 15, 14, 0, 0), bg=65.0, type="EGV")
        ]
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)


class NoSuspendTest(unittest.TestCase):
    """When there are no basal events, the classifier reports NOT_IN_DATA."""

    def test_no_basal_events_not_in_data(self):
        cgm = flat_cgm(15, 12, 0, 100, 60)
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, [])
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)

    def test_only_normal_delivery_rows_not_in_data(self):
        basal = normal_run(15, 12, 0, rows=12)
        cgm = flat_cgm(15, 12, 0, 100, 60)
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)


class PostMealSuspendAcceptanceTest(unittest.TestCase):
    """Acceptance cases from issue #75."""

    def test_post_meal_suspend_without_low_is_routine(self):
        # Issue #75: 50% of suspend episodes never dropped below 90 mg/dL.
        # Simulate: post-meal suspend, BG comes down from 200 but stays at ~95.
        basal = suspend_run(15, 12, 0, rows=12)   # 60-min suspend
        cgm = (
            flat_cgm(15, 11, 45, 200, 15)           # pre-suspend high
            + cgm_ramp(15, 12, 0, 200, -0.9, 60)    # drops slowly to ~146
            + flat_cgm(15, 13, 0, 146, 60)           # stays well above 90
        )
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertFalse(v.matched)  # routine — must NOT count toward over-delivery
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)

    def test_post_meal_suspend_with_real_low_counts(self):
        # Issue #75: the 17% that actually reached BG <75 must count.
        # Simulate: post-meal suspend, BG crashes to 64 within the gate window.
        basal = suspend_run(15, 12, 0, rows=12)   # 60-min suspend
        cgm = (
            flat_cgm(15, 11, 45, 180, 15)           # high before suspend
            + cgm_ramp(15, 12, 0, 180, -1.9, 60)    # drops to ~66 during suspend
            + flat_cgm(15, 13, 0, 66, 30)            # low sustained into post window
        )
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertTrue(v.matched)
        self.assertLess(v.nadir_bg, NEAR_LOW_MGDL)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)

    def test_suspend_metadata_fields_populated(self):
        # Verify that suspend_start, suspend_end, suspend_duration_min are set.
        basal = suspend_run(15, 12, 0, rows=12)
        cgm = cgm_ramp(15, 12, 0, 110, -0.6, 90)
        anchor = datetime(2026, 6, 15, 12, 0, 0)
        v = classify_suspend(anchor, cgm, basal)
        self.assertIsNotNone(v.suspend_start)
        self.assertIsNotNone(v.suspend_end)
        self.assertIsNotNone(v.suspend_duration_min)
        self.assertEqual(v.suspend_start, datetime(2026, 6, 15, 12, 0, 0))
        # 12 rows × 5 min cadence → last row at 12:55, duration = 55 min
        self.assertAlmostEqual(v.suspend_duration_min, 55.0, places=1)


if __name__ == "__main__":
    unittest.main()
