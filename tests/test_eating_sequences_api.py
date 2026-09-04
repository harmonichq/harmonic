"""Public HTTP contract for the fixed eating-sequence report (#275)."""

import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
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

    def test_only_fixed_integer_window_is_accepted(self):
        wrong = self.client.get("/api/diagnose/eating-sequences", params={"window": 14})
        malformed = self.client.get("/api/diagnose/eating-sequences", params={"window": "nope"})

        self.assertEqual(wrong.status_code, 400)
        self.assertIn("fixed source window", wrong.json()["detail"])
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

