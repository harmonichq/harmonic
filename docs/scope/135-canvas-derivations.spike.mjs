// Spike for #135 — the two derivations the evidence-canvas work order depends on.
// Prose in the order states intent; these are the literals the build ports.
// Run: node docs/scope/135-canvas-derivations.spike.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

/* ---- 1. Arrangement is derived from pin count, never chosen ---------------
   0 pins keeps the focal chart with slot charts beneath; each further pin
   derives the next arrangement, and the cap of four is refused at the control
   rather than satisfied by evicting the oldest pin. */
export const PIN_CAP = 4;

export function arrangementFor(pinCount) {
  if (!Number.isInteger(pinCount) || pinCount < 0) {
    throw new RangeError(`pin count must be a non-negative integer, got ${pinCount}`);
  }
  if (pinCount > PIN_CAP) {
    throw new RangeError(`pin count exceeds the cap of ${PIN_CAP}`);
  }
  return ['focal', 'split', 'pair', 'onetwo', 'quad'][pinCount];
}

/* ---- 2. One glucose y-range, shared across the arrangement ----------------
   #98 measured the shipped axis spanning 40-300 while every cohort sat 100-160.
   The range is fitted to the data, snapped outward to 20 mg/dL steps, and always
   contains the 60-200 envelope. Every glucose-valued chart in the current
   arrangement is drawn on the one returned range, so two charts sitting side by
   side in the quad can never read as comparable on different scales. */
export const GLUCOSE_STEP = 20;
export const GLUCOSE_ENVELOPE = [60, 200];

export function glucoseRange(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  const [floorFloor, ceilCeil] = GLUCOSE_ENVELOPE;
  if (finite.length === 0) return [floorFloor, ceilCeil];
  const low = Math.min(floorFloor, Math.floor(Math.min(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  const high = Math.max(ceilCeil, Math.ceil(Math.max(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  return [low, high];
}

test('arrangement is a pure function of pin count', () => {
  assert.equal(arrangementFor(0), 'focal');
  assert.equal(arrangementFor(1), 'split');
  assert.equal(arrangementFor(2), 'pair');
  assert.equal(arrangementFor(3), 'onetwo');   // #135 Q8: 1 + 2, not a quad with a hole
  assert.equal(arrangementFor(4), 'quad');
  assert.throws(() => arrangementFor(5), RangeError);
});

test('the glucose range always contains the 60-200 envelope', () => {
  assert.deepEqual(glucoseRange([]), [60, 200]);
  assert.deepEqual(glucoseRange([100, 160]), [60, 200]);   // #98's cohorts
  assert.deepEqual(glucoseRange([120]), [60, 200]);
});

test('the range expands outward in 20 mg/dL steps to cover the data', () => {
  assert.deepEqual(glucoseRange([55, 210]), [40, 220]);
  assert.deepEqual(glucoseRange([41, 201]), [40, 220]);
  assert.deepEqual(glucoseRange([40, 300]), [40, 300]);
  assert.deepEqual(glucoseRange([38, 301]), [20, 320]);
});

test('non-finite readings never widen the range', () => {
  assert.deepEqual(glucoseRange([NaN, 100, Infinity, 160]), [60, 200]);
  assert.deepEqual(glucoseRange([NaN, Infinity]), [60, 200]);
});
