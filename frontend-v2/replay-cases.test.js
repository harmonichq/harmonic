import test from 'node:test';
import assert from 'node:assert/strict';
import { storyCase, createCaseServer } from './replay-cases.mjs';

test('one invocation selects the generated case each story needs', () => {
  assert.equal(storyCase('S88'), 'basal-lower');
  assert.equal(storyCase('S90'), 'basal-lower');
  assert.equal(storyCase('S100'), 'showcase');
  assert.equal(storyCase('S98'), 'ic-lower');
  assert.equal(storyCase('S90', 'S90=basal-raise,S100=showcase'), 'basal-raise');
  assert.throws(() => storyCase('S88', 'S88=../../real'), /Invalid/);
  assert.throws(() => createCaseServer({ directory: '/tmp', baseURL: 'https://example.com' }), /8765/);
});

test('c2 app selection contains concrete story bodies and excludes the c3 Trial inspection', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  for (const id of ['S14','S15','S16','S17','S18','S19','S20','S20b','S21','S22','S23','S24','S25','S26','S27','S28','S29','S30','S31','S32','S33','S34','S35','S37','S37b','S38','S39','S40','S41','S42','S43','S44','S89','S97','S98','S99']) {
    assert.equal(typeof C2_STORIES[id], 'function', id);
  }
  assert.equal(C2_STORIES.S36, undefined);
});
