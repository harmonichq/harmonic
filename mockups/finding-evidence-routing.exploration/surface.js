/* Stamps the scene's DOM. Every element below is the SHIPPED grammar for what it
 * is — the markup strings are transcribed from the module that owns them:
 *
 *   .crumb / .trail / .here / .chev          diagnose-workstation.js drawTrail
 *   .q / .qrow / .lab / .tag / .gly / .den   diagnose-findings-queue.js renderFindingsQueue
 *   .who / .statline                          diagnose-workstation.js renderFactorHead
 *   .clock / .cap / .bars / .axis             diagnose-workstation.js renderClockInto
 *   .slotlink / .linkbtn                      diagnose-workstation.js renderFactorHead
 *   .lvl-cap / .ev-group / .ev-row / .more    diagnose-workstation.js renderEvidence
 *   .watch / .kind / .what / .how             watched-change-dock.js paintWatchDock
 *   .ec-counts / .ec-count / .ec-boundary-note  diagnose-event-comparison.js paintInspector
 *   .ec-chart-key / .ec-key-item              diagnose-event-comparison.js paintLegend
 *
 * No text below is authored: every string comes out of data.json, which build.mjs
 * derived from the two fixtures through their shipped producers.
 */
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
el('canvas-context').textContent = data.canvas.factorLabel;
el('canvas-persist').textContent = data.canvas.context;
el('ec-chart-key').innerHTML = legendMarkup(data);

const surface = document.querySelector('.fer-surface');
const chart = window.echarts.init(el('ec-chart'), null, { renderer: 'canvas' });
let highlighted = null;
const paintChart = () => chart.setOption(chartOption(surface, data, highlighted), true);
paintChart();

chart.on('updateAxisPointer', (event) => paintReadout(surface, event.axesInfo?.[0]?.value, data));
chart.getZr().on('globalout', () => paintReadout(surface, null, data));
new ResizeObserver(() => chart.resize()).observe(el('ec-chart'));

/* ------------------------------------------------------- crumb + scope chip */
/* drawTrail's shape: ancestors are buttons, the leaf is an inert `.here`. */
const trail = el('crumb-trail');
const root = document.createElement('button');
root.type = 'button';
root.textContent = data.crumb.root;
trail.append(root);
trail.insertAdjacentHTML('beforeend', '<span class="chev" aria-hidden="true">›</span>');
const here = document.createElement('span');
here.className = 'here';
here.setAttribute('aria-current', 'page');
here.textContent = data.crumb.here;
trail.append(here);

/* NOTE — the crumb carries no meta in this scene. The row cannot hold the path,
   the scope chip and the shipped meta at 430px (461px of content), and the chip
   is the retired FILTER instrument the ruling re-homed here. `data.crumb.meta`
   ("30 days", the projection's own run) is therefore built but NOT rendered:
   an open round-2 question, not a silent drop. */

const chip = el('scope-chip');
chip.append(`${data.chip.label} · ${data.chip.count}`);
const clear = document.createElement('button');
clear.type = 'button';
clear.className = 'x';
clear.textContent = '×';
clear.title = data.chip.title;
clear.setAttribute('aria-label', data.chip.title);
chip.append(clear);

/* ------------------------------------------------------------- the dock floor */
const dock = el('watch-dock');
dock.dataset.state = 'idle';
dock.innerHTML = '';
for (const [cls, text] of [['kind', data.dock.kind], ['what', data.dock.title], ['how', data.dock.detail]]) {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  dock.append(span);
}

/* --------------------------------------------------------------- the level */
const level = el('level');
let expanded = false;

function paintLevel() {
  const { header, judgment, clock, occurrences } = data;
  const rows = expanded ? occurrences.rows : occurrences.rows.slice(0, occurrences.cap);

  level.innerHTML = `
    <!-- (1) the finding header, VERBATIM from the projection: this is the queue
         row the reader clicked, re-rendered in place as the case file's subject. -->
    <div class="q">
      <div class="qrow" data-state="finding" data-tier="priced" data-id="finding:over_treated_low">
        <span class="lab">${header.title}</span>
        <span class="tag ${header.flavor}"><span class="gly" aria-hidden="true">${header.flavorGlyph}</span>${header.flavorWord}</span>
        <span class="den">${header.appearances.map(({ count, noun }, i) =>
          `${i ? '<span class="sep">·</span>' : ''}<span class="v">${count}</span> ${noun}`).join('')}</span>
      </div>
    </div>

    <div class="inner">
      <!-- (2) the judgment block, absorbed from the retired lens inspector pane
           and re-set on the workstation's own spine and type ranks. -->
      <div class="slot-say">${judgment.summary}</div>
      <div class="ec-counts">${judgment.counts.map((c) => `
        <div class="ec-count"><b>${c.n}</b>${c.label}<em>${c.support}</em></div>`).join('')}</div>
      <p class="ec-boundary-note"><b>${judgment.boundaryNote.lead}</b>${judgment.boundaryNote.rest}</p>

      <!-- (3) WHEN IT LANDS, as the shipped drill level draws it. -->
      <div class="clock">
        <div class="cap">When it lands<em>${clock.capMeta}</em></div>
        <div class="bars">${clock.buckets.map((b) => `
          <div data-n="${b.n}" data-peak="${b.peak}" title="${b.title}">
            ${b.n ? `<span class="n">${b.n}</span>` : ''}
            <i style="height:${b.n ? Math.max(8, (b.n / clock.max) * 100) : 2}%"></i>
          </div>`).join('')}</div>
        <div class="axis">${clock.buckets.map((b) => `<span>${b.axis}</span>`).join('')}</div>
      </div>
      <div class="slotlink">
        <span>${clock.coincidence.slotText}</span><button type="button" class="linkbtn">View slot</button>
        <span>${clock.coincidence.blockText}</span><button type="button" class="linkbtn">View segment</button>
      </div>
    </div>

    <!-- (4) the occurrences table — the rows ARE the selection mechanism. -->
    <div class="lvl-cap">Occurrences<span class="meta">${occurrences.capMeta}</span></div>
    <div class="ev-group"><b>${occurrences.groupLead}</b> — ${occurrences.groupTier}, not confirmed
      <span class="n">${occurrences.groupCount}</span></div>
    ${rows.map((r) => `
      <button type="button" class="ev-row" data-id="${r.id}" data-counter="false"
              data-selected="${highlighted === r.id}" title="${r.title}">
        <span class="when">${r.when}</span>
        ${r.both
          ? `<span class="entry">${r.entry}</span><span class="arrow" aria-hidden="true">→</span>
             <span class="worst">${r.worst}</span><span class="delta">${r.delta}</span>`
          : `<span class="only">${r.only} <span>· extreme only</span></span>`}
        <span class="tier">${r.tier}</span>
        <span class="chev" aria-hidden="true">›</span>
      </button>`).join('')}
    ${occurrences.moreLabel
      ? `<button type="button" class="more">${expanded ? occurrences.backLabel : occurrences.moreLabel}</button>`
      : ''}`;

  level.querySelector('.more')?.addEventListener('click', () => { expanded = !expanded; paintLevel(); });

  /* Row ⇄ trace: hover previews, click pins. Two reads of one selection. */
  for (const node of level.querySelectorAll('.ev-row')) {
    const id = node.dataset.id;
    node.addEventListener('mouseenter', () => select(id, false));
    node.addEventListener('focus', () => select(id, false));
    node.addEventListener('mouseleave', () => { if (!pinned) select(null, false); });
    node.addEventListener('click', () => { pinned = pinned === id ? null : id; select(pinned, true); });
  }
}

let pinned = null;

function select(id, repaintRows) {
  if (highlighted === id) return;
  highlighted = id;
  paintChart();
  if (repaintRows) { paintLevel(); return; }
  for (const node of level.querySelectorAll('.ev-row')) {
    node.dataset.selected = String(node.dataset.id === id);
  }
}

paintLevel();

/* Screenshot hook for harness.mjs — drives the linked-highlight state without a
   synthetic pointer event, so the captured frame is deterministic. */
window.__ferSelect = (id) => { pinned = id; select(id, true); };
window.__ferChart = chart;
window.__ferReady = true;
