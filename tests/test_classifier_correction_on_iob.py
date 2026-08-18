"""Lone-correction-on-IOB classifier tests (#150).

The over-bolus crash ``correction_stacking`` misses: a **single** user correction
dropped onto insulin still working that then drove a low. This is that classifier
with the pair requirement relaxed to one correction, back-scanned from a sub-70
nadir, with a STRICTER slope guard (any rising BG at the dose disqualifies — not
just a >=180 runaway).

Coverage mirrors the locked spec §8:

* **fires** — a lone correction >= 1 U on >= 0.5 U prior IOB, BG flat/falling, a
  sub-70 low follows (a constructed correction-on-IOB crash).
* **does not fire** — correction on rising BG (> +0.5, at *any* level); >= 2
  corrections in 60 min (defer to stacking); correction on < 0.5 U IOB;
  recovery/suspend context; a meal bolus (not a correction).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.correction_on_iob import (
    classify_correction_on_iob,
)
from ciq_autotune.analyzers.classifiers.evidence import EvidenceTier
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading

# An arbitrary anchor day (cosmetic — the classifier is pure, so only the
# offsets built off it via at() matter).
DAY = datetime(2026, 5, 7)


# --- builders (mirror tests/test_classifier_correction_stacking.py) ---------


def at(h, m=0):
    return DAY + timedelta(hours=h, minutes=m)


def cgm_seg(t0, start_bg, slope_per_min, minutes, step=5):
    """5-min CGM readings ramping at ``slope_per_min`` mg/dL/min from ``t0``."""
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k),
                   bg=start_bg + slope_per_min * step * k, type="EGV")
        for k in range(minutes // step + 1)
    ]


def meal(t, carbs=52.0, dose=7.4):
    return BolusEvent(t=t, insulin=dose, carbs=carbs)


def correction(t, dose=4.2):
    return BolusEvent(t=t, insulin=dose, carbs=None)


def suspend_run(t0, rows=6, cadence=5, profile=0.9):
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=profile)
        for k in range(rows)
    ]


class FiresTest(unittest.TestCase):
    """The constructed firing case: a lone correction onto live meal IOB, BG
    falling, that drives a sub-70 low."""

    def test_lone_correction_on_meal_iob_falling_then_low_fires(self):
        # A 7.4 U dinner at 19:00 leaves live IOB; the user drops a lone 4.2 U
        # correction at 20:00 onto a falling BG (-0.65 mg/dL/min); BG then
        # crashes to a sub-70 nadir at 22:00. A textbook over-bolus-on-IOB crash.
        cgm = cgm_seg(at(19, 40), 238, -0.65, 20)         # 19:40..20:00 falling
        cgm += cgm_seg(at(20, 5), 221, -1.45, 115)        # 20:05..22:00 down to sub-70
        boluses = [meal(at(19)), correction(at(20))]
        v = classify_correction_on_iob(at(22), 45.0, cgm, boluses)
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertGreaterEqual(v.iob_at_correction, 0.5)   # landed on live IOB
        self.assertLessEqual(v.pre_slope, 0.5)              # BG not rising
        self.assertEqual(v.correction_t, at(20))
        self.assertEqual(v.nadir_bg, 45.0)
        self.assertAlmostEqual(v.mins_to_low, 120.0, delta=0.1)
        self.assertIn("still on board", v.detail)


class DoesNotFireTest(unittest.TestCase):
    """Every §8 exclusion, one per guard."""

    def test_correction_on_rising_bg_at_any_level_is_excluded(self):
        # BG only ~150 (below the 180 runaway line) but RISING +1.1 mg/dL/min at the
        # correction — a spike-chase, not a stack onto settled insulin. The stricter
        # guard excludes it even though correction_stacking's >=180 rule would not.
        cgm = cgm_seg(at(19, 40), 128, 1.1, 25)           # 19:40..20:05 rising
        cgm += cgm_seg(at(20, 10), 156, -0.75, 110)       # then falls to sub-70
        boluses = [meal(at(19)), correction(at(20))]
        v = classify_correction_on_iob(at(22), 52.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertLess(v.bg_at_correction, 180.0)         # not a runaway high ...
        self.assertGreater(v.pre_slope, 0.5)               # ... but rising -> excluded
        self.assertIn("rising", v.detail)

    def test_two_corrections_in_window_defer_to_stacking(self):
        # Two user corrections 30 min apart is a >= 2 stack — correction_stacking's
        # territory. #150 defers entirely (the hard count partition).
        cgm = cgm_seg(at(19, 40), 238, -0.65, 140)         # falling through the evening
        boluses = [meal(at(19)), correction(at(20)), correction(at(20, 30), dose=2.6)]
        v = classify_correction_on_iob(at(22), 46.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("stack", v.detail)

    def test_correction_on_cleared_iob_is_excluded(self):
        # A lone correction with no prior bolus on board — it did not stack onto
        # anything. Not a #150 crash (prior IOB < 0.5 U).
        cgm = cgm_seg(at(19, 40), 238, -0.65, 140)
        boluses = [correction(at(20))]
        v = classify_correction_on_iob(at(22), 46.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertLess(v.iob_at_correction, 0.5)
        self.assertIn("board", v.detail)

    def test_recovery_from_suspend_is_excluded(self):
        # The correction landed while unwinding from a Control-IQ defensive suspend
        # (ended 19:40, inside the gate lookback) — a recovery, not a fresh over-bolus.
        cgm = cgm_seg(at(19, 40), 238, -0.65, 140)
        basal = suspend_run(at(19, 15))                    # 19:15..19:40 suspended
        boluses = [meal(at(19)), correction(at(20))]
        v = classify_correction_on_iob(at(22), 46.0, cgm, boluses, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("recovery", v.detail)

    def test_meal_bolus_is_not_a_correction(self):
        # The only dose before the low is a *meal* (carbs) — not a user correction —
        # so there is no lone correction to attribute the crash to.
        cgm = cgm_seg(at(19, 40), 238, -0.65, 140)
        boluses = [meal(at(20), carbs=55.0, dose=11.0)]
        v = classify_correction_on_iob(at(22), 46.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("no user correction", v.detail)

    def test_near_low_nadir_is_not_a_real_low(self):
        # A dip to only 73 (a near-low, 71-75) is not "a low you had" — the outcome
        # gate rejects it before any correction is judged.
        cgm = cgm_seg(at(19, 40), 238, -0.65, 140)
        boluses = [meal(at(19)), correction(at(20))]
        v = classify_correction_on_iob(at(22), 73.0, cgm, boluses)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)


if __name__ == "__main__":
    unittest.main()
