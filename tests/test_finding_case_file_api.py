"""Public contract smoke tests for ADR 79's server-owned preparation routes."""
from datetime import datetime, timedelta
import os
from pathlib import Path
from runpy import run_path
import shutil
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    from ciq_autotune.settings import (
        ProfileSegment, ProfileSettings, PumpSettings,
    )
    from ciq_autotune.store import Store
    HAS_API = True
except ImportError:  # pragma: no cover
    HAS_API = False


def _ramp(day, hour, minute, start_bg, slope, duration):
    start = datetime(2026, 6, day, hour, minute)
    return [(start + timedelta(minutes=offset), start_bg + slope * offset)
            for offset in range(0, duration + 1, 5)]


def _low_rebound(day, *, nadir=48, rebound=189, hour=11, minute=30):
    start = datetime(2026, 6, day, hour, minute)

    def segment(offset, bg, slope, duration):
        return [(start + timedelta(minutes=offset + minute), bg + slope * minute)
                for minute in range(0, duration + 1, 5)]

    return (segment(0, 100, 0, 20)
            + segment(20, 100, -(100 - nadir) / 20, 20)
            + segment(40, nadir, (rebound - nadir) / 40, 40)
            + segment(80, rebound, -1.5, 60))


def _trace(day, points):
    result = []
    for (hour1, minute1, bg1), (hour2, minute2, bg2) in zip(points, points[1:]):
        start = datetime(2026, 6, day, hour1, minute1)
        end = datetime(2026, 6, day, hour2, minute2)
        steps = int((end - start).total_seconds() // 300)
        result.extend(
            (start + timedelta(minutes=5 * index),
             bg1 + (bg2 - bg1) * index / steps)
            for index in range(steps)
        )
    hour, minute, bg = points[-1]
    result.append((datetime(2026, 6, day, hour, minute), bg))
    return result


def _seed_events(path, cgm, bolus=(), basal=()):
    with Store.open(path) as store:
        store.upsert_settings_snapshot(
            "2026-05-31 00:00:00",
            PumpSettings(1, (ProfileSettings(
                1, "Synthetic", 300, True, 15.0,
                (ProfileSegment(0, 1.0, 40, 10.0, 110),),
            ),)),
        )
        store.upsert_cgm({"EventDateTime": stamp.strftime("%Y-%m-%d %H:%M:%S"),
                          "Readings (CGM / BGM)": bg, "Description": "EGV"}
                         for stamp, bg in cgm)
        def bolus_rows():
            for row in bolus:
                seq_num, stamp, insulin, carbs, *metadata = row
                result = {
                    "seq_num": seq_num,
                    "request_time": stamp.strftime("%Y-%m-%d %H:%M:%S"),
                    "description": "Bolus",
                    "completion": "Completed",
                    "insulin": insulin,
                    "carbs": carbs,
                }
                if metadata:
                    result.update(metadata[0])
                yield result

        store.upsert_bolus(bolus_rows())
        store.upsert_basal({
            "seq_num": seq_num,
            "time": stamp.strftime("%Y-%m-%d %H:%M:%S"),
            "delivery_type": delivery_type,
            "basal_rate": basal_rate,
            "profile_basal_rate": profile_rate,
        } for seq_num, stamp, delivery_type, basal_rate, profile_rate in basal)


@unittest.skipUnless(HAS_API, "api extra is installed")
class FindingCaseFileRouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        with Store.open(self.tmp.name):
            pass
        self.app = create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="case-http",
        )
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
        self.assertEqual(set(payload["findings"]), {
            "schema", "analysis_generation", "window", "findings_window", "rows",
            "selection", "counts", "chip_counts", "uncaused_highs",
        })
        self.assertEqual(payload["findings"]["analysis_generation"], "case-http:0")
        self.assertIsNone(payload["findings"]["selection"])

    def test_preparation_forwards_history_selection_and_generation(self):
        sentinel = {
            "id": "ich1_selected", "disposition": "out_of_scope",
            "message": "Past-setting evidence is outside the selected window.",
        }

        class Projection:
            _scenarios = {}

            def project(self, query, selected_id=None, *, analysis_generation):
                self.arguments = (query, selected_id, analysis_generation)
                return {
                    "schema": "diagnose-findings-v2",
                    "analysis_generation": analysis_generation,
                    "window": query.to_dict(),
                    "findings_window": {"days": 30, "start": None, "end": None},
                    "rows": [{"id": "history:sentinel", "register": "history"}],
                    "selection": sentinel,
                    "counts": {"assert": 0, "held": 0, "blind": 0,
                               "finding": 0, "history": 1},
                    "chip_counts": {"highs": 0, "lows": 0, "meals": 1,
                                    "corrections": 0},
                    "uncaused_highs": {"count": 0, "text": "None"},
                }

        projection = Projection()
        with patch(
            "ciq_autotune.finding_case_file.findings_projection.prepare_findings_projection",
            return_value=projection,
        ):
            response = self.client.get(
                "/diagnose/finding-case-file-preparation",
                params={"start_min": 0, "end_min": 300,
                        "selected_id": "ich1_selected"},
            )

        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(projection.arguments[1:], ("ich1_selected", "case-http:0"))
        self.assertEqual(payload["findings"]["selection"], sentinel)
        self.assertEqual(payload["findings"]["rows"], payload["rendered_rows"])

    def test_raw_query_failures_use_the_structured_400_envelope(self):
        for url in (
            "/diagnose/finding-case-file-preparation?start_min=1",
            "/diagnose/finding-case-file-preparation?start_min=x&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=-1&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=1.5&end_min=2",
            "/diagnose/finding-case-file-preparation?start_min=1&start_min=2&end_min=3",
            "/diagnose/finding-case-file-preparation?start_min=1&end_min=2&end_min=3",
            "/diagnose/finding-case-file-preparation?start_min=0&end_min=1441",
            "/diagnose/finding-case-file-preparation?unknown=1",
            "/diagnose/finding-case-file?projection_id=nope",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:not_a_lever&alignment=clock",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=sideways",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=clock&occ=o_00000000000000000000000000000000"
            "&occ=o_11111111111111111111111111111111",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=clock&unknown=1",
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&projection_id=fp_11111111111111111111111111111111"
            "&finding_id=finding:late_bolus&alignment=clock",
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

    def test_unregistered_pre_bump_snapshot_never_becomes_addressable(self):
        calls = []

        def bump_once():
            calls.append(1)
            if len(calls) == 1:
                self.app.state.result_cache.bump()

        identities = [SimpleNamespace(hex="a" * 32), SimpleNamespace(hex="b" * 32)]
        self.app.state.finding_case_file_before_commit = bump_once
        try:
            with patch("ciq_autotune.finding_case_file.uuid.uuid4",
                       side_effect=identities):
                response = self.client.get(
                    "/diagnose/finding-case-file-preparation?start_min=300&end_min=360"
                )
        finally:
            self.app.state.finding_case_file_before_commit = None

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["projection_id"], "fp_" + "b" * 32)
        old = self.client.get(
            f"/diagnose/finding-case-file?projection_id=fp_{'a' * 32}"
            "&finding_id=finding:late_bolus&alignment=clock"
        )
        self.assertEqual(old.status_code, 409)
        self.assertEqual(old.json(), {
            "detail": {"code": "stale_projection",
                       "message": "Preparation is unavailable."},
        })

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
            ("finding-case-file", None, None, None), lambda version: broken,
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

    def assert_window_tree(self, window):
        self.assertEqual(set(window), {"scoped", "start_min", "end_min", "label"})

    def test_five_real_over_treated_low_states_reconcile_through_all_public_routes(self):
        """One invented typed population reaches Findings and the canonical case file.

        The generator's helper is the exact scenario/model-view/exposure input used by
        the committed Findings fixture.  This route test deliberately seeds those
        CGM/bolus rows into SQLite, rather than substituting a prepared projection.
        """
        generator = run_path(str(
            Path(__file__).resolve().parents[1]
            / "scripts" / "gen_findings_projection_fixtures.py"
        ))
        cgm, bolus = generator["_over_treated_fixture_events"]()
        self.assertEqual(
            generator["_real_over_treated_low_occurrences"]()["outranked"]["cause_lever"],
            "correction_on_iob",
        )
        bolus_rows = [
            (row.seq_num, row.t, row.insulin, row.carbs,
             {"carb_ratio": row.carb_ratio} if row.carb_ratio is not None else {})
            for row in bolus
        ]
        expected = {"fired", "near_miss", "clean", "outranked", "no_data"}

        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            _seed_events(database.name, [(row.t, row.bg) for row in cgm], bolus_rows)
            with TestClient(create_app(
                    db_path=database.name, token=None, enable_fetch_loop=False)) as client:
                findings_response = client.get("/diagnose/findings")
                self.assertEqual(findings_response.status_code, 200)
                finding = next(
                    row for row in findings_response.json()["rows"]
                    if row.get("lever") == "over_treated_low"
                )
                self.assertEqual(set(finding["verdict_counts"]), expected)
                self.assertTrue(all(finding["verdict_counts"][state] for state in expected))
                self.assertEqual(sum(finding["verdict_counts"].values()),
                                 len(finding["evidence"]))

                preparation_response = client.get("/diagnose/finding-case-file-preparation")
                self.assertEqual(preparation_response.status_code, 200)
                preparation = preparation_response.json()
                prepared_finding = next(
                    row for row in preparation["findings"]["rows"]
                    if row.get("lever") == "over_treated_low"
                )
                self.assertEqual(prepared_finding["evidence"], finding["evidence"])
                self.assertEqual(prepared_finding["verdict_counts"], finding["verdict_counts"])

                case_response = client.get("/diagnose/finding-case-file", params={
                    "projection_id": preparation["projection_id"],
                    "finding_id": "finding:over_treated_low", "alignment": "event",
                })
                self.assertEqual(case_response.status_code, 200)
                case = case_response.json()
                self.assertEqual(set(case["verdict_counts"]), expected)
                self.assertTrue(all(case["verdict_counts"][state] for state in expected))
                self.assertEqual(sum(case["verdict_counts"].values()),
                                 len(case["occurrences"]))
                self.assertEqual(case["summary"]["denominator"], len(case["occurrences"]))
                cohort_ids = {
                    occurrence_id
                    for cohort in case["projection"]["cohorts"]
                    for occurrence_id in cohort["occurrence_ids"]
                }
                self.assertEqual(cohort_ids, {row["id"] for row in case["occurrences"]})
                self.assertEqual(
                    {
                        cohort["key"]: set(cohort["occurrence_ids"])
                        for cohort in case["projection"]["cohorts"]
                    },
                    {
                        state: {row["id"] for row in case["occurrences"]
                                if row["verdict"] == state}
                        for state in expected
                    },
                )

                selected_id = next(row["id"] for row in case["occurrences"]
                                   if row["verdict"] == "outranked")
                selected_response = client.get("/diagnose/finding-case-file", params={
                    "projection_id": preparation["projection_id"],
                    "finding_id": "finding:over_treated_low", "alignment": "event",
                    "occ": selected_id,
                })
                self.assertEqual(selected_response.status_code, 200)
                self.assertEqual(selected_response.json()["selection"], {
                    "state": "selected", "requested_id": selected_id,
                    "detail": selected_response.json()["selection"]["detail"],
                })

    def assert_preparation_tree(self, prepared):
        self.assertEqual(set(prepared), {
            "schema", "projection_id", "coordinates", "findings", "rendered_rows",
            "behavioral_case_headers", "withheld_findings",
        })
        self.assertEqual(set(prepared["coordinates"]), {"source_window_days", "window"})
        self.assert_window_tree(prepared["coordinates"]["window"])
        findings = prepared["findings"]
        self.assertEqual(set(findings), {
            "schema", "analysis_generation", "window", "findings_window", "rows",
            "selection", "counts", "chip_counts", "uncaused_highs",
        })
        self.assert_window_tree(findings["window"])
        self.assertEqual(set(findings["findings_window"]), {"days", "start", "end"})
        self.assertEqual(set(findings["counts"]), {
            "assert", "held", "blind", "finding", "history",
        })
        self.assertEqual(set(findings["chip_counts"]), {
            "highs", "lows", "meals", "corrections",
        })
        self.assertEqual(set(findings["uncaused_highs"]), {"count", "text"})
        for header in prepared["behavioral_case_headers"].values():
            self.assertEqual(set(header), {
                "finding_id", "lever", "title", "family", "summary",
                "event_chart", "verdict_counts", "inspectability",
            })
            self.assertEqual(header["event_chart"], {
                "view": header["family"], "factor": header["lever"],
            })
            self.assertEqual(set(header["summary"]), {"claimed", "denominator", "noun"})
            self.assertEqual(set(header["verdict_counts"]), {
                "fired", "outranked", "near_miss", "no_data", "clean",
            })
        for withheld in prepared["withheld_findings"]:
            self.assertEqual(set(withheld), {"finding_id", "code", "message"})

    def assert_case_tree(self, case):
        self.assertEqual(set(case), {
            "schema", "projection_id", "finding", "window", "family", "summary",
            "verdict_counts", "occurrences", "projection", "selection",
        })
        self.assertEqual(set(case["finding"]), {"id", "lever", "title"})
        self.assert_window_tree(case["window"])
        self.assertEqual(set(case["summary"]), {"claimed", "denominator", "noun"})
        self.assertEqual(set(case["verdict_counts"]), {
            "fired", "outranked", "near_miss", "no_data", "clean",
        })
        for occurrence in case["occurrences"]:
            self.assertEqual(set(occurrence), {"id", "date", "anchor", "verdict"})
            self.assertEqual(set(occurrence["anchor"]), {"t", "kind", "label", "bg"})
        projection = case["projection"]
        self.assertEqual(set(projection), {
            "alignment", "anchor", "window_min", "cohorts", "clock",
        })
        if projection["alignment"] == "event":
            self.assertEqual(set(projection["anchor"]), {"kind", "label"})
            for cohort in projection["cohorts"]:
                self.assertEqual(set(cohort), {
                    "key", "routed_count", "usable_count", "support",
                    "occurrence_ids", "points",
                })
                for point in cohort["points"]:
                    self.assertEqual(set(point), {
                        "minute", "n", "support", "median", "p25", "p75",
                    })
        else:
            self.assertEqual(set(projection["clock"]), {
                "bucket_hours", "total", "peak_bucket_index", "buckets",
            })
            for bucket in projection["clock"]["buckets"]:
                self.assertEqual(set(bucket), {
                    "start_min", "end_min", "n", "occurrence_ids",
                })
        selection = case["selection"]
        self.assertEqual(set(selection), {"state", "requested_id", "detail"})
        detail = selection["detail"]
        if detail is not None:
            self.assertEqual(set(detail), {
                "id", "date", "anchor", "verdict", "glucose", "markers",
                "source_corrections", "day_target",
            })
            self.assertEqual(set(detail["anchor"]), {"t", "kind", "label", "bg"})
            self.assertTrue(all(set(point) == {"t", "minute", "bg"}
                                for point in detail["glucose"]))
            self.assertTrue(all(set(row) == {"seq_num", "t", "insulin"}
                                for row in detail["source_corrections"]))
            self.assertEqual(set(detail["day_target"]), {"date"})
            marker_fields = {
                "bolus": {"kind", "t", "minute", "seq_num", "insulin", "carbs"},
                "rescue_carb": {"kind", "t", "minute", "grams", "certainty"},
                "suspend": {"kind", "t", "minute", "delivery_type", "basal_rate",
                            "profile_basal_rate"},
            }
            for marker in detail["markers"]:
                self.assertEqual(set(marker), marker_fields[marker["kind"]])

    def test_populated_preparation_and_selected_case_are_publicly_addressable(self):
        response = self.client.get("/diagnose/finding-case-file-preparation")
        self.assertEqual(response.status_code, 200)
        prepared = response.json()
        self.assert_preparation_tree(prepared)
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
        self.assert_case_tree(case)
        self.assertEqual(case["schema"], "diagnose-finding-case-file-v1")
        self.assertEqual(case["summary"], {
            "claimed": 2, "denominator": 180, "noun": "meals",
        })
        self.assertEqual(sum(case["verdict_counts"].values()), 180)
        self.assertEqual(len(case["occurrences"]), 180)

        occurrence_id = case["occurrences"][0]["id"]
        selected = self.client.get(f"{case_url}&occ={occurrence_id}")
        self.assertEqual(selected.status_code, 200)
        self.assert_case_tree(selected.json())
        self.assertEqual(selected.json()["selection"]["state"], "selected")
        self.assertEqual(selected.json()["selection"]["requested_id"], occurrence_id)

        unavailable = self.client.get(f"{case_url}&occ=o_{'f' * 32}")
        self.assertEqual(unavailable.status_code, 200)
        self.assert_case_tree(unavailable.json())
        self.assertEqual(unavailable.json()["selection"], {
            "state": "unavailable", "requested_id": "o_" + "f" * 32,
            "detail": None,
        })

        clock = self.client.get(case_url.replace("alignment=event", "alignment=clock"))
        self.assertEqual(clock.status_code, 200)
        self.assert_case_tree(clock.json())

    def _real_case(
        self, lever, cgm, bolus=(), basal=(), *, query=None,
        selected_verdict="fired", select_claimed=False,
    ):
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            _seed_events(database.name, cgm, bolus, basal)
            with TestClient(create_app(
                    db_path=database.name, token=None, enable_fetch_loop=False)) as client:
                prepared = client.get(
                    "/diagnose/finding-case-file-preparation", params=query or {},
                )
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
                if select_claimed:
                    clock = client.get(
                        "/diagnose/finding-case-file",
                        params={"projection_id": projection_id,
                                "finding_id": f"finding:{lever}",
                                "alignment": "clock"},
                    )
                    self.assertEqual(clock.status_code, 200, clock.text)
                    claimed = {
                        occurrence_id
                        for bucket in clock.json()["projection"]["clock"]["buckets"]
                        for occurrence_id in bucket["occurrence_ids"]
                    }
                    occurrence = next(row for row in case["occurrences"]
                                      if row["id"] in claimed)
                else:
                    occurrence = next(
                        (row for row in case["occurrences"]
                         if row["verdict"] == selected_verdict),
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

    def _real_preparation(self, cgm, bolus=(), basal=(), *, query=None):
        with tempfile.NamedTemporaryFile(suffix=".sqlite") as database:
            _seed_events(database.name, cgm, bolus, basal)
            with TestClient(create_app(
                    db_path=database.name, token=None, enable_fetch_loop=False)) as client:
                response = client.get(
                    "/diagnose/finding-case-file-preparation", params=query or {},
                )
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
        recovery_basal = [
            (9001, datetime(2026, 6, 2, 13, 10), "suspended", 0.0, 0.9),
        ]
        far_case, far_selected = self._real_case(
            "correction_stacking", correction_cgm, corrections, recovery_basal,
            selected_verdict="clean",
        )
        sources = far_selected["selection"]["detail"]["source_corrections"]
        source_times = [datetime.strptime(row["t"], "%Y-%m-%d %H:%M:%S")
                        for row in sources]
        self.assertGreater((source_times[1] - source_times[0]).total_seconds(), 20 * 3600)
        self.assertEqual(far_case["projection"]["window_min"], [-90, 240])
        self.assertNotIn(
            sources[0]["seq_num"],
            [marker.get("seq_num") for marker
             in far_selected["selection"]["detail"]["markers"]],
        )
        self.assertTrue(any(
            marker["kind"] == "suspend"
            for marker in far_selected["selection"]["detail"]["markers"]
        ))

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
        self.assertEqual(high_case["projection"]["window_min"], [-195, 0])

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

    def test_remaining_four_levers_reach_http_from_real_analyzer_output(self):
        undercount_cgm = []
        undercount_bolus = []
        for day in range(1, 5):
            undercount_cgm.extend(_ramp(day, 6, 0, 145, 0, 30))
            undercount_cgm.extend(_ramp(day, 8, 0, 145, 3.6, 60))
            undercount_cgm.extend(_ramp(day, 9, 0, 361, -3.6, 60))
            undercount_bolus.append((
                200 + day, datetime(2026, 6, day, 8), 6.0, 30.0,
                {"carb_ratio": 5.0, "isf": 40.0, "target_bg": 110.0},
            ))
        undercount, _ = self._real_case(
            "carb_undercount", undercount_cgm, undercount_bolus,
        )
        self.assertEqual(undercount["summary"]["claimed"], 4)

        delivery_cgm = []
        delivery_bolus = []
        delivery_basal = []
        for day in range(1, 5):
            delivery_cgm.extend(_ramp(day, 11, 30, 110, 0, 105))
            delivery_cgm.append((datetime(2026, 6, day, 13, 15), 68))
            delivery_bolus.append((
                300 + day, datetime(2026, 6, day, 11, 45), 5.0, 50.0,
                {"carb_ratio": 10.0},
            ))
            delivery_basal.extend(
                (3000 + day * 20 + index,
                 datetime(2026, 6, day, 12) + timedelta(minutes=5 * index),
                 "suspended", 0.0, 0.9)
                for index in range(12)
            )
        delivery, _ = self._real_case(
            "meal_over_delivery", delivery_cgm, delivery_bolus, delivery_basal,
        )
        self.assertEqual(delivery["summary"]["claimed"], 4)

        active_iob_cgm = []
        active_iob_bolus = []
        for day in range(1, 5):
            active_iob_cgm.extend(_ramp(day, 18, 40, 120, 0, 20))
            active_iob_cgm.extend(_ramp(day, 19, 0, 120, 1.75, 40))
            active_iob_cgm.extend(_ramp(day, 19, 40, 190, -1.0, 140))
            active_iob_bolus.extend([
                (400 + day * 10, datetime(2026, 6, day, 19), 6.0, 40.0,
                 {"carb_ratio": 10.0}),
                (401 + day * 10, datetime(2026, 6, day, 20), 4.0, None),
            ])
        active_iob, _ = self._real_case(
            "correction_on_iob", active_iob_cgm, active_iob_bolus,
        )
        self.assertEqual(active_iob["summary"]["claimed"], 4)

        short_cgm = []
        short_bolus = []
        for day in range(1, 5):
            short_cgm.extend(_trace(day, [
                (9, 0, 110), (12, 0, 112), (12, 20, 120),
                (14, 0, 265), (16, 0, 150),
            ]))
            short_bolus.extend([
                (500 + day * 10, datetime(2026, 6, day, 12), 5.0, 85.0,
                 {"carb_ratio": 12.0, "isf": 45.0, "target_bg": 110.0}),
                (501 + day * 10, datetime(2026, 6, day, 13, 40), 2.5, None),
            ])
        short, _ = self._real_case("meal_bolus_short", short_cgm, short_bolus)
        self.assertEqual(short["summary"]["claimed"], 4)

    def test_real_attribution_can_claim_fewer_opportunities_than_its_classifier_fired(self):
        cgm = []
        bolus = []
        for day in range(1, 5):
            cgm.extend(_ramp(day, 11, 40, 120, 0, 30))
            cgm.extend(_ramp(day, 12, 10, 120, 2.0, 60))
            cgm.extend(_ramp(day, 13, 10, 240, -1.0, 120))
            undercount_wins = day <= 2
            bolus.append((
                600 + day, datetime(2026, 6, day, 12, 40),
                2.0 if undercount_wins else 10.0,
                20.0 if undercount_wins else 200.0,
                {"carb_ratio": 10.0, "isf": 40.0, "target_bg": 110.0},
            ))

        case, _ = self._real_case("late_bolus", cgm, bolus)

        self.assertEqual(case["summary"], {
            "claimed": 2, "denominator": 4, "noun": "meals",
        })
        self.assertEqual(case["verdict_counts"]["fired"], 4)

    def test_equal_time_correction_association_uses_the_exact_winning_seq_tuple(self):
        cgm = []
        bolus = []
        for day in range(1, 5):
            cgm.extend(_ramp(day, 14, 0, 160, -0.8, 60))
            cgm.extend(_ramp(day, 15, 5, 108, -1.2, 60))
            bolus.extend([
                (day * 100 + 10, datetime(2026, 6, day, 14, 10), 3.0, None),
                (day * 100 + 11, datetime(2026, 6, day, 14, 40), 3.0, None),
                (day * 100 + 12, datetime(2026, 6, day, 14, 40), 3.0, None),
            ])

        case, selected = self._real_case(
            "correction_stacking", cgm, bolus, select_claimed=True,
        )

        self.assertEqual(case["summary"]["claimed"], 4)
        source_seq = [row["seq_num"]
                      for row in selected["selection"]["detail"]["source_corrections"]]
        day = source_seq[1] // 100
        self.assertEqual(source_seq, [day * 100 + 11, day * 100 + 12])

    def test_caused_low_uses_rebound_relative_membership_in_a_wrapping_window(self):
        base = datetime(2026, 6, 1, 20, 40)

        def segment(offset, start_bg, slope, duration):
            return [(base + timedelta(minutes=offset + minute),
                     start_bg + slope * minute)
                    for minute in range(0, duration + 1, 5)]

        readings = (segment(0, 120, 0, 20)
                    + segment(20, 120, 1.75, 40)
                    + segment(60, 190, -1.4, 100)
                    + segment(160, 50, 4.0, 40)
                    + segment(200, 210, -1.2, 80))
        bolus = [
            (710, base + timedelta(minutes=20), 6.0, 40.0,
             {"carb_ratio": 10.0}),
            (711, base + timedelta(minutes=80), 4.0, None),
        ]
        rebound_case, _ = self._real_case(
            "over_treated_low", readings, bolus,
            query={"start_min": 23 * 60 + 50, "end_min": 30},
        )
        self.assertEqual(rebound_case["summary"], {
            "claimed": 1, "denominator": 1, "noun": "lows",
        })
        self.assertTrue(rebound_case["window"]["scoped"])
        self.assertEqual(rebound_case["occurrences"][0]["anchor"]["t"],
                         "2026-06-01 23:20:00")

        crash_only = self._real_preparation(
            readings, bolus,
            query={"start_min": 23 * 60 + 10, "end_min": 23 * 60 + 40},
        )
        self.assertNotIn(
            "finding:over_treated_low",
            [row["id"] for row in crash_only["rendered_rows"]],
        )
