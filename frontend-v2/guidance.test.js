// #389 — tests for the desk's one guidance read (guidance.js).
//   node --test 'frontend-v2/**/*.test.js'
//
// The three rules this module exists to enforce are the three things a
// destination cannot see for itself, so they are what is asserted here: a failed
// read keeps the last read that answered, every set aside and Restore re-reads,
// and a write that did not land does not edit the roster.
//
// The transport is replaced by assigning globalThis.fetch BEFORE the dynamic
// import below. frontend/data.js binds its default fetch when it is first
// evaluated, so a fake installed first is the one the whole chain uses — the
// same seam makeDeps({fetch}) opens for v1's own tests, reached without adding a
// second injection point to production code.
import test from 'node:test';
import assert from 'node:assert/strict';

/** One guidance payload, shaped as /api/guidance actually answers. */
function guidancePayload({ generation = 'guidance:abc:0:r8', aside = false, reason = null } = {}) {
  const candidate = {
    subject: 'setting:basal_rate',
    kind: 'setting',
    parameter: 'basal_rate',
    title: 'Basal profile',
    units: 'U/h',
    priority: 55,
    action: [{ kind: 'setting_instruction', parameter: 'basal_rate', start_min: 180, end_min: 210, direction: 'lower', units: 'U/h', recommended: 0.48 }],
    members: [{ span: { start_min: 180, end_min: 210 }, asserts_move: true, safety_status: 'lower', held_reason: null, direction: 'lower' }],
    preference: { set_aside: aside, return_reason: null },
    decision: aside ? { decided_at: '2026-01-01 08:00:00', reason, comparison_version: '383:1', state: {} } : undefined,
    admitted: true,
  };
  return {
    schema: 'guidance-v2',
    analysis_generation: generation,
    window: { days: 30, start: '2024-05-31', end: '2024-06-30' },
    active_watch: null,
    selected: aside ? null : candidate,
    disposition: aside ? 'quiet' : 'eligible_action',
    reasons: { admission: 'The parameter owner staged 1 member verdict(s).', ordering: 'Priority 55 leads.', return: null },
    unavailable: null,
    candidates: [candidate],
    alternatives: [],
  };
}

// ONE dispatcher, installed before anything imports frontend/data.js: that
// module binds its default transport when it is first evaluated, and the module
// cache hands the same instance to every later import. The per-test handler
// hangs off it rather than replacing it.
let handle = () => ({ status: 500 });
let calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || 'GET' });
  const answer = handle(url, opts, calls);
  const status = answer?.status ?? 200;
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => (ok ? (answer?.body ?? answer) : { detail: answer?.detail ?? 'failed' }),
  };
};

/**
 * Point the transport at this test's handler and load a FRESH guidance module.
 *
 * The cache-busting query is what makes each test independent: guidance.js holds
 * the desk's one read in module state, which is the point of it, so two tests
 * sharing an instance would share that state too.
 */
async function withClient(handler) {
  handle = handler;
  calls = [];
  const guidance = await import(`./guidance.js?case=${Math.random()}`);
  return { guidance, calls };
}

/** Let the module's own promise chain settle before asserting on it. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test('a read that answers becomes the desk\'s guidance', async () => {
  const { guidance, calls } = await withClient(() => guidancePayload());
  guidance.loadGuidance();
  await settled();
  assert.equal(calls.length, 1);
  assert.equal(guidance.disposition(), 'eligible_action');
  assert.equal(guidance.selectedConcern().subject, 'setting:basal_rate');
  assert.equal(guidance.guidanceError(), null);
  assert.equal(guidance.guidanceSettled(), true);
  assert.equal(guidance.analysisGeneration(), 'guidance:abc:0:r8');
});

test('a second render does not ask again', async () => {
  const { guidance, calls } = await withClient(() => guidancePayload());
  guidance.loadGuidance();
  await settled();
  guidance.loadGuidance();
  guidance.loadGuidance();
  await settled();
  assert.equal(calls.length, 1);
});

test('a failed read keeps the last read that answered and says it failed', async () => {
  let fail = false;
  const { guidance } = await withClient(() => (fail ? { status: 503, detail: 'guidance is unavailable' } : guidancePayload()));
  guidance.loadGuidance();
  await settled();
  const answered = guidance.guidance();

  fail = true;
  guidance.loadGuidance({ force: true });
  await settled();
  // The former read is untouched — a failure never edits what a read established.
  assert.equal(guidance.guidance(), answered);
  assert.equal(guidance.selectedConcern().subject, 'setting:basal_rate');
  // And it is not silently current: the error stands beside it.
  assert.equal(guidance.guidanceError().status, 503);
});

test('a read that answers again clears the failure', async () => {
  let fail = true;
  const { guidance } = await withClient(() => (fail ? { status: 503 } : guidancePayload()));
  guidance.loadGuidance();
  await settled();
  assert.ok(guidance.guidanceError());
  fail = false;
  guidance.loadGuidance({ force: true });
  await settled();
  assert.equal(guidance.guidanceError(), null);
  assert.ok(guidance.guidance());
});

test('set aside writes the preference and then re-reads guidance', async () => {
  // Retry is not idempotent by receipt and the write answers about one row, so
  // the only way to know what leads next is to ask again (HV2-16, S88).
  let aside = false;
  const { guidance, calls } = await withClient((url, opts) => {
    if (opts.method === 'PUT') { aside = true; return { subject: 'setting:basal_rate', set_aside: true }; }
    return guidancePayload({ aside, reason: 'travelling' });
  });
  guidance.loadGuidance();
  await settled();

  assert.equal(await guidance.setAside('setting:basal_rate', 'travelling'), true);
  await settled();
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'PUT', 'GET']);
  assert.equal(calls[1].url, '/api/guidance/preferences/setting%3Abasal_rate');
  assert.equal(guidance.asideRows().length, 1);
  assert.equal(guidance.asideRows()[0].decision.reason, 'travelling');
  assert.equal(guidance.selectedConcern(), null);
});

test('set aside quotes the generation the desk read it at', async () => {
  const bodies = [];
  const { guidance } = await withClient((url, opts) => {
    if (opts.method === 'PUT') { bodies.push(JSON.parse(opts.body)); return { set_aside: true }; }
    return guidancePayload({ generation: 'guidance:zzz:0:r9' });
  });
  guidance.loadGuidance();
  await settled();
  await guidance.setAside('setting:basal_rate', null);
  assert.equal(bodies[0].generation, 'guidance:zzz:0:r9');
  assert.equal(bodies[0].reason, null);
});

test('a refused set aside is not rendered as one, and still re-reads', async () => {
  // The store said the read moved. Editing the roster anyway would show a
  // set-aside that does not exist.
  const { guidance, calls } = await withClient((url, opts) => {
    if (opts.method === 'PUT') return { status: 409, detail: 'guidance changed; read it again' };
    return guidancePayload();
  });
  guidance.loadGuidance();
  await settled();

  assert.equal(await guidance.setAside('setting:basal_rate', 'nope'), false);
  await settled();
  assert.equal(guidance.asideRows().length, 0);
  assert.equal(guidance.selectedConcern().subject, 'setting:basal_rate');
  assert.equal(guidance.guidanceWriteError().status, 409);
  assert.equal(guidance.guidanceWriteError().message, 'guidance changed; read it again');
  // A conflict means this desk is already behind, so it asks again either way.
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'PUT', 'GET']);
});

test('restore deletes the preference and re-reads', async () => {
  let aside = true;
  const { guidance, calls } = await withClient((url, opts) => {
    if (opts.method === 'DELETE') { aside = false; return { subject: 'setting:basal_rate', set_aside: false }; }
    return guidancePayload({ aside });
  });
  guidance.loadGuidance();
  await settled();
  assert.equal(guidance.asideRows().length, 1);

  assert.equal(await guidance.restore('setting:basal_rate'), true);
  await settled();
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'DELETE', 'GET']);
  assert.equal(guidance.asideRows().length, 0);
  assert.equal(guidance.selectedConcern().subject, 'setting:basal_rate');
});

test('a write failure clears when the reader moves on', async () => {
  const { guidance } = await withClient((url, opts) =>
    (opts.method === 'PUT' ? { status: 409, detail: 'no' } : guidancePayload()));
  guidance.loadGuidance();
  await settled();
  await guidance.setAside('setting:basal_rate', null);
  assert.ok(guidance.guidanceWriteError());
  guidance.clearGuidanceWriteError();
  assert.equal(guidance.guidanceWriteError(), null);
});

test('hasAction reads the served action rather than the concern\'s shape', async () => {
  const { guidance } = await withClient(() => guidancePayload());
  assert.equal(guidance.hasAction({ action: [{ recommended: 1 }] }), true);
  // Held, absent and empty all fail closed: no action, no staging.
  assert.equal(guidance.hasAction({ action: [] }), false);
  assert.equal(guidance.hasAction({ action: null }), false);
  assert.equal(guidance.hasAction({}), false);
  assert.equal(guidance.hasAction(null), false);
});

test('Focus admission copy translates known backend tokens without inventing admission', async () => {
  const { guidance } = await withClient(() => guidancePayload());
  assert.deepEqual(guidance.admissionReason('reconciliation_required'), {
    said: 'Harmonic has not reconciled the latest pump and sensor data yet, so it is not offering an action from this read.',
    label: 'Waiting for reconciliation',
  });
  assert.deepEqual(guidance.admissionReason('active_trial'), {
    said: 'A Trial is already being watched, so Harmonic is not offering a Focus from this read.',
    label: 'Trial in progress',
  });
  assert.deepEqual(guidance.admissionReason('new_backend_reason'), {
    said: 'Harmonic is not offering a Focus from this read.',
    label: 'Unavailable from this read',
  });
});

test('candidateFor finds a subject the read carries, and nothing else', async () => {
  const { guidance } = await withClient(() => guidancePayload());
  guidance.loadGuidance();
  await settled();
  assert.equal(guidance.candidateFor('setting:basal_rate').parameter, 'basal_rate');
  assert.equal(guidance.candidateFor('setting:isf'), null);
});

test('before the first read there is no guidance and nothing is settled', async () => {
  const { guidance } = await withClient(() => guidancePayload());
  assert.equal(guidance.guidance(), null);
  assert.equal(guidance.guidanceSettled(), false);
  assert.equal(guidance.selectedConcern(), null);
  assert.deepEqual(guidance.candidates(), []);
  assert.equal(guidance.analysisGeneration(), null);
});
