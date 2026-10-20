import test from 'node:test';
import assert from 'node:assert/strict';

import { TABS, landRoute, parseRoute, pushDrillDown, resolveTab, serializeRoute, subscribeRoute, writeRoute } from './tab-routing.js';

test('the five tabs, in the order the nav draws them', () => {
  assert.deepEqual(TABS, ['queue', 'changes', 'overview', 'day', 'settings']);
});

test('each tab round-trips through its address, the Queue at the root page', () => {
  for (const tab of TABS) assert.equal(parseRoute({ pathname: serializeRoute(tab) }), tab);
  assert.equal(serializeRoute('queue'), '/');
  assert.equal(serializeRoute('day'), '/day');
  assert.equal(parseRoute({ pathname: '/settings/' }), 'settings');
});

test('an unknown or retired address opens the Queue', () => {
  for (const pathname of ['/', '/queue', '/diagnose', '/v2/day', '/nope']) {
    assert.equal(parseRoute({ pathname }), 'queue');
  }
  assert.equal(resolveTab(undefined), 'queue');
});

test('moving to a tab pushes one history entry, and none when already there', () => {
  const pushed = [];
  const location = { pathname: '/', search: '', hash: '' };
  const history = { pushState: (_state, _title, address) => { pushed.push(address); location.pathname = address; } };
  writeRoute('changes', { location, history });
  writeRoute('changes', { location, history });
  writeRoute('queue', { location, history });
  assert.deepEqual(pushed, ['/changes', '/']);
});

test('Back and Forward report the tab they land on until unsubscribed', () => {
  const listeners = new Set();
  const browser = {
    location: { pathname: '/overview' },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  const seen = [];
  const stop = subscribeRoute((tab) => seen.push(tab), browser);
  for (const fn of listeners) fn();
  stop();
  assert.equal(listeners.size, 0);
  assert.deepEqual(seen, ['overview']);
});

// A fake browser whose history keeps each entry's address and state, and whose
// back() lands on the entry before, as popstate does.
function browserAt(pathname) {
  const entries = [{ address: pathname, state: null }];
  const listeners = new Set();
  const browser = {
    location: { pathname, search: '', hash: '' },
    history: {
      get state() { return entries.at(-1).state; },
      pushState: (state, _title, address) => { entries.push({ address, state }); browser.location.pathname = address; },
      replaceState: (state, _title, address) => { entries[entries.length - 1] = { address, state }; },
      back: () => {
        entries.pop();
        browser.location.pathname = entries.at(-1).address;
        for (const fn of listeners) fn();
      },
    },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  return { browser, entries };
}

test('a drill-down pushes one history entry at the same address, and Back reports the return (ADR 594)', () => {
  const { browser, entries } = browserAt('/');
  const seen = [];
  subscribeRoute((tab, { drillDown }) => seen.push([tab, drillDown]), browser);
  pushDrillDown({ view: 'causes', subject: 'pattern:p0' }, browser);
  assert.deepEqual(entries.map((e) => e.address), ['/', '/'], 'the address never changes');
  browser.history.back();
  assert.deepEqual(seen, [['queue', null]], 'Back lands on the Queue, out of the drill-down');
  // A reload on a drill-down's entry parses to its tab: a drill-down is not addressed.
  pushDrillDown({ view: 'causes', subject: 'pattern:p0' }, browser);
  assert.equal(parseRoute(browser.location), 'queue');
});

test('Back from another tab onto a drill-down reports which drill-down it was, then Back leaves it (ADR 594)', () => {
  const { browser } = browserAt('/');
  const seen = [];
  subscribeRoute((tab, { drillDown }) => seen.push([tab, drillDown]), browser);
  pushDrillDown({ view: 'causes', subject: 'pattern:p0' }, browser);
  writeRoute('changes', browser);
  browser.history.back();
  browser.history.back();
  assert.deepEqual(seen, [
    ['queue', { view: 'causes', subject: 'pattern:p0' }],
    ['queue', null],
  ], 'the first Back returns to the drill-down, the second to the Queue');
});

test('a reload on a drill-down lands on its tab, and the next drill-down\'s Back returns to it in one step (ADR 594)', () => {
  const { browser, entries } = browserAt('/');
  pushDrillDown({ view: 'causes', subject: 'pattern:p0' }, browser);
  // The page reloads: the browser keeps the entry and its state.
  landRoute(browser);
  assert.equal(browser.history.state?.drillDown ?? null, null, 'the reloaded entry is the Queue\'s own');
  assert.deepEqual(entries.map((e) => e.address), ['/', '/'], 'its address is kept');
  const seen = [];
  subscribeRoute((tab, { drillDown }) => seen.push([tab, drillDown]), browser);
  pushDrillDown({ view: 'causes', subject: 'pattern:p1' }, browser);
  browser.history.back();
  assert.deepEqual(seen, [['queue', null]], 'one Back leaves the drill-down');
});
