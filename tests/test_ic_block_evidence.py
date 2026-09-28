"""Public current I:C block meal-run evidence contract (#145)."""
from copy import deepcopy
from datetime import datetime, timedelta
import json
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from ciq_autotune.analyzers.ic import _CIQ_SUSPEND_TYPE, POOL_REASONS, IcConfig
from ciq_autotune.analyzers.isf import FastingEvidence
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy
from ciq_autotune.events import BasalEvent, BolusEvent, CgmReading
from ciq_autotune.harm import HarmArm, HarmConfig, PrintedLow
from ciq_autotune.ic_block_evidence import InconsistentIcBlockEvidence, prepare_ic_block_evidence
from ciq_autotune.store import Store
from scripts.gen_estimator_truth import write_set_to_store


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


def _dip(minute):
    """A low without a high: down to 60 at +150, back to 120 by +210."""
    if minute <= 90:
        return 120.0
    if minute <= 150:
        return 120.0 - (minute - 90)
    if minute <= 210:
        return 60.0 + (minute - 150)
    return 120.0


def _spike_then_dip(minute):
    """The spike, then a low of 60 at +150 inside the same meal's window."""
    if minute <= 100:
        return _spike(minute)
    if minute <= 150:
        return 120.0 - 1.2 * (minute - 100)
    if minute <= 210:
        return 60.0 + (minute - 150)
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


def _suspends(anchor, rows=12):
    """Control-IQ suspending basal from fifteen minutes after a bolus."""
    return [BasalEvent(t=anchor + timedelta(minutes=15 + 5 * step),
                       delivery_type=_CIQ_SUSPEND_TYPE, duration_mins=5,
                       basal_rate=0.0, profile_basal_rate=0.9)
            for step in range(rows)]


class IcBlockEvidenceProjectionTest(unittest.TestCase):
    def _store(self, readings=(), events=()):
        """The preparation reads a real store — its meal outcomes come off one."""
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        write_set_to_store(store, {"events": list(events),
                                   "cgm_readings": list(readings), "snapshots": []})
        return store

    def test_cross_midnight_multi_meal_roster_and_bounds_are_analyzer_owned(self):
        events = [
            item for day in range(9)
            for item in (_meal(day, 23, bg=110.0), _meal(day + 1, 1, bg=110.0))
        ]
        outcome_cgm = [
            CgmReading(event.t + timedelta(minutes=minute), 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        block = _blocks(events, ((0, 5.0), (420, 4.0), (1200, 5.0)),
                        cgm_readings=outcome_cgm, isf_effective=50.0)[0].to_dict()
        runs = block["evidence"]["runs"]
        readings = [
            CgmReading(datetime.fromisoformat(run["t"]) + timedelta(minutes=minute),
                       100 + minute, "synthetic")
            for run in runs for minute in (-10, 0, 120, 435, 440)
        ]
        result = prepare_ic_block_evidence(
            self._store(readings, events), {"ic_blocks": [block]},
        ).project(block["block_id"], analysis_generation="fixture-process:0")

        self.assertEqual(result["runs"], runs)
        self.assertEqual(result["block"]["support"], block["n_runs"])
        self.assertEqual(result["block"]["asserts_move"], block["asserts_move"])
        self.assertEqual(result["runs"][0]["member_offsets_min"], [0.0, 120.0])
        self.assertEqual(result["runs"][0]["cgm_start_min"], -10.0)
        self.assertEqual(result["runs"][0]["cgm_end_min"], 435.0)
        self.assertEqual(result["series"][0]["points"], [
            {"minute": -10.0, "bg": 90}, {"minute": 0.0, "bg": 100},
            {"minute": 120.0, "bg": 220}, {"minute": 435.0, "bg": 535},
        ])
        self.assertLessEqual(result["block"]["end_min"], result["block"]["start_min"])

    def test_below_floor_roster_is_present_while_analyzer_verdict_stays_held(self):
        block = _blocks([_meal(day, 9) for day in range(4)])[0].to_dict()
        result = prepare_ic_block_evidence(self._store(), {"ic_blocks": [block]}).project(0)

        self.assertEqual(block["state"], "below-floor")
        self.assertFalse(block["asserts_move"])
        self.assertEqual(result["runs"], block["evidence"]["runs"])
        self.assertFalse(result["block"]["asserts_move"])

    def test_directional_only_roster_member_is_explicitly_non_pool(self):
        events = ([_meal(day, 9, bg=110.0) for day in range(1, 9)]
                  + [_meal(9, 9, carbs=20.0, insulin=4.0, bg=300.0)])
        readings = [
            CgmReading(event.t + timedelta(minutes=minute),
                       40 if event.insulin == 4 else 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        block = analyze_ic_blocks_fuzzy(
            events, [(0, 5.0)], config=IcConfig(), observed_days=90,
            cgm_readings=readings, isf_effective=50.0,
        )[0][0].to_dict()
        result = prepare_ic_block_evidence(self._store(readings, events),
                                           {"ic_blocks": [block]}).project(0)

        self.assertEqual(result["runs"], block["evidence"]["runs"])
        self.assertGreater(len(result["runs"]), result["block"]["support"])
        self.assertEqual([run["in_pool"] for run in result["runs"]],
                         [run["in_pool"] for run in block["evidence"]["runs"]])
        self.assertEqual(result["block"]["effective_support"],
                         block["evidence"]["eligibility"]["effective_run_count"])
        self.assertTrue(any(run["directional_only"] and not run["in_pool"]
                            for run in result["runs"]))

    def test_an_examined_but_rejected_block_is_not_no_evidence(self):
        event = _meal(1, 9, carbs=20.0, insulin=4.0, bg=300.0)
        readings = [CgmReading(event.t + timedelta(minutes=minute), 40, "synthetic")
                    for minute in (290, 295, 300, 305, 310)]
        block = _blocks([event], cgm_readings=readings, isf_effective=50.0)[0].to_dict()
        result = prepare_ic_block_evidence(self._store(readings, [event]),
                                           {"ic_blocks": [block]}).project(0)

        self.assertEqual(result["block"]["support"], 0)
        self.assertEqual(result["block"]["examined_runs"], 1)
        self.assertEqual(result["block"]["excluded_runs"], 1)
        self.assertEqual(len(result["runs"]), 1)
        self.assertFalse(result["runs"][0]["in_pool"])

    def test_the_side_the_counted_runs_landed_on_is_copied_through(self):
        # 60 g on 15 U reads 4.0 g/U against a programmed 5.0.
        events = [_meal(day, 9, insulin=15.0, bg=110.0) for day in range(12)]
        outcome_cgm = [
            CgmReading(event.t + timedelta(minutes=minute), 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        block = _blocks(events, cgm_readings=outcome_cgm,
                        isf_effective=50.0)[0].to_dict()
        result = prepare_ic_block_evidence(
            self._store(outcome_cgm, events), {"ic_blocks": [block]}).project(0)

        channels = block["evidence"]["recurrence_channels"]
        self.assertEqual("below", channels["side_direction"])
        self.assertEqual({"side_k": channels["side_k"], "side_n": channels["side_n"],
                          "direction": "below"}, result["block"]["side"])

    def test_missing_analyzer_evidence_is_not_an_empty_roster(self):
        with self.assertRaises(InconsistentIcBlockEvidence):
            prepare_ic_block_evidence(self._store(), {"ic_blocks": [{"block_id": 0}]})

    def test_a_block_missing_any_published_fact_is_refused_not_served_with_a_hole(self):
        events = [_meal(day, 9, bg=110.0) for day in range(10)]
        block = _blocks(events, harm_config=HarmConfig(), harm_lows=[])[0].to_dict()
        prepare_ic_block_evidence(self._store(), {"ic_blocks": [block]}).project(0)

        for path in (
            ("current_values",), ("estimate", "wide"),
            ("evidence", "recurrence_channels", "side_k"),
            ("evidence", "recurrence_channels", "side_direction"),
            ("evidence", "eligibility", "whole_runs"),
            ("evidence", "eligibility", "fractional_run_ownership"),
            ("evidence", "ledger"), ("evidence", "ledger", "pooled_ratio"),
            ("evidence", "harm_evidence"),
            ("evidence", "harm_evidence", "gated"),
            ("evidence", "harm_evidence", "evaluated"),
            ("evidence", "runs", 0, "pool_reason"), ("evidence", "runs", 0, "side"),
            ("evidence", "runs", 0, "member_in_block"),
        ):
            with self.subTest(path=path):
                broken = deepcopy(block)
                holder = broken
                for key in path[:-1]:
                    holder = holder[key]
                del holder[path[-1]]
                with self.assertRaises(InconsistentIcBlockEvidence):
                    prepare_ic_block_evidence(
                        self._store(), {"ic_blocks": [broken]}).project(0)


class IcBlockMealOutcomeTest(unittest.TestCase):
    """Each block-hours meal is read plainly against the band over its own window.

    The reading is the meal's own: its highest and lowest store readings from the
    bolus to the end of the analyzer's post-meal window (#464).  Every fixture is
    analyzer output built from synthetic runs.
    """

    def _prepared(self, events, cgm, basal=(), harm_lows=None):
        store = Store.open(":memory:")
        self.addCleanup(store.close)
        write_set_to_store(store, {"events": events, "cgm_readings": cgm,
                                   "snapshots": []})
        store.upsert_basal([
            {"seq_num": index, "time": row.t.strftime("%Y-%m-%d %H:%M:%S"),
             "delivery_type": row.delivery_type, "basal_rate": row.basal_rate,
             "duration_mins": row.duration_mins,
             "profile_basal_rate": row.profile_basal_rate}
            for index, row in enumerate(basal, start=1)
        ])
        block = _blocks(events, cgm_readings=cgm, isf_effective=50.0,
                        basal_events=list(basal),
                        harm_config=HarmConfig() if harm_lows is not None else None,
                        harm_lows=harm_lows)[0].to_dict()
        return block, prepare_ic_block_evidence(store, {"ic_blocks": [block]})

    def test_each_meal_is_read_against_the_band_over_its_own_window(self):
        # Eight lone morning meals: one spikes to 300, one dips to 60, one does
        # both, one has CGM only just outside its window, and four stay flat.
        events = [_meal(day, 9) for day in range(8)]
        high, low, both, unread = events[:4]
        cgm = (_trace(high.t, _spike) + _trace(low.t, _dip)
               + _trace(both.t, _spike_then_dip))
        cgm += [reading for reading in _trace(unread.t, _flat, until=400)
                if not 0 <= (reading.t - unread.t).total_seconds() / 60 <= 315]
        cgm += [reading for event in events[4:] for reading in _trace(event.t, _flat)]
        block, prepared = self._prepared(events, cgm)
        result = prepared.project(0)

        points = block["evidence"]["points"]
        self.assertEqual([point["t"] for point in points],
                         [meal["t"] for meal in result["meals"]])
        by_t = {meal["t"]: meal for meal in result["meals"]}
        self.assertEqual(
            ["high", "low", "high-and-low", "unread"],
            [by_t[event.t.isoformat()]["outcome"] for event in (high, low, both, unread)])
        self.assertTrue(all(by_t[event.t.isoformat()]["outcome"] == "in-range"
                            for event in events[4:]))
        self.assertEqual(
            {"t": high.t.isoformat(), "run_id": high.t.isoformat(), "offset_min": 0.0,
             "peak_bg": 300.0, "peak_min": 30.0, "nadir_bg": 120.0, "nadir_min": 100.0,
             "outcome": "high"},
            by_t[high.t.isoformat()])
        self.assertEqual((60.0, 150.0), (by_t[low.t.isoformat()]["nadir_bg"],
                                         by_t[low.t.isoformat()]["nadir_min"]))
        self.assertEqual((None, None, None, None),
                         tuple(by_t[unread.t.isoformat()][key]
                               for key in ("peak_bg", "peak_min", "nadir_bg",
                                           "nadir_min")))
        self.assertEqual(
            {"above_high": 2, "below_low": 2, "both": 1, "in_range": 4, "unread": 1,
             "n": len(points)},
            result["outcomes"]["counts"])
        self.assertEqual({"low": 70.0, "high": 180.0}, result["outcomes"]["band"])

    def test_a_pooled_chain_reads_each_of_its_meals_on_its_own_window(self):
        # Eight flat lone runs, then one two-meal chain: glucose is already rising
        # into its first bolus and peaks at 300, then Control-IQ suspends under its
        # second meal until a low prints — a low the harm arm attributes to the
        # chain's first meal.  The first meal's window holds both the peak and the
        # low; the second's, starting two hours later, holds only the low.
        lone = [_meal(day, 9) for day in range(8)]
        first, second = _meal(10, 9), _meal(10, 11, carbs=50.0, insulin=10.0)
        cgm = [reading for event in lone for reading in _trace(event.t, _flat)]
        cgm += _trace(first.t, _spike_then_low, until=450)
        basal = _suspends(second.t)
        low = PrintedLow(t=first.t + timedelta(minutes=210), bg=68.0, iob_u=2.2,
                         arm=HarmArm.IC, dominant_bolus_t=first.t,
                         attribution_reason="meal-bolus")
        _block, prepared = self._prepared(lone + [first, second], cgm, basal,
                                          harm_lows=[low])
        result = prepared.project(0)

        chain = next(run for run in result["runs"]
                     if run["run_id"] == first.t.isoformat())
        self.assertEqual((2, "counted-whole"), (chain["n_meals"], chain["pool_reason"]))
        by_t = {meal["t"]: meal for meal in result["meals"]}
        self.assertEqual(
            (first.t.isoformat(), 0.0, "high-and-low", 30.0, 210.0),
            tuple(by_t[first.t.isoformat()][key]
                  for key in ("run_id", "offset_min", "outcome", "peak_min",
                              "nadir_min")))
        self.assertEqual(
            (first.t.isoformat(), 120.0, "low", 90.0),
            tuple(by_t[second.t.isoformat()][key]
                  for key in ("run_id", "offset_min", "outcome", "nadir_min")))
        self.assertEqual(
            {"above_high": 1, "below_low": 2, "both": 1, "in_range": 8, "unread": 0,
             "n": 10},
            result["outcomes"]["counts"])
        self.assertEqual([low.t.isoformat()],
                         [row["t"] for row in result["harm_evidence"]["lows"]])
        self.assertEqual(210.0, result["harm_evidence"]["minutes_after_bolus_median"])
        self.assertIn("at the end of each meal chain", result["outcomes"]["sentence"])

    def test_each_direction_and_balance_serves_its_own_sentence(self):
        # Ten runs dosed away from the programmed 5.0 make the block assert a raise
        # or a lower; five dosed at it leave the block below the floor, asserting
        # nothing. Spikes on alternate meals put more meals above the band than
        # below it; flat traces leave the two tied at zero.
        doses = {"raise": (10, 8.0), "lower": (10, 16.0), None: (5, 12.0)}
        wording = {"raise": "over-coverage", "lower": "under-coverage",
                   None: "asserts no change"}
        more_high, not_more_high = ("more often went above 180 than below 70",
                                    "did not go above 180 more often than below 70")
        served = set()
        for direction, (count, insulin) in doses.items():
            for spikes in (True, False):
                with self.subTest(direction=direction, spikes=spikes):
                    events = [_meal(day, 9, insulin=insulin) for day in range(count)]
                    cgm = [reading for day, event in enumerate(events)
                           for reading in _trace(
                               event.t, _spike if spikes and day % 2 else _flat)]
                    _block, prepared = self._prepared(events, cgm)
                    result = prepared.project(0)
                    counts = result["outcomes"]["counts"]
                    sentence = result["outcomes"]["sentence"]
                    self.assertEqual(direction is not None,
                                     result["block"]["asserts_move"])
                    self.assertEqual(spikes, counts["above_high"] > counts["below_low"])
                    self.assertIn(wording[direction], sentence)
                    self.assertIn(more_high if spikes else not_more_high, sentence)
                    self.assertNotIn(not_more_high if spikes else more_high, sentence)
                    served.add(sentence)
        self.assertEqual(6, len(served))

    def test_a_rebuilt_preparation_missing_a_served_fact_is_refused(self):
        # The preparation's facts survive as a durable sidecar; one rebuilt from an
        # older or damaged shape is refused rather than served with a hole.
        from ciq_autotune.derived_artifacts import (
            dump_ic_block_evidence, rebuild_ic_block_evidence,
        )

        events = [_meal(day, 9) for day in range(8)]
        cgm = [reading for event in events for reading in _trace(event.t, _flat)]
        _block, prepared = self._prepared(events, cgm)
        # The sidecar is stored as JSON, so the rebuild reads what JSON gives back.
        dumped = json.loads(json.dumps(dump_ic_block_evidence(prepared)))
        rebuild_ic_block_evidence(deepcopy(dumped)).project(0)

        for path in (
            ("evidence", "meals"), ("evidence", "meals", 0, "outcome"),
            ("evidence", "meals", 0, "peak_min"), ("evidence", "meals", 0, "offset_min"),
            ("evidence", "outcomes"), ("evidence", "outcomes", "band"),
            ("evidence", "outcomes", "band", "high"),
            ("evidence", "outcomes", "counts", "both"),
            ("evidence", "outcomes", "counts", "n"),
            ("evidence", "outcomes", "sentence"),
        ):
            with self.subTest(path=path):
                broken = deepcopy(dumped)
                holder = broken["blocks"][0]
                for key in path[:-1]:
                    holder = holder[key]
                del holder[path[-1]]
                with self.assertRaises(InconsistentIcBlockEvidence):
                    rebuild_ic_block_evidence(broken).project(0)


class IcBlockEvidenceEndpointTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(self.tmp.close)
        events = [
            item for day in range(9)
            for item in (_meal(day, 23, bg=110.0), _meal(day + 1, 1, bg=110.0))
        ]
        outcome_cgm = [
            CgmReading(event.t + timedelta(minutes=minute), 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        self.block = _blocks(events, ((0, 5.0), (420, 4.0), (1200, 5.0)),
                             cgm_readings=outcome_cgm, isf_effective=50.0)[0].to_dict()
        self.analysis = {"ic_blocks": [self.block]}
        with Store.open(self.tmp.name) as store:
            store.upsert_cgm([{
                "EventDateTime": (datetime.fromisoformat(run["t"])
                                  + timedelta(minutes=minute)).strftime("%Y-%m-%d %H:%M:%S"),
                "Readings (CGM / BGM)": 100 + minute, "Description": "EGV",
            } for run in self.block["evidence"]["runs"]
              for minute in (-10, 0, 120, 435)])

    def _app(self):
        from ciq_autotune import api
        app = api.create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        class Analysis:
            def to_dict(_,):
                return self.analysis

        def analysis_with_fasting_evidence(*_, **kwargs):
            kwargs["isf_fasting_evidence_sink"](FastingEvidence((), ()))
            return Analysis()

        return app, patch.object(api, "analyze", side_effect=analysis_with_fasting_evidence)

    def test_public_route_copies_roster_and_reuses_then_invalidates_its_preparation(self):
        from ciq_autotune import api

        app, products = self._app()
        client = TestClient(app)
        real = api.prepare_ic_block_evidence
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with products, patch.object(api, "prepare_ic_block_evidence", counting):
            generation = app.state.result_cache.generation
            response = client.get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": self.block["block_id"], "analysis_generation": generation,
            })
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["runs"], self.block["evidence"]["runs"])
            self.assertEqual(response.json()["block"]["support"], self.block["n_runs"])
            self.assertEqual(response.json()["runs"][0]["member_offsets_min"], [0.0, 120.0])
            self.assertEqual(response.json()["series"][0]["points"][-1]["minute"], 435.0)
            self.assertEqual(len(calls), 1)

            again = client.get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": self.block["block_id"], "analysis_generation": generation,
            })
            self.assertEqual(again.status_code, 200)
            self.assertEqual(len(calls), 1)

            write = client.post("/api/carbs", json={
                "t": "2026-06-03 10:05:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(write.status_code, 200)
            dict(app.state.recompute_roster())["ic-block-evidence-preparation"]()
            self.assertEqual(len(calls), 2)
            refreshed = client.get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": self.block["block_id"],
                "analysis_generation": app.state.result_cache.generation,
            })
            self.assertEqual(refreshed.status_code, 200)
            self.assertEqual(len(calls), 2)

    def test_public_route_keeps_directional_only_run_out_of_support(self):
        events = ([_meal(day, 9, bg=110.0) for day in range(1, 9)]
                  + [_meal(9, 9, carbs=20.0, insulin=4.0, bg=300.0)])
        readings = [
            CgmReading(event.t + timedelta(minutes=minute),
                       40 if event.insulin == 4 else 110, "synthetic")
            for event in events for minute in (290, 295, 300, 305, 310)
        ]
        self.block = analyze_ic_blocks_fuzzy(
            events, [(0, 5.0)], config=IcConfig(), observed_days=90,
            cgm_readings=readings, isf_effective=50.0,
        )[0][0].to_dict()
        self.analysis = {"ic_blocks": [self.block]}
        app, products = self._app()
        with products:
            body = TestClient(app).get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": 0, "analysis_generation": app.state.result_cache.generation,
            }).json()

        self.assertEqual(body["runs"], self.block["evidence"]["runs"])
        self.assertGreater(len(body["runs"]), body["block"]["support"])
        self.assertEqual([run["in_pool"] for run in body["runs"]],
                         [run["in_pool"] for run in self.block["evidence"]["runs"]])
        self.assertEqual(body["block"]["effective_support"],
                         self.block["evidence"]["eligibility"]["effective_run_count"])
        self.assertTrue(any(run["directional_only"] and not run["in_pool"]
                            for run in body["runs"]))

    def test_public_route_keeps_a_below_floor_block_non_stageable(self):
        self.block = _blocks([_meal(day, 9) for day in range(4)])[0].to_dict()
        self.analysis = {"ic_blocks": [self.block]}
        app, products = self._app()
        with products:
            body = TestClient(app).get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": 0, "analysis_generation": app.state.result_cache.generation,
            }).json()

        self.assertEqual(self.block["state"], "below-floor")
        self.assertFalse(self.block["asserts_move"])
        self.assertEqual(body["runs"], self.block["evidence"]["runs"])
        self.assertFalse(body["block"]["asserts_move"])

    def test_public_route_names_examined_but_excluded_runs(self):
        event = _meal(1, 9, carbs=20.0, insulin=4.0, bg=300.0)
        readings = [CgmReading(event.t + timedelta(minutes=minute), 40, "synthetic")
                    for minute in (290, 295, 300, 305, 310)]
        self.block = _blocks([event], cgm_readings=readings, isf_effective=50.0)[0].to_dict()
        self.analysis = {"ic_blocks": [self.block]}
        app, products = self._app()
        with products:
            response = TestClient(app).get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": 0, "analysis_generation": app.state.result_cache.generation,
            })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["block"], {
            "block_id": 0, "start_min": 0, "end_min": 1440, "label": "All day",
            "state": "collecting", "asserts_move": False, "support": 0,
            "effective_support": 0.0, "examined_runs": 1, "excluded_runs": 1,
            "current": 5.0,
            "estimate": {"value": None, "lo": None, "hi": None, "wide": True},
            "side": {"side_k": 0, "side_n": 0, "direction": None},
            "support_detail": {"whole_runs": 0, "fractional_run_ownership": 0.0,
                               "effective_run_count": 0.0},
        })
        self.assertEqual(len(response.json()["runs"]), 1)
        self.assertFalse(response.json()["runs"][0]["in_pool"])

    def test_public_route_carries_fractional_ownership_without_counting_runs_twice(self):
        events = [item for day in range(12) for item in (_meal(day, 11), _meal(day, 13))]
        blocks = _blocks(events, ((0, 5.0), (720, 6.0)))
        self.block = next(block.to_dict() for block in blocks if block.block_id == 0)
        self.analysis = {"ic_blocks": [self.block]}
        app, products = self._app()
        with products:
            body = TestClient(app).get("/api/diagnose/carb-ratio-block-evidence", params={
                "block_id": 0, "analysis_generation": app.state.result_cache.generation,
            }).json()

        self.assertEqual(body["runs"], self.block["evidence"]["runs"])
        self.assertNotEqual(len(body["runs"]), body["block"]["support"])
        self.assertEqual(body["block"]["effective_support"],
                         self.block["evidence"]["eligibility"]["effective_run_count"])
        self.assertTrue(all(run["ownership"] == 0.5 for run in body["runs"]))

    def test_public_route_serves_the_committed_fixtures_published_case(self):
        # The endpoint is answered over the very analyzer payload and store rows the
        # generator prepared the committed capture from, so what it serves is the
        # capture's `explained` case — the payload the browser gates read.
        from scripts.gen_ic_block_evidence_fixtures import OUT, explained_case, seed_store

        committed = json.loads(OUT.read_text())["cases"]["explained"]
        self.analysis, rows = explained_case()
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(self.tmp.close)
        with Store.open(self.tmp.name) as store:
            seed_store(store, *rows)
        app, products = self._app()
        with products:
            response = TestClient(app).get(
                "/api/diagnose/carb-ratio-block-evidence", params={
                    "block_id": committed["block"]["block_id"],
                    "analysis_generation": app.state.result_cache.generation,
                })

        self.assertEqual(200, response.status_code)
        body = response.json()
        for key in ("schema", "block", "runs", "ledger", "outcomes", "meals",
                    "harm_evidence", "series"):
            self.assertEqual(committed[key], body[key], key)
        self.assertEqual("diagnose-carb-ratio-block-evidence-v2", body["schema"])
        self.assertTrue(body["runs"])
        self.assertTrue(all(run["pool_reason"] in POOL_REASONS for run in body["runs"]))
        self.assertTrue(body["harm_evidence"]["lows"])
        self.assertEqual(len(body["meals"]), body["outcomes"]["counts"]["n"])

    def test_public_route_serves_the_v2_explainability_facts(self):
        # The same pooled spike-then-low chain as the outcome test, now answered by
        # the endpoint from a real store holding its boluses, CGM and basal.
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.addCleanup(self.tmp.close)
        lone = [_meal(day, 9) for day in range(8)]
        first, second = _meal(10, 9), _meal(10, 11, carbs=50.0, insulin=10.0)
        events = lone + [first, second]
        cgm = [reading for event in lone for reading in _trace(event.t, _flat)]
        cgm += _trace(first.t, _spike_then_low, until=450)
        basal = _suspends(second.t)
        low = PrintedLow(t=first.t + timedelta(minutes=210), bg=68.0, iob_u=2.2,
                         arm=HarmArm.IC, dominant_bolus_t=first.t,
                         attribution_reason="meal-bolus")
        with Store.open(self.tmp.name) as store:
            write_set_to_store(store, {"events": events, "cgm_readings": cgm,
                                       "snapshots": []})
            store.upsert_basal([
                {"seq_num": index, "time": row.t.strftime("%Y-%m-%d %H:%M:%S"),
                 "delivery_type": row.delivery_type, "basal_rate": row.basal_rate,
                 "duration_mins": row.duration_mins,
                 "profile_basal_rate": row.profile_basal_rate}
                for index, row in enumerate(basal, start=1)
            ])
        self.block = _blocks(events, cgm_readings=cgm, isf_effective=50.0,
                             basal_events=basal, harm_config=HarmConfig(),
                             harm_lows=[low])[0].to_dict()
        self.analysis = {"ic_blocks": [self.block]}
        app, products = self._app()
        with products:
            response = TestClient(app).get(
                "/api/diagnose/carb-ratio-block-evidence", params={
                    "block_id": 0,
                    "analysis_generation": app.state.result_cache.generation,
                })

        self.assertEqual(200, response.status_code)
        body = response.json()
        evidence = self.block["evidence"]
        self.assertEqual("diagnose-carb-ratio-block-evidence-v2", body["schema"])
        self.assertEqual([run["pool_reason"] for run in evidence["runs"]],
                         [run["pool_reason"] for run in body["runs"]])
        self.assertEqual(evidence["ledger"], body["ledger"])
        self.assertEqual(evidence["harm_evidence"], body["harm_evidence"])
        self.assertEqual([low.t.isoformat()],
                         [row["t"] for row in body["harm_evidence"]["lows"]])
        self.assertEqual(
            {"above_high": 1, "below_low": 2, "both": 1, "in_range": 8, "unread": 0,
             "n": 10},
            body["outcomes"]["counts"])
        self.assertEqual({"low": 70.0, "high": 180.0}, body["outcomes"]["band"])
        self.assertIn("at the end of each meal chain", body["outcomes"]["sentence"])
        self.assertEqual(
            [point["t"] for point in evidence["points"]],
            [meal["t"] for meal in body["meals"]])
        self.assertNotIn("meal_comparison", body)


if __name__ == "__main__":
    unittest.main()
