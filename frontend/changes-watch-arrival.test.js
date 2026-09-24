/* Changes receives the watch dock's arrival (ADR 429).
 *
 * Its own process: pressing Open Plan sets module state in changes.js that nothing
 * clears, so driving it here would leak a Plan-open desk into changes.test.js. */
import test from 'node:test';
import assert from 'node:assert/strict';

const reads = [];
let guidanceAnswer = null;
globalThis.fetch = async (url) => {
  reads.push(url);
  const path = url.split('?')[0];
  const body = path === '/api/guidance' ? guidanceAnswer
    : path === '/api/verify/trials' ? { input_revision: 1, admission: { state: 'available', active_kind: null }, trials: [], focuses: [] }
    : path === '/api/focus' ? { input_revision: 1, admission: {}, pinnable_patterns: [] }
    : path === '/api/plan/history' ? { history: [] }
    : path === '/api/plan' ? { items: [] }
    : {};
  return { ok: true, json: async () => body };
};
const { loadGuidance } = await import('./guidance.js');
const { mount } = await import('./changes.js');

const candidate = { subject: 'pattern:served', kind: 'pattern', title: 'Served concern', parameter: 'basal_rate',
  action: [{ parameter: 'basal_rate', start_min: 180, end_min: 210, recommended: .54, direction: 'lower' }],
  members: [], preference: {} };
const eligible = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
const watching = { disposition: 'active_change', selected: null, candidates: [], reasons: {} };

// Changes binds its Stage and Open Plan buttons by selector; this host answers
// for whichever of them the markup it was last given actually carries.
const controls = {};
const host = {
  innerHTML: '',
  querySelectorAll(selector) {
    const control = /^\[data-set="([^"]+)"\]$/.exec(selector)?.[1];
    if (!control || !this.innerHTML.includes(`data-set="${control}"`)) return [];
    return [controls[control] ||= {}];
  },
  querySelector: () => null,
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// Mounting Changes also reads the Focus options, which re-read guidance when they
// answer; serving waits those out so the forced read below is the one that lands.
const serve = async (answer) => { guidanceAnswer = answer; await settle(); await loadGuidance({ force: true }); };
/** Mount one arrival, let its reads answer, and return what it asked for and drew. */
async function arrive(navigation, context) {
  reads.length = 0;
  const deps = { navigation, ...(context ? { context } : {}) };
  mount(host, deps); await settle(); await settle();
  mount(host, deps);
  return { reads: [...reads], frame: host.innerHTML };
}

test('a Plan opened earlier does not take the watched record\'s seat from the dock\'s arrival', async () => {
  await serve(eligible);
  mount(host, { navigation: 1 });
  controls.stage.onclick();
  mount(host, { navigation: 1 });
  controls['open-plan'].onclick();

  await serve(watching);
  const watch = await arrive(2, { subject: 'watch' });
  assert.ok(watch.reads.some((url) => url.startsWith('/api/verify/trials')),
    `the watch arrival reads the watched record's follow-up; it read ${JSON.stringify(watch.reads)}`);

  const plan = await arrive(3, { subject: 'plan' });
  assert.ok(!plan.reads.some((url) => url.startsWith('/api/verify/trials')),
    `an explicit Plan arrival still opens the Plan; it read ${JSON.stringify(plan.reads)}`);
});

test('once no change is watched, the dock\'s arrival renders what an arrival with no context renders', async () => {
  await serve(eligible);
  const watch = await arrive(4, { subject: 'watch' });
  const plain = await arrive(5);
  assert.ok(plain.frame.length > 0);
  assert.equal(watch.frame, plain.frame);
  assert.deepEqual(watch.reads, plain.reads);
});
