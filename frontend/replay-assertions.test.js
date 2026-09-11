import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForReplayAssertion } from './replay-assertions.mjs';
import { goto, harnessCheck, harnessSelect } from './harmonic-v2-desktop-behavior.replay.mjs';

test('a delayed destination is re-read without repeating the navigation click', async () => {
  let clicks = 0;
  let reads = 0;
  const control = {
    count: async () => 1,
    nth: () => control,
    isVisible: async () => true,
    click: async () => { clicks++; },
  };
  await goto({
    locator: () => control,
    waitForTimeout: async () => {},
    evaluate: async () => { reads++; return reads < 3 ? 'overview' : 'explore'; },
  }, 'explore');
  assert.equal(clicks, 1, 'the original action stays single-shot');
  assert.equal(reads, 3, 'each attempt reads the destination exactly once');
});

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


test('late harness controls are observed before their one change event', async () => {
  const previous = globalThis.document;
  const changes = [];
  const control = { options: [{ value: 'synthetic', textContent: 'Synthetic case' }],
    dispatchEvent: event => { changes.push(event.type); } };
  let reads = 0;
  const page = {
    evaluate: async (read, arg) => read(arg),
    waitForTimeout: async () => {},
  };
  try {
    globalThis.document = { querySelector: () => ++reads === 1 ? null : control };
    assert.equal(await harnessSelect(page, 'scenario', 'Synthetic'), 'Synthetic case');
    assert.equal(control.value, 'synthetic');
    assert.deepEqual(changes, ['change']);
    reads = 0;
    await harnessCheck(page, 'readFails', true);
    assert.equal(control.checked, true);
    assert.deepEqual(changes, ['change', 'change'], 'waiting never redispatches a change');
  } finally { globalThis.document = previous; }
});
