// #152 — tests for the pure per-day model-view log helpers. Node's built-in
// runner, no npm deps / no package.json:
//
//     node --test           (auto-discovers *.test.js from the repo root)
//
// These import model-view-log.js with no importmap and no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildRows, rowReason, rowClassifiers, rowTouchesDetector, rowTouchesReason,
  clsName, fmtU, fmtG, STATE_ORDER, rowForT, rowDomId,
} from './model-view-log.js';

// A tiny two-episode day: a fired low that also buries a near-miss meal.
const DAY = {
  date: '2026-06-16',
  window: { start: '2026-06-16 08:00:00', end: '2026-06-16 20:00:00', cgm: [] },
  midnight: null,
  episodes: [
    {
      id: 'ep-b', lever: null, spans_midnight: false,
      anchors: [{
        t: '2026-06-16 12:00:00', kind: 'meal', bg: null, insulin: 5, carbs: 25,
        state: 'near_miss',
        verdicts: [
          { classifier: 'carb_undercount', matched: false, silence_reason: 'under_threshold', evidence_tier: 'observed', detail: 'close' },
          { classifier: 'late_bolus', matched: false, silence_reason: 'no_trigger', evidence_tier: 'observed', detail: 'flat' },
        ],
      }],
    },
    {
      id: 'ep-a', lever: 'over_treated_low', spans_midnight: false,
      anchors: [{
        t: '2026-06-16 09:00:00', kind: 'low', bg: 62, insulin: null, carbs: null,
        state: 'fired',
        verdicts: [
          { classifier: 'over_treated_low', matched: true, silence_reason: null, evidence_tier: 'inferred', detail: 'rebound' },
        ],
      }],
    },
  ],
};

test('buildRows flattens all anchors and sorts chronologically', () => {
  const rows = buildRows(DAY);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].t, '2026-06-16 09:00:00'); // the 09:00 low sorts before the 12:00 meal
  assert.equal(rows[1].kind, 'meal');
});

test('rowReason buckets only real near-misses (not no_trigger)', () => {
  const rows = buildRows(DAY);
  const meal = rows.find((r) => r.kind === 'meal');
  assert.equal(rowReason(meal), 'under_threshold');
  const low = rows.find((r) => r.kind === 'low');
  assert.equal(rowReason(low), null); // fired, not a near-miss
});

test('rowClassifiers lists every detector a row touched', () => {
  const rows = buildRows(DAY);
  const meal = rows.find((r) => r.kind === 'meal');
  assert.deepEqual(rowClassifiers(meal).sort(), ['carb_undercount', 'late_bolus']);
  assert.ok(rowTouchesDetector(meal, 'carb_undercount'));
  assert.ok(!rowTouchesDetector(meal, 'missed_meal'));
});

test('rowTouchesReason catches the near-miss bucket and any carried reason', () => {
  const rows = buildRows(DAY);
  const meal = rows.find((r) => r.kind === 'meal');
  assert.ok(rowTouchesReason(meal, 'under_threshold'));
  assert.ok(rowTouchesReason(meal, 'no_trigger')); // carried on the late_bolus verdict
});

test('headline prefers the matched verdict, else the sharpest near-miss', () => {
  const rows = buildRows(DAY);
  const low = rows.find((r) => r.kind === 'low');
  assert.equal(low.headline.classifier, 'over_treated_low');
  const meal = rows.find((r) => r.kind === 'meal');
  assert.equal(meal.headline.silence_reason, 'under_threshold');
});

test('number formatters kill float artifacts', () => {
  assert.equal(fmtU(4.9999995), '5');
  assert.equal(fmtU(1.24), '1.2');
  assert.equal(fmtG(24.6), '25');
  assert.equal(fmtU(null), null);
});

test('clsName hand-tunes a few classifier ids', () => {
  assert.equal(clsName('carb_undercount'), 'Carb undercount');
  assert.equal(clsName('over_treated_low'), 'Over-treated low');
});

test('STATE_ORDER leads with the loud states', () => {
  assert.equal(STATE_ORDER[0], 'near_miss');
});

test('rowForT maps a marker time back to its log row (#217)', () => {
  const rows = buildRows(DAY);
  const low = rows.find((r) => r.kind === 'low');
  assert.equal(rowForT(rows, low.t), low);        // exact anchor time → its row
  assert.equal(rowForT(rows, '1999-01-01 00:00:00'), null); // no marker → no throw, null
  assert.equal(rowForT(null, low.t), null);       // defensive: no rows yet
});

test('rowDomId keys a row the same way the v-for :key does (#217)', () => {
  const rows = buildRows(DAY);
  const meal = rows.find((r) => r.kind === 'meal');
  assert.equal(rowDomId(meal), 'mv-row-' + meal.epId + meal.t);
  assert.equal(rowDomId(null), null);
});
