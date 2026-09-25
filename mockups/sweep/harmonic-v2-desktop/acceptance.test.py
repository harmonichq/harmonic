"""Exercise acceptance through its route-probe interface, including rejected proofs."""
import importlib.util
import json
import os
import socket
import subprocess
import sys
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
        for page in ["/", "/diagnose", "/changes", "/day"]:
            self.replies[page] = (200, b'<script src="/assets/app.js"></script>', {"cache-control": "no-cache"})
        self.replies["/assets/app.js"] = (200, b"bundled code", {"cache-control": "public, max-age=31536000, immutable"})

    def request(self, base, path, token=None):
        if path == "/api/status":
            return (200 if token == "synthetic-replay-token" else 401), b"{}", {}
        return self.replies.get(path, (404, b"not found", {}))

    def probe(self):
        with patch.object(acceptance, "request", self.request):
            return acceptance.probe("http://synthetic.invalid", "synthetic-replay-token")

    def test_shell_assets_closed_routes_and_auth_are_requested(self):
        rows = self.probe()
        self.assertEqual(len(rows), 25)
        for path in ["/", "/diagnose", "/changes", "/day"]:
            self.assertIn({"path": path, "status": 200}, rows)
        self.assertEqual([r["status"] for r in rows if r["path"] == "/api/status"], [401, 401, 200])

    def test_missing_asset_cannot_pass_on_a_served_page(self):
        del self.replies["/assets/app.js"]
        with self.assertRaisesRegex(RuntimeError, "absent packaged bytes"):
            self.probe()

    def test_cdn_reference_cannot_be_called_packaged(self):
        self.replies["/"] = (200, b'<script src="/assets/app.js"></script><script src="https://cdn.invalid/app.js"></script>', {"cache-control": "no-cache"})
        with self.assertRaisesRegex(RuntimeError, "external or misplaced asset"):
            self.probe()

    def test_an_external_font_reference_is_no_longer_admitted(self):
        # ADR 416 retired the v1 page that carried one; the desk names no host.
        code, body, headers = self.replies["/"]
        self.replies["/"] = code, body + b'<link href="https://fonts.googleapis.com/css2?family=Inter">', headers
        with self.assertRaisesRegex(RuntimeError, "external or misplaced asset"):
            self.probe()

    def test_unlisted_route_cannot_fall_back_to_the_shell(self):
        self.replies["/unlisted"] = self.replies["/"]
        with self.assertRaisesRegex(RuntimeError, "expected 404, got 200"):
            self.probe()

    def test_a_retired_address_cannot_still_be_served(self):
        for path in ["/v2/", "/v2/day", "/plan", "/verify", "/settings", "/guide"]:
            with self.subTest(path=path):
                self.replies[path] = self.replies["/"]
                with self.assertRaisesRegex(RuntimeError, f"closed route {path}: expected 404, got 200"):
                    self.probe()
                del self.replies[path]

    def test_missing_canonical_page_cannot_pass_on_root_success(self):
        for path in ["/diagnose", "/changes", "/day"]:
            with self.subTest(path=path):
                reply = self.replies.pop(path)
                with self.assertRaisesRegex(RuntimeError, f"{path}: 404"):
                    self.probe()
                self.replies[path] = reply

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


class ReplayWrapperTest(unittest.TestCase):
    ids = [f"S{i}" for i in range(1, 113)] + [f"R{i}" for i in range(1, 19)]

    def replay(self, shard=None, output=None, expected_timeout=None, base=None):
        testcase = self
        with tempfile.TemporaryDirectory() as directory:
            class Run:
                out = Path(directory)
                def command(self, name, args, *, env, timeout):
                    testcase.assertEqual(name, "complete-replay")
                    if expected_timeout is not None:
                        testcase.assertEqual(timeout, expected_timeout,
                            "the replay process ceiling stated in ACCEPTANCE.md")
                    testcase.assertEqual(args, ["node", "frontend/desk-behavior.replay.mjs"])
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
                 patch.dict(os.environ, {"PLAYWRIGHT_MODULE": "synthetic", "ONLY": "S99", "STORY_CASES": "S100=wrong"}):
                acceptance.replay(Run(), "1280x720", shard, base)
                inventory.assert_called_once()
            return json.loads((Path(directory) / "selection.json").read_text())["selected"]

    def test_complete_replay_ignores_inherited_selection(self):
        self.assertEqual(self.replay(), self.ids)

    def test_wrapper_applies_both_ceilings_stated_in_acceptance(self):
        self.replay(expected_timeout=3000)
        self.replay((1, 1), expected_timeout=960)

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
        ledger = workflow.split('  ledger:\n', 1)[1].split('  frontend-browser:\n', 1)[0]
        self.assertIn('fromJSON(needs.ledger-plan.outputs.shards)', ledger)
        self.assertIn("needs.ledger-plan.outputs.mode == 'smoke' && github.event.pull_request.base.sha", ledger)
        self.assertIn('needs.ledger-plan.outputs.count', ledger)

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
            self.assertEqual(plan['count'], 200)
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
                (root / "frontend/desk-behavior.replay.mjs").write_text(
                    "export const REGISTRY = [];\n")
                (root / "frontend/replay-cases.mjs").write_text(
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
        self.inventory([f"S{i}" for i in range(1, 182)] + [f"R{i}" for i in range(1, 20)])

    def test_same_total_cannot_hide_changed_active_retired_counts(self):
        ids = [f"S{i}" for i in range(1, 183)] + [f"R{i}" for i in range(1, 19)]
        self.assertEqual(len(ids), 200)
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
                child.return_value.wait.assert_called_once_with(timeout=1140)


class SmokeSelectionTest(unittest.TestCase):
    replay_path = 'frontend/desk-behavior.replay.mjs'
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

    # ADR 457: a tree the replay entry reaches by an import, a require and two
    # path literals — an executable it runs and a data fixture it only names.
    helper_path = 'frontend/diagnose-replay.mjs'
    pump_path = 'frontend/replay-pump.py'
    runner_path = 'frontend/case-runner.js'
    fixture_path = 'mockups/harmonic-v2.exploration/focus.json'
    tree = {
        replay_path: "import { locate } from './diagnose-replay.mjs';\n"
                     "const { launch } = require('./case-runner.js');\n"
                     "const FIXTURES = ['mockups/harmonic-v2.exploration/focus.json'];\n"
                     "export const S2 = page => locate(page);\n"
                     "export const S3 = page => page.read('unrelated');\n"
                     "export const S4 = ctx => ctx.command(['python', 'frontend/replay-pump.py']);\n",
        helper_path: "export async function locate(page) { return page.read('before'); }\n",
        pump_path: "print('pump')\n",
        runner_path: "module.exports = { launch() {} };\n",
        fixture_path: '{}\n',
    }

    app_entry = 'frontend/main.js'

    def select(self, before, after, recipe_before=None, recipe_after=None):
        """Select over two snapshots: whole trees, or the replay entry's source alone.
        Each carries an empty app entry unless it names one; None removes a path."""
        ids = [*acceptance.SMOKE_STORIES, 'S2', 'S3', 'S4', 'R10']
        def snapshot(value):
            tree = {self.app_entry: 'export {};\n', **(value if isinstance(value, dict) else {self.replay_path: value})}
            return {path: text for path, text in tree.items() if text is not None}
        snapshots = {'base': snapshot(before), 'HEAD': snapshot(after)}
        recipes = {'base': recipe_before or self.recipe, 'HEAD': recipe_after or recipe_before or self.recipe}
        changed = sorted(path for path in snapshots['base'].keys() | snapshots['HEAD'].keys()
                         if snapshots['base'].get(path) != snapshots['HEAD'].get(path))
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
            self.report = json.loads((run.out / 'smoke.json').read_text())
            return set(selected)

    def test_unchanged_diff_is_exactly_fixed_smoke(self):
        self.assertEqual(self.select(self.source, self.source), set(acceptance.SMOKE_STORIES))

    def test_replay_code_outside_a_story_table_plans_the_complete_ledger(self):
        # ADR 457 decision 11: only a story-table entry selects precisely; a
        # story function, a helper, a deletion or a tag edit elsewhere in
        # replay code plans every story, naming the key.
        every = set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}
        for label, after, key in [
                ('story function', self.source.replace('page => first(page);', "page => first(page, 'new');", 1), 'S2'),
                ('helper', self.source.replace("'before'", "'after'"), 'second'),
                ('deleted helper', self.source.replace("function second(page) { return page.read('before'); }", ''), 'second'),
                ('story tag', self.source.replace('STORY:manufactured:S2', 'STORY:renamed:S2'), 'S2')]:
            with self.subTest(change=label):
                self.assertEqual(self.select(self.source, after), every)
                self.assertIn(f'replay-side change: {self.replay_path}::{key}', self.report['reasons']['S2'])

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

    def test_an_imported_helper_edit_plans_the_complete_ledger(self):
        after = {**self.tree, self.helper_path: self.tree[self.helper_path].replace("'before'", "'after'")}
        self.assertEqual(self.select(self.tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        self.assertIn(f'replay-side change: {self.helper_path}::locate', self.report['reasons']['S2'])

    def test_an_executable_the_replay_names_by_path_selects_every_story(self):
        every = set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}
        for path, text in [(self.pump_path, "print('pump, changed')\n"),
                           (self.runner_path, 'module.exports = { launch() { return 1; } };\n')]:
            with self.subTest(path=path):
                self.assertEqual(self.select(self.tree, {**self.tree, path: text}), every)

    def test_a_data_fixture_the_replay_names_by_path_selects_only_the_fixed_slice(self):
        after = {**self.tree, self.fixture_path: '{"regenerated": true}\n'}
        self.assertEqual(self.select(self.tree, after), set(acceptance.SMOKE_STORIES))

    def test_every_literal_path_form_to_an_executable_selects_every_story(self):
        every = set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}
        worker = 'frontend/replay-worker.mjs'
        replay = self.tree[self.replay_path]
        for form, source, path in [
                ('extensionless require', replay.replace("require('./case-runner.js')", "require('./case-runner')"), self.runner_path),
                ('template literal', replay.replace("'frontend/replay-pump.py'", '`frontend/replay-pump.py`'), self.pump_path),
                ('new URL', "const WORKER = new URL('replay-worker.mjs', import.meta.url);\n" + replay, worker)]:
            with self.subTest(form=form):
                tree = {**self.tree, self.replay_path: source, worker: 'export {};\n'}
                self.assertEqual(self.select(tree, {**tree, path: tree[path] + '// changed\n'}), every)

    def test_a_literal_path_the_selection_cannot_resolve_stops_the_plan(self):
        for form, line in [('require', "const { absent } = require('./absent-runner');"),
                           ('template', 'const PUMP = `${ROOT}/frontend/replay-pump.py`;'),
                           ('computed URL', 'const WORKER = new URL(name, import.meta.url);'),
                           ('absent URL', "const WORKER = new URL('./absent-worker.mjs', import.meta.url);"),
                           ('relative literal', "const PUMP = './absent-pump.py';"),
                           ('repository literal', "const PUMP = 'scripts/absent.py';")]:
            with self.subTest(form=form):
                self.assertStops({**self.tree, self.replay_path: line + '\n' + self.tree[self.replay_path]},
                                 'cannot resolve', self.replay_path)

    def test_a_helper_that_wraps_every_story_at_top_level_selects_every_wrapped_story(self):
        # c2's shape: a module-level loop runs every story in the table through
        # one helper, which only that top-level text names.
        stories = 'frontend/c2.replay.mjs'
        tree = {**self.tree,
                self.helper_path: self.tree[self.helper_path] + 'export function bounded(promise) { return promise; }\n',
                stories: "import { bounded } from './diagnose-replay.mjs';\n"
                         "export const C2_STORIES = {\n  S3: page => page.read('three'),\n  S4: page => page.read('four'),\n};\n"
                         "for (const [id, run] of Object.entries(C2_STORIES)) {\n"
                         "  C2_STORIES[id] = (...args) => bounded(run(...args));\n}\n"}
        helper = {**tree, self.helper_path: tree[self.helper_path].replace('return promise;', 'return promise.then(x => x);')}
        self.assertEqual(self.select(tree, helper), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        # The table itself is the roots, not a dependency: one entry's edit
        # selects that story alone.
        entry = {**tree, stories: tree[stories].replace("'three'", "'three, changed'")}
        self.assertEqual(self.select(tree, entry), set(acceptance.SMOKE_STORIES) | {'S3'})

    def test_a_helper_reached_through_a_top_level_destructure_selects_its_callers(self):
        tree = {**self.tree,
                self.helper_path: "export function make() { return { locate: page => page.read('before') }; }\n",
                self.replay_path: self.tree[self.replay_path].replace(
                    "import { locate } from './diagnose-replay.mjs';\n",
                    "import { make } from './diagnose-replay.mjs';\nconst { locate } = make();\n")}
        after = {**tree, self.helper_path: tree[self.helper_path].replace("'before'", "'after'")}
        self.assertEqual(self.select(tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})

    def select_real(self, path, old, new):
        """Select over the committed tree against itself with one edit at HEAD."""
        def show(*args):
            return subprocess.run(['git', *args], cwd=acceptance.REPO, capture_output=True, text=True, check=True).stdout
        def git(args, **kwargs):
            if args[1] == 'merge-base': return 'base\n'
            if args[1] == 'rev-parse': return 'head\n'
            if args[1] == 'diff': return path
            if args[1] == 'ls-tree': return show('ls-tree', '-r', '--name-only', 'HEAD')
            if args[1] == 'show':
                ref, name = args[2].split(':', 1)
                text = show('show', f'HEAD:{name}')
                if ref == 'HEAD' and name == path:
                    self.assertIn(old, text)
                    text = text.replace(old, new, 1)
                return text
            self.fail(f'unexpected git command: {args}')
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            ids = acceptance.inventory(run)
            with patch.object(acceptance.subprocess, 'check_output', side_effect=git):
                selected = acceptance.smoke_selection(run, 'base', ids)
            self.report = json.loads((run.out / 'smoke.json').read_text())
        return ids, selected

    def test_a_changed_key_no_single_story_owns_selects_the_complete_ledger(self):
        # ADR 457 decision 11: J (a registry row builder) and VIEWPORTS are
        # replay constants, not story entries.
        replay = 'frontend/desk-behavior.replay.mjs'
        for key, old, new in [
                ('J', "const J = (state = 'investigate') => ({ source: 'journey', state });",
                 "const J = (state = 'inspect') => ({ source: 'journey', state });"),
                ('VIEWPORTS', "'1440x900': { width: 1440, height: 900 }", "'1440x900': { width: 1440, height: 901 }")]:
            with self.subTest(key=key):
                ids, selected = self.select_real(replay, old, new)
                self.assertEqual(selected, ids)
                self.assertTrue(any(f'{replay}::{key}' in reason for reason in self.report['reasons'][ids[0]]),
                                self.report['reasons'][ids[0]])

    def test_a_change_the_per_story_runner_reaches_selects_every_story(self):
        # ADR 457: main's loop and openApp run for every story; the base URL
        # and ok are replay constants, not story entries.
        replay = 'frontend/desk-behavior.replay.mjs'
        for key, old, new in [
                ('APP_BASE_URL', "process.env.BASE_URL || 'http://127.0.0.1:8765'",
                 "process.env.BASE_URL || 'http://127.0.0.1:8766'"),
                ('ok', 'export const ok = (condition, what) => { if (!condition) fail(what); };',
                 'export const ok = (condition, what) => {};')]:
            with self.subTest(key=key):
                ids, selected = self.select_real(replay, old, new)
                self.assertEqual(selected, ids)
                self.assertTrue(all(any(f'{replay}::{key}' in reason for reason in self.report['reasons'][identity])
                                    for identity in ids))

    def test_a_story_table_entry_edit_selects_that_story_alone(self):
        # ADR 457 decision 11: S82 runs S21, which polls. The retry primitive's
        # deadline is a store read, and it only goes to setTimeout as the
        # delay, a read position, so nothing S82 reaches is unsafe.
        _, selected = self.select_real('frontend/c2.replay.mjs', 'S82: async page => C2_STORIES.S21(page),',
                                       "S82: async page => C2_STORIES.S21(page, 'changed'),")
        self.assertEqual([identity for identity in selected if identity not in acceptance.SMOKE_STORIES], ['S82'])
        self.assertEqual(self.report['reasons']['S82'], ['frontend/c2.replay.mjs::C2_STORIES.S82'])

    def test_a_story_entry_passing_module_state_to_an_unknown_callee_plans_the_complete_ledger(self):
        # S152 passes the module-level RECOMMENDED_VALUE pattern to assert.match,
        # an import outside the read-only built-ins.
        ids, selected = self.select_real('frontend/c4.replay.mjs', "assert.ok(lane, 'S152 premise:",
                                         "assert.ok(lane, 'S152 premise (changed):")
        self.assertEqual(selected, ids)
        self.assertTrue(any(reason.startswith('replay-side change: frontend/c4.replay.mjs::C4_STORIES.S152 (reaches impure ')
                            and 'frontend/c4.replay.mjs::C4_STORIES.S152' in reason.split('(', 1)[1]
                            for reason in self.report['reasons'][ids[0]]), self.report['reasons'][ids[0]])

    def test_a_product_function_no_story_calls_leaves_the_fixed_slice(self):
        # ADR 457: the app's entry reaches plan.js, so it is product code; the
        # stories reach it through the browser, under the fixed PR slice.
        _, selected = self.select_real('frontend/plan.js', '  return !!item && item.asserts_move === true;',
                                       '  return Boolean(item) && item.asserts_move === true;')
        self.assertEqual(set(selected), set(acceptance.SMOKE_STORIES))
        self.assertIn('frontend/plan.js', self.report['product_modules'])

    def test_a_product_function_a_story_calls_selects_that_story(self):
        _, selected = self.select_real('frontend/plan.js', 'const used = deliverableSegmentCount(rows || []);',
                                       'const used = deliverableSegmentCount(rows ?? []);')
        self.assertEqual([identity for identity in selected if identity not in acceptance.SMOKE_STORIES], ['S90'])
        self.assertEqual(self.report['reasons']['S90'], ['frontend/plan.js::segmentCapacity'])

    def test_an_app_entry_that_cannot_be_read_stops_the_plan(self):
        for label, entry, named in [('absent', None, 'frontend/main.js is not tracked'),
                                    ('unparseable', 'import {', 'frontend/main.js: ')]:
            with self.subTest(entry=label):
                self.assertStops({**self.tree, self.app_entry: entry}, named)

    def test_a_rail_row_helper_edit_plans_the_complete_ledger(self):
        ids, selected = self.select_real('frontend/diagnose-replay.mjs', 'if (await row.count()) return row;',
                                         'if (await row.count()) { return row; }')
        self.assertEqual(selected, ids)
        self.assertIn('replay-side change: frontend/diagnose-replay.mjs::railRowLocator', self.report['reasons'][ids[0]])

    def test_a_clean_story_table_entry_edit_selects_that_story_alone(self):
        for path, old, new, story in [
                ('frontend/c3.replay.mjs', "await press(page, '[data-action=\"watch\"]');\n    await page.locator('.gf-stage-trial').waitFor();",
                 "await press(page, '[data-action=\"watch\"]');\n    await page.locator('.gf-stage-trial').waitFor({ timeout: 30000 });", 'S45b'),
                ('frontend/c4.replay.mjs', "'S101 custom Window chip contains only the span'",
                 "'S101 custom Window chip holds only the span'", 'S101')]:
            with self.subTest(story=story):
                _, selected = self.select_real(path, old, new)
                self.assertEqual([identity for identity in selected if identity not in acceptance.SMOKE_STORIES], [story])

    def test_an_import_line_edit_plans_the_complete_ledger(self):
        tree = {**self.tree, self.helper_path: self.tree[self.helper_path] + 'export function unused() {}\n'}
        after = {**tree, self.replay_path: tree[self.replay_path].replace('{ locate }', '{ locate, unused }')}
        self.assertEqual(self.select(tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})

    # ADR 457 decision 11: a story table beside module state, and the shapes
    # that reach other stories without naming them.
    stories_path = 'frontend/c2.replay.mjs'
    stories = ("import { locate } from './diagnose-replay.mjs';\nimport assert from 'node:assert/strict';\n"
               "import { setTimeout as delay } from 'node:timers/promises';\n"
               "class Registry { static items = []; }\nfunction memo() {}\nmemo.list = [];\n"
               "let visits = 0;\nconst STATE = {};\nconst CACHE = new Map();\nconst WIDTH = process.env.WIDTH || 1280;\n"
               "function remember(page) { STATE.last = page; return page; }\n"
               "function stash(page) { CACHE.set('page', page); return page; }\n"
               "function tag(target) { target.seen = true; return target; }\n"
               "function relay(target) { return tag(target); }\n"
               "function peek(target) { return target.last; }\n"
               "function echo(target) { return target; }\n"
               "export const C2_STORIES = {\n  S3: page => page.read('three'),\n  S4: page => locate(page),\n};\n")

    def test_replay_shapes_that_reach_other_stories_plan_the_complete_ledger(self):
        tree = {**self.tree, self.stories_path: self.stories}
        entry = "  S3: page => page.read('three'),\n"
        for shape, source in [
                ('process handler', self.stories + "process.on('exit', () => {});\n"),
                ('environment default', self.stories.replace('|| 1280', '|| 1440')),
                ('entry alias', self.stories + 'C2_STORIES.S3 = C2_STORIES.S4;\n'),
                ('wrapping loop', self.stories + 'for (const [id, run] of Object.entries(C2_STORIES)) '
                                                 'C2_STORIES[id] = page => locate(run(page));\n'),
                ('this', self.stories.replace(entry, '  S3(page) { return this.S4(page); },\n')),
                ('getter', self.stories.replace(entry, "  get S3() { return page => page.read('three'); },\n")),
                ('module state', self.stories.replace(entry, "  S3: page => { visits += 1; return page.read('three'); },\n")),
                ('module state member', self.stories.replace(entry, "  S3: page => { STATE.last = 'S3'; return page.read('three'); },\n")),
                ('method on module state', self.stories.replace(entry, "  S3: page => { STATE.list.push('S3'); return page.read('three'); },\n")),
                ('call to a writing helper', self.stories.replace(entry, "  S3: page => remember(page).read('three'),\n")),
                ('call to a helper using a method on module state', self.stories.replace(entry, "  S3: page => stash(page).read('three'),\n")),
                ('module state into an unknown callee', self.stories.replace(entry, "  S3: page => page.read(STATE.last),\n")),
                ('module state into a constructor', self.stories.replace(entry, "  S3: page => { new Proxy(STATE, {}); return page.read('three'); },\n")),
                ('module state into a mutating built-in', self.stories.replace(entry, "  S3: page => { Object.assign(STATE, { last: 'S3' }); return page.read('three'); },\n")),
                ('module state into a helper that mutates it', self.stories.replace(entry, "  S3: page => page.read(tag(STATE).seen),\n")),
                ('module state relayed to a helper that mutates it', self.stories.replace(entry, "  S3: page => page.read(relay(STATE).seen),\n")),
                ('an iteration that mutates module state', self.stories.replace(entry, "  S3: page => { STATE.list.forEach(item => { item.seen = true; }); return page.read('three'); },\n")),
                ('module state through a local alias', self.stories.replace(entry, "  S3: page => { const list = STATE.list; list.push('S3'); return page.read('three'); },\n")),
                ('a write through a for-of variable', self.stories.replace(entry, "  S3: page => { for (const item of STATE.list) { item.seen = true; } return page.read('three'); },\n")),
                ('a parameter defaulted to module state', self.stories.replace(entry, "  S3: (page, target = STATE) => { target.seen = true; return page.read('three'); },\n")),
                ('a computed method on module state', self.stories.replace(entry, "  S3: page => { STATE.list['push']('S3'); return page.read('three'); },\n")),
                ('a write to a read method result held in a local', self.stories.replace(entry, "  S3: page => { const value = CACHE.get('page'); value.seen = true; return page.read('three'); },\n")),
                ('a write to a read method result', self.stories.replace(entry, "  S3: page => { STATE.list.find(item => item.seen).done = true; return page.read('three'); },\n")),
                ('a write to module state a helper hands back', self.stories.replace(entry, "  S3: page => { echo(STATE).seen = true; return page.read('three'); },\n")),
                ('a read method result passed to an unknown callee', self.stories.replace(entry, "  S3: page => page.read(CACHE.get('page')),\n")),
                ('module state as a timer callback', self.stories.replace(entry, "  S3: page => { setTimeout(STATE.handler, 0); return page.read('three'); },\n")),
                ('a global changed through a call', self.stories.replace(entry, "  S3: page => { Object.assign(process.env, { STORY: 'S3' }); return page.read('three'); },\n")),
                ('a global written in Node', self.stories.replace(entry, "  S3: page => { globalThis.lastStory = 'S3'; return page.read('three'); },\n")),
                ('another process method', self.stories.replace(entry, "  S3: page => { process.exitCode = 0; process.exit(0); return page.read('three'); },\n")),
                ('a computed environment read', self.stories.replace(entry, "  S3: page => page.read(process.env[STATE.name]),\n")),
                ('an environment write', self.stories.replace(entry, "  S3: page => { process.env.STORY = 'S3'; return page.read('three'); },\n")),
                ('a built-in changed through a call', self.stories.replace(entry, "  S3: page => { Object.assign(JSON, { story: 'S3' }); return page.read('three'); },\n")),
                ('a built-in prototype redefined', self.stories.replace(entry, "  S3: page => { Object.defineProperty(Array.prototype, 'includes', { value: () => true }); return page.read('three'); },\n")),
                ('a built-in member passed on', self.stories.replace(entry, "  S3: page => page.read(Array.prototype),\n")),
                ('a write through a spread copy of a global', self.stories.replace(entry, "  S3: page => { const proc = { ...process }; proc.env.STORY = 'S3'; return page.read('three'); },\n")),
                ('a write through a spread copy of module state', self.stories.replace(entry, "  S3: page => { for (const item of [...STATE.list]) item.seen = true; return page.read('three'); },\n")),
                ('a write through a literal holding module state', self.stories.replace(entry, "  S3: page => { const box = { list: STATE.list }; box.list.push('S3'); return page.read('three'); },\n")),
                ('a write in a mapper handed module state', self.stories.replace(entry, "  S3: page => { Array.from(STATE.list, item => { item.seen = true; }); return page.read('three'); },\n")),
                ('a class static field', self.stories.replace(entry, "  S3: page => { Registry.items.push('S3'); return page.read('three'); },\n")),
                ('a function-object property', self.stories.replace(entry, "  S3: page => { memo.list.push('S3'); return page.read('three'); },\n"))]:
            with self.subTest(shape=shape):
                self.assertEqual(self.select(tree, {**tree, self.stories_path: source}), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})

    def test_an_edit_to_a_node_or_package_import_plans_the_complete_ledger(self):
        tree = {**self.tree, self.stories_path: self.stories}
        every = set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}
        for label, source in [
                ('a changed binding', self.stories.replace('setTimeout as delay', 'setImmediate as delay')),
                ('a changed source', self.stories.replace("'node:assert/strict'", "'node:assert'")),
                ('a new Node import', "import { writeFileSync } from 'node:fs';\n" + self.stories),
                ('a new package import', "import { chromium } from 'playwright';\n" + self.stories)]:
            with self.subTest(edit=label):
                self.assertEqual(self.select(tree, {**tree, self.stories_path: source}), every)
                self.assertIn(f'replay-side import change: {self.stories_path}', self.report['reasons']['S2'])
        entry_only = self.stories.replace("page.read('three')", "page.read('three, changed')")
        self.assertEqual(self.select(tree, {**tree, self.stories_path: entry_only}), set(acceptance.SMOKE_STORIES) | {'S3'})

    def test_story_entries_that_write_no_module_state_select_precisely(self):
        tree = {**self.tree, self.stories_path: self.stories,
                'frontend/c3.replay.mjs': "export const C3_STORIES = {\n  S2: page => page.read('two'),\n};\n",
                'frontend/c4.replay.mjs': "export const C4_RETIREMENTS = {\n  R10: page => page.read('retired'),\n};\n",
                self.replay_path: "import { C4_RETIREMENTS } from './c4.replay.mjs';\n"
                                  "export const R10 = page => C4_RETIREMENTS.R10(page);\n" + self.tree[self.replay_path]}
        for label, path, old, new, story in [
                ('C2 entry', self.stories_path, "page.read('three')", "page.read('three, changed')", 'S3'),
                ('C2 entry reading module state', self.stories_path, "page.read('three')", 'page.read(String(STATE.last))', 'S3'),
                ('C2 entry calling a pure helper', self.stories_path, "page.read('three')", 'locate(page)', 'S3'),
                ('C2 entry calling a sibling entry', self.stories_path, "page.read('three')", 'C2_STORIES.S4(page)', 'S3'),
                ('C2 entry reading module state through primitive reads', self.stories_path, "page.read('three')",
                 "page.read(CACHE.has('page') && STATE.list?.includes('three') ? 'three' : 'four')", 'S3'),
                ('C2 entry branching on a primitive read', self.stories_path, "page.read('three')",
                 "(CACHE.has('page') ? page.read('three') : page.read('four'))", 'S3'),
                ('C2 entry comparing a mapped length', self.stories_path, "page.read('three')",
                 "page.read(STATE.list.map(item => item.name).length > 0 ? 'three' : 'none')", 'S3'),
                ('C2 entry passing module state to a read-only built-in', self.stories_path, "page.read('three')",
                 'page.read(JSON.stringify(Object.keys(STATE)))', 'S3'),
                ('C2 entry passing module state to a helper that only reads it', self.stories_path, "page.read('three')",
                 'page.read(String(peek(STATE)))', 'S3'),
                ('C2 entry using module state as a timer delay', self.stories_path, "page.read('three')",
                 "(setTimeout(() => {}, STATE.delay), page.read('three'))", 'S3'),
                ('C2 entry reading a global', self.stories_path, "page.read('three')",
                 "page.read(process.env.CI ? 'three' : 'four')", 'S3'),
                ('C2 entry reading the page inside the page', self.stories_path, "page.read('three')",
                 "page.evaluate(() => document.querySelector('h1').textContent)", 'S3'),
                ('C2 entry encoding module state', self.stories_path, "page.read('three')",
                 'page.read(encodeURIComponent(STATE.name) + decodeURI(encodeURI(STATE.path)) + decodeURIComponent(STATE.raw))', 'S3'),
                ('C2 entry building a query from module state', self.stories_path, "page.read('three')",
                 'page.read(new URLSearchParams(STATE.query).toString())', 'S3'),
                ('C2 entry writing output', self.stories_path, "page.read('three')",
                 "(process.stdout.write('S3\\n'), process.stderr.write('S3\\n'), page.read('three'))", 'S3'),
                ('C2 entry passing an environment value on', self.stories_path, "page.read('three')",
                 'page.read({ dir: process.env.HOME }.dir)', 'S3'),
                ('C2 entry stringifying module state', self.stories_path, "page.read('three')",
                 'page.read(JSON.stringify(STATE))', 'S3'),
                ('C2 entry calling a built-in function', self.stories_path, "page.read('three')",
                 'page.read(String(Math.max(1, 2)))', 'S3'),
                ('C2 entry asserting through a Node import', self.stories_path, "page.read('three')",
                 "(assert.equal(1, 1), page.read('three'))", 'S3'),
                ('C2 entry calling a class and a function binding', self.stories_path, "page.read('three')",
                 "(new Registry(), memo(), page.read('three'))", 'S3'),
                ('C3 entry', 'frontend/c3.replay.mjs', "'two'", "'two, changed'", 'S2'),
                ('retired entry', 'frontend/c4.replay.mjs', "'retired'", "'retired, changed'", 'R10')]:
            with self.subTest(entry=label):
                self.assertEqual(self.select(tree, {**tree, path: tree[path].replace(old, new)}),
                                 set(acceptance.SMOKE_STORIES) | {story})

    def test_a_story_entry_changing_an_imported_story_table(self):
        # ADR 457 decision 11: a table imported from another replay-side module
        # is shared state; only a proven read keeps the entry precise.
        other = 'frontend/c4.replay.mjs'
        tree = {**self.tree, self.stories_path: self.stories,
                other: "import { C2_STORIES } from './c2.replay.mjs';\n"
                       "export const C4_STORIES = {\n  S2: page => page.read('two'),\n};\n"}
        entry = "  S2: page => page.read('two'),\n"
        for label, body, expected in [
                ('Object.assign', "  S2: page => { Object.assign(C2_STORIES, { S3: () => 0 }); return page.read('two'); },\n", set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}),
                ('Reflect.set', "  S2: page => { Reflect.set(C2_STORIES, 'S3', () => 0); return page.read('two'); },\n", set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}),
                ('a write through a local alias', "  S2: page => { const table = C2_STORIES; table.S3 = () => 0; return page.read('two'); },\n", set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'}),
                ('a plain read', "  S2: page => page.read(typeof C2_STORIES.S3),\n", set(acceptance.SMOKE_STORIES) | {'S2'}),
                ('a call to one of its entries', "  S2: page => C2_STORIES.S3(page),\n", set(acceptance.SMOKE_STORIES) | {'S2'})]:
            with self.subTest(change=label):
                self.assertEqual(self.select(tree, {**tree, other: tree[other].replace(entry, body)}), expected)

    def test_a_registry_row_that_runs_another_story_plans_the_complete_ledger(self):
        tree = {**self.tree, self.stories_path: self.stories,
                self.replay_path: self.tree[self.replay_path] + "export const REGISTRY = [['S2', S2], ['S3', S4]];\n"}
        after = {**tree, self.stories_path: self.stories.replace("'three'", "'three, changed'")}
        self.assertEqual(self.select(tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        self.assertIn('registry row S3 does not run S3', self.report['reasons']['S2'])

    def test_a_product_function_the_runner_calls_selects_every_story(self):
        # The per-story runner reaches it, so every story reaches it.
        library = 'frontend/app-library.js'
        tree = {**self.tree, self.app_entry: "import { shipped } from './app-library.js';\n",
                library: 'export function shipped() { return 1; }\n',
                self.replay_path: "import { shipped } from './app-library.js';\n"
                                  'export async function main() { return shipped(); }\n' + self.tree[self.replay_path]}
        self.assertEqual(self.select(tree, {**tree, library: tree[library].replace('return 1', 'return 2')}), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        self.assertIn(library, self.report['product_modules'])

    def test_a_story_table_change_beyond_its_entries_selects_the_complete_ledger(self):
        stories = 'frontend/c2.replay.mjs'
        tree = {**self.tree, stories: "const EXTRA = {};\n"
                "export const C2_STORIES = {\n  S3: page => page.read('three'),\n  S4: page => page.read('four'),\n};\n"}
        after = {**tree, stories: tree[stories].replace('= {\n', '= {\n  ...EXTRA,\n')}
        self.assertEqual(self.select(tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        self.assertIn(f"replay-side change: {stories}::C2_STORIES", self.report['reasons']['S2'])

    def test_a_deleted_helper_module_is_recorded_and_selects_its_former_callers(self):
        after = {path: text for path, text in self.tree.items() if path != self.helper_path}
        after[self.replay_path] = after[self.replay_path].replace(
            "import { locate } from './diagnose-replay.mjs';\n", '').replace('locate(page)', "page.read('before')")
        self.assertEqual(self.select(self.tree, after), set(acceptance.SMOKE_STORIES) | {'S2', 'S3', 'S4', 'R10'})
        self.assertIn(self.helper_path, self.report['replay_modules'])

    def assertStops(self, tree, *named):
        with self.assertRaises(RuntimeError) as stopped:
            self.select(tree, tree)
        for text in named:
            self.assertIn(text, str(stopped.exception))

    def test_an_import_of_an_untracked_file_stops_the_plan(self):
        self.assertStops({**self.tree, self.replay_path: self.tree[self.replay_path].replace(
            './diagnose-replay.mjs', './missing.mjs')}, 'no tracked file', 'frontend/missing.mjs')

    def test_a_dynamic_import_in_an_imported_module_stops_the_plan(self):
        self.assertStops({**self.tree, self.helper_path:
            "export async function locate(page) { return (await import('./late.mjs')).x; }\n"},
            'dynamic import()', self.helper_path)

    def test_eval_or_the_function_constructor_stops_the_plan(self):
        entry = "  S3: page => page.read('three'),\n"
        for label, body in [('eval', "  S3: page => eval('page.read(1)'),\n"),
                            ('indirect eval', "  S3: page => (0, eval)('1'),\n"),
                            ('Function constructor', "  S3: page => new Function('page', 'return page')(page),\n")]:
            with self.subTest(form=label):
                self.assertStops({**self.tree, self.stories_path: self.stories.replace(entry, body)},
                                 'eval or the Function constructor', self.stories_path)

    def test_an_import_form_the_graph_cannot_follow_stops_the_plan(self):
        for line, form in [("import './diagnose-replay.mjs';", 'side-effect import'),
                           ("import helper from './diagnose-replay.mjs';", 'default import'),
                           ("import { default as helper } from './diagnose-replay.mjs';", '{ default as … } import'),
                           ("import * as helper from './diagnose-replay.mjs';", 'namespace import'),
                           ("export { locate } from './diagnose-replay.mjs';", 'export … from'),
                           ("export * from './diagnose-replay.mjs';", 'export * from')]:
            with self.subTest(line=line):
                self.assertStops({**self.tree, self.replay_path: line + '\n' + self.tree[self.replay_path]},
                                 f"{self.replay_path}: {form} not followed: './diagnose-replay.mjs'")

    def test_a_dependency_without_a_node_stops_the_plan(self):
        self.assertStops({**self.tree,
            self.helper_path: "async function locate(page) { return page.read('before'); }\nexport { locate as found };\n",
            self.replay_path: self.tree[self.replay_path].replace('{ locate }', '{ found as locate }')},
            'no node', f'{self.helper_path}::found')

    def test_fixed_slice_is_pinned_and_covers_every_real_replay_case(self):
        import hashlib
        # #413: S113 joins the slice because it is the only story on the
        # manufactured `basal-verdict-gallery` store, and the slice covers every
        # real replay case. #424: S125 and S126 join it for the same reason, as
        # the only stories on `behavioral-missed-meal` and
        # `behavioral-correction-stacking`. #451: S177 joins it as the only
        # story on `isf-strengthen`. #459: S187 joins it as the only story on
        # `basal-and-carb-ratio-lower`. #462: S188 joins it as the only story on
        # `c4-isf-late-read`. #465: S190 joins it as the only story on
        # `basal-recurring-low-within-floor`. #466: S191 joins it as the only
        # story on `basal-recurring-low-spread`. #467: S192 joins it as the only
        # story on `basal-recurring-low-lower`.
        self.assertEqual(len(set(acceptance.SMOKE_STORIES)), 30)
        self.assertEqual(hashlib.sha256(','.join(acceptance.SMOKE_STORIES).encode()).hexdigest(),
                         '919d72303fa1b2c7dadacbce61f8e4dc6d2e8e245a03685f049f43cf08b5bd39')
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
