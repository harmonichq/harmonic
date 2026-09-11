#!/usr/bin/env python3
"""Offline #389 acceptance runs. All stores and raw output stay in --out scratch.

Run each leg serially. Browser and Docker execution belongs to the coordinator.
This driver records execution, never assigns fidelity or release verdicts.
"""
from __future__ import annotations

import argparse
import ast
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[3]
SHOWCASE = REPO / "mockups/qa-e2e.synthetic/harmonic.sqlite"
TOKEN = "synthetic-replay-token"
# One fixed PR slice: all default and nested case stores, all three destinations,
# and the Guide, Settings, Carb questions and Pump settings entry points.
SMOKE_STORIES = (
    "S7", "S7b", "S13", "S14", "S49", "S54", "S56", "S57", "S58", "S60", "S73",
    "S74", "S76", "S77", "S87", "S91", "S98", "S99", "R8", "R18",
)
DRIFTS = [
    "scripts/gen_ic_block_fixtures.py", "scripts/gen_annotation_fixtures.py",
    "scripts/gen_chart_builder_fixtures.py", "scripts/check_demo_fixtures.py",
    "scripts/gen_qa_e2e_db.py", "scripts/gen_findings_projection_fixtures.py",
    "scripts/gen_ic_history_event_fixtures.py", "scripts/gen_ic_block_evidence_fixtures.py",
    "scripts/gen_basal_night_evidence_fixtures.py", "scripts/gen_isf_rest_window_evidence_fixtures.py",
    "scripts/gen_missed_meal_comparison_fixtures.py", "scripts/gen_eating_sequence_fixtures.py",
    "mockups/diagnose-evidence-canvas.exploration/generate.py",
    "mockups/harmonic-v2.exploration/generate.py",
]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


class Run:
    def __init__(self, out):
        self.out = out.resolve()
        require(not self.out.is_relative_to(REPO), "--out must be outside the checkout")
        require(not self.out.exists() or not any(self.out.iterdir()), "use a fresh --out for each run")
        self.out.mkdir(parents=True, exist_ok=True)
        self.records = []
        inputs = ["mockups/harmonic-v2-desktop.lock.md", "mockups/harmonic-v2-desktop.behavior.md",
                  "frontend/harmonic-v2-desktop-behavior.replay.mjs", "frontend-v2/c2.replay.mjs",
                  "frontend-v2/c3.replay.mjs", "frontend-v2/c4.replay.mjs", "frontend-v2/replay-cases.mjs",
                  "mockups/sweep/harmonic-v2-desktop/acceptance.py", "frontend-v2/capture.mjs", "scripts/qa_e2e_cases.py",
                  "scripts/gen_qa_e2e_db.py", "mockups/qa-e2e.synthetic/harmonic.sqlite"]
        (self.out / "inputs.json").write_text(json.dumps({
            "head": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip(),
            "sha256": {path: hashlib.sha256((REPO / path).read_bytes()).hexdigest() for path in inputs},
            "synthetic": True,
        }, indent=2) + "\n")

    def command(self, name, args, *, env=None, timeout=1800):
        print(f"RUN {name}: {' '.join(map(str, args))}", flush=True)
        start = time.monotonic()
        log = self.out / f"{name}.log"
        with log.open("w") as stream:
            child = subprocess.Popen(args, cwd=REPO, env=env, stdout=stream,
                                     stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = child.wait(timeout=timeout)
            except BaseException:
                os.killpg(child.pid, signal.SIGTERM)
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                raise
        elapsed = time.monotonic() - start
        self.records.append(dict(name=name, argv=list(map(str, args)),
                                 seconds=elapsed, exit_code=code))
        (self.out / "commands.json").write_text(json.dumps(self.records, indent=2) + "\n")
        print(f"{name}: exit {code}, {elapsed:.3f} s", flush=True)
        require(code == 0, f"{name} failed; see {log}")
        return elapsed, log.read_text()


def request(base, path, token=None, *, data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    if data is not None:
        headers["Content-Type"] = "application/json"
    try:
        with urllib.request.urlopen(urllib.request.Request(base + path, headers=headers,
                data=json.dumps(data).encode() if data is not None else None), timeout=30) as r:
            return r.status, r.read(), {k.lower(): v for k, v in r.headers.items()}
    except urllib.error.HTTPError as error:
        return error.code, error.read(), {k.lower(): v for k, v in error.headers.items()}


def nightly_result(run, run_id=None):
    """Both callers read the one CI aggregate, with the same freshness rule."""
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    require(re.fullmatch(r"[\w.-]+/[\w.-]+", repository), "GITHUB_REPOSITORY is required")
    token = os.environ.get("GITHUB_TOKEN")
    require(token, "GITHUB_TOKEN with actions:read is required")
    path = (f"/repos/{repository}/actions/runs/{run_id}" if run_id else
            f"/repos/{repository}/actions/workflows/ci.yml/runs?event=schedule&branch=main&status=completed&per_page=1")
    code, body, _ = request("https://api.github.com", path, token)
    require(code == 200, f"nightly lookup failed: HTTP {code}")
    runs = [json.loads(body)] if run_id else json.loads(body)["workflow_runs"]
    if not runs:
        warning = "No scheduled nightly has completed yet; bootstrap passes until the first completed run."
        result = {"state": "success", "bootstrap": True, "warning": warning}
        (run.out / "nightly.json").write_text(json.dumps(result, indent=2) + "\n")
        print(f"::warning::{warning}")
        if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(summary, "a") as stream:
                stream.write(f"**Warning:** {warning}\n")
        return result
    latest = runs[0]
    require(latest.get("event") == "schedule" and latest.get("head_branch") == "main"
            and (run_id or latest.get("status") == "completed"), "nightly lookup returned an unrelated run")
    jobs, page = [], 1
    while True:
        code, body, _ = request("https://api.github.com",
            f"/repos/{repository}/actions/runs/{latest['id']}/jobs?filter=latest&per_page=100&page={page}", token)
        require(code == 200, f"nightly aggregate lookup failed: HTTP {code}")
        batch = json.loads(body)["jobs"]
        jobs.extend(job for job in batch if job["name"] == "nightly result")
        if len(batch) < 100:
            break
        page += 1
    require(len(jobs) == 1 and jobs[0].get("status") == "completed", "missing completed nightly result")
    started = datetime.fromisoformat(latest["run_started_at"].replace("Z", "+00:00"))
    age = (datetime.now(timezone.utc) - started).total_seconds()
    fresh = 0 <= age <= 36 * 60 * 60
    state = "success" if fresh and jobs[0].get("conclusion") == "success" else "failure"
    result = {"run": latest, "aggregate": jobs[0], "age_seconds": age, "fresh": fresh, "state": state}
    (run.out / "nightly.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def nightly_check(run):
    result = nightly_result(run)
    if result.get("bootstrap"):
        return
    require(result["state"] == "success",
            f"latest nightly {result['run']['id']}: failed or older than 36 h; see {result['run'].get('html_url')}")
    print(f"latest nightly {result['run']['id']}: success")


def nightly_publish(run):
    """Refresh existing PRs too; their earlier green check is not a nightly latch."""
    repository = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN")
    require(os.environ.get("GITHUB_EVENT_NAME") == "schedule", "nightly publication is schedule-only")
    require(re.fullmatch(r"[\w.-]+/[\w.-]+", repository) and token, "repository and token are required")
    result = nightly_result(run, os.environ["GITHUB_RUN_ID"])
    state = result["state"]
    target = f"https://github.com/{repository}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    receipts, page = [], 1
    while True:
        code, body, _ = request("https://api.github.com",
            f"/repos/{repository}/pulls?state=open&base=main&per_page=100&page={page}", token)
        require(code == 200, f"open PR lookup failed: HTTP {code}")
        pulls = json.loads(body)
        for pull in pulls:
            # GitHub may evaluate the test merge commit instead of the head.
            for sha in sorted({pull["head"]["sha"], pull.get("merge_commit_sha")} - {None}):
                require(re.fullmatch(r"[0-9a-f]{40}", sha), "invalid PR commit in status response")
                code, _, _ = request("https://api.github.com", f"/repos/{repository}/statuses/{sha}", token,
                    data={"state": state, "context": "latest nightly", "target_url": target,
                          "description": "Latest nightly aggregate (36 h freshness limit): " + state})
                require(code == 201, f"nightly status publication failed: HTTP {code}")
                receipts.append({"pr": pull["number"], "sha": sha, "state": state})
        if len(pulls) < 100:
            break
        page += 1
    (run.out / "nightly-statuses.json").write_text(json.dumps(receipts, indent=2) + "\n")
    print(f"nightly {state}: refreshed {len(receipts)} PR commit statuses")


def free_port(port):
    with socket.socket() as listener:
        # TIME_WAIT from our previous leg is not a listener. A live server still
        # prevents this bind, including one serving an unrelated application.
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            listener.bind(("127.0.0.1", port))
        except OSError as error:
            raise RuntimeError(f"Port {port} is occupied; refusing to start or reuse a server") from error


def stop_server(child, *, grace=10):
    """Reap the launcher AND stop its owned session, even if uv exited first."""
    def signal_group(sig):
        try:
            os.killpg(child.pid, sig)
            return True
        except ProcessLookupError:
            return False

    signal_group(signal.SIGTERM)
    deadline = time.monotonic() + grace
    while time.monotonic() < deadline:
        child.poll()  # Reap uv; its exit alone says nothing about its server.
        if not signal_group(0):
            break
        time.sleep(.05)
    # A launcher can exit on TERM while its child keeps the port bound. Always
    # address the original process group; never discover/kill a process by port.
    signal_group(signal.SIGKILL)
    child.wait(timeout=5)
    deadline = time.monotonic() + 5
    while signal_group(0) and time.monotonic() < deadline:
        time.sleep(.05)


def wait_ready(base, process=None):
    for _ in range(120):
        if process is not None:
            require(process.poll() is None, "synthetic server exited before readiness")
        try:
            if request(base, "/api/health")[0] == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.25)
    raise RuntimeError(f"synthetic server did not become ready at {base}")


@contextmanager
def auth_server(run):
    free_port(8766)
    db = run.out / "auth.sqlite"
    shutil.copyfile(SHOWCASE, db)
    with (run.out / "auth-server.log").open("w") as log:
        child = subprocess.Popen(["uv", "run", "harmonic", "serve", "--no-fetch",
                                  "--token", TOKEN, "--db", str(db), "--port", "8766"],
                                 cwd=REPO, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            wait_ready("http://127.0.0.1:8766", child)
            yield
        finally:
            stop_server(child)
            free_port(8766)


def shard_arg(value):
    if not re.fullmatch(r"[1-9]\d*/[1-9]\d*", value):
        raise argparse.ArgumentTypeError("--shard must be k/n with 1 <= k <= n")
    k, n = map(int, value.split("/"))
    if k > n:
        raise argparse.ArgumentTypeError("--shard must be k/n with 1 <= k <= n")
    return k, n


def test_files(shard=None):
    files = sorted(str(path.relative_to(REPO)) for path in (REPO / "tests").rglob("*.py")
                   if path.name.startswith("test_") or path.name.endswith("_test.py"))
    require(files, "no backend test files found")
    if shard:
        k, n = shard
        files = files[k - 1::n]
    require(files, "empty backend test shard")
    return files


def pytest_shard(run, shard=None):
    files = test_files(shard)
    (run.out / "test-files.json").write_text(json.dumps(files, indent=2) + "\n")
    # pytest exits 5 on zero collected tests. Run.command rejects every nonzero
    # status, including collection/import failures; no success-shaped skip.
    run.command("pytest", ["uv", "run", "python", "-m", "pytest", *files], timeout=840)


def recipe_graph(source):
    """Recipe literals and their transitive Python helpers, without executing them."""
    tree = ast.parse(source)
    nodes = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            nodes[node.name] = node
        elif isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            for target in targets:
                if isinstance(target, ast.Name) and target.id != "QA_CASES":
                    nodes[target.id] = node
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "QaCase":
            name = node.args[0] if node.args else next(k.value for k in node.keywords if k.arg == "name")
            if isinstance(name, ast.Name) and name.id in nodes:
                name = nodes[name.id].value
            require(isinstance(name, ast.Constant) and isinstance(name.value, str), "nonliteral QA case name")
            nodes["case:" + name.value] = node
    return {name: {"text": ast.dump(node, include_attributes=False),
                   "deps": sorted({child.id for child in ast.walk(node)
                                   if isinstance(child, ast.Name) and child.id in nodes})}
            for name, node in nodes.items()}


def closure(graph, roots):
    found, pending = set(), list(roots)
    while pending:
        name = pending.pop()
        if name in found or name not in graph:
            continue
        found.add(name)
        pending.extend(graph[name]["deps"])
    return found


def replay_graph(run, sources):
    """Read JS symbols with the parser already pinned by the frontend lockfile."""
    payload = run.out / "replay-sources.json"
    payload.write_text(json.dumps(sources))
    script = r"""
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');
const snapshots = JSON.parse(readFileSync(process.argv[1], 'utf8'));
function graph(files) {
  const result = {};
  for (const [file, source] of Object.entries(files)) {
    const ast = parse(source, { sourceType: 'module' });
    const nodes = Object.create(null), imports = Object.create(null), shared = [];
    const add = (name, node, comments = []) => {
      nodes[name] = { node, tags: comments.flatMap(c => [...c.value.matchAll(/STORY:([\w-]+:[SR]\d+[a-z]?)/g)].map(m => m[1])) };
    };
    for (const top of ast.program.body) {
      const node = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
      if (node?.type === 'ImportDeclaration') {
        const target = posix.normalize(posix.join(posix.dirname(file), node.source.value));
        if (files[target]) for (const spec of node.specifiers) {
          imports[spec.local.name] = [target, spec.imported?.name || '*'];
          add(spec.local.name, node);
        }
      } else if (node?.type === 'FunctionDeclaration' || node?.type === 'ClassDeclaration') {
        add(node.id.name, node, top.leadingComments || []);
      } else if (node?.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          if (decl.id.type !== 'Identifier') { shared.push(source.slice(top.start, top.end)); continue; }
          add(decl.id.name, decl, top.leadingComments || []);
          if (decl.init?.type === 'ObjectExpression') for (const prop of decl.init.properties) {
            const name = prop.key?.name || prop.key?.value;
            if (name) add(`${decl.id.name}.${name}`, prop, prop.leadingComments || []);
          }
        }
      } else shared.push(source.slice(top.start, top.end));
    }
    const full = name => `${file}::${name}`;
    const ref = name => {
      const [first, ...tail] = name.split('.');
      if (imports[first]) {
        const [target, imported] = imports[first];
        return `${target}::${[imported === '*' ? '' : imported, ...tail].filter(Boolean).join('.')}`;
      }
      return nodes[name] ? full(name) : nodes[first] ? full(first) : null;
    };
    function member(node) {
      if (node.type === 'Identifier') return node.name;
      if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) {
        const base = member(node.object);
        const field = node.computed ? node.property.value : node.property.name;
        return base && typeof field === 'string' ? `${base}.${field}` : null;
      }
      return null;
    }
    function references(node, refs, strings, destinations) {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'StringLiteral') strings.add(node.value);
      if (node.type === 'CallExpression' && ['go', 'goto'].includes(node.callee?.name)
          && node.arguments[1]?.type === 'StringLiteral') {
        const destination = node.arguments[1].value;
        if (['diagnose', 'explore', 'changes', 'day'].includes(destination))
          destinations.add(destination === 'explore' ? 'diagnose' : destination);
      }
      if (node.type === 'Identifier') { refs.add(node.name); return; }
      if (['MemberExpression', 'OptionalMemberExpression'].includes(node.type)) {
        const name = member(node);
        if (name) { refs.add(name); return; }
      }
      for (const [key, value] of Object.entries(node)) {
        if (['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments'].includes(key)) continue;
        if (Array.isArray(value)) value.forEach(child => references(child, refs, strings, destinations));
        else if (value && typeof value === 'object') references(value, refs, strings, destinations);
      }
    }
    result[full('@module')] = { text: shared.join('\n'), deps: [], strings: [], tags: [] };
    for (const [name, { node, tags }] of Object.entries(nodes)) {
      const refs = new Set(), strings = new Set(), destinations = new Set(); references(node, refs, strings, destinations);
      result[full(name)] = { text: source.slice(node.start, node.end) + tags.join(','),
        deps: [...new Set([...refs].map(ref).filter(Boolean)), full('@module')], strings: [...strings], destinations: [...destinations], tags };
    }
  }
  return result;
}
console.log(JSON.stringify(snapshots.map(graph)));
"""
    _, output = run.command("replay-graph", ["node", "--input-type=module", "-e", script, str(payload)])
    return json.loads(output)


def smoke_selection(run, base, ids):
    """Select the fixed smoke slice plus affected replay/recipe dependency closures."""
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=REPO, text=True)

    base = git("merge-base", base, "HEAD").strip()
    changed_files = set(git("diff", "--name-only", base, "HEAD").splitlines())
    sources = []
    recipes = []
    for ref in [base, "HEAD"]:
        paths = git("ls-tree", "-r", "--name-only", ref, "--", "frontend", "frontend-v2").splitlines()
        paths = [p for p in paths if p.endswith(".replay.mjs") or p == "frontend-v2/replay-cases.mjs"]
        sources.append({path: git("show", f"{ref}:{path}") for path in paths})
        recipes.append(recipe_graph(git("show", f"{ref}:scripts/qa_e2e_cases.py")))
    before, after = replay_graph(run, sources)
    changed = {key for key in before.keys() | after.keys()
               if before.get(key) != after.get(key)}
    changed_recipes = {key for key in recipes[0].keys() | recipes[1].keys()
                       if recipes[0].get(key) != recipes[1].get(key)}
    _, output = run.command("story-cases", ["node", "--input-type=module", "-e",
        "import {REGISTRY} from './frontend/harmonic-v2-desktop-behavior.replay.mjs';"
        "import {storyCase} from './frontend-v2/replay-cases.mjs';"
        "console.log(JSON.stringify(Object.fromEntries(REGISTRY.map(([id])=>[id,storyCase(id)]))))"])
    defaults = json.loads(next(line for line in output.splitlines() if line.startswith("{")))
    require(len(SMOKE_STORIES) == 20 and len(set(SMOKE_STORIES)) == 20
            and set(SMOKE_STORIES) <= set(ids), "smoke inventory differs from the frozen registry")
    case_names = {key.removeprefix("case:") for graph in recipes for key in graph if key.startswith("case:")}
    selected, reasons, coverage, destinations = set(SMOKE_STORIES), {}, {}, {}
    # Changes to the runner itself, registry, transport or generator can affect
    # every story. They must not disappear behind a function-only comparison.
    global_files = {"scripts/gen_qa_e2e_db.py", "frontend-v2/replay-cases.mjs",
                    "frontend-v2/capture.mjs", "frontend/browser-runner.js",
                    "mockups/sweep/harmonic-v2-desktop/acceptance.py", "package-lock.json"}
    global_symbols = {"frontend/harmonic-v2-desktop-behavior.replay.mjs::" + name
                      for name in ["REGISTRY", "main", "openApp", "requireEnvironment", "requireAssets"]}
    global_change = bool(changed_files & global_files or changed & global_symbols)
    for identity in ids:
        touched, used_cases, visited = set(), {defaults[identity]}, set()
        for graph in [before, after]:
            roots = [f"frontend-v2/c{chunk}.replay.mjs::C{chunk}_STORIES.{identity}" for chunk in [4, 3, 2]]
            root = next((key for key in roots if key in graph),
                        f"frontend/harmonic-v2-desktop-behavior.replay.mjs::{identity}")
            dependencies = closure(graph, [root])
            touched.update(dependencies & changed)
            visited.update(value for key in dependencies for value in graph[key].get("destinations", []))
            used_cases.update(value for key in dependencies for value in graph[key].get("strings", []) if value in case_names)
        coverage[identity] = sorted(used_cases)
        destinations[identity] = sorted(visited)
        for graph in recipes:
            touched.update(closure(graph, ["case:" + name for name in used_cases]) & changed_recipes)
        if global_change or touched:
            selected.add(identity)
            reasons[identity] = sorted(touched) if not global_change else ["shared replay infrastructure"]
    (run.out / "smoke.json").write_text(json.dumps({"base": base, "head": git("rev-parse", "HEAD").strip(),
        "changed_files": sorted(changed_files), "reasons": reasons, "case_coverage": coverage, "destination_coverage": destinations,
        "fixed": SMOKE_STORIES, "selected": [identity for identity in ids if identity in selected]}, indent=2) + "\n")
    return [identity for identity in ids if identity in selected]


def replay_plan(run, base=None):
    """Choose the CI shard inventory after resolving the PR's actual selection."""
    ids = inventory(run)
    selected = smoke_selection(run, base, ids) if base else ids
    mode = "full" if selected == ids else "smoke"
    shards = json.loads(os.environ["REPLAY_SHARDS"])[mode]
    require(shards, "empty replay shard inventory")
    plan = {"mode": mode, "shards": shards, "count": len(selected), "selected": selected, "base": base}
    (run.out / "plan.json").write_text(json.dumps(plan, indent=2) + "\n")
    if output := os.environ.get("GITHUB_OUTPUT"):
        with open(output, "a") as stream:
            stream.write(f"mode={mode}\nshards={json.dumps(shards)}\ncount={len(selected)}\n")
    return plan


def replay(run, viewport, shard=None, base=None):
    ids = inventory(run)
    selected_ids = smoke_selection(run, base, ids) if base else ids
    if shard:
        k, n = shard
        require(n <= len(selected_ids), "--shard would produce empty shards")
        selected_ids = selected_ids[len(selected_ids) * (k - 1) // n:len(selected_ids) * k // n]
    (run.out / "selection.json").write_text(json.dumps({
        "viewport": viewport, "shard": shard, "registry": ids, "selected": selected_ids,
        "mode": "smoke" if base else "full", "base": base,
    }, indent=2) + "\n")
    require(os.environ.get("PLAYWRIGHT_MODULE"), "PLAYWRIGHT_MODULE is required")
    free_port(8765)
    env = {**os.environ, "TARGET": "app", "VIEWPORT": viewport,
           "BASE_URL": "http://127.0.0.1:8765", "AUTH_BASE_URL": "http://127.0.0.1:8766",
           "AUTH_TOKEN": TOKEN, "CASE_STORE_DIR": str(run.out / "cases"),
           "CAPTURE_DIR": str(run.out / "captures"),
           "CAPTURE_ONLY": "S1,S3,S7b,S9,S14,S15,S18,S19,S21,S23,S31,S33,S36,S37,S39,S45,S49,S51,S54,S56,S57,S58,S59,S60,S61,S64,S65,S66,S68,S69,S74,S75,S77,S93,S99"}
    # S100 delegates to Event S8, whose use() closes its page after asserting.
    # It still executes in the full registry; only its unavailable post-story
    # endpoint is excluded from captures (as with S91's multi-context proof).
    # An inherited developer selection must never turn acceptance into a subset.
    env.pop("ONLY", None)
    env.pop("STORY_CASES", None)
    if shard or base:
        env["ONLY"] = ",".join(selected_ids)
    with auth_server(run):
        # ACCEPTANCE.md's Fast-gates measurements and ceilings states the timing basis.
        _, output = run.command("complete-replay", ["node", "frontend/harmonic-v2-desktop-behavior.replay.mjs"], env=env, timeout=780 if shard and not base else 3000)
    match = re.search(r"# executed (\d+) · failed (\d+) · deferred (\d+) · selected (\d+)", output)
    require(match is not None, "replay returned no execution summary")
    executed, failed, deferred, selected = map(int, match.groups())
    require(executed == selected == len(selected_ids) and failed == deferred == 0,
            f"incomplete app replay: {match.group(0)}")
    passed = re.findall(r"^PASS ([SR]\d+[a-z]?)$", output, re.M)
    require(passed == selected_ids, "replay PASS inventory differs from selected registry")
    print(match.group(0))


def inventory(run):
    _, output = run.command("registry", ["node", "--input-type=module", "-e",
        "import {REGISTRY} from './frontend/harmonic-v2-desktop-behavior.replay.mjs';"
        "console.log(JSON.stringify(REGISTRY.map(([id])=>id)))"])
    ids = json.loads(next(line for line in output.splitlines() if line.startswith('["')))
    ledger = (REPO / "mockups/harmonic-v2-desktop.behavior.md").read_text()
    entries = re.findall(r"^([SR]\d+[a-z]?) ·", ledger, re.M)
    required = set(entries)
    counts = {"issued": len(entries),
              "active": sum(identity.startswith("S") for identity in entries),
              "retired": sum(identity.startswith("R") for identity in entries)}
    print(f"ledger inventory: {counts}")
    require(counts == {"issued": 130, "active": 112, "retired": 18}
            and len(entries) == len(required), f"frozen ledger inventory changed: {counts}")
    missing, extra = sorted(required - set(ids)), sorted(set(ids) - required)
    print(f"ledger={len(required)} registry={len(ids)} missing={missing} extra={extra}")
    require(required and not missing and not extra and len(ids) == len(set(ids)),
            f"frozen ledger/registry mismatch: missing={missing}, extra={extra}")
    return ids


def case_cache(run, check=False, cases=None, benchmark=False):
    """Check cached copies; optionally measure preparation without a server."""
    env = {**os.environ, "CACHE_OUT": str(run.out), "CACHE_CHECK": str(int(check)),
           "CACHE_CASES": json.dumps(cases), "CACHE_BENCHMARK": str(int(benchmark))}
    script = r"""
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { REGISTRY } from './frontend/harmonic-v2-desktop-behavior.replay.mjs';
import { createCaseServer, storyCase } from './frontend-v2/replay-cases.mjs';
const directory = process.env.CACHE_OUT;
const checking = process.env.CACHE_CHECK === '1';
const benchmarking = process.env.CACHE_BENCHMARK === '1';
const cases = JSON.parse(process.env.CACHE_CASES) || [...new Set(REGISTRY.map(([id]) => storyCase(id)))];
assert.ok(cases.length > 0, 'case-cache: no cases selected');
const server = createCaseServer({ directory, repo: process.cwd() });
const rows = [];
function python(args) {
  const result = spawnSync('uv', ['run', 'python', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}
try {
  for (const name of cases) {
    assert.match(name, /^[a-z][a-z0-9-]*$/);
    if (checking) {
      // Use the existing logical dump rule and control the observation clock:
      // c3-history stamps first_observed_at during generation.
      python(['-c', `import sys; from pathlib import Path
sys.path.insert(0, 'scripts')
from gen_qa_e2e_db import generate, _dump, check, DEFAULT_OUTPUT
from qa_e2e_cases import QA_CASES
name, out = sys.argv[1:]
if name == 'showcase':
    sys.exit(0 if check(DEFAULT_OUTPUT) else 1)
case = next(c for c in QA_CASES if c.name == name)
from datetime import datetime
from unittest.mock import patch
from ciq_autotune import watched_change
clock = datetime.now()
class Clock(datetime):
    @classmethod
    def now(cls, tz=None):
        return clock if tz is None else clock.astimezone(tz)
with patch.object(watched_change, 'datetime', Clock):
    generate(Path(out), case)
    reference = Path(out).with_suffix('.reference.sqlite')
    generate(reference, case)
assert _dump(reference) == _dump(Path(out)), 'case generator drift: ' + name
`, name, join(directory, `regenerated-${name}.sqlite`)]);
    }
    const coldStart = performance.now();
    const first = await server.prepare('cold', name);
    const coldMs = performance.now() - coldStart;
    if (checking) {
      const expected = await readFile(first.db);
      await writeFile(first.db, 'synthetic story mutation');
      await writeFile(`${first.db}.derived.sqlite`, 'synthetic derived mutation');
      const fresh = await server.prepare('check', name);
      assert.deepEqual(await readFile(fresh.db), expected, 'a story mutated the cached template');
      await assert.rejects(access(`${fresh.db}.derived.sqlite`), { code: 'ENOENT' });
      console.log(`CHECK ${name}`);
    }
    if (!benchmarking) continue;
    const raw = join(directory, `raw-${name}.sqlite`);
    if (name === 'showcase') await copyFile('mockups/qa-e2e.synthetic/harmonic.sqlite', raw);
    else python(['scripts/gen_qa_e2e_db.py', '--case', name, '--out', raw]);
    for (let repeat = 0; repeat < 3; repeat++) {
      // Baseline is the pre-406 warm path: raw generation was already cached.
      const before = performance.now();
      const old = join(directory, 'before.sqlite');
      await copyFile(raw, old);
      python(['-c', 'import sys; from ciq_autotune.store import Store; from ciq_autotune.watched_change import reconcile_ingested_follow_up\nwith Store.open(sys.argv[1]) as store: reconcile_ingested_follow_up(store)', old]);
      const beforeMs = performance.now() - before;
      const after = performance.now();
      await server.prepare(`warm-${repeat}`, name);
      const afterMs = performance.now() - after;
      rows.push({ case: name, repeat, cold_ms: coldMs, before_ms: beforeMs, after_ms: afterMs });
    }
  }
} finally { await server.stop(); }
if (benchmarking) {
  await writeFile(join(directory, 'case-times.json'), JSON.stringify(rows, null, 2) + '\n');
  console.log(JSON.stringify(rows));
}
"""
    driver = run.out / "case-cache.mjs"
    driver.write_text(script.replace("from './", f"from '{REPO.as_uri()}/"))
    run.command("case-cache", ["node", str(driver)], env=env)


def checks(run):
    run.command("npm-ci", ["npm", "ci"])
    run.command("build", ["npm", "run", "build"])
    run.command("node", ["node", "--test", "frontend/**/*.test.js", "frontend-v2/**/*.test.js"])
    run.command("node-v2", ["node", "--test", "frontend-v2/**/*.test.js"])
    run.command("openspec", ["npx", "--yes", "@fission-ai/openspec@1", "validate", "--all", "--strict"])
    for guard in ["check_adr_numbers", "check_owned_identifiers", "check_public_allowlist"]:
        run.command(guard, [sys.executable, f"scripts/{guard}.py"])
    for number, path in enumerate(DRIFTS, 1):
        run.command(f"drift-{number:02}", ["uv", "run", "python", path]
                    + ([] if path.endswith("check_demo_fixtures.py") else ["--check"]))
    for name, path in [("event-drift", "mockups/diagnose-event-comparison.synthetic/generate.mjs"),
                       ("routing-drift", "mockups/finding-evidence-routing.exploration/build.mjs")]:
        run.command(name, ["node", path, "--check"])


def budget(run):
    # Both shells must already be built. No concurrent suites on this machine.
    for root in ["frontend", "frontend-v2"]:
        require((REPO / root / "dist/index.html").is_file(), "run npm ci && npm run build first")
    before = hashlib.sha256(SHOWCASE.read_bytes()).hexdigest()
    full, _ = run.command("pytest", ["uv", "run", "python", "-m", "pytest"])
    drift, _ = run.command("qa-drift", ["uv", "run", "python", "scripts/gen_qa_e2e_db.py", "--check"])
    report = run.out / "qa.xml"
    focused, _ = run.command("qa-suite", ["uv", "run", "python", "-m", "pytest",
                            "tests/test_qa_e2e_cases.py", "tests/test_gen_qa_e2e_db.py",
                            "--durations=0", f"--junitxml={report}"])
    cases = [c for c in ET.parse(report).iter("testcase") if c.attrib["name"].startswith("test_case_")]
    require(cases, "focused suite executed no generated catalog case")
    slowest = max(cases, key=lambda c: float(c.attrib["time"]))
    results = {"showcase_bytes": [SHOWCASE.stat().st_size, 25 * 1024 * 1024],
               "showcase_drift_seconds": [drift, 30], "focused_qa_seconds": [focused, 90],
               "slowest_case_seconds": [float(slowest.attrib["time"]), 15],
               "full_pytest_seconds": [full, 400]}
    receipt = {"measurements_and_limits": results, "slowest_case": slowest.attrib["name"],
               "generated_cases": len(cases), "baseline_seconds": 160,
               "showcase_unchanged": before == hashlib.sha256(SHOWCASE.read_bytes()).hexdigest()}
    (run.out / "budgets.json").write_text(json.dumps(receipt, indent=2) + "\n")
    require(receipt["showcase_unchanged"], "budget run changed the committed showcase")
    require(all(value <= limit for value, limit in results.values()), f"QA budget breach: {results}")
    print(json.dumps(receipt, indent=2))


class ShellAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        key = "src" if tag == "script" else "href" if tag == "link" else None
        if key and attrs.get(key):
            self.paths.append(attrs[key])


def probe(base, token):
    """Request both packaged shells and their real assets; no source-text stand-in."""
    rows = []
    for page, prefix in [("/", "/assets/"), ("/v2/", "/v2/assets/")]:
        status, body, headers = request(base, page)
        require(status == 200, f"{page}: {status}")
        require(headers.get("cache-control") == "no-cache", f"{page}: shell cache policy")
        parser = ShellAssets()
        parser.feed(body.decode())
        require(parser.paths, f"{page}: no packaged assets")
        packaged = [asset for asset in parser.paths if asset.startswith(prefix)]
        require(packaged, f"{page}: no local packaged assets")
        for asset in parser.paths:
            url = urllib.parse.urlsplit(asset)
            if page == "/" and url.scheme == "https" and url.netloc in {"fonts.googleapis.com", "fonts.gstatic.com"}:
                rows.append({"path": asset, "scope": "carried-v1-font-reference", "requested": False})
                continue
            require(asset.startswith(prefix), f"{page} references an external or misplaced asset: {asset}")
            code, content, cache = request(base, asset)
            require(code == 200 and content, f"{asset}: absent packaged bytes ({code})")
            require(cache.get("cache-control") == "public, max-age=31536000, immutable", f"{asset}: cache policy")
            rows.append({"path": asset, "status": code, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        rows.append({"path": page, "status": status})
    for path in ["/unlisted", "/v2/diagnose", "/v2/changes", "/v2/day", "/v2/index.html", "/v1",
                 "/v2/assets/no-such.js", "/assets/no-such.js"]:
        code = request(base, path)[0]
        require(code == 404, f"closed route {path}: expected 404, got {code}")
        rows.append({"path": path, "status": code})
    if token:
        for supplied, expected in [(None, 401), ("incorrect-synthetic-token", 401), (token, 200)]:
            code = request(base, "/api/status", supplied)[0]
            require(code == expected, f"authenticated API: expected {expected}, got {code}")
            rows.append({"path": "/api/status", "auth": "correct" if supplied == token else "absent-or-wrong", "status": code})
    return rows


def public_tree(run):
    tree = run.out / "public-tree"
    require(not tree.exists(), "use a fresh --out; materialized tree must start empty")
    run.command("public-tree", [sys.executable, "scripts/build_public_tree.py", str(tree)])
    require((tree / "frontend-v2/main.js").is_file(), "public tree omitted v2 source")
    require((tree / "vite.config.v2.mjs").is_file(), "public tree omitted v2 build config")
    # Some synthetic fixtures intentionally publish; private design material must not.
    for private in ["harmonic-v2-glucose.html", "harmonic-v2.archive", "harmonic-v2.exploration", "sweep"]:
        require(not (tree / "mockups" / private).exists(), f"public tree exposed private mockups/{private}")
    run.command("public-links", [sys.executable, "scripts/check_public_links.py", str(tree)])
    run.command("public-scan", [sys.executable, "scripts/scan_public_tree.py", str(tree)])


def package(run, image=None):
    free_port(8765)
    built_image = image
    image = image or f"harmonic:389-c4-{os.getpid()}"
    name = f"harmonic-389-c4-{os.getpid()}"
    run.command("docker-version", ["docker", "version"])
    if not built_image:
        run.command("image-build", ["docker", "build", "--tag", image, "."])
    run.command("node-absent", ["docker", "run", "--rm", "--entrypoint", "sh", image, "-c", "! command -v node"])
    # Mount a directory, not just the database: the non-root runtime needs WAL space.
    data = run.out / "container-data"
    data.mkdir()
    data.chmod(0o777)
    db = data / "harmonic.sqlite"
    shutil.copyfile(SHOWCASE, db)
    db.chmod(0o666)
    try:
        run.command("image-start", ["docker", "run", "--detach", "--name", name, "--publish", "127.0.0.1:8765:8765",
                    "--env", "TIMEZONE_NAME=America/Phoenix", "--volume", f"{data}:/app/tconnect-data", image,
                    "--host", "0.0.0.0", "--port", "8765", "--no-fetch", "--token", TOKEN,
                    "--db", "/app/tconnect-data/harmonic.sqlite"])
        wait_ready("http://127.0.0.1:8765")
        rows = probe("http://127.0.0.1:8765", TOKEN)
        (run.out / "runtime.json").write_text(json.dumps(rows, indent=2) + "\n")
        print(f"packaged runtime: {len(rows)} route/asset/auth requests passed")
    finally:
        with (run.out / "container.log").open("w") as log:
            subprocess.run(["docker", "logs", name], stdout=log, stderr=subprocess.STDOUT)
        subprocess.run(["docker", "rm", "--force", name], check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("leg", choices=["checks", "budget", "replay", "replay-plan", "package", "public-tree", "probe", "inventory", "case-cache", "pytest", "nightly", "nightly-publish"])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--image", help="package leg: use an image built by the preceding CI step")
    parser.add_argument("--viewport", choices=["1280x720", "1440x900"], default="1280x720")
    parser.add_argument("--shard", type=shard_arg, help="replay or pytest: deterministic partition k/n")
    parser.add_argument("--base", help="replay or replay-plan: include the fixed PR slice and stories touched since this Git base")
    parser.add_argument("--check", action="store_true", help="case-cache: verify generation and copy isolation")
    parser.add_argument("--benchmark", action="store_true", help="case-cache: opt in to before/after preparation measurements")
    parser.add_argument("--case", action="append", help="case-cache: select this case (repeatable; default: registry cases)")
    args = parser.parse_args()
    if args.shard and args.leg not in {"replay", "pytest"}:
        parser.error("--shard is only valid for replay or pytest")
    if args.base and args.leg not in {"replay", "replay-plan"}:
        parser.error("--base is only valid for replay or replay-plan")
    if (args.check or args.case or args.benchmark) and args.leg != "case-cache":
        parser.error("--check, --benchmark and --case are only valid for case-cache")
    run = Run(args.out)
    if args.leg == "replay":
        replay(run, args.viewport, args.shard, args.base)
    elif args.leg == "replay-plan":
        replay_plan(run, args.base)
    elif args.leg == "pytest":
        pytest_shard(run, args.shard)
    elif args.leg == "nightly":
        nightly_check(run)
    elif args.leg == "nightly-publish":
        nightly_publish(run)
    elif args.leg == "package":
        package(run, args.image)
    elif args.leg == "probe":
        rows = probe("http://127.0.0.1:8765", None)
        (run.out / "probe.json").write_text(json.dumps(rows, indent=2) + "\n")
        print(f"offline runtime: {len(rows)} requests passed")
    elif args.leg == "case-cache":
        case_cache(run, args.check, args.case, args.benchmark)
    else:
        {"checks": checks, "budget": budget, "public-tree": public_tree, "inventory": inventory}[args.leg](run)


if __name__ == "__main__":
    main()
