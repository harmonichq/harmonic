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

    def replay(self, shard=None, output=None, expected_timeout=None, base=None):
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
                    if shard or base:
                        chosen = env["ONLY"].split(",")
                    else:
                        testcase.assertNotIn("ONLY", env)
                        chosen = testcase.ids
                    return 0, output if output is not None else (
                        "\n".join(f"PASS {id}" for id in chosen) +
                        f"\n# executed {len(chosen)} · failed 0 · deferred 0 · selected {len(chosen)}")
            with patch.object(acceptance, "inventory", return_value=self.ids) as inventory, \
                 patch.object(acceptance, "smoke_selection", return_value=self.ids[:20]), \
                 patch.object(acceptance, "free_port"), \
                 patch.object(acceptance, "auth_server", return_value=nullcontext()), \
                 patch.dict(os.environ, {"PLAYWRIGHT_MODULE": "synthetic", "ONLY": "S99", "STORY_CASES": "S100=wrong"}):
                acceptance.replay(Run(), "1280x720", shard, base)
                inventory.assert_called_once()
            return json.loads((Path(directory) / "selection.json").read_text())["selected"]

    def test_complete_replay_ignores_inherited_selection(self):
        self.assertEqual(self.replay(), self.ids)

    def test_wrapper_applies_both_ceilings_stated_in_acceptance(self):
        self.replay(expected_timeout=3000)
        self.replay((1, 1), expected_timeout=780)

    def test_shards_concatenate_to_the_complete_registry_without_overlap(self):
        # Read the CI shard inventory; this test does not own a second list.
        import re
        workflow = (acceptance.REPO / ".github/workflows/ci.yml").read_text()
        inventories = json.loads(re.search(r"REPLAY_SHARDS: '([^']+)'", workflow).group(1))
        shards = inventories['full']
        self.assertTrue(shards)
        groups = [self.replay(acceptance.shard_arg(shard)) for shard in shards]
        self.assertEqual([id for group in groups for id in group], self.ids)
        self.assertLessEqual(max(map(len, groups)) - min(map(len, groups)), 1)
        self.assertIn("S100", [id for group in groups for id in group])

    def test_smoke_uses_its_own_selection_and_allows_full_fallback_ceiling(self):
        self.assertEqual(self.replay((1, 1), base="base", expected_timeout=3000), self.ids[:20])

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


class ReplayPlanTest(unittest.TestCase):
    def test_full_pr_escalation_uses_the_same_shards_as_main(self):
        import re
        workflow = (acceptance.REPO / '.github/workflows/ci.yml').read_text()
        inventories = re.search(r"REPLAY_SHARDS: '([^']+)'", workflow).group(1)
        named = json.loads(inventories)
        ids = ReplayWrapperTest.ids
        for base, selection, mode in [(None, ids, 'full'), ('base', ids, 'full'), ('base', ids[:20], 'smoke')]:
            with self.subTest(base=base, mode=mode), tempfile.TemporaryDirectory() as directory:
                run = acceptance.Run(Path(directory) / 'out')
                output = Path(directory) / 'outputs'
                with patch.dict(os.environ, {'REPLAY_SHARDS': inventories, 'GITHUB_OUTPUT': str(output)}), \
                     patch.object(acceptance, 'inventory', return_value=ids), \
                     patch.object(acceptance, 'smoke_selection', return_value=selection) as select:
                    plan = acceptance.replay_plan(run, base)
                if base:
                    select.assert_called_once_with(run, base, ids)
                else:
                    select.assert_not_called()
                self.assertEqual(plan['shards'], named[mode])
                self.assertEqual(plan['mode'], mode)
                self.assertEqual(plan['selected'], selection)
                self.assertEqual(json.loads((run.out / 'plan.json').read_text()), plan)
                self.assertIn(f"shards={json.dumps(named[mode])}\n", output.read_text())
                self.assertIn(f"mode={mode}\n", output.read_text())
                self.assertIn(f"count={len(selection)}\n", output.read_text())
        ledger = workflow.split('  v2-ledger:\n', 1)[1].split('  frontend-browser:\n', 1)[0]
        self.assertIn('fromJSON(needs.v2-ledger-plan.outputs.shards)', ledger)
        self.assertIn("needs.v2-ledger-plan.outputs.mode == 'smoke' && github.event.pull_request.base.sha", ledger)
        self.assertIn('needs.v2-ledger-plan.outputs.count', ledger)

    def test_ci_plan_command_exports_real_inventory_without_browser(self):
        import re
        workflow = (acceptance.REPO / '.github/workflows/ci.yml').read_text()
        inventories = re.search(r"REPLAY_SHARDS: '([^']+)'", workflow).group(1)
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'outputs'
            out = Path(directory) / 'plan'
            env = {**os.environ, 'REPLAY_SHARDS': inventories, 'GITHUB_OUTPUT': str(output)}
            env.pop('PLAYWRIGHT_MODULE', None)
            result = subprocess.run([sys.executable, acceptance.__file__, 'replay-plan', '--out', str(out)],
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            plan = json.loads((out / 'plan.json').read_text())
            self.assertEqual(plan['count'], 130)
            self.assertEqual(plan['shards'], json.loads(inventories)['full'])
            self.assertIn('mode=full\n', output.read_text())


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

class BackendShardTest(unittest.TestCase):
    def test_two_files_reach_pytest_as_separate_arguments_and_are_logged(self):
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            files = ['tests/test_one.py', 'tests/test_two.py']
            with patch.object(acceptance, 'test_files', return_value=files), \
                 patch.object(acceptance.subprocess, 'Popen') as child:
                child.return_value.wait.return_value = 0
                acceptance.pytest_shard(run, (1, 3))
                self.assertEqual(child.call_args.args[0], ['uv', 'run', 'python', '-m', 'pytest', *files])
            records = json.loads((run.out / 'commands.json').read_text())
            self.assertEqual(records[0]['argv'][-2:], files)
            self.assertTrue((run.out / 'pytest.log').is_file())
            workflow = (acceptance.REPO / '.github/workflows/ci.yml').read_text()
            artifact = workflow.split('      - name: Retain backend shard inventory and output', 1)[1].split('  generators:', 1)[0]
            self.assertIn('if: always()', artifact)
            self.assertIn('/pytest-*/pytest.log', artifact)

    def test_ci_shards_partition_every_test_file_once(self):
        import re
        workflow = (acceptance.REPO / '.github/workflows/ci.yml').read_text()
        matrix = workflow.split('  backend-tests:\n', 1)[1].split('    steps:\n', 1)[0]
        shards = re.search(r'shard: \[(.*?)\]', matrix).group(1).split(', ')
        self.assertEqual(len(shards), 3)
        groups = [acceptance.test_files(acceptance.shard_arg(shard)) for shard in shards]
        expected = {str(path.relative_to(acceptance.REPO))
                    for pattern in ['tests/**/test_*.py', 'tests/**/*_test.py']
                    for path in acceptance.REPO.glob(pattern)}
        actual = [path for group in groups for path in group]
        self.assertTrue(expected)
        self.assertEqual(set(actual), expected)
        self.assertEqual(len(actual), len(expected))
        self.assertEqual(acceptance.test_files(), sorted(expected))

    def test_empty_file_shard_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(acceptance, 'REPO', Path(directory)):
            with self.assertRaisesRegex(RuntimeError, 'no backend test files'):
                acceptance.test_files((1, 3))
            tests = Path(directory) / 'tests'
            tests.mkdir()
            (tests / 'test_one.py').write_text('def test_one(): pass\n')
            with self.assertRaisesRegex(RuntimeError, 'empty backend test shard'):
                acceptance.test_files((2, 3))

    def test_pytest_zero_collection_exit_cannot_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory) / 'out')
            with patch.object(acceptance, 'test_files', return_value=['tests/test_empty.py']), \
                 patch.object(acceptance.subprocess, 'Popen') as child:
                child.return_value.wait.return_value = 5
                with self.assertRaisesRegex(RuntimeError, 'pytest failed'):
                    acceptance.pytest_shard(run, (1, 3))
                self.assertEqual(child.call_args.args[0], ['uv', 'run', 'python', '-m', 'pytest',
                                                          'tests/test_empty.py'])
                # Pin the actual process ceiling stated in ACCEPTANCE.md.
                child.return_value.wait.assert_called_once_with(timeout=840)


class SmokeSelectionTest(unittest.TestCase):
    replay_path = 'frontend/harmonic-v2-desktop-behavior.replay.mjs'
    recipe_path = 'scripts/qa_e2e_cases.py'
    source = '''
// STORY:manufactured:S2
export const S2 = page => first(page);
export const S3 = page => first(page);
export const S4 = page => unrelated(page);
function first(page) { return second(page); }
function second(page) { return page.read('before'); }
function unrelated(page) { return page.read('unchanged'); }
'''
    recipe = '''
def build(store): return helper(store)
def helper(store): return 1
QA_CASES = (QaCase('showcase', build), QaCase('ic-lower', build))
'''

    def select(self, before, after, recipe_before=None, recipe_after=None):
        ids = [*acceptance.SMOKE_STORIES, 'S2', 'S3', 'S4', 'R10']
        snapshots = {'base': {self.replay_path: before}, 'HEAD': {self.replay_path: after}}
        recipes = {'base': recipe_before or self.recipe, 'HEAD': recipe_after or recipe_before or self.recipe}
        changed = [path for path in snapshots['base'] if snapshots['base'][path] != snapshots['HEAD'][path]]
        if recipes['base'] != recipes['HEAD']:
            changed.append(self.recipe_path)
        def git(args, **kwargs):
            if args[1] == 'merge-base': return 'base\n'
            if args[1] == 'diff': return '\n'.join(changed)
            if args[1] == 'rev-parse': return 'head\n'
            if args[1] == 'ls-tree': return '\n'.join(snapshots[args[4]])
            if args[1] == 'show':
                ref, path = args[2].split(':', 1)
                return recipes[ref] if path == self.recipe_path else snapshots[ref][path]
            self.fail(f'unexpected git command: {args}')
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            with patch.object(acceptance.subprocess, 'check_output', side_effect=git):
                selected = acceptance.smoke_selection(run, 'base', ids)
            return set(selected)

    def test_unchanged_diff_is_exactly_fixed_smoke(self):
        self.assertEqual(self.select(self.source, self.source), set(acceptance.SMOKE_STORIES))

    def test_changed_function_selects_only_that_additional_story(self):
        self.assertEqual(self.select(self.source, self.source.replace('page => first(page);',
            "page => first(page, 'new');", 1)), set(acceptance.SMOKE_STORIES) | {'S2'})

    def test_transitive_helper_change_selects_all_callers(self):
        self.assertEqual(self.select(self.source, self.source.replace("'before'", "'after'")),
                         set(acceptance.SMOKE_STORIES) | {'S2', 'S3'})

    def test_deleted_helper_and_story_comment_changes_remain_visible(self):
        self.assertEqual(self.select(self.source, self.source.replace("function second(page) { return page.read('before'); }", '')),
                         set(acceptance.SMOKE_STORIES) | {'S2', 'S3'})
        self.assertEqual(self.select(self.source, self.source.replace('STORY:manufactured:S2', 'STORY:renamed:S2')),
                         set(acceptance.SMOKE_STORIES) | {'S2'})

    def test_changed_recipe_selects_its_consumers(self):
        after = self.recipe.replace("QaCase('ic-lower', build)", "QaCase('ic-lower', build, 'new recipe')")
        self.assertEqual(self.select(self.source, self.source, recipe_after=after),
                         set(acceptance.SMOKE_STORIES) | {'R10'})

    def test_changed_recipe_helper_selects_transitive_case_consumers(self):
        self.assertEqual(self.select(self.source, self.source, recipe_after=self.recipe.replace('return 1', 'return 2')),
                         set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})

    def test_imported_story_and_nested_variant_are_part_of_the_graph(self):
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            sources = {self.replay_path: "import { S9 as carried } from './carried.replay.mjs'; export const S2 = page => carried(page);",
                       'frontend/carried.replay.mjs': "// STORY:carried:S9\nexport const S9 = page => helper(page); function helper(page) { return page.withCase('c4-missing'); }"}
            graph, = acceptance.replay_graph(run, [sources])
            reached = acceptance.closure(graph, [self.replay_path + '::S2'])
            self.assertIn('frontend/carried.replay.mjs::helper', reached)
            self.assertIn('carried:S9', graph['frontend/carried.replay.mjs::S9']['tags'])
            self.assertIn('c4-missing', {value for key in reached for value in graph[key]['strings']})

    def test_fixed_slice_is_pinned_and_covers_every_real_replay_case(self):
        import hashlib
        self.assertEqual(len(set(acceptance.SMOKE_STORIES)), 20)
        self.assertEqual(hashlib.sha256(','.join(acceptance.SMOKE_STORIES).encode()).hexdigest(),
                         '01b990c54f14c457825fa57b458f0f8a6b6ba93bb62419346599083b7b3c534b')
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            ids = acceptance.inventory(run)
            selected = acceptance.smoke_selection(run, 'HEAD', ids)
            self.assertEqual(set(selected), set(acceptance.SMOKE_STORIES))
            report = json.loads((run.out / 'smoke.json').read_text())
            all_cases = {name for cases in report['case_coverage'].values() for name in cases}
            selected_cases = {name for id in selected for name in report['case_coverage'][id]}
            self.assertEqual(selected_cases, all_cases)
            self.assertEqual({destination for id in selected for destination in report['destination_coverage'][id]},
                             {'diagnose', 'changes', 'day'})


class NightlyTest(unittest.TestCase):
    now = acceptance.datetime.fromisoformat('2026-09-10T12:00:00+00:00')
    env = {'GITHUB_EVENT_NAME': 'schedule', 'GITHUB_REPOSITORY': 'manufactured/repo',
           'GITHUB_TOKEN': 'synthetic', 'GITHUB_RUN_ID': '123'}

    def run_data(self, age=0, **changes):
        from datetime import timedelta
        return {'id': 123, 'event': 'schedule', 'head_branch': 'main', 'status': 'completed',
                'conclusion': 'success', 'run_started_at': (self.now - timedelta(hours=age)).isoformat(),
                **changes}

    def job_data(self, **changes):
        return {'name': 'nightly result', 'status': 'completed', 'conclusion': 'success', **changes}

    def reply(self, value, code=200):
        return code, json.dumps(value).encode(), {}

    def test_first_nightly_bootstrap_passes_with_warning_and_summary(self):
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory) / 'out')
            summary = Path(directory) / 'summary.md'
            summary.write_text('Existing summary\n')
            with patch.dict(os.environ, {**self.env, 'GITHUB_STEP_SUMMARY': str(summary)}), \
                 patch.object(acceptance, 'request', return_value=self.reply({'workflow_runs': []})) as request:
                acceptance.nightly_check(run)
            request.assert_called_once()
            self.assertIn('**Warning:** No scheduled nightly has completed yet', summary.read_text())
            self.assertTrue(summary.read_text().startswith('Existing summary\n'))
            receipt = json.loads((run.out / 'nightly.json').read_text())
            self.assertEqual(receipt['state'], 'success')
            self.assertTrue(receipt['bootstrap'])

    def test_both_callers_read_the_same_aggregate_and_freshness_boundary(self):
        # A failed publication changes the workflow conclusion, not its test aggregate.
        for age, aggregate, workflow, expected in [
            (0, 'success', 'failure', 'success'),
            (36, 'success', 'success', 'success'),
            (36.001, 'success', 'success', 'failure'),
            (-1, 'success', 'success', 'failure'),
            (0, 'failure', 'success', 'failure'),
            (0, 'cancelled', 'cancelled', 'failure'),
            (0, 'skipped', 'success', 'failure'),
        ]:
            with self.subTest(age=age, aggregate=aggregate, workflow=workflow), tempfile.TemporaryDirectory() as directory:
                data = self.run_data(age, conclusion=workflow)
                jobs = {'jobs': [self.job_data(conclusion=aggregate)]}
                run = acceptance.Run(Path(directory))
                with patch.dict(os.environ, self.env), patch.object(acceptance, 'datetime', wraps=acceptance.datetime) as clock:
                    clock.now.return_value = self.now
                    with patch.object(acceptance, 'request', side_effect=[
                        self.reply({'workflow_runs': [data]}), self.reply(jobs),
                    ]) as request:
                        if expected == 'success':
                            acceptance.nightly_check(run)
                        else:
                            with self.assertRaisesRegex(RuntimeError, 'failed or older than 36 h'):
                                acceptance.nightly_check(run)
                        self.assertIn('event=schedule&branch=main&status=completed', request.call_args_list[0].args[1])
                    checked = json.loads((run.out / 'nightly.json').read_text())
                    self.assertEqual(checked['state'], expected)
                    # Publication can read the completed aggregate before the whole run ends.
                    data['status'] = 'in_progress'
                    head, merge = 'a' * 40, 'b' * 40
                    with patch.object(acceptance, 'request', side_effect=[
                        self.reply(data), self.reply(jobs),
                        self.reply([{'number': 7, 'head': {'sha': head}, 'merge_commit_sha': merge}]),
                        self.reply({}, 201), self.reply({}, 201),
                    ]) as request:
                        acceptance.nightly_publish(run)
                    self.assertEqual(request.call_args_list[0].args[1], '/repos/manufactured/repo/actions/runs/123')
                    writes = request.call_args_list[3:]
                    self.assertEqual({item.args[1] for item in writes},
                                     {f'/repos/manufactured/repo/statuses/{sha}' for sha in [head, merge]})
                    self.assertTrue(all(item.kwargs['data']['context'] == 'latest nightly' for item in writes))
                    self.assertTrue(all(item.kwargs['data']['state'] == expected for item in writes))
                    published = json.loads((run.out / 'nightly.json').read_text())
                    self.assertEqual(published['state'], checked['state'])
                    self.assertEqual(published['aggregate'], checked['aggregate'])
                    self.assertEqual(len(json.loads((run.out / 'nightly-statuses.json').read_text())), 2)

    def test_missing_unrelated_incomplete_and_api_failure_are_rejected(self):
        for replies in [
            [self.reply({}, 403)],
            *[[self.reply({'workflow_runs': [self.run_data(**changes)]})] for changes in
              [{'event': 'push'}, {'head_branch': 'other'}, {'status': 'in_progress'}]],
            [self.reply({'workflow_runs': [self.run_data()]}), self.reply({}, 403)],
            *[[self.reply({'workflow_runs': [self.run_data()]}), self.reply({'jobs': jobs})] for jobs in
              [[], [self.job_data(name='unrelated')], [self.job_data(status='in_progress')],
               [self.job_data(), self.job_data()]]],
        ]:
            with self.subTest(replies=replies), tempfile.TemporaryDirectory() as directory:
                with patch.dict(os.environ, self.env), patch.object(acceptance, 'request', side_effect=replies):
                    with self.assertRaises(RuntimeError):
                        acceptance.nightly_check(acceptance.Run(Path(directory)))

    def test_job_pagination_finds_the_named_aggregate(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, self.env), \
             patch.object(acceptance, 'datetime', wraps=acceptance.datetime) as clock:
            clock.now.return_value = self.now
            with patch.object(acceptance, 'request', side_effect=[
                self.reply({'workflow_runs': [self.run_data()]}),
                self.reply({'jobs': [self.job_data(name='other')] * 100}),
                self.reply({'jobs': [self.job_data()]}),
            ]) as request:
                acceptance.nightly_check(acceptance.Run(Path(directory)))
                self.assertIn('filter=latest&per_page=100&page=2', request.call_args.args[1])

    def test_publication_refuses_pr_execution_and_failed_api_writes(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, self.env):
            run = acceptance.Run(Path(directory))
            with patch.dict(os.environ, {'GITHUB_EVENT_NAME': 'pull_request'}), patch.object(acceptance, 'request') as request:
                with self.assertRaisesRegex(RuntimeError, 'schedule-only'):
                    acceptance.nightly_publish(run)
                request.assert_not_called()
            with patch.object(acceptance, 'request', side_effect=[
                self.reply(self.run_data()), self.reply({'jobs': [self.job_data()]}),
                self.reply([{'number': 7, 'head': {'sha': 'a' * 40}, 'merge_commit_sha': None}]),
                self.reply({}, 403),
            ]):
                with self.assertRaisesRegex(RuntimeError, 'publication failed'):
                    acceptance.nightly_publish(run)

    def test_ci_computes_one_aggregate_for_both_readers(self):
        workflow = (acceptance.REPO / '.github/workflows/ci.yml').read_text()
        result = workflow.split('  nightly-result:\n', 1)[1].split('  nightly-status:\n', 1)[0]
        self.assertIn('    name: nightly result\n', result)
        self.assertIn('    needs: [backend, docs, frontend, frontend-browser]\n', result)
        self.assertIn('    needs: nightly-result\n', workflow.split('  nightly-status:\n', 1)[1])
        command = result.split("run: python3 -c '", 1)[1].split("'", 1)[0]
        for state in ['success', 'failure', 'cancelled', 'skipped']:
            with self.subTest(state=state):
                env = {**os.environ, 'NIGHTLY_RESULTS': json.dumps({'backend': {'result': state}, 'frontend': {'result': 'success'}})}
                executed = subprocess.run([sys.executable, '-c', command], env=env, capture_output=True)
                self.assertEqual(executed.returncode, 0 if state == 'success' else 1)


if __name__ == "__main__":
    unittest.main()
