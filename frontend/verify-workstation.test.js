import test from 'node:test';
import assert from 'node:assert/strict';

import { queryState } from './verify-workstation.js';

test('queryState reads the existing Verify state from the canonical route query', () => {
  const original = globalThis.location;
  globalThis.location = { hash: '', search: '?state=complete' };
  try {
    assert.equal(queryState('maturing'), 'complete');
  } finally {
    globalThis.location = original;
  }
});
