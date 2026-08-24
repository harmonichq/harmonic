/* The fixture-only JS mirror of the findings projection must agree with the server,
 * window for window (#735).
 *
 * The browser gates serve `/api/diagnose/findings` from
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
import {
  projectFindings, projectIcHistoryEvents,
} from '../mockups/findings-projection.mirror.mjs';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./__fixtures__/findings-projection.json', import.meta.url)), 'utf8'));
const historyEvents = JSON.parse(readFileSync(fileURLToPath(new URL(
  '../mockups/diagnose-workstation.synthetic/ic-history-events.capture.json',
  import.meta.url)), 'utf8'));

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
    analysis_generation: fixture.inputs.analysis_generation,
  };
  for (const [name, bounds] of [['global', null], ['morning', WINDOWS.morning]]) {
    const got = projectFindings(empty, bounds);
    assert.deepEqual(got.rows, [], `${name} has no rows`);
    assert.deepEqual(got, fixture.no_data[name], `${name} matches the frozen empty answer`);
  }
});

test('the mirror reproduces every server-owned history selection disposition', () => {
  const selectedId = fixture.selection_cases.present.selection.id;
  const cases = {
    present: null,
    out_of_scope: { start_min: 720, end_min: 900 },
    aged_out: null,
    unavailable: null,
  };
  for (const [name, bounds] of Object.entries(cases)) {
    const inputs = { ...fixture.inputs, analysis: fixture.selection_inputs[name] };
    assert.deepEqual(projectFindings(inputs, bounds, selectedId), fixture.selection_cases[name],
      `selection ${name} diverges from the server projection`);
  }
  const catalogHistory = fixture.inputs.analysis.ic_history.find(
    (history) => history.id === selectedId);
  const projectedHistory = fixture.selection_cases.present.rows.find(
    (row) => row.id === selectedId);
  assert.equal(projectedHistory.annotation, catalogHistory.annotation,
    'history copy must pass through from the analyzer catalog verbatim');
});

test('the history-event mirror preserves exact run membership and selection', () => {
  const allRuns = historyEvents.cases.all_runs;
  assert.equal(allRuns.analysis_generation, fixture.windows.global.analysis_generation,
    'the generated cross-endpoint pair must be browser-acceptable');
  assert.deepEqual(
    projectIcHistoryEvents(historyEvents.inputs, allRuns.history_id), allRuns);
  const selected = historyEvents.cases.selected_run;
  assert.deepEqual(projectIcHistoryEvents(
    historyEvents.inputs, selected.history_id, selected.selected_run_id), selected);
  assert.deepEqual(allRuns.series[0].member_offsets_min, [0, 120]);
});

test('the mirror publishes outcome chips, chip counts, and correction-factor scope', () => {
  const afternoon = projectFindings(fixture.inputs, WINDOWS.afternoon);
  const row = (title) => afternoon.rows.find((candidate) => candidate.title === title);
  assert.deepEqual(row('Over-treated low').chips, ['highs']);
  assert.deepEqual(row('Correction stacking').chips, ['lows', 'corrections']);
  assert.equal(row('ISF').window_scope, 'whole_day');
  assert.deepEqual(afternoon.chip_counts, fixture.windows.afternoon.chip_counts);
});

test('the mirror transcribes an absent analyzer verdict as the server row null', () => {
  const analysis = structuredClone(fixture.inputs.analysis);
  const isf = analysis.isf[0];
  delete isf.asserts_move;
  const projected = projectFindings({ ...fixture.inputs, analysis }, WINDOWS.afternoon);
  const row = projected.rows.find((candidate) => candidate.parameter === 'isf');
  assert.equal(row.asserts_move, null);
  assert.equal(Object.hasOwn(row, 'asserts_move'), true);
});

/* The deep-compare above would still pass if BOTH sides regressed the honest
 * unexplained-highs count to zero together, and a count frozen at zero is exactly the
 * silent-drift shape #63 exists to close. So name the value: the fixture's ep6 is a
 * high whose episode drew no lever in ANY family, and it must survive the mirror as a
 * finished sentence, unchanged by clock scope. */
test('the mirror preserves the whole-window unexplained-highs count and its copy', () => {
  assert.equal(fixture.inputs.exposures.exposures.highs.uncaused, 1);
  for (const [name, bounds] of Object.entries(WINDOWS)) {
    assert.deepEqual(projectFindings(fixture.inputs, bounds).uncaused_highs,
      { count: 1, text: '1 high had no cause detected by the app' },
      `window ${name} must carry the whole-window count, not a scoped one`);
  }
});

/* The line is whole-window, so an EMPTY scoped queue still reports it. This is the
 * case the copy has to survive: a reader looking at a window with nothing in it must
 * not be told "0 highs had no cause", which would be a claim the data never made. */
test('an empty scoped queue still carries the whole-window count', () => {
  const inputs = {
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { window: { start: null, end: null }, exposures: { highs: { uncaused: 4 } } },
    scenarios: { patterns: [], low_confidence: [] },
    analysis_generation: fixture.inputs.analysis_generation,
  };
  const got = projectFindings(inputs, WINDOWS.quiet);
  assert.deepEqual(got.rows, []);
  assert.deepEqual(got.uncaused_highs,
    { count: 4, text: '4 highs had no cause detected by the app' });
});

test('the mirror publishes no sentence when nothing went unexplained', () => {
  const empty = {
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { window: { start: null, end: null }, exposures: {} },
    scenarios: { patterns: [], low_confidence: [] },
    analysis_generation: fixture.inputs.analysis_generation,
  };
  assert.deepEqual(projectFindings(empty, null).uncaused_highs, { count: 0, text: null });
});
