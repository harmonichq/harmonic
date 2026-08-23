import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRoute, resolveTab, serializeRoute, subscribeRoute, writeRoute } from './tab-routing.js';
import { createDiagnoseEventComparison } from './diagnose-event-comparison.js';

test('resolveTab preserves current and legacy routes, then falls back to Diagnose', () => {
  for (const tab of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(resolveTab(tab), tab);
  }
  assert.equal(resolveTab('dashboard'), 'diagnose');
  assert.equal(resolveTab('pump'), 'diagnose');
  assert.equal(resolveTab('review'), 'diagnose');
  assert.equal(resolveTab('patterns'), 'diagnose');
  assert.equal(resolveTab('daily'), 'day');
  assert.equal(resolveTab('modelview'), 'day');
  assert.equal(resolveTab('outcomes'), 'verify');
  assert.equal(resolveTab('doesnotexist'), 'diagnose');
});

test('six page routes round-trip through the canonical hash form', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    const route = parseRoute({ hash: `#/${page}`, search: '' });
    assert.equal(route.page, page);
    assert.equal(serializeRoute(route), `#/${page}`);
  }
});

test('Day date and Guide article restore from their page route and leave with the page', () => {
  const day = parseRoute({ hash: '#/day?date=2026-08-22', search: '' });
  const guide = parseRoute({ hash: '#/guide?article=reading-day', search: '' });
  assert.equal(day.date, '2026-08-22');
  assert.equal(guide.article, 'reading-day');
  assert.equal(serializeRoute({ ...day, page: 'diagnose' }), '#/diagnose');
  assert.equal(serializeRoute({ ...guide, page: 'diagnose' }), '#/diagnose');

  const writes = [];
  const location = { pathname: '/', hash: '#/diagnose', search: '' };
  const history = { pushState: (_state, _title, address) => writes.push(address) };
  writeRoute(day, { location, history });
  writeRoute(guide, { location, history });
  assert.deepEqual(writes, ['/#/day?date=2026-08-22', '/#/guide?article=reading-day']);
});

test('P53 coordinates move from the split query into the Diagnose hash and restore once', () => {
  const route = parseRoute({ hash: '#diagnose', search: '?view=lows&factor=correction_stacking&start_min=0&end_min=120&another=1&occ=low-7' });
  assert.deepEqual(route, {
    page: 'diagnose', view: 'lows', factor: 'correction_stacking', start_min: '0',
    end_min: '120', another: '1', occ: 'low-7',
  });
  assert.equal(serializeRoute(route), '#/diagnose?view=lows&factor=correction_stacking&start_min=0&end_min=120&another=1&occ=low-7');

  const listeners = new Map();
  const browser = {
    location: { hash: '#/diagnose?view=meals', search: '', pathname: '/' },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const seen = [];
  const unsubscribe = subscribeRoute((next) => seen.push(next), browser);
  listeners.get('popstate')();
  listeners.get('hashchange')();
  unsubscribe();
  assert.deepEqual(seen, [{ page: 'diagnose', view: 'meals', factor: null, start_min: null, end_min: null, another: null, occ: null }]);
});

test('P53 restoration re-requests and an older projection response stays rejected', async () => {
  const original = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  const listeners = new Map();
  globalThis.location = { pathname: '/', hash: '#/diagnose?view=meals&factor=late_bolus', search: '' };
  globalThis.history = { pushState() {} };
  globalThis.window = { location, history, addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener() {} };
  const requests = [];
  let resolveOld;
  const root = { classList: { remove() {} }, replaceChildren() {} };
  const view = createDiagnoseEventComparison({ root, callbacks: { loadProjection(coordinates) {
    requests.push(coordinates);
    return new Promise((resolve) => { if (requests.length === 1) resolveOld = resolve; });
  } } });
  view.setData({});
  view.applyChanges({ factor: 'carb_undercount' });
  resolveOld({});
  await Promise.resolve();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].factor, 'carb_undercount');
  view.destroy();
  Object.assign(globalThis, original);
});
