import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { makeDeps } from './data.js';

import {
  adaptEatingSequenceReport,
  matrixSeries,
  trajectorySeries,
} from './diagnose-eating-sequences.js';

const report = JSON.parse(readFileSync(
  new URL('./__fixtures__/eating-sequence-report.json', import.meta.url), 'utf8',
));

test('the fetch helper requests the API-declared fixed Diagnose route', async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => report };
  };
  await makeDeps({ fetch }).fetchEatingSequences();
  assert.deepEqual(calls, ['/api/diagnose/eating-sequences']);
  const api = readFileSync(new URL('../ciq_autotune/api.py', import.meta.url), 'utf8');
  assert.match(api, /@app\.get\("\/api\/diagnose\/eating-sequences"\)/);
});

test('the adapter carries the report skeleton and served rows field-for-field', () => {
  const adapted = adaptEatingSequenceReport(report);
  assert.deepEqual(Object.keys(adapted), ['schema', 'window', 'definitions', 'highCarb', 'repeat']);
  assert.equal(adapted.schema, report.schema);
  assert.deepEqual(adapted.window, report.window);
  assert.deepEqual(adapted.definitions, report.definitions);
  assert.deepEqual(adapted.highCarb, {
    status: report.high_carb_sequence.status,
    finding: report.high_carb_sequence.finding,
    exclusions: report.high_carb_sequence.exclusions,
    scopes: report.high_carb_sequence.scopes,
    comparisons: report.high_carb_sequence.comparisons,
  });
  assert.deepEqual(adapted.repeat, {
    status: report.repeat_eating_amplifier.status,
    finding: report.repeat_eating_amplifier.finding,
    exclusions: report.repeat_eating_amplifier.exclusions,
    matrix: report.repeat_eating_amplifier.matrix,
    comparisons: report.repeat_eating_amplifier.comparisons,
  });
  assert.deepEqual(adapted.highCarb.comparisons[0].reference,
    report.high_carb_sequence.comparisons[0].reference);
  assert.deepEqual(adapted.repeat.comparisons[0].repeat,
    report.repeat_eating_amplifier.comparisons[0].repeat);
});

test('trajectory series selects served values and preserves insufficient cells', () => {
  const adapted = adaptEatingSequenceReport(report);
  const series = trajectorySeries(adapted, { scope: 'evening', metric: 'tir_pct' });
  assert.deepEqual(series.periods, ['in_sequence', 'post_4h', 'post_6h']);
  assert.deepEqual(series.boundaries_g, report.high_carb_sequence.scopes.evening.boundaries_g);
  assert.equal(series.series.length, 5);
  assert.deepEqual(series.series[0], {
    quintile: 1,
    sequence_n: 5,
    points: [
      { period: 'in_sequence', value: null, n: 5, status: 'insufficient' },
      { period: 'post_4h', value: null, n: 5, status: 'insufficient' },
      { period: 'post_6h', value: null, n: 5, status: 'insufficient' },
    ],
  });
  assert.equal(series.series[4].points[0].value,
    report.high_carb_sequence.scopes.evening.rows[4].in_sequence.tir_pct);
});

test('matrix series selects its fixed bands and attaches only served repeat comparisons', () => {
  const adapted = adaptEatingSequenceReport(report);
  const series = matrixSeries(adapted, { period: 'post_4h', metric: 'tir_pct' });
  assert.deepEqual(series.quintiles, [1, 2, 3, 4, 5]);
  assert.deepEqual(series.series.map(({ band }) => band), ['1', '2', '3+']);
  assert.deepEqual(series.series[1].cells[0], {
    quintile: 1, value: null, n: 0, status: 'insufficient', comparison: null,
  });
  assert.equal(series.series[2].cells[4].value,
    report.repeat_eating_amplifier.matrix[14].post_4h.tir_pct);
  assert.deepEqual(series.series[2].cells[4].comparison,
    report.repeat_eating_amplifier.comparisons[13]);
});

test('closed selectors reject unknown values', () => {
  const adapted = adaptEatingSequenceReport(report);
  assert.throws(() => trajectorySeries(adapted, { scope: 'night', metric: 'tir_pct' }));
  assert.throws(() => trajectorySeries(adapted, { scope: 'pooled', metric: 'peak_mgdl' }));
  assert.throws(() => matrixSeries(adapted, { period: 'overnight', metric: 'tir_pct' }));
  assert.throws(() => matrixSeries(adapted, { period: 'post_4h', metric: 'mean_mgdl' }));
});
