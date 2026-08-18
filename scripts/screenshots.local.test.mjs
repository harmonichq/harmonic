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
test('wrapper serves a stripPrefix fixture, fixture-backed stubs, and the dark class', () => {
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
      // against a DOM shim and require the app's actual theming marker — the
      // .dark class — so a wrapper that falls back to the harness's default
      // (data-theme only) fails here instead of shipping light "dark" shots.
      async evaluate(fn, arg) {
        if (arg !== 'dark') return;
        const classes = new Set();
        globalThis.document = { documentElement: {
          dataset: {},
          classList: {
            add: (c) => classes.add(c),
            toggle: (c, on) => { on ? classes.add(c) : classes.delete(c); },
          },
        } };
        globalThis.Event = class {};
        globalThis.window = { dispatchEvent() {} };
        fn(arg);
        if (!classes.has('dark') || globalThis.document.documentElement.dataset.theme !== 'dark') {
          throw new Error('dark theme step did not set the .dark class and data-theme');
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
        fetchStubFiles: { '/analyze': { file: join(fixture, 'payload.json'), key: 'analyze' } },
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
