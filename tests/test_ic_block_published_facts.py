"""The facts a carb-ratio block publishes on its own analyzer row (#145, #464).

Every case reads the analyzer's serialized block, built from synthetic meals through
the real estimator; no fixture hand-sets a reason, an end, a weight or a verdict.
"""
from datetime import datetime, timedelta
import sys
import unittest
from unittest.mock import patch

from ciq_autotune.analyzers.ic import _CIQ_SUSPEND_TYPE, IcConfig
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow


BASE = datetime(2026, 1, 1)


def _meal(day, hour, *, minute=0, carbs=60.0, insulin=12.0, bg=None):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour, minutes=minute),
                      insulin=insulin, carbs=carbs, carb_ratio=5.0,
                      completion="Completed", bg=bg)


def _blocks(events, segments=((0, 5.0),), **kwargs):
    kwargs.setdefault("config", IcConfig())
    kwargs.setdefault("observed_days", 90)
    return analyze_ic_blocks_fuzzy(events, list(segments), **kwargs)[0]


def _trace(anchor, shape, until=330):
    """Five-minute CGM from an hour before a bolus through its post-meal read."""
    return [CgmReading(anchor + timedelta(minutes=minute), shape(minute), "EGV")
            for minute in range(-60, until + 1, 5)]


def _flat(minute):
    return 120.0


def _spike(minute):
    """Glucose already rising into the bolus — the late-bolus shape — peaking at 300."""
    if minute <= -30:
        return 120.0
    if minute <= 30:
        return 120.0 + 3.0 * (minute + 30)
    if minute <= 100:
        return 300.0 - (300.0 - 120.0) * (minute - 30) / 70.0
    return 120.0


def _spike_then_low(minute):
    """A two-meal chain from its first bolus: the spike, then a low at +210."""
    if minute <= 30:
        return _spike(minute)
    if minute <= 100:
        return 300.0 - (300.0 - 110.0) * (minute - 30) / 70.0
    if minute <= 195:
        return 110.0
    if minute <= 210:
        return 110.0 - 2.8 * (minute - 195)
    if minute <= 270:
        return 68.0 + 0.7 * (minute - 210)
    return 110.0


def _late_spike(minute):
    """Flat until +95, up to 250 at +150, and back to 120 by +210."""
    if minute <= 95:
        return 120.0
    if minute <= 150:
        return 120.0 + 130.0 * (minute - 95) / 55.0
    if minute <= 210:
        return 250.0 - 130.0 * (minute - 150) / 60.0
    return 120.0


def _suspends(anchor, rows=12):
    """Control-IQ suspending basal from fifteen minutes after a bolus."""
    return [BasalEvent(t=anchor + timedelta(minutes=15 + 5 * step),
                       delivery_type=_CIQ_SUSPEND_TYPE, duration_mins=5,
                       basal_rate=0.0, profile_basal_rate=0.9)
            for step in range(rows)]


def _outcome_cgm(events, end=110.0):
    """CGM only at each meal's full-DIA read, so a run's end is exactly ``end``."""
    return [CgmReading(event.t + timedelta(minutes=minute), end, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)]


def _low(bolus, minutes, carbs=60.0):
    """A printed low the harm layer attributed to ``bolus``, ``minutes`` after it."""
    return PrintedLow(t=bolus.t + timedelta(minutes=minutes), bg=62.0, iob_u=1.5,
                      arm=HarmArm.IC, dominant_bolus_t=bolus.t,
                      dominant_bolus_carbs=carbs, attribution_reason="meal-bolus")


def _published(events, cgm, *, segments=((0, 5.0),), harm_lows=None, basal=()):
    """Each block's serialized analyzer row, by block id."""
    blocks = _blocks(events, segments, cgm_readings=cgm, isf_effective=50.0,
                     basal_events=list(basal),
                     harm_config=HarmConfig() if harm_lows is not None else None,
                     harm_lows=harm_lows)
    return {block.block_id: block.to_dict() for block in blocks}


class IcBlockRosterTest(unittest.TestCase):
    """The run roster is the analyzer's, with its bounds and its pool membership."""

    def test_a_cross_midnight_multi_meal_run_carries_its_members_and_bounds(self):
        events = [
            item for day in range(9)
            for item in (_meal(day, 23, bg=110.0), _meal(day + 1, 1, bg=110.0))
        ]
        # The 5.0 g/U value runs 20:00 to 07:00, one block that wraps midnight.
        block = next(iter(_published(events, _outcome_cgm(events),
                                     segments=((0, 5.0), (420, 4.0), (1200, 5.0))).values()))

        run = block["evidence"]["runs"][0]
        self.assertEqual(run["member_offsets_min"], [0.0, 120.0])
        self.assertEqual((run["cgm_start_min"], run["cgm_end_min"]), (-10.0, 435.0))
        self.assertLessEqual(block["end_min"], block["start_min"])

    def test_a_directional_only_run_is_on_the_roster_and_out_of_the_pool(self):
        events = ([_meal(day, 9, bg=110.0) for day in range(1, 9)]
                  + [_meal(9, 9, carbs=20.0, insulin=4.0, bg=300.0)])
        readings = [
            CgmReading(event.t + timedelta(minutes=minute),
                       40 if event.insulin == 4 else 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        block = _published(events, readings)[0]

        runs = block["evidence"]["runs"]
        self.assertGreater(len(runs), block["n_runs"])
        self.assertTrue(any(run["directional_only"] and not run["in_pool"]
                            for run in runs))

    def test_an_examined_but_rejected_block_is_not_no_evidence(self):
        event = _meal(1, 9, carbs=20.0, insulin=4.0, bg=300.0)
        readings = [CgmReading(event.t + timedelta(minutes=minute), 40, "synthetic")
                    for minute in (290, 295, 300, 305, 310)]
        block = _published([event], readings)[0]

        evidence = block["evidence"]
        self.assertEqual((block["n_runs"], evidence["n_runs_touching"],
                          evidence["n_runs_excluded"]), (0, 1, 1))
        self.assertEqual([run["in_pool"] for run in evidence["runs"]], [False])

    def test_the_side_the_counted_runs_landed_on_is_published(self):
        # 60 g on 15 U reads 4.0 g/U against a programmed 5.0.
        events = [_meal(day, 9, insulin=15.0, bg=110.0) for day in range(12)]
        block = _published(events, _outcome_cgm(events))[0]

        channels = block["evidence"]["recurrence_channels"]
        self.assertEqual("below", channels["side_direction"])

    def test_a_run_shared_by_two_blocks_is_owned_half_by_each(self):
        events = [item for day in range(12) for item in (_meal(day, 11), _meal(day, 13))]
        block = _published(events, [], segments=((0, 5.0), (720, 6.0)))[0]

        runs = block["evidence"]["runs"]
        self.assertNotEqual(len(runs), block["n_runs"])
        self.assertTrue(all(run["ownership"] == 0.5 for run in runs))


class IcBlockPublishedFactsTest(unittest.TestCase):
    """The facts the block publishes are the analyzer's, never derived later (#464)."""

    def test_a_run_ending_exactly_the_band_from_its_start_ended_flat(self):
        # Every run starts at its bolus BG of 110 and is read at +300 min.
        ends = [120.0, 100.0, 121.0, 99.0] + [110.0] * 6
        events = [_meal(day, 9, bg=110.0) for day in range(len(ends))]
        cgm = [reading for event, end in zip(events, ends)
               for reading in _outcome_cgm([event], end)]
        evidence = _published(events, cgm)[0]["evidence"]

        runs = {run["run_id"]: run for run in evidence["runs"]}
        self.assertEqual(10.0, evidence["end_band_mgdl"])
        self.assertEqual(["flat", "flat", "higher", "lower"],
                         [runs[event.t.isoformat()]["end_class"] for event in events[:4]])
        self.assertTrue(all(run["in_pool"] for run in evidence["runs"]))
        self.assertEqual(
            {"lower": 1, "flat": 8, "higher": 1, "unread": 0, "after_later_meal": 0,
             "n": 10},
            evidence["run_ends"])

    def test_a_fallback_pool_counts_its_runs_with_no_end_as_unread(self):
        # No run has CGM at its full-DIA read, so the block pools the fallback runs:
        # each is counted, and none has an end to classify.
        events = [_meal(day, 9, bg=110.0) for day in range(10)]
        evidence = _published(events, [])[0]["evidence"]

        counted = [run for run in evidence["runs"] if run["in_pool"]]
        self.assertTrue(counted)
        self.assertTrue(all(run["end_class"] is None for run in counted))
        ends = evidence["run_ends"]
        self.assertEqual(ends["n"], ends["unread"])
        self.assertGreater(ends["unread"], 0)
        self.assertEqual(0, ends["lower"] + ends["flat"] + ends["higher"])

    def test_a_chain_whose_last_meal_is_after_the_block_end_says_so(self):
        lone = [_meal(day, 9, bg=110.0) for day in range(10)]
        chains = [item for day in range(10, 20)
                  for item in (_meal(day, 11, bg=110.0), _meal(day, 13, bg=110.0))]
        events = lone + chains
        published = _published(events, _outcome_cgm(events),
                               segments=((0, 5.0), (720, 6.0)))
        morning, afternoon = published[0]["evidence"], published[720]["evidence"]

        runs = {run["run_id"]: run for run in morning["runs"]}
        self.assertFalse(runs[lone[0].t.isoformat()]["ended_after_later_meal"])
        self.assertEqual("counted-by-share", runs[chains[0].t.isoformat()]["pool_reason"])
        self.assertTrue(runs[chains[0].t.isoformat()]["ended_after_later_meal"])
        self.assertEqual(10, morning["run_ends"]["after_later_meal"])
        # The afternoon block owns the chain's last meal, so it ended in its hours.
        self.assertFalse(next(run for run in afternoon["runs"]
                              if run["run_id"] == chains[0].t.isoformat())
                         ["ended_after_later_meal"])

    def test_each_counted_run_serves_the_weight_the_regression_gave_it(self):
        from ciq_autotune.analyzers import ic_regression

        real, fits = ic_regression._regression_estimates, []

        def spy(rows):
            # The fit's own per-run rows, keyed by run, as it hands them to the
            # estimator: (weight, 1/ratio, shares).
            fits.append({run_id.started_at.isoformat(): row for run_id, row
                         in sys._getframe(1).f_locals["row_by_run"].items()})
            return real(rows)

        lone = [_meal(day, 9, carbs=40.0 + 2 * day, insulin=(40.0 + 2 * day) / 5,
                      bg=110.0) for day in range(10)]
        chains = [item for day in range(10, 20)
                  for item in (_meal(day, 11, carbs=30.0 + day, insulin=6.0, bg=110.0),
                               _meal(day, 13, carbs=50.0, insulin=9.0, bg=110.0))]
        gap = _meal(30, 9, carbs=55.0, insulin=11.0, bg=110.0)
        events = lone + chains + [gap]
        with patch.object(ic_regression, "_regression_estimates", spy):
            published = _published(events, _outcome_cgm(lone + chains),
                                   segments=((0, 5.0), (720, 6.0)))

        # The first estimate call is the full fit.
        fit_rows = fits[0]
        counted = set()
        for block_id in (0, 720):
            for run in published[block_id]["evidence"]["runs"]:
                if not run["in_pool"]:
                    self.assertIsNone(run["fit_weight"], run["run_id"])
                    continue
                # A chained run is one row of the fit, so both blocks serve its weight.
                counted.add(run["run_id"])
                self.assertEqual(fit_rows[run["run_id"]][0], run["fit_weight"],
                                 (block_id, run["run_id"]))
        self.assertIn(gap.t.isoformat(),
                      {run["run_id"] for run in published[0]["evidence"]["runs"]})
        self.assertEqual(set(fit_rows), counted)

    def test_the_next_bolus_skips_one_under_thirty_minutes_later(self):
        # A lone flat morning run per day, then one chain: a bolus topped up twenty
        # minutes later, and a third bolus ninety minutes after the first.
        lone = [_meal(day, 9) for day in range(8)]
        first = _meal(10, 9)
        topped = _meal(10, 9, minute=20, carbs=20.0, insulin=4.0)
        later = _meal(10, 10, minute=30, carbs=40.0, insulin=8.0)
        cgm = [reading for event in lone for reading in _trace(event.t, _flat)]
        cgm += _trace(first.t, _late_spike, until=450)
        evidence = _published(lone + [first, topped, later], cgm)[0]["evidence"]

        chain = next(run for run in evidence["runs"]
                     if run["run_id"] == first.t.isoformat())
        self.assertEqual((3, True), (chain["n_meals"], chain["in_pool"]))
        by_t = {point["t"]: point for point in evidence["points"]}
        self.assertEqual([90.0, 70.0, None],
                         [by_t[event.t.isoformat()]["next_bolus_min"]
                          for event in (first, topped, later)])
        self.assertTrue(all(point["on_counted_run"] for point in evidence["points"]))

    def test_a_pooled_chain_that_prints_a_low_lists_it_on_its_counted_run(self):
        # Eight flat lone runs, then one two-meal chain: glucose is already rising
        # into its first bolus and peaks at 300, then Control-IQ suspends under its
        # second meal until a low prints — a low the harm arm attributes to the
        # chain's first meal.
        lone = [_meal(day, 9) for day in range(8)]
        first, second = _meal(10, 9), _meal(10, 11, carbs=50.0, insulin=10.0)
        cgm = [reading for event in lone for reading in _trace(event.t, _flat)]
        cgm += _trace(first.t, _spike_then_low, until=450)
        low = PrintedLow(t=first.t + timedelta(minutes=210), bg=68.0, iob_u=2.2,
                         arm=HarmArm.IC, dominant_bolus_t=first.t,
                         attribution_reason="meal-bolus")
        evidence = _published(lone + [first, second], cgm, harm_lows=[low],
                              basal=_suspends(second.t))[0]["evidence"]

        chain = next(run for run in evidence["runs"]
                     if run["run_id"] == first.t.isoformat())
        self.assertEqual((2, "counted-whole"), (chain["n_meals"], chain["pool_reason"]))
        harm = evidence["harm_evidence"]
        self.assertEqual([(low.t.isoformat(), "counted-run")],
                         [(row["t"], row["group"]) for row in harm["lows"]])
        self.assertEqual(210.0, harm["minutes_after_bolus_median"])
        self.assertEqual(1, harm["groups"]["total"])

    def test_each_low_names_the_group_of_the_run_its_bolus_belongs_to(self):
        # The day-12 run has no outcome read, so the fit leaves it uncounted.
        counted = [_meal(day, 9, bg=110.0) for day in range(10)]
        uncounted = _meal(12, 9, bg=110.0)
        correction = BolusEvent(t=BASE + timedelta(days=14, hours=9), insulin=2.0,
                                carbs=0.0, carb_ratio=5.0, completion="Completed")
        lows = [_low(counted[0], 150), _low(counted[0], 200), _low(uncounted, 120),
                _low(correction, 90, carbs=0.0)]
        block = _published(counted + [uncounted, correction],
                           _outcome_cgm(counted), harm_lows=lows)[0]

        runs = {run["run_id"]: run for run in block["evidence"]["runs"]}
        self.assertFalse(runs[uncounted.t.isoformat()]["in_pool"])
        self.assertNotIn(correction.t.isoformat(), runs)
        harm = block["evidence"]["harm_evidence"]
        self.assertEqual(
            [("counted-run", counted[0].t.isoformat(), 150.0, 60.0),
             ("counted-run", counted[0].t.isoformat(), 200.0, 60.0),
             ("uncounted-run", uncounted.t.isoformat(), 120.0, 60.0),
             ("not-a-meal-run", None, 90.0, 0.0)],
            [(low["group"], low["run_id"], low["minutes_after_bolus"], low["bolus_carbs"])
             for low in harm["lows"]])
        self.assertEqual({"counted_run": 2, "counted_runs_distinct": 1,
                          "uncounted_run": 1, "not_a_meal_run": 1, "total": 4},
                         harm["groups"])
        self.assertEqual(len(harm["lows"]), harm["groups"]["total"])
        self.assertEqual((90.0, 200.0), (harm["minutes_after_bolus_min"],
                                         harm["minutes_after_bolus_max"]))
        # This block asserts no move, so the lows have nothing to bear on.
        self.assertFalse(block["asserts_move"])
        self.assertIsNone(harm["bearing_sentence"])

    def test_a_raise_blocks_counted_run_low_bears_the_same_way(self):
        # 60 g on 8 U reads 7.5 g/U against a programmed 5.0: a raise.
        events = [_meal(day, 9, insulin=8.0) for day in range(10)]
        cgm = [reading for event in events for reading in _trace(event.t, _flat)]
        with_low = _published(events, cgm, harm_lows=[_low(events[0], 150)])[0]
        without = _published(events, cgm, harm_lows=[])[0]

        self.assertEqual((True, [5.0], 6.0),
                         (with_low["asserts_move"], with_low["current_values"],
                          with_low["evidence"]["recommendation"]["value"]))
        self.assertEqual(
            "The 1 low on a counted run points toward less insulin, the same way as "
            "the suggestion.", with_low["evidence"]["harm_evidence"]["bearing_sentence"])
        self.assertIsNone(without["evidence"]["harm_evidence"]["bearing_sentence"])

    def test_only_a_block_that_asserts_a_move_serves_a_recommendation(self):
        # Twelve runs of 60 g against a programmed 5.0 g/U.  11 U, 8 U and 16 U read
        # 5.45, 7.50 and 3.75 g/U: two raises and a lower.  12 U reads the programmed
        # value itself; alternating 9 U and 14 U read a band that holds 5.0 while
        # its half-gap value is 5.1.  Both of those are numeric and assert no move,
        # so they serve no value, no rule sentence and no direction — while the
        # analyzer's own recommended value stays exactly what it was.
        cases = {
            "raise": ((11.0,), 5.2, 5.2, "raise",
                      "Recommended 5.20 is half the gap from the programmed 5.00 toward "
                      "the 5.45 estimate, rounded to the pump's 0.1 g/U step."),
            "capped raise": ((8.0,), 6.0, 6.0, "raise",
                             "Recommended 6.00 is half the gap from the programmed 5.00 "
                             "toward the 7.50 estimate, capped at 20 % of the programmed "
                             "value, rounded to the pump's 0.1 g/U step."),
            "lower": ((16.0,), 4.4, 4.4, "lower",
                      "Recommended 4.40 is half the gap from the programmed 5.00 toward "
                      "the 3.75 estimate, rounded to the pump's 0.1 g/U step."),
            "at the programmed value": ((12.0,), 5.0, None, None, None),
            "band holds the programmed value": ((9.0, 14.0), 5.1, None, None, None),
        }
        for name, (doses, recommended, value, direction, sentence) in cases.items():
            with self.subTest(name):
                events = [_meal(day, 9, insulin=doses[day % len(doses)])
                          for day in range(12)]
                cgm = [reading for event in events for reading in _trace(event.t, _flat)]
                block = _published(events, cgm)[0]
                self.assertEqual(recommended, block["recommended"])
                self.assertEqual(("numeric", direction is not None),
                                 (block["state"], block["asserts_move"]))
                self.assertEqual(
                    {"value": value, "rule": "half-gap-capped-rounded",
                     "sentence": sentence},
                    block["evidence"]["recommendation"])
                self.assertEqual(direction, block["direction"])

    def test_each_run_serves_its_post_correction_total(self):
        # Ten lone meals; the first three take a 1.5 U correction ninety minutes in.
        meals = [_meal(day, 9) for day in range(10)]
        corrections = [BolusEvent(t=meal.t + timedelta(minutes=90), insulin=1.5,
                                  carbs=0.0, carb_ratio=5.0, completion="Completed")
                       for meal in meals[:3]]
        cgm = [reading for meal in meals for reading in _trace(meal.t, _flat)]
        evidence = _published(meals + corrections, cgm)[0]["evidence"]

        runs = {run["run_id"]: run for run in evidence["runs"]}
        self.assertEqual([1.5] * 3 + [0.0] * 7,
                         [runs[meal.t.isoformat()]["post_correction_total"]
                          for meal in meals])
        for run in evidence["runs"]:
            self.assertAlmostEqual(
                run["post_correction_user"] + run["post_correction_ciq"]
                + run["post_correction_unknown"], run["post_correction_total"],
                msg=run["run_id"])


if __name__ == "__main__":
    unittest.main()
