/* A high-only cause must offer no event-comparison alignment view (#63).
 *
 * The comparison lens has a Meals view and a Lows view and no Highs view, so
 * `ALIGN_FACTOR_BY_CAUSE` in `diagnose-workstation.js` is a title-keyed ALLOWLIST and
 * a cause is excluded by being absent from it. Absence is a silent contract: nothing
 * fails when a new cause is added, the app just tries to open a case file for an
 * Exposure that has no view. `Missed / unannounced meal` has sat outside that map
 * since it shipped, and #63's `Meal bolus fell short` joins it.
 *
 * So the rule is pinned STRUCTURALLY rather than one title at a time: no lever whose
 * Exposure is HIGHS may key that map. The Python side
 * (`tests/test_meal_bolus_short_attribution.py`) pins which levers those are, so
 * adding a third high-anchored lever fails there and lands here.
 *
 * Read as source text on purpose — `alignCoordinatesFor` is module-private and
 * exporting it to test it would widen the surface to make the test easy, which is
 * how the thing under test stops being the thing that ships.
 * (`diagnose-evidence-row-box.test.js` reads the same file the same way.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');

/** The `ALIGN_FACTOR_BY_CAUSE = { ... }` literal, as written. */
function allowlistBlock() {
  const start = source.indexOf('const ALIGN_FACTOR_BY_CAUSE = {');
  assert.notEqual(start, -1, 'diagnose-workstation.js no longer declares ALIGN_FACTOR_BY_CAUSE');
  const end = source.indexOf('};', start);
  assert.notEqual(end, -1, 'ALIGN_FACTOR_BY_CAUSE literal is unterminated');
  return source.slice(start, end);
}

// levers._META — every lever whose Exposure is HIGHS, by title.
const HIGH_EXPOSURE_TITLES = ['Missed / unannounced meal', 'Meal bolus fell short'];

test('#63 · no high-anchored cause keys the alignment allowlist', () => {
  const block = allowlistBlock();
  for (const title of HIGH_EXPOSURE_TITLES) {
    assert.ok(!block.includes(title),
      `"${title}" is a HIGHS cause and the lens has no Highs view`);
  }
});

test('#63 · the allowlist still offers the meals and lows views it owns', () => {
  // A guard that passes because the map emptied out would prove nothing.
  const block = allowlistBlock();
  for (const title of ['Carb undercount', 'Over-treated low']) {
    assert.ok(block.includes(title), `"${title}" lost its alignment view`);
  }
  assert.ok(!source.includes('export const alignCoordinatesFor'),
    'alignCoordinatesFor must stay module-private');
});
