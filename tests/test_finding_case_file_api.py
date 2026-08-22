"""Public contract smoke tests for ADR 79's server-owned preparation routes."""
from datetime import datetime, timedelta
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    from ciq_autotune.store import Store
    HAS_API = True
except ImportError:  # pragma: no cover
    HAS_API = False


def _ramp(day, hour, minute, start_bg, slope, duration):
    start = datetime(2026, 6, day, hour, minute)
    return [(start + timedelta(minutes=offset), start_bg + slope * offset)
            for offset in range(0, duration + 1, 5)]


def _low_rebound(day, *, nadir=48, rebound=189):
    start = datetime(2026, 6, day, 11, 30)

    def segment(offset, bg, slope, duration):
        return [(start + timedelta(minutes=offset + minute), bg + slope * minute)
                for minute in range(0, duration + 1, 5)]

    return (segment(0, 100, 0, 20)
            + segment(20, 100, -(100 - nadir) / 20, 20)
            + segment(40, nadir, (rebound - nadir) / 40, 40)
            + segment(80, rebound, -1.5, 60))


def _seed_events(path, cgm, bolus=()):
    with Store.open(path) as store:
        store.upsert_cgm({"EventDateTime": stamp.strftime("%Y-%m-%d %H:%M:%S"),
                          "Readings (CGM / BGM)": bg, "Description": "EGV"}
                         for stamp, bg in cgm)
        store.upsert_bolus({
            "seq_num": seq_num,
            "request_time": stamp.strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Bolus",
            "completion": "Completed",
            "insulin": insulin,
            "carbs": carbs,
        } for seq_num, stamp, insulin, carbs in bolus)


@unittest.skipUnless(HAS_API, "api extra is installed")
class FindingCaseFileRouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        with Store.open(self.tmp.name):
            pass
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False)
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close(); self.tmp.close()

    def test_preparation_has_exact_envelope_on_empty_snapshot(self):
        response = self.client.get("/diagnose/finding-case-file-preparation")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["schema"], "diagnose-finding-case-file-preparation-v1")
        self.assertRegex(payload["projection_id"], r"^fp_[0-9a-f]{32}$")
        self.assertEqual(payload["coordinates"]["source_window_days"], 30)
        self.assertEqual(payload["rendered_rows"], [])
        self.assertEqual(set(payload), {"schema", "projection_id", "coordinates",
                                       "findings", "rendered_rows",
                                       "behavioral_case_headers", "withheld_findings"})
        self.assertEqual(set(payload["findings"]), {"schema", "window", "findings_window",
                                                   "rows", "counts", "chip_counts",
                                                   "uncaused_highs"})

    def test_raw_query_failures_use_the_structured_400_envelope(self):
        for url in (
            "/diagnose/finding-case-file-preparation?start_min=1",
            "/diagnose/finding-case-file-preparation?start_min=x&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=-1&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=1.5&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=1&start_min=2&end_min=3",
            "/diagnose/finding-case-file-preparation?start_min=0&end_min=1441",
            "/diagnose/finding-case-file-preparation?unknown=1",
            "/diagnose/finding-case-file?projection_id=nope",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:not_a_lever&alignment=clock",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=sideways",
        ):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(set(response.json()), {"detail"})
            self.assertEqual(set(response.json()["detail"]), {"code", "message"})
            self.assertEqual(response.json()["detail"]["code"], "invalid_request")

    def test_unknown_retained_preparation_is_structured_stale(self):
        response = self.client.get(
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=clock"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "stale_projection")

    def test_registered_preparation_is_immediately_addressable_and_bump_invalidates(self):
        prepared = self.client.get("/diagnose/finding-case-file-preparation").json()
        url = (f"/diagnose/finding-case-file?projection_id={prepared['projection_id']}"
               "&finding_id=finding:late_bolus&alignment=clock")
        unavailable = self.client.get(url)
        self.assertEqual(unavailable.status_code, 404)
        self.assertEqual(unavailable.json()["detail"]["code"], "finding_unavailable")
        self.app.state.result_cache.bump()
        response = self.client.get(url)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "stale_projection")

    def test_identical_coordinate_concurrency_returns_one_projection_id(self):
        entered = threading.Barrier(3)
        ids = []

        def worker():
            entered.wait()
            ids.append(self.client.get(
                "/diagnose/finding-case-file-preparation?start_min=60&end_min=120"
            ).json()["projection_id"])

        first = threading.Thread(target=worker)
        second = threading.Thread(target=worker)
        first.start(); second.start(); entered.wait(); first.join(5); second.join(5)
        self.assertEqual(len(ids), 2)
        self.assertEqual(ids[0], ids[1])

    def test_bump_between_build_and_commit_retries_to_an_addressable_result(self):
        calls = []

        def bump_once():
            calls.append(1)
            if len(calls) == 1:
                self.app.state.result_cache.bump()

        self.app.state.finding_case_file_before_commit = bump_once
        try:
            response = self.client.get(
                "/diagnose/finding-case-file-preparation?start_min=120&end_min=180"
            )
        finally:
            self.app.state.finding_case_file_before_commit = None
        self.assertEqual(response.status_code, 200)
        projection_id = response.json()["projection_id"]
        case = self.client.get(
            f"/diagnose/finding-case-file?projection_id={projection_id}"
            "&finding_id=finding:late_bolus&alignment=clock"
        )
        self.assertEqual(case.status_code, 404)

    def test_two_changed_builds_return_preparation_changed(self):
        self.app.state.finding_case_file_before_commit = self.app.state.result_cache.bump
        try:
            response = self.client.get(
                "/diagnose/finding-case-file-preparation?start_min=180&end_min=240"
            )
        finally:
            self.app.state.finding_case_file_before_commit = None
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "preparation_changed")

    def test_full_leased_registry_returns_preparation_capacity(self):
        cache = self.app.state.result_cache
        for index in range(64):
            fake = SimpleNamespace(projection_id=f"fp_{index:032x}",
                                   lease_until=time.monotonic() + 60, pins=0)
            cache.get_or_build_preparation(
                ("occupied", index), lambda version, fake=fake: fake,
            )
        response = self.client.get(
            "/diagnose/finding-case-file-preparation?start_min=240&end_min=300"
        )
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"]["code"], "preparation_capacity")

    def test_bump_during_pinned_case_keeps_acquired_response_alive(self):
        entered = threading.Event()
        release = threading.Event()

        class Fake:
            projection_id = "fp_" + "a" * 32
            lease_until = time.monotonic() + 60
            pins = 0

            def case(self, finding_id, alignment, occ):
                entered.set(); release.wait(2)
                return {"schema": "diagnose-finding-case-file-v1", "ok": True}

        fake = Fake()
        cache = self.app.state.result_cache
        cache.get_or_build_preparation(("pinned",), lambda version: fake)
        responses = []

        def request_case():
            responses.append(self.client.get(
                f"/diagnose/finding-case-file?projection_id={fake.projection_id}"
                "&finding_id=finding:late_bolus&alignment=event"
            ))

        thread = threading.Thread(target=request_case)
        thread.start(); self.assertTrue(entered.wait(1)); cache.bump(); release.set(); thread.join(5)
        self.assertEqual(responses[0].status_code, 200)
        self.assertEqual(responses[0].json(), {"schema": "diagnose-finding-case-file-v1",
                                              "ok": True})
        self.assertEqual(fake.pins, 0)

    def test_internal_preparation_inconsistency_uses_structured_500(self):
        class Broken:
            projection_id = "fp_" + "b" * 32
            lease_until = time.monotonic() + 60
            pins = 0
            findings = {"rows": [{"id": "finding:late_bolus", "register": "finding",
                                    "lever": "late_bolus"}]}

            def case(self, finding_id, alignment, occ):
                raise RuntimeError("equation failed")

        cache = self.app.state.result_cache
        broken = Broken()
        cache.get_or_build_preparation(
            ("finding-case-file", None, None), lambda version: broken,
        )
        response = self.client.get("/diagnose/finding-case-file-preparation")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"]["code"], "inconsistent_projection")


@unittest.skipUnless(HAS_API, "api extra is installed")
class PopulatedFindingCaseFileRouteTest(unittest.TestCase):
    """The HTTP contract over analyzer-built, generator-owned synthetic data."""

    @classmethod
    def setUpClass(cls):
        source = (Path(__file__).resolve().parents[1]
                  / "mockups" / "revise-e2e.synthetic" / "harmonic.sqlite")
        handle, cls.path = tempfile.mkstemp(suffix=".sqlite")
        os.close(handle)
        shutil.copyfile(source, cls.path)
        cls.client = TestClient(create_app(
            db_path=cls.path, token=None, enable_fetch_loop=False,
        ))

    @classmethod
    def tearDownClass(cls):
        cls.client.close()
        os.remove(cls.path)

    def test_populated_preparation_and_selected_case_are_publicly_addressable(self):
        response = self.client.get("/diagnose/finding-case-file-preparation")
        self.assertEqual(response.status_code, 200)
        prepared = response.json()
        self.assertEqual(prepared["schema"],
                         "diagnose-finding-case-file-preparation-v1")
        self.assertEqual(
            [row["id"] for row in prepared["rendered_rows"]],
            [row["id"] for row in prepared["findings"]["rows"]],
        )
        for source, rendered in zip(
                prepared["findings"]["rows"], prepared["rendered_rows"]):
            if source.get("register") != "finding":
                self.assertEqual(rendered, source)

        case_url = (
            "/diagnose/finding-case-file"
            f"?projection_id={prepared['projection_id']}"
            "&finding_id=finding:late_bolus&alignment=event"
        )
        case_response = self.client.get(case_url)
        self.assertEqual(case_response.status_code, 200)
        case = case_response.json()
        self.assertEqual(case["schema"], "diagnose-finding-case-file-v1")
        self.assertEqual(case["summary"], {
            "claimed": 4, "denominator": 180, "noun": "meals",
        })
        self.assertEqual(sum(case["verdict_counts"].values()), 180)
        self.assertEqual(len(case["occurrences"]), 180)

        occurrence_id = case["occurrences"][0]["id"]
        selected = self.client.get(f"{case_url}&occ={occurrence_id}")
        self.assertEqual(selected.status_code, 200)
        self.assertEqual(selected.json()["selection"]["state"], "selected")
        self.assertEqual(selected.json()["selection"]["requested_id"], occurrence_id)

        unavailable = self.client.get(f"{case_url}&occ=o_{'f' * 32}")
        self.assertEqual(unavailable.status_code, 200)
        self.assertEqual(unavailable.json()["selection"], {
            "state": "unavailable", "requested_id": "o_" + "f" * 32,
            "detail": None,
        })

    def _real_case(self, lever, cgm, bolus=()):
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            _seed_events(database.name, cgm, bolus)
            with TestClient(create_app(
                    db_path=database.name, token=None, enable_fetch_loop=False)) as client:
                prepared = client.get("/diagnose/finding-case-file-preparation")
                self.assertEqual(prepared.status_code, 200)
                projection_id = prepared.json()["projection_id"]
                response = client.get(
                    "/diagnose/finding-case-file",
                    params={"projection_id": projection_id,
                            "finding_id": f"finding:{lever}",
                            "alignment": "event"},
                )
                self.assertEqual(response.status_code, 200, response.text)
                case = response.json()
                occurrence = next(
                    (row for row in case["occurrences"] if row["verdict"] == "fired"),
                    case["occurrences"][0],
                )
                selected = client.get(
                    "/diagnose/finding-case-file",
                    params={"projection_id": projection_id,
                            "finding_id": f"finding:{lever}",
                            "alignment": "event", "occ": occurrence["id"]},
                )
                self.assertEqual(selected.status_code, 200, selected.text)
                return case, selected.json()

    def _real_preparation(self, cgm, bolus=()):
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            _seed_events(database.name, cgm, bolus)
            with TestClient(create_app(
                    db_path=database.name, token=None, enable_fetch_loop=False)) as client:
                response = client.get("/diagnose/finding-case-file-preparation")
                self.assertEqual(response.status_code, 200, response.text)
                return response.json()

    def test_analyzer_built_low_correction_and_high_families_reach_http(self):
        lows = [point for day in range(1, 5) for point in _low_rebound(day)]
        low_case, _ = self._real_case("over_treated_low", lows)
        self.assertEqual(low_case["family"], "lows")
        self.assertEqual(low_case["summary"], {
            "claimed": 4, "denominator": 4, "noun": "lows",
        })

        correction_cgm = []
        corrections = []
        for day in range(1, 5):
            correction_cgm.extend(_ramp(day, 14, 0, 160, -0.8, 60))
            correction_cgm.extend(_ramp(day, 15, 5, 108, -1.2, 60))
            corrections.extend([
                (day * 10 + 1, datetime(2026, 6, day, 14, 10), 3.0, None),
                (day * 10 + 2, datetime(2026, 6, day, 14, 40), 3.0, None),
            ])
        correction_case, selected_correction = self._real_case(
            "correction_stacking", correction_cgm, corrections,
        )
        self.assertEqual(correction_case["family"], "correction_clusters")
        self.assertEqual(correction_case["summary"], {
            "claimed": 4, "denominator": 7, "noun": "correction clusters",
        })
        fired = next(row for row in correction_case["occurrences"]
                     if row["verdict"] == "fired")
        self.assertEqual(fired["anchor"]["kind"], "correction")
        self.assertEqual(
            len(selected_correction["selection"]["detail"]["source_corrections"]),
            2,
        )

        high_cgm = []
        breakfasts = []
        for day in range(1, 5):
            high_cgm.extend(_ramp(day, 15, 0, 130, 2.2, 100))
            high_cgm.extend(_ramp(day, 8, 0, 120, 0.3, 90))
            breakfasts.append(
                (100 + day, datetime(2026, 6, day, 8), 8.0, 40.0)
            )
        high_case, _ = self._real_case("missed_meal", high_cgm, breakfasts)
        self.assertEqual(high_case["family"], "highs")
        self.assertEqual(high_case["summary"]["claimed"], 4)
        self.assertEqual(high_case["summary"]["denominator"], 4)
        self.assertTrue(all(row["anchor"]["kind"] == "high"
                            for row in high_case["occurrences"]))
        self.assertTrue(all(row["anchor"]["t"].endswith("16:40:00")
                            for row in high_case["occurrences"]))
        self.assertLess(high_case["projection"]["window_min"][0], -180)

    def test_analyzer_built_near_lows_are_withheld_not_relabelled(self):
        readings = [point for day in range(1, 5)
                    for point in _low_rebound(day, nadir=72, rebound=244)]
        prepared = self._real_preparation(readings)
        self.assertNotIn(
            "finding:over_treated_low",
            [row["id"] for row in prepared["rendered_rows"]],
        )
        self.assertIn({
            "finding_id": "finding:over_treated_low",
            "code": "uninspectable_attribution",
            "message": "Canonical association is unavailable.",
        }, prepared["withheld_findings"])
