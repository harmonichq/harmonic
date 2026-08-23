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

const independent = (value) => JSON.parse(JSON.stringify(value));
const eventCase = () => independent(capture.cases['finding:meal_over_delivery'].event);

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
