/* =========================================================================
   #425 SERIAL GATE — promise-chain mutex for heavy ResultCache-backed reads.

   On a cold cache the SPA fans the heavy computes (analyze, scenarios,
   backtest, outcomes/trend) out concurrently. Because the backend
   runs sync handlers in one uvicorn threadpool and the core model is pure-
   Python, those concurrent threads GIL-thrash and the cold landing is ~3×
   slower than serial. This module provides one shared gate that funnels all
   heavy reads through a single-concurrency chain.

   On a warm cache every enqueued function resolves in <1 ms (dict lookup), so
   the chain drains instantly and the gate adds no measurable latency.

   VUE-FREE and DOM-FREE — node-testable with an injected fake fetch.
   ========================================================================= */

/**
 * Build a serial gate: at most one in-flight call at a time.
 *
 * Usage:
 *   const enqueue = makeSerialGate();
 *   const result = await enqueue(() => expensiveFetch());
 *
 * Rejection semantics: if fn() rejects, the returned promise rejects with the
 * same reason (caller decides whether to catch), but the internal chain stays
 * alive so subsequent enqueued calls still run.
 *
 * @returns {(fn: () => Promise<any>) => Promise<any>}
 */
export function makeSerialGate() {
  let tail = Promise.resolve();
  return function enqueue(fn) {
    const p = tail.then(() => fn());
    // Swallow rejections on the internal tail so one failure does not stall
    // later enqueued calls, but still return the raw promise to the caller.
    tail = p.then(() => {}, () => {});
    return p;
  };
}
