import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertMatchingFindingCasePreparation,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const capture = JSON.parse(await readFile(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url,
)));
const projectionFixture = JSON.parse(await readFile(new URL(
  './__fixtures__/findings-projection.json', import.meta.url,
)));
const missedMealFixture = JSON.parse(await readFile(new URL(
  './__fixtures__/missed-meal-comparison.json', import.meta.url,
)));

const independent = (value) => JSON.parse(JSON.stringify(value));
const eventCase = () => independent(capture.cases['finding:meal_over_delivery'].event);
const missedMealCase = () => independent(capture.cases['finding:missed_meal'].event);
const zeroMissedMealCase = () => independent(missedMealFixture.zero_payload);

test('accepts a preparation carrying the current v2 findings projection', () => {
  const preparation = independent(capture.preparation);
  preparation.findings = projectFindings(projectionFixture.inputs);
  assert.equal(preparation.findings.schema, 'diagnose-findings-v2');
  assert.equal(
    assertMatchingFindingCasePreparation(preparation, null),
    preparation,
  );
});

test('rejects a preparation whose rendered case header diverges from its header map', () => {
  const preparation = independent(capture.preparation);
  preparation.rendered_rows[0].case_header.summary.claimed += 1;
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('accepts matching headers independent of JSON object key order', () => {
  const preparation = independent(capture.preparation);
  const [id, header] = Object.entries(preparation.behavioral_case_headers)[0];
  preparation.behavioral_case_headers[id] = Object.fromEntries(
    Object.entries(header).reverse(),
  );
  assert.equal(
    assertMatchingFindingCasePreparation(preparation, null),
    preparation,
  );
});

test('rejects a header that has no rendered Finding', () => {
  const preparation = independent(capture.preparation);
  preparation.behavioral_case_headers['finding:not-rendered'] = {
    ...independent(Object.values(preparation.behavioral_case_headers)[0]),
    finding_id: 'finding:not-rendered',
  };
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a rendered coordinate that diverges from the server case header', () => {
  const preparation = independent(capture.preparation);
  preparation.rendered_rows[0].event_chart.view = 'lows';
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a malformed server case-header coordinate without throwing TypeError', () => {
  const preparation = independent(capture.preparation);
  delete preparation.rendered_rows[0].case_header.event_chart;
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, null),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('rejects a preparation projected for a different requested window', () => {
  const preparation = independent(capture.preparation);
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, { start_min: 0, end_min: 360 }),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});

test('accepts the current valid event case-file cohort partition', () => {
  assert.equal(validFindingCaseFile(eventCase()), true);
});

test('rejects an event case without the five exact ADR 79 cohorts', () => {
  const caseFile = eventCase();
  caseFile.projection.cohorts[4].key = 'not_a_verdict';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a cohort occurrence outside the canonical response roster', () => {
  const caseFile = eventCase();
  const cohort = caseFile.projection.cohorts[0];
  cohort.occurrence_ids[0] = 'o_ffffffffffffffffffffffffffffffff';
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects duplicated cohort membership even when each cohort count still matches', () => {
  const caseFile = eventCase();
  const fired = caseFile.projection.cohorts.find((cohort) => cohort.key === 'fired');
  const clean = caseFile.projection.cohorts.find((cohort) => cohort.key === 'clean');
  clean.occurrence_ids[0] = fired.occurrence_ids[0];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects cohort membership that diverges from the roster verdict', () => {
  const caseFile = eventCase();
  const fired = caseFile.projection.cohorts.find((cohort) => cohort.key === 'fired');
  const clean = caseFile.projection.cohorts.find((cohort) => cohort.key === 'clean');
  const cleanId = clean.occurrence_ids[0];
  const firedId = fired.occurrence_ids[0];
  fired.occurrence_ids[0] = cleanId;
  clean.occurrence_ids[0] = firedId;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects routed-count and denominator equations that do not reconcile', () => {
  const caseFile = eventCase();
  caseFile.projection.cohorts[0].routed_count += 1;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts the two-cohort fixed-axis missed-meal comparison', () => {
  const caseFile = missedMealCase();
  assert.deepEqual(caseFile.projection.cohorts.map((cohort) => cohort.key),
    ['missed', 'announced']);
  assert.equal(validFindingCaseFile(caseFile), true);
});

test('rejects missed-meal aggregate points that exceed their usable cohort', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[0].usable_count = 0;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a declared zero missed cohort that retains drawable aggregate points', () => {
  const caseFile = missedMealCase();
  const missed = caseFile.projection.cohorts[0];
  for (const row of caseFile.occurrences) {
    row.attributed = false;
    row.comparison_anchor = null;
  }
  caseFile.summary.claimed = 0;
  missed.occurrence_ids = [];
  missed.routed_count = 0;
  missed.usable_count = 0;
  caseFile.projection.counts.missed = 0;
  caseFile.projection.counts.not_comparable = caseFile.summary.denominator;
  assert.equal(caseFile.projection.cohorts[0].usable_count, 0);
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts the exact generator-authored zero-attribution response', () => {
  const caseFile = zeroMissedMealCase();
  const missed = caseFile.projection.cohorts[0];
  assert.equal(missed.routed_count, 0);
  assert.equal(missed.usable_count, 0);
  assert.ok(missed.points.every((point) => point.n === 0
    && point.support === 'withheld'
    && point.median === null && point.p25 === null && point.p75 === null));
  assert.equal(validFindingCaseFile(caseFile), true);
  missed.episodes = [{}];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a missed-meal comparison with a widened or roster-mismatched axis', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[0].points.pop();
  assert.equal(validFindingCaseFile(caseFile), false);
  const mismatched = missedMealCase();
  mismatched.projection.cohorts[0].occurrence_ids.pop();
  mismatched.projection.cohorts[0].routed_count -= 1;
  mismatched.projection.counts.missed -= 1;
  mismatched.projection.counts.not_comparable += 1;
  assert.equal(validFindingCaseFile(mismatched), false);
});

test('rejects a missed-meal comparison with a malformed cohort anchor', () => {
  const caseFile = missedMealCase();
  caseFile.projection.cohorts[1].anchor.label = 7;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects a forged selected announced-meal detail', () => {
  const selected = independent(missedMealFixture.selected_announced);
  selected.selection.detail.verdict = 'fired';
  assert.equal(validFindingCaseFile(selected), false);
});

test('rejects replacing an attributed missed winner with another fired High', () => {
  const caseFile = missedMealCase();
  const attributed = caseFile.occurrences.find((row) => row.attributed);
  const replacement = caseFile.occurrences.find((row) => row.id
    !== attributed.id && row.verdict === 'fired');
  if (!replacement) return;
  caseFile.projection.cohorts[0].occurrence_ids[0] = replacement.id;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects synchronized fabricated missed-meal identities', () => {
  const caseFile = missedMealCase();
  const fabricated = 'o_ffffffffffffffffffffffffffffffff';
  caseFile.projection.cohorts[0].occurrence_ids[0] = fabricated;
  caseFile.projection.attributed_occurrence_ids = [fabricated];
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects retired High-peak selected detail for a missed meal', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  const rosterRow = caseFile.occurrences.find(
    (row) => row.id === caseFile.selection.requested_id,
  );
  caseFile.selection.detail.anchor = independent(rosterRow.anchor);
  caseFile.selection.detail.date = rosterRow.date;
  caseFile.selection.detail.day_target.date = rosterRow.date;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('rejects missed-meal selected traces outside the fixed comparison window', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  caseFile.selection.detail.glucose.push({
    t: '2026-01-03 05:45:00', minute: -61, bg: 109,
  });
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('fails closed when selected missed-meal marker families are malformed', () => {
  const caseFile = independent(missedMealFixture.selected_missed);
  delete caseFile.selection.detail.markers;
  assert.equal(validFindingCaseFile(caseFile), false);
});

test('accepts event-to-clock transition with an unavailable announced selection', () => {
  const caseFile = independent(missedMealFixture.clock_after_announced);
  assert.equal(caseFile.selection.state, 'unavailable');
  assert.equal(validFindingCaseFile(caseFile), true);
});
