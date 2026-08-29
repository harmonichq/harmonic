import {
  eventComparisonChartOption,
  eventComparisonGlucoseValues,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  glucoseRange,
} from './diagnose-event-comparison.js';
import { mealMemberMarkers, GRID } from './diagnose-workstation-chart.js';

export { eventComparisonGlucoseValues, GLUCOSE_ENVELOPE, GLUCOSE_STEP, glucoseRange };

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT = 'Inter, system-ui, sans-serif';
const FALLBACK_COLORS = {
  signal: '#3f5a3b', basal: '#5d7368', programmed: '#4d5c53',
  line: '#c3bfb4', text: '#141a15', muted: '#3d5848', excluded: '#6b7169',
};
const COLOR_TOKENS = {
  signal: '--in-range', basal: '--basal', programmed: '--secondary',
  line: '--line', text: '--text', muted: '--muted', excluded: '--notindata',
};
const chartColors = () => {
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return { ...FALLBACK_COLORS,
      target: `color-mix(in srgb, ${FALLBACK_COLORS.signal} 8%, transparent)` };
  }
  const styles = getComputedStyle(document.documentElement);
  const colors = Object.fromEntries(Object.entries(COLOR_TOKENS).map(([name, token]) => [
    name, styles.getPropertyValue(token).trim() || FALLBACK_COLORS[name],
  ]));
  return { ...colors, target: `color-mix(in srgb, ${colors.signal} 8%, transparent)` };
};
/* Both grids open on the canvas-wide spine, so a tile's numbers and its title
   start where the strip's do. The right inset is not a spine — it is however
   much of the LAST x-axis label hangs past the final tick, which is half a date
   at full rank and half a "1,500" at mini. At 22 and 6 those were being cut. */
const FULL_GRID = Object.freeze({
  left: GRID.left, right: 34, top: 26, bottom: 42, containLabel: false,
});
/* A MINI KEEPS NO AXIS FURNITURE AT ALL, so its grid is inset by nothing but a
   hairline of air. The spine alignment the full grid honours exists so a tile's
   NUMBERS start where the strip's do; a mini has no numbers to align, and the
   32px it was reserving for them was a third of the cell. */
const MINI_GRID = Object.freeze({
  left: 6, right: 6, top: 6, bottom: 6, containLabel: false,
});

const grid = (mini) => ({ ...(mini ? MINI_GRID : FULL_GRID) });
/* An axis NAME was left at ECharts' own defaults — 12px in the chart's own font
   with a 15px gap — so it drew a rank the canvas does not have, and at that gap
   it sat above the grid's own top and was cut off by the tile ("U/h" losing its
   head, "mg/dL" floating clear of its plot). It comes down to the caps rank the
   rest of the metadata uses, and close enough to the axis to belong to it. */
const axis = (colors, mini = false) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  /* AT MINI RANK THERE IS NO AXIS AT ALL — no labels, no split lines and no
     name. Ruled on the built strip: at 8px the tick labels ran together into a
     smear that reads as texture rather than as numbers, and the grid they ruled
     spent most of a 148px cell on furniture nobody can use. A mini's question
     is whether there is a shape here worth opening, which is the one thing the
     plot alone answers; every number it needs is a click away on the stage.

     The name goes for the older reason too: "glucose change (mg/dL)" is wider
     than a cell's whole plot, so it ran off the left edge, and shrinking it
     only made an unreadable thing that still overhung. Every axis object here
     spreads this last, so what a caller set is dropped rather than restyled. */
  axisLabel: { show: !mini, color: colors.muted, fontFamily: MONO, fontSize: 10 },
  nameTextStyle: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
  nameGap: 8,
  splitLine: { show: !mini, lineStyle: { color: colors.line, width: 1 } },
  ...(mini ? { name: undefined } : {}),
});
const chartBase = (description, mini, colors) => ({
  animation: false,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FONT, color: colors.text },
  aria: { enabled: true, decal: { show: false }, description },
  grid: grid(mini),
});
/* A MINI TILE CARRIES NO LEGEND. It is a thumbnail, and its question is whether
   there is a shape here worth opening — not which series is which, at a size
   where they cannot be told apart anyway. It was spending a third of a ~100px
   plot naming two series the tile's own caption has already introduced. */
const chartLegend = (data, colors, mini = false) => (mini ? { show: false } : {
  show: true, left: GRID.left, right: 22, bottom: 0, selectedMode: false,
  itemWidth: 22, itemHeight: 8, itemGap: 18,
  textStyle: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
  data,
});
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const hhmm = (minute) => {
  const normalized = ((minute % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
};
const minuteOfDay = (timestamp) => {
  const match = /T(\d\d):(\d\d)/.exec(timestamp || '');
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};
const clockFrame = ([start, end] = [0, 1440]) => {
  const full = start === 0 && end >= 1439;
  const span = full ? 1440 : (((end - start) % 1440) + 1440) % 1440 || 1440;
  return {
    span,
    map: (minute) => (((minute - start) % 1440) + 1440) % 1440,
    label: (offset) => hhmm(offset + start),
  };
};

function thumbnail(name, count, series = []) {
  const colors = chartColors();
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { left: 4, right: 4, top: 28, bottom: 4 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    graphic: [
      { type: 'text', left: 5, top: 4, silent: true,
        style: { text: name, fill: colors.muted, font: `600 9px ${FONT}` } },
      { type: 'text', right: 5, top: 3, silent: true,
        style: { text: String(count), fill: colors.text, font: `700 10px ${MONO}` } },
    ],
    series,
  };
}

/* The analyzer's verdict, said in the reader's words. `safety_status` is the
   engine's own closed display set (`Status` in `ciq_autotune/safety.py`), so the
   chart renames the verdict it was handed rather than re-deriving one — the
   staging predicate stays the backend's `asserts_move`, and these two names are
   the only thing the tile adds. A status outside the set reads as insufficient,
   which is the safe reading of a verdict this surface does not recognise. */
const BASAL_HELD_STATUSES = Object.freeze(new Set([
  'no change', 'held (recurring-low gate)',
]));
const basalVerdict = (data) => {
  if (data?.asserts_move === true) return 'Supported';
  return BASAL_HELD_STATUSES.has(data?.safety_status) ? 'Held' : 'Insufficient evidence';
};

function basalOption(mode, { data, mini = false } = {}) {
  const colors = chartColors();
  const nights = data?.nights || [];
  const description = `${data?.roster_count ?? 0} nights of steady data; ${data?.directional_support_count ?? 0} support this reading.`;
  if (mode === 'event') {
    const support = data?.directional_support_count ?? 0;
    const assertsMove = data?.asserts_move === true;
    const verdict = basalVerdict(data);
    const label = hhmm((data?.slot ?? 0) * 30);
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend([verdict], colors, mini),
      xAxis: { type: 'category', data: [label], ...axis(colors, mini),
        splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, name: 'nights', ...axis(colors, mini) },
      series: [
        { name: verdict, type: 'bar', data: [support], animation: false,
          barCategoryGap: '25%',
          itemStyle: { color: assertsMove ? colors.basal : colors.excluded } },
      ],
    };
  }
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend(['Programmed basal', 'Delivered basal'], colors, mini),
    xAxis: { type: 'category', data: nights.map((night) => night.date), ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'U/h', ...axis(colors, mini) },
    series: [
      /* A LEGEND SWATCH READS `itemStyle`, NOT `lineStyle`. Colour set only on
         the line left the swatch on ECharts' stock palette — a blue dot and a
         green dot, neither of which exists anywhere in this app, labelling two
         lines that are both green and told apart by dash against solid. The
         icon carries the same distinction the plot does. */
      { name: 'Programmed basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.programmed_rate),
        itemStyle: { color: colors.programmed },
        lineStyle: { color: colors.programmed, width: 1.4, type: 'dashed' } },
      { name: 'Delivered basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.delivered_rate),
        itemStyle: { color: colors.basal },
        lineStyle: { color: colors.basal, width: mini ? 1.2 : 2 } },
    ],
  };
}

function isfOption(mode, { data, mini = false } = {}) {
  const colors = chartColors();
  const counts = data?.counts || {};
  const windows = data?.windows || [];
  const steps = data?.steps || [];
  const description = `${counts.detected_windows ?? 0} detected rest windows; ${counts.qualifying_windows ?? 0} qualifying windows; ${counts.qualifying_steps ?? 0} qualifying steps.`;
  if (mode === 'clock') {
    const windowIndex = new Map(windows.map((window, index) => [window.id, index]));
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend(['Qualifying fasting steps'], colors, mini),
      xAxis: { type: 'category', data: windows.map((window) => window.date),
        ...axis(colors, mini),
        splitLine: { show: false } },
      yAxis: { type: 'value', name: 'glucose change (mg/dL)', ...axis(colors, mini) },
      series: [{ name: 'Qualifying fasting steps', type: 'scatter',
        symbolSize: mini ? 2.5 : 5,
        data: steps.map((step) => [windowIndex.get(step.window_id), step.dbg]),
        itemStyle: { color: colors.signal, opacity: .58 } }],
    };
  }
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend(['Qualifying fasting steps'], colors, mini),
    xAxis: { type: 'value', min: 0, name: 'insulin acted (U)', ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'glucose change (mg/dL)', ...axis(colors, mini) },
    series: [{ name: 'Qualifying fasting steps', type: 'scatter',
      symbolSize: mini ? 2.5 : 5,
      data: steps.map((step) => [step.insulin_acted, step.dbg]),
      itemStyle: { color: colors.signal, opacity: .58 } }],
  };
}

function carbRatioOption(mode, { data, range, mini = false, window } = {}) {
  const colors = chartColors();
  const block = data?.block || {};
  const runs = data?.runs || [];
  const description = `${block.examined_runs ?? 0} examined meal runs; ${block.support ?? 0} support; ${block.excluded_runs ?? 0} excluded. Support uses solid traces and filled diamonds; directional-only evidence uses dashed traces and open diamonds.`;
  if (mode === 'clock') {
    const frame = clockFrame(window || [block.start_min ?? 0, block.end_min ?? 1440]);
    const points = (inPool) => runs.filter((run) => run.in_pool === inPool && finite(run.true_ic))
      .map((run) => [frame.map(minuteOfDay(run.t)), run.true_ic]);
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend([
        { name: 'Support run', icon: 'circle' },
        { name: 'Directional-only run', icon: 'emptyCircle' },
      ], colors, mini),
      xAxis: { type: 'value', min: 0, max: frame.span, name: 'meal start',
        ...axis(colors, mini),
        axisLabel: { ...axis(colors, mini).axisLabel, formatter: frame.label },
        splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, name: 'Carb ratio (g/U)', ...axis(colors, mini) },
      series: [
        { name: 'Directional-only run', type: 'scatter', symbol: 'emptyCircle',
          symbolSize: mini ? 3 : 6, data: points(false),
          itemStyle: { color: colors.excluded, opacity: .72 } },
        { name: 'Support run', type: 'scatter', symbol: 'circle',
          symbolSize: mini ? 4 : 8, data: points(true),
          itemStyle: { color: colors.signal, opacity: .88 } },
      ],
    };
  }
  if (!Array.isArray(range) || range.length !== 2
      || !range.every(finite) || range[0] >= range[1]) {
    throw new TypeError('carb-ratio evidence needs one injected field glucose range');
  }
  const runById = new Map(runs.map((run) => [run.run_id, run]));
  const pointsByRun = new Map((data?.series || []).map((series) => [series.run_id, series.points]));
  const members = mealMemberMarkers(runs.map((run) => ({
    ...run, points: pointsByRun.get(run.run_id) || [],
  })), range[0] + 4).map((marker) => ({
    ...marker,
    inPool: Boolean(runById.get(marker.runId)?.in_pool),
    itemStyle: { color: runById.get(marker.runId)?.in_pool ? colors.signal : colors.excluded },
  }));
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend([
      { name: 'Support run', icon: 'diamond' },
      { name: 'Directional-only run', icon: 'emptyDiamond' },
    ], colors, mini),
    xAxis: { type: 'value', name: 'minutes from first meal', ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', min: range[0], max: range[1], name: 'mg/dL',
      ...axis(colors, mini) },
    series: [
      { name: 'Target range', type: 'line', data: [], silent: true,
        markLine: { symbol: 'none', silent: true,
          lineStyle: { type: 'dashed', color: colors.muted, opacity: .6 },
          label: { show: !mini, position: 'insideEndTop', color: colors.muted,
            fontSize: 10, formatter: '{c}' }, data: [{ yAxis: 70 }, { yAxis: 180 }] } },
      ...(data?.series || []).map((series) => ({
        name: runById.get(series.run_id)?.in_pool ? 'Support run' : 'Directional-only run',
        type: 'line', symbol: 'none', connectNulls: true, animation: false,
        data: series.points.map((point) => [point.minute, point.bg]),
        lineStyle: {
          color: runById.get(series.run_id)?.in_pool ? colors.signal : colors.excluded,
          width: mini ? .8 : 1.2,
          opacity: runById.get(series.run_id)?.in_pool ? .34 : .20,
          type: runById.get(series.run_id)?.in_pool ? 'solid' : 'dashed' },
      })),
      { name: 'Support run', type: 'scatter', symbol: 'diamond',
        symbolSize: mini ? 3 : 7, data: members.filter(({ inPool }) => inPool),
        animation: false, emphasis: { disabled: true }, z: 8 },
      { name: 'Directional-only run', type: 'scatter', symbol: 'emptyDiamond',
        symbolSize: mini ? 3 : 7, data: members.filter(({ inPool }) => !inPool),
        animation: false, emphasis: { disabled: true }, z: 8 },
    ],
  };
}

export function carbRatioGlucoseValues(data) {
  return (data?.series || []).flatMap((series) => series.points || [])
    .map((point) => point.bg).filter(finite);
}

/* A PARAMETER TILE CARRIES ITS OWN ROW'S EXTENT, in the queue's words. Basal
   slots and carb-ratio blocks are published several to a window, so a standing
   kind name printed look-alike tiles the reader could not tell apart — the same
   defect the behavioural kind was fixed for. The extent is the row's OWN
   published `span.label`, the very string the queue's row title is built on
   (`_span_label` in `ciq_autotune/findings_projection.py`), never a clock span
   formatted a second time here. The evidence phrase stays the kind's. A row
   arriving off the wire without one keeps the standing name rather than
   printing a hole. */
const spanNamed = (parameter, evidence) => (row) => ({
  title: row.span?.label
    ? `${parameter} ${row.span.label} · ${evidence}`
    : `${parameter} · ${evidence}`,
  meta: null,
});

const entries = [
  {
    kind: 'basal',
    name: 'Basal · nights of steady data',
    nameFor: spanNamed('Basal', 'nights of steady data'),
    modes: ['clock', 'event'],
    meta: (mode) => mode === 'clock'
      ? 'delivered vs programmed by night' : 'supported vs insufficient evidence',
    option: basalOption,
    thumbnail: (data, title) => thumbnail((title || 'Basal · nights of steady data').toUpperCase(),
      `${data?.roster_count ?? 0} / ${data?.directional_support_count ?? 0}`,
      [{ type: 'line', symbol: 'none', data: (data?.nights || []).map((night) => night.delivered_rate),
        lineStyle: { color: chartColors().basal, width: 1 } }]),
    coordinateSchema: ['slot'],
    matches: (row) => !row.event_chart && row.parameter === 'basal_rate',
    coordinates: (row) => ({
      slot: row.slot ?? Math.floor((row.span?.start_min ?? 0) / 30),
    }),
    glucoseValues: null,
  },
  {
    kind: 'isf',
    name: 'Correction factor · rest windows',
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'dose acted → glucose change' : 'qualifying steps by rest window',
    option: isfOption,
    thumbnail: (data) => thumbnail('CORRECTION FACTOR · REST',
      `${data?.counts?.detected_windows ?? 0} / ${data?.counts?.qualifying_windows ?? 0} / ${data?.counts?.qualifying_steps ?? 0}`,
      [{ type: 'scatter', symbolSize: 2,
        data: (data?.steps || []).slice(0, 24).map((step) => [step.insulin_acted, step.dbg]),
        itemStyle: { color: chartColors().signal } }]),
    coordinateSchema: [],
    matches: (row) => !row.event_chart && row.parameter === 'isf',
    coordinates: () => ({}),
    glucoseValues: null,
  },
  {
    kind: 'carb-ratio',
    name: 'Carb ratio · meal runs',
    nameFor: spanNamed('Carb ratio', 'meal runs'),
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'CGM from first meal' : 'Carb ratio by meal start',
    option: carbRatioOption,
    thumbnail: (data, title) => thumbnail((title || 'Carb ratio · meal runs').toUpperCase(),
      `${data?.block?.examined_runs ?? 0} / ${data?.block?.support ?? 0}`,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.series?.[0]?.points?.map((point) => point.bg) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    coordinateSchema: ['block_id', 'analysis_generation'],
    matches: (row) => !row.event_chart && row.parameter === 'carb_ratio',
    coordinates: (row, findings) => ({
      block_id: row.block_id ?? row.span?.start_min,
      analysis_generation: findings.analysis_generation,
    }),
    glucoseValues: carbRatioGlucoseValues,
  },
  {
    kind: 'event-comparison',
    /* ONE TILE PER BEHAVIOURAL ROW, AND EACH ONE SAYS WHOSE IT IS. This kind is
       the only one a window can publish several of at once, so a single static
       name printed three identical-looking tiles and the reader could not tell
       which finding any of them answered. The name is the row's own published
       title and the caption its own published exposure noun; `nameFor` is what
       keeps the tile field free of a second copy of either. */
    name: 'Response comparison',
    modes: null,
    meta: () => 'responses aligned to each event',
    nameFor: (row) => ({
      title: row.title || 'Response comparison',
      meta: `${row.appearances?.[0]?.noun || 'responses'} aligned to each event`,
    }),
    option: (_mode, { data, range, caseFile = data, surface = null, mini = false } = {}) =>
      eventComparisonChartOption(caseFile, range, surface, mini),
    thumbnail: (data, title) => thumbnail((title || 'Response comparison').toUpperCase(),
      data?.summary?.denominator ?? 0,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.projection?.cohorts?.[0]?.points?.map((point) => point.median) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    /* The retired standalone comparison endpoint's window is gone with it
       (#181): this tile asks the finding-case-file path for the same
       event-aligned projection the inspector reads. Its factor and view come
       back from the row's own `event_chart`, so two behavioural tiles in one
       window can never share a request. */
    coordinateSchema: ['projection_id', 'finding_id', 'alignment', 'factor', 'view'],
    matches: (row) => Boolean(row.event_chart),
    /* The case-file coordinates are opaque transport values: the served
       projection, the row's own id, and the alignment this tile draws. */
    coordinates: (row, findings) => ({
      projection_id: findings.projection_id,
      finding_id: row.id,
      alignment: 'event',
      factor: row.event_chart.lever,
      view: row.appearances?.[0]?.family ?? null,
    }),
    glucoseValues: eventComparisonGlucoseValues,
  },
];

export const DIAGNOSE_EVIDENCE_CHARTS = Object.freeze(entries.map((entry) => Object.freeze({
  ...entry,
  modes: entry.modes && Object.freeze([...entry.modes]),
  coordinateSchema: Object.freeze([...entry.coordinateSchema]),
})));
