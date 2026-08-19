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

/** ROUND 4 (c) — what the three cohort aggregates fall to while one occurrence
    trace is up. ONE multiplier over opacities `whiskerSeries` and `lineSeries`
    already computed, so the shipped ratios between supported and limited, and
    between fired and neutral, survive the recede intact. */
const RECEDE = .3;

/* VERBATIM — diagnose-event-comparison.js `COHORTS`. */
const COHORTS = {
  fired: { label: 'Rule matched', short: 'Matched', color: '--ec-fired', lineType: 'solid' },
  near_rule: { label: 'Near rule', short: 'Near', color: '--ec-near', lineType: 'dashed' },
  neutral: { label: 'Rule did not match', short: 'No match', color: '--ec-neutral', lineType: 'dotted' },
  another_factor: { label: 'Another factor applies', short: 'Other', color: '--ec-other', lineType: 'dashed' },
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
  const series = [{
    name: 'Target range',
    type: 'line',
    data: [],
    silent: true,
    markArea: {
      silent: true,
      itemStyle: { color: `color-mix(in srgb, ${css(surface, '--mk-ok')} 7%, transparent)` },
      data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]],
      label: { show: true, position: 'insideTopLeft', color: css(surface, '--mk-muted'), fontSize: 10, fontFamily: 'Inter' },
    },
  }];
  /* ROUND 4 (c) — with a trace up, the three aggregates step back to 30% of the
     ink they carry at rest. At rest `recede` is 1 and `receded` returns the
     shipped series object untouched. */
  const recede = highlighted ? RECEDE : 1;
  for (const cohort of cohortOrder) {
    for (const support of ['supported', 'limited']) {
      if (!aggregates[cohort].some((row) => row.support === support)) continue;
      series.push(receded(whiskerSeries(surface, cohort, aggregates[cohort], null, support), recede));
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
      min: 40,
      /* ROUND 4 (d) — 340, not 300: the max has to sit ON the interval or the
         ladder prints one short gap at the top. */
      max: 340,
      interval: 60,
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
    yAxis: {
      type: 'value', min: 40, max: 340, interval: 60,
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
export function legendMarkup(canvas) {
  const live = canvas.cohortOrder.filter((key) => canvas.cohorts[key].support !== 'withheld');
  /* A withheld cohort with NO routed events is not a fact the reader needs: it
     is the absence of a thing, and naming it ("near rule (0)") spends a clause
     saying nothing happened. Only withheld cohorts that actually hold events are
     worth the sentence. */
  const dead = canvas.cohortOrder.filter((key) => canvas.cohorts[key].support === 'withheld'
    && canvas.cohorts[key].routed_count > 0);
  const rail = live.map((key) => {
    const record = canvas.cohorts[key];
    /* ROUND 5, BLOCK 6 — THE NEAR-RULE HEDGE HANGS HERE, not in the inspector
       column. It was a `.ec-boundary-note` line in the case-file body: a full
       line of prose about one cohort, printed whether or not that cohort had
       anything on the canvas. It is now a sub-line on the Near-rule KEY —
       attached to the mark it is about, in the one place the phrase "Near rule"
       is already on screen — and it prints only where the cohort routed events
       (build.mjs sets `nearRuleNote` to null otherwise). */
    const note = key === 'near_rule' && canvas.nearRuleNote
      ? `<small class="fer-key-hedge">${canvas.nearRuleNote}</small>` : '';
    return `
      <span class="ec-key-item" data-cohort="${key}" data-support="${record.support}" data-selected-cohort="false">
        <i class="ec-key-mark" aria-hidden="true"></i>
        <strong>${record.label}<em class="ec-support-label">${record.supportWord}</em></strong>
        <small>${record.legendDetail}</small>
        ${note}
      </span>`;
  }).join('');
  if (!dead.length) return rail;
  const phrase = dead
    .map((key) => `${canvas.cohorts[key].label.toLowerCase()} (${canvas.cohorts[key].routed_count})`)
    .join(', ');
  return `${rail}<span class="fer-key-dead">Too few events to draw an aggregate: ${phrase}.</span>`;
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
