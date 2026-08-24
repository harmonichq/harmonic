import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDiagnoseAge, resetDiagnoseAges } from './diagnose-data-age.js';

test('Diagnose keeps age with its individual shape and clears only fresh replacements', () => {
  const ages = {};
  recordDiagnoseAge(ages, 'analysis', { input_data_age: { covers_to: '2026-08-24 08:00:00' } });
  recordDiagnoseAge(ages, 'scenarios', {});
  assert.deepEqual(ages, { analysis: { covers_to: '2026-08-24 08:00:00' } });
  recordDiagnoseAge(ages, 'analysis', {});
  assert.deepEqual(ages, {});
  resetDiagnoseAges(ages);
  assert.deepEqual(ages, {});
});

test('a full Diagnose reload clears every rendered shape age before responses arrive', () => {
  const ages = { analysis: { covers_to: '2026-08-24 08:00:00' },
    event_comparison: { covers_to: '2026-08-24 08:30:00' } };
  resetDiagnoseAges(ages);
  assert.deepEqual(ages, {});
});
