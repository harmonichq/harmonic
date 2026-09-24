import test from 'node:test';
import assert from 'node:assert/strict';

let fail = true;
const requests = [];
let kind = 'trial';
let identity = 'basal_rate-03-00-synthetic';
let context = {};
let expired = false;
let lateConclusion = { state: 'unavailable' };
const admission = () => ({ state: 'available', active_kind: kind, active_id: identity,
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
// history inputs changed during every snapshot.
let refusedFor = null;
globalThis.fetch = async (path, options = {}) => {
  requests.push({ path, options });
  if (options.method === 'POST') {
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
        comparison_context: { id: 'synthetic-context-0001' }, comparison: served } : null } } : {}),
  };
  return { ok: true, json: async () => result };
};
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#222222' });
const { mount, configureFollowUp, retainedEvidenceContext } = await import('./follow-up.js');
const { mount: mountHistory } = await import('./history.js');
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
  return { innerHTML: '', field, form, lateField, lateForm, assessment, retryReassessment, records, recordClose,
    querySelectorAll(selector) {
      if (selector === '[data-record]') return this.innerHTML.includes('data-record="') ? records : [];
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
  expired = true; lateConclusion = { state: 'unavailable' }; fail = true;
  try {
    const seat = host(); const route = { occurrence: `record:trial:${identity}` };
    for (let step = 0; step < 3; step++) { mountHistory(seat, { context: route, hold() {} }); await flush(); }
    assert.match(seat.innerHTML, /data-form="late-conclusion"/);
    seat.lateField.oninput({ target: { value: 'Later synthetic observation' } });
    seat.lateForm.onsubmit({ preventDefault() {} }); await flush();
    mountHistory(seat, { context: route, hold() {} });
    assert.match(seat.innerHTML, /Recording the later conclusion failed/);
    assert.match(seat.innerHTML, /Later synthetic observation/);
    const failed = requests.filter(row => String(row.path).endsWith('/conclusion')).at(-1);
    assert.match(failed.path, new RegExp(`/trials/${identity}/conclusion$`));
    fail = false;
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
  } finally { context = {}; expired = false; lateConclusion = { state: 'unavailable' }; }
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
  } finally { refusedFor = null; served = comparison; globalThis.window = previousWindow; }
});

/* ------------------------------- a later conclusion stays with its record */

// ADR 452: the later-conclusion text, a failed save and its request id belong
// to the open record, and clear whenever another record opens or the reader
// leaves for the roster — a roster press as much as an address.
const { navigate } = await import('./routes.js');
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
