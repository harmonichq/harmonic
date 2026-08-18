"""Carb-undercount instance classifier tests (#76, epic #70).

The NEW signal no existing detector emitted: a meal that ran away high *despite*
being bolused, whose excursion implies far more carbs than were logged. The
headline acceptance case: BG 145 → 375 on ~30 g logged — an implied I:C several
times the programmed one.

Two axes to keep honest:

* ``ran away, no upstream cause`` — a genuine carb undercount, must flag, and must
  emit the ``inferred`` tier (true carbs are invisible — ADR 0003 — so the estimate
  is hedged, never asserted).
* ``ran away, but off a recent low / suspend`` — a rebound recovery, NOT a meal the
  bolus under-covered; the shared context gate must explain it away.
"""

import unittest
from dataclasses import replace
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers import EvidenceTier, UpstreamCause
from ciq_autotune.analyzers.classifiers.carb_undercount import classify_carb_undercount
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.analyzers.scenario_config import ScenarioConfig
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading

# Invented daytime settings on the real schema: ISF mg/dL/U, daytime I:C g/U. The
# classifier is handed these; it does not read settings itself. ``test_silence_reason``
# deliberately mirrors this exact pair as ``CU_ISF`` / ``CU_IC`` — one suite's settings
# seen from the silence-reason side — so the two must change together.
ISF = 32.0
IC = 5.0


def cgm_arc(day, start_h, start_min, points, cadence=5):
    """A CGM series from an explicit list of mg/dL values, ``cadence`` min apart."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=cadence * k), bg=float(v), type="EGV")
        for k, v in enumerate(points)
    ]


def cgm_ramp(day, start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=5 * k),
                   bg=start_bg + slope_per_min * 5 * k, type="EGV")
        for k in range(minutes // 5 + 1)
    ]


def meal(day, hh, mm, carbs=45.0, dose=10.0, carb_ratio=IC):
    return BolusEvent(
        t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=carbs,
        carb_ratio=carb_ratio,
    )


def suspend_run(day, hh, mm, rows=6, cadence=5):
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


def classify(m, cgm, basal=(), bolus=()):
    return classify_carb_undercount(m, cgm, basal, bolus, isf=ISF)


class RunawayVsCoveredTest(unittest.TestCase):
    """The core `runaway -> undercount` vs `covered / mild -> not` contrast."""

    def test_runaway_from_flat_is_a_carb_undercount(self):
        # BG flat ~145, then a bolused meal runs away to ~360 and stays high — no
        # low or suspend anywhere. The excursion implies far more carbs than logged.
        cgm = cgm_arc(15, 12, 0,
                      [145, 145, 170, 220, 280, 330, 360, 355, 340])  # 12:00 -> 12:40 peak
        m = meal(15, 12, 5, carbs=30.0, dose=30.0 / IC)  # 30 g logged, dosed at I:C
        v = classify(m, cgm)
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)   # hedged, never asserted
        self.assertGreater(v.implied_carbs, 30.0)                  # implied >> logged
        self.assertEqual(v.logged_carbs, 30.0)
        self.assertIn("implies", v.detail)

    def test_uses_the_ratio_stamped_on_each_meal(self):
        cgm = cgm_arc(15, 12, 0, [145, 145, 170, 220, 280, 330, 360])
        for stamped_ic in (5.1, 4.0, 5.4):
            with self.subTest(stamped_ic=stamped_ic):
                m = replace(
                    meal(15, 12, 5, carbs=30.0, dose=30.0 / stamped_ic),
                    carb_ratio=stamped_ic,
                )
                verdict = classify_carb_undercount(
                    m, cgm, isf=ISF,
                )
                expected = (m.insulin + (360.0 - 145.0) / ISF) * stamped_ic
                self.assertAlmostEqual(verdict.implied_carbs, round(expected, 1))

    def test_missing_dose_stamped_ratio_is_not_in_data(self):
        cgm = cgm_arc(15, 12, 0, [145, 145, 170, 220, 280, 330, 360])
        verdict = classify_carb_undercount(
            meal(15, 12, 5, carbs=30.0, dose=6.0, carb_ratio=None),
            cgm,
            isf=ISF,
        )
        self.assertEqual(verdict.evidence_tier, EvidenceTier.NOT_IN_DATA)
        self.assertFalse(verdict.matched)

    def test_in_range_meal_is_not_flagged(self):
        # A correctly-counted 45 g meal: peaks ~150 and settles. Never runs away.
        cgm = cgm_arc(15, 12, 0, [110, 120, 135, 150, 145, 130, 120])
        m = meal(15, 12, 5, carbs=45.0, dose=10.0)
        v = classify(m, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)   # in-range curve is fact
        self.assertLess(v.peak_bg, 200.0)

    def test_mild_high_well_counted_meal_is_not_flagged(self):
        # Ran a bit high (peak ~230) but the implied carbs sit inside counting range:
        # ratio < 1.5 AND absolute gap < 30 g. Not an undercount.
        cgm = cgm_arc(15, 12, 0, [120, 140, 175, 210, 230, 220, 200])
        m = meal(15, 12, 5, carbs=60.0, dose=60.0 / IC)
        v = classify(m, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)   # judged, within range
        self.assertIsNotNone(v.implied_carbs)
        self.assertLess(v.implied_carbs, 90.0)


class UpstreamCauseGateTest(unittest.TestCase):
    """A runaway that is really a rebound off a low/suspend must NOT be an undercount."""

    def test_rebound_off_a_low_is_not_a_carb_undercount(self):
        # BG bottoms at 62, a rescue rebound climbs past 300; the meal bolus lands
        # mid-rebound. The observable low gates it: not a carb undercount.
        cgm = cgm_ramp(15, 12, 0, 62, 5.5, 55)          # 62 -> ~424 rebound
        m = meal(15, 12, 40, carbs=30.0, dose=30.0 / IC)
        v = classify(m, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.gate.cause, UpstreamCause.RECENT_LOW)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("recovery", v.detail)

    def test_rebound_off_a_defensive_suspend_is_not_flagged(self):
        # A defensive suspend unwinds into a rise past 250; no low, but the suspend
        # is observable and gates the runaway.
        cgm = cgm_ramp(15, 12, 0, 110, 3.2, 55)          # 110 -> ~286, never low
        basal = suspend_run(15, 12, 0, rows=8)           # suspend 12:00-12:35
        m = meal(15, 12, 40, carbs=30.0, dose=30.0 / IC)
        v = classify(m, cgm, basal)
        self.assertFalse(v.matched)
        self.assertEqual(v.gate.cause, UpstreamCause.DEFENSIVE_SUSPEND)


class NotInDataTest(unittest.TestCase):
    def test_no_logged_carbs_cannot_be_judged(self):
        # A correction bolus with no carbs — nothing to compare an implied count to.
        cgm = cgm_arc(15, 12, 0, [200, 260, 320, 340])
        m = BolusEvent(t=datetime(2026, 6, 15, 12, 5, 0), insulin=5.0, carbs=None)
        v = classify(m, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)

    def test_missing_settings_cannot_be_judged(self):
        cgm = cgm_arc(15, 12, 0, [145, 220, 320, 360])
        m = meal(15, 12, 5, carbs=30.0, dose=6.0)
        v = classify_carb_undercount(m, cgm, isf=None)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)

    def test_no_cgm_cannot_be_judged(self):
        m = meal(15, 12, 5, carbs=30.0, dose=6.0)
        v = classify(m, [])
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)


class RunawayHeadlineAcceptanceTest(unittest.TestCase):
    """The headline acceptance case: BG 145 -> 375 on ~30 g logged."""

    def test_runaway_headline_is_a_carb_undercount(self):
        # 145 -> 375 over ~45 min, holds high. ~30 g logged across the meal boluses,
        # dosed at the programmed I:C. No low/suspend precedes it.
        cgm = cgm_arc(26, 18, 30,
                      [145, 150, 180, 235, 290, 340, 375, 370, 360, 350])
        m = meal(26, 18, 30, carbs=30.0, dose=30.0 / IC)
        v = classify(m, cgm)
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)   # inferred, hedged
        # The excursion honestly implies a large undercount (~2x+ the 30 g logged).
        self.assertGreaterEqual(v.implied_carbs, 1.5 * 30.0)
        self.assertEqual(v.baseline_bg, 145.0)
        self.assertEqual(v.peak_bg, 375.0)
        # Never asserts the true count: the detail hedges ("implies ~Ng").
        self.assertIn("implies", v.detail)
        self.assertNotIn("150 g", v.detail)  # the true count is never claimed

    def test_large_logged_meal_still_flags_via_absolute_gap(self):
        # Peak 346, 90 g logged. A severe runaway whose *ratio* dilutes on the big
        # logged meal (~1.4x) but whose absolute implied gap (~30 g) still flags.
        cgm = cgm_arc(25, 18, 0,
                      [140, 150, 190, 250, 300, 340, 346, 340, 325])
        m = meal(25, 18, 5, carbs=90.0, dose=90.0 / IC)
        v = classify(m, cgm)
        self.assertTrue(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertGreaterEqual(v.implied_carbs - 90.0, 30.0)      # absolute gap clears


class OwnedExcursionWindowTest(unittest.TestCase):
    """The peak search reads only the excursion the meal *owns* (ADR 0030, #249).

    Window = from the bolus to ``min(300 min, the next separate meal — a carb bolus
    ≥ 10 g landing >30 min later)``. A later carb bolus within 30 min is a dose-split,
    not a separate meal, so it does not cap the window.
    """

    def test_late_peak_no_later_meal_matches_up_to_300(self):
        # Benign through the old 180-min horizon (peaks 190 at 180 min), then runs away
        # to 360 at 240 min. No later meal → the full 300-min window catches it, where
        # the old 180-min window would have called it in-range.
        cgm = cgm_arc(15, 12, 0,
                      [140, 140, 140, 140, 140, 140, 140, 140, 140,
                       190, 260, 320, 360, 350, 340], cadence=20)
        m = meal(15, 12, 0, carbs=30.0, dose=30.0 / IC)
        v = classify(m, cgm)  # no later meal in scope
        self.assertTrue(v.matched)
        self.assertEqual(v.peak_bg, 360.0)          # the 240-min reading, past 180 min
        self.assertEqual(v.baseline_bg, 140.0)
        # The old 180-min horizon would have seen only ≤190 and stayed silent.
        narrow = replace(ScenarioConfig(), carb_undercount_peak_lookahead_min=180)
        v180 = classify_carb_undercount(m, cgm, isf=ISF,
                                        scenario_config=narrow)
        self.assertFalse(v180.matched)
        self.assertLess(v180.peak_bg, 200.0)

    def test_benign_then_later_meal_is_capped_and_not_matched(self):
        # Meal1 stays benign (≤155) through its owned window; a *separate* meal 90 min
        # later spikes to 360. The cap stops the read at that meal → meal1 is not blamed
        # for the later meal's spike. Without the cap the 300-min window would fire.
        cgm = cgm_arc(15, 12, 0,
                      [120, 140, 150, 155, 150, 150, 150, 150, 150, 150,
                       220, 300, 360, 350], cadence=10)
        m1 = meal(15, 12, 0, carbs=45.0, dose=10.0)
        m2 = meal(15, 13, 30, carbs=45.0)       # separate meal at +90 min
        v = classify(m1, cgm, bolus=[m1, m2])
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)   # capped read stayed in range
        self.assertLess(v.peak_bg, 200.0)
        # Sanity: without the cap (no later meal in scope) the same meal WOULD over-attribute.
        vuncapped = classify(m1, cgm)
        self.assertTrue(vuncapped.matched)

    def test_runaway_before_later_meal_still_matches_on_owned_window(self):
        # Meal1 runs away to 360 within its *own* window (peak at 50 min), well before a
        # separate meal at +90 min. The cap only truncates what belongs to the later
        # meal; the owned-window runaway is kept (the lost-signal-protection case).
        cgm = cgm_arc(15, 12, 0,
                      [145, 180, 230, 290, 340, 360, 350, 340, 330, 320,
                       360, 350, 340], cadence=10)
        m1 = meal(15, 12, 0, carbs=30.0, dose=30.0 / IC)
        m2 = meal(15, 13, 30, carbs=45.0)       # separate meal at +90 min
        v = classify(m1, cgm, bolus=[m1, m2])
        self.assertTrue(v.matched)
        self.assertEqual(v.peak_bg, 360.0)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)

    def test_dose_split_within_grace_is_not_a_separate_meal(self):
        # A top-up bolus 20 min after the meal (within the 30-min grace) is a dose-split,
        # not a separate meal — it must NOT cap the window. The combined meal's late
        # runaway (360 at 220 min) is still read to the full 300-min horizon.
        cgm = cgm_arc(15, 12, 0,
                      [140, 145, 150, 150, 150, 150, 150, 150, 150,
                       190, 300, 360, 350, 340], cadence=20)
        m1 = meal(15, 12, 0, carbs=30.0, dose=20.0 / IC)
        topup = meal(15, 12, 20, carbs=15.0)    # +20 min: within grace, same meal
        v = classify(m1, cgm, bolus=[m1, topup])
        self.assertTrue(v.matched)
        self.assertEqual(v.peak_bg, 360.0)      # read past the top-up, not capped at it


if __name__ == "__main__":
    unittest.main()
