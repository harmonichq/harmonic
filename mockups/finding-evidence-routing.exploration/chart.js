/* The Lows event-comparison canvas.
 *
 * PORTED, not authored. Everything below the "new grammar" banner is a byte
 * transcription of frontend/diagnose-event-comparison.js — `COHORTS`,
 * `emphasisOpacity`, `colorFor`, `whiskerSeries`, `lineSeries`,
 * `selectedSeries`, `axisLabel`, `paintReadout` and `chartOption` — so the mock
 * renders the shipped lens's own chart, at its shipped ECharts 5.5 version, and
 * not a facsimile of it. audit.mjs diffs this module's produced option against
 * the running app's live `getOption()` dump key by key, which is the only audit
 * that can see canvas-painted furniture at all.
 *
 * ONE piece of new grammar is added and marked: the per-event trace layer, which
 * the issue-31 scene requires so the occurrences table's rows have something to
 * select. Its highlighted state reuses `selectedSeries`'s exact shipped styling.
 */

const css = (element, name) => getComputedStyle(element).getPropertyValue(name).trim();

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

/* VERBATIM — diagnose-event-comparison.js `selectedSeries`, minus the rescue-carb
   scatter (no marker rides a fired trace in this fixture's selections). */
function selectedSeries(surface, trace) {
  if (!trace) return [];
  return [{
    name: 'Selected occurrence',
    type: 'line',
    z: 8,
    showSymbol: false,
    animation: false,
    data: trace,
    lineStyle: { color: css(surface, '--ec-focus'), width: 2.2, opacity: 1 },
    itemStyle: { color: css(surface, '--ec-focus') },
  }];
}

/* ------------------------------------------------- new grammar (issue #31) --
   The per-event trace layer. The shipped lens draws exactly one trace, chosen
   from a dropdown; this scene retires the dropdown and makes the occurrences
   table the selection mechanism, so every fired event's trace is on the canvas
   at rest and one lifts to the shipped selected-trace styling on row hover.
   The resting layer takes the fired cohort's own hue and sits UNDER the
   aggregates (z:1), so it reads as the population behind the median rather than
   as four new cohorts. */
function traceLayer(surface, traces, ids, highlighted) {
  return ids.filter((id) => id !== highlighted).map((id) => ({
    id: `trace:${id}`,
    name: `Event ${id}`,
    type: 'line',
    z: 1,
    silent: true,
    showSymbol: false,
    animation: false,
    data: traces[id],
    lineStyle: { color: colorFor(surface, 'fired'), width: .8, opacity: highlighted ? .12 : .22 },
  }));
}

/** VERBATIM — diagnose-event-comparison.js `chartOption`, with the trace layer added. */
export function chartOption(surface, data, highlighted) {
  const { canvas } = data;
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
  series.push(...traceLayer(surface, canvas.traces, canvas.firedIds, highlighted));
  for (const cohort of cohortOrder) {
    for (const support of ['supported', 'limited']) {
      if (!aggregates[cohort].some((row) => row.support === support)) continue;
      series.push(whiskerSeries(surface, cohort, aggregates[cohort], null, support));
      series.push(lineSeries(surface, cohort, aggregates[cohort], null, support));
    }
  }
  series.push(...selectedSeries(surface, highlighted ? canvas.traces[highlighted] : null));

  return {
    animation: false,
    backgroundColor: 'transparent',
    aria: {
      enabled: true,
      decal: { show: false },
      description: `${canvas.title}. Median lines compare ${cohortOrder.map((key) => COHORTS[key].label).join(', ')}. Sparse whiskers show the 25th to 75th percentile.`,
    },
    grid: { left: 52, right: 22, top: 24, bottom: 42, containLabel: false },
    tooltip: { trigger: 'axis', showContent: false, axisPointer: { type: 'cross', label: { show: false } } },
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
      max: 300,
      interval: 60,
      name: 'mg/dL',
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10, align: 'left' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .58 } },
      axisLabel: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10 },
    },
    series,
  };
}

/** VERBATIM — diagnose-event-comparison.js `paintLegend`, cohort branch. */
export function legendMarkup(data) {
  const { canvas } = data;
  return canvas.cohortOrder.map((key) => {
    const record = canvas.cohorts[key];
    return `
      <span class="ec-key-item" data-cohort="${key}" data-support="${record.support}" data-selected-cohort="false">
        <i class="ec-key-mark" aria-hidden="true"></i>
        <strong>${record.label}<em class="ec-support-label">${record.supportWord}</em></strong>
        <small>${record.legendDetail}</small>
      </span>`;
  }).join('');
}

/** VERBATIM — diagnose-event-comparison.js `paintReadout`. */
export function paintReadout(surface, minute, data) {
  const head = surface.querySelector('#ec-canvas-head');
  const host = surface.querySelector('#ec-readout');
  if (minute == null) {
    head.dataset.hover = '0';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const snapped = Math.round(minute / 5) * 5;
  const pieces = [`<span class="ec-rd-time">${axisLabel(snapped, data.canvas.axisAnchor)}</span>`];
  for (const cohort of data.canvas.cohortOrder) {
    const row = data.canvas.cohorts[cohort].points.find((item) => item.minute === snapped);
    const support = row?.support || 'withheld';
    const value = support === 'withheld' ? '—' : rounded(row?.median);
    pieces.push(`<span class="ec-rd-value" data-support="${support}">${COHORTS[cohort].short} <b>${value}</b><em>${support[0].toUpperCase()}${support.slice(1)} · n${row?.n ?? 0}</em></span>`);
  }
  host.innerHTML = pieces.join('');
  host.setAttribute('aria-hidden', 'false');
  head.dataset.hover = '1';
}
