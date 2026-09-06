// #672: regression guard for the fail-closed preflight in the three
// `*.browser.test.mjs` suites. Those suites are excluded from the
// `frontend/**/*.test.js` glob (that's the point — they need real browser
// infrastructure this dependency-free gate does not have), so nothing else in
// this glob would notice if their preflight regressed back to a silent
// `{ skip: ... }`. This file stays dependency-free (node:test,
// node:child_process, node:fs only) and must pass with NO Playwright
// installed — that is exactly CI's `frontend` job.
//
// Each shell-serving leg is spawned twice against an empty built directory:
// once without Playwright (expect it to name both prerequisites), then with a
// minimal loadable Playwright module (expect the build command on its own).
// Both spawns die at the preflight `throw`, before any browser launches, so
// each is fast.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_FRONTEND = realpathSync(FRONTEND);

const SUITES = [
  { file: 'day-surface.browser.mjs' },
  { file: 'plan-first-match.browser.mjs' },
  { file: 'cockpit-shell.browser.test.mjs' },
  { file: 'diagnose-workstation.browser.test.mjs' },
  { file: 'diagnose-canvas-composition.browser.test.mjs', payload: true },
  { file: 'diagnose-workstation-behavior.replay.mjs', target: true, payload: true },
  { file: 'diagnose-event-comparison-behavior.replay.mjs', target: true },
  { file: 'verify-660-story-behavior.replay.mjs', target: true, payload: 'mockups/verify-660-story.synthetic/payload.json' },
  { file: '../mockups/diagnose-event-comparison-support-audit.mjs', target: true },
];

function spawnSuite(suite, envOverrides) {
  const env = { ...process.env };
  delete env.PLAYWRIGHT_MODULE;
  delete env.HARMONIC_DIST;
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

function isOutsideFrontend(path) {
  const relativeToFrontend = relative(REAL_FRONTEND, realpathSync(path));
  return relativeToFrontend === '..' || relativeToFrontend.startsWith(`..${sep}`);
}

for (const { file: suite, payload, target } of SUITES) {
  test(`${suite} fails closed and names missing prerequisites with no env`, () => {
    const dir = mkdtempSync(join(tmpdir(), '.browser-gates-fail-closed-'));
    try {
      const { status, output } = spawnSuite(suite, {
        HARMONIC_DIST: dir,
        ...(target ? { TARGET: 'app' } : {}),
        ...(payload ? { PAYLOAD: typeof payload === 'string' ? payload : 'mockups/diagnose-workstation.synthetic/payload.json' } : {}),
      });
      assert.notEqual(status, 0, `${suite} must exit nonzero when prerequisites are absent`);
      assert.match(output, /PLAYWRIGHT_MODULE/, `${suite} must name PLAYWRIGHT_MODULE as missing`);
      assert.match(output, /npm ci && npm run build/, `${suite} must name the missing built shell`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  test(`${suite} fails closed and names the build command with a loadable Playwright module`, () => {
    const tempRoot = realpathSync(tmpdir());
    assert.ok(isOutsideFrontend(tempRoot),
      `${suite} must resolve its temporary root outside the frontend source tree`);
    const dir = mkdtempSync(join(tempRoot, '.browser-gates-fail-closed-'));
    try {
      assert.ok(isOutsideFrontend(dir),
        `${suite} must keep its empty built shell outside the frontend source tree`);
      const module = join(dir, 'playwright');
      mkdirSync(module);
      writeFileSync(join(module, 'index.js'), 'exports.chromium = { executablePath: () => process.execPath, launch: async () => ({}) };');
      const { status, output } = spawnSuite(suite, {
        HARMONIC_DIST: dir, PLAYWRIGHT_MODULE: module,
        ...(target ? { TARGET: 'app' } : {}),
        ...(payload ? { PAYLOAD: typeof payload === 'string' ? payload : 'mockups/diagnose-workstation.synthetic/payload.json' } : {}),
      });
      assert.notEqual(status, 0, `${suite} must exit nonzero when the built shell is absent`);
      assert.match(output, /npm ci && npm run build/, `${suite} must name the build command`);
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
