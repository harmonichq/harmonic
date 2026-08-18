import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeSerialGate } from './serial-gate.js';

describe('makeSerialGate', () => {
  it('runs enqueued calls serially — max concurrency 1', async () => {
    const enqueue = makeSerialGate();
    let inflight = 0;
    let maxConcurrent = 0;

    function slowFetch(value, delayMs) {
      return enqueue(() => new Promise((resolve) => {
        inflight++;
        if (inflight > maxConcurrent) maxConcurrent = inflight;
        setTimeout(() => { inflight--; resolve(value); }, delayMs);
      }));
    }

    // Enqueue several slow heavy reads all at once (simulating cold-cache fan-out).
    const results = await Promise.all([
      slowFetch('analyze', 10),
      slowFetch('scenarios', 10),
      slowFetch('backtest', 10),
      slowFetch('trend', 10),
    ]);

    assert.equal(maxConcurrent, 1, 'at most one heavy read should be in flight at a time');
    assert.deepEqual(results, ['analyze', 'scenarios', 'backtest', 'trend']);
  });

  it('returns results in submission order', async () => {
    const enqueue = makeSerialGate();
    const order = [];

    await Promise.all([
      enqueue(() => Promise.resolve('a')).then((v) => order.push(v)),
      enqueue(() => Promise.resolve('b')).then((v) => order.push(v)),
      enqueue(() => Promise.resolve('c')).then((v) => order.push(v)),
    ]);

    assert.deepEqual(order, ['a', 'b', 'c']);
  });

  it('warm cache path — instant-resolving fetches complete without extra delay', async () => {
    const enqueue = makeSerialGate();
    const start = Date.now();

    // All resolve synchronously-fast (warm dict lookups).
    await Promise.all([
      enqueue(() => Promise.resolve(1)),
      enqueue(() => Promise.resolve(2)),
      enqueue(() => Promise.resolve(3)),
      enqueue(() => Promise.resolve(4)),
      enqueue(() => Promise.resolve(5)),
    ]);

    // Even 5 chained microtasks should complete in well under 50 ms.
    assert.ok(Date.now() - start < 50, 'warm gate should add negligible latency');
  });

  it('a rejected call does not stall later enqueued calls', async () => {
    const enqueue = makeSerialGate();
    const results = [];

    const p1 = enqueue(() => Promise.reject(new Error('boom'))).catch((e) => results.push('err:' + e.message));
    const p2 = enqueue(() => Promise.resolve('ok')).then((v) => results.push(v));

    await Promise.all([p1, p2]);

    assert.deepEqual(results, ['err:boom', 'ok'], 'subsequent call must still run after a rejection');
  });

  it('allSettled semantics preserved — one rejection does not abort the batch', async () => {
    const enqueue = makeSerialGate();

    const outcomes = await Promise.allSettled([
      enqueue(() => Promise.resolve('good')),
      enqueue(() => Promise.reject(new Error('bad'))),
      enqueue(() => Promise.resolve('also good')),
    ]);

    assert.equal(outcomes[0].status, 'fulfilled');
    assert.equal(outcomes[0].value, 'good');
    assert.equal(outcomes[1].status, 'rejected');
    assert.equal(outcomes[2].status, 'fulfilled');
    assert.equal(outcomes[2].value, 'also good');
  });
});
