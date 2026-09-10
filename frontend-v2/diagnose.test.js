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
