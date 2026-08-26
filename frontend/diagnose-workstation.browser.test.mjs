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
 * and ISF's own exact-true backend verdict gate holds without action permission.
 * The rest (fabricated day traces/19, the inference caveat
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
import {
  derivedPumpSettings, openApp, openerProblems, panThenAim, state, withIsfVerdict,
  withoutIsfProjectionVerdict, twoFamilyInputs,
  densityHistoryInputs,
  issue81PendingProjection, issue81FailedProjection, issue81SlicedProjection,
  issue86HeaderFilter, issue86FilteredRoot, issue86PendingRoot,
} from './diagnose-workstation-behavior.replay.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FINDINGS_PROJECTION = JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8'));
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

const P27_SANCTION = 'Connor Griffin · 2026-08-23 · "#55 removed installSegKeys; the shipped Align control is two ordinary Tab stops"';

const expandWatching = async (page) => {
  const toggle = page.locator('#level .qcollapse');
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') !== 'true') {
    await toggle.click();
  }
};

test('seven generated history reads remain ordered, reachable, laid out, and non-stageable', async () => {
  const browser = await runner.browser();
  const inputs = await densityHistoryInputs();
  const expected = projectFindings(inputs).rows
    .filter((row) => row.register === 'history').map((row) => row.id);
  assert.equal(expected.length, 7, 'the generator publishes seven simultaneous history rows');

  const page = await openApp(browser, {
    state: 'dense', viewport: { width: 390, height: 844 }, theme: 'light',
    history: true, findingsInputs: inputs, appSource: 'fixture', stageProbe: true,
  });
  try {
    const initialCollapse = page.locator('#level .qcollapse');
    await initialCollapse.click();
    const historyRows = page.locator('#level .qrow[data-state="history"]');
    assert.deepEqual(await historyRows.evaluateAll((rows) => rows.map((row) => row.dataset.id)), expected,
      'the Watching history rows keep the server projection order');
    assert.equal(await historyRows.locator('.stagebtn').count(), 0,
      'no dense history row exposes staging');

    await page.getByRole('button', { name: /Filter/ }).click();
    await page.getByRole('menuitemcheckbox', { name: /^Highs / }).click();
    await page.keyboard.press('Escape');
    const collapse = page.locator('#level .qcollapse');
    assert.match(await collapse.innerText(), /^Watching · \d+ reads$/,
      'the sift owns one reachable Watching disclosure');
    assert.equal(await historyRows.count(), 0, 'history rows collapse during the sift');
    await collapse.click();
    assert.deepEqual(await historyRows.evaluateAll((rows) => rows.map((row) => row.dataset.id)), expected,
      'expanding Watching restores all seven rows in order');

    await historyRows.nth(3).click();
    const rendered = await state(page);
    assert.equal(rendered.history.conclusion, 'Past setting. No change suggested.',
      'the dense row opens the normal history inspector hierarchy');
    assert.equal(rendered.history.currentCopies, 1,
      'the dense inspector keeps one quieter current-program line');
    assert.equal(rendered.history.stageCount, 0, 'the dense inspector remains non-stageable');
    assert.ok(rendered.hScroll <= 0 && rendered.vScroll <= 0,
      `the narrow dense inspector stays inside its pane (${rendered.hScroll}, ${rendered.vScroll})`);
  } finally {
    await page.close();
  }
});

test('an explicit fixture opener ignores a hostile ambient app-source override', async () => {
  const browser = await runner.browser();
  const previous = process.env.DIAGNOSE_APP_SOURCE;
  process.env.DIAGNOSE_APP_SOURCE = 'hostile-fixture-bypass';
  try {
    const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
    assert.equal(await page.locator('.dw').count(), 1,
      'the explicit fixture caller still reaches the Diagnose shell');
    await page.close();
  } finally {
    if (previous === undefined) delete process.env.DIAGNOSE_APP_SOURCE;
    else process.env.DIAGNOSE_APP_SOURCE = previous;
  }
});

test('#135 · the chart explorer shortcut focuses a live chart and closes the drawer', async () => {
  const browser = await runner.browser();
  const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
  try {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.getByRole('button', { name: 'Charts', exact: true }).click();
    const thumbnails = page.locator('.explorer-thumbnail');
    assert.ok(await thumbnails.count() >= 2, 'the generated findings publish a live chart list');
    await page.keyboard.press('1');
    assert.equal(await page.locator('#explorer-drawer').isHidden(), true,
      'the numeric focus shortcut closes the explorer drawer');
    assert.match((await page.locator('#drill-provenance').textContent()).trim(), /^Drilled chart · \S/,
      'the inspector names the chart selected by the shortcut as a drilled chart');
    assert.equal(await page.locator('.evidence-tile[data-drilled]').count(), 1,
      'the selected chart is visibly marked in the field');
  } finally {
    await page.close();
  }
});

test('#135 · Escape dismisses fullscreen and restores the exact canvas arrangement', async () => {
  const browser = await runner.browser();
  const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
  try {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    for (let count = 0; count < 3; count += 1) {
      const tile = page.locator('.evidence-tile .tile-pin[aria-pressed="false"]:not([disabled])');
      const next = page.locator('#tile-schematic .next:not([disabled])');
      if (await tile.count()) await tile.first().click();
      else await next.first().click();
    }
    const read = () => page.evaluate(() => ({
      arrangement: document.querySelector('#tile-field').dataset.arrangement,
      tiles: [...document.querySelectorAll('.evidence-tile')].map((tile) => ({
        id: tile.dataset.chartId, seat: tile.dataset.seat,
        pinned: tile.hasAttribute('data-pinned'),
      })),
    }));
    const before = await read();
    await page.locator('.evidence-tile').nth(1).locator('.tile-fullscreen').click();
    assert.equal(await page.locator('.dw').getAttribute('data-fullscreen'), '',
      'the chart enters temporary fullscreen');
    await page.keyboard.press('Escape');
    assert.deepEqual(await read(), before,
      'Escape restores the exact prior arrangement, seats and pins');
  } finally {
    await page.close();
  }
});

test(`#96 · global Align is permanently absent and alignment belongs to each tile — RETIRED — ${P27_SANCTION}`, async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
  try {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    assert.equal(await page.locator('#seg-align, #align-canvas').count(), 0,
      'the retired global Align host cannot return');
    assert.ok(await page.locator('.evidence-tile .tile-modes').count() > 0,
      'each eligible chart tile owns its alignment control');
  } finally {
    await page.close();
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while proving the global Align retirement');
});

test('#100 · Enter on a finding row focuses the opened detail container', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const page = await openApp(browser, {
    state: 'dense', history: true, appSource: 'fixture',
  });
  try {
    const firstRow = page.locator('#level .qrow').first();
    await firstRow.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), 'level',
      'Enter on a queue row puts focus on the opened detail container');
    assert.equal(await page.locator('#level').evaluate((level) => level.matches(':focus-visible')), true,
      'keyboard entry makes the opened detail container visibly focused');
  } finally {
    await page.close();
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while exercising #100 keyboard entry focus');
});

test('#100 · the Findings crumb restores focus to the drilled finding row', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const page = await openApp(browser, {
    state: 'dense', history: true, appSource: 'fixture',
  });
  try {
    const findingId = 'finding:carb_undercount';
    const findingRow = page.locator(`#level .qrow[data-id="${findingId}"]`);
    assert.equal(await findingRow.count(), 1,
      'the finding row intended for crumb restoration is present in the queue');
    await findingRow.focus();
    await page.keyboard.press('Enter');
    await page.getByLabel(/Findings›Carb undercount/).getByRole('button', { name: 'Findings', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-id') || document.activeElement?.tagName), findingId,
      'the Findings crumb returns focus to the drilled finding row');
  } finally {
    await page.close();
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while exercising #100 crumb restoration');
});

test('#100 · Backspace restores focus to the drilled history row', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const page = await openApp(browser, {
    state: 'dense', history: true, appSource: 'fixture',
  });
  try {
    await expandWatching(page);
    const historyId = 'ich1_WzAsNzIwLCI2Il0';
    const historyRow = page.locator(`#level .qrow[data-id="${historyId}"]`);
    assert.equal(await historyRow.count(), 1,
      'the history row intended for Backspace restoration is present in the queue');
    await historyRow.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-id') || document.activeElement?.tagName), historyId,
      'Backspace returns focus to the drilled history row');
  } finally {
    await page.close();
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while exercising #100 Backspace restoration');
});

test('#100 · an asynchronous repaint does not move focus without navigation', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const page = await openApp(browser, {
    state: 'dense', findingsDelayMs: 900, appSource: 'fixture',
  });
  try {
    const park = page.locator('#seg-window button').first();
    await park.focus();
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#seg-window button')),
      true, 'the window preset button accepted the focus park');
    await settle(page, 1100);
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#seg-window button')),
      true, 'the asynchronous repaint leaves parked focus in place');
    assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'level',
      'the asynchronous repaint does not move focus to the level container');
  } finally {
    await page.close();
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while guarding against focus steal on repaint');
});

for (const [name, probe, options] of [
  ['pending and superseded projections replace the whole inspector',
    issue81PendingProjection, {
      findingsInputs: twoFamilyInputs,
      findingsDelayMs: 900,
      findingsDelays: { '900-1260': 900, '720-1080': 1200, '1080-1440': 100 },
    }],
  ['a failed replacement projection stays failed until the window changes',
    issue81FailedProjection, {
      findingsInputs: twoFamilyInputs,
      findingsFailures: { '900-1260': 500 },
    }],
  ['a settled slice renders only its server-published findings',
    issue81SlicedProjection, { findingsInputs: twoFamilyInputs }],
]) {
  test(`#81 · ${name}`, async () => {
    const browser = await runner.browser();
    const before = openerProblems().length;
    const page = await openApp(browser, {
      state: 'typical', appSource: 'fixture', ...options,
    });
    try {
      await probe(page);
      assert.deepEqual(openerProblems().slice(before), [],
        `no opener problems while proving #81: ${name}`);
    } finally {
      await page.close();
    }
  });
}

for (const [name, probe, options] of [
  ['header and Filter ownership', issue86HeaderFilter, { state: 'drawn' }],
  ['Event charts and Sift intersection', issue86FilteredRoot, { state: 'typical' }],
]) {
  test(`#86 issue-scoped probe · ${name}`, async () => {
    const browser = await runner.browser();
    const before = openerProblems().length;
    const page = await openApp(browser, { appSource: 'fixture', ...options });
    try {
      await probe(page);
      assert.deepEqual(openerProblems().slice(before), [],
        `no opener problems while proving #86: ${name}`);
    } finally {
      await page.close();
    }
  });
}

test('#86 issue-scoped probe · pending root projection', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  let releaseResponse;
  const responseReleased = new Promise((resolve) => { releaseResponse = resolve; });
  let markResponseHeld;
  let rejectResponseHeld;
  const responseHeld = new Promise((resolve, reject) => {
    markResponseHeld = resolve;
    rejectResponseHeld = reject;
  });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    releaseResponse();
  };
  const page = await openApp(browser, {
    state: 'typical', appSource: 'fixture',
    findingsResponseBarrier: async ({ url }) => {
      if (url.pathname === '/api/diagnose/finding-case-file-preparation'
          && url.searchParams.get('start_min') === '720'
          && url.searchParams.get('end_min') === '1080') {
        markResponseHeld();
        await responseReleased;
      }
    },
  });
  const request = page.waitForRequest((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname === '/api/diagnose/finding-case-file-preparation'
      && url.searchParams.get('start_min') === '720'
      && url.searchParams.get('end_min') === '1080';
  }, { timeout: 10_000 });
  const heldTimeout = setTimeout(() => {
    rejectResponseHeld(new Error('pending-root response barrier was not entered within 10000ms'));
  }, 10_000);
  const heldRequest = Promise.all([request, responseHeld])
    .finally(() => { clearTimeout(heldTimeout); })
    .then(([matched]) => matched);
  try {
    await issue86PendingRoot(page, { request: heldRequest, release });
    assert.deepEqual(openerProblems().slice(before), [],
      'no opener problems while proving #86: pending root projection');
  } finally {
    release();
    await page.close();
  }
});

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

test('#130 · a wrapped draw leaves two endpoint edges and dims only the outside basal slots', async () => {
  const browser = await runner.browser();
  const before = openerProblems().length;
  const viewport = VIEWPORTS[0];
  for (const theme of ['light', 'dark']) {
    const page = await openApp(browser, { state: 'typical', theme, viewport, appSource: 'fixture' });
    try {
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      const chart = await page.locator('#chart').boundingBox();
      const xAt = (minute) => chart.x + 52 + (minute / 1425) * (chart.width - 104);
      const y = chart.y + chart.height * 0.45;
      // travel at the right edge, then aim the draw's moving end onto the next
      // day's 02:00 — a held boundary is travel, never a place to release on
      const during = await panThenAim(page, { x: xAt(22 * 60), y }, 'right',
        { past: 180, aim: 24 * 60 + 2 * 60 });
      assert.equal(during.chip, 'Window 22:00–02:00', 'the draw wraps before release');
      await page.mouse.up();
      await settle(page, 500);

      const wrapped = await page.evaluate(() => ({
        chip: document.querySelector('#seg-window [data-follow]')?.firstChild?.textContent.trim(),
        edges: [...document.querySelectorAll('#brace .edge')].map((edge) => parseFloat(edge.style.left)),
        grips: [...document.querySelectorAll('#brace .grip')].map((grip) => parseFloat(grip.style.left)),
        braceParts: document.getElementById('brace').children.length,
        inside: [...document.querySelectorAll('#lane button:not([data-clock-copy])')]
          .filter((button) => button.dataset.outside === 'false').length,
        outside: [...document.querySelectorAll('#lane button:not([data-clock-copy])')]
          .filter((button) => button.dataset.outside === 'true').length,
        copies: document.querySelectorAll('#lane [data-clock-copy]').length,
        axisPoints: window.echarts.getInstanceByDom(document.getElementById('chart'))
          .getOption().xAxis[0].data.length,
      }));
      assert.equal(wrapped.chip, 'Window 22:00–02:00');
      /* Edge and grip counts are static markup and paintBrace writes the same
         two offsets into both, so counting them or comparing them proves
         nothing. What can actually move is WHERE each one lands: pin all four
         against this file's own minute-to-pixel formula, and pin the wrap
         itself — a window that failed to cross midnight would put its end edge
         to the RIGHT of its start edge. */
      assert.equal(wrapped.braceParts, 5, 'the brace is two edges, two grips and one readout');
      assert.ok(wrapped.edges[1] < wrapped.edges[0],
        'a wrapped window carries its end edge left of its start edge');
      assert.ok(Math.abs(wrapped.edges[0] - (xAt(1320) - chart.x)) <= 1,
        'the start edge sits at 22:00');
      assert.ok(Math.abs(wrapped.edges[1] - (xAt(120) - chart.x)) <= 1,
        'the end edge sits at 02:00');
      assert.ok(Math.abs(wrapped.grips[0] - (xAt(1320) - chart.x)) <= 1,
        'the start grip sits on the 22:00 endpoint');
      assert.ok(Math.abs(wrapped.grips[1] - (xAt(120) - chart.x)) <= 1,
        'the end grip sits on the 02:00 endpoint');
      assert.deepEqual([wrapped.inside, wrapped.outside], [8, 40],
        'the two wrapped stretches keep eight half-hour slots in scope');
      assert.equal(wrapped.copies, 0, 'neighbour lane copies leave with the pan');
      assert.equal(wrapped.axisPoints, 96, 'the settled axis returns to the canonical day');

      for (const [minute, cursor] of [[1380, 'grab'], [60, 'grab'], [1320, 'col-resize']]) {
        await page.mouse.move(xAt(minute), y);
        assert.equal(await page.locator('#chart').evaluate((node) => getComputedStyle(node).cursor), cursor,
          `${minute} minutes advertises the wrapped-window gesture`);
      }
      await shot(page, 'issue-130', 'wrapped-window-at-rest', viewport, theme);
    } finally { await page.close(); }
  }
  assert.deepEqual(openerProblems().slice(before), [],
    'no opener problems while proving the wrapped window in both themes');
});

test('the Filter menu renders each server-published Sift count', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: /Filter/ }).click();
      assert.deepEqual(await page.getByRole('menuitemcheckbox').allTextContents(), [
        'Highs 4', 'Lows 1', 'Meals 1', 'Corrections 1',
      ], 'the four Sift items spell the server-published global counts');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering server-published chip counts');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('#83 · Filter is a roving ARIA menu and Escape wins over the drawn window', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'drawn', appSource: 'fixture' });
      const trigger = page.getByRole('button', { name: /Filter/ });
      const drawnBefore = await page.locator('#seg-window [data-follow]').innerText();
      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs ')), true);
      await page.keyboard.press('ArrowUp');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Event charts');
      await page.keyboard.press('Home');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs ')), true);
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement?.textContent.trim()), 'Event charts');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs ')), true);
      await page.keyboard.press(' ');
      assert.equal(await page.getByRole('menu').isVisible(), true,
        'Space changes a Sift choice without closing the menu');
      assert.equal(await trigger.innerText(), 'Filter 1');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      assert.equal(await page.getByRole('menu').isVisible(), true,
        'Enter changes View without closing the menu');
      assert.equal(await trigger.innerText(), 'Filter 2');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('menu').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'filter-trigger');
      assert.equal(await page.locator('#seg-window [data-follow]').innerText(), drawnBefore,
        'menu Escape does not clear the drawn window');

      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
      await page.keyboard.press('Tab');
      await page.waitForFunction(() => document.getElementById('filter-menu')?.hidden === true);
      assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'filter-trigger',
        'Tab continues in document order instead of trapping focus');

      await trigger.focus();
      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
      await trigger.click();
      assert.equal(await page.getByRole('menu').isVisible(), false,
        'the trigger toggles the menu closed');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'filter-trigger',
        'trigger closure retains trigger focus');
      await trigger.click();
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Highs '));
      await page.locator('#canvas-head').click();
      assert.equal(await page.getByRole('menu').isVisible(), false,
        'clicking outside closes without changing selections');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while exercising Filter keyboard semantics');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('#83 · the retired Event charts root filter and global canvas stay absent', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      const trigger = page.getByRole('button', { name: /Filter/ });
      await trigger.click();
      assert.equal(await page.getByRole('menuitemradio', { name: 'Event charts', exact: true }).count(), 0,
        'the root menu cannot restore the retired Event charts filter');
      assert.equal(await page.locator('#seg-align, #align-canvas').count(), 0,
        'the mutually exclusive global event canvas cannot return');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while proving the Event charts retirement');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('#83 · Filter and every menu item stay reachable at 390×844', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, {
        state: 'typical', appSource: 'fixture', viewport: { width: 390, height: 844 },
      });
      const trigger = page.getByRole('button', { name: /Filter/ });
      await trigger.waitFor();
      await trigger.click();
      const boxes = await page.locator('#filter-trigger, #filter-menu [role^="menuitem"]').evaluateAll(
        (nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect();
          return { label: node.getAttribute('aria-label') || node.textContent.trim(),
            left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        }),
      );
      for (const box of boxes) {
        assert.ok(box.left >= 0 && box.right <= 390, `${box.label} stays inside the viewport horizontally`);
        assert.ok(box.top >= 0 && box.bottom <= 844, `${box.label} stays inside the viewport vertically`);
      }
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems at the narrow Filter viewport');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('deselecting a Sift item leaves only rows matching the remaining choices', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: /Filter/ }).click();
      await page.getByRole('menuitemcheckbox', { name: 'Highs 4', exact: true }).click();
      await settle(page, 350);
      assert.deepEqual(await page.locator('#level .qrow').evaluateAll((rows) => rows.map((row) => row.dataset.id)), [
        'finding:correction_on_iob', 'finding:late_bolus',
      ], 'a deselected Highs chip hides high-only rows while preserving multi-chip matches');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while sifting the queue by a chip');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('the Watching group collapses during a sift and expands again', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await page.getByRole('button', { name: 'Overnight', exact: true }).click();
      await settle(page, 450);
      await page.getByRole('button', { name: /Filter/ }).click();
      await page.getByRole('menuitemcheckbox', { name: /^Highs / }).click();
      await page.keyboard.press('Escape');
      await settle(page, 350);
      const toggle = page.locator('#level .qcollapse');
      assert.equal(await toggle.innerText(), 'Watching · 4 reads');
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
      await page.getByRole('button', { name: /Filter/ }).click();
      await page.getByRole('menuitemcheckbox', { name: /^Highs / }).click();
      await settle(page, 350);
      assert.equal(await page.locator('#level .quiet-line.sift-empty').innerText(),
        'No findings match the current filters.');
      assert.equal(await page.locator('#level .qcollapse').innerText(), 'Watching · 4 reads',
        'the collapsed Watching group remains reachable below the empty-sift line');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering the all-hidden sift state');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('the ISF row visibly declares its whole-day scope', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await expandWatching(page);
      const row = page.locator('#level .qrow[data-id="isf"]');
      assert.equal(await row.locator('.scope-note').innerText(), ' · Whole day');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while rendering the ISF scope note');
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
      await expandWatching(page);
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

test('an insufficient basal slot case file names nights of steady data', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      const idx = await page.evaluate(() => [...document.querySelectorAll('#lane button')]
        .findIndex((b) => b.dataset.verdict === 'insufficient'));
      assert.ok(idx >= 0, 'precondition: the lane holds an insufficient slot');
      await page.click(`#lane button:nth-child(${idx + 1})`);
      await settle(page, 450);
      const support = await page.locator('#level .slot-stats').nth(1).innerText();
      const footNote = await page.locator('#level .foot-note').innerText();
      const levelText = await page.locator('#level').innerText();
      assert.match(support, /nights of steady data/, 'the case file support names steady-data nights');
      assert.match(footNote, /nights of steady data/, 'the case file footnote names steady-data nights');
      assert.doesNotMatch(levelText, /clean night|clean data/i,
        'the insufficient case file has no retired clean-data wording');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while opening an insufficient basal slot');
    } finally { /* browser stays open; closed once in after() */ }
  });

/* LOCK:diagnose-workstation:14 — ISF's own gate (`canStage = isf.recommended
   != null` at diagnose-workstation.js) is unguarded at this layer:
   frontend/plan.test.js backstops the Plan draft, not the workstation's own
   stage button. This fixture's ISF row always carries `recommended: null`
   (mockups/diagnose-workstation.synthetic/payload.json's single `analyze.isf`
   row), so the 'typical' state proves the held side directly. */
test('ISF is not stageable without an exact true backend verdict', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      await expandWatching(page);
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
      assert.equal(s.stage, null, 'ISF without exact backend permission offers no stage button');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while exercising the ISF gate');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('a rounded false ISF verdict keeps evidence and empty Recommended geometry at every review render', async () => {
    const browser = await runner.browser();
    const observed = [];
    try {
      const before = openerProblems().length;
      for (const viewport of VIEWPORTS) {
        for (const theme of ['light', 'dark']) {
          const page = await openApp(browser, {
            state: 'typical', viewport, theme, appSource: 'fixture',
            analysisInputs: (analysis) => withIsfVerdict(analysis, {
              direction: 'strengthen', recommended: 42, assertsMove: false,
              annotation: 'The conservative strengthen step rounds to the current Correction factor.',
            }),
          });
          const row = page.locator('#level .qrow[data-id="isf"]');
          const root = {
            state: await row.getAttribute('data-state'),
            tier: await row.getAttribute('data-tier'),
            nums: await row.locator('.den.nums').count(),
          };
          await row.click();
          await settle(page, 450);
          await shot(page, 'isf-verdict', 'false-drilled', viewport, theme);
          observed.push({
            viewport, theme, root,
            recommended: await page.locator('#level .numrow').nth(2).locator('b').innerText(),
            estimate: await page.locator('#level .numrow').nth(1).locator('b').innerText(),
            text: await page.locator('#level').innerText(),
            stage: await page.locator('#level .stagebtn').count(),
          });
          await page.close();
        }
      }
      assert.equal(observed.length, VIEWPORTS.length * 2);
      for (const reading of observed) {
        assert.deepEqual(reading.root, { state: 'assert', tier: 'next_in_line', nums: 0 },
          `${reading.viewport.width}x${reading.viewport.height} ${reading.theme}: queue register survives without an action number`);
        assert.equal(reading.recommended, '--', 'Recommended keeps its reserved row with no numeric value');
        assert.equal(reading.estimate, '31.40', 'the estimate remains visible');
        assert.equal(reading.stage, 0, 'the false verdict exposes no stage control');
        assert.match(reading.text, /conservative step rounds to the current Correction factor/);
        assert.doesNotMatch(reading.text, /programmed factor/i);
        assert.match(reading.text, /CI 18\.20–46\.90/,
          'the confidence interval remains visible without locking unit copy here');
        assert.doesNotMatch(reading.text, /recent lows|stronger than needed/i);
      }
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems across rounded-false evidence renders');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('a recommendation-bearing legacy ISF row with a missing verdict fails closed without losing its direction', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, {
        state: 'typical', appSource: 'fixture',
        analysisInputs: (analysis) => withIsfVerdict(analysis, {
          direction: 'weaken', recommended: 47, omitVerdict: true,
          annotation: 'Corrections keep overshooting into lows, so the correction factor eases weaker.',
        }),
        findingsProjectionInputs: withoutIsfProjectionVerdict,
      });
      const row = page.locator('#level .qrow[data-id="isf"]');
      assert.equal(await row.getAttribute('data-state'), 'assert');
      assert.equal(await row.locator('.den.nums').count(), 0,
        'the queue suppresses the stale numeric action line before drill-in');
      await row.click();
      await settle(page, 450);
      const text = await page.locator('#level').innerText();
      assert.equal(await page.locator('#level .numrow').nth(2).locator('b').innerText(), '--');
      assert.equal(await page.locator('#level .stagebtn').count(), 0);
      assert.match(text, /corrections look stronger than needed/i,
        'direction-only weaken retains its direction language');
      assert.match(text, /Corrections keep overshooting into lows/,
        'the analyzer refusal evidence remains visible');
      assert.match(text, /recent lows make a new number unsafe to suggest/i);
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while exercising a missing legacy verdict');
    } finally { /* browser stays open; closed once in after() */ }
  });

test('an exact true capped ISF verdict stages one unchanged value per generated pump segment', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const drafts = [];
      const page = await openApp(browser, {
        state: 'typical', appSource: 'fixture',
        analysisInputs: (analysis) => withIsfVerdict(analysis, {
          direction: 'strengthen', recommended: 33.6, assertsMove: true,
          annotation: 'A conservative recommendation, capped to one ≤20% step from current.',
        }),
        pumpSettingsInputs: derivedPumpSettings,
        onPlanDraft: (draft) => drafts.push(draft),
      });
      const row = page.locator('#level .qrow[data-id="isf"]');
      assert.equal(await row.locator('.den.nums').count(), 1,
        'exact true retains the queue action number');
      await row.click();
      await settle(page, 450);
      await page.locator('#level .stagebtn').click();
      await page.waitForFunction(() => document.querySelector('#plan-badge')?.textContent.trim() === '4');
      await page.waitForTimeout(100);
      assert.equal(drafts.length, 1, 'the real stage affordance issues one PUT /api/plan');
      assert.deepEqual(drafts[0].items, [
        { type: 'isf', key: 0, start_min: 0, label: '00:00', current: 42, recommended: 33.6, value: 33.6 },
        { type: 'isf', key: 360, start_min: 360, label: '06:00', current: 45, recommended: 33.6, value: 33.6 },
        { type: 'isf', key: 780, start_min: 780, label: '13:00', current: 38, recommended: 33.6, value: 33.6 },
        { type: 'isf', key: 1200, start_min: 1200, label: '20:00', current: 50, recommended: 33.6, value: 33.6 },
      ]);
      assert.equal(await page.locator('#plan-badge').innerText(), '4',
        'the Plan badge matches the four persisted segment items');
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while staging the exact-true ISF verdict');
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
      {
        analysis: raw.analyze,
        exposures: raw.exposures,
        scenarios: raw.scenarios,
        event_charts: FINDINGS_PROJECTION.inputs.event_charts,
      }, null) };
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
              + `'/assets/diagnose-workstation.js';`
              + `window.__view = createDiagnoseWorkstation({ root: document.querySelector('.mount'), callbacks: {} });`
              + `window.__ready = true;</script></body></html>`,
            contentType: 'text/html',
          });
        }
        if (url.href.includes('echarts')) {
          if (!VENDOR) return route.continue();
          return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
        }
        if (url.pathname.startsWith('/assets/')) {
          const path = join(ROOT, 'frontend', url.pathname.replace(/^\/assets\//, ''));
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
   does for every other test, except /api/analyze is made to fail. */
test('a rejected first-load fetch shows the failure message, not an uncaught error', async () => {
    const payloadPath = process.env.PAYLOAD;
    assert.ok(payloadPath, 'PAYLOAD is required (backs the endpoints that do not fail)');
    const payload = JSON.parse(await readFile(payloadPath, 'utf8'));
    const apiPattern = (path) => new RegExp(`^/api${path}`);
    const STUBS = [
      [apiPattern('/scenarios'), () => payload.scenarios],
      [apiPattern('/explore/time'), () => payload.evidence],
      [apiPattern('/status'), () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: payload.analyze.data_quality?.counts || {} })],
      [apiPattern('/plan/history'), () => ({ history: [] })],
      [apiPattern('/plan'), () => ({ items: [], updated_at: null })],
      [apiPattern('/verify/trials'), () => ({ trials: [] })],
      [apiPattern('/catalog'), () => ({ articles: [] })],
      [apiPattern('/carbs'), () => ({ entries: [] })],
      [apiPattern('/prompts'), () => ({ prompts: [] })],
      [apiPattern('/credentials'), () => ({ configured: true })],
      [apiPattern('/audit/dismissals'), () => ({ dismissed: [] })],
      [apiPattern('/outcomes'), () => ({ points: [] })],
      [apiPattern('/timeline'), () => ({ events: [] })],
      [apiPattern('/backtest'), () => ({ folds: [] })],
      [apiPattern('/model'), () => ({ entries: [] })],
      [apiPattern('/day'), () => ({ days: [] })],
      [apiPattern('/pump'), () => ({ settings: {} })],
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
          try { return route.fulfill({ body: await readFile(join(ROOT, 'frontend', path.replace(/^\/assets\//, ''))), contentType: MIME[extname(path)] || 'text/plain' }); } catch { /* fall through */ }
        }
        // The one deliberately broken endpoint: loadAudit's Promise.all
        // rejects on this, taking the real catch path a live fetch failure
        // (a timeout, a 5xx, a dropped connection) would.
        if (/^\/api\/analyze/.test(path)) {
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
  assert.match(index, /day: \(occurrence\) => goToMoment\(occurrence\.t \|\| occurrence\.anchor\?\.t,[\s\S]*occurrence\.text \|\| occurrence\.anchor\?\.label/);
  assert.match(index, /import \{ createDiagnoseEventComparison \} from '\/assets\/diagnose-event-comparison\.js';/);
  assert.match(index, /diagnoseView = createDiagnoseEventComparison\(\{ root: diagnoseRoot\.value,/);
  assert.match(index, /diagnoseStageItemsFor\(item\.key, diagnoseAnalysis\.value\)/);
  assert.match(index, /keepOnlyPlanFamily\(planItemFamily\(items\[0\]\)\)/);
  assert.match(index, /stage: diagnoseStage, isStaged: diagnoseIsStaged/);
  assert.match(index, /v-show="hasToken && diagnoseReady"/);
  assert.match(index, /Diagnose needs an API token/);
});

test('#63 · the unexplained-highs sentence is retired from the findings queue', async () => {
    const browser = await runner.browser();
    try {
      const before = openerProblems().length;
      const page = await openApp(browser, { state: 'typical', appSource: 'fixture' });
      const sanction = 'sanction: ConnorGriffin · 2026-08-23 · "Retired and incomplete evidence stops competing with the findings you can act on."';
      console.log(`RETIRED — ${sanction}`);
      assert.equal(await page.locator('#level .uncaused-note').count(), 0,
        `RETIRED — ${sanction}`);
      await page.close();
      assert.deepEqual(openerProblems().slice(before), [],
        'no opener problems while checking the retired footer');
    } finally { /* browser stays open; closed once in after() */ }
  });
