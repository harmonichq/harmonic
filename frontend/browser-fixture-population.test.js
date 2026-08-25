import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCapture } from '../mockups/diagnose-event-comparison.synthetic/generate.mjs';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';
import { populateFindingCasePreparation } from './browser-fixture-population.js';
import { assertMatchingFindingCasePreparation } from './finding-case-file-validation.js';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const payload = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const capture = JSON.parse(readFileSync(
  here('../mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const caseFiles = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/finding-case-files.json'), 'utf8'));

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
  const projection = projectFindings({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  }, requested);
  const preparation = structuredClone(caseFiles.preparation);
  preparation.coordinates.window = projection.window;
  populateFindingCasePreparation(preparation, projection);

  assert.doesNotThrow(() => assertMatchingFindingCasePreparation(preparation, requested));
  const row = preparation.rendered_rows.find(({ id }) => id === 'finding:over_treated_low');
  assert.deepEqual(row.event_chart.window, projection.window);
  assert.deepEqual(row.case_header.event_chart, row.event_chart,
    'the row and case header carry the same server-published scoped coordinate');
});

test('the cockpit exposure population produces its event-comparison Finding row', () => {
  const projection = projectFindings({
    analysis: payload.analyze,
    exposures: payload.exposures,
    scenarios: payload.scenarios,
  });
  assert.ok(projection.rows.some(({ id }) => id === 'finding:late_bolus'));
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
