import test from 'node:test';
import assert from 'node:assert/strict';

import { queryState } from './verify-workstation.js';

test('queryState reads the existing Verify state from the canonical hash route', () => {
  const original = globalThis.location;
  globalThis.location = { hash: '#/verify?state=complete', search: '' };
  try {
    assert.equal(queryState('maturing'), 'complete');
  } finally {
    globalThis.location = original;
  }
});
