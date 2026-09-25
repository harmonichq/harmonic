import test from 'node:test';
import assert from 'node:assert/strict';

import { blockKey } from './diagnose-workspaces.js';
import { envelopeFromPooled, isfVerdict, toCaptures } from './diagnose-workstation-data.js';
import * as workstationData from './diagnose-workstation-data.js';

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

test('toCaptures builds the audit and params capture shapes with shared Plan keys', () => {
  const block = { block_id: 425, current_values: [7], start_min: 425, end_min: 610 };
  const payload = {
    analyze: { generated_at: '2026-08-10T12:00:00Z', window_days: 30, basal_support_floor: 11,
      basal: [{ slot: 2, current: 0.8 }], ic_blocks: [block], isf: [{ current: 36 }] },
    evidence: { pooled, window: { start: '2026-07-11', end: '2026-08-10' } },
  };

  const captures = toCaptures(payload);
  assert.deepEqual(Object.keys(captures).filter((key) =>
    ['audit', 'params'].includes(key)),
  ['audit', 'params']);
  assert.equal(captures.audit.states.trial.as_of, '2026-08-10');
  assert.equal(captures.audit.states.trial.analysis.basal_support_floor, 11);
  assert.equal(captures.params.ic_blocks[0].__planKey, blockKey(block));
});

test('isfVerdict answers direction and stageability separately', () => {
  // A harm-owned weaken (#468): the analyzer asserts the direction and produces
  // no number, so the level must say the direction AND offer nothing to stage.
  const weaken = isfVerdict({
    current: 36, recommended: null,
    evidence: { direction: 'weaken', night_fits: [{ date: '2026-08-01', isf: 28.5 }] },
  });
  assert.equal(weaken.direction, 'weaken');
  assert.equal(weaken.canStage, false);
  // A sized recommendation is the only thing that stages.
  assert.equal(isfVerdict({
    recommended: 39.2, asserts_move: true,
    evidence: { direction: 'strengthen', night_fits: [] },
  }).canStage, true);
  // No direction is no direction, whatever the numbers look like.
  assert.equal(isfVerdict({ recommended: null, evidence: {} }).direction, null);
});

test('#469 · isfStageNote gives the correction-factor panel\'s own reason a row cannot stage', () => {
  const { isfStageNote } = workstationData;
  assert.equal(typeof isfStageNote, 'function', 'isfStageNote is exported beside isfVerdict');
  const estimate = { value: 29.4, lo: 16.8, hi: 43.6, n: 5, wide: true };
  assert.equal(isfStageNote({ current: 36, recommended: null, asserts_move: false, estimate,
    evidence: { direction: 'weaken' } }), 'No new number is available, so there is nothing to stage.');
  assert.equal(isfStageNote({ current: 40, recommended: 40, asserts_move: false, estimate,
    evidence: { direction: 'strengthen' } }),
  'The conservative step rounds to the current Correction factor, so there is no settings change to stage.');
  assert.equal(isfStageNote({ current: 40, recommended: null, asserts_move: false, estimate,
    evidence: { direction: 'strengthen' } }),
  'This result is held, so there is no settings change to stage; the estimate and interval remain visible.');
  assert.equal(isfStageNote({ current: 40, recommended: 32, asserts_move: true, estimate,
    evidence: { direction: 'strengthen' } }), null);
});

test('#469 · isfRoundsToCurrent is the one rounded no-op predicate the panel and the note read', () => {
  const { isfRoundsToCurrent } = workstationData;
  const strengthen = { asserts_move: false, evidence: { direction: 'strengthen' } };
  assert.equal(isfRoundsToCurrent({ ...strengthen, current: 40, recommended: 40 }), true);
  assert.equal(isfRoundsToCurrent({ ...strengthen, current: 40, recommended: null }), false);
  assert.equal(isfRoundsToCurrent({ ...strengthen, current: 40, recommended: 40, asserts_move: true }), false);
  assert.equal(isfRoundsToCurrent({ asserts_move: false, evidence: { direction: 'weaken' },
    current: 40, recommended: 40 }), false);
});

test('isfVerdict fails closed for false, missing, and malformed carried verdicts', () => {
  for (const verdict of [false, null, undefined, 'true', 1, {}, []]) {
    const row = {
      recommended: 39.2, asserts_move: verdict,
      evidence: { direction: 'strengthen', night_fits: [] },
    };
    if (verdict === undefined) delete row.asserts_move;
    const got = isfVerdict(row);
    assert.equal(got.direction, 'strengthen');
    assert.equal(got.canStage, false, `verdict ${String(verdict)} fails closed`);
  }
});

test('isfVerdict holds a rounded recommendation when the backend verdict is false', () => {
  const got = isfVerdict({
    current: 42, recommended: 42, asserts_move: false,
    evidence: { direction: 'strengthen', night_fits: [{ date: '2026-08-01', isf: 31 }] },
  });
  assert.deepEqual(got, { direction: 'strengthen', canStage: false, nights: 1 });
});

test('isfVerdict counts the nights the estimate is clustered on, not detected windows', () => {
  const verdict = isfVerdict({
    recommended: null,
    evidence: {
      direction: 'weaken',
      night_fits: [{ date: '2026-08-01', isf: 28.5 }, { date: '2026-08-02', isf: 31.0 }],
      // three windows were detected; the third produced no fit and supports nothing
      rest_windows: [{ date: '2026-08-01' }, { date: '2026-08-02' }, { date: '2026-08-03' }],
    },
  });
  assert.equal(verdict.nights, 2);
});
