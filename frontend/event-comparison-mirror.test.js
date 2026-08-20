/* The fixture-only event-comparison mirror must reproduce the Python answers.
 * Browser replays have no Python; this is the parity gate that keeps their
 * server stub from silently becoming a second membership implementation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectSyntheticCapture } from '../mockups/diagnose-event-comparison.synthetic/project.mjs';

const here = (path) => fileURLToPath(new URL(path, import.meta.url));
const capture = JSON.parse(readFileSync(
  here('../mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));
const fixture = JSON.parse(readFileSync(
  here('./__fixtures__/event-comparison-mirror.json'), 'utf8'));

const COORDINATES = {
  meals_default: { view: 'meals' },
  lows_default: { view: 'lows' },
  midday: { view: 'meals', window: { start_min: 720, end_min: 960 } },
  wrapping: { view: 'lows', window: { start_min: 1320, end_min: 120 } },
  withheld: { view: 'meals', window: { start_min: 360, end_min: 480 } },
  selection: { view: 'meals', occurrenceId: 'meals-synthetic-2' },
};

test('the mirror reproduces every frozen Python projection window for window', () => {
  assert.deepEqual(Object.keys(fixture.windows).sort(), Object.keys(COORDINATES).sort());
  for (const [name, coordinates] of Object.entries(COORDINATES)) {
    assert.deepEqual(projectSyntheticCapture(capture, coordinates), fixture.windows[name],
      `${name} diverges from the server projection`);
  }
});
