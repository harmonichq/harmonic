/* THE QUEUE ROOT'S CANVAS — the pooled glucose chart, LIFTED, not rebuilt.
 *
 * ROUND 5, WORKSTREAM A. Round 4 unmounted the canvas pane at queue level on
 * the grounds that the queue had nothing to answer with. That answered the
 * MOCK's limitation — round 3 had put a title over 1010px of empty ground — and
 * not the #31 ruling, whose queue-root canvas IS the pooled glucose chart. The
 * shipped app has had that chart all along, so this module lifts it rather than
 * inventing a queue-level canvas.
 *
 * WHAT IS REUSED (imported, executed, never copied):
 *   frontend/diagnose-workstation-chart.js  renderCanvas  — the whole draw: two
 *       grids, the legend, the target band and its knock-out labels, the window
 *       markArea and its fitted rich-text label, both envelope band pairs, the
 *       hairline p25/p75 edges, the median and its axis-riding value tags, the
 *       occurrence scatter, the meal track, and the docked-readout wiring.
 *   frontend/diagnose-workstation-chart.js  windowStats, buildSlotLane
 *   frontend/diagnose-workstation-data.js   envelopeFromPooled, markersFromPooled
 *   frontend/diagnose-workstation.js        resolveColors
 *
 * Every one of those is the module's own exported entry point, so the mock's
 * pooled chart is the app's pooled chart running on the app's own fixture, and
 * harness.mjs's queue-root option probe diffs it against the running app's live
 * `getOption()` to prove it.
 *
 * WHAT IS TRANSCRIBED, and why each one had to be (all four are module-private
 * in frontend/diagnose-workstation.js — there is no export to import):
 *   (T1) `chartColors`      — the colour builder renderCanvas consumes.
 *   (T2) `VERDICT_KEY` / `VERDICT_SHORT` — the verdict wording.
 *   (T3) `keySwatch` + `renderLane` — the basal verdict lane's cells.
 *   (T4) `paintReadout`     — the docked header readout renderCanvas feeds.
 * Each is a byte transcription with its source named at the transcription, held
 * honest by harness.mjs's computed-style diff on the elements they produce and
 * by the chart-option diff on what renderCanvas does with (T1).
 *
 * TWO DELIBERATE OMISSIONS, named here and in the report:
 *   (a) NO BRACE, NO DRAG, NO PRESETS. The window instruments are exactly what
 *       the #31 ruling retires, so the queue root stands on the 24 h preset and
 *       nothing on this surface can move it. The window markArea therefore spans
 *       the whole plot, which is the shipped chart's own rendering of that
 *       preset — not a special case built here.
 *   (b) NO I:C LANE. The ruling names the basal verdict lane; the shipped stack
 *       carries a second row of I:C blocks beneath it, and `renderLaneKey`'s
 *       lead-word grammar exists to tell the two apart. With one lane the lead
 *       word is doing nothing, so the key prints the basal group alone. That is
 *       a divergence from the shipped two-row stack and is reported as one.
 */
import {
  renderCanvas, windowStats, buildSlotLane,
} from '../../frontend/diagnose-workstation-chart.js';
import {
  envelopeFromPooled, markersFromPooled,
} from '../../frontend/diagnose-workstation-data.js';
import { resolveColors } from '../../frontend/diagnose-workstation.js';

/* (T1) VERBATIM — diagnose-workstation.js `chartColors`, which is module-private
   there. `root` is the workstation element that DECLARES the tokens (`.dw`),
   which is the port deviation that rule already carries; here that element is
   the exploration's own `.fer-surface`, which is a `.dw`. */
const chartColors = (root) => {
  const c = resolveColors();
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  const bandOuterMix = getComputedStyle(root).colorScheme === 'dark' ? '26%' : '13%';
  return {
    ...c,
    surface2: c['surface-2'],
    rail: css('--ck-rail'),

    grid: `color-mix(in srgb, ${c.line} 80%, transparent)`,
    gridStrong: c.line,
    bandOuter: `color-mix(in srgb, ${c.primary} ${bandOuterMix}, transparent)`,
    bandInner: `color-mix(in srgb, ${c.primary} 38%, transparent)`,
    bandEdge: `color-mix(in srgb, ${c.primary} 55%, transparent)`,
    median: c['primary-600'] || c.primary,
    onAccent: css('--mk-on-primary'),
    meal: css('--ck-meal'),
    mealEdge: c.surface,
    occurrence: c['primary-600'] || c.primary,
    targetFill: `color-mix(in srgb, ${c.ok} 8%, transparent)`,
    targetEdge: `color-mix(in srgb, ${c.ok} 55%, transparent)`,
    targetText: `color-mix(in srgb, ${c.ok} 85%, ${c.text})`,
    windowFill: `color-mix(in srgb, ${c.primary} 8%, transparent)`,
    windowEdge: `color-mix(in srgb, ${c.primary} 72%, transparent)`,
  };
};

/* (T2) VERBATIM — diagnose-workstation.js `VERDICT_KEY` / `VERDICT_SHORT`. */
const VERDICT_KEY = {
  up: 'suggests a raise', down: 'suggests a lower', hold: 'holds at current',
  insufficient: 'insufficient evidence', nodata: 'no clean data',
};
const VERDICT_SHORT = {
  up: 'raise', down: 'lower', hold: 'hold',
  insufficient: 'insufficient', nodata: 'no data',
};

/* (T3) VERBATIM — diagnose-workstation.js `keySwatch`. */
function keySwatch(k) {
  return k === 'insufficient'
    ? 'box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ck-insuff) 75%,transparent)'
    : k === 'nodata'
      ? 'box-shadow:inset 0 0 0 1px var(--ck-hair)'
      : k === 'hold'
        ? 'background:color-mix(in srgb,var(--ck-hold) 34%,transparent)'
        : k === 'down'
          ? 'background:color-mix(in srgb,var(--mk-danger) 72%,transparent)'
          : 'background:color-mix(in srgb,var(--ck-up) 72%,transparent)';
}

/* (T3) diagnose-workstation.js `renderLane`, with the host passed rather than
   looked up by id, and WITHOUT the staging / selection state: nothing on this
   surface stages a slot or picks a cell, so `data-staged` and `aria-pressed`
   would both be constants. The verdict tint, the grid, the title and the
   aria-label are the shipped ones. */
function renderLane(host, lane) {
  host.style.gridTemplateColumns = `repeat(${lane.cells.length}, 1fr)`;
  host.innerHTML = '';
  for (const cell of lane.cells) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.verdict = cell.verdict;
    b.title = `${cell.label} · ${VERDICT_KEY[cell.verdict]}`;
    b.setAttribute('aria-label', `${cell.label} basal slot, ${VERDICT_KEY[cell.verdict]}`);
    host.append(b);
  }
}

/* (T3) diagnose-workstation.js `renderLaneKey`, basal group only — see omission
   (b) in this file's header. The `group` closure, the verdict order, the swatch
   and the `<b class="t">` count are the shipped ones. */
function renderLaneKey(host, lane) {
  const order = ['up', 'down', 'hold', 'insufficient', 'nodata'];
  host.innerHTML = `<span class="lead">Basal slots</span>${
    order.filter((k) => lane.counts[k]).map((k) => `<span title="${VERDICT_KEY[k]}">`
      + `<i style="${keySwatch(k)}"></i>${VERDICT_SHORT[k]} <b class="t">${lane.counts[k]}</b></span>`).join('')}`;
}

/* diagnose-workstation.js `rdNum` / `rdVerdict`, which `paintReadout` calls. */
const rdNum = (v) => (v == null ? '--' : String(Math.round(v)));

/* (T4) diagnose-workstation.js `paintReadout`, with the head passed in rather
   than looked up by a document-wide id, because this surface carries a SECOND
   canvas head (the lens's) and an id lookup would find whichever came first.
   The verdict ink on the median is dropped with the target it was measured
   against: the shipped `rdVerdict` reads the workstation's live target range
   state, which this surface has no instrument to change. Named as a divergence.
*/
function paintReadout(head, r) {
  const el = (id) => head.querySelector(`#${id}`);
  if (!r) { head.dataset.hover = '0'; return; }
  const stats = r.kind === 'bin';
  for (const id of ['rd-p-med', 'rd-p-iqr', 'rd-p-band', 'rd-p-n']) {
    el(id).style.display = stats ? '' : 'none';
  }
  el('rd-time').textContent = r.label;
  if (stats) {
    el('rd-med').textContent = rdNum(r.p50);
    el('rd-iqr').textContent = `${rdNum(r.p25)}–${rdNum(r.p75)}`;
    el('rd-band').textContent = `${rdNum(r.p10)}–${rdNum(r.p90)}`;
    el('rd-n').textContent = r.n == null ? '--' : String(r.n);
    el('rd-note').textContent = '';
  } else {
    el('rd-note').textContent = r.note || '';
  }
  head.dataset.hover = '1';
}

/**
 * Draw the queue root's pooled glucose canvas and its basal verdict lane.
 *
 * `payload` is `data.queue.canvas` — the workstation fixture's own
 * `evidence.pooled`, `analyze.basal` and `evidence.target_range`, handed across
 * raw by build.mjs. Everything between that and the pixels is shipped code.
 *
 * Returns the ECharts instance so the caller can resize it with the pane.
 */
export function paintPooled({ surface, head, chartHost, laneHost, keyHost, payload }) {
  const envelope = envelopeFromPooled(payload.pooled);
  const markers = markersFromPooled(payload.pooled);
  const lane = buildSlotLane(payload.basal);
  const stats = windowStats(envelope, payload.window);
  const colors = chartColors(surface);

  renderLane(laneHost, lane);
  renderLaneKey(keyHost, lane);

  const chart = renderCanvas(chartHost, window.echarts, {
    envelope,
    markers,
    colors,
    stats,
    /* No `target`: the shipped workstation passes none and lets `renderCanvas`
       fall through to its own [70, 180]. */
    window: payload.window,
    windowLabel: payload.windowLabel,
    /* No factor is drilled at the queue root, so there are no occurrence marks
       and no single day's trace to lay over the pooling. The shipped renderer
       treats both as absent and drops them from the legend on its own. */
    occurrences: [],
    onHover: (r) => paintReadout(head, r),
  });

  /* The two provenance readouts the shipped head carries — the window's own
     reading count against the capture's, and the pooling terms. Both are the
     shipped strings, built from the shipped `windowStats` / envelope fields. */
  head.querySelector('#dw-scope').textContent =
    `window ${stats.readings.toLocaleString()} of ${envelope.readings.toLocaleString()} readings`;
  head.querySelector('#dw-pool').textContent =
    `pooled from ${envelope.days} captured CGM days · ±${envelope.pool} min`;

  return chart;
}
