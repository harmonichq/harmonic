import test from 'node:test';
import assert from 'node:assert/strict';

let fetchReply = async () => ({ ok: true, json: async () => ({ items: [], history: [] }) });
globalThis.fetch = (...args) => fetchReply(...args);
// A no-op default: most tests below name a subject in their contextual entry
// (so restoreEntry() constructs one), but do not themselves exercise the
// observer's restoration walk. Tests that DO care replace this locally.
if (!globalThis.MutationObserver) {
  globalThis.MutationObserver = class { observe() {} disconnect() {} };
}
const { createDiagnoseDestination, outcomeWindowForCase } = await import('./diagnose.js');

test('an unscoped case-file WindowQuery preserves the explicit 24 h Focus scope', () => {
  assert.deepEqual(outcomeWindowForCase({ window: { scoped: false, start_min: null, end_min: null } }),
    { start_min: 0, end_min: 1440 });
  assert.deepEqual(outcomeWindowForCase({ window: { scoped: true, start_min: 22 * 60, end_min: 2 * 60 } }),
    { start_min: 22 * 60, end_min: 2 * 60 });
  assert.equal(outcomeWindowForCase({ window: { scoped: true, start_min: null, end_min: null } }), null);
});

// A node-mocked element that tracks `isConnected` the way a real DOM node does:
// true once a host attaches it, false once it (or the host) removes it. The
// retention lifecycle reads this property directly (ADR 414), so a mock that
// does not track it would let a bug in the gate pass silently.
function makeRoot(overrides = {}) {
  const root = {
    dataset: {}, className: '', isConnected: false,
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    remove() { root.isConnected = false; },
    ...overrides,
  };
  return root;
}

function host() {
  const controls = new Map();
  return {
    innerHTML: '', isConnected: true,
    ownerDocument: { createElement: () => makeRoot() },
    replaceChildren(node) { this.node = node; node.isConnected = true; },
    querySelector(selector) { if (!controls.has(selector)) controls.set(selector, {}); return controls.get(selector); },
  };
}
function source() {
  let fail = false;
  let statusFail = false;
  let revision = 1;
  const requests = [];
  const api = {
    fetchStatus: async () => { requests.push('status'); if (statusFail) throw new Error('synthetic status failure'); return { input_revision: revision }; },
    fetchAnalysis: async () => { requests.push('analysis'); if (fail) throw new Error('synthetic read failure'); return { marker: 'analysis' }; },
    fetchScenarios: async () => { requests.push('scenarios'); return {}; },
    fetchExploreTimeOfDay: async () => { requests.push('time_of_day'); return {}; },
    fetchExploreExposures: async () => { requests.push('exposures'); return {}; },
    fetchDiagnoseFindingCasePreparation: async () => { requests.push('preparation'); return { findings: { schema: 'served' }, rendered_rows: [{ id: 'pattern:served' }] }; },
    fetchOutcomesTrend: async () => { requests.push('trend'); return {}; },
  };
  return {
    api, requests,
    fail: value => { fail = value; },
    statusFail: value => { statusFail = value; },
    setRevision: value => { revision = value; },
  };
}

test('one shared composition delegates case loads and releases each mounted entry', async () => {
  const served = source(); const calls = []; const cases = []; let mounts = 0; let callbacks;
  const response = { selection: { state: 'none' } };
  const destination = createDiagnoseDestination({ api: served.api,
    loadCase: async coordinates => { cases.push(coordinates); return response; },
    createView(options) { mounts += 1; callbacks = options.callbacks;
      return { setData: data => calls.push(data), leaveSurface: () => calls.push('leave'), refresh() {}, setError() {} }; },
  });
  await destination.read();
  const seat = host();
  for (let navigation = 0; navigation < 3; navigation += 1) {
    destination.mount(seat, { navigation, hold() {} }); await destination.read();
    destination.mount(seat, { navigation, hold() {} }); destination.leave();
  }
  assert.equal(mounts, 1);
  assert.equal(calls.filter(value => value === 'leave').length, 3);
  assert.equal(calls.filter(value => value === null).length, 3);
  const coordinates = { finding_id: 'pattern:served', projection_id: 'p', alignment: 'event', occ: 'opaque' };
  assert.equal(await callbacks.loadCase(coordinates), response);
  assert.equal(cases[0], coordinates);
  assert.ok(calls.some(value => value?.findings?.rows[0].id === 'pattern:served'));
});

test('a cold first read reaches the desk, and a Retry after a failed first read reaches it too', async () => {
  const served = source(); const seat = host();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  served.fail(true); await destination.read(); destination.mount(seat, { navigation: 0 });
  assert.match(seat.innerHTML, /Evidence unavailable/);
  assert.doesNotMatch(seat.innerHTML, /No priority needs action/);
  served.fail(false); await seat.querySelector('[data-action="retry"]').onclick();
  destination.mount(seat, { navigation: 0, hold() {} });
  assert.ok(seat.node, 'a successful cold read seats the composition');
  destination.leave();
});

test('an initial read failure and a current-read failure own distinct Diagnose frames', async () => {
  const served = source(); const seat = host();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  served.fail(false); await destination.read(); destination.mount(seat, { navigation: 0, hold() {} });
  served.fail(true); destination.mount(seat, { navigation: 1, context: { subject: 'other' }, hold() {} }); await destination.read();
  destination.mount(seat, { navigation: 1, context: { subject: 'other' }, hold() {} });
  assert.match(seat.innerHTML, /Current read failed/);
  assert.match(seat.innerHTML, /last read that answered/);
  assert.match(seat.innerHTML, /Open Diagnose/);
  const previous = globalThis.window;
  const addresses = [];
  globalThis.window = { location: { pathname: '/v2/', search: '?to=diagnose&subject=retained' },
    history: { pushState: (_state, _title, address) => addresses.push(address) } };
  try {
    served.fail(false);
    await seat.querySelector('[data-action="open-diagnose"]').onclick();
    assert.deepEqual(addresses, ['/v2/diagnose'], 'Open Diagnose discards the contextual entry');
  } finally { globalThis.window = previous; }
  destination.mount(seat, { navigation: 1, context: { subject: 'other' }, hold() {} });
  assert.ok(seat.node, 'successful retry seats the carried composition');
  destination.leave();
});

test('a navigation round trip to the same entry issues one status read, no more, and never restores entry', async () => {
  const served = source(); const seat = host();
  let refreshCalls = 0; let setDataCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() { setDataCalls += 1; }, leaveSurface() {}, refresh() { refreshCalls += 1; }, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  assert.ok(seat.node, 'first seat reaches the desk');
  served.requests.length = 0;
  setDataCalls = 0;

  // Leave to another destination: the hold cleanup detaches, keeps seated.
  // The cleanup is captured by re-mounting with a spying `hold`.
  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
  seat.isConnected = false; // the next destination's render replaced this host
  held(false);
  assert.equal(seat.node.isConnected, false, 'detach removes the root from the host');

  // Return with the same entry, same revision: exactly one request (status),
  // and the loading frame stands until it answers.
  let resolveStatus;
  const originalFetchStatus = served.api.fetchStatus;
  served.api.fetchStatus = () => new Promise(resolve => { resolveStatus = resolve; served.requests.push('status'); });
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.match(seat.innerHTML, /gf-loading/, 'the loading frame stands while the status check is open');
  assert.deepEqual(served.requests, ['status']);
  resolveStatus({ input_revision: 1 });
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  served.api.fetchStatus = originalFetchStatus;
  assert.deepEqual(served.requests, ['status'], 'no payload read runs when the entry and the revision are unchanged');
  // The status check's completion calls render(); this harness drives that
  // re-entry into mount() explicitly, the same way every other test here does.
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(setDataCalls, 0, 'a same-entry return never re-applies the payload (no restoreEntry path)');
  assert.equal(refreshCalls, 1, 'the return re-seat resizes the carried charts');
  assert.equal(seat.node.isConnected, true, 'the return reattaches the retained root');
  destination.leave();
});

test('a moved input_revision on return re-reads behind the loading frame, never the retained desk', async () => {
  const served = source(); const seat = host();
  let setDataCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() { setDataCalls += 1; }, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  served.requests.length = 0;
  setDataCalls = 0;

  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
  seat.isConnected = false;
  held(false);

  served.setRevision(2);
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.match(seat.innerHTML, /gf-loading/, 'the moved-revision re-read shows the loading frame, not the retained desk');
  assert.notEqual(seat.innerHTML, '', 'the desk never stands blank mid re-read');
  // Let the status check and the subsequent re-read settle.
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.ok(served.requests.includes('status') && served.requests.includes('analysis'),
    'a moved revision re-reads the payload rather than only checking status');
  assert.equal(setDataCalls, 1, 'the re-read reaches the desk exactly once, through the ordinary cold-seat path');
  destination.leave();
});

test('a same-subject entry with a different occurrence re-reads on return', async () => {
  const served = source(); const seat = host();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served', occurrence: 'a' } });
  served.requests.length = 0;
  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served', occurrence: 'a' } });
  seat.isConnected = false;
  held(false);

  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served', occurrence: 'b' } });
  // A changed occurrence re-reads immediately: no status check first, straight to read().
  assert.equal(served.requests[0], 'status', 'read() issues its own status read first');
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  assert.ok(served.requests.includes('analysis'), 'a changed occurrence re-reads the payload');
  destination.leave();
});

test('a read completing while Diagnose is off-screen does not restore or build an observer, and reaches the desk on return', async () => {
  const served = source(); const seat = host();
  let setDataCalls = 0; let refreshCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() { setDataCalls += 1; }, leaveSurface() {}, refresh() { refreshCalls += 1; }, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
  seat.isConnected = false;
  held(false);
  assert.equal(seat.node.isConnected, false);

  setDataCalls = 0;
  // A read that resolves while off-screen (e.g. a stray retry) must not apply.
  await destination.read();
  assert.equal(setDataCalls, 0, 'an off-screen completion does not paint against the detached root');

  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  await new Promise(resolve => setImmediate(resolve));
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  // The status check's completion calls render(); driven explicitly here.
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.ok(refreshCalls >= 1 || setDataCalls >= 1, 'the return applies the retained or re-read result to the desk');
  destination.leave();
});

test('the held cleanup invoked with pagehide runs the full teardown', async () => {
  const served = source(); const seat = host();
  const calls = [];
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData: data => calls.push(data), leaveSurface: () => calls.push('leave'), refresh() {}, setError() {} }) });
  await destination.read();
  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
  calls.length = 0;
  held(true);
  assert.ok(calls.includes('leave'), 'pagehide runs leaveSurface, unlike the detach-only arm');
  assert.ok(calls.includes(null), 'pagehide runs setData(null), unlike the detach-only arm');
});

test('return restoration requests its occurrence once while shared paints are pending', async () => {
  let notify; let clicks = 0; let selected = false;
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class { constructor(callback) { notify = callback; } observe() {} disconnect() {} };
  try {
    const member = { dataset: { occurrenceId: 'opaque' }, getAttribute: () => String(selected), click: () => { clicks += 1; }, focus() {} };
    const row = { dataset: { id: 'finding:served' }, click() {} };
    const root = makeRoot({ querySelector: () => null,
      querySelectorAll: selector => selector === '.qrow[data-id]' ? [row] : selector === '.case-occurrence' ? [member] : [] });
    const seat = host(); seat.ownerDocument.createElement = () => root;
    const destination = createDiagnoseDestination({ api: source().api,
      createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served', occurrence: 'opaque' } });
    notify(); notify();
    assert.equal(clicks, 1, 'unrelated shared paints must not repeat the pending case request');
    selected = true; notify(); destination.leave();
  } finally { globalThis.MutationObserver = previous; }
});

test('the v2 adapter wraps lane keys through the carried buttons and retains night-click scroll', async () => {
  const handlers = [];
  const level = { scrollTop: 120 };
  let selected = 0; let focused = null;
  const cells = Array.from({ length: 48 }, (_, index) => ({
    closest: selector => selector === '#lane > button.lane-cell' ? cells[index] : null,
    click() { selected = index; }, focus() { focused = index; },
  }));
  const root = makeRoot({
    addEventListener(type, run, capture) { handlers.push({ type, run, capture: capture === true }); },
    querySelectorAll: selector => selector === '#lane > button.lane-cell' ? cells : [],
    querySelector: selector => selector === '#level' ? level : null,
  });
  const seat = host(); seat.ownerDocument.createElement = () => root;
  const destination = createDiagnoseDestination({ api: source().api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read(); destination.mount(seat, { navigation: 0, hold() {} });
  const key = event => { for (const h of handlers.filter(h => h.type === 'keydown')) h.run(event); };
  let prevented = 0;
  key({ key: 'ArrowLeft', target: cells[0], preventDefault() { prevented++; } });
  assert.equal(selected, 47, 'left from the first cell picks the last carried cell');
  assert.equal(focused, 47);
  key({ key: 'ArrowRight', target: cells[47], preventDefault() { prevented++; } });
  assert.equal(selected, 0); assert.equal(focused, 0); assert.equal(prevented, 2);

  const member = { dataset: { occurrenceId: 'night' } };
  const event = { target: { closest: selector => selector === '.case-occurrence' ? member : null } };
  for (const h of handlers.filter(h => h.type === 'click' && h.capture)) h.run(event);
  level.scrollTop = 0; // The native night selection rebuilds the same reading pane.
  for (const h of handlers.filter(h => h.type === 'click' && !h.capture)) h.run(event);
  assert.equal(level.scrollTop, 120, 'selection within the same reading preserves its viewport');
  destination.leave();
});

test('S129/S131 tile activation replaces the Focus drill, while same-chart picks and retention controls keep it', async () => {
  const previousFetch = fetchReply;
  const { readFocusOptions } = await import('./focus-entry.js');
  const subjects = ['pattern:served-a', 'pattern:served-b'];
  fetchReply = async path => ({ ok: true, json: async () => path === '/api/focus'
    ? { input_revision: 7, admission: { focus_pin: { available: true } },
      pinnable_patterns: subjects.map(subject => ({ subject, key: subject.slice(8) })) }
    : { input_revision: 7, candidates: [], items: [], history: [] } });
  const handlers = []; const pending = []; let callbacks; let button = null;
  const header = { append(node) { button = node; } };
  const document = { createElement() { return { dataset: {}, remove() { if (button === this) button = null; } }; } };
  const root = { dataset: {}, ownerDocument: document, isConnected: false, remove() { root.isConnected = false; }, querySelectorAll: () => [],
    addEventListener(type, run, capture) { handlers.push({ type, run, capture }); },
    querySelector: selector => selector === 'header.crumb' ? header : selector === '[data-start-focus]' ? button : null };
  const seat = host(); seat.ownerDocument.createElement = () => root;
  const destination = createDiagnoseDestination({ api: source().api,
    loadCase: coordinates => new Promise(resolve => pending.push(() => resolve({
      finding: { id: coordinates.finding_id }, projection_id: coordinates.projection_id,
      selection: { requested_id: null }, window: { start_min: 0, end_min: 1440 },
    }))),
    createView(options) { callbacks = options.callbacks; return { setData() {}, leaveSurface() {}, refresh() {}, setError() {} }; },
  });
  const click = target => handlers.filter(h => h.type === 'click' && h.capture).forEach(h => h.run({ target }));
  const row = subject => ({ closest: selector => selector === '.qrow[data-id]' ? { dataset: { id: subject } } : null });
  const tile = (subject, control = null) => {
    const node = { dataset: { chartId: subject, seat: 'grid' } };
    node.closest = selector => selector === '.evidence-tile' ? node : selector === 'button' ? control : null;
    return node;
  };
  const request = subject => callbacks.loadCase({ finding_id: subject, projection_id: 'served-generation' });
  const answer = async promise => { pending.shift()(); await promise; };
  const offered = () => button?.dataset.startFocus || null;
  try {
    await destination.read(); await readFocusOptions();
    destination.mount(seat, { navigation: 0, hold() {} });
    for (const activation of ['click', 'Enter', ' ']) {
      click(row(subjects[0]));
      await answer(request(subjects[0]));
      assert.equal(offered(), subjects[0]);
      click(tile(subjects[0]));
      assert.equal(offered(), subjects[0], 'the owner no-ops a repeated current-chart pick');
      click(tile(subjects[1], { classList: { contains: () => false } }));
      assert.equal(offered(), subjects[0], 'a tile retention/alignment button is not a drill');
      const late = request(subjects[0]);
      const picked = tile(subjects[1]);
      if (activation === 'click') click(picked);
      else handlers.filter(h => h.type === 'keydown').forEach(h => h.run({ key: activation, target: picked }));
      assert.equal(offered(), null, `${JSON.stringify(activation)} invalidates the former drill before a response`);
      await answer(late);
      assert.equal(offered(), null, 'late evidence from the previous drill cannot restore its action');
      await answer(request(subjects[1]));
      assert.equal(offered(), subjects[1], 'only the successfully loaded picked Pattern becomes actionable');
    }
    destination.leave();
  } finally { fetchReply = previousFetch; }
});
