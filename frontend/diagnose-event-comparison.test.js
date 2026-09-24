import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  caseFileSelectionCohort, eventComparisonChartOption, GLUCOSE_ENVELOPE,
} from './diagnose-event-comparison.js';

const caseFiles = () => JSON.parse(readFileSync(
  new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
));

test('case-file comparison selection uses its served cohort identity', () => {
  const matched = Object.values(caseFiles().cases['finding:missed_meal'].selected_event)
    .find((caseFile) => caseFile.selection.detail.comparison_cohort === 'matched')
    .selection.detail;
  assert.equal(matched.verdict, 'fired');
  assert.equal(caseFileSelectionCohort(matched), 'matched');
  assert.equal(caseFileSelectionCohort({ verdict: 'fired' }), null,
    'the renderer does not derive a comparison cohort from a verdict');
});

test('a selected event case carries each served marker with its selected glucose trace', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#9b7448' });
    const source = Object.values(caseFiles().cases['finding:missed_meal'].selected_event)
      .find((caseFile) => caseFile.selection.state === 'selected');
    const option = eventComparisonChartOption(source, GLUCOSE_ENVELOPE);
    const detail = source.selection.detail;
    assert.deepEqual(option.series.find((series) => series.id === 'selected:trace').data,
      detail.glucose.map((point) => [point.minute, point.bg]));
    const markers = option.series.filter((series) => series.id?.startsWith('selected:marker:'));
    assert.equal(markers.length, detail.markers.length);
    for (const [index, marker] of detail.markers.entries()) {
      assert.equal(markers[index].name, `Selected ${marker.kind} marker`);
      assert.equal(markers[index].data[0][0], marker.minute);
      assert.ok(Number.isFinite(markers[index].data[0][1]));
    }
  } finally { Object.assign(globalThis, prior); }
});

test('selected event markers use only served glucose, skip an empty trace, and bridge null gaps honestly', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#9b7448' });
    const source = Object.values(caseFiles().cases['finding:missed_meal'].selected_event)
      .find((caseFile) => caseFile.selection.state === 'selected');
    const option = (detail) => eventComparisonChartOption({ ...source, selection: {
      ...source.selection, detail,
    } }, GLUCOSE_ENVELOPE);
    const markers = (chart) => chart.series.filter((series) => series.id?.startsWith('selected:marker:'));

    const empty = option({ ...source.selection.detail, glucose: [], markers: [{ minute: 0, kind: 'meal' }] });
    assert.equal(markers(empty).length, 0, 'an event without glucose never receives an invented marker value');

    const gap = option({ ...source.selection.detail,
      glucose: [{ minute: -5, bg: null }, { minute: 4, bg: 147 }],
      markers: [{ minute: -5, kind: 'meal' }],
    });
    assert.deepEqual(markers(gap)[0].data, [[-5, 147]],
      'a null CGM gap uses the nearest real selected-trace observation');

    const supplied = option({ ...source.selection.detail, glucose: [],
      markers: [{ minute: 10, kind: 'meal', bg: 93 }],
    });
    assert.deepEqual(markers(supplied)[0].data, [[10, 93]],
      'a served marker glucose remains visible even without a trace');
  } finally { Object.assign(globalThis, prior); }
});

/* THE CAPTION MUST NOT BE STRUCK BY THE LINE IT NAMES (#355). ECharts places an
   unpositioned markArea label at the centre of the area's TOP edge — here the
   y = 180 target boundary — with no background, so the boundary rule struck the
   text out and the centre-tick gridline crossed it. The rewrite onto served case
   files kept the caption's `name` and dropped the `label` block that placed it,
   so this pins the placement and the plate rather than the words. */
test('the stage target band caption clears its own boundary, on an opaque plate', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  const tokens = {
    '--mk-muted': '#3d5848', '--mk-line': '#c3bfb4', '--mk-ok': '#5d7368',
    '--ck-rail': '#efeae0',
  };
  const targetBand = (option) => option.series
    .find((series) => series.name === 'Target range').markArea.data[0][0];
  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({
      getPropertyValue: (name) => tokens[name] || '',
    });
    const caseFile = caseFiles().cases['finding:late_bolus'].event;
    const stage = targetBand(eventComparisonChartOption(caseFile, GLUCOSE_ENVELOPE));
    const mini = targetBand(eventComparisonChartOption(caseFile, GLUCOSE_ENVELOPE, null, true));

    assert.equal(stage.name, 'target 70–180');
    assert.equal(stage.label?.show, true, 'the caption is placed by the app, never by the library');
    assert.equal(stage.label.position, 'insideStartTop',
      'centred on the top edge is where the 180 rule strikes it out');
    assert.equal(stage.label.distance, 10, 'it drops into the band\'s own clear space');
    assert.equal(stage.label.color, '#3d5848');
    assert.equal(stage.label.backgroundColor, '#efeae0',
      'the plate is the panel ground token, so gridlines break behind the text');
    assert.doesNotMatch(String(stage.label.backgroundColor), /color-mix/,
      'zrender silently drops a color-mix() plate on this path, painting nothing');

    /* A MINI KEEPS NO AXIS FURNITURE AT ALL (ADR 215 amendments). */
    assert.equal(mini.name, undefined);
    assert.equal(mini.label, undefined);
  } finally {
    globalThis.document = prior.document;
    globalThis.getComputedStyle = prior.getComputedStyle;
  }
});

// LOCK:harmonic-v2-desktop:HV2-32 — public chart option, shared with speech.
test('fractional-hour cursor labels use whole minutes without decimal-hour speech', () => {
  const prior = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
  try {
    globalThis.document = { documentElement: {} };
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#000' });
    const source = caseFiles().cases['finding:late_bolus'].event;
    const label = eventComparisonChartOption(source, GLUCOSE_ENVELOPE).xAxis.axisLabel.formatter;
    assert.equal(eventComparisonChartOption(source, GLUCOSE_ENVELOPE).xAxis.axisLabel.align, undefined);
    assert.equal(label(5), '+5 min');
    assert.equal(label(15), '+15 min');
    assert.equal(label(-90), '−1 h 30 min');
    assert.equal(label(60), '+1 h');
    assert.equal(label(0), source.projection.anchor.label);
  } finally { Object.assign(globalThis, prior); }
});

test('selected singleton observations paint while dense selected traces omit markers', () => {
  const source = Object.values(caseFiles().cases['finding:missed_meal'].selected_event)
    .find((row) => row.selection.detail.glucose.length > 1);
  const selected = (row) => eventComparisonChartOption(row, GLUCOSE_ENVELOPE).series
    .find((series) => series.id === 'selected:trace');
  assert.equal(selected(source).showSymbol, false);
  const singleton = structuredClone(source);
  singleton.selection.detail.glucose = [singleton.selection.detail.glucose[0]];
  const mark = selected(singleton);
  assert.equal(mark.showSymbol, true);
  assert.equal(mark.symbol, 'circle');
  assert.ok(mark.symbolSize > 0);
  assert.deepEqual(mark.data, singleton.selection.detail.glucose.map((point) => [point.minute, point.bg]));
});

test('#432 · every served meal dose and carbs equal the minute-0 bolus in the same fixture', async () => {
  const { projectPatternCaseFile } = await import('../mockups/diagnose-event-comparison.synthetic/project.mjs');
  const capture = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));
  const projection = JSON.parse(readFileSync(
    new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8'));
  const atAnchor = (doses) => doses.filter((dose) => dose.minute === 0);
  let checked = 0;
  for (const row of capture.pattern_populations.meals) {
    const [bolus] = atAnchor(row.trace.boluses);
    assert.ok(bolus, `source meal ${row.id} draws its own bolus at minute 0`);
    assert.deepEqual([row.anchor_insulin, row.anchor_carbs], [bolus.insulin, bolus.carbs], row.id);
    checked += 1;
  }
  for (const pattern of capture.outcome_patterns.filter((row) => row.collapse === 'remain_pattern'
    && ['highs_after_meals', 'lows_after_meals'].includes(row.key))) {
    const chart = { key: pattern.key, window: { scoped: false, start_min: null, end_min: null, label: null } };
    let caseFile;
    try { caseFile = projectPatternCaseFile(capture, { patternChart: chart, alignment: 'clock' }); }
    catch { continue; } // a Pattern with no charted population serves no meal detail
    for (const row of caseFile.occurrences) {
      const { detail } = projectPatternCaseFile(capture, {
        patternChart: chart, alignment: 'clock', occurrenceId: row.id }).selection;
      const [bolus] = atAnchor(detail.markers.filter((marker) => marker.kind === 'bolus'));
      assert.deepEqual([detail.anchor.insulin, detail.anchor.carbs], [bolus.insulin, bolus.carbs],
        `${pattern.key} ${row.id}`);
      checked += 1;
    }
  }
  const selected = projection.pattern_clock_case.selection.detail;
  const [bolus] = atAnchor(selected.markers.filter((marker) => marker.kind === 'bolus'));
  assert.deepEqual([selected.anchor.insulin, selected.anchor.carbs], [bolus.insulin, bolus.carbs],
    'pattern_clock_case');
  assert.ok(checked >= 40, `checked ${checked} served meals`);
});

test('#454 · a claimed Pattern Occurrence serves its claimant sentence once, as its cause', async () => {
  const { projectPatternCaseFile } = await import('../mockups/diagnose-event-comparison.synthetic/project.mjs');
  const committed = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));
  const chart = { key: 'highs_after_meals', window: { scoped: false, start_min: null, end_min: null, label: null } };
  const [[claimedId, member]] = Object.entries(committed.pattern_attribution.highs_after_meals);
  const claimant = member.replace('habit:', '');
  // A clone whose claimed row the claimant drove, with its recorded sentence as the
  // row's text: the pairing the Python producer serves.
  const withSentence = (sentence) => {
    const capture = structuredClone(committed);
    const row = capture.pattern_populations.meals.find((item) => item.id === claimedId);
    row.cause_lever = claimant;
    row.verdicts = [...row.verdicts.filter((item) => item.classifier !== claimant), {
      classifier: claimant, detail: sentence ?? row.text, evidence_tier: 'inferred',
      matched: true, silence_reason: null }];
    return { row, reason: projectPatternCaseFile(capture, {
      patternChart: chart, alignment: 'clock', occurrenceId: claimedId }).selection.detail.reason };
  };
  const { row, reason } = withSentence();
  assert.ok(row.text, 'premise: the claimed row carries its attributed narrative');
  assert.deepEqual([reason.cause.lever, reason.cause.text], [claimant, row.text]);
  const entry = reason.habits.find((habit) => habit.lever === claimant);
  assert.deepEqual([entry.verdict, entry.detail], ['fired', null],
    'the claimant line carries no sentence the cause already serves');
  assert.ok(reason.habits.every((habit) => habit.detail !== reason.cause.text),
    'no habit entry repeats the cause');
  // A claimant sentence that says something the cause does not is kept.
  const kept = withSentence('Synthetic sentence the cause does not say.').reason;
  assert.equal(kept.cause.text, row.text);
  assert.equal(kept.habits.find((habit) => habit.lever === claimant).detail,
    'Synthetic sentence the cause does not say.');
});
