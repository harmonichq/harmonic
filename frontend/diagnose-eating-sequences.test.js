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

import { eatingSequenceComparison, eatingSequenceChartOption, validEatingSequenceCase } from './diagnose-eating-sequences.js';
import { DIAGNOSE_EVIDENCE_CHARTS } from './diagnose-evidence-charts.js';
import { descriptorsFromFindings } from './diagnose-canvas-layout.js';

const sequenceFixture = JSON.parse(readFileSync(
  new URL('../mockups/eating-sequence-findings.synthetic/payload.json', import.meta.url), 'utf8',
));

test('public sequence cases select the dedicated chart before the generic response chart', () => {
  for (const lever of ['high_carb_sequence', 'repeat_eating']) {
    for (const state of ['covered', 'empty', 'multiple']) {
      const generated = sequenceFixture.states[`${lever}_${state}`].windows.global;
      const prepared = generated.preparation;
      const data = generated.cases[`finding:${lever}`].event;
      assert.equal(validEatingSequenceCase(data), true);
      assert.equal(data.analysis_generation, prepared.findings.analysis_generation);
      const descriptors = descriptorsFromFindings({
        ...prepared.findings, projection_id: prepared.projection_id, rows: prepared.rendered_rows,
      }, DIAGNOSE_EVIDENCE_CHARTS);
      const cause = descriptors.find((d) => d.chartId === data.finding.id);
      assert.equal(cause.kind, 'eating-sequence');
      assert.equal(cause.coordinates.finding_id, data.finding.id);
      assert.equal(cause.coordinates.projection_id, data.projection_id);
      assert.equal(descriptors.find((d) => d.chartId === 'pattern:highs_after_meals').kind, 'pattern-case-file');
      const view = eatingSequenceComparison(data);
      const detector = data.projection.report[lever === 'repeat_eating' ? 'repeat_eating_amplifier' : 'high_carb_sequence'];
      assert.equal(view.finding, detector.finding);
      assert.equal(view.periods.find((p) => p.selected).period, detector.finding.period);
      const option = eatingSequenceChartOption(data);
      assert.match(option.title[0].text, /%/);
      assert.match(option.title[1].text, /mg\/dL/);
      for (const [axis, metric] of ['tir_pct', 'sd_mgdl'].entries()) {
        for (const [index, cohort] of ['reference', 'comparison'].entries()) {
          assert.deepEqual(option.series[axis * 2 + index].data.map((p) => p.value[1]),
            view.periods.map((period) => period[cohort][metric]));
          assert.deepEqual(option.series[axis * 2 + index].data.map((p) => p.n),
            view.periods.map((period) => period[cohort].n));
        }
      }
      const mini = eatingSequenceChartOption(data, { mini: true });
      assert.equal(mini.tooltip.show, false);
      assert.ok(mini.xAxis.every((axis) => !axis.axisLabel.show));
      assert.ok(mini.series.every((series) => series.silent));
    }
  }
});

test('selection validation retains exact served sequence details and rejects malformed cases', () => {
  const stored = sequenceFixture.states.high_carb_sequence_empty.windows.global.cases['finding:high_carb_sequence'];
  const selected = { ...stored.event, selection: Object.values(stored.selections)[0] };
  assert.equal(validEatingSequenceCase(selected), true);
  for (const mutate of [
    (c) => { c.summary.claimed = c.summary.denominator + 1; },
    (c) => { c.selection.detail.sequence.carbs = -1; },
    (c) => { c.projection.report.high_carb_sequence.finding = null; },
    (c) => { c.occurrences[0].id = 'bad'; },
  ]) {
    const broken = structuredClone(selected); mutate(broken);
    assert.equal(validEatingSequenceCase(broken), false);
  }
});

test('thin source cohorts produce no substitute finding and adapter nulls remain null', () => {
  for (const lever of ['high_carb_sequence', 'repeat_eating']) {
    for (const cohort of ['candidate', 'reference']) {
      const prepared = sequenceFixture.states[`${lever}_thin_${cohort}`].windows.global.preparation;
      assert.ok(!prepared.rendered_rows.some((row) => row.id === `finding:${lever}`));
      const adapted = adaptEatingSequenceReport(prepared.eating_sequence_report);
      const cells = lever === 'repeat_eating'
        ? matrixSeries(adapted, { period: 'post_4h', metric: 'tir_pct' }).series.flatMap((r) => r.cells)
        : trajectorySeries(adapted, { scope: 'pooled', metric: 'tir_pct' }).series.flatMap((r) => r.points);
      assert.ok(cells.some((cell) => cell.status === 'insufficient' && cell.value === null));
    }
  }
});

test('a supported case keeps a null period visible without a zero-filled point', () => {
  for (const lever of ['high_carb_sequence', 'repeat_eating']) {
    const data = sequenceFixture.states[`${lever}_null_period`].windows.global.cases[`finding:${lever}`].event;
    assert.equal(validEatingSequenceCase(data), true);
    const option = eatingSequenceChartOption(data);
    assert.equal(option.series[0].data[0].value[1], null);
    assert.equal(option.series[1].data[0].value[1], null);
    assert.equal(option.series[0].data[0].status, 'insufficient');
    assert.match(option.graphic[0].style.text, /Unavailable: During sequence/);
  }
});
