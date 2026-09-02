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
 *       occurrence scatter, and the docked-readout wiring.
 *   frontend/diagnose-workstation-chart.js  windowStats, buildSlotLane,
 *       stripGlucoseRange
 *   frontend/diagnose-workstation-data.js   envelopeFromPooled
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
 *   (a) NO BRACE, NO DRAG, NO WIRED PRESETS — AN UNBUILT BEHAVIOUR, NOT A
 *       RULING. An earlier version of this note claimed "the window instruments
 *       are exactly what the #31 ruling retires". That was FALSE. #31 retires
 *       the lens instrument row (VIEW · FACTOR · FILTER), the event-comparison
 *       inspector pane and its occurrence dropdown, the dead `occurrenceModal`,
 *       and the I:C lane. It KEEPS the window control — ADR 31 part 3, "`WINDOW`
 *       stays, because a reader viewing by clock can also filter by clock" — and
 *       the #31 resolution amendment KEEPS the brace, migrating the day-trace
 *       overlay into the clock projection "with the window brace". The presets
 *       are drawn but unwired because this fixture holds a single 24 h window;
 *       the brace and its drag are simply not built here. The window markArea
 *       therefore spans the whole plot, which is the shipped chart's own
 *       rendering of that preset — not a special case built here. Ledger rows
 *       P01–P18, mockups/finding-evidence-routing.behavior.md.
 *   (b) NO I:C LANE. The ruling names the basal verdict lane; the shipped stack
 *       carries a second row of I:C blocks beneath it, and `renderLaneKey`'s
 *       lead-word grammar exists to tell the two apart. With one lane the lead
 *       word is doing nothing, so the key prints the basal group alone. That is
 *       a divergence from the shipped two-row stack and is reported as one.
 */
import {
  renderCanvas, windowStats, buildSlotLane, stripGlucoseRange,
} from '../../frontend/diagnose-workstation-chart.js';
import {
  envelopeFromPooled,
} from '../../frontend/diagnose-workstation-data.js';
import { resolveColors } from '../../frontend/diagnose-workstation.js';
import { Y_DOMAIN } from './chart.js';

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
  insufficient: 'insufficient evidence', nodata: 'no nights of steady data',
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
/* ROUND 9, FINDING 10 — THE STRIP COSTS ONE TAB STOP, NOT FORTY-EIGHT.
 *
 * Every cell was a plain `<button>`, so tabbing off the toolbar walked all 48
 * slots (`00:00 basal slot, holds at current` … ×48) before reaching the first
 * row of the queue — forty-eight stops of chart furniture standing between the
 * reader and the column the ruling calls the sole steering wheel. It is one
 * composite widget now, on the roving-tabindex pattern: the strip takes one
 * stop, the arrow keys walk the cells inside it, and Home / End reach the ends.
 * Nothing about what a cell IS changes — the verdict tint, the title and the
 * aria-label are the shipped ones, and the strip keeps its shipped role and
 * label. This is a DIVERGENCE from the shipped `renderLane`, which has no
 * roving behaviour, and it is reported as one. */
function renderLane(host, lane) {
  host.style.gridTemplateColumns = `repeat(${lane.cells.length}, 1fr)`;
  host.innerHTML = '';
  lane.cells.forEach((cell, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.verdict = cell.verdict;
    b.title = `${cell.label} · ${VERDICT_KEY[cell.verdict]}`;
    b.setAttribute('aria-label', `${cell.label} basal slot, ${VERDICT_KEY[cell.verdict]}`);
    b.tabIndex = i === 0 ? 0 : -1;
    host.append(b);
  });
  host.onkeydown = (e) => {
    const cells = [...host.querySelectorAll('button')];
    const at = cells.indexOf(document.activeElement);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: cells.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    const next = cells[Math.max(0, Math.min(cells.length - 1, to))];
    for (const c of cells) c.tabIndex = c === next ? 0 : -1;
    next.focus();
  };
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
 * Draw the pooled glucose canvas and its basal verdict lane.
 *
 * `payload` is `data.queue.canvas` — the workstation fixture's own
 * `evidence.pooled`, `analyze.basal` and `evidence.target_range`, handed across
 * raw by build.mjs. Everything between that and the pixels is shipped code.
 *
 * ROUND 6, FORM 3 — AND IT IS THE CLOCK PROJECTION, not only the queue root.
 * `By clock` re-projects the selected factor's events onto this same chart, so
 * the three optional inputs below are exactly the three the shipped renderer
 * already takes for that job and nothing here is new drawing code:
 *
 *   `occurrences` the factor's events, as the shipped occurrence scatter —
 *                 each at its own recorded clock minute and glucose value.
 *   `trace`       the drilled event's day, as the shipped `That day` line; with
 *                 it on the plot `renderCanvas` recedes the envelope on its own.
 *   `window`      the drilled event's alignment window, as the shipped window
 *                 brace, with `windowLabel` as its head — the same markArea the
 *                 24 h preset draws at the queue root.
 *
 * Re-calling this repaints in place: `renderCanvas` resolves the host through
 * `echarts.getInstanceByDom`, so every call returns the SAME instance.
 *
 * Returns the ECharts instance so the caller can resize it with the pane.
 */
export function paintPooled({
  surface, head, chartHost, laneHost, keyHost, payload,
  occurrences = [], trace = null, window: win = null, windowLabel = null,
  /* ROUND 9, FINDING 6 — what the selected day's key is called. Null at rest and
     at the queue root, where nothing is selected to name. */
  dayLabel = null,
}) {
  const envelope = envelopeFromPooled(payload.pooled);
  const lane = buildSlotLane(payload.basal);
  const drawn = win || payload.window;
  const stats = windowStats(envelope, drawn);
  const colors = chartColors(surface);

  renderLane(laneHost, lane);
  renderLaneKey(keyHost, lane);

  const chart = renderCanvas(chartHost, window.echarts, {
    envelope,
    colors,
    stats,
    range: stripGlucoseRange(envelope),
    // Private fixture mirror of the API's served basal_support_floor.
    supportFloor: 8,
    /* No `target`: the shipped workstation passes none and lets `renderCanvas`
       fall through to its own [70, 180]. */
    window: drawn,
    windowLabel: windowLabel || payload.windowLabel,
    /* At the queue root no factor is drilled, so there are no occurrence marks
       and no single day's trace to lay over the pooling — the shipped renderer
       treats both as absent and drops them from the legend on its own. Under
       the clock projection they are the factor's own events and, once a row is
       picked, that event's day. */
    occurrences,
    trace,
    onHover: (r) => paintReadout(head, r),
  });

  /* ================= ROUND 9, FINDING 5: THE CHART, EDITED =================
   *
   * The critique's charge against this canvas is that it is library output:
   * a domain nobody chose, a ladder nobody chose, four competing horizontal-rule
   * vocabularies, and every annotation dropped wherever there was room. All of
   * that is drawn by the SHIPPED `renderCanvas`, which this mock may not edit —
   * so it is edited the way everything else on this surface edits shipped
   * output: ONE OVERRIDE APPLIED OVER WHAT THE SHIPPED RENDERER DREW, reading
   * every value it keeps back off that renderer's own option rather than
   * recomputing it. `markCanvas` in surface.js is the same idiom.
   *
   * Five edits, each answering one clause of the finding:
   *
   *   (1) ONE DOMAIN, ONE LADDER. 40–300 at 60 becomes `Y_DOMAIN` — the same
   *       40–240 at 40 the lens now stands on, so the projection toggle stops
   *       re-scaling the axis and relabelling every tick. See chart.js for how
   *       the three numbers were measured. This is also what takes 70 and 180
   *       off the value ladder, leaving them as the band's own edges.
   *
   *   (2) NO MARQUEE. The window markArea carries a 1px [4, 3] dashed border,
   *       and the mock stands permanently on the 24 h preset — so that border
   *       ran all four sides of the plot and, on bone, read as a marquee
   *       selection rather than a frame. The window is the whole plot here;
   *       drawing an edge around the whole plot states nothing. The FILL stays,
   *       so the shipped highlight is still the shipped highlight.
   *
   *   (3) THE WINDOW CAPTION IS DOCKED. `24 H 00:00–24:00 · 25–75 spread 16
   *       mg/dL` floated in the empty upper region of the plot, attached to
   *       nothing. It is returned to the caller and printed in the canvas head's
   *       meta rail, where the window's other two facts already live.
   *
   *   (4) TWO RULE STYLES, NOT FOUR. Solid gridlines and dashed thresholds stay.
   *       The Median series' two dotted [2, 3] value rules go, and the boxed
   *       `139` / `82` chips riding their right ends go with them: they are the
   *       drawn window's median and lowest median, a fact the head's readout
   *       already reports, and unlabelled on a pooled envelope they read as a
   *       "last value" the chart does not have.
   *
   *   (5) THE LEGEND IS GONE. ECharts' own legend used to float over the plot
   *       area; 5bc3020f/d72f5775 (#204/#258) retired it from the shipped
   *       `renderCanvas` entirely, so `live.legend` carries no series data any
   *       more and there is nothing left here to read back or hand to a caller.
   *
   * FINDING 6 rides (5): the selected day's key is named with the occurrence's
   * date rather than the pronoun `That day`.
   * FINDING 18 is the sixth edit, below the loop: one token pair for the two dot
   * states, tuned per theme, so the emphasis hierarchy stops inverting.
   */
  const live = chart.getOption();
  const index = (name) => live.series.findIndex((x) => x.name === name);
  const patch = Array.from({ length: live.series.length }, () => ({}));
  const set = (name, value) => { const i = index(name); if (i >= 0) patch[i] = value; };

  /* (3) + (5) — read back off the shipped option, never rebuilt. The window
     label is rich text (`{a|24 H …}{b| · 25–75 spread …}`), so the rich tags are
     unwrapped rather than the string being reassembled from parts. */
  const context = live.series[index('__context')];
  const windowArea = context?.markArea?.data?.find((d) => d[0].xAxis !== undefined);
  const plain = (text) => String(text || '').replace(/\{\w+\|([^}]*)\}/g, '$1').trim();
  const caption = plain(windowArea?.[0]?.label?.formatter
    ?? context?.markPoint?.data?.[0]?.label?.formatter);

  if (context) {
    /* `context.markArea` is guarded, not assumed: `renderCanvas` structures it
       unconditionally in the option it SETS (diagnose-workstation-chart.js:817,
       the target band alone is two `data` entries with no window present to
       drop) — this reads what `chart.getOption()` reports back after the
       browser's ECharts instance has been reused across several prior
       `setOption(option, true)` calls, which is not always the same shape the
       last call set. `windowArea` above already assumed as much (`context?.
       markArea?.data?.find`); this call fell through that same gap without the
       same safety. */
    set('__context', {
      ...(context.markArea ? {
        markArea: {
          ...context.markArea,
          data: context.markArea.data.map((entry) => (entry === windowArea
            /* (2) the border off, the fill kept; (3) the caption off the plot. */
            ? [{ ...entry[0], itemStyle: { ...entry[0].itemStyle, borderWidth: 0 },
              label: { ...entry[0].label, show: false } }, entry[1]]
            : entry)),
        },
      } : {}),
      /* (3) the parked copy of the same caption, for the viewports where the
         shipped renderer could not fit it inside. */
      markPoint: { data: [] },
    });
  }
  /* (4) */
  set('Median', { markLine: { data: [] } });
  /* FINDING 18 — ONE TOKEN PAIR FOR THE TWO DOT STATES.
     The shipped scatter draws at `--primary-600`, which on bone resolves to a
     near-full-contrast dark teal: the UNSELECTED dots were louder in light than
     the terracotta accent marking the ones being read, so the emphasis hierarchy
     inverted between themes. `--fer-dot` is declared per theme in scene.css
     against the same ground the accent is measured on, as a literal colour for
     the reason `--ec-near` is one — a custom property holding a `color-mix()`
     comes back from `getPropertyValue` as its own source text, which no canvas
     can paint. The accent is untouched: it was already right in both themes. */
  const dot = getComputedStyle(surface).getPropertyValue('--fer-dot').trim();
  if (dot) set('Occurrences', { itemStyle: { color: dot } });
  /* FINDING 6 — the selected day's series, named with its date. */
  if (dayLabel) set('That day', { name: dayLabel });

  chart.setOption({
    /* (1) */
    yAxis: [{ ...Y_DOMAIN }, {}],
    /* (5) */
    legend: [{ show: false }],
    series: patch,
  });

  /* The two provenance readouts the shipped head carries — the window's own
     reading count against the capture's, and the pooling terms. Both are the
     shipped strings, built from the shipped `windowStats` / envelope fields. */
  head.querySelector('#dw-scope').textContent =
    `window ${stats.readings.toLocaleString()} of ${envelope.readings.toLocaleString()} readings`;
  head.querySelector('#dw-pool').textContent =
    `pooled from ${envelope.days} captured CGM days · ±${envelope.pool} min`;

  /* ROUND 9, FINDING 5 — the instance, plus the caption the head now owns.
     Round 8 returned the instance alone because the plot carried its own
     legend and its own caption; the legend chip list this once also returned
     retired with the shipped legend itself (5bc3020f/d72f5775, #204/#258). */
  return { chart, caption };
}
