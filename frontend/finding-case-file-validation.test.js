import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  assertMatchingFindingCasePreparation,
} from './finding-case-file-validation.js';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const capture = JSON.parse(await readFile(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url,
)));
const projectionFixture = JSON.parse(await readFile(new URL(
  './__fixtures__/findings-projection.json', import.meta.url,
)));

const independent = (value) => JSON.parse(JSON.stringify(value));

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

test('rejects a preparation projected for a different requested window', () => {
  const preparation = independent(capture.preparation);
  assert.throws(
    () => assertMatchingFindingCasePreparation(preparation, { start_min: 0, end_min: 360 }),
    (error) => error.detail?.code === 'inconsistent_projection',
  );
});
