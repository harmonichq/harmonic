// #453 triage reproduction: does replay S89 certify the Plan decision it records?
//
//   node docs/scope/453-s89-history-order.repro.mjs [path/to/c2.replay.mjs]
//
// Drives C2_STORIES.S89 (the tree's own, or the module named) against a stateful
// fake page. The fake serves /api/plan/history newest first, as the server does,
// fails the next write a story names through ctx.failNext, and performs it on
// Retry. Every value is synthetic, and every timestamp predates the public scan's
// span. Five served histories:
//   A  no Plan before the story records (the basal-lower case store today)
//   B  an older Plan that was never withdrawn is already listed
//   C  an older withdrawn Plan is listed, and the fake drops the new withdrawal
//   D  the fake lists history oldest first (a perturbation of the served order)
//   E  no earlier Plan, and recording writes two rows instead of one
// Base b03431d2 reads the last listed record and prints:
//   A PASS · B FAIL at "Plan reloaded withdrawal" · C PASS · D PASS ·
//   E FAIL at "Plan reloaded withdrawal"
// It passes C although the new decision's withdrawal never persisted, and D
// although the served order is wrong. With S89 reading history[0], asserting
// the history grew by exactly one and that history[0]'s applied_at was not
// served before recording, it prints:
//   A PASS · B PASS · C FAIL at "Plan reloaded withdrawal" ·
//   D FAIL at "Plan durable decision" · E FAIL at "Plan durable decision"
import { withReplayAssertionTimeout } from '../../frontend/replay-assertions.mjs';

const BASE = 'http://127.0.0.1:8765';
const unavailable = reason => ({ version: '386:1', state: 'unavailable', reason });
const deliverable = value => ({ rows: [{ start_min: 180, basal_rate: { value } }] });

function fakePage({ older = [], dropWithdraw = false, oldestFirst = false, twoRows = false } = {}) {
  const history = older.map(row => structuredClone(row));
  let draft = [];
  let failing = null;
  let pending = null;
  let failed = false;
  const listeners = new Set();
  const write = (method, path) => {
    if (failing && failing.method === method && failing.path === path) {
      failing = null; pending = { method, path }; failed = true; return;
    }
    failed = false; pending = null;
    if (path === '/api/plan') draft = [{ type: 'basal', start_min: 180, value: 0.54 }];
    if (path === '/api/plan/apply') {
      history[oldestFirst ? 'push' : 'unshift']({ applied_at: '2024-02-01 09:00:00', items: draft,
        deliverable: deliverable(0.54), withdrawal: unavailable('not_recorded'), verdict: { state: 'pending' } });
      if (twoRows) history.unshift({ applied_at: '2024-02-01 09:00:01', items: draft,
        deliverable: deliverable(0.54), withdrawal: unavailable('not_recorded'), verdict: { state: 'pending' } });
      draft = [];
    }
    if (path === '/api/plan/history/withdraw' && !dropWithdraw) {
      const newest = oldestFirst ? history.length - 1 : 0;
      history[newest] = { ...history[newest], withdrawal: { version: '386:1', state: 'available',
        withdrawn_at: '2024-02-01 09:05:00', reason: null } };
    }
    const response = { ok: () => true, url: () => BASE + path, request: () => ({ method: () => method }) };
    for (const listen of [...listeners]) listen(response);
  };
  const clicks = {
    '[data-set="save-draft"]': () => write('PUT', '/api/plan'),
    '[data-set="record"]': () => write('POST', '/api/plan/apply'),
    '[data-set="withdraw"]': () => write('POST', '/api/plan/history/withdraw'),
    '[data-set="retry-save"]': () => pending && write(pending.method, pending.path),
  };
  const page = {
    url: () => `${BASE}/?to=changes`,
    reload: async () => {},
    waitForFunction: async () => {},
    request: { get: async url => {
      const path = new URL(url).pathname;
      const body = path === '/api/plan' ? { items: structuredClone(draft) }
        : path === '/api/plan/history' ? { history: structuredClone(history) }
        : path === '/api/pump-settings' ? { profile: { segments: [{ start_min: 0, basal_rate: 0.5 }] } }
        : null;
      if (!body) throw new Error(`unserved ${path}`);
      return { ok: () => true, status: () => 200, json: async () => body };
    } },
    waitForResponse: predicate => new Promise(resolve => {
      const listen = response => { if (predicate(response)) { listeners.delete(listen); resolve(response); } };
      listeners.add(listen);
    }),
    locator: selector => ({
      first() { return this; }, filter() { return this; }, waitFor: async () => {},
      evaluate: async () => true,
      innerText: async () => (failed ? 'Saving failed' : 'Recorded. Pending: waiting for a pump read that matches'),
      click: async () => { clicks[selector]?.(); },
    }),
  };
  return { page, ctx: { failNext: (method, path) => { failing = { method, path }; } } };
}

const olderConfirmed = { applied_at: '2024-01-10 08:00:00', items: [{ type: 'basal', start_min: 180, value: 0.5 }],
  deliverable: deliverable(0.5), withdrawal: unavailable('not_recorded'), verdict: { state: 'confirmed' } };
const olderWithdrawn = { ...olderConfirmed, withdrawal: { version: '386:1', state: 'available',
  withdrawn_at: '2024-01-10 09:00:00', reason: null }, verdict: { state: 'withdrawn' } };

const histories = [
  ['A no earlier Plan', {}],
  ['B older never-withdrawn Plan listed', { older: [olderConfirmed] }],
  ['C older withdrawn Plan listed; new withdrawal dropped', { older: [olderWithdrawn], dropWithdraw: true }],
  ['D history served oldest first', { older: [olderConfirmed], oldestFirst: true }],
  ['E no earlier Plan; recording writes two rows', { twoRows: true }],
];

const target = process.argv[2]
  ? new URL(process.argv[2], `file://${process.cwd()}/`).href
  : new URL('../../frontend/c2.replay.mjs', import.meta.url).href;
const { C2_STORIES } = await import(target);
for (const [name, options] of histories) {
  const { page, ctx } = fakePage(options);
  try {
    await withReplayAssertionTimeout(200, () => C2_STORIES.S89(page, ctx));
    console.log(`${name}: PASS`);
  } catch (error) {
    console.log(`${name}: FAIL (${error.message.split(';')[0]})`);
  }
}
