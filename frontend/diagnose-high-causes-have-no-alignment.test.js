/* Event-chart eligibility is a public findings-projection fact (#83).
 *
 * The generator derives `inputs.event_charts` from Python's canonical
 * event-comparison configuration. The fixture-only mirror consumes that object;
 * production browser code never carries a title or factor allowlist.
 * ADR 79 separately requires every server-inspectable Finding, including Highs,
 * to own both case-file projections without browser routing or joining.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { projectFindings } from '../mockups/findings-projection.mirror.mjs';

const fixture = JSON.parse(readFileSync(
  fileURLToPath(new URL('./__fixtures__/findings-projection.json', import.meta.url)), 'utf8'));
const source = readFileSync(new URL('./diagnose-workstation.js', import.meta.url), 'utf8');

const CANONICAL_EVENT_CHARTS = {
  carb_undercount: { view: 'meals', factor: 'carb_undercount' },
  late_bolus: { view: 'meals', factor: 'late_bolus' },
  meal_over_delivery: { view: 'meals', factor: 'meal_over_delivery' },
  over_treated_low: { view: 'lows', factor: 'over_treated_low' },
  correction_on_iob: { view: 'lows', factor: 'correction_on_iob' },
  correction_stacking: { view: 'lows', factor: 'correction_stacking' },
};

test('#83 · the generated contract publishes the canonical six coordinates', () => {
  assert.deepEqual(fixture.inputs.event_charts, CANONICAL_EVENT_CHARTS);
});

test('#83 · settings and unsupported Findings publish explicit null', () => {
  const settings = fixture.windows.global.rows.filter((row) => row.register !== 'finding');
  assert.ok(settings.length > 0, 'the generated contract exercises settings rows');
  assert.ok(settings.every((row) => Object.hasOwn(row, 'event_chart')));
  assert.ok(settings.every((row) => row.event_chart === null));

  const unsupported = projectFindings({
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { exposures: { highs: { occurrences: [{
      t: '2026-08-17 09:00:00', date: '2026-08-17', kind: 'high',
      cause_lever: 'missed_meal', cause_title: 'Missed / unannounced meal',
      ep_id: 'missed-meal', verdicts: [],
    }] } } },
    scenarios: { patterns: [], low_confidence: [] },
    event_charts: fixture.inputs.event_charts,
  }, null).rows[0];
  assert.equal(unsupported.event_chart, null);
});

test('#83 · compatibility without the canonical family publishes null', () => {
  const highOnly = projectFindings({
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { exposures: { highs: { occurrences: [{
      t: '2026-08-17 09:00:00', date: '2026-08-17', kind: 'high',
      cause_lever: 'late_bolus', cause_title: 'Late bolus',
      ep_id: 'late-bolus-high-only', verdicts: [],
    }] } } },
    scenarios: { patterns: [], low_confidence: [] },
    event_charts: fixture.inputs.event_charts,
  }, null).rows[0];
  assert.equal(highOnly.event_chart, null);
});

test('ADR 79 · no title router or browser population join remains', () => {
  for (const retired of ['ALIGN_FACTOR_BY_CAUSE', 'alignCoordinatesFor', 'publishedFor',
    'scopedFor', 'occurrencesFor']) {
    assert.ok(!source.includes(retired), `${retired} is retired by ADR 79`);
  }
  assert.doesNotMatch(source, /\.ep_id\s*===|\.t\s*===\s*.*\.t/,
    'the browser does not join Exposure membership by episode/time');
});

test('ADR 79 · roster controls consume the published cohort count', () => {
  const roster = source.match(/function renderCaseRoster[\s\S]*?function renderCaseSelection/);
  assert.ok(roster, 'the server-owned case roster exists');
  assert.match(roster[0], /caseFile\.verdict_counts\[verdict\]/,
    'the roster reads the published cohort count');
  assert.doesNotMatch(roster[0], /rows\.length/,
    'the roster never recounts its server-owned cohort for display or pagination');
});

test('ADR 79 · every visible behavioral row requests its opaque case id', () => {
  assert.match(source, /if \(row\.register === 'finding'\)[\s\S]*entryAlignment = eventChartsOnly && eventChartCoordinate\(row\)[\s\S]*rowId: row\.id[\s\S]*requestCase\(frame, entryAlignment\)/,
    'the row identity, not its title, opens the server case');
  assert.match(source, /function findingRowFor\(frame\) \{\s*if \(frame\.k !== 'factor'\) return null;\s*return \(findings\?\.rows \|\| \[\]\)\.find\(\(row\) => row\.id === frame\.rowId\) \|\| null;\s*\}/,
    'a standing case resolves its active Finding from the current projection');
  assert.match(source, /renderEventSurface\(host, f\.caseFile/,
    'Highs and correction clusters use the shared server event-projection path');
});

test('ADR 79 · case-file ALIGN follows the active row event coordinate', () => {
  const alignment = source.match(/const caseAlignmentIn =[\s\S]*?;\n  const availableAlignment/);
  assert.ok(alignment, 'the case-file alignment predicate exists');
  assert.match(alignment[0], /const row = source\?\.rendered_rows\?\.find\(\(row\) => row\.id === frame\.rowId\);\s*return eventChartCoordinate\(row\);/,
    'the active rendered row\'s canonical event coordinate controls ALIGN');
  assert.doesNotMatch(alignment[0], /case_header|alignments/,
    'retired case-header alignments do not control ALIGN');
});

test('ADR 79 · event alignment never falls back to clock at paint time', () => {
  assert.ok(!source.includes("open.align = 'clock'"), 'no event-to-clock fallback');
  assert.ok(!source.includes('0 of 0'), 'no fabricated empty frame copy');
});
