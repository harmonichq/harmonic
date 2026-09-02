import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Exercise the CLI with the first Playwright candidate it discovers from a temporary
// checkout. The mock makes the route fail unless stripPrefix finds fixture/payload.json,
// so this covers the public wrapper path without requiring Chromium in the Node test job.
//
// #304 retired the app's Light theme and the `.dark` class it toggled, so the wrapper
// no longer overrides the harness's theme hook (below, `screenshots.local.mjs`'s own
// `options` carries no `applyTheme`). The shot config still names `theme: 'dark'` —
// screenshots.mjs's own generic field, unrelated to this repo's wrapper — so the mock's
// `evaluate` step still fires; it asserts the DOM shim's `classList` is never touched,
// which fails closed if a wrapper ever resurrects a `.dark`-class override.
test('wrapper serves a stripPrefix fixture and fixture-backed stubs, and applies no theme', () => {
  const work = mkdtempSync(join(tmpdir(), 'screenshots-local-test-'));
  try {
    const runtime = join(work, '.agents', 'skills', 'drive-local-webapp', 'node_modules', 'playwright');
    mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, 'index.mjs'), `
import { writeFileSync } from 'node:fs';

export const chromium = {
  async launch() {
    let handler;
    const page = {
      on() {},
      async route(_pattern, callback) { handler = callback; },
      async goto(url) {
        let fulfilled;
        await handler({
          request: () => ({ url: () => url }),
          fulfill: (response) => { fulfilled = response; },
          abort: () => { throw new Error('route was not served from disk'); },
        });
        if (!fulfilled || JSON.parse(String(fulfilled.body)).analyze.source !== 'fixture') {
          throw new Error('stripPrefix did not serve the fixture payload');
        }
      },
      async setViewportSize() {},
      async waitForTimeout() {},
      // The theme step is the one page.evaluate that carries an argument. Run it
      // against a DOM shim that records every classList touch — this repo's app
      // has no theme class to set any more, so a wrapper that still toggles one
      // (a resurrected .dark override) fails this check.
      async evaluate(fn, arg) {
        if (arg !== 'dark') return;
        const classTouches = [];
        globalThis.document = { documentElement: {
          dataset: {},
          classList: {
            add: (c) => classTouches.push(['add', c]),
            toggle: (c, on) => classTouches.push(['toggle', c, on]),
          },
        } };
        globalThis.Event = class {};
        globalThis.window = { dispatchEvent() {} };
        fn(arg);
        if (classTouches.length) {
          throw new Error('theme step touched classList ' + JSON.stringify(classTouches)
            + ' — the app ships one theme and has no class left to toggle');
        }
      },
      async screenshot({ path }) { writeFileSync(path, 'mock png'); },
    };
    return {
      async newContext() {
        return {
          async addInitScript(script) {
            if (!script.includes('"fixture"') || !script.includes('"boot":"ready"')) {
              throw new Error('fixture-backed stub or storage was not initialized');
            }
          },
          async newPage() { return page; },
        };
      },
      async close() {},
    };
  },
};
`);

    const fixture = join(work, 'fixture');
    mkdirSync(fixture);
    writeFileSync(join(fixture, 'payload.json'), JSON.stringify({ analyze: { source: 'fixture' } }));

    const config = join(work, 'screenshots.json');
    const out = join(work, 'capture.png');
    writeFileSync(config, JSON.stringify({
      serveRoot: [{ dir: fixture, stripPrefix: '/mockups/' }],
      shots: [{
        url: 'http://screenshots.local/mockups/payload.json',
        theme: 'dark',
        out,
        storage: { boot: 'ready' },
        fetchStubFiles: { '/api/analyze': { file: join(fixture, 'payload.json'), key: 'analyze' } },
      }],
    }));

    const stdout = execFileSync(process.execPath, [join(ROOT, 'scripts', 'screenshots.local.mjs'), config], {
      cwd: work,
      encoding: 'utf8',
    });
    assert.match(stdout, /wrote .*capture\.png/);
    assert.equal(readFileSync(out, 'utf8'), 'mock png');
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

// Fail-closed regression guard: if a future edit resurrects a theme-application hook
// in the wrapper (e.g. re-adds `applyTheme` to `options`, or reads `.dark`/`dataset.theme`
// again), this catches it even before the behavioral test above would notice.
test('the wrapper defines no theme-application hook', () => {
  const source = readFileSync(join(ROOT, 'scripts', 'screenshots.local.mjs'), 'utf8');
  assert.doesNotMatch(source, /applyTheme/,
    'the wrapper no longer overrides the harness theme hook — the app ships one theme');
  assert.doesNotMatch(source, /classList/,
    'the wrapper touches no class — the retired .dark toggle does not belong here');
});
