import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseV2Route, resolveDestination, serializeV2Route, subscribeRoute, writeRoute,
} from './tab-routing.js';

test('the desk resolves a destination and defaults to Diagnose', () => {
  for (const destination of ['diagnose', 'changes', 'day']) {
    assert.equal(resolveDestination(destination), destination);
  }
  // Diagnose is the default destination (HV2-09), so a missing or unknown `to`
  // opens there rather than on nothing.
  for (const unknown of ['', null, undefined, 'overview', 'explore', 'plan', 'verify']) {
    assert.equal(resolveDestination(unknown), 'diagnose');
  }
});

test('a direct v2 entry carries no context and a contextual one round-trips all of it', () => {
  const direct = parseV2Route({ pathname: '/day', search: '' });
  assert.deepEqual(direct, { destination: 'day', context: {} });
  assert.equal(serializeV2Route(direct), '/day');

  // HV2-14: date, moment, canonical subject, occurrence, affected window,
  // applicable lever, source destination and precise return-focus target.
  const context = {
    date: '2024-06-26', subject: 'Questions · Jun 26 13:55', occurrence: 'occ-7',
    window: '0-120', lever: 'over_treated_low', from: 'diagnose.questions',
    focus: "[data-question-card='q-7'] [data-action='day']",
  };
  const address = serializeV2Route({ destination: 'day', context });
  const parsed = parseV2Route({ pathname: '/day', search: address.slice(address.indexOf('?')) });
  assert.equal(parsed.destination, 'day');
  assert.deepEqual(parsed.context, context);
});

test('the v2 address is written and subscribed through the one routing owner', () => {
  const pushes = [];
  writeRoute({ destination: 'diagnose', context: { occurrence: 'low-7' } }, {
    location: { pathname: '/diagnose', search: '', hash: '' },
    history: { pushState: (_state, _title, address) => pushes.push(address) },
    serialize: serializeV2Route,
  });
  assert.deepEqual(pushes, ['/diagnose?occurrence=low-7']);

  const listeners = new Map();
  const browser = {
    location: { pathname: '/day', search: '?date=2024-06-26&from=diagnose', hash: '' },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const seen = [];
  const unsubscribe = subscribeRoute((next) => seen.push(next), browser, parseV2Route);
  listeners.get('popstate')();
  unsubscribe();
  assert.deepEqual(seen, [{ destination: 'day', context: { date: '2024-06-26', from: 'diagnose' } }]);
});

test('readable v2 paths win over legacy query destinations while old links remain supported', () => {
  assert.deepEqual(parseV2Route({ pathname: '/', search: '?to=changes' }),
    { destination: 'changes', context: {} });
  assert.deepEqual(parseV2Route({ pathname: '/day', search: '?to=changes&date=2024-06-26' }),
    { destination: 'day', context: { date: '2024-06-26' } });
  for (const destination of ['diagnose', 'changes', 'day']) {
    assert.deepEqual(parseV2Route({ pathname: `/${destination}`, search: '' }),
      { destination, context: {} });
  }
});
