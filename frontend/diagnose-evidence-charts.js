import { eventComparisonChartOption } from './diagnose-event-comparison.js';
import { mealMemberMarkers } from './diagnose-workstation-chart.js';

export const GLUCOSE_STEP = 20;
export const GLUCOSE_ENVELOPE = [60, 200];

export function glucoseRange(values) {
  const finite = values.filter((v) => Number.isFinite(v));
  const [floorFloor, ceilCeil] = GLUCOSE_ENVELOPE;
  if (finite.length === 0) return [floorFloor, ceilCeil];
  const low = Math.min(floorFloor, Math.floor(Math.min(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  const high = Math.max(ceilCeil, Math.ceil(Math.max(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  return [low, high];
}

const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const FONT = 'Inter, system-ui, sans-serif';
const COLORS = {
  signal: '#86ad78', basal: '#6E8BB5', programmed: '#c3b49c', quiet: '#a3968a',
  line: '#322e29', text: '#f5ece0', muted: '#a3968a', warning: '#c98a4e',
  excluded: '#7a6d61', target: 'rgba(134, 173, 120, .08)',
};
const FULL_GRID = Object.freeze({
  left: 52, right: 22, top: 24, bottom: 42, containLabel: false,
});
const MINI_GRID = Object.freeze({
  left: 18, right: 6, top: 8, bottom: 14, containLabel: false,
});

const grid = (mini) => ({ ...(mini ? MINI_GRID : FULL_GRID) });
const axis = (mini = false) => ({
  axisLine: { show: false },
  axisTick: { show: false },
  axisLabel: { color: COLORS.muted, fontFamily: MONO, fontSize: mini ? 8 : 10 },
  splitLine: { show: true, lineStyle: { color: COLORS.line, width: 1 } },
});
const chartBase = (description, mini) => ({
  animation: false,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: FONT, color: COLORS.text },
  aria: { enabled: true, decal: { show: false }, description },
  grid: grid(mini),
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
  return {
    animation: false,
    backgroundColor: 'transparent',
    grid: { left: 4, right: 4, top: 28, bottom: 4 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    graphic: [
      { type: 'text', left: 5, top: 4, silent: true,
        style: { text: name, fill: COLORS.muted, font: `600 9px ${FONT}` } },
      { type: 'text', right: 5, top: 3, silent: true,
        style: { text: String(count), fill: COLORS.text, font: `700 10px ${MONO}` } },
    ],
    series,
  };
}

function basalOption(mode, { data, mini = false } = {}) {
  const nights = data?.nights || [];
  const description = `${data?.roster_count ?? 0} nights of steady data; ${data?.directional_support_count ?? 0} directional support.`;
  if (mode === 'event') {
    const values = nights.flatMap((night) => [night.programmed_rate, night.delivered_rate])
      .filter(finite);
    const low = values.length ? Math.min(...values) : 0;
    const high = values.length ? Math.max(...values) : 1;
    return {
      ...chartBase(description, mini),
      xAxis: { type: 'value', name: 'programmed basal (U/h)', ...axis(mini) },
      yAxis: { type: 'value', name: 'delivered basal (U/h)', ...axis(mini) },
      series: [
        { name: 'Equal delivery', type: 'line', symbol: 'none', silent: true,
          data: [[low, low], [high, high]], lineStyle: { color: COLORS.programmed,
            width: 1.2, type: 'dashed' } },
        { name: 'Night', type: 'scatter', symbolSize: mini ? 3 : 7,
          data: nights.map((night) => [night.programmed_rate, night.delivered_rate]),
          itemStyle: { color: COLORS.basal } },
      ],
    };
  }
  return {
    ...chartBase(description, mini),
    xAxis: { type: 'category', data: nights.map((night) => night.date), ...axis(mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'U/h', ...axis(mini) },
    series: [
      { name: 'Programmed basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.programmed_rate),
        lineStyle: { color: COLORS.programmed, width: 1.4, type: 'dashed' } },
      { name: 'Delivered basal', type: 'line', symbol: 'none', connectNulls: true,
        data: nights.map((night) => night.delivered_rate),
        lineStyle: { color: COLORS.basal, width: mini ? 1.2 : 2 } },
    ],
  };
}

function isfOption(mode, { data, mini = false } = {}) {
  const counts = data?.counts || {};
  const windows = data?.windows || [];
  const steps = data?.steps || [];
  const description = `${counts.detected_windows ?? 0} detected rest windows; ${counts.qualifying_windows ?? 0} qualifying windows; ${counts.qualifying_steps ?? 0} qualifying steps.`;
  if (mode === 'clock') {
    const windowIndex = new Map(windows.map((window, index) => [window.id, index]));
    return {
      ...chartBase(description, mini),
      xAxis: { type: 'category', data: windows.map((window) => window.date), ...axis(mini),
        splitLine: { show: false } },
      yAxis: { type: 'value', name: 'ΔBG (mg/dL)', ...axis(mini) },
      series: [{ name: 'Qualifying fasting steps', type: 'scatter',
        symbolSize: mini ? 2.5 : 5,
        data: steps.map((step) => [windowIndex.get(step.window_id), step.dbg]),
        itemStyle: { color: COLORS.signal, opacity: .58 } }],
    };
  }
  return {
    ...chartBase(description, mini),
    xAxis: { type: 'value', min: 0, name: 'insulin acted (U)', ...axis(mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', name: 'ΔBG (mg/dL)', ...axis(mini) },
    series: [{ name: 'Qualifying fasting steps', type: 'scatter',
      symbolSize: mini ? 2.5 : 5,
      data: steps.map((step) => [step.insulin_acted, step.dbg]),
      itemStyle: { color: COLORS.signal, opacity: .58 } }],
  };
}

function carbRatioOption(mode, { data, range, mini = false, window } = {}) {
  const block = data?.block || {};
  const runs = data?.runs || [];
  const description = `${block.examined_runs ?? 0} examined meal runs; ${block.support ?? 0} support; ${block.excluded_runs ?? 0} excluded. Support uses solid traces and filled diamonds; directional-only evidence uses dashed traces and open diamonds.`;
  if (mode === 'clock') {
    const frame = clockFrame(window || [block.start_min ?? 0, block.end_min ?? 1440]);
    const points = (inPool) => runs.filter((run) => run.in_pool === inPool && finite(run.true_ic))
      .map((run) => [frame.map(minuteOfDay(run.t)), run.true_ic]);
    return {
      ...chartBase(description, mini),
      xAxis: { type: 'value', min: 0, max: frame.span, name: 'meal start', ...axis(mini),
        axisLabel: { ...axis(mini).axisLabel, formatter: frame.label },
        splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, name: 'measured I:C (g/U)', ...axis(mini) },
      series: [
        { name: 'Directional-only run', type: 'scatter', symbol: 'emptyCircle',
          symbolSize: mini ? 3 : 6, data: points(false),
          itemStyle: { color: COLORS.excluded, opacity: .72 } },
        { name: 'Support run', type: 'scatter', symbolSize: mini ? 4 : 8,
          data: points(true), itemStyle: { color: COLORS.signal, opacity: .88 } },
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
      ? COLORS.signal : COLORS.excluded },
  }));
  return {
      ...chartBase(description, mini),
      legend: { show: true, left: 52, right: 22, bottom: 0, selectedMode: false,
        itemWidth: 22, itemHeight: 8, itemGap: 18,
        textStyle: { color: COLORS.muted, fontFamily: FONT, fontSize: 9 },
        data: [
          { name: 'Support run', icon: 'diamond' },
          { name: 'Directional-only run', icon: 'emptyDiamond' },
        ] },
      xAxis: { type: 'value', name: 'minutes from first meal', ...axis(mini),
      splitLine: { show: false } },
    yAxis: { type: 'value', min: range[0], max: range[1], name: 'mg/dL', ...axis(mini) },
    series: [
      { name: 'Target range', type: 'line', data: [], silent: true,
        markArea: { silent: true, itemStyle: { color: COLORS.target },
          data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]] } },
      ...(data?.series || []).map((series) => ({
        name: runById.get(series.run_id)?.in_pool ? 'Support run' : 'Directional-only run',
        type: 'line', symbol: 'none', connectNulls: true, animation: false,
        data: series.points.map((point) => [point.minute, point.bg]),
        lineStyle: { color: runById.get(series.run_id)?.in_pool
          ? COLORS.signal : COLORS.excluded, width: mini ? .8 : 1.2,
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

export function eventComparisonGlucoseValues(data) {
  const projection = data?.schema === 'diagnose-finding-case-file-v1'
    ? data.projection : data;
  const aggregateValues = (projection?.cohorts || []).flatMap((cohort) => [
    ...(cohort.points || []).flatMap((point) => [point.median, point.p25, point.p75]),
    ...(cohort.episodes || []).flatMap((episode) => (episode.glucose || []).map((point) => point.bg)),
  ]);
  const selected = projection?.selection?.state === 'selected'
    ? (projection.selection.detail.glucose || []).map((point) => point.bg) : [];
  return [...aggregateValues, ...selected].filter(finite);
}

const entries = [
  {
    kind: 'basal',
    name: 'Basal · nights of steady data',
    modes: ['clock', 'event'],
    meta: (mode) => mode === 'clock'
      ? 'delivered vs programmed by night' : 'delivered against programmed',
    option: basalOption,
    thumbnail: (data) => thumbnail('BASAL · STEADY NIGHTS',
      `${data?.roster_count ?? 0} / ${data?.directional_support_count ?? 0}`,
      [{ type: 'line', symbol: 'none', data: (data?.nights || []).map((night) => night.delivered_rate),
        lineStyle: { color: COLORS.basal, width: 1 } }]),
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
        itemStyle: { color: COLORS.signal } }]),
    coordinateSchema: [],
    glucoseValues: null,
  },
  {
    kind: 'carb-ratio',
    name: 'Carb ratio · meal runs',
    modes: ['event', 'clock'],
    meta: (mode) => mode === 'event'
      ? 'CGM from first meal' : 'measured I:C by meal start',
    option: carbRatioOption,
    thumbnail: (data) => thumbnail('CARB RATIO · MEAL RUNS',
      `${data?.block?.examined_runs ?? 0} / ${data?.block?.support ?? 0}`,
      [{ type: 'line', symbol: 'none', connectNulls: true,
        data: data?.series?.[0]?.points?.map((point) => point.bg) || [],
        lineStyle: { color: COLORS.signal, width: 1 } }]),
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
        lineStyle: { color: COLORS.signal, width: 1 } }]),
    coordinateSchema: ['view', 'factor', 'window'],
    glucoseValues: eventComparisonGlucoseValues,
  },
];

export const DIAGNOSE_EVIDENCE_CHARTS = Object.freeze(entries.map((entry) => Object.freeze({
  ...entry,
  modes: entry.modes && Object.freeze([...entry.modes]),
  coordinateSchema: Object.freeze([...entry.coordinateSchema]),
})));
