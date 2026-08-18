import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTab } from './tab-routing.js';

test('resolveTab preserves current and legacy routes, then falls back to Diagnose', () => {
  for (const tab of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(resolveTab(tab), tab);
  }
  assert.equal(resolveTab('dashboard'), 'diagnose');
  assert.equal(resolveTab('pump'), 'diagnose');
  assert.equal(resolveTab('review'), 'diagnose');
  assert.equal(resolveTab('patterns'), 'diagnose');
  assert.equal(resolveTab('daily'), 'day');
  assert.equal(resolveTab('modelview'), 'day');
  assert.equal(resolveTab('outcomes'), 'verify');
  assert.equal(resolveTab('doesnotexist'), 'diagnose');
});
