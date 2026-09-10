"""Exercise acceptance through its route-probe interface, including rejected proofs."""
import importlib.util
import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("acceptance", Path(__file__).with_name("acceptance.py"))
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)


class RuntimeProofTest(unittest.TestCase):
    def setUp(self):
        self.replies = {}
        for page, prefix in [("/", "/assets/"), ("/v2/", "/v2/assets/")]:
            self.replies[page] = (200, f'<script src="{prefix}app.js"></script>'.encode(), {"cache-control": "no-cache"})
            self.replies[prefix + "app.js"] = (200, b"bundled code", {"cache-control": "public, max-age=31536000, immutable"})

    def request(self, base, path, token=None):
        if path == "/api/status":
            return (200 if token == "synthetic-replay-token" else 401), b"{}", {}
        return self.replies.get(path, (404, b"not found", {}))

    def probe(self):
        with patch.object(acceptance, "request", self.request):
            return acceptance.probe("http://synthetic.invalid", "synthetic-replay-token")

    def test_both_shells_assets_closed_routes_and_auth_are_requested(self):
        rows = self.probe()
        self.assertEqual(len(rows), 15)
        self.assertEqual([r["status"] for r in rows if r["path"] == "/api/status"], [401, 401, 200])

    def test_carried_v1_google_fonts_are_recorded_without_network_requests(self):
        code, body, headers = self.replies["/"]
        self.replies["/"] = code, body + b'<link href="https://fonts.googleapis.com/css2?family=Inter">', headers
        rows = self.probe()
        self.assertEqual(rows[1]["scope"], "carried-v1-font-reference")
        self.assertFalse(rows[1]["requested"])

    def test_missing_v2_asset_cannot_pass_on_v1_success(self):
        del self.replies["/v2/assets/app.js"]
        with self.assertRaisesRegex(RuntimeError, "absent packaged bytes"):
            self.probe()

    def test_cdn_reference_cannot_be_called_packaged(self):
        self.replies["/v2/"] = (200, b'<script src="/v2/assets/app.js"></script><script src="https://cdn.invalid/app.js"></script>', {"cache-control": "no-cache"})
        with self.assertRaisesRegex(RuntimeError, "external or misplaced asset"):
            self.probe()

    def test_unlisted_route_cannot_fall_back_to_the_shell(self):
        self.replies["/v2/day"] = self.replies["/v2/"]
        with self.assertRaisesRegex(RuntimeError, "expected 404, got 200"):
            self.probe()

    def test_anonymous_api_success_is_rejected(self):
        original = self.request
        self.request = lambda base, path, token=None: (200, b"{}", {}) if path == "/api/status" else original(base, path, token)
        with self.assertRaisesRegex(RuntimeError, "expected 401, got 200"):
            self.probe()


class InventoryProofTest(unittest.TestCase):
    def inventory(self, ids):
        class Run:
            def command(self, name, args):
                return 0, json.dumps(ids)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "mockups").mkdir()
            (root / "mockups/harmonic-v2-desktop.behavior.md").write_text(
                "\n".join(f"{identity} · Synthetic inventory entry" for identity in ids))
            with patch.object(acceptance, "REPO", root):
                acceptance.inventory(Run())

    def test_stated_active_and_retired_inventory(self):
        self.inventory([f"S{i}" for i in range(1, 113)] + [f"R{i}" for i in range(1, 19)])

    def test_same_total_cannot_hide_changed_active_retired_counts(self):
        ids = [f"S{i}" for i in range(1, 112)] + [f"R{i}" for i in range(1, 20)]
        self.assertEqual(len(ids), 130)
        with self.assertRaisesRegex(RuntimeError, "frozen ledger inventory changed"):
            self.inventory(ids)


if __name__ == "__main__":
    unittest.main()
