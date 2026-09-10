"""Exercise acceptance through its route-probe interface, including rejected proofs."""
import importlib.util
import json
import os
import signal
import socket
import subprocess
import sys
import time
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


class ServerLifecycleTest(unittest.TestCase):
    def test_taken_port_is_rejected_without_touching_its_listener(self):
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(RuntimeError, f"Port {port} is occupied"):
                acceptance.free_port(port)
            self.assertEqual(listener.getsockname()[1], port)

    def test_teardown_stops_descendant_after_launcher_exits(self):
        # A launcher like uv can finish before a TERM-resistant descendant.
        # Fork only our manufactured child; no Harmonic or external port.
        code = """
import os, signal, socket, time
if os.fork():
    os._exit(0)
signal.signal(signal.SIGTERM, signal.SIG_IGN)
listener = socket.socket()
listener.bind(('127.0.0.1', 0))
listener.listen()
print(listener.getsockname()[1], flush=True)
while True:
    time.sleep(1)
"""
        child = subprocess.Popen([sys.executable, "-u", "-c", code],
                                 stdout=subprocess.PIPE, text=True, start_new_session=True)
        try:
            port = int(child.stdout.readline())
            child.wait(timeout=5)
            with self.assertRaisesRegex(RuntimeError, "occupied"):
                acceptance.free_port(port)
            acceptance.stop_server(child, grace=.1)
            deadline = time.monotonic() + 5
            while True:
                try:
                    acceptance.free_port(port)
                    break
                except RuntimeError:
                    if time.monotonic() >= deadline:
                        raise
                    time.sleep(.05)
        finally:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.stdout.close()

    def test_auth_context_cleans_up_after_a_failed_replay(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as directory:
            run = SimpleNamespace(out=Path(directory))
            with patch.object(acceptance, "free_port") as free, \
                 patch.object(acceptance.shutil, "copyfile"), \
                 patch.object(acceptance.subprocess, "Popen") as spawn, \
                 patch.object(acceptance, "wait_ready"), \
                 patch.object(acceptance, "stop_server") as stop:
                with self.assertRaisesRegex(RuntimeError, "synthetic replay failure"):
                    with acceptance.auth_server(run):
                        raise RuntimeError("synthetic replay failure")
                stop.assert_called_once_with(spawn.return_value)
                self.assertEqual(free.call_count, 2, "port is checked before start and after teardown")
                self.assertTrue(spawn.call_args.kwargs["start_new_session"])


class ReplayWrapperTest(unittest.TestCase):
    def test_complete_replay_keeps_s100_but_never_captures_its_closed_endpoint(self):
        from contextlib import nullcontext
        testcase = self
        class Run:
            out = Path("/tmp/synthetic-wrapper-test")
            def command(self, name, args, *, env):
                testcase.assertEqual(name, "complete-replay")
                testcase.assertEqual(args, ["node", "frontend/harmonic-v2-desktop-behavior.replay.mjs"])
                testcase.assertNotIn("ONLY", env, "S100 must remain in the complete registry run")
                testcase.assertNotIn("STORY_CASES", env)
                captures = env["CAPTURE_ONLY"].split(",")
                testcase.assertNotIn("S100", captures, "Event S8 closes its borrowed page before endpoint capture")
                testcase.assertIn("S99", captures, "other endpoints must still be captured")
                testcase.assertTrue(env["CAPTURE_DIR"])
                return 0, "# executed 130 · failed 0 · deferred 0 · selected 130"
        with patch.object(acceptance, "inventory"), patch.object(acceptance, "free_port"), \
             patch.object(acceptance, "auth_server", return_value=nullcontext()), \
             patch.dict(os.environ, {"PLAYWRIGHT_MODULE": "synthetic", "ONLY": "S99", "STORY_CASES": "S100=wrong"}):
            acceptance.replay(Run(), "1280x720")


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
