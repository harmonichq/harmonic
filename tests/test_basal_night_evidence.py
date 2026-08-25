"""Public API contract for analyzer-owned basal nightly evidence (#143)."""

import json
import pathlib
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.store import Store

_FIXTURE = (pathlib.Path(__file__).resolve().parents[1]
            / "frontend" / "__fixtures__" / "basal-night-evidence.json")


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class BasalNightEvidenceEndpointTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app

        self.fixture = json.loads(_FIXTURE.read_text())
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        with Store.open(self.tmp.name) as store:
            store.upsert_basal(self.fixture["input"]["basal"])
            store.upsert_cgm(self.fixture["input"]["cgm"])
            store.upsert_bolus(self.fixture["input"]["bolus"])
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False,
                              analysis_incarnation="basal-night-evidence-fixture")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_serves_the_analyzer_roster_and_distinct_support_counts(self):
        analysis = self.client.get("/api/analyze", params={"window": 30, "pool": True})
        response = self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), self.fixture["expected"])
        slot = analysis.json()["basal"][0]
        evidence = response.json()
        self.assertEqual([night["date"] for night in evidence["nights"]],
                         [point["date"] for point in slot["evidence"]["points"]])
        self.assertEqual(evidence["directional_support_count"],
                         slot["evidence"]["directional_support_count"])
        self.assertEqual(evidence["asserts_move"], slot["asserts_move"])
        self.assertEqual(evidence["roster_count"], 7)
        self.assertEqual(evidence["directional_support_count"], 6)
        self.assertEqual(evidence["excluded_night_count"], 1)
        self.assertNotIn("2026-01-08", [night["date"] for night in evidence["nights"]])

    def test_repeat_read_reuses_the_fixed_preparation_and_write_rebuilds_it(self):
        import ciq_autotune.api as api_mod
        from unittest.mock import patch

        real = api_mod.prepare_basal_night_evidence
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_basal_night_evidence", counting):
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.assertEqual(len(calls), 1)
            response = self.client.post("/api/carbs", json={
                "t": "2026-01-11 00:00:00", "grams": 8, "certainty": "exact"})
            self.assertEqual(response.status_code, 200)
            self.client.get("/api/diagnose/basal-night-evidence", params={"slot": 0})
            self.assertEqual(len(calls), 2)
