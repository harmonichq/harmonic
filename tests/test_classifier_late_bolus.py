"""Late-bolus instance classifier tests (#71, #117, epic #70).

Two axes the old ``not_pre_bolusing`` detector conflated:

* ``flat -> meal-bolus into rise`` — a genuine late bolus, must still flag.
* ``low -> rebound -> meal-bolus`` — a rescue-rebound / post-low / post-suspend
  recovery rise, must NOT flag (the shared context gate explains it away).

The headline acceptance case: a lunch bolus given at eating time, preceded by a
rebound after a low that bottomed at 64, must not be called late.

#117 adds a third gate: BG already *clearly high* (> 250) at bolus time → prior
high-baseline rise, not a from-flat meal spike → suppress. The threshold sits
well above the 180 range line on purpose: a 180 gate over-suppressed genuine
late boluses that merely started 180-240 and climbing (see the constant's note).
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.classifiers import (
    EvidenceTier,
    SilenceReason,
    UpstreamCause,
    classify_late_bolus,
    upstream_cause,
)
from ciq_autotune.analyzers.classifiers.context_gate import CIQ_SUSPEND_TYPE
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading


# --- builders (mirror tests/test_analyzer_behavioral.py conventions) --------


def cgm_ramp(day, start_h, start_min, start_bg, slope_per_min, minutes):
    """A CGM series of 5-min readings ramping at ``slope_per_min`` mg/dL/min."""
    t0 = datetime(2026, 6, day, start_h, start_min, 0)
    return [
        CgmReading(t=t0 + timedelta(minutes=5 * k),
                   bg=start_bg + slope_per_min * 5 * k, type="EGV")
        for k in range(minutes // 5 + 1)
    ]


def meal(day, hh, mm, carbs=45.0, dose=10.0):
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose, carbs=carbs)


def carb_bolus(day, hh, mm, carbs=20.0, dose=2.0, completion="Completed"):
    """A prior *carb* bolus (#167): completed by default, carrying carbs."""
    return BolusEvent(t=datetime(2026, 6, day, hh, mm, 0), insulin=dose,
                      carbs=carbs, completion=completion)


def suspend_run(day, hh, mm, rows=6, cadence=5):
    """A run of ``rows`` consecutive CIQ-suspended basal rows, ``cadence`` min apart."""
    t0 = datetime(2026, 6, day, hh, mm, 0)
    return [
        BasalEvent(t=t0 + timedelta(minutes=cadence * k), delivery_type=CIQ_SUSPEND_TYPE,
                   basal_rate=0.0, profile_basal_rate=0.9)
        for k in range(rows)
    ]


class LateBolusFlatVsRiseTest(unittest.TestCase):
    """The core `flat -> late` vs `low->rebound -> not late` contrast."""

    def test_flat_then_bolus_into_rise_is_late(self):
        # BG flat at 120 for 20 min, then the meal bolus lands right as a real,
        # from-flat rise begins — no low or suspend anywhere. Genuine late bolus.
        cgm = cgm_ramp(15, 12, 10, 120, 2.0, 60)     # +2 mg/dL/min from 12:10
        m = meal(15, 12, 40)                          # bolused 30 min into the rise
        v = classify_late_bolus(m, cgm)
        self.assertTrue(v.matched)
        self.assertGreater(v.pre_bolus_slope, 1.0)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("rising", v.detail)

    def test_low_rebound_then_bolus_is_not_late(self):
        # BG bottoms at 64, then a rescue rebound climbs steeply into lunchtime;
        # the meal bolus lands mid-rebound. The recent low must gate it: not late.
        cgm = cgm_ramp(15, 12, 0, 64, 5.0, 50)        # 64 -> 314 rebound from 12:00
        m = meal(15, 12, 40)                          # bolus mid-rebound
        v = classify_late_bolus(m, cgm)
        self.assertFalse(v.matched)
        self.assertGreater(v.pre_bolus_slope, 1.0)    # it WAS rising ...
        self.assertEqual(v.gate.cause, UpstreamCause.RECENT_LOW)  # ... but explained
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertIn("64", v.detail)


class LateBolusFlatPreBolusTest(unittest.TestCase):
    def test_truly_flat_pre_bolus_is_not_late(self):
        # Flat right up to the bolus — the dose led the rise. Observed, not late.
        cgm = cgm_ramp(15, 12, 0, 120, 0.0, 40)
        m = meal(15, 12, 30)
        v = classify_late_bolus(m, cgm)
        self.assertFalse(v.matched)
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertLessEqual(v.pre_bolus_slope, 1.0)

    def test_sparse_cgm_cannot_be_judged(self):
        # Only one reading near the bolus — too sparse to fit a slope.
        cgm = [CgmReading(t=datetime(2026, 6, 15, 12, 25, 0), bg=150.0, type="EGV")]
        m = meal(15, 12, 30)
        v = classify_late_bolus(m, cgm)
        self.assertFalse(v.matched)
        self.assertIsNone(v.pre_bolus_slope)
        self.assertEqual(v.evidence_tier, EvidenceTier.NOT_IN_DATA)


class PostSuspendLunchAcceptanceTest(unittest.TestCase):
    """The headline acceptance case: a lunch bolus dosed into a post-suspend low's
    rescue rebound (#71)."""

    def _episode_cgm(self):
        # ~14:20 a defensive suspend has driven BG down; it bottoms at 64 ~15:00,
        # a rescue overshoots and BG climbs to ~178 by ~15:48 lunch.
        fall = cgm_ramp(30, 14, 20, 120, -1.4, 40)         # 120 -> 64 by 15:00
        rebound = cgm_ramp(30, 15, 5, 64, 2.4, 43)         # 64 -> ~178 by 15:48
        return fall + rebound

    def test_lunch_bolus_after_rescue_rebound_is_not_flagged(self):
        cgm = self._episode_cgm()
        basal = suspend_run(30, 13, 30, rows=18)           # ~90 min defensive suspend
        m = BolusEvent(t=datetime(2026, 6, 30, 15, 48, 0), insulin=10.0, carbs=45.0)
        v = classify_late_bolus(m, cgm, basal)
        self.assertFalse(v.matched)                        # NOT late
        self.assertGreater(v.pre_bolus_slope, 1.0)         # BG was rising fast ...
        self.assertIn(v.gate.cause, (UpstreamCause.RECENT_LOW, UpstreamCause.BOTH))
        self.assertEqual(v.gate.nadir_bg, 64.0)            # bottomed at 64

    def test_same_rise_from_flat_with_no_low_would_flag(self):
        # Control: steep rise into 15:48, no preceding low or suspend, BG starts and
        # stays in range at bolus time (so the high-start gate doesn't fire — only
        # the slope gate does). 120 + 1.5*20 = 150 at 15:48.
        cgm = cgm_ramp(30, 15, 28, 120, 1.5, 20)
        m = BolusEvent(t=datetime(2026, 6, 30, 15, 48, 0), insulin=10.0, carbs=45.0)
        v = classify_late_bolus(m, cgm)
        self.assertTrue(v.matched)                         # WOULD be late


class ContextGateTest(unittest.TestCase):
    """The shared gate primitive #72-#76 will reuse, tested in isolation."""

    def test_recent_low_is_detected(self):
        anchor = datetime(2026, 6, 15, 12, 45, 0)
        cgm = cgm_ramp(15, 12, 0, 64, 3.0, 45)             # low at 12:00, climbing
        g = upstream_cause(anchor, cgm)
        self.assertTrue(g.explained)
        self.assertEqual(g.cause, UpstreamCause.RECENT_LOW)
        self.assertEqual(g.nadir_bg, 64.0)

    def test_defensive_suspend_is_detected(self):
        anchor = datetime(2026, 6, 15, 12, 45, 0)
        cgm = cgm_ramp(15, 12, 0, 110, 2.0, 45)            # rising, but never low
        basal = suspend_run(15, 12, 0, rows=6)             # suspend 12:00-12:25
        g = upstream_cause(anchor, cgm, basal)
        self.assertTrue(g.explained)
        self.assertEqual(g.cause, UpstreamCause.DEFENSIVE_SUSPEND)
        self.assertIsNotNone(g.suspend_end_t)

    def test_low_and_suspend_together_report_both(self):
        anchor = datetime(2026, 6, 15, 12, 45, 0)
        cgm = cgm_ramp(15, 12, 0, 64, 3.0, 45)
        basal = suspend_run(15, 12, 0, rows=6)
        g = upstream_cause(anchor, cgm, basal)
        self.assertEqual(g.cause, UpstreamCause.BOTH)

    def test_flat_high_window_has_no_cause(self):
        # No low, no suspend in the window — nothing to explain a rise.
        anchor = datetime(2026, 6, 15, 12, 45, 0)
        cgm = cgm_ramp(15, 12, 0, 150, 1.0, 45)
        g = upstream_cause(anchor, cgm)
        self.assertFalse(g.explained)
        self.assertEqual(g.cause, UpstreamCause.NONE)
        self.assertEqual(g.detail, "")

    def test_low_outside_lookback_window_does_not_gate(self):
        # A low 2 h before the anchor is outside the 90-min window.
        anchor = datetime(2026, 6, 15, 14, 0, 0)
        cgm = cgm_ramp(15, 12, 0, 64, 0.0, 20)             # low only around 12:00
        g = upstream_cause(anchor, cgm)
        self.assertFalse(g.explained)

    def test_long_suspend_still_recovering_gates_via_end_time(self):
        # A suspend that started before the lookback window but ended inside it
        # (before the anchor) still gates via its end time.
        anchor = datetime(2026, 6, 15, 13, 30, 0)
        cgm = cgm_ramp(15, 12, 0, 120, 1.5, 90)
        basal = suspend_run(15, 11, 45, rows=18)           # 11:45 -> 13:10 cadence
        g = upstream_cause(anchor, cgm, basal)
        self.assertTrue(g.explained)                       # started pre-window,
        self.assertEqual(g.cause, UpstreamCause.DEFENSIVE_SUSPEND)  # ended in window


class HighStartGateTest(unittest.TestCase):
    """#117 — clearly-high-start gate: BG already well above range (> 250)
    suppresses the late verdict; a merely near-range start still flags."""

    def test_stacking_on_prior_undercount_not_late(self):
        # A second bolus 20 min into a rise: BG was ~297 and climbing off an earlier
        # meal. The rise is from a prior undercount, not a from-flat meal spike.
        cgm = cgm_ramp(11, 5, 27, 250, 4.7, 25)    # 250 -> ~367, slope 4.7/min
        m = BolusEvent(t=datetime(2026, 6, 11, 5, 47, 0), insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm)
        self.assertFalse(v.matched)
        self.assertGreater(v.pre_bolus_slope, 1.0)   # was rising ...
        self.assertGreater(v.pre_bolus_bg, 250.0)    # ... but already clearly high
        self.assertEqual(v.evidence_tier, EvidenceTier.OBSERVED)
        self.assertIn("clearly high", v.detail)
        self.assertIsNone(v.gate)                    # gate not reached

    def test_in_range_start_still_flags_as_late(self):
        # BG starts at 100 (in range), rises steeply — genuine late bolus.
        # 100 + 3.0*20 = 160 at bolus time, well within range.
        cgm = cgm_ramp(11, 5, 27, 100, 3.0, 25)
        m = BolusEvent(t=datetime(2026, 6, 11, 5, 47, 0), insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm)
        self.assertTrue(v.matched)
        self.assertLessEqual(v.pre_bolus_bg, 250.0)

    def test_near_range_start_in_gray_zone_still_flags(self):
        # The reason the threshold is 250, not 180: a bolus that started barely
        # out of range (~183) and climbing — a forgot-to-pre-bolus late bolus, not
        # stacking onto a prior undercount — must still flag. 165 + 2.0*20 = 205.
        cgm = cgm_ramp(11, 5, 27, 165, 2.0, 25)
        m = BolusEvent(t=datetime(2026, 6, 11, 5, 47, 0), insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm)
        self.assertTrue(v.matched)                   # 180 gate would have suppressed
        self.assertGreater(v.pre_bolus_bg, 180.0)    # it IS out of range ...
        self.assertLessEqual(v.pre_bolus_bg, 250.0)  # ... just not clearly high
        self.assertNotIn("clearly high", v.detail)

    def test_exactly_at_high_threshold_does_not_gate(self):
        # BG of exactly 250 at bolus time is at-but-not-over the threshold; the
        # high-start gate suppresses only > 250, so the verdict depends on slope.
        from ciq_autotune.events import CgmReading
        cgm = cgm_ramp(11, 5, 27, 220, 2.0, 25)    # rising, passes the slope gate
        t_bolus = datetime(2026, 6, 11, 5, 47, 0)
        cgm_at_250 = cgm[:-1] + [CgmReading(t=t_bolus, bg=250.0, type="EGV")]
        m = BolusEvent(t=t_bolus, insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm_at_250)
        self.assertAlmostEqual(v.pre_bolus_bg, 250.0, places=0)
        self.assertNotIn("clearly high", v.detail)  # gate did not fire at 250

    def test_high_start_gate_sets_pre_bolus_bg(self):
        cgm = cgm_ramp(11, 5, 27, 250, 4.7, 25)
        m = BolusEvent(t=datetime(2026, 6, 11, 5, 47, 0), insulin=3.0, carbs=15.0)
        v = classify_late_bolus(m, cgm)
        self.assertIsNotNone(v.pre_bolus_bg)
        self.assertGreater(v.pre_bolus_bg, 250.0)


class PriorCarbBolusOwnsRiseTest(unittest.TestCase):
    """#167 — a meal dosed into a rise already owned by a recent completed carb
    bolus is not late. Suppression runs after the low/suspend gate and before the
    high-start check; qualifying prior = completed, ``carbs`` > 0, within 60 min.

    A carb-tagged bolus at a flat BG leads its own fast rise, and ~24 min later a
    second meal is bolused on time into that already-owned rise — the second meal is
    not late.
    """

    def _rising_from_flat(self):
        # A from-flat rise that, absent a prior bolus, is a genuine late bolus: BG
        # 120 climbing 2.0/min from 12:10, meal at 12:40 -> 180 mg/dL (< 250), with
        # no low or suspend anywhere to gate it.
        return cgm_ramp(15, 12, 10, 120, 2.0, 60)

    def test_prior_carb_bolus_within_window_suppresses_late(self):
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        beer = carb_bolus(15, 12, 16, carbs=20.0)      # 24 min earlier, completed, carbs
        v = classify_late_bolus(m, cgm, bolus_events=[beer, m])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.OWNED_BY_PRIOR_BOLUS)
        self.assertEqual(v.evidence_tier, EvidenceTier.INFERRED)
        self.assertGreater(v.pre_bolus_slope, 1.0)     # it WAS rising ...
        self.assertLessEqual(v.pre_bolus_bg, 250.0)    # ... and not clearly high
        self.assertIn("owned by that earlier dose", v.detail)

    def test_no_prior_bolus_still_fires_late(self):
        # Only the meal itself in the bolus list -> a genuine late bolus still fires.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        v = classify_late_bolus(m, cgm, bolus_events=[m])
        self.assertTrue(v.matched)
        self.assertIsNone(v.silence_reason)

    def test_empty_bolus_events_is_pre_167_behavior(self):
        # Default empty bolus list -> back-compatible: the rise flags late as before.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        self.assertTrue(classify_late_bolus(m, cgm).matched)

    def test_prior_carb_bolus_outside_window_still_late(self):
        # 65 min before the meal -> outside the 60-min lookback, does not own the rise.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        beer = carb_bolus(15, 11, 35, carbs=20.0)
        v = classify_late_bolus(m, cgm, bolus_events=[beer, m])
        self.assertTrue(v.matched)

    def test_prior_bolus_without_carbs_still_late(self):
        # A correction (carbs=0 or absent) within the window does not qualify.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        zero = carb_bolus(15, 12, 16, carbs=0.0)
        self.assertTrue(classify_late_bolus(m, cgm, bolus_events=[zero, m]).matched)
        none = carb_bolus(15, 12, 16, carbs=None)
        self.assertTrue(classify_late_bolus(m, cgm, bolus_events=[none, m]).matched)

    def test_prior_carb_bolus_not_completed_still_late(self):
        # A cancelled/aborted carb bolus within the window does not qualify.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        cancelled = carb_bolus(15, 12, 16, carbs=20.0, completion="Aborted by PLGS")
        self.assertTrue(classify_late_bolus(m, cgm, bolus_events=[cancelled, m]).matched)

    def test_low_suspend_gate_outranks_prior_bolus(self):
        # Both a recent low AND a prior carb bolus are present. The low/suspend gate
        # runs first (step 3), so the retained reason is UPSTREAM_CAUSE, not the new
        # prior-bolus reason — the step ordering is preserved.
        cgm = cgm_ramp(15, 12, 0, 64, 5.0, 50)         # low at 64 -> steep rebound
        m = meal(15, 12, 40)
        beer = carb_bolus(15, 12, 16, carbs=20.0)
        v = classify_late_bolus(m, cgm, bolus_events=[beer, m])
        self.assertFalse(v.matched)
        self.assertEqual(v.silence_reason, SilenceReason.UPSTREAM_CAUSE)

    def test_most_recent_qualifying_prior_is_reported(self):
        # Two qualifying prior carb boluses in the window -> the closest one (its
        # grams and minutes) is named in the detail.
        cgm = self._rising_from_flat()
        m = meal(15, 12, 40)
        early = carb_bolus(15, 12, 0, carbs=45.0)      # 40 min before
        near = carb_bolus(15, 12, 25, carbs=15.0)      # 15 min before (closest)
        v = classify_late_bolus(m, cgm, bolus_events=[early, near, m])
        self.assertFalse(v.matched)
        self.assertIn("15 g", v.detail)
        self.assertIn("15 min", v.detail)


if __name__ == "__main__":
    unittest.main()
