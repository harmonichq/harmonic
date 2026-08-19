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
import { chartOption, emptyOption, legendMarkup, paintReadout } from './chart.js';
import { paintPooled } from './pooled.js';

/** ROUND 5, BLOCK 9 — the floor the rows-that-fit measurement clamps to. A
    column too short for three rows shows three and scrolls; it never shows one
    row and an expander. */
const MIN_ROWS = 3;

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

/* ROUND 5, WORKSTREAM A — THE QUEUE ROOT'S CANVAS: THE SHIPPED POOLED GLUCOSE
   CHART. Drawn ONCE, at load, because nothing on this surface can change its
   window — the presets and the drag-to-draw brace are exactly what the #31
   ruling retires, so the queue root stands on the 24 h preset for as long as it
   stands. It is resized with the pane rather than rebuilt, which is also what
   makes the round-4 argument for unmounting the pane moot: an ECharts instance
   in a display:none host keeps its geometry and comes back at size. */
const pooledChart = paintPooled({
  surface,
  head: el('dw-canvas-head'),
  chartHost: el('chart'),
  laneHost: el('lane'),
  keyHost: el('lane-key'),
  payload: data.queue.canvas,
});
new ResizeObserver(() => pooledChart.resize()).observe(el('chart'));

/* ------------------------------------------------------------- the dock floor */
/* ROUND 5, BLOCK 8 — ONE LINE, AT THE COLUMN'S TRUE BOTTOM. The shipped dock is
   three ranks of type in a 98px reserve; at idle all three were saying that
   nothing is happening, and round 4 hid two of them while keeping the reserve,
   which left 98px of pane floor carrying one dim sentence. The reserve goes with
   them: `.watch` is now hairline-topped, unfilled, and exactly as tall as its
   line, so the level above takes the height back and the table can use it.

   THIS RE-SETTLES MIGRATED LOCK TERM 48 (one reserved dock height, the floor
   never moves). Built the prescription's way deliberately — the exploration is
   what tests the re-settle — and named as an owed close-out consequence in the
   report, not silently absorbed. */
const dock = el('watch-dock');
dock.dataset.state = 'idle';
const dockLine = document.createElement('span');
dockLine.className = 'fer-dock-line';
dock.append(dockLine);

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
/* ROUND 5, BLOCK 9 — how many occurrence rows the column can actually hold.
   MEASURED, never chosen: `Infinity` means "lay them all out so they can be
   measured", and `measureFit` replaces it with the answer after the first
   paint. Reset on every state change, because every state change can change the
   height of what sits above the table. */
let rowLimit = Infinity;

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

/* ROUND 5, WORKSTREAM A — TWO-PANE GEOMETRY AT EVERY LEVEL, because the canvas
 * now has something to answer with at every level. `data-level` selects WHICH
 * canvas pane is mounted: the pooled glucose chart at the queue root, the
 * event-comparison lens once a case file is open. One attribute, so the layout
 * is still a function of the same `sceneId` every other painter reads.
 *
 * ROUND 5, BLOCK 2 — and a frame that has no comparison to draw draws the
 * HONEST EMPTY STATE rather than a comparison-shaped nothing: the chart's own
 * greyed furniture with the range still on it, one short line, and a head
 * swapped to a truthful label. */
function paintCanvas() {
  const current = scene();
  const active = frame();
  const canvas = active?.canvas || null;
  const legend = el('ec-chart-key');
  surface.dataset.level = current ? 'drilled' : 'queue';
  if (!current) {
    /* The pooled chart is already drawn and only needs its size back — the pane
       it lives in was display:none while a case file was open. */
    pooledChart.resize();
    return;
  }
  if (!canvas) {
    el('canvas-title').textContent = active.empty.head;
    el('canvas-persist').textContent = active.empty.context;
    legend.innerHTML = '';
    paintReadout(surface, null, null);
    chart.setOption(emptyOption(surface, active,
      current.frames[current.defaultFactor].canvas.alignmentWindow,
      current.frames[current.defaultFactor].canvas.axisAnchor), true);
    chart.resize();
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

  /* ROUND 5, BLOCK 1 — THE COUNT IS A CRUMB ACCESSORY, NOT A CHIP. The chip was
     a bordered token carrying a count and its own `×`, sitting on the crumb
     baseline beside a crumb root that already walks back: two dismissals for one
     filter, and the only bordered object in the header. What is left is the
     number, tabular, right-aligned to the gutter. */
  const count = el('crumb-count');
  count.hidden = !current;
  count.textContent = current ? current.crumbCount : '';
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
  /* ROUND 5, THE PERSONA'S NAMING RULING. The cap is a SECTION SPINE at the
     Occurrences register — `.lvl-cap`, which already is that register — with the
     capture's window as its right-aligned meta on the same baseline, stated
     ONCE. The rows are the destinations and nothing else: label, count, chevron.
     No "All" prefix (the cap owns it) and no window per row (the cap owns that
     too, and repeating it on both rows was the sentence saying itself twice).

     THE ROW LABEL IS THE DESTINATION CRUMB'S LEAF, byte for byte — clicking
     `Lows` opens `Findings › Lows` — so the routing never changes vocabulary
     mid-hop.

     `data-tier="tail"` is kept and is NOT a demotion here: the shipped demoted
     register resolves to exactly the 12.5/500 full-ink label the ruling asks
     for, and the priced register is a size and a weight above it. Reported. */
  level.insertAdjacentHTML('beforeend', `
    <div class="lvl-cap fer-browse-cap">${data.queue.populationCap}<span class="meta">${data.queue.populationCapMeta}</span></div>
    <div class="q fer-population">
      ${data.queue.populationRows.map((row) => `
        <button type="button" class="qrow" data-state="population" data-tier="tail"
                data-id="${row.id}" data-drills="${row.drills}">
          <span class="lab">${row.title}</span>
          <span class="den"><span class="v">${row.count}</span></span>
          <span class="go" aria-hidden="true">›</span>
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

/* The occurrences table, GROUPED.
 *
 * ROUND 5, BLOCK 5 — THE GROUP HEADER IS A RULE, NOT A ROW. It was a `.ev-group`
 * div with its own bottom border and a bolded lead, which made it a heavier
 * object than the data rows it introduced — a header row competing with the
 * table. It is now a label on a hairline that runs from the end of the label to
 * the right gutter, at no uppercase, and the count prints at the rule's right
 * end ONLY where the frame draws more than one group. With one group the count
 * is the cap meta's own numerator one line above, and printing it twice on
 * adjacent lines is how the round-4 header read as noise.
 *
 * ROUND 5, BLOCK 9 — and the budget is `rowLimit`, which is measured rather than
 * chosen. It is still spent across the groups in order, and a header still
 * prints its group's FULL count, so a truncated group says how much is behind
 * the expander instead of quietly shrinking. */
function occurrenceTable(active, kind) {
  const { occurrences } = active;
  const multi = occurrences.groups.length > 1;
  let budget = expanded ? Infinity : rowLimit;
  const out = [];
  for (const group of occurrences.groups) {
    if (budget <= 0) break;
    const rows = group.rows.slice(0, budget);
    budget -= rows.length;
    out.push(`<div class="fer-group"><span class="lab">${group.lead}</span>`
      + '<i class="rule" aria-hidden="true"></i>'
      + `${multi ? `<span class="n">${group.count}</span>` : ''}</div>`);
    out.push(rows.map((r) => rowMarkup(r, kind)).join(''));
  }
  return out.join('');
}

/** How many rows FIT (block 9). Rendered rows are measured against the level's
 *  own visible box, minus whatever must stay below the last one — the residue
 *  line, and the expander when there will be an expander.
 *
 *  The expander's reserve is ONE ROW's height rather than a literal: `.more` and
 *  `.ev-row` carry the same 8px/4px vertical padding on the same body rank, so a
 *  row is the self-adjusting stand-in and no px constant here can go stale
 *  against a type change. */
function measureFit() {
  if (expanded) return Infinity;
  const level = el('level');
  const rows = [...level.querySelectorAll('.ev-row')];
  if (!rows.length) return Infinity;
  const top = level.getBoundingClientRect().top;
  const rowHeight = rows[0].getBoundingClientRect().height;
  const residue = level.querySelector('.fer-residue');
  let ceiling = level.clientHeight - (residue ? residue.getBoundingClientRect().height : 0);
  let fit = 0;
  for (const row of rows) {
    if (row.getBoundingClientRect().bottom - top > ceiling) break;
    fit += 1;
  }
  /* An expander is only owed when something is actually hidden — and once it is
     owed it takes a row's worth of the space just counted. */
  if (fit < rows.length) {
    ceiling -= rowHeight;
    fit = 0;
    for (const row of rows) {
      if (row.getBoundingClientRect().bottom - top > ceiling) break;
      fit += 1;
    }
  }
  return Math.max(MIN_ROWS, fit);
}

/* ROUND 5, BLOCK 2 — THE FRAME CONTROL, AS A SEGMENTED CONTROL.
 *
 * Rounds 3 and 4 both built this as a stack of queue rows, because "pick one of
 * these" is what a queue row does. It is the wrong shape twice over: a vertical
 * list of full-bleed rows is the same object as the occurrence table below it,
 * so the reader has to learn which list is a filter and which is the data; and
 * round 4's selected row took a full-width wash, which is the table's own
 * hover/selection wash spent a second time on a different meaning.
 *
 * One row, 26px, full width, square, no boxes and no fill at rest. Segments are
 * divided by hairlines and the whole control closes on a hairline rule. The
 * selected segment is its label at full ink over a 2px bottom rule in the
 * primary — an UNDERLINE, not a fill, so the table's row wash stays the only
 * wash in the column and can never be confused with a frame choice.
 *
 * THREE SEGMENTS ALWAYS, Unclaimed among them: the control states what the
 * population divides into, and a division that drops its largest part is a lie
 * about the twenty. */
const frameControl = (segments) => `
  <div class="fer-frames" role="group" aria-label="Frame">
    ${segments.map((s) => `
      <button type="button" class="seg" data-key="${s.key}"
              data-selected="${frameKey === s.key}" aria-pressed="${frameKey === s.key}">
        <span class="lab">${s.label}</span><span class="n">${s.count}</span>
      </button>`).join('')}
  </div>`;

function paintLevel(refit = true) {
  const current = scene();
  const level = el('level');
  if (!current) { paintQueue(); paintDock(); return; }
  const active = frame();
  const { subject, judgment, coincidence } = current;
  const { occurrences } = active;
  const hidden = occurrences.groups.reduce((n, g) => n + g.rows.length, 0)
    - (expanded ? Infinity : rowLimit);

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

    <!-- The judgment block. SETTLED CONTENT on the finding scene and untouched
         this round except for block 3's deleted sentence; ABSENT entirely at
         population level, where the segmented control below is the tally and a
         sentence restating its three numbers is the same data twice. -->
    ${judgment ? `
    <div class="inner fer-judgment">
      <div class="ec-counts">${judgment.counts.map((c) => `
        <div class="ec-count"><b>${c.n}</b>${c.label}<em>${c.support}</em></div>`).join('')}</div>
    </div>` : ''}

    <!-- ROUND 5, BLOCK 2 — the frame control, flush to the gutter, full width. -->
    ${current.segments ? frameControl(current.segments) : ''}

    <!-- ROUND 5, BLOCK 6 — THE ROUTE IS ONE RIGHT-ALIGNED ACTION, directly under
         the frame control, and it is ABSENT (never apologised for) where the
         frame has no case file. Round 4 spent a full slotlink sentence on
         "Correction on active insulin has no case file in this exploration."
         beside a button that was not there — a line whose only content was its
         own unavailability. -->
    ${active.route ? `
    <div class="fer-route">
      <button type="button" class="fer-open" data-open="${active.route.target}">${active.route.label}</button>
    </div>` : ''}

      ${coincidence ? `
      <div class="inner fer-context">
      <!-- ROUND 2 ITEM 4 — "When it lands" is DELETED: no heading, no histogram,
           no peak line. The occurrences table below is the timing record. What
           survives is the pair of coincidence sentences, standing on their own
           arithmetic. -->
      <div class="slot-say">${coincidence.share}</div>
      <div class="slotlink">
        <span>${coincidence.slotText}</span><button type="button" class="linkbtn">View slot</button>
        <span>${coincidence.blockText}</span><button type="button" class="linkbtn">View segment</button>
      </div>` : ''}
    ${coincidence ? '</div>' : ''}

    <!-- The occurrences table — the rows ARE the selection mechanism. -->
    <div class="lvl-cap fer-occ-cap">Occurrences<span class="meta">${occurrences.capMeta}</span></div>
    ${occurrenceTable(active, current.kind)}
    <!-- ROUND 5, BLOCK 7 — THE RESIDUE, AND THE ORDER: rows, then residue, then
         the expander. Round 4's version was a filled ev-group.counter slab —
         the darkest object in the column, spent on the two counts that are NOT
         in the table — and it sat BELOW the expander, which put the quietest
         statement furthest from the rows it is about. It is one unfilled line
         now, at the table's own left edge, immediately after the last row. -->
    ${occurrences.residue ? `<div class="fer-residue">${occurrences.residue}</div>` : ''}
    ${hidden > 0
      ? `<button type="button" class="more" aria-expanded="${expanded}">${hidden} more</button>`
      : (expanded ? '<button type="button" class="more" aria-expanded="true">Show fewer</button>' : '')}`;

  level.querySelector('.more')?.addEventListener('click', () => {
    expanded = !expanded;
    rowLimit = Infinity;
    paintLevel();
  });

  /* The segments are the frame selector; the route beside them is the only thing
     on this level that leaves the population case file. */
  for (const node of level.querySelectorAll('.fer-frames .seg')) {
    node.addEventListener('click', () => selectFrame(node.dataset.key));
  }
  level.querySelector('.fer-open')
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

  paintDock();

  /* ROUND 5, BLOCK 9 — ONE MEASURED REFIT PASS. The first paint lays every row
     out so their real heights can be read; if fewer fit than were laid out, the
     limit is set and the level is painted once more with `refit` off. Two
     passes, never a loop, and no px constant decides how many rows a column
     holds. */
  if (refit) {
    const next = measureFit();
    if (next !== rowLimit) { rowLimit = next; paintLevel(false); }
  }
}

/* ROUND 5, BLOCK 8 — the dock's one line, per level. */
function paintDock() {
  dockLine.textContent = data.dock[scene()?.kind || 'queue'];
}

/** Pick a frame: the canvas redraws for that factor (or draws the honest empty
    state) and the table regroups. The scene, the crumb and the count do not
    move. */
function selectFrame(key) {
  if (!scene()?.frames?.[key] || frameKey === key) return;
  frameKey = key;
  highlighted = null;
  pinned = null;
  expanded = false;
  rowLimit = Infinity;
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
  rowLimit = Infinity;
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
/* ROUND 5, WORKSTREAM A — the queue root's pooled chart, published so
   harness.mjs can read its live `getOption()` and diff it against the running
   app's own. A chart nobody can dump is a chart nobody can audit. */
window.__ferPooled = pooledChart;
window.__ferReady = true;
