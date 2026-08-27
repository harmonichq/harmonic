/* The dock's two states, resolved from one measured number (ADR 215
   amendment). These assert the RESOLUTION, not a stored flag: the field decides
   whether a docked strip sits below the spotlight or floats over it, and it
   decides nothing else — which is what a test over remembered state cannot
   catch. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCK_FLOOR, MINI_FLOOR, SPOTLIGHT_FLOOR, dismissRaisedDock, dockView,
} from './diagnose-canvas-state.js';

test('the dock floor is the room a spotlight and a mini need to sit one above the other', () => {
  assert.equal(DOCK_FLOOR, SPOTLIGHT_FLOOR + MINI_FLOOR + 8);
});

/* THE DOCK IS A TOGGLE AT EVERY HEIGHT. The field used to overrule the want in
   both directions — a short field diverted docked to mounted, a tall one
   refused to hide the minis at all — and both overrides went with mounted. */
test('the want is honoured at every height, tall and short alike', () => {
  for (const height of [DOCK_FLOOR, DOCK_FLOOR - 1, MINI_FLOOR, 150]) {
    for (const wanted of ['docked', 'hidden']) {
      assert.equal(dockView(height, wanted).state, wanted,
        `a ${height}px field honours ${wanted}`);
    }
  }
});

test('the lip offers the state the reader is not in, and the explorer beside it', () => {
  for (const height of [DOCK_FLOOR, DOCK_FLOOR - 1, 150]) {
    assert.deepEqual(dockView(height, 'docked').acts, ['hide', 'explore']);
    assert.deepEqual(dockView(height, 'hidden').acts, ['up', 'explore'],
      'the hidden lip still reaches every chart without bringing the strip back');
  }
});

/* A RAISED DOCK FLOATS; IT NEVER SQUEEZES. Splitting the field below the dock
   floor gave the spotlight 0px and destroyed the only way out. Floating holds
   at any height, which is why no second floor is needed to divert to. */
test('a dock raised in a short field is marked raised, and never is in a tall one', () => {
  assert.equal(dockView(DOCK_FLOOR - 1, 'docked').raised, true);
  assert.equal(dockView(150, 'docked').raised, true);
  assert.equal(dockView(DOCK_FLOOR, 'docked').raised, false);
  assert.equal(dockView(DOCK_FLOOR - 1, 'hidden').raised, false,
    'a hidden dock has nothing to float');
});

test('moving attention to a drill or the spotlight dismisses only a raised dock', () => {
  assert.equal(dismissRaisedDock('docked', DOCK_FLOOR - 1), 'hidden');
  assert.equal(dismissRaisedDock('docked', DOCK_FLOOR), 'docked');
  assert.equal(dismissRaisedDock('hidden', 150), 'hidden');
});

test('an unknown want is refused rather than silently resolved', () => {
  assert.throws(() => dockView(600, 'floating'), RangeError);
  assert.throws(() => dockView(600, 'mounted'), RangeError);
});
