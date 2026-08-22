/* A high-only cause must offer no event-comparison alignment view (#63).
 *
 * The comparison lens has a Meals view and a Lows view and no Highs view, so
 * The shared Diagnose route consumer owns the lever-keyed alignment allowlist,
 * because it must validate the same family the workstation publishes. A cause
 * is excluded by its lever being absent. `Missed / unannounced meal` has sat
 * outside that map since it shipped, and #63's `Meal bolus fell short` joins it.
 *
 * So the rule is pinned through that public lookup: no lever whose Exposure is
 * HIGHS may resolve. The Python side
 * (`tests/test_meal_bolus_short_attribution.py`) pins which levers those are, so
 * adding a third high-anchored lever fails there and lands here.
 *
 * The lookup is a real shared interface, not a test export: both runtime
 * membership resolution and the workstation read it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseAlignmentCoordinates } from './workstation-route-consumers.js';

// levers._META — every lever whose Exposure is HIGHS, by title.
const HIGH_EXPOSURE_LEVERS = ['missed_meal', 'meal_bolus_short'];

test('#63 · no high-anchored cause keys the alignment allowlist', () => {
  for (const lever of HIGH_EXPOSURE_LEVERS) {
    assert.equal(diagnoseAlignmentCoordinates(lever), null,
      `${lever} is a HIGHS cause and the lens has no Highs view`);
  }
});

test('#63 · the allowlist still offers the meals and lows views it owns', () => {
  // A guard that passes because the map emptied out would prove nothing.
  assert.deepEqual(diagnoseAlignmentCoordinates('carb_undercount'), {
    view: 'meals', factor: 'carb_undercount',
  });
  assert.deepEqual(diagnoseAlignmentCoordinates('over_treated_low'), {
    view: 'lows', factor: 'over_treated_low',
  });
});
