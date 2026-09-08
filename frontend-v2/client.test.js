import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as client from './client.js';
import * as data from '../frontend/data.js';

// frontend/data.js is the ONE authenticated client for v1 and v2 alike. This
// module re-exports the part of it this surface uses so a component imports one
// module; a second client would be a duplicate implementation of a fact that
// already has an owner, and these read that back.

test('every name this surface uses is the identical function frontend/data.js owns', () => {
  const names = Object.keys(client);
  assert.ok(names.length > 0, 'the client re-export is empty');
  for (const name of names) {
    assert.ok(name in data, `${name} is not a frontend/data.js export`);
    assert.equal(client[name], data[name], `${name} is not the same function frontend/data.js owns`);
  }
});

test('the re-export adds no fetching of its own', () => {
  const source = readFileSync(new URL('./client.js', import.meta.url), 'utf8');
  // One statement: `export { ... } from '../frontend/data.js'`. No function
  // body, no second transport, no second token read.
  assert.ok(!/\bfunction\b|=>|globalThis\.fetch|localStorage/.test(source),
    'frontend-v2/client.js declares behaviour; it must only re-export');
  assert.equal((source.match(/from '/g) || []).length, 1, 'the client re-exports from exactly one module');
});

test('the desk reaches the endpoints its own destinations read and write', () => {
  // Chunk 1's surface: the desk's clock and recorded days, one day's chronology
  // and episodes, and every utility. Chunks 2 and 3 add their own names here.
  for (const name of [
    'fetchStatus', 'fetchDayNavigator', 'fetchTimeline', 'fetchModelView',
    'fetchCarbs', 'createCarb', 'deleteCarb',
    'fetchPrompts', 'answerPrompt', 'clearPrompt',
    'fetchCatalog', 'fetchKbArticle',
    'fetchCredentials', 'saveCredentials', 'fetchPumpSettings',
  ]) {
    assert.equal(typeof client[name], 'function', `${name} is not re-exported`);
  }
});
