// The app's one browser smoke test (#475): the built app, served from the
// warmed synthetic no-fetch store, opens each of its five tabs at one desktop
// size and draws each screen's primary content, with no screen left loading or
// Unavailable. What each tab draws is the live adapter's contract tests' job
// (frontend/ui/app/live.contract.test.mjs); this proves the shell, the router
// and the screens put it on the page.
//
//   uv run python scripts/smoke_app.py --then node --test frontend/app.browser.test.mjs
//
// Playwright comes from PLAYWRIGHT_MODULE, or, unset, from the repo's
// provisioner (scripts/ensure_browser_gate_env.py). It fails closed: without a
// serve or a driver it fails, naming what is missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.HARMONIC_URL;

function chromium() {
  let module = process.env.PLAYWRIGHT_MODULE;
  if (!module) {
    const exports = execFileSync('python3', [join(ROOT, 'scripts/ensure_browser_gate_env.py')], { encoding: 'utf8' });
    module = /PLAYWRIGHT_MODULE=['"]?([^'"\n]+)/.exec(exports)?.[1];
    assert.ok(module, 'PLAYWRIGHT_MODULE is unset and ensure_browser_gate_env.py did not export it');
  }
  return createRequire(import.meta.url)(module).chromium;
}

/** Each tab's address and the component its ready screen draws from the showcase store. */
const TABS = [
  { tab: 'Queue', path: '/', primary: '.ui-qrow' },
  { tab: 'Changes', path: '/changes', primary: '.ui-change' },
  { tab: 'Overview', path: '/overview', primary: '.ui-tir' },
  { tab: 'Day', path: '/day', primary: '.ui-daychart' },
  { tab: 'Settings', path: '/settings', primary: '.ui-row' },
];

test('each of the five tabs draws its screen', async (t) => {
  assert.ok(BASE, 'HARMONIC_URL is unset: run this under scripts/smoke_app.py --then');
  const browser = await chromium().launch();
  t.after(() => browser.close());
  // No request reuses a socket the server is closing (#507).
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { Connection: 'close' } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));

  for (const { tab, path, primary } of TABS) {
    await t.test(tab, async () => {
      await page.goto(`${BASE}${path}`);
      // A loading screen draws skeletons of its own rows, so the skeletons go first.
      await page.waitForFunction(() => !document.querySelector('.ui-skeleton'), null, { timeout: 30_000 });
      assert.ok(await page.locator(primary).first().isVisible(), `${tab} draws no ${primary}`);
      assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 0, `${tab} is Unavailable`);
    });
  }
  assert.deepEqual(errors, [], 'the page threw');
});
