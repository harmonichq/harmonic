import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.fetch = async () => ({ ok: true, json: async () => ({ items: [], history: [] }) });
const { createDiagnoseDestination } = await import('./diagnose.js');

function host() {
  const controls = new Map();
  const root = { dataset: {}, className: '', addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, remove() {} };
  return { innerHTML: '', isConnected: true, ownerDocument: { createElement: () => root },
    replaceChildren(node) { this.node = node; },
    querySelector(selector) { if (!controls.has(selector)) controls.set(selector, {}); return controls.get(selector); } };
}
function source() {
  let fail = false;
  const api = {
    fetchAnalysis: async () => { if (fail) throw new Error('synthetic read failure'); return { marker: 'analysis' }; },
    fetchScenarios: async () => ({}), fetchExploreTimeOfDay: async () => ({}), fetchExploreExposures: async () => ({}),
    fetchDiagnoseFindingCasePreparation: async () => ({ findings: { schema: 'served' }, rendered_rows: [{ id: 'pattern:served' }] }),
    fetchOutcomesTrend: async () => ({}),
  };
  return { api, fail: value => { fail = value; } };
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

test('initial and failed current reads own distinct Diagnose frames and retry', async () => {
  const served = source(); const seat = host();
  const destination = createDiagnoseDestination({ api: served.api,
    createView: () => ({ setData() {}, leaveSurface() {}, refresh() {}, setError() {} }) });
  served.fail(true); await destination.read(); destination.mount(seat, { navigation: 0 });
  assert.match(seat.innerHTML, /Evidence unavailable/);
  assert.doesNotMatch(seat.innerHTML, /No priority needs action/);
  served.fail(false); await seat.querySelector('[data-action="retry"]').onclick();
  destination.mount(seat, { navigation: 0, hold() {} });
  served.fail(true); destination.mount(seat, { navigation: 1, hold() {} }); await destination.read();
  destination.mount(seat, { navigation: 1, hold() {} });
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
    assert.deepEqual(addresses, ['/v2/?to=diagnose'], 'Open Diagnose discards the contextual entry');
  } finally { globalThis.window = previous; }
  destination.mount(seat, { navigation: 1, hold() {} });
  assert.ok(seat.node, 'successful retry seats the carried composition');
});

test('return restoration requests its occurrence once while shared paints are pending', async () => {
  let notify; let clicks = 0; let selected = false;
  const previous = globalThis.MutationObserver;
  globalThis.MutationObserver = class { constructor(callback) { notify = callback; } observe() {} disconnect() {} };
  try {
    const member = { dataset: { occurrenceId: 'opaque' }, getAttribute: () => String(selected), click: () => { clicks += 1; }, focus() {} };
    const row = { dataset: { id: 'finding:served' }, click() {} };
    const root = { dataset: {}, addEventListener() {}, remove() {}, querySelector: () => null,
      querySelectorAll: selector => selector === '.qrow[data-id]' ? [row] : selector === '.case-occurrence' ? [member] : [] };
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
  const root = { dataset: {}, remove() {},
    addEventListener(type, run, capture) { handlers.push({ type, run, capture: capture === true }); },
    querySelectorAll: selector => selector === '#lane > button.lane-cell' ? cells : [],
    querySelector: selector => selector === '#level' ? level : null,
  };
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
