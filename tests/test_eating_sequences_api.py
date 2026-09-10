"""Public HTTP contract for the fixed eating-sequence report (#275)."""

import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    from ciq_autotune import findings_projection as findings_projection_module
    HAS_API = True
except ImportError:  # pragma: no cover
    HAS_API = False


@unittest.skipUnless(HAS_API, "api extra is installed")
class EatingSequencesApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.app = create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False,
            analysis_incarnation="eating-sequences-http",
        )
        self.client = TestClient(self.app)

    def tearDown(self):
        self.client.close()
        self.tmp.close()

    def test_fixed_window_report_is_fresh_and_cached(self):
        first = self.client.get("/api/diagnose/eating-sequences", params={"window": 30})
        second = self.client.get("/api/diagnose/eating-sequences", params={"window": 30})

        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(first.json()["schema"], "eating-sequence-report-v1")
        self.assertNotIn("input_data_age", first.json())
        self.assertTrue(self.app.state.result_cache.contains(("eating-sequences", 30)))

    def test_report_is_generation_bound_and_stale_request_recovers(self):
        first = self.client.get("/api/diagnose/eating-sequences").json()
        self.assertEqual(first["analysis_generation"], "eating-sequences-http:0")
        self.app.state.result_cache.bump()
        stale = self.client.get("/api/diagnose/eating-sequences", params={
            "analysis_generation": first["analysis_generation"],
        })
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(stale.json()["detail"]["code"], "analysis_generation_mismatch")
        fresh = self.client.get("/api/diagnose/eating-sequences").json()
        self.assertEqual(fresh["analysis_generation"], "eating-sequences-http:1")
        accepted = self.client.get("/api/diagnose/eating-sequences", params={
            "analysis_generation": fresh["analysis_generation"],
        })
        self.assertEqual(accepted.json(), fresh)

    def test_write_during_report_build_retries_before_stamping_generation(self):
        from unittest.mock import patch
        from ciq_autotune.api import build_eating_sequence_report
        calls = []

        def interleaved(store, **kwargs):
            result = build_eating_sequence_report(store, **kwargs)
            calls.append(result)
            if len(calls) == 1:
                from ciq_autotune.store import Store
                with Store.open(self.tmp.name) as writer:
                    writer.upsert_cgm([{"EventDateTime": "2026-08-10 12:00:00",
                                        "Readings (CGM / BGM)": 110, "Description": "EGV"}])
                self.app.state.result_cache.bump()
            return result

        with patch("ciq_autotune.api.build_eating_sequence_report", side_effect=interleaved):
            response = self.client.get("/api/diagnose/eating-sequences")
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["analysis_generation"], "eating-sequences-http:1")
        self.assertGreaterEqual(len(calls), 2)
        self.assertEqual(response.json()["window"]["end"], "2026-08-10T12:00:00")

    def test_only_fixed_integer_window_is_accepted(self):
        wrong = self.client.get("/api/diagnose/eating-sequences", params={"window": 14})
        malformed = self.client.get("/api/diagnose/eating-sequences", params={"window": "nope"})

        self.assertEqual(wrong.status_code, 400)
        self.assertIn("fixed", wrong.json()["detail"])
        self.assertIn(
            str(findings_projection_module.DIAGNOSE_SOURCE_WINDOW_DAYS),
            wrong.json()["detail"],
        )
        self.assertEqual(malformed.status_code, 422)

    def test_configured_token_is_required(self):
        self.client.close()
        self.app = create_app(
            db_path=self.tmp.name, token="eating-sequences-token", enable_fetch_loop=False,
        )
        self.client = TestClient(self.app)

        refused = self.client.get("/api/diagnose/eating-sequences")
        accepted = self.client.get(
            "/api/diagnose/eating-sequences",
            headers={"Authorization": "Bearer eating-sequences-token"},
        )

        self.assertEqual(refused.status_code, 401)
        self.assertEqual(accepted.status_code, 200, accepted.text)
