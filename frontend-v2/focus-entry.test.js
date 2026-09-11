import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusEntry } from './focus-entry.js';

const offered = { key: 'served-pattern', subject: 'pattern:served-pattern', readiness: { count: 1, gate: 12, verdict: 'ready' } };
const source = { input_revision: 7, analysis_generation: 'served-generation' };
const roster = { input_revision: 7, admission: { focus_pin: { available: true } }, pinnable_patterns: [offered] };

test('pin uses the served canonical Pattern and never chooses its member or calculates admission', async () => {
  const writes = [];
  const entry = createFocusEntry({ readGuidance: async () => source, api: {
    fetchFocuses: async () => roster,
    pinFocus: async (...args) => { writes.push(args); return { id: 4, subject: offered.subject }; },
  } });
  await entry.read();
  assert.equal(entry.candidate(offered.subject), offered, 'served permission holds even with a count below the gate');
  assert.equal(entry.candidate('habit:invented'), null);
  assert.equal((await entry.start(offered.subject, { start_min: 720, end_min: 1080 })).id, 4);
  assert.equal(writes[0][0], null);
  assert.deepEqual(Object.keys(writes[0][1]).sort(), ['analysis_generation','input_revision','outcome_window','pattern_key','request_id','subject']);
  assert.equal(writes[0][1].pattern_key, offered.key);
  assert.equal(writes[0][1].subject, offered.subject);
  assert.deepEqual(writes[0][1].outcome_window, { start_min: 720, end_min: 1080 });
});

test('failed pin preserves identity for retry and never publishes success', async () => {
  const writes = [];
  const entry = createFocusEntry({ readGuidance: async () => source, api: {
    fetchFocuses: async () => roster, pinFocus: async (_, body) => {
      writes.push(body); if (writes.length === 1) throw new Error('Synthetic refusal');
      return { id: 4 };
    },
  } });
  await entry.read();
  assert.equal(await entry.start(offered.subject), null);
  assert.match(entry.state().failure.message, /Synthetic refusal/);
  assert.equal((await entry.start(offered.subject)).id, 4);
  assert.equal(writes[0].request_id, writes[1].request_id);
  assert.equal(entry.state().failure, null);
});

test('occupied admission and crossed source revisions grant no pin', async () => {
  for (const response of [ { ...roster, admission: { focus_pin: { available: false } } }, { ...roster, input_revision: 8 } ]) {
    let writes = 0;
    const entry = createFocusEntry({ readGuidance: async () => source, api: { fetchFocuses: async () => response, pinFocus: async () => { writes++; } } });
    await entry.read();
    assert.equal(entry.candidate(offered.subject), null);
    assert.equal(await entry.start(offered.subject), null);
    assert.equal(writes, 0);
  }
});

test('a served unavailable admission remains discoverable without granting a pin', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  const blocked = { ...roster, admission: { focus_pin: {
    available: false, reason: 'reconciliation_required',
  } } };
  const entry = createFocusEntry({ readGuidance: async () => g, api: { fetchFocuses: async () => blocked } });
  await entry.read();
  const context = entry.contextForCase({ subject: offered.subject, finding: { lever: 'served-lever' } });
  assert.deepEqual(context, { subject: offered.subject, offered: null, title: 'Served Pattern',
    reason: 'Harmonic has not reconciled the latest pump and sensor data yet, so it is not offering an action from this read.',
    label: 'Waiting for reconciliation', retry: false });
  assert.equal(entry.forCase({ subject: offered.subject }), null);
});

test('known occupied admission codes use the shared plain-language label', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  const blocked = { ...roster, admission: { focus_pin: { available: false, reason: 'active_trial' } } };
  const entry = createFocusEntry({ readGuidance: async () => g, api: { fetchFocuses: async () => blocked } });
  await entry.read();
  const context = entry.contextForCase({ subject: offered.subject, finding: { lever: 'served-lever' } });
  assert.equal(context.label, 'Trial in progress');
  assert.doesNotMatch(context.reason, /active_trial/);
});

test('a failed Focus refresh retains its served parent and makes retry visible', async () => {
  let failRefresh = false;
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  const entry = createFocusEntry({ readGuidance: async () => {
    if (failRefresh) throw new Error('Synthetic Focus read failed');
    return g;
  }, api: { fetchFocuses: async () => roster } });
  const selected = { subject: offered.subject, finding: { lever: 'served-lever' } };
  await entry.read();
  failRefresh = true;
  await entry.read();
  assert.deepEqual(entry.contextForCase(selected), { subject: offered.subject, offered: null,
    title: 'Served Pattern', reason: 'Focus status could not load. Retry the read.',
    label: 'Focus status unavailable', retry: true });
  assert.match(entry.state().failure.message, /Synthetic Focus read failed/);
});

test('a first Focus read failure still gives a selected Pattern a visible retry, never a stale offer', async () => {
  const entry = createFocusEntry({ readGuidance: async () => { throw new Error('Synthetic cold read failed'); },
    api: { fetchFocuses: async () => roster } });
  const selected = { subject: offered.subject, finding: { lever: 'served-lever' } };
  await entry.read();
  assert.equal(entry.forCase(selected), null);
  assert.deepEqual(entry.contextForCase(selected), { subject: offered.subject, offered: null,
    title: offered.subject, reason: 'Focus status could not load. Retry the read.',
    label: 'Focus status unavailable', retry: true });
});

test('pending Plan and active Focus context use served plain copy and their existing routes', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  for (const [reason, label, route] of [
    ['pending_plan', 'Plan awaiting confirmation', { subject: 'plan' }],
    ['active_focus', 'Focus in progress', { subject: 'focus' }],
  ]) {
    const entry = createFocusEntry({ readGuidance: async () => g, api: {
      fetchFocuses: async () => ({ ...roster, admission: { focus_pin: { available: false, reason } } }),
    } });
    await entry.read();
    const context = entry.contextForCase({ subject: offered.subject });
    assert.equal(context.label, label);
    assert.deepEqual(context.route, route);
    assert.doesNotMatch(context.reason, new RegExp(reason));
  }
});

test('a child case reaches only its backend-published Pattern owner', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, kind: 'pattern', collapse: 'collapse_to_member', chosen_member: { subject: 'habit:served-lever' } }] };
  const entry = createFocusEntry({ readGuidance: async () => g, api: { fetchFocuses: async () => roster } });
  await entry.read();
  const selected = { subject: 'finding:served-lever', finding: { lever: 'served-lever' } };
  assert.equal(entry.forCase(selected), offered);
  assert.equal(entry.forCase(null), null, 'background responses have no explicit selected case');
  assert.equal(entry.forCase({ ...selected, finding: { lever: 'another-lever' } }), null);
  g.candidates[0] = { ...g.candidates[0], collapse: 'remain_pattern', chosen_member: undefined,
    members: [{ subject: 'habit:served-lever' }] };
  assert.equal(entry.forCase(selected), offered,
    'a visible remain-pattern parent is reached through served membership, not a client readiness calculation');
  g.candidates.push({ subject: 'pattern:ambiguous', kind: 'pattern', members: [{ subject: 'habit:served-lever' }] });
  assert.equal(entry.forCase(selected), null, 'ambiguous parentage must not invent a Focus owner');
});

test('a remain-pattern child keeps its withheld parent context without a Focus pin', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, kind: 'pattern', title: 'Highs after meals',
    collapse: 'remain_pattern', members: [{ subject: 'habit:served-lever' }] }] };
  const blocked = { ...roster, admission: { focus_pin: { available: false, reason: 'reconciliation_required' } } };
  const entry = createFocusEntry({ readGuidance: async () => g, api: { fetchFocuses: async () => blocked } });
  const selected = { subject: 'finding:served-lever', finding: { lever: 'served-lever' } };
  await entry.read();
  assert.equal(entry.forCase(selected), null);
  assert.deepEqual(entry.contextForCase(selected), { subject: offered.subject, offered: null,
    title: 'Highs after meals',
    reason: 'Harmonic has not reconciled the latest pump and sensor data yet, so it is not offering an action from this read.',
    label: 'Waiting for reconciliation', retry: false });
});
