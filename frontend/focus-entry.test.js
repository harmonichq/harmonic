import test from 'node:test';
import assert from 'node:assert/strict';

const offered = { key: 'served-pattern', subject: 'pattern:served-pattern', readiness: { count: 1, gate: 12, verdict: 'ready' } };
const source = { input_revision: 7, analysis_generation: 'served-generation' };
const roster = { input_revision: 7, admission: { focus_pin: { available: true } }, pinnable_patterns: [offered] };

// The page's own entry reads through the default client, which captures fetch
// when it is first imported, so this stub stands before the module is.
let servedPin = { available: true };
let pinRefusal = null;
globalThis.fetch = async (path, options = {}) => {
  if (options.method === 'POST') {
    return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ detail: pinRefusal }) };
  }
  const body = String(path).endsWith('/api/guidance')
    ? { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] }
    : { ...roster, admission: { focus_pin: servedPin } };
  return { ok: true, json: async () => body };
};
const { createFocusEntry, mount } = await import('./focus-entry.js');
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
function host() {
  const buttons = {};
  return { innerHTML: '', buttons, querySelector(selector) {
    const [name] = selector.split(',').map(part => /data-focus="([^"]+)"/.exec(part)?.[1])
      .filter(name => name && this.innerHTML.includes(`data-focus="${name}"`));
    if (!name) return null;
    buttons[name] ||= {};
    return buttons[name];
  } };
}
async function arrive(seat, navigation) {
  const deps = { context: { subject: offered.subject }, navigation };
  for (let step = 0; step < 3; step++) { mount(seat, deps); await flush(); }
  return deps;
}

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
    label: 'Waiting for reconciliation', action: 'Focus unavailable', retry: false });
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

test('a pending Plan gives the case-file header no context; the watch panel carries it', async () => {
  // #431: the same pending Plan reads the same in every window and case, so no
  // case's header names it. Start Focus stays withheld as the served admission says.
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  const entry = createFocusEntry({ readGuidance: async () => g, api: {
    fetchFocuses: async () => ({ ...roster, admission: { focus_pin: { available: false, reason: 'pending_plan' } } }),
  } });
  await entry.read();
  for (const selected of [{ subject: offered.subject }, { subject: offered.subject, finding: { lever: 'served-lever' } }]) {
    assert.equal(entry.contextForCase(selected), null);
    assert.equal(entry.forCase(selected), null);
  }
});

test('active Trial and Focus context use compact actions, plain copy, and their existing routes', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, title: 'Served Pattern' }] };
  for (const [reason, label, action, route] of [
    ['active_focus', 'Focus in progress', 'View Focus', { subject: 'focus' }],
    ['active_trial', 'Trial in progress', 'View Trial', { subject: 'trial' }],
  ]) {
    const entry = createFocusEntry({ readGuidance: async () => g, api: {
      fetchFocuses: async () => ({ ...roster, admission: { focus_pin: { available: false, reason } } }),
    } });
    await entry.read();
    const context = entry.contextForCase({ subject: offered.subject });
    assert.equal(context.label, label);
    assert.equal(context.action, action);
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
    label: 'Waiting for reconciliation', action: 'Focus unavailable', retry: false });
});

test('the entry page says in words why a Focus is not offered, never the served code', async () => {
  for (const [reason, said] of [
    ['pending_plan', /A recorded Plan is still pending, so Harmonic is not offering a Focus from this read\./],
    ['reconciliation_required', /Harmonic has not reconciled the latest pump and sensor data yet/],
    ['a_new_admission_reason', /Harmonic is not offering a Focus from this read\./],
  ]) {
    servedPin = { available: false, reason };
    try {
      const seat = host(); await arrive(seat, `withheld-${reason}`);
      assert.match(seat.innerHTML, said, reason);
      assert.doesNotMatch(seat.innerHTML, new RegExp(reason), reason);
      assert.match(seat.innerHTML, /data-focus="refresh"/, 'a withheld entry offers no Start Focus');
    } finally { servedPin = { available: true }; }
  }
});

test('a refused pin prints the served sentence once, with one full stop before the confirmation line', async () => {
  pinRefusal = { code: 'stale_input_revision', message: 'New pump or sensor data arrived since this page was read.',
    input_revision: 8, admission: { state: 'available' } };
  try {
    const seat = host(); const deps = await arrive(seat, 'pin-refused');
    assert.match(seat.innerHTML, /data-focus="pin"/);
    await seat.buttons.pin.onclick();
    mount(seat, deps);
    assert.match(seat.innerHTML,
      /Starting the Focus failed: New pump or sensor data arrived since this page was read\. No successful pin was confirmed\./);
    assert.equal(seat.innerHTML.split('New pump or sensor data arrived').length - 1, 1);
    assert.doesNotMatch(seat.innerHTML, /\.\.|stale_input_revision|\(409\)/);
  } finally { pinRefusal = null; }
});
