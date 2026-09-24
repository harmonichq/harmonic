// #449/#450 triage reproduction on hand-built synthetic payloads (no server, no port).
// Run from the repository root: node openspec/changes/focus-served-words/repro.mjs 2>/dev/null
// Prints what each named line renders on the checked-out tree and every snake_case code it shows.
import { adherenceTable, comparisonTables, readinessArm, readinessSection } from '../../../frontend/follow-up.js';
import { endingSection, originalSection, reassessmentSection, changeSection } from '../../../frontend/history.js';
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const codes = (s) => [...new Set(s.match(/\b[a-z0-9]+(?:_[a-z0-9]+)+\b/g) || [])];
const arm = (lever, extra = {}) => ({ lever, numerator: 1, denominator: 'meals', opportunities: 4, rate: 0.25, harm: 0,
  measured_opportunities: 4, unmeasured_opportunities: 0, harm_availability: { state: 'available', reason: null },
  availability: { state: 'available', reason: null }, ...extra });
const adh = (b, a) => ({ adherence: { before: b, after: a, assessment: { state: 'unclear', unit: 'proportion' } } });
const show = (label, html) => { const t = text(html); console.log(`${label}\n  -> ${t.slice(0, 260)}\n  raw codes: ${JSON.stringify(codes(t))}`); };

console.log('== #449 behavior row ==');
for (const lever of ['high_carb_sequence', 'repeat_eating', 'correction_stacking', 'missed_meal', 'user_override', 'late_bolus']) {
  const row = /<tr class="gf-target"><td>([^<]*)</.exec(adherenceTable(adh(arm(lever), arm(lever))))[1];
  console.log(`  ${lever.padEnd(20)} row: ${row}`);
}
console.log('== #450 adherence / harm cells ==');
for (const reason of ['insufficient_measurement', 'candidate_high_without_closed_attribution', 'attribution_exceeds_owned_population', 'missing_override_provenance', 'unassociated_recurrence_anchor']) {
  show(`adherence ${reason}`, adherenceTable(adh(arm('late_bolus', { rate: null, measured_opportunities: 3, availability: { state: 'unavailable', reason } }), arm('late_bolus'))));
}
for (const reason of ['unreadable_harm_interval', 'zero_opportunities']) {
  show(`harm ${reason}`, adherenceTable(adh(arm('user_override', { harm_availability: { state: 'unavailable', reason } }), arm('user_override'))));
}
console.log('== readiness lines ==');
const legacyFocus = (reason) => ({ unit: 'meals', observed: 3, measured: 2, unmeasured: 1, elapsed_days: 9, required_elapsed_days: 14, criterion_met: false, contributing_dates: [], reason });
for (const r of ['insufficient_measurement', 'zero_opportunities', 'collecting', null]) show(`legacy Focus arm reason=${r}`, readinessArm('after', legacyFocus(r)));
show('Pattern arm withheld/collecting', readinessArm('after', { unit: 'meals', count: 4, gate: 12, observed: 4, required: 12, verdict: 'withheld', reason: 'collecting', criterion_met: false, measured: 4, unmeasured: 0, elapsed_days: 3, required_elapsed_days: null, contributing_dates: [] }));
show('Pattern arm withheld/zero', readinessArm('after', { unit: 'lows', count: 0, gate: 12, observed: 0, required: 12, verdict: 'withheld', reason: 'zero_opportunities', criterion_met: false, measured: 0, unmeasured: 0, elapsed_days: 3, required_elapsed_days: null, contributing_dates: [] }));
show('Pattern arm ready', readinessArm('after', { unit: 'meals', count: 12, gate: 12, observed: 12, required: 12, verdict: 'ready', reason: null, criterion_met: true, measured: 12, unmeasured: 0, elapsed_days: 4, required_elapsed_days: null, contributing_dates: [] }));
show('setting arm unmatchable', readinessArm('after', { unit: 'effective qualifying closed meal runs', required: 8, observed: 0, available: false, reason: 'unmatchable_captured_membership', criterion_met: false, elapsed_days: 10, contributing_dates: [] }));
console.log('== history lines ==');
show('saved ending unavailable_adherence', endingSection({ kind: 'manual', effective_at: '2024-05-04 00:00:00', recorded_at: '2024-05-04 00:00:00', conclusion: 'x', assessment: { state: 'unavailable', reason: 'unavailable_adherence' } }, { kind: 'focus' }));
show('saved ending available context', endingSection({ kind: 'manual', effective_at: '2024-05-04 00:00:00', recorded_at: '2024-05-04 00:00:00', conclusion: 'x', assessment: { state: 'available', assessment: { state: 'concerning', reason: 'Read each outcome separately.' } } }, { kind: 'focus' }));
show('original legacy_not_recorded', originalSection({ context: { version: '386:1', state: 'unavailable', reason: 'legacy_not_recorded' } }));
show('reassessment current-policy state', reassessmentSection({ reassessment: { mode: 'current', computed_at: '2024-05-04 00:00:00', comparison: { availability: { state: 'available' }, assessment: { state: 'context' } }, comparison_context: {} } }, 'current', { kind: 'focus' }));
show('changeSection Pattern Focus', changeSection({ kind: 'focus', lever: 'high_carb_sequence', title: 'Highs after meals', changes: [] }));
console.log('== denominators ==');
show('correction_stacking adherence denominator', adherenceTable(adh(arm('correction_stacking', { denominator: 'correction_clusters' }), arm('correction_stacking', { denominator: 'correction_clusters', opportunities: 0 }))));
show('legacy Focus arm unit', readinessArm('after', { ...legacyFocus('collecting'), unit: 'correction_clusters' }));
console.log('== a refused lifecycle write (durable 409 detail as api.py serves it) ==');
const { ApiTransportError } = await import('../../../frontend/data.js');
const refused = new ApiTransportError(409, { code: 'stale_input_revision', admission: { state: 'available' } }, 'Conflict');
console.log(`  error.message -> ${refused.message}\n  follow-up/history failure line -> ${refused.detail.code} (${refused.status})`);
