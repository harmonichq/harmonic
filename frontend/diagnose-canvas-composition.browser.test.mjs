/* Diagnose evidence canvas — the composition, driven end to end (#135 chunk 2).
 *
 * The canvas's own unit tests cover the layout algebra
 * (frontend/diagnose-canvas-layout.test.js). What they cannot cover is the part
 * that broke in review: the composition WIRED to real registry charts, a real
 * findings payload and the real tile pipeline. Every test here drives
 * `createDiagnoseWorkstation` through the shipped app — the same fixture-mode
 * opener the workstation's other browser coverage uses — and asserts on the
 * rendered field, never on a helper's return value.
 *
 * Four regressions this file exists to hold, each of which a green fast gate
 * missed:
 *   · pinning a second chart silently moved the focal chart (pin state and
 *     focus are separate verbs);
 *   · the pin-cap schematic drew more cells than the arrangement holds, and put
 *     its hollow "next" mark over a chart already seated;
 *   · the arrangements past `pair` were unreachable, because a fully pinned
 *     field offers no tile to pin and the schematic offered no cell either;
 *   · a stale-generation recovery restored a layout captured before the refresh,
 *     so a pin whose row the new generation dropped was seated with no
 *     descriptor and the repaint threw.
 *
 * FAIL CLOSED, like every browser-driven suite here: a missing Playwright
 * module, Chromium or vendored asset exits nonzero naming what is absent. A
 * green run that asserted nothing is the failure mode this file guards.
 */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openApp } from './diagnose-workstation-behavior.replay.mjs';
import { PIN_CAP, arrangementFor, seatCountFor } from './diagnose-canvas-layout.js';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) {
  missing.push('PLAYWRIGHT_MODULE is unset (point it at an installed playwright module)');
} else {
  try {
    chromium = require(process.env.PLAYWRIGHT_MODULE).chromium;
  } catch (error) {
    missing.push(`PLAYWRIGHT_MODULE=${process.env.PLAYWRIGHT_MODULE} could not be required (${error.message})`);
  }
}
const EXEC = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (chromium && !EXEC && !existsSync(chromium.executablePath())) {
  missing.push('Chromium executable is missing (run playwright install chromium)');
}
const VENDOR = process.env.VENDOR_DIR;
if (!VENDOR) missing.push('VENDOR_DIR is unset');
else {
  for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
    if (!existsSync(join(VENDOR, asset))) missing.push(`VENDOR_DIR=${VENDOR} is missing ${asset}`);
  }
}
if (!process.env.PAYLOAD) missing.push('PAYLOAD is unset (the synthetic workstation payload)');
if (missing.length) {
  throw new Error('diagnose-canvas-composition.browser.test.mjs cannot run — missing prerequisites:\n'
    + `  - ${missing.join('\n  - ')}`);
}

const { createBrowserRunner } = require('./browser-runner.js');
const runner = createBrowserRunner(() => chromium.launch({ executablePath: EXEC || undefined }));
after(() => runner.close());

const FINDINGS_INPUTS = JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8')).inputs;

/* #181/#135: the comparison tile has no endpoint of its own. Its evidence is
   the Finding case file the driver already serves from the committed synthetic
   set, so this suite adds no stub for it. */

/* One synthetic carb-ratio block payload, in the shape the registry's own
   carb-ratio chart reads, so a recovered tile draws rather than falling into
   its error guard. */
const RECOVERED_CARB_RATIO = {
  block: { start_min: 720, end_min: 840, examined_runs: 1, support: 1, excluded_runs: 0 },
  runs: [{ run_id: 'run-1', t: '2026-08-17T12:30:00', true_ic: 6, in_pool: true,
    member_offsets_min: [0] }],
  series: [{ run_id: 'run-1', points: [{ minute: 0, bg: 120 }] }],
};

async function openCanvas(browser, { routes = null, ...options } = {}) {
  const page = await openApp(browser, {
    appSource: 'fixture', theme: 'dark', findingsInputs: FINDINGS_INPUTS,
    ...options,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (routes) await routes(page);
  /* The whole clock is the unscoped queue, and it publishes the widest live
     chart list — enough charts to fill the cap. */
  await page.getByRole('button', { name: '24 h' }).click();
  await page.waitForTimeout(1200);
  return { page, errors };
}

const readField = (page) => page.evaluate(() => ({
  arrangement: document.querySelector('.tile-field')?.dataset.arrangement || null,
  tiles: [...document.querySelectorAll('.evidence-tile')].map((tile) => ({
    chartId: tile.dataset.chartId, seat: tile.dataset.seat, state: tile.dataset.state,
    pinned: tile.hasAttribute('data-pinned'),
    body: tile.querySelector('.tile-state span')?.textContent || null,
  })),
  cells: [...document.querySelectorAll('.tile-schematic > *')].map((cell) => cell.className),
  pinCount: document.querySelector('#pin-count')?.textContent || null,
  focal: document.querySelector('.evidence-tile[data-seat="focal"]')?.dataset.chartId || null,
}));

/** Pin one more chart the way a reader can: a seated tile, else the schematic's
 *  own next-cell. Returns false when the surface offers neither. */
async function pinOneMore(page) {
  const tile = page.locator('.evidence-tile .tile-pin[aria-pressed="false"]:not([disabled])');
  const next = page.locator('.tile-schematic .next:not([disabled])');
  if (await tile.count()) await tile.first().click();
  else if (await next.count()) await next.first().click();
  else return false;
  await page.waitForTimeout(350);
  return true;
}

test('every arrangement is reachable by pinning alone, and the fifth pin is refused', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const opening = await readField(page);
    assert.equal(opening.arrangement, arrangementFor(0),
      'an unpinned canvas opens on the focal arrangement');
    assert.ok(opening.tiles.length >= 2, 'the live list seats real registry charts');

    const reached = [opening.arrangement];
    for (let pins = 1; pins <= PIN_CAP; pins += 1) {
      assert.ok(await pinOneMore(page),
        `the surface offers a way to reach ${arrangementFor(pins)} (${pins} pinned)`);
      const field = await readField(page);
      assert.equal(field.arrangement, arrangementFor(pins),
        `${pins} pins derive the ${arrangementFor(pins)} arrangement`);
      assert.equal(field.pinCount, `${pins}/${PIN_CAP} pinned`);
      reached.push(field.arrangement);
    }
    assert.deepEqual(reached, ['focal', 'split', 'pair', 'onetwo', 'quad'],
      'all five arrangements are reached by pinning, in order');

    // at the cap: nothing offers a fifth pin, and no pin was evicted to make room
    assert.equal(await pinOneMore(page), false, 'a fifth pin is refused at the control');
    const capped = await readField(page);
    assert.equal(capped.pinCount, `${PIN_CAP}/${PIN_CAP} pinned`);
    assert.equal(capped.tiles.filter((tile) => tile.pinned).length, PIN_CAP,
      'every pin survives the refusal');
    assert.equal(capped.cells.filter((name) => name === 'next').length, 0,
      'the schematic offers no hollow cell at the cap');
    assert.deepEqual(errors, [], 'no page error during the pin sequence');
  } finally {
    await page.close();
  }
});

test('pinning holds and layers a chart; it never moves the focal chart', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const opening = await readField(page);
    const focal = opening.focal;
    assert.ok(focal, 'the canvas opens with a focal chart');
    /* PIN SLOT CHARTS, never the focal one. The regression this holds set the
       focal chart to the FIRST PIN on the second pin, which is invisible when
       the reader pins the focal chart first — so the sequence here is the one
       that exposed it: two slot charts, focal untouched. */
    const slot = opening.tiles.find((tile) => tile.seat !== 'focal');
    assert.ok(slot, 'the opening field seats at least one slot chart');
    await page.locator(`.evidence-tile[data-chart-id="${slot.chartId}"] .tile-pin`).click();
    await page.waitForTimeout(350);
    let field = await readField(page);
    assert.equal(field.focal, focal, 'pinning a slot chart does not move focus to it');
    assert.equal(field.tiles.find((tile) => tile.chartId === slot.chartId)?.pinned, true,
      'the pinned slot chart is held and layered into view');

    // the second pin is the one that used to reassign focus to the first pin
    await page.locator(`.evidence-tile[data-chart-id="${focal}"] .tile-pin`).click();
    await page.waitForTimeout(350);
    field = await readField(page);
    assert.equal(field.focal, focal,
      'a second pin leaves the focal chart where the reader put it');
    assert.equal(field.tiles.filter((tile) => tile.pinned).length, 2, 'both charts are held');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('the pin-cap schematic mirrors the current arrangement, and never marks a seated chart', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    for (let pins = 0; pins <= PIN_CAP; pins += 1) {
      const field = await readField(page);
      const arrangement = arrangementFor(pins);
      const seats = field.tiles.length;
      const geometry = seatCountFor(arrangement);
      const hollow = field.cells.filter((name) => name === 'next').length;
      const grows = pins < PIN_CAP && pins >= geometry;
      assert.equal(field.cells.length, geometry + (grows ? 1 : 0),
        `${arrangement} draws its own ${geometry} cells${grows ? ' plus the cell the next pin adds' : ''}`);
      assert.equal(hollow, pins === PIN_CAP ? 0 : Math.min(1, field.cells.length - seats),
        `${arrangement} marks the next pin's landing cell, and only a free one`);
      assert.equal(field.cells.slice(0, seats).filter((name) => name === 'next').length, 0,
        'no hollow cell is drawn over a chart already seated');
      assert.equal(field.cells.filter((name) => name === 'pinned').length, pins,
        'every pinned chart fills exactly one accent cell');
      if (pins < PIN_CAP) await pinOneMore(page);
    }
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('a stale generation recovers through the real tile pipeline, and the pin holds after', async () => {
  const browser = await runner.browser();
  /* The typed `{ stale: true }` result the block-evidence client returns for a
     409 `analysis_generation_mismatch` is answered on the carb-ratio tile's own
     request, so the recovery runs through the real pipeline: named state, one
     findings-generation refresh, re-request, redraw. */
  const answered = [];
  let stale = true;
  const { page, errors } = await openCanvas(browser, {
    routes: async (target) => {
      await target.route('**/api/diagnose/carb-ratio-block-evidence*', async (route) => {
        answered.push(stale ? 409 : 200);
        if (stale) {
          stale = false;   // the recovery's own re-request is answered, not re-staled
          return route.fulfill({ status: 409, contentType: 'application/json',
            body: JSON.stringify({ detail: { code: 'analysis_generation_mismatch',
              message: 'Evidence changed. Refresh findings.' } }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/json',
          body: JSON.stringify(RECOVERED_CARB_RATIO) });
      });
    },
  });
  try {
    assert.ok(answered.includes(409),
      `the carb-ratio evidence request met the generation mismatch (answers: ${answered.join(',')})`);
    assert.ok(answered.filter((status) => status === 200).length >= 1,
      'the recovery re-requested the evidence after adopting the current generation');

    const carbRatio = (await readField(page)).tiles
      .find((tile) => tile.chartId.startsWith('ic:'));
    assert.ok(carbRatio, 'the recovered chart is on the field, not dropped by the recovery');
    assert.ok(['ok', 'empty', 'stale-generation'].includes(carbRatio.state),
      `the recovered tile carries a named state, got ${carbRatio.state}`);
    if (carbRatio.state === 'stale-generation') {
      assert.equal(carbRatio.body, 'Evidence changed. Refresh findings.',
        "the server's own wording is what the reader is shown");
    }

    // and the recovered chart is still a first-class tile: it can be pinned, and
    // the pin HOLDS it against the slicer through a window change
    await page.locator(`.evidence-tile[data-chart-id="${carbRatio.chartId}"] .tile-pin`).click();
    await page.waitForTimeout(300);
    assert.equal((await readField(page)).tiles
      .find((tile) => tile.chartId === carbRatio.chartId).pinned, true, 'the recovered chart pins');
    await page.getByRole('button', { name: 'Morning' }).click();
    await page.waitForTimeout(1500);
    const held = (await readField(page)).tiles.find((tile) => tile.chartId === carbRatio.chartId);
    assert.ok(held, 'the pinned chart is held against the slicer across a window change');
    assert.equal(held.pinned, true, 'and it is still pinned');
    assert.deepEqual(errors, [], 'the 409 path throws nothing into the page');
  } finally {
    await page.close();
  }
});

test('reconcileTileDescriptors retains a pinned chart whose next slice drops its row', async () => {
  const browser = await runner.browser();
  let served = 0;
  let droppedId = null;
  const { page, errors } = await openCanvas(browser, {
    /* The second generation publishes a different set of rows — exactly what a
       re-run analysis or a pump-settings change does. The reader's pin is on a
       row that generation no longer carries. */
    findingsProjectionInputs: (projected) => {
      served += 1;
      if (served < 2 || !droppedId) return projected;
      return {
        ...projected,
        analysis_generation: `${projected.analysis_generation}-next`,
        rows: projected.rows.filter((row) => row.id !== droppedId),
      };
    },
  });
  try {
    const opening = await readField(page);
    const victim = opening.tiles.find((tile) => tile.seat !== 'focal') || opening.tiles[0];
    assert.ok(victim, 'a chart is on the field to pin');
    droppedId = victim.chartId;

    await page.locator(`.evidence-tile[data-chart-id="${victim.chartId}"] .tile-pin`).click();
    await page.waitForTimeout(300);
    assert.equal((await readField(page)).tiles.find((tile) => tile.chartId === victim.chartId).pinned,
      true, 'the chart is pinned before its row disappears');

    await page.getByRole('button', { name: 'Morning' }).click();
    await page.waitForTimeout(1800);

    const field = await readField(page);
    const retained = field.tiles.find((tile) => tile.chartId === victim.chartId);
    assert.ok(retained, 'the vanished row keeps its pinned tile through reconciliation');
    assert.equal(retained.pinned, true, 'the recommendation never evicts the pin');
    assert.equal(retained.state, 'empty', 'the retained tile names its degraded state');
    assert.equal(retained.body, 'Pinned chart is not in the current findings.',
      'the degraded tile explains why its measured evidence is absent');
    assert.equal(field.pinCount, `1/${PIN_CAP} pinned`, 'the reader-owned pin remains counted');
    assert.equal(field.arrangement, arrangementFor(1),
      'the arrangement continues to derive from the retained pin');
    for (const tile of field.tiles) {
      assert.ok(['ok', 'empty', 'error', 'stale-generation'].includes(tile.state),
        `every surviving tile still names its state, got ${tile.state}`);
    }
    assert.deepEqual(errors, [], 'the repaint does not throw');
  } finally {
    await page.close();
  }
});

test('Explore collapses a drilled parameter slot and exposes no staging path', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const basal = page.locator('.evidence-tile[data-chart-id^="basal:"]').first();
    await basal.click();
    await page.locator('#lane button[data-verdict="up"]').first().click();
    assert.equal(await page.locator('#level .stagebtn').count(), 1,
      'the reproducer reaches a live Findings staging control');

    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    assert.equal(await page.locator('#level .stagebtn').count(), 0,
      'Explore removes the staging control at the same inspector depth');
    assert.equal(await page.locator('#level').getByText('Recommended', { exact: true }).count(), 0,
      'Explore removes recommendation copy from the drilled inspector');
    assert.equal(await page.locator('#level .chart-evidence-detail').count(), 1,
      'the drilled parameter chart returns to its measured evidence detail');
    assert.equal(await page.locator('#crumb-meta').textContent(), 'Nights of steady data',
      'the inspector names its evidence in domain language');
    assert.deepEqual(errors, [], 'the mode transition throws nothing into the page');
  } finally {
    await page.close();
  }
});

test('Backspace return restores provenance to the chart owning the finding frame', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const behavioral = page.locator('.evidence-tile[data-chart-id^="finding:"]').first();
    const behavioralId = await behavioral.getAttribute('data-chart-id');
    await behavioral.click();
    const behavioralProvenance = await page.locator('#drill-provenance').textContent();

    const basalId = await page.locator('.evidence-tile[data-chart-id^="basal:"]').first()
      .getAttribute('data-chart-id');
    const basalSlot = Number(basalId.split(':')[1].split('-')[0]) / 30;
    await page.locator('#lane button').nth(basalSlot).click();
    const parameterId = await page.locator('.evidence-tile[data-drilled]').getAttribute('data-chart-id');
    assert.ok(parameterId?.startsWith('basal:'), 'the slot inspector marks its basal chart');

    await page.keyboard.press('Backspace');
    assert.equal(await page.locator('#drill-provenance').textContent(), behavioralProvenance,
      'the returned finding frame restores its own chart name');
    assert.equal(await page.locator('.evidence-tile[data-drilled]').getAttribute('data-chart-id'),
      behavioralId, 'the returned finding frame marks its own chart');
    assert.deepEqual(errors, [], 'breadcrumb return throws nothing into the page');
  } finally {
    await page.close();
  }
});
