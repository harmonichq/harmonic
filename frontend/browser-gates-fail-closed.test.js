// #672: regression guard for the fail-closed preflight in the shell-serving
// `*.browser.test.mjs` suite. That suite is excluded from the
// `frontend/**/*.test.js` glob (that's the
// point — it needs real browser infrastructure this dependency-free gate does
// not have), so nothing else in those globs would notice if its preflight
// regressed back to a silent `{ skip: ... }`. This file stays dependency-free
// (node:test, node:child_process, node:fs only) and must pass with NO
// Playwright installed — that is exactly CI's `frontend` job.
//
// Each shell-serving leg is spawned twice against an empty built directory:
// once without Playwright (expect it to name both prerequisites), then with a
// minimal loadable Playwright module (expect the build command on its own).
// Both spawns die at the preflight `throw`, before any browser launches, so
// each is fast.
//
// #416 retired v1, and with it eight of the nine legs this list once held. The
// desk suite is the only surviving leg that serves a built shell; the follow-up
// suite and the browser-runner regression serve none and were never listed. The
// list is asserted non-empty below, because an empty list is a green step that
// ran zero assertions — the exact failure this file exists to catch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const REAL_FRONTEND = realpathSync(FRONTEND);

const SUITES = ['frontend/desk.browser.test.mjs'];

function spawnSuite(suite, envOverrides) {
  const env = { ...process.env };
  delete env.PLAYWRIGHT_MODULE;
  delete env.HARMONIC_DIST;
  // node:test detects that it is already running under `node --test` (via an
  // inherited internal env var) and treats a nested `--test` invocation as a
  // no-op recursive call. Spawning `node <file>` directly (no `--test` flag)
  // sidesteps that: the suite still runs as a module and its top-level
  // preflight `throw` still aborts the process before any `test()` runs.
  delete env.NODE_TEST_CONTEXT;
  Object.assign(env, envOverrides);
  const result = spawnSync(process.execPath, [suite],
    { cwd: ROOT, env, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}\n${result.stderr}` };
}

function isOutsideFrontend(path) {
  const relativeToFrontend = relative(REAL_FRONTEND, realpathSync(path));
  return relativeToFrontend === '..' || relativeToFrontend.startsWith(`..${sep}`);
}

for (const suite of SUITES) {
  test(`${suite} fails closed and names missing prerequisites with no env`, () => {
    const dir = mkdtempSync(join(tmpdir(), '.browser-gates-fail-closed-'));
    try {
      const { status, output } = spawnSuite(suite, { HARMONIC_DIST: dir });
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
      });
      assert.notEqual(status, 0, `${suite} must exit nonzero when the built shell is absent`);
      assert.match(output, /npm ci && npm run build/, `${suite} must name the build command`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('at least one shell-serving leg is under guard', () => {
  assert.ok(SUITES.length >= 1,
    'an empty suite list is a green step that ran zero assertions');
});
