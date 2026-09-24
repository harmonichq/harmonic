// #426 reproduction: the five id-printing lines, rendered by the shipped modules.
// Synthetic inputs only. Run from the repo root: node docs/scope/426-served-names.repro.mjs
import { readFileSync } from 'node:fs';
const W = new URL('../../frontend', import.meta.url).href;
let answer;
globalThis.fetch = async () => ({ ok: true, json: async () => answer });
const { evidenceDayContext } = await import(`${W}/diagnose-context.js`);
const { dayFrame } = await import(`${W}/day.js`);
const { buildEpisodeLedger, dayStats } = await import(`${W}/day-chart.js`);
const { changeSection, originalSection } = await import(`${W}/history.js`);
const { loadGuidance } = await import(`${W}/guidance.js`);
const { mount } = await import(`${W}/changes.js`);

const WEEK = [{ iso: '2024-06-26', has_data: true, lows: 0, highs: 1, tir: 70, curve: [{ x: .5, bg: 180 }] }];
const model = (lever) => ({ date: '2024-06-26', window: { start: '2024-06-26 00:00:00', end: '2024-06-27 00:00:00', cgm: [] },
  episodes: [{ id: 'e1', start: '2024-06-26 12:00:00', end: '2024-06-26 14:00:00', lever, spans_midnight: false,
    anchors: [{ t: '2024-06-26 13:00:00', kind: 'high', bg: 240, insulin: null, carbs: null, state: 'fired',
      verdicts: [{ classifier: lever, matched: true, silence_reason: null }] }] }] });
const state = (over) => ({ iso: '2024-06-26', rows: WEEK, bounds: { earliest: '2024-06-01', latest: '2024-06-30' }, month: null,
  stats: dayStats(model('missed_meal')), ledger: buildEpisodeLedger(model('missed_meal')), entry: null, moved: null, focusT: null,
  readAt: null, viewedAt: '2024-06-27 09:00:00', isNarrow: false, colors: {}, ...over });
const opened = (html) => (html.match(/<h3>Opened from<\/h3><p>([^<]*)<\/p>/) || [])[1];

// 1. Opened from, through the Diagnose door's own builder, with a served case file.
const selected = { subject: 'pattern:highs_after_meals', occurrence: 'occ-1', finding: { id: 'pattern:highs_after_meals', title: 'Highs after meals' }, window: { start_min: 0, end_min: 1440 } };
const ctx = evidenceDayContext({ occurrence: { id: 'occ-1', t: '2024-06-26 13:00:00' }, selected, focus: '#x' });
console.log('1a Opened from (Pattern):', JSON.stringify(opened(dayFrame(state({ entry: ctx })))));
const night = evidenceDayContext({ occurrence: { t: '2024-06-26 03:00:00' }, slot: { start: 180, end: 210 }, focus: '#x' });
console.log('1b Opened from (basal slot):', JSON.stringify(opened(dayFrame(state({ entry: night })))));

// 2. Episode Log rows for the four causes Day's table lacks.
for (const lever of ['missed_meal', 'meal_bolus_short', 'high_carb_sequence', 'repeat_eating', 'carb_undercount']) {
  const html = dayFrame(state({ ledger: buildEpisodeLedger(model(lever)) }));
  const row = (html.match(/<button class="gf-row gf-log-row"[\s\S]*?<\/button>/) || [''])[0];
  console.log(`2 Episode Log row (${lever}):`, JSON.stringify(row.replace(/<[^>]+>/g, '').trim()));
}

// 3. Focus record "What changed", with the detail's served title.
console.log('3 Focus change:', JSON.stringify(changeSection({ kind: 'focus', lever: 'late_bolus', title: 'Late bolus', changes: [] }).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));

// 4. Unavailable original context.
console.log('4 Original context:', JSON.stringify((originalSection({ context: { state: 'unavailable', reason: 'not_recorded' } }).match(/unavailable: [^.<]*/) || [])[0]));

// 5. Changes Pattern concern built from the committed findings-projection fixture's roster.
const fixture = JSON.parse(readFileSync(new URL(`${W}/__fixtures__/findings-projection.json`), 'utf8'));
const pattern = fixture.browser_outcome_patterns.find((p) => p.key === 'highs_after_meals');
const candidate = { subject: pattern.subject, kind: 'pattern', pattern_key: pattern.key, title: pattern.title,
  action: pattern.action ? { action_id: pattern.action } : null, members: pattern.members, preference: {},
  readiness: { ...pattern.readiness, reason: 'Focus is ready from the backend opportunity count.' } };
answer = { disposition: 'eligible_action', selected: candidate, candidates: [candidate], reasons: {} };
await loadGuidance({ force: true });
const host = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
mount(host);
const leaks = host.innerHTML.match(/\b(?:habit|setting):[\w]+/g) || [];
console.log('5 Changes Pattern leaks:', JSON.stringify([...new Set(leaks)]), 'count', leaks.length);
