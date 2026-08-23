/* Triage spike for harmonichq/harmonic#103.
 * For every ciq_autotune Status value, run the real buildSlotLane and print
 * what a non-asserting slot's lane verdict key is — i.e. exactly which
 * VERDICT_KEY entries the proposed head expression can ever produce. */
import { buildSlotLane } from '../../../frontend/diagnose-workstation-chart.js';

// ciq_autotune/safety.py Status values, in declaration order.
const STATUSES = [
  'no data', 'no baseline', 'no change', 'insufficient evidence',
  'raise', 'lower', 'capped (raise)', 'capped (lower)',
  'lower (recurring lows)', 'held (recurring-low gate)',
];
// safety.py _ACTIONABLE
const ACTIONABLE = new Set(['raise', 'lower', 'capped (raise)', 'capped (lower)', 'lower (recurring lows)']);
const DIRECTION = { raise: 'raise', 'capped (raise)': 'raise', lower: 'lower', 'capped (lower)': 'lower', 'lower (recurring lows)': 'lower' };

const rows = [];
for (const status of STATUSES) {
  for (const hasRecommended of [true, false]) {
    const asserts_move = ACTIONABLE.has(status);
    const slot = {
      label: '00:00', current: 1.0,
      estimate: { value: 1.0, lo: 0.9, hi: 1.1, n: 9, wide: false },
      recommended: hasRecommended ? 1.1 : null,
      annotation: 'x', days: 9, evidence: {},
      asserts_move, direction: asserts_move ? DIRECTION[status] : null,
      safety_status: status,
    };
    const lane = buildSlotLane([slot]);
    const cell = lane.cells[0];
    rows.push({ status, hasRecommended, canStage: cell.asserts, verdict: cell.verdict });
  }
}
console.log('status | recommended? | canStage | cell.verdict');
for (const r of rows) console.log(`${r.status} | ${r.hasRecommended} | ${r.canStage} | ${r.verdict}`);
const nonAsserting = [...new Set(rows.filter((r) => !r.canStage).map((r) => r.verdict))].sort();
console.log('\nVERDICT KEYS REACHABLE WHEN canStage IS FALSE:', JSON.stringify(nonAsserting));
