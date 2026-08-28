// #672: regression guard for the fail-closed preflight in the three
// `*.browser.test.mjs` suites. Those suites are excluded from the
// `frontend/**/*.test.js` glob (that's the point — they need real browser
// infrastructure this dependency-free gate does not have), so nothing else in
// this glob would notice if their preflight regressed back to a silent
// `{ skip: ... }`. This file stays dependency-free (node:test,
// node:child_process, node:fs only) and must pass with NO Playwright
// installed — that is exactly CI's `frontend` job.
//
// Each suite is spawned twice: once with PLAYWRIGHT_MODULE and VENDOR_DIR
// both removed (expect it to name both), and once with VENDOR_DIR pointed at
// a fresh empty directory (expect it to name the missing vendored assets).
// Both spawns die at the preflight `throw`, before any browser launches, so
// each is fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SUITES = [
  { file: 'cockpit-shell.browser.test.mjs', payload: false },
  { file: 'diagnose-workstation.browser.test.mjs', payload: false },
  { file: 'diagnose-canvas-composition.browser.test.mjs', payload: true },
];

function spawnSuite(suite, envOverrides) {
  const env = { ...process.env };
  delete env.PLAYWRIGHT_MODULE;
  delete env.VENDOR_DIR;
  delete env.PAYLOAD;
  // node:test detects that it is already running under `node --test` (via an
  // inherited internal env var) and treats a nested `--test` invocation as a
  // no-op recursive call. Spawning `node <file>` directly (no `--test` flag)
  // sidesteps that: the suite still runs as a module and its top-level
  // preflight `throw` still aborts the process before any `test()` runs.
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, envOverrides);
  const result = spawnSync(process.execPath, [join('frontend', suite)],
    { cwd: ROOT, env, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

for (const { file: suite, payload } of SUITES) {
  test(`${suite} fails closed and names missing prerequisites with no env`, () => {
    const { status, output } = spawnSuite(suite, {});
    assert.notEqual(status, 0, `${suite} must exit nonzero when prerequisites are absent`);
    assert.match(output, /PLAYWRIGHT_MODULE/, `${suite} must name PLAYWRIGHT_MODULE as missing`);
    assert.match(output, /VENDOR_DIR/, `${suite} must name VENDOR_DIR as missing`);
    if (payload) assert.match(output, /PAYLOAD/, `${suite} must name PAYLOAD as missing`);
  });

  test(`${suite} fails closed and names the missing vendored assets when VENDOR_DIR is empty`, () => {
    const dir = mkdtempSync(join(tmpdir(), '.browser-gates-fail-closed-'));
    try {
      const relativeToFrontend = relative(FRONTEND, dir);
      assert.ok(relativeToFrontend === '..' || relativeToFrontend.startsWith(`..${sep}`),
        `${suite} must keep its empty VENDOR_DIR outside the frontend source tree`);
      const { status, output } = spawnSuite(suite, { VENDOR_DIR: dir });
      assert.notEqual(status, 0, `${suite} must exit nonzero when the vendored assets are absent`);
      assert.match(output, /vue\.esm-browser\.js/, `${suite} must name the missing vue.esm-browser.js`);
      assert.match(output, /echarts\.min\.js/, `${suite} must name the missing echarts.min.js`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the composition suite registers and executes the retired Explore-mode guard', () => {
  const source = readFileSync(join(FRONTEND,
    'diagnose-canvas-composition.browser.test.mjs'), 'utf8');
  assert.match(source, /test\('Explore mode stays retired — RETIRED'/,
    'the browser suite must register the retired-mode guard');
  assert.match(source,
    /console\.log\(`RETIRED — \$\{RETIRED_EXPLORE_MODE_SANCTION\}`\)/,
    'the guard must print its sanction on every run');
  assert.match(source, /name: \/\^\(Findings\|Explore\)\$\//,
    'the guard must look for either half of the retired mode switch');
  assert.match(source, /assert\.equal\(await modeSwitch\.count\(\), 0/,
    'the guard must fail when the retired mode switch returns');
  assert.match(source,
    /sanction: ConnorGriffin · 2026-08-26 · "Diagnose does NOT need to host an explore mode\. we\\'re building a better version of it right now\."/,
    'the guard must carry ADR 215\'s amended operator sanction');
});
