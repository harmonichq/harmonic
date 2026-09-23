import test from 'node:test';
import assert from 'node:assert/strict';

import {
  caseAddress, parseRoute, resolveDestination, serializeRoute, subscribeRoute, writeRoute,
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

// ADR 428: once the reader acts inside Diagnose, the address names the case on
// screen — subject, Occurrence, window — and nothing a Day hop brought with it.
test('the case address drops every Day-entry key and the return-focus selector', () => {
  const dayReturn = { date: '2024-06-26', moment: '2024-06-26 13:55:00', subject: 'finding:late_bolus',
    occurrence: 'occ-7', window: '360-720', lever: 'late_bolus', from: 'diagnose',
    focus: '.occ-foot button:last-child' };
  assert.deepEqual(caseAddress(dayReturn, dayReturn.from),
    { subject: 'finding:late_bolus', occurrence: 'occ-7', window: '360-720' });
  assert.equal(serializeRoute({ destination: 'diagnose', context: caseAddress(dayReturn, dayReturn.from) }),
    '/diagnose?subject=finding%3Alate_bolus&occurrence=occ-7&window=360-720');
  // A utility-shaped Diagnose `from` is still Diagnose, so it is dropped too.
  assert.deepEqual(caseAddress({ subject: 'finding:late_bolus' }, 'diagnose.questions'),
    { subject: 'finding:late_bolus' });
  // An Occurrence is named only while one is held.
  assert.deepEqual(caseAddress({ subject: 'basal:180', occurrence: null, window: '180-210' }),
    { subject: 'basal:180', window: '180-210' });
});

test('the case address keeps a return Diagnose renders itself, and no case is no context', () => {
  assert.deepEqual(caseAddress({ subject: 'setting:basal_rate', window: '180-210' }, 'changes'),
    { subject: 'setting:basal_rate', window: '180-210', from: 'changes' });
  assert.equal(serializeRoute({ destination: 'diagnose', context: caseAddress(null, 'diagnose') }), '/diagnose');
  assert.deepEqual(caseAddress(null, 'changes'), { from: 'changes' });
});

test('regression pin: a case address round-trips and an in-place write replaces, never pushes', () => {
  const context = { subject: 'finding:late_bolus', occurrence: 'occ-7', window: '0-360' };
  const address = serializeRoute({ destination: 'diagnose', context });
  assert.deepEqual(parseRoute({ pathname: '/diagnose', search: address.slice(address.indexOf('?')) }),
    { destination: 'diagnose', context });
  const calls = [];
  writeRoute({ destination: 'diagnose', context }, {
    location: { pathname: '/diagnose', search: '?date=2024-06-26&focus=.occ-foot', hash: '' },
    history: {
      pushState: (_state, _title, next) => calls.push(['push', next]),
      replaceState: (_state, _title, next) => calls.push(['replace', next]),
    },
    replace: true,
  });
  assert.deepEqual(calls, [['replace', address]]);
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
