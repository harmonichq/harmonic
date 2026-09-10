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
    ids = [f"S{i}" for i in range(1, 113)] + [f"R{i}" for i in range(1, 19)]

    def replay(self, shard=None, output=None, expected_timeout=None):
        from contextlib import nullcontext
        testcase = self
        with tempfile.TemporaryDirectory() as directory:
            class Run:
                out = Path(directory)
                def command(self, name, args, *, env, timeout):
                    testcase.assertEqual(name, "complete-replay")
                    if expected_timeout is not None:
                        testcase.assertEqual(timeout, expected_timeout,
                            "the replay process ceiling stated in ACCEPTANCE.md")
                    testcase.assertEqual(args, ["node", "frontend/harmonic-v2-desktop-behavior.replay.mjs"])
                    testcase.assertNotIn("STORY_CASES", env)
                    captures = env["CAPTURE_ONLY"].split(",")
                    testcase.assertNotIn("S100", captures)
                    testcase.assertIn("S99", captures)
                    testcase.assertTrue(env["CAPTURE_DIR"])
                    if shard:
                        chosen = env["ONLY"].split(",")
                    else:
                        testcase.assertNotIn("ONLY", env)
                        chosen = testcase.ids
                    return 0, output if output is not None else (
                        "\n".join(f"PASS {id}" for id in chosen) +
                        f"\n# executed {len(chosen)} · failed 0 · deferred 0 · selected {len(chosen)}")
            with patch.object(acceptance, "inventory", return_value=self.ids) as inventory, \
                 patch.object(acceptance, "free_port"), \
                 patch.object(acceptance, "auth_server", return_value=nullcontext()), \
                 patch.dict(os.environ, {"PLAYWRIGHT_MODULE": "synthetic", "ONLY": "S99", "STORY_CASES": "S100=wrong"}):
                acceptance.replay(Run(), "1280x720", shard)
                inventory.assert_called_once()
            return json.loads((Path(directory) / "selection.json").read_text())["selected"]

    def test_complete_replay_ignores_inherited_selection(self):
        self.assertEqual(self.replay(), self.ids)

    def test_wrapper_applies_both_ceilings_stated_in_acceptance(self):
        self.replay(expected_timeout=3000)
        self.replay((1, 1), expected_timeout=900)

    def test_shards_concatenate_to_the_complete_registry_without_overlap(self):
        # Read the CI shard inventory; this test does not own a second list.
        import re
        workflow = (acceptance.REPO / ".github/workflows/ci.yml").read_text()
        shards = list(dict.fromkeys(re.findall(r"--shard (\d+/\d+)", workflow)))
        self.assertTrue(shards)
        groups = [self.replay(acceptance.shard_arg(shard)) for shard in shards]
        self.assertEqual([id for group in groups for id in group], self.ids)
        self.assertLessEqual(max(map(len, groups)) - min(map(len, groups)), 1)
        self.assertIn("S100", [id for group in groups for id in group])

    def test_one_shard_is_the_full_registry(self):
        self.assertEqual(self.replay((1, 1)), self.ids)

    def test_empty_shards_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "empty shards"):
            self.replay((1, len(self.ids) + 1))

    def test_incomplete_wrong_duplicate_and_deferred_output_are_rejected(self):
        for output in [
            "# executed 1 · failed 0 · deferred 0 · selected 1",
            "# executed 0 · failed 0 · deferred 0 · selected 0",
            "# executed 129 · failed 0 · deferred 1 · selected 130",
            "\n".join(["PASS S1"] * 130) + "\n# executed 130 · failed 0 · deferred 0 · selected 130",
            "no summary",
        ]:
            with self.subTest(output=output[:50]), self.assertRaises(RuntimeError):
                self.replay(output=output)

    def test_invalid_shard_cli_fails_before_creating_output(self):
        for value in ["0/4", "5/4", "1/0", "1", "-1/4", "1/2/3", "a/b"]:
            with tempfile.TemporaryDirectory() as directory:
                out = Path(directory) / "absent"
                result = subprocess.run([sys.executable, acceptance.__file__, "replay",
                    "--shard=" + value, "--out", str(out)], capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertFalse(out.exists())


class CaseCacheTest(unittest.TestCase):
    def test_real_case_reconciles_once_and_warm_copies_discard_story_mutations(self):
        import shutil
        uv = shutil.which("uv")
        self.assertIsNotNone(uv)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            audit = root / "uv.jsonl"
            wrapper = bin_dir / "uv"
            wrapper.write_text(f"#!{sys.executable}\n" +
                "import json, os, sys\n" +
                f"with open({str(audit)!r}, 'a') as log: log.write(json.dumps(sys.argv[1:]) + '\\n')\n" +
                f"os.execv({uv!r}, [{uv!r}, *sys.argv[1:]])\n")
            wrapper.chmod(0o755)
            with patch.dict(os.environ, {"PATH": str(bin_dir) + os.pathsep + os.environ["PATH"]}):
                run = acceptance.Run(root / "out")
                acceptance.case_cache(run, check=True, cases=["basal-lower"])
            calls = [json.loads(line) for line in audit.read_text().splitlines()]
            reconciles = [call for call in calls if any("reconcile_ingested_follow_up" in arg for arg in call)]
            cached = [call for call in reconciles if Path(call[-1]).name == "generated-basal-lower.sqlite"]
            self.assertEqual(len(cached), 1, "warm copies must never reconcile again")
            self.assertEqual(len(reconciles), 1, "the check must not benchmark the removed path")
            self.assertFalse(any("serve" in call for call in calls))
            self.assertFalse((run.out / "case-times.json").exists())

    def test_empty_explicit_cases_and_empty_default_registry_fail_closed(self):
        for cases in [[], None]:
            with self.subTest(cases=cases), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                run = acceptance.Run(root / "out")
                # Import an empty registry through the same Node driver; no
                # generator or server can turn zero checks into apparent success.
                (root / "frontend").mkdir()
                (root / "frontend/harmonic-v2-desktop-behavior.replay.mjs").write_text(
                    "export const REGISTRY = [];\n")
                (root / "frontend-v2").mkdir()
                (root / "frontend-v2/replay-cases.mjs").write_text(
                    "export const storyCase = id => id;\n"
                    "export function createCaseServer() { throw new Error('server must not start'); }\n")
                with patch.object(acceptance, "REPO", root), \
                     self.assertRaisesRegex(RuntimeError, "case-cache failed"):
                    acceptance.case_cache(run, check=True, cases=cases)
                self.assertIn("no cases selected", (run.out / "case-cache.log").read_text())


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
