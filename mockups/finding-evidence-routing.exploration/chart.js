/* The Lows event-comparison canvas.
 *
 * PORTED, not authored. Everything below the "new grammar" banner is a byte
 * transcription of frontend/diagnose-event-comparison.js — `COHORTS`,
 * `emphasisOpacity`, `colorFor`, `whiskerSeries`, `lineSeries`,
 * `selectedSeries`, `axisLabel`, `paintReadout` and `chartOption` — so the mock
 * renders the shipped lens's own chart, at its shipped ECharts 5.5 version, and
 * not a facsimile of it. harness.mjs diffs this module's produced option against
 * the running app's live `getOption()` dump key by key, which is the only audit
 * that can see canvas-painted furniture at all.
 *
 * ROUND 2 (item 2) — TWO DELIBERATE DIVERGENCES from the shipped lens, both
 * named here and in the report:
 *
 *   (a) NO RESTING PER-EVENT LAYER. Round 1 drew every fired event's own trace
 *       as an always-on hairline under the medians. It is gone. The default draw
 *       is three cohort medians, their whiskers, the target band and the in-chart
 *       legend, and nothing else; exactly ONE event trace exists at a time — the
 *       row the reader is hovering or has pinned — in `selectedSeries`'s shipped
 *       styling. This is closer to the shipped lens than round 1 was: the lens
 *       draws one trace too, it just picks it from a dropdown the ruling retires.
 *
 *   (b) NO PER-SERIES EMPHASIS AT THE AXIS POINTER. The shipped lens leaves
 *       ECharts' axis-pointer emphasis on, so sweeping the crosshair lights a
 *       coloured symbol on every cohort at once. With the medians carrying the
 *       whole comparison that read is noise, so emphasis is disabled series-wide
 *       and the crosshair keeps only its two lines and the header readout. This
 *       DIVERGES from the shipped lens's own hover grammar.
 *
 *       What remains under the crosshair is NOT emphasis and was left alone: a
 *       `limited`-support median draws its own small `emptyCircle` at every
 *       point, always, and one of those sits wherever the pointer line crosses
 *       it. Checked by rendering with `tooltip.axisPointer.snap: false` — the
 *       mark is identical either way, so it is the series' own symbol, which is
 *       shipped grammar for "this median is thinly supported".
 *
 * ROUND 4 — FOUR MORE, all named here and in the report. None is a rewrite of
 * the lens's machinery: `whiskerSeries`, `lineSeries` and `chartOption` keep
 * their shipped bodies, and every change is either ONE multiplier applied to a
 * value those functions already computed, or a value on the option object.
 *
 *   (c) THE ANECDOTE NO LONGER OUTRANKS THE AGGREGATE (item 2). Round 2's
 *       selected trace was 2.2px of `--ec-focus` (= `--mk-text`, the brightest
 *       ink on the surface) laid over 1–1.05px muted medians: one event drawn
 *       louder than the three cohorts it is being judged against, in an ink no
 *       cohort owns. It is now a 1px hairline in ITS OWN COHORT'S hue — so the
 *       trace says which comparison it belongs to — and the three medians and
 *       their whiskers recede to `RECEDE` of their standing opacity while one is
 *       up. The aggregate stays the figure; the anecdote is an annotation on it.
 *
 *   (d) A UNIFORM Y TICK LADDER (item 3a). The shipped axis is min 40 / max 300
 *       / interval 60, which prints 40 · 100 · 160 · 220 · 280 and then a 300
 *       max label 20 above the last — five even gaps and one short one, on an
 *       axis whose whole job is letting a reader measure a gap by eye. The max
 *       moves to 340, which IS on the interval. The cost is headroom this
 *       fixture does not fill; a mixed ladder is the worse of the two.
 *
 *   (e) THE CROSSHAIR REPORTS SOMETHING (item 3b). It was ECharts' stock grey
 *       (#999) dashed cross with `label.show: false` — furniture in a colour the
 *       design system does not own, reporting nothing at either axis. It keeps
 *       its two lines, restyled onto `--mk-muted`, and gains the axis-docked
 *       readout it was missing: mg/dL at the y axis and the lens's own signed
 *       hour label at the x axis, both in the surface's own inks. The header
 *       readout is untouched and still carries the per-cohort medians.
 *
 *   (f) THE UNIT CAPTION IS DOCKED (item 3c). `yAxis.name` at
 *       `nameLocation: 'end'` floated "mg/dL" into open plot, three quarters of
 *       the way across the canvas, attached to nothing. The name comes off the
 *       axis and the unit becomes a `graphic` text right-aligned to x=44 — the
 *       tick labels' own right edge, 8px inside the axis at grid.left 52 — so it
 *       sits directly above the ladder it labels.
 */

const css = (element, name) => getComputedStyle(element).getPropertyValue(name).trim();

/* ================= ROUND 9, FINDING 5: ONE DOMAIN, ONE LADDER =================
 *
 * The projection toggle was sold as "the same class of control as a scale
 * toggle" — a switch over the already-selected data — and it was the control on
 * the surface that moved the most: `By clock` stood on 40-300 at 60, `By event`
 * on 40-340 at 60, so pressing it re-scaled the axis and relabelled every tick
 * under a reader who had asked for the same data drawn differently.
 *
 * ONE DOMAIN NOW, EXPORTED FROM HERE AND APPLIED TO BOTH PROJECTIONS (pooled.js
 * reads `Y_DOMAIN` for the clock chart's override). The numbers are measured off
 * this build's own data rather than picked:
 *
 *   the deepest value anything draws     42   (a lens occurrence trace)
 *   the highest value anything draws    226   (a lens occurrence trace)
 *   pooled envelope p10..p90         74..200
 *   captured day traces              72..203
 *   occurrence dots (finding 2)      58..61
 *
 * So `min: 40` — the floor both charts already stood on, and the first multiple
 * of 40 under 42 — and `max: 240`, the first multiple of 40 over 226. The max is
 * ON the interval, which is the defect round 4 (d) fixed on this chart and then
 * only fixed on one of the two; the ladder is 40 · 80 · 120 · 160 · 200 · 240,
 * six even gaps and no short one.
 *
 * The interval is 40 rather than 60 for one reason beyond evenness: NEITHER 70
 * NOR 180 LANDS ON IT. Round 8's ladder printed 180 and 70 among the value ticks
 * in identical type, so a reader could not tell which numerals were the scale
 * and which were the clinical rule. With this ladder the two thresholds exist
 * only as the target band's own edges, in the band's own tone — which is what
 * lets the band be read as a band.
 *
 * The cost is headroom this fixture does not fill: data tops out at 226 against
 * a 240 ceiling, so roughly 7% of the plot is empty above the highest mark,
 * where round 8 spent 40-45%. */
export const Y_DOMAIN = { min: 40, max: 240, interval: 40 };

/** The target range, and the ONE way it is drawn on either projection.
 *
 * Round 8 drew this fact twice: `TARGET 70–180 mg/dL` in caps over a dashed pair
 * of edges under `By clock`, and `target 70–180` in lowercase over a filled band
 * under `By event`. Same fact, two treatments, one surface — and the treatment
 * changed under the toggle that promised to hold the data still.
 * The SHIPPED workstation form wins, because it is the app's: a filled band, a
 * knock-out caption at the band's top-left, and the two thresholds as dashed
 * edges carrying their own numerals in the band's tone. `bandMarks` below builds
 * the lens's copy of it; pooled.js leaves the shipped one alone and only stops
 * it colliding with things this round moved. */
export const TARGET = [70, 180];

/** ROUND 4 (c) — what the three cohort aggregates fall to while one occurrence
    trace is up. ONE multiplier over opacities `whiskerSeries` and `lineSeries`
    already computed, so the shipped ratios between supported and limited, and
    between fired and neutral, survive the recede intact. */
const RECEDE = .3;

/* ROUND 9, FINDING 6 — AND THE SPREAD RECEDES LESS THAN THE MEDIAN DOES.
 *
 * At `RECEDE` the whiskers' own shipped opacities (.27 for a limited support
 * tier, .42 for a supported one) fell to .08 and .13, which is not recessive,
 * it is gone — so selecting an occurrence silently deleted the cohort's
 * uncertainty and the chart got MORE confident-looking the moment the reader
 * engaged with it. PRODUCT.md's principle is the opposite one: show uncertainty,
 * do not hide it. The spread keeps most of its ink while the medians step back,
 * so what recedes under a selected trace is the CENTRAL LINE, not the evidence
 * of how wide the cohort is. */
const RECEDE_SPREAD = .7;

/* diagnose-event-comparison.js `COHORTS`, with ONE FIELD RESPELLED.
 *
 * ROUND 9, FINDING 9 — the labels and their shorts take the settled partition
 * words. Everything else here is the shipped transcription untouched: the keys,
 * the colour tokens and the line types, which are what the fidelity harness
 * checks series by series.
 *
 * The label is not decoration on this module — it composes each series' `name`
 * (`Borderline limited spread`) and the chart's `aria.description`, and the
 * `short` is what the header readout prints under the crosshair. Leaving either
 * on the old vocabulary would have put `Rule matched` in the reader's ear and in
 * the crosshair while the band, the group rule and the legend chip beside them
 * all said `Meets criteria` — which is the four-vocabulary defect moved rather
 * than fixed. The resulting series-name differences against the shipped lens are
 * named deviations in harness.mjs, mapped to this finding. */
const COHORTS = {
  fired: { label: 'Meets criteria', short: 'Meets', color: '--ec-fired', lineType: 'solid' },
  near_rule: { label: 'Borderline', short: 'Borderline', color: '--ec-near', lineType: 'dashed' },
  neutral: { label: 'Does not meet', short: 'No', color: '--ec-neutral', lineType: 'dotted' },
  another_factor: { label: 'Another lever applies', short: 'Other', color: '--ec-other', lineType: 'dashed' },
};

/* VERBATIM — diagnose-event-comparison.js. */
const colorFor = (surface, cohort) => css(surface, COHORTS[cohort].color);
const rounded = (value) => (value == null ? '—' : String(Math.round(value)));

function emphasisOpacity(selectedCohort, cohort, normal, selected, dimmed) {
  if (!selectedCohort) return normal;
  return selectedCohort === cohort ? selected : dimmed;
}

function axisLabel(value, anchor) {
  if (value === 0) return anchor;
  const hours = Math.abs(value / 60);
  return `${value < 0 ? '−' : '+'}${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

function whiskerSeries(surface, cohort, aggregateRows, selectedCohort, support) {
  const color = colorFor(surface, cohort);
  const limited = support === 'limited';
  return {
    id: `${cohort}:spread:${support}`,
    name: `${COHORTS[cohort].label} ${support} spread`,
    type: 'custom',
    silent: true,
    /* ROUND 2 (b) — no symbol lights under the crosshair. */
    emphasis: { disabled: true },
    z: 2,
    data: aggregateRows
      .filter((row) => row.support === support && row.minute % 60 === 0
        && row.p25 != null && row.p75 != null)
      .map((row) => [row.minute, row.p25, row.p75]),
    renderItem(_params, api) {
      const low = api.coord([api.value(0), api.value(1)]);
      const high = api.coord([api.value(0), api.value(2)]);
      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .27 : .42, limited ? .24 : .38, limited ? .08 : .11), lineWidth: limited ? .8 : 1, lineDash: limited ? [2, 2] : null } },
          { type: 'line', shape: { x1: low[0] - (limited ? 2.5 : 3), y1: low[1], x2: low[0] + (limited ? 2.5 : 3), y2: low[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .34 : .52, limited ? .31 : .48, limited ? .11 : .15), lineWidth: limited ? .8 : 1 } },
          { type: 'line', shape: { x1: high[0] - (limited ? 2.5 : 3), y1: high[1], x2: high[0] + (limited ? 2.5 : 3), y2: high[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .34 : .52, limited ? .31 : .48, limited ? .11 : .15), lineWidth: limited ? .8 : 1 } },
        ],
      };
    },
  };
}

function lineSeries(surface, cohort, aggregateRows, selectedCohort, support) {
  const limited = support === 'limited';
  return {
    id: `${cohort}:line:${support}`,
    name: `${COHORTS[cohort].label} ${support}`,
    type: 'line',
    z: 4,
    showSymbol: limited,
    symbol: 'emptyCircle',
    symbolSize: limited ? 3.5 : 0,
    connectNulls: false,
    animation: false,
    emphasis: { disabled: true },
    data: aggregateRows.map((row) => [row.minute,
      row.support === support ? row.median : null]),
    lineStyle: {
      color: colorFor(surface, cohort),
      width: limited ? 1.05 : cohort === 'fired' ? 2.4 : 1.8,
      type: COHORTS[cohort].lineType,
      opacity: emphasisOpacity(selectedCohort, cohort,
        limited ? .58 : cohort === 'neutral' ? .82 : 1,
        limited ? .5 : .7,
        limited ? .12 : .18),
    },
    itemStyle: {
      color: css(surface, '--mk-surface'), borderColor: colorFor(surface, cohort),
      borderWidth: limited ? 1 : 0,
      opacity: emphasisOpacity(selectedCohort, cohort,
        limited ? .72 : 1, limited ? .64 : .8, .18),
    },
  };
}

/** ROUND 4 (c) — recede a built cohort series while one occurrence trace is up.
 *
 * This exists so `whiskerSeries` and `lineSeries` stay byte-verbatim
 * transcriptions of the shipped lens: it takes what they returned and scales the
 * opacity they computed, rather than threading a multiplier through their
 * bodies. A whisker is a `custom` series whose opacities live inside
 * `renderItem`, so its wrapper scales the children the shipped renderer emitted
 * — the geometry, the dash pattern and the per-support ratios are the shipped
 * ones, at less ink.
 */
function receded(series, recede) {
  if (recede === 1) return series;
  if (series.type !== 'custom') {
    return {
      ...series,
      lineStyle: { ...series.lineStyle, opacity: series.lineStyle.opacity * recede },
      itemStyle: { ...series.itemStyle, opacity: series.itemStyle.opacity * recede },
    };
  }
  const shipped = series.renderItem;
  return {
    ...series,
    renderItem(params, api) {
      const group = shipped(params, api);
      for (const child of group.children) child.style.opacity *= recede;
      return group;
    },
  };
}

/* diagnose-event-comparison.js `selectedSeries`, minus the rescue-carb scatter
   (no marker rides a fired trace in this fixture's selections), plus the round-2
   (b) emphasis suppression. THIS IS THE ONLY EVENT TRACE ON THE CANVAS: the row
   the reader is hovering or has pinned, and nothing else.

   ROUND 4 (c) DIVERGES from the shipped styling, deliberately. The shipped lens
   draws its selection at 2.2px of `--ec-focus`, which is right for a lens where
   the occurrence is picked from a dropdown and IS the subject. Here the reader
   is inside a cohort comparison and the trace is one row of a table beside it,
   so it draws at 1px in the hue of the cohort it belongs to: present, locatable,
   and never the loudest mark on a chart about three medians. `--ec-focus` is no
   longer read by this module. */
function selectedSeries(surface, trace, cohort) {
  if (!trace) return [];
  const color = colorFor(surface, cohort in COHORTS ? cohort : 'neutral');
  return [{
    name: 'Selected occurrence',
    type: 'line',
    z: 8,
    showSymbol: false,
    animation: false,
    emphasis: { disabled: true },
    data: trace,
    lineStyle: { color, width: 1, opacity: 1 },
    itemStyle: { color },
  }];
}

/** VERBATIM — diagnose-event-comparison.js `chartOption`.
 *
 * `canvas` is one scene's canvas payload: the finding scene passes the lens
 * FILTERED to the finding (three cohorts), the population scene passes it
 * UNFILTERED (four). Nothing else about the draw changes between them. */
export function chartOption(surface, canvas, highlighted) {
  const cohortOrder = canvas.cohortOrder;
  const aggregates = Object.fromEntries(cohortOrder.map((key) => [key, canvas.cohorts[key].points]));
  /* ROUND 9, FINDING 5 — THE BAND, DRAWN THE SHIPPED WAY, ON BOTH PROJECTIONS.
     Every value below is `chartColors`'s in diagnose-workstation.js and every
     geometry is `renderCanvas`'s own target block: the same fill, the same
     `TARGET 70–180 mg/dL` knock-out caption at the band's top-left, and the same
     dashed [4, 4] edges carrying their own numerals in the band's tone. What it
     replaces is round 1's lowercase `target 70–180` at `--mk-muted` on a bare
     fill, which stated the identical fact in a second vocabulary one toggle
     press away from the first. */
  const ok = css(surface, '--mk-ok');
  const bandInk = `color-mix(in srgb, ${ok} 85%, ${css(surface, '--mk-text')})`;
  const series = [{
    name: 'Target range',
    type: 'line',
    data: [],
    silent: true,
    markArea: {
      silent: true,
      itemStyle: { color: `color-mix(in srgb, ${ok} 8%, transparent)` },
      data: [[{
        yAxis: TARGET[0],
        label: {
          show: true, position: 'insideStartTop', distance: 10,
          color: bandInk, fontSize: 10, fontWeight: 600, fontFamily: 'Inter',
          formatter: `TARGET ${TARGET[0]}–${TARGET[1]} mg/dL`,
          backgroundColor: css(surface, '--ck-rail'), padding: [2, 5], borderRadius: 2,
        },
      }, { yAxis: TARGET[1] }]],
    },
    markLine: {
      silent: true, symbol: 'none', z: 4,
      lineStyle: { color: `color-mix(in srgb, ${ok} 55%, transparent)`, type: [4, 4], width: 1 },
      label: {
        show: true, position: 'start', formatter: '{c}',
        color: bandInk, fontSize: 10,
        backgroundColor: css(surface, '--ck-rail'), padding: [2, 4], borderRadius: 2,
      },
      data: [{ yAxis: TARGET[0] }, { yAxis: TARGET[1] }],
    },
  }];
  /* ROUND 4 (c) — with a trace up, the three aggregates step back to 30% of the
     ink they carry at rest. At rest `recede` is 1 and `receded` returns the
     shipped series object untouched. */
  const recede = highlighted ? RECEDE : 1;
  for (const cohort of cohortOrder) {
    for (const support of ['supported', 'limited']) {
      if (!aggregates[cohort].some((row) => row.support === support)) continue;
      /* FINDING 6 — two multipliers, not one: the spread stays legible while the
         median steps back. */
      series.push(receded(whiskerSeries(surface, cohort, aggregates[cohort], null, support),
        highlighted ? RECEDE_SPREAD : 1));
      series.push(receded(lineSeries(surface, cohort, aggregates[cohort], null, support), recede));
    }
  }
  series.push(...selectedSeries(surface, highlighted ? canvas.traces[highlighted] : null,
    canvas.cohortOf?.[highlighted]));

  return {
    animation: false,
    backgroundColor: 'transparent',
    aria: {
      enabled: true,
      decal: { show: false },
      description: `${canvas.title}. Median lines compare ${cohortOrder.map((key) => COHORTS[key].label).join(', ')}. Sparse whiskers show the 25th to 75th percentile.`,
    },
    grid: { left: 52, right: 22, top: 24, bottom: 42, containLabel: false },
    /* ROUND 4 (f) — the unit caption, docked. Right edge at x=44, which is the
       tick labels' own right edge (grid.left 52 minus ECharts' 8px axis-label
       margin), and above grid.top 24, which is the topmost tick's baseline. */
    graphic: [{
      type: 'text', left: 44, top: 4, silent: true,
      style: {
        text: 'mg/dL', textAlign: 'right',
        fill: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10,
      },
    }],
    /* ROUND 4 (e) — the crosshair, on the surface's own inks, reporting a value
       at each axis it crosses. `showContent` stays false: the per-cohort medians
       are the canvas header's readout, and a floating tooltip box would be a
       second one. */
    tooltip: {
      trigger: 'axis',
      showContent: false,
      axisPointer: {
        type: 'cross',
        crossStyle: { color: css(surface, '--mk-muted'), width: 1, type: 'dashed', opacity: .7 },
        lineStyle: { color: css(surface, '--mk-muted'), width: 1, type: 'dashed', opacity: .7 },
        label: {
          show: true,
          /* `--mk-surface`, not `--ck-inset`: the inset token is declared as a
             `color-mix()` on the light ground, and a custom property holding an
             unresolved `color-mix()` comes back from `getPropertyValue` as its
             literal source text, which a canvas context cannot paint. The lens's
             own `lineSeries` reads `--mk-surface` for exactly this reason. */
          backgroundColor: css(surface, '--mk-surface'),
          borderColor: css(surface, '--mk-line'),
          borderWidth: 1,
          color: css(surface, '--mk-text'),
          fontFamily: css(surface, '--ck-mono'),
          fontSize: 10,
          padding: [3, 6],
          formatter: ({ axisDimension, value }) => (axisDimension === 'x'
            ? axisLabel(Math.round(value / 5) * 5, canvas.axisAnchor)
            : String(Math.round(value))),
        },
      },
    },
    xAxis: {
      type: 'value',
      min: canvas.alignmentWindow[0],
      max: canvas.alignmentWindow[1],
      interval: 60,
      axisLine: { onZero: false, lineStyle: { color: css(surface, '--mk-line') } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .48 } },
      axisLabel: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10, formatter: (value) => axisLabel(value, canvas.axisAnchor) },
    },
    yAxis: {
      type: 'value',
      /* ROUND 9, FINDING 5 — the shared domain and ladder. Round 4 (d)'s rule
         (the max sits ON the interval) still holds and is now satisfied on BOTH
         projections by the same three numbers. See `Y_DOMAIN` above for how they
         were measured and why the interval is 40. */
      ...Y_DOMAIN,
      /* ROUND 4 (f) — no `name` on the axis; the unit is the docked `graphic`
         above, which is the only way to put it over the first tick rather than
         wherever ECharts decides an end-located axis name goes. */
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .58 } },
      axisLabel: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10 },
    },
    series,
  };
}

/** ROUND 5, BLOCK 2 — THE HONEST EMPTY CANVAS, for the Unclaimed frame.
 *
 * The frame is a real division of the population (ten of twenty lows match no
 * finding's rule) and there is nothing to compare it against, because there is
 * no rule. Both dishonest answers have already been tried: round 3 mounted a
 * full-height pane and drew nothing in it, round 4 deleted the frame so the
 * question could not be asked.
 *
 * What draws instead is the CHART FRAME'S OWN FURNITURE, greyed, WITH THE RANGE
 * STILL ON IT — the same signed-hour x window and the same 40–340 ladder at the
 * same interval as a comparison frame, so the reader sees the same instrument
 * standing empty at the same coordinates rather than a blank pane. Plus one
 * short line. No paragraph.
 *
 * Every axis value is the one `chartOption` above already uses; only the inks
 * step down, through ONE multiplier on the opacity the shipped axis carries. */
const GREY = .38;

export function emptyOption(surface, frame, alignmentWindow, axisAnchor) {
  const muted = css(surface, '--mk-muted');
  const line = css(surface, '--mk-line');
  const furniture = (extra) => ({
    axisTick: { show: false },
    splitLine: { show: true, lineStyle: { color: line, opacity: .48 * GREY } },
    axisLabel: { color: muted, opacity: GREY, fontFamily: 'Inter', fontSize: 10, ...extra },
  });
  return {
    animation: false,
    backgroundColor: 'transparent',
    aria: {
      enabled: true,
      decal: { show: false },
      description: `${frame.empty.head}. ${frame.empty.line}`,
    },
    grid: { left: 52, right: 22, top: 24, bottom: 42, containLabel: false },
    graphic: [{
      type: 'text', left: 'center', top: 'middle', silent: true,
      style: {
        text: frame.empty.line, textAlign: 'center',
        fill: muted, fontFamily: 'Inter', fontSize: 11.5,
      },
    }],
    xAxis: {
      type: 'value', min: alignmentWindow[0], max: alignmentWindow[1], interval: 60,
      axisLine: { onZero: false, lineStyle: { color: line, opacity: GREY } },
      ...furniture({ formatter: (value) => axisLabel(value, axisAnchor) }),
    },
    /* FINDING 5 — the empty frame stands the instrument at the SAME coordinates
       a drawn one does; that is the whole point of keeping the range on it. */
    yAxis: {
      type: 'value', ...Y_DOMAIN,
      axisLine: { show: false },
      ...furniture({}),
    },
    series: [],
  };
}

/** diagnose-event-comparison.js `paintLegend`, cohort branch.
 *
 * ROUND 4 ITEM 7 — THE RAIL IS FOR SERIES THAT ARE DRAWN. A `withheld` cohort
 * has no aggregate on the canvas (that is what withheld means), and the shipped
 * markup still spent it a full legend column: a mark, a label, a support stamp
 * and a detail line, all describing a line the reader cannot see. Live cohorts
 * keep the rail, verbatim. Dead ones collapse into ONE sentence beneath it,
 * which is the whole statement they were carrying between them.
 */
export function legendMarkup(canvas, selected) {
  const live = canvas.cohortOrder.filter((key) => canvas.cohorts[key].support !== 'withheld');
  /* A withheld cohort with NO routed events is not a fact the reader needs: it
     is the absence of a thing, and naming it ("near rule (0)") spends a clause
     saying nothing happened. Only withheld cohorts that actually hold events are
     worth the sentence. */
  const dead = canvas.cohortOrder.filter((key) => canvas.cohorts[key].support === 'withheld'
    && canvas.cohorts[key].routed_count > 0);
  const rail = live.map((key) => {
    const record = canvas.cohorts[key];
    /* ROUND 9, FINDING 3 — THE HEDGE IS A DISCLOSURE, NOT A PARAGRAPH.
       Round 8 hung it under the Near-rule key as a permanently-printed sub-line,
       which is how the legend became three wrapped paragraphs of policy prose
       standing at data weight directly under the data — the thing DESIGN.md rule
       5 forbids by name ("charts explain themselves through on-chart legend
       chips, not caption sentences. A chart that requires a paragraph fails the
       bar"). It now HANGS OFF the key rather than printing beneath it: the chip
       carries the disclosure and reveals it on hover or focus.

       ROUND 11, F12 — THE MECHANISM IS THE SHIPPED `.has-tooltip`, and round 9's
       claim that this repository has no such primitive WAS FALSE. It is declared
       at frontend/index.html:225-246, inside an inline `<style>` block — which is
       why a grep over frontend/*.css and frontend/*.js missed it — and a Vue
       component uses it at line 5913 on the identical contract: `tabindex="0"`
       plus `data-tooltip`, revealed on `:hover` and `:focus-visible`. DESIGN.md
       calls it "the system's one reusable 'define a term inline' mechanism …
       should be reused rather than re-invented per feature". The scene's own
       `.fer-tip` is DELETED rather than left standing beside it, and the
       primitive arrives here the way every other shipped thing on this surface
       does: through build.mjs's app-base extraction, which now fails closed if
       the primitive ever stops arriving. */
    const hedged = key === 'near_rule' && canvas.nearRuleNote;
    return `
      <span class="ec-key-item${hedged ? ' has-tooltip' : ''}" data-cohort="${key}" data-support="${record.support}" data-selected-cohort="false"${
      hedged ? ` tabindex="0" data-tooltip="${canvas.nearRuleNote}" aria-label="${record.label}. ${canvas.nearRuleNote}"` : ''}>
        <i class="ec-key-mark" aria-hidden="true"></i>
        <strong>${record.label}<em class="ec-support-label">${record.supportWord}</em></strong>
        <small>${record.legendDetail}</small>
      </span>`;
  }).join('');
  /* ROUND 9, FINDING 6 — THE SELECTED OCCURRENCE GETS A KEY HERE TOO, AND IT IS
     NAMED WITH ITS DATE. Round 8 drew the selected trace on this projection with
     NO key at all, so the chart carried four things and three keys, while the
     clock projection's key for the same series read `That day` — a pronoun,
     where the row the reader had just clicked said `Aug 3`. Both projections
     carry the same key now and both say the date. The mark takes the trace's own
     cohort, which is the hue round 4 (c) settled it draws in. */
  const pick = selected ? `
      <span class="ec-key-item fer-key-selected" data-cohort="${selected.cohort}" data-support="supported" data-selected-cohort="true">
        <i class="ec-key-mark" aria-hidden="true"></i>
        <strong>${selected.label}<em class="ec-support-label">Selected</em></strong>
        <small>${selected.detail}</small>
      </span>` : '';
  if (!dead.length) return rail + pick;
  const phrase = dead
    .map((key) => `${canvas.cohorts[key].label.toLowerCase()} (${canvas.cohorts[key].routed_count})`)
    .join(', ');
  return `${rail}${pick}<span class="fer-key-dead">Too few events to draw an aggregate: ${phrase}.</span>`;
}

/** VERBATIM — diagnose-event-comparison.js `paintReadout`. */
export function paintReadout(surface, minute, canvas) {
  const head = surface.querySelector('#ec-canvas-head');
  const host = surface.querySelector('#ec-readout');
  if (minute == null || !canvas) {
    head.dataset.hover = '0';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const snapped = Math.round(minute / 5) * 5;
  const pieces = [`<span class="ec-rd-time">${axisLabel(snapped, canvas.axisAnchor)}</span>`];
  for (const cohort of canvas.cohortOrder) {
    const row = canvas.cohorts[cohort].points.find((item) => item.minute === snapped);
    const support = row?.support || 'withheld';
    const value = support === 'withheld' ? '—' : rounded(row?.median);
    pieces.push(`<span class="ec-rd-value" data-support="${support}">${COHORTS[cohort].short} <b>${value}</b><em>${support[0].toUpperCase()}${support.slice(1)} · n${row?.n ?? 0}</em></span>`);
  }
  host.innerHTML = pieces.join('');
  host.setAttribute('aria-hidden', 'false');
  head.dataset.hover = '1';
}
