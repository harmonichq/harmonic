#!/usr/bin/env python3
"""Offline #389 acceptance runs. All stores and raw output stay in --out scratch.

Run each leg serially. Browser and Docker execution belongs to the coordinator.
This driver records execution, never assigns fidelity or release verdicts.
"""
from __future__ import annotations

import argparse
import ast
from datetime import datetime, timezone
import hashlib
from html.parser import HTMLParser
import json
import os
from pathlib import Path
import posixpath
import re
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

REPO = Path(__file__).resolve().parents[3]
SHOWCASE = REPO / "mockups/qa-e2e.synthetic/harmonic.sqlite"
TOKEN = "synthetic-replay-token"
# One fixed PR slice: all default and nested case stores, all three destinations,
# and the Guide, Settings, Carb questions and Pump settings entry points.
SMOKE_STORIES = (
    "S7", "S7b", "S13", "S14", "S49", "S54", "S56", "S57", "S58", "S60", "S73",
    "S74", "S76", "S77", "R19", "S91", "S98", "S99", "S110", "S113", "R8", "R18",
    "S125", "S126",
)
DRIFTS = [
    "scripts/gen_chart_builder_fixtures.py", "scripts/check_demo_fixtures.py",
    "scripts/gen_qa_e2e_db.py", "scripts/gen_findings_projection_fixtures.py",
    "scripts/gen_ic_history_event_fixtures.py", "scripts/gen_ic_block_evidence_fixtures.py",
    "scripts/gen_basal_night_evidence_fixtures.py", "scripts/gen_isf_rest_window_evidence_fixtures.py",
    "scripts/gen_missed_meal_comparison_fixtures.py", "scripts/gen_eating_sequence_fixtures.py",
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
                  "frontend/desk-behavior.replay.mjs", "frontend/c2.replay.mjs",
                  "frontend/c3.replay.mjs", "frontend/c4.replay.mjs", "frontend/replay-cases.mjs",
                  "mockups/sweep/harmonic-v2-desktop/acceptance.py", "frontend/capture.mjs", "scripts/qa_e2e_cases.py",
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


def wait_ready(base):
    for _ in range(120):
        try:
            if request(base, "/api/health")[0] == 200:
                return
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(.25)
    raise RuntimeError(f"synthetic server did not become ready at {base}")


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
    run.command("pytest", ["uv", "run", "python", "-m", "pytest", *files], timeout=1140)


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


def replay_imports(run, sources):
    """Each module's relative import targets, the relative forms `replay_graph` cannot map,
    whether it uses a dynamic import(), the literal paths it names and a registry's rows,
    read with the same pinned parser."""
    payload = run.out / "replay-import-sources.json"
    payload.write_text(json.dumps(sources))
    script = r"""
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');
const files = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const SKIP = ['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'];
const dynamic = node => node && typeof node === 'object' && (node.type === 'Import'
  || Object.entries(node).some(([key, value]) => !SKIP.includes(key)
    && (Array.isArray(value) ? value.some(dynamic) : dynamic(value))));
// eval and the Function constructor run code the selection cannot read, so
// any reference to either name (other than as a property key) is reported.
const evaluates = node => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(evaluates);
  if (node.type === 'Identifier') return ['eval', 'Function'].includes(node.name);
  return Object.entries(node).some(([key, value]) => !SKIP.includes(key)
    && !(key === 'key' && !node.computed) && evaluates(value));
};
// The graph follows named imports only. Any other relative form would leave a
// dependency it cannot map, so it is reported to stop the plan.
const unfollowable = node => {
  if (node.type === 'ExportAllDeclaration') return 'export * from';
  if (node.type === 'ExportNamedDeclaration') return 'export … from';
  if (!node.specifiers.length) return 'side-effect import';
  if (node.specifiers.some(spec => spec.type === 'ImportDefaultSpecifier')) return 'default import';
  if (node.specifiers.some(spec => spec.type === 'ImportNamespaceSpecifier')) return 'namespace import';
  if (node.specifiers.some(spec => spec.type === 'ImportSpecifier'
    && (spec.imported.name ?? spec.imported.value) === 'default')) return '{ default as … } import';
  return null;
};
const literal = node => node?.type === 'StringLiteral' ? node.value
  : node?.type === 'TemplateLiteral' && !node.expressions.length ? node.quasis[0].value.cooked : null;
const metaUrl = node => node?.type === 'MemberExpression' && node.object?.type === 'MetaProperty'
  && node.object.meta.name === 'import' && node.property?.name === 'url';
// A template with expressions reads as a path when its fixed text is
// module-relative or ends in an executable's extension; it cannot be resolved.
const pathlike = node => node.type === 'TemplateLiteral' && node.expressions.length > 0
  && (/^\.\.?\//.test(node.quasis[0].value.cooked) || /\.(py|js|mjs|cjs)$/.test(node.quasis.at(-1).value.cooked));
const result = {};
for (const [file, source] of Object.entries(files)) {
  const targets = new Set(), forms = [], paths = [], computed = [], consumed = new Set();
  const text = node => source.slice(node.start, node.end);
  let program;
  try { program = parse(source, { sourceType: 'module' }).program; }
  catch (error) { result[file] = { error: error.message }; continue; }
  for (const node of program.body) {
    if (node.source) consumed.add(node.source);
    const value = node.source?.value;
    if (typeof value === 'string' && value.startsWith('.')) {
      targets.add(posix.normalize(posix.join(posix.dirname(file), value)));
      const form = unfollowable(node);
      if (form) forms.push(`${form} not followed: '${value}'`);
    }
  }
  // require() and new URL(…, import.meta.url) resolve their own argument; every
  // other string names a path only as itself. A require of a variable (the
  // environment-named Playwright package) is a computed load it cannot see.
  const scan = node => {
    if (!node || typeof node !== 'object' || consumed.has(node)) return;
    if (Array.isArray(node)) { node.forEach(scan); return; }
    let argument = null, kind = null;
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
      [argument, kind] = [node.arguments[0], 'require'];
      if (argument && ['Identifier', 'MemberExpression'].includes(argument.type)) argument = null;
    } else if (node.type === 'NewExpression' && node.callee?.name === 'URL' && metaUrl(node.arguments[1])) {
      [argument, kind] = [node.arguments[0], 'url'];
    }
    if (argument) {
      consumed.add(argument);
      const value = literal(argument);
      if (value === null) computed.push(`${kind} ${text(argument)}`); else paths.push([kind, value]);
    }
    const value = literal(node);
    if (value !== null) paths.push(['literal', value]);
    else if (pathlike(node)) computed.push(`template ${text(node)}`);
    for (const [key, child] of Object.entries(node)) if (!SKIP.includes(key)) scan(child);
  };
  scan(program.body);
  // A registry's [id, function] rows.
  let registry;
  for (const statement of program.body) {
    const node = statement.declaration ?? statement;
    if (node.type === 'VariableDeclaration') for (const decl of node.declarations)
      if (decl.id.type === 'Identifier' && decl.id.name === 'REGISTRY') registry = decl.init?.type !== 'ArrayExpression' ? null
        : decl.init.elements.map(row => [literal(row?.elements?.[0]), row?.elements?.[1]?.type === 'Identifier' ? row.elements[1].name : null]);
  }
  // Every import declaration, relative or not, in order: its source, its
  // bindings and any attributes, so an edit to one is a change.
  const imports = program.body.filter(node => node.type === 'ImportDeclaration').map(node => [node.source.value,
    node.specifiers.map(spec => [spec.type, spec.imported?.name ?? spec.imported?.value ?? null, spec.local.name]),
    (node.attributes ?? node.assertions ?? []).map(attr => [attr.key.name ?? attr.key.value, attr.value.value]), node.phase ?? null]);
  result[file] = { targets: [...targets].sort(), dynamic: dynamic(program), evaluates: evaluates(program), imports, forms, paths, computed, registry };
}
console.log(JSON.stringify(result));
"""
    _, output = run.command("replay-imports", ["node", "--input-type=module", "-e", script, str(payload)])
    return json.loads(output)


def replay_purity(run, sources, product):
    """Which graph nodes are proven read-only toward shared state, read with the pinned parser.

    Shared state is a module's own state (a top-level binding that is not an
    import, a function or a const primitive), any non-function binding imported
    from another replay-side module, any free global name the rule does not know
    as a built-in, and every local alias of these. A function Playwright sends
    to the story's page has the page's names instead. A node is
    unsafe unless each reference it makes to shared state sits in a recognized
    read position; any other position, a `this`, an accessor, or a write rooted
    outside the node's locals, is unsafe. The same test on a function's own
    parameters says which parameters it may mutate; a reference passed to a
    graph function is reported as a call, for the caller to judge.
    """
    payload = run.out / "replay-purity-sources.json"
    payload.write_text(json.dumps({"files": sources, "product": sorted(product)}))
    script = r"""
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';
const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');
const { files, product } = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const SKIP = new Set(['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments']);
// Read-only methods and built-ins, split by result. A primitive result ends
// the chain; any other result is shared state wherever it goes next.
// `test` is left out: on a global or sticky pattern it moves `lastIndex`.
const PRIMITIVE_READS = new Set(['has', 'includes', 'indexOf', 'lastIndexOf', 'findIndex', 'some', 'every', 'join',
  'toString', 'forEach', 'startsWith', 'endsWith']);
const READS = new Set([...PRIMITIVE_READS, 'getStore', 'get', 'at', 'slice', 'keys', 'values', 'entries', 'map',
  'filter', 'find', 'reduce', 'concat', 'flat', 'flatMap']);
const ITERATES = new Set(['map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'flatMap', 'forEach']);
const PRIMITIVE_BUILTINS = new Set(['JSON.stringify', 'Array.isArray', 'String', 'Number', 'Boolean',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI']);
// Built-ins and Node imports are shared state too, but calling one of their
// functions (or constructing one) is a read. Any other free name (process,
// globalThis …) is shared state; the primitive globals are not state.
const KNOWN_GLOBALS = new Set(['Object', 'Array', 'JSON', 'Math', 'Number', 'String', 'Boolean', 'Promise', 'Map',
  'Set', 'URL', 'Date', 'RegExp', 'Error', 'setTimeout', 'setInterval', 'clearTimeout', 'structuredClone', 'console',
  'encodeURIComponent', 'decodeURIComponent', 'encodeURI', 'decodeURI', 'URLSearchParams']);
const PRIMITIVE_GLOBALS = new Set(['undefined', 'NaN', 'Infinity']);
// Output calls on process, recognized like console: they change no state a
// story reads. A process.env.<name> read is a string or undefined.
const OUTPUT = new Set(['process.stdout.write', 'process.stderr.write']);
const DELAYS = new Set(['setTimeout', 'setInterval']);
// Playwright serializes a function passed to these into the story's own page
// (a fresh browser context per story), so its free names are the page's.
const IN_PAGE = new Set(['evaluate', 'evaluateHandle', 'evaluateAll', '$eval', '$$eval', 'waitForFunction', 'addInitScript']);
const BUILTINS = new Set([...PRIMITIVE_BUILTINS, 'Object.keys', 'Object.values', 'Object.entries', 'Array.from',
  'structuredClone', 'URLSearchParams']);
const member = new Set(['MemberExpression', 'OptionalMemberExpression']);
const calls = new Set(['CallExpression', 'OptionalCallExpression', 'NewExpression']);
const functions = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration', 'ObjectMethod', 'ClassMethod']);
const bound = pattern => !pattern ? [] : pattern.type === 'Identifier' ? [pattern.name]
  : pattern.type === 'ObjectPattern' ? pattern.properties.flatMap(prop => bound(prop.value ?? prop.argument))
  : pattern.type === 'ArrayPattern' ? pattern.elements.flatMap(bound)
  : pattern.type === 'RestElement' ? bound(pattern.argument)
  : pattern.type === 'AssignmentPattern' ? bound(pattern.left) : [];
const primitive = node => !node || ['StringLiteral', 'NumericLiteral', 'BooleanLiteral', 'NullLiteral', 'BigIntLiteral'].includes(node.type)
  || (node.type === 'TemplateLiteral' && node.expressions.every(primitive))
  || (node.type === 'UnaryExpression' && primitive(node.argument))
  || (node.type === 'BinaryExpression' && primitive(node.left) && primitive(node.right));
const dotted = node => node?.type === 'Identifier' ? node.name
  : member.has(node?.type) && !node.computed && node.property.type === 'Identifier' && dotted(node.object)
    ? `${dotted(node.object)}.${node.property.name}` : null;

// Each module's top-level facts, and the nodes the graph makes of it.
const facts = {};
for (const [file, source] of Object.entries(files)) {
  const fact = { imports: new Map(), functions: new Set(), state: new Set(), top: new Set(), nodes: [], names: new Map(), browser: new Set() };
  const program = parse(source, { sourceType: 'module' }).program;
  // A module function every reference to which hands it to the page (and
  // that no other module can import) runs in the page too.
  const handed = new Map(), exported = new Set();
  const look = (node, parent, key) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(child => look(child, parent, key)); return; }
    if (node.type === 'ExportNamedDeclaration') {
      (node.declaration ? (node.declaration.declarations ?? [node.declaration]).map(decl => decl.id?.name) : node.specifiers.map(spec => spec.local.name))
        .forEach(name => exported.add(name));
    }
    if (node.type === 'Identifier' && !(member.has(parent?.type) && key === 'property' && !parent.computed)
        && !(['ObjectProperty', 'ObjectMethod'].includes(parent?.type) && key === 'key' && !parent.computed)
        && !(['FunctionDeclaration', 'VariableDeclarator'].includes(parent?.type) && key === 'id')) {
      const page = calls.has(parent?.type) && key === 'arguments' && member.has(parent.callee.type) && !parent.callee.computed
        && IN_PAGE.has(parent.callee.property.name) && parent.arguments[parent.callee.property.name.startsWith('$') ? 1 : 0] === node;
      handed.set(node.name, (handed.get(node.name) ?? true) && page);
    }
    for (const [name, child] of Object.entries(node)) if (!SKIP.has(name) && typeof child === 'object') look(child, node, name);
  };
  look(program, null, null);
  for (const statement of program.body) {
    const node = statement.declaration ?? statement;
    if (node.type === 'ImportDeclaration') {
      const value = node.source.value;
      const target = value.startsWith('.') ? posix.normalize(posix.join(posix.dirname(file), value)) : null;
      node.specifiers.forEach(spec => { fact.top.add(spec.local.name); fact.imports.set(spec.local.name, [target, spec.imported?.name ?? spec.imported?.value]); });
    } else if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) && node.id) {
      fact.top.add(node.id.name); fact.functions.add(node.id.name);
      fact.nodes.push([node.id.name, node, false]);
      if (handed.get(node.id.name) && !exported.has(node.id.name)) fact.browser.add(node.id.name);
    } else if (node.type === 'VariableDeclaration') for (const decl of node.declarations) {
      const fn = functions.has(decl.init?.type);
      for (const name of bound(decl.id)) {
        fact.top.add(name);
        if (!(decl.id.type === 'Identifier' && (fn || (node.kind === 'const' && primitive(decl.init))))) fact.state.add(name);
      }
      if (decl.id.type !== 'Identifier') continue;
      if (fn) fact.functions.add(decl.id.name);
      if (fn && handed.get(decl.id.name) && !exported.has(decl.id.name)) fact.browser.add(decl.id.name);
      fact.nodes.push([decl.id.name, decl.init, false]);
      if (decl.init?.type === 'ObjectExpression') for (const prop of decl.init.properties) {
        const key = prop.key?.name ?? prop.key?.value;
        if (key === undefined) continue;
        if (prop.type === 'ObjectMethod' || functions.has(prop.value?.type)) fact.functions.add(`${decl.id.name}.${key}`);
        else if (prop.value?.type === 'Identifier') fact.names.set(`${decl.id.name}.${key}`, prop.value.name);
        fact.nodes.push([`${decl.id.name}.${key}`, prop, prop.type === 'ObjectMethod' && prop.kind !== 'method']);
      }
    }
  }
  facts[file] = fact;
}
// A graph function a call names, through this module or an import. A table
// entry that names a top-level function (`openBasalLane,`) resolves to it.
const keyOf = (file, path) => {
  if (path === null) return null;
  const fact = facts[file], [root, ...tail] = path.split('.');
  if (fact.imports.has(root)) {
    const [target, name] = fact.imports.get(root);
    return target && facts[target] ? keyOf(target, [name, ...tail].join('.')) : null;
  }
  const named = fact.names.get(path);
  if (named !== undefined) return fact.functions.has(named) ? `${file}::${named}` : keyOf(file, named);
  return fact.functions.has(path) ? `${file}::${path}` : null;
};

// Graph functions that may hand a parameter back: a return (anywhere inside)
// that mentions a parameter or a local bound from one. Shared state passed
// to such a parameter makes the call's result shared too.
const mentions = (node, names) => {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(child => mentions(child, names));
  if (node.type === 'Identifier' && names.has(node.name)) return true;
  return Object.entries(node).some(([key, child]) => !SKIP.has(key) && mentions(child, names));
};
const returning = new Set();
for (const [file, fact] of Object.entries(facts)) for (const [name, body] of fact.nodes) {
  const fn = functions.has(body?.type) ? body : functions.has(body?.value?.type) ? body.value : null;
  if (!fn) continue;
  const names = new Set(fn.params.flatMap(bound)), declarators = [], returns = [];
  const scan = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(scan); return; }
    if (node.type === 'VariableDeclarator' && node.init) declarators.push(node);
    if (node.type === 'ReturnStatement') returns.push(node.argument);
    if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') returns.push(node.body);
    for (const [key, child] of Object.entries(node)) if (!SKIP.has(key)) scan(child);
  };
  scan(fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement' ? [fn.body] : fn.body);
  if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement') returns.push(fn.body);
  for (let grew = true; grew;) {
    grew = false;
    for (const decl of declarators) if (mentions(decl.init, names))
      for (const alias of bound(decl.id)) if (!names.has(alias)) { names.add(alias); grew = true; }
  }
  if (returns.some(value => mentions(value, names))) returning.add(`${file}::${name}`);
}

const analyse = (file, body, sharedNames, browser, kinds) => {
  const parents = new Map();
  const visit = (node, parent, key) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(child => visit(child, parent, key)); return; }
    if (typeof node.type !== 'string') return;
    parents.set(node, [parent, key]);
    for (const [name, child] of Object.entries(node)) if (!SKIP.has(name)) visit(child, node, name);
  };
  visit(body, null, null);
  const all = [...parents.keys()];
  const own = functions.has(body?.type) ? body : functions.has(body?.value?.type) ? body.value : null;
  const locals = new Set(), bindings = new Set();
  const collect = pattern => {
    if (!pattern) return;
    if (pattern.type === 'Identifier') { bindings.add(pattern); locals.add(pattern.name); }
    else if (pattern.type === 'ObjectPattern') pattern.properties.forEach(prop => collect(prop.type === 'RestElement' ? prop.argument : prop.value));
    else if (pattern.type === 'ArrayPattern') pattern.elements.forEach(collect);
    else if (pattern.type === 'RestElement') collect(pattern.argument);
    else if (pattern.type === 'AssignmentPattern') collect(pattern.left);
  };
  for (const node of all) {
    if (node.type === 'VariableDeclarator') collect(node.id);
    if (functions.has(node.type)) node.params.forEach(collect);
    if (node.type === 'CatchClause') collect(node.param);
    if (['FunctionDeclaration', 'FunctionExpression', 'ClassDeclaration', 'ClassExpression'].includes(node.type) && node.id && node !== body) {
      bindings.add(node.id); locals.add(node.id.name);
    }
  }
  // Function-level scopes: a reference is free when no enclosing function in
  // the node, nor the node itself, declares its name and the module has no
  // top-level binding of it.
  const enclosing = node => { let at = parents.get(node)?.[0]; while (at && !functions.has(at.type)) at = parents.get(at)?.[0]; return at ?? body; };
  const declared = new Map();
  const declare = (scope, name) => { if (!declared.has(scope)) declared.set(scope, new Set()); declared.get(scope).add(name); };
  for (const node of all) {
    if (node.type === 'VariableDeclarator' || node.type === 'CatchClause') bound(node.id ?? node.param).forEach(name => declare(enclosing(node), name));
    if (functions.has(node.type)) node.params.flatMap(bound).forEach(name => declare(node, name));
    if (['FunctionDeclaration', 'ClassDeclaration'].includes(node.type) && node.id && node !== body) declare(enclosing(node), node.id.name);
    if (['FunctionExpression', 'ClassExpression'].includes(node.type) && node.id) declare(node, node.id.name);
  }
  const inPage = new Set(browser ? [body] : []);
  for (const node of all) if (calls.has(node.type) && member.has(node.callee.type) && !node.callee.computed && IN_PAGE.has(node.callee.property.name)) {
    const callback = node.arguments[node.callee.property.name.startsWith('$') ? 1 : 0];
    if (functions.has(callback?.type)) inPage.add(callback);
  }
  const browserSide = node => { for (let at = node; at; at = parents.get(at)?.[0]) if (inPage.has(at)) return true; return false; };
  const local = id => { for (let at = id; at; at = parents.get(at)?.[0]) if ((functions.has(at.type) || at === body) && declared.get(at)?.has(id.name)) return true; return false; };
  const free = id => !facts[file].top.has(id.name) && !local(id) && !PRIMITIVE_GLOBALS.has(id.name) && !browserSide(id);
  // A built-in or a Node import: calling it, or one of its functions, is a read.
  const builtinRoot = id => (KNOWN_GLOBALS.has(id.name) && free(id)) || (kinds.bare.has(id.name) && !local(id));
  // A class or function binding: its members are shared state.
  const functionBinding = id => kinds.functions.has(id.name) && !local(id) && !browserSide(id);
  // A non-computed process.env.<name> read on the global process.
  const envRead = node => {
    for (let at = node; member.has(at?.type); at = at.object)
      if (!at.computed && dotted(at.object) === 'process.env' && at.object.object.type === 'Identifier' && free(at.object.object)) return true;
    return false;
  };
  const params = new Map();
  (own?.params ?? []).forEach((param, index) => bound(param).forEach(name => params.set(name, index)));
  const topLevel = facts[file].top;
  const builtin = path => path !== null && BUILTINS.has(path) && !locals.has(path.split('.')[0]) && !topLevel.has(path.split('.')[0]);
  const aliases = new Set();
  const isShared = name => sharedNames.has(name) || aliases.has(name);
  const sharedRef = id => isShared(id.name) || free(id);
  const carried = expr => {
    const found = { shared: false, params: new Set() };
    const go = node => {
      if (!node || envRead(node)) return;
      if (node.type === 'Identifier' || member.has(node.type)) {
        let root = node;
        while (member.has(root.type)) root = root.object;
        if (root.type === 'Identifier') {
          if (sharedRef(root)) found.shared = true;
          if (params.has(root.name)) found.params.add(params.get(root.name));
        } else go(root);
      } else if (['CallExpression', 'OptionalCallExpression'].includes(node.type)) {
        const callee = node.callee, path = dotted(callee), target = keyOf(file, path);
        const method = member.has(callee.type) && !callee.computed ? callee.property.name : null;
        let root = callee;
        while (member.has(root.type)) root = root.object;
        // A built-in's function returns what its arguments carry, never itself.
        const onBuiltin = root.type === 'Identifier' && builtinRoot(root);
        if (READS.has(method) && !PRIMITIVE_READS.has(method) && !target && !onBuiltin) go(callee.object);
        if ((target && returning.has(target)) || (builtin(path) && !PRIMITIVE_BUILTINS.has(path)))
          node.arguments.forEach(arg => go(arg.type === 'SpreadElement' ? arg.argument : arg));
      } else if (node.type === 'ArrayExpression') node.elements.forEach(element => go(element?.type === 'SpreadElement' ? element.argument : element));
      else if (node.type === 'ObjectExpression') node.properties.forEach(prop => go(prop.type === 'SpreadElement' ? prop.argument : prop.value));
      else if (node.type === 'ConditionalExpression') { go(node.consequent); go(node.alternate); }
      else if (node.type === 'LogicalExpression') { go(node.left); go(node.right); }
      else if (node.type === 'SequenceExpression') go(node.expressions.at(-1));
      else if (['AssignmentExpression'].includes(node.type)) go(node.right);
      else if (node.type === 'AwaitExpression') go(node.argument);
    };
    go(expr);
    return found;
  };
  // What a call receives: its non-function arguments and, for a method, its
  // receiver unless that is a built-in namespace being called.
  const received = node => {
    const flows = node.arguments.filter(arg => !functions.has(arg.type)).map(arg => carried(arg.type === 'SpreadElement' ? arg.argument : arg));
    if (member.has(node.callee.type)) {
      let root = node.callee.object;
      while (member.has(root.type) && !root.computed) root = root.object;
      if (!(root.type === 'Identifier' && builtinRoot(root))) flows.push(carried(node.callee.object));
    }
    return { shared: flows.some(flow => flow.shared), params: new Set(flows.flatMap(flow => [...flow.params])) };
  };
  // Aliases: a local bound to shared state or a parameter, a loop variable
  // over one, a callback's parameters when its call receives one, and a
  // parameter default.
  for (let grew = true; grew;) {
    grew = false;
    const take = (names, flow) => {
      for (const name of names) {
        if (flow.shared && !aliases.has(name)) { aliases.add(name); grew = true; }
        for (const index of flow.params) if (!params.has(name)) { params.set(name, index); grew = true; }
      }
    };
    for (const node of all) {
      if (node.type === 'VariableDeclarator' && node.init) take(bound(node.id), carried(node.init));
      if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier' && locals.has(node.left.name)) take([node.left.name], carried(node.right));
      if (['ForOfStatement', 'ForInStatement'].includes(node.type))
        take(node.left.type === 'VariableDeclaration' ? node.left.declarations.flatMap(decl => bound(decl.id)) : bound(node.left), carried(node.right));
      if (node.type === 'AssignmentPattern') {
        const [parent, key] = parents.get(node);
        if (functions.has(parent?.type) && key === 'params') take(bound(node.left), carried(node.right));
      }
      if (calls.has(node.type)) {
        const flow = received(node);
        if (flow.shared || flow.params.size) for (const arg of node.arguments) if (functions.has(arg.type)) take(arg.params.flatMap(bound), flow);
      }
    }
  }
  let unsafe = false;
  const mutates = new Set(), sharedCalls = [], forwards = [];
  // Writes: rebinding a local is fine; any other target is shared state, a
  // parameter or a binding outside the node.
  for (const node of all) {
    if (node.type === 'ThisExpression') unsafe = true;
    const target = node.type === 'AssignmentExpression' ? node.left
      : node.type === 'UpdateExpression' || (node.type === 'UnaryExpression' && node.operator === 'delete') ? node.argument
      : ['ForOfStatement', 'ForInStatement'].includes(node.type) && node.left.type !== 'VariableDeclaration' ? node.left : null;
    if (!target) continue;
    let root = target;
    while (member.has(root.type)) root = root.object;
    const names = member.has(target.type) ? (root.type === 'Identifier' ? [root.name] : []) : bound(target);
    if (member.has(target.type) && root.type !== 'Identifier') unsafe = true;
    const pageWrite = browserSide(target);
    for (const name of names) {
      if (params.has(name)) mutates.add(params.get(name));
      const outside = !locals.has(name) && !(pageWrite && !topLevel.has(name));
      if ((member.has(target.type) ? isShared(name) : sharedNames.has(name)) || outside) unsafe = true;
    }
  }
  // Every reference to shared state or a parameter must sit in a read position.
  const judge = (id, ofBinding = false) => {
    const shared = sharedRef(id) || ofBinding, param = params.has(id.name) ? params.get(id.name) : null;
    const bad = () => { if (shared) unsafe = true; if (param !== null) mutates.add(param); };
    const hand = (key, index) => { if (shared) sharedCalls.push([key, index]); if (param !== null) forwards.push([param, key, index]); };
    let expr = id;
    for (;;) {
      const [parent, key] = parents.get(expr) ?? [null, null];
      if (!parent) return;
      if (member.has(parent.type) && key === 'object') {
        if (parent.computed) { bad(); return; }
        if (shared && envRead(parent)) return;
        expr = parent; continue;
      }
      if (calls.has(parent.type) && key === 'callee') {
        if (keyOf(file, dotted(expr))) return;
        if (OUTPUT.has(dotted(expr)) && free(id)) return;
        if (builtinRoot(id)) return;
        const method = member.has(expr.type) && !expr.computed ? expr.property.name : null;
        if (parent.type !== 'NewExpression' && READS.has(method)) {
          const callback = parent.arguments[0];
          if (ITERATES.has(method) && callback && !functions.has(callback.type)) {
            const target = keyOf(file, dotted(callback));
            if (target) hand(target, '*'); else if (!builtin(dotted(callback))) bad();
          }
          if (PRIMITIVE_READS.has(method)) return;
          expr = parent; continue;
        }
        bad(); return;
      }
      if (calls.has(parent.type) && key === 'arguments') {
        const path = dotted(parent.callee), target = keyOf(file, path);
        if (DELAYS.has(path) && !topLevel.has(path) && !locals.has(path) && parent.arguments.indexOf(expr) === 1) return;
        // A built-in function as an iterating read's callback is only called.
        if (builtinRoot(id) && (expr === id || member.has(expr.type)) && parent.arguments.indexOf(expr) === 0
            && member.has(parent.callee.type) && !parent.callee.computed && ITERATES.has(parent.callee.property.name)) return;
        if (target) {
          hand(target, parent.arguments.indexOf(expr));
          if (!returning.has(target)) return;
        } else if (!builtin(path)) { bad(); return; }
        else if (PRIMITIVE_BUILTINS.has(path)) return;
        expr = parent; continue;
      }
      if (parent.type === 'SpreadElement') {
        const [outer, outerKey] = parents.get(parent) ?? [null, null];
        if (['ArrayExpression', 'ObjectExpression'].includes(outer?.type)) { expr = outer; continue; }
        if (calls.has(outer?.type) && outerKey === 'arguments') {
          const path = dotted(outer.callee), target = keyOf(file, path);
          if (target) {
            hand(target, '*');
            if (!returning.has(target)) return;
          } else if (!builtin(path)) { bad(); return; }
          else if (PRIMITIVE_BUILTINS.has(path)) return;
          expr = outer; continue;
        }
        bad(); return;
      }
      if (parent.type === 'ArrayExpression') { expr = parent; continue; }
      if (parent.type === 'ObjectProperty' && key === 'value' && parents.get(parent)?.[0]?.type === 'ObjectExpression') {
        expr = parents.get(parent)[0]; continue;
      }
      if (['ClassDeclaration', 'ClassExpression'].includes(parent.type) && key === 'superClass') return;
      if (parent.type === 'ConditionalExpression') { if (key === 'test') return; expr = parent; continue; }
      if (['LogicalExpression', 'AwaitExpression'].includes(parent.type)) { expr = parent; continue; }
      if (parent.type === 'SequenceExpression') { if (expr !== parent.expressions.at(-1)) return; expr = parent; continue; }
      if (['BinaryExpression', 'TemplateLiteral', 'ExpressionStatement'].includes(parent.type)) return;
      if (parent.type === 'UnaryExpression') { if (parent.operator === 'delete') bad(); return; }
      if (['IfStatement', 'WhileStatement', 'DoWhileStatement', 'ForStatement'].includes(parent.type) && key === 'test') return;
      if ((parent.type === 'SwitchStatement' && key === 'discriminant') || (parent.type === 'SwitchCase' && key === 'test')) return;
      if (member.has(parent.type) && key === 'property') return;
      if (['ObjectProperty', 'ClassProperty'].includes(parent.type) && key === 'key') return;
      if (parent.type === 'VariableDeclarator' && key === 'init') { if (parent.id.type !== 'Identifier') bad(); return; }
      if (parent.type === 'AssignmentExpression' && key === 'right') {
        if (!(parent.left.type === 'Identifier' && locals.has(parent.left.name))) bad();
        return;
      }
      if (['ForOfStatement', 'ForInStatement'].includes(parent.type) && key === 'right') {
        const left = parent.left.type === 'VariableDeclaration' ? parent.left.declarations[0].id : parent.left;
        if (left.type !== 'Identifier') bad();
        return;
      }
      if (parent.type === 'AssignmentPattern' && key === 'right') {
        const [outer, outerKey] = parents.get(parent) ?? [null, null];
        if (!(functions.has(outer?.type) && outerKey === 'params' && parent.left.type === 'Identifier')) bad();
        return;
      }
      if (parent.type === 'ReturnStatement' || (parent.type === 'ArrowFunctionExpression' && key === 'body')) {
        let fn = parent;
        while (fn && !functions.has(fn.type)) fn = parents.get(fn)?.[0];
        const [call, callKey] = parents.get(fn) ?? [null, null];
        const into = calls.has(call?.type) && callKey === 'arguments' && member.has(call.callee.type) && !call.callee.computed
          && ITERATES.has(call.callee.property.name) && !PRIMITIVE_READS.has(call.callee.property.name)
          && carried(call.callee.object).shared;
        if (shared && !into) unsafe = true;
        return;
      }
      bad(); return;
    }
  };
  for (const node of all) {
    if (node.type !== 'Identifier' || bindings.has(node)) continue;
    const [parent, key] = parents.get(node) ?? [null, null];
    if (member.has(parent?.type) && key === 'property' && !parent.computed) continue;
    if (['ObjectProperty', 'ObjectMethod', 'ClassMethod', 'ClassProperty'].includes(parent?.type) && key === 'key' && !parent.computed) continue;
    if (['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent?.type)) continue;
    if (parent?.type === 'AssignmentExpression' && key === 'left') continue;
    if (parent?.type === 'UpdateExpression') continue;
    if (['ForOfStatement', 'ForInStatement'].includes(parent?.type) && key === 'left') continue;
    if (parent?.type === 'MetaProperty') continue;
    if (sharedRef(node) || params.has(node.name)) judge(node);
    else if (member.has(parent?.type) && key === 'object' && functionBinding(node)) judge(node, true);
  }
  // A named graph function handed to a call that receives shared state or a
  // parameter receives it in every parameter.
  for (const node of all) if (calls.has(node.type)) {
    const flow = received(node);
    if (!flow.shared && !flow.params.size) continue;
    for (const arg of node.arguments) {
      const target = functions.has(arg.type) ? null : keyOf(file, dotted(arg));
      if (!target) continue;
      if (flow.shared) sharedCalls.push([target, '*']);
      for (const index of flow.params) forwards.push([index, target, '*']);
    }
  }
  return { unsafe, mutates: [...mutates].sort(), calls: sharedCalls, forwards };
};

const result = {};
for (const [file, fact] of Object.entries(facts)) {
  const shared = new Set(fact.state), bare = new Set(), functionNames = new Set();
  for (const name of fact.functions) if (!name.includes('.')) functionNames.add(name);
  for (const [local, [target, name]] of fact.imports) {
    if (!target) { shared.add(local); bare.add(local); }
    else if (facts[target] && !product.includes(target)) (facts[target].functions.has(name) ? functionNames : shared).add(local);
  }
  for (const [name, body, accessor] of fact.nodes) {
    const verdict = analyse(file, body, shared, fact.browser.has(name), { bare, functions: functionNames });
    result[`${file}::${name}`] = { ...verdict, unsafe: verdict.unsafe || accessor };
  }
  for (const [name] of fact.nodes)
    if (name.includes('.') && result[`${file}::${name}`].unsafe) result[`${file}::${name.split('.')[0]}`].unsafe = true;
}
console.log(JSON.stringify(result));
"""
    _, output = run.command("replay-purity", ["node", "--input-type=module", "-e", script, str(payload)])
    return json.loads(output)


def smoke_selection(run, base, ids):
    """Select the fixed smoke slice plus affected replay/recipe dependency closures.

    The replay graph holds the replay entries and every module they reach by a
    relative named import. A change to replay code selects every story, naming
    the key, unless every changed key is a story-table entry whose closure is
    proven read-only toward shared state (see replay_purity); those select the
    stories whose closure reaches them. A product module (one the app's entry
    reaches) selects the stories that call a changed function and otherwise
    leaves the fixed slice. An import it
    cannot map (an untracked target, a dynamic import(), a side-effect,
    default, namespace or re-export form, or a dependency with no node) stops
    the plan. An executable file the replay names by a literal path but does
    not import selects every story when it changes, and a literal path it
    cannot resolve stops the plan.
    """
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=REPO, text=True)

    def replay_modules(ref):
        tracked = set(git("ls-tree", "-r", "--name-only", ref).splitlines())
        files = {path: git("show", f"{ref}:{path}") for path in sorted(tracked) if path.startswith("frontend/")
                 and (path.endswith(".replay.mjs") or path == "frontend/replay-cases.mjs")}
        while True:
            found = replay_imports(run, files)
            broken = sorted(f"{path}: {entry['error']}" for path, entry in found.items() if "error" in entry)
            require(not broken, f"replay modules cannot be parsed at {ref}: {broken}")
            dynamic = sorted(path for path, entry in found.items() if entry["dynamic"])
            require(not dynamic, f"replay modules use a dynamic import() the selection cannot follow: {dynamic}")
            evaluated = sorted(path for path, entry in found.items() if entry["evaluates"])
            require(not evaluated, f"replay modules run code through eval or the Function constructor: {evaluated}")
            forms = sorted(f"{path}: {form}" for path, entry in found.items() for form in entry["forms"])
            require(not forms, f"replay modules use an import form the selection cannot follow: {forms}")
            wanted = {target for entry in found.values() for target in entry["targets"]} - files.keys()
            unresolved = sorted(wanted - tracked)
            require(not unresolved, f"replay imports resolve to no tracked file at {ref}: {unresolved}")
            if not wanted:
                break
            files.update({path: git("show", f"{ref}:{path}") for path in sorted(wanted)})
        # Executables named by path, never imported. A require probes Node's
        # extensions; a URL resolves against its module. Data files are left
        # out: the replay only checks its exploration fixtures exist, and the
        # showcase follows its generator and recipes.
        executable = (".py", ".js", ".mjs", ".cjs")
        loads, unresolved = set(), []
        for file, entry in found.items():
            unresolved += [f"{file}: {form}" for form in entry["computed"]]
            for kind, value in entry["paths"]:
                relative = value.startswith(("./", "../"))
                if kind == "require" and not relative and not value.startswith("/"):
                    continue
                if kind == "literal" and not (value.endswith(executable) and (
                        relative or re.fullmatch(r"(?:[\w@+-][\w@.+-]*/)*[\w@+-][\w@.+-]*", value))):
                    continue
                path = posixpath.normpath(posixpath.join(posixpath.dirname(file), value)) \
                    if relative or kind == "url" else value
                probes = [path, *(path + suffix for suffix in [".js", ".json", ".node", "/index.js", "/index.json",
                                                               "/index.node"] if kind == "require")]
                hit = next((probe for probe in probes if probe in tracked), None)
                if hit is None:
                    unresolved.append(f"{file}: {kind} '{value}'")
                elif hit.endswith(executable) and hit not in files:
                    loads.add(hit)
        require(not unresolved, f"replay modules name a path the selection cannot resolve at {ref}: {sorted(unresolved)}")
        # Product code: the modules the app's entry reaches by static import.
        # frontend/index.html loads ./main.js, and vite.config.mjs roots the
        # build at frontend/. Stories reach product code through the browser;
        # only the functions a story calls are replay code there. An import
        # that resolves to nothing shrinks this set, which only widens the
        # selection.
        app_entry = "frontend/main.js"
        require(app_entry in tracked, f"the app entry {app_entry} is not tracked at {ref}, so product code cannot be told apart")
        shipped, pending = set(), {app_entry}
        while pending:
            app = replay_imports(run, {path: git("show", f"{ref}:{path}") for path in sorted(pending)})
            broken = sorted(f"{path}: {entry['error']}" for path, entry in app.items() if "error" in entry)
            require(not broken, f"the app's modules cannot be parsed at {ref}: {broken}")
            shipped |= pending
            pending = {target for entry in app.values() for target in entry["targets"]
                       if target.endswith((".js", ".mjs")) and target in tracked} - shipped
        return files, loads, shipped & files.keys(), found

    base = git("merge-base", base, "HEAD").strip()
    changed_files = set(git("diff", "--name-only", base, "HEAD").splitlines())
    sources, loaded, shipped, scans, recipes = [], set(), [], [], []
    for ref in [base, "HEAD"]:
        files, loads, product, found = replay_modules(ref)
        sources.append(files)
        loaded |= loads
        shipped.append(product)
        scans.append(found)
        recipes.append(recipe_graph(git("show", f"{ref}:scripts/qa_e2e_cases.py")))
    before, after = replay_graph(run, sources)
    for graph, files in [(before, sources[0]), (after, sources[1])]:
        dangling = sorted({f"{dep.split('::', 1)[0]} ({dep})" for node in graph.values() for dep in node["deps"]
                           if dep.split("::", 1)[0] in files and dep not in graph})
        require(not dangling, f"replay dependencies name no node in their module: {dangling}")
    # Changes to the runner itself, registry, transport or generator can affect
    # every story. They must not disappear behind a function-only comparison,
    # and neither may an executable the replay loads by path.
    global_files = {"scripts/gen_qa_e2e_db.py", "frontend/replay-cases.mjs",
                    "frontend/capture.mjs", "frontend/browser-runner.js",
                    "mockups/sweep/harmonic-v2-desktop/acceptance.py", "package-lock.json"}
    global_symbols = {"frontend/desk-behavior.replay.mjs::" + name
                      for name in ["REGISTRY", "main", "openApp", "requireEnvironment", "requireAssets"]}
    # Every node depends on its module's top-level statements (`@module`), so
    # those statements depend on each top-level node their text names: a
    # function that top-level code wraps or calls is reached by the module's
    # callers. Two names are left out. A global symbol's own change already
    # selects every story. A story table is the roots, and each story already
    # depends on its own entry.
    tables = {*(f"frontend/c{chunk}.replay.mjs::C{chunk}_STORIES" for chunk in [2, 3, 4]),
              "frontend/c4.replay.mjs::C4_RETIREMENTS"}
    for graph in [before, after]:
        for key in [key for key in graph if key.endswith("::@module")]:
            file = key.split("::", 1)[0]
            deps = set()
            for name in re.findall(r"[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*", graph[key]["text"]):
                parts = name.split(".")
                dep = next((f"{file}::{'.'.join(parts[:n])}" for n in range(len(parts), 0, -1)
                            if f"{file}::{'.'.join(parts[:n])}" in graph), None)
                if dep and dep not in global_symbols | tables:
                    deps.add(dep)
            graph[key]["deps"] = sorted(deps)
    changed = {key for key in before.keys() | after.keys()
               if before.get(key) != after.get(key)}
    changed_recipes = {key for key in recipes[0].keys() | recipes[1].keys()
                       if recipes[0].get(key) != recipes[1].get(key)}
    _, output = run.command("story-cases", ["node", "--input-type=module", "-e",
        "import {REGISTRY} from './frontend/desk-behavior.replay.mjs';"
        "import {storyCase} from './frontend/replay-cases.mjs';"
        "console.log(JSON.stringify(Object.fromEntries(REGISTRY.map(([id])=>[id,storyCase(id)]))))"])
    defaults = json.loads(next(line for line in output.splitlines() if line.startswith("{")))
    require(len(SMOKE_STORIES) == 24 and len(set(SMOKE_STORIES)) == 24
            and set(SMOKE_STORIES) <= set(ids), "smoke inventory differs from the frozen registry")
    case_names = {key.removeprefix("case:") for graph in recipes for key in graph if key.startswith("case:")}
    selected, reasons, coverage, destinations = set(SMOKE_STORIES), {}, {}, {}
    # The per-story runner (main's loop and openApp) runs for every story, so
    # what it reaches, a product function included, joins every story's
    # closure. Its walk stops at the registry and at the story tables it looks
    # stories up in: those hold the stories themselves, each its own root, so
    # a table entry stays precise.
    stops = {"frontend/desk-behavior.replay.mjs::REGISTRY", *tables}
    runner = [closure({key: node for key, node in graph.items() if key not in stops},
                      [f"frontend/desk-behavior.replay.mjs::{name}" for name in ["main", "openApp"]])
              for graph in [before, after]]
    affected = {}
    for identity in ids:
        touched, used_cases, visited = set(), {defaults[identity]}, set()
        for graph, shared in zip([before, after], runner):
            roots = [f"frontend/c{chunk}.replay.mjs::C{chunk}_STORIES.{identity}" for chunk in [4, 3, 2]]
            root = next((key for key in roots if key in graph),
                        f"frontend/desk-behavior.replay.mjs::{identity}")
            dependencies = closure(graph, [root])
            touched.update((dependencies | shared) & changed)
            visited.update(value for key in dependencies for value in graph[key].get("destinations", []))
            used_cases.update(value for key in dependencies for value in graph[key].get("strings", []) if value in case_names)
        coverage[identity] = sorted(used_cases)
        destinations[identity] = sorted(visited)
        for graph in recipes:
            touched.update(closure(graph, ["case:" + name for name in used_cases]) & changed_recipes)
        affected[identity] = touched

    # Replay code is judged by one default: a replay-side change plans the
    # complete ledger, naming each key, unless every changed key is a story
    # entry of a story table whose closure is proven read-only toward shared
    # state: no replay-side node in it is unsafe (see replay_purity), and none
    # carries shared state into a parameter its callee may mutate. Anything
    # the proof does not recognize errs to the complete ledger. Those entries
    # select exactly the stories whose closure reaches them. A table whose
    # entries alone changed (its text with every entry and separator removed
    # is unchanged) is judged by its entries. A module is product code only if
    # the app reaches it at every commit that has it as a replay module;
    # product code keeps the #406 policy: a function a story's closure reaches
    # selects that story, and any other change leaves the fixed slice. A
    # registry row whose id is not its function's name plans the complete
    # ledger too, since the roots are found by id.
    def shell(graph, key):
        text = graph[key]["text"]
        for child, node in graph.items():
            if child.startswith(key + "."):
                suffix = ",".join(node["tags"])
                text = text.replace(node["text"][:len(node["text"]) - len(suffix)], "", 1)
        text = re.sub(r",+", ",", re.sub(r"\s+", "", text))
        return text.replace("{,", "{").replace(",}", "}")

    product = {module for module in sources[0].keys() | sources[1].keys()
               if all(module in shipped[index] for index in (0, 1) if module in sources[index])}
    # Purity (see replay_purity): each node's own verdict at either commit; its
    # parameter mutations, spread through the graph calls that pass its
    # parameters on; then each graph call that carries shared state into a
    # parameter its callee may mutate. A callee never read is taken to mutate.
    own, mutates, calls, forwards = set(), {}, [], []
    for files, shipped_here in zip(sources, shipped):
        for key, node in replay_purity(run, files, shipped_here).items():
            if node["unsafe"]:
                own.add(key)
            mutates.setdefault(key, set()).update(node["mutates"])
            calls += [(key, callee, index) for callee, index in node["calls"]]
            forwards += [(key, param, callee, index) for param, callee, index in node["forwards"]]

    def mutated(callee, index):
        return callee not in mutates or bool(mutates[callee] if index == "*" else index in mutates[callee])

    grew = True
    while grew:
        grew = False
        for key, param, callee, index in forwards:
            if param not in mutates[key] and mutated(callee, index):
                mutates[key].add(param)
                grew = True
    impure = {key for key in own | {key for key, callee, index in calls if mutated(callee, index)}
              if key.split("::", 1)[0] not in product}

    def tainted(key):
        return sorted({node for graph in [before, after] if key in graph for node in closure(graph, [key]) & impure})

    def precise(key):
        if key in tables:
            return key in before and key in after and shell(before, key) == shell(after, key)
        table = next((table for table in tables if key.startswith(table + ".")), None)
        return (table is not None and re.fullmatch(r"[SR]\d+[a-z]?", key[len(table) + 1:]) is not None
                and not tainted(key))

    unsafe = sorted(key for key in changed if key.split("::", 1)[0] not in product and not precise(key))
    # An import line binds no graph key when its source is a Node module or a
    # package, so a replay-side module's import declarations are compared
    # whole, and any difference plans the complete ledger.
    imported = [{path: entry["imports"] for path, entry in found.items()} for found in scans]
    relinked = sorted(path for path in imported[0].keys() | imported[1].keys()
                      if path not in product and imported[0].get(path) != imported[1].get(path))
    rows = [found["frontend/desk-behavior.replay.mjs"].get("registry", []) for found in scans]
    misfiled = sorted({f"registry row {identity} does not run {identity}" for table in rows if table
                       for identity, function in table if identity is None or identity != function})
    if any(table is None for table in rows):
        misfiled.append("the registry is not an array of [id, function] rows")
    infrastructure = bool(changed_files & (global_files | loaded) or changed & global_symbols)
    global_change = infrastructure or bool(unsafe) or bool(relinked) or bool(misfiled)
    for identity in ids:
        if global_change or affected[identity]:
            selected.add(identity)
            reasons[identity] = sorted(affected[identity]) if not global_change else [
                *(["shared replay infrastructure"] if infrastructure else []),
                *(f"replay-side change: {key}" + (f" (reaches impure {', '.join(tainted(key))})" if tainted(key) else "")
                  for key in unsafe), *(f"replay-side import change: {path}" for path in relinked), *misfiled]
    (run.out / "smoke.json").write_text(json.dumps({"base": base, "head": git("rev-parse", "HEAD").strip(),
        "changed_files": sorted(changed_files), "reasons": reasons, "case_coverage": coverage, "destination_coverage": destinations,
        "replay_modules": sorted(sources[0].keys() | sources[1].keys()), "product_modules": sorted(product),
        "path_loads": sorted(loaded),
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
           "BASE_URL": "http://127.0.0.1:8765", "CASE_STORE_DIR": str(run.out / "cases"),
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
    # ACCEPTANCE.md's Fast-gates measurements and ceilings states the timing basis.
    _, output = run.command("complete-replay", ["node", "frontend/desk-behavior.replay.mjs"], env=env, timeout=960 if shard and not base else 3000)
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
        "import {REGISTRY} from './frontend/desk-behavior.replay.mjs';"
        "console.log(JSON.stringify(REGISTRY.map(([id])=>id)))"])
    ids = json.loads(next(line for line in output.splitlines() if line.startswith('["')))
    ledger = (REPO / "mockups/harmonic-v2-desktop.behavior.md").read_text()
    entries = re.findall(r"^([SR]\d+[a-z]?) ·", ledger, re.M)
    required = set(entries)
    counts = {"issued": len(entries),
              "active": sum(identity.startswith("S") for identity in entries),
              "retired": sum(identity.startswith("R") for identity in entries)}
    print(f"ledger inventory: {counts}")
    require(counts == {"issued": 171, "active": 152, "retired": 19}
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
import { REGISTRY } from './frontend/desk-behavior.replay.mjs';
import { createCaseServer, storyCase } from './frontend/replay-cases.mjs';
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
    run.command("node", ["node", "--test", "frontend/**/*.test.js"])
    run.command("openspec", ["npx", "--yes", "@fission-ai/openspec@1", "validate", "--all", "--strict"])
    for guard in ["check_adr_numbers", "check_owned_identifiers", "check_public_allowlist"]:
        run.command(guard, [sys.executable, f"scripts/{guard}.py"])
    for number, path in enumerate(DRIFTS, 1):
        run.command(f"drift-{number:02}", ["uv", "run", "python", path]
                    + ([] if path.endswith("check_demo_fixtures.py") else ["--check"]))
    run.command("event-drift", ["node", "mockups/diagnose-event-comparison.synthetic/generate.mjs",
                                "--check"])


def budget(run):
    # The desk must already be built. No concurrent suites on this machine.
    require((REPO / "frontend" / "dist/index.html").is_file(),
            "run npm ci && npm run build first")
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
    """Request the packaged shell and its real assets; no source-text stand-in."""
    prefix = "/assets/"
    rows = []
    for page in ["/", "/diagnose", "/changes", "/day"]:
        status, body, headers = request(base, page)
        require(status == 200, f"{page}: {status}")
        require(headers.get("cache-control") == "no-cache", f"{page}: shell cache policy")
        parser = ShellAssets()
        parser.feed(body.decode())
        require(parser.paths, f"{page}: no packaged assets")
        for asset in parser.paths:
            require(asset.startswith(prefix), f"{page} references an external or misplaced asset: {asset}")
            code, content, cache = request(base, asset)
            require(code == 200 and content, f"{asset}: absent packaged bytes ({code})")
            require(cache.get("cache-control") == "public, max-age=31536000, immutable", f"{asset}: cache policy")
            rows.append({"path": asset, "status": code, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
        rows.append({"path": page, "status": status})
    # ADR 416: every retired address answers 404, and none redirects.
    for path in ["/unlisted", "/index.html", "/v1", "/v2", "/v2/", "/v2/diagnose",
                 "/v2/changes", "/v2/day", "/v2/assets/no-such.js",
                 "/verify", "/plan", "/settings", "/guide", "/assets/no-such.js"]:
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
    require((tree / "frontend/main.js").is_file(), "public tree omitted the desk source")
    require((tree / "vite.config.mjs").is_file(), "public tree omitted the build config")
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
