import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));

test('ADR 79 fixture carries all four server families and five exact cohorts', () => {
  const cases = Object.values(fixture.cases).map((entry) => entry.event);
  assert.deepEqual(new Set(cases.map((entry) => entry.family)),
    new Set(['meals', 'lows', 'correction_clusters', 'highs']));
  for (const entry of cases) {
    assert.deepEqual(entry.projection.cohorts.map((cohort) => cohort.key),
      ['fired', 'outranked', 'near_miss', 'no_data', 'clean']);
    assert.equal(entry.summary.denominator, entry.occurrences.length);
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
