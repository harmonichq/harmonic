import test from 'node:test';
import assert from 'node:assert/strict';
import { recordDiagnoseAge, resetDiagnoseAges } from './diagnose-data-age.js';

test('Diagnose keeps age with its individual shape and clears only fresh replacements', () => {
  const ages = {};
  const stale = { result: 'stale', input_data_age: {
    revision: 7, covers_to: '2026-08-24 08:00:00', newest_covers_to: '2026-08-24 09:00:00',
  } };
  assert.deepEqual(recordDiagnoseAge(ages, 'analysis', stale), { result: 'stale' });
  recordDiagnoseAge(ages, 'scenarios', {});
  assert.deepEqual(ages, { analysis: stale.input_data_age });
  recordDiagnoseAge(ages, 'analysis', {});
  assert.deepEqual(ages, {});
  resetDiagnoseAges(ages);
  assert.deepEqual(ages, {});
});

test('malformed stale age fails closed before its display payload is returned', () => {
  const ages = {};
  assert.equal(recordDiagnoseAge(ages, 'analysis', {
    result: 'must not render', input_data_age: 'malformed',
  }), null);
  assert.equal(recordDiagnoseAge(ages, 'analysis', {
    result: 'must not render', input_data_age: {
      revision: 7, covers_to: '2026-99-99 99:99:99',
    },
  }), null);
  assert.deepEqual(ages, {});
});

test('a fresh Diagnose payload without input data age passes through unchanged', () => {
  const ages = {
    analysis: { revision: 7, covers_to: '2026-08-24 08:00:00' },
    scenarios: { revision: 7, covers_to: '2026-08-24 08:00:00' },
  };
  const payload = { schema: 'eating-sequence-report-v1' };
  assert.equal(recordDiagnoseAge(ages, 'analysis', payload), payload);
  assert.deepEqual(ages, { scenarios: { revision: 7, covers_to: '2026-08-24 08:00:00' } });
});

test('a full Diagnose reload clears every rendered shape age before responses arrive', () => {
  const ages = { analysis: { covers_to: '2026-08-24 08:00:00' },
    event_comparison: { covers_to: '2026-08-24 08:30:00' } };
  resetDiagnoseAges(ages);
  assert.deepEqual(ages, {});
});
