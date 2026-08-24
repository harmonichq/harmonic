/* Spike for #99 — the cut-down By-event legend copy, executed against the real
   projection rather than pinned as prose in a work order.
 *
 * Run: node docs/scope/99-legend-copy.spike.mjs
 * It prints today's detail line beside the proposed one for every fixture state,
 * and asserts the closed copy table. Not shipped, not imported by anything.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { projectSyntheticCapture } from '../../mockups/diagnose-event-comparison.synthetic/project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const capture = JSON.parse(readFileSync(join(ROOT, 'mockups/diagnose-event-comparison.synthetic/capture.json'), 'utf8'));

/* today — transcribed verbatim from paintLegend, frontend/diagnose-event-comparison.js */
function pointStateSummary(rows) {
  const counts = { supported: 0, limited: 0, withheld: 0 };
  for (const row of rows) counts[row.support] += 1;
  return Object.entries(counts).filter(([, c]) => c > 0).map(([s, c]) => `${c} ${s}`).join(' · ');
}
const todayDetail = (record, points) =>
  record.support === 'withheld' && record.usable_count === 0
    ? `${record.routed_count} events · no usable episodes to draw`
    : record.support === 'withheld'
      ? `${record.routed_count} events · aggregate withheld${record.episodes?.length
        ? ` · ${record.usable_count} ${record.usable_count === 1 ? 'episode' : 'episodes'} shown individually` : ''}`
      : `${record.routed_count} events · ${pointStateSummary(points)} points`;

/* proposed — the mark already carries support (solid / thin-with-a-dot / crossed),
   so the legend prints a count, and words only where the line must not be read
   straight. */
export function proposedDetail(record) {
  const events = `${record.routed_count} ${record.routed_count === 1 ? 'event' : 'events'}`;
  if (record.support === 'supported') return events;
  if (record.support === 'limited') return `${events} · thin`;
  return record.usable_count === 0 ? `${events} · nothing to draw` : `${events} · too few to average`;
}

/* proposed — the readout and the spoken text stop stating a cohort-level fact at a
   point. Both branch on the cohort's support as well as the point's. */
export const proposedPointSummary = (pointSupport) =>
  pointSupport === 'withheld' ? 'Withheld' : `${pointSupport[0].toUpperCase()}${pointSupport.slice(1)}`;

export function proposedSpoken(label, cohort, pointSupport) {
  if (pointSupport !== 'withheld') return null;      // unchanged median sentence
  if (cohort.support !== 'withheld') return `${label} no value at this point`;
  return cohort.usable_count === 0 ? `${label} nothing to draw` : `${label} too few events to average`;
}

const seen = new Set();
for (const view of ['meals', 'lows']) {
  for (const state of ['dense', 'sparse', 'zero-fired']) {
    for (const another of [false, true]) {
      const projection = projectSyntheticCapture(capture, { view, state, another });
      for (const record of projection.cohorts) {
        const points = projection.aggregates?.[record.key] || record.points || [];
        const before = todayDetail(record, points);
        const after = proposedDetail(record);
        console.log(`${view}/${state}${another ? '/another' : ''} ${record.key}`);
        console.log(`   today    ${before}`);
        console.log(`   proposed ${after}`);
        seen.add(after.replace(/^\d+ events?/, 'N events'));
      }
    }
  }
}

/* the closed copy table: four shapes, nothing else reachable */
assert.deepEqual([...seen].sort(), [
  'N events',
  'N events · nothing to draw',
  'N events · thin',
  'N events · too few to average',
]);
console.log('\nclosed copy table holds:', [...seen].sort().join(' | '));
