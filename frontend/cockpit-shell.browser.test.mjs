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
// ADR 94: the shipped router owns the closed page set and the canonical address
// form, so this suite proves the lifecycle against that owner instead of
// restating its grammar — a restatement would be the third page registry ADR 94
// forbids, and would drift the moment a page gained state.
import { TABS as ROUTER_TABS, parseRoute, serializeRoute } from './tab-routing.js';
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

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP_ROOT = process.env.COCKPIT_APP_ROOT || ROOT;
const FRONTEND = join(APP_ROOT, 'frontend');
const DIAGNOSE_PAYLOAD = JSON.parse(await readFile(
  join(ROOT, 'mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const EVENT_COMPARISON = JSON.parse(await readFile(
  join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const FINDINGS_PROJECTION = JSON.parse(await readFile(
  join(FRONTEND, '__fixtures__/findings-projection.json'), 'utf8'));
const FINDING_CASE_FILES = JSON.parse(await readFile(
  join(ROOT, 'mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));
const COCKPIT_LEDGER = await readFile(join(ROOT, 'mockups/cockpit-shell.behavior.md'), 'utf8');
const REPLAY_SOURCE = await readFile(fileURLToPath(import.meta.url), 'utf8');
const SHOTS = process.env.COCKPIT_SHOTS;
const RENDER_PHASE = process.env.COCKPIT_RENDER_PHASE || 'revision';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const CDN = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);
const ADVISORY = 'Advisory only — review with your clinician before changing pump settings.';
const TABS = ['diagnose', 'plan', 'verify', 'day', 'guide', 'settings'];
// Each page's own rendered root, verified in the browser to be visible on that
// page and hidden on every other one: the panes are `v-show`, so a pane that has
// been visited stays in the DOM and only visibility distinguishes the selected
// page. Waiting on these (Playwright's default `visible` state) is what proves a
// direct load "keeps that page selected" beyond the address bar.
const TAB_READINESS = Object.freeze({
  diagnose: '.dw',
  plan: '.active-profile-ref',
  verify: '.vw',
  day: '.ds-root',
  guide: '.kb',
  settings: '.token-row',
});
// The cockpit marks its selected destination only where it has one. The three
// workflow steps carry aria-current="step" and the Day link carries
// aria-current="page"; Guide and Settings are footer utilities with no selected
// state at cockpit widths — their aria-current lives on the drawer buttons,
// which are `display: none` above 760px. A bare [aria-current] would also match
// the Diagnose breadcrumb's own `.here`, so each marker is qualified to the
// chrome affordance that owns it.
const TAB_SELECTED_NAV = Object.freeze({
  diagnose: '.cockpit-flow [data-shell-tab="diagnose"][aria-current="step"]',
  plan: '.cockpit-flow [data-shell-tab="plan"][aria-current="step"]',
  verify: '.cockpit-flow [data-shell-tab="verify"][aria-current="step"]',
  day: '.cockpit-day[aria-current="page"]',
  guide: null,
  settings: null,
});
// The lifecycle proof below must cover every page the router admits, so the
// suite's own list is pinned to the router's closed set rather than trusted.
assert.deepEqual([...TABS].sort(), ROUTER_TABS.map((tab) => tab.id).sort(),
  'the routing lifecycle proof must cover exactly the router-owned page set');
assert.deepEqual(Object.keys(TAB_READINESS).sort(), [...TABS].sort(),
  'every covered page needs a rendered-root readiness signal');
assert.deepEqual(Object.keys(TAB_SELECTED_NAV).sort(), [...TABS].sort(),
  'every covered page needs a declared selected-nav marker, null where the chrome has none');
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
];
const RETIRED_OCCURRENCE_SOURCE_TOKENS = Object.freeze([
  'occurrenceModal',
  'openOccurrences',
  'closeOccurrences',
  'formatOccurrenceTime',
  'goToOccurrence',
  'modal=occurrences',
]);
const R1_OWNER = 'Connor';
const R1_DATE = '2026-08-18';
const R1_SANCTION = 'the dead `occurrenceModal` hash machinery goes with them.';
const retiredSection = COCKPIT_LEDGER.split('\n## Retired behavior\n')[1]?.split('\n## ')[0];
const retiredHeaderCount = Number(COCKPIT_LEDGER.match(/· retired (\d+)$/m)?.[1]);
const retiredRecords = retiredSection?.match(/^R\d+ ·[^\n]*(?:\n  [^\n]*)*/gm) || [];
assert.equal(retiredRecords.length, retiredHeaderCount,
  'the frozen retired count must match the permanent retirement records');
const r1Records = retiredRecords.filter((record) => record.startsWith('R1 ·'));
assert.equal(r1Records.length, 1, 'the behavior ledger must contain exactly one R1 record');
const r1Record = r1Records[0];
const r1Sanction = r1Record?.match(/^  sanction: ([^·]+) · (\d{4}-\d{2}-\d{2}) · "([^"]+)"$/m);
assert.deepEqual(r1Sanction?.slice(1).map((part) => part.trim()),
  [R1_OWNER, R1_DATE, R1_SANCTION],
  'R1 must match the behavior ledger owner, date, and exact sanction');
const r1SourceTag = REPLAY_SOURCE.match(
  /\/\/ RETIRED:([^:\n]+):(\d{4}-\d{2}-\d{2})\nexport async function R1\(/);
assert.deepEqual(r1SourceTag?.slice(1), r1Sanction?.slice(1, 3).map((part) => part.trim()),
  'R1 must keep its ledger owner/date tag adjacent to the exported replay');

test('the retired occurrence route has no production source', async () => {
  const source = await readFile(join(FRONTEND, 'index.html'), 'utf8');
  const survivors = RETIRED_OCCURRENCE_SOURCE_TOKENS.filter((token) => source.includes(token));
  assert.deepEqual(survivors, [],
    `frontend/index.html still carries retired occurrence-route source: ${survivors.join(', ')}`);
});

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

/** 48 half-hour bins around `mid`, the shape `/api/verify/trials` publishes. */
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
    // An asserting settings row ALWAYS names its direction: the analyzer raises rather
    // than serialize one without it, so a fixture omitting it describes a state the
    // engine cannot produce — and the projection reads it to chip the row.
    { slot: 2, label: '01:00', current: 1, recommended: 1.1, asserts_move: true,
      direction: 'raise', days: 12,
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
      member_start_mins: [720], asserts_move: true, direction: 'lower', priority: 68, n_runs: 10,
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
  const { promptCount = 0, planDraftItems = [], verifyTrials = [maturing, complete] } = options;
  const findingsInput = options.findingsInput || { analysis: analyze, scenarios };
  await page.route('**/*', async (route) => {
    const fixed = (payload) => options.inputDataAge
      ? { ...payload, input_data_age: options.inputDataAge } : payload;
    const requestUrl = route.request().url();
    if (CDN.has(requestUrl)) return route.fulfill({
      body: await readFile(join(VENDOR_DIR, CDN.get(requestUrl))), contentType: 'text/javascript',
    });
    if (requestUrl.includes('fonts.googleapis.com') || requestUrl.includes('fonts.gstatic.com')) return route.abort();
    const url = new URL(requestUrl);
    if (url.pathname === '/api/verify/trials') {
      const selected = url.searchParams.get('selected');
      const trials = verifyTrials;
      return route.fulfill({ json: {
        trials, selected: selected ? detail(trials.find((trial) => trial.id === selected)) : null,
      } });
    }
    if (url.pathname === '/api/prompts') {
      return route.fulfill({ json: Array.from({ length: promptCount }, (_, index) => ({
        anchor_t: `2026-07-1${index}T08:00:00`, kind: 'rise', answer: null,
      })) });
    }
    if (url.pathname === '/api/status') return route.fulfill({
      json: { earliest_data_day: '2026-05-01', latest_data_day: '2026-07-15' },
    });
    if (url.pathname === '/api/pump-settings') return route.fulfill({ json: pumpSettings });
    if (url.pathname === '/api/credentials') return route.fulfill({ json: { configured: false } });
    if (url.pathname === '/api/explore/time-of-day') return route.fulfill({ json: timeOfDay });
    if (url.pathname === '/api/diagnose/finding-case-file-preparation') {
      const windowKey = url.searchParams.get('start_min') === null ? null
        : `${url.searchParams.get('start_min')}-${url.searchParams.get('end_min')}`;
      const preparedBody = structuredClone(FINDING_CASE_FILES.scoped?.[windowKey]?.preparation
        || FINDING_CASE_FILES.preparation);
      if (windowKey && !FINDING_CASE_FILES.scoped?.[windowKey]) {
        const start = Number(url.searchParams.get('start_min'));
        const end = Number(url.searchParams.get('end_min'));
        const label = `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}–${end === 1440 ? '24:00' : `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`}`;
        const identity = `${start.toString(16).padStart(4, '0')}${end.toString(16).padStart(4, '0')}`.repeat(4);
        preparedBody.projection_id = `fp_${identity}`;
        preparedBody.coordinates.window = { scoped: true, start_min: start, end_min: end, label };
        const held = FINDING_CASE_FILES.scoped['0-360'].preparation.rendered_rows;
        preparedBody.rendered_rows.push(...structuredClone(held));
      }
      const window = windowKey ? {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      } : null;
      const projected = projectFindings(findingsInput, window,
        url.searchParams.get('selected_id'));
      const readyRows = new Map(preparedBody.rendered_rows
        .filter((row) => row.case_header?.inspectability === 'ready')
        .map((row) => [row.id, row]));
      preparedBody.findings = structuredClone(projected);
      preparedBody.rendered_rows = structuredClone(projected.rows).flatMap((row) => {
        if (row.register !== 'finding') return [row];
        const ready = readyRows.get(row.id);
        if (!ready) return [];
        return [{ ...row,
          appearances: ready.appearances,
          episodes: ready.episodes,
          evidence: ready.evidence,
          verdict_counts: ready.verdict_counts,
          verdict_counts_by_family: ready.verdict_counts_by_family,
          case_header: ready.case_header }];
      });
      preparedBody.behavioral_case_headers = Object.fromEntries(
        preparedBody.rendered_rows
          .filter((row) => row.case_header?.inspectability === 'ready')
          .map((row) => [row.id, row.case_header]),
      );
      return route.fulfill({ body: JSON.stringify(preparedBody),
        contentType: 'application/json' });
    }
    if (url.pathname === '/api/diagnose/finding-case-file') {
      const finding = FINDING_CASE_FILES.cases[url.searchParams.get('finding_id')];
      const alignment = url.searchParams.get('alignment') || 'clock';
      const occurrence = url.searchParams.get('occ');
      const body = !finding
        ? { detail: { code: 'finding_unavailable', message: 'Finding unavailable.' } }
        : occurrence
          ? (finding[`selected_${alignment}`][occurrence]
            || finding[`unavailable_${alignment}`])
          : finding[alignment];
      return route.fulfill({ status: finding ? 200 : 404, body: JSON.stringify(body),
        contentType: 'application/json' });
    }
    if (url.pathname === '/api/diagnose/event-comparison') {
      return route.fulfill({ status: 404, contentType: 'application/json',
        body: JSON.stringify({ detail: 'retired endpoint' }) });
      /* retired standalone projector retained below only as archived test provenance
         until its dependent story helpers are removed with the next ledger sweep. */
      const project = options.eventProjection || ((requestUrl, capture) =>
        projectSyntheticCapture(capture, {
          view: ['meals', 'lows'].includes(requestUrl.searchParams.get('view'))
            ? requestUrl.searchParams.get('view') : 'meals',
          factor: requestUrl.searchParams.get('factor') || undefined,
          window: requestUrl.searchParams.get('start_min') === null ? null : {
            start_min: Number(requestUrl.searchParams.get('start_min')),
            end_min: Number(requestUrl.searchParams.get('end_min')),
          },
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
    if (url.pathname === '/api/analyze') return route.fulfill({ json: fixed(analyze) });
    // #735: level 1 IS the findings queue, and the workstation fails closed without
    // it — an unserved projection renders "Diagnose is unavailable.", which is an
    // empty body for every scenario that lands on the default Diagnose tab. Project
    // it from this suite's own analyze/scenarios fixtures through the same
    // fixture-only mirror the other browser legs route through.
    if (url.pathname === '/api/diagnose/findings') {
      const scoped = url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      };
      return route.fulfill({ json: projectFindings(findingsInput, scoped,
        url.searchParams.get('selected_id')) });
    }
    if (url.pathname === '/api/explore/exposures') {
      return route.fulfill({ json: options.exposuresInput || {} });
    }
    if (url.pathname === '/api/scenarios') return route.fulfill({ json: scenarios });
    if (url.pathname === '/api/audit/dismissals') return route.fulfill({ json: { dismissals: {} } });
    if (url.pathname === '/api/outcomes/trend') return route.fulfill({ json: {} });
    if (url.pathname === '/api/catalog') return route.fulfill({ json: options.catalog || {} });
    if (url.pathname === '/api/plan' && route.request().method() === 'PUT') {
      return route.fulfill({ json: { items: route.request().postDataJSON().items } });
    }
    if (url.pathname === '/api/plan') return route.fulfill({ json: { items: planDraftItems } });
    if (url.pathname === '/api/plan/history' || url.pathname === '/api/focus') {
      return route.fulfill({ json: { history: [], focuses: [] } });
    }
    if (url.pathname === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    const file = ['/', '/day', '/diagnose', '/verify', '/plan', '/settings', '/guide'].includes(url.pathname)
      ? join(FRONTEND, 'index.html')
      : url.pathname.startsWith('/mockups/') ? join(ROOT, url.pathname.replace(/^\/assets\//, ''))
      : join(FRONTEND, url.pathname.replace(/^\/assets\//, ''));
    try {
      return route.fulfill({
        body: await readFile(file), contentType: MIME[extname(file)] || 'application/octet-stream',
      });
    } catch {
      return route.abort('failed');
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
  const initialHash = options.initialHash || '';
  const query = new URLSearchParams({ view: options.eventView || 'glucose' });
  if (options.state) query.set('mode', options.state);
  const pagePath = `/${options.tab || 'diagnose'}?${query}`;
  await page.goto(initialHash ? `http://ciq.local/?${query}${initialHash}` : `http://ciq.local${pagePath}`);
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
  await waitForTabReady(page, id);
}

async function waitForTabReady(page, id) {
  await page.waitForFunction((tab) => location.pathname === `/${tab}`, id);
  if (TAB_SELECTED_NAV[id]) await page.locator(TAB_SELECTED_NAV[id]).first().waitFor();
  await page.locator(TAB_READINESS[id]).first().waitFor();
}

// ADR 94's canonical address for a page: the clean path is the whole identity,
// no fragment survives, and the query carries that page's own round-tripping
// state and nothing else. Day and Guide resolve a default (a date, an article)
// on arrival and publish it here, which is the bookmarkable page-local state
// #53 guaranteed and #94 moved out of the fragment — so the path is pinned
// exactly while the query is held to what the shipped router serializes for the
// route this very address parses to. A regression to a fragment, to another
// page, or to a foreign or stale query key fails one of the three clauses.
function assertCanonicalAddress(address, id, label) {
  const url = new URL(address, 'http://ciq.local');
  assert.equal(url.hash, '', `${label}: no fragment state survives`);
  assert.equal(url.pathname, `/${id}`, `${label}: the clean page path is the address`);
  const route = parseRoute({ pathname: url.pathname, search: url.search, hash: '' });
  assert.equal(route.page, id, `${label}: the address selects ${id}`);
  // The parsed route names the page's own keys, so a foreign one is caught
  // without asking the serializer — which would answer for both sides at once.
  const own = new Set(Object.keys(route)
    .filter((key) => key !== 'page' && key !== 'pageNamed'));
  assert.deepEqual([...url.searchParams.keys()].filter((key) => !own.has(key)), [],
    `${label}: no state outside ${id}'s own page-local keys rides in the query`);
  assert.equal(serializeRoute(route), `${url.pathname}${url.search}`,
    `${label}: the query is exactly what the router serializes for this route`);
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
  assert.equal(await day.getAttribute('href'), '/day');
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
      assert.equal(await page.evaluate(() => location.pathname), `/${id}`);
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

// A bare `/` arrival names no page, so the shell may choose one for the wearer:
// a maturing Trial promotes the arrival to Verify. That choice hangs on the
// difference between "named no page" and "the router resolved the default",
// which the clean grammar can no longer express as a null page.
test('a bare or hash arrival is promoted to a maturing Trial, and a named page is not', async () => {
  const browser = await launch();
  const promoted = await browser.newPage({ viewport: VIEWPORTS[1] });
  await routeApp(promoted);
  await promoted.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));
  try {
    await promoted.goto('http://ciq.local/');
    await promoted.locator('.vw').waitFor();
    assert.equal(await promoted.evaluate(() => location.pathname), '/verify',
      'the promoted arrival addresses Verify');
  } finally { await promoted.close(); }

  // #94 retired the `#/<page>?...` grammar, so a saved hash link names nothing:
  // it is a bare arrival, and it promotes like one. The fragment names Plan and
  // the wearer still lands on Verify — the hash is not honoured, not migrated,
  // and not treated as an asked-for page.
  const stale = await browser.newPage({ viewport: VIEWPORTS[1] });
  await routeApp(stale);
  await stale.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));
  try {
    await stale.goto('http://ciq.local/#/plan');
    await stale.locator('.vw').waitFor();
    assert.equal(await stale.evaluate(() => location.pathname + location.hash), '/verify',
      'a saved hash link is a bare arrival: promoted, and no fragment survives');
  } finally { await stale.close(); }

  // The same roster must not move a wearer who named a page: the promotion is
  // the shell answering an unasked question, never overriding an asked one.
  const named = await browser.newPage({ viewport: VIEWPORTS[1] });
  await routeApp(named);
  await named.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));
  try {
    await named.goto('http://ciq.local/diagnose');
    await waitForTabReady(named, 'diagnose');
    await named.waitForTimeout(1500);
    assert.equal(await named.evaluate(() => location.pathname), '/diagnose',
      'a named page is never promoted away from');
  } finally { await named.close(); }
});

test('clean page paths own direct load, refresh, history, canonicalization, and local assets', async () => {
  const browser = await launch();
  const direct = await browser.newPage({ viewport: VIEWPORTS[1] });
  const loadedAssets = new Set();
  const misplacedAssets = [];
  // A roster with no maturing Trial, so this page proves canonicalization and
  // nothing else: a maturing Trial legitimately promotes a bare `/` arrival to
  // Verify, which is a different behavior with its own proof below.
  await routeApp(direct, { verifyTrials: [complete] });
  await direct.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));
  direct.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === 'http://ciq.local' && url.pathname.startsWith('/assets/')
        && response.status() === 200) loadedAssets.add(url.pathname);
  });
  direct.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === 'http://ciq.local' && /\.(?:js|css|svg)$/.test(url.pathname)
        && !url.pathname.startsWith('/assets/')) misplacedAssets.push(url.pathname);
  });
  try {
    const address = () => direct.evaluate(() =>
      location.pathname + location.search + location.hash);
    for (const id of TABS) {
      await direct.goto(`http://ciq.local/${id}`);
      await waitForTabReady(direct, id);
      const loaded = await address();
      assertCanonicalAddress(loaded, id, `${id} direct load`);
      await direct.reload();
      await waitForTabReady(direct, id);
      assert.equal(await address(), loaded,
        `${id} refresh restores the same canonical address it was loaded from`);
    }
    await direct.goto('http://ciq.local/');
    await direct.waitForFunction(() => location.pathname === '/diagnose');
    assert.equal(await direct.evaluate(() => location.pathname + location.search + location.hash),
      '/diagnose', 'bare / canonicalizes in place to /diagnose');
    assert.deepEqual(misplacedAssets, [], 'the built app requests no local asset outside /assets');
    for (const path of ['/assets/tab-routing.js', '/assets/data.js', '/assets/shell.css']) {
      assert.ok(loadedAssets.has(path), `${path} loaded successfully through the built app`);
    }
  } finally { await direct.close(); }

  const historyPage = await browser.newPage({ viewport: VIEWPORTS[1] });
  await routeApp(historyPage);
  await historyPage.addInitScript(() => localStorage.setItem('ciq_token', 'fixture-token'));
  try {
    await historyPage.goto('http://ciq.local/diagnose?view=glucose&mode=dense');
    await historyPage.locator('.dw').waitFor();
    await chooseTab(historyPage, 'plan');
    await chooseTab(historyPage, 'verify');
    await historyPage.goBack();
    await historyPage.waitForFunction(() => location.pathname === '/plan');
    assert.equal(await historyPage.locator(TAB_SELECTED_NAV['plan']).first().isVisible(), true,
      'Back restores Plan selection');
    await historyPage.goBack();
    await historyPage.waitForFunction(() => location.pathname + location.search === '/diagnose?view=glucose&mode=dense');
    await historyPage.locator('.dw').waitFor();
    await historyPage.goForward();
    await historyPage.waitForFunction(() => location.pathname === '/plan');
    await historyPage.goForward();
    await historyPage.waitForFunction(() => location.pathname === '/verify');
    assert.equal(await historyPage.locator(TAB_SELECTED_NAV['verify']).first().isVisible(), true,
      'Forward restores Verify selection');
  } finally { await historyPage.close(); }

  // ADR 94 retired the `#/<page>?...` grammar outright — a fragment is not read,
  // not migrated and not honoured — so there is no migration left to prove. What
  // survives is the canonicalization itself: a bare arrival becomes its page
  // address in place, with no history entry, and is not rewritten again on
  // refresh. R1 covers a stale fragment reaching the built app and being dropped
  // rather than routed. The roster carries no maturing Trial, so nothing
  // promotes this arrival off Diagnose while it is being measured.
  const canonical = await browser.newPage({ viewport: VIEWPORTS[1] });
  await routeApp(canonical, { verifyTrials: [complete] });
  await canonical.addInitScript(() => {
    localStorage.setItem('ciq_token', 'fixture-token');
    window.__routeWrites = { pushes: [], replaces: [] };
    for (const [method, key] of [['pushState', 'pushes'], ['replaceState', 'replaces']]) {
      const original = history[method];
      history[method] = function (...args) {
        window.__routeWrites[key].push(String(args[2]));
        return original.apply(this, args);
      };
    }
  });
  try {
    await canonical.goto('http://ciq.local/?view=glucose&mode=dense');
    await canonical.waitForFunction(() => location.pathname + location.search === '/diagnose?view=glucose&mode=dense');
    await canonical.locator('.dw').waitFor();
    assert.deepEqual(await canonical.evaluate(() => window.__routeWrites), {
      pushes: [], replaces: ['/diagnose?view=glucose&mode=dense'],
    }, 'a bare arrival canonicalizes with exactly one replacement and no history entry');
    assert.equal(await canonical.evaluate(() => location.hash), '', 'no fragment survives the arrival');
    await canonical.reload();
    await canonical.locator('.dw').waitFor();
    assert.deepEqual(await canonical.evaluate(() => window.__routeWrites), { pushes: [], replaces: [] },
      'the canonical address is not rewritten again on refresh');
  } finally { await canonical.close(); }
});

function contrastRatio(foreground, background) {
  const parse = (color) => {
    const srgb = color.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/);
    if (srgb) return { channels: srgb.slice(1, 4).map((value) => Number(value) * 255), alpha: Number(srgb[4] ?? 1) };
    const rgb = color.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
    if (rgb) return { channels: rgb.slice(1, 4).map(Number), alpha: Number(rgb[4] ?? 1) };
    throw new Error(`unsupported computed color: ${color}`);
  };
  const ground = parse(background);
  const ink = parse(foreground);
  const painted = ink.channels.map((channel, index) =>
    channel * ink.alpha + ground.channels[index] * (1 - ink.alpha));
  const luminance = (channels) => channels.map((channel) => {
    const unit = channel / 255;
    return unit <= .04045 ? unit / 12.92 : ((unit + .055) / 1.055) ** 2.4;
  }).reduce((total, channel, index) => total + channel * [.2126, .7152, .0722][index], 0);
  const [a, b] = [luminance(painted), luminance(ground.channels)].sort((x, y) => y - x);
  return (a + .05) / (b + .05);
}

// The cockpit shell's first ui-craft behavior freeze. Each exported story owns
// one public interaction or cross-state invariant, and the registry below is
// the single app-only replay seam used by CI and visual evidence capture.
// STORY:cockpit-shell:S1
export async function S1(browser) {
  const page = await openApp(browser, { promptCount: 2 });
  try {
    await assertViewportFrame(page, 'S1');
    await assertPaneReachability(page, 'S1');
    await assertAdvisoryWhole(page, 'S1');
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S2
export async function S2(browser) {
  const page = await openApp(browser, { promptCount: 2 });
  try {
    await assertDestinationInventory(page);
    for (const id of TABS) {
      await chooseTab(page, id);
      assert.equal(await page.evaluate(() => location.pathname), `/${id}`);
    }
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S3
export async function S3(browser) {
  const page = await openApp(browser);
  try {
    await page.locator('.cockpit-theme').click();
    assert.equal(await page.locator('.cockpit-utility-menu').isVisible(), true);
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    assert.equal(await page.locator('html').evaluate((node) => node.classList.contains('dark')), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('theme')), 'dark',
      'theme choice persists');
    assert.equal(await page.locator('.cockpit-utility-menu').isVisible(), false,
      'choosing a theme closes the menu');
    await page.locator('.cockpit-theme').click();
    assert.equal(await page.getByRole('menuitemradio', { name: 'Dark' }).getAttribute('aria-checked'), 'true');
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S4
export async function S4(browser) {
  const page = await openApp(browser);
  try {
    await page.locator('.cockpit-log-carbs').click();
    const form = page.locator('body > .popover');
    await form.locator('input[type="number"]').fill('12');
    assert.equal(await form.locator('input[type="number"]').inputValue(), '12');
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S5
export async function S5(browser) {
  const page = await openApp(browser, { promptCount: 2 });
  try {
    await page.locator('.cockpit-glossary').click();
    assert.equal(await page.locator('.glossary[role="dialog"]').isVisible(), true);
    await page.getByRole('button', { name: 'Close' }).click();
    await page.locator('.cockpit-questions:visible').click();
    await page.locator('.pq-drawer').waitFor();
    assert.equal(await page.locator('.pq-drawer').isVisible(), true);
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S6
export async function S6(browser) {
  const page = await openApp(browser);
  try {
    await assertPointerTargets(page);
    await assertTypeRanks(page);
    await assertChromeSurfaces(page);
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S7
export async function S7(browser) {
  const page = await openApp(browser, { viewport: { width: 390, height: 844 } });
  try {
    await page.locator('.cockpit-menu-button').click();
    await page.waitForFunction(() =>
      document.querySelector('.cockpit-drawer').getBoundingClientRect().left >= 0);
    const destinations = page.locator('.cockpit-drawer [data-shell-tab]');
    assert.deepEqual(await destinations.allInnerTexts(),
      ['Day', 'Diagnose', 'Verify', 'Plan\n0', 'Settings', 'Guide']);
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S8
export async function S8(browser) {
  const page = await openApp(browser, { promptCount: 2, planDraftItems: [
    { type: 'isf', key: 0, start_min: 0, value: 45 },
    { type: 'isf', key: 360, start_min: 360, value: 42 },
  ] });
  try {
    assert.equal(await page.locator('[data-shell-tab="plan"] .cockpit-badge').innerText(), '2');
    assert.equal(await page.locator('.cockpit-utilities .cockpit-count').innerText(), '2');
  } finally { await page.close(); }
}

// STORY:cockpit-shell:S9
export async function S9(browser) {
  for (const theme of ['light', 'dark']) {
    const page = await openApp(browser, { theme });
    try {
      const currentNode = page.locator('.cockpit-step[aria-current="step"]');
      const current = await currentNode.evaluate((node) => {
        const style = getComputedStyle(node);
        const disc = getComputedStyle(node.querySelector('.cockpit-step-number'));
        const bar = getComputedStyle(document.querySelector('.cockpit-topbar'));
        return {
          background: style.backgroundColor,
          border: style.borderTopColor,
          borderWidth: style.borderTopWidth,
          color: style.color,
          bar: bar.backgroundColor,
          disc: disc.backgroundColor,
          geometry: [style.height, style.paddingTop, style.paddingRight,
            style.paddingBottom, style.paddingLeft, style.borderRadius],
        };
      });
      const peerGeometry = await page.locator('.cockpit-step:not([aria-current="step"])').first()
        .evaluate((node) => {
          const style = getComputedStyle(node);
          return [style.height, style.paddingTop, style.paddingRight,
            style.paddingBottom, style.paddingLeft, style.borderRadius];
        });
      assert.equal(current.background, 'rgba(0, 0, 0, 0)', `${theme} current step has no plate fill`);
      assert.deepEqual(current.geometry, peerGeometry, `${theme} current step keeps workflow geometry`);
      assert.equal(current.borderWidth, '1px', `${theme} current step keeps its outline`);
      assert.ok(contrastRatio(current.border, current.bar) >= 3,
        `${theme} current-step outline clears 3:1 against the bar`);
      assert.ok(contrastRatio(current.disc, current.bar) >= 3,
        `${theme} current-step disc clears 3:1 against the bar`);
      assert.ok(contrastRatio(current.color, current.bar) >= 4.5,
        `${theme} current-step label clears 4.5:1 against the bar`);
      await currentNode.focus();
      const focus = await currentNode.evaluate((node) => {
        const style = getComputedStyle(node);
        return { color: style.outlineColor, width: style.outlineWidth, offset: style.outlineOffset };
      });
      assert.equal(focus.width, '2px', `${theme} current step keeps its focus outline`);
      assert.equal(focus.offset, '2px', `${theme} current step keeps its focus offset`);
      assert.ok(contrastRatio(focus.color, current.bar) >= 3,
        `${theme} current-step focus clears 3:1 against the bar`);
      console.log(`cockpit-shell ${theme} current ratios: outline ${contrastRatio(current.border, current.bar).toFixed(2)}, disc ${contrastRatio(current.disc, current.bar).toFixed(2)}, label ${contrastRatio(current.color, current.bar).toFixed(2)}, focus ${contrastRatio(focus.color, current.bar).toFixed(2)}`);
      const transparent = async () => assert.equal(
        await currentNode.evaluate((node) => getComputedStyle(node).backgroundColor),
        'rgba(0, 0, 0, 0)', `${theme} current step has no plate fill`);
      await currentNode.evaluate((node) => node.style.setProperty(
        'background', 'var(--ck-accent-soft)', 'important'));
      await assert.rejects(transparent, undefined,
        `${theme} current-step assertion must fail when its plate fill returns`);
      await currentNode.evaluate((node) => node.style.removeProperty('background'));
      await transparent();
    } finally { await page.close(); }
  }
}

// STORY:cockpit-shell:S10
export async function S10(browser) {
  for (const theme of ['light', 'dark']) {
    const page = await openApp(browser, { theme });
    try {
      await page.locator('.cockpit-theme').click();
      const checked = page.getByRole('menuitemradio', { name: theme === 'light' ? 'Light' : 'Dark' });
      const row = page.getByRole('menuitemradio', { name: theme === 'light' ? 'Dark' : 'Light' });
      await row.hover();
      const seen = await row.evaluate((node) => {
        const style = getComputedStyle(node);
        const menu = getComputedStyle(node.parentElement);
        const probe = document.createElement('i');
        probe.style.background = style.getPropertyValue('--ck-accent-soft').trim();
        probe.style.color = 'var(--ck-accent)';
        node.appendChild(probe);
        const well = getComputedStyle(probe).backgroundColor;
        const accent = getComputedStyle(probe).color;
        probe.style.background = 'color-mix(in srgb, var(--ck-panel) 95%, var(--ck-meta))';
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          background: style.backgroundColor,
          color: style.color,
          panel: menu.backgroundColor,
          well,
          accent,
          expected,
        };
      });
      const checkedStyle = await checked.evaluate((node) => {
        const style = getComputedStyle(node);
        return { color: style.color, background: style.backgroundColor };
      });
      assert.notEqual(seen.background, 'rgba(0, 0, 0, 0)', `${theme} hover paints a lift`);
      assert.equal(seen.background, seen.expected, `${theme} hover uses the exact 95/5 neutral lift`);
      assert.notEqual(seen.background, seen.panel, `${theme} hover is distinct from the panel`);
      assert.notEqual(seen.background, seen.well, `${theme} hover is distinct from the orange well`);
      assert.ok(contrastRatio(seen.color, seen.background) >= 4.5,
        `${theme} unchecked row ink clears 4.5:1 on hover`);
      assert.equal(await checked.getAttribute('aria-checked'), 'true', `${theme} checked state remains semantic`);
      assert.equal(checkedStyle.color, seen.accent, `${theme} checked row resolves to accent ink`);
      assert.ok(contrastRatio(checkedStyle.color, checkedStyle.background) >= 4.5,
        `${theme} checked row ink clears 4.5:1`);
      await row.focus();
      const focus = await row.evaluate((node) => {
        const style = getComputedStyle(node);
        return { color: style.outlineColor, width: style.outlineWidth };
      });
      assert.ok(parseFloat(focus.width) > 0, `${theme} theme row keeps a separate focus outline`);
      assert.ok(contrastRatio(focus.color, seen.background) >= 3,
        `${theme} theme-row focus clears 3:1 against hover`);
      console.log(`cockpit-shell ${theme} menu ratios: unchecked ${contrastRatio(seen.color, seen.background).toFixed(2)}, checked ${contrastRatio(checkedStyle.color, checkedStyle.background).toFixed(2)}, focus ${contrastRatio(focus.color, seen.background).toFixed(2)}`);
      const exactNeutral = async () => assert.equal(
        await row.evaluate((node) => getComputedStyle(node).backgroundColor), seen.expected,
        `${theme} hover uses the exact 95/5 neutral lift`);
      await row.evaluate((node) => node.style.setProperty(
        'background', 'color-mix(in srgb, var(--ck-panel) 50%, var(--ck-meta))', 'important'));
      await assert.rejects(exactNeutral, undefined,
        `${theme} hover assertion must fail when the neutral recipe drifts`);
      await row.evaluate((node) => node.style.removeProperty('background'));
      await exactNeutral();
    } finally { await page.close(); }
  }
}

// STORY:cockpit-shell:S11
export async function S11(browser) {
  const options = { inputDataAge: { revision: 7,
    covers_to: '2026-08-24 08:00:00', newest_covers_to: '2026-08-24 09:00:00' } };
  const page = await openApp(browser, options);
  try {
    const banner = page.locator('.diagnose-data-age[role="status"]');
    await banner.waitFor();
    assert.equal(await banner.innerText(), 'Showing results from data through 2026-08-24 08:00:00.');
    assert.equal(await page.locator('.dw').isVisible(), true, 'stale age keeps Diagnose rendered');
    if (SHOTS) await page.screenshot({ path: join(SHOTS, 'stale-result-banner-1280x800-light.png'), fullPage: true });
    options.inputDataAge = null;
    await page.reload();
    await page.locator('.dw').waitFor();
    assert.equal(await banner.count(), 0, 'fresh fixed responses clear the banner without an empty Diagnose state');
    assert.equal(await page.locator('.dw').isVisible(), true, 'fresh replacement retains rendered Diagnose');
  } finally { await page.close(); }
}

async function assertRetiredOccurrenceRoute(page) {
  assert.equal(await page.evaluate(() => location.pathname + location.search), '/diagnose?view=glucose&mode=dense',
    'the stale occurrence-list URL must canonicalize to /diagnose?view=glucose&mode=dense');
  const duplicates = await page.evaluate(() => ({
    dialogs: [...document.querySelectorAll('[role="dialog"]')]
      .filter((node) => /occurrences/i.test(
        node.getAttribute('aria-label') || node.getAttribute('aria-labelledby') || node.textContent || ''))
      .length,
    outsideRoster: [...document.querySelectorAll('.ev-group, .ev-row')]
      .filter((node) => !node.closest('#level')).length,
  }));
  assert.deepEqual(duplicates, { dialogs: 0, outsideRoster: 0 },
    'no accessible occurrences dialog or second occurrence roster may exist');
}

async function openRetiredOccurrence(browser, options = {}) {
  const lever = FINDINGS_PROJECTION.inputs.scenarios.patterns[0].lever;
  assert.ok(lever, 'R1 requires a generated scenario lever');
  const page = await openApp(browser, {
    ...options,
    state: 'dense',
    initialHash: `#diagnose?modal=occurrences&detector=${encodeURIComponent(lever)}`,
    findingsInput: {
      analysis: FINDINGS_PROJECTION.inputs.analysis,
      exposures: FINDINGS_PROJECTION.inputs.exposures,
      scenarios: FINDINGS_PROJECTION.inputs.scenarios,
    },
    exposuresInput: FINDINGS_PROJECTION.inputs.exposures,
  });
  await page.locator('.inspector[aria-labelledby="crumb-trail"]').waitFor();
  const row = page.locator('#level .qrow[data-state="finding"]').first();
  try {
    await row.waitFor({ timeout: 5_000 });
  } catch (error) {
    const level = await page.locator('#level').innerText();
    const states = await page.locator('#level .qrow').evaluateAll((nodes) =>
      nodes.map((node) => `${node.dataset.state}:${node.dataset.id}`));
    throw new Error(`R1 did not render a fixture-backed finding row; states=${states.join(',')}; level=${level}`, {
      cause: error,
    });
  }
  await assertRetiredOccurrenceRoute(page);
  await row.click();
  await page.locator('#level .ev-group .n').waitFor();
  assert.ok(await page.locator('#level .ev-row').count() > 0,
    'the public finding row must populate occurrence rows in Findings');
  await assertRetiredOccurrenceRoute(page);
  return page;
}

// STORY:cockpit-shell:R1
// RETIRED:Connor:2026-08-18
export async function R1(browser) {
  const page = await openRetiredOccurrence(browser);
  try {
    await proveRedOnce('R1 canonical route',
      () => assertRetiredOccurrenceRoute(page), async () => {
        await page.evaluate(() => history.replaceState(null, '',
          '/diagnose?modal=occurrences&detector=mutation'));
        return () => page.evaluate(() => history.replaceState(null, '',
          '/diagnose?view=glucose&mode=dense'));
      });
    await proveRedOnce('R1 duplicate occurrence route',
      () => assertRetiredOccurrenceRoute(page), async () => {
        await page.evaluate(() => {
          const dialog = document.createElement('div');
          dialog.id = 'r1-retired-route-mutation';
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-label', 'Occurrences');
          dialog.innerHTML = '<div class="ev-group">Retired roster</div>';
          document.body.append(dialog);
        });
        return () => page.locator('#r1-retired-route-mutation').evaluate((node) => node.remove());
      });

    const output = `cockpit-shell retirement R1: ${r1Sanction[1].trim()} · ${r1Sanction[2].trim()} · "${r1Sanction[3].trim()}"`;
    const captured = [];
    const originalLog = console.log;
    console.log = (...parts) => {
      captured.push(parts.join(' '));
      originalLog(...parts);
    };
    try { console.log(output); }
    finally { console.log = originalLog; }
    assert.deepEqual(captured, [output], 'R1 must capture its ledger-validated sanction output');
  } finally { await page.close(); }
}

export const COCKPIT_SHELL_STORIES = Object.freeze([
  S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, R1,
]);

test('cockpit shell behavior ledger replays every registered story', async () => {
  assert.ok(COCKPIT_SHELL_STORIES.length > 0, 'the cockpit shell registry must not be empty');
  const browser = await launch();
  for (const story of COCKPIT_SHELL_STORIES) await story(browser);
  console.log(`cockpit-shell applicable stories: ${COCKPIT_SHELL_STORIES.length}`);
});

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

test('Diagnose and Verify pane headers meet on one seam at every desktop size and theme', async () => {
  const mismatches = [];
  if (SHOTS) await mkdir(SHOTS, { recursive: true });
  for (const viewport of VIEWPORTS) {
    for (const theme of ['light', 'dark']) {
      for (const surface of ['diagnose', 'verify']) {
        const browser = await launch();
        let page;
        try {
          page = await openApp(browser, { viewport, theme, tab: surface });
          const root = surface === 'diagnose' ? '.dw' : '.vw';
          await page.locator(root).waitFor();
          const populated = surface === 'diagnose' ? '.dw .qrow' : '.vw .trial-line';
          await page.locator(populated).first().waitFor();
          // This fixture opener is intentionally network-free, so it cannot load
          // the shipped Inter webfont. Pin the 14px line box observed in the safe
          // running app; otherwise Chromium's fallback font hides the 30px/31px
          // split this gate exists to catch.
          await page.addStyleTag({ content:
            `${root} .pane > header h2, ${root} .pane > header .meta { line-height: 14px; }` });
          const canvasHeader = surface === 'diagnose'
            ? '.canvas-pane > header' : '.panes > .pane:first-child > header';
          const seam = await page.evaluate(({ selector, canvasSelector }) => {
            const rect = (suffix) => {
              const box = document.querySelector(`${selector} ${suffix}`).getBoundingClientRect();
              return { top: box.top, right: box.right, bottom: box.bottom, left: box.left };
            };
            const canvas = rect(canvasSelector);
            const inspector = rect('.inspector > header');
            return {
              canvas,
              inspector,
              populated: selector === '.dw'
                ? document.querySelectorAll(`${selector} .qrow`).length > 0
                : Boolean(document.querySelector(`${selector} .trial-line`)),
            };
          }, { selector: root, canvasSelector: canvasHeader });
          const label = `${surface} ${viewport.width}x${viewport.height} ${theme}`;
          assert.equal(seam.populated, true, `${label} mounts its populated workstation`);
          assert.ok(seam.canvas.left < seam.inspector.left,
            `${label} keeps the canvas and inspector side by side`);
          if (seam.canvas.top !== seam.inspector.top || seam.canvas.bottom !== seam.inspector.bottom) {
            mismatches.push({
              label,
              canvas: { top: seam.canvas.top, bottom: seam.canvas.bottom },
              inspector: { top: seam.inspector.top, bottom: seam.inspector.bottom },
            });
          }
          if (SHOTS) {
            await page.screenshot({
              path: join(SHOTS, `header-seam-${surface}-${viewport.width}x${viewport.height}-${theme}.png`),
              fullPage: true,
            });
          }
        } finally { if (page) await page.close(); }
      }
    }
  }
  assert.deepEqual(mismatches, [],
    'canvas and inspector header top and bottom border coordinates must match');
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
        await production.locator('.cockpit-theme').click();
        await production.getByRole('menuitemradio', {
          name: theme === 'light' ? 'Dark' : 'Light',
        }).hover();
        await production.waitForTimeout(400);
        const current = production.locator('.cockpit-step[aria-current="step"]');
        assert.equal(await current.count(), 1, `${label} renders one current workflow step`);
        assert.equal(await production.locator('.cockpit-utility-menu').isVisible(), true,
          `${label} renders the open theme menu`);
        const path = join(SHOTS, `cockpit-shell-${RENDER_PHASE}-${label}.png`);
        await production.screenshot({ path });
        const image = await readFile(path);
        assert.ok(image.length > 0, `${label} writes a populated ${RENDER_PHASE} capture`);
      } finally { if (production) await production.close(); }
    }
  }
});

test('retired occurrence route evidence covers both desktop sizes and themes',
  { skip: !SHOTS }, async () => {
  await mkdir(SHOTS, { recursive: true });
  for (const theme of ['light', 'dark']) {
    for (const viewport of VIEWPORTS) {
      const label = `${viewport.width}x${viewport.height}-${theme}`;
      const browser = await launch();
      let page;
      try {
        page = await openRetiredOccurrence(browser, { viewport, theme });
        const path = join(SHOTS, `occurrence-retirement-${RENDER_PHASE}-${label}.png`);
        await page.screenshot({ path });
        assert.ok((await readFile(path)).length > 0,
          `${label} writes a populated ${RENDER_PHASE} retirement capture`);
      } finally { if (page) await page.close(); }
    }
  }
});

// RETIRED (issue #41) — this story asserted the newest-response race guard
// across View, Factor, the retired anchor-time block, Other factors and
// all driven through controls that no longer exist. ADR 31 part 3 folds
// View's function into the workstation's own ALIGN instrument and deletes
// View; the rest retire under P52, sanctioned:
//   owner ruling, 2026-08-19 (see the behavior ledger) · "Decided in a ruling
//   session on 2026-08-19."
// Failed first against the new build with the OLD assertion: a real 30s
// Playwright timeout, `waiting for locator('.ec-view-seg [data-view="lows"]')`
// — that control, and every other one this story drove, is gone. Replaced
// with a loud absence assertion (the S26 pattern): every retired control is
// confirmed gone from the lens, and the lens is confirmed to still be exactly
// canvas + legend + readout — the P52 ruling ("the lens becomes canvas-only")
// checked on the live surface, not just read off the diff.
test('event comparisons: View, Factor, the retired anchor-time block, Other factors, the occurrence select and Clear trace are gone; the lens is canvas-only',
  async () => {
  const eventProjection = (url, capture) => {
    const view = ['meals', 'lows'].includes(url.searchParams.get('view'))
      ? url.searchParams.get('view') : 'meals';
    return projectSyntheticCapture(capture, {
      view,
      factor: url.searchParams.get('factor') || undefined,
      window: url.searchParams.get('start_min') === null ? null : {
        start_min: Number(url.searchParams.get('start_min')),
        end_min: Number(url.searchParams.get('end_min')),
      },
      another: url.searchParams.get('another') === '1',
      occurrenceId: url.searchParams.get('occ') || undefined,
    });
  };
  const browser = await launch();
  let page;
  try {
    page = await openApp(browser, { eventView: 'meals', eventProjection });
    await page.waitForFunction(() =>
      window.__diagnoseEventComparison?.projection?.coordinates?.view === 'meals');

    for (const selector of [
      '.ec-view-seg', '#ec-factor', '.ec-block-seg', '#ec-another',
      '#ec-occurrence', '#ec-clear', '.ec-inspector', '#ec-occ-detail', '#ec-rescue',
    ]) {
      assert.equal(await page.locator(selector).count(), 0, `${selector} did not retire`);
    }
    // What remains: the canvas, its legend and its hover readout — populated,
    // not merely absent-of-error.
    assert.ok(await page.locator('#ec-chart').isVisible(), 'the canvas itself did not render');
    assert.ok((await page.locator('.ec-key-item').count()) > 0, 'the cohort legend did not render');
    assert.equal(await page.locator('.ec-error').count(), 0);
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
