/* The fixture-only JS mirror of the findings projection must agree with the server,
 * window for window (#735).
 *
 * The browser gates serve `/diagnose/findings` from
 * `mockups/findings-projection.mirror.mjs` because they have no Python
 * and a drawn brace can be any window. That stub is only worth having if it answers
 * what the real projection answers — otherwise the browser legs certify a queue the
 * app never renders, which is the #273/#465 drift class wearing a new hat.
 *
 * So this runs the mirror over the EXACT three payloads
 * `scripts/gen_findings_projection_fixtures.py` projected from, and deep-compares
 * every window against the projection's own frozen output. The generator's CI drift
 * check keeps that output current with the Python; this keeps the JS current with
 * the output.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./__fixtures__/findings-projection.json', import.meta.url)), 'utf8'));

// The generator's own window table, re-declared here as the request each frozen
// answer was made for — a window read back out of the answer would be circular.
const WINDOWS = {
  global: null,
  morning: { start_min: 270, end_min: 480 },
  low_block: { start_min: 720, end_min: 840 },
  rebound: { start_min: 840, end_min: 960 },
  afternoon: { start_min: 840, end_min: 1260 },
  overnight: { start_min: 1320, end_min: 120 },
  quiet: { start_min: 180, end_min: 240 },
};

test('the mirror reproduces every frozen window byte for byte', () => {
  assert.deepEqual(Object.keys(fixture.windows).sort(), Object.keys(WINDOWS).sort());
  for (const [name, bounds] of Object.entries(WINDOWS)) {
    assert.deepEqual(projectFindings(fixture.inputs, bounds), fixture.windows[name],
      `window ${name} diverges from the server projection`);
  }
});

test('the mirror reproduces the empty analysis, where term 41 lives', () => {
  const empty = {
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { window: { start: null, end: null }, exposures: {} },
    scenarios: { patterns: [], low_confidence: [] },
  };
  for (const [name, bounds] of [['global', null], ['morning', WINDOWS.morning]]) {
    const got = projectFindings(empty, bounds);
    assert.deepEqual(got.rows, [], `${name} has no rows`);
    assert.deepEqual(got, fixture.no_data[name], `${name} matches the frozen empty answer`);
  }
});

test('the mirror publishes outcome chips, chip counts, and correction-factor scope', () => {
  const afternoon = projectFindings(fixture.inputs, WINDOWS.afternoon);
  const row = (title) => afternoon.rows.find((candidate) => candidate.title === title);
  assert.deepEqual(row('Over-treated low').chips, ['highs']);
  assert.deepEqual(row('Correction stacking').chips, ['lows', 'corrections']);
  assert.equal(row('ISF').window_scope, 'whole_day');
  assert.deepEqual(afternoon.chip_counts, fixture.windows.afternoon.chip_counts);
});
