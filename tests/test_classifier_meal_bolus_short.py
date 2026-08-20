"""Meal-bolus-fell-short instance classifier tests (#63, epic #70).

The classifier picks up exactly the rises ``missed_meal`` declines as digestion
tails, and asks whether the dose that announced them was enough. Three things have
to hold, and each has its own axis here:

* **The split with missed-meal is exact.** A rise with a counted meal bolus in its
  digestion window is missed-meal's silence and this one's trigger, and a rise
  without one is the reverse. Never both, never neither.
* **The claim is not carb undercount.** No grams, no ratio, no counting language
  anywhere in the copy — only a dose that fell short and the correction that
  evidences it.
* **The silences are conservative.** Flat glucose, a defensive suspend, and a rise
  nobody corrected all stay silent, because each would be a cause invented rather
  than observed.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers import EvidenceTier, SilenceReason
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.classifiers.meal_bolus_short import classify_meal_bolus_short
from ciq_autotune.analyzers.classifiers.missed_meal import classify_missed_meal
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders -----------------------------------------------------------------

DAY = 14


def cgm_ramp(start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, DAY, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=5 * k),
                   bg=start_bg + slope_per_min * 5 * k, type="EGV")
        for k in range(minutes // 5 + 1)
    ]


def meal_bolus(hh, mm, carbs=45.0, dose=4.0):
    return BolusEvent(t=datetime(2026, 6, DAY, hh, mm, 0), insulin=dose, carbs=carbs)


def correction(hh, mm, dose=2.0):
    return BolusEvent(t=datetime(2026, 6, DAY, hh, mm, 0), insulin=dose, carbs=None)


def suspend_run(hh, mm, rows=6):
    t0 = datetime(2026, 6, DAY, hh, mm, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=5 * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


ANCHOR = datetime(2026, 6, DAY, 13, 40, 0)
# A steady climb through the anchor, from a flat-ish start well before it.
RISING = cgm_ramp(12, 0, 130, 1.6, 180)


class MealBolusShortCoreTest(unittest.TestCase):
    def test_announced_rise_that_needed_a_correction_matches(self):
        v = classify_meal_bolus_short(
            ANCHOR, RISING, [meal_bolus(12, 0), correction(13, 10)])
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIsNone(v.silence_reason)
        self.assertEqual(v.meal_t, datetime(2026, 6, DAY, 12, 0, 0))
        self.assertEqual(v.correction_t, datetime(2026, 6, DAY, 13, 10, 0))
        self.assertIn("did not cover what followed", v.detail)

    def test_flat_glucose_is_never_a_dose_that_fell_short(self):
        flat = cgm_ramp(12, 0, 190, 0.0, 180)
        v = classify_meal_bolus_short(
            ANCHOR, flat, [meal_bolus(12, 0), correction(13, 10)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.NO_TRIGGER)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)

    def test_defensive_suspend_rebound_is_never_attributed(self):
        # D1: a rebound off a Control-IQ defensive suspend is the algorithm working,
        # not a meal dose falling short. The shared context gate owns this.
        v = classify_meal_bolus_short(
            ANCHOR, RISING, [meal_bolus(12, 0), correction(13, 10)],
            suspend_run(12, 55))
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_rise_nobody_corrected_stays_silent(self):
        # The correction IS the evidence. Without one there is a rise and a dose and
        # no observation tying them together, so no claim is made.
        v = classify_meal_bolus_short(ANCHOR, RISING, [meal_bolus(12, 0)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)

    def test_sparse_cgm_cannot_be_judged(self):
        sparse = [CgmReading(t=ANCHOR - timedelta(minutes=5), bg=240.0, type="EGV")]
        v = classify_meal_bolus_short(
            ANCHOR, sparse, [meal_bolus(12, 0), correction(13, 10)])
        self.assertFalse(v.matched)
        self.assertIsNone(v.rise_slope)
        self.assertEqual(v.silence_reason, SilenceReason.INSUFFICIENT_DATA)


class CorrectionEvidenceTest(unittest.TestCase):
    def test_a_later_carb_bolus_is_a_new_meal_not_a_correction(self):
        # A dose carrying counted carbs says nothing about the previous dose.
        v = classify_meal_bolus_short(
            ANCHOR, RISING, [meal_bolus(12, 0), meal_bolus(13, 10, carbs=30.0)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)

    def test_a_dose_split_top_up_is_not_the_correction_the_meal_earned(self):
        # Inside the same-meal grace a carb-free top-up is part of the meal dose.
        v = classify_meal_bolus_short(
            ANCHOR, RISING, [meal_bolus(12, 0), correction(12, 20)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)

    def test_a_rounding_scale_dose_is_not_evidence(self):
        v = classify_meal_bolus_short(
            ANCHOR, RISING, [meal_bolus(12, 0), correction(13, 10, dose=0.4)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)

    def test_a_correction_beyond_the_horizon_is_a_separate_story(self):
        far = ANCHOR + timedelta(
            minutes=ScenarioConfig().meal_bolus_short_correction_horizon_min + 30)
        v = classify_meal_bolus_short(
            ANCHOR, RISING,
            [meal_bolus(12, 0),
             BolusEvent(t=far, insulin=2.0, carbs=None)])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.HORIZON_EXPIRED)


class TaxonomySeparationTest(unittest.TestCase):
    """The two high-anchor judgments partition one population; neither doubles up."""

    def test_an_announced_rise_is_this_classifiers_and_not_missed_meals(self):
        bolus = [meal_bolus(12, 0), correction(13, 10)]
        mine = classify_meal_bolus_short(ANCHOR, RISING, bolus)
        theirs = classify_missed_meal(ANCHOR, RISING, bolus)
        self.assertTrue(mine.matched)
        self.assertFalse(theirs.matched)

    def test_an_unannounced_rise_is_missed_meals_and_not_this_classifiers(self):
        bolus = [correction(13, 10)]
        mine = classify_meal_bolus_short(ANCHOR, RISING, bolus)
        theirs = classify_missed_meal(ANCHOR, RISING, bolus)
        self.assertFalse(mine.matched)
        # No meal dose exists to have fallen short — that is the whole silence.
        self.assertEqual(mine.silence_reason, SilenceReason.NO_TRIGGER)
        self.assertIn("no meal dose", mine.detail)
        self.assertTrue(theirs.matched)

    def test_the_two_digestion_windows_are_pinned_to_each_other(self):
        # The split is exact only while both classifiers scan the same span for the
        # same boluses. A divergence here opens a rise neither judges, or one both do.
        cfg = ScenarioConfig()
        self.assertEqual(cfg.meal_bolus_short_digestion_lookback_min,
                         cfg.missed_meal_digestion_lookback_min)
        self.assertEqual(cfg.meal_bolus_short_min_carbs, cfg.missed_meal_min_carbs)
        self.assertEqual(cfg.meal_bolus_short_rise_slope_mgdl_min,
                         cfg.missed_meal_rise_slope_mgdl_min)
        self.assertEqual(cfg.meal_bolus_short_slope_lookback_min,
                         cfg.missed_meal_slope_lookback_min)

    def test_no_verdict_copy_implies_a_carb_count(self):
        # Carb undercount owns the quantified-shortfall claim. Every detail this
        # classifier can emit must be readable as a DIFFERENT claim, so none of the
        # counting vocabulary may appear in any of them.
        details = []
        cases = [
            (RISING, [meal_bolus(12, 0), correction(13, 10)], ()),
            (cgm_ramp(12, 0, 190, 0.0, 180), [meal_bolus(12, 0)], ()),
            (RISING, [meal_bolus(12, 0)], ()),
            (RISING, [correction(13, 10)], ()),
            (RISING, [meal_bolus(12, 0), correction(13, 10)], suspend_run(12, 55)),
            ([CgmReading(t=ANCHOR, bg=240.0, type="EGV")], [meal_bolus(12, 0)], ()),
        ]
        for cgm, bolus, basal in cases:
            details.append(classify_meal_bolus_short(ANCHOR, cgm, bolus, basal).detail)
        self.assertEqual(len(details), len(cases))
        for detail in details:
            lowered = detail.lower()
            for banned in ("undercount", "carb ratio", "i:c", " g vs ", "grams",
                           "implies", "counting"):
                self.assertNotIn(banned, lowered, f"{banned!r} in {detail!r}")


if __name__ == "__main__":
    unittest.main()
