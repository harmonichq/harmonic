/* The Event comparison stamp tripwire is scoped per cohort, not per request (#5).
 *
 * The projection derives each cohort's support fresh and uses the capture's
 * frozen `visual_support` stamp only as a fail-loud cross-check, with a
 * staleness exemption for the one replay story that rewrites occurrences.
 * That exemption must apply only to a cohort whose OWN stamped ids include
 * one no longer live: dropping an occurrence from one cohort must not switch
 * off the tripwire for the untouched cohorts in the same request.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const capturePath = fileURLToPath(
  new URL('../mockups/diagnose-event-comparison.synthetic/capture.json', import.meta.url));
const pristine = JSON.parse(readFileSync(capturePath, 'utf8'));

const clone = () => structuredClone(pristine);
const dropOccurrence = (capture, id) => {
  capture.views.meals.occurrences = capture.views.meals.occurrences
    .filter((occurrence) => occurrence.id !== id);
};
const blankReadings = (capture, id) => {
  const occurrence = capture.views.meals.occurrences
    .find((candidate) => candidate.id === id);
  for (const point of occurrence.trace.cgm) point.bg = null;
};

test('the untouched capture projects without tripping, at the frozen verdicts', () => {
  const response = projectSyntheticCapture(clone(), { view: 'meals' });
  const byKey = Object.fromEntries(response.cohorts.map((cohort) => [cohort.key, cohort]));
  assert.equal(byKey.fired.support, 'supported');
  assert.equal(byKey.fired.occurrence_ids.length, 7);
  assert.equal(byKey.near_rule.support, 'limited');
  assert.equal(byKey.near_rule.occurrence_ids.length, 4);
  assert.equal(byKey.neutral.support, 'supported');
  assert.equal(byKey.neutral.occurrence_ids.length, 6);
});

test('dropping a stamped occurrence, alone, stays quiet — the intended hatch', () => {
  const capture = clone();
  dropOccurrence(capture, 'meals-synthetic-7');
  projectSyntheticCapture(capture, { view: 'meals' });
});

test('a drop in one cohort does not silence a divergence in another', () => {
  const capture = clone();
  dropOccurrence(capture, 'meals-synthetic-7');
  blankReadings(capture, 'meals-synthetic-12');
  assert.throws(
    () => projectSyntheticCapture(capture, { view: 'meals' }),
    /visual_support mismatch .* cohort neutral /,
  );
});

test('the mirror image trips too: neutral drop, fired corruption', () => {
  const capture = clone();
  dropOccurrence(capture, 'meals-synthetic-12');
  blankReadings(capture, 'meals-synthetic-1');
  assert.throws(
    () => projectSyntheticCapture(capture, { view: 'meals' }),
    /visual_support mismatch .* cohort fired /,
  );
});
