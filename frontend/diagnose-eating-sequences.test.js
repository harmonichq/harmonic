import { assertMatchingFindingCasePreparation } from './finding-case-file-validation.js';
import { expandSequenceFixture } from './eating-sequence-fixture.js';
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

import {
  eatingSequenceComparison, eatingSequenceChartOption, highCarbResponseCase,
  validEatingSequenceCase, validHighCarbResponse,
} from './diagnose-eating-sequences.js';
import { DIAGNOSE_EVIDENCE_CHARTS } from './diagnose-evidence-charts.js';
import { descriptorsFromFindings } from './diagnose-canvas-layout.js';

const sequenceFixture = expandSequenceFixture(JSON.parse(readFileSync(
  new URL('../mockups/eating-sequence-findings.synthetic/payload.json', import.meta.url), 'utf8',
)));

const withHighCarbResponse = (source) => {
  if (source.finding.lever !== 'high_carb_sequence') return source;
  const data = structuredClone(source);
  const ids = data.occurrences.map((row) => row.id);
  const points = [0, 5, 10].map((minute) => ({ minute, n: 1, support: 'limited',
    median: 120 + minute, p25: 115 + minute, p75: 125 + minute }));
  data.projection.response = {
    schema: 'high-carb-sequence-response-v1', alignment: 'event',
    anchor: { kind: 'sequence_end', label: 'End of eating sequence' }, window_min: [0, 15],
    source_window: data.projection.report.window,
    scope: data.projection.report.high_carb_sequence.finding.scope,
    period: data.projection.report.high_carb_sequence.finding.period,
    summary: data.projection.report.high_carb_sequence.finding.summary,
    comparisons: data.projection.report.high_carb_sequence.comparisons
      .filter((row) => row.scope === data.projection.report.high_carb_sequence.finding.scope),
    comparison: { name: 'Other sequences', state: 'available' },
    cohorts: [
      { key: 'matched', name: 'Highest-carb fifth', routed_count: 1, usable_count: 1,
        support: 'limited', occurrence_ids: ids.slice(0, 1), points },
      { key: 'comparison', name: 'Other sequences', routed_count: ids.length - 1,
        usable_count: ids.length - 1, support: 'supported', occurrence_ids: ids.slice(1),
        points: points.map((row) => ({ ...row, n: ids.length - 1, support: 'supported',
          median: row.median - 10, p25: row.p25 - 10, p75: row.p75 - 10 })), },
    ],
  };
  if (data.selection.state === 'selected') {
    const id = data.selection.detail.id;
    data.selection.detail = { ...data.selection.detail,
      comparison_cohort: ids[0] === id ? 'matched' : 'comparison',
      glucose: [{ t: data.selection.detail.anchor.t, minute: 0, bg: 120 }] };
  }
  return data;
};

test('public sequence cases select the dedicated chart before the generic response chart', () => {
  for (const lever of ['high_carb_sequence', 'repeat_eating']) {
    for (const state of ['covered', 'empty', 'multiple']) {
      const generated = sequenceFixture.states[`${lever}_${state}`].windows.global;
      const prepared = generated.preparation;
      const data = withHighCarbResponse(generated.cases[`finding:${lever}`].event);
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
      if (lever === 'high_carb_sequence') {
        assert.equal(validHighCarbResponse(data), true);
        assert.equal(highCarbResponseCase(data).projection, data.projection.response);
        const option = DIAGNOSE_EVIDENCE_CHARTS.find((entry) => entry.kind === 'eating-sequence')
          .option(null, { caseFile: data, range: [60, 200] });
        assert.equal(option.xAxis.axisLabel.formatter(0), 'End of eating sequence');
        assert.ok(option.series.some((series) => series.name === 'Highest-carb fifth'));
        assert.ok(option.series.some((series) => series.name === 'Other sequences'));
        continue;
      }
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
  assert.equal(validEatingSequenceCase(stored.event), false,
    'the aggregate-only predecessor cannot masquerade as a response case');
  const selected = withHighCarbResponse({ ...stored.event, selection: Object.values(stored.selections)[0] });
  assert.equal(validEatingSequenceCase(selected), true);
  for (const mutate of [
    (c) => { c.summary.claimed = c.summary.denominator + 1; },
    (c) => { c.selection.detail.sequence.carbs = -1; },
    (c) => { c.projection.report.high_carb_sequence.finding = null; },
    (c) => { c.occurrences[0].id = 'bad'; },
    (c) => { c.projection.response.cohorts[0].name = 'High-carb sequences'; },
    (c) => { c.projection.response.cohorts[0].points[2].minute = 15; },
  ]) {
    const broken = structuredClone(selected); mutate(broken);
    assert.equal(validEatingSequenceCase(broken), false);
  }
});

test('response points stop before the excluded post-sequence and in-sequence endpoints', () => {
  const stored = sequenceFixture.states.high_carb_sequence_empty.windows.global
    .cases['finding:high_carb_sequence'].event;
  const post = withHighCarbResponse(stored);
  assert.equal(validHighCarbResponse(post), true);
  post.projection.response.cohorts[0].points[2].minute = 15;
  assert.equal(validHighCarbResponse(post), false);

  const during = withHighCarbResponse(stored);
  during.projection.report.high_carb_sequence.finding.period = 'in_sequence';
  during.projection.response.period = 'in_sequence';
  during.projection.response.window_min = [-10, 5];
  for (const cohort of during.projection.response.cohorts) {
    cohort.points = cohort.points.map((point, index) => ({ ...point, minute: -10 + (index * 5) }));
  }
  assert.equal(validHighCarbResponse(during), true);
  during.projection.response.cohorts[1].points[2].minute = 5;
  assert.equal(validHighCarbResponse(during), false);
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
    const data = withHighCarbResponse(sequenceFixture.states[`${lever}_null_period`].windows.global.cases[`finding:${lever}`].event);
    assert.equal(validEatingSequenceCase(data), true);
    if (lever === 'high_carb_sequence') continue;
    const option = eatingSequenceChartOption(data);
    assert.equal(option.series[0].data[0].value[1], null);
    assert.equal(option.series[1].data[0].value[1], null);
    assert.equal(option.series[0].data[0].status, 'insufficient');
    assert.match(option.graphic[0].style.text, /Unavailable: During sequence/);
  }
});

test('expanded sequence fixtures satisfy preparation and selection transport contracts', () => {
  for (const state of Object.values(sequenceFixture.states)) {
    assert.deepEqual(Object.keys(state.windows).sort(), ['0-360', 'global']);
    assert.equal(state.analyze, undefined);
    assert.equal(state.exposures, undefined);
    assert.equal(state.scenarios, undefined);
    for (const [key, window] of Object.entries(state.windows)) {
      assert.doesNotThrow(() => assertMatchingFindingCasePreparation(window.preparation,
        key === 'global' ? null : { start_min: 0, end_min: 360 }));
      for (const stored of Object.values(window.cases)) {
        if (stored.event.family !== 'sequences') continue;
        assert.equal(validEatingSequenceCase(withHighCarbResponse(stored.event)), true);
        assert.equal(validEatingSequenceCase(withHighCarbResponse(stored.clock)), true);
        for (const selection of Object.values(stored.selections)) {
          assert.equal(validEatingSequenceCase(withHighCarbResponse({ ...stored.event, selection })), true);
        }
      }
    }
  }
});
