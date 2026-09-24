import { assertCompactSequenceDetail, captureEvidence, openAllCharts, assertResponseAnchorGeometry, highCarbFailureScenario, assertHighCarbFailure, assertSequenceResponse, assertSequenceSelection, assertSequenceFullscreen, railRowLocator } from './diagnose-replay.mjs';
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
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { BROWSER_INPUTS, populateFindingsProjectionInput, populateFindingCasePreparation } from './browser-fixture-population.js';
import { projectPatternCaseFile } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { expandSequenceFixture } from './eating-sequence-fixture.js';

const require = createRequire(import.meta.url);
const { createBuiltShell } = require('./built-shell.js');

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
  throw new Error(`frontend/desk.browser.test.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
}
const { createBrowserRunner } = require('./browser-runner.js');

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
    lever: 'late_bolus', lever_title: 'Late bolus', trigger: '', trigger_t: `${iso} 14:00:00`, worst_bg: 210, spans_midnight: false, steps: [],
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
  // Every June day but the gap day is recorded (daysFor).
  earliest_data_day: '2024-06-01', latest_data_day: '2024-06-30', data_day_count: 29,
};
// #425: a two-month span — June recorded but for the gap day, July 1–23 — whose
// navigator reads pad each month with seven days either side, exactly as
// build_day_navigator serves them, so adjacent reads overlap by two weeks.
const SPAN_STATUS = { ...STATUS, latest_data_day: '2024-07-23', data_day_count: 52 };
const spanRecorded = (iso) => (iso >= '2024-06-01' && iso <= '2024-06-30' && iso !== GAP_DAY)
  || (iso >= '2024-07-01' && iso <= '2024-07-23');
const paddedDaysFor = (month) => {
  const [year, index] = month.split('-').map(Number);
  const days = [];
  const end = new Date(Date.UTC(year, index, 7));
  for (let d = new Date(Date.UTC(year, index - 1, 1 - 7)); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    days.push(navDay(iso, spanRecorded(iso)));
  }
  return days;
};

const generated = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const evidence = generated('../mockups/diagnose-workstation.synthetic/payload.json');
const caseFiles = generated('../mockups/diagnose-workstation.synthetic/finding-case-files.json');
const sequenceFixture = expandSequenceFixture(generated('../mockups/eating-sequence-findings.synthetic/payload.json'));
const patternCapture = generated('../mockups/diagnose-event-comparison.synthetic/capture.json');
const basalEvidence = generated('./__fixtures__/basal-night-evidence.json').expected;
const isfEvidence = generated('../mockups/diagnose-workstation.synthetic/isf-rest-window-evidence.capture.json').payload;
const icEvidence = generated('../mockups/diagnose-workstation.synthetic/ic-block-evidence.capture.json').cases.cross_midnight;
// The generated roster has no Focus and withholds pin admission. Keep those
// served facts; the quiet guidance stub offers no pinnable Pattern either.
const followUp = generated('../mockups/verify-660-story.synthetic/payload.json').roster;
const fixtureInputs = populateFindingsProjectionInput({ exposures: evidence.exposures });
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
  [/^\/api\/analyze$/, () => BROWSER_INPUTS.analysis],
  [/^\/api\/scenarios$/, () => BROWSER_INPUTS.scenarios],
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
const capture = async (page, name) => {
  if (!process.env.OPUS_CAPTURE_DIR) return;
  mkdirSync(process.env.OPUS_CAPTURE_DIR, { recursive: true });
  await page.screenshot({ path: `${process.env.OPUS_CAPTURE_DIR}/${name}.png`, fullPage: false });
};

/** The built desk, served from disk with its API answered above. */
async function openDesk({ viewport = '1280x720', address = '/', beforeNavigate,
  sequenceState = null, caseScenario = null } = {}) {
  const browser = await runner.browser();
  const [width, height] = viewport.split('x').map(Number);
  assert.ok(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0);
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: 'dark' });
  const page = await context.newPage();
  const unstubbed = [];
  const problems = [];
  const expectedStatuses = new Set();
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error' && ![...expectedStatuses].some((status) => message.text().includes(`status of ${status}`))) problems.push(message.text()); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const served = shell.serve(url.pathname);
    if (served) return route.fulfill(served);
    if (sequenceState) {
      const state = sequenceFixture.states[sequenceState];
      const key = url.searchParams.has('start_min')
        ? `${url.searchParams.get('start_min')}-${url.searchParams.get('end_min')}` : 'global';
      const window = state?.windows[key];
      if (url.pathname === '/api/diagnose/findings' || url.pathname === '/api/diagnose/finding-case-file-preparation') {
        assert.ok(window, `missing generated sequence window ${sequenceState}/${key}`);
        if (url.pathname.endsWith('preparation')) caseScenario?.preparation?.({ url });
        const body = url.pathname.endsWith('preparation') ? window.preparation
          : { ...window.preparation.findings, rows: window.preparation.rendered_rows };
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      }
      if (url.pathname === '/api/diagnose/finding-case-file') {
        const retained = Object.values(state.windows).find((item) =>
          item.preparation.projection_id === url.searchParams.get('projection_id'));
        const finding = retained?.cases[url.searchParams.get('finding_id')];
        assert.ok(finding, 'requested generated sequence case is absent');
        const body = structuredClone(finding[url.searchParams.get('alignment')]);
        const occ = url.searchParams.get('occ');
        if (occ) body.selection = structuredClone(finding.selections[occ]
          || { state: 'unavailable', requested_id: occ, detail: null });
        if (caseScenario) {
          const response = caseScenario.case({ url, body });
          if (response.status >= 400) expectedStatuses.add(response.status);
          return route.fulfill({ status: response.status || 200, contentType: 'application/json',
            body: JSON.stringify(response.body) });
        }
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
      }
    }
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
    and the in-surface strip is narrow-only. It waits up to `timeout` ms for
    that match to render (ADR 457), so a control a screen paints once its read
    lands is pressed, not missed. One that never renders, or stays hidden,
    fails after the bound, naming the selector. */
async function press(page, selector, timeout = 30000) {
  const control = page.locator(selector).filter({ visible: true }).first();
  try {
    await control.waitFor({ state: 'visible', timeout });
  } catch (error) {
    if (error.name !== 'TimeoutError') throw error;
    const total = await page.locator(selector).count();
    assert.ok(total > 0, `no control matched ${selector} after ${timeout} ms`);
    assert.fail(`${selector} matched ${total} element(s), all hidden after ${timeout} ms`);
  }
  await control.click();
  await page.waitForTimeout(180);
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
    assert.equal(chrome.advisory, 'Advisory only. Review with your clinician before changing pump settings.');
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

test('v2 Diagnose renders the generated High-carb response and its selected trace', async () => {
  const { page, close } = await openDesk({ viewport: process.env.VIEWPORT || '1280x720', sequenceState: 'high_carb_sequence_in_sequence' });
  try {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await (await railRowLocator(page, 'finding:high_carb_sequence')).click();
    const chart = page.locator('#tile-focal #ec-chart');
    await page.waitForFunction(() => {
      const host = document.querySelector('#tile-focal #ec-chart');
      const option = host && window.echarts.getInstanceByDom(host)?.getOption();
      return option?.xAxis?.[0]?.axisLabel && ['matched', 'comparison'].every((cohort) =>
        option.series?.some((series) => series.id === `${cohort}:point:supported`));
    });
    const response = await chart.evaluate((host) => {
      const chart = window.echarts.getInstanceByDom(host);
      return {
        anchor: chart.getOption().xAxis[0].axisLabel.formatter(0),
        marks: chart.getZr().storage.getDisplayList().filter((item) => item.type === 'path').length,
      };
    });
    assert.equal(response.anchor.replace('\n', ' '), 'End of eating sequence');
    assert.equal(response.marks, 2, 'the two supported singleton observations did not paint');
    await assertSequenceResponse(page, sequenceFixture.states.high_carb_sequence_in_sequence
      .windows.global.cases['finding:high_carb_sequence']);
    const stored = sequenceFixture.states.high_carb_sequence_in_sequence
      .windows.global.cases['finding:high_carb_sequence'];
    await assertCompactSequenceDetail(page, stored, 'during');
    await assertSequenceSelection(page, stored, stored.event.occurrences.filter((row) => row.verdict === 'fired')[1]);
    await page.locator('#level .sequence-detail').waitFor();
    assert.equal(await countOf(page, '#ec-chart-key [data-cohort="selected"]'), 1);
    const assertSelectedMark = async (rank) => {
      const mark = await chart.evaluate((host) => {
        const chart = window.echarts.getInstanceByDom(host);
        const index = chart.getOption().series.findIndex((series) => series.id === 'selected:trace');
        const graphic = chart.getModel().getSeriesByIndex(index).getData().getItemGraphicEl(0);
        const painted = [];
        graphic?.traverse((item) => {
          if (item.type !== 'path' || !chart.getZr().storage.getDisplayList().includes(item)) return;
          const box = item.getBoundingRect().clone();
          if (item.transform) box.applyTransform(item.transform);
          painted.push({ width: box.width, height: box.height, opacity: item.style.opacity ?? 1 });
        });
        return { data: chart.getOption().series[index].data, painted };
      });
      assert.deepEqual(mark.data, [[0, 270]], 'selected singleton is the served observation');
      assert.ok(mark.painted.some((item) => item.width > 0 && item.height > 0 && item.opacity > 0),
        `${rank} selected singleton paints a visible mark: ${JSON.stringify(mark)}`);
      console.log(`Selected singleton ${rank} ${JSON.stringify(mark)}`);
      await captureEvidence(page, `high_carb_sequence-selected-singleton-${rank}`);
    };
    await assertSelectedMark('stage');
    await page.locator('#tile-focal .tile-fullscreen').click();
    await page.locator('#tile-field[data-fullscreen-tile]').waitFor();
    await assertSelectedMark('fullscreen');
    await page.keyboard.press('Escape');
    await page.locator('#tile-field:not([data-fullscreen-tile])').waitFor();
    await press(page, '#level .clear-trace');
    assert.equal(await countOf(page, '#ec-chart-key [data-cohort="selected"]'), 0);
  } finally { await close(); }
});

test('v2 High-carb scoped population, roster selections and fullscreen retain public evidence', async () => {
  const { page, close } = await openDesk({ viewport: process.env.VIEWPORT || '1280x720',
    sequenceState: 'high_carb_sequence_empty' });
  const input = sequenceFixture.states.high_carb_sequence_empty;
  const id = 'finding:high_carb_sequence';
  try {
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await (await railRowLocator(page, id)).click();
    await page.locator('#tile-focal #ec-chart').waitFor();
    const stored = input.windows.global.cases[id];
    await assertSequenceResponse(page, stored);
    await assertCompactSequenceDetail(page, stored);
    for (const occurrence of [stored.event.occurrences.filter((row) => row.verdict === 'fired')[1],
      stored.event.occurrences.find((row) => row.verdict === 'clean')]) {
      await assertSequenceSelection(page, stored, occurrence);
      await assertSequenceFullscreen(page, stored);
      await press(page, '#level .clear-trace');
      assert.equal(await countOf(page, '#ec-chart-key [data-cohort="selected"]'), 0);
    }
    await page.getByRole('button', { name: 'Overnight', exact: true }).click();
    await page.locator('#level .vband .key[data-verdict="fired"]').click();
    await page.locator('#level .sequence-comparison').waitFor();
    await page.locator('#tile-focal #ec-chart').waitFor();
    const scoped = input.windows['0-360'].cases[id];
    assert.deepEqual(scoped.event.projection.response, stored.event.projection.response);
    assert.ok(scoped.event.occurrences.length < stored.event.occurrences.length);
    await assertSequenceResponse(page, scoped);
    assert.equal(await countOf(page, '#level .case-occurrence'),
      Math.min(5, scoped.event.occurrences.filter((row) => row.verdict === 'fired').length));
  } finally { await close(); }
});

for (const viewport of ['1280x720', '1440x900']) {
test(`a failed Focus read keeps a short visible Retry beside its explanation at ${viewport}`, async () => {
  const desk = await openDesk({ beforeNavigate: async page => {
    // A malformed reply rejects the real shared client without adding a browser
    // console error that would conceal the Diagnose surface's own failure UI.
    await page.route('**/api/focus', route => route.fulfill({ status: 200,
      contentType: 'application/json', body: '{' }));
  }, viewport });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    await page.locator('#filter-trigger').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id^="pattern:"]').first().click();
    const status = page.locator('[data-focus-context]');
    const retry = page.locator('[data-focus-retry]');
    const reason = page.locator('[data-focus-reason]');
    await Promise.all([status.waitFor({ state: 'visible' }), retry.waitFor({ state: 'visible' })]);
    assert.equal((await status.innerText()).trim(), 'Focus status unavailable');
    assert.equal((await retry.innerText()).trim(), 'Retry');
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal((await reason.innerText()).trim(), 'Focus status could not load. Retry the read.');
    assert.equal(await retry.getAttribute('aria-describedby'), await reason.getAttribute('id'));
    await capture(page, `focus-read-error-${viewport}`);
    const boxes = await page.evaluate(() => {
      const box = selector => { const rect = document.querySelector(selector)?.getBoundingClientRect(); return rect && { left: rect.left, right: rect.right, width: rect.width }; };
      const status = document.querySelector('[data-focus-context]');
      const reason = document.querySelector('[data-focus-reason]');
      const expected = document.createElement('span');
      expected.style.color = 'var(--mk-warn)'; document.body.append(expected);
      return { crumb: box('.inspector .crumb'), status: box('[data-focus-context]'), retry: box('[data-focus-retry]'),
        statusClipped: status.scrollWidth > status.clientWidth,
        reasonColor: getComputedStyle(reason).color, warn: getComputedStyle(expected).color };
    });
    assert.ok(boxes.status.width > 0 && boxes.retry.width > 0, `Focus recovery controls must render: ${JSON.stringify(boxes)}`);
    assert.ok(boxes.retry.right <= boxes.crumb.right + 0.5, `Retry must remain within the Findings header: ${JSON.stringify(boxes)}`);
    assert.equal(boxes.statusClipped, false, `Focus explanation must remain readable: ${JSON.stringify(boxes)}`);
    assert.equal(boxes.reasonColor, boxes.warn, `Focus retry reason must use warn ink: ${JSON.stringify(boxes)}`);
  } finally { await desk.close(); }
});
}

for (const viewport of ['1280x720', '1440x900']) {
test(`a pending Plan shows in the watch panel with Open Changes and leaves no note in the case-file header at ${viewport}`, async () => {
  // #431 (ADR 431): the guidance read serves the pending Plan with the server's
  // verdict, and the watch panel carries it in every window and case. The case
  // file's header names no pending Plan, offers no Plan route, and Start Focus
  // stays withheld exactly as the served admission says.
  const plan = { id: '2024-06-14 21:14:00', applied_at: '2024-06-14 21:14:00',
    items: [{ type: 'basal', start_min: 180, value: 0.55 }],
    deliverable: { state: 'unavailable', reason: 'legacy_not_recorded' },
    decision_context: { state: 'unavailable', reason: 'legacy_not_recorded' },
    reconciliation: { state: 'unavailable' }, withdrawal: { state: 'unavailable' },
    verdict: { state: 'pending', confirmed_at: null, on_pump: false } };
  const desk = await openDesk({ beforeNavigate: async page => {
    await page.route('**/api/guidance', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      disposition: 'pending_plan', selected: null, input_revision: followUp.input_revision, pending_plan: plan,
      candidates: [{ subject: 'pattern:over-treated-low', kind: 'pattern', title: 'Over-treated low',
        collapse: 'remain_pattern', members: [{ subject: 'habit:over_treated_low' }] }],
    }) }));
    await page.route('**/api/focus', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      focuses: followUp.focuses, pinnable: [], pinnable_patterns: [], input_revision: followUp.input_revision,
      admission: { focus_pin: { available: false, reason: 'pending_plan' } },
    }) }));
    await page.route('**/api/plan/history', route => route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ history: [plan] }) }));
  }, viewport });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    // The panel repaints once the Focus read, which carries the guidance read,
    // has landed; from here every header decision below has its admission.
    const dock = page.locator('.inspector > .watch');
    await page.locator('.inspector > .watch[data-state="recorded"]').waitFor({ state: 'visible', timeout: 30000 });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id="finding:over_treated_low"]').click();
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    assert.deepEqual(await page.evaluate(() => ({
      note: document.querySelectorAll('[data-focus-context], [data-focus-reason]').length,
      startFocus: document.querySelectorAll('[data-start-focus]').length,
      planWords: /View Plan|awaiting confirmation/.test(document.querySelector('header.crumb')?.textContent || ''),
    })), { note: 0, startFocus: 0, planWords: false }, 'the case-file header carries no pending-Plan note');
    assert.equal(await dock.getAttribute('data-state'), 'recorded', 'selecting a case keeps the Plan in the panel');
    assert.deepEqual(await dock.evaluate(node => ({
      kind: node.querySelector('.kind')?.textContent, what: node.querySelector('.what')?.textContent,
      how: node.querySelector('.how')?.textContent, go: node.querySelector('.go')?.textContent,
    })), { kind: 'Plan · awaiting pump', what: 'Basal · recorded 06-14',
      how: 'Recorded — waiting for a pump read that matches', go: 'Open Changes ›' });
    await capture(page, `watch-pending-plan-${viewport}`);
    await dock.locator('.go').click();
    await page.waitForFunction(() => document.querySelector('[data-destination][aria-current="page"]')?.dataset.destination === 'changes');
    assert.equal(new URL(page.url()).pathname, '/changes');
    assert.equal(new URL(page.url()).searchParams.get('subject'), 'plan', 'Open Changes lands on the Plan, never the watched-change address');
    await page.locator('.gf-stage .gf-kicker b').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(await page.locator('.gf-stage .gf-kicker b').textContent(), 'Pending');
  } finally { await desk.close(); }
});
}

for (const viewport of ['1280x720', '1440x900']) {
  test(`Filter matches Window while resting, expanded, and Findings-loading at ${viewport}`, async () => {
    const desk = await openDesk({ viewport });
    const { page } = desk;
    const compact = () => page.evaluate(() => {
      const fields = ['height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'borderTopWidth',
        'borderTopStyle', 'borderTopColor', 'borderRadius', 'backgroundColor', 'color', 'boxShadow'];
      const read = node => Object.fromEntries(fields.map(field => [field, getComputedStyle(node)[field]]));
      const filter = document.querySelector('#filter-trigger');
      const selected = document.querySelector('#seg-window button[aria-pressed="true"]');
      const resting = [...document.querySelectorAll('#seg-window button')]
        .find(button => button.getAttribute('aria-pressed') === 'false');
      return { loading: document.querySelector('#level')?.dataset.loading, filter: read(filter), selected: read(selected), resting: read(resting) };
    });
    try {
      await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
      const resting = await compact();
      assert.deepEqual(resting.filter, resting.resting, 'resting Filter and Window share compact-control material');
      await capture(page, `filter-resting-${viewport}`);
      await page.locator('#filter-trigger').click();
      const expanded = await compact();
      assert.deepEqual(expanded.filter, expanded.selected, 'expanded Filter and selected Window share compact-control material');
      await capture(page, `filter-expanded-${viewport}`);
      await page.locator('#filter-trigger').click();
      let arrive;
      const arrived = new Promise(resolve => { arrive = resolve; });
      const gate = new Promise(() => {});
      await page.route('**/api/diagnose/finding-case-file-preparation*', async route => { arrive(); await gate; await route.fallback(); });
      try {
        await page.getByRole('button', { name: 'Morning', exact: true }).click();
        await arrived;
        await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'true', null, { timeout: 30000 });
        const loading = await compact();
        assert.equal(loading.loading, 'true');
        assert.deepEqual(loading.filter, loading.resting, 'loading Filter keeps Window compact-control material');
        await capture(page, `filter-loading-${viewport}`);
      } finally {
        await page.unroute('**/api/diagnose/finding-case-file-preparation*');
      }
    } finally { await desk.close(); }
  });
}

for (const viewport of ['1280x720', '1440x900']) {
test(`an unrouted Focus withholding is status text with its served reason, never a dead-end button at ${viewport}`, async () => {
  const desk = await openDesk({ beforeNavigate: async page => {
    await page.route('**/api/guidance', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      disposition: 'none', selected: null, input_revision: followUp.input_revision,
      candidates: [{ subject: 'pattern:over-treated-low', kind: 'pattern', title: 'Over-treated low',
        collapse: 'remain_pattern', members: [{ subject: 'habit:over_treated_low' }] }],
    }) }));
    await page.route('**/api/focus', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      focuses: followUp.focuses, pinnable: [], pinnable_patterns: [], input_revision: followUp.input_revision,
      admission: { focus_pin: { available: false, reason: 'served_unknown_reason' } },
    }) }));
  }, viewport });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id="finding:over_treated_low"]').click();
    const status = page.locator('[data-focus-context]');
    await status.waitFor({ state: 'visible' });
    assert.equal(await status.evaluate(node => node.tagName), 'SPAN');
    assert.equal(await status.getAttribute('role'), 'status');
    assert.equal(await status.getAttribute('aria-describedby'), await page.locator('[data-focus-reason]').getAttribute('id'));
    assert.equal((await page.locator('[data-focus-reason]').innerText()).trim(),
      'Harmonic is not offering a Focus from this read.');
    await capture(page, `focus-unrouted-status-${viewport}`);
  } finally { await desk.close(); }
});
}

for (const viewport of ['1280x720', '1440x900']) {
test(`a grouped comparison owns its cohort label once at ${viewport}`, async () => {
  const desk = await openDesk({ viewport });
  const { page } = desk;
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.locator('#level .qrow[data-id^="pattern:"]').first().click();
    await page.locator('#level [data-comparison-cohort]').first().waitFor({ state: 'visible' });
    const rendered = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('#level .ev-group')].map(node => node.textContent?.trim()),
      rows: [...document.querySelectorAll('#level [data-comparison-cohort]')].map(node => ({
        description: node.querySelector('.only')?.textContent?.trim(), tier: node.querySelector('.tier')?.textContent?.trim(),
      })),
    }));
    assert.ok(rendered.headings.some(Boolean), 'the grouped comparison keeps its served cohort heading');
    assert.ok(rendered.rows.every(row => row.description && row.tier == null),
      `cohort rows reserve their description cell instead of repeating the heading: ${JSON.stringify(rendered)}`);
    await capture(page, `grouped-comparison-${viewport}`);
  } finally { await desk.close(); }
});
}

const EXPIRED_TRIAL_ID = 'expired-trial-synthetic';
const expiredTrial = {
  id: EXPIRED_TRIAL_ID, parameter: 'carb_ratio', slot: '12:00', changed_at: '2026-09-01 00:00:00', before: 5, after: 4.4,
  original: {
    context: { state: 'unavailable', reason: 'not_recorded' },
    ending: { version: '386:1', state: 'available', kind: 'expired_unreviewed',
      effective_at: '2026-09-08 00:00:00', recorded_at: '2026-09-08 00:00:00', conclusion: null,
      assessment: { state: 'unavailable', reason: 'not_recorded' } },
    late_conclusion: { state: 'unavailable' },
  },
};
const expiredTrialRoster = {
  input_revision: 7, admission: { state: 'unavailable', reason: 'not_recorded', focus_pin: { available: false, reason: 'not_recorded' } },
  trials: [{ id: EXPIRED_TRIAL_ID, parameter: 'carb_ratio', slot: '12:00', changed_at: '2026-09-01 00:00:00', before: 5, after: 4.4,
    ending: expiredTrial.original.ending, watch_disposition: 'expired' }], focuses: [],
};
for (const viewport of ['1280x720', '1440x900']) {
test(`an expired Trial distinguishes its Later conclusion input from the immutable ending at ${viewport}`, async () => {
  const desk = await openDesk({ viewport, address: `/changes?subject=history&occurrence=record%3Atrial%3A${EXPIRED_TRIAL_ID}`,
    beforeNavigate: async page => {
      await page.route('**/api/verify/trials*', route => {
        const selected = new URL(route.request().url()).searchParams.get('selected');
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(selected
          ? { ...expiredTrialRoster, selected: expiredTrial }
          : expiredTrialRoster) });
      });
    } });
  const { page } = desk;
  try {
    const form = page.locator('[data-form="late-conclusion"]');
    await form.waitFor({ state: 'visible', timeout: 30000 });
    assert.equal((await form.locator('label').innerText()).trim(), 'Later conclusion');
    assert.equal((await page.locator('[data-record-part="ending"] dt').filter({ hasText: 'Conclusion' }).count()), 1,
      'the immutable ending keeps the only plain Conclusion label');
    await capture(page, `late-conclusion-${viewport}`);
  } finally { await desk.close(); }
});
}

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
  const { page, close } = await openDesk({ address: '/?to=day' });
  try {
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
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

test('paging the Month calendar keeps the served recorded-day count, and each month counts its own days once', async () => {
  const json = (body) => ({ contentType: 'application/json', body: JSON.stringify(body) });
  const { page, close } = await openDesk({ address: '/?to=day', beforeNavigate: async (page) => {
    await page.route('**/api/status', (route) => route.fulfill(json(SPAN_STATUS)));
    await page.route('**/api/day-navigator*', (route) => {
      const month = new URL(route.request().url()).searchParams.get('month');
      return route.fulfill(json({ month, days: paddedDaysFor(month) }));
    });
  } });
  const railCount = () => page.evaluate(() => document.querySelector('.gf-stage-day .instrument .meta.gf-desk-only')?.textContent || '');
  // A paged month is a served read: its head is read once its own cells land.
  const monthHead = async (label) => {
    await page.locator(`.gf-nav-month[aria-label="${label}"] .gf-nav-cell[data-pick]`).first().waitFor({ timeout: 20000 });
    return page.evaluate(() => document.querySelector('.gf-nav-month-head .meta')?.textContent || '');
  };
  try {
    // The desk arrives on the span's latest day, in July.
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
    assert.match(await railCount(), /^52 recorded days · /);
    await press(page, '.gf-month-toggle');
    assert.equal(await monthHead('July 2024'), '23 recorded days');
    assert.match(await railCount(), /^52 recorded days · /);
    await press(page, '[data-day="prev-month"]');
    assert.equal(await monthHead('June 2024'), '29 recorded days');
    assert.match(await railCount(), /^52 recorded days · /, 'loading June moved the rail count');
    await press(page, '[data-day="next-month"]');
    assert.equal(await monthHead('July 2024'), '23 recorded days', 'July counted June\'s overlapping week');
    assert.match(await railCount(), /^52 recorded days · /, 'paging back moved the rail count');
  } finally { await close(); }
});

for (const viewport of ['1280x720', '1440x900']) {
test(`a retained Day frame visibly marks its own loading work without unmounting the reading context at ${viewport}`, async () => {
  const { page, close } = await openDesk({ address: '/day', viewport });
  try {
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
    const previous = page.locator('[data-day="prev"]');
    assert.equal(await previous.isDisabled(), false, 'the manufactured Day has a prior recorded day');
    let arrive;
    const arrived = new Promise(resolve => { arrive = resolve; });
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const chartState = () => page.evaluate(() => {
      const stage = document.querySelector('.gf-stage-day');
      const nav = document.querySelector('#gf-nav');
      const chartElement = stage?.querySelector('.gf-chart');
      const chart = chartElement && window.echarts?.getInstanceByDom(chartElement);
      return {
        busy: stage?.getAttribute('aria-busy') || null,
        stage: stage?.__dayRetainedIdentity || null,
        navigation: nav?.__dayRetainedIdentity || null,
        chart: Boolean(chart), series: chart?.getOption()?.series?.length || 0,
      };
    });
    const before = await page.evaluate(() => {
      const stage = document.querySelector('.gf-stage-day');
      const nav = document.querySelector('#gf-nav');
      stage.__dayRetainedIdentity = 'stage';
      nav.__dayRetainedIdentity = 'navigation';
      const chart = window.echarts?.getInstanceByDom(stage.querySelector('.gf-chart'));
      return { chart: Boolean(chart), series: chart?.getOption()?.series?.length || 0 };
    });
    assert.ok(before.chart && before.series > 0, `the initial Day chart must be populated: ${JSON.stringify(before)}`);
    await page.route('**/api/model-view*', async route => { arrive(); await gate; await route.fallback(); });
    try {
      await previous.click();
      await arrived;
      const retained = await page.evaluate(() => {
        const stage = document.querySelector('.gf-stage-day');
        return { busy: stage?.getAttribute('aria-busy'), loading: stage?.querySelector('.gf-day-loading')?.getAttribute('aria-label'),
          reading: Boolean(document.querySelector('.gf-reading')), navigation: Boolean(document.querySelector('#gf-nav')) };
      });
      assert.deepEqual(retained, { busy: 'true', loading: 'Loading Day', reading: true, navigation: true });
      const held = await chartState();
      assert.deepEqual({ stage: held.stage, navigation: held.navigation }, { stage: 'stage', navigation: 'navigation' },
        `the retained frame must keep its structural owners: ${JSON.stringify(held)}`);
      assert.ok(held.chart && held.series > 0,
        `the retained Day chart must keep rendered series while its next read is held: ${JSON.stringify(held)}`);
      await capture(page, `day-retained-loading-${viewport}`);
      release();
      await page.waitForFunction(() => document.querySelector('.gf-stage-day')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 });
      const settled = await chartState();
      assert.deepEqual({ stage: settled.stage, navigation: settled.navigation }, { stage: 'stage', navigation: 'navigation' },
        `the settled Day read must preserve its retained structural owners: ${JSON.stringify(settled)}`);
      assert.ok(settled.chart && settled.series > 0,
        `the settled Day chart must render its new served series: ${JSON.stringify(settled)}`);
    } finally { await page.unroute('**/api/model-view*'); }
  } finally { await close(); }
});
}

test('a canonical Day address reloads through the built shell and returns through its canonical Diagnose door', async () => {
  const address = `/day?date=${DAY}&subject=pattern%3Aserved-pattern&window=1320-120&from=diagnose`;
  const { page, close } = await openDesk({ address });
  try {
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await countOf(page, '[data-day="return"]'), 1);
    assert.equal(await page.evaluate(() => location.pathname), '/day');
    await page.reload();
    await page.waitForSelector('.gf-stage-day', { timeout: 20000 });
    assert.equal(await currentDestination(page), 'day');
    assert.equal(await countOf(page, '[data-day="return"]'), 1,
      'reload retains the contextual return rather than falling back to a bare Day');
    await press(page, '[data-day="return"]');
    assert.equal(await currentDestination(page), 'diagnose');
    assert.equal(await page.evaluate(() => location.pathname), '/diagnose');
    const returned = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    assert.equal(returned.subject, 'pattern:served-pattern');
    assert.equal(returned.window, '1320-120');
  } finally { await close(); }
});

// ADR 428: once the reader acts inside Diagnose, the address names the case on
// screen — rewritten in place — and never again the Day hop's own keys.
test('after a Day return, acting inside Diagnose re-addresses it in place, and its Findings address reloads with no case open', async () => {
  const subject = 'finding:over_treated_low';
  const occurrence = 'o_8b021be51ae0a9b20106e5ce1053f76c';
  const address = `/day?${new URLSearchParams({ date: DAY, moment: `${DAY} 09:00:00`, subject, occurrence,
    lever: 'over_treated_low', from: 'diagnose', focus: '.occ-foot button:last-child' })}`;
  const { page, close } = await openDesk({ address });
  const search = () => page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  try {
    await press(page, '[data-day="return"]');
    assert.equal(await currentDestination(page), 'diagnose');
    await page.locator(`#level .case-occurrence[data-occurrence-id="${occurrence}"][aria-pressed="true"]`)
      .waitFor({ timeout: 30000 });
    const entries = await page.evaluate(() => history.length);

    await page.getByRole('button', { name: 'Overnight', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    const held = await page.evaluate(() =>
      document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId ?? null);
    assert.deepEqual(await search(), { subject, ...(held ? { occurrence: held } : {}), window: '0-360' },
      'the address names the Finding, the Occurrence on screen and the Overnight window, and no date, moment, lever or focus');
    assert.equal(await page.evaluate(() => history.length), entries, 'the window choice added no history entry');

    await page.locator('#crumb-trail button', { hasText: 'Findings' }).click();
    await page.waitForFunction(() => !document.querySelector('#level .case-occurrence'), null, { timeout: 30000 });
    assert.equal(await page.evaluate(() => `${location.pathname}${location.search}`), '/diagnose',
      'back at Findings the address carries no subject, occurrence or focus');

    await page.reload();
    await page.locator('#level .qrow[data-id]').first().waitFor({ timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
    assert.equal(await countOf(page, '#level .case-occurrence'), 0, 'the reload lands on Findings with no case file open');
    assert.equal(await page.evaluate(() => location.search), '');
  } finally { await close(); }
});

// ADR 428, review round 2: a parked Diagnose is inert. Its workstation's
// page-level ↓ must not step the held Occurrence while Day holds the surface,
// so the Day return is retained on exactly the Occurrence it opened Day from.
test('a key pressed on Day leaves the parked Diagnose as it was, and the Day return keeps it with no guidance re-read', async () => {
  const subject = 'finding:over_treated_low';
  const occurrence = 'o_8b021be51ae0a9b20106e5ce1053f76c';
  const address = `/day?${new URLSearchParams({ date: DAY, moment: `${DAY} 09:00:00`, subject, occurrence,
    lever: 'over_treated_low', from: 'diagnose' })}`;
  const { page, close } = await openDesk({ address });
  const held = () => page.evaluate(() =>
    document.querySelector('#level .case-occurrence[aria-pressed="true"]')?.dataset.occurrenceId ?? null);
  const settledOnHeld = () => page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false'
    && document.querySelector('#level .case-occurrence[aria-pressed="true"]'), null, { timeout: 30000 });
  try {
    await press(page, '[data-day="return"]');
    await settledOnHeld();
    assert.equal(await held(), occurrence, 'premise: the entry restored its Occurrence');
    await press(page, '.occ-foot button:last-child');
    await page.locator('.gf-stage-day').waitFor({ timeout: 20000 });
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
    let guidanceReads = 0;
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/analyze') guidanceReads += 1; });
    await press(page, '[data-day="return"]');
    await settledOnHeld();
    await page.waitForTimeout(300);
    assert.equal(await held(), occurrence, 'the return holds the Occurrence it opened Day from');
    assert.equal(guidanceReads, 0, 'the return is retained: no guidance re-read');
    assert.equal(await page.evaluate(() => new URLSearchParams(location.search).get('occurrence')), occurrence,
      'the address names the Occurrence on screen');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.occ-foot button:last-child')), true,
      'focus lands on that Occurrence\'s Open in Day control');
  } finally { await close(); }
});

// ADR 457: press waits, within its bound, for its first visible match. Day's
// read is held, so its Return control cannot exist when the press starts; the
// press lands once the read is released. An absent control and one that stays
// hidden still fail after the bound, naming the selector.
test('press waits for a Day return control that renders late, and names an absent or hidden control', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const address = `/day?date=${DAY}&subject=pattern%3Aserved-pattern&window=1320-120&from=diagnose`;
  const { page, close } = await openDesk({ address, beforeNavigate: async page => {
    await page.route('**/api/model-view*', async route => { await gate; await route.fallback(); });
  } });
  try {
    assert.equal(await countOf(page, '[data-day="return"]'), 0, 'premise: Day paints no Return control while its read is held');
    await Promise.all([press(page, '[data-day="return"]'), page.waitForTimeout(250).then(release)]);
    assert.equal(await currentDestination(page), 'diagnose');
    await assert.rejects(press(page, '[data-no-such-control]', 500),
      { message: 'no control matched [data-no-such-control] after 500 ms' });
    const hidden = '.gf-utility-strip [data-utility="guide"]';
    await assert.rejects(press(page, hidden, 500), (error) => {
      assert.ok(error.message.startsWith(hidden) && error.message.endsWith('all hidden after 500 ms'), error.message);
      return true;
    });
  } finally {
    release();
    await close();
  }
});

test('a utility takes the reading pane\'s seat, marks its launcher, and gives focus back on Close', async () => {
  const { page, close } = await openDesk({ address: '/?to=day' });
  try {
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
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
    assert.match(address, /^\/day/);
    assert.match(address, /date=2024-06-26/);
    assert.match(address, /from=diagnose\.questions/);
    // ADR 445: the entry names the prompt by its identity and carries no selector.
    const day = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    assert.ok(day.subject?.startsWith('question:'), `the Day address names no prompt identity: ${JSON.stringify(day)}`);
    assert.equal(Object.hasOwn(day, 'focus'), false, 'the Day address carries a return-focus key');

    // Closing it reveals the Day desk's own return, named for that utility.
    await press(page, '[data-utility-close]');
    assert.equal(await countOf(page, '[data-day="return"]'), 1);
    const label = await page.locator('[data-day="return"]').innerText();
    assert.equal(label.trim(), 'Return to Carb questions');
    let guidanceReads = 0;
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/analyze') guidanceReads += 1; });
    await press(page, '[data-day="return"]');
    assert.equal(await currentDestination(page), 'diagnose');
    assert.equal(await countOf(page, '.gf-utility[data-utility="questions"]'), 1,
      'the return did not reopen the utility it was named for');
    // A plain return into the Diagnose it was opened over: no guidance re-read,
    // and focus back on the prompt's own Open Day control.
    const onOpenDay = (subject) => document.activeElement
      === document.querySelector(`.gf-utility [data-action="day"][data-subject="${subject}"]`);
    await page.waitForFunction(onOpenDay, day.subject, { timeout: 10000 }).catch(() => null);
    assert.equal(await page.evaluate(onOpenDay, day.subject), true, 'focus did not land on the prompt\'s Open Day control');
    assert.equal(guidanceReads, 0, 'the return re-read Diagnose');
    const returned = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
    for (const key of ['title', 'from', 'focus']) {
      assert.equal(Object.hasOwn(returned, key), false, `the Diagnose address carries ${key}: ${JSON.stringify(returned)}`);
    }
  } finally { await close(); }
});

test('repeated entry and exit leaves no duplicate chart, pane or utility behind', async () => {
  const { page, close } = await openDesk({ address: '/?to=day' });
  try {
    await page.locator('.gf-stage-day').waitFor({ state: 'visible' });
    const counts = () => page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      utilities: document.querySelectorAll('.gf-utility').length,
      strips: document.querySelectorAll('.gf-utility-strip').length,
      reading: document.querySelectorAll('.gf-desk > .gf-reading').length,
    }));
    assert.ok((await counts()).canvases > 0, 'the Day figure mounted no chart to dispose');
    // ADR 414: Diagnose stays seated off-screen, parked hidden in the document
    // while Day holds the surface, so its charts are part of the steady state.
    // The baseline is taken after the first round trip; repeated entry must
    // then add nothing.
    await press(page, '[data-destination="diagnose"]');
    await press(page, '[data-destination="day"]');
    const first = await counts();
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
      // #413: a cold arrival already opens on 24 h; Overnight (this case's
      // default preset window) would carry only held rows, so this explicit
      // press just asserts the global scope this story actually needs,
      // rather than relying on the cold-arrival default alone.
      await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false', null, { timeout: 30000 });
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      await page.locator('.qrow[data-id^="pattern:"]').first().waitFor();
      assert.equal(await countOf(page, '[data-event-view="glucose"]'), 1);
      assert.equal(await countOf(page, '#lane > button.lane-cell'), 48);
      // #413 — a Pattern owns its causes behind a fold, not as sibling rows.
      const fold = page.locator('#level .qfold').first();
      await fold.waitFor();
      if ((await fold.getAttribute('aria-expanded')) !== 'true') await fold.click();
      await page.locator('#level .qitem.member').first().waitFor();
      assert.ok(await countOf(page, '#level .qitem.member') > 0, 'the shipped Pattern rail folds its nested causes');
      const before = await countOf(page, '[data-v2-diagnose] canvas');
      assert.ok(before > 0);
      for (let visit = 0; visit < 3; visit += 1) {
        await press(page, '[data-destination="changes"]');
        // ADR 414: the parked Diagnose root keeps its composition off the
        // surface; nothing of it is visible while Changes holds the surface.
        assert.equal(await page.locator('[data-event-view="glucose"]:visible').count(), 0);
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

test('thin basal focal survives repeated paints while its evidence is pending', async () => {
  const desk = await openDesk();
  const { page } = desk;
  const held = [];
  try {
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
    await page.getByRole('button', { name: '24 h', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#level')?.dataset.loading === 'false');
    await page.locator('.qrow[data-id^="pattern:"]').first().waitFor();
    await page.route('**/api/diagnose/basal-night-evidence*', route => { held.push(route); });
    await page.getByRole('button', { name: /^12:00 basal slot,/ }).click();
    await page.locator('#tile-focal .evidence-tile[data-chart-id="basal:720"]').waitFor();
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole('button', { name: 'All charts', exact: true }).click();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#tile-focal .evidence-tile').getAttribute('data-chart-id'), 'basal:720');
    }
    assert.ok(held.length, 'the thin slot has a pending real client request');
    await Promise.all(held.map(route => route.fulfill({ status: 200, json: basalEvidence })));
    await page.waitForFunction(() => !document.querySelector('#tile-focal .tile-state')?.textContent.includes('Loading'));
    assert.equal(await page.locator('#tile-focal .evidence-tile').getAttribute('data-chart-id'), 'basal:720');
  } finally { await desk.close(); }
});

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
      // ADR 414: leaving parks the Diagnose view hidden rather than removing
      // it; a late tile response paints into the parked root and must raise
      // no page error (checked at close) and show nothing on the surface.
      assert.equal(await page.locator('[data-v2-diagnose]:visible').count(), 0);
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
      assert.equal(await page.locator('[data-v2-diagnose]:visible').count(), 0);
    } finally { await desk.close(); }
  });
}

for (const defect of ['missing', 'malformed', 'inconsistent', 'stale-recover', 'stale-error']) {
  test(`v2 High-carb response ${defect} preserves the existing recovery boundary`, async () => {
    const scenario = highCarbFailureScenario(defect);
    const { page, close } = await openDesk({ sequenceState: 'high_carb_sequence_empty',
      viewport: process.env.VIEWPORT || '1280x720', caseScenario: scenario });
    try {
      await assertHighCarbFailure(page, scenario, defect,
        sequenceFixture.states.high_carb_sequence_empty.windows.global.cases['finding:high_carb_sequence']);
    } finally { await close(); }
  });
}

for (const name of ['empty', 'in_sequence', 'limited', 'null_period']) {
  test(`v2 High-carb rendered ${name} keeps producer curves and support`, async () => {
    const sequenceState = `high_carb_sequence_${name}`;
    let partialMetrics = false;
    const caseScenario = name === 'null_period' ? { case: ({ body }) => {
      if (partialMetrics && body.finding.lever === 'high_carb_sequence') {
        // Exercise independently missing metrics at the public response boundary.
        for (const comparisons of [body.projection.report.high_carb_sequence.comparisons,
          body.projection.response.comparisons]) {
          const period = comparisons.find((item) => item.period === 'post_4h' && item.scope === body.projection.response.scope);
          period.high.sd_mgdl = null;
          period.reference.tir_pct = null;
        }
      }
      return { body };
    } } : null;
    const { page, close } = await openDesk({ sequenceState, caseScenario, viewport: process.env.VIEWPORT || '1280x720' });
    const stored = sequenceFixture.states[sequenceState].windows.global.cases['finding:high_carb_sequence'];
    const id = 'finding:high_carb_sequence';
    try {
      await page.getByRole('button', { name: '24 h', exact: true }).click();
      if (name === 'empty') {
        // #413 — a claimed cause is folded under its parent Pattern and
        // carries no mini of its own (the parent's mini stands for the
        // group), so the honest "queue miniature remains inert" check this
        // story used to make against a sibling `.qrow` has no subject any
        // more; assert the folded member's absence of a mini instead. The
        // "All charts" tile is unaffected — the explorer draws one tile per
        // descriptor regardless of rail fold state, so the response evidence
        // still renders there.
        const member = await railRowLocator(page, id);
        assert.equal(await member.locator('.mini').count(), 0, 'a claimed cause carries no mini of its own');
        await member.scrollIntoViewIfNeeded();
        await captureEvidence(page, 'high_carb_sequence-mini');
        await openAllCharts(page);
        const selector = '#tile-row [data-chart-id="finding:high_carb_sequence"] .tile-chart';
        await page.locator(selector).scrollIntoViewIfNeeded();
        await assertSequenceResponse(page, stored, selector);
        await assertResponseAnchorGeometry(page, selector);
        await captureEvidence(page, 'high_carb_sequence-all-charts');
        await page.locator('#tile-row [data-chart-id="pattern:highs_after_meals"]').scrollIntoViewIfNeeded();
        await captureEvidence(page, 'high_carb_sequence-pattern-reference');
        await page.keyboard.press('Escape');
      }
      await (await railRowLocator(page, id)).click();
      await page.locator('#level .sequence-comparison').waitFor();
      await assertSequenceResponse(page, stored);
      if (name === 'null_period') await assertCompactSequenceDetail(page, stored, 'unavailable');
      await page.locator('#tile-focal .tile-head').scrollIntoViewIfNeeded();
      await assertResponseAnchorGeometry(page);
      await captureEvidence(page, `high_carb_sequence-${name}-stage`);
      if (name === 'null_period') {
        partialMetrics = true;
        await page.locator('#crumb-trail button', { hasText: 'Findings' }).click();
        await (await railRowLocator(page, id)).click();
        await page.locator('#level .sequence-supporting-detail summary').click();
        const period = page.locator('#level [data-period="post_4h"]');
        assert.deepEqual((await period.locator('.sequence-cohort').allInnerTexts()).map((text) => text.replace(/\s+/g, ' ').trim()), [
          'Highest-carb fifth 100% in range · SD Not enough data n 8',
          'Other sequences Not enough data · SD 0 mg/dL n 32',
        ], 'one missing metric never hides the independently available metric');
        await period.scrollIntoViewIfNeeded();
        await captureEvidence(page, 'high_carb_sequence-partial-metrics-inspector');
      }
      if (name === 'empty') await assertResponseAnchorGeometry(page);
      if (name === 'in_sequence') {
        assert.deepEqual(stored.event.projection.response.cohorts.map((cohort) =>
          cohort.points.map(({ minute, median, n }) => [minute, median, n])), [[[0, 270, 8]], [[0, 110, 32]]]);
        assert.equal(await page.locator('#tile-focal #ec-chart').evaluate((host) =>
          window.echarts.getInstanceByDom(host).getZr().storage.getDisplayList()
            .filter((item) => item.type === 'path').length), 2);
      }
    } finally { await close(); }
  });
}
