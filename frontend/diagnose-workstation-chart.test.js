import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BIN_MINUTES, buildMealMarkers, buildSlotLane, slotAssertsMove, snapWindow, windowStats,
} from './diagnose-workstation-chart.js';

test('buildSlotLane reads the backend verdict fields', () => {
  const lane = buildSlotLane([
    { label: '00:00', current: 0.8, recommended: 0.9, asserts_move: true, direction: 'raise' },
    { label: '00:30', current: 0.9, recommended: 0.8, asserts_move: true, direction: 'lower' },
    { label: '01:00', current: 1, recommended: null, asserts_move: false, safety_status: 'hold' },
    { label: '01:30', current: 1, recommended: null, asserts_move: false,
      safety_status: 'insufficient evidence' },
    { label: '02:00', current: 1, recommended: null, asserts_move: false, safety_status: 'no data' },
  ]);

  assert.deepEqual(lane.cells.map(({ verdict }) => verdict),
    ['up', 'down', 'hold', 'insufficient', 'nodata']);
});

test('a backend-asserted thin basal estimate remains asserted', () => {
  // #273/#465: the backend already applies the 8-night floor; the frontend must not reapply it.
  const [cell] = buildSlotLane([{
    label: '00:00', current: 0.8, recommended: 0.9, asserts_move: true, direction: 'raise',
    estimate: { n: 4, wide: true },
  }]).cells;

  assert.equal(cell.verdict, 'up');
  assert.equal(cell.asserts, true);
});

test('slotAssertsMove requires a sized backend recommendation', () => {
  assert.equal(slotAssertsMove({ asserts_move: true, recommended: null }), false);
});

test('buildMealMarkers uses 30-minute buckets and the 12 g floor', () => {
  const markers = buildMealMarkers({
    '2026-08-01': { window: { boluses: [
      { t: '2026-08-01 07:02:00', carbs: 12, insulin: 1 },
      { t: '2026-08-01 07:31:00', carbs: 24, insulin: 2 },
      { t: '2026-08-01 07:29:00', carbs: 11, insulin: 1 },
    ] } },
    '2026-08-02': { window: { boluses: [
      { t: '2026-08-02 07:11:00', carbs: 18, insulin: 1.5 },
    ] } },
  });

  assert.deepEqual(markers, [
    { minute: 420, index: 420 / BIN_MINUTES, count: 2, carbs: 30, medianCarbs: 15, insulin: 2.5 },
    { minute: 450, index: 450 / BIN_MINUTES, count: 1, carbs: 24, medianCarbs: 24, insulin: 2 },
  ]);
});

test('windowStats reads a snapped hand-built envelope window', () => {
  const envelope = {
    p25: [90, 95, 100, 105, 110, 115, 120],
    p50: [100, 105, 110, 115, 120, 125, 130],
    p75: [110, 115, 120, 125, 130, 135, 140],
    raw: [1, 2, 3, 4, 5, 6, 7],
  };
  const window = snapWindow([17, 31], 45);

  assert.deepEqual(window, [15, 105]);
  assert.deepEqual(windowStats(envelope, window), {
    a: 1, b: 6, median: 118, lowest: 105, lowestIndex: 1, spread: 20, readings: 27,
  });
});
