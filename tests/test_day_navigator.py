"""Tests for ciq_autotune.day_navigator — the Day surface's per-day severity feed
(#248 / ADR 0030) behind ``/day-navigator?month=YYYY-MM``.

Coverage:
* **month span + pad** — the returned days cover the calendar month ± a week, ascending.
* **per-day stats** — TIR + distinct low/high *runs* (not per-tick), bucketed by pump-local day.
* **curve** — a downsampled ``[{x, bg}]`` sparkline with x = fractional hour-of-day.
* **no-data days** — render with ``has_data=False`` and empty stats so the grid stays intact.
"""

import unittest
from datetime import date

from ciq_autotune.day_navigator import build_day_navigator, _day_stats, _month_bounds
from ciq_autotune.store import Store


def _egv(ts, bg):
    return {"EventDateTime": ts, "Readings (CGM / BGM)": bg, "Description": "EGV"}


class MonthBoundsTest(unittest.TestCase):
    def test_bounds(self):
        self.assertEqual(_month_bounds("2026-06"), (date(2026, 6, 1), date(2026, 6, 30)))

    def test_december_rolls_year(self):
        self.assertEqual(_month_bounds("2026-12"), (date(2026, 12, 1), date(2026, 12, 31)))


class DayStatsTest(unittest.TestCase):
    def test_tir_and_runs(self):
        # two distinct lows (a run is one excursion, not per-tick), one high run
        bgs = [60, 55, 120, 130, 65, 200, 210, 150]
        st = _day_stats(bgs)
        self.assertEqual(st["lows"], 2)
        self.assertEqual(st["highs"], 1)
        # in-range: 120,130,150 = 3 of 8
        self.assertEqual(st["tir"], round(3 / 8 * 100))

    def test_all_in_range(self):
        self.assertEqual(_day_stats([100, 110, 120]), {"lows": 0, "highs": 0, "tir": 100})


class BuildDayNavigatorTest(unittest.TestCase):
    def setUp(self):
        self.store = Store.open(":memory:")
        self.addCleanup(self.store.close)
        # The first day: one low run + one high run; the second day: all in range.
        self.store.upsert_cgm([
            _egv("2026-06-16T00:00:00", 60), _egv("2026-06-16T00:05:00", 58),
            _egv("2026-06-16T08:00:00", 120), _egv("2026-06-16T12:00:00", 190),
            _egv("2026-06-16T18:00:00", 110),
            _egv("2026-06-17T09:00:00", 100), _egv("2026-06-17T15:00:00", 130),
        ])

    def test_month_span_and_pad(self):
        nav = build_day_navigator(self.store, "2026-06")
        self.assertEqual(nav["month"], "2026-06")
        isos = [d["iso"] for d in nav["days"]]
        # ascending, first day is 7 days before June 1, last is 7 days after June 30
        self.assertEqual(isos[0], "2026-05-25")
        self.assertEqual(isos[-1], "2026-07-07")
        self.assertEqual(isos, sorted(isos))

    def test_real_day_stats_and_curve(self):
        nav = build_day_navigator(self.store, "2026-06")
        by_iso = {d["iso"]: d for d in nav["days"]}
        jun16 = by_iso["2026-06-16"]
        self.assertTrue(jun16["has_data"])
        self.assertEqual(jun16["lows"], 1)   # 60,58 are one contiguous low run
        self.assertEqual(jun16["highs"], 1)  # single 190 tick
        self.assertTrue(jun16["curve"])
        for pt in jun16["curve"]:
            self.assertGreaterEqual(pt["x"], 0.0)
            self.assertLessEqual(pt["x"], 1.0)
        # midnight reading maps to x≈0, evening reading maps to x≈0.75
        self.assertAlmostEqual(jun16["curve"][0]["x"], 0.0, places=3)
        self.assertAlmostEqual(jun16["curve"][-1]["x"], 18 / 24, places=2)

    def test_no_data_day_is_greyed(self):
        nav = build_day_navigator(self.store, "2026-06")
        by_iso = {d["iso"]: d for d in nav["days"]}
        gap = by_iso["2026-06-20"]
        self.assertFalse(gap["has_data"])
        self.assertEqual(gap["curve"], [])
        self.assertEqual(gap["tir"], 0)


if __name__ == "__main__":
    unittest.main()
