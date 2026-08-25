import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { caseFileSelectionCohort } from './diagnose-event-comparison.js';

test('case-file comparison selection uses its served cohort identity', () => {
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const matched = Object.values(caseFiles.cases['finding:missed_meal'].selected_event)
    .find((caseFile) => caseFile.selection.detail.comparison_cohort === 'matched')
    .selection.detail;
  assert.equal(matched.verdict, 'fired');
  assert.equal(caseFileSelectionCohort(matched), 'matched');
  assert.equal(caseFileSelectionCohort({ verdict: 'fired' }), null,
    'the renderer does not derive a comparison cohort from a verdict');
});
