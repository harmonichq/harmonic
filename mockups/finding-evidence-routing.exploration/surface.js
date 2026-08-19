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
/* `sceneId` is null at the queue and a scene key when drilled; `highlighted` is
   the ONE occurrence whose trace is on the canvas; `pinned` survives the pointer
   leaving the row. Three variables, and the whole surface is a function of them. */
let sceneId = null;
let highlighted = null;
let pinned = null;
let expanded = false;

const scene = () => (sceneId ? data.scenes[sceneId] : null);
const sceneCanvas = () => scene()?.canvas || null;

function paintChart() {
  const canvas = sceneCanvas();
  if (!canvas) return;
  chart.setOption(chartOption(surface, canvas, highlighted), true);
}

function paintCanvas() {
  const current = scene();
  const placeholder = el('canvas-placeholder');
  const legend = el('ec-chart-key');
  if (!current) {
    el('canvas-title').textContent = data.rootCanvas.title;
    el('canvas-persist').textContent = data.rootCanvas.context;
    placeholder.textContent = data.rootCanvas.note;
    placeholder.hidden = false;
    chartHost.hidden = true;
    legend.hidden = true;
    legend.innerHTML = '';
    paintReadout(surface, null, null);
    return;
  }
  el('canvas-title').textContent = current.canvas.title;
  el('canvas-persist').textContent = current.canvas.context;
  placeholder.hidden = true;
  chartHost.hidden = false;
  legend.hidden = false;
  legend.innerHTML = legendMarkup(current.canvas);
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
  level.insertAdjacentHTML('beforeend', `
    <div class="lvl-cap">${data.queue.populationCap}</div>
    <div class="q fer-population">
      ${data.queue.populationRows.map((row) => `
        <button type="button" class="qrow" data-state="population" data-tier="tail"
                data-id="${row.id}" data-drills="${row.drills}">
          <span class="lab">${row.title}</span>
          <span class="go" aria-hidden="true">›</span>
          <span class="den"><span class="v">${row.count}</span> ${row.noun}<span class="sep">·</span>${row.window}</span>
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
function occurrenceRows(current) {
  const { occurrences } = current;
  const rows = expanded ? occurrences.rows : occurrences.rows.slice(0, occurrences.cap);
  return rows.map((r) => `
    <button type="button" class="ev-row" data-id="${r.id}" data-counter="false"
            data-selected="${highlighted === r.id}"
            data-route="${r.target ? 'finding' : current.kind === 'population' ? 'none' : 'self'}"
            title="${r.title}">
      <span class="when">${r.when}</span>
      ${r.both
        ? `<span class="entry">${r.entry}</span><span class="arrow" aria-hidden="true">→</span>
           <span class="worst">${r.worst}</span><span class="delta">${r.delta}</span>`
        : `<span class="only">${r.only} <span>· extreme only</span></span>`}
      <span class="tier">${r.tag || r.tier}</span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`).join('');
}

function paintLevel() {
  const current = scene();
  const level = el('level');
  if (!current) { paintQueue(); return; }
  const { subject, judgment, coincidence, occurrences } = current;

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

    <div class="inner">
      <!-- The judgment block, absorbed from the retired lens inspector pane and
           re-set on the workstation's own spine and type ranks. Under a
           population subject the same block carries the population summary:
           how many, who claims them, and how many nothing claims. -->
      <div class="slot-say">${judgment.summary}</div>
      <div class="ec-counts">${judgment.counts.map((c) => `
        <div class="ec-count"><b>${c.n}</b>${c.label}<em>${c.support}</em></div>`).join('')}</div>
      <p class="ec-boundary-note"><b>${judgment.boundaryNote.lead}</b>${judgment.boundaryNote.rest}</p>

      ${coincidence ? `
      <!-- ROUND 2 ITEM 4 — "When it lands" is DELETED: no heading, no histogram,
           no peak line. The occurrences table below is the timing record. What
           survives is the pair of coincidence sentences, moved directly under
           the judgment block and standing on their own arithmetic. -->
      <div class="slot-say">${coincidence.share}</div>
      <div class="slotlink">
        <span>${coincidence.slotText}</span><button type="button" class="linkbtn">View slot</button>
        <span>${coincidence.blockText}</span><button type="button" class="linkbtn">View segment</button>
      </div>` : ''}
    </div>

    <!-- The occurrences table — the rows ARE the selection mechanism, and under
         a population subject each row's tag is its sideways route into the
         finding that claims it. -->
    <div class="lvl-cap">Occurrences<span class="meta">${occurrences.capMeta}</span></div>
    <div class="ev-group"><b>${occurrences.groupLead}</b>${occurrences.groupTier ? ` — ${occurrences.groupTier}, not confirmed` : ''}
      <span class="n">${occurrences.groupCount}</span></div>
    ${occurrenceRows(current)}
    ${occurrences.moreLabel
      ? `<button type="button" class="more">${expanded ? occurrences.backLabel : occurrences.moreLabel}</button>`
      : ''}
    <!-- The excluded events, in the shipped counter-group register: counted in
         the population above, and deliberately not rows, because they carry no
         comparable trace to select. It sits BELOW the expander so it cannot read
         as a member of the first five. -->
    ${occurrences.counterNote
      ? `<div class="ev-group counter">${occurrences.counterNote}</div>`
      : ''}`;

  level.querySelector('.more')?.addEventListener('click', () => { expanded = !expanded; paintLevel(); });

  /* Row ⇄ trace: hover previews the ONE trace, click pins it. Under a population
     subject a claimed row's click routes sideways into the claiming finding
     instead — the tag says which, and the chevron promises the route. */
  const byId = Object.fromEntries(occurrences.rows.map((r) => [r.id, r]));
  for (const node of level.querySelectorAll('.ev-row')) {
    const id = node.dataset.id;
    node.addEventListener('mouseenter', () => select(id, false));
    node.addEventListener('focus', () => select(id, false));
    node.addEventListener('mouseleave', () => { if (!pinned) select(null, false); });
    node.addEventListener('click', () => {
      const target = byId[id].target;
      if (target) { go(target); return; }
      pinned = pinned === id ? null : id;
      select(pinned, true);
    });
  }
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
window.__ferSelect = (id) => { pinned = id; select(id, true); };
window.__ferChart = chart;
window.__ferReady = true;
