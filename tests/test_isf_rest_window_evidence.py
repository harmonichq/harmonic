"""Public ISF rest-window evidence projection tests."""

import tempfile
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.events import CarbEntry
from ciq_autotune.isf_rest_window_evidence import prepare_isf_rest_window_evidence
from ciq_autotune.store import Store


def _seed(path, *, mask=False):
    with Store.open(path) as store:
        cgm, basal = [], []
        for night in range(2):
            start = datetime(2026, 6, 1 + night, 22)
            for point in range(121):
                at = start + timedelta(minutes=5 * point)
                cgm.append({"EventDateTime": at.isoformat(),
                            "Readings (CGM / BGM)": 110, "Description": "EGV"})
                basal.append({"seq_num": int(at.strftime("%Y%m%d%H%M%S")),
                              "time": at.strftime("%Y-%m-%d %H:%M:%S"),
                              "delivery_type": "algorithmDelivery", "duration_mins": 5,
                              "basal_rate": 0.8, "profile_basal_rate": 0.8})
        store.upsert_cgm(cgm)
        store.upsert_basal(basal)
        if mask:
            for night in range(2):
                for hour in range(0, 11):
                    at = datetime(2026, 6, 1 + night, 22) + timedelta(hours=hour)
                    store.upsert_carb_entry(CarbEntry(at, None, "unknown", "manual", "", at))


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class IsfRestWindowEvidenceApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        _seed(self.tmp.name)
        from ciq_autotune.api import create_app
        self.app = create_app(db_path=self.tmp.name, token=None, enable_fetch_loop=False,
                              analysis_incarnation="isf-evidence")
        self.client = TestClient(self.app)

    def tearDown(self):
        self.tmp.close()

    def test_public_payload_keeps_analyzer_window_identity_and_distinct_counts(self):
        response = self.client.get("/api/diagnose/isf-rest-window-evidence")
        self.assertEqual(response.status_code, 200, response.text)
        body = response.json()
        self.assertEqual(body["schema"], "diagnose-isf-rest-window-evidence-v1")
        self.assertGreater(body["counts"]["detected_windows"], 0)
        self.assertGreater(body["counts"]["qualifying_windows"], 0)
        self.assertEqual(body["counts"]["qualifying_steps"], len(body["steps"]))
        window_ids = {window["id"] for window in body["windows"]}
        self.assertTrue(body["steps"])
        self.assertTrue(all(step["window_id"] in window_ids for step in body["steps"]))
        with Store.open_queryonly(self.tmp.name) as store:
            prepared = prepare_isf_rest_window_evidence(store, {"isf": []}, window_days=30)
        self.assertEqual(body["windows"], prepared.project()["windows"])
        self.assertEqual(body["steps"], prepared.project()["steps"])

    def test_detected_windows_without_qualifying_steps_stays_distinct(self):
        blocked = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(blocked.close)
        _seed(blocked.name, mask=True)
        from ciq_autotune.api import create_app
        body = TestClient(create_app(db_path=blocked.name, token=None,
                                     enable_fetch_loop=False)).get(
                                         "/api/diagnose/isf-rest-window-evidence").json()
        self.assertGreater(body["counts"]["detected_windows"], 0)
        self.assertEqual(body["counts"]["qualifying_windows"], 0)
        self.assertEqual(body["counts"]["qualifying_steps"], 0)

    def test_no_detected_rest_windows_is_explicitly_empty(self):
        empty = tempfile.NamedTemporaryFile(suffix=".db")
        self.addCleanup(empty.close)
        from ciq_autotune.api import create_app
        body = TestClient(create_app(db_path=empty.name, token=None,
                                     enable_fetch_loop=False)).get(
                                         "/api/diagnose/isf-rest-window-evidence").json()
        self.assertEqual(body["counts"], {
            "detected_windows": 0, "qualifying_windows": 0, "qualifying_steps": 0,
        })

    def test_repeat_read_reuses_and_write_regenerates_the_fixed_preparation(self):
        import ciq_autotune.api as api_mod
        real = api_mod.prepare_isf_rest_window_evidence
        calls = []

        def counting(*args, **kwargs):
            calls.append(1)
            return real(*args, **kwargs)

        with patch.object(api_mod, "prepare_isf_rest_window_evidence", counting):
            self.client.get("/api/diagnose/isf-rest-window-evidence")
            self.client.get("/api/diagnose/isf-rest-window-evidence")
            self.assertEqual(len(calls), 1)
            self.client.post("/api/carbs", json={
                "t": "2026-06-02 12:00:00", "grams": 8, "certainty": "exact"})
            self.client.get("/api/diagnose/isf-rest-window-evidence")
        self.assertEqual(len(calls), 2)
