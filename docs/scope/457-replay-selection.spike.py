"""#457 spike: the PR ledger's story selection must see every module the replay loads.

Port-free. `acceptance.smoke_selection` parses only `frontend/*.replay.mjs` and
`frontend/replay-cases.mjs`, and its graph resolves an import only when the
target is one of those files. So an edit to a shared replay helper the stories
import (`frontend/diagnose-replay.mjs`, `frontend/replay-assertions.mjs`, a
product module a story imports) selects nothing beyond the fixed smoke slice.
Neither does a file the replay loads by path at run time
(`frontend/replay-pump.py`).

`spike_selection` below is a marked copy of `smoke_selection` with the two
changes the second ADR 457 record specifies ("The PR ledger's story selection
follows every module the replay loads"). The tests contrast it with the
function shipped at b03431d2 over fake Git snapshots, then run it over the real
tree. The contrasts assert the b03431d2 function is blind, so they are a record
of the base, not a check to rerun once the change lands.

    uv run python docs/scope/457-replay-selection.spike.py
"""
import importlib.util
import json
import posixpath
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

REPO = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location(
    "acceptance", REPO / "mockups/sweep/harmonic-v2-desktop/acceptance.py")
acceptance = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceptance)
require = acceptance.require


def replay_imports(run, sources):
    """Each file's relative import targets, the relative forms the graph cannot map, and any
    dynamic import(), read with the pinned parser."""
    payload = run.out / "replay-import-sources.json"
    payload.write_text(json.dumps(sources))
    script = r"""
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');
const files = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const dynamic = node => node && typeof node === 'object' && (node.type === 'Import'
  || Object.entries(node).some(([key, value]) => !['loc', 'start', 'end'].includes(key)
    && (Array.isArray(value) ? value.some(dynamic) : dynamic(value))));
// The graph follows named and namespace imports only. Any other relative form
// would leave a dependency it cannot map, so it is reported to stop the plan.
const unfollowable = node => {
  if (node.type === 'ExportAllDeclaration') return 'export * from';
  if (node.type === 'ExportNamedDeclaration') return 'export … from';
  if (!node.specifiers.length) return 'side-effect import';
  if (node.specifiers.some(spec => spec.type === 'ImportDefaultSpecifier')) return 'default import';
  if (node.specifiers.some(spec => spec.type === 'ImportSpecifier'
    && (spec.imported.name ?? spec.imported.value) === 'default')) return '{ default as … } import';
  return null;
};
const result = {};
for (const [file, source] of Object.entries(files)) {
  const targets = new Set(), forms = [];
  const program = parse(source, { sourceType: 'module' }).program;
  for (const node of program.body) {
    const value = node.source?.value;
    if (typeof value === 'string' && value.startsWith('.')) {
      targets.add(posix.normalize(posix.join(posix.dirname(file), value)));
      const form = unfollowable(node);
      if (form) forms.push(`${form} '${value}'`);
    }
  }
  result[file] = { targets: [...targets].sort(), dynamic: dynamic(program), forms };
}
console.log(JSON.stringify(result));
"""
    _, output = run.command("replay-imports", ["node", "--input-type=module", "-e", script, str(payload)])
    return json.loads(output)


def replay_sources(run, git, ref):
    """Change 1: the replay entries plus every module they reach by a relative static import."""
    tracked = set(git("ls-tree", "-r", "--name-only", ref).splitlines())
    entries = [p for p in tracked
               if p.startswith("frontend/") and (p.endswith(".replay.mjs") or p == "frontend/replay-cases.mjs")]
    files = {path: git("show", f"{ref}:{path}") for path in sorted(entries)}
    while True:
        found = replay_imports(run, files)
        dynamic = sorted(path for path, entry in found.items() if entry["dynamic"])
        require(not dynamic, f"replay modules use a dynamic import() the selection cannot follow: {dynamic}")
        forms = sorted(f"{path}: {form}" for path, entry in found.items() for form in entry["forms"])
        require(not forms, f"replay modules use an import form the selection cannot follow: {forms}")
        wanted = {target for entry in found.values() for target in entry["targets"]} - files.keys()
        unresolved = sorted(wanted - tracked)
        require(not unresolved, f"replay imports resolve to no tracked file at {ref}: {unresolved}")
        if not wanted:
            return files, tracked
        files.update({path: git("show", f"{ref}:{path}") for path in sorted(wanted)})


CODE = (".py", ".js", ".mjs", ".cjs")
QUOTED = re.compile(r"'([^'\\\n]+)'|\"([^\"\\\n]+)\"")


def dangling(graph, modules):
    """Change 1, last guard: a dependency naming a replay module where the graph has no node."""
    return sorted({f"{dep.split('::', 1)[0]} ({dep})" for node in graph.values() for dep in node["deps"]
                   if dep.split("::", 1)[0] in modules and dep not in graph})


def path_loads(graph, tracked, modules):
    """Change 2: executable files the replay names by a literal path but does not import.

    Strings come from each declaration's parsed literals, plus the quoted
    literals of the module-level statements the graph keeps only as `@module`
    text (a destructured `require('./browser-runner.js')`). Data files named by
    path are left out: the replay only checks the exploration fixtures exist,
    and the committed showcase follows its generator and recipes."""
    loads = set()
    for key, node in graph.items():
        file, name = key.split("::", 1)
        values = set(node.get("strings", []))
        if name == "@module":
            values |= {single or double for single, double in QUOTED.findall(node["text"])}
        for value in values:
            candidate = posixpath.normpath(posixpath.join(posixpath.dirname(file), value)) \
                if value.startswith(("./", "../")) else value
            if candidate.endswith(CODE) and candidate in tracked and candidate not in modules:
                loads.add(candidate)
    return loads


def spike_selection(run, base, ids):
    """smoke_selection, with the two changes marked. Everything else is copied unchanged."""
    def git(*args):
        return acceptance.subprocess.check_output(["git", *args], cwd=acceptance.REPO, text=True)

    base = git("merge-base", base, "HEAD").strip()
    changed_files = set(git("diff", "--name-only", base, "HEAD").splitlines())
    sources, recipes, tracked = [], [], []
    for ref in [base, "HEAD"]:
        files, listed = replay_sources(run, git, ref)                          # change 1
        sources.append(files)
        tracked.append(listed)
        recipes.append(acceptance.recipe_graph(git("show", f"{ref}:scripts/qa_e2e_cases.py")))
    before, after = acceptance.replay_graph(run, sources)
    for graph, files in [(before, sources[0]), (after, sources[1])]:
        missing = dangling(graph, files.keys())                                 # change 1
        require(not missing, f"replay dependencies name no node in their module: {missing}")
    changed = {key for key in before.keys() | after.keys() if before.get(key) != after.get(key)}
    changed_recipes = {key for key in recipes[0].keys() | recipes[1].keys()
                       if recipes[0].get(key) != recipes[1].get(key)}
    _, output = run.command("story-cases", ["node", "--input-type=module", "-e",
        "import {REGISTRY} from './frontend/desk-behavior.replay.mjs';"
        "import {storyCase} from './frontend/replay-cases.mjs';"
        "console.log(JSON.stringify(Object.fromEntries(REGISTRY.map(([id])=>[id,storyCase(id)]))))"])
    defaults = json.loads(next(line for line in output.splitlines() if line.startswith("{")))
    case_names = {key.removeprefix("case:") for graph in recipes for key in graph if key.startswith("case:")}
    selected, reasons = set(acceptance.SMOKE_STORIES), {}
    global_files = {"scripts/gen_qa_e2e_db.py", "frontend/replay-cases.mjs",
                    "frontend/capture.mjs", "frontend/browser-runner.js",
                    "mockups/sweep/harmonic-v2-desktop/acceptance.py", "package-lock.json"}
    global_symbols = {"frontend/desk-behavior.replay.mjs::" + name
                      for name in ["REGISTRY", "main", "openApp", "requireEnvironment", "requireAssets"]}
    loaded = path_loads(before, tracked[0], sources[0].keys()) | path_loads(after, tracked[1], sources[1].keys())  # change 2
    global_change = bool(changed_files & (global_files | loaded) or changed & global_symbols)
    for identity in ids:
        touched, used_cases = set(), {defaults[identity]}
        for graph in [before, after]:
            roots = [f"frontend/c{chunk}.replay.mjs::C{chunk}_STORIES.{identity}" for chunk in [4, 3, 2]]
            root = next((key for key in roots if key in graph), f"frontend/desk-behavior.replay.mjs::{identity}")
            dependencies = acceptance.closure(graph, [root])
            touched.update(dependencies & changed)
            used_cases.update(value for key in dependencies for value in graph[key].get("strings", []) if value in case_names)
        for graph in recipes:
            touched.update(acceptance.closure(graph, ["case:" + name for name in used_cases]) & changed_recipes)
        if global_change or touched:
            selected.add(identity)
            reasons[identity] = sorted(touched) if not global_change else ["shared replay infrastructure"]
    return {"selected": [identity for identity in ids if identity in selected], "modules": sorted(sources[1]),
            "loaded": sorted(loaded), "reasons": reasons}


class Snapshots:
    """A fake `git` over two in-memory trees, as SmokeSelectionTest drives it."""
    recipe = "def build(store): return 1\nQA_CASES = (QaCase('showcase', build),)\n"

    def __init__(self, before, after):
        self.trees = {"base": before, "HEAD": after}

    def __call__(self, args, **kwargs):
        command = args[1]
        if command == "merge-base": return "base\n"
        if command == "rev-parse": return "head\n"
        if command == "diff":
            paths = self.trees["base"].keys() | self.trees["HEAD"].keys()
            return "\n".join(p for p in sorted(paths) if self.trees["base"].get(p) != self.trees["HEAD"].get(p))
        if command == "ls-tree":
            return "\n".join([*self.trees[args[4]], "scripts/qa_e2e_cases.py"])
        if command == "show":
            ref, path = args[2].split(":", 1)
            return self.recipe if path == "scripts/qa_e2e_cases.py" else self.trees[ref][path]
        raise AssertionError(f"unexpected git command: {args}")


REPLAY = "frontend/desk-behavior.replay.mjs"
HELPER = "frontend/diagnose-replay.mjs"
PUMP = "frontend/replay-pump.py"
RUNNER = "frontend/case-runner.js"
FIXTURE = "mockups/harmonic-v2.exploration/focus.json"
TREE = {
    REPLAY: "import { locate } from './diagnose-replay.mjs';\n"
            "const { launch } = require('./case-runner.js');\n"
            "const FIXTURES = ['mockups/harmonic-v2.exploration/focus.json'];\n"
            "export const S2 = page => locate(page);\n"
            "export const S3 = page => page.read('unrelated');\n"
            "export const S4 = ctx => ctx.command(['python', 'frontend/replay-pump.py']);\n",
    HELPER: "export async function locate(page) { return page.read('before'); }\n",
    PUMP: "print('pump')\n",
    RUNNER: "module.exports = { launch() {} };\n",
    FIXTURE: "{}\n",
}
IDS = [*acceptance.SMOKE_STORIES, "S2", "S3", "S4"]


def run_selection(select, before, after):
    with tempfile.TemporaryDirectory() as directory:
        run = acceptance.Run(Path(directory))
        with patch.object(acceptance.subprocess, "check_output", side_effect=Snapshots(before, after)):
            result = select(run, "base", IDS)
    return set(result["selected"] if isinstance(result, dict) else result)


class SelectionSpike(unittest.TestCase):
    def test_shipped_selection_is_blind_to_an_imported_helper(self):
        after = {**TREE, HELPER: TREE[HELPER].replace("'before'", "'after'")}
        self.assertEqual(run_selection(acceptance.smoke_selection, TREE, after), set(acceptance.SMOKE_STORIES))
        self.assertEqual(run_selection(spike_selection, TREE, after), set(acceptance.SMOKE_STORIES) | {"S2"})

    def test_shipped_selection_is_blind_to_a_file_loaded_by_path(self):
        after = {**TREE, PUMP: "print('pump, changed')\n"}
        self.assertEqual(run_selection(acceptance.smoke_selection, TREE, after), set(acceptance.SMOKE_STORIES))
        self.assertEqual(run_selection(spike_selection, TREE, after), set(IDS))

    def test_a_required_module_counts_but_a_presence_checked_fixture_does_not(self):
        spike = {**TREE, RUNNER: "module.exports = { launch() { return 1; } };\n"}
        self.assertEqual(run_selection(acceptance.smoke_selection, TREE, spike), set(acceptance.SMOKE_STORIES))
        self.assertEqual(run_selection(spike_selection, TREE, spike), set(IDS))
        fixture = {**TREE, FIXTURE: '{"regenerated": true}\n'}
        self.assertEqual(run_selection(spike_selection, TREE, fixture), set(acceptance.SMOKE_STORIES))

    def test_a_dynamic_import_stops_the_plan(self):
        dynamic = {**TREE, HELPER: "export async function locate(page) { return (await import('./late.mjs')).x; }\n"}
        with self.assertRaises(RuntimeError):
            run_selection(spike_selection, dynamic, dynamic)

    def test_an_import_form_the_graph_cannot_follow_stops_the_plan(self):
        for line in ["import './diagnose-replay.mjs';", "import helper from './diagnose-replay.mjs';",
                     "import { default as helper } from './diagnose-replay.mjs';",
                     "export { locate } from './diagnose-replay.mjs';", "export * from './diagnose-replay.mjs';"]:
            with self.subTest(line=line):
                tree = {**TREE, REPLAY: line + "\n" + TREE[REPLAY]}
                with self.assertRaises(RuntimeError):
                    run_selection(spike_selection, tree, tree)

    def test_a_dependency_without_a_node_stops_the_plan(self):
        tree = {**TREE, HELPER: "async function locate(page) { return page.read('before'); }\nexport { locate as found };\n",
                REPLAY: TREE[REPLAY].replace("{ locate }", "{ found as locate }")}
        with self.assertRaises(RuntimeError):
            run_selection(spike_selection, tree, tree)

    def test_an_import_that_resolves_to_nothing_stops_the_plan(self):
        broken = {**TREE, REPLAY: TREE[REPLAY].replace("./diagnose-replay.mjs", "./missing.mjs")}
        with self.assertRaises(RuntimeError):
            run_selection(spike_selection, broken, broken)

    def test_real_tree_unchanged_is_exactly_the_fixed_slice(self):
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            result = spike_selection(run, "HEAD", acceptance.inventory(run))
        self.assertEqual(set(result["selected"]), set(acceptance.SMOKE_STORIES))
        print("\nreplay modules at HEAD:", ", ".join(result["modules"]))
        print("files the replay loads by path:", ", ".join(result["loaded"]))

    def test_real_railrowlocator_edit_selects_its_callers(self):
        real = {}
        def git(args, **kwargs):
            if args[1] == "merge-base": return "base\n"
            if args[1] == "rev-parse": return "head\n"
            if args[1] == "diff": return HELPER
            if args[1] == "show":
                ref, path = args[2].split(":", 1)
                text = acceptance.subprocess.run(["git", "show", f"HEAD:{path}"], cwd=REPO,
                                                 capture_output=True, text=True, check=True).stdout
                if ref == "HEAD" and path == HELPER:
                    text = text.replace("if (await row.count()) return row;", "if (await row.count()) { return row; }")
                return text
            if args[1] == "ls-tree":
                return acceptance.subprocess.run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=REPO,
                                                 capture_output=True, text=True, check=True).stdout
            raise AssertionError(args)
        with tempfile.TemporaryDirectory() as directory:
            run = acceptance.Run(Path(directory))
            ids = acceptance.inventory(run)
            with patch.object(acceptance.subprocess, "check_output", side_effect=git):
                shipped = set(acceptance.smoke_selection(run, "base", ids))
                result = spike_selection(run, "base", ids)
        added = [identity for identity in result["selected"] if identity not in acceptance.SMOKE_STORIES]
        callers = [identity for identity in result["selected"]
                   if "frontend/diagnose-replay.mjs::railRowLocator" in result["reasons"].get(identity, [])]
        print(f"\nevery story whose reasons name railRowLocator ({len(callers)}): {','.join(callers)}")
        self.assertEqual(shipped, set(acceptance.SMOKE_STORIES))
        for story in ["S22", "S23", "S24", "S124"]:
            self.assertIn(story, added)
        print(f"\na railRowLocator edit adds {len(added)} stories to the fixed slice: {', '.join(added)}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
