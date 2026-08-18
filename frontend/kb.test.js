// #269 — tests for the pure Guide-KB shell logic (kb.js). Node's built-in
// runner, no npm deps / no package.json:
//
//     node --test           (auto-discovers *.test.js from the repo root)
//
// These import kb.js with no importmap and no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ARTICLES, CATEGORIES, REF_ENTRIES,
  escapeHtml, inlineMd, renderMarkdown,
  matchesQuery, buildNavGroups, buildRefArticles, filteredCount, highlightMatch,
  categoryLabel, surfaceLabel, kicker,
  pct, rankMiniQueue, silenceByTier, tierLabel,
  buildDayPreviewOption,
} from './kb.js';

// A trimmed catalog shaped like /api/catalog.
const CAT = {
  levers: [
    { value: 'carb_undercount', title: 'Carb undercount', exposure: 'meals', recommendation: 'estimate higher' },
    { value: 'late_bolus', title: 'Late bolus', exposure: 'meals', recommendation: 'bolus earlier' },
    { value: 'missed_meal', title: 'Missed meal', exposure: 'meals', recommendation: 'log it' },
    { value: 'over_treated_low', title: 'Over-treated low', exposure: 'lows', recommendation: 'less' },
  ],
  silence_reasons: [
    { value: 'no_trigger', label: 'No trigger', tier: 'observed', body: '...' },
    { value: 'under_threshold', label: 'Under threshold', tier: 'observed', body: '...' },
    { value: 'upstream_cause', label: 'Upstream cause', tier: 'inferred', body: '...' },
    { value: 'insufficient_data', label: 'Insufficient data', tier: 'not_in_data', body: '...' },
  ],
};

// ---- markdown render -------------------------------------------------------

test('renderMarkdown: headings, paragraphs, lists, blockquote', () => {
  const html = renderMarkdown(`
First para.

## A heading

- one
- two

> a quote
`);
  assert.match(html, /<p>First para\.<\/p>/);
  assert.match(html, /<h2>A heading<\/h2>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<blockquote><p>a quote<\/p><\/blockquote>/);
});

test('inlineMd: bold, italic, code', () => {
  assert.equal(inlineMd('a **b** c'), 'a <b>b</b> c');
  assert.equal(inlineMd('a *b* c'), 'a <i>b</i> c');
  assert.equal(inlineMd('a `b` c'), 'a <code>b</code> c');
});

test('inlineMd: in-KB xlink carries data-slug', () => {
  const out = inlineMd('see [The Plan tab](#the-plan-tab) now');
  assert.match(out, /<a class="xlink" data-slug="the-plan-tab">The Plan tab<\/a>/);
});

test('inlineMd: app-surface handoff carries data-app and an arrow', () => {
  const out = inlineMd('open [Diagnose](app:diagnose)');
  assert.match(out, /<a class="handoff-inline" data-app="diagnose">Diagnose →<\/a>/);
});

test('escapeHtml / inlineMd escape angle brackets (no raw HTML injection)', () => {
  assert.equal(escapeHtml('<script>'), '&lt;script&gt;');
  assert.match(inlineMd('a <b>raw</b>'), /&lt;b&gt;raw&lt;\/b&gt;/);
});

test('renderMarkdown: empty / nullish body is empty string', () => {
  assert.equal(renderMarkdown(''), '');
  assert.equal(renderMarkdown(null), '');
  assert.equal(renderMarkdown(undefined), '');
});

// ---- sidebar nav + full-text search ---------------------------------------

test('buildNavGroups: excludes the Reference category and its glyph-list slugs', () => {
  const groups = buildNavGroups('');
  const ids = groups.map((g) => g.id);
  assert.ok(!ids.includes('reference'), 'Reference category is not a primary nav group');
  const conceptSlugs = groups.find((g) => g.id === 'concepts').items.map((a) => a.slug);
  // the two #157 figures stay as rich nav rows; the reference concepts are pulled out
  assert.deepEqual(conceptSlugs, ['the-pipeline', 'worked-example']);
});

test('buildRefArticles: the four generated reference concepts, with icons', () => {
  const refs = buildRefArticles('');
  assert.deepEqual(refs.map((a) => a.slug),
    ['what-this-is', 'silence', 'evidence-tiers', 'lever-catalog']);
  assert.ok(refs.every((a) => a.icon && a.nav));
});

test('search filters the sidebar; a body match keys to its own slug only', () => {
  // "median" appears only in the-plan-tab's fetched body — not in any title.
  const bodies = { 'the-plan-tab': 'the engine takes the median of clean delivered basal' };
  const groups = buildNavGroups('median', bodies);
  const hits = groups.flatMap((g) => g.items.map((a) => a.slug));
  assert.deepEqual(hits, ['the-plan-tab'], 'only the article whose body holds the term matches');
  // the same body must NOT make a different article match (no cross-slug leak — the #338 race).
  assert.equal(matchesQuery(ARTICLES.find((a) => a.slug === 'start-here'), 'median', bodies), false);
});

test('search matches titles too, and is case-insensitive', () => {
  assert.equal(filteredCount('DIAGNOSE') > 0, true);
  const groups = buildNavGroups('diagnose');
  assert.ok(groups.flatMap((g) => g.items).some((a) => a.slug === 'reading-diagnose'));
});

test('filteredCount is zero for a term in nothing', () => {
  assert.equal(filteredCount('zzz-nonexistent-term'), 0);
});

test('highlightMatch wraps hits in <mark> and escapes the rest', () => {
  assert.equal(highlightMatch('Reading the Diagnose surface', 'diagnose'),
    'Reading the <mark>Diagnose</mark> surface');
  assert.equal(highlightMatch('a <b> c', ''), 'a &lt;b&gt; c');
});

// ---- labels ----------------------------------------------------------------

test('categoryLabel / surfaceLabel / kicker', () => {
  assert.equal(categoryLabel('reading'), 'Reading the app');
  assert.equal(surfaceLabel('diagnose'), 'Diagnose');
  assert.match(kicker({ surface: 'day' }), /previews your Day tab/);
  assert.match(kicker({ kind: 'generated' }), /How the engine reasons/);
  assert.match(kicker({ slug: 'start-here', kind: 'authored' }), /one-page orientation/);
});

// ---- Diagnose mini-queue facsimile ----------------------------------------

test('rankMiniQueue: ranks real levers by cbrt(sev*rec*conf), top 5, carrying flavor', () => {
  const q = rankMiniQueue(CAT);
  assert.ok(q.length <= 5);
  // carb_undercount (.82*.74*.70) outranks late_bolus (.55*.61*.80)
  assert.equal(q[0].value, 'carb_undercount');
  assert.equal(q[0].flavor, 'setting');
  assert.equal(q[0].recommendation, 'estimate higher'); // real payload field preserved
  // scores are monotonically non-increasing
  for (let i = 1; i < q.length; i++) assert.ok(q[i - 1].score >= q[i].score);
});

test('rankMiniQueue: empty/nullish catalog is empty', () => {
  assert.deepEqual(rankMiniQueue(null), []);
  assert.deepEqual(rankMiniQueue({}), []);
});

test('pct formats a 0..1 fraction as a percent string', () => {
  assert.equal(pct(0.5), '50%');
  assert.equal(pct(0.821), '82%');
});

// ---- silence grouped by tier ----------------------------------------------

test('silenceByTier: groups by tier in observed->inferred->not_in_data order, drops empties', () => {
  const tiers = silenceByTier(CAT);
  assert.deepEqual(tiers.map((t) => t.tier), ['observed', 'inferred', 'not_in_data']);
  assert.equal(tiers[0].items.length, 2); // no_trigger + under_threshold
  assert.equal(tiers[1].items.length, 1);
});

test('tierLabel maps the enum values to readable labels', () => {
  assert.equal(tierLabel('not_in_data'), 'Not in data');
  assert.equal(tierLabel('observed'), 'Observed');
});

// ---- Day preview chart (grounded ECharts option over a real day) ----------

const DAY_COLORS = { high: '#C2554D', low: '#B3402C', inRange: '#1C6E8C', accent: '#C2554D', line: '#E3E7EA' };
const DAY_TIMELINE = {
  start: '2026-05-02 00:00:00', end: '2026-05-03 06:00:00',
  cgm: [
    { t: '2026-05-02 08:00:00', bg: 95 },   // in-range
    { t: '2026-05-02 19:00:00', bg: 247 },  // high
    { t: '2026-05-02 02:00:00', bg: 58 },   // low
    { t: '2026-05-02 09:00:00', bg: null }, // dropped
  ],
  boluses: [
    { t: '2026-05-02 18:40:00', insulin: 9.0, bg: 150 }, // kept
    { t: '2026-05-02 10:00:00', insulin: 0.2, bg: 120 }, // filtered (< 0.5 U)
  ],
};

test('buildDayPreviewOption: bands + range-colored CGM + bolus marks, over the real day window', () => {
  const opt = buildDayPreviewOption(DAY_TIMELINE, DAY_COLORS);
  // x-axis spans the captured day window (not a hand-drawn 0..320)
  assert.equal(opt.xAxis.min, '2026-05-02T00:00:00');
  assert.equal(opt.xAxis.max, '2026-05-03T06:00:00');
  const [bands, line, scatter, bolus] = opt.series;
  // three target-range bands (high / in-range / low)
  assert.equal(bands.markArea.data.length, 3);
  // CGM: nulls dropped, sorted by time; colored by the app's rangeColor rule
  assert.equal(scatter.data.length, 3);
  const byBg = Object.fromEntries(scatter.data.map((d) => [d.value[1], d.itemStyle.color]));
  assert.equal(byBg[247], DAY_COLORS.high);
  assert.equal(byBg[58], DAY_COLORS.low);
  assert.equal(byBg[95], DAY_COLORS.inRange);
  // line series carries the same count of points as the scatter
  assert.equal(line.data.length, 3);
  // only the ≥0.5 U meal bolus is marked
  assert.equal(bolus.data.length, 1);
  assert.equal(bolus.symbol, 'triangle');
});

test('buildDayPreviewOption: tolerates an empty/absent day', () => {
  const opt = buildDayPreviewOption({ start: '2026-05-02 00:00:00', end: '2026-05-02 23:59:59' }, DAY_COLORS);
  assert.equal(opt.series[2].data.length, 0);
  assert.equal(opt.series[3].data.length, 0);
});

// ---- corpus shape guard ----------------------------------------------------

test('every REF_ENTRY and NEXT_STEP slug resolves to a real article', () => {
  const slugs = new Set(ARTICLES.map((a) => a.slug));
  for (const r of REF_ENTRIES) assert.ok(slugs.has(r.slug), `ref ${r.slug} exists`);
  // the 4 authored how-tos are present with the right kind
  const authored = ARTICLES.filter((a) => a.kind === 'authored').map((a) => a.slug);
  assert.deepEqual(authored, ['start-here', 'reading-diagnose', 'reading-day', 'the-plan-tab']);
});
