"""Tests for ciq_autotune.rest_window — deterministic, no DB/network."""

import unittest
from datetime import date, datetime, timedelta
from typing import List

from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.rest_window import RestWindow, RestWindowConfig, detect_rest_windows


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _dt(y: int, mo: int, d: int, h: int, m: int = 0) -> datetime:
    return datetime(y, mo, d, h, m, 0)


def _cgm(start: datetime, end: datetime, bg: float = 110.0,
         step_min: int = 5) -> List[CgmReading]:
    """Dense CGM from start to end inclusive at step_min intervals."""
    readings = []
    t = start
    while t <= end:
        readings.append(CgmReading(t=t, bg=bg, type="EGV"))
        t += timedelta(minutes=step_min)
    return readings


def _carb_bolus(t: datetime, carbs: float = 50.0) -> BolusEvent:
    return BolusEvent(t=t, insulin=1.0, carbs=carbs)


def _correction_bolus(t: datetime) -> BolusEvent:
    """No-carb bolus — must NOT count as a spine anchor."""
    return BolusEvent(t=t, insulin=0.5, carbs=None)


# The reference night: dinner bolus at 20:00, breakfast bolus next day at 08:30.
# Envelope default: 22:00–08:00.
_YEAR, _MO, _DAY = 2024, 1, 15


class RegularNightTest(unittest.TestCase):
    """Test 1 — regular night → window ≈ envelope (22:00–08:00)."""

    def test_regular_night_yields_envelope_window(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        # Dense CGM 22:00–08:00.
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        self.assertEqual(len(windows), 1)
        w = windows[0]
        self.assertEqual(w.date, date(_YEAR, _MO, _DAY))
        self.assertEqual(w.start, _dt(_YEAR, _MO, _DAY, 22, 0))
        self.assertEqual(w.end, _dt(_YEAR, _MO, _DAY + 1, 8, 0))


class LateDinnerTest(unittest.TestCase):
    """Test 2 — late dinner past envelope start → start pushed to bolus time."""

    def test_late_dinner_pushes_start(self):
        # Dinner bolus at 22:30 — after envelope start (22:00).
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 22, 30))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 30),
                   _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        self.assertEqual(len(windows), 1)
        w = windows[0]
        # Start should be at 22:30 (the late dinner).
        self.assertEqual(w.start, _dt(_YEAR, _MO, _DAY, 22, 30))
        self.assertEqual(w.end, _dt(_YEAR, _MO, _DAY + 1, 8, 0))


class EarlyBreakfastTest(unittest.TestCase):
    """Test 3 — early breakfast before envelope end → end pulled to bolus time."""

    def test_early_breakfast_pulls_end(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        # Breakfast at 07:00 — before envelope end (08:00).
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 7, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 7, 0))
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        self.assertEqual(len(windows), 1)
        w = windows[0]
        self.assertEqual(w.end, _dt(_YEAR, _MO, _DAY + 1, 7, 0))


class MidnightCarbCorrectionTest(unittest.TestCase):
    """Test 4 — 3am carb correction → night splits; longest sub-span kept."""

    def test_midnight_carb_splits_night(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        # Mid-night correction at 03:00 splits the window into:
        #   22:00–03:00 (5 h) and 03:00–08:00 (5 h) — both ≥ 3 h; first is longer.
        mid_night = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 3, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        windows = detect_rest_windows(cgm, [dinner, mid_night, breakfast])
        self.assertEqual(len(windows), 1)
        w = windows[0]
        # Both sub-spans are 5 h; first one (22:00–03:00) is picked (they're equal
        # length, Python max returns the first in tie — either is acceptable).
        # The split means neither sub-span can extend past 03:00.
        self.assertLessEqual(w.end, _dt(_YEAR, _MO, _DAY + 1, 3, 0))
        self.assertGreaterEqual((w.end - w.start).total_seconds() / 3600, 3.0)

    def test_short_sub_spans_dropped(self):
        """When both sub-spans are < 3 h, emit nothing."""
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        # Split at 00:30 → 22:00–00:30 (2.5 h) + 00:30–02:00 (1.5 h) — both < 3 h.
        mid_night = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 0, 30))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 2, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 2, 0))
        windows = detect_rest_windows(cgm, [dinner, mid_night, breakfast])
        self.assertEqual(windows, [])


class MorningRiseTrimTest(unittest.TestCase):
    """Test 5 — morning meal-shaped rise (no bolus) → trailing trim bites."""

    def test_morning_rise_trims_end(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        # Flat CGM from 22:00 to 07:15, then a 30+ mg/dL rise.
        flat = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                    _dt(_YEAR, _MO, _DAY + 1, 7, 10), bg=110.0)
        # Build a rise: starting at 07:15 (+30 min window).
        rise_start = _dt(_YEAR, _MO, _DAY + 1, 7, 15)
        rise = []
        for i in range(7):
            t = rise_start + timedelta(minutes=5 * i)
            bg = 110.0 + (35.0 / 6) * i  # ~35 mg/dL over 30 min
            rise.append(CgmReading(t=t, bg=bg, type="EGV"))
        cgm = flat + rise
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        self.assertEqual(len(windows), 1)
        w = windows[0]
        # End should be pulled back to before the rise (≤ 07:15).
        self.assertLessEqual(w.end, _dt(_YEAR, _MO, _DAY + 1, 7, 16))


class PartialInteriorGapTest(unittest.TestCase):
    """Test 6 — interior CGM gap → still one window (no split)."""

    def test_interior_gap_does_not_split(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        # CGM before gap.
        before_gap = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                          _dt(_YEAR, _MO, _DAY + 1, 2, 0))
        # Gap from 02:00 to 04:00 — no readings.
        # CGM after gap.
        after_gap = _cgm(_dt(_YEAR, _MO, _DAY + 1, 4, 0),
                         _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        cgm = before_gap + after_gap
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        # Interior gaps don't split — still one window.
        self.assertEqual(len(windows), 1)


class SparseCgmBelowCoverageTest(unittest.TestCase):
    """Test 7 — CGM coverage < 50 % → emit nothing."""

    def test_sparse_cgm_yields_nothing(self):
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        # Only 1 h of CGM in a 10 h window = 10 % coverage.
        sparse = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                      _dt(_YEAR, _MO, _DAY, 23, 0))
        windows = detect_rest_windows(sparse, [dinner, breakfast])
        self.assertEqual(windows, [])


class NoDataTest(unittest.TestCase):
    """Test 8 — no data / no qualifying span → empty list, no crash."""

    def test_empty_inputs(self):
        self.assertEqual(detect_rest_windows([], []), [])

    def test_no_carb_boluses(self):
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        corrections = [_correction_bolus(_dt(_YEAR, _MO, _DAY, 23, 0))]
        # No carb boluses means no spine anchors — still emits envelope window.
        windows = detect_rest_windows(cgm, corrections)
        # Should still produce a window (falls back to envelope).
        self.assertEqual(len(windows), 1)

    def test_window_too_short_for_no_data_edge(self):
        # Late dinner + early breakfast leaves < 3 h.
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 23, 30))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 1, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 23, 30),
                   _dt(_YEAR, _MO, _DAY + 1, 1, 0))
        windows = detect_rest_windows(cgm, [dinner, breakfast])
        self.assertEqual(windows, [])


class SleepScheduleIgnoranceTest(unittest.TestCase):
    """Test 9 — fixture with/without CIQ Sleep events yields identical output.

    Proves the detector never reads sleep_schedules or pump_events "Sleep".
    We pass the same CGM+bolus streams with and without dummy "Sleep" boluses
    (which have no carbs and should be invisible to the detector).
    """

    def _run(self, extra_boluses: list) -> List[RestWindow]:
        dinner = _carb_bolus(_dt(_YEAR, _MO, _DAY, 20, 0))
        breakfast = _carb_bolus(_dt(_YEAR, _MO, _DAY + 1, 9, 0))
        cgm = _cgm(_dt(_YEAR, _MO, _DAY, 22, 0),
                   _dt(_YEAR, _MO, _DAY + 1, 8, 0))
        boluses = [dinner, breakfast] + extra_boluses
        return detect_rest_windows(cgm, boluses)

    def test_sleep_events_do_not_change_output(self):
        # Simulate a 24×7 "Sleep mode" that would span all day — represented
        # as no-carb boluses throughout (the detector must ignore them).
        sleep_events = [
            _correction_bolus(_dt(_YEAR, _MO, _DAY, h, 0))
            for h in range(24)
        ]
        without_sleep = self._run([])
        with_sleep = self._run(sleep_events)
        self.assertEqual(len(without_sleep), len(with_sleep))
        if without_sleep:
            self.assertEqual(without_sleep[0].start, with_sleep[0].start)
            self.assertEqual(without_sleep[0].end, with_sleep[0].end)


if __name__ == "__main__":
    unittest.main()
