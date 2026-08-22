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
  state = 'dense', theme = 'light', view = 'meals', factor, startMin, endMin, another, occ,
}) => {
  const search = new URLSearchParams();
  if (view !== null) search.set('view', view);
  if (factor) search.set('factor', factor);
  /* #62 — the clock window replaced the six-hour anchor-time block. Both bounds
     travel or neither does; the whole day is the absence of them. */
  if (startMin != null) search.set('start_min', String(startMin));
  if (endMin != null) search.set('end_min', String(endMin));
  if (another) search.set('another', String(another));
  if (occ) search.set('occ', occ);
  return search.toString();
};
const landsOnGlucose = (options) => options.view === null;

export async function openApp(browser, options = {}) {
  const viewport = options.viewport || { width: 1280, height: 720 };
  const page = await browser.newPage({ viewport });
  const capture = options.invalidComparison ? {} : options.capture ?? JSON.parse(
    await readFile(process.env.CAPTURE || SYNTHETIC, 'utf8'));
  const payload = JSON.parse(await readFile(BASE_PAYLOAD, 'utf8'));
  let comparisonRequests = 0;
  const stubs = [
    [/^\/diagnose\/event-comparison/, (url) => options.invalidComparison ? {} : projectSyntheticCapture(capture, {
      view: url.searchParams.get('view') || 'meals',
      factor: url.searchParams.get('factor') || undefined,
      window: url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      },
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
  await page.addInitScript(([theme, diagnoseState]) => {
    localStorage.setItem('ciq_token', 'event-comparison-replay');
    localStorage.setItem('theme', theme);
    window.__harmonicBrowserAdapter = { diagnoseState };
  }, [options.theme || 'light', options.state || 'dense']);
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
    if (path === '/app/diagnose') {
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
    if (path === '/diagnose/event-comparison') {
      comparisonRequests += 1;
      if (comparisonRequests > 1 && options.comparisonDelayAfterFirstMs) {
        await new Promise((resolve) => {
          setTimeout(resolve, options.comparisonDelayAfterFirstMs);
        });
      }
    }
    for (const [pattern, body] of stubs) {
      if (pattern.test(path)) {
        return route.fulfill({ body: JSON.stringify(body(url)), contentType: 'application/json' });
      }
    }
    problems.push(`unstubbed ${route.request().method()} ${path} (app)`);
    return route.fulfill({ status: 404, body: JSON.stringify({ detail: 'not stubbed' }) });
  });
  const search = query(options);
  await page.goto(`http://app.local/app/diagnose${search ? `?${search}` : ''}`);
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

// RETIRED (issue #41) — ADR 31 part 3: View is deleted, its function folded
// into the workstation's own ALIGN instrument (a different surface entirely,
// covered by the workstation's own replay). Sanctioned under P52's
// "ruled-elsewhere" note (#31 resolution §4), same wording:
//   owner ruling, 2026-08-19 (see the behavior ledger) · "Decided in a ruling
//   session on 2026-08-19."
// Failed first against the new build with the OLD assertions: a real 30s
// timeout, `waiting for locator('[data-view="glucose"]')` — that control does
// not exist anywhere any more. What survives is folded in as a loud absence
// check, plus the three assertions that never depended on View: the shipped
// chrome siblings, default routing on a bare open, and the fail-closed path
// on a missing comparison — none of which click anything retired.
export const S1 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.cockpit-topbar').isVisible(), 'shipped cockpit sibling is missing');
  ok(await page.locator('.cockpit-footer').isVisible(), 'shipped footer sibling is missing');
  for (const selector of ['.ec-view-seg', '.ec-view-coordinate', '[data-view]']) {
    ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
  }
  /* No view param — how Diagnose is reached from the tab bar — opens Glucose,
     the recommendation surface, not an evidence lens. Read off the root
     dataset the workstation itself stamps, not a View control. */
  const bare = await open(browser, { view: null });
  try {
    ok((await bare.locator('[data-event-view="glucose"]').count()) > 0,
      'a bare Diagnose open did not land on Glucose');
  } finally { await bare.close(); }
  const invalid = await open(browser, { invalidComparison: true });
  try {
    ok(await invalid.locator('.ec-error').isVisible(), 'missing comparison did not fail visibly');
    ok(/unavailable|Unexpected token|fetch/i.test(await invalid.locator('.ec-error').innerText()),
      'missing comparison failure did not explain itself');
  } finally { await invalid.close(); }
});

// RETIRED (issue #41) — the View rail's own keyboard focus stepping. There is
// no View control left to step through (ADR 31 part 3). Same sanction as S1.
export const S2 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.ec-view-seg').count() === 0, '.ec-view-seg did not retire');
});

// AMENDED (issue #41) — P52 retires the inspector and the Factor select; ADR
// 31 part 3 retires View. What this story checked THROUGH those controls —
// meal identity, and the no-match copy's tone — is still true and still
// checkable on the surviving canvas + legend, reached by URL coordinates
// (P53 keeps the read path) instead of a click. The factor re-render and
// occurrence-retention assertions, which lived entirely in the retired
// inspector, do not survive.
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
  const judgmentCopy = await page.locator('.ec-key-item[data-cohort="neutral"] strong').innerText();
  ok(!/normal|correct behavior|behaved correctly/i.test(judgmentCopy),
    'no-match copy makes a normal/correct claim');
  const before = await page.locator('.ec-title-context').innerText();
  const late = await open(browser, { factor: 'late_bolus' });
  try {
    const after = await late.locator('.ec-title-context').innerText();
    ok(before !== after && /Late bolus/i.test(after), 'factor coordinate did not re-render the canvas');
  } finally { await late.close(); }
});

// RETIRED (issue #41) — the anchor-time Block seg. P52 retires it with the
// rest of the lens's own instrument row. The coordinate it addressed retired
// too (issue #62): the clock window replaced it, and S13 below exercises the
// re-scoping behaviour itself through the SAME URL read path S3 uses. Same
// sanction as S1.
export const S4 = async (open, browser) => use(open, browser, {}, async (page) => {
  ok(await page.locator('.ec-block-seg').count() === 0, '.ec-block-seg did not retire');
});

// RETIRED (issue #41) — the near-rule disclosure sentence and the Other
// factors checkbox both lived in the retired inspector (P52); the sentence
// has no surviving home, and `another` is reachable only by URL now. Same
// sanction as S1.
export const S5 = async (open, browser) => use(open, browser, {}, async (page) => {
  for (const selector of ['.ec-boundary-note', '#ec-another']) {
    ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
  }
  // the coordinate still routes by URL (P53) — the cohort itself still shows
  const withAnother = await open(browser, { another: 1 });
  try {
    ok(await withAnother.locator('.ec-key-item[data-cohort="another_factor"]').count() === 1,
      'another-factor cohort did not appear via the URL coordinate');
  } finally { await withAnother.close(); }
});

// RETIRED (issue #41) — the occurrence select, the rescue sentence, the Day
// link and Clear trace all lived in the retired inspector (P52); there is no
// surviving affordance to reach an occurrence, read its rescue carbs, or
// clear one. What is canvas-level (the selected-cohort legend item, the
// selected trace's chart emphasis) is exercised through the URL `occ`
// coordinate by S11, which never depended on any of these controls. Same
// sanction as S1.
export const S6 = async (open, browser) => use(open, browser, { view: 'lows' }, async (page) => {
  for (const selector of ['#ec-occurrence', '#ec-occ-detail', '#ec-rescue', '#ec-day-link', '#ec-clear']) {
    ok(await page.locator(selector).count() === 0, `${selector} did not retire`);
  }
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
      serverOwned: state.projection?.schema === 'diagnose-event-comparison-v3'
        || state.support?.server_owned === true,
      firedStates: [...new Set(fired.map((row) => row.support))].sort(),
      nearState: cohorts.near_rule?.support,
      withheldHasAggregate: ids.some((id) => /^another_factor:(?:line|spread):/.test(id)),
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
  // AMENDED (issue #41) — the coordinate row and the inspector this story
  // checked the narrow-width stacking of are retired (P52; ADR 31 part 3
  // moves View into the workstation's own ALIGN instrument). What remains at
  // narrow width is the canvas alone: no overflow, and the one pane fills the
  // viewport rather than stacking against a sibling that no longer exists.
  await use(open, browser, { viewport: { width: 390, height: 844 } }, async (page) => {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth
      - document.documentElement.clientWidth);
    ok(overflow <= 1, `narrow page overflows by ${overflow}px`);
    const width = await page.locator('.ec-panes').evaluate((el) => el.getBoundingClientRect().width);
    const canvasWidth = await page.locator('.ec-canvas').evaluate((el) => el.getBoundingClientRect().width);
    ok(Math.abs(width - canvasWidth) < 2, `the single pane did not take the full column: ${width} vs ${canvasWidth}`);
    ok(await page.locator('#ec-chart').isVisible(), 'the canvas did not render at narrow width');
  });
};

// RETIRED (issue #41) — this story's whole premise was that Meals/Lows shared
// one optical rail row with Glucose (the View instrument, one-row-for-all
// under #677 re-settle term 3). P52 makes the lens canvas-only: the
// `?view=meals`/`lows` route now renders no rail at all — no `.instruments`,
// no `.ec-coordinates` — so there is no rail left to compare against
// Glucose's. That is the intended shape of "the lens becomes canvas-only",
// not a regression this story should keep failing on. What the story's
// hover-stability half checked (the canvas header does not reflow on hover)
// is still true and is exercised on the surviving canvas by S7. Sanctioned
// under P52's "ruled-elsewhere" note (#31 resolution §4), same wording as S1.
export const S10 = async (open, browser) => use(open, browser, { view: 'meals' }, async (page) => {
  for (const selector of ['.instruments', '.ec-coordinates']) {
    ok(await page.locator(selector).count() === 0,
      `${selector} did not retire — the lens rail should be gone entirely`);
  }
});

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
      aggregate: ids.some((id) => /^another_factor:(?:line|spread):/.test(id)),
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

/** The meal bolused at 13:00 whose high landed at 14:35 — trigger outside the
    window, consequence inside it. The workstation replay's S37 shows the same
    episode reaching both panes. */
const EARLY_TRIGGER = { ep_id: '2020-03-03-ep71', t: '2020-03-03 13:00:00' };

/* S13 · The clock window is the lens's only time coordinate (issue #62), it is
   outcome-anchored, and a cohort too thin for an aggregate draws its own
   episodes. 14:00-16:00 holds three total meal occurrences in this capture;
   another_factor still holds exactly the one bolused at 13:00 whose high landed
   at 14:35, an hour outside the window it belongs to. That one cohort occurrence
   never becomes a median, so it is drawn as itself. */
export const S13 = async (open, browser) => use(open, browser, {
  factor: 'late_bolus', startMin: 840, endMin: 960, another: 1,
}, async (page) => {
  const drawn = await page.evaluate(() => {
    const exposed = window.__diagnoseEventComparison;
    const cohort = exposed.projection.cohorts.find((c) => c.key === 'another_factor');
    const ids = exposed.chart.getOption().series.map((series) => series.id).filter(Boolean);
    return {
      window: exposed.projection.coordinates.window,
      denominator: exposed.projection.population.denominator,
      support: cohort.support,
      episodes: (cohort.episodes || []).map((e) => `${e.identity.ep_id}@${e.identity.t}`),
      episodeSeries: ids.filter((id) => /^another_factor:episode:/.test(id)).length,
      aggregateSeries: ids.filter((id) => /^another_factor:(?:line|spread):/.test(id)).length,
      caption: document.querySelector('.ec-window-context')?.textContent.trim() ?? null,
    };
  });
  ok(drawn.window.scoped === true, 'the projection did not answer for a scoped clock window');
  ok(drawn.window.label === '14:00\u201316:00',
    `the canvas does not name the window it counted in: ${drawn.window.label}`);
  ok(drawn.denominator === 3, `the window should hold exactly three total occurrences, got ${drawn.denominator}`);
  ok(drawn.support === 'withheld', `one occurrence must be withheld from an aggregate, got ${drawn.support}`);
  ok(drawn.episodes.length === 1 && drawn.episodes[0] === `${EARLY_TRIGGER.ep_id}@${EARLY_TRIGGER.t}`,
    `the drawn episode is not the one whose consequence landed in the window: ${JSON.stringify(drawn.episodes)}`);
  ok(drawn.episodeSeries === 1, 'the thin cohort did not draw its own episode');
  ok(drawn.aggregateSeries === 0, 'a median was built from one occurrence');
  ok(await page.locator('#ec-canvas-head').count() === 1, 'the standalone lens does not own exactly one header');
  ok(drawn.caption == null, "S13 RETIRED 2026-08-20 Connor Griffin: Drop all that shit. It's a chart.");
});

/** R04 · Browser traversal re-resolves the complete direct-comparison route.
    A slower response from an older restoration cannot repaint the newer Plan
    route after Forward wins. */
// STORY:finding-evidence-routing:R04
export const R04 = async (open, browser) => use(open, browser, {
  view: 'lows', factor: 'over_treated_low', startMin: 0, endMin: 360,
  comparisonDelayAfterFirstMs: 900,
}, async (page) => {
  const diagnoseUrl = page.url();
  const before = await page.locator('.ec-title-context').innerText();
  ok(/Over-treated low/i.test(before), `R04 initial evidence is wrong: ${before}`);

  await page.locator('.cockpit-topbar [data-shell-tab="plan"]').click();
  await page.waitForFunction(() => location.pathname === '/app/plan');
  const planUrl = new URL(page.url());
  ok(planUrl.search === '', 'R04 page exit retained Diagnose keys');

  await page.goBack();
  await page.waitForFunction(() => location.pathname === '/app/diagnose');
  await page.goForward();
  await page.waitForFunction(() => location.pathname === '/app/plan');
  await settle(page, 1200);
  ok(new URL(page.url()).pathname === '/app/plan',
    'R04 older projection changed the winning address');
  ok(await page.locator('.ec-surface:visible').count() === 0,
    'R04 older projection repainted after Forward selected Plan');

  await page.goBack();
  await page.waitForFunction((address) => location.href === address, diagnoseUrl);
  await page.waitForSelector('.ec-surface:visible');
  await page.waitForFunction((label) => (
    document.querySelector('.ec-title-context')?.textContent.trim() === label.trim()
  ), before);
  const restored = new URL(page.url());
  ok(restored.searchParams.get('factor') === 'over_treated_low'
      && restored.searchParams.get('start_min') === '0'
      && restored.searchParams.get('end_min') === '360',
  'R04 Back did not restore the same evidence coordinates');
});

export const STORIES = {
  S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, R04,
};

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
