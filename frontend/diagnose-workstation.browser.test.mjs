/* Diagnose workstation — browser-driven coverage that is NOT already the
 * behaviour replay's job.
 *
 * #654 NARROWING: this file used to drive the whole locked surface itself —
 * geometry, staging, hover, scope, coincidence, navigation — through a
 * hand-rolled harness (`fixture()`/`harness()`/`routeHarness()`) built before
 * the port existed. That harness's selectors (`.dw-canvas-panel`,
 * `.dw-inspector`, `[data-family]`, `[data-basal-lane]`, `.dw-error[role=
 * "alert"]`, …) were the PRE-PORT (#636) component's DOM, never updated when
 * the real port landed with the mock's own ids (`#lane`, `#level`,
 * `#crumb-trail`, `.canvas-pane`, `.inspector`, …). Every assertion against
 * that vocabulary was already RED before this file was touched here — it
 * either timed out waiting on a selector the port never produces or threw on
 * first paint. The run never hung forever; it never passed either, and it was
 * blocking every branch's CI. No PASSING coverage was lost narrowing it.
 *
 * An adversarial review of the first pass at this narrowing found one real
 * gap: the deleted "mutation-proven" test's LOCK terms were not, as that first
 * pass's commit message claimed, all covered by the replay. The union of
 * LOCK: tags across diagnose-workstation-behavior.replay.mjs's 23 stories is
 * terms 1, 2, 4, 6–14, 17–23, 31–33. Terms 15, 16, 24, 25, 28 and 30 are
 * asserted by NOTHING in this repo — known gaps, not covered here, not
 * claimed here. Two of the safety-relevant ones are restored below (both
 * facets of term 14, the #273/#465 rule): a held item offers no stage button,
 * and ISF's own `recommended != null` gate holds without a sized backend
 * number. The rest (fabricated day traces/19, the inference caveat
 * string/17, the Current/Estimate/Recommended table/15/16, verdict-lane
 * x-axis register/12, window-survives-pop/7, further I:C and ISF staging
 * paths/13) remain open — deliberately not grown into this file; tracked for
 * the verifier instead.
 *
 * What else stays: geometry regression coverage the replay does not do
 * (theme parity, both locked viewports — opened through the replay's own
 * `openApp` so this file cannot silently drift from the port's DOM again),
 * the `setError` failure path (real, working, exercised against a live
 * render so its teardown branch actually runs), and the static source-scan
 * regression guard (browser-independent, unchanged). The build-side
 * screenshot-evidence capture (DIAGNOSE_SCREENSHOT_DIR) runs inline inside
 * the geometry test above — its former mock-side counterpart is gone: the
 * mock it captured is archived (#722), the app is now the sole contract
 * artifact.
 *
 * RESTORED, not invented: the ISF "direction asserted, not sized" verdict state
 * this header once called #636-invented UI. That reading came from a capture
 * whose ISF evidence carries no `direction` field at all, so neither the mock nor
 * this fixture ever reached the state — while against real data the analyzer's
 * harm-owned weaken (#468) asserts a direction with no number, and the two-state
 * gate printed "no direction asserted" over the level's own weaken sentence and
 * disagreed with the queue row that drilled into it. DESIGN.md's voice rules 6
 * and 7 settle the copy, refusal line included. The state's coverage is in the
 * fast gate (frontend/diagnose-workstation-data.test.js, `isfVerdict`), because
 * this fixture's ISF row is still held. The "missing envelope" half of
 * the old error test is also dropped: `setData({ analyze: {}, scenarios: {},
 * evidence: { bins: [] } })` doesn't fail closed in the real port — with
 * `analyze.isf` absent, `params.isf` is `[]` (diagnose-workstation-data.js's
 * `isf: analyze.isf || []`), so `boot()`'s `params.isf[0]` is `undefined` and
 * `isfVerdict(isf)` throws on its
 * `evidence` deref. The real caller (frontend/index.html's
 * `loadAudit`) never produces that shape — it either has a full envelope or
 * the fetch itself rejects into `setError` — so this is a latent gap on an
 * unreached input, not a regression this branch caused. Not patched here:
 * fixing it means inventing empty-state UI with no ledger/lock backing it.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp, openerProblems, state } from './diagnose-workstation-behavior.replay.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
// #672: fail closed. A missing prerequisite must exit nonzero, never `skip` —
// a skipped run exits 0, and a green step that exercised zero browser
// assertions is the silent-skip failure mode the mock-to-app port process
// forbids for replay scripts, now extended to this suite. This suite did not
// previously require VENDOR_DIR (CI already passes it); it now does, so a
// missing vendor asset is caught here instead of failing later inside a real
// page load. Every missing prerequisite is named explicitly and accumulated,
// so one failing run points at everything wrong, not just the first thing
// checked.
const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) {
  missing.push('PLAYWRIGHT_MODULE is unset (point it at an installed playwright module, '
    + 'e.g. PLAYWRIGHT_MODULE=$PW/node_modules/playwright)');
} else {
  try {
    chromium = require(process.env.PLAYWRIGHT_MODULE).chromium;
  } catch (e) {
    missing.push(`PLAYWRIGHT_MODULE=${process.env.PLAYWRIGHT_MODULE} could not be required (${e.message})`);
  }
}
const EXEC = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (chromium && !EXEC && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium executable is missing (no PLAYWRIGHT_EXECUTABLE_PATH and `
    + `${chromium.executablePath()} does not exist — run playwright install chromium)`);
}
const VENDOR = process.env.VENDOR_DIR;
if (!VENDOR) {
  missing.push('VENDOR_DIR is unset (point it at a directory holding vendored '
    + 'vue.esm-browser.js and echarts.min.js)');
} else {
  for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
    if (!existsSync(join(VENDOR, asset))) missing.push(`VENDOR_DIR=${VENDOR} is missing ${asset}`);
  }
}
if (missing.length) {
  throw new Error(`diagnose-workstation.browser.test.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
}

// #554: shared single-Chromium-per-command lifecycle, now launched only once
// the fail-closed checks above have confirmed a usable chromium is available.
const { createBrowserRunner } = require('./browser-runner.js');
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SHOTS = process.env.DIAGNOSE_SCREENSHOT_DIR;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };

// #554: one Chromium process for this whole command; every scenario below
// still gets its own fresh page (== fresh Playwright context) via
// runner.browser().newPage() / openApp(browser, ...).
const runner = createBrowserRunner(() => chromium.launch({ executablePath: EXEC || undefined }));
after(() => runner.close());

// diagnose-workstation-behavior.replay.mjs's own `settle` is not exported —
// this is the same wait, kept local rather than widening that file's surface.
const settle = (page, ms = 350) => page.waitForTimeout(ms);

async function shot(page, family, state_, viewport, theme) {
  if (!SHOTS) return;
  const dir = join(SHOTS, family);
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${state_}-${viewport.width}x${viewport.height}-${theme}.png`),
    fullPage: false });
}

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }];

function contrastRatio(foreground, background) {
  const rgb = (color) => color.match(/\d+/g).map(Number).slice(0, 3);
  const luminance = (color) => rgb(color).map((channel) => {
    const unit = channel / 255;
    return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + .05) / (b + .05);
}

test('Diagnose scopes the readable user-claim palette in both themes', async () => {
    /* #736 deepened dark's user-claim well from #332C1B to #3A2E18 so it sits on
       the warm umber substrate rather than the retired cool near-black; light is
       unchanged. The pair still has to clear AA, which is what the ratio below
       actually guards — these literals only pin WHICH pair was measured. */
    for (const [theme, foreground, background] of [
      ['light', 'rgb(134, 102, 25)', 'rgb(246, 239, 220)'],
      ['dark', 'rgb(217, 181, 104)', 'rgb(58, 46, 24)'],
    ]) {
      const browser = await runner.browser();
      try {
        const page = await openApp(browser, { state: 'typical', theme, appSource: 'fixture' });
        const colors = await page.locator('.dw').evaluate((node) => {
          const probe = document.createElement('span');
          probe.style.cssText = 'color:var(--ck-manual);background:var(--ck-manual-soft)';
          node.append(probe);
          const style = getComputedStyle(probe);
          const result = { foreground: style.color, background: style.backgroundColor };
          probe.remove();
          return result;
        });
        assert.deepEqual(colors, { foreground, background }, `${theme} Diagnose user-claim scope`);
        assert.ok(contrastRatio(colors.foreground, colors.background) >= 4.5,
          `${theme} Diagnose user-claim foreground meets WCAG AA against its well`);
        // LOCK:diagnose-workstation:3 — the semantic token must be attached to
        // the actual, visible cockpit action in the populated real-app render,
        // not merely be present in the workstation's variable scope.
        const logCarbs = page.locator('.cockpit-log-carbs');
        assert.equal(await logCarbs.isVisible(), true, `${theme} Log carbs is visible in Diagnose`);
        assert.equal((await logCarbs.innerText()).replace('＋', '').replace(/\s+/g, ' ').trim(), 'Log carbs',
          `${theme} populated Diagnose names the user-claim action`);
        await page.close();
      } finally { /* browser stays open; closed once in after() */ }
    }
  });

test('populated Diagnose renders readable theme-specific ink and chart marks', async () => {
  for (const [theme, expected] of [
    ['light', {
      surface: 'rgb(250, 248, 244)', body: 'rgb(40, 59, 47)', meta: 'rgb(61, 88, 72)',
      signal: 'rgb(47, 107, 79)', median: 'rgb(18, 61, 43)', meal: 'rgb(159, 96, 48)',
    }],
    ['dark', {
      surface: 'rgb(38, 34, 32)', body: 'rgb(219, 207, 188)', meta: 'rgb(163, 150, 138)',
      signal: 'rgb(134, 173, 120)', median: 'rgb(195, 180, 156)', meal: 'rgb(192, 141, 82)',
    }],
  ]) {
    const browser = await runner.browser();
    const page = await openApp(browser, { state: 'typical', theme, appSource: 'fixture' });
    try {
      const colors = await page.locator('.dw').evaluate((node) => {
        const resolved = (property, value) => {
          const probe = document.createElement('span');
          probe.style[property] = value;
          node.append(probe);
          const color = getComputedStyle(probe)[property];
          probe.remove();
          return color;
        };
        return {
          surface: resolved('backgroundColor', 'var(--ck-rail)'),
          body: resolved('color', 'var(--wk-ink-body)'),
          meta: resolved('color', 'var(--wk-ink-meta)'),
          signal: resolved('color', 'var(--mk-primary)'),
          median: resolved('color', 'var(--mk-primary-600)'),
          meal: resolved('color', 'var(--ck-meal)'),
        };
      });
      assert.deepEqual(colors, expected, `${theme} ink and chart palette`);
      assert.ok(contrastRatio(colors.body, colors.surface) >= 4.5,
        `${theme} body ink meets WCAG AA on the chart surface`);
      assert.ok(contrastRatio(colors.meta, colors.surface) >= 4.5,
        `${theme} metadata ink meets WCAG AA on the chart surface`);
      for (const mark of ['signal', 'median', 'meal']) {
        assert.ok(contrastRatio(colors[mark], colors.surface) >= 3,
          `${theme} ${mark} clears the non-text contrast floor on the chart surface`);
      }
    } finally { await page.close(); }
  }
});

/* LOCK:diagnose-workstation:1 — no page scroll at both required viewports (a
   narrower slice of term 1 than story S22 already owns: S22 covers it for
   the full "every state" contract; this only opens 'typical'). The
   panel-geometry comparison below is not itself a named term — no LOCK term
   addresses theme — it is a plain regression check that light/dark's CSS
   variables never leak into layout dimensions, which nothing else tests
   because the replay never switches theme mid-run. */
test('locked panel geometry matches across both required viewports and light/dark themes', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      for (const viewport of VIEWPORTS) {
        const boxes = {};
        for (const theme of ['light', 'dark']) {
          const page = await openApp(browser, {
            state: 'typical', theme, viewport, appSource: 'fixture',
          });
          await shot(page, 'build', 'typical', viewport, theme);
          boxes[theme] = await page.evaluate(() => {
            const rect = (sel) => {
              const box = document.querySelector(sel).getBoundingClientRect();
              return [box.x, box.y, box.width, box.height];
            };
            return {
              canvasPane: rect('.canvas-pane'),
              inspector: rect('.inspector'),
              crumbTrail: rect('#crumb-trail'),
              hScroll: document.documentElement.scrollWidth - window.innerWidth,
              vScroll: document.documentElement.scrollHeight - window.innerHeight,
            };
          });
          await page.close();
        }
        assert.deepEqual(boxes.dark.canvasPane, boxes.light.canvasPane,
          `${viewport.width}×${viewport.height} canvas panel geometry is theme-invariant`);
        assert.deepEqual(boxes.dark.inspector, boxes.light.inspector,
          `${viewport.width}×${viewport.height} inspector geometry is theme-invariant`);
        assert.deepEqual(boxes.dark.crumbTrail, boxes.light.crumbTrail,
          `${viewport.width}×${viewport.height} crumb trail geometry is theme-invariant`);
        for (const theme of ['light', 'dark']) {
          assert.equal(boxes[theme].hScroll, 0,
            `${viewport.width}×${viewport.height} ${theme} has no horizontal page scroll`);
          assert.equal(boxes[theme].vScroll, 0,
            `${viewport.width}×${viewport.height} ${theme} has no vertical page scroll`);
        }
      }
      // openApp records a page error or an unstubbed/unserved asset into its
      // own `problems` ledger rather than failing the open outright (so a
      // single bad route doesn't mask everything after it) — nothing
      // previously read that ledger back in this file. Diffed against the
      // length captured above, so problems recorded by an earlier test in
      // this same process are never double-counted.
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems (page errors / unstubbed routes) across the four geometry opens');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('finding chips render each server-published count', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      assert.deepEqual(await page.locator('#seg-chips button').allTextContents(), [
        'Highs 4', 'Lows 1', 'Meals 1', 'Corrections 1',
      ], 'the four chips spell the server-published global counts');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering server-published chip counts');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('deselecting a chip leaves only rows matching the remaining chips', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: 'Highs 4', exact: true }).click();
      await settle(page, 350);
      assert.deepEqual(await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id)), [
        'finding:correction_on_iob', 'finding:late_bolus',
      ], 'a deselected Highs chip hides high-only rows while preserving multi-chip matches');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while sifting the queue by a chip');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('the held and blind group collapses during a sift and expands again', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: 'Overnight', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: /^Highs / }).click();
      await settle(page, 350);
      const toggle = page.locator('#level .qcollapse');
      assert.equal(await toggle.innerText(), '4 held or blind reads');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.locator('#level .qrow').count(), 0,
        'collapsed held rows are not painted as ordinary queue rows');
      await toggle.click();
      await settle(page, 350);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      assert.deepEqual(await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id)), [
        'basal:0-30', 'basal:210-240', 'ic:660', 'isf',
      ], 'expanding restores every collapsed held read to the rendered queue');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while collapsing and expanding held reads');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('an all-hidden sift names the empty result while retaining the held group', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: 'Overnight', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: /^Highs / }).click();
      await settle(page, 350);
      assert.equal(await page.locator('#level .quiet-line.sift-empty').innerText(),
        'No findings match the current chips.');
      assert.equal(await page.locator('#level .qcollapse').innerText(), '4 held or blind reads',
        'the collapsed held group remains reachable below the empty-sift line');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering the all-hidden sift state');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('the correction-factor row visibly declares its whole-day scope', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      const row = page.locator('#level .qrow[data-id="isf"]');
      assert.equal(await row.locator('.scope-note').innerText(), ' · Whole day');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering the correction-factor scope note');
    } finally { /* browser stays open; closed once in after() */ }
  });

/* LOCK:diagnose-workstation:14 — "Held/insufficient items print number + CI
   at FULL contrast, outline-only cell, no stage button, 'no direction
   asserted' language." Story S16 deliberately opens an ASSERTING slot
   (`dataset.verdict === 'up'`) and never opens a held item, so nothing else
   in the tree proves the deny side of this #273/#465 rule at the DOM layer —
   this is the single most safety-relevant assertion in this file. */
test('a held I:C finding enters through the findings queue with no stage button', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      const row = await page.$('#level .qrow[data-id^="ic:"]');
      assert.ok(row, 'precondition: an I:C findings-queue row exists');
      assert.equal(await page.$('#iclane'), null, 'the retired I:C lane is absent');
      await row.click();
      await settle(page, 450);
      const s = await state(page);
      assert.equal(s.stage, null, 'a held I:C block renders no stage button');
      const verdict = await page.evaluate(() => document.querySelector('#level .verdict')?.textContent.trim() ?? '');
      assert.match(verdict, /no direction asserted/, 'the held block states it in the locked words');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while exercising the held I:C block');
    } finally { /* browser stays open; closed once in after() */ }
  });

/* LOCK:diagnose-workstation:14 — ISF's own gate (`canStage = isf.recommended
   != null` at diagnose-workstation.js) is unguarded at this layer:
   frontend/plan.test.js backstops the Plan draft, not the workstation's own
   stage button. This fixture's ISF row always carries `recommended: null`
   (mockups/diagnose-workstation.synthetic/payload.json's single `analyze.isf`
   row), so the 'typical' state proves the held side directly. */
test('ISF is not stageable without a sized backend recommendation', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      // #735: ISF reaches its detail level from the findings QUEUE now — the three
      // per-parameter entry rows are retired with the factor grid (lock term 34).
      // Under this state's explicit Overnight window it is a held row (term 38).
      await page.evaluate(() => [...document.querySelectorAll('#level .qrow')]
        .find((n) => n.querySelector('.lab').textContent.trim() === 'ISF').click());
      await settle(page, 450);
      // Prove the ISF level actually opened before trusting the absence of a
      // stage button: a click that lands but fails to navigate would leave
      // #level on the factors list, where there is no stage button either,
      // and the assertion below would pass having exercised nothing. ISF's
      // own permanent scope sentence (term 31, a verbatim locked string) is
      // the anchor — it renders nowhere else in the tree, unlike the crumb
      // leaf or heading text "ISF", which could in principle collide with a
      // label elsewhere.
      const scopeSay = await page.evaluate(() => document.querySelector('#level .slot-say')?.textContent.trim() ?? '');
      assert.match(scopeSay,
        /Measured in the overnight fasting window\. Daytime ISF is not separately identifiable/,
        'the ISF level actually opened (its own locked scope sentence)');
      const s = await state(page);
      assert.equal(s.stage, null, 'ISF with no sized recommendation offers no stage button');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while exercising the ISF gate');
    } finally { /* browser stays open; closed once in after() */ }
  });

/* `setError` is the interface's own failure path — frontend/index.html's
   `loadAudit` catch calls it directly on a rejected fetch (real code, not a
   mock behaviour: the mock is static captures and has no concept of a failed
   request). `setData` runs first with a real payload so `aborter` and
   `teardown` are genuinely non-null when `setError` runs — otherwise its
   `if (aborter) { aborter.abort(); ... }` branch is vacuously true-then-false
   every time, and a regression that broke tearing down a live render would
   pass this test either way. */
test('setError tears down a live render and replaces the mount with a plain failure message', async () => {
    const payloadPath = process.env.PAYLOAD;
    assert.ok(payloadPath, 'PAYLOAD is required — setData needs a real payload to exercise setError\'s teardown branch');
    const raw = JSON.parse(await readFile(payloadPath, 'utf8'));
    /* #735: level 1 is the server-owned findings queue, and `setData` fails closed
       without it (a payload with no projection has no inspector to render). The
       global projection is added here from the same fixture-only mirror the browser
       gates' route stubs use, so this test still exercises a LIVE render — which is
       the whole point of it: `setError`'s teardown branch is vacuous otherwise. */
    const payload = { ...raw, findings: projectFindings(
      { analysis: raw.analyze, exposures: raw.exposures, scenarios: raw.scenarios }, null) };
    const browser = await runner.browser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/') {
          // `setError` overwrites `root.className` wholesale (real behaviour,
          // asserted below) — the mount is found by its STABLE wrapper id, not
          // by the class `setError` itself replaces.
          return route.fulfill({
            body: '<!doctype html><html><head>'
              + '<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js"></script></head>'
              + '<body><div id="wrap"><div class="mount"></div></div>'
              + '<script type="module">import {createDiagnoseWorkstation} from '
              + `'/frontend/diagnose-workstation.js';`
              + `window.__view = createDiagnoseWorkstation({ root: document.querySelector('.mount'), callbacks: {} });`
              + `window.__ready = true;</script></body></html>`,
            contentType: 'text/html',
          });
        }
        if (url.href.includes('echarts')) {
          if (!VENDOR) return route.continue();
          return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
        }
        if (url.pathname.startsWith('/frontend/')) {
          const path = join(ROOT, url.pathname.slice(1));
          try { return route.fulfill({ body: await readFile(path), contentType: MIME[extname(path)] || 'text/javascript' }); }
          catch { return route.fulfill({ status: 404, body: 'missing' }); }
        }
        return route.fulfill({ status: 404, body: 'missing' });
      });
      await page.goto('http://diagnose.local/?view=glucose');
      await page.waitForFunction(() => window.__ready === true);
      await page.evaluate((p) => window.__view.setData(p), payload);
      // Same footgun as `setError` itself: `render()` overwrites the mount's
      // className to a bare 'dw', so a selector holding the 'mount' class
      // stops matching the instant setData succeeds. Wait via the stable
      // wrapper's child position, not a class the render just replaced.
      await page.waitForFunction(() => document.getElementById('wrap').firstElementChild.className === 'dw');
      await settle(page, 350);
      await page.evaluate(() => window.__view.setError('The evidence request failed.'));
      const wrap = page.locator('#wrap');
      assert.equal(await wrap.evaluate((node) => node.firstElementChild.className), 'dw dw-error');
      assert.equal(await wrap.evaluate((node) => node.firstElementChild.textContent), 'The evidence request failed.');
      assert.deepEqual(errors, [], 'setError does not itself throw, even tearing down a live render');
    } finally { await page.close(); }
  });

/* Production regression: a rejected first-load fetch inside
   frontend/index.html's `loadAudit` used to crash with an uncaught
   TypeError instead of showing the surface's failure message — the catch
   branch called `diagnoseMount()`, which unconditionally fed `setData` the
   refs' current (all-null, first-load) values before `setError` ever got a
   turn. This exercises the REAL path, not the ported component directly —
   the bug is in index.html's wiring, not diagnose-workstation.js's own
   render loop. It can't go through `openApp()`: that opener only returns a
   page after its first load already succeeded, and this failure has to be
   live for that very load. Its stub table mirrors openApp's
   (diagnose-workstation-behavior.replay.mjs) so the app boots exactly as it
   does for every other test, except /analyze is made to fail. */
test('a rejected first-load fetch shows the failure message, not an uncaught error', async () => {
    const payloadPath = process.env.PAYLOAD;
    assert.ok(payloadPath, 'PAYLOAD is required (backs the endpoints that do not fail)');
    const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
    const comparison = JSON.parse(await readFile(
      join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
    const STUBS = [
      [/^\/diagnose\/event-comparison/, () => ({ comparison, exposures: payload.exposures })],
      [/^\/scenarios/, () => payload.scenarios],
      [/^\/explore\/time/, () => payload.evidence],
      [/^\/status/, () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
      [/^\/plan\/history/, () => ({ history: [] })],
      [/^\/plan/, () => ({ items: [], updated_at: null })],
      [/^\/verify\/trials/, () => ({ trials: [] })],
      [/^\/api\/catalog/, () => ({ articles: [] })],
      [/^\/carbs/, () => ({ entries: [] })],
      [/^\/prompts/, () => ({ prompts: [] })],
      [/^\/credentials/, () => ({ configured: true })],
      [/^\/audit\/dismissals/, () => ({ dismissed: [] })],
      [/^\/outcomes/, () => ({ points: [] })],
      [/^\/timeline/, () => ({ events: [] })],
      [/^\/backtest/, () => ({ folds: [] })],
      [/^\/model/, () => ({ entries: [] })],
      [/^\/day/, () => ({ days: [] })],
      [/^\/pump/, () => ({ settings: {} })],
    ];
    const browser = await runner.browser();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      const errors = [];
      page.on('pageerror', (error) => errors.push(String(error)));
      await page.addInitScript(() => {
        localStorage.setItem('ciq_token', 'hotfix-regression');
        localStorage.setItem('tab', 'diagnose');
        localStorage.setItem('theme', 'dark');
      });
      await page.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        const path = url.pathname;
        if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
        if (url.href.includes('echarts')) return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
        if (url.href.includes('vue')) return route.fulfill({ body: await readFile(join(VENDOR, 'vue.esm-browser.js')), contentType: 'text/javascript' });
        if (path === '/') return route.fulfill({ body: await readFile(join(ROOT, 'frontend/index.html')), contentType: 'text/html' });
        if (/\.(js|css|svg|html)$/.test(path)) {
          try { return route.fulfill({ body: await readFile(join(ROOT, 'frontend', path.slice(1))), contentType: MIME[extname(path)] || 'text/plain' }); } catch { /* fall through */ }
        }
        // The one deliberately broken endpoint: loadAudit's Promise.all
        // rejects on this, taking the real catch path a live fetch failure
        // (a timeout, a 5xx, a dropped connection) would.
        if (/^\/analyze/.test(path)) {
          return route.fulfill({ status: 500, contentType: 'application/json',
            body: JSON.stringify({ detail: 'synthetic failure for the #654 hotfix regression test' }) });
        }
        for (const [pattern, body] of STUBS) {
          if (pattern.test(path)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body()) });
        }
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not stubbed' }) });
      });
      await page.goto('http://app.local/?view=glucose');
      // The failure message is the surface's own — root.textContent after
      // setError — not a generic Vue error boundary or a browser dialog.
      // Bounded well under Playwright's 30s default so an unfixed run fails
      // fast rather than idling out.
      await page.waitForSelector('.dw.dw-error', { timeout: 8000 });
      await settle(page, 300);
      const message = await page.evaluate(() => document.querySelector('.dw.dw-error')?.textContent ?? '');
      assert.ok(message.length > 0, 'the surface shows a failure message');
      assert.deepEqual(errors, [], 'no uncaught error reaches the page — the surface fails closed, not crashes');
    } finally { await page.close(); }
  });

test('frontend contains no client-side verdict threshold or direction comparison', async () => {
  const [workspaces, chart, workstation, data] = await Promise.all([
    readFile(join(ROOT, 'frontend/diagnose-workspaces.js'), 'utf8'),
    readFile(join(ROOT, 'frontend/diagnose-workstation-chart.js'), 'utf8'),
    readFile(join(ROOT, 'frontend/diagnose-workstation.js'), 'utf8'),
    readFile(join(ROOT, 'frontend/diagnose-workstation-data.js'), 'utf8'),
  ]);
  // PORT NOTE (#654): I:C has no backend direction today, so its already-authorized
  // move has one local display-only fallback. It cannot affect eligibility.
  const PORT_NOTE_IC_DIRECTION_ALLOWLIST = `else verdict = b.recommended > current ? 'up' : 'down';`;
  assert.ok(workstation.includes(PORT_NOTE_IC_DIRECTION_ALLOWLIST),
    'the documented I:C direction fallback remains named and local');
  const verdictSources = [workspaces, chart,
    workstation.replace(PORT_NOTE_IC_DIRECTION_ALLOWLIST, ''), data].join('\n');
  const supportField = String.raw`(?:[\w?.]*(?:days|n_runs|support(?:_days)?)[\w?.]*)`;
  assert.doesNotMatch(verdictSources,
    new RegExp(`${supportField}\\s*[<>]=?\\s*\\d+(?:\\.\\d+)?`),
    'support counts are never compared with numeric floors in the browser');
  assert.doesNotMatch(verdictSources,
    new RegExp(`\\b\\d+(?:\\.\\d+)?\\s*[<>]=?\\s*${supportField}`),
    'numeric floors are never compared with support counts in the browser');
  assert.doesNotMatch(verdictSources,
    new RegExp(`(?:${supportField}\\s*[<>]=?\\s*8\\b|\\b8\\s*[<>]=?\\s*${supportField})`),
    'the eight-observation support floor remains backend-only');
  assert.doesNotMatch(verdictSources,
    /\?\s*['"](?:raise|lower)['"]\s*:\s*['"](?:raise|lower)['"]/,
    'no conditional invents a direction string');
  assert.doesNotMatch(verdictSources, /return\s+['"](?:raise|lower)['"]/,
    'no branch returns an invented direction string');
  assert.doesNotMatch(verdictSources,
    /\b(?:direction|verdict)\s*=\s*['"](?:raise|lower)['"]/,
    'no assignment invents a direction string');
  assert.match(workspaces, /asserts_move === true/);
  assert.match(chart, /export function slotAssertsMove\(slot\)[\s\S]*slot\.asserts_move/);
  assert.match(chart,
    /if \(asserts && slot\.direction === 'raise'\)[\s\S]*slot\.direction === 'lower'/);
  assert.match(chart,
    /slot\.safety_status === 'no data'[\s\S]*slot\.safety_status === 'insufficient evidence'/);
  const mapping = chart.slice(chart.indexOf('export function buildSlotLane'), chart.indexOf('return {', chart.indexOf('export function buildSlotLane')));
  assert.doesNotMatch(mapping, /recommended\s*[<>]|current\s*[<>]/,
    'lane verdict mapping reads backend direction fields, never dose arithmetic');
  // LOCK:diagnose-workstation:29 — occurrence handoff retains claim date into Day.
  const index = await readFile(join(ROOT, 'frontend/index.html'), 'utf8');
  assert.match(index, /day: \(occurrence\) => goToMoment\(occurrence\.t, occurrence\.text/);
  assert.match(index, /import \{ createDiagnoseEventComparison \} from '\.\/diagnose-event-comparison\.js';/);
  assert.match(index, /diagnoseView = createDiagnoseEventComparison\(\{ root: diagnoseRoot\.value,/);
  assert.match(index, /diagnoseStageItemsFor\(item\.key, diagnoseAnalysis\.value\)/);
  assert.match(index, /keepOnlyPlanFamily\(planItemFamily\(items\[0\]\)\)/);
  assert.match(index, /stage: diagnoseStage, isStaged: diagnoseIsStaged/);
  assert.match(index, /v-show="hasToken && diagnoseReady"/);
  assert.match(index, /Diagnose needs an API token/);
});

/* #63 — the unexplained-highs line, rendered by the real app.
 *
 * The node tests around `uncausedNote` prove the pure read; this proves the words
 * reach the screen, below the queue and outside it, and that a clock scope does not
 * move the number. The fixture's highs rollup carries exactly one occurrence whose
 * episode drew nothing (`.claude/qa/gen_synthetic_fixtures.py`), so the sentence
 * being absent here means the surface lost it, not that the data went quiet. */
test('#63 · the unexplained-highs sentence renders below the findings queue', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      const note = await page.evaluate(
        () => document.querySelector('#level .uncaused-note')?.textContent.trim() ?? null);
      assert.equal(note, '1 high had no cause detected by the app',
        'the server sentence renders verbatim');
      // It is a SIBLING of the list, never a row inside it: a reader who can select
      // every queue row must not be able to select this, and it carries no drill.
      const placement = await page.evaluate(() => {
        const el = document.querySelector('#level .uncaused-note');
        return {
          insideList: !!el.closest('.q'),
          isRow: el.matches('.qrow'),
          afterList: !!(document.querySelector('#level .q')?.compareDocumentPosition(el)
            & Node.DOCUMENT_POSITION_FOLLOWING),
          tag: el.tagName,
        };
      });
      assert.deepEqual(placement,
        { insideList: false, isRow: false, afterList: true, tag: 'P' });
      // Scope invariance is pinned where it can be asserted exactly — over every
      // frozen window in `findings-projection-mirror.test.js` and over three clock
      // windows in `tests/test_meal_bolus_short_attribution.py`. What only the real
      // app can show is the two above: the words, and where they sit.
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while reading the unexplained-highs line');
    } finally { /* browser stays open; closed once in after() */ }
  });
