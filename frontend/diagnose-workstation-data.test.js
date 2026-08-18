import test from 'node:test';
import assert from 'node:assert/strict';

import { blockKey } from './diagnose-workspaces.js';
import { envelopeFromPooled, markersFromPooled, toCaptures } from './diagnose-workstation-data.js';

const pooled = {
  reading_count: 12,
  captured_days: 3,
  pool_minutes: 45,
  bins: [{ minute: 0, p10: 80, p25: 90, median: 100, p75: 110, p90: 120, n: 4, raw_n: 2 }],
  meals: [{ minute: 450, count: 2, carbs: 42, median_carbs: 21, insulin: 3 }],
};

test('envelopeFromPooled renames the server bins onto chart arrays', () => {
  assert.deepEqual(envelopeFromPooled(pooled), {
    labels: ['00:00'], p10: [80], p25: [90], p50: [100], p75: [110], p90: [120],
    counts: [4], raw: [2], readings: 12, days: 3, pool: 45,
  });
});

test('markersFromPooled supplies the chart category index', () => {
  assert.deepEqual(markersFromPooled(pooled), [{
    minute: 450, index: 30, count: 2, carbs: 42, medianCarbs: 21, insulin: 3,
  }]);
});

test('toCaptures builds the four mock capture shapes with shared Plan keys', () => {
  const block = { block_id: 425, current_values: [7], start_min: 425, end_min: 610 };
  const payload = {
    analyze: { generated_at: '2026-08-10T12:00:00Z', window_days: 30,
      basal: [{ slot: 2, current: 0.8 }], ic_blocks: [block], isf: [{ current: 36 }] },
    evidence: { pooled, window: { start: '2026-07-11', end: '2026-08-10' } },
    exposures: { window: { start: '2026-07-11', end: '2026-08-10' }, exposures: { meals: {} } },
  };

  const captures = toCaptures(payload);
  assert.deepEqual(Object.keys(captures).filter((key) =>
    ['day', 'exposureCapture', 'audit', 'params'].includes(key)),
  ['day', 'exposureCapture', 'audit', 'params']);
  assert.equal(captures.day.isf, 36);
  assert.deepEqual(captures.exposureCapture, payload.exposures);
  assert.equal(captures.audit.states.trial.as_of, '2026-08-10');
  assert.equal(captures.params.ic_blocks[0].__planKey, blockKey(block));
});

test('day.days leaves an unfetched day empty and requests it once', async () => {
  let calls = 0;
  let resolveLoad;
  const loaded = new Promise((resolve) => { resolveLoad = resolve; });
  const captures = toCaptures({}, { loadDay: () => { calls += 1; return loaded; } });

  assert.equal(captures.day.days['2026-08-10'], undefined);
  assert.equal(captures.day.days['2026-08-10'], undefined);
  assert.equal(calls, 1);
  resolveLoad({ date: '2026-08-10', window: { cgm: [] } });
  await Promise.resolve();
  assert.deepEqual(captures.day.days['2026-08-10'], { date: '2026-08-10', window: { cgm: [] } });
});
