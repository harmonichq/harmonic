// #126 — pure carb-log capture tests (Node built-in runner, no DOM/importmap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  QUICKLOG_PRESETS, QUICKLOG_TIMES, formatWallClock, whenToT,
  buildCarbPayload, isLoggable, carbToast, msToDatetimeLocal,
} from './carb-log.js';

// A fixed "now" so the relative-time math is deterministic.
const NOW = new Date(2026, 5, 29, 15, 30, 42); // 2026-06-29 15:30:42 local

test('presets are the locked 4/8/12 candy sizes, not the issue 15/30/45', () => {
  assert.deepEqual(QUICKLOG_PRESETS, [4, 8, 12]);
});

test('time options default to now and expose the ago + custom choices', () => {
  assert.deepEqual(QUICKLOG_TIMES.map((t) => t.k), ['now', '15', '30', '60', 'custom']);
});

test('formatWallClock emits local YYYY-MM-DD HH:MM:SS (no tz smear)', () => {
  assert.equal(formatWallClock(NOW), '2026-06-29 15:30:42');
});

test('whenToT now snaps to the minute', () => {
  assert.equal(whenToT('now', null, NOW), '2026-06-29 15:30:00');
});

test('whenToT subtracts the ago minutes', () => {
  assert.equal(whenToT('15', null, NOW), '2026-06-29 15:15:00');
  assert.equal(whenToT('30', null, NOW), '2026-06-29 15:00:00');
  assert.equal(whenToT('60', null, NOW), '2026-06-29 14:30:00');
});

test('whenToT ago rolls back across the hour/day boundary', () => {
  const justAfterMidnight = new Date(2026, 5, 29, 0, 10, 0);
  assert.equal(whenToT('30', null, justAfterMidnight), '2026-06-28 23:40:00');
});

test('whenToT custom expands the datetime-local value, adding seconds when absent', () => {
  assert.equal(whenToT('custom', '2026-06-29T09:05', NOW), '2026-06-29 09:05:00');
  assert.equal(whenToT('custom', '2026-06-29T09:05:30', NOW), '2026-06-29 09:05:30');
});

test('whenToT custom with no value yet is null', () => {
  assert.equal(whenToT('custom', '', NOW), null);
  assert.equal(whenToT('custom', null, NOW), null);
});

test('buildCarbPayload shapes an exact preset into the #125 CarbEntry contract', () => {
  const p = buildCarbPayload({ grams: 8, certainty: 'exact', when: 'now', now: NOW });
  assert.deepEqual(p, {
    t: '2026-06-29 15:30:00', grams: 8, certainty: 'exact', source: 'manual', note: null,
  });
});

test('buildCarbPayload keeps grams for an estimate', () => {
  const p = buildCarbPayload({ grams: 8, certainty: 'estimate', when: '15', now: NOW });
  assert.equal(p.grams, 8);
  assert.equal(p.certainty, 'estimate');
  assert.equal(p.t, '2026-06-29 15:15:00');
});

test('buildCarbPayload forces grams=null for unknown regardless of input', () => {
  const p = buildCarbPayload({ grams: 99, certainty: 'unknown', when: 'now', now: NOW });
  assert.equal(p.grams, null);
  assert.equal(p.certainty, 'unknown');
});

test('buildCarbPayload passes source=manual and a trimmed-to-null empty note', () => {
  const p = buildCarbPayload({ grams: 4, certainty: 'exact', note: '', now: NOW });
  assert.equal(p.source, 'manual');
  assert.equal(p.note, null);
});

test('isLoggable: unknown always, exact/estimate need a positive number', () => {
  assert.equal(isLoggable(null, 'unknown'), true);
  assert.equal(isLoggable(4, 'exact'), true);
  assert.equal(isLoggable(0, 'exact'), false);
  assert.equal(isLoggable(null, 'estimate'), false);
  assert.equal(isLoggable('', 'estimate'), false);
});

test('carbToast reflects certainty and the unknown path', () => {
  assert.equal(carbToast(8, 'exact'), 'Logged 8 g');
  assert.equal(carbToast(8, 'estimate'), 'Logged ~8 g');
  assert.equal(carbToast(null, 'unknown'), 'Logged carbs (unknown amount)');
});

// #171 — ms timestamp → datetime-local string (used to seed the popover from a chart click).
test('msToDatetimeLocal formats a ms timestamp as YYYY-MM-DDTHH:MM using local getters', () => {
  // Build a ms timestamp for 2026-06-29 15:30:42 local.
  const ms = NOW.getTime();
  assert.equal(msToDatetimeLocal(ms), '2026-06-29T15:30');
});

test('msToDatetimeLocal pads single-digit month, day, hour, minute', () => {
  const d = new Date(2026, 0, 5, 8, 3, 0); // 2026-01-05 08:03:00 local
  assert.equal(msToDatetimeLocal(d.getTime()), '2026-01-05T08:03');
});
