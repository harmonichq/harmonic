import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildCapture } from '../mockups/diagnose-event-comparison.synthetic/generate.mjs';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const payload = JSON.parse(readFileSync(
  here('../mockups/diagnose-workstation.synthetic/payload.json'), 'utf8'));
const capture = JSON.parse(readFileSync(
  here('../mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));

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

test('browser fixtures publish the exact same source window and republish it in projections', () => {
  assert.deepEqual(capture.source_window, payload.exposures.window,
    'event capture source window must exactly equal the workstation window');
  for (const family of families) {
    assert.deepEqual(projectSyntheticCapture(capture, { view: family }).coordinates.source_window,
      payload.exposures.window, `${family} projection must republish the workstation window`);
  }
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

test('buildCapture rejects an incomplete source family by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.lows.occurrences.pop();
  assert.throws(() => buildCapture(input), /incomplete lows exposure population/);
});

test('buildCapture rejects a source row outside the inclusive window by name', () => {
  const input = structuredClone(payload.exposures);
  input.exposures.meals.occurrences[0].date = '1999-12-31';
  assert.throws(() => buildCapture(input),
    /meals source row 1 date 1999-12-31 outside inclusive window/);
});
