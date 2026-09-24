/* Which frame each arrival to Changes leads with (ADR 429, ADR 446).
 *
 * The router hands every arrival a new `navigation` value, and a re-render within
 * the visit keeps it. Open Plan holds for the visit it was pressed in: Changes
 * clears that choice on each new arrival, before anything else. So while the
 * server serves an active change, an arrival that asks for neither the Plan nor
 * a change record opens the watched Trial or Focus, and with nothing watched a
 * plain return shows what the served disposition leads with. An explicit Plan
 * arrival still opens the Plan.
 *
 * Its own process: the last test seats the desk's router, and every test here
 * moves the Plan's staged change, both module state other files do not expect. */
import test from 'node:test';
import assert from 'node:assert/strict';

const reads = [];
let guidanceAnswer = null;
// The follow-up's roster, plain and for one selected record. The default admits
// nothing; a test that needs a watched Trial serves `activeTrial`.
const noWatch = () => ({ input_revision: 1, admission: { state: 'available', active_kind: null }, trials: [], focuses: [] });
const activeTrial = (selected) => ({ input_revision: 1,
  admission: { state: 'available', active_kind: 'trial', active_id: 'trial-1', can_finish_trial: false },
  trials: [{ id: 'trial-1' }], focuses: [],
  ...(selected ? { selected: { id: 'trial-1', kind: 'trial', changed_at: '2026-01-02 03:00:00',
    changes: [{ parameter: 'basal_rate', slot: '03:00', before: 0.6, after: 0.54 }],
    original: { context: {} }, reassessment: null } } : {}) });
let trials = noWatch;
globalThis.fetch = async (url) => {
  reads.push(url);
  const [path, query = ''] = url.split('?');
  const body = path === '/api/guidance' ? guidanceAnswer
    : path === '/api/verify/trials' ? trials(new URLSearchParams(query).get('selected'))
    : path === '/api/focus' ? { input_revision: 1, admission: {}, pinnable_patterns: [] }
    : path === '/api/plan/history' ? { history: [] }
    : path === '/api/plan' ? { items: [] }
    : {};
  return { ok: true, json: async () => body };
};
const { loadGuidance } = await import('./guidance.js');
const { mount, installChanges } = await import('./changes.js');
const { unstage } = await import('./plan-view.js');
const { navigate, startDesk, view } = await import('./routes.js');

const candidate = { subject: 'pattern:served', kind: 'pattern', title: 'Served concern', parameter: 'basal_rate',
  action: [{ parameter: 'basal_rate', start_min: 180, end_min: 210, recommended: .54, direction: 'lower' }],
  members: [], preference: {} };
const eligible = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
const watching = { disposition: 'active_change', selected: null, candidates: [], reasons: {} };
const PLAN_READS = ['/api/plan', '/api/plan/history', '/api/pump-settings'];

// Changes binds its controls by selector; this host answers for whichever of
// them the markup it was last given actually carries. A `data-set` control and a
// `data-action` control keep separate entries, since both can say "open-plan".
const controls = {};
const control = (key, dataset) => (controls[key] ||= { dataset });
function answering(target) {
  return Object.assign(target, {
    querySelectorAll(selector) {
      if (selector === '[data-set]') {
        return [...this.innerHTML.matchAll(/data-set="([^"]+)"/g)].map(([, name]) => control(name, { set: name }));
      }
      const name = /^\[data-set="([^"]+)"\]$/.exec(selector)?.[1];
      if (!name || !this.innerHTML.includes(`data-set="${name}"`)) return [];
      return [control(name, { set: name })];
    },
    querySelector(selector) {
      const name = /^\[data-action="([^"]+)"\]$/.exec(selector)?.[1];
      return name && this.innerHTML.includes(`data-action="${name}"`) ? control(`action:${name}`, { action: name }) : null;
    },
  });
}
const host = answering({ innerHTML: '' });
const isPlan = (frame) => /class="[^"]*\bgf-plan\b/.test(frame);
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
// Mounting Changes also reads the Focus options, which re-read guidance when they
// answer; serving waits those out so the forced read below is the one that lands.
const serve = async (answer) => { guidanceAnswer = answer; await settle(); await loadGuidance({ force: true }); };
// Every arrival is a new `navigation` value, as the router hands out.
let visits = 0;
const newVisit = () => { visits += 1; return visits; };
/** Mount one arrival, let its reads answer, and return what it asked for and drew.
    Re-mounting with the same value is a re-render within the visit, which is what
    the desk does as each read lands. */
async function arrive(navigation, context) {
  reads.length = 0;
  const deps = { navigation, ...(context ? { context } : {}) };
  for (let round = 0; round < 3; round += 1) { mount(host, deps); await settle(); }
  mount(host, deps);
  return { reads: [...reads], frame: host.innerHTML };
}
/** A visit with nothing watched where the reader stages the concern and presses
    Open Plan. Returns that visit's `navigation` value. */
async function openPlanOnVisit() {
  await serve(eligible);
  unstage();
  const visit = newVisit();
  mount(host, { navigation: visit });
  controls.stage.onclick();
  mount(host, { navigation: visit });
  controls['open-plan'].onclick();
  return visit;
}
/** A browser at `/changes${search}` whose history writes are recorded, for the
    tests that navigate. */
function historyStub(search = '') {
  const addresses = [];
  return { addresses, window: { location: { pathname: '/changes', search, hash: '' },
    history: { pushState: (_state, _title, address) => addresses.push(address),
      replaceState: (_state, _title, address) => addresses.push(address) } } };
}

test('a Plan opened earlier does not take the watched record\'s seat from the dock\'s arrival', async () => {
  await serve(eligible);
  const first = newVisit();
  mount(host, { navigation: first });
  controls.stage.onclick();
  mount(host, { navigation: first });
  controls['open-plan'].onclick();

  await serve(watching);
  const watch = await arrive(newVisit(), { subject: 'watch' });
  assert.ok(watch.reads.some((url) => url.startsWith('/api/verify/trials')),
    `the watch arrival reads the watched record's follow-up; it read ${JSON.stringify(watch.reads)}`);

  const plan = await arrive(newVisit(), { subject: 'plan' });
  assert.ok(!plan.reads.some((url) => url.startsWith('/api/verify/trials')),
    `an explicit Plan arrival still opens the Plan; it read ${JSON.stringify(plan.reads)}`);
});

test('once no change is watched, the dock\'s arrival renders what an arrival with no context renders', async () => {
  await serve(eligible);
  const watch = await arrive(newVisit(), { subject: 'watch' });
  const plain = await arrive(newVisit());
  assert.ok(plain.frame.length > 0);
  assert.equal(watch.frame, plain.frame);
  assert.deepEqual(watch.reads, plain.reads);
});

test('after Open Plan, a plain arrival while a change is watched opens the watched record, not the Plan', async () => {
  await openPlanOnVisit();
  await serve(watching);
  const plain = await arrive(newVisit());
  assert.ok(plain.reads.some((url) => url.startsWith('/api/verify/trials')),
    `the arrival reads the watched record's follow-up; it read ${JSON.stringify(plain.reads)}`);
  assert.ok(!plain.reads.some((url) => PLAN_READS.includes(url.split('?')[0])),
    `the arrival reads nothing of the Plan; it read ${JSON.stringify(plain.reads)}`);
  assert.ok(!isPlan(plain.frame), 'the watched record\'s seat is not the Plan');
});

test('after Open Plan, a plain return with nothing watched shows the staged concern, not the Plan', async () => {
  await openPlanOnVisit();
  const plain = await arrive(newVisit());
  assert.ok(!isPlan(plain.frame), 'a plain return does not reopen the Plan');
  assert.match(plain.frame, /data-set="open-plan"/, 'the concern still offers Open Plan');
  assert.match(plain.frame, /Staged/, 'the concern says it is staged');
  assert.match(plain.frame, /data-set="unstage"/, 'the concern still offers Undo');
});

test('Open Plan holds for the rest of its visit: a re-render keeps the Plan', async () => {
  const visit = await openPlanOnVisit();
  const again = await arrive(visit);
  assert.ok(isPlan(again.frame), 'a re-render within the visit is still the Plan');
});

test('while a change is watched, an explicit Plan arrival still opens the Plan', async () => {
  await openPlanOnVisit();
  await serve(watching);
  const plan = await arrive(newVisit(), { subject: 'plan' });
  assert.ok(isPlan(plan.frame), 'the Plan arrival opens the Plan');
  assert.ok(!plan.reads.some((url) => url.startsWith('/api/verify/trials')),
    `the Plan arrival reads no follow-up; it read ${JSON.stringify(plan.reads)}`);
});

test('Stage in the Plan\'s own frame keeps the reader on the Plan with Save draft in hand', async () => {
  const previous = globalThis.window;
  const browser = historyStub('?subject=plan');
  globalThis.window = browser.window;
  try {
    await serve(eligible);
    unstage();
    const visit = newVisit();
    const idle = await arrive(visit, { subject: 'plan' });
    assert.ok(!isPlan(idle.frame) && idle.frame.includes('data-set="stage"'),
      'premise: with nothing staged, the Plan\'s own frame offers Stage change');
    controls.stage.onclick();
    assert.deepEqual(browser.addresses, [], 'Stage in the Plan writes no history entry: the reader stays where they are');
    assert.equal(view.focusAfterRender, '[data-set="save-draft"]', 'Save draft takes focus');
    mount(host, { navigation: visit, context: { subject: 'plan' } });
    assert.ok(isPlan(host.innerHTML), 'the same visit renders the Plan');
    assert.match(host.innerHTML, /Plan · <b>Staged<\/b>/, 'the Plan holds the staged change');
    assert.match(host.innerHTML, /data-set="save-draft"/, 'the Plan offers Save draft');
  } finally {
    view.focusAfterRender = null;
    navigate('diagnose');
    globalThis.window = previous;
  }
});

test('a watched Trial offers Open Plan while a Plan draft exists, and it opens the Plan by an explicit arrival', async () => {
  const previous = { window: globalThis.window, document: globalThis.document, style: globalThis.getComputedStyle };
  const browser = historyStub();
  globalThis.window = browser.window;
  // The Trial's figure reads the desk's colour tokens.
  globalThis.document = { documentElement: {} };
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
  trials = activeTrial;
  try {
    unstage();
    await serve({ ...watching, draft: { items: [{ type: 'basal', start_min: 180, value: .6 }], updated_at: '2026-01-02 04:00:00' } });
    const drafted = await arrive(newVisit());
    assert.match(drafted.frame, /gf-stage-trial/, 'premise: Changes shows the watched Trial');
    assert.match(drafted.frame, /data-action="history">View change record<\/button><button class="gf-btn" data-action="open-plan">Open Plan<\/button>/,
      'the Trial\'s nameplate offers Open Plan after View change record');
    controls['action:open-plan'].onclick();
    assert.deepEqual(browser.addresses, ['/changes?subject=plan'], 'Open Plan makes the explicit Plan arrival');

    await serve(watching);
    const bare = await arrive(newVisit());
    assert.match(bare.frame, /gf-stage-trial/, 'premise: Changes shows the watched Trial');
    assert.doesNotMatch(bare.frame, /data-action="open-plan"/, 'with no Plan draft, the nameplate offers no Open Plan');
  } finally {
    trials = noWatch;
    navigate('diagnose');
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.getComputedStyle = previous.style;
  }
});

// Last: it seats the router on a desk of its own, and later renders would land there.
test('on the desk, navigate(\'changes\') after Open Plan lands on the watched record, not the Plan', async () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const location = { pathname: '/', search: '?to=changes', hash: '' };
  const browser = { location,
    history: { pushState: (_state, _title, address) => { [location.pathname, location.search = ''] = address.split(/(?=\?)/); } },
    matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {} };
  const seat = answering({ innerHTML: '', dataset: {} });
  globalThis.window = browser;
  globalThis.document = { activeElement: { tagName: 'BODY' }, querySelectorAll: () => [] };
  try {
    await serve(eligible);
    unstage();
    installChanges(); startDesk(seat, { browser });
    controls.stage.onclick();
    controls['open-plan'].onclick();
    await settle(); await settle();
    await serve(watching);
    reads.length = 0;
    // The topbar's Changes, Diagnose's Return to Trial and the landing after a
    // Focus pin all make exactly this arrival.
    navigate('changes');
    await settle(); await settle();
    assert.ok(reads.some((url) => url.startsWith('/api/verify/trials')),
      `the arrival reads the watched record's follow-up; it read ${JSON.stringify(reads)}`);
    assert.ok(!reads.some((url) => PLAN_READS.includes(url.split('?')[0])),
      `the arrival reads nothing of the Plan; it read ${JSON.stringify(reads)}`);
    assert.ok(!isPlan(seat.innerHTML), 'the desk does not show the Plan');
  } finally {
    navigate('diagnose');
    await settle(); await settle();
    globalThis.window = previous.window; globalThis.document = previous.document;
  }
});
