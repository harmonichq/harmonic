import test from 'node:test';
import assert from 'node:assert/strict';

import { queryState } from './diagnose-workstation.js';

test('queryState reads Diagnose state from the canonical hash before the split query', () => {
  const original = globalThis.window;
  try {
    globalThis.window = {
      location: { hash: '#/diagnose?mode=drawn', search: '?mode=dense' },
    };
    assert.equal(queryState('typical'), 'drawn');

    globalThis.window.location.hash = '#diagnose';
    assert.equal(queryState('typical'), 'dense');
  } finally {
    globalThis.window = original;
  }
});
