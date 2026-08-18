"""Carbs-on-board (static forward-decay COB) tests — stdlib unittest.

Mirrors tests/test_insulin.py. COB is ADR 0033: logged grams + clock, static
forward decay, exclusion-only. These tests pin the decay arithmetic, the onset
delay, the trailing-guard clearance gate, monotonicity in grams, the stream→rate
policy, and the NULL-gram drop.
"""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.carbs import (
    CARB_ONSET_DELAY_MIN,
    CARB_TRAILING_GUARD_MIN,
    FAST_CARB_RATE_G_PER_H,
    MEAL_CARB_RATE_G_PER_H,
    CarbsOnBoard,
    carb_doses,
    carb_log_exclusion_spans,
)
from ciq_autotune.events import CarbEntry

ONSET = CARB_ONSET_DELAY_MIN  # 15


def at(hh, mm):
    return datetime(2026, 6, 1, hh, mm, 0)


def dose(hh, mm, grams, rate):
    return (at(hh, mm), grams, rate)


class CarbsOnBoardAtTest(unittest.TestCase):
    def test_zero_before_first_dose(self):
        cob = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], ONSET)
        self.assertEqual(cob.at(at(11, 0)), 0.0)

    def test_full_grams_through_the_onset_delay(self):
        # Grams sit at full for the onset window, then start decaying.
        cob = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], ONSET)
        self.assertAlmostEqual(cob.at(at(12, 0)), 20.0, places=6)
        self.assertAlmostEqual(cob.at(at(12, 10)), 20.0, places=6)  # still in onset
        self.assertLess(cob.at(at(12, 30)), 20.0)                   # decaying now

    def test_linear_zero_crossing(self):
        # 20 g at 40 g/h → 0.5 h to clear, plus the 15-min onset → cleared at +45.
        cob = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], ONSET)
        self.assertAlmostEqual(cob.at(at(12, 30)), 10.0, places=6)  # halfway down
        self.assertEqual(cob.at(at(12, 45)), 0.0)
        self.assertEqual(cob.at(at(13, 0)), 0.0)                    # stays cleared

    def test_onset_delay_pushes_the_tail_later(self):
        # Same dose with no onset clears 15 min sooner.
        delayed = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], ONSET)
        prompt = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], 0.0)
        self.assertEqual(prompt.at(at(12, 30)), 0.0)      # cleared at +30
        self.assertGreater(delayed.at(at(12, 30)), 0.0)   # still on board at +30

    def test_doses_sum(self):
        cob = CarbsOnBoard([dose(12, 0, 20.0, 40.0), dose(12, 0, 10.0, 40.0)], ONSET)
        self.assertAlmostEqual(cob.at(at(12, 0)), 30.0, places=6)

    def test_ignores_nonpositive_grams_or_rate(self):
        cob = CarbsOnBoard(
            [dose(12, 0, 0.0, 40.0), dose(12, 0, 20.0, 0.0), dose(12, 0, -5.0, 40.0)],
            ONSET,
        )
        self.assertEqual(cob.at(at(12, 0)), 0.0)

    def test_empty_is_zero_everywhere(self):
        cob = CarbsOnBoard([], ONSET)
        self.assertEqual(cob.at(at(12, 0)), 0.0)


class ClearedSinceTest(unittest.TestCase):
    def test_trailing_guard_holds_after_zero_crossing(self):
        # 20 g / 40 g/h clears at +45; the gate stays closed for `guard` longer.
        cob = CarbsOnBoard([dose(12, 0, 20.0, 40.0)], ONSET)
        self.assertEqual(cob.at(at(12, 45)), 0.0)                # COB is zero...
        self.assertFalse(cob.cleared_since(at(12, 45), 45.0))    # ...but not yet cleared
        self.assertFalse(cob.cleared_since(at(13, 15), 45.0))    # +30 into the guard
        self.assertTrue(cob.cleared_since(at(13, 30), 45.0))     # 45 min clear → released

    def test_short_dose_landing_inside_the_guard_still_blocks(self):
        # A dose that both lands and clears within [t-guard, t] must still block —
        # checking only the endpoints would miss it, so clearance times are used.
        cob = CarbsOnBoard([dose(12, 30, 5.0, 40.0)], ONSET)  # clears ~12:52
        self.assertEqual(cob.at(at(13, 0)), 0.0)
        self.assertFalse(cob.cleared_since(at(13, 0), 45.0))  # landed+cleared inside guard
        self.assertTrue(cob.cleared_since(at(13, 40), 45.0))

    def test_more_grams_clears_later_never_earlier(self):
        # Monotonicity: the clearance time is non-decreasing in grams.
        t = at(12, 0)
        prev = None
        for grams in (5, 15, 30, 45, 75):
            cob = CarbsOnBoard([dose(12, 0, float(grams), 40.0)], ONSET)
            # first minute at which it has cleared for the 45-min guard
            k = 0
            while not cob.cleared_since(t + timedelta(minutes=k), 45.0):
                k += 1
            if prev is not None:
                self.assertGreaterEqual(k, prev)
            prev = k

    def test_empty_is_always_cleared(self):
        cob = CarbsOnBoard([], ONSET)
        self.assertTrue(cob.cleared_since(at(12, 0), 45.0))


class CarbDosesTest(unittest.TestCase):
    def test_carb_log_source_keys_the_rate(self):
        entries = [
            CarbEntry(t=at(1, 0), grams=30.0, certainty="estimate", source="rise-prompt"),
            CarbEntry(t=at(2, 0), grams=15.0, certainty="estimate", source="low-prompt"),
            CarbEntry(t=at(3, 0), grams=20.0, certainty="exact", source="manual"),
        ]
        rates = {t.hour: r for (t, _g, r) in carb_doses(carb_entries=entries)}
        self.assertEqual(rates[1], MEAL_CARB_RATE_G_PER_H)  # rise-prompt → meal
        self.assertEqual(rates[2], FAST_CARB_RATE_G_PER_H)  # low-prompt → fast
        self.assertEqual(rates[3], FAST_CARB_RATE_G_PER_H)  # manual → fast

    def test_null_gram_entry_is_dropped_from_the_decay(self):
        entries = [
            CarbEntry(t=at(1, 0), grams=None, certainty="unknown", source="manual"),
            CarbEntry(t=at(2, 0), grams=20.0, certainty="exact", source="manual"),
        ]
        doses = carb_doses(carb_entries=entries)
        self.assertEqual([g for (_t, g, _r) in doses], [20.0])

    def test_bolus_carbs_are_not_accepted(self):
        # Pump bolus carbs must NOT enter COB — they're masked by insulin, not
        # carb-COB (#169). The builder is Carb-log-only; the signature enforces it.
        with self.assertRaises(TypeError):
            carb_doses(bolus_events=[])  # no such parameter


class CarbLogExclusionSpansTest(unittest.TestCase):
    """carb_log_exclusion_spans mirrors fasting_steps' drop logic as intervals."""

    def _entry(self, hh, mm, grams, source="manual", certainty="exact"):
        return CarbEntry(t=at(hh, mm), grams=grams, certainty=certainty, source=source)

    def test_fast_entry_interval_matches_cob_clearance_plus_guard(self):
        # 8 g at fast rate (40 g/h): cob_clear = onset(15) + 8/40*60(12) = 27 min
        # interval end = 27 + guard(45) = 72 min after entry
        entry = self._entry(2, 0, 8.0, source="manual")
        spans = carb_log_exclusion_spans([entry])
        self.assertEqual(len(spans), 1)
        lo, hi = spans[0]
        self.assertEqual(lo, at(2, 0))
        expected_end = at(2, 0) + timedelta(minutes=CARB_ONSET_DELAY_MIN + 8.0 / FAST_CARB_RATE_G_PER_H * 60 + CARB_TRAILING_GUARD_MIN)
        self.assertEqual(hi, expected_end)

    def test_meal_entry_uses_meal_rate(self):
        # rise-prompt → meal rate (20 g/h). 30 g: cob_clear = 15 + 30/20*60 = 105 min
        entry = self._entry(3, 0, 30.0, source="rise-prompt")
        spans = carb_log_exclusion_spans([entry])
        lo, hi = spans[0]
        expected_end = at(3, 0) + timedelta(minutes=CARB_ONSET_DELAY_MIN + 30.0 / MEAL_CARB_RATE_G_PER_H * 60 + CARB_TRAILING_GUARD_MIN)
        self.assertEqual(hi, expected_end)

    def test_null_gram_entry_uses_flat_window(self):
        entry = self._entry(4, 0, None, certainty="unknown")
        spans = carb_log_exclusion_spans([entry], flat_lookback_min=300.0)
        self.assertEqual(len(spans), 1)
        lo, hi = spans[0]
        self.assertEqual(lo, at(4, 0))
        self.assertEqual(hi, at(4, 0) + timedelta(minutes=300.0))

    def test_overlapping_intervals_are_merged(self):
        # Two 8g entries 30 min apart; each exclusion is ~72 min so they overlap.
        e1 = self._entry(2, 0, 8.0)
        e2 = self._entry(2, 30, 8.0)
        spans = carb_log_exclusion_spans([e1, e2])
        self.assertEqual(len(spans), 1)
        lo, hi = spans[0]
        self.assertEqual(lo, at(2, 0))
        end2 = at(2, 30) + timedelta(minutes=CARB_ONSET_DELAY_MIN + 8.0 / FAST_CARB_RATE_G_PER_H * 60 + CARB_TRAILING_GUARD_MIN)
        self.assertEqual(hi, end2)

    def test_non_overlapping_entries_stay_separate(self):
        # Two entries far apart: each gets its own span.
        e1 = self._entry(2, 0, 8.0)
        e2 = self._entry(12, 0, 8.0)
        spans = carb_log_exclusion_spans([e1, e2])
        self.assertEqual(len(spans), 2)

    def test_zero_gram_entry_produces_no_span(self):
        # grams=0 is not in flat_carb_times (only grams is None qualifies) and
        # generates no COB, so fasting_steps does not exclude it — neither should we.
        entry = self._entry(5, 0, 0.0)
        self.assertEqual(carb_log_exclusion_spans([entry]), [])

    def test_empty_returns_empty(self):
        self.assertEqual(carb_log_exclusion_spans([]), [])
        self.assertEqual(carb_log_exclusion_spans(None), [])


if __name__ == "__main__":
    unittest.main()
