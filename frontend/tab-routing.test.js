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

test('six page routes round-trip through clean paths', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    const route = parseRoute({ pathname: `/${page}`, search: '' });
    assert.equal(route.page, page);
    assert.equal(serializeRoute(route), `/${page}`);
  }
});

test('the parse reports whether the address named a page, so a bare arrival can be chosen for', () => {
  // #94: the clean grammar has no "no page" address — a bare `/` resolves to the
  // default — so the parse reports which happened rather than encoding "named
  // nothing" as a null page the callers would each have to default again.
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(parseRoute({ pathname: `/${page}`, search: '' }).pageNamed, true);
  }
  // The retired canonical hash names a page on the arrival that migrates it, and
  // the narrow split form names Diagnose, exactly as they did before #94.
  assert.equal(parseRoute({ pathname: '/', hash: '#/verify', search: '' }).pageNamed, true);
  assert.equal(parseRoute({ pathname: '/', hash: '', search: '?view=lows' }).pageNamed, true);

  const bare = parseRoute({ pathname: '/', hash: '', search: '' });
  assert.equal(bare.pageNamed, false, 'a bare arrival names no page');
  assert.equal(bare.page, 'diagnose', 'and is still resolved to the default for routing');
  assert.equal(serializeRoute(bare), '/diagnose', 'and still canonicalizes in place');
});

test('Diagnose mode round-trips and migrates from the split query', () => {
  const canonical = parseRoute({ hash: '#/diagnose?mode=drawn', search: '' });
  assert.equal(canonical.mode, 'drawn');
  assert.equal(serializeRoute(canonical), '/diagnose?mode=drawn');

  const migrated = parseRoute({ hash: '#diagnose', search: '?mode=drawn' });
  assert.equal(migrated.mode, 'drawn');
  assert.equal(serializeRoute(migrated), '/diagnose?mode=drawn');
});

test('Day date and Guide article restore from their page route and leave with the page', () => {
  const day = parseRoute({ hash: '#/day?date=2026-08-22', search: '' });
  const guide = parseRoute({ hash: '#/guide?article=reading-day', search: '' });
  assert.equal(day.date, '2026-08-22');
  assert.equal(guide.article, 'reading-day');
  assert.equal(serializeRoute({ ...day, page: 'diagnose' }), '/diagnose');
  assert.equal(serializeRoute({ ...guide, page: 'diagnose' }), '/diagnose');

  const writes = [];
  const location = { pathname: '/', hash: '#/diagnose', search: '' };
  const history = { pushState: (_state, _title, address) => writes.push(address) };
  writeRoute(day, { location, history });
  writeRoute(guide, { location, history });
  assert.deepEqual(writes, ['/day?date=2026-08-22', '/guide?article=reading-day']);
});

test('P53 coordinates move from the split query into the Diagnose route and restore once', () => {
  const route = parseRoute({ hash: '#diagnose', search: '?view=lows&factor=correction_stacking&start_min=0&end_min=120&another=1&occ=low-7' });
  assert.deepEqual(route, {
    page: 'diagnose', pageNamed: true, view: 'lows', factor: 'correction_stacking',
    start_min: '0', end_min: '120', another: '1', occ: 'low-7', mode: null,
  });
  assert.equal(serializeRoute(route), '/diagnose?view=lows&factor=correction_stacking&start_min=0&end_min=120&another=1&occ=low-7');

  const mixed = parseRoute({
    hash: '#/diagnose?modal=dataquality&factor=carb_undercount',
    search: '?view=lows&factor=late_bolus',
  });
  assert.equal(mixed.view, 'lows');
  assert.equal(mixed.factor, 'carb_undercount');
  const replacements = [];
  writeRoute(mixed, {
    location: { pathname: '/', hash: '#/diagnose?modal=dataquality&factor=carb_undercount', search: '?view=lows&factor=late_bolus' },
    history: { replaceState: (_state, _title, address) => replacements.push(address) },
    replace: true,
  });
  assert.deepEqual(replacements, ['/diagnose?view=lows&factor=carb_undercount']);

  const listeners = new Map();
  const browser = {
    location: { hash: '', search: '?view=meals', pathname: '/diagnose' },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const seen = [];
  const unsubscribe = subscribeRoute((next) => seen.push(next), browser);
  listeners.get('popstate')();
  unsubscribe();
  assert.deepEqual(seen, [{ page: 'diagnose', pageNamed: true, view: 'meals', factor: null, start_min: null, end_min: null, another: null, occ: null, mode: null }]);
});

test('P53 restoration re-requests and an older projection response stays rejected', async () => {
  const original = { window: globalThis.window, location: globalThis.location, history: globalThis.history };
  const listeners = new Map();
  globalThis.location = { pathname: '/diagnose', hash: '', search: '?view=meals&factor=late_bolus' };
  globalThis.history = { pushState() {} };
  globalThis.window = { location, history, addEventListener(type, listener) { listeners.set(type, listener); }, removeEventListener() {} };
  const requests = [];
  let resolveOld;
  let rejectNew;
  const root = { classList: { remove() {} }, replaceChildren() {} };
  const view = createDiagnoseEventComparison({ root, callbacks: { loadProjection(coordinates) {
    requests.push(coordinates);
    return new Promise((resolve, reject) => {
      if (requests.length === 1) resolveOld = resolve;
      else rejectNew = reject;
    });
  } } });
  view.setData({});
  view.applyChanges({ factor: 'carb_undercount' });
  rejectNew(new Error('newest response'));
  await new Promise(setImmediate);
  assert.equal(root.textContent, 'newest response');
  resolveOld({});
  await new Promise(setImmediate);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].factor, 'carb_undercount');
  assert.equal(root.textContent, 'newest response');
  view.destroy();
  Object.assign(globalThis, original);
});
