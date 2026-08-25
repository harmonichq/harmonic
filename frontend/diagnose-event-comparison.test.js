import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { caseFileSelectionCohort } from './diagnose-event-comparison.js';

test('case-file comparison selection keeps its served cohort ahead of its verdict', () => {
  const caseFiles = JSON.parse(readFileSync(
    new URL('../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8',
  ));
  const missed = Object.values(caseFiles.cases['finding:missed_meal'].selected_event)
    .find((caseFile) => caseFile.selection.detail.comparison_cohort === 'missed')
    .selection.detail;
  assert.equal(missed.verdict, 'fired');
  assert.equal(caseFileSelectionCohort(missed), 'missed',
    'the two-cohort meal comparison emphasizes the server-published missed cohort');
  assert.equal(caseFileSelectionCohort({ verdict: 'fired' }), 'fired',
    'ordinary Finding case files retain verdict-keyed emphasis');
});
