import test from 'node:test';
import assert from 'node:assert/strict';

import { planRevertIntent } from './verify-trial.js';

test('Revert carries only the Plan route the server allowed', () => {
  const staged = planRevertIntent({
    mode: 'stage-prior',
    draft: { items: [{ type: 'ic', start_min: 720, value: 5 }] },
    message: 'The prior setting is staged for manual pump programming. After programming, confirm it with a fresh pump snapshot in Plan.',
  });
  assert.deepEqual(staged, {
    draft: { items: [{ type: 'ic', start_min: 720, value: 5 }] },
    guidance: 'The prior setting is staged for manual pump programming. After programming, confirm it with a fresh pump snapshot in Plan.',
  });

  const manual = planRevertIntent({
    mode: 'manual-review',
    message: 'This Trial does not have one prior setting that can be staged. Review the change in Plan, program the pump manually, then confirm it with a fresh pump snapshot.',
  });
  assert.deepEqual(manual, {
    draft: null,
    guidance: 'This Trial does not have one prior setting that can be staged. Review the change in Plan, program the pump manually, then confirm it with a fresh pump snapshot. No prior setting was staged for this Verify action. Any existing Plan draft was left unchanged.',
  });
});
