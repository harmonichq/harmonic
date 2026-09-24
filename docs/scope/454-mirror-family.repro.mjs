// #454 reproduction (triage evidence, not a gate): the fixture-only Pattern
// case-file mirror keeps a habit member outside its Pattern's rate family.
//
//   node --test docs/scope/454-mirror-family.repro.mjs
//
// The Python producer (ciq_autotune/finding_case_file.py `_pattern_case`) keeps
// only members whose `policy_for(lever).rate_family` is the Pattern's family, and
// feeds that one list to both the row verdict and the selected reason. The real
// roster admits such members whenever a scenario row exists for the lever:
// Correction stacking (rate family correction clusters) under Lows after
// correcting highs, and High-carb sequence (no rate family) under Highs after
// meals. `docs/scope/454-backend-family.repro.py` shows the Python answer for the
// same rosters. Both tests below fail on origin/main b03431d2.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { projectPatternCaseFile } from '../../mockups/diagnose-event-comparison.synthetic/project.mjs';

const capture = JSON.parse(readFileSync(new URL(
  '../../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url), 'utf8'));
const whole = { scoped: false, start_min: null, end_min: null, label: null };

function withMember(key, lever) {
  const variant = structuredClone(capture);
  const pattern = variant.outcome_patterns.find((row) => row.key === key);
  pattern.members.unshift({ subject: `habit:${lever}`, kind: 'habit', k: 1, price: 1,
    admitted: false, producer: 'scenario', lo: null, hi: null, seriousness: null, action: null });
  return variant;
}

function selectedHabits(variant, key, family) {
  const occurrenceId = variant.pattern_populations[family][0].id;
  const body = projectPatternCaseFile(variant, {
    patternChart: { key, window: whole }, alignment: 'clock', occurrenceId,
  });
  return body.selection.detail.reason.habits.map((entry) => entry.lever);
}

test('Lows after correcting highs judges no Correction stacking entry', () => {
  assert.deepEqual(
    selectedHabits(withMember('lows_after_correcting_highs', 'correction_stacking'),
      'lows_after_correcting_highs', 'lows'),
    ['correction_on_iob']);
});

test('Highs after meals judges no High-carb sequence entry', () => {
  assert.deepEqual(
    selectedHabits(withMember('highs_after_meals', 'high_carb_sequence'),
      'highs_after_meals', 'meals'),
    ['carb_undercount', 'late_bolus']);
});
