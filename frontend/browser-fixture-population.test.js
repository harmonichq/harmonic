import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCapture } from '../mockups/diagnose-event-comparison.synthetic/generate.mjs';
import {
  patternVerdict,
  projectPatternCaseFile,
} from '../mockups/diagnose-event-comparison.synthetic/project.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import {
  populateFindingCasePreparation,
  populateFindingsProjectionInput,
} from './browser-fixture-population.js';
import {
  assertMatchingFindingCasePreparation,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
import { queueMeta, queueRows } from './diagnose-findings-queue.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const payload = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const capture = JSON.parse(readFileSync(
  here('../mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const caseFiles = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));
const findingsFixture = JSON.parse(readFileSync(
  here('./__fixtures__/findings-projection.json'), 'utf8'));

const join = (row) => `${row.ep_id}|${row.t || row.anchor_t}`;
const families = ['meals', 'lows'];

test('browser fixtures retain the canonical nested workstation exposure object', () => {
  const workstationCapture = JSON.parse(readFileSync(
    here('../mockups/diagnose-workstation.synthetic/explore-exposures.capture.json'), 'utf8'));
  assert.deepEqual(payload.exposures, {
    window: workstationCapture.window,
    exposures: workstationCapture.exposures,
  });
});

test('browser fixtures publish the exact same source window for case-file preparation', () => {
  assert.deepEqual(capture.source_window, payload.exposures.window,
    'event capture source window must exactly equal the workstation window');
  assert.equal(capture.schema, 'finding-case-file-event-capture-v1');
});

test('browser fixtures preserve both twenty-row populations, their joins, and their dates', () => {
  const { start, end } = payload.exposures.window;
  for (const family of families) {
    const source = payload.exposures.exposures[family].occurrences;
    const comparison = capture.views[family].occurrences;
    assert.equal(source.length, 20, `${family} workstation population must contain twenty rows`);
    assert.equal(comparison.length, 20, `${family} comparison population must contain twenty rows`);
    assert.deepEqual(comparison.map(join), source.map(join),
      `${family} comparison rows must retain the source identity and anchor time by index`);
    assert.ok(comparison.every(({ date }) => date >= start && date <= end),
      `${family} comparison dates must fall inside the inclusive source window`);
  }

  const mealJoins = payload.exposures.exposures.meals.occurrences.map(join);
  assert.ok(new Set(mealJoins).size < mealJoins.length,
    'the S32 source population must retain a deliberately non-unique join pair');
});

test('the expanded meal population preserves the workstation queue sift shape', () => {
  const meals = payload.exposures.exposures.meals.occurrences;
  const fired = meals.filter((row) => row.cause_lever === 'late_bolus');
  assert.equal(fired.length, 2,
    'only the two intended meal findings contribute to the unpriced queue order');
  assert.ok(fired.every((row) => Number(row.t.slice(11, 13)) * 60 + Number(row.t.slice(14, 16)) >= 360),
    'the fired meal findings stay outside the Overnight all-hidden sift');
  assert.equal(meals.filter((row) => !row.attributed).length, 18,
    'the remaining population rows stay as counter-examples');
});

test('browser preparation joins keep each scoped event-chart coordinate intact', () => {
  const requested = { start_min: 135, end_min: 285 };
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }), requested);
  const preparation = structuredClone(caseFiles.preparation);
  preparation.coordinates.window = projection.window;
  populateFindingCasePreparation(preparation, projection, capture);

  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, requested));
  const row = preparation.rendered_rows.find(({ id }) => id === 'finding:over_treated_low');
  assert.deepEqual(row.event_chart.window, projection.window);
  assert.deepEqual(row.case_header.event_chart, row.event_chart,
    'the row and case header carry the same server-published scoped coordinate');
});

test('browser fixture population supplies the backend-prepared Pattern roster', () => {
  assert.deepEqual(populateFindingsProjectionInput({}).outcome_patterns,
    findingsFixture.browser_outcome_patterns,
    'every browser gate receives the frozen prepared roster from one adapter');
});

test('browser Pattern rows and case files share the public producer denominator', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const row = preparation.rendered_rows.find(({ id }) => id === 'pattern:highs_after_meals');
  const caseFile = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, projectionId: preparation.projection_id,
  });
  const clockCase = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, projectionId: preparation.projection_id,
    alignment: 'clock',
  });

  assert.deepEqual(
    [caseFile.summary.denominator, caseFile.summary.claimed],
    [row.pattern.n, row.pattern.k],
  );
  assert.equal(caseFile.verdict_counts.fired, row.pattern.k);
  assert.equal(clockCase.projection.alignment, 'clock');
  assert.equal(clockCase.projection.clock.total, row.pattern.k);
  for (const field of ['finding', 'family', 'summary', 'verdict_counts', 'occurrences']) {
    assert.deepEqual(clockCase[field], caseFile[field]);
  }
  const selectedClock = projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, alignment: 'clock',
    occurrenceId: clockCase.occurrences[0].id,
  });
  assert.equal(selectedClock.selection.state, 'selected');
  assert.equal(selectedClock.selection.detail.id, clockCase.occurrences[0].id);
  assert.equal(validFindingCaseFile(selectedClock), true);
  assert.deepEqual(row.pattern_chart, row.case_header.pattern_chart);
  assert.equal(row.event_chart, null);
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, null));
});

test('a claimed member outside its Pattern population tags no occurrence', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const member = projection.rows.find(({ id }) => id === 'finding:correction_on_iob');
  const pattern = projection.rows.find(({ id }) => id === 'pattern:lows_after_correcting_highs');
  const caseFile = projectPatternCaseFile(capture, { patternChart: pattern.pattern_chart });

  assert.equal(member.claimed_by, 'pattern:lows_after_correcting_highs');
  assert.equal(caseFile.summary.claimed, 0);
  assert.ok(caseFile.occurrences.every((row) => row.member === 'clean'));
});

test('Pattern misses prefer near misses over outranked member states', () => {
  assert.equal(patternVerdict(['outranked', 'near_miss']), 'near_miss');
  assert.equal(patternVerdict(['near_miss', 'outranked'], true), 'fired');
});

test('memberless Patterns remain served without an invented chart', () => {
  const inputs = populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  const projection = projectFindings(inputs);
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const row = preparation.rendered_rows.find(({ id }) => id === 'pattern:lows_after_meals');

  assert.equal(row.pattern.n, 20);
  assert.equal(row.pattern_chart, null);
  assert.equal(projectPatternCaseFile(capture, { patternChart: row.pattern_chart }), null);
  assert.equal(projectPatternCaseFile(capture, {
    patternChart: row.pattern_chart, alignment: 'clock',
  }), null);
});

test('every chartable fixture Pattern resolves through preparation validation', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze, exposures: payload.exposures, scenarios: payload.scenarios,
  }));
  const preparation = populateFindingCasePreparation(
    structuredClone(caseFiles.preparation), projection, capture,
  );
  const chartable = projection.rows.filter((row) => row.pattern_chart);

  assert.ok(chartable.length > 0);
  assert.deepEqual(chartable.map((row) => row.id), preparation.rendered_rows
    .filter((row) => row.pattern_chart).map((row) => row.id));
  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, null));
});

test('browser preparation mirrors the wrapped row: both families, case file first, headline from the lead', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }));
  const preparation = structuredClone(caseFiles.preparation);
  preparation.coordinates.window = projection.window;
  populateFindingCasePreparation(preparation, projection, capture);

  const projected = projection.rows.find(({ id }) => id === 'finding:correction_on_iob');
  assert.deepEqual(projected.appearances.map(({ family }) => family),
    ['correction_clusters', 'lows'],
    'the projection sorts by family name, so the case file\'s family arrives second');

  const row = preparation.rendered_rows.find(({ id }) => id === 'finding:correction_on_iob');
  assert.deepEqual(row.appearances, [
    { family: 'lows', m: 10, n: 1, noun: 'lows' },
    { family: 'correction_clusters', noun: 'correction clusters', n: 2, m: 2 },
  ], 'the case file\'s family leads at the case file\'s counts and the other family keeps the projection\'s');
  assert.equal(row.headline,
    'Not ranked in this window yet. Showed up in 1 of 10 lows in this window.',
    'the served sentence is composed from the leading appearance the row publishes');
});

test('the cockpit exposure population produces its event-comparison Finding row', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }));
  assert.ok(projection.rows.some(({ id }) => id === 'finding:late_bolus'));
});

test('the Afternoon fixture retains all four published behavioral Findings', () => {
  const projection = projectFindings(populateFindingsProjectionInput({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }), { start_min: 720, end_min: 1080 });
  const selected = new Set(['highs', 'meals', 'corrections']);
  const shown = queueRows(projection, selected)
    .filter((row) => !row.hidden && !row.collapsed);

  assert.deepEqual(shown.map(({ id }) => id), [
    'finding:over_treated_low',
    'finding:correction_on_iob',
    'finding:late_bolus',
    'finding:missed_meal',
  ]);
  assert.equal(queueMeta(projection, selected, true), '4 in this window');
});

test('comparison keeps plan-local outcomes and verdicts when workstation attribution changes', () => {
  const altered = structuredClone(payload.exposures);
  altered.exposures.meals.occurrences = altered.exposures.meals.occurrences.map((row, index) => ({
    ...row,
    t: `2020-03-0${index % 3 + 1} 00:00:00`,
    date: `2020-03-0${index % 3 + 1}`,
    attributed: false,
    cause_lever: null,
    cause_title: null,
    state: 'clean',
    verdicts: [],
  }));

  const rebuilt = buildCapture(altered);
  const localFacts = (occurrences) => occurrences.map(({ outcome_min, routes, verdicts }) =>
    ({ outcome_min, routes, verdicts }));
  assert.deepEqual(localFacts(rebuilt.views.meals.occurrences),
    localFacts(capture.views.meals.occurrences),
    'comparison outcomes and verdicts come from its local plan, not workstation attribution');
  assert.deepEqual(rebuilt.views.meals.occurrences.map(({ ep_id, anchor_t, date }) =>
    ({ ep_id, anchor_t, date })), altered.exposures.meals.occurrences.map(({ ep_id, t, date }) =>
      ({ ep_id, anchor_t: t, date })),
  'comparison preserves canonical workstation identity and anchor time');
});

test('buildCapture rejects an incomplete source family by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.lows.occurrences.pop();
  assert.throws(() => buildCapture(input), /incomplete lows exposure population/);
});

test('buildCapture rejects a missing canonical source window by name', () => {
  const input = structuredClone(payload.exposures);
  delete input.window;
  assert.throws(() => buildCapture(input), /missing workstation exposure window/);
});

test('buildCapture rejects a source row missing its identity by name', () => {
  const input = structuredClone(payload.exposures);
  delete input.exposures.meals.occurrences[0].ep_id;
  assert.throws(() => buildCapture(input), /incomplete meals source row 1/);
});

test('buildCapture rejects a source row outside the inclusive window by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.meals.occurrences[0].date = '1999-12-31';
  assert.throws(() => buildCapture(input),
    /meals source row 1 date 1999-12-31 outside inclusive window/);
});
