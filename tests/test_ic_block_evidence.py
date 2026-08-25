"""Public current I:C block meal-run evidence contract (#145)."""
from datetime import datetime, timedelta
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from ciq_autotune.analyzers.ic import IcConfig
from ciq_autotune.analyzers.ic_regression import analyze_ic_blocks_fuzzy
from ciq_autotune.events import BolusEvent, CgmReading
from ciq_autotune.ic_block_evidence import InconsistentIcBlockEvidence, prepare_ic_block_evidence
from ciq_autotune.store import Store


BASE = datetime(2026, 1, 1)


def _meal(day, hour, *, minute=0, carbs=60.0, insulin=12.0, bg=None):
    return BolusEvent(t=BASE + timedelta(days=day, hours=hour, minutes=minute),
                      insulin=insulin, carbs=carbs, carb_ratio=5.0,
                      completion="Completed", bg=bg)


def _blocks(events, segments=((0, 5.0),), **kwargs):
    kwargs.setdefault("config", IcConfig())
    kwargs.setdefault("observed_days", 90)
    return analyze_ic_blocks_fuzzy(events, list(segments), **kwargs)[0]


class _Store:
    def __init__(self, readings):
        self.readings = readings

    def cgm_readings(self, start=None, end=None):
        return [reading for reading in self.readings
                if (start is None or reading.t >= start)
                and (end is None or reading.t <= end)]


class IcBlockEvidenceProjectionTest(unittest.TestCase):
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
            _Store(readings), {"ic_blocks": [block]},
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
        result = prepare_ic_block_evidence(_Store([]), {"ic_blocks": [block]}).project(0)

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
        result = prepare_ic_block_evidence(_Store(readings), {"ic_blocks": [block]}).project(0)

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
        result = prepare_ic_block_evidence(_Store(readings), {"ic_blocks": [block]}).project(0)

        self.assertEqual(result["block"]["support"], 0)
        self.assertEqual(result["block"]["examined_runs"], 1)
        self.assertEqual(result["block"]["excluded_runs"], 1)
        self.assertEqual(len(result["runs"]), 1)
        self.assertFalse(result["runs"][0]["in_pool"])

    def test_missing_analyzer_evidence_is_not_an_empty_roster(self):
        with self.assertRaises(InconsistentIcBlockEvidence):
            prepare_ic_block_evidence(_Store([]), {"ic_blocks": [{"block_id": 0}]})


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
        return app, patch.object(api, "analyze", return_value=Analysis())

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


if __name__ == "__main__":
    unittest.main()
