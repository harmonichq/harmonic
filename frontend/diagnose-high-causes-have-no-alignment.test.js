/* Event-chart eligibility is a public findings-projection fact (#83).
 *
 * The projection publishes each eligible Finding's lever-and-window coordinate;
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

test('#181 · eligible rows publish their own lever and server window', () => {
  const rows = fixture.windows.global.rows.filter((row) => row.event_chart !== null);
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.deepEqual(row.event_chart, { lever: row.lever, window: fixture.windows.global.window });
  }
});

test('#83 · settings publish null and a High-family Missed meal publishes its coordinate', () => {
  const settings = fixture.windows.global.rows.filter((row) => row.register !== 'finding');
  assert.ok(settings.length > 0, 'the generated contract exercises settings rows');
  assert.ok(settings.every((row) => Object.hasOwn(row, 'event_chart')));
  assert.ok(settings.every((row) => row.event_chart === null));

  const missedMeal = projectFindings({
    analysis: { window_days: 30, basal: [], isf: [], ic_blocks: [] },
    exposures: { exposures: { highs: { occurrences: [{
      t: '2026-08-17 09:00:00', date: '2026-08-17', kind: 'high',
      cause_lever: 'missed_meal', cause_title: 'Missed / unannounced meal',
      ep_id: 'missed-meal', verdicts: [],
    }] } } },
    scenarios: { patterns: [], low_confidence: [] },
  }, null).rows[0];
  assert.deepEqual(missedMeal.event_chart, {
    lever: 'missed_meal',
    window: { scoped: false, start_min: null, end_min: null, label: null },
  });
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

test('ADR 79 · case-file ALIGN follows the active server event coordinate', () => {
  const alignment = source.match(/const caseAlignmentIn =[\s\S]*?;\n  const availableAlignment/);
  assert.ok(alignment, 'the case-file alignment predicate exists');
  assert.match(alignment[0], /const row = source\?\.rendered_rows\?\.find\(\(row\) => row\.id === frame\.rowId\);\s*return eventChartCoordinate\(row\);/,
    'the active rendered row\'s server coordinate controls ALIGN');
  assert.doesNotMatch(alignment[0], /case_header|alignments/,
    'retired case-header alignments do not control ALIGN');
});

test('ADR 79 · event alignment never falls back to clock at paint time', () => {
  assert.ok(!source.includes("open.align = 'clock'"), 'no event-to-clock fallback');
  assert.doesNotMatch(source, /alignment === 'event' && !frame\.caseFile[\s\S]*requestCase\(frame, 'clock'/,
    'an event request never silently retries as By clock');
  assert.ok(!source.includes('0 of 0'), 'no fabricated empty frame copy');
});
