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
 *   .lvl-cap                                  diagnose-workstation.js renderEvidence
 *   .ev-group / .ev-row / .more               NOT transcribed at all any more —
 *       ROUND 8, ITEM 1 runs diagnose-workstation.js's own `renderEvidence`,
 *       lifted whole into evidence-table.extracted.js by build.mjs
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
/* ROUND 8, ITEM 1 — THE OCCURRENCE TABLE IS THE PRODUCTION ONE. Operator's
   ruling: "Production table everywhere. Steal that." This module is the shipped
   `renderEvidence`, lifted out of frontend/diagnose-workstation.js by build.mjs
   because it is module-private there and a transcription is the thing the
   ruling forbids. It brings its own group headers, its own five-row cap and
   two-way expander and its own tier word with it. The mock's `rowMarkup`,
   `occurrenceTable`, `measureFit` and `.fer-group` are deleted, not kept
   alongside. */
import { renderEvidence, EVIDENCE_CAP, tierOf } from './evidence-table.extracted.js';
import { chartOption, emptyOption, legendMarkup, paintReadout } from './chart.js';
import { paintPooled } from './pooled.js';

/* ROUND 8, ITEM 1 — ROUND 5's MEASURED ROW BUDGET IS RETIRED WITH THE MOCK'S
   TABLE. `MIN_ROWS`, `rowLimit` and `measureFit` decided how many rows fit the
   column; the production table decides that itself, with `EVIDENCE_CAP` and an
   expander that toggles back. Lifting the table means taking its budget too —
   a lifted painter driven by a bespoke budget is a fork with extra steps. */

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
/* ROUND 6, FORM 3 — and it is no longer drawn once. The `By clock` projection
   is this same chart with the selected factor's events on it, so it repaints
   whenever the selection or the drilled event changes. `renderCanvas` resolves
   its instance through `getInstanceByDom`, so every repaint is the same chart
   and the ResizeObserver below never goes stale. */
const pooledHosts = {
  surface,
  head: el('dw-canvas-head'),
  chartHost: el('chart'),
  laneHost: el('lane'),
  keyHost: el('lane-key'),
  payload: data.queue.canvas,
};
const pooledChart = paintPooled(pooledHosts);
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
   `highlighted` is the ONE occurrence whose trace is on the canvas.

   ROUND 7, ITEM 3 — and `pinned` is gone. It existed only to remember which row
   survived the pointer leaving the table; with the trace and the brace moved
   onto selection, `highlighted` IS the selection and there is nothing for a
   second variable to hold. */
let sceneId = null;
let frameKey = null;
let highlighted = null;
let expanded = false;
/* ROUND 6, FORM 3 — WHICH PROJECTION THE CANVAS IS DRAWN IN. Not a selection:
   the events are the same either way, and switching preserves the drilled row.
   `clock` is the rest state, as in wireframe G. */
let projection = 'clock';
/* ROUND 6, FORM 1 — whether the factor dropdown is expanded. It overlays; it
   never pushes, so nothing else on the column is a function of it. */
let factorOpen = false;
/* ROUND 8, ITEM 1 — WHICH VERDICT THE ROSTER IS SHOWING (wireframe H3). The
   band states the three-way split proportionally and the roster below it is
   never longer than ONE verdict; `Rule matched` is the resting verdict. It
   scopes the ROSTER ONLY — all three verdicts stay drawn on the canvas, so the
   denominator the reader counts never moves (data.json `terms`). */
let verdict = null;

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

/* ROUND 6, FORM 3 — the clock projection's draw. The SHIPPED pooled renderer,
   handed the selected factor's events, and — once a row is picked — that
   event's captured day and the lens's own alignment window as the brace. At the
   queue root every one of those is empty, which is byte-identical to the call
   round 5 made and is what keeps the queue-root option diff at zero. */
/* ROUND 8, ITEM 2 — SELECTING AN OCCURRENCE NEVER MOVES THE WINDOW.
   Rounds 1-7 handed the pooled renderer a `window` and a `windowLabel` built
   around the drilled event, so every pick re-aimed the reader's viewport and
   the brace read `Aug 12 · 02:00 00:00-04:00`. The clock window is the READER'S
   control — it is what the toolbar's WINDOW group sets, and it decides which
   events are in play. Selecting one of those events shows that event's
   evidence; it does not reset the viewport. Neither argument is passed at all
   any more, so the pooled chart keeps `payload.window` at every level and there
   is no code path left that could move it. The term is written down in
   data.json (`terms.selection_never_moves_the_window`) and harness.mjs asserts
   the window and the x-extent are byte-identical across a row click.

   What a selection still does: draw that day's trace, and mark that event on
   the canvas — both below. */
function paintPooledCanvas() {
  const active = frame();
  const dots = active?.clock?.occurrences || [];
  const drill = highlighted ? data.clockDrills[highlighted] : null;
  paintPooled({
    ...pooledHosts,
    occurrences: dots,
    trace: drill ? data.dayTraces[drill.day] : null,
  });
  markCanvas(dots);
}

/* ROUND 8 — THE EMPHASIS LAYER, OVER THE SHIPPED SCATTER, NEVER INSTEAD OF IT.
 *
 * Two marks the reader needs and the shipped `renderCanvas` has no input for:
 * which verdict they are reading, and which occurrence they picked. Round 6
 * declined to re-style the shipped occurrence series per state rather than fork
 * the renderer, and that still holds — so neither is drawn by changing it.
 * Both are ONE ADDED SERIES, appended over the shipped scatter:
 *
 *   the drilled verdict  those dots again, larger and in the accent, ON TOP of
 *                        the shipped ones. NOTHING IS REMOVED and nothing is
 *                        dimmed: all three verdicts stay plotted exactly as the
 *                        shipped renderer drew them, so the canvas keeps one
 *                        stable denominator and the other occurrences stay
 *                        readable as the context around the ones being read.
 *   the selected event   a ring at that dot, as the layer's own markPoint.
 *
 * Every coordinate is read back off the shipped series' own data rather than
 * recomputed, so the two layers cannot drift apart. ECharts' emphasis/highlight
 * machinery is deliberately NOT used: `renderCanvas` disables emphasis on every
 * series it builds (`noHoverFade`), and re-enabling it would put a canvas
 * consequence back on hover, which round 7 settled as forbidden.
 *
 * Skipped entirely at the queue root, where nothing is selected — an appended
 * series there would show up as drift against the app's own pooled chart.
 * `renderCanvas` sets its option with `notMerge`, so every repaint clears this
 * layer and it is re-appended from the current state, or not at all. */
function markCanvas(dots) {
  if (!scene()) return;
  const option = pooledChart.getOption();
  const index = option.series.findIndex((s) => s.name === 'Occurrences');
  if (index < 0) return;
  const plotted = option.series[index].data || [];
  const at = (i) => plotted[i]?.value;
  /* Only where there IS a split to read. A frame with one group draws no band,
     and emphasising every dot on the plot against nothing is a colour change
     dressed as a distinction. */
  const split = (frame()?.occurrences.groups.length || 0) > 1;
  const focus = split
    ? dots.reduce((acc, d, i) => (d.cohort === verdict && at(i) ? [...acc, at(i)] : acc), [])
    : [];
  const picked = highlighted ? dots.findIndex((d) => d.id === highlighted) : -1;
  const ink = (name) => getComputedStyle(surface).getPropertyValue(name).trim();
  /* Merge is by index, so the array is padded to the shipped series' own length
     and the layer lands one past the end. */
  const series = Array.from({ length: option.series.length + 1 }, () => ({}));
  series[option.series.length] = {
    name: 'fer-emphasis', type: 'scatter', z: 12, silent: true, animation: false,
    data: focus,
    symbol: 'circle', symbolSize: 11,
    itemStyle: { color: ink('--ck-accent'), borderColor: ink('--mk-surface'), borderWidth: 1.5 },
    markPoint: picked >= 0 && at(picked)
      ? {
        silent: true, animation: false, symbol: 'circle', symbolSize: 19, z: 13,
        itemStyle: { color: 'transparent', borderColor: ink('--mk-text'), borderWidth: 2 },
        data: [{ coord: at(picked) }],
      }
      : { data: [] },
  };
  pooledChart.setOption({ series });
}

/** Which pane is mounted: the pooled chart under `By clock` and at the queue
    root, the lens under `By event`. */
const showingClock = () => !scene() || projection === 'clock';

/* ROUND 7, ITEM 1 — THE TOOLBAR'S TWO STANDING GROUPS. `View` and `Window` are
   the shipped instruments, and the mock does not drive either: its data IS the
   Lows view over the 24 h window, and nothing on this surface re-scopes it. So
   each group prints its standing coordinate pressed and takes no handler — a
   button that silently did nothing would be the worse lie. Both lists come from
   the shipped modules through build.mjs; neither is written here. */
function paintStandingInstruments() {
  for (const [id, group] of [['fer-seg-view', data.toolbar.view], ['fer-seg-window', data.toolbar.window]]) {
    el(id).innerHTML = group.options.map((o) => `
      <button type="button" aria-pressed="${group.standing === o.key}">${o.label}</button>`).join('');
  }
}

/* ROUND 7, ITEM 1 — ALIGN, THE TOOLBAR'S THIRD GROUP. Same `cap` + `seg` form
   as the two above; only its visibility differs, and that rule is unchanged
   from round 6 — absent at the queue root, where nothing is selected to
   re-project (the amendment's rule, not a disabled state). */
function paintProjection() {
  const on = Boolean(scene());
  const group = el('fer-align');
  group.hidden = !on;
  if (!on) { el('fer-seg-align').innerHTML = ''; return; }
  el('fer-align-cap').textContent = data.projection.label;
  const seg = el('fer-seg-align');
  seg.innerHTML = data.projection.options.map((o) => `
    <button type="button" data-proj="${o.key}" aria-pressed="${projection === o.key}">${o.label}</button>`).join('');
  for (const node of seg.querySelectorAll('[data-proj]')) {
    node.addEventListener('click', () => selectProjection(node.dataset.proj));
  }
}

/** Re-project. The selection does not move: the same factor, the same drilled
    event, drawn on the other axis. */
function selectProjection(key) {
  if (projection === key) return;
  projection = key;
  paintCanvas();
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
  /* ROUND 6, FORM 3 — WHICH pane is mounted is now the projection's answer, not
     the level's. The queue root has no projection to make and stands on the
     pooled chart; a drilled case file stands on whichever projection the head's
     toggle is set to. */
  surface.dataset.canvas = showingClock() ? 'pooled' : 'lens';
  paintProjection();
  if (showingClock()) {
    paintPooledCanvas();
    pooledChart.resize();
    if (!current) return;
  }
  if (!canvas) {
    el('canvas-title').textContent = active.empty.head;
    el('canvas-persist').textContent = active.empty.context;
    legend.innerHTML = '';
    paintReadout(surface, null, null);
    chart.setOption(emptyOption(surface, active,
      current.frames[current.defaultFactor].canvas.alignmentWindow,
      current.frames[current.defaultFactor].canvas.axisAnchor), true);
    if (!showingClock()) chart.resize();
    return;
  }
  el('canvas-title').textContent = current.canvasHead.title;
  el('canvas-persist').textContent = current.canvasHead.context;
  legend.innerHTML = legendMarkup(canvas);
  /* The lens is kept painted whichever projection is mounted — it is the same
     selection either way, and a chart that only exists while it is visible
     cannot be audited. Only the MOUNTED one is resized: an ECharts instance
     resized inside a `display: none` host would take that host's zero. */
  paintChart();
  if (!showingClock()) chart.resize();
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
/* ROUND 8, ITEM 1 — `rowMarkup`, `occurrenceTable` and `measureFit` ARE
 * DELETED. Between them they were the mock's own table: a transcribed row
 * spine, a grouping-and-budget loop, and a measured row limit. The operator's
 * ruling replaces all three with the production Diagnose evidence table, which
 * arrives whole in `evidence-table.extracted.js` and is called below.
 *
 * WIREFRAME H3 IS THE VERDICT'S FORM (the operator's pick over H1 and H2, for
 * the pop of colour, the light read of the split, and because drilling into
 * `Near rule` and `Rule did not match` suits a reader for whom those are much
 * less interesting than `Rule matched`). The three flat section headers over
 * one long list are retired.
 *
 * The band states the split proportionally — one 10px row divided by count —
 * and the roster below it is exactly one verdict's occurrences. `Rule matched`
 * rests. It scopes the ROSTER ONLY: the canvas keeps drawing all three
 * verdicts, and drilling emphasises one set rather than removing two
 * (`markCanvas`, and the term in data.json). A frame with one group draws no
 * band, because there is no split to state. */
function bandMarkup(active) {
  const { groups, bandCaveat } = active.occurrences;
  if (groups.length < 2) return '';
  const seg = (g) => `aria-pressed="${g.key === verdict}" data-verdict="${g.key}"`;
  return `
    <div class="fer-band">
      <div class="bar" role="group" aria-label="Verdict split"
           style="grid-template-columns:${groups.map((g) => g.count).join('fr ')}fr">
        ${groups.map((g) => `<button type="button" class="seg" ${seg(g)}
            aria-label="${g.lead} · ${g.count}"></button>`).join('')}
      </div>
      <div class="keys">
        ${groups.map((g) => `<button type="button" class="key" ${seg(g)}><span>${g.lead}</span>
            <span class="n">${g.count}</span></button>`).join('')}
      </div>
      <p class="caveat">${bandCaveat}</p>
    </div>`;
}

/** The group the roster is showing: the drilled verdict, or the frame's only
    group where there is no band to drill. */
const roster = (active) => active.occurrences.groups.find((g) => g.key === verdict)
  || active.occurrences.groups[0];

/** The order the production table lays a group out in — its own `fits` before
    its own `counter`, its own cap on the first of the two. Computed with the
    shipped `tierOf` rather than guessed, so the ids the mock stamps back onto
    the painted rows can never slide against them. */
const paintedOrder = (list, shownCount) => [
  ...list.filter((o) => tierOf(o)).slice(0, shownCount),
  ...list.filter((o) => !tierOf(o)),
];

/* ROUND 6, FORM 1 — THE FACTOR CONTROL, AS A COLLAPSING DROPDOWN.
 *
 * Round 5's segmented control is retired. It was the right object for three
 * factors and the wrong object for the ruling: selection is one-dimensional and
 * the factor list is OPEN-ENDED (the amendment asks for 6–10 without redesign),
 * and a one-row control that divides its width between its options cannot take a
 * fourth without ellipsising the third. The dropdown's rest state costs one line
 * whatever the list holds.
 *
 * REST is one line at the column's own register — current factor, its count in
 * tabular numerals, a chevron — reading as the column's working title.
 * EXPANDED it overlays the ledger rather than pushing it: pushing an 8-entry
 * list down the column would drive the first event rows past the fold and move
 * the floor dock, so a mis-tap costs the reader their place in the table.
 * Collapsing therefore restores the identical column. Choosing a factor,
 * clicking outside, or Esc all collapse it.
 *
 * It sits ABOVE `.level` in the inspector body, not inside it: `.level` is the
 * scrolling track, and a list inside it would scroll with the rows it overlays.
 *
 * The historical note below is round 5's, kept because it is why this is not a
 * stack of queue rows either.
 *
 * ROUND 5, BLOCK 2 — THE FRAME CONTROL, AS A SEGMENTED CONTROL.
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
/** The rest line and the list, built together and switched by ONE attribute.
 *
 * The list is in the DOM whether it is showing or not, and `data-open` on the
 * host is the only thing expanding it. Rebuilding the markup on toggle was
 * tried first and is wrong for a reason that only shows at runtime: the toggle
 * button's own click re-rendered the control, which detached the node the click
 * came from, and the outside-click listener then saw a target the host no
 * longer contained and collapsed the list in the same gesture that opened it. */
function paintFactorSelect() {
  const current = scene();
  const host = el('factor-select');
  const segments = current?.segments;
  factorOpen = factorOpen && Boolean(segments);
  host.hidden = !segments;
  if (!segments) { host.innerHTML = ''; return; }
  const chosen = segments.find((s) => s.key === frameKey) || segments[0];
  host.dataset.open = String(factorOpen);
  host.innerHTML = `
    <button type="button" class="fer-sel" aria-expanded="${factorOpen}" aria-haspopup="listbox">
      <span class="nm">${chosen.label}</span>
      <span class="ct">${chosen.count}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
    <div class="fer-sel-list" role="listbox" aria-label="${current.factorListHead}">
      <div class="lhead">${current.factorListHead}</div>
      ${segments.map((s) => `
        <button type="button" class="fer-sel-opt" role="option" data-key="${s.key}"
                aria-selected="${frameKey === s.key}">
          <span class="tick" aria-hidden="true">${frameKey === s.key ? '•' : ''}</span>
          <span class="lab">${s.label}</span><span class="ct">${s.count}</span>
        </button>`).join('')}
    </div>`;

  host.querySelector('.fer-sel').addEventListener('click', () => setFactorOpen(!factorOpen));
  for (const node of host.querySelectorAll('.fer-sel-opt')) {
    node.addEventListener('click', () => {
      setFactorOpen(false);
      selectFrame(node.dataset.key);
    });
  }
}

function setFactorOpen(open) {
  factorOpen = open;
  const host = el('factor-select');
  host.dataset.open = String(open);
  host.querySelector('.fer-sel')?.setAttribute('aria-expanded', String(open));
}

/* Auto-collapse: a choice (above), a click anywhere else, or Esc. Bound once at
   module level — the control repaints on every state change, and a listener per
   paint would stack. */
document.addEventListener('click', (e) => {
  if (factorOpen && !el('factor-select').contains(e.target)) setFactorOpen(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && factorOpen) setFactorOpen(false);
});

function paintLevel() {
  const current = scene();
  const level = el('level');
  if (!current) { paintQueue(); paintDock(); return; }
  const active = frame();
  const { subject, judgment, coincidence } = current;
  const { occurrences } = active;
  const group = roster(active);
  const shownCount = expanded ? Infinity : EVIDENCE_CAP;
  const { cap } = occurrences;

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

    <!-- ROUND 6, FORM 1 — the frame control has left this level entirely. It is
         the collapsing factor dropdown at the top of the column now, painted
         into its own host above the level by paintFactorSelect. -->

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

    <!-- ROUND 6, SEND-BACK 6 — THE COINCIDENCE, AS RESOLVED ROUTES. It was two
         sentences with two "View …" buttons set inside them: the last prose in
         the column, immediately above a table the amendment puts at dense
         register with no prose row over it. Block 6 already settled the form a
         route takes here — one right-aligned action, no sentence — so the two
         settings the band lands in take it, one action each, and the fact the
         prose carried (which band, how many of how many) stays as a figure line
         at the residue rank on the left. Nothing derived changed. -->
    ${coincidence ? `
    <div class="fer-coincide">
      <div class="slot-say">${coincidence.band}</div>
      <div class="fer-route">
        ${coincidence.routes.map((r) => `
          <button type="button" class="linkbtn">${r.label}</button>`).join('')}
      </div>
    </div>` : ''}

    <!-- ROUND 8, ITEM 1 — the verdict band (wireframe H3), then the cap, then
         ONE verdict's occurrences drawn by the production table. The cap's
         numerator is what the table draws right now, which under H3 is the
         drilled verdict — the settled rule ("the meta counts what the table
         draws") applied to a roster that is now one verdict long. -->
    ${bandMarkup(active)}
    <div class="lvl-cap fer-occ-cap">Occurrences<span class="meta">${cap.key} &nbsp;·&nbsp; ${group.count} of ${cap.denominator} in ${cap.window}</span></div>
    <div class="fer-table" id="occ-table"></div>
    <!-- ROUND 5, BLOCK 7 — THE RESIDUE, one unfilled line at the table's own
         left edge. It closes the section: the production table brings its own
         expander, and that expander belongs to the rows it caps. -->
    ${occurrences.residue ? `<div class="fer-residue">${occurrences.residue}</div>` : ''}`;

  /* THE PRODUCTION TABLE, PAINTING ITSELF. `factor.cause` is the causal phrase
     its group header prints; `onMore` is its own two-way expander; `shownCount`
     is its own cap. Nothing here decides a row's date format, its Δ sign or its
     tier word. */
  const host = el('occ-table');
  renderEvidence(host, { cause: group.cause || '' }, group.occurrences,
    (occ) => select(highlighted === occ.id ? null : occ.id),
    () => { expanded = !expanded; paintLevel(); },
    shownCount);

  /* Two stamps the shipped painter has no reason to make, applied to the rows
     it painted rather than by editing it:

     `data-selected`  the mock's one selection register (round 7, item 3) — the
                      app drills a row into a third level instead, and has no
                      selected state for one.
     `title` REMOVED  round 7, item 3c: the shipped row carries the occurrence's
                      sentence as a native tooltip, so the browser popped it over
                      the surface on every row the pointer crossed. Hover does
                      nothing on this surface, and that is settled. */
  paintedOrder(group.occurrences, shownCount).forEach((occ, i) => {
    const node = host.querySelectorAll('.ev-row')[i];
    if (!node) return;
    node.dataset.id = occ.id;
    node.dataset.selected = String(highlighted === occ.id);
    node.removeAttribute('title');
  });

  /* The route out of a population case file. Scoped to `.fer-route` because the
     coincidence routes above take the shipped `.linkbtn` and go nowhere in this
     exploration, exactly as they did in round 5. */
  level.querySelector('.fer-route .fer-open')
    ?.addEventListener('click', (e) => go(e.currentTarget.dataset.open));

  /* ROUND 8, ITEM 1 — the band's two controls, bar and key, drilling the same
     verdict. Round 7's row click handler is gone: the production table binds its
     own rows to `onOpen` above, which is where a lifted painter's click belongs. */
  for (const node of level.querySelectorAll('.fer-band [data-verdict]')) {
    node.addEventListener('click', () => selectVerdict(node.dataset.verdict));
  }

  paintDock();
}

/** Drill the band. It scopes the ROSTER: the table redraws for that verdict and
    the canvas emphasises its dots without dropping the other two verdicts'.
    The selection clears, because the occurrence that was selected is not in the
    roster any more — and the window still does not move. */
function selectVerdict(key) {
  if (verdict === key) return;
  verdict = key;
  highlighted = null;
  expanded = false;
  paintLevel();
  paintCanvas();
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
  verdict = restingVerdict();
  highlighted = null;
  expanded = false;
  paintFactorSelect();
  paintCanvas();
  paintLevel();
}

/** THE RESTING VERDICT: `Rule matched` where the frame has one (wireframe H3's
    rule), otherwise the frame's only group. Never stored — it is a property of
    the frame, and a stored copy is a thing that can go stale against it. */
function restingVerdict() {
  const groups = frame()?.occurrences.groups || [];
  return (groups.find((g) => g.key === 'fired') || groups[0])?.key ?? null;
}

/** SELECT AN OCCURRENCE. Evidence only: the lens redraws with that event's
    trace highlighted, the clock projection draws that event's day and marks the
    dot — and the window does not move (round 8, item 2, and the term in
    data.json). Clicking the selected row again clears it. */
function select(id) {
  if (highlighted === id) return;
  highlighted = id;
  paintChart();
  if (showingClock()) paintPooledCanvas();
  paintLevel();
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
  verdict = id ? restingVerdict() : null;
  highlighted = null;
  expanded = false;
  factorOpen = false;
  paintCrumb();
  paintFactorSelect();
  paintCanvas();
  paintLevel();
}

/* The two standing instruments are painted ONCE: nothing on this surface can
   move the view or the window, so nothing can change them. */
paintStandingInstruments();
go(null);

/* Screenshot hooks for harness.mjs — they drive the surface's own routing and
   selection without synthetic pointer events, so captured frames are
   deterministic and no state exists that a reader could not reach. */
window.__ferGo = go;
window.__ferFrame = selectFrame;
/* ROUND 6 — the two new controls, driven the same way: the harness presses what
   a reader presses rather than reaching into state. */
window.__ferProject = selectProjection;
window.__ferFactorOpen = setFactorOpen;
window.__ferSelect = (id) => select(id);
/* ROUND 8, ITEM 1 — the band, driven the way a reader drives it. */
window.__ferVerdict = selectVerdict;
window.__ferChart = chart;
/* ROUND 5, WORKSTREAM A — the queue root's pooled chart, published so
   harness.mjs can read its live `getOption()` and diff it against the running
   app's own. A chart nobody can dump is a chart nobody can audit. */
window.__ferPooled = pooledChart;
window.__ferReady = true;
