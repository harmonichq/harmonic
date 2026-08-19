// #634 — Cockpit shell rendered gate. This replaces the retired labeled-rail
// gate from #609 while transferring its non-rail invariants: viewport framing,
// small-width navigation, Plan/prompt counts, keyboard focus, and Verify's
// clinical-color guard. The chrome contract is the Diagnose workstation lock.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timeOfDay } from '../mockups/explore-investigation.fixture.js';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const require = createRequire(import.meta.url);
// #672: fail closed. A missing prerequisite must exit nonzero, never `skip` —
// a skipped run exits 0, and a green step that exercised zero browser
// assertions is the silent-skip failure mode the mock-to-app port process
// forbids for replay scripts, now extended to this suite. Every missing
// prerequisite is named explicitly and accumulated, so one failing run points
// at everything wrong, not just the first thing checked.
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
const EXECUTABLE = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (chromium && !EXECUTABLE && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium executable is missing (no PLAYWRIGHT_EXECUTABLE_PATH and `
    + `${chromium.executablePath()} does not exist — run playwright install chromium)`);
}
const VENDOR_DIR = process.env.VENDOR_DIR;
if (!VENDOR_DIR) {
  missing.push('VENDOR_DIR is unset (point it at a directory holding vendored '
    + 'vue.esm-browser.js and echarts.min.js)');
} else {
  for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
    if (!existsSync(join(VENDOR_DIR, asset))) missing.push(`VENDOR_DIR=${VENDOR_DIR} is missing ${asset}`);
  }
}
if (missing.length) {
  throw new Error(`cockpit-shell.browser.test.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
}
// #554: shared single-Chromium-per-command lifecycle, now launched only once
// the fail-closed checks above have confirmed a usable chromium is available.
const { createBrowserRunner } = require('./browser-runner.js');

const FRONTEND = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIAGNOSE_PAYLOAD = JSON.parse(await readFile(
  join(ROOT, 'mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const EVENT_COMPARISON = JSON.parse(await readFile(
  join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const SHOTS = process.env.COCKPIT_SHOTS;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const CDN = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);
const ADVISORY = 'Advisory only — review with your clinician before changing pump settings.';
const TABS = ['diagnose', 'plan', 'verify', 'day', 'guide', 'settings'];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];

const maturing = {
  id: 'profile-all-20260710090000', parameter: 'profile', slot: null,
  changed_at: '2026-07-10 09:00:00', before: null, after: null,
  target_metrics: ['tir', 'arc'], state: 'maturing',
  maturing: { days_elapsed: 8, days_required: 14, gap_count: 1 },
};
const complete = {
  id: 'carb_ratio-720-20260628090000', parameter: 'carb_ratio', slot: '12:00',
  changed_at: '2026-06-28 09:00:00', before: 5, after: 4.6,
  target_metrics: ['arc'], state: 'complete',
  maturing: { days_elapsed: 14, days_required: 14, gap_count: 0 },
};
function detail(trial) {
  return {
    ...trial,
    before_period: { start: '2026-06-12 09:00:00', end: '2026-06-26 09:00:00' },
    trial_period: { start: '2026-07-10 09:00:00', end: '2026-07-24 00:00:00' },
    focus: trial.state === 'maturing'
      ? { available: false, message: 'Focus is unavailable while a Trial is live.' }
      : { available: true },
    readiness: trial.state === 'maturing'
      ? { label: 'Maturing', message: 'No verdict is ready while evidence accrues.' }
      : { label: 'Ready to judge', message: 'This Trial is ready for a before-and-Trial read.' },
    evidence: [
      { key: 'arc', role: 'target',
        before: { peak: 176, nadir: 100, n_peak: 24, n_nadir: 24 },
        trial: { peak: 170, nadir: 104, n_peak: 28, n_nadir: 28 },
        rescue_context: { count: 3, grams: 20, unknown_count: 1 } },
      { key: 'tir', role: 'guardrail', before: { value: 81.6, n_readings: 4010 },
        trial: { value: 86.1, n_readings: 4021 } },
      { key: 'tbr', role: 'guardrail', before: { value: 2.8, n_readings: 4010 },
        trial: { value: 2.2, n_readings: 4021 } },
    ],
    plan_route: { mode: 'manual-review', label: 'Review this change in Plan', message: 'manual review' },
    limits: ['The evidence is limited to the selected Before and Trial periods.'],
    // #660: the paired per-period reads the ported workstation binds. Small but
    // real shapes — the surface drops empty bins, so a Trial with none draws no
    // ribbon and the colour guard below would have nothing to read.
    changes: [{ parameter: trial.parameter === 'profile' ? 'basal_rate' : 'carb_ratio',
                slot: trial.slot, slots_changed: trial.parameter === 'profile' ? 48 : 6,
                uniform: true, before: trial.before ?? 0.9, after: trial.after ?? 1.05 }],
    envelopes: {
      before_period: envelope(150), trial_period: envelope(138),
    },
    rescue: {
      before_period: { n: 6, grams: 90, n_unknown: 1, n_low_prompt: 3 },
      trial_period: { n: 4, grams: 60, n_unknown: 0, n_low_prompt: 1 },
    },
    day_rows: { before_period: Array.from({ length: 15 }, () => ({})),
                trial_period: Array.from({ length: 15 }, () => ({})) },
  };
}

/** 48 half-hour bins around `mid`, the shape `/verify/trials` publishes. */
function envelope(mid) {
  return Array.from({ length: 48 }, (_, i) => ({
    t: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
    n: 12, med: Math.round(mid + 28 * Math.sin((i / 48) * 2 * Math.PI)),
  }));
}

const pumpSettings = {
  configured: true, fetched_at: '2026-07-15 08:30:00', other_profile_count: 0,
  profile: {
    idp: 1, name: 'Everyday', dia_hours: 5, max_bolus: 10, carb_entry: true,
    segments: [
      { start_min: 0, basal_rate: 1, isf: 40, carb_ratio: 5, target_bg: 110 },
      { start_min: 720, basal_rate: 0.9, isf: 45, carb_ratio: 6, target_bg: 110 },
    ],
  },
};

// Diagnose renders populated here on purpose: the chrome has to be judged
// against real content, and a pane that holds nothing can never show whether it
// scrolls internally (lock term 1). Values track the pump profile above.
const analyze = {
  window_days: 30,
  priority_active_threshold: 50,
  tuning_levers: [
    { parameter: 'basal_rate', priority: 80, impact: .5, recurrence: .6 },
    { parameter: 'carb_ratio', priority: 70, impact: .45, recurrence: .55 },
    { parameter: 'isf', priority: 65, impact: .4, recurrence: .52 },
  ],
  basal: [
    { slot: 2, label: '01:00', current: 1, recommended: 1.1, asserts_move: true, days: 12,
      annotation: '12 nights of steady data support a cautious step.',
      estimate: { value: 1.09, lo: 1.02, hi: 1.15, n: 12, method: 'bootstrap median' },
      evidence: { points: [
        { date: '2026-07-14', rate: 1.08, text: 'Delivered basal evidence' },
        { date: '2026-07-12', rate: 1.11, text: 'Delivered basal evidence' },
        { date: '2026-07-10', rate: 1.06, text: 'Delivered basal evidence' },
      ], limits: ['Activity and illness can affect the same hours.'] } },
    { slot: 3, label: '01:30', current: 1, recommended: null, asserts_move: false, days: 9,
      safety_status: 'held (recurring-low gate)', annotation: 'Lows keep happening at this hour.',
      evidence: { lows: [{ date: '2026-07-11', text: 'Low after 01:30' }] } },
    { slot: 46, label: '23:00', current: .9, recommended: null, asserts_move: false, days: 4,
      safety_status: 'insufficient evidence', annotation: 'Collecting nights of steady data.' },
  ],
  ic_blocks: [
    { block_id: 'day', start_min: 720, end_min: 0, current_values: [6], recommended: 5.6,
      member_start_mins: [720], asserts_move: true, priority: 68, n_runs: 10,
      annotation: 'The engine found a consistent post-meal need in this block.',
      estimate: { value: 5.6, lo: 5.4, hi: 5.8, n: 10, method: 'closed meal ledger' },
      evidence: { correction_count: 6, rescue_count: 1,
        meals: [{ date: '2026-07-13', text: 'Correction at +2h' }],
        limits: ['Meal composition and activity can affect the same arc.'] } },
    { block_id: 'overnight', start_min: 0, end_min: 720, current_values: [5],
      member_start_mins: [0], asserts_move: false, state: 'collecting', n_runs: 4,
      annotation: 'More qualifying meals are needed.' },
  ],
  isf: [{ start_min: 0, current: 40, recommended: null,
    annotation: 'Corrections look close to what the data supports.',
    estimate: { value: 42, lo: 38, hi: 46, n: 42, method: 'fasting regression' },
    evidence: { n_steps: 42, fast_window: 'rest 00:00–08:00',
      rest_windows: [{ date: '2026-07-09', start: '2026-07-09 22:30:00',
        end: '2026-07-10 07:30:00', text: 'Fasting window' }],
      limits: ['Fasting windows cannot isolate every source of glucose movement.'] } }],
};

const scenarios = {
  patterns: [{ lever: 'late-bolus', title: 'Late pre-bolus at dinner', priority: 60,
    recommendation: 'Meals bolused shortly before eating had a larger rise.',
    confidence: { label: 'Moderate' }, occurrences: ['ep1'],
    evidence: { population: 8, limits: ['Meal composition and activity may also contribute.'],
      behaviors: [{ text: '5 of 8 dinners had a late pre-bolus.' }],
      boluses: [{ text: 'Bolus arrived 8 minutes after the meal began.' }] } }],
  low_confidence: [],
  episodes: { ep1: { start: '2026-07-13 18:10:00', end: '2026-07-13 21:10:00', text: 'Bolus at meal' } },
};

async function routeApp(page, options = {}) {
  const { promptCount = 0, planDraftItems = [] } = options;
  await page.route('**/*', async (route) => {
    const requestUrl = route.request().url();
    if (CDN.has(requestUrl)) return route.fulfill({
      body: await readFile(join(VENDOR_DIR, CDN.get(requestUrl))), contentType: 'text/javascript',
    });
    if (requestUrl.includes('fonts.googleapis.com') || requestUrl.includes('fonts.gstatic.com')) return route.abort();
    const url = new URL(requestUrl);
    if (url.pathname === '/verify/trials') {
      const selected = url.searchParams.get('selected');
      const trials = [maturing, complete];
      return route.fulfill({ json: {
        trials, selected: selected ? detail(trials.find((trial) => trial.id === selected)) : null,
      } });
    }
    if (url.pathname === '/prompts') {
      return route.fulfill({ json: Array.from({ length: promptCount }, (_, index) => ({
        anchor_t: `2026-07-1${index}T08:00:00`, kind: 'rise', answer: null,
      })) });
    }
    if (url.pathname === '/status') return route.fulfill({
      json: { earliest_data_day: '2026-05-01', latest_data_day: '2026-07-15' },
    });
    if (url.pathname === '/pump-settings') return route.fulfill({ json: pumpSettings });
    if (url.pathname === '/credentials') return route.fulfill({ json: { configured: false } });
    if (url.pathname === '/explore/time-of-day') return route.fulfill({ json: timeOfDay });
    if (url.pathname === '/diagnose/event-comparison') {
      const project = options.eventProjection || ((requestUrl, capture) =>
        projectSyntheticCapture(capture, {
          view: ['meals', 'lows'].includes(requestUrl.searchParams.get('view'))
            ? requestUrl.searchParams.get('view') : 'meals',
          factor: requestUrl.searchParams.get('factor') || undefined,
          block: requestUrl.searchParams.get('block') || 'all',
          another: requestUrl.searchParams.get('another') === '1',
          occurrenceId: requestUrl.searchParams.get('occ') || undefined,
        }));
      // A deferred entry may be rejected to stand for a request that fails on the
      // wire. Surface that as a failed request rather than letting the rejection
      // escape the route handler, where it would abort the test instead of
      // exercising the surface's own error branch.
      let projected;
      try { projected = await project(url, EVENT_COMPARISON); }
      catch { return route.abort('failed'); }
      return route.fulfill({ json: projected });
    }
    if (url.pathname === '/analyze') return route.fulfill({ json: analyze });
    // #735: level 1 IS the findings queue, and the workstation fails closed without
    // it — an unserved projection renders "Diagnose is unavailable.", which is an
    // empty body for every scenario that lands on the default Diagnose tab. Project
    // it from this suite's own analyze/scenarios fixtures through the same
    // fixture-only mirror the other browser legs route through.
    if (url.pathname === '/diagnose/findings') {
      const scoped = url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      };
      return route.fulfill({ json: projectFindings({ analysis: analyze, scenarios }, scoped) });
    }
    if (url.pathname === '/explore/exposures') return route.fulfill({ json: {} });
    if (url.pathname === '/scenarios') return route.fulfill({ json: scenarios });
    if (url.pathname === '/audit/dismissals') return route.fulfill({ json: { dismissals: {} } });
    if (url.pathname === '/outcomes/trend') return route.fulfill({ json: {} });
    if (url.pathname === '/plan' && route.request().method() === 'PUT') {
      return route.fulfill({ json: { items: route.request().postDataJSON().items } });
    }
    if (url.pathname === '/plan') return route.fulfill({ json: { items: planDraftItems } });
    if (url.pathname === '/plan/history' || url.pathname === '/focus') {
      return route.fulfill({ json: { history: [], focuses: [] } });
    }
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    const file = url.pathname === '/' ? join(FRONTEND, 'index.html')
      : url.pathname.startsWith('/mockups/') ? join(ROOT, url.pathname.slice(1))
      : join(FRONTEND, url.pathname.slice(1));
    try {
      return route.fulfill({
        body: await readFile(file), contentType: MIME[extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.fulfill({ json: {} });
    }
  });
}

// #554: one Chromium process for this whole command; every scenario below
// still gets its own fresh page (== fresh Playwright context) via
// openApp()'s browser.newPage() / plain browser.newPage() calls.
const runner = createBrowserRunner(() =>
  chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {}));
after(() => runner.close());

function launch() {
  return runner.browser();
}

async function openApp(browser, options = {}) {
  const page = await browser.newPage({ viewport: options.viewport || VIEWPORTS[1] });
  await routeApp(page, options);
  await page.addInitScript(({ tab, theme }) => {
    localStorage.setItem('ciq_token', 'fixture-token');
    localStorage.setItem('tab', tab);
    localStorage.setItem('theme', theme);
  }, { tab: options.tab || 'diagnose', theme: options.theme || 'light' });
  await page.goto(`http://ciq.local/?view=${options.eventView || 'glucose'}#${options.tab || 'diagnose'}`);
  await page.locator('.cockpit-shell').waitFor();
  if (['meals', 'lows'].includes(options.eventView)) {
    await page.locator(options.expectEventError ? '.ec-error' : '.ec-surface').waitFor();
  }
  // index.html only mounts the Diagnose workstation (root class `.dw`) when the
  // active tab is `diagnose`, so this wait is scoped to that default path.
  if ((options.tab || 'diagnose') === 'diagnose' && !['meals', 'lows'].includes(options.eventView)) {
    await page.locator('.dw').waitFor();
  }
  return page;
}

async function chooseTab(page, id) {
  const trigger = page.locator(`[data-shell-tab="${id}"]:visible`).first();
  await trigger.click();
  await page.waitForFunction((tab) => location.hash.startsWith(`#${tab}`), id);
}

async function proveRedOnce(term, check, mutate) {
  await check();
  const restore = await mutate();
  await assert.rejects(check, undefined, `${term} assertion must fail after its feature is removed`);
  await restore();
  await check();
}

/* The locked terms are asserted by these functions and nowhere else, so the
   mutation proofs below break the shipped assertion rather than a proxy for it. */

// LOCK:diagnose-workstation:1 — first clause: the page itself never scrolls and
// the chrome never leaves its frame.
async function assertViewportFrame(page, label) {
  const frame = await page.evaluate(() => ({
    docY: document.documentElement.scrollHeight <= innerHeight,
    bodyY: document.body.scrollHeight <= innerHeight,
    docX: document.documentElement.scrollWidth <= innerWidth,
    topbarTop: Math.round(document.querySelector('.cockpit-topbar').getBoundingClientRect().top),
    footerGap: Math.round(innerHeight - document.querySelector('.cockpit-footer').getBoundingClientRect().bottom),
  }));
  assert.deepEqual(frame, { docY: true, bodyY: true, docX: true, topbarTop: 0, footerGap: 0 },
    `${label}: the page must not scroll and the chrome must stay in its frame`);
}

// LOCK:diagnose-workstation:1 — second clause: "panes scroll internally". The
// tab pane owns a scrollport, and every interactive control it holds can be
// brought fully inside that scrollport. Anything the pane clips without being
// able to scroll to is unreachable, which is what this walk fails on.
async function assertPaneReachability(page, label) {
  const escaped = await page.evaluate(() => {
    const pane = document.querySelector('.cockpit-stage > .main-content');
    if (!/auto|scroll/.test(getComputedStyle(pane).overflowY)) return ['<the pane has no scrollport>'];
    const restore = pane.scrollTop;
    const unreachable = [];
    const controls = [...pane.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null
        && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0);
    for (const node of controls) {
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      const box = node.getBoundingClientRect();
      const frame = pane.getBoundingClientRect();
      if (box.top < frame.top - 1 || box.bottom > frame.bottom + 1
        || box.left < frame.left - 1 || box.right > frame.right + 1) {
        unreachable.push((node.innerText || node.getAttribute('aria-label') || node.tagName).trim().slice(0, 48));
      }
    }
    pane.scrollTop = restore;
    return unreachable;
  });
  assert.deepEqual(escaped, [], `${label}: every control must be reachable inside the scrolling pane`);
}

// LOCK:diagnose-workstation:2 — the sentence renders whole, and the row it
// lives in fits, so "whole" can never mean "overflowing a clipped footer".
async function assertAdvisoryWhole(page, label) {
  const advisory = page.locator('.cockpit-advisory');
  assert.equal(await advisory.innerText(), ADVISORY, `${label}: the advisory sentence is verbatim`);
  assert.equal(await advisory.evaluate((node) => node.scrollWidth <= node.clientWidth), true,
    `${label}: the advisory sentence must render in full`);
  assert.equal(await page.locator('.cockpit-footer').evaluate((node) => {
    const row = node.getBoundingClientRect();
    const sentence = node.querySelector('.cockpit-advisory').getBoundingClientRect();
    return node.scrollWidth <= node.clientWidth
      && sentence.left >= row.left - 1 && sentence.right <= row.right + 1;
  }), true, `${label}: the status row must fit, with the advisory sentence inside it`);
}

// LOCK:diagnose-workstation:3
async function assertDestinationInventory(page) {
  assert.deepEqual(await page.locator('.cockpit-topbar > [data-zone]').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.zone)),
  ['identity', 'workflow', 'divider', 'day', 'gap', 'scope', 'log-carbs']);
  assert.deepEqual(await page.locator('.cockpit-flow [data-shell-tab]').evaluateAll((nodes) =>
    nodes.map((node) => `${node.querySelector('.cockpit-step-number').textContent}:${node.dataset.shellTab}`)),
  ['1:diagnose', '2:plan', '3:verify']);
  // Transferred from the retired rail gate: exactly one Diagnose affordance.
  assert.equal(await page.getByRole('button', { name: /Diagnose/ }).count(), 1,
    'Diagnose is reachable from exactly one visible chrome affordance');

  const day = page.locator('.cockpit-day');
  assert.equal(await day.innerText(), 'Day');
  assert.equal(await day.evaluate((node) => node.tagName), 'A', 'Day keeps native link semantics');
  assert.equal(await day.getAttribute('href'), '#day');
  assert.equal(await day.locator('.cockpit-step-number').count(), 0, 'Day is never numbered');
  const dayStyle = await day.evaluate((node) => {
    const style = getComputedStyle(node);
    return { radius: style.borderRadius, background: style.backgroundColor };
  });
  assert.equal(parseFloat(dayStyle.radius), 0, 'Day is never a pill');
  assert.equal(dayStyle.background, 'rgba(0, 0, 0, 0)', 'Day stays a plain link');

  const facts = page.locator('.cockpit-profile-facts');
  assert.match(await facts.innerText(), /^Pump profile · ISF .+ mg\/dL\/U · I:C .+ g\/U$/);
  assert.equal(await page.locator('.cockpit-profile-facts a, .cockpit-profile-facts button').count(), 0,
    'profile identity is not a route');
  assert.doesNotMatch(await facts.innerText(), /[→↑↓]/, 'profile identity is not a verdict');
  // Mock parity: the facts are never ellipsized, and they sit beside the
  // advisory sentence with the utilities docked right — only they compress.
  assert.equal(await facts.evaluate((node) => node.scrollWidth <= node.clientWidth), true,
    'the ISF/I:C facts are never ellipsized');
  const row = await page.evaluate(() => {
    const box = (selector) => document.querySelector(selector).getBoundingClientRect();
    const footer = document.querySelector('.cockpit-footer');
    const pad = parseFloat(getComputedStyle(footer).paddingRight);
    return {
      factsBeforeAdvisory: box('.cockpit-profile-facts').right <= box('.cockpit-advisory').left + 1,
      advisoryBeforeUtilities: box('.cockpit-advisory').right <= box('.cockpit-utilities').left + 1,
      utilitiesDockedRight: Math.abs(footer.getBoundingClientRect().right - pad
        - box('.cockpit-utilities').right) <= 1,
    };
  });
  assert.deepEqual(row,
    { factsBeforeAdvisory: true, advisoryBeforeUtilities: true, utilitiesDockedRight: true },
    'the advisory sits beside the facts and the utilities dock right');

  assert.deepEqual(await page.locator('.cockpit-utilities > button').evaluateAll((nodes) =>
    nodes.map((node) => node.childNodes[0].textContent.trim())),
  ['Carb questions', 'Guide', 'Settings', 'Glossary', 'Theme']);
  // Scoped to the footer: the narrow drawer also carries a Guide destination,
  // and it precedes the footer in the DOM.
  const ink = await page.evaluate(() => ({
    facts: getComputedStyle(document.querySelector('.cockpit-profile-facts')).color,
    guide: getComputedStyle(document.querySelector('.cockpit-utilities [data-shell-tab="guide"]')).color,
  }));
  assert.notEqual(ink.guide, ink.facts, 'Guide and Settings recede below the profile facts');
}

// The desktop chrome keeps a pointer-target floor without changing the locked
// visual weight; see ADR 634 for why it is 24px here and 44px in the drawer.
async function assertPointerTargets(page) {
  const small = await page.evaluate(() => [...document.querySelectorAll(
    '.cockpit-utilities > button, .cockpit-day, .cockpit-step, .cockpit-log-carbs')]
    .map((node) => ({ label: node.innerText.trim().split('\n')[0], ...node.getBoundingClientRect().toJSON() }))
    .filter((box) => box.width < 24 || box.height < 24)
    .map((box) => `${box.label} ${Math.round(box.width)}x${Math.round(box.height)}`));
  assert.deepEqual(small, [], 'every desktop chrome control keeps a 24x24 pointer target');
}

// LOCK:diagnose-workstation:26
async function assertTypeRanks(page) {
  const sizes = await page.locator('.cockpit-topbar, .cockpit-footer').evaluateAll((roots) => {
    const visible = roots.flatMap((root) => [root, ...root.querySelectorAll('*')])
      .filter((node) => node instanceof HTMLElement && node.offsetParent !== null
        && getComputedStyle(node).display !== 'contents' && node.textContent.trim());
    return [...new Set(visible.map((node) => getComputedStyle(node).fontSize))].sort();
  });
  assert.deepEqual(sizes, ['10px', '12px', '13px'], 'the chrome carries exactly three type ranks');
}

// LOCK:diagnose-workstation:27
async function assertChromeSurfaces(page) {
  const material = await page.evaluate(() => {
    const selectors = ['.cockpit-shell', '.cockpit-topbar', '.cockpit-stage', '.cockpit-footer', '.cockpit-scope'];
    const bg = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    const backgrounds = [...new Set(selectors.map(bg))];
    return {
      backgrounds,
      surfaces: {
        shell: bg('.cockpit-shell'), desk: bg('.cockpit-stage'), bar: bg('.cockpit-topbar'),
        footer: bg('.cockpit-footer'), control: bg('.cockpit-scope'),
      },
      topRule: getComputedStyle(document.querySelector('.cockpit-topbar')).borderBottomWidth,
      footerRule: getComputedStyle(document.querySelector('.cockpit-footer')).borderTopWidth,
    };
  });
  /* #736 re-settled the count from two to three, and names them rather than
     counting them. Harmonic gives the chrome BAR its own evergreen ground,
     distinct from the desk the stage sits on — that separation is the whole
     point of the "chrome bar" role — and the scope chip is the control ground
     both it and Log carbs share. Three MATERIALS with three jobs (desk, bar,
     control), which is still the guard the two-surface rule was written to be:
     it fails the moment a fourth appears. */
  const { shell, desk, bar, footer, control } = material.surfaces;
  assert.equal(shell, desk, 'the shell and the stage are one desk, not two');
  assert.equal(footer, bar, 'the footer and the top bar are one bar ground, not two');
  assert.equal(new Set([desk, bar, control]).size, 3,
    `desk, bar and control must be three distinct materials: ${desk}, ${bar}, ${control}`);
  assert.equal(material.backgrounds.length, 3,
    `chrome surfaces: ${material.backgrounds.join(', ')}`);
  assert.equal(material.topRule, '0px', 'no chrome-to-chrome hairline under the top bar');
  assert.equal(material.footerRule, '0px', 'no chrome-to-chrome hairline over the footer');
}

test('the page never scrolls, the panes do, and the advisory stays whole on every tab', async () => {
  for (const theme of ['light', 'dark']) {
    for (const viewport of VIEWPORTS) {
      const browser = await launch();
      let page;
      try {
        page = await openApp(browser, { viewport, theme, promptCount: 2 });
        for (const tab of TABS) {
          await chooseTab(page, tab);
          const label = `${tab} at ${viewport.width}x${viewport.height} in ${theme}`;
          await assertViewportFrame(page, label);
          await assertPaneReachability(page, label);
          await assertAdvisoryWhole(page, label);
          await assertPointerTargets(page);
          // The pane walk scrolled the pane; the frame must be untouched by it.
          await assertViewportFrame(page, `${label} after scrolling the pane`);
        }
      } finally { if (page) await page.close(); }
    }
  }
});

test('top bar and footer expose the locked destination inventory and neutral profile facts', async () => {
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, { planDraftItems: [
      { type: 'isf', key: 0, start_min: 0, value: 45 },
      { type: 'isf', key: 360, start_min: 360, value: 42 },
    ], promptCount: 2 });

    await assertDestinationInventory(page);
    assert.equal(await page.locator('.cockpit-profile-facts').innerText(),
      'Pump profile · ISF 40–45 mg/dL/U · I:C 5–6 g/U');
    assert.equal(await page.locator('[data-shell-tab="plan"] .cockpit-badge').innerText(), '2');
    assert.equal(await page.locator('.cockpit-utilities .cockpit-count').innerText(), '2');

    for (const id of TABS) {
      await chooseTab(page, id);
      assert.equal(locationHash(await page.evaluate(() => location.hash)), id);
    }
    await page.locator('.cockpit-glossary').click();
    assert.equal(await page.locator('.glossary[role="dialog"]').isVisible(), true);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.cockpit-theme').click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('dark')), true);
    await page.locator('.cockpit-log-carbs').click();
    const carbForm = page.locator('body > .popover');
    assert.equal(await carbForm.isVisible(), true);
    const carbBox = await carbForm.boundingBox();
    // Bounded by the frame this page actually has, not a hard-coded taller one.
    const frame = await page.evaluate(() => ({
      height: innerHeight,
      topbar: document.querySelector('.cockpit-topbar').getBoundingClientRect().bottom,
    }));
    assert.ok(carbBox && carbBox.y >= frame.topbar, 'the carb form clears the clipped top bar');
    assert.ok(carbBox.y + carbBox.height <= frame.height,
      `the complete carb form fits the ${frame.height}px viewport`);
    await carbForm.locator('input[type="number"]').fill('12');
    assert.equal(await carbForm.locator('input[type="number"]').inputValue(), '12',
      'the teleported carb form remains interactive');
    await carbForm.locator('.pop-x').click();
    await page.locator('.cockpit-questions:visible').click();
    await page.locator('.pq-drawer').waitFor();
    assert.equal(await page.locator('.pq-drawer').isVisible(), true);
  } finally { await page.close(); }
});

function locationHash(hash) {
  return hash.slice(1).split('?')[0];
}

function contrastRatio(foreground, background) {
  const rgb = (color) => color.match(/\d+/g).map(Number).slice(0, 3);
  const luminance = (color) => rgb(color).map((channel) => {
    const unit = channel / 255;
    return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + .05) / (b + .05);
}

/* #736 term 8 re-settled this. Log carbs used to sit on the user-claim ochre
   pair at its own radius and ground — a hollow tinted box in a different
   vocabulary from the SCOPE chip beside it, which is why it read as a web CTA
   rather than a toolbar action. Every control in the chrome now speaks ONE
   vocabulary, and the write action spends its accent on the glyph rather than
   on a filled plate. So the assertion is no longer a pair of literals: it is
   that the button is INDISTINGUISHABLE from the scope chip, that the `+` alone
   carries the accent, and that the label still clears AA on its own ground. */
test('Log carbs speaks the chrome control vocabulary and stays readable', async () => {
    for (const theme of ['light', 'dark']) {
      const browser = await launch();
      try {
        const page = await openApp(browser, { theme, promptCount: 2 });
        const seen = await page.evaluate(() => {
          const read = (sel, props) => {
            const style = getComputedStyle(document.querySelector(sel));
            return Object.fromEntries(props.map((p) => [p, style[p]]));
          };
          const shape = ['color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'borderTopLeftRadius'];
          return {
            button: read('.cockpit-log-carbs', shape),
            chip: read('.cockpit-scope', shape),
            plus: getComputedStyle(document.querySelector('.cockpit-log-carbs .plus')).color,
            accent: getComputedStyle(document.querySelector('.cockpit-topbar'))
              .getPropertyValue('--ck-accent').trim(),
          };
        });
        assert.deepEqual(seen.button, seen.chip,
          `${theme} Log carbs does not match the scope chip's border, ground, radius and ink`);
        assert.notEqual(seen.plus, seen.button.color,
          `${theme} Log carbs spends no accent on its glyph`);
        assert.ok(contrastRatio(seen.button.color, seen.button.backgroundColor) >= 4.5,
          `${theme} Log carbs label meets WCAG AA against its own ground`);
        await page.close();
      } finally { /* browser stays open; closed once in after() */ }
    }
  });

test('cockpit chrome uses only the locked type ranks and three materials', async () => {
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser);
    await assertTypeRanks(page);
    await assertChromeSurfaces(page);
  } finally { if (page) await page.close(); }
});

test('small widths retain a labeled destination drawer without changing desktop cockpit chrome', async () => {
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, { viewport: { width: 390, height: 844 } });
    const drawer = page.locator('.cockpit-drawer');
    const guide = drawer.locator('[data-shell-tab="guide"]');
    assert.equal(await page.locator('.cockpit-menu-button').isVisible(), true);

    // The drawer stays mounted while closed, translated off-canvas. It is inert
    // there, so an off-screen destination is never a focus stop.
    assert.equal(await drawer.evaluate((node) => node.getBoundingClientRect().right <= 0), true,
      'the closed drawer sits off-canvas');
    assert.equal(await guide.evaluate((node) => {
      node.focus();
      return document.activeElement === node;
    }), false, 'the closed off-canvas drawer never takes focus');

    await page.locator('.cockpit-menu-button').click();
    await page.waitForFunction(() =>
      document.querySelector('.cockpit-drawer').getBoundingClientRect().left >= 0);
    assert.deepEqual(await drawer.locator('[data-shell-tab]').allInnerTexts(),
      ['Day', 'Diagnose', 'Verify', 'Plan\n0', 'Settings', 'Guide']);
    const box = await guide.boundingBox();
    assert.ok(box.height >= 44, 'fallback destinations keep 44px targets');

    await page.locator('.cockpit-menu-button').focus();
    for (let index = 0; index < 20; index += 1) {
      await page.keyboard.press('Tab');
      if (await guide.evaluate((node) => document.activeElement === node)) break;
    }
    // The drawer must still be open and on-canvas, or "reachable" proves nothing.
    assert.equal(await page.evaluate(() => {
      const open = document.querySelector('.cockpit-drawer').getBoundingClientRect();
      const focused = document.activeElement.getBoundingClientRect();
      return open.left >= 0 && focused.left >= 0 && focused.right <= innerWidth;
    }), true, 'the drawer stayed open and the focused destination is on-screen');
    assert.equal(await guide.evaluate((node) => document.activeElement === node), true,
      'fallback Guide is keyboard reachable');
    assert.notEqual(await guide.evaluate((node) => getComputedStyle(node).outlineStyle), 'none');
  } finally { if (page) await page.close(); }
});

test('transferred live counts and Verify clinical-color guard remain wired to real state', async () => {
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, { tab: 'verify', promptCount: 2, planDraftItems: [
      { type: 'isf', key: 0, start_min: 0, value: 45 },
      { type: 'isf', key: 360, start_min: 360, value: 42 },
    ] });
    assert.equal(await page.locator('[data-shell-tab="plan"] .cockpit-badge').innerText(), '2');
    assert.equal(await page.locator('.cockpit-questions:visible .cockpit-count').innerText(), '2');

    // #660: the same #609 term-13 guard, on the ported workstation. Readiness is
    // data sufficiency, not a clinical verdict, so neither the strip's state word
    // nor the decision's readiness word may render in the favourable-outcome ink.
    await page.locator('.vw .trial-more').click();
    await page.locator('.vw .trial-pop button', { hasText: 'Carb ratio' }).click();
    await page.waitForFunction(() => document.querySelector('.vw .decide')?.innerText.includes('Ready to judge'));
    const colors = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue('--on-target-ink').trim();
      document.body.appendChild(probe);
      const green = getComputedStyle(probe).color;
      probe.remove();
      return {
        green,
        state: getComputedStyle(document.querySelector('.vw .trial-line .subject .st')).color,
        readiness: getComputedStyle(document.querySelector('.vw .decide .d-status')).color,
      };
    });
    assert.notEqual(colors.state, colors.green);
    assert.notEqual(colors.readiness, colors.green);
  } finally { if (page) await page.close(); }
});

test('each cockpit lock assertion proves red under deliberate mutation and restores', async () => {
  const browser = await launch();
  let page;
  try {
    // Every check below is the shipped assertion itself, so a mutation that
    // leaves it green means the term is not actually gated.
    page = await openApp(browser, { tab: 'settings', promptCount: 2 });
    const style = (selector, property, value) => async () => {
      await page.locator(selector).evaluate((node, [name, next]) =>
        node.style.setProperty(name, next), [property, value]);
      return () => page.locator(selector).evaluate((node, name) =>
        node.style.removeProperty(name), property);
    };

    // Term 1, first clause — the page must not scroll.
    await proveRedOnce('diagnose-workstation:1 (no page scroll)',
      () => assertViewportFrame(page, 'mutation'),
      style('.cockpit-shell', 'height', '110vh'));
    // Term 1, second clause — the pane must scroll internally. Settings is the
    // tab whose content genuinely overflows both locked sizes.
    await proveRedOnce('diagnose-workstation:1 (panes scroll internally)',
      () => assertPaneReachability(page, 'mutation'),
      style('.cockpit-stage > .main-content', 'overflow-y', 'hidden'));

    await proveRedOnce('diagnose-workstation:2',
      () => assertAdvisoryWhole(page, 'mutation'), async () => {
        const advisory = page.locator('.cockpit-advisory');
        await advisory.evaluate((node) => { node.style.width = '120px'; node.style.overflow = 'hidden'; });
        return () => advisory.evaluate((node) => {
          node.style.removeProperty('width'); node.style.removeProperty('overflow');
        });
      });

    // Term 3 — the destination inventory, not one element's label.
    await proveRedOnce('diagnose-workstation:3 (zone order)',
      () => assertDestinationInventory(page), async () => {
        const day = page.locator('.cockpit-day');
        await day.evaluate((node) => node.parentNode.appendChild(node));
        return () => day.evaluate((node) =>
          node.parentNode.insertBefore(node, node.parentNode.querySelector('.cockpit-gap')));
      });
    // Term 3 — Day is off the numbered spine and never a pill.
    await proveRedOnce('diagnose-workstation:3 (Day is not a pill)',
      () => assertDestinationInventory(page),
      style('.cockpit-day', 'border-radius', '999px'));
    // Term 3 — the footer's Guide/Settings recede below the ISF/I:C facts.
    await proveRedOnce('diagnose-workstation:3 (metadata ink)',
      () => assertDestinationInventory(page),
      style('.cockpit-profile-facts', 'color', 'var(--ck-meta)'));

    // Term 26 — a fourth rank anywhere in the chrome, not on a checked element.
    await proveRedOnce('diagnose-workstation:26',
      () => assertTypeRanks(page),
      style('.cockpit-scope-label', 'font-size', '16px'));

    // Term 27 — a third chrome surface, and a chrome-to-chrome hairline.
    await proveRedOnce('diagnose-workstation:27 (two surfaces)',
      () => assertChromeSurfaces(page),
      style('.cockpit-topbar', 'background-color', 'rgb(120, 20, 20)'));
    await proveRedOnce('diagnose-workstation:27 (no hairlines)',
      () => assertChromeSurfaces(page), async () => {
        const footer = page.locator('.cockpit-footer');
        await footer.evaluate((node) => node.style.borderTop = '1px solid red');
        return () => footer.evaluate((node) => node.style.removeProperty('border-top'));
      });
  } finally { if (page) await page.close(); }
});

// Run with COCKPIT_SHOTS=mockups to regenerate the build-side fidelity
// renders the ledger cites — the mock this once paired against is archived
// (#722); the app is now the sole contract artifact. Populated state renders —
// an empty tab body shows nothing about how the chrome sits against real
// content.
test('build renders cover both locked sizes and themes',
  { skip: !SHOTS }, async () => {
  await mkdir(SHOTS, { recursive: true });
  for (const theme of ['light', 'dark']) {
    for (const viewport of VIEWPORTS) {
      const label = `${viewport.width}x${viewport.height}-${theme}`;
      const browser = await launch();
      let production;
      try {
        production = await openApp(browser, {
          viewport, theme, promptCount: 2,
          planDraftItems: [{ type: 'isf', key: 0, start_min: 0, value: 45 },
            { type: 'isf', key: 360, start_min: 360, value: 42 }],
        });
        await production.waitForTimeout(400);
        await production.screenshot({ path: join(SHOTS, `cockpit-shell-build-${label}.png`) });
      } finally { if (production) await production.close(); }
    }
  }
});

test('event comparisons keep the newest View, Factor, Anchor time, Other factors, occurrence, and selection clear',
  async () => {
  const queued = [];
  const waiters = [];
  let defer = false;
  const nextQueued = () => {
    if (queued.length) return Promise.resolve(queued.shift());
    return new Promise((resolve) => waiters.push(resolve));
  };
  const eventProjection = (url, capture) => {
    const view = ['meals', 'lows'].includes(url.searchParams.get('view'))
      ? url.searchParams.get('view') : 'meals';
    const response = projectSyntheticCapture(capture, {
      view,
      factor: url.searchParams.get('factor') || undefined,
      block: url.searchParams.get('block') || 'all',
      another: url.searchParams.get('another') === '1',
      occurrenceId: url.searchParams.get('occ') || undefined,
    });
    if (!defer) return response;
    return new Promise((resolve, reject) => {
      const entry = { response, resolve, reject };
      const waiter = waiters.shift();
      if (waiter) waiter(entry);
      else queued.push(entry);
    });
  };
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, { eventView: 'meals', eventProjection });
    defer = true;

    const expectCoordinate = async ({ view, factor, block, another, occurrenceId }) => {
      await page.waitForFunction((expected) => {
        const projection = window.__diagnoseEventComparison?.projection;
        return projection
          && projection.coordinates.view === expected.view
          && projection.coordinates.factor === expected.factor
          && projection.coordinates.block === expected.block
          && projection.coordinates.another === expected.another
          && (projection.selection.requested_id || null) === expected.occurrenceId;
      }, { view, factor, block, another, occurrenceId });
      assert.equal(await page.locator('.ec-error').count(), 0,
        'a stale response must not replace the current surface with an error');
    };
    // Projection loads run through the shell's serial gate (#425), so at most one
    // is ever in flight: the newer request is not issued until the stale one
    // settles. The guarantee under test is therefore that the stale response is
    // discarded by its generation check rather than rendered — not that two
    // responses race in the browser, which the gate makes impossible.
    const settleRace = async (beginStale, requestCurrent, expected) => {
      await beginStale();
      const stale = await nextQueued();
      await requestCurrent();
      stale.resolve(stale.response);
      const current = await nextQueued();
      current.resolve(current.response);
      await expectCoordinate(expected);
      await page.waitForTimeout(50);
      await expectCoordinate(expected);
    };
    const meals = {
      view: 'meals', factor: 'carb_undercount', block: 'all', another: false,
      occurrenceId: null,
    };

    await settleRace(
      () => page.locator('.ec-view-seg [data-view="lows"]').click(),
      () => page.locator('.ec-view-seg [data-view="meals"]').click(),
      meals,
    );
    await settleRace(
      () => page.locator('#ec-factor').selectOption('late_bolus'),
      () => page.locator('#ec-factor').selectOption('carb_undercount'),
      meals,
    );
    await settleRace(
      () => page.locator('[data-block="overnight"]').click(),
      () => page.locator('[data-block="all"]').click(),
      meals,
    );
    await settleRace(
      () => page.locator('#ec-another').check(),
      () => page.locator('#ec-another').uncheck(),
      meals,
    );
    const occurrences = await page.locator('#ec-occurrence option').evaluateAll((options) =>
      options.slice(1, 3).map((option) => option.value));
    assert.equal(occurrences.length, 2, 'fixture needs two selectable Meals');
    await settleRace(
      () => page.locator('#ec-occurrence').selectOption(occurrences[0]),
      () => page.locator('#ec-occurrence').selectOption(occurrences[1]),
      { ...meals, occurrenceId: occurrences[1] },
    );
    await settleRace(
      () => page.locator('#ec-occurrence').selectOption(occurrences[0]),
      () => page.locator('#ec-clear').click(),
      { ...meals, occurrenceId: null },
    );

    // Rejection takes the same stale branch as a late projection, but must not
    // turn a later successful coordinate into the locked visible-error state.
    await page.locator('#ec-factor').selectOption('late_bolus');
    const staleFailure = await nextQueued();
    await page.locator('#ec-factor').selectOption('carb_undercount');
    staleFailure.reject(new Error('late comparison request failed'));
    const current = await nextQueued();
    current.resolve(current.response);
    await expectCoordinate({ ...meals, occurrenceId: null });
    await page.waitForTimeout(50);
    await expectCoordinate({ ...meals, occurrenceId: null });
  } finally { if (page) await page.close(); }
});

test('event comparisons fail closed when a nested server projection is malformed',
  async () => {
  const eventProjection = (url, capture) => {
    const projection = projectSyntheticCapture(capture, {
      view: url.searchParams.get('view') || 'meals',
    });
    return {
      ...projection,
      cohorts: projection.cohorts.map((cohort, index) => index === 0
        ? { ...cohort, support: 'unknown' } : cohort),
    };
  };
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, {
      eventView: 'meals', eventProjection, expectEventError: true,
    });
    const error = page.locator('.ec-error');
    await error.waitFor();
    assert.equal(await error.innerText(), 'Diagnose event comparison data is unavailable.');
    assert.equal(await page.locator('.ec-surface').count(), 0,
      'a malformed projection must not partially render an evidence lens');
  } finally { if (page) await page.close(); }
});
