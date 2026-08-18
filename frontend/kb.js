/* =========================================================================
   #269 GUIDE-KB — pure shell logic, extracted from the locked mockup
   (the archived Guide-KB companion mock, #157); only wrapped in ES `export`s here.

   VUE-FREE and DOM-FREE at import time so `node --test` can import it with no
   importmap and no DOM. The Vue component (the Guide tab) lives in index.html
   and imports these helpers.

   Content model (ADR 0044). Two streams, never conflated:
     • The 4 authored "reading the app" how-tos are markdown in `docs/kb/*.md`,
       served RAW by `/api/kb/<slug>` (the api stays dumb) and rendered here by
       `renderMarkdown`. This module carries their metadata but NOT their body —
       the body is fetched, so the copy has one source of truth.
     • The "engine concepts" articles (pipeline, worked example, silence, tiers,
       lever catalog, what-the-engine-is) are GENERATED from `/api/catalog`
       (build_catalog) so they can never drift from levers._META / the closed
       SilenceReason / EvidenceTier enums. This module only reshapes that
       payload for render (rankMiniQueue / silenceByTier / day + plan facsimiles);
       the #157 worked-example/pipeline/silence figures reuse guide.js verbatim.
   ========================================================================= */

/* ---- the KB's own map: category buckets, in sidebar order ---- */
export const CATEGORIES = [
  { id: 'start',     label: 'Start here' },
  { id: 'reading',   label: 'Reading the app' },
  { id: 'concepts',  label: 'How the engine reasons' },
  { id: 'reference', label: 'Reference' },
];

/* ---- B: the 4 flagship "reading the app" how-tos. Body lives in docs/kb/*.md
   and is fetched from /api/kb/<slug>; only metadata here. `surface` is the live
   app tab the "Open your … surface" handoff jumps to. ---- */
export const AUTHORED = [
  { slug: 'start-here',       title: 'Start here',                    category: 'start',   kind: 'authored' },
  { slug: 'reading-diagnose', title: 'Reading the Diagnose surface',  category: 'reading', kind: 'authored', surface: 'diagnose' },
  { slug: 'reading-day',      title: 'Reading a Day',                 category: 'reading', kind: 'authored', surface: 'day' },
  { slug: 'the-plan-tab',     title: 'The Plan tab',                  category: 'reading', kind: 'authored', surface: 'plan' },
];

/* ---- A: generated "engine concepts" (assembled from /api/catalog). `kind`
   'visual' keeps a bespoke #157 figure; 'generated' is catalog-driven prose. ---- */
export const GENERATED = [
  { slug: 'what-this-is',   title: "What the engine is (and won't do)",                   category: 'concepts',  kind: 'generated' },
  { slug: 'the-pipeline',   title: 'The pipeline: Anchor → Episode → Lever → Pattern',    category: 'concepts',  kind: 'visual' },
  { slug: 'worked-example', title: 'A worked example, walked stage by stage',             category: 'concepts',  kind: 'visual' },
  { slug: 'silence',        title: 'The silence taxonomy: why the engine stays quiet',    category: 'concepts',  kind: 'visual' },
  { slug: 'evidence-tiers', title: 'Evidence tiers: Observed · Inferred · Not-in-data',   category: 'concepts',  kind: 'generated' },
  { slug: 'lever-catalog',  title: 'The lever catalog',                                   category: 'reference', kind: 'generated' },
];

export const ARTICLES = [...AUTHORED, ...GENERATED];

/* The generated concepts that render as a lighter glyph-list under "Reference"
   (pulled out of their category nav group). Icon + short nav label. */
export const REF_ENTRIES = [
  { slug: 'what-this-is',   icon: '◆', nav: 'What the engine is' },
  { slug: 'silence',        icon: '◔', nav: 'Silence taxonomy' },
  { slug: 'evidence-tiers', icon: '◈', nav: 'Evidence tiers' },
  { slug: 'lever-catalog',  icon: '⚙', nav: 'Lever catalog' },
];
const REF_SLUGS = new Set(REF_ENTRIES.map((e) => e.slug));

/* start-here's "where to go next" rail (no live app surface of its own). */
export const NEXT_STEPS = [
  { slug: 'reading-diagnose', title: 'Reading the Diagnose surface', surface: 'Diagnose', why: 'The ranked list of what to fix first. Start here most days.' },
  { slug: 'reading-day',      title: 'Reading a Day',                surface: 'Day',      why: 'Replay a single day when you crashed and want to know why.' },
  { slug: 'the-plan-tab',     title: 'The Plan tab',                 surface: 'Plan',     why: 'The suggested basal profile and how to act on it.' },
  { slug: 'the-pipeline',     title: 'How the engine reasons',                            why: 'Learn the Anchor → Episode → Lever → Pattern vocabulary.' },
];

/* setting-vs-habit flavor + visual factor magnitudes for the Diagnose mini-queue
   facsimile. The catalog carries no per-lever score, so these are honest
   facsimile weights for the mini-render (not modeling output); flavor follows
   the authored copy. */
export const LEVER_META = {
  carb_undercount:                    { flavor: 'setting', sev: .82, rec: .74, conf: .70 },
  late_bolus:                         { flavor: 'habit',   sev: .55, rec: .61, conf: .80 },
  meal_over_delivery:                 { flavor: 'setting', sev: .46, rec: .45, conf: .68 },
  over_treated_low:                   { flavor: 'habit',   sev: .50, rec: .52, conf: .72 },
  missed_meal:                        { flavor: 'habit',   sev: .60, rec: .30, conf: .55 },
  correction_stacking:                { flavor: 'habit',   sev: .58, rec: .36, conf: .62 },
  correction_on_iob:                  { flavor: 'habit',   sev: .50, rec: .38, conf: .60 },
};

/* the Plan mini-diff facsimile (a few illustrative slots). */
export const PLAN_SLOTS = [
  { time: '00:00', cur: 0.85, sug: 0.80, dir: 'down', n: 26 },
  { time: '03:00', cur: 0.85, sug: 0.70, dir: 'down', n: 24 },
  { time: '06:00', cur: 0.95, sug: 1.05, dir: 'up',   n: 28 },
  { time: '11:00', cur: 0.75, sug: 0.75, dir: 'same', n: 22 },
  { time: '18:00', cur: 0.80, sug: 0.90, dir: 'up',   n: 19 },
];


/* ------------------------------------------------------------------ *
 * Markdown → HTML (the authored how-tos). A small, dependency-light  *
 * shim, not a full CommonMark engine: headings / lists / blockquote /*
 * bold / italic / inline code, plus the KB's two custom link kinds — *
 *   [text](#slug)      -> in-KB article jump   (data-slug)           *
 *   [text](app:tab)    -> live app-surface handoff (data-app)        *
 * The component's click handler reads those data-attrs. Kept vue-free *
 * so it is node-tested with no DOM.                                   *
 * ------------------------------------------------------------------ */
export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

export function inlineMd(t) {
  return escapeHtml(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\(app:([\w-]+)\)/g, '<a class="handoff-inline" data-app="$2">$1 →</a>')
    .replace(/\[([^\]]+)\]\(#([\w-]+)\)/g, '<a class="xlink" data-slug="$2">$1</a>');
}

export function renderMarkdown(body) {
  const blocks = String(body || '').trim().split(/\n\s*\n/);
  return blocks.map((raw) => {
    const b = raw.trim();
    if (!b) return '';
    if (b.startsWith('## ')) return `<h2>${inlineMd(b.slice(3))}</h2>`;
    if (b.startsWith('> ')) return `<blockquote><p>${inlineMd(b.replace(/^> /gm, '').replace(/\n/g, ' '))}</p></blockquote>`;
    if (/^- /.test(b)) {
      const lis = b.split(/\n(?=- )/).map((li) => `<li>${inlineMd(li.replace(/^- /, '').replace(/\n\s+/g, ' '))}</li>`).join('');
      return `<ul>${lis}</ul>`;
    }
    return `<p>${inlineMd(b.replace(/\n/g, ' '))}</p>`;
  }).join('');
}

/* ------------------------------------------------------------------ *
 * Sidebar: nav groups (the app-map mirror) + the Reference glyph list *
 * ------------------------------------------------------------------ */

export function articleBySlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) || null;
}

/** Full-text match over an article's title and its (fetched) body. `bodies`
 *  maps slug -> raw markdown; a generated article with no fetched body is
 *  matched on its title alone (the titles carry the concept's key terms). */
export function matchesQuery(article, query, bodies = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = `${article.title} ${bodies[article.slug] || ''} ${article.nav || ''}`.toLowerCase();
  return hay.includes(q);
}

/** The primary nav groups (every category except Reference), each article
 *  filtered by the search query, with the Reference glyph-list slugs pulled
 *  out into their own list. */
export function buildNavGroups(query, bodies = {}) {
  return CATEGORIES.filter((c) => c.id !== 'reference').map((c) => ({
    ...c,
    items: ARTICLES.filter((a) => a.category === c.id && !REF_SLUGS.has(a.slug) && matchesQuery(a, query, bodies)),
  }));
}

/** The Reference glyph-list entries (generated concepts), filtered by query
 *  over the article body/title AND the short nav label. */
export function buildRefArticles(query, bodies = {}) {
  const q = String(query || '').trim().toLowerCase();
  return REF_ENTRIES
    .map((e) => ({ ...articleBySlug(e.slug), ...e }))
    .filter((a) => matchesQuery(a, query, bodies) || a.nav.toLowerCase().includes(q));
}

/** Total number of sidebar entries visible under the current query — drives
 *  the "No articles match" empty state. */
export function filteredCount(query, bodies = {}) {
  const groups = buildNavGroups(query, bodies).reduce((n, g) => n + g.items.length, 0);
  return groups + buildRefArticles(query, bodies).length;
}

/** Escape `text` and wrap query hits in <mark> for the sidebar highlight. */
export function highlightMatch(text, query) {
  const q = String(query || '').trim();
  const safe = escapeHtml(text);
  if (!q) return safe;
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  return safe.replace(re, '<mark>$1</mark>');
}

export function categoryLabel(id) {
  return (CATEGORIES.find((c) => c.id === id) || {}).label || id;
}

export function surfaceLabel(s) {
  return ({ diagnose: 'Diagnose', day: 'Day', plan: 'Plan' }[s]) || s;
}

/** The one-line kicker under an article title. */
export function kicker(article) {
  if (!article) return '';
  if (article.surface) return `Reading-the-app how-to · previews your ${surfaceLabel(article.surface)} tab`;
  if (article.kind === 'visual' || article.kind === 'generated') return 'How the engine reasons · a concept, straight from the engine taxonomy';
  return 'Start here · the one-page orientation';
}

/* ------------------------------------------------------------------ *
 * Embedded live-surface facsimiles (the article pane's right rail)   *
 * ------------------------------------------------------------------ */

export function pct(v) { return `${Math.round(v * 100)}%`; }

/** Rank the real catalog levers by a facsimile score `∛(sev·rec·conf)` and take
 *  the top 5 for the Diagnose mini-queue preview. Titles/meanings/recommendation
 *  are the real payload; the factor magnitudes are LEVER_META facsimile weights. */
export function rankMiniQueue(catalog, meta = LEVER_META) {
  if (!catalog || !catalog.levers) return [];
  return catalog.levers
    .map((lv) => {
      const m = meta[lv.value] || { flavor: 'habit', sev: .4, rec: .4, conf: .5 };
      return { ...lv, ...m, score: Math.cbrt(m.sev * m.rec * m.conf) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** The "Reading a Day" preview chart — the REAL Day surface, grounded (LOCKED
    spec, the archived Day-preview-glucose mock). An ECharts option over the user's own
    captured day (`/timeline`): target-range bands (markArea), the CGM curve with
    points COLORED BY RANGE (the app's own rangeColor: >180 high / <70 low / else
    in-range — the color-never-alone signal), and meal boluses in the app's
    triangle. Pure (takes a resolved `colors` object like the shipping
    `buildLanesOption`), so it is node-tested with no DOM. `colors` needs
    { high, low, inRange, accent, line }. */
export function buildDayPreviewOption(timeline, colors) {
  const toISO = (t) => t.replace(' ', 'T');
  const soft = (hex, a) => `color-mix(in srgb, ${hex} ${a}%, transparent)`;
  const rangeColor = (bg) => (bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange);
  const cgm = (timeline.cgm || []).filter((p) => p.bg != null)
    .slice().sort((a, b) => (a.t < b.t ? -1 : 1));
  const boluses = (timeline.boluses || []).filter((b) => b.insulin > 0.5);
  return {
    animation: false,
    grid: { left: 6, right: 8, top: 14, bottom: 6, containLabel: false },
    xAxis: { type: 'time', min: toISO(timeline.start), max: toISO(timeline.end), show: false },
    yAxis: { type: 'value', min: 40, max: 300, show: false },
    series: [
      // target-range bands (high / in-range / low), softened, + dashed thresholds
      { type: 'line', data: [], silent: true,
        markArea: { silent: true, data: [
          [{ yAxis: 180, itemStyle: { color: soft(colors.high, 9) } }, { yAxis: 300 }],
          [{ yAxis: 70,  itemStyle: { color: soft(colors.inRange, 6) } }, { yAxis: 180 }],
          [{ yAxis: 40,  itemStyle: { color: soft(colors.low, 10) } }, { yAxis: 70 }],
        ] },
        markLine: { silent: true, symbol: 'none', label: { show: false },
          lineStyle: { color: colors.line, type: 'dashed', width: 1 },
          data: [{ yAxis: 180 }, { yAxis: 70 }] } },
      // the CGM curve: a faint connecting line under range-colored points
      { type: 'line', showSymbol: false, smooth: 0.35, silent: true, z: 2,
        lineStyle: { color: soft(colors.inRange, 45), width: 1.5 },
        data: cgm.map((p) => [toISO(p.t), p.bg]) },
      { type: 'scatter', symbolSize: 4.2, z: 3, silent: true,
        data: cgm.map((p) => ({ value: [toISO(p.t), p.bg], itemStyle: { color: rangeColor(p.bg) } })) },
      // meal boluses: the app's downward triangle in accent, floated above the point
      { type: 'scatter', symbol: 'triangle', symbolRotate: 180, symbolSize: 9, z: 4, silent: true,
        itemStyle: { color: colors.accent },
        data: boluses.map((b) => [toISO(b.t), Math.min(295, (b.bg || 190) + 22)]) },
    ],
  };
}

/** Group the closed silence taxonomy by evidence tier, in tier order, dropping
 *  empty tiers — mirrors the tiered silence-card figure (#157). */
export function silenceByTier(catalog) {
  if (!catalog || !catalog.silence_reasons) return [];
  const order = ['observed', 'inferred', 'not_in_data'];
  return order
    .map((tier) => ({ tier, items: catalog.silence_reasons.filter((s) => s.tier === tier) }))
    .filter((t) => t.items.length);
}

export const KB_TIER_LABEL = { observed: 'Observed', inferred: 'Inferred', not_in_data: 'Not in data' };
export function tierLabel(t) { return KB_TIER_LABEL[t] || t; }
