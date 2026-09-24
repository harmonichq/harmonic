/* The watched-change dock's four mutually exclusive states (lock terms 46–49). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, PLAN_DETAIL, IDLE_DETAIL, IDLE_TITLE, watchDockView } from './watched-change-dock.js';
import { maturitySection } from './follow-up.js';

const TRIAL = {
  kind: 'trial', parameter: 'basal_rate', slot: '06:30', changed_at: '2026-08-11 07:00:00',
  before: 0.85, after: 1.05, target_metrics: ['tbr'],
  maturing: { is_maturing: true, days_elapsed: 6, days_required: 14 }, deliberate: true,
};
const FOCUS = {
  kind: 'focus', lever: 'late_bolus', title: 'Pre-bolus more before dinner',
  pinned_at: '2026-08-04 09:00:00', status: 'active', target_metric: 'arc',
};
const STAGED = { count: 2, title: 'Basal 06:30 to 08:00 · raise', values: '0.85 → 1.05 U/hr' };
/** The guidance read's served pending Plan, verdict and all (ADR 431). */
const planRecord = (verdict, type = 'basal') => ({
  id: '2026-09-20 21:14:00', applied_at: '2026-09-20 21:14:00',
  items: [{ type, start_min: 390, value: 1.05 }],
  verdict: { confirmed_at: null, on_pump: false, ...verdict },
});
const PENDING = planRecord({ state: 'pending' });

const flat = (view) => view.detail.map((p) => p.strong ?? p.text).join('');

test('term 47 · exactly five kind labels, byte for byte', () => {
  assert.deepEqual(KIND, {
    trial: 'Trial · watching',
    focus: 'Focus · watching',
    recorded: 'Plan · awaiting pump',
    plan: 'Plan · staged',
    idle: 'Nothing being watched',
  });
});

test('term 47 · a Trial takes the slot, and takes it from a staged Plan too', () => {
  const view = watchDockView({ watched: TRIAL, staged: STAGED });
  assert.equal(view.state, 'trial');
  assert.equal(view.kind, KIND.trial);
  assert.equal(view.title, 'Basal 06:30');
  assert.equal(flat(view), '0.85 → 1.05 U/hr · Maturing — 6 of 14 days since 08-11');
  assert.deepEqual(view.route, { label: 'Open Changes', to: 'changes' });
});

test('term 47 · a matured Trial keeps the slot and says it is readable', () => {
  const view = watchDockView({
    watched: { ...TRIAL, maturing: { is_maturing: false, days_elapsed: 14, days_required: 14 } },
  });
  assert.equal(flat(view), '0.85 → 1.05 U/hr · Ready to judge — 14 days since 08-11 · 14 required');
});

test('#447 · a ready Trial prints the served count, in Changes\' words', () => {
  // A completed Trial's bounded 14-day period spans 15 dates, so the server counts
  // 15 against 14 required. The dock prints that count; only Changes' progress bar
  // clamps, and "15 of 14" must not return (S46).
  const view = watchDockView({
    watched: { ...TRIAL, maturing: { is_maturing: false, days_elapsed: 15, days_required: 14 } },
  });
  assert.equal(flat(view), '0.85 → 1.05 U/hr · Ready to judge — 15 days since 08-11 · 14 required');
  assert.deepEqual(view.detail.filter((part) => part.strong != null), [{ strong: '15' }]);
});

test('#447 · the dock and Changes print one Trial day count', () => {
  // One served Trial, read through both printers: the dock's served
  // `maturing.is_maturing` and Changes' served `state` are one backend fact.
  const served = [
    { is_maturing: true, state: 'maturing', days_elapsed: 6, days_required: 14 },
    { is_maturing: false, state: 'complete', days_elapsed: 14, days_required: 14 },
    { is_maturing: false, state: 'complete', days_elapsed: 15, days_required: 14 },
  ];
  const pastRequirement = (text) => [...text.matchAll(/(\d+) of (\d+)/g)]
    .some(([, n, r]) => Number(n) > Number(r));
  for (const { is_maturing, state, days_elapsed, days_required } of served) {
    const pair = `${days_elapsed}/${days_required}`;
    const dock = watchDockView({ watched: { ...TRIAL, maturing: { is_maturing, days_elapsed, days_required } } });
    const [, figure, small] = maturitySection({ state, maturing: { days_elapsed, days_required, gap_count: 0 } })
      .match(/<div class="gf-figure">(.*?)<small>(.*?)<\/small>/);
    const dockCount = dock.detail.find((part) => part.strong != null).strong;
    assert.equal(dockCount, figure.replace(/ days$/, ''), `${pair}: the dock and Changes print one count`);
    assert.equal(flat(dock).match(/(\d+) required/)?.[1], small.match(/(\d+) required/)?.[1],
      `${pair}: the dock and Changes print one requirement`);
    assert.equal(pastRequirement(flat(dock)) || pastRequirement(figure), false, `${pair}: no count reads past its requirement`);
  }
});

test('term 47 · a Focus takes the slot when no Trial does', () => {
  const view = watchDockView({ watched: FOCUS, staged: STAGED });
  assert.equal(view.state, 'focus');
  assert.equal(view.title, 'Pre-bolus more before dinner');
  assert.equal(flat(view), 'Pinned 08-04 · adherence and outcome are read in Changes');
  assert.deepEqual(view.route, { label: 'Open Changes', to: 'changes' });
});

test('term 47 · with nothing watched, a staged Plan fills the slot', () => {
  const view = watchDockView({ watched: null, staged: STAGED });
  assert.equal(view.state, 'plan');
  assert.equal(view.kind, 'Plan · staged');
  assert.equal(view.title, STAGED.title);
  assert.equal(flat(view), `${STAGED.values} · ${PLAN_DETAIL}`);
  assert.equal(PLAN_DETAIL, 'Staged, not applied: nothing has changed on the pump');
  // A staged run whose half hours disagree serves no values; the sentence stands alone.
  assert.equal(flat(watchDockView({ staged: { ...STAGED, values: '' } })), PLAN_DETAIL);
  assert.deepEqual(view.route, { label: 'Open Changes', to: 'plan' });
});

test('term 47 · idle is a state of its own, not an absent one', () => {
  for (const staged of [null, { count: 0, title: '' }]) {
    const view = watchDockView({ watched: null, staged });
    assert.equal(view.state, 'idle');
    assert.equal(view.title, IDLE_TITLE);
    assert.equal(flat(view), IDLE_DETAIL);
    assert.equal(view.route, null, 'idle routes nowhere — there is nothing to open');
  }
  assert.equal(watchDockView().state, 'idle');
});

test('term 47 · the five states are mutually exclusive — one object, never two', () => {
  const states = [
    watchDockView({ watched: TRIAL, pendingPlan: PENDING, staged: STAGED }),
    watchDockView({ watched: FOCUS, pendingPlan: PENDING, staged: STAGED }),
    watchDockView({ watched: null, pendingPlan: PENDING, staged: STAGED }),
    watchDockView({ watched: null, staged: STAGED }),
    watchDockView({}),
  ].map((v) => v.state);
  assert.deepEqual(states, ['trial', 'focus', 'recorded', 'plan', 'idle']);
});

test('#431 · a pending Plan with nothing watched does not read idle', () => {
  const view = watchDockView({ watched: null, pendingPlan: PENDING, staged: null });
  assert.equal(view.state, 'recorded');
  assert.equal(view.kind, 'Plan · awaiting pump');
  assert.equal(view.title, 'Basal · recorded 09-20');
  assert.equal(flat(view), 'Recorded — waiting for a pump read that matches');
  assert.deepEqual(view.route, { label: 'Open Changes', to: 'plan' });
});

test('#431 · the Plan detail says what the served verdict says', () => {
  assert.equal(flat(watchDockView({ pendingPlan: planRecord({ state: 'mismatch' }) })),
    "The latest pump read doesn't match this Plan");
  // Served pending while the latest read already holds it: the same words Changes uses.
  assert.equal(flat(watchDockView({ pendingPlan: planRecord({ state: 'pending', on_pump: true }) })),
    'On the pump — awaiting confirmation');
  for (const verdict of [{ state: 'pending' }, { state: 'mismatch' }, { state: 'pending', on_pump: true }]) {
    assert.deepEqual(watchDockView({ pendingPlan: planRecord(verdict) }).route, { label: 'Open Changes', to: 'plan' },
      'every Plan state opens Changes on the Plan, never the watched-change address');
  }
});

test('#431 · the Plan names its setting in the wearer\'s words', () => {
  assert.deepEqual([['basal', 'Basal'], ['isf', 'Correction factor'], ['ic', 'Carb ratio'], ['target', 'Target']]
    .map(([type]) => watchDockView({ pendingPlan: planRecord({ state: 'pending' }, type) }).title),
  ['Basal · recorded 09-20', 'Correction factor · recorded 09-20', 'Carb ratio · recorded 09-20', 'Target · recorded 09-20']);
});

test('#431 · a watched Trial or Focus outranks a pending Plan', () => {
  assert.equal(watchDockView({ watched: TRIAL, pendingPlan: PENDING }).state, 'trial');
  assert.equal(watchDockView({ watched: FOCUS, pendingPlan: PENDING }).state, 'focus');
});

test('#431 · a pending Plan outranks a draft staged on this surface', () => {
  const view = watchDockView({ watched: null, pendingPlan: PENDING, staged: STAGED });
  assert.equal(view.state, 'recorded');
  assert.equal(view.title, 'Basal · recorded 09-20');
});

test('no dock state names Verify, the destination the desk no longer has', () => {
  const views = [
    watchDockView({ watched: TRIAL, staged: STAGED }),
    watchDockView({ watched: { ...TRIAL, maturing: { is_maturing: false, days_elapsed: 14, days_required: 14 } } }),
    watchDockView({ watched: FOCUS, staged: STAGED }),
    watchDockView({ watched: null, staged: STAGED }),
    watchDockView({}),
  ];
  assert.deepEqual(views.map((v) => v.state), ['trial', 'trial', 'focus', 'plan', 'idle']);
  for (const view of views) {
    for (const text of [view.kind, view.title, flat(view), view.route?.label ?? '']) {
      assert.doesNotMatch(text, /Verify/, `${view.state}: ${text}`);
    }
  }
});

/* #460 — the guidance read's served Plan draft (ADR 460 points 2 and 3). */
const basalRow = (start_min, extra = {}) => ({ type: 'basal', start_min, label: '', current: 0.9, value: 0.8, ...extra });
const DRAFT = { items: [basalRow(180), basalRow(210)], updated_at: '2026-09-20 21:14:00' };
const NO_MARKS = { count: 0, title: '', values: '' };

test('#460 · a served draft with no marks on this surface reads staged, named from its own items', () => {
  const view = watchDockView({ watched: null, pendingPlan: null, staged: NO_MARKS, draft: DRAFT, saving: false });
  assert.equal(view.state, 'plan');
  assert.equal(view.kind, 'Plan · staged');
  assert.equal(view.title, 'Basal 03:00 to 04:00');
  assert.deepEqual(view.route, { label: 'Open Changes', to: 'plan' });
  const one = watchDockView({ staged: NO_MARKS, draft: { items: [basalRow(180)] }, saving: false });
  assert.equal(one.title, 'Basal 03:00');
  const carbRatio = watchDockView({ staged: NO_MARKS, saving: false, draft: { items: [360, 480].map((start_min) => ({
    type: 'ic', start_min, current: 10, value: 9,
    ic_block_provenance: { block_start_min: 360, block_end_min: 660, block_member_start_mins: [360, 480] } })) } });
  assert.equal(carbRatio.title, 'Carb ratio 06:00–11:00');
  const isf = watchDockView({ staged: NO_MARKS, saving: false, draft: { items: [{ type: 'isf', start_min: 0, value: 45 }] } });
  assert.equal(isf.title, 'Correction factor');
});

test('#460 · a draft whose slot the analysis no longer admits still reads staged and names its setting', () => {
  // A row written through the Plan route: no mark on this surface can name it.
  const view = watchDockView({ staged: NO_MARKS, saving: false,
    draft: { items: [{ type: 'basal', start_min: 1410, key: 47, label: '23:30', value: 0.7 }] } });
  assert.equal(view.state, 'plan');
  assert.equal(view.kind, KIND.plan);
  assert.match(view.title, /^Basal\b/);
});

test('#460 · a draft prints values only where every item carries one pair, and never a direction', () => {
  const agreed = watchDockView({ staged: NO_MARKS, saving: false, draft: DRAFT });
  assert.equal(flat(agreed), `0.90 → 0.80 U/hr · ${PLAN_DETAIL}`);
  const disagreeing = { items: [basalRow(180), basalRow(210, { current: 1.0 })] };
  const unrecorded = { items: [basalRow(180, { current: undefined }), basalRow(210, { current: undefined })] };
  for (const draft of [disagreeing, unrecorded]) {
    assert.equal(flat(watchDockView({ staged: NO_MARKS, saving: false, draft })), PLAN_DETAIL);
  }
  for (const draft of [DRAFT, disagreeing, unrecorded]) {
    const { title } = watchDockView({ staged: NO_MARKS, saving: false, draft });
    assert.doesNotMatch(title, /·|lower|raise|higher|stronger|weaker|tighter|looser/, title);
  }
});

test('#460 guard · while this surface\'s stage save is in flight, the served draft is not read', () => {
  const view = watchDockView({ staged: NO_MARKS, draft: DRAFT, saving: true });
  assert.equal(view.state, 'idle');
  assert.equal(view.kind, KIND.idle);
});

test('#460 guard · the surface\'s own marks keep today\'s title, direction and values over the draft', () => {
  for (const saving of [false, true]) {
    const view = watchDockView({ staged: STAGED, draft: DRAFT, saving });
    assert.equal(view.state, 'plan');
    assert.equal(view.title, STAGED.title);
    assert.equal(flat(view), `${STAGED.values} · ${PLAN_DETAIL}`);
  }
});

test('#460 guard · a watched Trial, a watched Focus and a recorded Plan each outrank a served draft', () => {
  assert.equal(watchDockView({ watched: TRIAL, staged: NO_MARKS, draft: DRAFT, saving: false }).state, 'trial');
  assert.equal(watchDockView({ watched: FOCUS, staged: NO_MARKS, draft: DRAFT, saving: false }).state, 'focus');
  assert.equal(watchDockView({ pendingPlan: PENDING, staged: NO_MARKS, draft: DRAFT, saving: false }).state, 'recorded');
});

test('a whole-profile Trial names itself without inventing a number', () => {
  const view = watchDockView({
    watched: { ...TRIAL, parameter: 'profile', slot: null, before: null, after: null },
  });
  assert.equal(view.title, 'Profile');
  assert.equal(flat(view), 'Maturing — 6 of 14 days since 08-11');
});

test('#451 · a Trial is named by its setting, and its values lead the wrapping line', () => {
  const cases = [
    [{ parameter: 'isf', before: 30, after: 32 }, 'Correction factor', '1 U : 30.0 mg/dL → 1 U : 32.0 mg/dL'],
    [{ parameter: 'carb_ratio', before: 5, after: 4.8 }, 'Carb ratio', '5.0 → 4.8 g/U'],
  ];
  for (const [change, title, values] of cases) {
    const view = watchDockView({ watched: { ...TRIAL, slot: null, ...change } });
    assert.equal(view.title, title, change.parameter);
    assert.equal(flat(view), `${values} · Maturing — 6 of 14 days since 08-11`, change.parameter);
    assert.doesNotMatch(`${view.title} ${flat(view)}`, /ISF|I:C|mg\/dL\/U/, change.parameter);
  }
});
