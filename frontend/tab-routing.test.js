import test from 'node:test';
import assert from 'node:assert/strict';

import { TABS, parseRoute, resolveTab, serializeRoute, subscribeRoute, writeRoute } from './tab-routing.js';

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
