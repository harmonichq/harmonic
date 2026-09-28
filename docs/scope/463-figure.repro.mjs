// #463 reproduction (triage, 2026-09-24): the record's outcome table and figure,
// called directly with made-up synthetic values. The difference is the one the
// reconciled showcase serves (docs/scope/463-record-display.repro.py, item 1);
// the Rest-windows row is the 1-in-3 shape read from the code. Run from the
// repo root:
//   node docs/scope/463-figure.repro.mjs
const root = process.cwd();
globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#222222' });
const { outcomesTable, evidenceFigure } = await import(`${root}/frontend/follow-up.js`);
const rows = [
  { key: 'tir', label: 'Time in range', unit: '%', before: 100.0, after: 96.1, difference: 96.1 - 100.0,
    denominator: 'observed CGM readings in eligible windows', denominators: { before: 10, after: 10 }, assessment: { state: 'unclear' } },
  { key: 'nights_with_low', label: 'Rest windows with a low', unit: '%', before: 100 * 1 / 3, after: 0, difference: 0 - 100 * 1 / 3,
    denominator: 'coverage-qualified Rest windows in affected hours', denominators: { before: 3, after: 3 }, assessment: { state: 'unclear' } },
];
const table = outcomesTable({ outcomes: rows }, 'trial');
for (const key of ['tir', 'nights_with_low']) {
  const row = table.match(new RegExp(`data-outcome="${key}".*?</tr>`))[0];
  const cells = [...row.matchAll(/<td class="v"[^>]*>([^<]*)<small>([^<]*)<\/small>/g)].map((m) => `${m[1]} (${m[2]})`);
  console.log(`${key}: ${cells.join(' | ')}`);
}
const periods = { before: { start: '2024-05-02 00:00:00', end: '2024-06-01 00:00:00' }, after: { start: '2024-06-01 00:00:00', end: '2024-06-29 00:00:00' } };
const states = {
  saved: [{ availability: { state: 'available' }, periods, outcomes: [] }, { saved: true }],
  unavailable: [{ availability: { state: 'unavailable', reason: 'context_after_ending' }, periods: {}, views: {} }, { saved: true }],
  'no-readings': [{ availability: { state: 'available' }, periods, views: { before: { clock: [] }, after: { clock: [] } } }, {}],
  'not-requested': [null, {}],
};
for (const [name, [comparison, options]] of Object.entries(states)) {
  const html = evidenceFigure(comparison, 'trial', null, options);
  console.log(`${name}: data-figure-state="${(html.match(/data-figure-state="([^"]+)"/) || [])[1]}", chart seat ${html.includes('gf-chart-seat')}, role="img" ${html.includes('role="img"')}`);
}
