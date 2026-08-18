// #136 — tests for the pure day-picker nav helpers. Node's built-in runner, no
// npm deps / no package.json:
//
//     node --test           (auto-discovers *.test.js from the repo root)
//
// These import daily-nav.js with no importmap and no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDays, dayBounds, dayDelta, clampDay, canStepPrev, canStepNext,
  coldArrivalDay, nearestDataDay, flagCountLabel, weekdayLabel,
} from './daily-nav.js';

test('addDays steps calendar days without UTC drift', () => {
  assert.equal(addDays('2026-06-21', 1), '2026-06-22');
  assert.equal(addDays('2026-06-21', -1), '2026-06-20');
  assert.equal(addDays('2026-06-30', 1), '2026-07-01'); // month roll
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); // year roll
  assert.equal(addDays('2026-06-21', 0), '2026-06-21');
});

test('dayBounds spans exactly one local day', () => {
  assert.deepEqual(dayBounds('2026-06-21'), {
    start: '2026-06-21T00:00:00', end: '2026-06-22T00:00:00',
  });
});

test('dayDelta is signed whole-day distance', () => {
  assert.equal(dayDelta('2026-06-20', '2026-06-21'), 1);
  assert.equal(dayDelta('2026-06-21', '2026-06-20'), -1);
  assert.equal(dayDelta('2026-06-11', '2026-06-21'), 10);
});

test('clampDay pins into [earliest, latest], passes through missing bounds', () => {
  assert.equal(clampDay('2026-06-01', '2026-06-11', '2026-07-02'), '2026-06-11');
  assert.equal(clampDay('2026-08-01', '2026-06-11', '2026-07-02'), '2026-07-02');
  assert.equal(clampDay('2026-06-21', '2026-06-11', '2026-07-02'), '2026-06-21');
  assert.equal(clampDay('2026-06-21', null, null), '2026-06-21');
});

test('arrow predicates disable at the data edges', () => {
  const earliest = '2026-06-11', latest = '2026-07-02';
  // interior day: both live
  assert.equal(canStepPrev('2026-06-21', earliest), true);
  assert.equal(canStepNext('2026-06-21', latest), true);
  // earliest day: prev dead, next live
  assert.equal(canStepPrev(earliest, earliest), false);
  assert.equal(canStepNext(earliest, latest), true);
  // latest day: next dead, prev live
  assert.equal(canStepNext(latest, latest), false);
  assert.equal(canStepPrev(latest, earliest), true);
  // no bounds yet → nothing to step onto
  assert.equal(canStepPrev('2026-06-21', null), false);
  assert.equal(canStepNext('2026-06-21', null), false);
});

test('coldArrivalDay prefers latest data day, falls back only when empty', () => {
  assert.equal(coldArrivalDay('2026-07-02', '2026-07-05'), '2026-07-02');
  assert.equal(coldArrivalDay(null, '2026-07-05'), '2026-07-05');
  assert.equal(coldArrivalDay(null, null), null);
});

test('nearestDataDay snaps an empty interior day to the nearer bound', () => {
  const earliest = '2026-06-11', latest = '2026-07-02';
  // closer to earliest
  assert.equal(nearestDataDay('2026-06-14', earliest, latest), earliest);
  // closer to latest
  assert.equal(nearestDataDay('2026-06-29', earliest, latest), latest);
  // equidistant → prefer latest (more recent)
  const mid = addDays(earliest, Math.round(dayDelta(earliest, latest) / 2));
  assert.equal(nearestDataDay(mid, earliest, latest), latest);
  // outside bounds clamps to that edge
  assert.equal(nearestDataDay('2026-05-01', earliest, latest), earliest);
  assert.equal(nearestDataDay('2026-09-01', earliest, latest), latest);
  // single known bound
  assert.equal(nearestDataDay('2026-06-21', null, latest), latest);
});

test('flagCountLabel pluralizes and reads clean at zero', () => {
  assert.equal(flagCountLabel(0), 'clean');
  assert.equal(flagCountLabel(1), '1 flag');
  assert.equal(flagCountLabel(3), '3 flags');
});

test('weekdayLabel formats the pump-local day', () => {
  assert.equal(weekdayLabel('2026-06-21'), 'Sun, Jun 21');
  assert.equal(weekdayLabel('2026-07-02'), 'Thu, Jul 2');
  assert.equal(weekdayLabel(''), '');
});
