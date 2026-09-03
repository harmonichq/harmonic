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
 * Three regressions this file exists to hold, each of which a green fast gate
 * missed:
 *   · starring a ranked chart reordered the dock even though retention and
 *     focus are separate verbs;
 *   · selecting a filmstrip cell moved that chart left-most instead of leaving
 *     the dock in its published findings order;
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
import {
  generatedFindingPose,
  generatedFindingProjection,
  openApp,
} from './diagnose-workstation-behavior.replay.mjs';

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

const FINDINGS_FIXTURE = JSON.parse(await readFile(
  join(ROOT, 'frontend/__fixtures__/findings-projection.json'), 'utf8'));
const FINDINGS_INPUTS = FINDINGS_FIXTURE.inputs;
/* The frozen per-window projections are the ground truth for "whose rows are on
   screen": the mirror the browser gates answer from is deep-compared against
   them window for window by findings-projection-mirror.test.js. */
const windowRowIds = (name) => FINDINGS_FIXTURE.windows[name].rows.map((row) => row.id);

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
    appSource: 'fixture', findingsInputs: FINDINGS_INPUTS,
    ...options,
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  if (routes) await routes(page);
  /* The whole clock is the unscoped queue, and it publishes the widest live
     chart list — enough charts to fill the cap. */
  await page.getByRole('button', { name: '24 h' }).click();
  await page.waitForTimeout(1200);
  /* THE DRAWER OPENS MINIMIZED (ADR 306). Every composition story below reads
     the strip, so the opener brings it up through the reader's own control. */
  await page.getByRole('button', { name: 'Bring the charts up', exact: true }).click();
  await page.locator('#tile-field[data-dock="docked"]').waitFor();
  await page.waitForTimeout(300);
  return { page, errors };
}

const SANCTION_DRILL_WORD = 'sanction: live-judging ruling · 2026-08-26 · "The ring and the raised rail mark the drilled tile. The chip was noise."';
const RETIRED_EXPLORE_MODE_SANCTION = 'sanction: ConnorGriffin · 2026-08-26 · "Diagnose does NOT need to host an explore mode. we\'re building a better version of it right now."';
/* The drilled tile was marked twice — a ring, and a rail that materialized a
   well plate over the tile's own plot. The ADR 215 amendment of 2026-08-27
   ("elevation carries hierarchy, the field goes slate, and the accent leaves
   the dock") retires that plate: the rail's ground no longer changes with
   drill or hover, and the mark it used to add is carried by elevation. */
const RETIRED_RAIL_WELL_SANCTION = 'sanction: ADR 215 amendment · 2026-08-27 · "The hover well plate over a tile\'s plot is retired."';
const RETIRED_MEAL_MARKERS_SANCTION = 'ConnorGriffin · 2026-08-27 · "Please also remove meal markers from the glucose chart."';
const SPOTLIGHT_OCCURRENCE_SELECTION_SANCTION = 'sanction: live-judging ruling · 2026-08-28 · "A picked occurrence belongs to the spotlight; the dock mini stays static."';

const readField = (page) => page.evaluate(() => ({
  arrangement: document.querySelector('.tile-field')?.dataset.arrangement || null,
  tiles: [...document.querySelectorAll('.evidence-tile')].map((tile) => ({
    chartId: tile.dataset.chartId, seat: tile.dataset.seat, state: tile.dataset.state,
    pinned: tile.hasAttribute('data-pinned'),
    drilled: tile.hasAttribute('data-drilled'),
    title: tile.querySelector('.tile-head h3')?.textContent || null,
    meta: tile.querySelector('.tile-meta')?.textContent || null,
    mark: tile.querySelector('.tile-drilled-mark')?.textContent || null,
    body: tile.querySelector('.tile-state span')?.textContent || null,
  })),
  drawer: [...document.querySelectorAll('.explorer-thumbnail .thumbnail-name')]
    .map((name) => name.textContent),
  cells: [...document.querySelectorAll('.tile-schematic > *')].map((cell) => cell.className),
  pinCount: document.querySelector('#pin-count')?.textContent || null,
  focal: document.querySelector('.evidence-tile[data-seat="focal"]')?.dataset.chartId || null,
  row: [...document.querySelectorAll('#tile-row .evidence-tile')].map((tile) => ({
    chartId: tile.dataset.chartId,
    pinned: tile.hasAttribute('data-pinned'),
    selected: tile.hasAttribute('data-selected'),
    title: tile.querySelector('.tile-head h3')?.textContent || null,
  })),
}));

test('five stars remain available without reordering the dock or moving the spotlight', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const opening = await readField(page);
    assert.ok(opening.focal, 'the fixed canvas opens with a spotlight');
    const order = opening.row.map(({ chartId }) => chartId);
    const targets = opening.row.filter(({ pinned }) => !pinned).slice(0, 5).reverse();
    assert.equal(targets.length, 5, 'the filmstrip exposes at least five charts to keep');

    for (const { chartId } of targets) {
      await page.locator(`#tile-row .evidence-tile[data-chart-id="${chartId}"] .tile-pin`).click();
      await page.waitForTimeout(350);
      const field = await readField(page);
      assert.equal(field.focal, opening.focal, `starring ${chartId} leaves the spotlight alone`);
      assert.deepEqual(field.row.map(({ chartId: id }) => id), order,
        'stars never change the server-published dock order');
    }
    assert.equal((await readField(page)).row.filter(({ pinned }) => pinned).length, 5,
      'the fifth star is accepted without evicting any earlier star');
    assert.deepEqual(errors, [], 'no page error during the star sequence');
  } finally {
    await page.close();
  }
});

test('a ranked chart star uses keep copy and changes no position or spotlight', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const opening = await readField(page);
    const focal = opening.focal;
    assert.ok(focal, 'the canvas opens with a focal chart');
    const order = opening.row.map(({ chartId }) => chartId);
    const mini = opening.row.find(({ chartId }) => chartId !== focal);
    assert.ok(mini, 'the opening filmstrip exposes a chart beside the spotlight');
    const star = page.locator(`#tile-row .evidence-tile[data-chart-id="${mini.chartId}"] .tile-pin`);
    const title = mini.title;
    assert.equal(await star.getAttribute('aria-label'), `Keep ${title}`);
    assert.equal(await star.getAttribute('title'), 'Keep this chart in the dock');
    await star.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    let field = await readField(page);
    assert.equal(field.focal, focal, 'starring a filmstrip chart does not move focus to it');
    assert.deepEqual(field.row.map(({ chartId }) => chartId), order,
      'starring a ranked chart leaves the published order unchanged');
    assert.equal(field.row.find(({ chartId }) => chartId === mini.chartId)?.pinned, true,
      'the star records retention without becoming ordering authority');

    assert.equal(await star.getAttribute('aria-label'), `Stop keeping ${title}`);
    assert.equal(await star.getAttribute('title'), 'Stop keeping this chart');
    await star.focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(350);
    field = await readField(page);
    assert.equal(field.focal, focal,
      'stopping retention leaves the focal chart where the reader put it');
    assert.deepEqual(field.row.map(({ chartId }) => chartId), order,
      'stopping retention also leaves the published order unchanged');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('selecting any visible filmstrip cell changes only the spotlight mark', async () => {
  const browser = await runner.browser();
  for (const sourceIndex of [1, 2, 3]) {
    const { page, errors } = await openCanvas(browser);
    try {
      const opening = await readField(page);
      const order = opening.row.map(({ chartId }) => chartId);
      const source = opening.row[sourceIndex];
      assert.ok(opening.focal && source, `the filmstrip exposes cell ${sourceIndex + 1}`);

      await page.locator(`#tile-row .evidence-tile[data-chart-id="${source.chartId}"] .tile-body`).click();
      await page.waitForTimeout(350);
      /* The pick puts the drawer away (ADR 306); the strip clauses below read
         it after the reader brings it back up. */
      assert.equal(await page.locator('#tile-field').getAttribute('data-dock'), 'hidden',
        `cell ${sourceIndex + 1}'s pick puts the drawer away`);
      await page.getByRole('button', { name: 'Bring the charts up', exact: true }).click();
      await page.locator('#tile-field[data-dock="docked"]').waitFor();
      await page.waitForTimeout(350);
      const focused = await readField(page);
      assert.equal(focused.focal, source.chartId, `cell ${sourceIndex + 1} becomes the spotlight`);
      assert.deepEqual(focused.row.map(({ chartId }) => chartId), order,
        'selecting a current frame never reorders the filmstrip');
      assert.deepEqual(focused.row.filter(({ selected }) => selected).map(({ chartId }) => chartId),
        [source.chartId], 'the selected cell alone marks the current frame');
      assert.deepEqual(errors, [], `cell ${sourceIndex + 1} focus throws no page error`);
    } finally {
      await page.close();
    }
  }
});

test('drilling a behavioural finding seats that finding\'s own comparison, marked', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    /* THE LIVE REPRO THIS EXISTS FOR: with several behavioural rows in one
       window the field showed look-alike comparison tiles, none naming its own
       factor, and drilling one of them left the field seated on a different
       chart entirely. Every behavioural chart now carries its own row's name,
       and the drilled one takes the focal seat wearing a visible mark. */
    const opening = await readField(page);
    assert.ok(opening.row.length >= 5,
      `the 24 h filmstrip publishes behavioural charts beside the parameter ones (${JSON.stringify(opening.row)})`);
    assert.equal(new Set(opening.row.map(({ title }) => title)).size, opening.row.length,
      `no two live charts share a name (${JSON.stringify(opening.row)})`);

    const target = await page.locator('#level .qrow[data-id^="finding:"]').last()
      .getAttribute('data-id');
    assert.ok(target, 'the queue lists a behavioural finding to drill');
    assert.notEqual(opening.focal, target,
      'the drill target is not already focal, so seating is what is being measured');

    await page.locator(`#level .qrow[data-id="${target}"]`).click();
    await page.waitForTimeout(900);

    const drilled = await readField(page);
    assert.equal(drilled.focal, target, 'the drilled finding takes the focal seat');
    const seated = drilled.tiles.find((tile) => tile.chartId === target && tile.seat === 'focal');
    assert.equal(seated?.drilled, true, 'the seated tile is the drilled chart');
    /* RETIRED — the word chip. Prints its sanction, and asserts what replaced
       it: the drilled tile's rail stays materialized where an undrilled one is
       a bare gutter, so the mark is never carried by colour alone. */
    console.log(SANCTION_DRILL_WORD);
    assert.equal(seated?.mark, null,
      `the drill word chip stays retired — ${SANCTION_DRILL_WORD}`);
    /* RETIRED — the drilled tile's rail no longer materializes a ground of its
       own. What replaces it is asserted below and by the drill mark itself:
       exactly one tile reads as drilled, and it is the one that owns the
       drill. This clause only ever measured the plate. */
    console.log(RETIRED_RAIL_WELL_SANCTION);
    assert.equal(await page.evaluate(() => getComputedStyle(
      document.querySelector('.evidence-tile[data-drilled] .tile-rail'),
    ).backgroundColor), await page.evaluate(() => getComputedStyle(
      document.querySelector('.evidence-tile:not([data-drilled]) .tile-rail'),
    ).backgroundColor),
    `a rail keeps one ground drilled or not — ${RETIRED_RAIL_WELL_SANCTION}`);
    assert.equal(drilled.tiles.filter((tile) => tile.drilled).length, 1,
      'only the spotlighted current frame carries the drill');
    assert.equal(drilled.tiles.filter((tile) => tile.drilled && tile.chartId !== target).length, 0,
      'no chart besides the current frame claims the drill');
    assert.equal(new Set(drilled.row.map(({ title }) => title)).size, drilled.row.length,
      `no two filmstrip cells are identically named (${JSON.stringify(drilled.row)})`);
    assert.deepEqual(errors, [], 'the drill throws no page error');
  } finally {
    await page.close();
  }
});

/* AMENDED — live-judging ruling · 2026-08-28. A dock mini is the front door
   to its spotlight, not a second live chart. The picked Occurrence therefore
   belongs to the spotlight, while the dock mini keeps its cohort-only view. */
test('an occurrence selection stays in the spotlight while the dock mini stays static', async () => {
  const browser = await runner.browser();
  const findingId = 'finding:missed_meal';
  const { page, errors } = await openCanvas(browser, {
    findingsProjectionInputs: (projected, caseFiles) => {
      const posed = generatedFindingProjection(findingId)(projected, caseFiles);
      return { ...posed, rows: posed.rows.filter((row) => row.id === findingId) };
    },
    caseScenario: { preparation: generatedFindingPose(findingId) },
  });
  try {
    const tile = page.locator(`#tile-row .evidence-tile[data-chart-id="${findingId}"]`);
    await tile.waitFor({ state: 'visible' });
    /* Promote the cell, then expand from the stage: a cell's only verb is
       "become the spotlight" (ADR 215 amendment). */
    await tile.click();
    await page.locator('#tile-focal .tile-fullscreen').click();
    await page.waitForSelector('#tile-field #ec-chart', { state: 'attached' });
    await page.locator('[data-comparison-cohort="matched"]').first().click();
    await page.waitForSelector('[data-comparison-cohort="matched"][aria-pressed="true"]');

    const matchedLegendSelected = await page.locator(
      '.ec-key-item[data-cohort="matched"]',
    ).getAttribute('data-selected-cohort');
    await page.locator('#dock-headacts button[aria-label="Back to the dock"]').click();
    /* The cell pick put the drawer away (ADR 306); Back lands on that state. */
    await page.getByRole('button', { name: 'Bring the charts up', exact: true }).click();
    await page.locator('#tile-field[data-dock="docked"]').waitFor();
    await tile.locator('.tile-chart canvas').waitFor({ state: 'visible' });
    await page.waitForFunction((id) => {
      const host = document.querySelector(`#tile-focal .evidence-tile[data-chart-id="${id}"] .tile-chart`);
      return Boolean(host && window.echarts.getInstanceByDom(host));
    }, findingId);

    const spotlight = await page.evaluate((id) => {
      const host = document.querySelector(`#tile-focal .evidence-tile[data-chart-id="${id}"] .tile-chart`);
      const option = window.echarts.getInstanceByDom(host).getOption();
      return option.series.filter((series) => series.id).map((series) => ({
        id: series.id,
        points: series.data.length,
        opacity: series.lineStyle?.opacity ?? 1,
      }));
    }, findingId);
    const dockMini = await page.evaluate((id) => {
      const host = document.querySelector(`#tile-row .evidence-tile[data-chart-id="${id}"] .tile-chart`);
      const option = window.echarts.getInstanceByDom(host).getOption();
      return option.series.filter((series) => series.id).map((series) => ({
        id: series.id,
        points: series.data.length,
        opacity: series.lineStyle?.opacity ?? 1,
      }));
    }, findingId);
    const selected = spotlight.find((series) => series.id === 'selected:trace');
    const nonSelectedCohortLines = spotlight.filter((series) => /:line:/.test(series.id)
      && !series.id.startsWith('matched:'));
    console.log(SPOTLIGHT_OCCURRENCE_SELECTION_SANCTION);
    assert.ok(selected?.points > 0, 'the spotlight draws the selected Occurrence trace');
    assert.ok(nonSelectedCohortLines.length > 0
      && nonSelectedCohortLines.every((series) => series.opacity < selected.opacity),
    'the spotlight dims non-selected cohort lines beneath the selected trace');
    assert.equal(dockMini.some((series) => series.id === 'selected:trace'), false,
      'the dock mini stays static and draws no selected Occurrence trace');
    assert.equal(matchedLegendSelected, 'true',
      'the fullscreen legend marks the selected Matched cohort');
    assert.deepEqual(errors, [], 'selection redraw produces no page error');
  } finally {
    await page.close();
  }
});

test('the fixed field exposes no retired arrangement or pin-cap schematic', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const field = await readField(page);
    assert.equal(field.arrangement, null, 'the fixed field publishes no derived arrangement');
    assert.equal(field.pinCount, null, 'the uncapped pin model publishes no cap counter');
    assert.deepEqual(field.cells, [], 'the retired arrangement schematic stays absent');
    assert.ok(field.row.length >= 5, 'the replacement is the full ordered filmstrip');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});

test('a pinned tile visibly names a stale generation before the real pipeline recovers', async () => {
  const browser = await runner.browser();
  /* The typed `{ stale: true }` result the block-evidence client returns for a
     409 `analysis_generation_mismatch` is answered on the carb-ratio tile's own
     request, so the recovery runs through the real pipeline: named state, one
     findings-generation refresh, re-request, redraw. */
  const answered = [];
  let staleArmed = false;
  let staleSent = false;
  let releaseRefresh;
  const refreshReleased = new Promise((resolve) => { releaseRefresh = resolve; });
  let markRefreshHeld;
  const refreshHeld = new Promise((resolve) => { markRefreshHeld = resolve; });
  const { page, errors } = await openCanvas(browser, {
    findingsProjectionInputs: (projected) => projected.window?.start_min === 720
      ? { ...projected, analysis_generation: `${projected.analysis_generation}-afternoon` }
      : projected,
    findingsResponseBarrier: async ({ url }) => {
      if (url.pathname === '/api/diagnose/findings'
          && url.searchParams.get('start_min') === '720'
          && url.searchParams.get('end_min') === '1080') {
        markRefreshHeld();
        await refreshReleased;
      }
    },
    routes: async (target) => {
      await target.route('**/api/diagnose/carb-ratio-block-evidence*', async (route) => {
        const url = new URL(route.request().url());
        const observed = url.searchParams.get('block_id') === '720';
        const stale = observed && staleArmed && !staleSent;
        if (stale) staleSent = true;
        if (observed) answered.push(stale ? 409 : 200);
        if (stale) {
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
    const carbRatio = (await readField(page)).tiles
      .find((tile) => tile.chartId.startsWith('ic:'));
    assert.ok(carbRatio, 'the carb-ratio chart is on the field before recovery');
    await page.locator(`#tile-row .evidence-tile[data-chart-id="${carbRatio.chartId}"] .tile-pin`).click();
    await page.waitForTimeout(300);
    assert.equal((await readField(page)).tiles
      .find((tile) => tile.chartId === carbRatio.chartId).pinned, true, 'the chart is pinned before the 409');
    staleArmed = true;
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
    await refreshHeld;
    const staleTile = (await readField(page)).tiles.find((tile) => tile.chartId === carbRatio.chartId);
    assert.equal(staleTile.state, 'stale-generation', 'the typed 409 visibly enters its named state');
    assert.equal(staleTile.body, 'Evidence changed. Refresh findings.',
      "the pinned tile renders the server's wording while recovery is in flight");

    releaseRefresh();
    await page.waitForTimeout(1500);
    assert.deepEqual(answered.slice(0, 3), [200, 409, 200],
      'the real pipeline loaded, met the 409, then re-requested after recovery');
    const held = (await readField(page)).tiles.find((tile) => tile.chartId === carbRatio.chartId);
    assert.ok(held, 'the recovered chart remains on the field');
    assert.equal(held.pinned, true, 'and it is still pinned');
    assert.deepEqual(errors, [], 'the 409 path throws nothing into the page');
  } finally {
    releaseRefresh();
    await page.close();
  }
});

test('an in-flight history refresh cannot adopt findings for a window the reader left', async () => {
  const browser = await runner.browser();
  const requested = [];
  let holdMorning = false;
  let releaseMorning;
  const morningReleased = new Promise((resolve) => { releaseMorning = resolve; });
  let markMorningHeld;
  const morningHeld = new Promise((resolve) => { markMorningHeld = resolve; });
  let markAfternoonRequested;
  const afternoonRequested = new Promise((resolve) => { markAfternoonRequested = resolve; });
  const page = await openApp(browser, {
    appSource: 'fixture', history: true, findingsInputs: FINDINGS_INPUTS,
    findingsResponseBarrier: async ({ url }) => {
      if (url.pathname !== '/api/diagnose/findings') return;
      const window = [url.searchParams.get('start_min'), url.searchParams.get('end_min')];
      requested.push(window);
      if (window[0] === '720' && window[1] === '1080') markAfternoonRequested();
      if (holdMorning && window[0] === '360' && window[1] === '720') {
        markMorningHeld();
        await morningReleased;
      }
    },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const watching = page.locator('#level .qcollapse');
    if (await watching.getAttribute('aria-expanded') !== 'true') await watching.click();
    const history = page.locator('#level .qrow[data-state="history"]').first();
    await history.waitFor({ state: 'visible' });
    await history.click();

    holdMorning = true;
    await page.getByRole('button', { name: 'Morning', exact: true }).click();
    await morningHeld;
    await page.getByRole('button', { name: 'Afternoon', exact: true }).click();
    releaseMorning();

    await afternoonRequested;
    await page.waitForFunction(() => !document.querySelector('.history-pending'));
    assert.ok(requested.some(([start, end]) => start === '720' && end === '1080'),
      'dropping the Morning response starts the current Afternoon history refresh');
    /* THE DEFECT, STATED AS EVIDENCE: the held Morning answer lands after the
       reader has pressed Afternoon. If any adoption path takes it, the field
       draws Morning's rows while every instrument reads Afternoon. */
    const seated = await page.locator('.evidence-tile')
      .evaluateAll((tiles) => tiles.map((tile) => tile.dataset.chartId));
    const afternoon = windowRowIds('afternoon');
    const morningOnly = windowRowIds('morning').filter((id) => !afternoon.includes(id));
    assert.ok(seated.length > 0, 'the field is drawn');
    assert.deepEqual(seated.filter((id) => morningOnly.includes(id)), [],
      `no chart from the window the reader left is seated (${JSON.stringify(seated)})`);
    assert.deepEqual(errors, [], 'the interleaved refresh throws no page error');
  } finally {
    releaseMorning();
    await page.close();
  }
});

test('a wrapping slicer drag coalesces pinned-chart re-reads before mouse-up', async () => {
  const browser = await runner.browser();
  const preparationWindows = [];
  const caseProjectionIds = [];
  let heldBehavioralRow = null;
  let holdNextPreparation = false;
  let markFirstPreparationHeld;
  const firstPreparationHeld = new Promise((resolve) => { markFirstPreparationHeld = resolve; });
  let releaseFirstPreparation;
  const firstPreparationReleased = new Promise((resolve) => { releaseFirstPreparation = resolve; });
  const { page, errors } = await openCanvas(browser, {
    findingsProjectionInputs: (projected) => {
      if (!projected.window?.scoped) {
        heldBehavioralRow = structuredClone(
          projected.rows.find((row) => row.register === 'finding' && row.event_chart),
        );
      }
      if (!heldBehavioralRow || projected.rows.some((row) => row.id === heldBehavioralRow.id)) {
        return projected;
      }
      return { ...projected, rows: [...projected.rows, structuredClone(heldBehavioralRow)] };
    },
    findingsResponseBarrier: async ({ url }) => {
      if (!holdNextPreparation
          || url.pathname !== '/api/diagnose/finding-case-file-preparation') return;
      holdNextPreparation = false;
      markFirstPreparationHeld();
      await firstPreparationReleased;
    },
  });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/api/diagnose/finding-case-file-preparation') {
      preparationWindows.push([url.searchParams.get('start_min'), url.searchParams.get('end_min')]);
    }
    if (url.pathname === '/api/diagnose/finding-case-file') {
      caseProjectionIds.push(url.searchParams.get('projection_id'));
    }
  });
  try {
    const behavioral = page.locator('.evidence-tile[data-chart-id^="finding:"]').first();
    assert.equal(await behavioral.count(), 1, 'the field offers a behavioral chart to hold');
    await page.getByRole('button', { name: 'Overnight', exact: true }).click();
    await page.waitForTimeout(1200);

    const beforeUnpinnedDrag = preparationWindows.length;
    const unpinnedGripA = await page.locator('#grip-a').boundingBox();
    const unpinnedGripB = await page.locator('#grip-b').boundingBox();
    assert.ok(unpinnedGripA && unpinnedGripB, 'the unpinned canvas exposes the Overnight brace');
    const unpinnedY = unpinnedGripA.y + unpinnedGripA.height / 2;
    const unpinnedMiddle = (unpinnedGripA.x + unpinnedGripB.x + unpinnedGripB.width) / 2;
    await page.mouse.move(unpinnedMiddle, unpinnedY);
    await page.mouse.down();
    await page.mouse.move(unpinnedMiddle - 10, unpinnedY);
    await page.waitForFunction(() => !document.querySelector('#brace-readout')?.hidden);
    await page.waitForTimeout(200);
    assert.equal(preparationWindows.length, beforeUnpinnedDrag,
      'a held drag with no pinned charts performs no evidence re-read');
    await page.mouse.up();
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.waitForTimeout(1200);

    await behavioral.locator('.tile-pin').click();
    const beforeWindows = preparationWindows.length;
    const beforeCases = caseProjectionIds.length;
    holdNextPreparation = true;
    await page.getByRole('button', { name: 'Overnight', exact: true }).click();
    await firstPreparationHeld;

    const gripA = await page.locator('#grip-a').boundingBox();
    const gripB = await page.locator('#grip-b').boundingBox();
    assert.ok(gripA && gripB, 'the Overnight window exposes both brace grips');
    const y = gripA.y + gripA.height / 2;
    const middle = (gripA.x + gripB.x + gripB.width) / 2;
    await page.mouse.move(middle, y);
    await page.mouse.down();
    await page.mouse.move(middle - 10, y);
    await page.waitForFunction(() => !document.querySelector('#brace-readout')?.hidden);
    const firstReadout = await page.locator('#brace-readout').textContent();
    await page.mouse.move(middle - 20, y);
    await page.waitForFunction((previous) => document.querySelector('#brace-readout')?.textContent !== previous,
      firstReadout);
    const penultimateReadout = await page.locator('#brace-readout').textContent();
    await page.mouse.move(middle - 30, y);
    await page.waitForFunction((previous) => document.querySelector('#brace-readout')?.textContent !== previous,
      penultimateReadout);
    const finalReadout = await page.locator('#brace-readout').textContent();
    const toMinute = (clock) => {
      const [hour, minute] = clock.split(':').map(Number);
      return hour * 60 + minute;
    };
    const finalWindow = finalReadout.split('–').map(toMinute);

    assert.equal(preparationWindows.length, beforeWindows + 1,
      'changed positions collapse behind the one held preparation request');
    releaseFirstPreparation();
    await page.waitForFunction((count) => performance.getEntriesByType('resource')
      .filter((entry) => new URL(entry.name).pathname
        === '/api/diagnose/finding-case-file-preparation').length >= count,
    beforeWindows + 2);
    await page.waitForTimeout(500);

    const issued = preparationWindows.slice(beforeWindows);
    assert.ok(issued.length <= 2,
      `the drag issues at most the in-flight and latest requests (issued ${JSON.stringify(issued)})`);
    const [finalStart, finalEnd] = issued.at(-1).map(Number);
    assert.deepEqual([finalStart, finalEnd], finalWindow,
      'the final request matches the independently rendered final brace position');
    assert.ok(finalStart > finalEnd,
      'the latest request preserves the final midnight-wrapping position');
    const identity = `${finalStart.toString(16).padStart(4, '0')}${finalEnd.toString(16).padStart(4, '0')}`
      .repeat(4);
    assert.equal(caseProjectionIds.at(-1), `fp_${identity}`,
      'the pinned behavioral tile paints the final drag position before release');
    assert.ok(caseProjectionIds.length > beforeCases,
      'the final coalesced position reaches the real tile pipeline');
    await page.mouse.up();
    assert.deepEqual(errors, []);
  } finally {
    releaseFirstPreparation();
    await page.mouse.up().catch(() => {});
    await page.close();
  }
});

test('reconcileTileDescriptors keeps an unranked star immediately before Watching', async () => {
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
    const victim = opening.row.find(({ selected }) => !selected) || opening.row[0];
    assert.ok(victim, 'a chart is on the field to pin');
    droppedId = victim.chartId;

    await page.locator(`#tile-row .evidence-tile[data-chart-id="${victim.chartId}"] .tile-pin`).click();
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
    const retainedIndex = field.row.findIndex(({ chartId }) => chartId === victim.chartId);
    const firstTailIndex = await page.locator('#tile-row .evidence-tile').evaluateAll((tiles) =>
      tiles.findIndex((tile) => tile.hasAttribute('data-tail-head')));
    assert.equal(retainedIndex, firstTailIndex - 1,
      'the retained star follows every ranked chart and immediately precedes Watching');
    assert.equal(retained.body, 'Kept chart is not in the current findings.',
      'the degraded tile explains why its measured evidence is absent');
    assert.equal(field.pinCount, null, 'the uncapped pin model has no cap counter');
    assert.equal(field.arrangement, null, 'the field does not revive a derived arrangement');
    for (const tile of field.tiles) {
      assert.ok(['ok', 'empty', 'error', 'stale-generation'].includes(tile.state),
        `every surviving tile still names its state, got ${tile.state}`);
    }
    assert.deepEqual(errors, [], 'the repaint does not throw');
  } finally {
    await page.close();
  }
});

test('Explore mode stays retired — RETIRED', async () => {
  console.log(`RETIRED — ${RETIRED_EXPLORE_MODE_SANCTION}`);
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const modeSwitch = page.getByRole('button', { name: /^(Findings|Explore)$/ });
    assert.equal(await modeSwitch.count(), 0, `RETIRED — ${RETIRED_EXPLORE_MODE_SANCTION}`);
    assert.deepEqual(errors, [], 'checking the retired mode throws nothing into the page');
  } finally {
    await page.close();
  }
});

test('glucose-strip meal markers stay retired — RETIRED', async () => {
  console.log(`RETIRED — ${RETIRED_MEAL_MARKERS_SANCTION}`);
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const series = await page.evaluate(() => window.echarts.getInstanceByDom(
      document.getElementById('chart'),
    ).getOption().series.map((entry) => entry.name));
    assert.equal(series.includes('Meal boluses'), false,
      `RETIRED — ${RETIRED_MEAL_MARKERS_SANCTION}`);
    assert.deepEqual(errors, [], 'checking retired meal markers throws nothing into the page');
  } finally {
    await page.close();
  }
});

test('Dark canvas gives the shared hero/basal body one vessel edge and role-owned dock chrome', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    await page.locator('#tile-focal .evidence-tile').waitFor({ state: 'visible' });
    const surface = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      const focal = style('#tile-focal .evidence-tile');
      const chart = style('#chart');
      const lane = style('#lane');
      const handle = style('#dock-handle');
      const slot = style('#tile-focal .tile-head');
      return {
        focalEdge: focal.boxShadow, focalRadius: focal.borderTopLeftRadius,
        chartBorder: chart.borderTopWidth, laneBorder: lane.borderTopWidth,
        sharedHeroBasalBody: document.querySelector('#chart').parentElement
          === document.querySelector('#lane').closest('.body'),
        separatedBodyFails: (() => {
          const sharesBody = (chart, basal) => chart.parentElement === basal.closest('.body');
          const separated = document.createElement('div');
          separated.className = 'body';
          return !sharesBody(document.querySelector('#chart'), separated);
        })(),
        handleGround: handle.backgroundColor, slotGround: slot.backgroundColor,
        handleRule: handle.borderTopColor,
      };
    });
    assert.match(surface.focalEdge, /0px 0px 0px 1px inset/, 'focal chart has one inset vessel edge');
    assert.equal(surface.focalRadius, '4px', 'focal vessel keeps the shared radius');
    assert.equal(surface.chartBorder, '0px', 'hero chart adds no second top seam');
    assert.equal(surface.laneBorder, '0px', 'basal lane adds no second top seam');
    assert.equal(surface.sharedHeroBasalBody, true, 'hero chart and basal lane share one canvas body');
    assert.equal(surface.separatedBodyFails, true, 'a separated basal body fails the shared-vessel identity check');
    assert.equal(surface.handleGround, surface.slotGround, 'dock handle shares the swappable-slot rail');
    assert.notEqual(surface.handleRule, 'rgba(0, 0, 0, 0)', 'dock handle exposes its own tray boundary');
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('Backspace return restores provenance to the chart owning the finding frame', async () => {
  const browser = await runner.browser();
  const { page, errors } = await openCanvas(browser);
  try {
    const behavioral = page.locator('.evidence-tile[data-chart-id^="finding:"]').first();
    const behavioralId = await behavioral.getAttribute('data-chart-id');
    await behavioral.click();
    /* RETIRED — the #drill-provenance readout this test used to read.
       Sanction: ConnorGriffin · 2026-08-27 · "Stop repeating ourselfes.
       Respect the sanctitity of the breadcrumb." The drill mark (data-drilled)
       is the sole restore evidence, asserted below. */
    assert.equal(await page.locator('#drill-provenance').count(), 0,
      'RETIRED — the provenance readout must not return');

    /* The finding click put the drawer away (ADR 306); the basal cell is
       read after bringing the strip back up. */
    await page.getByRole('button', { name: 'Bring the charts up', exact: true }).click();
    await page.locator('#tile-field[data-dock="docked"]').waitFor();
    const basalId = await page.locator('.evidence-tile[data-chart-id^="basal:"]').first()
      .getAttribute('data-chart-id');
    const basalSlot = Number(basalId.split(':')[1].split('-')[0]) / 30;
    await page.locator('#lane button').nth(basalSlot).click();
    const parameterIds = await page.locator('.evidence-tile[data-drilled]')
      .evaluateAll((tiles) => [...new Set(tiles.map((tile) => tile.dataset.chartId))]);
    assert.equal(parameterIds.length, 1, 'every slot-inspector mark names one chart');
    assert.ok(parameterIds[0]?.startsWith('basal:'), 'the slot inspector marks its basal chart');

    await page.keyboard.press('Backspace');
    const returnedIds = await page.locator('.evidence-tile[data-drilled]')
      .evaluateAll((tiles) => [...new Set(tiles.map((tile) => tile.dataset.chartId))]);
    assert.deepEqual(returnedIds, [behavioralId],
      'every returned finding-frame mark names its own chart');
    assert.deepEqual(errors, [], 'breadcrumb return throws nothing into the page');
  } finally {
    await page.close();
  }
});
