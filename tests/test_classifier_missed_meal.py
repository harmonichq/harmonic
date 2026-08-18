"""Missed-meal instance classifier tests (#72, epic #70).

Two false-positive axes the old ``missed_meal`` detector conflated:

* ``rise after low/suspend`` — rebound recovery, must NOT flag (shared context gate).
* ``rise within digestion window of a prior bolused meal`` — meal tail, must NOT
  flag (new digestion-tail gate).
* ``rise with no bolus and no rebound`` — genuine unannounced meal, MUST flag.

The headline acceptance case: a 35 g dinner bolus produces a rise that is still
climbing 44 min later; must not be called an unannounced meal.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.missed_meal import (
    DIGESTION_LOOKBACK_MIN,
    classify_missed_meal,
)
from ciq_autotune.analyzers.classifiers import EvidenceTier, UpstreamCause
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders -----------------------------------------------------------------


def cgm_ramp(day, start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=5 * k),
                   bg=start_bg + slope_per_min * 5 * k, type="EGV")
        for k in range(minutes // 5 + 1)
    ]


def meal_bolus(day, hh, mm, carbs=35.0, dose=6.0):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=carbs)


def suspend_run(day, hh, mm, rows=6, cadence=5):
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k),
                   delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


# --- core positive / negative contrast ----------------------------------------

class MissedMealCoreTest(unittest.TestCase):
    """True unannounced meal vs. rise-with-bolus-nearby contrast."""

    def test_rise_with_no_bolus_flags_as_missed_meal(self):
        # BG rises steadily from a flat baseline; no bolus anywhere in the window.
        cgm = cgm_ramp(14, 10, 0, 110, 2.0, 60)
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        v = classify_missed_meal(anchor, cgm)
        self.assertTrue(v.matched)
        self.assertGreater(v.rise_slope, 1.0)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("unannounced", v.detail)
        self.assertIsNone(v.prior_meal_t)

    def test_flat_cgm_does_not_flag(self):
        # BG is flat — no rise to blame on a missed meal.
        cgm = cgm_ramp(14, 10, 0, 120, 0.0, 60)
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        v = classify_missed_meal(anchor, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertLessEqual(v.rise_slope, 1.0)

    def test_sparse_cgm_cannot_be_judged(self):
        # Too few CGM readings near the anchor to fit a slope.
        cgm = [CgmReading(t=datetime(2026, 6, 14, 10, 35, 0), bg=140.0, type="EGV")]
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        v = classify_missed_meal(anchor, cgm)
        self.assertFalse(v.matched)
        self.assertIsNone(v.rise_slope)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)


# --- rebound exclusion (shared gate) ------------------------------------------

class ReboundExclusionTest(unittest.TestCase):
    """Post-low and post-suspend rebounds must not flag as missed meals."""

    def test_post_low_rebound_not_flagged(self):
        # BG bottoms at 64, then rebounds steeply — looks like a rise but is a
        # recovery from a low, not an unannounced meal.
        cgm = cgm_ramp(14, 10, 0, 64, 4.0, 50)  # 64 -> 264 over 50 min
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        v = classify_missed_meal(anchor, cgm)
        self.assertFalse(v.matched)
        self.assertGreater(v.rise_slope, 1.0)           # it WAS rising …
        self.assertTrue(v.gate.explained)
        self.assertEqual(v.gate.cause, UpstreamCause.RECENT_LOW)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("recovery", v.detail)

    def test_post_suspend_rebound_not_flagged(self):
        # A CIQ defensive suspend ends; BG rises without any low, no bolus.
        cgm = cgm_ramp(14, 10, 0, 110, 2.5, 50)
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        basal = suspend_run(14, 10, 0, rows=6)          # suspend 10:00–10:25
        v = classify_missed_meal(anchor, cgm, basal_events=basal)
        self.assertFalse(v.matched)
        self.assertTrue(v.gate.explained)
        self.assertEqual(v.gate.cause, UpstreamCause.DEFENSIVE_SUSPEND)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)

    def test_post_low_and_suspend_not_flagged(self):
        # Both a low and a suspend in the window — BOTH cause, still suppressed.
        cgm = cgm_ramp(14, 10, 0, 64, 3.0, 50)
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        basal = suspend_run(14, 10, 0, rows=6)
        v = classify_missed_meal(anchor, cgm, basal_events=basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.gate.cause, UpstreamCause.BOTH)


# --- digestion-tail exclusion -------------------------------------------------

class DigestionTailExclusionTest(unittest.TestCase):
    """Rise within the digestion window of a prior bolused meal must not flag."""

    def test_rise_within_digestion_window_not_flagged(self):
        # Prior meal bolus 44 min ago; BG is still climbing from that meal.
        cgm = cgm_ramp(28, 20, 0, 110, 2.0, 60)
        anchor = datetime(2026, 6, 28, 20, 40, 0)
        prior = meal_bolus(28, 19, 56)                  # 44 min before anchor
        v = classify_missed_meal(anchor, cgm, bolus_events=[prior])
        self.assertFalse(v.matched)
        self.assertIsNotNone(v.prior_meal_t)
        self.assertEqual(v.prior_meal_t, prior.t)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("digestion tail", v.detail)

    def test_bolus_beyond_digestion_window_still_flags(self):
        # Same CGM rise, but the prior meal bolus was more than digestion_lookback_min
        # ago — outside the window — so this IS a missed meal.
        cgm = cgm_ramp(28, 20, 0, 110, 2.0, 60)
        anchor = datetime(2026, 6, 28, 20, 40, 0)
        # Place the prior bolus just outside the 150-min digestion window.
        old_bolus_t = anchor - timedelta(minutes=DIGESTION_LOOKBACK_MIN + 5)
        old_bolus = BolusEvent(t=old_bolus_t, insulin=6.0, carbs=35.0)
        v = classify_missed_meal(anchor, cgm, bolus_events=[old_bolus])
        self.assertTrue(v.matched)
        self.assertIsNone(v.prior_meal_t)

    def test_correction_bolus_without_carbs_does_not_suppress(self):
        # A correction bolus (no carbs) in the digestion window is NOT a meal.
        # The rise must still flag as a missed meal.
        cgm = cgm_ramp(28, 20, 0, 110, 2.0, 60)
        anchor = datetime(2026, 6, 28, 20, 40, 0)
        corr = BolusEvent(t=datetime(2026, 6, 28, 20, 10, 0), insulin=2.0, carbs=None)
        v = classify_missed_meal(anchor, cgm, bolus_events=[corr])
        self.assertTrue(v.matched)
        self.assertIsNone(v.prior_meal_t)


# --- digestion-tail acceptance case -------------------------------------------

class DigestionTailAcceptanceTest(unittest.TestCase):
    """The headline acceptance case: an ~8:40p rise is the tail of a 7:56p dinner.

    Per issue #72: the old detector flagged "+66 mg/dL rise with no insulin near
    it." The rise is actually the digestion tail of the dinner bolus 44 min prior.
    This classifier must not flag it.
    """

    def _episode_cgm(self):
        # Dinner eaten ~7:56p; BG climbs through 8:40p as meal absorbs.
        return cgm_ramp(28, 19, 50, 100, 1.5, 70)   # rising through ~9:00p

    def test_dinner_tail_not_flagged(self):
        cgm = self._episode_cgm()
        dinner_bolus = meal_bolus(28, 19, 56, carbs=35.0, dose=6.0)
        anchor = datetime(2026, 6, 28, 20, 40, 0)   # the ~8:40p rise
        v = classify_missed_meal(anchor, cgm, bolus_events=[dinner_bolus])
        self.assertFalse(v.matched)                   # NOT a missed meal
        self.assertIsNotNone(v.prior_meal_t)
        self.assertEqual(v.prior_meal_t, dinner_bolus.t)
        self.assertIn("digestion tail", v.detail)

    def test_same_rise_with_no_prior_bolus_would_flag(self):
        # Control: identical CGM rise, but no dinner bolus at all. True miss.
        cgm = self._episode_cgm()
        anchor = datetime(2026, 6, 28, 20, 40, 0)
        v = classify_missed_meal(anchor, cgm)
        self.assertTrue(v.matched)                    # WOULD be a missed meal


# --- gate interaction precedence ----------------------------------------------

class GatePrecedenceTest(unittest.TestCase):
    """Gate (rebound) takes precedence over digestion-tail check."""

    def test_rebound_gates_before_digestion_tail_check(self):
        # A low AND a prior meal bolus in the window — the rebound gate fires
        # first (step 3) so the detail comes from the gate, not the bolus.
        cgm = cgm_ramp(14, 10, 0, 64, 4.0, 50)
        anchor = datetime(2026, 6, 14, 10, 40, 0)
        prior = meal_bolus(14, 10, 10)               # 30 min ago
        v = classify_missed_meal(anchor, cgm, bolus_events=[prior])
        self.assertFalse(v.matched)
        self.assertTrue(v.gate.explained)
        # The prior_meal_t should be None because the gate fired first.
        self.assertIsNone(v.prior_meal_t)
        self.assertIn("recovery", v.detail)


if __name__ == "__main__":
    unittest.main()
