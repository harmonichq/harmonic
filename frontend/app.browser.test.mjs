// The app's one browser smoke test (#475): the built app, served from the
// warmed synthetic no-fetch store, opens each of its five tabs at one desktop
// size and draws each screen's primary content, with no screen left loading or
// Unavailable. What each tab draws is the live adapter's contract tests' job
// (frontend/ui/app/live.contract.test.mjs); this proves the shell, the router
// and the screens put it on the page. Two more hold the shell's own checks,
// which no story can make (#682): on a phone the document never scrolls, and
// on a screen shorter than the rail nothing is cut off.
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

  await t.test('the Advisory notice opens the app once', async () => {
    await page.goto(BASE);
    const understood = page.getByRole('button', { name: 'Understood' });
    await understood.waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal(await page.locator('.ui-qrow').count(), 0, 'a tab drew behind the notice');
    await understood.click();
    await page.locator('.ui-qrow').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.reload();
    await page.locator('.ui-qrow').first().waitFor({ state: 'visible', timeout: 30_000 });
    assert.equal(await understood.count(), 0, 'the notice came back after Understood');
  });

  for (const { tab, path, primary } of TABS) {
    await t.test(tab, async () => {
      await page.goto(`${BASE}${path}`);
      // Before the app's first draw there is no skeleton either, so the primary
      // content is waited for first (#557); a loading screen's skeletons go after.
      await page.locator(primary).first().waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => assert.fail(`${tab} draws no ${primary}`));
      await page.waitForFunction(() => !document.querySelector('.ui-skeleton'), null, { timeout: 30_000 });
      assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 0, `${tab} is Unavailable`);
    });
  }
  assert.deepEqual(errors, [], 'the page threw');
});

// §2.3 ban 6 in the app's own shell, which no story loads (#682): on a phone
// the document itself never scrolls, so the tab bar stays at the bottom of the
// screen. A sheet rises from below it and takes focus as it opens, and a
// document a rising sheet overflows scrolls to reach that focus.
const SHEETS = [
  { sheet: 'Log carbs', path: '/day', ready: '.ui-daychart', before: [], open: '+ Log carbs' },
  { sheet: 'Tandem Source', path: '/settings', ready: '.ui-row', before: ['Tandem Source'], open: 'Update' },
];

test('on a phone the document never scrolls as a sheet rises', async (t) => {
  assert.ok(BASE, 'HARMONIC_URL is unset: run this under scripts/smoke_app.py --then');
  const browser = await chromium().launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { Connection: 'close' } });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Understood' }).click({ timeout: 30_000 });
  for (const { sheet, path, ready, before, open } of SHEETS) {
    await t.test(sheet, async () => {
      await page.goto(`${BASE}${path}`);
      await page.locator(ready).first().waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(() => !document.querySelector('.ui-skeleton'), null, { timeout: 30_000 });
      for (const row of before) await page.getByText(row, { exact: true }).first().click();
      const button = page.getByRole('button', { name: open, exact: true });
      await button.waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 10_000 });
      // Every frame from the tap until the sheet rests: how far the document
      // scrolled, and how far it could have.
      await page.evaluate(() => {
        const seen = { scrolled: 0, overflow: 0 };
        window.__documentScroll = seen;
        const frame = () => {
          const root = document.scrollingElement;
          seen.scrolled = Math.max(seen.scrolled, root.scrollTop, root.scrollLeft);
          seen.overflow = Math.max(seen.overflow, root.scrollHeight - root.clientHeight, root.scrollWidth - root.clientWidth);
          if (window.__documentScroll === seen) requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      await button.click();
      await page.getByRole('dialog', { name: sheet }).waitFor({ state: 'visible', timeout: 10_000 });
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'), null, { timeout: 10_000 });
      const seen = await page.evaluate(() => {
        const last = window.__documentScroll;
        window.__documentScroll = null;
        return last;
      });
      assert.deepEqual(seen, { scrolled: 0, overflow: 0 }, `the document scrolled under the rising ${sheet} sheet`);
    });
  }
});

// The rail layout on a screen shorter than the rail (a phone turned on its
// side): the clip above is the tab bar's alone, so the rail's last item and
// the end of a pane can still be brought on screen (ADR 682). How that layout
// should fit a short screen is the operator's open question; this holds only
// that nothing is cut off.
test('on a short wide screen the rail and a pane can be brought on screen', async (t) => {
  assert.ok(BASE, 'HARMONIC_URL is unset: run this under scripts/smoke_app.py --then');
  const browser = await chromium().launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 844, height: 340 },
    extraHTTPHeaders: { Connection: 'close' } });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Understood' }).click({ timeout: 30_000 });
  await page.locator('.ui-qrow').first().click({ timeout: 30_000 });
  const reach = async (locator, what) => {
    await locator.scrollIntoViewIfNeeded({ timeout: 10_000 });
    const box = await locator.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 340.5, `${what} cannot be brought on screen (${JSON.stringify(box)})`);
  };
  await reach(page.getByRole('button', { name: 'Snooze', exact: true }).first(), "the Queue detail's Snooze");
  await reach(page.locator('.ui-nav--rail .ui-nav__item').last(), "the rail's last item");
});
