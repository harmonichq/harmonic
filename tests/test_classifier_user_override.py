"""User-override provenance tests (#161) — enrichment + rate signal, ADR 0014/0015.

Covers the four things the brief calls out: the gap-derived direction, the enrichment
message, the behavior/harm counting behind the tile, and that ``declined_correction``
is persisted but wired to nothing. All pure — no store, no I/O.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.correction_on_iob import (
    classify_correction_on_iob,
)
from ciq_autotune.analyzers.classifiers.user_override import (
    count_overrides,
    is_override_up,
    override_enrichment,
)
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading

DAY = datetime(2026, 5, 7)


def at(h, m=0):
    return DAY + timedelta(hours=h, minutes=m)


def cgm_seg(t0, start_bg, slope_per_min, minutes, step=5):
    return [
        CgmReading(t=t0 + timedelta(minutes=step * k),
                   bg=start_bg + slope_per_min * step * k, type="EGV")
        for k in range(minutes // step + 1)
    ]


def override_correction(t, *, requested, food=0.0, correction=0.0,
                        user_override=1, bolus_options=0, carbs=None,
                        declined_correction=0):
    """A user calculator correction whose gap = requested − (food + correction)."""
    return BolusEvent(
        t=t, insulin=requested, requested_insulin=requested, carbs=carbs,
        bolus_options=bolus_options, correction_insulin=correction,
        food_insulin=food, user_override=user_override,
        declined_correction=declined_correction,
    )


class OverrideGapDirectionTest(unittest.TestCase):
    def test_gap_is_positive_when_dosed_above_pump(self):
        b = override_correction(at(12), requested=5.0, food=0.0, correction=0.0)
        self.assertAlmostEqual(b.override_gap, 5.0)

    def test_gap_is_negative_when_dosed_below_pump(self):
        b = override_correction(at(12), requested=3.0, food=5.0, correction=0.0, carbs=45)
        self.assertAlmostEqual(b.override_gap, -2.0)

    def test_gap_is_none_on_extended_bolus(self):
        # Extended-split accounting can manufacture a spurious gap — excluded (ADR 0014).
        b = override_correction(at(12), requested=5.0, bolus_options=1)
        self.assertIsNone(b.override_gap)

    def test_gap_is_none_without_msg3_split(self):
        b = BolusEvent(t=at(12), insulin=5.0, requested_insulin=5.0, bolus_options=0)
        self.assertIsNone(b.override_gap)


class IsOverrideUpTest(unittest.TestCase):
    def test_flagged_override_up_is_up(self):
        self.assertTrue(is_override_up(
            override_correction(at(12), requested=5.0, user_override=1)))

    def test_flag_zero_is_never_up_even_with_a_gap(self):
        # The pump says the user did NOT override — trust the flag on *whether* (ADR 0014).
        self.assertFalse(is_override_up(
            override_correction(at(12), requested=5.0, user_override=0)))

    def test_absent_flag_falls_back_to_gap(self):
        # Every real row today has a NULL flag (written by nothing before #161); the
        # gap alone must still recover the override-up, mirroring is_automatic_bolus.
        self.assertTrue(is_override_up(
            override_correction(at(12), requested=5.0, user_override=None)))

    def test_down_override_is_not_up(self):
        self.assertFalse(is_override_up(
            override_correction(at(12), requested=3.0, food=5.0, carbs=45,
                                user_override=1)))

    def test_meal_up_override_is_excluded(self):
        # A carb bolus with no meaningful correction component is not a user
        # correction, so it never enters the directional signal (guardrail 3).
        meal = override_correction(at(12), requested=6.5, food=6.0, correction=0.0,
                                   carbs=45, user_override=1)
        self.assertFalse(is_override_up(meal))


class EnrichmentMessageTest(unittest.TestCase):
    def test_no_correction_needed_phrasing(self):
        msg = override_enrichment(
            override_correction(at(12), requested=3.0, correction=0.0))
        self.assertIn("no correction needed", msg)
        self.assertIn("+3.0 U", msg)

    def test_partial_override_phrasing(self):
        msg = override_enrichment(
            override_correction(at(12), requested=3.0, correction=0.4))
        self.assertIn("calculated 0.4 U", msg)
        self.assertIn("+2.6 U", msg)

    def test_none_when_not_override_up(self):
        self.assertIsNone(override_enrichment(
            override_correction(at(12), requested=5.0, user_override=0)))

    def test_never_advises_correcting_harder(self):
        # Guardrail 1: override-up is a low risk, never ISF-too-weak evidence.
        msg = override_enrichment(override_correction(at(12), requested=3.0)).lower()
        for banned in ("isf", "correct harder", "correct more", "too weak", "increase"):
            self.assertNotIn(banned, msg)

    def test_enrichment_appends_to_correction_on_iob_detail(self):
        # A lone override-up correction on live IOB that drives a sub-70 low: the
        # matched detail must carry the override clause (the headline of #161).
        meal = BolusEvent(t=at(10), insulin=8.0, carbs=60)  # prior IOB to stack onto
        driver = override_correction(at(11), requested=5.0, correction=0.0)
        cgm = (cgm_seg(at(9), 180, 0.0, 120)
               + cgm_seg(at(11), 180, -1.4, 180))  # falls to a low after the dose
        v = classify_correction_on_iob(at(13, 30), 58.0, cgm, [meal, driver])
        self.assertTrue(v.matched)
        self.assertIn("overrode the pump", v.detail)


class CountOverridesTest(unittest.TestCase):
    def test_behavior_counts_every_override_up(self):
        boluses = [
            override_correction(at(8), requested=3.0),
            override_correction(at(12), requested=4.0),
            override_correction(at(16), requested=2.0, user_override=0),  # not an override
        ]
        behavior, harm = count_overrides(boluses, [], [])
        self.assertEqual(behavior, 2)
        self.assertEqual(harm, 0)  # no CGM -> no low observed

    def test_harm_counts_override_up_followed_by_a_low(self):
        b = override_correction(at(10), requested=5.0)
        cgm = cgm_seg(at(10), 150, -0.6, 300)  # ramps down through 80 within the tail
        behavior, harm = count_overrides([b], cgm, [])
        self.assertEqual(behavior, 1)
        self.assertEqual(harm, 1)

    def test_harm_excludes_recovery_from_upstream_suspend(self):
        # An override landing while recovering from a CIQ suspend is not fresh harm
        # (mirrors the stacking harm gate).
        b = override_correction(at(10), requested=5.0)
        cgm = cgm_seg(at(9), 65, 0.0, 30) + cgm_seg(at(9, 30), 65, -0.2, 300)
        basal = [BasalEvent(t=at(9) + timedelta(minutes=5 * k),
                            delivery_type=CIQ_SUSPEND_TYPE, basal_rate=0.0,
                            profile_basal_rate=0.9) for k in range(6)]
        _, harm = count_overrides([b], cgm, basal)
        self.assertEqual(harm, 0)

    def test_declined_correction_drives_nothing(self):
        # A bolus flagged declined_correction but not an override-up must not be
        # counted anywhere — the raw flag is persisted, wired to nothing (ADR 0015 §4).
        b = override_correction(at(10), requested=2.0, user_override=0,
                                declined_correction=1)
        behavior, harm = count_overrides([b], cgm_seg(at(10), 150, -0.6, 300), [])
        self.assertEqual((behavior, harm), (0, 0))
        self.assertIsNone(override_enrichment(b))


if __name__ == "__main__":
    unittest.main()
