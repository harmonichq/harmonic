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

const flat = (view) => view.detail.map((p) => p.strong ?? p.text).join('');

test('term 47 · exactly four kind labels, byte for byte', () => {
  assert.deepEqual(KIND, {
    trial: 'Trial · watching',
    focus: 'Focus · watching',
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
  assert.deepEqual(view.route, { label: 'Open Plan', to: 'plan' });
});

test('term 47 · idle is the fourth state, not an absent one', () => {
  for (const staged of [null, { count: 0, title: '' }]) {
    const view = watchDockView({ watched: null, staged });
    assert.equal(view.state, 'idle');
    assert.equal(view.title, IDLE_TITLE);
    assert.equal(flat(view), IDLE_DETAIL);
    assert.equal(view.route, null, 'idle routes nowhere — there is nothing to open');
  }
  assert.equal(watchDockView().state, 'idle');
});

test('term 47 · the four states are mutually exclusive — one object, never two', () => {
  const states = [
    watchDockView({ watched: TRIAL, staged: STAGED }),
    watchDockView({ watched: FOCUS, staged: STAGED }),
    watchDockView({ watched: null, staged: STAGED }),
    watchDockView({}),
  ].map((v) => v.state);
  assert.deepEqual(states, ['trial', 'focus', 'plan', 'idle']);
});

test('a whole-profile Trial names itself without inventing a number', () => {
  const view = watchDockView({
    watched: { ...TRIAL, parameter: 'profile', slot: null, before: null, after: null },
  });
  assert.equal(view.title, 'Profile');
});
