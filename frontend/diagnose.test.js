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
    dataset: {}, className: '', isConnected: false, style: {},
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    remove() { root.parentNode?.removeChild(root); root.isConnected = false; },
    ...overrides,
  };
  return root;
}

// The park is the document body: a parked root stays connected (it is in the
// document) but off the surface and hidden, which is what the desk keys on.
// The host keeps a child list the way a DOM node does: appending a node moves
// it from wherever it was, and every child the host loses is recorded in
// `removed`, so a test can see whether a render detached the seated root.
// `replaceChildren` stays modelled so a mount that reverts to re-seating fails
// on that removal, not on a missing method.
function host() {
  const controls = new Map();
  const body = {
    append(node) { node.parentNode?.removeChild(node); node.parentNode = body; node.isConnected = true; node.parked = true; },
    removeChild(node) { node.parentNode = null; },
  };
  const ownerDocument = { body };
  ownerDocument.createElement = () => Object.assign(makeRoot(), { ownerDocument });
  return {
    childNodes: [],
    removed: [],
    get firstElementChild() { return this.childNodes[0] || null; },
    // Writing markup gives the host a fresh first element, as the DOM would.
    get innerHTML() { return this._html || ''; },
    set innerHTML(v) {
      this._html = v;
      for (const child of [...this.childNodes]) this.removeChild(child);
      const frame = { dataset: {}, parentNode: this, remove() { frame.parentNode?.removeChild(frame); } };
      this.childNodes.push(frame);
    },
    isConnected: true,
    ownerDocument,
    append(node) {
      node.parentNode?.removeChild(node);
      this.childNodes.push(node); node.parentNode = this;
      this.node = node; node.isConnected = true; node.parked = false;
    },
    removeChild(node) {
      this.childNodes.splice(this.childNodes.indexOf(node), 1);
      node.parentNode = null; node.isConnected = false;
      this.removed.push(node);
    },
    replaceChildren(...nodes) {
      for (const child of [...this.childNodes]) this.removeChild(child);
      for (const node of nodes) this.append(node);
    },
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

// A host whose ensureView()-created root serves one mocked "24 h" Window
// segment button, so restoreEntry()'s click is directly observable.
function hostWithWindowButton() {
  const seat = host();
  const button = { textContent: '24 h', clicks: 0, click() { this.clicks += 1; } };
  const priorCreateElement = seat.ownerDocument.createElement;
  seat.ownerDocument.createElement = () => Object.assign(priorCreateElement(),
    { querySelectorAll: (selector) => (selector === '#seg-window button' ? [button] : []) });
  return { seat, button };
}

test('#413 · a cold arrival with no contextual entry opens on the 24 h window', async () => {
  const served = source();
  const { seat, button } = hostWithWindowButton();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {} });
  assert.equal(button.clicks, 1, 'no subject and no retained window: the 24 h control is pressed');
  destination.leave();
});

test('#413 · a cold arrival with a contextual subject leaves the 24 h override to restoreEntry()\'s own rule', async () => {
  const served = source();
  const { seat, button } = hostWithWindowButton();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  // A non-Pattern, non-Finding subject with an explicit window keeps the
  // workstation's own Overnight-booting preset — restoreEntry()'s existing
  // rule, unaffected by the new no-subject branch.
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'setting:basal_rate', window: '30-90' } });
  assert.equal(button.clicks, 0, 'a named subject with its own window is untouched by the cold-arrival rule');
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
  globalThis.window = { location: { pathname: '/', search: '?to=diagnose&subject=retained' },
    history: { pushState: (_state, _title, address) => addresses.push(address) } };
  try {
    served.fail(false);
    await seat.querySelector('[data-action="open-diagnose"]').onclick();
    assert.deepEqual(addresses, ['/diagnose'], 'Open Diagnose discards the contextual entry');
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
  assert.equal(seat.node.parked, true, 'leaving parks the root off the surface');
  assert.equal(seat.node.style.display, 'none', 'the parked root is hidden');

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
  assert.equal(seat.node.parked, false, 'the return re-seats the retained root');
  assert.equal(seat.node.style.display, '', 'the re-seated root is shown again');
  destination.leave();
});

test('a same-entry return puts the reading pane scroll back where the reader left it', async () => {
  const served = source(); const seat = host();
  // A real pane: the browser resets scrollTop to 0 when the node is removed
  // and re-inserted, which is what the detach/re-seat cycle does.
  const level = { scrollTop: 0 };
  const root = makeRoot({ querySelector: selector => (selector === '#level' ? level : null) });
  root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
  // Parking hides the root; an element the browser no longer lays out reads 0.
  seat.ownerDocument.body.append = node => { node.isConnected = true; node.parked = true; level.scrollTop = 0; };
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  level.scrollTop = 54;
  let held;
  destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
  seat.isConnected = false;
  held(false);
  assert.equal(level.scrollTop, 0, 'premise: parking the root drops the pane scroll, as a browser does');
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  for (let i = 0; i < 4; i += 1) await Promise.resolve();
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(seat.node.parked, false, 'the return re-seats the retained root');
  assert.equal(seat.node.style.display, '', 'the re-seated root is shown again');
  assert.equal(level.scrollTop, 54, 'the retained re-seat restores the reading pane scroll');
  destination.leave();
});

test('re-pressing Diagnose while on Diagnose re-reads and restores the index, never the retained drill', async () => {
  const served = source(); const seat = host();
  let rowClicks = 0;
  const row = { dataset: { id: 'finding:served' }, click() { rowClicks += 1; } };
  const root = makeRoot({ querySelectorAll: selector => (selector === '.qrow[data-id]' ? [row] : []) });
  root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
  let setDataCalls = 0; let leaveSurfaceCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData(data) { if (data) setDataCalls += 1; }, leaveSurface() { leaveSurfaceCalls += 1; }, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  served.requests.length = 0; setDataCalls = 0; rowClicks = 0;
  // The root is still attached: no other destination rendered in between.
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.match(seat.innerHTML, /gf-loading/, 'the re-press shows the loading frame while it re-reads');
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  assert.ok(served.requests.includes('analysis'), 'the re-press re-reads the guidance, as before retention');
  assert.equal(leaveSurfaceCalls, 1, 'the re-press resets the workstation surface to the index');
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(setDataCalls, 1, 'the fresh seat applies the re-read payload');
  assert.equal(rowClicks, 1, 'the fresh seat runs entry restoration');
  destination.leave();
});

// ADR 441: removing and re-inserting the seated root drops the focus held
// inside it (an Occurrence row the reader stepped to) to the page body.
test('an in-place render keeps the seated case file attached, never removing and re-inserting it', async () => {
  const served = source(); const seat = host();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  destination.mount(seat, { navigation: 0, hold() {} });
  assert.match(seat.innerHTML, /gf-loading/, 'premise: the cold mount shows the loading frame while it reads');
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {} });
  const root = seat.node;
  assert.deepEqual(seat.childNodes, [root], 'the cold seat leaves the case file as the host\'s only child');
  seat.removed.length = 0;
  // A background guidance or Focus options read lands: the desk renders again
  // with the same navigation, which is an in-place render.
  destination.mount(seat, { navigation: 0, hold() {} });
  assert.equal(seat.removed.filter(node => node === root).length, 0,
    'the in-place render never removes the seated case file from the host');
  assert.deepEqual(seat.childNodes, [root], 'the case file is still the host\'s only child');
  assert.equal(root.isConnected, true);
  destination.leave();
});

test('a render arriving while the failed frame stands leaves its Retry control in place', async () => {
  const served = source(); const seat = host();
  let writes = 0;
  const write = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(seat), 'innerHTML') || Object.getOwnPropertyDescriptor(seat, 'innerHTML');
  Object.defineProperty(seat, 'innerHTML', { get() { return this._html || ''; }, set(v) { writes += 1; write.set.call(this, v); } });
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  served.fail(true);
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.match(seat.innerHTML, /Current read failed/, 'the failed re-read shows its frame');
  const retry = seat.querySelector('[data-action="retry"]');
  const before = writes;
  // The focus-options module's change notification re-enters mount here.
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(writes, before, 'a second render of the same failed frame rewrites nothing');
  assert.equal(seat.querySelector('[data-action="retry"]'), retry, 'the Retry control keeps its identity');
  // Another destination's failure frame, with its own Retry, is not this frame.
  seat.innerHTML = '<section class="gf-empty"><button data-action="retry">Retry</button></section>';
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(writes, before + 2, 'a foreign frame on the surface is replaced by the Diagnose frame');
  served.fail(false);
  destination.leave();
});

test('a render arriving during a Retry read leaves the failed frame and its Retry standing', async () => {
  const served = source(); const seat = host();
  let writes = 0;
  const write = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(seat), 'innerHTML') || Object.getOwnPropertyDescriptor(seat, 'innerHTML');
  Object.defineProperty(seat, 'innerHTML', { get() { return this._html || ''; }, set(v) { writes += 1; write.set.call(this, v); } });
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served' } });
  served.fail(true);
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.match(seat.innerHTML, /Current read failed/, 'the failed re-read shows its frame');
  const retry = seat.querySelector('[data-action="retry"]');
  const before = writes;
  // The reader presses Retry (the read is now pending) and an unrelated
  // completion re-enters mount before it answers.
  const retrying = retry.onclick();
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.equal(writes, before, 'the failed frame stands while its own Retry read is pending');
  assert.equal(seat.querySelector('[data-action="retry"]'), retry, 'the Retry control keeps its identity mid-read');
  served.fail(false);
  await retrying;
  destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
  assert.ok(seat.node, 'the successful Retry reaches the desk');
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

test('the workstation\'s own Retry finishing off-screen is recorded, not painted, and applied with its restoration on return', async () => {
  const served = source();
  let resolveAnalysis;

  let observerCount = 0;
  const previousMO = globalThis.MutationObserver;
  globalThis.MutationObserver = class { constructor() { observerCount += 1; } observe() {} disconnect() {} };

  let rowClicks = 0;
  const row = { dataset: { id: 'finding:served' }, click() { rowClicks += 1; } };
  const root = makeRoot({ querySelectorAll: selector => (selector === '.qrow[data-id]' ? [row] : []) });
  const seat = host(); root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;

  const setDataCalls = [];
  let refreshCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData: data => setDataCalls.push(data), leaveSurface() {}, refresh() { refreshCalls += 1; }, setError() {} }) });

  try {
    await destination.read();
    // The hold callback captured here is the one routes.js would still be
    // holding when the reader navigates away mid-Retry: mount() is not called
    // again between the initial seat and starting the Retry below.
    let held;
    destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
    assert.equal(setDataCalls.length, 1, 'the initial cold seat applies the first payload');
    assert.equal(rowClicks, 1, 'the initial seat restores the entry');
    assert.equal(observerCount, 1, 'the initial seat builds one restoration observer');
    const firstPayload = setDataCalls[0];
    setDataCalls.length = 0; rowClicks = 0; observerCount = 0; refreshCalls = 0;

    // From here on, fetchAnalysis is held open so the test controls exactly
    // when the Retry's read resolves.
    served.api.fetchAnalysis = async () => {
      served.requests.push('analysis');
      return new Promise((resolve) => { resolveAnalysis = () => resolve({ marker: 'retried' }); });
    };
    // The workstation's own Retry: starts while seated and the root is attached.
    const retried = destination.read();

    // Leave to another destination before the Retry resolves: the hold cleanup
    // detaches (observer + root), and stays seated.
    seat.isConnected = false;
    held(false);
    assert.equal(seat.node.parked, true, 'the root is parked while the Retry is in flight');

    // Let the Retry's own fetchStatus() settle so fetchAnalysis() actually starts.
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    // The Retry resolves off-screen.
    resolveAnalysis();
    await retried;
    assert.equal(setDataCalls.length, 0, 'an off-screen completion does not call setData against the detached root');
    assert.equal(rowClicks, 0, 'an off-screen completion runs no entry restoration');
    assert.equal(observerCount, 0, 'an off-screen completion builds no MutationObserver');

    // Return: same entry, unmoved revision — mount's status check finds nothing
    // moved, and the recorded completion (not a fresh re-read) applies now.
    destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    // The status check's completion calls render(); driven explicitly here,
    // the same way every other test in this file drives it.
    destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });

    assert.equal(setDataCalls.length, 1, 'the return applies the completed read exactly once');
    assert.notEqual(setDataCalls[0], firstPayload, 'the applied payload is the Retry\'s own, not the stale pre-Retry object');
    assert.equal(rowClicks, 1, 'the return restores the entry, since a real completion was recorded');
    assert.equal(observerCount, 1, 'the return builds exactly one restoration observer for the applied completion');
    destination.leave();
  } finally { globalThis.MutationObserver = previousMO; }
});

test('a re-read between an off-screen Retry completion and the next return discards the stale completion, not restoreEntry() on a plain round trip', async () => {
  const served = source();
  let resolveAnalysis;

  let observerCount = 0;
  const previousMO = globalThis.MutationObserver;
  globalThis.MutationObserver = class { constructor() { observerCount += 1; } observe() {} disconnect() {} };

  let rowClicks = 0;
  const row = { dataset: { id: 'finding:served' }, click() { rowClicks += 1; } };
  const root = makeRoot({ querySelectorAll: selector => (selector === '.qrow[data-id]' ? [row] : []) });
  const seat = host(); root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;

  const setDataCalls = [];
  let refreshCalls = 0;
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData: data => setDataCalls.push(data), leaveSurface() {}, refresh() { refreshCalls += 1; }, setError() {} }) });

  try {
    await destination.read();
    let held;
    destination.mount(seat, { navigation: 0, hold: fn => { held = fn; }, context: { subject: 'finding:served' } });
    setDataCalls.length = 0; rowClicks = 0; observerCount = 0; refreshCalls = 0;

    // The workstation's own Retry: starts while seated and attached, held open.
    served.api.fetchAnalysis = async () => {
      served.requests.push('analysis');
      return new Promise((resolve) => { resolveAnalysis = () => resolve({ marker: 'retried' }); });
    };
    const retried = destination.read();

    // Leave to another destination before the Retry resolves.
    seat.isConnected = false;
    held(false);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    // The Retry resolves off-screen: recorded (deferredApply), not applied.
    resolveAnalysis();
    await retried;
    assert.equal(setDataCalls.length, 0, 'the off-screen Retry completion is recorded, not painted');

    // Back to a plain, immediately-resolving read for the moved-revision re-read.
    served.api.fetchAnalysis = async () => { served.requests.push('analysis'); return { marker: 'reread' }; };
    served.setRevision(2);

    // Return with a MOVED revision: mount's status check finds it moved and
    // runs leave(); read() — a full re-read that must discard the stale
    // off-screen completion, not carry it into the next seat. leave() itself
    // legitimately calls setData(null) as part of its own full teardown; only
    // the payload applications are this test's concern.
    destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
    // render() re-entry, driven explicitly as elsewhere in this file.
    destination.mount(seat, { navigation: 1, hold() {}, context: { subject: 'finding:served' } });
    const payloadApplications = setDataCalls.filter((data) => data !== null);
    assert.equal(payloadApplications.length, 1, 'the moved-revision re-read seats cold, once');
    assert.equal(payloadApplications[0].analyze.marker, 'reread', 'the applied payload is the re-read\'s own, not the stale Retry payload');
    assert.equal(rowClicks, 1, 'the cold re-seat restores the entry, as every cold seat does');
    setDataCalls.length = 0; rowClicks = 0; observerCount = 0; refreshCalls = 0;

    // A further, ordinary round trip: same entry, unmoved revision. If the
    // discarded off-screen completion leaked into this return, it would run
    // setData/restoreEntry here — exactly what retention must not do on a
    // plain round trip (ORDER.md: "Never run restoreEntry() on that path").
    let held2;
    destination.mount(seat, { navigation: 1, hold: fn => { held2 = fn; }, context: { subject: 'finding:served' } });
    seat.isConnected = false;
    held2(false);
    destination.mount(seat, { navigation: 2, hold() {}, context: { subject: 'finding:served' } });
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
    destination.mount(seat, { navigation: 2, hold() {}, context: { subject: 'finding:served' } });

    assert.equal(setDataCalls.length, 0, 'a plain round trip after the re-read never re-applies a stale off-screen completion');
    assert.equal(rowClicks, 0, 'a plain round trip never runs restoreEntry()');
    assert.equal(observerCount, 0, 'a plain round trip never builds a restoration observer');
    assert.equal(refreshCalls, 1, 'a plain round trip only resizes the carried charts');
    destination.leave();
  } finally { globalThis.MutationObserver = previousMO; }
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
    const seat = host(); root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
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
  const seat = host(); root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
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
  const document = { createElement() { return { dataset: {}, remove() { if (button === this) button = null; } }; },
    body: { append(node) { node.isConnected = true; node.parked = true; } } };
  const root = { dataset: {}, ownerDocument: document, isConnected: false, style: {}, remove() { root.isConnected = false; }, querySelectorAll: () => [],
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

test('the watch dock\'s route tokens become Changes arrivals: `changes` names the watch, `plan` the Plan', async () => {
  let callbacks;
  const destination = createDiagnoseDestination({ api: source().api,
    createView(options) { callbacks = options.callbacks; return { setData() {}, leaveSurface() {}, refresh() {}, setError() {} }; },
  });
  await destination.read();
  destination.mount(host(), { navigation: 0, hold() {} });
  const previous = globalThis.window;
  const addresses = [];
  globalThis.window = { location: { pathname: '/diagnose', search: '', hash: '' },
    history: { pushState: (_state, _title, address) => addresses.push(address) } };
  try {
    callbacks.go('changes');
    callbacks.go('plan');
    assert.deepEqual(addresses, ['/changes?subject=watch', '/changes?subject=plan']);
  } finally { globalThis.window = previous; destination.leave(); }
});
