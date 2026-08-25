import {
  eventComparisonChartOption,
  eventComparisonGlucoseValues,
  GLUCOSE_ENVELOPE,
  GLUCOSE_STEP,
  glucoseRange,
} from './diagnose-event-comparison.js';
import { mealMemberMarkers } from './diagnose-workstation-chart.js';

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
const FULL_GRID = Object.freeze({
  left: 52, right: 22, top: 24, bottom: 42, containLabel: false,
});
const MINI_GRID = Object.freeze({
  left: 18, right: 6, top: 8, bottom: 14, containLabel: false,
});

const grid = (mini) => ({ ...(mini ? MINI_GRID : FULL_GRID) });
const axis = (colors, mini = false) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: colors.muted, fontFamily: MONO, fontSize: mini ? 8 : 10 },
  splitLine: { show: true, lineStyle: { color: colors.line, width: 1 } },
});
const chartBase = (description, mini, colors) => ({
  animation: false,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FONT, color: colors.text },
  aria: { enabled: true, decal: { show: false }, description },
  grid: grid(mini),
});
const chartLegend = (data, colors) => ({
  show: true, left: 52, right: 22, bottom: 0, selectedMode: false,
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

function basalOption(mode, { data, mini = false } = {}) {
  const colors = chartColors();
  const nights = data?.nights || [];
  const description = `${data?.roster_count ?? 0} nights of steady data; ${data?.directional_support_count ?? 0} directional support.`;
  if (mode === 'event') {
    const support = data?.directional_support_count ?? 0;
    const assertsMove = data?.asserts_move === true;
    const verdict = data?.safety_status ?? 'Analyzer verdict unavailable';
    const label = hhmm((data?.slot ?? 0) * 30);
    return {
      ...chartBase(description, mini, colors),
      legend: chartLegend([verdict], colors),
      xAxis: { type: 'category', data: [label], ...axis(colors, mini),
        splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, name: 'nights', ...axis(colors, mini) },
      series: [
        { name: verdict, type: 'bar', data: [support], animation: false,
          barCategoryGap: '25%', itemStyle: { color: assertsMove
            ? colors.basal : colors.excluded } },
      ],
    };
  }
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend(['Programmed basal', 'Delivered basal'], colors),
    xAxis: { type: 'category', data: nights.map((night) => night.date), ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'U/h', ...axis(colors, mini) },
    series: [
      { name: 'Programmed basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.programmed_rate),
        lineStyle: { color: colors.programmed, width: 1.4, type: 'dashed' } },
      { name: 'Delivered basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.delivered_rate),
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
      legend: chartLegend(['Qualifying fasting steps'], colors),
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
    legend: chartLegend(['Qualifying fasting steps'], colors),
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
      ], colors),
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
    throw new TypeError('carb-ratio evidence needs one injected arrangement glucose range');
  }
  const runById = new Map(runs.map((run) => [run.run_id, run]));
  const pointsByRun = new Map((data?.series || []).map((series) => [series.run_id, series.points]));
  const members = mealMemberMarkers(runs.map((run) => ({
    ...run, points: pointsByRun.get(run.run_id) || [],
  })), range[0] + 4).map((marker) => ({
    ...marker,
    inPool: Boolean(runById.get(marker.runId)?.in_pool),
    itemStyle: { color: runById.get(marker.runId)?.in_pool
      ? colors.signal : colors.excluded },
  }));
  return {
    ...chartBase(description, mini, colors),
    legend: chartLegend([
      { name: 'Support run', icon: 'diamond' },
      { name: 'Directional-only run', icon: 'emptyDiamond' },
    ], colors),
    xAxis: { type: 'value', name: 'minutes from first meal', ...axis(colors, mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', min: range[0], max: range[1], name: 'mg/dL',
      ...axis(colors, mini) },
    series: [
      { name: 'Target range', type: 'line', data: [], silent: true,
        markArea: { silent: true, itemStyle: { color: colors.target },
          data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]] } },
      ...(data?.series || []).map((series) => ({
        name: runById.get(series.run_id)?.in_pool ? 'Support run' : 'Directional-only run',
        type: 'line', symbol: 'none', connectNulls: true, animation: false,
        data: series.points.map((point) => [point.minute, point.bg]),
        lineStyle: { color: runById.get(series.run_id)?.in_pool
          ? colors.signal : colors.excluded, width: mini ? .8 : 1.2,
        opacity: runById.get(series.run_id)?.in_pool ? .48 : .28,
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

const entries = [
  {
    kind: 'basal',
    name: 'Basal · nights of steady data',
    modes: ['clock', 'event'],
    meta: (mode) => mode === 'clock'
      ? 'delivered vs programmed by night' : 'directional support · analyzer verdict',
    option: basalOption,
    thumbnail: (data) => thumbnail('BASAL · STEADY NIGHTS',
      `${data?.roster_count ?? 0} / ${data?.directional_support_count ?? 0}`,
      [{ type: 'line', symbol: 'none', data: (data?.nights || []).map((night) => night.delivered_rate),
        lineStyle: { color: chartColors().basal, width: 1 } }]),
    coordinateSchema: ['slot'],
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
    glucoseValues: null,
  },
  {
    kind: 'carb-ratio',
    name: 'Carb ratio · meal runs',
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'CGM from first meal' : 'Carb ratio by meal start',
    option: carbRatioOption,
    thumbnail: (data) => thumbnail('CARB RATIO · MEAL RUNS',
      `${data?.block?.examined_runs ?? 0} / ${data?.block?.support ?? 0}`,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.series?.[0]?.points?.map((point) => point.bg) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    coordinateSchema: ['block_id', 'analysis_generation'],
    glucoseValues: carbRatioGlucoseValues,
  },
  {
    kind: 'event-comparison',
    name: 'Meals / lows · event comparison',
    modes: null,
    meta: () => 'served cohorts aligned to their event',
    option: (_mode, { data, range } = {}) => eventComparisonChartOption(data, range),
    thumbnail: (data) => thumbnail('MEALS / LOWS · COMPARISON',
      data?.population?.denominator ?? 0,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.cohorts?.[0]?.points?.map((point) => point.median) || [],
        lineStyle: { color: chartColors().signal, width: 1 } }]),
    coordinateSchema: ['view', 'factor', 'window'],
    glucoseValues: eventComparisonGlucoseValues,
  },
];

export const DIAGNOSE_EVIDENCE_CHARTS = Object.freeze(entries.map((entry) => Object.freeze({
  ...entry,
  modes: entry.modes && Object.freeze([...entry.modes]),
  coordinateSchema: Object.freeze([...entry.coordinateSchema]),
})));
