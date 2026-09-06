// Executable half of the #677 behaviour ledger (archived; the Verify
// workstation replay is the same pattern).
// Fourteen frozen stories, run through the app opener — the mock this ledger once
// ran against is archived (#722); the app is the sole contract artifact.
// S6/S7/S11 carry the #694 amendment. S12 (#711) rewrites glucose readings
// after the fixture's server-owned support facts were computed, proving the
// app leg derives support from the occurrences themselves rather than echoing
// a stale capture stamp.
import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const { createBuiltShell } = require('./built-shell.js');
const SYNTHETIC = join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json');
const BASE_PAYLOAD = join(ROOT, 'mockups/diagnose-workstation.synthetic/payload.json');
/* #181/#135 — the standalone lens route and global ALIGN control are retired.
   Every event comparison in this ledger is now reached the way a reader reaches
   it: open the unscoped queue, drill a Finding, then open its row-derived
   comparison tile. The tile's registry coordinates request event alignment from
   the Finding case-file path; there is no global mode switch in the successor UI. */
const FINDINGS = ['finding:late_bolus', 'finding:over_treated_low', 'finding:missed_meal'];
const SPOTLIGHT_CURSOR_SANCTION = 'sanction: live-judging ruling · 2026-08-28 · "The visible comparison chart keeps its keyboard cursor; it is the reader\'s keyboard route into comparison evidence."';

export class ReplayError extends Error {}
const fail = (message) => { throw new ReplayError(message); };
const ok = (condition, message) => { if (!condition) fail(message); };
const settle = (page, ms = 350) => page.waitForTimeout(ms);
const problems = [];
export const openerProblems = () => problems.slice();

const findingTileSelector = (findingId) =>
  `#tile-field .evidence-tile[data-chart-id="${findingId}"]`;
const visibleFindingTile = (page, findingId) =>
  page.locator(`${findingTileSelector(findingId)}:visible`).first();

function playwright() {
  return require(process.env.PLAYWRIGHT_MODULE
    ?? fail('PLAYWRIGHT_MODULE is required — this replay never skips'));
}
export async function openApp(browser, options = {}) {
  const shell = createBuiltShell();
  const viewport = options.viewport || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const servedByFinding = new Map();
  const payload = JSON.parse(await readFile(BASE_PAYLOAD, 'utf8'));
  const caseFiles = JSON.parse(await readFile(
    join(ROOT, 'mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));
  const apiPattern = (path) => new RegExp(`^/api${path}`);
  const stubs = [
    [apiPattern('/analyze'), () => payload.analyze],
    [apiPattern('/diagnose/finding-case-file-preparation'), () =>
      JSON.parse(JSON.stringify(caseFiles.preparation))],
    [apiPattern('/diagnose/finding-case-file$'), (url) => {
      const findingId = url.searchParams.get('finding_id');
      const finding = caseFiles.cases[findingId];
      const alignment = url.searchParams.get('alignment');
      const occ = url.searchParams.get('occ');
      const served = JSON.parse(JSON.stringify(!occ ? finding[alignment]
        : finding[`selected_${alignment}`][occ] || finding[`unavailable_${alignment}`]));
      /* A story poses a SERVED shape here and nowhere else. The browser owns no
         membership, count or support, so the only honest way to pose one is to
         change what the server said. */
      if (options.invalidComparison && alignment === 'event') {
        /* An unknown support grade is a served fact the browser cannot grade
           for itself — the case a fail-closed surface must refuse whole. */
        served.projection.cohorts[0].support = 'unknown';
      }
      const response = options.caseFile ? options.caseFile(served, url) : served;
      servedByFinding.set(findingId, response);
      return response;
    }],
    /* #735: the app's Diagnose loader now also asks for the server-owned findings
       queue (ADR 730). It is not this surface's subject, but a rejected fetch there
       takes the whole loader into `setError` and this surface never mounts — so it
       is answered from the same fixture-only mirror the workstation gates use. */
    [apiPattern('/diagnose/findings'), (url) => projectFindings(
      { analysis: payload.analyze, exposures: payload.exposures, scenarios: payload.scenarios },
      url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      })],
    [apiPattern('/scenarios'), () => payload.scenarios],
    [apiPattern('/explore/time'), () => payload.evidence],
    [apiPattern('/explore/exposures'), () => payload.exposures],
    [apiPattern('/status'), () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: {} })],
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
  page.on('pageerror', (error) => problems.push(`pageerror(app): ${error}`));
  await page.addInitScript(() => {
    localStorage.setItem('ciq_token', 'event-comparison-replay');
    localStorage.setItem('tab', 'diagnose');
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    const response = shell.serve(path);
    if (response) return route.fulfill(response);
    for (const [pattern, body] of stubs) {
      if (pattern.test(path)) {
        return route.fulfill({ body: JSON.stringify(body(url)), contentType: 'application/json' });
      }
    }
    problems.push(`unstubbed ${route.request().method()} ${path} (app)`);
    return route.fulfill({ status: 404, body: JSON.stringify({ detail: 'not stubbed' }) });
  });
  await page.goto('http://app.local/');
  await page.waitForSelector('[data-event-view="glucose"] #level', { timeout: 15000 });
  await settle(page, 500);
  /* `drill: false` is how a reader reaches Diagnose from the tab bar — the case
     that must land on Glucose, the recommendation surface, and not on any
     evidence lens. */
  if (options.drill === false) return page;
  /* The workstation opens at its Overnight preset, and that scope is a real
     window: a finding with no occurrences in it is correctly absent from the
     queue. 24 h is the unscoped global queue (term 38) — the one place every
     Finding in the window is listed. */
  await page.locator('#seg-window button', { hasText: '24 h' }).click();
  const findingId = options.finding || FINDINGS[0];
  page.__comparisonFindingId = findingId;
  page.__comparisonServedByFinding = servedByFinding;
  const findingQueued = await page.locator('#level .qrow').evaluateAll((rows, id) =>
    rows.some((row) => row.dataset.id === id), findingId);
  ok(findingQueued, `${findingId} is absent from the unscoped findings queue`);
  if (!(await visibleFindingTile(page, findingId).isVisible())) {
    await page.locator('#explorer-trigger').click();
    await page.locator(`${findingTileSelector(findingId)}[data-seat="grid"]`).click();
  }
  if (options.invalidComparison) {
    await visibleFindingTile(page, findingId).locator('.tile-body').click();
    await page.waitForSelector('.case-file-error', { timeout: 15000 });
    return page;
  }
  await page.waitForSelector(
    `${findingTileSelector(findingId)}[data-state="ok"]:visible`,
    { timeout: 15000 },
  );
  /* Catalog-owned proofs open All charts explicitly. Readiness above cannot
     ask the catalog: the Finding may already own the spotlight while it is closed. */
  const catalogChart = page.locator(`#tile-row .evidence-tile[data-chart-id="${findingId}"]`);
  if (!(await catalogChart.isVisible())) {
    await page.getByRole('button', { name: 'All charts', exact: true }).click();
    await page.waitForSelector('#tile-field[data-explorer]', { timeout: 15000 });
  }
  try {
    await catalogChart.locator('.tile-chart canvas').waitFor({ state: 'visible', timeout: 15000 });
    /* A freshly opened catalog mounts its charts a paint after the
       canvas appears; read the option only once the instance exists. */
    await page.waitForFunction((id) => {
      const host = document.querySelector(`#tile-row .evidence-tile[data-chart-id="${id}"] .tile-chart`);
      return Boolean(host && window.echarts.getInstanceByDom(host));
    }, findingId, { timeout: 15000 });
    /* Opening repaints the catalog once more after the instance first appears;
       settle so the snapshot below reads the surviving instance, not one the
       repaint disposed. */
    await settle(page, 700);
  } catch {
    const boxes = await catalogChart.evaluate((element) => Object.fromEntries(
      [['tile', element], ['body', element.querySelector('.tile-body')],
        ['host', element.querySelector('.tile-chart')],
        ['canvas', element.querySelector('.tile-chart canvas')]]
        .map(([name, node]) => [name, node ? {
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        } : null]),
    ));
    fail(`${findingId} did not visibly render its successor tile canvas: ${JSON.stringify(boxes)}`);
  }
  page.__catalogChartComparison = await catalogChartRendered(page, findingId);
  /* The standalone support audit is a consumer of this opener and retains its
     historical property name. Feed it the same successor catalog snapshot;
     this is an adapter alias, not a resurrected dock surface. */
  page.__dockMiniComparison = page.__catalogChartComparison;
  /* Promote the cell, then expand from the stage — a cell's only verb is
     "become the spotlight" (ADR 215 amendment). */
  await catalogChart.click();
  await page.waitForSelector('#tile-field:not([data-explorer])', { timeout: 15000 });
  if (options.selectCohort) {
    /* Selection belongs to the visible case roster. Fullscreen deliberately
       hides the inspector, so make the reader's selection before expanding
       the already-promoted Spotlight. */
    await page.locator(`#level [data-comparison-cohort="${options.selectCohort}"]:visible`).first().click();
    await page.waitForSelector('#level .case-facts', { timeout: 15000 });
    await settle(page, 500);
    page.__selectedComparison = servedByFinding.get(findingId);
  }
  await page.locator('#tile-focal .tile-fullscreen').click();
  await page.waitForSelector('#tile-focal #ec-chart', { state: 'attached', timeout: 15000 });
  await settle(page, 700);
  if (options.selectCohort) {
    page.__spotlightComparison = await spotlightRendered(page, findingId);
    await page.locator('#chart-headacts button[aria-label="Close"]').click();
    /* Close restores the selected Spotlight. The catalog snapshot was taken
       before selection and is intentionally static, so reopening All charts
       here would only hide the live drilled provenance this story also reads. */
  }
  return page;
}

async function use(open, browser, options, fn) {
  const page = await open(browser, options);
  try { await fn(page); } finally { await page.close(); }
}

/* The catalog chart is the successor's front door. Read its own ECharts instance
   before fullscreen replaces it; fullscreen remains an additional view for
   its title, accessible legend and keyboard semantics. */
const catalogChartRendered = (page, findingId) => page.locator(
  `#tile-row .evidence-tile[data-chart-id="${findingId}"]`,
).evaluate((tile) => {
  const host = tile.querySelector('.tile-chart');
  const chart = host && window.echarts.getInstanceByDom(host);
  if (!chart) return null;
  const option = chart.getOption();
  return {
    chartId: tile.dataset.chartId,
    state: tile.dataset.state,
    visible: Boolean(host.getClientRects().length && host.querySelector('canvas')),
    axis: [option.xAxis[0].min, option.xAxis[0].max],
    ids: option.series.map((series) => series.id).filter(Boolean),
    series: option.series.filter((series) => series.id).map((series) => ({
      id: series.id,
      name: series.name,
      data: series.data,
      opacity: series.lineStyle?.opacity ?? 1,
    })),
  };
});

const spotlightRendered = (page, findingId) => page.evaluate((id) => {
  const host = document.querySelector(`#tile-focal .evidence-tile[data-chart-id="${id}"] #ec-chart`);
  const chart = host && window.echarts.getInstanceByDom(host);
  const option = chart?.getOption();
  return {
    legend: [...document.querySelectorAll('#tile-focal .ec-key-item')].map((item) => ({
      cohort: item.dataset.cohort, support: item.dataset.support || null,
      selected: item.dataset.selectedCohort || null,
      name: item.querySelector('strong')?.textContent ?? null,
      detail: item.querySelector('small')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    })),
    /* The fullscreen row names the chart now — the tile-local header under it
       was the second title, and is gone (#72's ruling, re-applied at the mount
       that replaced the one it was settled at). */
    title: document.querySelector('#canvas-head[data-full] #full-title')?.textContent ?? null,
    chartLabel: host?.getAttribute('aria-label') || '',
    ids: option?.series.map((series) => series.id).filter(Boolean) || [],
    series: option?.series.filter((series) => series.id).map((series) => ({
      id: series.id, name: series.name, data: series.data,
      opacity: series.lineStyle?.opacity ?? 1,
    })) || [],
  };
}, findingId);

/* Membership, counts and grades are server-owned, so compare the served case
   file with what the catalog chart drew. Selection is spotlight-only, so read its
   trace from the spotlight rather than pretending the mini owns it. */
const rendered = async (page) => {
  const catalogChart = page.__catalogChartComparison;
  const served = page.__selectedComparison
    || page.__comparisonServedByFinding.get(page.__comparisonFindingId);
  ok(catalogChart?.visible && catalogChart.chartId === page.__comparisonFindingId,
    `the catalog chart did not expose its own ECharts option: ${JSON.stringify(catalogChart)}`);
  const ids = catalogChart.ids;
  const { projection } = served;
  const spotlight = page.__spotlightComparison || await spotlightRendered(page, page.__comparisonFindingId);
  return {
    catalogChart,
    spotlight,
    schema: served.schema,
    alignment: projection.alignment,
    anchor: projection.anchor,
    window: projection.window_min,
    axis: catalogChart.axis,
    comparison: projection.comparison,
    counts: projection.counts,
    cohorts: projection.cohorts.map((cohort) => ({
      key: cohort.key, name: cohort.name, support: cohort.support,
      routed: cohort.routed_count, usable: cohort.usable_count,
      episodes: (cohort.episodes || []).length,
      pointStates: [...new Set(cohort.points.map((point) => point.support))].sort(),
      series: ids.filter((id) => id.startsWith(`${cohort.key}:`)),
    })),
    selected: served.selection,
    legend: spotlight.legend,
    title: spotlight.title,
  };
};

// AMENDED (issue #181) — the standalone lens route is retired with its own
// chrome, so the "shipped chrome siblings" half now reads the cockpit the
// drilled case file lives inside, and the fail-closed half poses a malformed
// SERVED case file rather than a missing capture. The three claims are
// unchanged: the surface sits inside the shipped shell, a bare Diagnose open
// lands on Glucose rather than an evidence lens, and a case file the browser
// cannot grade for itself is refused whole and says so.
export const S1 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.cockpit-topbar').isVisible(), 'shipped cockpit sibling is missing');
  ok(await page.locator('.cockpit-footer').isVisible(), 'shipped footer sibling is missing');
  for (const selector of ['.ec-view-seg', '.ec-view-coordinate', '[data-view]',
    '#ec-factor', '#ec-another', '.ec-inspector', '#ec-occurrence']) {
    ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
  }
  /* No drill — how Diagnose is reached from the tab bar — opens Glucose, the
     recommendation surface, not an evidence lens. Read off the root dataset the
     workstation itself stamps, not a View control. */
  const bare = await open(browser, { drill: false });
  try {
    ok((await bare.locator('[data-event-view="glucose"]').count()) > 0,
      'a bare Diagnose open did not land on Glucose');
    ok((await bare.locator('#tile-field #ec-chart').count()) === 0,
      'a bare Diagnose open mounted an evidence lens');
  } finally { await bare.close(); }
  const invalid = await open(browser, { invalidComparison: true });
  try {
    ok(await invalid.locator('.case-file-error').isVisible(),
      'an ungradable served case file did not fail visibly');
    ok(/did not match|unavailable/i.test(await invalid.locator('.case-file-error').innerText()),
      'the refused case file did not explain itself');
    ok(await invalid.locator('#tile-field #ec-chart').count() === 0,
      'a refused case file still partially drew an evidence lens');
  } finally { await invalid.close(); }
});

// RETIRED (issue #41) — the View rail's own keyboard focus stepping. There is
// no View control left to step through (ADR 31 part 3). Same sanction as S1.
export const S2 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.ec-view-seg').count() === 0, '.ec-view-seg did not retire');
});

// AMENDED (issue #41, again at #181) — P52 retired the inspector and the Factor
// select; #181 retires the `factor` coordinate itself. What this story checked
// THROUGH those controls — the compared occurrences share one declared identity,
// the no-match copy claims nothing about correctness, and changing what is being
// compared re-renders the canvas — survives on the served case file: the anchor
// every cohort is aligned on is the server's, and a second Finding drilled from
// the same queue draws its own comparison.
export const S3 = async (open, browser) => use(open, browser, {}, async (page) => {
  const state = await rendered(page);
  ok(state.anchor.kind === 'completed_carb_bolus',
    `a meal comparison is not anchored on a completed carb bolus: ${state.anchor.kind}`);
  ok(state.cohorts.every((cohort) => cohort.name && typeof cohort.name === 'string'),
    'a cohort reached the canvas without the name the server gave it');
  const baseline = state.legend.find((item) => item.cohort === 'comparison');
  ok(!/normal|correct behavior|behaved correctly/i.test(`${baseline.name} ${baseline.detail}`),
    'the comparison population copy makes a normal/correct claim');
  const other = await open(browser, { finding: 'finding:over_treated_low' });
  try {
    const after = await rendered(other);
    ok(after.title !== state.title && /Over-treated low/i.test(after.title),
      `drilling another Finding did not re-render the canvas: ${after.title}`);
    ok(after.anchor.kind === 'excursion_nadir',
      `the low comparison did not carry its own served anchor: ${after.anchor.kind}`);
  } finally { await other.close(); }
});

// RETIRED (issue #41) — the anchor-time Block seg. P52 retires it with the
// rest of the lens's own instrument row, and #181 retires the whole coordinate
// row with the route. Same sanction as S1.
export const S4 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.ec-block-seg').count() === 0, '.ec-block-seg did not retire');
});

// AMENDED (issue #41, again at #181) — the near-rule disclosure sentence and the
// Other factors checkbox lived in the retired inspector; the `another`
// coordinate they addressed is retired with the route. The population it once
// exposed is now a SERVED cohort: the case file names a third, comparison
// population and the canvas prints that name.
export const S5 = async (open, browser) => use(open, browser, {}, async (page) => {
  for (const selector of ['.ec-boundary-note', '#ec-another']) {
    ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
  }
  const state = await rendered(page);
  ok(state.cohorts.map((cohort) => cohort.key).join(',') === 'matched,nearly_matched,comparison',
    `the served cohorts are not the three case-file populations: ${state.cohorts.map((c) => c.key)}`);
  const baseline = state.legend.find((item) => item.cohort === 'comparison');
  ok(baseline && baseline.name === state.comparison.name,
    `the canvas renamed the served comparison population: ${baseline?.name}`);
});

// RETIRED (issue #41) — the occurrence select, the rescue sentence, the Day
// link and Clear trace all lived in the retired inspector (P52); there is no
// surviving affordance of the lens's own to reach an occurrence. Selection now
// happens on the case file's roster and is exercised by S11.
export const S6 = async (open, browser) => use(open, browser,
  { finding: 'finding:over_treated_low' }, async (page) => {
    for (const selector of ['#ec-occurrence', '#ec-occ-detail', '#ec-rescue', '#ec-day-link', '#ec-clear']) {
      ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
    }
  });

// LOCK:diagnose-event-comparison:12 LOCK:diagnose-event-comparison:13
// LOCK:diagnose-event-comparison:24 LOCK:diagnose-event-comparison:25
// LOCK:diagnose-event-comparison:21
// AMENDED (issue #181) — support is still the thing that decides what draws,
// and it is still entirely the server's. What changed is where it arrives: the
// case-file schema in place of the retired comparison schema, and three served
// cohorts in place of the browser-owned five. The docked readout half of this
// story is retired with the lens's own header — the case file's canvas
// discloses per-point support through the chart's accessible label instead,
// which S8 drives.
export const S7 = async (open, browser) => use(open, browser, {}, async (page) => {
  const state = await rendered(page);
  ok(state.schema === 'diagnose-finding-case-file-v1',
    `browser did not consume a server-owned case file: ${state.schema}`);
  const supports = state.cohorts.map((cohort) => cohort.support).sort();
  ok(JSON.stringify(supports) === JSON.stringify(['limited', 'supported', 'withheld']),
    `fixture does not carry changing cohort support: ${supports}`);
  const matched = state.cohorts.find((cohort) => cohort.key === 'matched');
  ok(matched.pointStates.includes('supported') && matched.pointStates.includes('withheld'),
    `the supported cohort has no changing point membership: ${matched.pointStates}`);
  for (const cohort of state.cohorts) {
    if (cohort.support === 'withheld') {
      ok(cohort.series.length === 0,
        `Withheld cohort ${cohort.key} exposed ${cohort.series.join(', ')}`);
    } else {
      ok(cohort.series.some((id) => id.startsWith(`${cohort.key}:line:${cohort.support}`)),
        `${cohort.support} cohort ${cohort.key} drew no aggregate at its own grade`);
    }
  }
  ok(!state.cohorts.some((cohort) => cohort.series.some((id) => /:(?:line|spread):withheld$/.test(id))),
    'a withheld aggregate series was drawn');
  for (const item of state.legend) {
    const cohort = state.cohorts.find((entry) => entry.key === item.cohort);
    ok(item.support === cohort.support,
      `${item.cohort} legend mark does not match served support: ${item.support}`);
    ok(item.detail.startsWith(`${cohort.routed} occurrence`),
      `${item.cohort} legend does not print the served count: ${item.detail}`);
  }
  ok(await page.locator('.echarts-tooltip').count() === 0, 'floating tooltip appeared');
});

// AMENDED (issue #135) — live-judging ruling · 2026-08-28. The global
// comparison canvas remains retired, but its keyboard cursor is un-retired on
// the visible, focusable comparison chart in the spotlight. It is the reader's
// keyboard route into the served cohort evidence.
export const S8 = async (open, browser) => use(open, browser, {}, async (page) => {
  const findingId = page.__comparisonFindingId;
  const chart = page.locator(
    `#tile-focal .evidence-tile[data-chart-id="${findingId}"] #ec-chart`,
  );
  ok(await chart.isVisible(),
    'the successor comparison tile is not visible');
  ok(await chart.getAttribute('tabindex') === '0',
    'the spotlight comparison chart is not keyboard focusable');
  await chart.focus();
  ok(await chart.evaluate((element) => document.activeElement === element),
    'the spotlight comparison chart did not take keyboard focus');

  const caseFile = page.__comparisonServedByFinding.get(findingId);
  const cursorMinute = 15;
  const expected = caseFile.projection.cohorts.map((cohort) => {
    const point = cohort.points.find((row) => row.minute === cursorMinute);
    const unavailable = !point || point.support === 'withheld';
    return {
      name: cohort.name,
      label: unavailable ? 'unavailable' : String(Math.round(point.median)),
      readout: unavailable ? 'unavailable' : `${Math.round(point.median)} · n${point.n}`,
    };
  });
  const restingLabel = await chart.getAttribute('aria-label');
  for (let step = 0; step < 3; step += 1) {
    await chart.press('ArrowRight');
  }
  const cursorLabel = '+0.25 h';
  const readout = page.locator('#canvas-head[data-full] #canvas-fullhead #ec-readout');
  ok(await readout.isVisible(), 'the keyboard cursor did not reveal its on-screen readout');
  const shown = await readout.evaluate((element) => ({
    time: element.querySelector('.rd-time')?.textContent ?? null,
    cohorts: [...element.querySelectorAll('.rd-pair')].map((pair) => ({
      name: pair.querySelector('.k')?.textContent ?? null,
      value: pair.querySelector('.v')?.textContent ?? null,
    })),
  }));
  ok(shown.time === cursorLabel,
    `the keyboard cursor did not move three five-minute points: ${shown.time}`);
  ok(JSON.stringify(shown.cohorts) === JSON.stringify(expected.map((row) => ({
    name: row.name, value: row.readout,
  }))), `the on-screen cursor readout diverged from served cohort evidence: ${JSON.stringify(shown.cohorts)}`);
  const expectedLabel = `${caseFile.finding.title} response comparison. ${cursorLabel}. `
    + `${expected.map((row) => `${row.name} ${row.label}`).join('. ')}.`;
  const inspectedLabel = await chart.getAttribute('aria-label');
  ok(inspectedLabel !== restingLabel && inspectedLabel === expectedLabel,
    `the accessible cursor label diverged from served cohort evidence: ${inspectedLabel}`);
  ok(await page.locator('#ec-chart').evaluateAll((charts) => charts.length > 0
    && charts.every((element) => Boolean(element.closest('.evidence-tile')))),
  'the retired global comparison canvas became user-reachable again outside a tile');
  process.stdout.write(`UNRETIRED S8 — ${SPOTLIGHT_CURSOR_SANCTION}\n`);
});

// LOCK:diagnose-event-comparison:3 LOCK:diagnose-event-comparison:19
// LOCK:diagnose-event-comparison:20
// AMENDED (issue #181) — the five capture states were the standalone route's
// own coordinates. The rendering matrix is now the served case files a reader
// can actually drill.
export const S9 = async (open, browser) => {
  for (const finding of FINDINGS) {
    const statePage = await open(browser, { finding });
    try {
      const state = await rendered(statePage);
      ok(await visibleFindingTile(statePage, finding).isVisible(),
        `${finding} did not keep its comparison tile visible`);
      ok(state.catalogChart.visible && state.catalogChart.ids.length > 0,
        `${finding} mounted no populated dock-mini comparison canvas`);
      ok(await statePage.locator('#tile-focal #ec-chart canvas').count() > 0,
        `${finding} mounted no additional fullscreen comparison canvas`);
    } finally { await statePage.close(); }
  }
  // What remains at narrow width is the canvas alone: no overflow, and the
  // chart still draws.
  await use(open, browser, { viewport: { width: 390, height: 844 } }, async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
    ok(overflow <= 1, `narrow page overflows by ${overflow}px`);
    ok(await page.locator('#tile-field .evidence-tile[data-chart-id^="finding:"]:visible').first().isVisible(),
      'the comparison tile did not remain visible at narrow width');
    ok(await page.locator('#tile-focal #ec-chart canvas').count() > 0,
      'the comparison canvas did not mount at narrow width');
  });
};

// RETIRED (issue #41), re-settled at #181 and #135 — this story's premise was
// that the lens carried a rail of its own beside Glucose's. It carries none,
// and #135 also retired the workstation's global ALIGN host. The successor
// comparison tile publishes event alignment in its served case-file projection
// without exposing a second control.
export const S10 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.ec-coordinates').count() === 0,
    '.ec-coordinates did not retire — the lens rail should be gone entirely');
  ok(await page.locator('#seg-align, #align-canvas').count() === 0,
    'the retired global ALIGN host returned');
  const state = await rendered(page);
  ok(state.alignment === 'event',
    `the comparison tile did not receive its event-aligned case file: ${state.alignment}`);
  ok(await page.locator('#tile-field .evidence-tile[data-chart-id^="finding:"] .tile-modes').count() === 0,
    'the fixed event-comparison tile exposed a redundant alignment control');
});

// LOCK:diagnose-event-comparison:16 LOCK:diagnose-event-comparison:25
// AMENDED (issue #181) — the `occ` coordinate is retired; a reader selects an
// occurrence from the case file's own roster. The claim is unchanged: selecting
// inside a Withheld population draws that exact trace and still refuses to
// build the population an average.
export const S11 = async (open, browser) => use(open, browser, {
  finding: 'finding:missed_meal', selectCohort: 'matched',
}, async (page) => {
  const state = await rendered(page);
  const cohort = state.cohorts.find((entry) => entry.key === 'matched');
  ok(await page.locator('[data-comparison-cohort="matched"][aria-pressed="true"]').count() === 1,
    'the roster selection did not land in the withheld cohort');
  ok(cohort.support === 'withheld', `the selected cohort is not Withheld: ${cohort.support}`);
  ok(cohort.series.length === 0, 'selection promoted a Withheld cohort aggregate');
  const selected = state.spotlight.series.find((series) => series.id === 'selected:trace');
  const marker = state.legend.find((item) => item.cohort === 'matched');
  ok(selected?.data.length > 0,
    `the spotlight drew no selected ECharts trace points: ids=${state.spotlight.ids}; `
      + `selected legend=${JSON.stringify(marker)}`);
  ok(selected.data.length === state.selected.detail.glucose.length,
    `the spotlight drew ${selected.data.length} of ${state.selected.detail.glucose.length} served selected glucose points`);
  const otherLines = state.spotlight.series.filter((series) => /:line:/.test(series.id)
    && !series.id.startsWith('matched:'));
  ok(otherLines.length > 0 && otherLines.every((series) => selected.opacity > series.opacity),
    `the selected trace is not stronger than the other spotlight lines: selected=${selected.opacity}, others=${otherLines.map((series) => series.opacity)}`);
  ok(!state.catalogChart.ids.includes('selected:trace'),
    `the static catalog chart drew a selected trace: ids=${state.catalogChart.ids}`);
  ok(marker?.selected === 'true' && /selected cohort/.test(marker.detail),
    `the additional fullscreen legend did not mark the selected cohort: ${JSON.stringify(marker)}`);
  ok(await page.locator('#tile-focal .evidence-tile[data-chart-id="finding:missed_meal"][data-drilled]').count() === 1,
    'the comparison tile does not identify the selected cohort as its provenance');
});

/* Production regression #689, re-settled at #181: the surface renders the
   support the server published and never re-grades it. The case file now owns
   binning, so the fixture poses the SERVED grade — a matched population the
   server downgraded to a single limited point — and the canvas has to draw
   exactly that and nothing more. Before #181 the browser derived this from the
   occurrences; a surface that still did would resurrect the aggregate the
   server withheld. */
export const S12 = async (open, browser) => {
  const posed = (caseFile, url) => {
    if (url.searchParams.get('alignment') !== 'event') return caseFile;
    const matched = caseFile.projection.cohorts[0];
    matched.support = 'limited';
    matched.usable_count = 2;
    matched.points = matched.points.map((point) => point.minute === 0
      ? { ...point, n: 2, support: 'limited', median: 105, p25: 102.5, p75: 107.5 }
      : { ...point, n: 0, support: 'withheld', median: null, p25: null, p75: null });
    return caseFile;
  };
  await use(open, browser, { caseFile: posed }, async (page) => {
    const state = await rendered(page);
    const line = state.catalogChart.series.find((series) => series.id === 'matched:line:limited');
    const spread = state.catalogChart.series.find((series) => series.id === 'matched:spread:limited');
    const drawn = { ids: state.catalogChart.ids,
      medians: line.data.filter(([, value]) => value != null), spread: spread.data };
    ok(JSON.stringify(drawn.medians) === JSON.stringify([[0, 105]]),
      `the canvas did not draw exactly the served median: ${JSON.stringify(drawn.medians)}`);
    ok(JSON.stringify(drawn.spread) === JSON.stringify([[0, 102.5, 107.5]]),
      `the canvas did not draw exactly the served spread: ${JSON.stringify(drawn.spread)}`);
    ok(!drawn.ids.some((id) => id.startsWith('matched:line:supported')),
      'the canvas restored a Supported aggregate the server downgraded');
    const detail = await page.locator('.ec-key-item[data-cohort="matched"] small').innerText();
    ok(/limited support/.test(detail), `the legend did not print the served grade: ${detail}`);
  });
};

/* S13 · The window the canvas draws is the served one. The case file publishes
   `window_min` for its own anchor; the axis is that window and nothing wider,
   and a population the server withheld draws neither a median nor episodes of
   its own — the case file publishes no episodes for a withheld cohort, so
   "drawn as itself" is the server's decision too. */
export const S13 = async (open, browser) => use(open, browser,
  { finding: 'finding:over_treated_low' }, async (page) => {
    const state = await rendered(page);
    ok(JSON.stringify(state.axis) === JSON.stringify(state.window),
      `the canvas drew a window the case file did not publish: ${state.axis} vs ${state.window}`);
    ok(state.window[0] === -60 && state.window[1] === 120,
      `the low comparison lost its served window: ${state.window}`);
    const withheld = state.cohorts.filter((cohort) => cohort.support === 'withheld');
    ok(withheld.length > 0, 'the fixture holds no withheld population to check');
    for (const cohort of withheld) {
      ok(cohort.episodes === 0 && cohort.series.length === 0,
        `${cohort.key} drew ${cohort.series.length} series for a withheld population`);
      const detail = state.legend.find((item) => item.cohort === cohort.key).detail;
      ok(/unavailable/.test(detail), `${cohort.key} does not say why it draws nothing: ${detail}`);
    }
    ok(await page.locator('#canvas-head').count() === 1,
      'the canvas shell does not own exactly one pane header');
    ok(await page.locator('#tile-focal #ec-canvas-head').count() === 0,
      'the fullscreen comparison drew a second header under the row that names it');
    ok((await page.locator('#canvas-head[data-full] #full-title').textContent() || '').trim().length > 0,
      'the fullscreen row does not name the comparison it is showing');
  });

/* S14 · The workstation's shared fullscreen frame bounds the event plot and
   cohort key at the synthetic wide/short red viewport. */
export const S14 = async (open, browser) => use(open, browser,
  { finding: 'finding:carb_undercount', viewport: { width: 2084, height: 450 } },
  async (page) => {
    const measured = await page.locator('#tile-focal .evidence-tile').evaluate((frameElement) => {
      const frame = frameElement.getBoundingClientRect();
      const plot = frameElement.querySelector('#ec-chart').getBoundingClientRect();
      const canvas = frameElement.querySelector('#ec-chart canvas').getBoundingClientRect();
      const key = frameElement.querySelector('#ec-chart-key').getBoundingClientRect();
      const rect = (box) => ({ left: box.left, top: box.top, right: box.right,
        bottom: box.bottom, width: box.width, height: box.height });
      return { frame: rect(frame), plot: rect(plot), canvas: rect(canvas), key: rect(key),
        pageScroll: [document.documentElement.scrollWidth - document.documentElement.clientWidth,
          document.documentElement.scrollHeight - document.documentElement.clientHeight] };
    });
    const inside = (box) => box.left >= measured.frame.left - 1
      && box.top >= measured.frame.top - 1 && box.right <= measured.frame.right + 1
      && box.bottom <= measured.frame.bottom + 1;
    ok(inside(measured.plot) && inside(measured.canvas) && inside(measured.key),
      `the Carb undercount plot, canvas and key escape the shared frame: ${JSON.stringify(measured)}`);
    ok(measured.plot.bottom <= measured.key.top + 1,
      `the Carb undercount plot overlaps its cohort key: ${JSON.stringify(measured)}`);
    ok(measured.pageScroll.every((overflow) => overflow <= 1),
      `fullscreen introduces page scroll: ${JSON.stringify(measured.pageScroll)}`);
  });

export const STORIES = { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14 };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.env.TARGET;
  if (target !== 'app') fail(`TARGET must be app, got ${target || '(unset)'} — the mock this ledger once ran against is archived (#722); the app is now the sole contract`);
  const open = openApp;
  await access(SYNTHETIC);
  const missing = [];
  if (!process.env.PLAYWRIGHT_MODULE) missing.push('PLAYWRIGHT_MODULE is required');
  try { createBuiltShell(); } catch (error) { missing.push(error.message); }
  if (missing.length) fail(`missing prerequisites:\n  - ${missing.join('\n  - ')}`);
  const only = process.env.ONLY
    ? process.env.ONLY.split(',').map((value) => value.trim()).filter(Boolean)
    : Object.keys(STORIES);
  ok(only.length > 0, 'zero applicable stories');
  const browser = await playwright().chromium.launch({ headless: true });
  let ran = 0;
  try {
    for (const name of only) {
      const story = STORIES[name] || fail(`unknown story ${name}`);
      await story(open, browser);
      ran += 1;
      process.stdout.write(`PASS ${name}\n`);
    }
  } finally {
    await browser.close();
  }
  for (const problem of problems) process.stderr.write(`FAIL ${problem}\n`);
  if (ran !== only.length || problems.length) process.exit(1);
  process.stdout.write(`${ran}/${only.length} stories passed against ${target}\n`);
}
