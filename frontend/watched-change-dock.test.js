/* The watched-change dock's four mutually exclusive states (lock terms 46–49). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { KIND, PLAN_DETAIL, IDLE_DETAIL, IDLE_TITLE, watchDockView } from './watched-change-dock.js';

const TRIAL = {
  kind: 'trial', parameter: 'basal_rate', slot: '06:30', changed_at: '2026-08-11 07:00:00',
  before: 0.85, after: 1.05, target_metrics: ['tbr'],
  maturing: { is_maturing: true, days_elapsed: 6, days_required: 14 }, deliberate: true,
};
const FOCUS = {
  kind: 'focus', lever: 'late_bolus', title: 'Pre-bolus more before dinner',
  pinned_at: '2026-08-04 09:00:00', status: 'active', target_metric: 'arc',
};
const STAGED = { count: 2, title: 'Basal 06:30 to 08:00 · 0.85 → 1.05 U/hr' };
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
  assert.equal(view.title, 'Basal 06:30 · 0.85 → 1.05 U/hr');
  assert.equal(flat(view), 'Maturing — 6 of 14 days since 08-11');
  assert.deepEqual(view.route, { label: 'Open Verify', to: 'verify' });
});

test('term 47 · a matured Trial keeps the slot and says it is readable', () => {
  const view = watchDockView({
    watched: { ...TRIAL, maturing: { is_maturing: false, days_elapsed: 14, days_required: 14 } },
  });
  assert.equal(flat(view), 'Ready to judge — 14 of 14 days since 08-11');
});

test('term 47 · the day count clamps to the requirement, matching Verify', () => {
  // A completed Trial's bounded 14-day period spans 15 dates, so the payload's
  // true count runs to 15; Verify renders "day 14 of 14" and the dock must read
  // the same, not contradict it one click away.
  const view = watchDockView({
    watched: { ...TRIAL, maturing: { is_maturing: false, days_elapsed: 15, days_required: 14 } },
  });
  assert.equal(flat(view), 'Ready to judge — 14 of 14 days since 08-11');
});

test('term 47 · a Focus takes the slot when no Trial does', () => {
  const view = watchDockView({ watched: FOCUS, staged: STAGED });
  assert.equal(view.state, 'focus');
  assert.equal(view.title, 'Pre-bolus more before dinner');
  assert.match(flat(view), /^Pinned 08-04 · /);
  assert.equal(view.route.to, 'verify');
});

test('term 47 · with nothing watched, a staged Plan fills the slot', () => {
  const view = watchDockView({ watched: null, staged: STAGED });
  assert.equal(view.state, 'plan');
  assert.equal(view.kind, 'Plan · staged');
  assert.equal(view.title, STAGED.title);
  assert.equal(flat(view), PLAN_DETAIL);
  assert.equal(flat(view), 'Staged, not applied — nothing has changed on the pump');
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

test('a whole-profile Trial names itself without inventing a number', () => {
  const view = watchDockView({
    watched: { ...TRIAL, parameter: 'profile', slot: null, before: null, after: null },
  });
  assert.equal(view.title, 'Profile');
});
