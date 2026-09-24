import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRoute, resolveDestination, serializeRoute, subscribeRoute, writeRoute,
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
  const direct = parseRoute({ pathname: '/day', search: '' });
  assert.deepEqual(direct, { destination: 'day', context: {} });
  assert.equal(serializeRoute(direct), '/day');

  // HV2-14: date, moment, canonical subject, occurrence, affected window,
  // applicable lever, source destination and precise return-focus target.
  const context = {
    date: '2024-06-26', subject: 'Questions · Jun 26 13:55', occurrence: 'occ-7',
    window: '0-120', lever: 'over_treated_low', from: 'diagnose.questions',
    focus: "[data-question-card='q-7'] [data-action='day']",
  };
  const address = serializeRoute({ destination: 'day', context });
  const parsed = parseRoute({ pathname: '/day', search: address.slice(address.indexOf('?')) });
  assert.equal(parsed.destination, 'day');
  assert.deepEqual(parsed.context, context);
});

test('a contextual entry carries its display title in the address beside its routing subject', () => {
  // ADR 426: a reload or Back re-parses the address, so the name Day prints
  // for its origin has to ride it; the subject stays the routing key.
  const context = {
    date: '2024-06-26', moment: '2024-06-26 13:55:00', subject: 'finding:over_treated_low',
    title: 'Over-treated low', occurrence: 'occ-7', from: 'diagnose',
  };
  const address = serializeRoute({ destination: 'day', context });
  const parsed = parseRoute({ pathname: '/day', search: address.slice(address.indexOf('?')) });
  assert.equal(parsed.context.title, 'Over-treated low');
  assert.equal(parsed.context.subject, 'finding:over_treated_low');
  assert.deepEqual(parsed.context, context);
});

test('the v2 address is written and subscribed through the one routing owner', () => {
  const pushes = [];
  writeRoute({ destination: 'diagnose', context: { occurrence: 'low-7' } }, {
    location: { pathname: '/diagnose', search: '', hash: '' },
    history: { pushState: (_state, _title, address) => pushes.push(address) },
    serialize: serializeRoute,
  });
  assert.deepEqual(pushes, ['/diagnose?occurrence=low-7']);

  const listeners = new Map();
  const browser = {
    location: { pathname: '/day', search: '?date=2024-06-26&from=diagnose', hash: '' },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener() {},
  };
  const seen = [];
  const unsubscribe = subscribeRoute((next) => seen.push(next), browser, parseRoute);
  listeners.get('popstate')();
  unsubscribe();
  assert.deepEqual(seen, [{ destination: 'day', context: { date: '2024-06-26', from: 'diagnose' } }]);
});

test('readable v2 paths win over legacy query destinations while old links remain supported', () => {
  assert.deepEqual(parseRoute({ pathname: '/', search: '?to=changes' }),
    { destination: 'changes', context: {} });
  assert.deepEqual(parseRoute({ pathname: '/day', search: '?to=changes&date=2024-06-26' }),
    { destination: 'day', context: { date: '2024-06-26' } });
  for (const destination of ['diagnose', 'changes', 'day']) {
    assert.deepEqual(parseRoute({ pathname: `/${destination}`, search: '' }),
      { destination, context: {} });
  }
});
