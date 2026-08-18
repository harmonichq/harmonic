// Executable half of the #677 behaviour ledger (archived; the Verify
// workstation replay is the same pattern).
// Twelve lock stories, run through the app opener — the mock this ledger once
// ran against is archived (#722); the app is the sole contract artifact.
// S6/S7/S11 carry the #694 amendment. S12 (#711) rewrites glucose readings
// after the fixture's server-owned support facts were computed, proving the
// app leg derives support from the occurrences themselves rather than echoing
// a stale capture stamp.
import { createRequire } from 'node:module';
import { access, readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SYNTHETIC = join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json');
const BASE_PAYLOAD = join(ROOT, 'mockups/diagnose-workstation.synthetic/payload.json');
const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml',
};
const VALID_STATES = [
  'dense', 'sparse', 'zero-fired', 'another-factor-visible', 'selected-occurrence',
];

export class ReplayError extends Error {}
const fail = (message) => { throw new ReplayError(message); };
const ok = (condition, message) => { if (!condition) fail(message); };
const settle = (page, ms = 350) => page.waitForTimeout(ms);
const problems = [];
export const openerProblems = () => problems.slice();

function playwright() {
  return require(process.env.PLAYWRIGHT_MODULE
    ?? fail('PLAYWRIGHT_MODULE is required — this replay never skips'));
}
async function vendored(name) {
  const dir = process.env.VENDOR_DIR
    ?? fail('VENDOR_DIR is required (echarts.min.js, vue.esm-browser.js)');
  return readFile(join(dir, name));
}
/* `view: null` opens with no view param at all, which is how a reader reaches
   Diagnose from the tab bar — the case that must land on Glucose. */
const query = ({
  state = 'dense', theme = 'light', view = 'meals', factor, block, another, occ,
}) => {
  const search = new URLSearchParams({ state, theme });
  if (view !== null) search.set('view', view);
  if (factor) search.set('factor', factor);
  if (block) search.set('block', block);
  if (another) search.set('another', String(another));
  if (occ) search.set('occ', occ);
  return `?${search}`;
};
const landsOnGlucose = (options) => options.view === 'glucose' || options.view === null;

export async function openApp(browser, options = {}) {
  const viewport = options.viewport || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const capture = options.invalidComparison ? {} : options.capture ?? JSON.parse(
    await readFile(process.env.CAPTURE || SYNTHETIC, 'utf8'));
  const payload = JSON.parse(await readFile(BASE_PAYLOAD, 'utf8'));
  const stubs = [
    [/^\/diagnose\/event-comparison/, (url) => options.invalidComparison ? {} : projectSyntheticCapture(capture, {
      view: url.searchParams.get('view') || 'meals',
      factor: url.searchParams.get('factor') || undefined,
      block: url.searchParams.get('block') || 'all',
      another: url.searchParams.get('another') === '1',
      occurrenceId: url.searchParams.get('occ') || undefined,
      // A replay fixture is permitted to select the lock's seven required
      // server-stamped populations. This is not a browser request parameter.
      state: options.state || 'dense',
    })],
    [/^\/analyze/, () => payload.analyze],
    /* #735: the app's Diagnose loader now also asks for the server-owned findings
       queue (ADR 730). It is not this surface's subject, but a rejected fetch there
       takes the whole loader into `setError` and this surface never mounts — so it
       is answered from the same fixture-only mirror the workstation gates use. */
    [/^\/diagnose\/findings/, (url) => projectFindings(
      { analysis: payload.analyze, exposures: payload.exposures, scenarios: payload.scenarios },
      url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      })],
    [/^\/scenarios/, () => payload.scenarios],
    [/^\/explore\/time/, () => payload.evidence],
    [/^\/explore\/exposures/, () => payload.exposures],
    [/^\/status/, () => ({ ok: true, last_fetch: payload.analyze.generated_at, counts: {} })],
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
  page.on('pageerror', (error) => problems.push(`pageerror(app): ${error}`));
  await page.addInitScript(([theme]) => {
    localStorage.setItem('ciq_token', 'event-comparison-replay');
    localStorage.setItem('tab', 'diagnose');
    localStorage.setItem('theme', theme);
  }, [options.theme || 'light']);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    if (url.href.includes('echarts')) {
      return route.fulfill({ body: await vendored('echarts.min.js'), contentType: 'text/javascript' });
    }
    if (url.href.includes('vue')) {
      return route.fulfill({ body: await vendored('vue.esm-browser.js'), contentType: 'text/javascript' });
    }
    if (path === '/') {
      return route.fulfill({ body: await readFile(join(ROOT, 'frontend/index.html')), contentType: 'text/html' });
    }
    if (/\.(js|css|svg|html)$/.test(path)) {
      try {
        return route.fulfill({
          body: await readFile(join(ROOT, 'frontend', path.slice(1))),
          contentType: MIME[extname(path)] || 'text/plain',
        });
      } catch { /* named API stubs below */ }
    }
    for (const [pattern, body] of stubs) {
      if (pattern.test(path)) {
        return route.fulfill({ body: JSON.stringify(body(url)), contentType: 'application/json' });
      }
    }
    problems.push(`unstubbed ${route.request().method()} ${path} (app)`);
    return route.fulfill({ status: 404, body: JSON.stringify({ detail: 'not stubbed' }) });
  });
  await page.goto(`http://app.local/${query(options)}`);
  await page.waitForSelector(options.invalidComparison
    ? '.ec-error' : landsOnGlucose(options) ? '[data-event-view="glucose"] .dw' : '.ec-surface',
    { timeout: 15000 });
  await settle(page, 700);
  if (options.invalidComparison) return page;
  return page;
}

async function use(open, browser, options, fn) {
  const page = await open(browser, options);
  try { await fn(page); } finally { await page.close(); }
}

// LOCK:diagnose-event-comparison:1 LOCK:diagnose-event-comparison:2
// LOCK:diagnose-event-comparison:4 LOCK:diagnose-event-comparison:22
export const S1 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.cockpit-topbar').isVisible(), 'shipped cockpit sibling is missing');
  ok(await page.locator('.cockpit-footer').isVisible(), 'shipped footer sibling is missing');
  await page.locator('[data-view="glucose"]').click();
  await page.waitForSelector('.dw:not(.ec-surface)');
  ok(await page.locator('[data-event-view="glucose"], body[data-capture]').count() > 0,
    'Glucose did not become current');
  /* The return path is the rail itself, exercised by clicking it — history
     navigation would pass on a Glucose view that has no View control at all,
     which is exactly how #685 shipped a dead end past this story. */
  ok(await page.locator('.ec-view-seg [data-view="glucose"][aria-pressed="true"]').isVisible(),
    'Glucose does not carry the View rail — Meals and Lows are unreachable');
  ok(await page.locator('.instruments .ec-view-coordinate').count() === 1,
    'the View instrument is not in the workstation rail as one optical row');
  await page.locator('.ec-view-seg [data-view="meals"]').click();
  await page.waitForSelector('.ec-surface');
  /* No view param — how Diagnose is reached from the tab bar — opens Glucose,
     the recommendation surface, not an evidence lens. */
  const bare = await open(browser, { view: null });
  try {
    ok(await bare.locator('.ec-view-seg [data-view="glucose"][aria-pressed="true"]').isVisible(),
      'a bare Diagnose open did not land on Glucose');
  } finally { await bare.close(); }
  const invalid = await open(browser, { invalidComparison: true });
  try {
    ok(await invalid.locator('.ec-error').isVisible(), 'missing comparison did not fail visibly');
    ok(/unavailable|Unexpected token|fetch/i.test(await invalid.locator('.ec-error').innerText()),
      'missing comparison failure did not explain itself');
  } finally { await invalid.close(); }
});

// LOCK:diagnose-event-comparison:3 LOCK:diagnose-event-comparison:8 LOCK:diagnose-event-comparison:21
export const S2 = async (open, browser) => use(open, browser, {}, async (page) => {
  const first = page.locator('.ec-view-seg button').first();
  await first.focus();
  await page.keyboard.press('ArrowLeft');
  ok(await page.locator('.ec-view-seg button').last().evaluate((el) => el === document.activeElement),
    'ArrowLeft did not wrap focus');
  await page.keyboard.press('Home');
  ok(await first.evaluate((el) => el === document.activeElement), 'Home did not focus first view');
  const pressed = await page.locator('.ec-view-seg button[aria-pressed="true"]').innerText();
  ok(/Meals/i.test(pressed), 'focus movement activated another view');
});

// LOCK:diagnose-event-comparison:4 LOCK:diagnose-event-comparison:5
// LOCK:diagnose-event-comparison:9 LOCK:diagnose-event-comparison:14
// LOCK:diagnose-event-comparison:15 LOCK:diagnose-event-comparison:16
export const S3 = async (open, browser) => use(open, browser, {}, async (page) => {
  const identity = await page.evaluate(() => {
    const rendered = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    if (rendered.projection) {
      return rendered.projection.coordinates.anchor.kind === 'completed_carb_bolus'
        && rendered.projection.occurrences.every((occurrence) =>
          occurrence.identity.kind === 'meal'
          && occurrence.anchor.kind === 'completed_carb_bolus');
    }
    return rendered.capture.views.meals.occurrences.every((occurrence) => {
      const anchor = occurrence.anchor_bolus;
      const rows = occurrence.trace.boluses.filter((row) => row.minute === 0
        && row.completion === 'Completed' && row.insulin > 0 && row.carbs >= 10
        && row.seq_num === anchor.seq_num);
      return rows.length === 1;
    });
  });
  ok(identity, 'a comparison Meal is not one atomic completed >=10g bolus');
  const judgmentCopy = `${await page.locator('.ec-key-item[data-cohort="neutral"] strong').innerText()} ${await page.locator('#ec-judgment-summary').innerText()}`;
  ok(!/normal|correct behavior|behaved correctly/i.test(judgmentCopy),
    'no-match copy makes a normal/correct claim');
  const before = await page.locator('#ec-judgment-title').innerText();
  await page.locator('#ec-factor').selectOption('late_bolus');
  await settle(page);
  const after = await page.locator('#ec-judgment-title').innerText();
  ok(before !== after && /Late bolus/i.test(after), 'factor did not re-render the inspector');
  ok(await page.locator('#ec-occ-detail').isHidden(), 'factor change retained an occurrence');
});

// LOCK:diagnose-event-comparison:8 LOCK:diagnose-event-comparison:14
export const S4 = async (open, browser) => use(open, browser, {}, async (page) => {
  const before = await page.locator('#ec-occurrence-count').innerText();
  await page.locator('[data-block="overnight"]').click();
  await settle(page);
  const after = await page.locator('#ec-occurrence-count').innerText();
  ok(before !== after, 'anchor-time block did not re-scope occurrences');
  ok(await page.locator('[data-block="overnight"]').getAttribute('aria-pressed') === 'true',
    'Overnight did not become current');
});

// LOCK:diagnose-event-comparison:9 LOCK:diagnose-event-comparison:10 LOCK:diagnose-event-comparison:11
export const S5 = async (open, browser) => use(open, browser, {}, async (page) => {
  const boundary = await page.locator('.ec-boundary-note').innerText();
  ok(/disclosure only/i.test(boundary) && /never enters Priority, a suggestion, or Plan/i.test(boundary),
    'near-rule disclosure boundary is missing');
  ok(await page.locator('.ec-key-item[data-cohort="another_factor"]').count() === 0,
    'another-factor cohort was visible by default');
  await page.locator('#ec-another').check();
  await settle(page);
  ok(await page.locator('.ec-key-item[data-cohort="another_factor"]').count() === 1,
    'another-factor cohort did not appear');
  ok(Number(await page.locator('#ec-another-count').innerText()) > 0,
    'another-factor exact count is missing');
});

// LOCK:diagnose-event-comparison:16 LOCK:diagnose-event-comparison:17 LOCK:diagnose-event-comparison:18
export const S6 = async (open, browser) => use(open, browser, { view: 'lows' }, async (page) => {
  const option = await page.locator('#ec-occurrence option').nth(1).getAttribute('value');
  await page.locator('#ec-occurrence').selectOption(option);
  await settle(page);
  ok(await page.locator('#ec-occ-detail').isVisible(), 'occurrence detail did not open');
  ok(await page.locator('.ec-key-item[data-cohort="selected"]').count() === 1,
    'selected trace legend is missing');
  const rescue = await page.locator('#ec-rescue').innerText();
  ok(/8 g/.test(rescue) && /6 g/.test(rescue) && /4 g/.test(rescue),
    'finite rescue grams did not reconcile');
  ok(!/manual|rise.prompt|low.prompt|no recorded amount/i.test(rescue),
    'rescue provenance or null amount leaked to the inspector');
  const markers = await page.evaluate(() => {
    const state = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    const series = state.chart.getOption().series.find((item) => item.name === 'Rescue carbs');
    return series?.data || [];
  });
  ok(markers.length === 3 && markers.every((marker) => marker[2] > 0),
    'only finite positive rescue amounts may become markers');
  ok(/date=.*2026-08-01|tab=day/.test(await page.locator('#ec-day-link').getAttribute('href')),
    'dated Day link is missing');
  const emphasis = await page.evaluate(() => {
    const state = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    const lines = state.chart.getOption().series
      .filter((series) => /:line:/.test(series.id || ''));
    const selectedCohort = state.selected?.verdict?.cohort || state.selected?.__cohort;
    const own = lines.filter((series) => series.id.startsWith(`${selectedCohort}:`))
      .map((series) => series.lineStyle?.opacity || 0);
    const other = lines.filter((series) => !series.id.startsWith(`${selectedCohort}:`))
      .map((series) => series.lineStyle?.opacity || 0);
    return { own: Math.max(...own), other: Math.max(...other) };
  });
  ok(emphasis.own > emphasis.other,
    `selected cohort did not remain above other aggregates: ${JSON.stringify(emphasis)}`);
  await page.locator('#ec-clear').click();
  await settle(page);
  ok(await page.locator('#ec-occ-detail').isHidden(), 'Clear trace did not restore aggregates');
});

// LOCK:diagnose-event-comparison:12 LOCK:diagnose-event-comparison:13
// LOCK:diagnose-event-comparison:24 LOCK:diagnose-event-comparison:25
// LOCK:diagnose-event-comparison:21
export const S7 = async (open, browser) => use(open, browser, { another: 1 }, async (page) => {
  const authority = await page.evaluate(() => {
    const state = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    const fired = state.aggregates?.fired || [];
    const ids = state.chart.getOption().series.map((series) => series.id).filter(Boolean);
    const cohorts = state.cohorts || state.support?.cohorts || {};
    return {
      serverOwned: state.projection?.schema === 'diagnose-event-comparison-v2'
        || state.support?.server_owned === true,
      firedStates: [...new Set(fired.map((row) => row.support))].sort(),
      nearState: cohorts.near_rule?.support,
      withheldHasAggregate: ids.some((id) => /^another_factor:/.test(id)),
    };
  });
  ok(authority.serverOwned, 'browser did not consume server-owned support facts');
  ok(JSON.stringify(authority.firedStates) === JSON.stringify(['limited', 'supported', 'withheld']),
    `fixture does not change point membership/support: ${authority.firedStates}`);
  ok(authority.nearState === 'limited', 'dispersed thin cohort is not Limited');
  ok(!authority.withheldHasAggregate, 'Withheld cohort exposed an aggregate series');
  const box = await page.locator('#ec-chart').boundingBox();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .5);
  await settle(page);
  ok(await page.locator('#ec-canvas-head').getAttribute('data-hover') === '1',
    'pointer did not open docked readout');
  ok(/Supported|Limited|Withheld/.test(await page.locator('#ec-readout').innerText()),
    'docked readout did not disclose point support');
  ok(/n\d+/.test(await page.locator('#ec-readout').innerText()),
    'docked readout did not disclose exact point n');
  ok(await page.locator('.echarts-tooltip').count() === 0, 'floating tooltip appeared');
  await page.mouse.move(1, 1);
  await settle(page);
  ok(await page.locator('#ec-canvas-head').getAttribute('data-hover') === '0',
    'leaving chart did not restore title');
});

// LOCK:diagnose-event-comparison:6 LOCK:diagnose-event-comparison:7 LOCK:diagnose-event-comparison:21
export const S8 = async (open, browser) => use(open, browser, {}, async (page) => {
  const chart = page.locator('#ec-chart');
  await chart.focus();
  await page.keyboard.press('End');
  ok(/\+5 h/.test(await page.locator('.ec-rd-time').innerText()), 'End did not inspect +5 h');
  ok(/300 milligrams/.test(await chart.getAttribute('aria-label')) || /\+5 h/.test(await chart.getAttribute('aria-label')),
    'accessible chart label did not follow inspection');
  await page.keyboard.press('Home');
  ok(/−1 h/.test(await page.locator('.ec-rd-time').innerText()), 'Home did not inspect −1 h');
  await page.keyboard.press('Escape');
  ok(await page.locator('#ec-canvas-head').getAttribute('data-hover') === '0',
    'Escape did not clear readout');
});

// LOCK:diagnose-event-comparison:3 LOCK:diagnose-event-comparison:19
// LOCK:diagnose-event-comparison:20
export const S9 = async (open, browser) => {
  for (const stateName of VALID_STATES) {
    for (const theme of ['light', 'dark']) {
      const statePage = await open(browser, { state: stateName, theme,
        view: stateName === 'selected-occurrence' ? 'lows' : 'meals' });
      try {
        ok(await statePage.locator('.ec-surface').isVisible(),
          `${stateName}/${theme} did not render from the shared capture`);
      } finally { await statePage.close(); }
    }
  }
  await use(open, browser, { viewport: { width: 390, height: 844 } }, async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
    ok(overflow <= 1, `narrow page overflows by ${overflow}px`);
    const columns = await page.locator('.ec-coordinates').evaluate((el) =>
      getComputedStyle(el).gridTemplateColumns);
    ok(columns.split(' ').length === 1, `coordinates did not stack: ${columns}`);
    const canvas = await page.locator('.ec-canvas').boundingBox();
    const inspector = await page.locator('.ec-inspector').boundingBox();
    ok(inspector.y >= canvas.y + canvas.height - 1, 'inspector did not stack below canvas');
  });
};

/* Shared chrome must not move when the reader switches views. Every geometry
   here is read from the SHIPPED Glucose view first and every event view is
   compared against it, so Glucose stays ground truth rather than the two
   drifting together. */
// LOCK:diagnose-event-comparison:23
export const S10 = async (open, browser) => {
  const chrome = (page) => page.evaluate(() => {
    const box = (sel) => { const el = document.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect(); return { top: +r.top.toFixed(1), h: +r.height.toFixed(1) }; };
    const rail = document.querySelector('.instruments, .ec-coordinates');
    const rc = getComputedStyle(rail);
    const rr = rail.getBoundingClientRect();
    return {
      railTop: +rr.top.toFixed(1), railH: +rr.height.toFixed(1),
      railGap: rc.gap, railPad: rc.padding,
      cap: box('.instruments .cap, .ec-coordinates .cap'),
      panes: box('.panes'),
      canvasHead: box('.canvas-head'),
      canvasBody: box('.canvas-pane > .body, .ec-canvas > .body'),
      inspectorHead: box('.inspector > header, .ec-inspector > header'),
    };
  });
  for (const width of [1280, 1440]) {
    const viewport = { width, height: 800 };
    const base = await open(browser, { view: 'glucose', viewport });
    let truth;
    try { truth = await chrome(base); } finally { await base.close(); }
    for (const view of ['meals', 'lows']) {
      const page = await open(browser, { view, viewport });
      try {
        const got = await chrome(page);
        for (const key of Object.keys(truth)) {
          ok(JSON.stringify(got[key]) === JSON.stringify(truth[key]),
            `${view} at ${width}: ${key} is ${JSON.stringify(got[key])}, Glucose has ${JSON.stringify(truth[key])}`);
        }
        /* The canvas header reserves its hover readout's height at rest, so
           inspecting the chart never reflows the pane under the pointer. */
        const chart = await page.locator('#ec-chart').boundingBox();
        await page.mouse.move(chart.x + chart.width / 2, chart.y + chart.height / 2);
        await settle(page, 400);
        const hovered = await chrome(page);
        ok(JSON.stringify(hovered.canvasHead) === JSON.stringify(got.canvasHead),
          `${view} at ${width}: hovering the chart resized the canvas header`);
        ok(JSON.stringify(hovered.canvasBody) === JSON.stringify(got.canvasBody),
          `${view} at ${width}: hovering the chart moved the chart body`);
      } finally { await page.close(); }
    }
  }
};

// LOCK:diagnose-event-comparison:16 LOCK:diagnose-event-comparison:25
export const S11 = async (open, browser) => use(open, browser, {
  view: 'meals', state: 'selected-occurrence', another: 1, occ: 'meals-synthetic-18',
}, async (page) => {
  const facts = await page.evaluate(() => {
    const state = window.__diagnoseEventComparison || window.__issue677ReducedBands;
    const ids = state.chart.getOption().series.map((series) => series.id).filter(Boolean);
    const selected = state.selected;
    const cohorts = state.cohorts || state.support?.cohorts || {};
    return {
      selected: selected?.identity?.id || selected?.id,
      support: cohorts.another_factor?.support,
      aggregate: ids.some((id) => /^another_factor:/.test(id)),
      selectedTrace: state.chart.getOption().series.some((series) => series.name === 'Selected occurrence'),
    };
  });
  ok(facts.selected === 'meals-synthetic-18', 'one-event occurrence was not selected');
  ok(facts.support === 'withheld', 'one-event cohort was not Withheld');
  ok(!facts.aggregate, 'selection promoted a Withheld cohort aggregate');
  ok(facts.selectedTrace, 'Withheld cohort lost its exact selected trace');
  ok(await page.locator('.ec-key-item[data-cohort="another_factor"][data-support="withheld"][data-selected-cohort="true"]').count() === 1,
    'legend does not identify the selected Withheld cohort');
});

/* Production regression #689: the public comparison interface must ignore
   malformed glucose values before it bins a cohort. The fixture also proves
   that a jittered second reading from one event does not count twice.
   Only 2 of the 4 rewritten occurrences carry any finite reading at all
   (occurrence-1 and occurrence-4; occurrence-2 is all-null and occurrence-3's
   only reading is a string), so the fired cohort's own usable_count drops to
   2 and reads Limited, not Supported — #711 made the app leg derive support
   from these very occurrences instead of echoing the capture's now-stale
   `visual_support` stamp (computed before the rewrite, over 7 occurrences). */
export const S12 = async (open, browser) => {
  const capture = JSON.parse(await readFile(SYNTHETIC, 'utf8'));
  const occurrences = capture.views.meals.occurrences.slice(0, 4);
  const traces = [
    [{ minute: 0, bg: 100 }, { minute: 1, bg: 140 }, { minute: 5, bg: null }],
    [{ minute: 0, bg: null }, { minute: 5, bg: null }],
    [{ minute: 0, bg: '105' }, { minute: 5, bg: null }],
    [{ minute: 0, bg: 110 }, { minute: 5, bg: 'missing' }],
  ];
  occurrences.forEach((occurrence, index) => { occurrence.trace.cgm = traces[index]; });
  capture.views.meals.occurrences = occurrences;

  await use(open, browser, { capture }, async (page) => {
    const aggregate = await page.evaluate(() => {
      const chart = window.__diagnoseEventComparison.chart.getOption();
      const line = chart.series.find((series) => series.id === 'fired:line:limited');
      const spread = chart.series.find((series) => series.id === 'fired:spread:limited');
      return {
        medians: line.data.filter(([minute]) => minute === 0 || minute === 5),
        spread: spread.data.filter(([minute]) => minute === 0 || minute === 5),
      };
    });
    ok(JSON.stringify(aggregate.medians) === JSON.stringify([[0, 105], [5, null]]),
      `invalid readings or duplicate five-minute readings changed rendered medians: ${JSON.stringify(aggregate.medians)}`);
    ok(JSON.stringify(aggregate.spread) === JSON.stringify([[0, 102.5, 107.5]]),
      `valid rendered percentile band is wrong: ${JSON.stringify(aggregate.spread)}`);
    // The port moved per-point n from the legend to the docked readout; the
    // transferred assertion inspects the meal anchor's bin from the keyboard.
    await page.locator('#ec-chart').focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 12; step += 1) await page.keyboard.press('ArrowRight');
    const readout = await page.locator('#ec-readout .ec-rd-value').first().innerText();
    ok(/n2\b/.test(readout),
      `rendered support does not show the valid-bin count: ${readout}`);
  });
};

export const STORIES = { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12 };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = process.env.TARGET;
  if (target !== 'app') fail(`TARGET must be app, got ${target || '(unset)'} — the mock this ledger once ran against is archived (#722); the app is now the sole contract`);
  const open = openApp;
  await access(SYNTHETIC);
  await vendored('echarts.min.js');
  await vendored('vue.esm-browser.js');
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
