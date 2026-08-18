"""Reconstructed-IOB tests (stdlib unittest)."""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.events import BolusEvent
from ciq_autotune.insulin import BolusIob, iob_fraction

PEAK, DIA = 75.0, 300.0


def at(hh, mm):
    return datetime(2022, 6, 1, hh, mm, 0)


def b(hh, mm, units):
    return BolusEvent(t=at(hh, mm), insulin=units)


def b_ext(hh, mm, units, pct, dur):
    return BolusEvent(
        t=at(hh, mm), insulin=units, standard_percent=pct, extended_duration=dur
    )


class IobFractionTest(unittest.TestCase):
    def test_full_at_delivery_and_zero_after_dia(self):
        self.assertEqual(iob_fraction(0, PEAK, DIA), 1.0)
        self.assertEqual(iob_fraction(DIA, PEAK, DIA), 0.0)
        self.assertEqual(iob_fraction(DIA + 60, PEAK, DIA), 0.0)

    def test_monotonically_decreasing(self):
        vals = [iob_fraction(m, PEAK, DIA) for m in range(0, int(DIA) + 1, 10)]
        for earlier, later in zip(vals, vals[1:]):
            self.assertGreaterEqual(earlier, later)

    def test_stays_in_unit_interval(self):
        for m in range(0, int(DIA) + 1, 5):
            f = iob_fraction(m, PEAK, DIA)
            self.assertGreaterEqual(f, 0.0)
            self.assertLessEqual(f, 1.0)


class BolusIobTest(unittest.TestCase):
    def test_zero_before_first_bolus(self):
        iob = BolusIob([b(12, 0, 5.0)], PEAK, DIA)
        self.assertEqual(iob.at(at(11, 0)), 0.0)

    def test_equals_dose_at_delivery_instant(self):
        iob = BolusIob([b(12, 0, 5.0)], PEAK, DIA)
        self.assertAlmostEqual(iob.at(at(12, 0)), 5.0, places=6)

    def test_decays_to_zero_by_dia(self):
        iob = BolusIob([b(12, 0, 5.0)], PEAK, DIA)
        self.assertEqual(iob.at(at(12, 0) + timedelta(minutes=DIA)), 0.0)
        # strictly decreasing in between
        self.assertGreater(iob.at(at(13, 0)), iob.at(at(14, 0)))

    def test_doses_sum(self):
        iob = BolusIob([b(12, 0, 2.0), b(12, 0, 3.0)], PEAK, DIA)
        self.assertAlmostEqual(iob.at(at(12, 0)), 5.0, places=6)

    def test_ignores_missing_or_nonpositive_insulin(self):
        iob = BolusIob([b(12, 0, None), b(12, 0, 0.0)], PEAK, DIA)
        self.assertEqual(iob.at(at(12, 0)), 0.0)

    def test_empty_is_zero_everywhere(self):
        iob = BolusIob([], PEAK, DIA)
        self.assertEqual(iob.at(at(12, 0)), 0.0)


class ExtendedBolusIobTest(unittest.TestCase):
    """standard_percent<100 boluses are spread across their delivery window."""

    def test_units_conserved(self):
        ext = BolusIob([b_ext(12, 0, 6.0, 0, 120)], PEAK, DIA)
        self.assertAlmostEqual(sum(ext.amts), 6.0, places=9)

    def test_spread_across_window_not_a_point_mass(self):
        ext = BolusIob([b_ext(12, 0, 6.0, 0, 120)], PEAK, DIA)
        # nothing delivered yet at the request instant (first sub-dose lands later)
        self.assertAlmostEqual(ext.at(at(12, 0)), 0.0, places=6)
        self.assertGreater(len(ext.times), 1)

    def test_delivery_centroid_near_window_midpoint(self):
        t0 = at(12, 0)
        ext = BolusIob([b_ext(12, 0, 6.0, 0, 120)], PEAK, DIA)
        total = sum(ext.amts)
        centroid_min = sum(
            (tt - t0).total_seconds() / 60.0 * a
            for tt, a in zip(ext.times, ext.amts)
        ) / total
        self.assertAlmostEqual(centroid_min, 60.0, delta=2.0)

    def test_lower_iob_inside_window_than_instantaneous(self):
        t0 = at(12, 0)
        inst = BolusIob([b(12, 0, 6.0)], PEAK, DIA)
        ext = BolusIob([b_ext(12, 0, 6.0, 0, 120)], PEAK, DIA)
        inside = t0 + timedelta(minutes=30)
        self.assertLess(ext.at(inside), inst.at(inside))

    def test_longer_later_tail_than_instantaneous(self):
        t0 = at(12, 0)
        inst = BolusIob([b(12, 0, 6.0)], PEAK, DIA)
        ext = BolusIob([b_ext(12, 0, 6.0, 0, 120)], PEAK, DIA)
        # instantaneous is fully cleared one DIA after t0; the extended tail is not
        late = t0 + timedelta(minutes=DIA)
        self.assertEqual(inst.at(late), 0.0)
        self.assertGreater(ext.at(late), 0.0)


class StandardBolusNoRegressionTest(unittest.TestCase):
    """standard_percent 100 / NULL / missing-duration stay single point masses."""

    OFFSETS = [0, 15, 30, 60, 120, 240, 300]

    def _assert_matches_instantaneous(self, event):
        t0 = at(12, 0)
        inst = BolusIob([b(12, 0, 5.0)], PEAK, DIA)
        got = BolusIob([event], PEAK, DIA)
        for off in self.OFFSETS:
            tt = t0 + timedelta(minutes=off)
            self.assertAlmostEqual(got.at(tt), inst.at(tt), places=9)

    def test_standard_percent_100(self):
        self._assert_matches_instantaneous(b_ext(12, 0, 5.0, 100, 0))

    def test_standard_percent_100_with_duration(self):
        # 100% up front — a nonzero duration must not trigger the spread
        self._assert_matches_instantaneous(b_ext(12, 0, 5.0, 100, 120))

    def test_standard_percent_null(self):
        self._assert_matches_instantaneous(b(12, 0, 5.0))

    def test_extended_flag_without_duration(self):
        # <100% but no/zero duration → safe fallback to a single point mass
        self._assert_matches_instantaneous(b_ext(12, 0, 5.0, 50, 0))
        self._assert_matches_instantaneous(b_ext(12, 0, 5.0, 50, None))


if __name__ == "__main__":
    unittest.main()
