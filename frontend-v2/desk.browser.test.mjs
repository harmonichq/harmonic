// #389 chunk 1 — the v2 desk's own browser gate: the chrome that must not move,
// the three destinations, the Day desk, every utility, the layered Escape and the
// teardown. It is the first suite under this source root, and its CI matrix step
// is the one chunks 2, 3 and 4 extend with their own.
//
// It runs against the BUILT desk served from disk, with the API answered from
// the manufactured payloads below — there is no Python in a browser gate. Those
// payloads are hand-written synthetic shapes in this driver, not committed
// fixtures: they carry no record of anyone, and the behaviours asserted here are
// structural. The states that need a real analyzer or a real Store live in the
// behaviour replay against the no-fetch server instead.
//
// FAILS CLOSED (#672). A missing driver, Chromium or build exits nonzero and
// names what is absent; it never skips, because a green step that ran zero
// browser assertions proves nothing.
import test, { after } from 'node:test';
import { boundedWait } from './c2.replay.mjs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { populateFindingsProjectionInput, populateFindingCasePreparation } from '../frontend/browser-fixture-population.js';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const require = createRequire(import.meta.url);
const { createBuiltShell } = require('../frontend/built-shell.js');

const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) {
  missing.push('PLAYWRIGHT_MODULE is unset (point it at an installed playwright module, '
    + 'e.g. PLAYWRIGHT_MODULE=$PW/node_modules/playwright)');
} else {
  try {
    chromium = require(process.env.PLAYWRIGHT_MODULE).chromium;
  } catch (error) {
    missing.push(`PLAYWRIGHT_MODULE=${process.env.PLAYWRIGHT_MODULE} could not be required (${error.message})`);
  }
}
if (chromium && !process.env.PLAYWRIGHT_EXECUTABLE_PATH && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium executable is missing (${chromium.executablePath()} does not exist — `
    + 'run playwright install chromium)');
}
let shell;
try { shell = createBuiltShell(); } catch (error) { missing.push(error.message); }
if (missing.length) {
  throw new Error(`frontend-v2/desk.browser.test.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
}
const { createBrowserRunner } = require('../frontend/browser-runner.js');

/* ------------------------------------------------------ manufactured reads */

const DAY = '2024-06-26';
const GAP_DAY = '2024-06-25';
const navDay = (iso, has_data, extra = {}) => ({
  iso, has_data, lows: 0, highs: 0, tir: has_data ? 88 : 0,
  curve: has_data ? [{ x: 0.25, bg: 120 }, { x: 0.5, bg: 96 }, { x: 0.75, bg: 140 }] : [],
  ...extra,
});
// The navigator answers the month it was asked for, one recorded day apiece
// except the one gap the ribbon needs to have something disabled.
const daysFor = (month) => {
  const [year, index] = month.split('-').map(Number);
  const length = new Date(year, index, 0).getDate();
  return Array.from({ length }, (_, i) => {
    const iso = `${month}-${String(i + 1).padStart(2, '0')}`;
    return navDay(iso, iso !== GAP_DAY);
  });
};
// The per-day reads answer the date they were ASKED for. The desk arrives on
// the store's own latest recorded day and the ribbon moves between them, so a
// stub pinned to one written-down date answers the wrong question the moment
// the reader steps a day.
const nextDay = (iso) => {
  const day = new Date(`${iso}T00:00:00`);
  day.setDate(day.getDate() + 1);
  return day.toISOString().slice(0, 10);
};
const cgmFor = (iso) => Array.from({ length: 12 }, (_, i) => ({
  t: `${iso} ${String(i * 2).padStart(2, '0')}:00:00`, bg: i === 7 ? 210 : 118,
}));
const timelineFor = (iso) => ({
  start: `${iso} 00:00:00`, end: `${nextDay(iso)} 00:00:00`,
  cgm: cgmFor(iso),
  boluses: [{ t: `${iso} 08:00:00`, insulin: 4.8, carbs: 48, bg: null, extended: false }],
  basal: [{ t: `${iso} 00:00:00`, delivery_type: 'profileDelivery', duration_mins: 5, basal_rate: 0.6, profile_basal_rate: 0.6 }],
  pump_events: [], sleep_windows: [], rest_windows: [], carb_exclusion_spans: [], false_low_exclusion_spans: [],
});
const modelViewFor = (iso) => ({
  date: iso, midnight: `${iso} 00:00:00`, isf: 40,
  chart_start: `${iso} 00:00:00`, chart_end: `${nextDay(iso)} 00:00:00`,
  window: {
    start: `${iso} 00:00:00`, end: `${nextDay(iso)} 00:00:00`,
    cgm: cgmFor(iso), carb_exclusion_spans: [], false_low_exclusion_spans: [],
  },
  episodes: [{
    id: `${iso}-ep1`, start: `${iso} 14:00:00`, end: `${iso} 17:00:00`,
    lever: 'late_bolus', trigger: '', trigger_t: `${iso} 14:00:00`, worst_bg: 210, spans_midnight: false, steps: [],
    anchors: [{
      t: `${iso} 14:00:00`, kind: 'meal', label: 'Meal bolus', bg: 210, insulin: 4.8, carbs: 48, state: 'fired',
      verdicts: [{ classifier: 'late_bolus', matched: true, detail: 'the dose trailed the rise', evidence_tier: 'observed', silence_reason: null }],
    }],
  }],
});
const PROMPT = {
  detector: 'low', anchor_t: `${DAY} 13:55:00`, key_bg: 48,
  question: 'Did you treat this low?', context: 'Glucose dropped to 48 mg/dL.', age_days: 4,
  cgm: cgmFor(DAY),
};
const CATALOG = {
  engine: { name: 'Scenario engine', tagline: 'A local, advisory read.', is: ['One cause at a time.'], wont: ['Drive your pump.'] },
  pipeline: { chain: [{ step: 'Read', one_liner: 'It reads the feed.', body: 'body' }], suppression_truths: [{ title: 'Silence', body: 'body' }] },
  worked: { intro: 'intro', episode: { title: 'One meal', when: 'Jun 26', peak: '210', peak_state: 'high' }, steps: [], patterns: [] },
  tiers: [{ value: 'observed', label: 'Observed', body: 'seen in the data' }],
  silence_reasons: [{ tier: 'observed', label: 'No trigger', body: 'nothing to judge' }],
  levers: [],
};
const PUMP = {
  configured: true, fetched_at: '2024-06-16T00:00:00', active_idp: 1, other_profile_count: 0,
  profile: { idp: 1, name: 'Synthetic profile', dia_hours: 3, max_bolus: 10, carb_entry: true,
    segments: [{ start_min: 0, basal_rate: 0.6, isf: 40, carb_ratio: 10, target_bg: 110 }] },
};
const STATUS = {
  last_attempt_at: null, last_success_at: null, last_error: null, last_written: null,
  earliest_data_day: '2024-06-01', latest_data_day: '2024-06-30',
};

const generated = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const evidence = generated('../mockups/diagnose-workstation.synthetic/payload.json');
const caseFiles = generated('../mockups/diagnose-workstation.synthetic/finding-case-files.json');
const patternCapture = generated('../mockups/diagnose-event-comparison.synthetic/capture.json');
const basalEvidence = generated('../frontend/__fixtures__/basal-night-evidence.json').expected;
const isfEvidence = generated('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
const icEvidence = generated('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json').cases.cross_midnight;
// The generated roster has no Focus and withholds pin admission. Keep those
// served facts; the quiet guidance stub offers no pinnable Pattern either.
const followUp = generated('../mockups/verify-660-story.synthetic/payload.json').roster;
const fixtureInputs = populateFindingsProjectionInput({ analysis: evidence.analyze,
  scenarios: evidence.scenarios, exposures: evidence.exposures });
const preparations = new Map();
function prepare(url) {
  const start = url.searchParams.get('start_min');
  const window = start === null ? null : { start_min: Number(start), end_min: Number(url.searchParams.get('end_min')) };
  const source = window ? caseFiles.scoped[`${window.start_min}-${window.end_min}`]?.preparation : caseFiles.preparation;
  assert.ok(source, `the generated fixture does not cover requested scope ${JSON.stringify(window)}`);
  const body = populateFindingCasePreparation(structuredClone(source), projectFindings(fixtureInputs, window));
  preparations.set(body.projection_id, body);
  return body;
}
function caseFile(url) {
  const id = url.searchParams.get('finding_id');
  const alignment = url.searchParams.get('alignment');
  const occ = url.searchParams.get('occ');
  const preparation = preparations.get(url.searchParams.get('projection_id'));
  assert.ok(preparation, 'case request must quote a served preparation');
  const patternChart = preparation.rendered_rows.find(row => row.id === id)?.pattern_chart;
  if (patternChart) return projectPatternCaseFile(patternCapture, { patternChart,
    projectionId: preparation.projection_id, alignment, occurrenceId: occ });
  const finding = caseFiles.cases[id];
  assert.ok(finding, `missing generated case ${id}`);
  const body = structuredClone(occ ? finding[`selected_${alignment}`][occ] || finding[`unavailable_${alignment}`] : finding[alignment]);
  body.projection_id = preparation.projection_id;
  body.window = structuredClone(preparation.coordinates.window);
  return body;
}

const JSON_STUBS = [
  [/^\/api\/analyze$/, () => evidence.analyze],
  [/^\/api\/scenarios$/, () => evidence.scenarios],
  [/^\/api\/explore\/time-of-day$/, () => evidence.evidence],
  [/^\/api\/explore\/exposures$/, () => evidence.exposures],
  [/^\/api\/outcomes\/trend$/, () => ({ points: [] })],
  [/^\/api\/diagnose\/finding-case-file-preparation$/, prepare],
  [/^\/api\/diagnose\/finding-case-file$/, caseFile],
  [/^\/api\/diagnose\/basal-night-evidence$/, () => basalEvidence],
  [/^\/api\/diagnose\/isf-rest-window-evidence$/, () => isfEvidence],
  [/^\/api\/diagnose\/carb-ratio-block-evidence$/, () => icEvidence],
  [/^\/api\/guidance$/, () => ({ disposition: 'quiet', selected: null, candidates: [], input_revision: followUp.input_revision })],
  [/^\/api\/focus$/, () => ({ focuses: followUp.focuses, pinnable: [], pinnable_patterns: [],
    input_revision: followUp.input_revision, admission: followUp.admission })],
  [/^\/api\/plan\/history$/, () => ({ history: [] })],
  [/^\/api\/plan$/, () => ({ items: [], updated_at: null })],
  [/^\/api\/status/, () => STATUS],
  [/^\/api\/day-navigator/, (url) => {
    const month = url.searchParams.get('month') || '2024-06';
    return { month, days: daysFor(month) };
  }],
  [/^\/api\/timeline/, (url) => timelineFor(String(url.searchParams.get('start')).slice(0, 10))],
  [/^\/api\/model-view/, (url) => modelViewFor(url.searchParams.get('date'))],
  [/^\/api\/carbs/, () => ({ carb_entries: [] })],
  [/^\/api\/prompts/, () => [PROMPT]],
  [/^\/api\/catalog/, () => CATALOG],
  [/^\/api\/credentials/, () => ({ configured: false, email: null, region: null })],
  [/^\/api\/pump-settings/, () => PUMP],
];

const BASE = 'http://desk.local';
const VIEWPORTS = { '1280x720': { width: 1280, height: 720 }, '1440x900': { width: 1440, height: 900 } };

const runner = createBrowserRunner(() => chromium.launch());
after(() => runner.close());

/** The built desk, served from disk with its API answered above. */
async function openDesk({ viewport = '1280x720', address = '/v2/', beforeNavigate } = {}) {
  const browser = await runner.browser();
  const context = await browser.newContext({ viewport: VIEWPORTS[viewport], colorScheme: 'dark' });
  const page = await context.newPage();
  const unstubbed = [];
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const served = shell.serve(url.pathname);
    if (served) return route.fulfill(served);
    if (url.pathname.startsWith('/api/kb/')) {
      return route.fulfill({ contentType: 'text/markdown', body: '# Reading Day\n\nThe **Day** tab is the forensic replay.\n' });
    }
    for (const [pattern, body] of JSON_STUBS) {
      if (pattern.test(url.pathname)) {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body(url)) });
      }
    }
    unstubbed.push(url.pathname);
    return route.fulfill({ status: 404, contentType: 'application/json', body: '{"detail":"not stubbed"}' });
  });
  if (beforeNavigate) await beforeNavigate(page);
  await page.goto(`${BASE}${address}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.gf .pane', { timeout: 20000 });
  return {
    page,
    close: async () => {
      assert.deepEqual(unstubbed, [], 'the desk requested an endpoint this gate does not stub');
      assert.deepEqual(problems, [], 'the desk raised page errors');
      await context.close();
    },
  };
}

const box = (page, selector) => page.evaluate((s) => {
  const element = document.querySelector(s);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}, selector);

const activeElement = (page) => page.evaluate(() => {
  const element = document.activeElement;
  return element ? { tag: element.tagName, className: String(element.className || ''), data: { ...element.dataset } } : null;
});

const countOf = (page, selector) => page.evaluate((s) => document.querySelectorAll(s).length, selector);

const currentDestination = (page) => page.evaluate(() =>
  document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination ?? null);

/** The first VISIBLE match: the footer's launchers are the desktop affordance,
    and the in-surface strip is narrow-only. */
async function press(page, selector) {
  const all = page.locator(selector);
  const total = await all.count();
  assert.ok(total > 0, `no control matched ${selector}`);
  for (let i = 0; i < total; i += 1) {
    const candidate = all.nth(i);
    if (await candidate.isVisible()) {
      await candidate.click();
      await page.waitForTimeout(180);
      return;
    }
  }
  assert.fail(`${selector} matched ${total} element(s), all hidden`);
}

/* ------------------------------------------------------------------ tests */

test('the desk opens on Diagnose behind its persistent chrome', async () => {
  const { page, close } = await openDesk();
  try {
    const order = await page.evaluate(() => [...document.querySelectorAll('nav.v2-nav [data-destination]')]
      .map((button) => button.dataset.destination));
    assert.deepEqual(order, ['diagnose', 'changes', 'day']);
    assert.equal(await currentDestination(page), 'diagnose');
    assert.equal(await countOf(page, '[data-destination][aria-current="page"]'), 1);
    const chrome = await page.evaluate(() => ({
      identity: document.querySelector('.cockpit-identity')?.textContent.replace(/\s+/g, ' ').trim(),
      carbs: document.querySelector('.cockpit-log-carbs')?.textContent.replace(/\s+/g, ' ').trim(),
      advisory: document.querySelector('.cockpit-advisory')?.textContent.trim(),
      utilities: [...document.querySelectorAll('nav.cockpit-utilities button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()),
    }));
    assert.match(chrome.identity, /Harmonic advisory/);
    assert.ok(chrome.carbs.includes('＋'), 'Log carbs lost its fullwidth plus');
    assert.equal(chrome.advisory, 'Advisory only — review with your clinician before changing pump settings.');
    for (const label of ['Carb questions', 'Guide', 'Settings', 'Glossary']) {
      assert.ok(chrome.utilities.some((text) => text.includes(label)), `the footer lost ${label}`);
    }
    // The prototype's instrumentation never reached production (HV2-34).
    assert.equal(await countOf(page, '.mockbar, .gf-review-notes, [aria-label="Prototype scenario"]'), 0);
    // Nor did a theme control (HV2-07).
    assert.equal(await countOf(page, '[data-theme], .theme-toggle'), 0);
    // HV2-08: Inter is the single UI family, and the built surface RENDERS with
    // it — the font ships in the tree, because HV2-01 forbids reaching a CDN
    // for it. Declaring the family and falling back to the platform is not this.
    const inter = await page.evaluate(async () => {
      await document.fonts.ready;
      const faces = [...document.fonts].filter((face) => face.family.replace(/["']/g, '') === 'Inter');
      return {
        declared: faces.length,
        loaded: faces.filter((face) => face.status === 'loaded').length,
        available: document.fonts.check('700 18px Inter'),
      };
    });
    assert.ok(inter.declared > 0, 'the built surface declares no Inter face');
    assert.ok(inter.available, 'Inter is named but not available to render with');
    assert.ok(inter.loaded > 0, `no Inter face loaded (${inter.declared} declared)`);
  } finally { await close(); }
});

test('a failed Focus read keeps a short visible Retry beside its explanation at compact width', async () => {
  const desk = await openDesk({ beforeNavigate: async page => {
    // A malformed reply rejects the real shared client without adding a browser
    // console error that would conceal the Diagnose surface's own failure UI.
    await page.route('**/api/focus', route => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{' }));
  } });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    await page.locator('#filter-trigger').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id^="pattern:"]').first().click();
    const status = page.locator('[data-focus-context]');
    const retry = page.locator('[data-focus-retry]');
    await Promise.all([status.waitFor({ state: 'visible' }), retry.waitFor({ state: 'visible' })]);
    assert.equal((await status.innerText()).trim(), 'Focus status unavailable');
    assert.equal((await retry.innerText()).trim(), 'Retry');
    const boxes = await page.evaluate(() => {
      const box = selector => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect && { left: rect.left, right: rect.right, width: rect.width }; };
      const status = document.querySelector('[data-focus-context]');
      return { crumb: box('.inspector .crumb'), status: box('[data-focus-context]'), retry: box('[data-focus-retry]'),
        statusClipped: status.scrollWidth > status.clientWidth };
    });
    assert.ok(boxes.status.width > 0 && boxes.retry.width > 0, `Focus recovery controls must render: ${JSON.stringify(boxes)}`);
    assert.ok(boxes.retry.right <= boxes.crumb.right + 0.5, `Retry must remain within the Findings header: ${JSON.stringify(boxes)}`);
    assert.equal(boxes.statusClipped, false, `Focus explanation must remain readable: ${JSON.stringify(boxes)}`);
  } finally { await desk.close(); }
});

test('a pending Plan keeps its reason and a compact View Plan route visible at 1280px', async () => {
  const desk = await openDesk({ beforeNavigate: async page => {
    // This is a renderer boundary: the API-shaped admission owns both the
    // withholding decision and its reason. The desk only presents the existing
    // Changes route; it does not manufacture a Plan or calculate eligibility.
    await page.route('**/api/guidance', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      disposition: 'pending_plan', selected: null, input_revision: followUp.input_revision,
      candidates: [{ subject: 'pattern:over-treated-low', kind: 'pattern', title: 'Over-treated low',
        collapse: 'remain_pattern', members: [{ subject: 'habit:over_treated_low' }] }],
    }) }));
    await page.route('**/api/focus', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      focuses: followUp.focuses, pinnable: [], pinnable_patterns: [], input_revision: followUp.input_revision,
      admission: { focus_pin: { available: false, reason: 'pending_plan' } },
    }) }));
  } });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id="finding:over_treated_low"]').click();
    const action = page.locator('[data-focus-context]');
    await action.waitFor({ state: 'visible' });
    assert.equal((await action.innerText()).trim(), 'View Plan');
    assert.equal(await action.getAttribute('title'),
      'A Plan is awaiting confirmation, so Harmonic is not offering a Focus from this read.');
    assert.equal(await action.evaluate(node => node.scrollWidth > node.clientWidth), false,
      'the compact Plan action must be fully readable in the Findings header');
    await action.click();
    await page.waitForFunction(() => document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination === 'changes');
    assert.equal(new URL(page.url()).pathname, '/v2/changes');
  } finally { await desk.close(); }
});

test('the chrome holds still across every destination, and one is current at a time', async () => {
  const { page, close } = await openDesk();
  try {
    const reference = { top: await box(page, 'header.cockpit-topbar'), foot: await box(page, 'footer.cockpit-footer') };
    for (const destination of ['changes', 'day', 'diagnose']) {
      await press(page, `[data-destination="${destination}"]`);
      assert.equal(await currentDestination(page), destination);
      assert.equal(await countOf(page, '[data-destination][aria-current="page"]'), 1);
      assert.deepEqual(await box(page, 'header.cockpit-topbar'), reference.top, `${destination} moved the topbar`);
      assert.deepEqual(await box(page, 'footer.cockpit-footer'), reference.foot, `${destination} moved the footer`);
    }
  } finally { await close(); }
});

for (const [viewport, rows] of [['1280x720', [38, 24]], ['1440x900', [42, 26]]]) {
  test(`the shell rows and scroll containment hold at ${viewport}`, async () => {
    const { page, close } = await openDesk({ viewport });
    try {
      const declared = await page.evaluate(() => getComputedStyle(document.querySelector('.cockpit-shell')).gridTemplateRows);
      const parts = declared.split(/\s+/);
      assert.equal(Math.round(parseFloat(parts[0])), rows[0], declared);
      assert.equal(Math.round(parseFloat(parts[parts.length - 1])), rows[1], declared);
      const root = await page.evaluate(() => {
        const element = document.scrollingElement || document.documentElement;
        return { v: element.scrollHeight - element.clientHeight, h: element.scrollWidth - element.clientWidth };
      });
      assert.ok(root.v <= 1 && root.h <= 1, `the document scrolls at the root: ${JSON.stringify(root)}`);
    } finally { await close(); }
  });
}

test('Day owns its chronology, its week ribbon, its month and the Episode Log', async () => {
  const { page, close } = await openDesk({ address: '/v2/?to=day' });
  try {
    assert.equal(await countOf(page, '.gf-stage-day'), 1);
    assert.equal(await countOf(page, '.gf-reading'), 1, 'Day is a paired state');
    assert.equal(Math.round((await box(page, '.gf-desk > .gf-reading')).w), 430,
      'Day uses the same reference rail as Diagnose and Changes');
    // Direct entry invents no prior subject and offers no return.
    assert.equal(await countOf(page, '[data-day="return"]'), 0);

    const columns = await page.evaluate(() => [...document.querySelectorAll('.gf-nav-col[data-pick]')]
      .map((button) => ({ iso: button.dataset.pick, disabled: button.disabled, label: button.getAttribute('aria-label') })));
    assert.equal(columns.length, 7);
    for (const column of columns) assert.ok(column.label, `${column.iso} has no accessible label`);
    assert.ok(columns.some((column) => column.disabled), 'no unrecorded day is disabled');
    const recorded = columns.find((column) => !column.disabled);
    await press(page, `.gf-nav-col[data-pick="${recorded.iso}"]`);
    assert.equal(await page.getAttribute(`.gf-nav-col[data-pick="${recorded.iso}"]`, 'aria-pressed'), 'true');

    assert.equal(await page.getAttribute('.gf-month-toggle', 'aria-expanded'), 'false');
    await press(page, '.gf-month-toggle');
    assert.equal(await page.getAttribute('.gf-month-toggle', 'aria-expanded'), 'true');
    assert.ok(await countOf(page, '.gf-nav-cell[data-pick]') > 0, 'the month grid rendered no cells');
    await press(page, '.gf-month-toggle');
    assert.equal(await page.getAttribute('.gf-month-toggle', 'aria-expanded'), 'false');

    // Back on the week, through the same recorded column the ribbon offers.
    // The held day is whichever the store's latest recorded day is, not a date
    // written down here: the desk arrives on its own latest, and the week it
    // shows is that day's.
    await press(page, `.gf-nav-col[data-pick="${recorded.iso}"]`);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.gf-log-row[data-day-row]')]
      .map((button) => ({ t: button.dataset.dayRow, state: button.querySelector('.tier')?.dataset.state })));
    assert.ok(rows.length > 0, 'the Episode Log rendered no row');
    for (const row of rows) assert.ok(row.state, `a log row rendered without its served state word: ${row.t}`);
    await press(page, `.gf-log-row[data-day-row="${rows[0].t}"]`);
    assert.equal(await page.getAttribute(`.gf-log-row[data-day-row="${rows[0].t}"]`, 'aria-pressed'), 'true');
    await press(page, `.gf-log-row[data-day-row="${rows[0].t}"]`);
    assert.equal(await page.getAttribute(`.gf-log-row[data-day-row="${rows[0].t}"]`, 'aria-pressed'), 'false');
  } finally { await close(); }
});

test('a canonical Day address reloads through the built shell and returns through its canonical Diagnose door', async () => {
  const address = `/v2/day?date=${DAY}&subject=pattern%3Aserved-pattern&window=1320-120&from=diagnose`;
  const { page, close } = await openDesk({ address });
  try {
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await countOf(page, '[data-day="return"]'), 1);
    assert.equal(await page.evaluate(() => location.pathname), '/v2/day');
    await page.reload();
    await page.waitForSelector('.gf-stage-day', { timeout: 20000 });
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await countOf(page, '[data-day="return"]'), 1,
      'reload retains the contextual return rather than falling back to a bare Day');
    await press(page, '[data-day="return"]');
    assert.equal(await currentDestination(page), 'diagnose');
    assert.equal(await page.evaluate(() => location.pathname), '/v2/diagnose');
    const returned = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    assert.equal(returned.subject, 'pattern:served-pattern');
    assert.equal(returned.window, '1320-120');
  } finally { await close(); }
});

test('a utility takes the reading pane\'s seat, marks its launcher, and gives focus back on Close', async () => {
  const { page, close } = await openDesk({ address: '/v2/?to=day' });
  try {
    await press(page, '.cockpit-utilities [data-utility="guide"]');
    assert.equal(await countOf(page, '.gf-utility[data-utility="guide"]'), 1);
    // The destination underneath is still standing.
    assert.equal(await countOf(page, '.gf-stage-day'), 1);
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await page.getAttribute('.cockpit-utilities [data-utility="guide"]', 'aria-pressed'), 'true');
    await press(page, '[data-utility-close]');
    assert.equal(await countOf(page, '.gf-utility'), 0);
    const focused = await activeElement(page);
    assert.equal(focused.data.utility, 'guide', 'Close did not return focus to the launcher that opened it');
  } finally { await close(); }
});

test('Escape leaves a utility from inside its own field, and steps a Guide article back first', async () => {
  const { page, close } = await openDesk();
  try {
    await press(page, '.cockpit-utilities [data-utility="guide"]');
    await press(page, '.gf-guide-row');
    // An authored article's text is served, so the heading arrives one read
    // after the press. The caller's precise focus target has to survive that
    // render — the first port dropped it and left focus on the document body.
    await page.waitForSelector('.gf-article .gf-title', { timeout: 15000 });
    assert.equal(await countOf(page, '.gf-article .gf-title'), 1);
    const onArticle = await activeElement(page);
    assert.equal(onArticle.tag, 'H2', `opening an article left focus on ${JSON.stringify(onArticle)}`);
    assert.match(onArticle.className, /gf-title/);
    // One level per press: the article steps back to its index, and the Guide
    // is still seated.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await countOf(page, '.gf-article'), 0);
    assert.equal(await countOf(page, '.gf-utility[data-utility="guide"]'), 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await countOf(page, '.gf-utility'), 0);

    // The one exception a field does NOT own: a seated utility steps back from
    // inside its own fields, keeping what was typed in the page.
    await press(page, '.cockpit-log-carbs');
    await page.fill('#ut-grams', '18');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    assert.equal(await countOf(page, '.gf-utility'), 0, 'Escape inside a utility field did not leave the utility');
  } finally { await close(); }
});

test('a utility\'s own Day entry keeps the utility open and returns into it', async () => {
  const { page, close } = await openDesk();
  try {
    await press(page, '.cockpit-utilities [data-utility="questions"]');
    assert.equal(await countOf(page, '[data-question-card]'), 1);
    await press(page, '.gf-utility [data-action="day"][data-date]');
    // The originating utility stays open over the Day desk as the continuation.
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await countOf(page, '.gf-utility[data-utility="questions"]'), 1);
    const address = await page.evaluate(() => location.pathname + location.search);
    assert.match(address, /^\/v2\/day/);
    assert.match(address, /date=2024-06-26/);
    assert.match(address, /from=diagnose\.questions/);

    // Closing it reveals the Day desk's own return, named for that utility.
    await press(page, '[data-utility-close]');
    assert.equal(await countOf(page, '[data-day="return"]'), 1);
    const label = await page.locator('[data-day="return"]').innerText();
    assert.equal(label.trim(), 'Return to Carb questions');
    await press(page, '[data-day="return"]');
    assert.equal(await currentDestination(page), 'diagnose');
    assert.equal(await countOf(page, '.gf-utility[data-utility="questions"]'), 1,
      'the return did not reopen the utility it was named for');
  } finally { await close(); }
});

test('repeated entry and exit leaves no duplicate chart, pane or utility behind', async () => {
  const { page, close } = await openDesk({ address: '/v2/?to=day' });
  try {
    const counts = () => page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      utilities: document.querySelectorAll('.gf-utility').length,
      strips: document.querySelectorAll('.gf-utility-strip').length,
      reading: document.querySelectorAll('.gf-desk > .gf-reading').length,
    }));
    const first = await counts();
    assert.ok(first.canvases > 0, 'the Day figure mounted no chart to dispose');
    for (let i = 0; i < 3; i += 1) {
      await press(page, '[data-destination="diagnose"]');
      await press(page, '[data-destination="day"]');
      await press(page, '.cockpit-utilities [data-utility="glossary"]');
      await press(page, '[data-utility-close]');
    }
    assert.deepEqual(await counts(), first, 'the desk accumulated across re-entry');
    // pagehide disposes every chart and observer without raising.
    const live = await page.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
      if (!globalThis.echarts) return null;
      return [...document.querySelectorAll('canvas')].map((canvas) => canvas.parentElement)
        .filter((element) => element && globalThis.echarts.getInstanceByDom(element)).length;
    });
    assert.ok(live === null || live === 0, `pagehide left ${live} live ECharts instance(s)`);
  } finally { await close(); }
});

for (const viewport of Object.keys(VIEWPORTS)) {
  test(`c2 carries one Findings composition, Patterns and all basal slots at ${viewport}`, async () => {
    const desk = await openDesk({ viewport });
    const { page } = desk;
    try {
      // Overnight has only held rows in this generated case. Open the global
      // Findings scope before asking for its Pattern rows.
      await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await page.locator('.qrow[data-id^="pattern:"]').first().waitFor();
      assert.equal(await countOf(page, '[data-event-view="glucose"]'), 1);
      assert.equal(await countOf(page, '#lane > button.lane-cell'), 48);
      assert.ok(await countOf(page, '#level .qitem.claimed') > 0, 'the shipped Pattern rail retains nested causes');
      const before = await countOf(page, '[data-v2-diagnose] canvas');
      assert.ok(before > 0);
      for (let visit = 0; visit < 3; visit += 1) {
        await press(page, '[data-destination="changes"]');
        assert.equal(await countOf(page, '[data-event-view="glucose"]'), 0);
        await press(page, '[data-destination="diagnose"]');
        await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
        await page.getByRole('button', { name: '24 h', exact: true }).click();
        await page.locator('[data-v2-diagnose] #level .qrow[data-id^="pattern:"]').first().waitFor();
        assert.equal(await countOf(page, '[data-event-view="glucose"]'), 1);
        assert.equal(await countOf(page, '#lane > button.lane-cell'), 48);
      }
    } finally { await desk.close(); }
  });
}

// Amendment 6: S28/S83 observed a late tile completion painting null hosts.
// Hold actual evidence responses until the mounted Diagnose view has left.
for (const outcome of ['resolved', 'rejected']) {
  test(`shared tile ${outcome} after v2 teardown cannot repaint removed hosts`, async () => {
    const held = [];
    let arrive; const requested = new Promise(resolve => { arrive = resolve; });
    const desk = await openDesk({ beforeNavigate: async page => {
      await page.route('**/api/diagnose/basal-night-evidence*', route => { held.push(route); arrive(); });
    } });
    const { page } = desk;
    try {
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
      // The request can belong to an unseated descriptor, just as in S28/S83.
      await boundedWait(requested, 'shared teardown regression basal request');
      assert.ok(held.length > 0, 'the regression holds a real basal tile request');
      await press(page, '[data-destination="changes"]');
      assert.equal(await page.locator('[data-v2-diagnose]').count(), 0);
      const finished = held.map(route => page.waitForResponse(response => response.request() === route.request(), { timeout: 30000 }));
      await Promise.all(held.map(route => route.fulfill(outcome === 'resolved'
        ? { status: 200, json: basalEvidence }
        // Malformed JSON rejects the real client's read without producing an
        // expected HTTP console error that could mask the teardown page error.
        : { status: 200, contentType: 'application/json', body: '{' })));
      await boundedWait(Promise.all((await Promise.all(finished)).map(response => response.finished())), 'shared teardown response bodies');
      // Let request continuations and the queued brace paint run before close
      // checks the collected page errors; frame turns are not timed sleeps.
      await boundedWait(page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))), 'shared teardown continuation frames');
      assert.equal(await page.locator('[data-v2-diagnose]').count(), 0);
    } finally { await desk.close(); }
  });
}
