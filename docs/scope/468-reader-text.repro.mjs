// #468 reproduction: three desk lines that print engine shorthand. Synthetic
// inputs only: the committed findings-projection fixture, the Day test's
// manufactured day and a hand-built retained reassessment.
//
// Run from the repo root: node docs/scope/468-reader-text.repro.mjs
import { readFileSync } from 'node:fs';

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });
const { renderFindingsQueue } = await import('../../frontend/diagnose-findings-queue.js');
const { buildEpisodeLedger, dayStats } = await import('../../frontend/day-chart.js');
const { dayFrame } = await import('../../frontend/day.js');
const { reassessmentSection } = await import('../../frontend/history.js');

// 1. The Pattern fold. The same stub DOM the queue's Node test paints against.
class Node {
  constructor(tag = '') { Object.assign(this, { tag, children: [], dataset: {}, className: '', attributes: {} }); }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}
const descendants = (node) => (node.children || []).flatMap((child) => [child, ...descendants(child)]);
const lineText = (node) => (typeof node === 'string' ? node : node.className === 'sep' ? ' · '
  : `${node.textContent || ''}${(node.children || []).map(lineText).join('')}`);
const rows = JSON.parse(readFileSync(new URL('../../frontend/__fixtures__/findings-projection.json', import.meta.url), 'utf8')).windows.global.rows;
globalThis.document = { createElement: (tag) => new Node(tag) };
console.log('1. Pattern fold');
for (const parentId of ['pattern:highs_after_meals', 'pattern:lows_after_correcting_highs']) {
  const parent = rows.find((row) => row.id === parentId);
  const members = rows.filter((row) => row.claimed_by === parentId);
  const host = new Node();
  renderFindingsQueue(host, { rows: [{ ...parent, priority: 90 }, ...members] }, () => {});
  const count = parent.count_sentences ? JSON.stringify(parent.count_sentences.map((s) => s.sentence)) : 'none';
  console.log(`  ${parentId} serves count ${count}`);
  for (const line of descendants(host).filter((node) => node.className === 'qmember')) {
    const part = (cls) => lineText(line.children.find((child) => child.className === cls) || '');
    console.log(`    ${line.dataset.id}: den ${JSON.stringify(part('den'))} out ${JSON.stringify(part('out'))}`);
  }
}

// 2. Day's Quiet line: the committed one-quiet-anchor model, then quiet anchors
//    on both sides of a Finding.
const colors = { inRange: '#000', high: '#000', low: '#000', accent: '#000', secondary: '#000', manualCarb: '#000', basal: '#000', line: '#000' };
const anchor = (t, kind, bg, state, classifier) => ({ t, kind, bg, insulin: null, carbs: null, state,
  verdicts: [{ classifier, matched: state === 'fired', silence_reason: state === 'fired' ? null : 'no_trigger' }] });
const model = (quietTimes) => ({
  date: '2024-06-26',
  window: { start: '2024-06-26 00:00:00', end: '2024-06-27 00:00:00',
    cgm: [{ t: '2024-06-26 13:55:00', bg: 48 }, ...quietTimes.map((t) => ({ t, bg: 190 }))] },
  episodes: [{ id: '2024-06-26-ep1', start: '2024-06-26 13:00:00', end: '2024-06-26 15:00:00',
    lever: 'over_treated_low', lever_title: 'Over-treated low', spans_midnight: false,
    anchors: [anchor('2024-06-26 13:55:00', 'low', 48, 'fired', 'over_treated_low'),
      ...quietTimes.map((t) => anchor(t, 'high', 190, 'clean', 'late_bolus'))] }],
});
console.log('2. Day Quiet line');
for (const [label, quietTimes] of [['one quiet anchor (18:00), Finding 13:55', ['2024-06-26 18:00:00']],
  ['quiet anchors 08:00 and 20:00, Finding 13:55', ['2024-06-26 08:00:00', '2024-06-26 20:00:00']]]) {
  const day = model(quietTimes);
  const ledger = buildEpisodeLedger(day);
  const markup = dayFrame({ iso: day.date, months: new Map(), bounds: { earliest: '2024-06-01', latest: '2024-06-30', dataDays: 29, readAt: null },
    month: null, stats: dayStats(day), ledger, entry: null, moved: null, focusT: null, readAt: null,
    viewedAt: '2024-06-30 09:00:00', isNarrow: false, colors });
  const line = /Quiet · \d+<\/span>.*?<\/div><p class="gf-meta">([^<]*)<\/p>/.exec(markup)[1];
  console.log(`  ${label}: ledger.quiet ${JSON.stringify({ start: ledger.quiet.start, end: ledger.quiet.end })} line ${JSON.stringify(line)}`);
}

// 3. Changes: the Retained reassessment's Context row, for a saved context, a
//    record kept before contexts were saved, and a record whose context is missing.
console.log('3. Retained reassessment Context row');
for (const [label, context] of [
  ['saved context', { id: 'dcbc2e96d98ac06a3369dccc5fcdd4f2876c7c0f', state: 'available', reason: null, captured_at: '2024-06-01 00:00:00' }],
  ['legacy record', { version: '386:1', state: 'unavailable', reason: 'legacy_not_recorded' }],
  ['missing context', { version: '386:1', state: 'unavailable', reason: 'not_recorded' }]]) {
  const html = reassessmentSection({ reassessment: { mode: 'retained', computed_at: '2026-09-08 15:15:44', comparison_context: context,
    comparison: { availability: { state: 'unavailable', reason: 'missing_comparison_context' } } } }, 'retained');
  console.log(`  ${label}: ${JSON.stringify(/data-reassessment-context="retained">([^<]*)</.exec(html)[1])}`);
}
