import test from 'node:test';
import assert from 'node:assert/strict';

let fail = true;
const requests = [];
let kind = 'trial';
let identity = 'basal_rate-03-00-synthetic';
let context = {};
let expired = false;
let lateConclusion = { state: 'unavailable' };
// A durable 409 as the API serves it (ADR 450): the code beside its sentence.
let refusal = null;
const STALE = { code: 'stale_input_revision', message: 'New pump or sensor data arrived since this page was read.',
  input_revision: 8, admission: { state: 'available' } };
// Served fields a test adds to the selected record, and an admission it serves instead.
let selectedExtra = {};
let unreconciled = null;
const admission = () => unreconciled || ({ state: 'available', active_kind: kind, active_id: identity,
  can_finish_trial: true, focus_pin: { available: false } });
const comparison = { availability: { state: 'available' }, periods: {}, views: {}, outcomes: [],
  assessment: { state: 'unclear' }, readiness: { before: { observed: 0, required: 14, criterion_met: false, unit: 'nights', contributing_dates: [] }, after: { observed: 0, required: 14, criterion_met: false, unit: 'nights', contributing_dates: [] } } };
// A retained comparison with both evidence periods and one clock bin both
// periods served, the shape the committed c3-trial case serves an open record.
const PAIRED = { ...comparison,
  periods: {
    before: { start: '2024-06-02 03:00:00', end: '2024-06-16 03:00:00', data_cutoff: '2024-06-30 23:55:00',
      boundary_reasons: { start: 'available_history', end: 'setting_change' } },
    after: { start: '2024-06-16 03:00:00', end: '2024-06-30 23:55:00', data_cutoff: '2024-06-30 23:55:00',
      boundary_reasons: { start: 'setting_change', end: 'data_tail' } },
  },
  views: { before: { clock: [{ t: '03:00', n: 12, med: 131 }] }, after: { clock: [{ t: '03:00', n: 12, med: 118 }] } } };
let served = comparison;
// A held assessment read: the record read answers, the reassessment waits.
let assessmentGate = null;
// The record whose assessment read the server refuses, as it answers one whose
// history inputs changed during every snapshot, or with a coded refusal.
let refusedFor = null;
// The next request `held.matches` names waits for `held.gate`, so a test can
// leave a record while that request is in flight. Its answer is decided when it
// is released.
let held = null;
function holdNext(matches) {
  let release;
  held = { matches, gate: new Promise(resolve => { release = resolve; }) };
  return () => { held = null; release(); };
}
let codedRefusal = null;
globalThis.fetch = async (path, options = {}) => {
  requests.push({ path, options });
  if (held?.matches(String(path), options)) { const { gate } = held; held = null; await gate; }
  if (options.method === 'POST') {
    if (refusal) return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: refusal }) };
    const body = JSON.parse(options.body || '{}');
    if (!fail && String(path).endsWith('/conclusion')) {
      lateConclusion = { state: 'available', conclusion: body.conclusion,
        recorded_at: '2026-09-11 09:00:00' };
    }
    return { ok: !fail, status: fail ? 503 : 200,
      json: async () => fail ? { detail: 'Synthetic refusal' } : { id: identity, record: { id: identity } } };
  }
  const params = new URL(path, 'http://synthetic').searchParams;
  const selected = params.get('selected');
  // The server serves a reassessment only to a read that names an assessment;
  // the default (Original) selected read carries `reassessment: null`.
  const assessment = params.get('assessment');
  if (assessment && assessmentGate) await assessmentGate;
  if (assessment && selected === refusedFor) {
    if (codedRefusal) return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: codedRefusal }) };
    return { ok: false, status: 503, statusText: 'Service Unavailable',
      json: async () => ({ detail: 'history inputs changed during every snapshot' }) };
  }
  const result = { input_revision: 7, admission: admission(),
    trials: kind === 'trial' ? [{ id: identity }] : [],
    focuses: kind === 'focus' ? [{ id: identity, title: 'Highs after meals', pattern_key: 'served-pattern', pinned_at: '2024-05-05 00:00:00' }] : [],
    ...(selected ? { selected: { id: identity, kind, changes: kind === 'trial' ? [{ parameter: 'basal_rate', slot: '03:00', before: 0.6, after: 0.54 }] : [],
      lever: kind === 'focus' ? 'late_bolus' : undefined, original: { context,
        ...(expired ? { ending: { kind: 'expired_unreviewed', effective_at: '2026-09-01 00:00:00',
          recorded_at: '2026-09-01 00:00:00', conclusion: null, assessment: { state: 'unavailable' } },
        late_conclusion: lateConclusion } : {}) },
      reassessment: assessment ? { mode: assessment, computed_at: '2026-09-23 12:00:00',
        comparison_context: { id: 'synthetic-context-0001' }, comparison: served } : null, ...selectedExtra } } : {}),
  };
  return { ok: true, json: async () => result };
};
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#222222' });
const { mount, configureFollowUp, retainedEvidenceContext } = await import('./follow-up.js');
const { mount: mountHistory } = await import('./history.js');
const { navigate, view } = await import('./routes.js');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function host() {
  const field = { value: '' }; const form = {};
  const lateField = { value: '' }; const lateForm = {}; const retryReassessment = {};
  // The record's three assessment controls, handed to its binding so a test can
  // press one the way a reader does.
  const assessment = Object.fromEntries(['original', 'retained', 'current']
    .map(mode => [mode, { dataset: { assessment: mode } }]));
  // The roster's record rows a test names, and the record's Back to records.
  const records = []; const recordClose = {};
  return { innerHTML: '', field, form, lateField, lateForm, assessment, retryReassessment, records, recordClose, days: [],
    querySelectorAll(selector) {
      if (selector === '[data-record]') return this.innerHTML.includes('data-record="') ? records : [];
      // The supporting-date controls the render drew, for a test to press.
      if (selector === '[data-day-date]') {
        this.days = [...this.innerHTML.matchAll(/data-day-date="([^"]+)"/g)].map(([, dayDate]) => ({ dataset: { dayDate } }));
        return this.days;
      }
      return selector === '[data-assessment]' && this.innerHTML.includes('data-assessment=')
        ? Object.values(assessment) : [];
    },
    querySelector(selector) { return selector === '#conclusion' && this.innerHTML.includes('id="conclusion"') ? field
      : selector === '[data-form="finish"]' && this.innerHTML.includes('data-form="finish"') ? form
        : selector === '#late-conclusion-conclusion' && this.innerHTML.includes('id="late-conclusion-conclusion"') ? lateField
          : selector === '[data-form="late-conclusion"]' && this.innerHTML.includes('data-form="late-conclusion"') ? lateForm
            : selector === '[data-retry-reassessment]' && this.innerHTML.includes('data-retry-reassessment') ? retryReassessment
              : selector === '[data-record-close]' && this.innerHTML.includes('data-record-close') ? recordClose
                : null; },
  };
}
async function mountActive(seat, navigation) {
  for (let step = 0; step < 3; step++) { mount(seat, { navigation, hold() {} }); await flush(); }
  assert.match(seat.innerHTML, /data-form="finish"/);
}

test('public mount reads retained evidence and failed finish/resolve retain the draft and durable retry id', async () => {
  const saved = [];
  configureFollowUp({ openRecord: (...args) => saved.push(args) });
  for (const [index, current] of ['trial', 'focus'].entries()) {
    kind = current; identity = `${current}-synthetic`; fail = true;
    const seat = host(); await mountActive(seat, index);
    assert.ok(requests.some(r => r.path.includes(`selected=${identity}`) && r.path.includes('assessment=retained')));
    seat.field.oninput({ target: { value: 'My synthetic observation' } });
    seat.form.onsubmit({ preventDefault() {} }); await flush();
    mount(seat, { navigation: index, hold() {} });
    assert.match(seat.innerHTML, /Synthetic refusal/);
    assert.match(seat.innerHTML, /My synthetic observation/);
    assert.equal(saved.length, index);
    const failed = requests.filter(r => r.options.method === 'POST').at(-1);
    fail = false; seat.form.onsubmit({ preventDefault() {} }); await flush();
    const retried = requests.filter(r => r.options.method === 'POST').at(-1);
    assert.equal(JSON.parse(failed.options.body).request_id, JSON.parse(retried.options.body).request_id);
    assert.deepEqual(saved[index], [kind, identity]);
    assert.equal(JSON.parse(retried.options.body).conclusion, 'My synthetic observation');
  }
});

test('retained inspection uses the original slot and canonical Pattern identity', () => {
  assert.deepEqual(retainedEvidenceContext({ changes: [{ parameter: 'basal_rate', slot: '03:00' }], original: { context: {} } }),
    { subject: 'setting:basal_rate', from: 'changes', occurrence: '', window: '180-210', lever: 'basal_rate' },
    'ADR 428: the entry names no return-focus selector; Diagnose lands on its crumb by default');
  assert.equal(retainedEvidenceContext({ pattern_key: 'served-pattern', lever: 'late_bolus' }).subject, 'pattern:served-pattern');
  assert.equal(retainedEvidenceContext({ pattern_key: 'served-pattern', lever: 'late_bolus', original: {
    context: { outcome_window: { start_min: 22 * 60, end_min: 2 * 60 }, action: [{ span: { start_min: 180, end_min: 210 } }] },
  } }).window, '1320-120', 'the retained circular outcome scope wins over the member span');
  assert.equal(retainedEvidenceContext({ lever: 'retired-unmapped' }).subject, '', 'an unmapped legacy record cannot impersonate a Pattern');
});

test('Focus mount uses the served record title and keeps its explanation in the body only', async () => {
  kind = 'focus'; identity = 'focus-title-synthetic';
  context = { state: 'available', explanation: 'Watch meal timing.', subjects: ['pattern:served-pattern'] };
  try {
    const seat = host(); await mountActive(seat, 'focus-title');
    assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
    assert.equal(seat.innerHTML.split('Highs after meals').length - 1, 1);
    assert.match(seat.innerHTML, /<p>Watch meal timing\.<\/p>/);
    assert.equal(seat.innerHTML.split('Watch meal timing.').length - 1, 1);
    assert.doesNotMatch(seat.innerHTML, />pattern:served-pattern</);
  } finally { context = {}; }
});

test('history mounts the served Pattern title in both its roster row and open record', async () => {
  kind = 'focus'; identity = 'focus-history-synthetic';
  context = { state: 'available', explanation: 'Watch meal timing.', subjects: ['pattern:served-pattern'] };
  try {
    const seat = host();
    for (const route of [{}, { occurrence: `record:focus:${identity}` }]) {
      for (let step = 0; step < 3; step++) {
        mountHistory(seat, { context: route, hold() {} }); await flush();
      }
      assert.match(seat.innerHTML, /Highs after meals/);
      assert.doesNotMatch(seat.innerHTML, />pattern:served-pattern</);
      if (route.occurrence) {
        assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
        assert.match(seat.innerHTML, /Original explanation<\/dt><dd>Watch meal timing\.<\/dd>/);
      }
    }
  } finally { context = {}; }
});

test('Focus does not repeat a retained explanation identical to its served title', async () => {
  kind = 'focus'; identity = 'focus-repeated-title-synthetic';
  context = { state: 'available', explanation: 'Highs after meals' };
  try {
    const seat = host(); await mountActive(seat, 'focus-repeated-title');
    assert.match(seat.innerHTML, /<h2 class="gf-title"[^>]*>Highs after meals<\/h2>/);
    assert.equal(seat.innerHTML.split('Highs after meals').length - 1, 1);
  } finally { context = {}; }
});

test('an exact expired Trial records a later conclusion through the public client, retries, and reloads its immutable record', async () => {
  kind = 'trial'; identity = 'expired-trial-synthetic';
  context = { subject: 'pattern:served-pattern', outcome_window: { start_min: 1320, end_min: 120 } };
  expired = true; lateConclusion = { state: 'unavailable' }; fail = false; refusal = STALE;
  try {
    const seat = host(); const route = { occurrence: `record:trial:${identity}` };
    for (let step = 0; step < 3; step++) { mountHistory(seat, { context: route, hold() {} }); await flush(); }
    assert.match(seat.innerHTML, /data-form="late-conclusion"/);
    seat.lateField.oninput({ target: { value: 'Later synthetic observation' } });
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    mountHistory(seat, { context: route, hold() {} });
    assert.match(seat.innerHTML, /Recording the later conclusion failed: New pump or sensor data arrived since this page was read\./);
    assert.doesNotMatch(seat.innerHTML, /stale_input_revision|\(409\)/, 'the refusal prints its sentence, never its code');
    assert.match(seat.innerHTML, /Later synthetic observation/);
    const failed = requests.filter(row => String(row.path).endsWith('/conclusion')).at(-1);
    assert.match(failed.path, new RegExp(`/trials/${identity}/conclusion$`));
    refusal = null;
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    const retried = requests.filter(row => String(row.path).endsWith('/conclusion')).at(-1);
    assert.equal(JSON.parse(failed.options.body).request_id, JSON.parse(retried.options.body).request_id);
    assert.equal(JSON.parse(retried.options.body).conclusion, 'Later synthetic observation');
    for (let step = 0; step < 3; step++) { mountHistory(seat, { context: route, hold() {} }); await flush(); }
    assert.match(seat.innerHTML, /data-late-conclusion="available"/);
    assert.match(seat.innerHTML, /Later synthetic observation/);
    assert.match(seat.innerHTML, /data-ending-kind="expired_unreviewed"/);
    assert.ok(requests.some(row => String(row.path).includes(`selected=${identity}`)),
      'retry re-read the exact expired Trial record');
  } finally { context = {}; expired = false; lateConclusion = { state: 'unavailable' }; refusal = null; }
});

/* ------------------------------------ served names and refusals, in words */

test('an active Focus names its served behavior in its intent and its behavior row, never its key', async () => {
  kind = 'focus'; identity = 'focus-behavior-synthetic';
  selectedExtra = { lever: 'repeat_eating', lever_title: 'Repeat eating' };
  const measured = { lever: 'repeat_eating', numerator: 1, denominator: 'meals', opportunities: 4, rate: 0.25,
    harm: 0, measured_opportunities: 4, unmeasured_opportunities: 0,
    harm_availability: { state: 'available' }, availability: { state: 'available' } };
  served = { ...comparison, adherence: { before: measured, after: measured, assessment: { state: 'unclear', unit: 'proportion' } } };
  try {
    const seat = host(); await mountActive(seat, 'focus-behavior');
    assert.match(seat.innerHTML, /data-part="intent"><h3>What this Focus watches<\/h3>\s*<p>Repeat eating<\/p>/);
    assert.match(seat.innerHTML, /<td>Repeat eating<small>the intended behavior/);
    assert.doesNotMatch(seat.innerHTML.replace(/<[^>]*>/g, ' '), /repeat_eating/);
  } finally { selectedExtra = {}; served = comparison; }
});

test('an active Focus with no served behavior name omits the watches paragraph rather than print its key', async () => {
  kind = 'focus'; identity = 'focus-unnamed-synthetic';
  selectedExtra = { lever: 'overnight_drift', lever_title: null };
  try {
    const seat = host(); await mountActive(seat, 'focus-unnamed');
    assert.match(seat.innerHTML, /data-part="intent"><h3>What this Focus watches<\/h3>\s*<p class="gf-meta">Pinned /);
    assert.doesNotMatch(seat.innerHTML, /overnight_drift/);
  } finally { selectedExtra = {}; }
});

test('an unreconciled store says what Changes is waiting for in words', async () => {
  unreconciled = { state: 'unavailable', reason: 'reconciliation_required', active_kind: null, active_id: null,
    focus_pin: { available: false, reason: 'reconciliation_required' } };
  try {
    const seat = host();
    for (let step = 0; step < 3; step++) { mount(seat, { navigation: 'unreconciled', hold() {} }); await flush(); }
    assert.match(seat.innerHTML, /The backend cannot answer for this store yet: the latest pump and sensor data have not been reconciled yet\./);
    assert.doesNotMatch(seat.innerHTML, /reconciliation_required/);
  } finally { unreconciled = null; }
});

test('a refused finish prints the served sentence, never its code and status', async () => {
  kind = 'trial'; identity = 'refused-finish-synthetic'; refusal = STALE;
  try {
    const seat = host(); await mountActive(seat, 'refused-finish');
    seat.field.oninput({ target: { value: 'A synthetic finish' } });
    seat.form.onsubmit({ preventDefault() {} }); await flush();
    mount(seat, { navigation: 'refused-finish', hold() {} });
    assert.match(seat.innerHTML, /Recording the conclusion failed: New pump or sensor data arrived since this page was read\./);
    assert.doesNotMatch(seat.innerHTML, /stale_input_revision|\(409\)/);
    assert.match(seat.innerHTML, /A synthetic finish/);
  } finally { refusal = null; }
});

/* ------------------------------------------ the record door's default read */

const assessmentsOf = (from, id) => requests.slice(from)
  .filter(row => String(row.path).includes(`selected=${id}`))
  .map(row => new URL(row.path, 'http://synthetic').searchParams.get('assessment'));
async function openHistoryRecord(seat, id, steps = 4) {
  const route = { occurrence: `record:trial:${id}` };
  for (let step = 0; step < steps; step++) { mountHistory(seat, { context: route, hold() {} }); await flush(); }
  return route;
}

test('an open change record reads its retained comparison with no control pressed', async () => {
  kind = 'trial'; identity = 'open-record-synthetic'; served = PAIRED;
  try {
    const from = requests.length;
    const seat = host(); await openHistoryRecord(seat, identity);
    assert.deepEqual(assessmentsOf(from, identity), [null, 'retained'],
      'the record read, then exactly one retained-context read');
    assert.match(seat.innerHTML, /data-period="before"/);
    assert.match(seat.innerHTML, /data-period="after"/);
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
    assert.match(seat.innerHTML, /data-assessment="retained" aria-pressed="true"/);
    assert.match(seat.innerHTML, /data-reassessment-context="retained"/);
    assert.match(seat.innerHTML, /data-unavailable="ending">Not recorded — this change is still open\./);
  } finally { served = comparison; }
});

test('an ended change record opens on its saved ending and requests no reassessment', async () => {
  kind = 'trial'; identity = 'ended-record-synthetic'; expired = true;
  try {
    const from = requests.length;
    const seat = host(); await openHistoryRecord(seat, identity);
    assert.deepEqual(assessmentsOf(from, identity), [null], 'the record read alone');
    assert.match(seat.innerHTML, /data-ending-kind="expired_unreviewed"/);
    assert.match(seat.innerHTML, /data-assessment="original" aria-pressed="true"/);
  } finally { expired = false; }
});

test('an open record names its pending retained read "Computing reassessment"', async () => {
  kind = 'trial'; identity = 'held-record-synthetic'; served = PAIRED;
  let release;
  assessmentGate = new Promise(resolve => { release = resolve; });
  try {
    const seat = host(); await openHistoryRecord(seat, identity, 3);
    assert.match(seat.innerHTML, /<p>Computing reassessment<\/p>/);
    assert.doesNotMatch(seat.innerHTML, /data-record-part=/, 'no record renders while its read is pending');
    release(); await flush();
    await openHistoryRecord(seat, identity, 1);
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
  } finally { assessmentGate = null; release(); served = comparison; }
});

test('choosing Original on an open record reads as no comparison requested', async () => {
  kind = 'trial'; identity = 'original-choice-synthetic'; served = PAIRED;
  try {
    const seat = host(); await openHistoryRecord(seat, identity);
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
    seat.assessment.original.onclick();
    const from = requests.length;
    await openHistoryRecord(seat, identity, 1);
    assert.equal(requests.length, from, 'the Original read is already held; nothing more is requested');
    assert.match(seat.innerHTML, /data-assessment="original" aria-pressed="true"/);
    assert.match(seat.innerHTML, /data-figure-state="not-requested"/);
    assert.match(seat.innerHTML, /data-periods="not-requested"/);
    assert.match(seat.innerHTML, /data-outcomes="not-requested"/);
    assert.doesNotMatch(seat.innerHTML, /recomputed now/);
    assert.match(seat.innerHTML, /The saved read carries no comparison until this change ends\./);
  } finally { served = comparison; }
});

test('a failed retained read keeps the record and its Original read, and retries only that read', async () => {
  kind = 'trial'; identity = 'refused-reassessment-synthetic'; served = PAIRED; refusedFor = identity;
  try {
    const from = requests.length;
    const seat = host(); await openHistoryRecord(seat, identity);
    assert.deepEqual(assessmentsOf(from, identity), [null, 'retained'], 'the record read, then the refused retained read');
    assert.doesNotMatch(seat.innerHTML, /Evidence unavailable/, 'the loaded record is not replaced by a failure frame');
    for (const part of ['original', 'ending', 'change', 'reassessment']) {
      assert.match(seat.innerHTML, new RegExp(`data-record-part="${part}"`), `the ${part} part stays on screen`);
    }
    assert.match(seat.innerHTML, /data-assessment="original" aria-pressed="true"/, 'the Original read is what shows');
    assert.match(seat.innerHTML, /data-figure-state="not-requested"/);
    assert.match(seat.innerHTML, /data-reassessment-failed="retained"/);
    assert.match(seat.innerHTML, /The retained-context reassessment could not load: history inputs changed during every snapshot\./);
    const [stage, reading] = seat.innerHTML.split('<aside');
    assert.match(stage, /data-retry-reassessment/, 'the failure and its retry sit in the stage');
    assert.doesNotMatch(reading, /data-reassessment-failed|data-retry-reassessment/, 'the reading pane carries no failure');

    const settled = requests.length;
    await openHistoryRecord(seat, identity, 2);
    assert.equal(requests.length, settled, 'a failed read is not re-sent by a re-render');

    refusedFor = null;
    const retried = requests.length;
    seat.retryReassessment.onclick();
    await openHistoryRecord(seat, identity, 3);
    assert.deepEqual(assessmentsOf(retried, identity), ['retained'], 'the retry re-sends the retained read alone');
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
    assert.match(seat.innerHTML, /data-assessment="retained" aria-pressed="true"/);
    assert.doesNotMatch(seat.innerHTML, /data-reassessment-failed/);
  } finally { refusedFor = null; served = comparison; }
});

test('a coded refusal of a reassessment read prints its sentence with exactly one full stop', async () => {
  kind = 'trial'; identity = 'coded-reassessment-synthetic'; served = PAIRED; refusedFor = identity;
  codedRefusal = { code: 'stale_input_revision', message: 'New pump or sensor data arrived since this page was read.' };
  try {
    const seat = host(); await openHistoryRecord(seat, identity);
    const line = /The retained-context reassessment could not load: ([^<]*)<\/p>/.exec(seat.innerHTML);
    assert.ok(line, 'the stage names the refused read');
    assert.equal(line[1], 'New pump or sensor data arrived since this page was read.');
    assert.doesNotMatch(seat.innerHTML, /stale_input_revision|\(409\)/);
  } finally { refusedFor = null; codedRefusal = null; served = comparison; }
});

test('a failed retained read stays with its record: the next record opened from the roster reads its own', async () => {
  kind = 'trial'; identity = 'roster-synthetic'; served = PAIRED;
  const [A, B] = ['refused-a-synthetic', 'fresh-b-synthetic'];
  refusedFor = A;
  // Back to records and a roster press write the address through the router.
  const previousWindow = globalThis.window;
  const location = { pathname: '/', search: '', hash: '' };
  globalThis.window = { location, history: { pushState: (_state, _title, address) => {
    const url = new URL(address, 'http://synthetic');
    Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
  } } };
  try {
    const seat = host();
    seat.records.push({ dataset: { record: `trial:${A}` } }, { dataset: { record: `trial:${B}` } });
    const press = async (id) => {
      seat.recordClose.onclick();
      for (let step = 0; step < 3; step++) { mountHistory(seat, { context: {}, hold() {} }); await flush(); }
      assert.match(seat.innerHTML, /data-record="/, 'Back to records shows the roster');
      seat.records.find(row => row.dataset.record === `trial:${id}`).onclick();
      const from = requests.length;
      await openHistoryRecord(seat, id);
      return assessmentsOf(from, id);
    };
    await openHistoryRecord(seat, A);
    assert.match(seat.innerHTML, /data-reassessment-failed="retained"/, 'premise: A\u2019s retained read failed');

    assert.deepEqual(await press(B), [null, 'retained'], 'B, opened from the roster, makes its own retained read');
    assert.doesNotMatch(seat.innerHTML, /data-reassessment-failed/, 'A\u2019s failure does not follow into B');
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
    assert.match(seat.innerHTML, /data-assessment="retained" aria-pressed="true"/);

    refusedFor = null;
    assert.deepEqual(await press(A), [null, 'retained'], 'reopening A retries its retained read');
    assert.doesNotMatch(seat.innerHTML, /data-reassessment-failed/);
    assert.match(seat.innerHTML, /data-figure-state="paired"/);
  } finally { refusedFor = null; served = comparison; navigate('diagnose'); globalThis.window = previousWindow; }
});

/* ------------------------------- a later conclusion stays with its record */

// ADR 452: the later-conclusion text, a failed save and its request id belong
// to the open record, and clear whenever another record opens or the reader
// leaves for the roster — a roster press as much as an address.
const conclusionPosts = (from = 0) => requests.slice(from).filter(row => String(row.path).endsWith('/conclusion'));
async function onExpiredRoster(run) {
  const was = { expired, fail, lateConclusion, window: globalThis.window };
  kind = 'trial'; identity = 'expired-roster-synthetic';
  expired = true; lateConclusion = { state: 'unavailable' };
  // Back to records and a roster press write the address through the router.
  const location = { pathname: '/', search: '', hash: '' };
  globalThis.window = { location, history: { pushState: (_state, _title, address) => {
    const url = new URL(address, 'http://synthetic');
    Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
  } } };
  try {
    const seat = host();
    const backToRoster = async () => {
      seat.recordClose.onclick();
      for (let step = 0; step < 3; step++) { mountHistory(seat, { context: {}, hold() {} }); await flush(); }
      assert.match(seat.innerHTML, /data-record="/, 'Back to records shows the roster');
    };
    const press = async (id) => {
      seat.records.find(row => row.dataset.record === `trial:${id}`).onclick();
      await openHistoryRecord(seat, id);
      assert.match(seat.innerHTML, /data-form="late-conclusion"/, `the expired Trial ${id} offers its Later conclusion`);
    };
    await run(seat, { backToRoster, press });
  } finally {
    navigate('diagnose');
    ({ expired, fail, lateConclusion } = was);
    globalThis.window = was.window;
  }
}

test('a later conclusion typed on one expired Trial does not follow into the next record opened from the roster', async () => {
  const [A, B] = ['expired-a-synthetic', 'expired-b-synthetic'];
  await onExpiredRoster(async (seat, { backToRoster, press }) => {
    seat.records.push({ dataset: { record: `trial:${A}` } }, { dataset: { record: `trial:${B}` } });
    const route = await openHistoryRecord(seat, A);
    assert.match(seat.innerHTML, /data-form="late-conclusion"/, 'premise: A offers its Later conclusion');
    fail = true;
    seat.lateField.oninput({ target: { value: 'Words typed on expired Trial A' } });
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    mountHistory(seat, { context: route, hold() {} });
    assert.match(seat.innerHTML, /Recording the later conclusion failed/, 'premise: A’s save failed');
    const failedOnA = conclusionPosts().at(-1);
    assert.match(failedOnA.path, new RegExp(`/trials/${A}/conclusion$`));

    await backToRoster();
    await press(B);
    assert.doesNotMatch(seat.innerHTML, /Words typed on expired Trial A/, 'A’s words do not follow into B');
    assert.doesNotMatch(seat.innerHTML, /Recording the later conclusion failed/, 'A’s failure does not follow into B');
    assert.doesNotMatch(seat.innerHTML, /data-save-error=/);
    assert.match(seat.innerHTML, /type="submit" disabled>Record later conclusion</, 'B’s form starts empty');

    fail = false;
    const typed = requests.length;
    seat.lateField.oninput({ target: { value: 'Words typed on expired Trial B' } });
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    const savedOnB = conclusionPosts(typed).at(-1);
    assert.match(savedOnB.path, new RegExp(`/trials/${B}/conclusion$`));
    assert.notEqual(JSON.parse(savedOnB.options.body).request_id, JSON.parse(failedOnA.options.body).request_id,
      'B’s save sends a request id of its own');
    assert.equal(JSON.parse(savedOnB.options.body).conclusion, 'Words typed on expired Trial B');
    const beforeSave = requests.slice(typed, requests.indexOf(savedOnB));
    assert.equal(beforeSave.filter(row => String(row.path).includes(`selected=${B}`)).length, 0,
      'B’s save is a first save, not a retry that re-reads B');
  });
});

test('reopening the same expired Trial from the roster starts its later conclusion empty', async () => {
  const A = 'expired-reopen-synthetic';
  await onExpiredRoster(async (seat, { backToRoster, press }) => {
    seat.records.push({ dataset: { record: `trial:${A}` } });
    await openHistoryRecord(seat, A);
    assert.match(seat.innerHTML, /data-form="late-conclusion"/, 'premise: A offers its Later conclusion');
    seat.lateField.oninput({ target: { value: 'Words typed before leaving' } });
    mountHistory(seat, { context: { occurrence: `record:trial:${A}` }, hold() {} });
    assert.match(seat.innerHTML, /Words typed before leaving/, 'premise: a re-render of A keeps its words');

    await backToRoster();
    await press(A);
    assert.doesNotMatch(seat.innerHTML, /Words typed before leaving/, 'the reopened record starts empty');
    assert.match(seat.innerHTML, /type="submit" disabled>Record later conclusion</);
  });
});

// A save still in flight when its record is left writes nothing on its return:
// not the re-read of a retry, not a request id, not a failure and not the clear
// a success makes (ADR 452).
const sentFor = id => conclusionPosts().filter(row => String(row.path).endsWith(`/trials/${id}/conclusion`));
async function firstSaveOn(seat, B, sentForA) {
  fail = false;
  const typed = requests.length;
  seat.lateField.oninput({ target: { value: 'Words typed on expired Trial B' } });
  seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
  const saved = conclusionPosts(typed).at(-1);
  assert.ok(saved, 'B’s save is sent');
  assert.match(saved.path, new RegExp(`/trials/${B}/conclusion$`));
  const id = JSON.parse(saved.options.body).request_id;
  for (const sent of sentForA) {
    assert.notEqual(id, JSON.parse(sent.options.body).request_id, 'B’s save sends a request id of its own');
  }
  assert.equal(requests.slice(typed, requests.indexOf(saved)).filter(row => String(row.path).includes(`selected=${B}`)).length, 0,
    'B’s save is a first save, not a retry that re-reads B');
}

test('a Retry still in flight when the reader leaves writes nothing into the next record', async () => {
  const [A, B] = ['retry-flight-a-synthetic', 'retry-flight-b-synthetic'];
  await onExpiredRoster(async (seat, { backToRoster, press }) => {
    seat.records.push({ dataset: { record: `trial:${A}` } }, { dataset: { record: `trial:${B}` } });
    const route = await openHistoryRecord(seat, A);
    fail = true;
    seat.lateField.oninput({ target: { value: 'Words typed on expired Trial A' } });
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    mountHistory(seat, { context: route, hold() {} });
    assert.match(seat.innerHTML, /Recording the later conclusion failed/, 'premise: A’s save failed');

    const retried = requests.length;
    const release = holdNext((path, options) => options.method !== 'POST' && path.includes(`selected=${A}`));
    try {
      seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
      assert.equal(held, null, 'premise: Retry re-reads A first, and that read is held');
      await backToRoster();
      await press(B);
    } finally { release(); }
    await flush();
    await openHistoryRecord(seat, B, 3);
    assert.doesNotMatch(seat.innerHTML, /Words typed on expired Trial A/, 'A’s words do not follow into B');
    assert.doesNotMatch(seat.innerHTML, /Recording the later conclusion failed/, 'A’s retry leaves no failure on B');
    assert.match(seat.innerHTML, /type="submit" disabled>Record later conclusion</, 'B’s form starts empty');
    assert.equal(conclusionPosts(retried).length, 0, 'the retry abandoned when A was left sends nothing');
    await firstSaveOn(seat, B, sentFor(A));
  });
});

test('a first save that fails after the reader left does not follow into the next record', async () => {
  const [A, B] = ['late-failure-a-synthetic', 'late-failure-b-synthetic'];
  await onExpiredRoster(async (seat, { backToRoster, press }) => {
    seat.records.push({ dataset: { record: `trial:${A}` } }, { dataset: { record: `trial:${B}` } });
    await openHistoryRecord(seat, A);
    fail = true;
    seat.lateField.oninput({ target: { value: 'Words typed on expired Trial A' } });
    const release = holdNext((path, options) => options.method === 'POST' && path.endsWith(`/trials/${A}/conclusion`));
    try {
      seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
      assert.equal(held, null, 'premise: A’s save is sent and held');
      await backToRoster();
      await press(B);
    } finally { release(); }
    await flush();
    await openHistoryRecord(seat, B, 1);
    assert.doesNotMatch(seat.innerHTML, /Recording the later conclusion failed/, 'A’s late failure does not land on B');
    assert.match(seat.innerHTML, /type="submit" disabled>Record later conclusion</, 'B’s form stays empty');
    await firstSaveOn(seat, B, sentFor(A));
  });
});

test('a first save that succeeds after the reader left keeps the next record’s draft', async () => {
  const [A, B] = ['late-success-a-synthetic', 'late-success-b-synthetic'];
  await onExpiredRoster(async (seat, { backToRoster, press }) => {
    seat.records.push({ dataset: { record: `trial:${A}` } }, { dataset: { record: `trial:${B}` } });
    await openHistoryRecord(seat, A);
    fail = false;
    seat.lateField.oninput({ target: { value: 'Words typed on expired Trial A' } });
    const release = holdNext((path, options) => options.method === 'POST' && path.endsWith(`/trials/${A}/conclusion`));
    try {
      seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
      assert.equal(held, null, 'premise: A’s save is sent and held');
      await backToRoster();
      await press(B);
      seat.lateField.oninput({ target: { value: 'Draft typed on expired Trial B' } });
    } finally { release(); }
    await flush();
    await openHistoryRecord(seat, B, 1);
    assert.match(seat.innerHTML, /data-form="late-conclusion"/, 'B’s form is still open');
    assert.match(seat.innerHTML, /Draft typed on expired Trial B/, 'A’s late success leaves B’s draft in place');
    assert.equal(JSON.parse(sentFor(A).at(-1).options.body).conclusion, 'Words typed on expired Trial A',
      'premise: A’s save carried A’s own words');
  });
});

/* ------------------------------ ADR 445: a supporting date's Day round trip */

// A retained comparison that lists contributing dates in both evidence periods.
const DATED = { ...PAIRED, readiness: {
  before: { observed: 2, required: 14, criterion_met: false, unit: 'nights', contributing_dates: ['2024-06-03', '2024-06-04'] },
  after: { observed: 1, required: 14, criterion_met: false, unit: 'nights', contributing_dates: ['2024-06-17'] },
} };
const HEADING = '.gf-reading > header h2';
const dayReturn = (date, occurrence) => ({ date, subject: 'setting:basal_rate', title: 'Basal 03:00 · 0.6 U/h → 0.54 U/h',
  occurrence, lever: 'basal_rate', from: 'changes' });

// One arrival, rendered until its content has drawn and once more. After each
// render the desk's focus request is read and cleared, as the router's own
// render does, and the render is marked content or not.
async function renders(mountOnce, seat, deps, steps, content) {
  const seen = [];
  for (let step = 0; step < steps; step++) {
    mountOnce(seat, deps);
    seen.push({ content: content.test(seat.innerHTML), asked: view.focusAfterRender ?? null });
    view.focusAfterRender = null;
    await flush();
  }
  return seen;
}
// Only the first content render asks, and it asks for `expected`.
function askedOnFirstContent(seen, expected) {
  const first = seen.findIndex(render => render.content);
  assert.ok(first > 0, 'premise: a loading render comes before the content');
  assert.ok(seen.slice(first + 1).some(render => render.content), 'premise: the content renders a second time');
  assert.deepEqual(seen.map(render => render.asked), seen.map((_, index) => (index === first ? expected : null)));
}
// A browser whose history moves its address, for the mounts' own navigation.
// No router is seated here, so no render takes a request an earlier test left.
async function onChanges(run) {
  view.focusAfterRender = null;
  const previousWindow = globalThis.window;
  const location = { pathname: '/changes', search: '', hash: '' };
  globalThis.window = { location, history: { pushState: (_state, _title, address) => {
    const url = new URL(address, 'http://synthetic');
    Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
  } } };
  try { await run(location); }
  finally { navigate('diagnose'); view.focusAfterRender = null; globalThis.window = previousWindow; }
}

test('a Day return to the active change asks for its date\'s control, then the heading, on its first content render only', async () => {
  kind = 'trial'; identity = 'day-return-active-synthetic'; served = DATED;
  try {
    await onChanges(async () => {
      const seat = host();
      const seen = await renders(mount, seat, { navigation: 'day-return-active', context: dayReturn('2024-06-04', identity), hold() {} },
        4, /data-form="finish"/);
      assert.match(seat.innerHTML, /data-day-date="2024-06-04"/, 'premise: the date is a supporting-date control');
      askedOnFirstContent(seen, ['[data-day-date="2024-06-04"]', HEADING]);
    });
  } finally { served = comparison; }
});

test('a Day return to a change record asks for its date\'s control, then the heading, on its first content render only', async () => {
  kind = 'trial'; identity = 'day-return-record-synthetic'; served = DATED;
  try {
    await onChanges(async () => {
      const seat = host();
      const context = dayReturn('2024-06-17', `record:trial:${identity}`);
      const seen = await renders(mountHistory, seat, { navigation: 'day-return-record', context, hold() {} },
        5, /data-record-part=/);
      assert.match(seat.innerHTML, /data-day-date="2024-06-17"/, 'premise: the date is a supporting-date control');
      askedOnFirstContent(seen, ['[data-day-date="2024-06-17"]', HEADING]);
    });
  } finally { served = comparison; }
});

test('an arrival that is not a Day return asks for nothing, and a malformed date only for the heading', async () => {
  kind = 'trial'; identity = 'day-return-plain-synthetic'; served = DATED;
  try {
    await onChanges(async () => {
      const plain = await renders(mount, host(), { navigation: 'plain-arrival', context: {}, hold() {} }, 4, /data-form="finish"/);
      assert.deepEqual(plain.map(render => render.asked), [null, null, null, null]);
      const malformed = await renders(mount, host(),
        { navigation: 'malformed-return', context: dayReturn('2024-06-04"] , body [x="', identity), hold() {} }, 4, /data-form="finish"/);
      askedOnFirstContent(malformed, HEADING);
    });
  } finally { served = comparison; }
});

test('a supporting date in either Changes view opens Day with that date and no return-focus key', async () => {
  kind = 'trial'; identity = 'day-link-synthetic'; served = DATED;
  try {
    await onChanges(async (location) => {
      for (const [mountOnce, context, content] of [
        [mount, {}, /data-form="finish"/],
        [mountHistory, { occurrence: `record:trial:${identity}` }, /data-record-part=/],
      ]) {
        const seat = host();
        await renders(mountOnce, seat, { navigation: `day-link-${content.source}`, context, hold() {} }, 5, content);
        const control = seat.days.find(day => day.dataset.dayDate === '2024-06-04');
        assert.ok(control, 'premise: the date is a supporting-date control');
        control.onclick();
        assert.equal(location.pathname, '/day');
        const address = new URLSearchParams(location.search);
        assert.equal(address.get('date'), '2024-06-04');
        assert.equal(address.get('from'), 'changes');
        assert.equal(address.has('focus'), false, 'the Day address carries a return-focus key');
        assert.doesNotMatch(location.search, /%5B|\[/, 'the Day address carries a selector bracket');
      }
    });
  } finally { served = comparison; }
});
