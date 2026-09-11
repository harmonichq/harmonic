import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForReplayAssertion } from './replay-assertions.mjs';

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
