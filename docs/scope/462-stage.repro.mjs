// #462 reproduction (triage, 2026-09-24): the change-record door over a fake
// transport. An expired record whose saved assessment is unavailable with
// `context_after_ending` (no periods, no rows); a Current policy read served
// with both periods, one clock bin and one outcome row; a Retained read served
// as `unsupported_retained_execution`. Made-up synthetic values. Run from the
// repo root:
//   node docs/scope/462-stage.repro.mjs
const root = process.cwd();
const identity = 'isf-all-synthetic';
const saved = { state: 'unavailable', reason: 'context_after_ending', periods: {}, outcomes: [],
  availability: { state: 'unavailable', reason: 'context_after_ending' } };
const PAIRED = { availability: { state: 'available' }, assessment: { state: 'context' },
  periods: {
    before: { start: '2024-05-02 00:00:00', end: '2024-06-01 00:00:00', boundary_reasons: { start: 'available_history', end: 'setting_change' } },
    after: { start: '2024-06-01 00:00:00', end: '2024-07-02 00:00:00', boundary_reasons: { start: 'setting_change', end: 'data_tail' } },
  },
  views: { before: { clock: [{ t: '03:00', n: 12, med: 131 }] }, after: { clock: [{ t: '03:00', n: 12, med: 118 }] } },
  outcomes: [{ key: 'tir', label: 'Time in range', unit: '%', before: 80.1, after: 81.2, difference: 1.1,
    denominator: 'observed CGM readings in eligible windows', denominators: { before: 100, after: 100 },
    assessment: { state: 'context' } }] };
const UNSUPPORTED = { availability: { state: 'unavailable', reason: 'unsupported_retained_execution' },
  periods: {}, views: {}, outcomes: [] };
globalThis.fetch = async (path) => {
  const assessment = new URL(path, 'http://synthetic').searchParams.get('assessment');
  const selected = { id: identity, kind: 'trial', changes: [{ parameter: 'isf', before: 40, after: 44 }],
    original: { context: { state: 'available', action: null, captured_at: '2024-07-02 00:00:00' },
      ending: { kind: 'expired_unreviewed', effective_at: '2024-06-29 00:00:00', recorded_at: '2024-07-02 00:00:00',
        conclusion: null, assessment: saved }, late_conclusion: { state: 'unavailable' } },
    reassessment: assessment ? { mode: assessment, computed_at: '2024-07-02 00:00:00',
      comparison_context: { id: '0123456789abcdef0123', captured_at: '2024-07-02 00:00:00' },
      comparison: assessment === 'current' ? PAIRED : UNSUPPORTED } : null };
  return { ok: true, json: async () => ({ input_revision: 7, admission: { state: 'available' },
    trials: [{ id: identity }], focuses: [], selected }) };
};
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#222222' });
const { mount } = await import(`${root}/frontend/history.js`);
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve)); };
const buttons = Object.fromEntries(['original', 'retained', 'current'].map((mode) => [mode, { dataset: { assessment: mode } }]));
const seat = { innerHTML: '',
  querySelectorAll(selector) { return selector === '[data-assessment]' && this.innerHTML.includes('data-assessment=') ? Object.values(buttons) : []; },
  querySelector() { return null; } };
const route = { occurrence: `record:trial:${identity}` };
const open = async () => { for (let i = 0; i < 4; i++) { mount(seat, { context: route, hold() {} }); await flush(); } };
const stage = () => {
  const html = seat.innerHTML.split('<aside')[0];
  return { meta: (html.match(/<span class="cap">([^<]*)<\/span><span class="meta">([^<]*)</) || []).slice(1).join(' / '),
    figure: (html.match(/data-figure-state="([^"]+)"/) || [])[1],
    outcomeRow: /data-outcome="tir"/.test(html),
    noOutcome: /No glucose outcome is served/.test(html), html };
};
const result = () => {
  const line = seat.innerHTML.match(/data-reassessment-state="[^"]*">([^<]*)</);
  const context = seat.innerHTML.match(/data-reassessment-context="[^"]*">([^<]*)</);
  return `Result: ${line ? line[1] : '(not requested)'}${context ? ` · Context: ${context[1]}` : ''}`;
};
await open();
const base = stage();
console.log(`Original:  stage "${base.meta}", figure ${base.figure}, outcome row ${base.outcomeRow}, "No glucose outcome" ${base.noOutcome}`);
for (const mode of ['current', 'retained']) {
  buttons[mode].onclick(); await open();
  const now = stage();
  console.log(`${mode.padEnd(9)}: stage "${now.meta}", figure ${now.figure}, outcome row ${now.outcomeRow}, stage byte-identical to Original ${now.html === base.html}`);
  console.log(`           ${result()}`);
}
