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

test('S98 intercepts the clock-window preparation request and keeps the I:C 409', async () => {
  const { C2_STORIES } = await import('./c2.replay.mjs');
  const routes = new Map(); const responses = []; const pending = [];
  const node = {
    first() { return this; }, filter() { return this; },
    waitFor: async () => {}, click: async () => {},
    getAttribute: async () => 'ic:current', innerText: async () => 'Current I:C evidence', count: async () => 1,
  };
  const page = {
    locator: () => node, waitForFunction: async () => {},
    evaluate: async () => ({ values: ['10'], series: [{ id: 'current', data: [120] }] }),
    route: async (pattern, handler) => routes.set(pattern, handler),
    unroute: async pattern => routes.delete(pattern), getByText: () => node,
    getByRole: (_role, { name }) => ({ ...node, click: async () => {
      if (name !== 'Morning') return;
      const preparation = routes.get('**/api/diagnose/finding-case-file-preparation*');
      assert.equal(typeof preparation, 'function', 'Morning loads preparation, not /api/diagnose/findings');
      for (const handler of [routes.get('**/api/diagnose/carb-ratio-block-evidence*'), preparation]) {
        pending.push(Promise.resolve(handler({ fulfill: async response => responses.push(response) })));
      }
    } }),
  };
  await C2_STORIES.S98(page);
  await Promise.all(pending);
  assert.deepEqual(responses.map(r => r.status).sort(), [409, 503]);
  assert.equal(responses.find(r => r.status === 409).json.detail.code, 'analysis_generation_mismatch');
  assert.equal(routes.size, 0, 'the story removes both interceptions');
});

test('replay deadlines fail with the wait name and preserve resolved values/errors', async () => {
  const { boundedWait } = await import('./c2.replay.mjs');
  await assert.rejects(boundedWait(new Promise(() => {}), 'S98 Morning preparation request', 5),
    /Timed out after 5 ms: S98 Morning preparation request/);
  const value = {};
  assert.equal(await boundedWait(Promise.resolve(value), 'successful wait', 5), value);
  const error = new Error('original failure');
  await assert.rejects(boundedWait(Promise.reject(error), 'failed wait', 5), candidate => candidate === error);
});
