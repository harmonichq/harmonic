/* Drives the exploration: ONE inspector, three levels, one canvas that answers
 * wherever the inspector stands.
 *
 *   level 1  the ranked findings queue — painted by the SHIPPED
 *            `renderFindingsQueue`, imported from frontend/, over the committed
 *            projection. Not a transcription of the queue: the queue.
 *   drill    a finding's case file (Over-treated low) or a population case file
 *            (All lows). Both are REACHED by clicking a row; neither is ever the
 *            initial render. The crumb root walks back.
 *
 * ROUND 3 — BROWSING KEEPS THE FACTOR COMPARISON. A population case file is not
 * one flat view: its CLAIM SPLIT is a factor selector, and each claim line is a
 * FRAME carrying that factor's own lens draw and that factor's own regrouping of
 * the browse population. The frame is the only thing selecting a claim line
 * moves — the crumb still reads `Findings › All lows`, the chip still carries the
 * population count, and the route into a finding's own case file is a separate
 * affordance beside the claim lines.
 *
 * Nothing below draws anything. `chartOption` / `legendMarkup` / `paintReadout`
 * are round 1's ported lens functions, `renderFindingsQueue` is the shipped
 * painter, and the population's canvas, trace overlay and row selection are the
 * SAME calls the finding case file makes, with the selected frame's data.
 *
 * Every element the case files stamp is the SHIPPED grammar for what it is — the
 * markup strings are transcribed from the module that owns them:
 *
 *   .crumb / .trail / .here / .chev          diagnose-workstation.js drawTrail
 *   .q / .qrow / .lab / .tag / .gly / .den   diagnose-findings-queue.js renderFindingsQueue
 *   .slot-say / .slotlink / .linkbtn          diagnose-workstation.js renderFactorHead
 *   .lvl-cap / .ev-group / .ev-row / .more    diagnose-workstation.js renderEvidence
 *   .quiet-line                               diagnose-findings-queue.js (empty queue)
 *   .watch / .kind / .what / .how             watched-change-dock.js paintWatchDock
 *   .ec-counts / .ec-count / .ec-boundary-note  diagnose-event-comparison.js paintInspector
 *   .ec-chart-key / .ec-key-item              diagnose-event-comparison.js paintLegend
 *
 * No text below is authored: every string comes out of data.json, which build.mjs
 * derived from the two fixtures through their shipped producers. The one
 * exception is stamped as such — the population rows, which the ruling invents
 * and no committed projection carries (see build.mjs's provenance block).
 */
import { renderFindingsQueue } from '../../frontend/diagnose-findings-queue.js';
import { chartOption, legendMarkup, paintReadout } from './chart.js';

const el = (id) => document.getElementById(id);

const [data, chrome] = await Promise.all([
  fetch('./data.json').then((r) => r.json()),
  fetch('./chrome.extracted.html').then((r) => r.text()),
]);

/* A scene's frames share ONE trace map (build.mjs keeps it at the scene so
   data.json does not carry three copies of the same observed traces). chart.js
   reads `canvas.traces`, exactly as in round 1 — this hands each canvas the
   scene's map and changes nothing about the draw. */
const framesOf = (sc) => (sc.frames ? Object.values(sc.frames) : [sc]);
for (const sc of Object.values(data.scenes)) {
  for (const f of framesOf(sc)) if (f.canvas) f.canvas.traces = sc.traces;
}

/* ------------------------------------------------------------------ chrome */
/* The cockpit topbar and footer, lifted from the running app's own DOM. */
const shell = document.querySelector('.cockpit-shell');
const stage = document.querySelector('.cockpit-stage');
const holder = document.createElement('div');
holder.innerHTML = chrome;
const topbar = holder.querySelector('.cockpit-topbar');
const footer = holder.querySelector('.cockpit-footer');
if (topbar) shell.insertBefore(topbar, stage);
if (footer) shell.append(footer);

/* --------------------------------------------------------------- the canvas */
const surface = document.querySelector('.fer-surface');
const chartHost = el('ec-chart');
const chart = window.echarts.init(chartHost, null, { renderer: 'canvas' });
chart.on('updateAxisPointer', (e) => paintReadout(surface, e.axesInfo?.[0]?.value, sceneCanvas()));
chart.getZr().on('globalout', () => paintReadout(surface, null, sceneCanvas()));
new ResizeObserver(() => chart.resize()).observe(chartHost);

/* ------------------------------------------------------------- the dock floor */
const dock = el('watch-dock');
dock.dataset.state = 'idle';
for (const [cls, text] of [['kind', data.dock.kind], ['what', data.dock.title], ['how', data.dock.detail]]) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  dock.append(span);
}

/* ------------------------------------------------------------------- state */
/* `sceneId` is null at the queue and a scene key when drilled; `frameKey` is the
   CLAIM LINE selected inside a population case file (round 3 — the claim split
   is the factor selector, and a finding case file has exactly one frame);
   `highlighted` is the ONE occurrence whose trace is on the canvas; `pinned`
   survives the pointer leaving the row. Four variables, and the whole surface is
   a function of them. */
let sceneId = null;
let frameKey = null;
let highlighted = null;
let pinned = null;
let expanded = false;

const scene = () => (sceneId ? data.scenes[sceneId] : null);
/** The scene's ACTIVE frame — a population's selected claim line, or the finding
    case file itself, which is its own single frame. One accessor, so every
    painter below reads the canvas, the boundary note and the table the same way
    whichever case file is open. */
const frame = () => {
  const current = scene();
  if (!current) return null;
  return current.frames ? current.frames[frameKey] : current;
};
const sceneCanvas = () => frame()?.canvas || null;

function paintChart() {
  const canvas = sceneCanvas();
  if (!canvas) return;
  chart.setOption(chartOption(surface, canvas, highlighted), true);
}

/* ROUND 4 ITEM 1 — THE QUEUE LEVEL HAS NO CANVAS, SO IT DRAWS NO CANVAS PANE.
 *
 * Round 3 held the two-pane geometry at every level and filled the left pane, at
 * the queue, with a POOLED GLUCOSE header over 1010px of empty ground plus a
 * paragraph apologising for it. The queue IS the app at that level: the pane is
 * not rendered, the inspector takes the whole stage, and drilling restores the
 * two-pane geometry. ONE attribute carries it, so the layout stays a function of
 * the same `sceneId` every other painter reads. */
function paintCanvas() {
  const current = scene();
  const canvas = frame()?.canvas || null;
  const legend = el('ec-chart-key');
  surface.dataset.level = current ? 'drilled' : 'queue';
  if (!canvas) {
    legend.innerHTML = '';
    paintReadout(surface, null, null);
    return;
  }
  el('canvas-title').textContent = current.canvasHead.title;
  el('canvas-persist').textContent = current.canvasHead.context;
  legend.innerHTML = legendMarkup(canvas);
  paintChart();
  chart.resize();
}

/* --------------------------------------------------- crumb + scope chip */
/* drawTrail's shape: ancestors are buttons, the leaf is an inert `.here`. */
function paintCrumb() {
  const current = scene();
  const trail = el('crumb-trail');
  trail.innerHTML = '';
  if (current) {
    const root = document.createElement('button');
    root.type = 'button';
    root.textContent = current.crumb.root;
    root.addEventListener('click', () => go(null));
    trail.append(root);
    trail.insertAdjacentHTML('beforeend', '<span class="chev" aria-hidden="true">›</span>');
  }
  const here = document.createElement('span');
  here.className = 'here';
  here.setAttribute('aria-current', 'page');
  /* THE ONE PRINTING OF THE SUBJECT'S NAME (round 2, item 3). */
  here.textContent = current ? current.crumb.here : data.queue.root;
  trail.append(here);

  const chip = el('scope-chip');
  chip.innerHTML = '';
  chip.hidden = !current;
  if (!current) return;
  /* Count only — the name is in the crumb, one line to the left. */
  chip.append(current.chip.text);
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'x';
  clear.textContent = '×';
  clear.title = current.chip.title;
  clear.setAttribute('aria-label', current.chip.title);
  clear.addEventListener('click', () => go(null));
  chip.append(clear);
}

/* ------------------------------------------------------------ level 1 */
function paintQueue() {
  const level = el('level');
  level.innerHTML = '';
  /* THE SHIPPED PAINTER, over the committed projection. `onDrill` receives the
     SERVER row, so the route is keyed on the projection's own id. Only
     `finding:over_treated_low` has a case file in this exploration; the other
     five rows drill nowhere, and `go` refuses an id it has no scene for rather
     than half-opening one. */
  renderFindingsQueue(level, data.queue.projection, (row) => go(row.id));

  /* ROUND 2 ITEM 5 — the ruling's free-browse entry, below the projection's own
     rows and its priced/unpriced seam. These rows are NOT in the projection
     fixture: build.mjs derives their counts from the lens capture, and the
     detail line names that capture's window rather than the projection's 30
     days, so the borrowed denominator cannot pass as the server's. */
  /* ROUND 4 ITEM 13 — the section is named for what these rows ARE, in
     CONTEXT.md's own noun (Exposure population), and each row is the population
     noun with its count as the accessory. "Browse everything / All lows / All
     meals" named an activity and then said "all" twice on every row.
     ROUND 4 ITEM 12 — and the cap carries the air that separates it from the
     ranked rows above, in space on the existing small-caps spine, not a rule. */
  level.insertAdjacentHTML('beforeend', `
    <div class="lvl-cap fer-browse-cap">${data.queue.populationCap}</div>
    <div class="q fer-population">
      ${data.queue.populationRows.map((row) => `
        <button type="button" class="qrow" data-state="population" data-tier="tail"
                data-id="${row.id}" data-drills="${row.drills}">
          <span class="lab">${row.title}</span>
          <span class="go" aria-hidden="true">›</span>
          <span class="den"><span class="v">${row.count}</span> in ${row.window}</span>
        </button>`).join('')}
    </div>`);

  for (const node of level.querySelectorAll('.fer-population .qrow')) {
    /* Only `All lows` reaches a case file in this exploration — `All meals`
       would open the meal-response lens, which is not built here. It renders
       because the ruling's queue has both; it routes nowhere, and the report
       names that gap rather than hiding the row. */
    if (node.dataset.drills !== 'true') continue;
    node.addEventListener('click', () => go(node.dataset.id));
  }
}

/* --------------------------------------------------- the drilled case file */
const rowMarkup = (r, kind) => `
    <button type="button" class="ev-row" data-id="${r.id}" data-counter="false"
            data-selected="${highlighted === r.id}"
            data-route="${kind === 'population' ? 'none' : 'self'}"
            title="${r.title}">
      <span class="when">${r.when}</span>
      ${r.both
        ? `<span class="entry">${r.entry}</span><span class="arrow" aria-hidden="true">→</span>
           <span class="worst">${r.worst}</span><span class="delta">${r.delta}</span>`
        : `<span class="only">${r.only} <span>· extreme only</span></span>`}
      <span class="tier">${r.tag || r.tier}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`;

/* The occurrences table, GROUPED. Round 2's table was one shipped `.ev-group`
   header over one flat row list; round 3 emits the same header and the same rows
   once per group, because a factor's frame regroups the browse population into
   that factor's cohorts. A finding case file carries exactly one group, so its
   output is byte-identical to round 2's.
   The five-row cap is spent across the groups in order and a header always
   prints its group's FULL count, so a truncated group says how much is behind
   the expander instead of quietly shrinking. */
function occurrenceTable(active, kind) {
  const { occurrences } = active;
  let budget = expanded ? Infinity : occurrences.cap;
  const out = [];
  for (const group of occurrences.groups) {
    if (budget <= 0) break;
    const rows = group.rows.slice(0, budget);
    budget -= rows.length;
    /* The space before `.n` is the shipped header's own whitespace node — round
       2's template carried it as a newline, and dropping it closes a real gap
       between the tier phrase and the count. */
    out.push(`<div class="ev-group"><b>${group.lead}</b>${group.phrase ? ` — ${group.phrase}` : ''}`
      + ` <span class="n">${group.count}</span></div>`);
    out.push(rows.map((r) => rowMarkup(r, kind)).join(''));
  }
  return out.join('');
}

/* ROUND 3 ITEM 1 — the claim split, in the SHIPPED QUEUE's own row grammar
   (`.q` / `.qrow` / `.lab` / `.den`), which is the register this surface already
   uses for "pick one of these". Selecting a line reframes the canvas and the
   table; it is a selection, not a route, so the row carries no `.go` chevron —
   the route to a claimed finding's own case file is the `.slotlink` below.
 *
 * ROUND 4 ITEM 4 — RE-CUT AS A SELECTOR, NOT A CARD LIST. Round 3's version was
 * three floating rows on a 10px gap, of which the chosen one grew a rounded
 * tinted card — the only radius anywhere in the inspector, and the only row that
 * looked operable at all. Four changes, all of them in the shipped grammar:
 *   · the block leaves `.inner`, so the rows go full-bleed edge to edge like the
 *     `.ev-row`s below them, and the gap closes to zero (the shipped `--q-gap`);
 *   · every row carries the same leading marker, dim at rest and solid when
 *     chosen, so an unselected row reads as operable rather than as prose;
 *   · selection is the full-width wash plus that marker, square-cornered;
 *   · the count moves onto the label's own baseline, right-aligned and tabular,
 *     in the shipped `.den` ink — it was a second line saying "7 lows" under a
 *     row whose whole subject is lows.
 * `role="list"`/`listitem` are gone with the second line: this is a set of
 * mutually exclusive choices and it says so with `aria-pressed` alone. */
const claimMarkup = (claims) => `
  <div class="q fer-claims">
    ${claims.map((c) => `
      <!-- No data-tier / data-state: those two attributes are PROJECTION data in
           the shipped queue (register and pricing), and a claim line is neither.
           The bare .qrow is already the undemoted row. -->
      <button type="button" class="qrow"
              data-key="${c.key}" data-selected="${frameKey === c.key}"
              aria-pressed="${frameKey === c.key}">
        <span class="lab">${c.label}</span>
        <span class="den"><span class="v">${c.count}</span></span>
      </button>`).join('')}
  </div>`;

function paintLevel() {
  const current = scene();
  const level = el('level');
  if (!current) { paintQueue(); return; }
  const active = frame();
  const { subject, judgment, coincidence } = current;
  const { occurrences } = active;

  level.innerHTML = `
    ${subject ? `
    <!-- The subject strip: the flavor tag and the appearance denominators,
         verbatim from the projection, WITHOUT the title. The crumb one line
         above prints the name, and it prints it once (round 2, item 3). -->
    <div class="q fer-subject">
      <div class="qrow" data-state="finding" data-tier="priced">
        <span class="tag ${subject.flavor}"><span class="gly" aria-hidden="true">${subject.flavorGlyph}</span>${subject.flavorWord}</span>
        <span class="den">${subject.appearances.map(({ count, noun }, i) =>
          `${i ? '<span class="sep">·</span>' : ''}<span class="v">${count}</span> ${noun}`).join('')}</span>
      </div>
    </div>` : ''}

    <!-- The judgment block, absorbed from the retired lens inspector pane and
         re-set on the workstation's own spine and type ranks. Under a population
         subject the same block carries the population summary: how many, who
         claims them, and how many nothing claims.

         ROUND 4 ITEM 5 — THE TALLY LEADS. It was printed BELOW a paragraph that
         restated its own three numbers in words; the tally is the data (it
         carries the support word the sentence cannot) and the sentence is now
         the caption clause under it, carrying only what the tally has no cell
         for. -->
    <div class="inner fer-judgment">
      ${judgment.counts ? `
      <div class="ec-counts">${judgment.counts.map((c) => `
        <div class="ec-count"><b>${c.n}</b>${c.label}<em>${c.support}</em></div>`).join('')}</div>` : ''}
      <div class="slot-say">${judgment.summary}</div>
    </div>

    <!-- ROUND 4 ITEM 4 — the claim selector sits OUTSIDE the inner block, so its
         rows are full-bleed on the pane's edges like the occurrence rows below. -->
    ${judgment.claims ? claimMarkup(judgment.claims) : ''}

    <div class="inner fer-context">
      <!-- ROUND 4 ITEM 5 — the near-rule hedge, once, as a footnote line rather
           than a body-weight paragraph reprinted on every frame. -->
      ${current.boundaryNote ? `<p class="ec-boundary-note">${current.boundaryNote}</p>` : ''}
      ${active.route ? `
      <!-- ROUND 3 ITEM 4 — the sideways route into the selected factor's OWN case
           file, in the workstation's own route grammar (.slotlink + .linkbtn, the
           same pair the finding scene spends on "View slot"). The crumb stays
           "Findings › Lows": selecting a factor here reframes the population, it
           does not become the finding drill. Where the factor has no case file in
           this exploration the line says so and offers no button. -->
      <div class="slotlink">
        <span>${active.route.text}</span>
        ${active.route.target ? `<button type="button" class="linkbtn" data-open="${active.route.target}">${active.route.label}</button>` : ''}
      </div>` : ''}

      ${coincidence ? `
      <!-- ROUND 2 ITEM 4 — "When it lands" is DELETED: no heading, no histogram,
           no peak line. The occurrences table below is the timing record. What
           survives is the pair of coincidence sentences, standing on their own
           arithmetic. -->
      <div class="slot-say">${coincidence.share}</div>
      <div class="slotlink">
        <span>${coincidence.slotText}</span><button type="button" class="linkbtn">View slot</button>
        <span>${coincidence.blockText}</span><button type="button" class="linkbtn">View segment</button>
      </div>` : ''}
    </div>

    <!-- The occurrences table — the rows ARE the selection mechanism. -->
    <div class="lvl-cap fer-occ-cap">Occurrences<span class="meta">${occurrences.capMeta}</span></div>
    ${occurrenceTable(active, current.kind)}
    ${occurrences.moreLabel
      ? `<button type="button" class="more" aria-expanded="${expanded}">${expanded ? occurrences.backLabel : occurrences.moreLabel}</button>`
      : ''}
    <!-- The excluded events, in the shipped counter-group register: counted in
         the population above, and deliberately not rows, because they carry no
         comparable trace to select. It sits BELOW the expander so it cannot read
         as a member of the first five. -->
    ${occurrences.counterNote
      ? `<div class="ev-group counter">${occurrences.counterNote}</div>`
      : ''}`;

  level.querySelector('.more')?.addEventListener('click', () => { expanded = !expanded; paintLevel(); });

  /* The claim lines are the factor selector; the route button beside them is the
     only thing on this level that leaves the population case file. */
  for (const node of level.querySelectorAll('.fer-claims .qrow')) {
    node.addEventListener('click', () => selectFrame(node.dataset.key));
  }
  level.querySelector('.linkbtn[data-open]')
    ?.addEventListener('click', (e) => go(e.currentTarget.dataset.open));

  /* Row ⇄ trace: hover previews the ONE trace, click pins it. IDENTICAL in both
     case files (round 3, item 3) — a population row no longer routes anywhere,
     so one selection register covers the whole surface. */
  for (const node of level.querySelectorAll('.ev-row')) {
    const id = node.dataset.id;
    node.addEventListener('mouseenter', () => select(id, false));
    node.addEventListener('focus', () => select(id, false));
    node.addEventListener('mouseleave', () => { if (!pinned) select(null, false); });
    node.addEventListener('click', () => {
      pinned = pinned === id ? null : id;
      select(pinned, true);
    });
  }
}

/** Pick a claim line: the canvas redraws for that factor and the table regroups
    into its cohorts. The scene, the crumb and the chip do not move. */
function selectFrame(key) {
  if (!scene()?.frames?.[key] || frameKey === key) return;
  frameKey = key;
  highlighted = null;
  pinned = null;
  expanded = false;
  paintCanvas();
  paintLevel();
}

function select(id, repaintRows) {
  if (highlighted === id) return;
  highlighted = id;
  paintChart();
  if (repaintRows) { paintLevel(); return; }
  for (const node of el('level').querySelectorAll('.ev-row')) {
    node.dataset.selected = String(node.dataset.id === id);
  }
}

/* ----------------------------------------------------------------- routing */
/** The route itself: one call swaps the canvas, the crumb, the chip and the level. */
function go(id) {
  if (id && !data.scenes[id]) return;
  el('level').dataset.dir = id ? 'push' : 'pop';
  sceneId = id;
  /* ROUND 3 ITEM 2 — a population case file OPENS on its largest claiming
     factor. There is no unselected state: the flat, all-cohorts-of-all-factors
     draw round 2 arrived at is not reachable from anywhere. */
  frameKey = id ? (data.scenes[id].defaultFactor ?? null) : null;
  highlighted = null;
  pinned = null;
  expanded = false;
  paintCrumb();
  paintCanvas();
  paintLevel();
}

go(null);

/* Screenshot hooks for harness.mjs — they drive the surface's own routing and
   selection without synthetic pointer events, so captured frames are
   deterministic and no state exists that a reader could not reach. */
window.__ferGo = go;
window.__ferFrame = selectFrame;
window.__ferSelect = (id) => { pinned = id; select(id, true); };
window.__ferChart = chart;
window.__ferReady = true;
