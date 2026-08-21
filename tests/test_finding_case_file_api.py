"""Public contract smoke tests for ADR 79's server-owned preparation routes."""
import tempfile
import unittest

try:
    from fastapi.testclient import TestClient
    from ciq_autotune.api import create_app
    from ciq_autotune.store import Store
    HAS_API = True
except ImportError:  # pragma: no cover
    HAS_API = False


@unittest.skipUnless(HAS_API, "api extra is installed")
class FindingCaseFileRouteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(suffix=".sqlite")
        self.client = TestClient(create_app(db_path=self.tmp.name, token=None,
                                            enable_fetch_loop=False))

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

    def test_raw_query_failures_use_the_structured_400_envelope(self):
        for url in (
            "/diagnose/finding-case-file-preparation?start_min=1",
            "/diagnose/finding-case-file-preparation?start_min=x&end_min=2",
            "/diagnose/finding-case-file-preparation?unknown=1",
            "/diagnose/finding-case-file?projection_id=nope",
        ):
            response = self.client.get(url)
            self.assertEqual(response.status_code, 400)
            self.assertEqual(response.json()["detail"]["code"], "invalid_request")

    def test_unknown_retained_preparation_is_structured_stale(self):
        response = self.client.get(
            "/diagnose/finding-case-file?projection_id=fp_00000000000000000000000000000000"
            "&finding_id=finding:late_bolus&alignment=clock"
        )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "stale_projection")
