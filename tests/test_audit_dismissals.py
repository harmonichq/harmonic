"""Public API contract for durable, evidence-versioned Audit dismissals (#586)."""

import tempfile
import unittest
from unittest.mock import patch

try:
    from fastapi.testclient import TestClient
    _HAS_FASTAPI = True
except ImportError:  # pragma: no cover
    _HAS_FASTAPI = False

from ciq_autotune.store import Store


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class AuditDismissalApiTest(unittest.TestCase):
    def setUp(self):
        from ciq_autotune.api import create_app
        self.tmp = tempfile.NamedTemporaryFile(suffix=".db")
        self.client = TestClient(create_app(
            db_path=self.tmp.name, token=None, enable_fetch_loop=False))

    def tearDown(self):
        self.tmp.close()

    def test_get_post_replace_and_cache_invalidation_through_public_interface(self):
        from ciq_autotune.result_cache import ResultCache

        self.assertEqual(self.client.get("/api/audit/dismissals").json(), {"dismissals": {}})
        with patch.object(ResultCache, "bump", autospec=True) as bump:
            response = self.client.post("/api/audit/dismissals", json={
                "item_id": "ic:lunch", "evidence_fingerprint": '{"support":8}',
            })
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), {
            "item_id": "ic:lunch", "evidence_fingerprint": '{"support":8}',
        })
        self.assertEqual(bump.call_count, 1)
        self.assertEqual(
            self.client.get("/api/audit/dismissals").json()["dismissals"]["ic:lunch"]
            ["evidence_fingerprint"], '{"support":8}')

        self.assertEqual(self.client.post("/api/audit/dismissals", json={
            "item_id": "ic:lunch", "evidence_fingerprint": '{"support":9}',
        }).status_code, 200)
        with Store.open(self.tmp.name) as store:
            self.assertEqual(list(store.audit_dismissals()), ["ic:lunch"])
            self.assertEqual(store.audit_dismissals()["ic:lunch"]["evidence_fingerprint"],
                             '{"support":9}')

    def test_malformed_writes_fail_closed_without_invalidating(self):
        from ciq_autotune.result_cache import ResultCache

        bad_payloads = [
            {},
            {"item_id": "", "evidence_fingerprint": "x"},
            {"item_id": "../item", "evidence_fingerprint": "x"},
            {"item_id": "basal:2", "evidence_fingerprint": ""},
            {"item_id": 2, "evidence_fingerprint": {}},
        ]
        with patch.object(ResultCache, "bump", autospec=True) as bump:
            for payload in bad_payloads:
                self.assertEqual(
                    self.client.post("/api/audit/dismissals", json=payload).status_code, 400)
        self.assertEqual(bump.call_count, 0)
        self.assertEqual(self.client.get("/api/audit/dismissals").json(), {"dismissals": {}})


@unittest.skipUnless(_HAS_FASTAPI, "api extra not installed")
class AuditDismissalAuthTest(unittest.TestCase):
    def test_get_and_post_require_the_configured_bearer(self):
        from ciq_autotune.api import create_app

        with tempfile.NamedTemporaryFile(suffix=".db") as db:
            client = TestClient(create_app(
                db_path=db.name, token="secret", enable_fetch_loop=False))
            for method in ("get", "post"):
                call = getattr(client, method)
                kwargs = {} if method == "get" else {"json": {
                    "item_id": "basal:2", "evidence_fingerprint": "v1"}}
                self.assertEqual(call("/api/audit/dismissals", **kwargs).status_code, 401)
                self.assertEqual(call("/api/audit/dismissals", headers={
                    "Authorization": "Bearer wrong"}, **kwargs).status_code, 401)
            response = client.post("/api/audit/dismissals", headers={
                "Authorization": "Bearer secret"}, json={
                    "item_id": "basal:2", "evidence_fingerprint": "v1"})
            self.assertEqual(response.status_code, 200)
            self.assertIn("basal:2", client.get("/api/audit/dismissals", headers={
                "Authorization": "Bearer secret"}).json()["dismissals"])


if __name__ == "__main__":
    unittest.main()
