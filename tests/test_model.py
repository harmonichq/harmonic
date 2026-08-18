"""Model tests on controlled synthetic data (stdlib unittest).

The clean-window filter now gates on reconstructed *bolus* IOB (see insulin.py),
so a "night" is just basal + CGM; boluses are passed separately and only a recent
one should knock minutes out.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BasalEvent, BolusEvent, CarbEntry, CgmReading, PumpEvent
from ciq_autotune.model import (
    ModelConfig,
    _CgmSeries,
    clean_samples,
    suggest_basal_profile,
)


def night(day, *, rate=0.8, bg=120.0, slope=0.0,
          start_h=0, end_h=6, dtype="algorithmDelivery"):
    """One night of self-consistent data: a basal segment plus 5-min CGM."""
    t0 = datetime(2022, 6, day, start_h, 0, 0)
    basal = [BasalEvent(t=t0, delivery_type=dtype,
                        duration_mins=(end_h - start_h) * 60, basal_rate=rate)]
    cgm = []
    steps = (end_h - start_h) * 60 // 5
    for k in range(steps + 1):
        tt = t0 + timedelta(minutes=5 * k)
        cgm.append(CgmReading(t=tt, bg=bg + slope * 5 * k, type="EGV"))
    return basal, cgm


def bolus(day, hh, mm, units):
    return BolusEvent(t=datetime(2022, 6, day, hh, mm, 0), insulin=units)


def combine(*nights):
    basal, cgm = [], []
    for b, c in nights:
        basal += b
        cgm += c
    return basal, cgm


def slot_at(result, label):
    return next(s for s in result.slots if s.label == label)


class CleanWindowTest(unittest.TestCase):
    def test_clean_overnight_recovers_delivered_rate_with_high_confidence(self):
        basal, cgm = combine(*(night(d, rate=0.8) for d in (1, 2, 3, 4)))
        r = suggest_basal_profile(basal, cgm, [], [])  # no boluses -> all clean
        s = slot_at(r, "03:00")
        self.assertEqual(s.confidence, "HIGH")
        self.assertAlmostEqual(s.suggested, 0.8, places=3)
        self.assertEqual(s.days, 4)

    def test_suggestion_is_median_not_mean(self):
        # Three nights at 0.6 + one night at 2.0 in the same slot. Median = 0.6;
        # the mean would be ~0.95. CIQ's corrective tail must not drag the
        # suggestion up, so we expect the median.
        basal, cgm = combine(night(1, rate=0.6), night(2, rate=0.6),
                             night(3, rate=0.6), night(4, rate=2.0))
        r = suggest_basal_profile(basal, cgm, [], [])
        s = slot_at(r, "03:00")
        self.assertEqual(s.confidence, "HIGH")
        self.assertAlmostEqual(s.suggested, 0.6, places=3)

    def test_recent_bolus_excludes_its_window(self):
        # A 5U bolus at 02:00 each night still has substantial IOB at 03:00.
        basal, cgm = combine(*(night(d) for d in (1, 2, 3, 4)))
        boluses = [bolus(d, 2, 0, 5.0) for d in (1, 2, 3, 4)]
        r = suggest_basal_profile(basal, cgm, boluses, [])
        s = slot_at(r, "03:00")
        self.assertEqual(s.clean_minutes, 0)
        self.assertIsNone(s.suggested)

    def test_old_bolus_has_decayed_and_does_not_exclude(self):
        # A bolus before the window, older than DIA by 03:00, is fully cleared.
        basal, cgm = combine(*(night(d) for d in (1, 2, 3, 4)))
        # 22:00 the previous evening -> 03:00 next day is 5h, well past the 180-min
        # (3h) default DIA, so IOB is fully decayed by 03:00.
        boluses = [BolusEvent(t=datetime(2022, 6, d - 1, 22, 0, 0), insulin=6.0)
                   for d in (2, 3, 4, 5)]
        r = suggest_basal_profile(basal, cgm, boluses, [])
        self.assertEqual(slot_at(r, "03:00").confidence, "HIGH")

    def test_out_of_range_glucose_excludes(self):
        basal, cgm = combine(*(night(d, bg=250.0) for d in (1, 2, 3, 4)))
        r = suggest_basal_profile(basal, cgm, [], [])
        self.assertEqual(slot_at(r, "03:00").clean_minutes, 0)

    def test_rising_glucose_excludes(self):
        # +2 mg/dL/min is well above the flat threshold: an excursion, not maintenance.
        basal, cgm = combine(*(night(d, bg=90.0, slope=2.0) for d in (1, 2, 3)))
        r = suggest_basal_profile(basal, cgm, [], [])
        self.assertEqual(slot_at(r, "03:00").clean_minutes, 0)

    def test_suspension_excludes(self):
        basal, cgm = combine(*(night(d, dtype="manual suspension", rate=0.0)
                               for d in (1, 2, 3, 4)))
        r = suggest_basal_profile(basal, cgm, [], [])
        self.assertEqual(slot_at(r, "03:00").clean_minutes, 0)

    def test_excluded_pump_event_blanks_nearby_slots(self):
        basal, cgm = combine(*(night(d) for d in (1, 2, 3, 4)))
        # A site change on day 2 at 03:10; +/-60min margin swallows the 03:00 slot.
        pump = [PumpEvent(t=datetime(2022, 6, 2, 3, 10, 0),
                          event_type="Site/Cartridge Change", duration_mins=0.0)]
        r = suggest_basal_profile(basal, cgm, [], pump)
        s = slot_at(r, "03:00")
        self.assertEqual(s.days, 3)  # day 2 dropped, days 1/3/4 remain

    def test_confidence_medium_then_low(self):
        # 2 clean days -> MEDIUM; 1 day -> LOW.
        two = combine(*(night(d) for d in (1, 2)))
        self.assertEqual(slot_at(suggest_basal_profile(*two, [], []), "03:00").confidence, "MEDIUM")
        one = night(1)
        self.assertEqual(slot_at(suggest_basal_profile(*one, [], []), "03:00").confidence, "LOW")
        self.assertIsNone(slot_at(suggest_basal_profile(*one, [], []), "03:00").suggested)


class CarbEntryExclusionTest(unittest.TestCase):
    """#169: a manual carb-log entry bars clean minutes for a grams-SCALED
    forward-decay window (COB), keeping the −15 back-buffer; NULL grams keep the
    flat +120 window (ADR 0033 §2).

    Carbs are otherwise never consulted in the clean-window filter, so an
    unbolused snack sneaks in whenever BG stays in-range and flat.
    """

    @staticmethod
    def _entry(day, hh, mm, grams=20.0, certainty="estimate", source="manual"):
        return CarbEntry(t=datetime(2022, 6, day, hh, mm, 0), grams=grams,
                         certainty=certainty, source=source)

    def _slot_times(self, samples, lo, hi):
        return [s.t for s in samples if lo <= s.t <= hi]

    def test_entry_excludes_its_grams_scaled_window(self):
        basal, cgm = night(1)  # flat, in-range overnight -> every minute clean
        cfg = ModelConfig()
        base = clean_samples(basal, cgm, [], [], cfg)
        lo = datetime(2022, 6, 1, 2, 45, 0)   # 03:00 − 15 back-buffer
        # 20 g manual (fast, 40 g/h): 15 onset + 30 decay + 45 guard = 90 min → 04:30.
        clear = datetime(2022, 6, 1, 4, 30, 0)
        self.assertTrue(self._slot_times(base, lo, clear))  # clean without the entry
        got = clean_samples(basal, cgm, [], [], cfg,
                            carb_entries=[self._entry(1, 3, 0)])
        # Nothing survives inside [02:45, 04:30); minutes at/after clearance return.
        self.assertEqual(
            self._slot_times(got, lo, datetime(2022, 6, 1, 4, 29, 0)), [])
        self.assertTrue(any(s.t >= clear for s in got))
        self.assertLess(len(got), len(base))
        self.assertTrue(any(s.t < lo for s in got))

    def test_larger_meal_masks_no_fewer_minutes(self):
        basal, cgm = night(1)
        cfg = ModelConfig()
        small = clean_samples(basal, cgm, [], [], cfg,
                              carb_entries=[self._entry(1, 3, 0, grams=15.0)])
        large = clean_samples(basal, cgm, [], [], cfg,
                              carb_entries=[self._entry(1, 3, 0, grams=45.0)])
        # More grams ⇒ clears later ⇒ never MORE surviving clean minutes.
        self.assertLessEqual(len(large), len(small))

    def test_entry_outside_the_data_leaves_minutes_untouched(self):
        basal, cgm = night(1)
        cfg = ModelConfig()
        base = clean_samples(basal, cgm, [], [], cfg)
        # An entry at 20:00 is well clear of the 00:00–06:00 data span.
        got = clean_samples(basal, cgm, [], [], cfg,
                            carb_entries=[self._entry(1, 20, 0)])
        self.assertEqual([s.t for s in got], [s.t for s in base])

    def test_margins_are_configurable(self):
        basal, cgm = night(1)
        # Widen the backward margin to 60 min; a minute at 02:15 (45 min before the
        # 03:00 entry) is now barred where the 15-min default would have kept it.
        cfg = ModelConfig(carb_exclusion_back_min=60)
        got = clean_samples(basal, cgm, [], [], cfg,
                            carb_entries=[self._entry(1, 3, 0)])
        self.assertFalse(any(s.t == datetime(2022, 6, 1, 2, 15, 0) for s in got))

    def test_null_gram_entry_keeps_the_flat_window(self):
        basal, cgm = night(1)
        cfg = ModelConfig()
        # 20 g clears via COB at 04:30; a NULL-gram entry is never decayed and keeps
        # the flat +120 window (05:00) — so it masks strictly more clean minutes.
        known = clean_samples(basal, cgm, [], [], cfg,
                              carb_entries=[self._entry(1, 3, 0, grams=20.0)])
        unknown = clean_samples(basal, cgm, [], [], cfg,
                                carb_entries=[self._entry(1, 3, 0, grams=None,
                                                          certainty="unknown")])
        self.assertLess(len(unknown), len(known))
        # The flat window still ends at 03:00 + 120 = 05:00.
        self.assertFalse(any(datetime(2022, 6, 1, 2, 45, 0) <= s.t
                             <= datetime(2022, 6, 1, 5, 0, 0) for s in unknown))


class ProfileRecoveryTest(unittest.TestCase):
    def test_programmed_rate_recovered_from_profile_delivery(self):
        basal = [BasalEvent(t=datetime(2022, 6, 1, 3, 0, 0),
                            delivery_type="profileDelivery",
                            duration_mins=30.0, basal_rate=1.0)]
        r = suggest_basal_profile(basal, [], [], [])
        self.assertEqual(slot_at(r, "03:00").current, 1.0)
        self.assertIsNone(slot_at(r, "00:00").current)


class ConfigTest(unittest.TestCase):
    def test_tightening_bolus_threshold_excludes_a_small_residual(self):
        # A small bolus ~2h10min before 03:00 leaves a little IOB (~0.09U at DIA=180).
        # Default threshold (0.1U) lets it through; a stricter 0.0 threshold excludes it.
        basal, cgm = combine(*(night(d) for d in (1, 2, 3, 4)))
        boluses = [bolus(d, 0, 50, 0.6) for d in (1, 2, 3, 4)]
        lenient = suggest_basal_profile(basal, cgm, boluses, [])
        strict = suggest_basal_profile(basal, cgm, boluses, [],
                                       config=ModelConfig(bolus_clear_u=0.0))
        self.assertGreater(slot_at(lenient, "03:00").clean_minutes,
                           slot_at(strict, "03:00").clean_minutes)


class CgmSlopeGuardTest(unittest.TestCase):
    """`_CgmSeries.slope` must refuse to fit a slope from sparse/stale clusters —
    two points 30s apart otherwise yield ±720 mg/dL/min artifacts (issue #59)."""

    def _series(self, offsets_bg):
        t0 = datetime(2022, 6, 1, 12, 0, 0)
        readings = [CgmReading(t=t0 + timedelta(minutes=off), bg=bg, type="EGV")
                    for off, bg in offsets_bg]
        return _CgmSeries(readings, timedelta(minutes=10)), t0 + timedelta(minutes=30)

    def test_dense_window_returns_a_real_slope(self):
        # 5-min CGM across the whole 30-min window: ~+2 mg/dL/min.
        series, t = self._series([(m, 100 + 2 * m) for m in range(0, 31, 5)])
        s = series.slope(t, timedelta(minutes=30))
        self.assertIsNotNone(s)
        self.assertAlmostEqual(s, 2.0, places=6)

    def test_two_point_cluster_is_rejected(self):
        # Two points 30s apart with a big jump would read as a huge slope.
        series, t = self._series([(29.5, 100.0), (30.0, 106.0)])
        self.assertIsNone(series.slope(t, timedelta(minutes=30)))
        self.assertLess(29.5, 30.0)  # guard against |slope|>20 artifact

    def test_three_points_in_a_tiny_span_are_rejected(self):
        # 3 points but crammed into 1 min of a 30-min window: span too short.
        series, t = self._series([(29.0, 100.0), (29.5, 103.0), (30.0, 108.0)])
        self.assertIsNone(series.slope(t, timedelta(minutes=30)))

    def test_slope_min_points_override_rejects_a_default_passing_window(self):
        """Positive control: a window that passes the default slope guard (3 pts
        spanning the whole window) is rejected once slope_min_points is raised."""
        t0 = datetime(2022, 6, 1, 12, 0, 0)
        offsets_bg = [(0, 100.0), (15, 130.0), (30, 160.0)]  # 3 pts, full-window span
        readings = [CgmReading(t=t0 + timedelta(minutes=off), bg=bg, type="EGV")
                    for off, bg in offsets_bg]
        t = t0 + timedelta(minutes=30)
        window = timedelta(minutes=30)
        # Default config admits this window.
        self.assertIsNotNone(
            _CgmSeries(readings, timedelta(minutes=10)).slope(t, window))
        # Demanding 4 points rejects the same window — the knob changed behavior.
        strict = _CgmSeries(readings, timedelta(minutes=10), slope_min_points=4)
        self.assertIsNone(strict.slope(t, window))

    def test_slope_min_span_frac_override_rejects_a_default_passing_window(self):
        """Positive control: a window passing the default span guard (~50%) is
        rejected once slope_min_span_frac is raised toward the full window."""
        t0 = datetime(2022, 6, 1, 12, 0, 0)
        # 3 pts spanning 15 of a 30-min window = 50% span (default passes; >0.5 fails).
        offsets_bg = [(15, 100.0), (22.5, 130.0), (30, 160.0)]
        readings = [CgmReading(t=t0 + timedelta(minutes=off), bg=bg, type="EGV")
                    for off, bg in offsets_bg]
        t = t0 + timedelta(minutes=30)
        window = timedelta(minutes=30)
        self.assertIsNotNone(
            _CgmSeries(readings, timedelta(minutes=10)).slope(t, window))
        strict = _CgmSeries(readings, timedelta(minutes=10), slope_min_span_frac=0.9)
        self.assertIsNone(strict.slope(t, window))


if __name__ == "__main__":
    unittest.main()
