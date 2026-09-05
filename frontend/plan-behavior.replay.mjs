// Behaviour replay for the Plan surface — the executable half of the frozen
// Plan behaviour ledger, a private design record beside the other surface
// ledgers (#344).
//
// WHY THIS EXISTS: Plan is a shipped surface being revised in place. A still
// frame cannot prove that a hand-edit flags its cell and clears again on
// revert, that a second family is refused at the keyboard, that removing a
// chip persists the draft, or that Verify's Revert lands here with the prior
// setting staged. Each story below performs the behaviour against the BUILT
// app and asserts what it actually does. No mock exists on this path; the app
// is the sole contract artifact, so `TARGET` must be `app`.
//
//   PLAYWRIGHT_MODULE=<playwright> VENDOR_DIR=<vendored echarts+vue> \
//   TARGET=app [ONLY=S1,S7] [VIEWPORT=1440x900] [PLAN_EVIDENCE_DIR=<dir>] \
//   node frontend/plan-behavior.replay.mjs
//
// The opener serves the app's own static files from this checkout and answers
// every API read from inline synthetic fixtures: the four-segment profile and
// the noon carb-ratio pick that frontend/plan-first-match.browser.mjs already
// uses. It records every draft PUT and apply POST so stories can assert what
// the surface persisted. The QA showcase database holds no draft and no apply
// history (ledger header), so the states past nothing-staged exist only here.
//
// FAILS CLOSED. A missing driver or vendored asset exits nonzero. An unstubbed
// API request is an opener problem that fails the run. A run that executed
// zero stories is a failure, never a skip.
import { createRequire } from 'node:module';
import { readFile, access, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TABS as ROUTER_TABS } from './tab-routing.js';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PAGE_PATHS = new Set(['/', ...ROUTER_TABS.map((tab) => `/${tab.id}`)]);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };
const CDN = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);

export class ReplayError extends Error {}
const fail = (msg) => { throw new ReplayError(msg); };
export const ok = (cond, what) => { if (!cond) fail(what); };
export const is = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
};
const problems = [];

const evidenceDir = process.env.PLAN_EVIDENCE_DIR || null;
const viewportLabel = () => process.env.VIEWPORT || '1440x900';
async function captureEvidence(page, label) {
  if (!evidenceDir) return;
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: join(evidenceDir, `${label}-${viewportLabel()}.png`), fullPage: false });
}

/* ------------------------------------------------------------------ fixtures */

/** The pump's active profile. `noonCarbRatio` is what the pump holds at 12:00
    (5.4 = not keyed yet, 5.7 = keyed exactly, 5.1 = mis-keyed). */
export function pumpSettings({ noonCarbRatio = 5.4, fetchedAt = '2026-07-20 08:00:00' } = {}) {
  return {
    configured: true, fetched_at: fetchedAt, other_profile_count: 1,
    profile: {
      name: 'P005', idp: 5, dia_hours: 5, max_bolus: 10, carb_entry: true,
      segments: [
        { start_min: 0, basal_rate: 0.6, isf: 50, carb_ratio: 10, target_bg: 110 },
        { start_min: 360, basal_rate: 0.75, isf: 45, carb_ratio: 8, target_bg: 110 },
        { start_min: 720, basal_rate: 0.7, isf: 50, carb_ratio: noonCarbRatio, target_bg: 110 },
        { start_min: 1320, basal_rate: 0.6, isf: 55, carb_ratio: 10, target_bg: 110 },
      ],
    },
  };
}
/** The staged change: noon I:C 5.4 → 5.7, an accepted Diagnose pick. */
export const NOON_IC = { type: 'ic', key: 720, start_min: 720, label: '12:00', current: 5.4, value: 5.7, recommended: 5.7 };
const HISTORY_ROW = { applied_at: '2026-06-14 18:40:00', items: [{ type: 'ic', start_min: 1080, label: 'I:C 18:00 8 → 7.5' }] };

const completeTrial = {
  id: 'carb_ratio-720-20260628090000', parameter: 'carb_ratio', slot: '12:00',
  changed_at: '2026-06-28 09:00:00', before: 5, after: 4.6,
  target_metrics: ['arc'], state: 'complete',
  maturing: { days_elapsed: 14, days_required: 14, gap_count: 0 },
};
const envelope = (mid) => Array.from({ length: 48 }, (_, i) => ({
  t: `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
  n: 12, med: Math.round(mid + 28 * Math.sin((i / 48) * 2 * Math.PI)),
}));
/** One complete Trial whose Revert stages the prior noon I:C back into Plan. */
function trialDetail(planRoute) {
  return {
    ...completeTrial,
    before_period: { start: '2026-06-12 09:00:00', end: '2026-06-26 09:00:00' },
    trial_period: { start: '2026-06-28 09:00:00', end: '2026-07-12 00:00:00' },
    focus: { available: true },
    readiness: { label: 'Ready to judge', message: 'This Trial is ready for a before-and-Trial read.' },
    evidence: [
      { key: 'arc', role: 'target',
        before: { peak: 176, nadir: 100, n_peak: 24, n_nadir: 24 },
        trial: { peak: 170, nadir: 104, n_peak: 28, n_nadir: 28 },
        rescue_context: { count: 3, grams: 20, unknown_count: 1 } },
      { key: 'tir', role: 'guardrail', before: { value: 81.6, n_readings: 4010 }, trial: { value: 86.1, n_readings: 4021 } },
      { key: 'tbr', role: 'guardrail', before: { value: 2.8, n_readings: 4010 }, trial: { value: 2.2, n_readings: 4021 } },
    ],
    plan_route: planRoute,
    limits: ['The evidence is limited to the selected Before and Trial periods.'],
    changes: [{ parameter: 'carb_ratio', slot: '12:00', slots_changed: 6, uniform: true, before: 5, after: 4.6 }],
    envelopes: { before_period: envelope(150), trial_period: envelope(138) },
    rescue: { before_period: { n: 6, grams: 90, n_unknown: 1, n_low_prompt: 3 }, trial_period: { n: 4, grams: 60, n_unknown: 0, n_low_prompt: 1 } },
    day_rows: { before_period: Array.from({ length: 15 }, () => ({})), trial_period: Array.from({ length: 15 }, () => ({})) },
  };
}
export const REVERT_ROUTE = {
  mode: 'stage-prior', label: 'Reverting the 06-28 carb-ratio change',
  message: 'The prior noon I:C is staged below; key it into the pump to undo the Trial.',
  draft: { items: [{ type: 'ic', key: 720, start_min: 720, label: '12:00', current: 5.4, value: 5.0, recommended: 5.0 }] },
};

/* ------------------------------------------------------------------- opener */

/** VIEWPORT=WIDTHxHEIGHT, else the workstation's 1440x900 review viewport. */
function envViewport() {
  const raw = process.env.VIEWPORT;
  if (!raw) return { width: 1440, height: 900 };
  const [width, height] = raw.split('x').map(Number);
  if (!Number.isInteger(width) || !Number.isInteger(height)) fail(`VIEWPORT must be WIDTHxHEIGHT, got ${raw}`);
  return { width, height };
}

/**
 * The BUILT Plan surface, its API answered from the fixtures above.
 *
 * `items` is the persisted draft, `pump` the /api/pump-settings answer (an
 * object, or `'error'` for a 500, or `'unconfigured'`), `history` the apply
 * history, `delayPumpMs` holds the pump answer so the loading copy can be read,
 * and `tab` opens another surface first. Every draft PUT lands in `puts`,
 * every apply POST in `applies`; after an apply the history answer grows by
 * one row so the surface's reload observes it.
 */
export async function openApp(browser, {
  items = [], pump = pumpSettings(), history = [], delayPumpMs = 0, tab = 'plan',
  planRoute = null, viewport = envViewport(),
} = {}) {
  const vendorDir = process.env.VENDOR_DIR || fail('VENDOR_DIR is required (echarts.min.js, vue.esm-browser.js)');
  const puts = []; const applies = [];
  let draft = structuredClone(items);
  let historyRows = structuredClone(history);
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => problems.push(`pageerror(${tab}): ${e}`));
  await page.addInitScript(() => { localStorage.setItem('ciq_token', 'behaviour-replay'); });
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/*', async (route) => {
    const req = route.request();
    const href = req.url();
    if (CDN.has(href)) return route.fulfill({ body: await readFile(join(vendorDir, CDN.get(href))), contentType: 'text/javascript' });
    const url = new URL(href);
    const path = url.pathname;
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204, body: '' });
    if (path === '/favicon.ico') return route.fulfill({ status: 204, body: '' });
    if (path === '/api/pump-settings') {
      if (delayPumpMs) await new Promise((r) => setTimeout(r, delayPumpMs));
      if (pump === 'error') return json(route, { detail: 'synthetic pump-settings failure' }, 500);
      if (pump === 'unconfigured') return json(route, { configured: false });
      return json(route, pump);
    }
    if (path === '/api/plan' && req.method() === 'PUT') {
      draft = req.postDataJSON().items || [];
      puts.push(structuredClone(draft));
      return json(route, { items: draft, updated_at: '2026-07-20 08:01:00' });
    }
    if (path === '/api/plan/apply' && req.method() === 'POST') {
      applies.push(structuredClone(draft));
      historyRows = [{ applied_at: '2026-07-20 08:02:00', items: draft.map((i) => ({ ...i, label: `${i.type} ${i.label}` })) }, ...historyRows];
      return json(route, { applied_at: '2026-07-20 08:02:00', items: draft });
    }
    if (path === '/api/plan') return json(route, { items: draft });
    if (path === '/api/plan/history') return json(route, { history: historyRows });
    if (path === '/api/status') return json(route, { earliest_data_day: '2026-06-20', latest_data_day: '2026-07-20' });
    if (path === '/api/credentials') return json(route, { configured: true });
    if (path === '/api/analyze') return json(route, { basal: [], isf: [], ic: [], behavioral: [], epochs: [], settling: {} });
    if (path === '/api/scenarios') return json(route, { patterns: [], low_confidence: [], episodes: {}, priority_active_threshold: 30 });
    if (path === '/api/backtest' || path === '/api/outcomes/trend' || path === '/api/catalog') return json(route, {});
    if (path === '/api/day-navigator') return json(route, { days: [] });
    if (path === '/api/prompts' || path === '/api/carbs') return json(route, []);
    if (path === '/api/focus') return json(route, { focuses: [] });
    if (path === '/api/audit/dismissals') return json(route, { dismissals: {} });
    if (path === '/api/verify/trials') {
      const selected = url.searchParams.get('selected');
      return json(route, { trials: [completeTrial], selected: selected ? trialDetail(planRoute) : null });
    }
    // The Diagnose handoff (S8) leaves this surface; what Diagnose renders on
    // a failed read is Diagnose's own ledger's business, not Plan's.
    if (path.startsWith('/api/diagnose/') || path.startsWith('/api/explore/')) {
      return json(route, { error: 'not this ledger', detail: 'Plan replay serves no Diagnose evidence' }, 503);
    }
    if (path.startsWith('/api/')) {
      problems.push(`unstubbed ${req.method()} ${path} (${tab})`);
      return json(route, { detail: 'not stubbed' }, 404);
    }
    const file = PAGE_PATHS.has(path) ? join(ROOT, 'frontend/index.html')
      : path.startsWith('/mockups/') ? join(ROOT, path)
      : join(ROOT, 'frontend', path.replace(/^\/assets\//, ''));
    try {
      return route.fulfill({ body: await readFile(file), contentType: MIME[extname(file)] || 'application/octet-stream' });
    } catch {
      problems.push(`missing static ${path}`);
      return route.abort('failed');
    }
  });
  await page.goto(`http://plan.local/${tab}`);
  if (tab === 'plan' && pump !== 'error' && pump !== 'unconfigured' && !delayPumpMs) {
    await page.waitForSelector('.active-profile-ref', { timeout: 15000 });
    await page.waitForFunction(() => location.pathname === '/plan');
  }
  return Object.assign(page, { puts, applies });
}

/* ------------------------------------------------------------- page readers */

/** One structured read of the rendered Plan surface. */
export const state = (page) => page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const all = (s) => [...document.querySelectorAll(s)];
  const txt = (s) => q(s)?.innerText.replace(/\s+/g, ' ').trim() ?? null;
  /* Containers are found by their shipped headings, never by chrome class:
     the block whose heading reads "Deliverable — pump-ready …", the block whose
     heading reads "Accepted changes", the block whose heading reads "Apply
     history". A recomposition may change every container class; the headings
     and the controls inside them are the contract. */
  const heading = (re) => all('h1, h2, h3, .section-title, summary').find((h) => re.test(h.innerText.replace(/\s+/g, ' ')));
  const block = (h) => h ? (h.closest('.card, .pane, .blk, section, details') || h.parentElement) : null;
  const deliverable = block(heading(/Deliverable — pump-ready/));
  const accepted = block(heading(/^Accepted changes/));
  const historyBlock = block(heading(/Apply history/i));
  const rows = deliverable ? [...deliverable.querySelectorAll('table:not(.reconcile-diff) tbody tr')] : [];
  const cell = (row, i) => row.querySelectorAll('td.deliverable-cell')[i];
  return {
    path: location.pathname,
    profileSummary: txt('.active-profile-ref summary'),
    profileOpen: q('.active-profile-ref')?.open ?? null,
    profileRows: all('.active-profile-ref tbody tr').map((r) => [...r.children].map((c) => c.innerText.trim())),
    chips: all('.accepted-chip').map((c) => ({
      text: c.innerText.replace(/\s+/g, ' ').trim(), edited: c.classList.contains('edited'),
    })),
    chipCount: accepted?.querySelector('.pill')?.innerText.trim() ?? null,
    nothingAccepted: /Nothing accepted yet/.test(document.body.innerText),
    deliverableText: deliverable?.innerText.replace(/\s+/g, ' ').trim() ?? null,
    segmentPill: deliverable ? { text: deliverable.querySelector('.pill').innerText.trim(), warn: deliverable.querySelector('.pill').classList.contains('warn') } : null,
    rows: rows.map((r) => ({
      start: r.querySelector('td').innerText.replace(/\s+/g, ' ').trim(),
      newBreak: !!r.querySelector('.pill.warn'),
      cells: [0, 1, 2, 3].map((i) => {
        const c = cell(r, i);
        return {
          value: c.querySelector('input.plan-value').value,
          prov: [...c.classList].find((k) => k.startsWith('prov-')) || null,
          hint: c.querySelector('.plan-cell .muted')?.innerText.trim() ?? null,
          editedLabel: /✎ edited/.test(c.innerText),
        };
      }),
    })),
    onPump: txt('.data-quality-banner'),
    mismatch: q('.reconcile-mismatch') ? {
      head: txt('.reconcile-mismatch-head'),
      rows: all('.reconcile-diff tbody tr').map((r) => [...r.children].map((c) => c.innerText.trim())),
      buttons: all('.reconcile-actions button').map((b) => b.innerText.trim()),
    } : null,
    historyRows: historyBlock ? [...historyBlock.querySelectorAll('table tbody tr')].map((r) => [...r.children].map((c) => c.innerText.trim())) : [],
    historyVisible: !!historyBlock,
    guidance: q('.plan-review-guidance') ? { label: txt('.plan-review-guidance h2'), message: txt('.plan-review-guidance p') } : null,
    toast: txt('.toast'),
    topbar: (() => { const r = q('.cockpit-topbar')?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.height), Math.round(r.width)] : null; })(),
  };
});

/** Type into a deliverable cell and fire the change the handler listens for. */
async function setCell(page, rowIndex, colIndex, value) {
  const input = page.locator(':is(.card, .pane, .blk, section)', { has: page.locator(':is(h1, h2, h3, .section-title)', { hasText: 'Deliverable — pump-ready' }) })
    .last().locator('table:not(.reconcile-diff) tbody tr').nth(rowIndex).locator('input.plan-value').nth(colIndex);
  await input.fill(String(value));
  await input.dispatchEvent('change');
}
const settle = (page, ms = 150) => page.waitForTimeout(ms);

/* ------------------------------------------------------------------ stories */

// STORY:plan:S1
export const S1 = async (browser) => {
  const page = await openApp(browser);
  try {
    let s = await state(page);
    ok(/Active profile — P005/.test(s.profileSummary), `profile summary names the profile: ${s.profileSummary}`);
    ok(/DIA 5h · max bolus 10U · carb entry on/.test(s.profileSummary), `profile summary carries DIA, max bolus, carb entry: ${s.profileSummary}`);
    ok(/1 other profile not analyzed/.test(s.profileSummary), 'other-profiles pill present');
    is(s.profileOpen, false, 'reference is collapsed on arrival');
    await page.locator('.active-profile-ref summary').click();
    s = await state(page);
    is(s.profileOpen, true, 'reference opens on its summary');
    is(s.profileRows, [['00:00', '0.6', '50', '10', '110'], ['06:00', '0.75', '45', '8', '110'],
      ['12:00', '0.7', '50', '5.4', '110'], ['22:00', '0.6', '55', '10', '110']], 'reference table rows');
    await captureEvidence(page, 'S1');
  } finally { await page.close(); }
};

// STORY:plan:S2
export const S2 = async (browser) => {
  let page = await openApp(browser, { pump: 'unconfigured' });
  try {
    await page.waitForFunction(() => /No pump settings fetched yet/.test(document.body.innerText));
    ok(!(await state(page)).profileSummary, 'unconfigured shows no reference');
  } finally { await page.close(); }
  page = await openApp(browser, { pump: 'error' });
  try {
    await page.waitForFunction(() => /synthetic pump-settings failure|pump-settings/.test(document.body.innerText));
    ok(!(await state(page)).profileSummary, 'a failed read shows no reference');
  } finally { await page.close(); }
  page = await openApp(browser, { delayPumpMs: 1500 });
  try {
    await page.waitForFunction(() => /Loading pump settings…/.test(document.body.innerText), null, { timeout: 5000 });
    await page.waitForSelector('.active-profile-ref', { timeout: 15000 });
  } finally { await page.close(); }
};

// STORY:plan:S3
export const S3 = async (browser) => {
  const page = await openApp(browser);
  try {
    const s = await state(page);
    ok(s.nothingAccepted, 'nothing-accepted copy present');
    is(s.chips, [], 'no chips');
    is(s.chipCount, '0', 'accepted count reads 0');
    is(s.segmentPill, { text: '4 / 16 segments', warn: false }, 'segment count pill');
    ok(/matches your current pump settings — nothing to program yet/.test(s.deliverableText), 'matches-pump copy');
    is(s.rows.map((r) => r.cells.map((c) => c.prov)), Array(4).fill(Array(4).fill('prov-current')), 'every cell is current');
    ok(s.rows.every((r) => r.cells.every((c) => c.hint === null)), 'no current → hints');
    ok(s.puts === undefined || page.puts.length === 0, 'arrival persists nothing');
    await captureEvidence(page, 'S3');
    await page.locator('.plan-diagnose-link').click();
    await page.waitForFunction(() => location.pathname === '/diagnose');
  } finally { await page.close(); }
};

// STORY:plan:S4
export const S4 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC] });
  try {
    const s = await state(page);
    is(s.chips.length, 1, 'one chip');
    ok(/^I:C 12:00 5\.4 → 5\.7/.test(s.chips[0].text), `chip reads type, time, current → value: ${s.chips[0].text}`);
    is(s.chips[0].edited, false, 'chip is not flagged edited');
    is(s.chipCount, '1', 'accepted count reads 1');
    const noon = s.rows.find((r) => r.start === '12:00');
    is(noon.cells[2], { value: '5.7', prov: 'prov-accepted', hint: '5.4 →', editedLabel: false }, 'noon I:C cell shows the accepted value with its current → hint');
    ok(/Pending — program these into your pump/.test(s.deliverableText), 'reconcile reads Pending on a first plan');
    is(s.onPump, null, 'no on-pump line');
    is(s.mismatch, null, 'no mismatch table on a first plan');
    is(page.puts.length, 0, 'loading a draft persists nothing');
    await captureEvidence(page, 'S4');
  } finally { await page.close(); }
};

// STORY:plan:S5
export const S5 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC] });
  try {
    await setCell(page, 1, 2, 7.5);            // 06:00 I:C 8 → 7.5, same family
    await settle(page);
    let s = await state(page);
    is(s.rows[1].cells[2], { value: '7.5', prov: 'prov-edited', hint: '8 →', editedLabel: true }, 'a hand-edit flags its cell');
    await setCell(page, 2, 2, 5.9);            // the accepted noon cell, edited away
    await settle(page);
    s = await state(page);
    is(s.rows[2].cells[2].prov, 'prov-edited', 'editing the accepted cell flips it to edited');
    is(s.chips[0].edited, false, 'a deliverable edit never flags the chip; the flag is the staged value diverging from the recommendation');
    await setCell(page, 1, 2, 8);              // revert 06:00 to its baseline
    await setCell(page, 2, 2, 5.7);            // revert noon to the accepted value
    await settle(page);
    s = await state(page);
    is(s.rows[1].cells[2], { value: '8', prov: 'prov-current', hint: null, editedLabel: false }, 'reverting clears the edit');
    is(s.rows[2].cells[2].prov, 'prov-accepted', 'reverting the accepted cell restores accepted provenance');
    is(page.puts.length, 0, 'hand-edits are local overrides and persist nothing');
    await captureEvidence(page, 'S5');
  } finally { await page.close(); }
  const edited = await openApp(browser, { items: [{ ...NOON_IC, value: 5.6 }] });
  try {
    const s = await state(edited);
    is(s.chips[0].edited, true, 'a staged value away from its recommendation flags the chip');
    ok(/✎ edited/.test(s.chips[0].text), 'the chip prints ✎ edited');
  } finally { await edited.close(); }
};

// STORY:plan:S6
export const S6 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC] });
  try {
    await setCell(page, 0, 0, 0.7);            // 00:00 basal, a second family
    await settle(page);
    const s = await state(page);
    is(s.rows[0].cells[0], { value: '0.6', prov: 'prov-current', hint: null, editedLabel: false }, 'the refused edit snaps back');
    is(s.toast, 'Plan can only change one tuning family at a time. Clear I:C before editing Basal.', 'the refusal names both families');
    is(s.chips.length, 1, 'the staged pick survives');
    await captureEvidence(page, 'S6');
  } finally { await page.close(); }
};

// STORY:plan:S7
export const S7 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC] });
  try {
    await page.locator('.accepted-chip .chip-remove').click();
    await page.waitForFunction(() => /Nothing accepted yet/.test(document.body.innerText));
    const s = await state(page);
    is(s.chips, [], 'the chip is gone');
    is(s.rows[2].cells[2], { value: '5.4', prov: 'prov-current', hint: null, editedLabel: false }, 'the noon cell returns to current');
    is(page.puts, [[]], 'removal persists the emptied draft');
  } finally { await page.close(); }
};

// STORY:plan:S8
export const S8 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC] });
  try {
    await page.locator('.accepted-chip .chip-jump').click();
    await page.waitForFunction(() => location.pathname === '/diagnose');
  } finally { await page.close(); }
};

// STORY:plan:S9
export const S9 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC], history: [HISTORY_ROW], pump: pumpSettings({ noonCarbRatio: 5.7 }) });
  try {
    let s = await state(page);
    is(s.onPump, '✓ On pump as of 2026-07-20 08:00:00 — the pump matches your plan. Confirm & re-baseline →', 'on-pump line with its confirm action');
    is(s.mismatch, null, 'no mismatch');
    await captureEvidence(page, 'S9');
    await page.locator('.data-quality-banner button', { hasText: 'Confirm & re-baseline' }).click();
    await page.waitForFunction(() => /Confirmed on pump/.test(document.querySelector('.toast')?.innerText || ''));
    s = await state(page);
    is(page.puts.length, 1, 'confirm persisted the effective plan first');
    is(page.puts[0].map((i) => [i.type, i.start_min, i.value]), [['ic', 720, 5.7]], 'the effective plan is the accepted noon pick');
    is(page.applies.length, 1, 'confirm posted one apply');
    is(s.chips, [], 'the draft is cleared');
    ok(s.nothingAccepted, 'nothing accepted after confirm');
    is(s.historyRows.length, 2, 'history reloaded with the new entry');
  } finally { await page.close(); }
};

// STORY:plan:S10
export const S10 = async (browser) => {
  let page = await openApp(browser, { items: [NOON_IC], history: [HISTORY_ROW], pump: pumpSettings({ noonCarbRatio: 5.1 }) });
  try {
    let s = await state(page);
    ok(s.mismatch, 'mismatch block renders');
    is(s.mismatch.head, "⚠ The pump doesn't match your plan. Check these values — likely a keying error.", 'mismatch head');
    is(s.mismatch.rows, [['12:00', 'I:C (g/U)', '5.7', '5.1']], 'the divergent cell, planned then on pump');
    is(s.mismatch.buttons, ['Re-key & recheck', 'Accept pump values'], 'both resolutions offered');
    await captureEvidence(page, 'S10');
    await page.locator('.reconcile-actions button', { hasText: 'Re-key' }).click();
    await page.waitForFunction(() => !document.querySelector('.reconcile-mismatch'));
    s = await state(page);
    ok(/Pending — program these into your pump/.test(s.deliverableText), 'Re-key drops the mismatch back to Pending for this snapshot');
    ok(/Re-key the flagged values/.test(s.toast || ''), 'Re-key explains the recheck');
    is(page.applies.length, 0, 'Re-key applies nothing');
  } finally { await page.close(); }
  page = await openApp(browser, { items: [NOON_IC], history: [HISTORY_ROW], pump: pumpSettings({ noonCarbRatio: 5.1 }) });
  try {
    await page.locator('.reconcile-actions button', { hasText: 'Accept pump values' }).click();
    await page.waitForFunction(() => /Confirmed on pump/.test(document.querySelector('.toast')?.innerText || ''));
    is(page.applies.length, 1, 'Accept pump values posts one apply');
    is((await state(page)).chips, [], 'and clears the draft');
  } finally { await page.close(); }
};

// STORY:plan:S11
export const S11 = async (browser) => {
  let page = await openApp(browser, { history: [HISTORY_ROW] });
  try {
    const s = await state(page);
    ok(s.historyVisible, 'Apply history section present');
    is(s.historyRows, [['2026-06-14 18:40:00', 'I:C 18:00 8 → 7.5']], 'history row: applied at, items');
    await captureEvidence(page, 'S11');
  } finally { await page.close(); }
  page = await openApp(browser);
  try {
    ok(!(await state(page)).historyVisible, 'no history section when history is empty');
  } finally { await page.close(); }
};

// STORY:plan:S12
export const S12 = async (browser) => {
  const page = await openApp(browser, { tab: 'verify', planRoute: REVERT_ROUTE });
  try {
    await page.locator('.vw .decide .btns button[data-act="revert"]').click();
    await page.waitForFunction(() => location.pathname === '/plan' && !!document.querySelector('.plan-review-guidance'));
    await page.waitForSelector('.active-profile-ref');
    await page.waitForFunction(() => document.querySelectorAll('.accepted-chip').length === 1);
    const s = await state(page);
    is(s.guidance, { label: REVERT_ROUTE.label, message: REVERT_ROUTE.message }, 'the handoff banner carries the route label and message');
    ok(/^I:C 12:00 5\.4 → 5/.test(s.chips[0].text), `the prior setting is staged: ${s.chips[0].text}`);
    is(page.puts.length, 1, 'the revert draft was persisted');
    await captureEvidence(page, 'S12');
  } finally { await page.close(); }
};

// STORY:plan:S13
export const S13 = async (browser) => {
  const page = await openApp(browser, { items: [NOON_IC, { type: 'isf', key: 0, start_min: 0, label: '00:00', current: 50, value: 45, recommended: 45 }] });
  try {
    await page.waitForFunction(() => document.querySelectorAll('.accepted-chip').length === 1);
    const s = await state(page);
    ok(/^I:C 12:00/.test(s.chips[0].text), 'the first family is kept');
    is(page.puts.length, 1, 'the normalized draft is persisted');
    is(page.puts[0].map((i) => i.type), ['ic'], 'persisted draft holds one family');
    ok(/mixed variables; kept I:C and cleared the rest/.test(s.toast || ''), `the warning names what was kept: ${s.toast}`);
  } finally { await page.close(); }
};

// STORY:plan:S14
export const S14 = async (browser) => {
  const page = await openApp(browser, { items: [{ type: 'basal', key: 6, start_min: 180, label: '03:00', current: 0.6, value: 0.65, recommended: 0.65 }] });
  try {
    const s = await state(page);
    is(s.rows.map((r) => [r.start, r.newBreak]), [['00:00', false], ['03:00 new break', true], ['03:30 new break', true],
      ['06:00', false], ['12:00', false], ['22:00', false]], 'a basal pick opens its 30-minute slot: two new boundaries, both flagged new break');
    is(s.rows[1].cells[0], { value: '0.65', prov: 'prov-accepted', hint: '0.6 →', editedLabel: false }, 'the slot carries the accepted value');
    is(s.rows[2].cells[0], { value: '0.6', prov: 'prov-current', hint: null, editedLabel: false }, 'the slot end returns to the profile rate');
    is(s.segmentPill, { text: '6 / 16 segments', warn: false }, 'count grows by both boundaries');
    await captureEvidence(page, 'S14');
  } finally { await page.close(); }
};

// STORY:plan:S15
export const S15 = async (browser) => {
  const items = Array.from({ length: 13 }, (_, i) => {
    const start = 30 + i * 60;      // 00:30, 01:30, … 12:30 — thirteen boundaries the profile lacks
    return { type: 'basal', key: start / 30, start_min: start, label: `${String(Math.floor(start / 60)).padStart(2, '0')}:30`, current: 0.6, value: 0.65, recommended: 0.65 };
  });
  const page = await openApp(browser, { items });
  try {
    const s = await state(page);
    is(s.segmentPill, { text: '28 / 16 segments', warn: true }, 'over sixteen segments the count pill warns (thirteen slots open twenty-six boundaries, two coincide with 06:00 and 12:00)');
  } finally { await page.close(); }
};

// STORY:plan:S16
export const S16 = async (browser) => {
  const bare = await openApp(browser);
  const topbarBare = (await state(bare)).topbar;
  await bare.close();
  const staged = await openApp(browser, { items: [NOON_IC], history: [HISTORY_ROW], pump: pumpSettings({ noonCarbRatio: 5.1 }) });
  try {
    const topbarStaged = (await state(staged)).topbar;
    is(topbarStaged, topbarBare, 'the shell chrome does not move with Plan state');
    await staged.locator('.active-profile-ref summary').click();
    is((await state(staged)).topbar, topbarBare, 'opening the reference does not move the chrome');
  } finally { await staged.close(); }
};

/* ------------------------------------------------------------------- runner */

export const STORIES = { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13, S14, S15, S16 };

const isMain = process.argv[1] && import.meta.url === new URL(`file://${resolve(process.argv[1])}`).href;
if (isMain) {
  const target = process.env.TARGET;
  if (target !== 'app') fail(`TARGET must be app, got ${target || '(unset)'} — Plan has no mock; the app is the sole contract`);
  const modulePath = process.env.PLAYWRIGHT_MODULE || fail('PLAYWRIGHT_MODULE is required');
  const { chromium } = require(modulePath);
  await access(join(process.env.VENDOR_DIR || '', 'echarts.min.js'));
  await access(join(process.env.VENDOR_DIR || '', 'vue.esm-browser.js'));
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
  const results = [];
  for (const [id, fn] of Object.entries(STORIES)) {
    if (only && !only.has(id)) continue;
    try { await fn(browser); results.push([id, 'pass', '']); }
    catch (e) { results.push([id, 'FAIL', e.message]); }
  }
  await browser.close();
  for (const [id, verdict, why] of results) console.log(`${verdict === 'pass' ? '  ok' : 'FAIL'} ${id}${why ? ` — ${why}` : ''}`);
  for (const p of problems) console.log(`OPENER ${p}`);
  const failed = results.filter((r) => r[1] !== 'pass').length;
  console.log(`\n${target}: ${results.length - failed} of ${results.length} stories passed` + (problems.length ? `, ${problems.length} opener problems` : ''));
  if (!results.length) fail('no stories ran — a green run that executed nothing is a silent skip');
  process.exit(failed || problems.length ? 1 : 0);
}
