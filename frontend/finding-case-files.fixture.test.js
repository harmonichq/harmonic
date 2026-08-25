import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validFindingCaseFile } from '../frontend/finding-case-file-validation.js';

const fixture = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
const missedMealFixture = JSON.parse(readFileSync(new URL(
  '../frontend/__fixtures__/missed-meal-comparison.json', import.meta.url), 'utf8'));

test('ADR 79 fixture keeps verdict cohorts except for the missed-meal comparison', () => {
  const cases = Object.values(fixture.cases).map((entry) => entry.event);
  assert.deepEqual(new Set(cases.map((entry) => entry.family)),
    new Set(['meals', 'lows', 'correction_clusters', 'highs']));
  for (const entry of cases) {
    const expected = entry.finding.lever === 'missed_meal'
      ? ['missed', 'announced']
      : ['fired', 'outranked', 'near_miss', 'no_data', 'clean'];
    assert.deepEqual(entry.projection.cohorts.map((cohort) => cohort.key), expected);
    assert.equal(entry.summary.denominator, entry.occurrences.length);
  }
});

test('ADR 79 fixture serializes every generated case as one exact population partition', () => {
  for (const [findingId, cases] of Object.entries(fixture.cases)) {
    for (const [name, caseFile] of Object.entries(cases)) {
      if (name.startsWith('selected_')) {
        for (const selected of Object.values(caseFile)) {
          assert.equal(validFindingCaseFile(selected), true, `${findingId} ${name}`);
        }
      } else {
        assert.equal(validFindingCaseFile(caseFile), true, `${findingId} ${name}`);
      }
    }
  }
});

test('ADR 79 fixture pins claimed < fired and near-low aggregate withholding', () => {
  const meal = fixture.cases['finding:meal_over_delivery'].event;
  assert.equal(meal.summary.claimed, 1);
  assert.equal(meal.verdict_counts.fired, 6);
  assert.ok(meal.summary.claimed < meal.verdict_counts.fired);
  const low = fixture.cases['finding:over_treated_low'].event;
  assert.equal(low.projection.cohorts.find((cohort) => cohort.key === 'near_miss').support,
    'withheld');
});

test('ADR 79 fixture pins rebound clock membership, correction pairs, and High evidence', () => {
  const low = fixture.cases['finding:over_treated_low'].clock;
  const claimed = low.occurrences.find((row) => row.verdict === 'fired');
  const claimedBucket = low.projection.clock.buckets.findIndex((bucket) =>
    bucket.occurrence_ids.includes(claimed.id));
  assert.notEqual(claimedBucket, Math.floor(Number(claimed.anchor.t.slice(11, 13)) / 2),
    'the caused-Low rebound is bucketed by its Finding outcome, not its Low anchor');

  const pair = Object.values(
    fixture.cases['finding:correction_stacking'].selected_event)[0];
  assert.equal(pair.selection.detail.source_corrections.length, 2);
  const high = Object.values(
    fixture.cases['finding:meal_bolus_short'].selected_event)[0];
  assert.ok(high.selection.detail.glucose.length > 0);
  assert.ok(high.selection.detail.markers.some((marker) => marker.kind === 'bolus'));
});

test('missed-meal fixture pins attributed membership and the unconditioned baseline', () => {
  const { payload } = missedMealFixture;
  const [missed, announced] = payload.projection.cohorts;
  assert.equal(validFindingCaseFile(payload), true);
  assert.equal(missed.routed_count, 1);
  assert.equal(announced.routed_count, 1);
  assert.equal(payload.projection.counts.not_comparable, 1);
  assert.deepEqual(payload.projection.window_min, [-60, 300]);
  assert.equal(missed.anchor.kind, 'detected_rise_onset');
  assert.equal(announced.anchor.kind, 'completed_carb_bolus');
  assert.equal(validFindingCaseFile(missedMealFixture.selected_missed), true);
  const missedDetail = missedMealFixture.selected_missed.selection.detail;
  const missedRoster = missedMealFixture.selected_missed.occurrences.find(
    (row) => row.id === missedDetail.id,
  );
  assert.deepEqual(missedDetail.anchor, missedRoster.comparison_anchor);
  assert.notEqual(missedDetail.anchor.bg, missedRoster.anchor.bg);
  assert.ok(missedDetail.markers.some((marker) => marker.kind === 'rescue_carb'));
  assert.equal(validFindingCaseFile(missedMealFixture.selected_announced), true);
  assert.equal(missedMealFixture.selected_announced.selection.detail.comparison_cohort,
    'announced');
  assert.equal(validFindingCaseFile(missedMealFixture.clock_after_announced), true);
  assert.equal(missedMealFixture.clock_after_announced.selection.state, 'unavailable');
});
