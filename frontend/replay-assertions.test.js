import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForReplayAssertion, withReplayAssertionTimeout } from './replay-assertions.mjs';

test('all original claims must hold in one observation attempt', async () => {
  let attempts = 0;
  const value = await waitForReplayAssertion(seen => {
    const state = seen(++attempts === 1 ? { selected: true, label: 'old' }
      : { selected: attempts !== 2, label: 'served label' });
    assert.equal(state.selected, true);
    assert.equal(state.label, 'served label');
    return state.label;
  }, 'selection and accessible label', 1000);
  assert.equal(attempts, 3);
  assert.equal(value, 'served label');
});

test('a persistent wrong condition fails with its evidence and original assertion', async () => {
  await assert.rejects(waitForReplayAssertion(seen => {
    const state = seen({ selected: 'wrong-row', label: 'old label' });
    assert.equal(state.selected, 'required-row', 'selection must match the served identity');
  }, 'selected row', 10), error => {
    assert.match(error.message, /Timed out after 10 ms: selected row/);
    assert.match(error.message, /wrong-row/);
    assert.match(error.message, /old label/);
    assert.match(error.message, /selection must match the served identity/);
    assert.equal(error.cause?.code, 'ERR_ASSERTION');
    return true;
  });
});

test('a stuck observation cannot extend the deadline and reports its last value', async () => {
  await assert.rejects(waitForReplayAssertion(async seen => {
    seen({ chart: 'not mounted' });
    await new Promise(() => {});
  }, 'chart data', 10), error => {
    assert.match(error.message, /Timed out after 10 ms: chart data/);
    assert.match(error.message, /not mounted/);
    assert.match(error.message, /observation has not returned/);
    return true;
  });
});


test('a scoped negative deadline retains evidence and restores the 30-second default', async t => {
  const scheduled = [];
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, timeout, ...args) => {
    scheduled.push(timeout);
    return original(callback, timeout, ...args);
  });
  await assert.rejects(withReplayAssertionTimeout(10, () => waitForReplayAssertion(seen => {
    const value = seen('wrong');
    assert.equal(value, 'required', 'the negative control still rejects');
  }, 'scoped rejection')), error => {
    assert.match(error.message, /Timed out after 10 ms: scoped rejection/);
    assert.match(error.message, /wrong/);
    assert.match(error.message, /the negative control still rejects/);
    return true;
  });
  assert.equal(await waitForReplayAssertion(() => 'ready', 'ordinary replay'), 'ready');
  assert.deepEqual(scheduled, [10, 30000], 'negative controls do not shorten later positive stories');
});

test('concurrent scopes stay separate and an explicit per-call deadline wins', async t => {
  const scheduled = [];
  const original = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (callback, timeout, ...args) => {
    scheduled.push(timeout);
    return original(callback, timeout, ...args);
  });
  await Promise.all([10, 20].map(timeout => withReplayAssertionTimeout(timeout, async () => {
    await Promise.resolve();
    await waitForReplayAssertion(() => true, 'concurrent scope');
  })));
  await withReplayAssertionTimeout(10, () => waitForReplayAssertion(() => true, 'explicit bound', 25));
  await waitForReplayAssertion(() => true, 'outside both scopes');
  assert.deepEqual(scheduled, [10, 20, 25, 30000]);
});
