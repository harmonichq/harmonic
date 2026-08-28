/* The dock's two states, resolved from one measured number (ADR 215
   amendment). These assert the RESOLUTION, not a stored flag: the field decides
   whether a docked strip sits below the spotlight or floats over it, and it
   decides nothing else — which is what a test over remembered state cannot
   catch. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DOCK_FLOOR, MINI_FLOOR, SPOTLIGHT_FLOOR, dismissRaisedDock, dockView,
  isDrilledSpotlight, popInspector, seatableChartIds,
} from './diagnose-canvas-state.js';
import { createCanvasLayout, placeSeats } from './diagnose-canvas-layout.js';

test('ranked Findings self-seat in server order while Watching charts require a pin', () => {
  const findings = { rows: [
    { id: 'finding:carb_undercount', register: 'finding' },
    { id: 'basal:0-30', register: 'held' },
    { id: 'isf', register: 'assert' },
    { id: 'ic:720', register: 'blind' },
  ] };
  const descriptors = [
    { chartId: 'ic:720', kind: 'ic' },
    { chartId: 'isf', kind: 'isf' },
    { chartId: 'basal:0-30', kind: 'basal' },
    { chartId: 'finding:carb_undercount', kind: 'event-comparison' },
  ];

  assert.deepEqual(seatableChartIds(findings, descriptors), [
    'finding:carb_undercount', 'isf',
  ], 'descriptor kind and order cannot put Watching ahead of ranked Findings');
  assert.deepEqual(seatableChartIds(findings, descriptors, ['ic:720']), [
    'finding:carb_undercount', 'isf', 'ic:720',
  ], 'an explicit live Watching pin follows every ranked Finding without reordering them');
});

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

test('a drill marks its spotlight but not the dock echo of the same chart', () => {
  assert.equal(isDrilledSpotlight({ seat: 'focal' }, 'isf', 'isf'), true);
  assert.equal(isDrilledSpotlight({ seat: 'mini' }, 'isf', 'isf'), false,
    'the dock may echo the chart without duplicating its drilled mark');
  assert.equal(isDrilledSpotlight({ seat: 'focal' }, 'basal', 'isf'), false);
  assert.equal(isDrilledSpotlight({ seat: 'focal' }, 'isf', null), false);
});

/* RETURNING FROM A DEEPER DRILL MUST RE-SEAT THE FOCAL CHART, NOT JUST NAME IT.
   `popInspector` only resolves which chart the returned frame owns; the mark
   survives only if that chart is ALSO given the focal seat before `placeSeats`
   runs. A caller that updates the drilled id but leaves a stale focal id in
   place (the Backspace regression this pins) strands the mark on nothing:
   the stale focal chart doesn't match the new drilled id, and the newly
   drilled chart never reaches the focal seat to be checked at all. */
test('a returned frame keeps its drill mark only when its chart retakes the focal seat', () => {
  const descriptors = [
    { chartId: 'finding:over_treated_low', kind: 'event-comparison' },
    { chartId: 'basal:0-30', kind: 'basal', coordinates: { slot: 0 } },
  ];
  const stack = [
    { k: 'factors' },
    { k: 'factor', rowId: 'finding:over_treated_low' },
    { k: 'slot', cell: { i: 0 } },
  ];
  const popped = popInspector(stack, 1, descriptors);
  assert.equal(popped.drilledChartId, 'finding:over_treated_low',
    'the returned factor frame owns the finding chart, not the slot chart left behind');

  const candidateIds = ['finding:over_treated_low'];

  const staleLayout = createCanvasLayout({ focalId: 'basal:0-30', pins: [] });
  const stalePlaced = placeSeats([...new Set([...candidateIds, staleLayout.focalId])], staleLayout);
  const staleMarks = stalePlaced.filter((seat) => isDrilledSpotlight(
    seat, seat.chartId, popped.drilledChartId,
  ));
  assert.deepEqual(staleMarks, [],
    'a focal id left over from the deeper drill strands the mark on nothing');

  const refocusedLayout = createCanvasLayout({ focalId: popped.drilledChartId, pins: [] });
  const refocusedPlaced = placeSeats(
    [...new Set([...candidateIds, refocusedLayout.focalId])], refocusedLayout,
  );
  const refocusedMarks = refocusedPlaced.filter((seat) => isDrilledSpotlight(
    seat, seat.chartId, popped.drilledChartId,
  ));
  assert.deepEqual(refocusedMarks.map((seat) => seat.chartId), ['finding:over_treated_low'],
    're-seating the returned chart as focal restores exactly its own mark');
});

/* CLICKING A CHART'S OWN REGISTRY TILE PUTS IT ON STAGE, MARKED THERE. Operator
   ruling, 2026-08-27: "the only chart that needs to be displaying any kind of
   drill down ... is the spotlight." A reader who clicks a chart already sitting
   in the dock strip promotes it to focal — `dockOrder` then echoes that same
   chart back into the strip as the current frame's selected cell — but the
   mark belongs on the stage instance alone, never the echo the click came from. */
test('a chart seated directly from its own registry tile is marked on the stage, not the echo it left behind', () => {
  const candidateIds = ['finding:over_treated_low', 'isf', 'basal:0-30'];
  const target = 'finding:over_treated_low';

  const layout = createCanvasLayout({ focalId: target, pins: [] });
  const placed = placeSeats([...new Set([...candidateIds, layout.focalId])], layout);
  const marks = placed.filter((seat) => isDrilledSpotlight(seat, seat.chartId, target));
  assert.deepEqual(marks.map((seat) => ({ chartId: seat.chartId, seat: seat.seat })),
    [{ chartId: target, seat: 'focal' }],
    'the seated chart is marked once, on the stage, whatever registry cell it was clicked from');
});

test('an unknown want is refused rather than silently resolved', () => {
  assert.throws(() => dockView(600, 'floating'), RangeError);
  assert.throws(() => dockView(600, 'mounted'), RangeError);
});
