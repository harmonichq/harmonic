import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, serializeRoute } from './tab-routing.js';

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
  // The window Diagnose registers its reader-input listener on (ADR 428);
  // quiet unless a test hands the seat a browser() of its own.
  const ownerDocument = { body, defaultView: { addEventListener() {} } };
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

// ADR 428: a retained return needs the entry's restoration to have finished
// before Diagnose parked, so a test standing for a restored entry serves the
// Finding row that restoration opens.
const restores = subject => ({
  querySelectorAll: selector => (selector === '.qrow[data-id]' ? [{ dataset: { id: subject }, click() {} }] : []),
});

test('a navigation round trip to the same entry issues one status read, no more, and never restores entry', async () => {
  const served = source(); const seat = host();
  const root = makeRoot(restores('finding:served'));
  root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
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
  const root = makeRoot({ ...restores('finding:served'), querySelector: selector => (selector === '#level' ? level : null) });
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
    const openDay = { focused: 0, focus() { this.focused += 1; } };
    const root = makeRoot({ querySelector: selector => (selector === '.occ-foot button:last-child' ? openDay : null),
      querySelectorAll: selector => selector === '.qrow[data-id]' ? [row] : selector === '.case-occurrence' ? [member] : [] });
    const seat = host(); root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
    const destination = createDiagnoseDestination({ api: source().api,
      createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: { subject: 'finding:served', occurrence: 'opaque' } });
    notify(); notify();
    assert.equal(clicks, 1, 'unrelated shared paints must not repeat the pending case request');
    selected = true; notify();
    // ADR 428 point 5: the entry names no selector; the held Occurrence's own
    // Open in Day control is the return target.
    assert.equal(openDay.focused, 1, 'the held Occurrence\'s Open in Day control takes focus');
    destination.leave();
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
  } finally {
    // The router's destination is module state: put it back on Diagnose, or
    // every later test here sees a Diagnose that is not on screen (ADR 428).
    const { navigate } = await import('./routes.js');
    navigate('diagnose');
    globalThis.window = previous; destination.leave();
  }
});

test('Diagnose opened from the watched change names that change in its return (ADR 446)', async () => {
  for (const [kind, label] of [['focus', 'Return to Focus'], ['trial', 'Return to Trial']]) {
    const appended = [];
    const header = { append: (...nodes) => appended.push(...nodes) };
    const document = { createElement: () => ({ dataset: {}, remove() {} }),
      body: { append(node) { node.isConnected = true; node.parked = true; } } };
    const root = { dataset: {}, ownerDocument: document, isConnected: false, style: {}, remove() { root.isConnected = false; },
      querySelectorAll: () => [], addEventListener() {}, querySelector: selector => (selector === 'header.crumb' ? header : null) };
    const seat = host(); seat.ownerDocument.createElement = () => root;
    const served = source();
    served.api.fetchOutcomesTrend = async () => ({ watched_change: { kind } });
    const destination = createDiagnoseDestination({ api: served.api,
      createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: { from: 'changes' } });
    const back = appended.filter(node => node.dataset.action === 'watch');
    assert.equal(back.length, 1, `premise: an entry from Changes with a served watched ${kind} offers its return`);
    assert.equal(back[0].textContent, label, `a watched ${kind}'s return reads "${label}"`);
    destination.leave();
  }
});

/* ---------------------------------------------------------------- ADR 428 */

// A browser whose history writes move its address, and whose capture-phase
// listeners a test dispatches into as the reader's own (trusted) presses.
function browser(address = '/diagnose') {
  const calls = [];
  const listeners = [];
  const location = { pathname: '', search: '', hash: '' };
  const move = (next) => {
    const at = next.indexOf('?');
    location.pathname = at < 0 ? next : next.slice(0, at);
    location.search = at < 0 ? '' : next.slice(at);
  };
  move(address);
  return {
    location, calls, listeners,
    history: {
      pushState: (_state, _title, next) => { calls.push(['push', next]); move(next); },
      replaceState: (_state, _title, next) => { calls.push(['replace', next]); move(next); },
    },
    addEventListener(type, run, capture) { listeners.push({ type, run, capture }); },
    removeEventListener() {},
    address: () => `${location.pathname}${location.search}`,
    press(type, init = {}) {
      for (const listener of listeners.filter(l => l.type === type && l.capture === true)) {
        listener.run({ type, isTrusted: true, ...init });
      }
    },
  };
}
// What the router hands the next render: the context its address names.
const routed = page => parseRoute(page.location).context;
const flush = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
const afterHandlers = () => new Promise(resolve => setTimeout(resolve, 0));

// A workstation stand-in that publishes the way the real one does: its Findings
// root on every setData (the rebuild, the teardown), and whatever a test drills.
function publishing() {
  const view = { setData: [], refreshes: 0 };
  view.create = ({ callbacks }) => {
    view.callbacks = callbacks;
    return { setData(data) { view.setData.push(data); callbacks.caseChanged?.(null); },
      leaveSurface() {}, refresh() { view.refreshes += 1; }, setError() {} };
  };
  view.published = [];
  view.publish = next => { view.published.push(next); view.callbacks.caseChanged(next); };
  // The workstation's page-level ↓ (diagnose-workstation.js): it steps the held
  // Occurrence only while Diagnose says it is on screen.
  view.key = next => { if (view.callbacks.onScreen?.() !== false) view.publish(next); };
  return view;
}

function desk428({ address = '/diagnose', root: overrides = {}, seatedUtility } = {}) {
  const page = browser(address);
  globalThis.window = page;
  const served = source(); const seat = host(); seat.ownerDocument.defaultView = page;
  const root = makeRoot(overrides);
  root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
  const view = publishing();
  const destination = createDiagnoseDestination({ api: served.api, createView: view.create, seatedUtility });
  return { page, served, seat, view, destination };
}

// Leave to another destination: the held cleanup parks the retained root.
function park(destination, seat, navigation, context) {
  let held;
  destination.mount(seat, { navigation, hold: fn => { held = fn; }, context });
  seat.isConnected = false;
  held(false);
}

// A basal lane cell whose pick publishes its slot, as the workstation does.
function laneCell(publish, start = 180) {
  const cell = { clicks: 0, getAttribute: () => `${String(start / 60).padStart(2, '0')}:00 basal slot, raise`,
    click() { cell.clicks += 1; publish({ subject: `basal:${start}`, occurrence: null, window: `${start}-${start + 30}` }); } };
  return cell;
}

const DAY_RETURN = { date: '2024-06-26', moment: '2024-06-26 13:55:00', subject: 'finding:late_bolus',
  occurrence: 'o-1', lever: 'late_bolus', from: 'diagnose' };

// ADR 426 over ADR 428: a window preset, a Pattern cause drill or a lane hop
// and Backspace leaves Diagnose with no selection while a Finding's case file
// stays on screen. The Day door reads the title the workstation publishes with
// the case, so "Opened from" still names that Finding.
test('ADR 426 · the Day door names the published case by its served title with nothing selected', async () => {
  const previous = globalThis.window;
  const { page, seat, view, destination } = desk428();
  const { navigate } = await import('./routes.js');
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: '0-360', title: 'Late bolus' });
    view.callbacks.day({ id: 'o-1', t: '2024-06-26 13:55:00', cause_lever: 'late_bolus' });
    assert.equal(page.location.pathname, '/day');
    const context = routed(page);
    assert.equal(context.title, 'Late bolus', 'Day names the Finding on screen, not the way back');
    assert.equal(context.subject, 'finding:late_bolus');
    assert.equal(context.occurrence, 'o-1');
  } finally { navigate('diagnose'); globalThis.window = previous; destination.leave(); }
});

test('ADR 428 · a published case with no restoration pending replaces the address in place, and the Findings root clears it', async () => {
  const previous = globalThis.window;
  const { page, seat, view, destination } = desk428();
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    assert.deepEqual(page.calls, [], 'the rebuild\'s own Findings root writes nothing');
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: '0-360' });
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1&window=0-360']],
      'replaced in place: no pushed history entry, so no new navigation');
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: '0-360' });
    assert.equal(page.calls.length, 1, 'a same-value repaint writes nothing');
    view.publish(null);
    assert.deepEqual(page.calls.at(-1), ['replace', '/diagnose'], 'back at Findings the address names no case');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a re-read\'s teardown and rebuild never overwrite its contextual entry, which is restored and keeps its from', async () => {
  const previous = globalThis.window;
  let cell = null;
  const env = desk428({ root: { querySelectorAll: selector => (selector === '#lane > button.lane-cell' ? [cell] : []) } });
  const { page, seat, view, destination } = env;
  cell = laneCell(view.publish);
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null });
    park(destination, seat, 0, routed(page));
    // Changes' Inspect / Back to Diagnose: a contextual entry naming another case.
    page.history.pushState(null, '', serializeRoute({ destination: 'diagnose',
      context: { subject: 'setting:basal_rate', window: '180-210', from: 'changes' } }));
    page.calls.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.equal(cell.clicks, 1, 'the contextual entry was applied: its slot is open');
    assert.deepEqual(page.calls, [], 'neither the teardown, the rebuild nor the restoration wrote the address');
    assert.equal(page.address(), '/diagnose?subject=setting%3Abasal_rate&window=180-210&from=changes');
    view.publish({ subject: 'basal:180', occurrence: null, window: '180-210' });
    assert.deepEqual(page.calls, [], 'a same-value repaint after the restoration settles writes nothing');
    view.publish({ subject: 'basal:210', occurrence: null, window: '210-240' });
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=basal%3A210&window=210-240&from=changes']],
      'the next case change is written, and keeps the Changes return Diagnose renders');
    destination.leave();
  } finally { globalThis.window = previous; }
});

async function pendingRestoration() {
  const env = desk428({ address: '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1' });
  const context = routed(env.page);
  env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
  await flush();
  env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
  return env;
}

test('ADR 428 · a pending restoration writes nothing until the reader\'s own press, which ends it before that press\'s handlers run', async () => {
  const previous = globalThis.window;
  try {
    const { page, view, destination } = await pendingRestoration();
    assert.deepEqual(page.listeners.filter(l => l.capture === true).map(l => l.type).sort(), ['keydown', 'pointerdown'],
      'one reader-input listener, in the capture phase on the window');
    view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null });
    assert.deepEqual(page.calls, [], 'a publication while the restoration is pending writes nothing');
    page.press('keydown', { key: 'Tab' });
    page.press('keydown', { key: 'Shift' });
    page.press('pointerdown', { isTrusted: false });
    view.publish({ subject: 'finding:late_bolus', occurrence: null, window: '0-360' });
    assert.deepEqual(page.calls, [], 'Tab, a bare modifier and an untrusted press leave it pending');
    // The reader's ↓: the capture listener runs first, then the workstation's
    // own document handler steps the Occurrence inside the same event.
    page.press('keydown', { key: 'ArrowDown' });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-2', window: '0-360' });
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=finding%3Alate_bolus&occurrence=o-2&window=0-360']]);
    await afterHandlers();
    assert.equal(page.calls.length, 1, 'once the press\'s handlers ran, the same case adds no second write');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a reader press that changes nothing still leaves the address naming the case on screen', async () => {
  const previous = globalThis.window;
  try {
    const { page, view, destination } = await pendingRestoration();
    view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null });
    page.press('pointerdown');
    await afterHandlers();
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=finding%3Alate_bolus']],
      'the restored entry\'s Occurrence is not on screen, so the address stops naming it');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a plain Diagnose press after a Day return is a retained return: one status read', async () => {
  const previous = globalThis.window;
  const { page, served, seat, view, destination } = desk428({
    address: serializeRoute({ destination: 'diagnose', context: DAY_RETURN }) });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: routed(page) });
    park(destination, seat, 0, routed(page));
    served.requests.length = 0;
    page.history.pushState(null, '', '/diagnose'); // the topbar press: a direct entry
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(served.requests, ['status'], 'exactly one status read, and no guidance or evidence read');
    assert.equal(page.address(), '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1',
      'the address names the retained case, with no Day-entry key');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.equal(view.refreshes, 1, 'the retained root re-seats with its drill');
    assert.equal(view.setData.filter(Boolean).length, 1, 'the payload is never re-applied');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a plain return keeps the held case but not its Changes return', async () => {
  const previous = globalThis.window;
  let cell = null;
  const env = desk428({
    address: serializeRoute({ destination: 'diagnose', context: { subject: 'setting:basal_rate', window: '180-210', from: 'changes' } }),
    root: { querySelectorAll: selector => (selector === '#lane > button.lane-cell' ? [cell] : []) } });
  const { page, served, seat, view, destination } = env;
  cell = laneCell(view.publish);
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: routed(page) });
    assert.equal(cell.clicks, 1, 'premise: the Changes entry was restored');
    park(destination, seat, 0, routed(page));
    page.history.pushState(null, '', '/diagnose');
    page.calls.length = 0; served.requests.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=setting%3Abasal_rate&window=180-210']],
      'the address names the held case, and no longer the Changes return');
    await flush();
    assert.deepEqual(served.requests, ['status']);
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    view.publish({ subject: 'basal:210', occurrence: null, window: '210-240' });
    assert.deepEqual(page.calls.at(-1), ['replace', '/diagnose?subject=basal%3A210&window=210-240'],
      'the entry itself dropped from=changes, so "Return to Trial" cannot come back');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a Day return to the held case keeps the drill and focuses that Occurrence\'s Open in Day control', async () => {
  const previous = globalThis.window;
  let focused = null;
  const member = { dataset: { occurrenceId: 'o-1' }, getAttribute: () => 'true', focus() { focused = 'row'; } };
  const openDay = { focus() { focused = 'open-day'; } };
  const crumb = { focus() { focused = 'crumb'; } };
  const { page, served, seat, view, destination } = desk428({ root: {
    querySelectorAll: selector => (selector === '.case-occurrence' ? [member] : []),
    querySelector: selector => (selector === '.occ-foot button:last-child' ? openDay : selector === '#crumb-trail' ? crumb : null),
  } });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
    park(destination, seat, 0, routed(page));
    // Open in Day from that Occurrence, then Return to Diagnose: the Day entry
    // names the same case.
    page.history.pushState(null, '', serializeRoute({ destination: 'diagnose', context: DAY_RETURN }));
    served.requests.length = 0; focused = null;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(served.requests, ['status'], 'one status read and no guidance read');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.equal(view.setData.filter(Boolean).length, 1, 'the drill is kept, not re-applied');
    assert.equal(focused, 'open-day', 'the return lands on the held Occurrence\'s Open in Day control');
    destination.leave();
  } finally { globalThis.window = previous; }
});

// ADR 445 point 7. A carb utility's Day return into a parked Diagnose is a plain
// return; when the store moved while the reader was away, Diagnose re-reads and
// rebuilds under the reopened utility. The desk's focus request after that
// rebuild is what the router applies next.
async function rebuiltUnder(seatedUtility) {
  const previous = globalThis.window;
  const { navigate, view: desk } = await import('./routes.js');
  const { page, served, seat, view, destination } = desk428({ root: restores('finding:late_bolus'), seatedUtility });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
    park(destination, seat, 0, routed(page));
    served.setRevision(2); // a carb logged while the reader was away
    page.history.pushState(null, '', '/diagnose');
    served.requests.length = 0; desk.focusAfterRender = null;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await afterHandlers();
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.ok(served.requests.includes('analysis'), 'premise: the moved store re-read the guidance');
    assert.equal(view.setData.filter(Boolean).length, 2, 'premise: the rebuild applied the re-read payload');
    return desk.focusAfterRender;
  } finally { navigate('diagnose'); desk.focusAfterRender = null; globalThis.window = previous; destination.leave(); }
}

test('ADR 445 · a Diagnose rebuild under a seated utility sets no focus of its own', async () => {
  assert.equal(await rebuiltUnder(() => 'carbs'), null,
    'the rebuild displaced the utility\'s carried focus with its crumb default');
});

test('regression pin: a Diagnose rebuild with no utility seated still lands on its crumb', async () => {
  assert.equal(await rebuiltUnder(() => null), '#crumb-trail');
});

test('ADR 428 · restoring a Finding presses the Window preset its window names', async () => {
  const labels = ['Overnight', 'Morning', 'Afternoon', 'Evening', '24 h'];
  for (const [subject, window, expected] of [
    ['finding:late_bolus', '360-720', 'Morning'],
    ['finding:late_bolus', '720-1080', 'Afternoon'],
    ['finding:late_bolus', '1080-1440', 'Evening'],
    ['finding:late_bolus', '0-360', 'Overnight'],
    ['finding:late_bolus', null, '24 h'],
    ['finding:late_bolus', '135-285', null], // a drawn window: the accepted limit
    ['pattern:highs_after_meals', '360-720', '24 h'], // a Pattern keeps its 24 h press
  ]) {
    const buttons = labels.map(textContent => ({ textContent, clicks: 0, click() { this.clicks += 1; } }));
    const seat = host();
    const root = makeRoot({ querySelectorAll: selector => (selector === '#seg-window button' ? buttons : []) });
    root.ownerDocument = seat.ownerDocument; seat.ownerDocument.createElement = () => root;
    const destination = createDiagnoseDestination({ api: source().api,
      createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: window ? { subject, window } : { subject } });
    assert.deepEqual(buttons.filter(button => button.clicks).map(button => button.textContent),
      expected ? [expected] : [], `${subject} in ${window}`);
    destination.leave();
  }
});

// Review round 2: a parked Diagnose is inert. Its workstation's page-level keys
// act only while Diagnose tells it it is on screen, so nothing moves the case
// while another destination holds the surface, and a return compares its entry
// with the held entry (ADR 414).
async function heldThenKeyWhileParked() {
  let focused = null;
  const member = { dataset: { occurrenceId: 'o-1' }, getAttribute: () => 'true', focus() { focused = 'row'; } };
  const openDay = { focus() { focused = 'open-day'; } };
  const env = desk428({ root: {
    querySelectorAll: selector => (selector === '.case-occurrence' ? [member] : []),
    querySelector: selector => (selector === '.occ-foot button:last-child' ? openDay : null),
  } });
  const { page, seat, view, destination } = env;
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {} });
  view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
  park(destination, seat, 0, routed(page));
  const published = view.published.length;
  view.key({ subject: 'finding:late_bolus', occurrence: 'o-2', window: null }); // ↓ pressed on Day
  assert.equal(view.published.length, published, 'a key pressed while Diagnose is parked moves nothing');
  env.served.requests.length = 0;
  return { ...env, focused: () => focused };
}

test('ADR 428 · a key pressed while Diagnose is parked changes nothing, and the Day return keeps the held Occurrence with one status read', async () => {
  const previous = globalThis.window;
  try {
    const { page, served, seat, view, destination, focused } = await heldThenKeyWhileParked();
    page.history.pushState(null, '', serializeRoute({ destination: 'diagnose', context: DAY_RETURN }));
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    view.key({ subject: 'finding:late_bolus', occurrence: 'o-2', window: null }); // ↓ on the loading frame
    await flush();
    assert.deepEqual(served.requests, ['status'], 'the Day return names the held case: one status read');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.deepEqual(view.published.map(c => c.occurrence), ['o-1'], 'nothing moved the case while parked or loading');
    assert.equal(routed(page).occurrence, 'o-1', 'the address names the Occurrence on screen');
    assert.equal(focused(), 'open-day', 'the return lands on that Occurrence\'s Open in Day control');
    assert.equal(view.callbacks.onScreen(), true, 'seated again, the workstation takes keys');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · a key pressed while Diagnose is parked changes nothing, and a plain return names the held case on screen', async () => {
  const previous = globalThis.window;
  try {
    const { page, served, seat, view, destination } = await heldThenKeyWhileParked();
    page.history.pushState(null, '', '/diagnose');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(served.requests, ['status'], 'a plain return stays retained');
    assert.equal(page.address(), '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1',
      'the address names the held case, which is still the case on screen');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.deepEqual(view.published.map(c => c.occurrence), ['o-1'], 'nothing moved the case while parked');
    destination.leave();
  } finally { globalThis.window = previous; }
});

test('ADR 428 · an identical Changes re-entry stays retained, whatever spelling the case on screen publishes', async () => {
  const previous = globalThis.window;
  let cell = null;
  const changes = serializeRoute({ destination: 'diagnose',
    context: { subject: 'setting:basal_rate', window: '180-210', from: 'changes' } });
  const env = desk428({ address: changes,
    root: { querySelectorAll: selector => (selector === '#lane > button.lane-cell' ? [cell] : []) } });
  const { page, served, seat, view, destination } = env;
  cell = laneCell(view.publish);
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: routed(page) });
    assert.equal(cell.clicks, 1, 'premise: Inspect nights opened its slot, published as basal:180');
    park(destination, seat, 0, routed(page));
    // Changes, then Inspect nights again: the same entry.
    page.history.pushState(null, '', changes);
    served.requests.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(served.requests, ['status'], 'one status read, no guidance re-read');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.equal(view.refreshes, 1, 'the drill is kept');
    assert.equal(cell.clicks, 1, 'and never re-restored');
    destination.leave();
  } finally { globalThis.window = previous; }
});

// Review round 3: input cannot move a parked case, but a case-file answer
// already in flight when Diagnose parked can. The re-seat compares the case on
// screen with the one Diagnose parked on and reconciles.
async function answerLandsAfterPark(when, returnTo) {
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.live = false; observers.push(this); }
    observe() { this.live = true; } disconnect() { this.live = false; }
  };
  let focused = null;
  let current = null; // the case the stand-in workstation has on screen
  const env = desk428({ root: {
    querySelectorAll: selector => (selector === '.qrow[data-id]' ? [row] : selector === '.case-occurrence' ? [member] : []),
    querySelector: selector => (selector === '.occ-foot button:last-child' ? openDay : null),
  } });
  const { page, served, seat, view, destination } = env;
  const row = { dataset: { id: 'finding:late_bolus' },
    click() { view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null }); } };
  const member = { dataset: { occurrenceId: 'o-1' },
    getAttribute: () => String(current?.occurrence === 'o-1'),
    click() { view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null }); },
    focus() { focused = 'row'; } };
  const openDay = { focus() { focused = 'open-day'; } };
  await destination.read();
  destination.mount(seat, { navigation: 0, hold() {} });
  const caseChanged = view.callbacks.caseChanged;
  view.callbacks.caseChanged = next => { current = next; caseChanged(next); };
  view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
  // ↓ pressed, then Open in Day (or a topbar destination) before the answer.
  park(destination, seat, 0, routed(page));
  const answer = () => view.publish({ subject: 'finding:late_bolus', occurrence: 'o-2', window: null });
  if (when === 'parked') answer();
  page.history.pushState(null, '', returnTo);
  served.requests.length = 0; focused = null;
  destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
  if (when === 'checking') answer();
  await flush();
  destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
  const notify = () => { for (const observer of observers.filter(o => o.live)) observer.callback(); };
  return { ...env, focused: () => focused, current: () => current, notify };
}

for (const when of ['parked', 'checking']) {
  test(`ADR 428 · an answer landing while Diagnose is ${when} makes the Day return re-read and restore its Occurrence`, async () => {
    const previous = globalThis.window;
    const previousMO = globalThis.MutationObserver;
    try {
      const { page, served, seat, destination, focused, current, notify } = await answerLandsAfterPark(when,
        serializeRoute({ destination: 'diagnose', context: DAY_RETURN }));
      assert.ok(served.requests.includes('analysis'),
        `the case moved off o-1 after the park, so the Day return re-reads: ${served.requests}`);
      await flush();
      destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
      notify();
      assert.equal(current()?.occurrence, 'o-1', 'the restoration holds the Occurrence the Day entry names');
      assert.equal(routed(page).occurrence, 'o-1', 'the address names it');
      assert.equal(focused(), 'open-day', 'focus lands on its Open in Day control');
      destination.leave();
    } finally { globalThis.window = previous; globalThis.MutationObserver = previousMO; }
  });

  test(`ADR 428 · an answer landing while Diagnose is ${when} leaves a plain return naming the case on screen`, async () => {
    const previous = globalThis.window;
    const previousMO = globalThis.MutationObserver;
    try {
      const { page, served, view, destination, current } = await answerLandsAfterPark(when, '/diagnose');
      assert.deepEqual(served.requests, ['status'], 'a plain return stays retained');
      assert.equal(view.refreshes, 1, 'premise: the retained root re-seated');
      assert.equal(current()?.occurrence, 'o-2', 'premise: o-2 is on screen');
      assert.equal(page.address(), '/diagnose?subject=finding%3Alate_bolus&occurrence=o-2',
        'the address names the case on screen, with no from');
      destination.leave();
    } finally { globalThis.window = previous; globalThis.MutationObserver = previousMO; }
  });
}

// Review round 4: a restoration that has not finished when Diagnose parks — or
// was ended by a press whose write never ran — never made the held entry name
// the case on screen, so the park counts as moved and the re-seat reconciles.
// A case address whose case file is still loading: `opened` says whether its
// Finding row has opened yet; its Occurrence is never held.
async function pendingCase({ opened }) {
  const env = desk428({ address: '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1', root: {
    querySelectorAll: selector => (selector === '.qrow[data-id]' && opened ? [row] : []),
  } });
  const row = { dataset: { id: 'finding:late_bolus' },
    click() { env.view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null }); } };
  const context = routed(env.page);
  env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
  await flush();
  env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
  return { ...env, context };
}

for (const opened of [true, false]) {
  test(`ADR 428 · Back and Forward while a case address is still restoring (${opened ? 'its Finding open' : 'still at Findings'}) re-read it on return`, async () => {
    const previous = globalThis.window;
    try {
      const { page, served, seat, destination, context } = await pendingCase({ opened });
      // Browser Back: the router renders the previous destination, which parks
      // Diagnose; no page event reaches Diagnose's reader-input listener.
      park(destination, seat, 0, context);
      page.history.pushState(null, '', serializeRoute({ destination: 'diagnose', context })); // Forward
      served.requests.length = 0;
      destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
      await flush();
      destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
      await flush();
      assert.ok(served.requests.includes('analysis'),
        `the address names o-1, which was never held, so the return re-reads to restore it: ${served.requests}`);
      destination.leave();
    } finally { globalThis.window = previous; }
  });
}

test('ADR 428 · Enter on a topbar button while a restoration is pending leaves a plain return naming the case on screen', async () => {
  const previous = globalThis.window;
  try {
    const { page, served, seat, view, destination, context } = await pendingCase({ opened: true });
    // Enter ends the restoration and, in the same keystroke, the button's click
    // navigates away before the deferred write can run.
    page.press('keydown', { key: 'Enter' });
    park(destination, seat, 0, context);
    await afterHandlers();
    page.history.pushState(null, '', '/diagnose'); // a plain press of Diagnose
    served.requests.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.deepEqual(served.requests, ['status'], 'a plain return stays retained');
    assert.equal(view.refreshes, 1, 'premise: the retained root re-seated');
    assert.equal(page.address(), '/diagnose?subject=finding%3Alate_bolus',
      'the address names the Finding on screen, not the Occurrence that was never held');
    destination.leave();
  } finally { globalThis.window = previous; }
});

// Review round 1, kept: the return focus and the superseded walk.

test('ADR 428 · a retained return focuses Open in Day only when it belongs to the returning Occurrence', async () => {
  const previous = globalThis.window;
  let focused = null;
  // The row is on screen but not held, so the foot's Open in Day is another's.
  const member = { dataset: { occurrenceId: 'o-1' }, getAttribute: () => 'false', focus() { focused = 'row'; } };
  const openDay = { focus() { focused = 'open-day'; } };
  const { page, seat, view, destination } = desk428({ root: {
    querySelectorAll: selector => (selector === '.case-occurrence' ? [member] : []),
    querySelector: selector => (selector === '.occ-foot button:last-child' ? openDay : null),
  } });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
    park(destination, seat, 0, routed(page));
    page.history.pushState(null, '', serializeRoute({ destination: 'diagnose', context: DAY_RETURN }));
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    assert.equal(focused, 'row', 'an Open in Day control of an unheld row is not the return target');
    destination.leave();
  } finally { globalThis.window = previous; }
});

// Review round 1 (F2): the reader's press ends the restoration's walk too, so a
// superseded entry can never later select, focus or re-address anything.
test('ADR 428 · a reader press stops the superseded restoration walk', async () => {
  const previous = globalThis.window;
  const previousMO = globalThis.MutationObserver;
  const observers = [];
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; this.live = false; observers.push(this); }
    observe() { this.live = true; } disconnect() { this.live = false; }
  };
  const notify = () => { for (const observer of observers.filter(o => o.live)) observer.callback(); };
  let rows = [];
  const row = { dataset: { id: 'finding:late_bolus' }, clicks: 0, click() { row.clicks += 1; } };
  try {
    const { page, view, destination } = await (async () => {
      const env = desk428({ address: '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1',
        root: { querySelectorAll: selector => (selector === '.qrow[data-id]' ? rows : []) } });
      const context = routed(env.page);
      env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
      await flush();
      env.destination.mount(env.seat, { navigation: 0, hold() {}, context });
      return env;
    })();
    assert.ok(observers.some(o => o.live), 'premise: the walk waits for its Finding row');
    page.press('keydown', { key: 'Backspace' });
    await afterHandlers();
    const written = page.calls.length;
    rows = [row]; // the reader later reopens the Finding
    view.publish({ subject: 'finding:late_bolus', occurrence: null, window: null });
    notify();
    assert.equal(row.clicks, 0, 'the superseded walk never clicks the row');
    assert.deepEqual(page.calls.slice(written), [['replace', '/diagnose?subject=finding%3Alate_bolus']],
      'only the reader\'s own case is written; the walk never re-addresses to o-1');
    destination.leave();
  } finally { globalThis.window = previous; globalThis.MutationObserver = previousMO; }
});

/* ------------------------------------------------------------------ #460 */

// A transport whose Plan and guidance reads serve one saved draft; `gate`
// holds the Plan read, and `log` records each read's path as it is issued.
function draftTransport(draft, { gate = null, log = [] } = {}) {
  return async (url) => {
    const path = new URL(url, 'http://desk.invalid').pathname;
    log.push(path);
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (path === '/api/plan') { await gate; return ok(draft); }
    if (path === '/api/guidance') return ok({ disposition: 'draft', selected: null, candidates: [], draft });
    return ok({ items: [], history: [] });
  };
}
const DRAFT_460 = { items: [{ type: 'basal', start_min: 420, key: 14, label: '07:00', current: 0.9, value: 0.8 }], updated_at: 't460' };

test('#460 · a cold seat whose Plan read lands after the payload hands the view the served draft', async () => {
  const previousFetch = fetchReply;
  let releasePlan;
  fetchReply = draftTransport(DRAFT_460, { gate: new Promise(resolve => { releasePlan = resolve; }) });
  try {
    let callbacks;
    const destination = createDiagnoseDestination({ api: source().api,
      createView(options) { callbacks = options.callbacks; return { setData() {}, leaveSurface() {}, refresh() {}, setError() {} }; } });
    const seat = host();
    destination.mount(seat, { navigation: 0, hold() {} });
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    assert.ok(seat.node, 'premise: the payload settled and seated the desk before the Plan read answered');
    releasePlan();
    await flush();
    assert.deepEqual(callbacks.planDraft?.(), DRAFT_460, 'the callbacks answer the served draft');
    destination.leave();
  } finally { fetchReply = previousFetch; }
});

// A retained return with a plain top-nav press: seat, park, return with the
// input revision unchanged. `between` runs (and is awaited) while Diagnose is
// parked. Answers the events the reads and the view's refreshes logged after
// the return.
async function retainedReturn460(between = () => {}) {
  const previous = globalThis.window;
  const previousFetch = fetchReply;
  const events = [];
  const served = { draft: DRAFT_460 };
  const transport = log => async (url) => draftTransport(served.draft, { log })(url);
  fetchReply = transport(events);
  const page = browser();
  globalThis.window = page;
  const source460 = source(); const seat = host(); seat.ownerDocument.defaultView = page;
  const destination = createDiagnoseDestination({ api: source460.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() { events.push('refresh'); }, setError() {} }) });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {}, context: routed(page) });
    await afterHandlers();
    park(destination, seat, 0, routed(page));
    await between(served);
    events.length = 0; source460.requests.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(source460.requests, ['status'], 'premise: the input revision is unchanged, so no payload read');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await afterHandlers();
    destination.leave();
    return events;
  } finally { globalThis.window = previous; fetchReply = previousFetch; }
}

test('#460 · a retained return after a Changes visit re-reads Plan state and guidance, then refreshes the view', async () => {
  // A Changes arrival forces a guidance read, and a draft is then replaced
  // while Diagnose is still parked, as a Plan route write or another tab does.
  const { loadGuidance } = await import('./guidance.js');
  const events = await retainedReturn460(async (served) => {
    await loadGuidance({ force: true });
    served.draft = { items: [{ type: 'basal', start_min: 0, value: 0.7 }], updated_at: 't460-replaced' };
  });
  const lastRead = Math.max(events.lastIndexOf('/api/plan'), events.lastIndexOf('/api/guidance'));
  assert.ok(events.includes('/api/plan') && events.includes('/api/guidance'),
    `the return re-reads Plan state and guidance: ${events.join(', ')}`);
  assert.ok(events.lastIndexOf('refresh') > lastRead, `the view refreshes after both reads: ${events.join(', ')}`);
});

test('#460 · a retained return repaints when the Plan surface\'s draft moved, though guidance already served it', async () => {
  // Changes forces a guidance read on every arrival, so a draft replaced while
  // Diagnose was parked can reach guidance before the return; the Plan
  // surface's own copy, which the staged marks read, is still the old one.
  const { loadGuidance } = await import('./guidance.js');
  const events = await retainedReturn460(async (served) => {
    served.draft = { items: [{ type: 'basal', start_min: 0, value: 0.7 }], updated_at: 't460-elsewhere' };
    await loadGuidance({ force: true });
  });
  const lastRead = Math.max(events.lastIndexOf('/api/plan'), events.lastIndexOf('/api/guidance'));
  assert.ok(events.includes('/api/plan'), `premise: the return re-reads Plan state: ${events.join(', ')}`);
  assert.ok(events.lastIndexOf('refresh') > lastRead,
    `the view refreshes after the re-read moved the Plan surface's draft: ${events.join(', ')}`);
});

test('#460 · a retained return whose served Plan state has not moved repaints the view once, at the re-seat', async () => {
  // A second repaint would rebuild the reading pane under the focus a Day
  // return has just put back on its Occurrence's Open in Day control.
  const { loadGuidance } = await import('./guidance.js');
  const events = await retainedReturn460(() => loadGuidance({ force: true }));
  assert.ok(events.includes('/api/plan') && events.includes('/api/guidance'),
    `premise: the return re-reads Plan state and guidance: ${events.join(', ')}`);
  assert.equal(events.filter(event => event === 'refresh').length, 1, `one refresh: ${events.join(', ')}`);
});

test('#460 · a top-nav return with no guidance read since Diagnose parked re-reads nothing', async () => {
  // No Changes arrival and no Plan write happened while parked, so the draft
  // cannot have moved in this page: the held status check is the only read.
  const events = await retainedReturn460();
  assert.deepEqual(events.filter(path => path === '/api/plan' || path === '/api/guidance'), [],
    `no Plan or guidance read: ${events.join(', ')}`);
  assert.equal(events.filter(event => event === 'refresh').length, 1, `one refresh, at the re-seat: ${events.join(', ')}`);
});

test('#460 · a Day return to the held case re-reads neither Plan state nor guidance', async () => {
  // Day and the utilities over Diagnose read no guidance, so a return from
  // them cannot have seen the draft move; it reads the held status check
  // alone (S164, S165).
  const previous = globalThis.window;
  const previousFetch = fetchReply;
  const events = [];
  fetchReply = draftTransport(DRAFT_460, { log: events });
  const { page, served, seat, view, destination } = desk428({ root: {
    querySelectorAll: () => [], querySelector: () => null } });
  try {
    await destination.read();
    destination.mount(seat, { navigation: 0, hold() {} });
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: null });
    park(destination, seat, 0, routed(page));
    page.history.pushState(null, '', serializeRoute({ destination: 'diagnose', context: DAY_RETURN }));
    await afterHandlers();
    events.length = 0; served.requests.length = 0;
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await flush();
    assert.deepEqual(served.requests, ['status'], 'premise: the input revision is unchanged, so no payload read');
    destination.mount(seat, { navigation: 1, hold() {}, context: routed(page) });
    await afterHandlers();
    assert.equal(view.refreshes, 1, 'premise: the Day return re-seated the retained desk');
    assert.deepEqual(events.filter(path => path === '/api/plan' || path === '/api/guidance'), [],
      `a Day return issues no Plan or guidance read: ${events.join(', ')}`);
    destination.leave();
  } finally { globalThis.window = previous; fetchReply = previousFetch; }
});

// Last: it seats the desk's one router on a stand-in surface for this module.
test('ADR 428 · the in-place write renames the current entry with no navigation, push, render or focus, and the next render hands Diagnose that context', async () => {
  const { startDesk, registerDestination, render, view: desk } = await import('./routes.js');
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const page = browser('/diagnose');
  page.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.window = page;
  globalThis.document = { activeElement: null, querySelectorAll: () => [] };
  const seat = host(); seat.ownerDocument.defaultView = page;
  Object.assign(seat, { dataset: {}, querySelector: () => null, querySelectorAll: () => [] });
  const view = publishing();
  const destination = createDiagnoseDestination({ api: source().api, createView: view.create });
  const mounts = [];
  registerDestination({ id: 'diagnose', title: 'Diagnose',
    mount: (surface, deps) => { mounts.push(deps); destination.mount(surface, deps); } });
  try {
    startDesk(seat, { browser: page });
    await flush(); // the first read answers and re-renders through the router
    assert.ok(seat.node, 'premise: Diagnose is seated through the router');
    const seated = mounts.length;
    const { navigation } = mounts.at(-1);
    desk.focusAfterRender = null;
    view.publish({ subject: 'finding:late_bolus', occurrence: 'o-1', window: '0-360' });
    assert.deepEqual(page.calls, [['replace', '/diagnose?subject=finding%3Alate_bolus&occurrence=o-1&window=0-360']],
      'the current history entry is renamed; none is pushed');
    assert.equal(mounts.length, seated, 'no render');
    assert.equal(desk.focusAfterRender, null, 'no focus request');
    render();
    assert.deepEqual(mounts.at(-1).context, { subject: 'finding:late_bolus', occurrence: 'o-1', window: '0-360' },
      'the next render hands Diagnose the renamed context');
    assert.equal(mounts.at(-1).navigation, navigation, 'the write was not a navigation');
    assert.equal(page.calls.length, 1, 'the render writes nothing further');
  } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; }
});
