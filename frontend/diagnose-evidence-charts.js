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
  high: '#a94f21', low: '#9d3018', sunken: '#e7e4dc', ruleStrong: '#6b7669',
};
const COLOR_TOKENS = {
  signal: '--in-range', basal: '--basal', programmed: '--secondary',
  line: '--line', text: '--text', muted: '--muted', excluded: '--notindata',
  high: '--high', low: '--low', sunken: '--wk-surface-sunken', ruleStrong: '--wk-rule-strong',
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
  return { ...colors, dark: document.documentElement.classList?.contains('dark') ?? false,
    target: `color-mix(in srgb, ${colors.signal} 8%, transparent)` };
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

const basalFacts = (data) => {
  const nights = data?.nights || [];
  const oldestFirst = [...nights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const programmed = oldestFirst.find((night) => finite(night.programmed_rate))?.programmed_rate;
  const ciLo = data?.estimate?.lo;
  const ciHi = data?.estimate?.hi;
  const estimateValue = data?.estimate?.value;
  const delivered = nights.map((night) => night.delivered_rate).filter(finite);
  const sorted = [...delivered].sort((a, b) => a - b);
  const p85 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .85))] : 0;
  return {
    nights, oldestFirst, programmed, ciLo, ciHi, estimateValue, p85,
    above: nights.filter((night) => night.sign === 1).length,
    below: nights.filter((night) => night.sign === -1).length,
    atRate: nights.filter((night) => night.sign === null).length,
  };
};

const basalScale = ({ ciHi, estimateValue, programmed, p85 }, ledger = false) => {
  if (ledger) {
    let step = Math.max(ciHi || 0, estimateValue || 0, programmed || 0, p85) > 1.2 ? .25
      : Math.max(ciHi || 0, estimateValue || 0, programmed || 0, p85) > .6 ? .1 : .05;
    let yMax = Math.ceil(Math.max((ciHi || 0) * 1.25, (estimateValue || 0) * 1.25,
      (programmed || 0) * 1.25, (p85 || 0) * 1.05, step) / step) * step;
    while (finite(programmed) && programmed / yMax > .55) yMax += step;
    return { yMax, yStep: step };
  }
  const yRaw = Math.max(
    Math.ceil(Math.max(ciHi || 0, estimateValue || 0, programmed || 0) * 1.6 * 10) / 10,
    Math.ceil(p85 * 10) / 10) || 1;
  const yStep = yRaw > 1.2 ? .5 : yRaw > .6 ? .25 : .1;
  return { yMax: Math.ceil(yRaw / yStep) * yStep, yStep };
};

const basalTally = (facts, data, colors, vertical = false) => {
  const lessColor = `color-mix(in srgb, ${colors.basal} 76%, ${colors.text})`;
  const rich = {
    swMore: { backgroundColor: colors.high, width: vertical ? 8 : 4, height: vertical ? 4 : 8, borderRadius: 1 },
    swLess: { backgroundColor: lessColor, width: vertical ? 8 : 4, height: vertical ? 4 : 8, borderRadius: 1 },
    swAt: { backgroundColor: colors.programmed, width: vertical ? 2.5 : 9, height: vertical ? 9 : 2.5 },
    n: { color: colors.text, fontFamily: MONO, fontSize: 10, padding: [0, 4, 0, 4] },
    m: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
    gap: { width: vertical ? 10 : 18 },
    tail: { color: colors.muted, fontFamily: FONT, fontSize: 9 },
  };
  return { rich, text: `{swMore|}{n|${facts.above}}{m| MORE}{swLess|}{n|${facts.below}}{m| LESS}`
    .replace('{swLess|}', '{gap|}{swLess|}').replace('{swAt|}', '{gap|}{swAt|}')
    + `{gap|}{tail|${facts.nights.length} STEADY NIGHTS · ${data?.excluded_night_count ?? 0} EXCLUDED}` };
};

function basalBayOption(data, mini, colors, description) {
  const option = basalOption('clock', { data, mini });
  if (mini) return option;

  const { programmed, ciLo, ciHi, estimateValue } = basalFacts(data);
  const mainGrid = { ...option.grid[0], right: 174 };
  option.grid = [mainGrid, { right: 10, width: 150, top: mainGrid.top, bottom: mainGrid.bottom }];
  option.xAxis[1] = { type: 'value', min: 0, max: 1, show: false, gridIndex: 1 };
  option.yAxis[1] = { type: 'value', min: 0, max: option.yAxis[0].max, show: false, gridIndex: 1 };

  const gutterIndex = option.series.findIndex((series) => series.xAxisIndex === 1 && series.yAxisIndex === 1);
  if (gutterIndex >= 0) option.series.splice(gutterIndex, 1);
  option.series.unshift({ type: 'custom', animation: false, silent: true, clip: false,
    xAxisIndex: 1, yAxisIndex: 1, data: [0], renderItem: (params) => ({ type: 'rect',
      shape: { x: params.coordSys.x, y: 8, width: 150, height: params.coordSys.y + params.coordSys.height - 36 },
      style: { fill: colors.sunken, stroke: colors.dark ? colors.ruleStrong : 'transparent', lineWidth: 1 } }),
  });
  option.series.push({ type: 'custom', animation: false, silent: true, clip: false, data: [0],
    renderItem: (params, api) => {
      if (!finite(programmed)) return null;
      const y = api.coord([0, programmed])[1];
      const mainEnd = params.coordSys.x + params.coordSys.width;
      return { type: 'line', shape: { x1: mainEnd, y1: y, x2: mainEnd + 14 + 24, y2: y },
        style: { stroke: colors.programmed, lineWidth: 1, lineDash: [1, 3], opacity: .72 } };
    },
  });
  if (!finite(ciLo) || !finite(ciHi)) return option;
  option.series.push({ type: 'custom', animation: false, silent: true, xAxisIndex: 1, yAxisIndex: 1,
    data: [0], renderItem: (params, api) => {
      const x = params.coordSys.x + 24;
      const yLo = api.coord([0, ciLo])[1];
      const yHi = api.coord([0, ciHi])[1];
      const yEst = finite(estimateValue) ? api.coord([0, estimateValue])[1] : null;
      const readY = Math.max(params.coordSys.y + 18, Math.min(yEst ?? yHi, params.coordSys.y + params.coordSys.height - 42));
      return { type: 'group', children: [{ type: 'rect', shape: { x: x - 9, y: yHi, width: 18, height: yLo - yHi }, style: { fill: `color-mix(in srgb, ${colors.signal} 14%, transparent)` } },
        { type: 'rect', shape: { x: x - 1, y: yHi, width: 2, height: yLo - yHi }, style: { fill: colors.programmed } },
        { type: 'rect', shape: { x: x - 9, y: yHi - 1, width: 18, height: 2 }, style: { fill: colors.programmed } },
        { type: 'rect', shape: { x: x - 9, y: yLo - 1, width: 18, height: 2 }, style: { fill: colors.programmed } },
        ...(yEst === null ? [] : [{ type: 'rect', shape: { x: x - 15, y: yEst - 1.5, width: 30, height: 3 }, style: { fill: colors.signal } },
          { type: 'text', style: { text: estimateValue.toFixed(2), x: x + 22, y: readY, fill: colors.text, font: `800 21px ${MONO}`, verticalAlign: 'middle' } },
          { type: 'text', style: { text: 'U/h · ESTIMATE', x: x + 22, y: readY + 18, fill: colors.muted, font: `9px ${FONT}` } },
          { type: 'text', style: { text: `${ciLo.toFixed(2)}–${ciHi.toFixed(2)} CI\nSET ${programmed?.toFixed(2) ?? '—'}`, x: x + 22, y: readY + 31, fill: colors.muted, font: `10px ${MONO}`, lineHeight: 13 } }]),
        { type: 'text', style: { text: ciHi.toFixed(2), x: x - 13, y: yHi, align: 'right', verticalAlign: 'middle', fill: colors.muted, font: `10px ${MONO}` } },
        { type: 'text', style: { text: ciLo.toFixed(2), x: x - 13, y: yLo, align: 'right', verticalAlign: 'middle', fill: colors.muted, font: `10px ${MONO}` } }] };
    },
  });
  return option;
}

function basalLedgerOption(data, mini, colors, description) {
  const facts = basalFacts(data);
  const { programmed, ciLo, ciHi, estimateValue } = facts;
  const { yMax, yStep } = basalScale(facts, true);
  const lessColor = `color-mix(in srgb, ${colors.basal} 76%, ${colors.text})`;
  const rows = [...facts.oldestFirst].sort((a, b) => ((b.delivered_rate ?? programmed) - programmed) - ((a.delivered_rate ?? programmed) - programmed) || a.date.localeCompare(b.date));
  const tally = basalTally(facts, data, colors, true);
  const gridA = mini ? { ...MINI_GRID } : { left: GRID.left + 6, right: 30, top: 32, bottom: 92 };
  if (mini) return { ...chartBase(description, true, colors), legend: { show: false }, grid: gridA,
    xAxis: { type: 'value', min: 0, max: yMax, show: false }, yAxis: { type: 'category', data: rows.map((row) => row.date), show: false },
    series: [{ type: 'custom', animation: false, silent: true, data: rows.map((row, index) => [row.delivered_rate, index]), renderItem: (params, api) => {
      const row = rows[params.dataIndex]; const x = api.coord([programmed, params.dataIndex])[0]; const end = api.coord([Math.min(row.delivered_rate, yMax), params.dataIndex])[0]; const h = api.size([0, 1])[1] * .8;
      return { type: 'rect', shape: { x: Math.min(x, end), y: api.coord([0, params.dataIndex])[1] - h / 2, width: Math.abs(end - x) || 3, height: h }, style: { fill: row.sign === 1 ? colors.high : row.sign === -1 ? lessColor : colors.programmed } };
    } }] };
  return {
    ...chartBase(description, false, colors), legend: { show: false }, grid: [gridA, { left: GRID.left + 6, right: 30, bottom: 40, height: 30 }],
    graphic: [{ type: 'text', left: GRID.left + 6, bottom: 6, silent: true, style: { text: tally.text, rich: tally.rich } }],
    xAxis: [{ type: 'value', min: 0, max: yMax, interval: yStep, ...axis(colors), axisLabel: { show: false }, splitLine: { show: true, lineStyle: { color: `color-mix(in srgb, ${colors.line} 60%, transparent)`, width: 1 } } },
      { type: 'value', min: 0, max: yMax, interval: yStep, gridIndex: 1, ...axis(colors), axisLabel: { color: colors.muted, fontFamily: MONO, fontSize: 10, margin: 8, formatter: (value) => value === 0 ? '0' : value.toFixed(2) }, splitLine: { show: false } }],
    yAxis: [{ type: 'category', data: rows.map((row) => row.date), inverse: true, ...axis(colors), axisLabel: { interval: 0, color: colors.muted, fontFamily: MONO, fontSize: 8, margin: 8, formatter: (date) => date.slice(5) }, splitLine: { show: false } },
      { type: 'value', min: 0, max: 1, gridIndex: 1, show: false }],
    series: [{ type: 'custom', animation: false, data: rows.map((row, index) => [row.delivered_rate, index]), renderItem: (params, api) => {
      const row = rows[params.dataIndex]; if (!finite(programmed)) return null; const x = api.coord([programmed, params.dataIndex])[0]; const end = api.coord([Math.min(row.delivered_rate, yMax), params.dataIndex])[0]; const h = api.size([0, 1])[1] * .8;
      if (row.sign === null) return { type: 'rect', shape: { x: x - 2.5, y: api.coord([0, params.dataIndex])[1] - h / 2, width: 5, height: h }, style: { fill: colors.programmed } };
      return { type: 'rect', shape: { x: Math.min(x, end), y: api.coord([0, params.dataIndex])[1] - h / 2, width: Math.abs(end - x), height: h, r: row.sign === 1 ? [0, 2, 2, 0] : [2, 0, 0, 2] }, style: { fill: row.sign === 1 ? colors.high : lessColor } };
    }, tooltip: { formatter: (params) => { const row = rows[params.dataIndex]; return `${row.date} · ${row.delivered_rate} U/h · ${row.sign === 1 ? '+' : row.sign === -1 ? '−' : ''}${Math.abs((row.delivered_rate ?? programmed) - programmed).toFixed(2)} vs set`; } } },
    { type: 'custom', animation: false, silent: true, clip: false, data: [0], renderItem: (params, api) => { if (!finite(programmed)) return null; const x = api.coord([programmed, 0])[0]; return { type: 'group', children: [{ type: 'rect', shape: { x: x - .75, y: params.coordSys.y - 10, width: 1.5, height: params.coordSys.height + 10 + 52 }, style: { fill: `color-mix(in srgb, ${colors.programmed} 55%, ${colors.text})` } }, { type: 'text', style: { text: `set ${programmed.toFixed(2)}`, x: x - 6, y: params.coordSys.y - 12, align: 'right', fill: `color-mix(in srgb, ${colors.programmed} 55%, ${colors.text})`, font: `9px ${MONO}` } }] }; } },
    { type: 'custom', animation: false, silent: true, data: rows.map((row, index) => [row.delivered_rate, index]).filter(([value]) => finite(value) && value > yMax), renderItem: (_params, api) => { const index = api.value(1); const row = rows[index]; const [x, y] = api.coord([yMax, index]); return { type: 'group', children: [{ type: 'polygon', shape: { points: [[x + 4, y], [x, y - 3.5], [x, y + 3.5]] }, style: { fill: colors.high } }, { type: 'text', style: { text: row.delivered_rate.toFixed(1), x: x + 13, y, verticalAlign: 'middle', fill: colors.high, font: `9px ${MONO}` } }] }; } },
    { type: 'custom', animation: false, silent: true, clip: false, xAxisIndex: 1, yAxisIndex: 1, data: [0], renderItem: (params) => ({ type: 'line', shape: { x1: params.coordSys.x, y1: params.coordSys.y - 11, x2: params.coordSys.x + params.coordSys.width, y2: params.coordSys.y - 11 }, style: { stroke: colors.line, lineWidth: 1 } }) },
    ...(finite(ciLo) && finite(ciHi) ? [{ type: 'custom', animation: false, silent: true, xAxisIndex: 1, yAxisIndex: 1, data: [0], renderItem: (params, api) => { const xLo = api.coord([ciLo, .5])[0]; const xHi = api.coord([ciHi, .5])[0]; const xEst = finite(estimateValue) ? api.coord([estimateValue, .5])[0] : null; const y = api.coord([0, .5])[1]; const railLabelY = params.coordSys.y - 3; return { type: 'group', children: [{ type: 'rect', shape: { x: xLo, y: y - 6, width: xHi - xLo, height: 12 }, style: { fill: `color-mix(in srgb, ${colors.signal} 22%, transparent)` } }, { type: 'line', shape: { x1: xLo, y1: y - 6, x2: xHi, y2: y - 6 }, style: { stroke: `color-mix(in srgb, ${colors.signal} 50%, transparent)`, lineWidth: 1 } }, { type: 'line', shape: { x1: xLo, y1: y + 6, x2: xHi, y2: y + 6 }, style: { stroke: `color-mix(in srgb, ${colors.signal} 50%, transparent)`, lineWidth: 1 } }, { type: 'rect', shape: { x: xLo - .7, y: y - 9, width: 1.4, height: 18 }, style: { fill: colors.signal, opacity: .85 } }, { type: 'rect', shape: { x: xHi - .7, y: y - 9, width: 1.4, height: 18 }, style: { fill: colors.signal, opacity: .85 } }, ...(xEst === null ? [] : [{ type: 'rect', shape: { x: xEst - 1.1, y: y - 10, width: 2.2, height: 20 }, style: { fill: colors.signal } }, { type: 'text', style: { text: `est ${estimateValue.toFixed(2)}`, x: xEst, y: railLabelY, align: 'center', verticalAlign: 'bottom', fill: colors.signal, font: `9px ${MONO}` } }]), { type: 'text', style: { text: ciHi.toFixed(2), x: xHi, y: railLabelY, align: 'center', verticalAlign: 'bottom', fill: colors.muted, font: `9px ${MONO}` } }, { type: 'text', style: { text: basalVerdict(data), x: params.coordSys.x, y, fill: colors.muted, font: `700 9px ${FONT}`, letterSpacing: '.06em' } }] }; } }] : []),
    ],
  };
}

/* SIXTEEN OF TWENTY — the roster as ONE silhouette instead of twenty marks.
   Every other basal form here plots one mark per night; this one counts, for a
   given rate, how many nights the algorithm ran AT OR ABOVE it. Each night is
   its own 1-night step, so nothing is smoothed and nothing is invented, but the
   roster becomes a single object with a shape read in one glance. The wearer's
   programmed rate is a vertical rule through it, and where the staircase stands
   as it crosses that rule IS the finding: the nights at exactly the programmed
   rate fall as a cliff landing on the rule itself. Everything else — the tally,
   the exclusions, the verdict — is set as type, because only the part carrying
   the argument earns ink. */
const EDITORIAL = Object.freeze({
  margin: 28, deckTop: 16, figureTop: 80, footerBand: 80, rail: 206,
});
/* THE RAIL IS A TABLE, so it is set as one: a numeral column right-aligned to a
   fixed x, a fixed gutter, and a label column left-aligned to a fixed x, with
   one pitch down the whole section. Set as rich-text rows it was neither — each
   row's line box was laid out to its own content, so the numerals staggered
   (11, 4, 5 each finding its own right edge) and a wrapped label centred itself
   under its row. The label column is only as wide as the labels need, so the
   PAIR stays tight and the block of pairs sits against the rail's own margin:
   stretched to the full rail width the numerals ended up marooned a column away
   from the words they belong to, with the white space inside the row. */
const RAIL = Object.freeze({ gutter: 10, label: 132, pitch: 24, lead: 14 });
/* Canvas text has no flow, so a line break is a decision made here. The budget
   is a character count off the font's mean advance — a hairline of slack is
   cheaper than measuring text the layout cannot reflow anyway. */
const editorialWrap = (text, width, size) => {
  const budget = Math.max(8, Math.floor(width / (size * .52)));
  const lines = [];
  for (const word of text.split(' ')) {
    const last = lines.length - 1;
    if (last >= 0 && `${lines[last]} ${word}`.length <= budget) lines[last] += ` ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
};

function basalEditorialOption(data, mini, colors) {
  const facts = basalFacts(data);
  const { programmed, ciLo, ciHi, estimateValue, above, below, atRate } = facts;
  /* Sorted largest-more first, through the nights that ran exactly as set, to
     largest-less last — so a night's row is its rank by deviation and the rows'
     far ends fall away from the rule in both directions. */
  const roster = facts.nights.filter((night) => finite(night.delivered_rate))
    .sort((a, b) => b.delivered_rate - a.delivered_rate);
  const rates = roster.map((night) => night.delivered_rate).sort((a, b) => a - b);
  const total = rates.length;
  const hasRule = finite(programmed);
  const hasBand = finite(ciLo) && finite(ciHi);
  const round2 = (value) => Math.round(value * 100) / 100;
  /* THE ARGUMENT SETS THE SCALE, NOT THE OUTLIERS — the same rule the clock
     mode's ceiling follows. One 2.5 U/h night stretched this domain to three
     units and crushed the whole finding into the left third of the tile; the
     ceiling rides the roster's own 85th percentile and the interval instead,
     and the nights past it leave by a caret carrying their true value, never
     silently clipped. The step ladder holds no quarter: a .25 tick prints as
     "0.3" at one decimal and prints as a lie. */
  const ceiling = Math.max(ciHi || 0, estimateValue || 0, programmed || 0, facts.p85) || 1;
  const lo = Math.min(...[rates[0], programmed, ciLo].filter(finite), ceiling);
  const pad = Math.max((ceiling - lo) * .12, .05);
  const xSpan = (ceiling - lo) + pad * 2;
  const xStep = xSpan > 2 ? .5 : xSpan > .8 ? .2 : xSpan > .4 ? .1 : .05;
  const xMin = Math.max(0, round2(Math.floor((lo - pad) / xStep) * xStep));
  const xMax = round2(Math.ceil((ceiling + pad) / xStep) * xStep);
  const yMax = Math.max(total, 1);
  /* The staircase is never drawn. Sorted by rate and stacked one to a row, the
     nights' own right-hand ends land in a descending flight — the silhouette is
     implied by arrangement, which is all this roster supports. A path through
     those ends would assert that the nights are a series, and they are not: they
     are independent observations, which is the argument that retired the line
     chart this form replaced. Nothing here spans more than one night. */
  const overflow = rates.filter((rate) => rate > xMax).length;
  const crossing = hasRule ? rates.filter((rate) => rate >= programmed).length : total;
  /* A slot the payload did not number has no window to print, and printing one
     anyway is how `NaN:NaN` reaches a tile. */
  const slotLabel = finite(data?.slot) ? hhmm(data.slot * 30) : null;
  const slotWindow = slotLabel ? `${slotLabel}–${hhmm(data.slot * 30 + 30)}` : null;
  const ink = (percent) => `color-mix(in srgb, ${colors.text} ${percent}%, transparent)`;
  const rustFill = `color-mix(in srgb, ${colors.high} ${colors.dark ? 34 : 26}%, transparent)`;
  const greyFill = `color-mix(in srgb, ${colors.basal} ${colors.dark ? 24 : 18}%, transparent)`;
  const hair = ink(colors.dark ? 18 : 12);
  const shadow = ink(colors.dark ? 26 : 22);
  /* ONE NIGHT, ONE CELL, ANCHORED ON THE RULE. A night is the row it occupies
     and the distance it ran from the rate the wearer set: rust to the right when
     it ran more, grey-green to the left when it ran less, and a short tick
     standing ON the rule when it ran exactly as set. There is no common baseline
     at the plot's edge for the cells to grow from, so no cell shares an edge
     with another and nothing spans two nights — the descending silhouette is
     what the sorted ends make, not something drawn through them. The far end of
     each cell carries a 2px tick in that night's own colour at full strength;
     the fills carry the mass. At mini rank the rows abut, and only the as-set
     nights keep a mark of their own, because at that size a night that ran the
     programmed rate exactly has no width to be seen by. */
  const nightCells = (gap, tick) => ({
    type: 'custom', id: 'nights', animation: false, clip: false, z: 3,
    data: roster.map((night, index) => ({
      value: [Math.min(night.delivered_rate, xMax), index + 1], name: night.date,
      /* The cell can be pinned to the ceiling; the number it reports may
         never be. */
      delivered: night.delivered_rate,
    })),
    renderItem: (params, api) => {
      const night = roster[params.dataIndex];
      const upper = api.coord([xMin, api.value(1) - 1])[1];
      const lower = api.coord([xMin, api.value(1)])[1];
      const row = Math.abs(lower - upper);
      const held = Math.min(gap, row * .28);
      const y = Math.min(upper, lower) + held / 2;
      const cell = Math.max(mini ? .5 : 1.5, row - held);
      const anchor = hasRule ? api.coord([programmed, 0])[0] : params.coordSys.x;
      const end = api.coord([Math.min(night.delivered_rate, xMax), 0])[0];
      const more = end > anchor + .5;
      const less = end < anchor - .5;
      const children = [];
      if (more) {
        children.push({ type: 'rect', shape: { x: anchor, y, width: end - anchor, height: cell },
          style: { fill: rustFill } });
      } else if (less) {
        children.push({ type: 'rect', shape: { x: end, y, width: anchor - end, height: cell },
          style: { fill: greyFill } });
      } else {
        children.push({ type: 'rect',
          shape: { x: anchor - (mini ? 1.5 : 4.5), y, width: mini ? 3 : 9, height: cell },
          style: { fill: colors.programmed } });
      }
      if (tick && (more || less)) {
        children.push({ type: 'rect', shape: { x: more ? end - 2 : end, y, width: 2, height: cell },
          style: { fill: more ? colors.high : colors.basal } });
      }
      /* A night past the ceiling leaves by its own caret: an advisory chart may
         cap a scale, never hide a big night. */
      if (tick && night.delivered_rate > xMax) {
        children.push({ type: 'polygon',
          shape: { points: [[end + 7, y + cell / 2], [end + 1, y + cell / 2 - 3.5],
            [end + 1, y + cell / 2 + 3.5]] },
          style: { fill: colors.high } });
      }
      return { type: 'group', children };
    },
    tooltip: { formatter: (params) => `${params.name} — delivered ${params.data.delivered} U/h`
      + `${hasRule ? ` · programmed ${programmed.toFixed(2)}` : ''}` },
  });
  /* A staircase read aloud is its crossing and its tally — the standing kind
     description ("N nights of steady data") names the roster this form is not
     drawing. */
  const description = [
    `${facts.nights.length} steady nights${slotLabel ? ` at ${slotLabel}` : ''}`,
    ...(hasRule
      ? [`the pump ran at or above the programmed ${programmed.toFixed(2)} U/h on`
        + ` ${crossing} of them`, `${above} more, ${below} less, ${atRate} exactly as set`]
      : []),
    ...(finite(estimateValue)
      ? [`estimate ${estimateValue.toFixed(2)} U/h`
        + (hasBand ? `, range ${ciLo.toFixed(2)} to ${ciHi.toFixed(2)}` : '')] : []),
    `${data?.excluded_night_count ?? 0} nights excluded`,
  ].join('; ');
  if (mini) {
    /* THE THUMBNAIL IS ONE SENTENCE: a lopsided hill with a line through it and
       most of the mass on the far side. Axis, ticks and every word but the slot
       go; the nights abut into that hill, and the rule and a 3px shadow stay. */
    return {
      ...chartBase(description, true, colors),
      legend: { show: false },
      grid: { left: 4, right: 4, top: 16, bottom: 12 },
      xAxis: { type: 'value', min: xMin, max: xMax, show: false },
      yAxis: { type: 'value', min: 0, max: yMax, show: false, inverse: true },
      graphic: slotLabel ? [{ type: 'text', left: 5, top: 3, silent: true,
        style: { text: slotLabel, fill: colors.muted, font: `500 9px ${FONT}` } }] : [],
      series: [
        nightCells(0, false),
        { type: 'custom', id: 'furniture', animation: false, silent: true, clip: false, data: [0],
          renderItem: (params, api) => {
            const base = params.coordSys.y + params.coordSys.height;
            const children = [];
            if (hasRule) {
              children.push({ type: 'rect',
                shape: { x: api.coord([programmed, 0])[0] - .5, y: params.coordSys.y,
                  width: 1, height: base - params.coordSys.y },
                style: { fill: colors.basal } });
            }
            if (hasBand) {
              children.push({ type: 'rect',
                shape: { x: api.coord([ciLo, 0])[0], y: base + 4,
                  width: api.coord([ciHi, 0])[0] - api.coord([ciLo, 0])[0], height: 3 },
                style: { fill: shadow } });
            }
            return { type: 'group', children };
          } },
      ],
    };
  }
  const verdict = basalVerdict(data);
  const maxRate = total ? rates[total - 1] : null;
  /* ONE FACT, ONE HOME. The reader chose this slot, so nothing here re-sets the
     scene: the headline states the finding and its support, the rail holds the
     tally and the exclusions, the slug holds the estimate and its range, the
     footer holds the window. Two things that were said twice are gone with the
     saying — the standfirst repeated the rail's three counts, and the interval
     caption repeated the slug's range and then its verdict word. What a mark
     already shows is not captioned either: the cliff of nights sitting on the
     rule was labelled "5 nights ran exactly as programmed" beside a rail row
     reading "5 exactly as set", and that label was also the text the collision
     audit caught running off the plot into the rail. */
  const headline = !hasRule
    ? `${facts.nights.length} nights, counted by the rate the pump ran`
    : above > below
      ? `Pump ran above the programmed rate on ${above} of ${facts.nights.length} nights`
      : below > above
        ? `Pump ran below the programmed rate on ${below} of ${facts.nights.length} nights`
        : `Pump ran at the programmed rate on ${atRate} of ${facts.nights.length} nights`;
  const caps = `500 10px ${FONT}`;
  /* THE ROWS ARE PLACED IN PIXELS, not anchored to the rail's margin. A graphic
     element's box is its own text's box: anchor it by `right` and a short label
     lands against the far margin however wide `style.width` says the column is,
     which put the gulf back inside the row ("4 … less"). Measured from the
     canvas instead, the numeral column ends at one x, every label begins one
     10px gutter after it, and each pair is centred on one line — a row is one
     unit, so its count sits against the middle of its label rather than the
     label's first line. */
  const railRows = [
    [above, 'more than programmed', EDITORIAL.figureTop + 26],
    [below, 'less', EDITORIAL.figureTop + 50],
    [atRate, 'exactly as set', EDITORIAL.figureTop + 74],
    /* One statement, one line: the rail's head already says these are the steady
       nights, so "not steady" carries the reason without reciting the criterion
       and without wrapping into what read as a second data point. */
    [data?.excluded_night_count ?? 0, 'excluded — not steady', EDITORIAL.figureTop + 112],
  ];
  /* The verdict block reads as the table's own head: same right margin, same
     width, so the section has one edge rather than four. */
  const railHead = (style, top) => ({ type: 'text', right: EDITORIAL.margin, top,
    silent: true, style: { align: 'right', width: EDITORIAL.rail, ...style } });
  return {
    ...chartBase(description, false, colors),
    legend: { show: false },
    grid: { left: EDITORIAL.margin, right: EDITORIAL.rail + EDITORIAL.margin + 16,
      top: EDITORIAL.figureTop, bottom: EDITORIAL.footerBand, containLabel: false },
    graphic: [
      { type: 'text', left: EDITORIAL.margin, top: EDITORIAL.deckTop, silent: true,
        style: { text: editorialWrap(headline, 620, 21), fill: colors.text,
          font: `600 21px ${FONT}`, lineHeight: 24 } },
      /* The verdict slug wears a warm-grey square, never rust: a hold is not an
         alarm, and the word beside it is the backend's own. */
      railHead({ text: `{sq|}{v|${verdict.toUpperCase()}}`,
        rich: { sq: { backgroundColor: ink(45), width: 6, height: 6 },
          v: { color: colors.muted, fontFamily: FONT, fontSize: 10,
            fontWeight: 500, padding: [0, 0, 0, 6] } } }, 16),
      ...(finite(estimateValue)
        ? [railHead({ text: `${estimateValue.toFixed(2)} U/h`, fill: colors.text,
          font: `600 19px ${MONO}` }, 34)]
        : [railHead({ text: 'no estimate', fill: colors.muted, font: `11px ${FONT}` }, 36)]),
      ...(hasBand ? [railHead({ text: `range ${ciLo.toFixed(2)} – ${ciHi.toFixed(2)}`,
        fill: colors.muted, font: `11px ${MONO}` }, 58)] : []),
      /* The roster as type, not as a chart: three directions, then the nights
         that never qualified, disclosed here rather than cluttering the plot. */
      railHead({ text: `${facts.nights.length} STEADY NIGHT${facts.nights.length === 1 ? '' : 'S'}`,
        fill: colors.muted, font: caps }, EDITORIAL.figureTop),
      /* The footer is the window and nothing else: the exclusion rule it used to
         recite is the rail's last row. */
      ...(slotWindow ? [{ type: 'text', left: EDITORIAL.margin, bottom: 10, silent: true,
        style: { text: slotWindow, fill: colors.muted, font: caps } }] : []),
    ],
    /* THE AXIS SAYS WHAT IT MEASURES, UNDER ITS OWN NUMBERS. A unit hung after
       the last tick is read after the scale, not with it: a bare ladder of
       0.0–1.8 under a chart about nights was first read as a count of days.
       The name is set below the labels, where the eye arrives on it while it is
       still reading the scale. */
    xAxis: { type: 'value', min: xMin, max: xMax, interval: xStep,
      name: 'basal rate, U/h', nameLocation: 'middle',
      ...axis(colors), splitLine: { show: false }, nameGap: 26,
      nameTextStyle: { color: colors.muted, fontFamily: FONT, fontSize: 10, fontWeight: 500 },
      axisTick: { show: true, length: 4, lineStyle: { color: hair } },
      axisLabel: { margin: 6, color: colors.muted, fontFamily: MONO, fontSize: 10,
        formatter: (value) => value.toFixed(xStep >= .1 ? 1 : 2) } },
    /* The count runs DOWNWARD, because the stack does: the nights at or above
       the programmed rate are the rows the reader counts down through before the
       rule runs out of cells, so the crossing is the 16th night from the top. */
    yAxis: { type: 'value', min: 0, max: yMax, show: false, inverse: true },
    series: [
      nightCells(2, true),
      { type: 'custom', id: 'rail', animation: false, silent: true, clip: false, z: 10, data: [0],
        renderItem: (params, api) => {
          const numeralEnd = api.getWidth() - EDITORIAL.margin - RAIL.label - RAIL.gutter;
          return { type: 'group', children: railRows.flatMap(([count, label, top]) => {
            const middle = top + RAIL.pitch / 2;
            return [
              { type: 'text', style: { text: String(count), x: numeralEnd, y: middle,
                align: 'right', verticalAlign: 'middle',
                fill: colors.text, font: `600 16px ${MONO}` } },
              { type: 'text', style: { text: editorialWrap(label, RAIL.label, 11),
                x: numeralEnd + RAIL.gutter, y: middle, align: 'left', verticalAlign: 'middle',
                lineHeight: RAIL.lead, fill: colors.muted, font: `11px ${FONT}` } },
            ];
          }) };
        } },
      { type: 'custom', id: 'furniture', animation: false, silent: true, clip: false, z: 10, data: [0],
        renderItem: (params, api) => {
          const cs = params.coordSys;
          const width = api.getWidth();
          const height = api.getHeight();
          const base = cs.y + cs.height;
          const railLeft = width - EDITORIAL.margin - EDITORIAL.rail;
          const box = (x, y, w, h, fill) => ({ type: 'rect',
            shape: { x, y, width: w, height: h }, style: { fill } });
          const text = (content, x, y, font, fill, extra = {}) => ({ type: 'text',
            style: { text: content, x, y, font, fill, ...extra } });
          /* The tile's own nameplate already rules the top of the page, so the
             only hairlines drawn here are the ones nothing else carries. */
          const children = [
            box(EDITORIAL.margin, height - 28, width - EDITORIAL.margin * 2, 1, hair),
            box(railLeft, EDITORIAL.figureTop + 18, EDITORIAL.rail, 1, hair),
            box(railLeft, EDITORIAL.figureTop + 104, EDITORIAL.rail, 1, hair),
          ];
          /* A 12px text sets to about .52 of its size per character. Nothing on
             this canvas reflows, so a label that would overrun the plot is
             mirrored to the other side of its mark rather than clipped — the
             collision the audit caught was this label, at a slot whose rule
             sits far enough right that its caption ran into the rail. */
          const roomRight = (x, content, size = 12) =>
            x + content.length * size * .52 < cs.x + cs.width - 4;
          /* The rank ruler: how far down the stack a row is. It is named in the
             margin rather than on the plot, because the cells no longer start at
             the plot's left edge and a number set inside would sit on one. The
             last rank needs no line of its own — the axis is already there. */
          const midRank = Math.round(total / 2);
          if (midRank > 0 && midRank < total) {
            const y = api.coord([xMin, midRank])[1];
            children.push({ type: 'line', shape: { x1: cs.x, y1: y, x2: cs.x + cs.width, y2: y },
              style: { stroke: ink(colors.dark ? 18 : 12), lineWidth: 1, lineDash: [1, 3] } });
            children.push(text(String(midRank), cs.x - 6, y, `500 10px ${FONT}`, colors.muted,
              { align: 'right', verticalAlign: 'middle' }));
          }
          if (total > 0) {
            children.push(text(String(total), cs.x - 6, base, `500 10px ${FONT}`, colors.muted,
              { align: 'right', verticalAlign: 'bottom' }));
          }
          /* Uncertainty lives on the ground, under the data — a shadow on the
             floor, not a box drawn around it. It sits BELOW the tick labels: run
             through them it reads as a smudge on the axis rather than a mark. */
          if (hasBand) {
            const xLo = api.coord([ciLo, 0])[0];
            const xHi = api.coord([ciHi, 0])[0];
            children.push(box(xLo, base + 38, xHi - xLo, 6, shadow),
              box(xLo, base + 35, 1, 12, shadow), box(xHi - 1, base + 35, 1, 12, shadow));
            if (finite(estimateValue)) {
              children.push(box(api.coord([estimateValue, 0])[0] - 1, base + 34, 2, 14, colors.basal));
            }
          }
          /* Each clipped night carries its own caret, drawn with its cell. What
             no mark can say is the rate itself, so that is set once, under the
             axis end the carets point past. */
          if (overflow > 0 && finite(maxRate)) {
            children.push(text(`tallest ${maxRate.toFixed(1)} U/h`,
              cs.x + cs.width, base + 22, `500 11px ${FONT}`, colors.high, { align: 'right' }));
          }
          if (hasRule) {
            const ruleX = api.coord([programmed, 0])[0];
            const yCross = api.coord([programmed, crossing])[1];
            children.push(box(ruleX - .75, cs.y - 14, 1.5, base + 24 - cs.y, colors.basal));
            /* The flag flies ABOVE the plot, on the head of the rule. Inside it
               used to sit in the top row's band, which was empty while the cells
               grew from the left edge and is the widest cell on the tile now
               that they grow from the rule. The deck gave up the room when the
               standfirst went. */
            const flag = `PROGRAMMED ${programmed.toFixed(2)}`;
            const flagLeft = roomRight(ruleX + 7, flag, 10);
            children.push(box(ruleX + (flagLeft ? 1 : -4), cs.y - 15, 3, 3, colors.basal),
              text(flag, ruleX + (flagLeft ? 7 : -9), cs.y - 6, caps, colors.muted,
                { align: flagLeft ? 'left' : 'right', verticalAlign: 'bottom' }));
            /* The cliff is no longer drawn as one mark spanning its nights: each
               night that ran exactly as programmed stands on the rule as its own
               tick, and the run of them IS the cliff. */
            /* THE ONE NUMBER THE MARKS CANNOT SAY, and it needs no glyph to say
               it. A ring drawn where the rule met the staircase marked a real
               junction while the cells grew from the left edge; anchored on the
               rule they already meet it at every row, so the ring marked nothing
               and read as a stray red circle in the middle of the stack. The
               label anchors to the rule at the crossing height instead — the
               boundary where the rust and the as-set ticks give out.
               The delta arrangement leaves exactly two quadrants empty, and the
               label takes whichever one it fits: BELOW the crossing on the right,
               where every row runs the other way, or ABOVE it on the left, where
               every row runs right. Where the rule sits too near an edge for
               either — every night at or above, on a rule close to the left —
               it drops under the plot, beside the axis, still the only sentence
               on the figure. */
            const atOrAbove = `${crossing} of ${total} night${total === 1 ? '' : 's'} at or above`;
            const span = atOrAbove.length * 12 * .52;
            const seat = roomRight(ruleX + 10, atOrAbove) && yCross + 26 <= base ? 'below'
              : ruleX - 10 - span >= cs.x && yCross - 23 >= cs.y + 20 ? 'above' : 'axis';
            children.push(text(atOrAbove,
              seat === 'below' ? ruleX + 10 : seat === 'above' ? ruleX - 10 : cs.x,
              seat === 'below' ? yCross + 8 : seat === 'above' ? yCross - 8 : base + 22,
              `500 12px ${FONT}`, colors.text,
              { align: seat === 'above' ? 'right' : 'left',
                verticalAlign: seat === 'above' ? 'bottom' : 'top' }));
          }
          return { type: 'group', children };
        } },
    ],
  };
}

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
  if (mode === 'bay') return basalBayOption(data, mini, colors, description);
  if (mode === 'ledger') return basalLedgerOption(data, mini, colors, description);
  if (mode === 'editorial') return basalEditorialOption(data, mini, colors);
  /* NIGHTS ARE UNCONNECTED OBSERVATIONS, NOT A SERIES — and each one's story
     is "how far from the programmed rate did the algorithm land". So a night
     is a deviation COLUMN rising (or dropping) from the programmed baseline:
     the comparison the chart exists to make is a length, not a position, and
     the baseline gets a structural job instead of floating as a third rule
     (ticket #205, chart-designer pass). Time runs oldest to newest. */
  const oldestFirst = [...nights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const programmed = oldestFirst.find((night) => finite(night.programmed_rate))?.programmed_rate;
  const above = nights.filter((night) => night.sign === 1).length;
  const below = nights.filter((night) => night.sign === -1).length;
  const atRate = nights.filter((night) => night.sign === null).length;
  const ciLo = data?.estimate?.lo;
  const ciHi = data?.estimate?.hi;
  const estimateValue = data?.estimate?.value;
  const hasBand = finite(ciLo) && finite(ciHi);
  const delivered = nights.map((night) => night.delivered_rate).filter(finite);
  /* THE ARGUMENT SETS THE SCALE, NOT THE OUTLIERS. Headroom above the interval
     puts programmed and the CI mid-plot; a night above the cap draws to the top
     edge and ends in a caret with its true value printed — capped, never
     silently clipped, because an advisory dosing tool may not hide a big
     night. */
  const sorted = [...delivered].sort((a, b) => a - b);
  const p85 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .85))] : 0;
  /* An even ladder: the cap rounds up to a whole step so the top gridline is
     a scale mark, never something that reads as a data value. */
  const yRaw = Math.max(
    Math.ceil(Math.max(ciHi || 0, estimateValue || 0, programmed || 0) * 1.6 * 10) / 10,
    Math.ceil(p85 * 10) / 10) || 1;
  const yStep = yRaw > 1.2 ? .5 : yRaw > .6 ? .25 : .1;
  const yMax = Math.ceil(yRaw / yStep) * yStep;
  /* One vocabulary everywhere: vs programmed. Rust above, blue below (the
     `--basal` token IS the app's blue — the retired "slate" reading of it came
     from a stale comment, not the stylesheet), and an exactly-as-set night is
     a small solid teal square pinned ON the baseline: a quarter of this
     payload's evidence is such nights, and a zero-height bar would erase
     them. */
  const gutterWidth = 46;
  /* "Less" mixes toward ink: `--basal` is low-chroma against `--high`'s
     saturated rust, and at equal length the less nights whispered — a bias an
     advisory chart must not carry. The mix gains weight in both themes. */
  const lessColor = `color-mix(in srgb, ${colors.basal} 76%, ${colors.text})`;
  const BAR_FILL = .56; /* arithmetic complement of barCategoryGap below */
  const mainGrid = { ...grid(mini), ...(mini ? {} : { top: 30, right: 62 + gutterWidth, bottom: 46 }) };
  const tallyRich = {
    /* The legend teaches the plot's own vocabulary: two upright columns and
       one flat datum tick. */
    swMore: { backgroundColor: colors.high, width: 4, height: 8, borderRadius: 1 },
    swLess: { backgroundColor: lessColor, width: 4, height: 8, borderRadius: 1 },
    swAt: { backgroundColor: colors.programmed, width: 9, height: 2.5 },
    n: { color: colors.text, fontFamily: FONT, fontSize: 9, padding: [0, 10, 0, 4] },
    m: { color: colors.muted, fontFamily: FONT, fontSize: 9, padding: [0, 0, 0, 10] },
  };
  const tallyText = `{swMore|}{n|${above} more}{swLess|}{n|${below} less}{swAt|}{n|${atRate} as set}`
    + `{m|of ${nights.length} steady nights · ${data?.excluded_night_count ?? 0} excluded}`;
  const columns = oldestFirst.map((night) => {
    const value = night.delivered_rate;
    const capped = finite(value) && value > yMax;
    return { ...night, value, capped, top: capped ? yMax : value };
  });
  const mondays = new Set(columns.filter((night) => new Date(`${night.date}T00:00:00Z`).getUTCDay() === 1)
    .map((night) => night.date));
  const labelDates = new Set([columns[0]?.date, columns[columns.length - 1]?.date]);
  columns.forEach((night, index) => {
    if (mondays.has(night.date) && index > 1 && index < columns.length - 2) labelDates.add(night.date);
  });
  /* The baseline carries no in-plot label: with mixed openers every side of
     the line is column territory, so its name lives in the gutter, where the
     dotted extension already lands and nothing else may draw. */
  const baselineRule = finite(programmed) ? { markLine: {
    silent: true, symbol: 'none',
    label: { show: false },
    lineStyle: { color: colors.programmed, width: 1.4, type: 'solid' },
    data: [{ yAxis: programmed }],
  } } : {};
  /* THE VERDICT LIVES IN ITS OWN GUTTER, on the shared y-scale to the right:
     an I-beam spanning the interval with the estimate as its crossbar, and the
     programmed line extended dotted underneath it. The conclusion stops being
     drawn through the evidence, the interval's width becomes a length — and
     this payload's load-bearing fact, that the interval's lower bound IS the
     programmed rate, becomes a visible coincidence of two marks. */
  const gutter = (!mini && hasBand) ? [{
    type: 'custom', animation: false, silent: true, clip: false,
    xAxisIndex: 1, yAxisIndex: 1,
    renderItem: (params, api) => {
      const [x] = api.coord([0.5, 0]);
      const yLo = api.coord([0, ciLo])[1];
      const yHi = api.coord([0, ciHi])[1];
      const yEst = finite(estimateValue) ? api.coord([0, estimateValue])[1] : null;
      const yProg = finite(programmed) ? api.coord([0, programmed])[1] : null;
      const beam = 9;
      const children = [
        /* A faint panel: the verdict is a different kind of statement than
           the evidence — a tint says "different room" where a border would
           say "different chart". */
        { type: 'rect', shape: { x: params.coordSys.x - 7, y: params.coordSys.y - 6,
            width: params.coordSys.width + 14, height: params.coordSys.height + 12, r: 3 },
          style: { fill: `color-mix(in srgb, ${colors.text} 2.5%, transparent)` } },
        { type: 'rect', shape: { x: x - beam / 2, y: yHi, width: beam, height: yLo - yHi },
          style: { fill: colors.signal, opacity: .12 } },
        { type: 'rect', shape: { x: x - .6, y: yHi, width: 1.2, height: yLo - yHi },
          style: { fill: colors.programmed } },
        { type: 'rect', shape: { x: x - 4.5, y: yHi - 1, width: 9, height: 1.2 },
          style: { fill: colors.programmed } },
        { type: 'rect', shape: { x: x - 4.5, y: yLo, width: 9, height: 1.2 },
          style: { fill: colors.programmed } },
      ];
      if (yEst !== null) {
        children.push({ type: 'rect', shape: { x: x - 6.5, y: yEst - 1, width: 13, height: 2 },
          style: { fill: colors.signal } });
      }
      if (yProg !== null) {
        /* One continuous datum: same weight as the in-plot rule, with a
           dotted lead across the inter-grid void so the eye can join the
           interval's floor to the programmed rate it coincides with. */
        children.push(
          { type: 'rect',
            shape: { x: x - gutterWidth / 2, y: yProg - .7, width: gutterWidth, height: 1.4 },
            style: { fill: colors.programmed } },
          { type: 'line',
            shape: { x1: x - gutterWidth / 2 - 50, y1: yProg, x2: x - gutterWidth / 2, y2: yProg },
            style: { stroke: colors.programmed, lineWidth: 1, lineDash: [1, 3], opacity: .7 } });
      }
      /* THE GUTTER LABELS ARE A DODGED COLUMN, not four independent texts: any
         of the interval caps, the estimate and the programmed rate can
         coincide or cross (a CI reaching below programmed, a hold where all
         three are equal), so labels sharing a value merge, and the rest are
         pushed apart to a minimum pitch with a leader tick back to any
         displaced label's true y. One mechanism, every ordering. */
      const round2 = (value) => Math.round(value * 100) / 100;
      const entries = [];
      const push = (y, value, word, color) => {
        if (y === null || !finite(value)) return;
        const twin = entries.find((entry) => Math.abs(entry.trueY - y) < 1);
        if (twin) { twin.word = twin.word || word; twin.color = word ? color : twin.color; return; }
        entries.push({ trueY: y, value: round2(value), word, color });
      };
      push(yHi, ciHi, '', colors.muted);
      push(yLo, ciLo, '', colors.muted);
      push(yEst, estimateValue, 'est', colors.signal);
      push(yProg, programmed, 'set', colors.programmed);
      const pitch = 12;
      const top = params.coordSys.y + 4;
      const bottom = params.coordSys.y + params.coordSys.height - 4;
      entries.sort((a, b) => a.trueY - b.trueY);
      const placed = entries.map((entry) => ({ ...entry, y: Math.min(Math.max(entry.trueY, top), bottom) }));
      for (let i = 1; i < placed.length; i += 1) {
        placed[i].y = Math.max(placed[i].y, placed[i - 1].y + pitch);
      }
      for (let i = placed.length - 1; i >= 0; i -= 1) {
        const limit = i === placed.length - 1 ? bottom : placed[i + 1].y - pitch;
        placed[i].y = Math.min(placed[i].y, limit);
      }
      const labelX = x - beam / 2 - 4;
      placed.forEach((entry) => {
        children.push({ type: 'text', style: {
          text: entry.word ? `${entry.word} ${entry.value}` : String(entry.value),
          x: labelX, y: entry.y, align: 'right', verticalAlign: 'middle',
          fill: entry.color, font: `9px ${MONO}` } });
        if (Math.abs(entry.y - entry.trueY) > 3) {
          children.push({ type: 'rect',
            shape: { x: labelX + 1, y: entry.trueY - .4,
              width: x - beam / 2 - labelX - 2, height: .8 },
            style: { fill: entry.color, opacity: .5 } });
        }
      });
      return { type: 'group', children };
    },
    data: [0],
  }] : [];
  return {
    ...chartBase(description, mini, colors),
    legend: { show: false },
    graphic: mini ? [] : [{ type: 'text', left: GRID.left, bottom: 6, silent: true,
      style: { text: tallyText, rich: tallyRich } }],
    xAxis: [
      { type: 'category', data: columns.map((night) => night.date),
        ...axis(colors, mini),
        axisLabel: { show: !mini, color: colors.muted, fontFamily: MONO, fontSize: 10,
          formatter: (date) => date.slice(5),
          interval: (index) => labelDates.has(columns[index]?.date) },
        axisTick: { show: !mini, alignWithLabel: true, length: 3,
          lineStyle: { color: colors.line } },
        splitLine: { show: false } },
      ...(mini ? [] : [{ gridIndex: 1, type: 'value', min: 0, max: 1, show: false }]),
    ],
    yAxis: [
      /* Bare numbers: the unit is a property of the whole tile — axis and
         gutter alike — so it is stated once in the title-bar caption, not
         fought into a 40px inset. */
      { type: 'value', max: yMax, interval: yStep, ...axis(colors, mini),
        axisLabel: { show: !mini, color: colors.muted, fontFamily: MONO, fontSize: 10, margin: 10,
          formatter: (v) => (v === 0 ? '0' : v.toFixed(yStep >= .5 ? 1 : 2)) },
        splitLine: { show: !mini, lineStyle: {
          color: `color-mix(in srgb, ${colors.line} 55%, transparent)`, width: 1 } } },
      ...(mini ? [] : [{ gridIndex: 1, type: 'value', min: 0, max: yMax, show: false }]),
    ],
    grid: mini ? [mainGrid] : [mainGrid,
      { right: 8, width: gutterWidth, top: mainGrid.top, bottom: FULL_GRID.bottom }],
    series: [
      /* Two stacked bars make a floating column: a transparent base up to
         min(programmed, delivered), then the |deviation| in the night's own
         direction color. */
      { type: 'bar', stack: 'night', animation: false, barCategoryGap: mini ? '25%' : '44%',
        itemStyle: { color: 'transparent' }, silent: true,
        data: columns.map((night) => (night.sign === null || !finite(night.value)
          ? 0 : Math.min(programmed, night.top))) },
      { type: 'bar', stack: 'night', animation: false,
        data: columns.map((night) => ({
          value: night.sign === null || !finite(night.value)
            ? 0 : Math.abs(night.top - programmed),
          itemStyle: { color: night.sign === 1 ? colors.high : lessColor,
            borderRadius: night.sign === 1 ? [2, 2, 0, 0] : [0, 0, 2, 2] },
        })),
        ...baselineRule },
      /* An exactly-as-set night IS a column of zero height: drawn at column
         width in the baseline's own colour, so it joins the family instead of
         hiding as a speck — and `signal` green stays the estimate's alone. */
      { type: 'custom', animation: false, silent: true,
        renderItem: (params, api) => {
          const w = api.size([1, 0])[0] * BAR_FILL;
          const [x, y] = api.coord([api.value(0), programmed]);
          return { type: 'rect',
            shape: { x: x - w / 2, y: y - 1.5, width: w, height: 3 },
            style: { fill: colors.programmed } };
        },
        data: columns.map((night, index) => (night.sign === null ? [index] : null))
          .filter(Boolean) },
      /* Capped nights: caret at the top edge plus the true value. */
      { type: 'scatter', animation: false, symbol: 'triangle',
        symbolSize: mini ? 4 : [7, 5], symbolOffset: [0, -7], silent: true,
        data: columns.filter((night) => night.capped)
          .map((night) => ({ value: [night.date, yMax],
            label: { show: !mini, position: 'top', distance: 4,
              color: colors.high, fontFamily: MONO, fontSize: 9,
              formatter: String(Math.round(night.value * 10) / 10) } })),
        itemStyle: { color: colors.high } },
      ...gutter,
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
    name: 'Basal · delivered vs programmed',
    /* Identity only: the descriptor lives in `meta`, so the findings breadcrumb
       (which renders the title beside a kind label saying the same thing) stays
       "Basal 05:30" instead of repeating and truncating the phrase. */
    nameFor: (row) => ({
      title: row.span?.label ? `Basal ${row.span.label}` : 'Basal',
      meta: null,
    }),
    modes: ['clock', 'bay', 'ledger', 'editorial', 'event'],
    meta: (mode) => mode === 'clock'
      ? 'delivered vs programmed, U/h · one bar per night'
      : mode === 'bay' ? 'delivered vs programmed, U/h · one bar per night'
        : mode === 'ledger' ? 'nights sorted by deviation from programmed rate'
          : mode === 'editorial' ? 'nights at or above each rate · one step per night'
            : 'supported vs insufficient evidence',
    option: basalOption,
    thumbnail: (data, title) => thumbnail((title || 'Basal · delivered vs programmed').toUpperCase(),
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
