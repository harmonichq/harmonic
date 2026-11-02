// The Advisory notice's memory, through its public interface.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createAdvisory } from './advisory.js';

function storage() {
  const held = new Map();
  return { getItem: (key) => held.get(key) ?? null, setItem: (key, value) => held.set(key, value) };
}

test('a browser is shown the notice until it is understood, then never again', () => {
  const kept = storage();
  assert.equal(createAdvisory(kept).understood(), false);
  createAdvisory(kept).understand();
  assert.equal(createAdvisory(kept).understood(), true);
});

test('a browser that keeps nothing is shown the notice again, and nothing throws', () => {
  const refusing = {
    getItem() { throw new Error('refused'); },
    setItem() { throw new Error('refused'); },
  };
  for (const kept of [refusing, undefined]) {
    const advisory = createAdvisory(kept);
    advisory.understand();
    assert.equal(advisory.understood(), false);
  }
});
