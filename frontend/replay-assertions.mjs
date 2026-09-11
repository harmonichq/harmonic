import { inspect } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

// Retry observations, never actions. Each callback re-reads its evidence and
// runs the original assertions; all of them must pass in the same attempt.
// `seen` retains the actual values even when a boolean assertion has no diff.
export async function waitForReplayAssertion(assertion, description, timeout = 30000) {
  let timer;
  let expired = false;
  let lastError;
  let observed = [];
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error(`Timed out after ${timeout} ms: ${description}; saw ${inspect(observed, {
        depth: null, maxArrayLength: null, maxStringLength: null,
      })}; ${lastError?.message || 'observation has not returned'}`, { cause: lastError }));
    }, timeout);
  });
  const poll = async () => {
    while (!expired) {
      const attempt = [];
      try {
        return await assertion(value => { attempt.push(value); observed = attempt; return value; });
      } catch (error) {
        lastError = error;
        observed = attempt;
        if (!expired) await delay(50);
      }
    }
  };
  try { return await Promise.race([poll(), deadline]); }
  finally { expired = true; clearTimeout(timer); }
}
