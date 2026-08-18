// day-hero-chart.js — MOBILE Day chart render core (issue #332). Lifted from the
// LOCKED visual spec (archived Day-hero-accordion mock, #332).
//
// On a phone the desktop five aligned tracks (chart-builders.buildLanesOption) shrink
// into an unreadable stack. This module reshapes them into a calm GLUCOSE HERO: the
// tall range-colored curve with the 70–180 band + min/max labels, one thin marks-only
// dosing-tick row beneath, and the Basal Δ + Context tracks folded into two collapsed
// accordion strips the host expands in place. Desktop keeps the five-track view,
// untouched (buildLanesOption is not changed).
//
// Vue-free / DOM-free like day-chart.js + chart-builders.js, so Node's built-in
// runner covers it (see CLAUDE.md "Frontend tests"). Every shared helper — the ledger
// band, the state→hue map, the cross-track hairline, the bolus glyphs, the suspend
// runs — is IMPORTED from the shipping modules, never re-declared, so there is one
// source of truth (the issue's "reuse isQuietLedgerRow for both the ring band and the
// log"). Only the mobile-specific option builders live here.
import { anchorStateColor, evidenceFocusGraphic, rowForT, rowBand } from './day-chart.js';
import { bolusKind, BOLUS_SYMBOL, addMinutesIso, suspendRuns, falseLowGhost } from './chart-builders.js';

export { rowBand };

/* ================= shared layout (hero + both strips align to these) ================= */
export const LAYOUT = { LEFT: 46, RIGHT: 14 };

export const HERO = {
  H: 300,
  glucose: { top: 12, height: 206 },
  dosing: { top: 236, height: 22 },
};
HERO.spanTop = HERO.glucose.top;
HERO.spanBottom = HERO.dosing.top + HERO.dosing.height;

// The faint quiet-anchor tick rail sits near the TOP of the thin dosing strip
// (0..1), just under the glucose plot and clear of the bolus/carb rows below it.
const QUIET_ROW = 0.9;

const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();

/* ================= HERO: glucose curve + rings + thin dosing-tick row =================
   `day` is the /timeline payload (cgm · boluses · basal · sleep/rest windows · pump
   events); the model anchors ride the overlay below. showTimeAxis flips the HH:MM
   labels — the host shows them only on the lowest currently-open strip. */
export function buildHeroOption(day, dateStr, { colors, carbEntries = [], xMin, xMax, showTimeAxis = true } = {}) {
  const rangeColor = (bg) => bg == null ? colors.muted
    : bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange;

  const cgmSorted = day.cgm.filter((p) => p.bg != null).slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const cgmPoints = cgmSorted.map((p) => ({ value: [toMs(p.t), p.bg], itemStyle: { color: rangeColor(p.bg) } }));
  // #381: flagged false-low excursions are greyed as sensor artifacts (still drawn).
  const fl = falseLowGhost(cgmSorted, day.false_low_exclusion_spans, colors, toMs);
  // Label only the day's min & max on the curve (the header no longer carries them) —
  // skipping any greyed excursion so the fake nadir never claims the day-min label.
  if (cgmSorted.length > 0) {
    let maxIdx = -1, minIdx = -1;
    cgmSorted.forEach((p, i) => {
      if (fl.inSpan(toMs(p.t))) return;
      if (maxIdx < 0 || p.bg > cgmSorted[maxIdx].bg) maxIdx = i;
      if (minIdx < 0 || p.bg < cgmSorted[minIdx].bg) minIdx = i;
    });
    const labelPoint = (i) => {
      cgmPoints[i].label = {
        show: true, position: cgmSorted[i].bg > 180 ? 'top' : 'bottom',
        formatter: String(Math.round(cgmSorted[i].bg)), fontSize: 11, fontWeight: 700,
        color: rangeColor(cgmSorted[i].bg),
      };
    };
    if (maxIdx >= 0) labelPoint(maxIdx);
    if (minIdx >= 0 && minIdx !== maxIdx) labelPoint(minIdx);
  }
  // Bridge the live curve across each excursion; the muted dashed ghost overlays it.
  cgmPoints.forEach((pt) => {
    if (fl.inSpan(pt.value[0])) { pt.value = [pt.value[0], null]; delete pt.label; }
  });

  // Dosing tick row: bolus + carb MARKS only — NO inline U/g value labels (that
  // collision was the rejected round-1 failure); the value rides the shared tooltip.
  const B_ROW = 0.68, C_ROW = 0.30;
  const bolusPoints = (day.boluses || []).map((b) => ({
    value: [toMs(b.t), B_ROW], raw: b,
    symbol: BOLUS_SYMBOL[bolusKind(b)],
    symbolSize: bolusKind(b) === 'food+correction' ? 13 : 10,
    itemStyle: { color: colors.accent },
  }));
  const bolusCarbPoints = (day.boluses || []).filter((b) => (b.carbs || 0) > 0).map((b) => ({
    value: [toMs(b.t), C_ROW], carbs: b.carbs, symbolSize: 9, itemStyle: { color: colors.secondary },
  }));
  const cSoft = colors.manualCarbSoft, cMan = colors.manualCarb;
  const manualCarbPoints = (carbEntries || []).map((e) => ({
    value: [toMs(e.t), C_ROW], symbolSize: 12,
    itemStyle: { color: cSoft, borderColor: cMan, borderWidth: 2,
      borderType: e.certainty === 'estimate' ? 'dashed' : 'solid' },
  }));

  const basalSorted = day.basal.slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const nearestByT = (items, ms, thr = Infinity) => {
    let best = null, dist = Infinity;
    for (const it of items || []) {
      const d = Math.abs(toMs(it.t || it.start) - ms);
      if (d < dist) { best = it; dist = d; }
    }
    return dist <= thr ? best : null;
  };
  const basalAtMs = (ms) => {
    let found = basalSorted[0] || null;
    for (const b of basalSorted) { if (toMs(b.t) <= ms) found = b; else break; }
    return found;
  };
  const suspendRunPairs = suspendRuns(basalSorted);
  const contextAtMs = (ms) => {
    const active = [];
    const within = (a, b) => ms >= toMs(a) && ms <= toMs(b);
    for (const w of day.sleep_windows || []) if (within(w.start, w.end)) active.push('Sleep');
    for (const w of day.rest_windows || []) if (within(w.start, w.end)) active.push('Fasting');
    for (const p of day.pump_events || []) { const s = toMs(p.t); if (ms >= s && ms <= s + (p.duration_mins || 0) * 6e4) active.push(p.event_type); }
    for (const [s, e] of suspendRunPairs) if (within(s, e)) active.push('CIQ suspend');
    return active;
  };
  const KIND_TEXT = { food: 'meal', correction: 'correction', 'food+correction': 'meal + correction' };

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' },
    animation: false,
    grid: [
      { left: LAYOUT.LEFT, right: LAYOUT.RIGHT, top: HERO.glucose.top, height: HERO.glucose.height },
      { left: LAYOUT.LEFT, right: LAYOUT.RIGHT, top: HERO.dosing.top, height: HERO.dosing.height },
    ],
    axisPointer: {
      link: [{ xAxisIndex: 'all' }], type: 'line',
      lineStyle: { color: colors.muted, opacity: 0.5, type: 'dashed' }, label: { show: false },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      backgroundColor: colors.surface, borderColor: colors.line, textStyle: { color: colors.text }, confine: true,
      formatter: (ps) => {
        if (!ps || !ps.length) return '';
        const ms = +ps[0].axisValue;
        if (!Number.isFinite(ms)) return '';
        const rows = [];
        const dot = (c) => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin-right:6px"></span>`;
        const add = (c, label, val) => rows.push(
          `<div style="display:flex;gap:16px;justify-content:space-between;line-height:1.6">`
          + `<span>${dot(c)}${label}</span><b>${val}</b></div>`);
        const bg = nearestByT(cgmSorted, ms, 15 * 6e4);
        if (bg) add(rangeColor(bg.bg), 'Glucose', Math.round(bg.bg) + ' mg/dL');
        const b = basalAtMs(ms);
        if (b) {
          const diff = (b.basal_rate ?? 0) - (b.profile_basal_rate ?? 0);
          add(diff > 0 ? colors.primary : diff < 0 ? colors.secondary : colors.line,
            'Basal Δ', (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' U/h');
        }
        const bolus = nearestByT(day.boluses, ms, 30 * 6e4);
        if (bolus) {
          add(colors.accent, 'Bolus', (bolus.insulin || 0).toFixed(1) + ' U · ' + (KIND_TEXT[bolusKind(bolus)] || 'bolus'));
          if ((bolus.carbs || 0) > 0) add(colors.secondary, 'Carbs (bolus)', Math.round(bolus.carbs) + ' g');
        }
        const carb = nearestByT(carbEntries, ms, 30 * 6e4);
        if (carb) add(cMan, 'Carbs (logged)', carb.grams == null ? '?'
          : (carb.certainty === 'estimate' ? '~' : '') + Math.round(carb.grams) + ' g');
        const ctx = contextAtMs(ms);
        if (ctx.length) add(colors.muted, 'Context', ctx.join(' · '));
        if (!rows.length) return '';
        const hm = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `<div style="font-weight:700;margin-bottom:3px">${hm}</div>${rows.join('')}`;
      },
    },
    xAxis: [
      { type: 'time', gridIndex: 0, min: xMin, max: xMax, axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      { type: 'time', gridIndex: 1, min: xMin, max: xMax,
        axisLine: { lineStyle: { color: showTimeAxis ? colors.muted : colors.line } },
        axisTick: { show: showTimeAxis },
        axisLabel: showTimeAxis
          ? { color: colors.text, fontSize: 11, formatter: '{HH}:{mm}' } : { show: false },
        splitLine: { show: false } },
    ],
    yAxis: [
      { type: 'value', gridIndex: 0, scale: true, min: (v) => Math.min(50, v.min - 10),
        axisLabel: { color: colors.muted, fontSize: 10 }, axisLine: { show: false },
        splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.6 } } },
      { type: 'value', gridIndex: 1, min: 0, max: 1, axisLabel: { show: false }, axisLine: { show: false },
        splitLine: { show: false } },
    ],
    series: [
      { name: 'Glucose', type: 'line', xAxisIndex: 0, yAxisIndex: 0, showSymbol: true, symbolSize: 3.4,
        sampling: 'lttb', connectNulls: true, lineStyle: { width: 1.3, color: colors.inRange, opacity: 0.7 }, data: cgmPoints, z: 5,
        markArea: { silent: true, itemStyle: { color: colors.inRange, opacity: 0.05 }, data: [[{ yAxis: 70 }, { yAxis: 180 }]] },
        markLine: { symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: colors.muted, opacity: 0.55 },
          label: { show: true, position: 'insideEndTop', color: colors.muted, fontSize: 10, formatter: '{c}' },
          data: [{ yAxis: 70 }, { yAxis: 180 }] } },
      // #381: the greyed sensor-artifact ghost over each flagged excursion (empty when none).
      ...fl.ghostSeries,
      { name: 'Bolus', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, z: 6, data: bolusPoints },
      { name: 'Bolus carbs', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, symbol: 'diamond', z: 5, data: bolusCarbPoints },
      { name: 'Carbs (logged)', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, symbol: 'circle', z: 7, data: manualCarbPoints },
    ],
    legend: { show: false },
  };
}

/* ================= HERO evidence overlay — findings ON the curve, quiet on a tick rail =========
   Only findings + also-checked (rowBand !== 'quiet') draw as rings at the CGM value on the
   glucose lane. Quiet moments (clean / no-data / explained near-miss) become a faint tick on
   the dosing strip (yAxisIndex 1, QUIET_ROW), off the glucose line but still time-aligned and
   tappable. The focused moment pops in either band. Returns series to MERGE by id (never a
   notMerge rebuild → keeps the shared tooltip, #276). `bgLookup(t)` resolves the nearest CGM
   for a meal anchor that carries bg=null. */
export function buildHeroAnchorOverlay(mvDay, rows, colors, focusT, preempted, bgLookup) {
  const loud = [], quiet = [];
  for (const r of rows) (rowBand(r) === 'quiet' ? quiet : loud).push(r);

  const markers = loud.map((r) => {
    const focused = focusT && r.t === focusT;
    const hue = anchorStateColor(r.state, colors);
    const y = (r.bg != null ? r.bg : bgLookup(r.t));
    return {
      value: [toMs(r.t), y],
      symbolSize: focused ? 16 : 10,
      itemStyle: {
        color: focused ? hue : colors.surface,
        borderColor: focused ? colors.accent : hue,
        borderWidth: focused ? 2.5 : 2,
        opacity: 1,
        shadowBlur: focused ? 10 : 0, shadowColor: focused ? colors.accent : hue,
      },
      _t: r.t, _epId: r.epId,
    };
  });

  const quietTicks = quiet.map((r) => {
    const focused = focusT && r.t === focusT;
    const hue = anchorStateColor(r.state, colors);
    return {
      value: [toMs(r.t), QUIET_ROW],
      symbol: 'rect',
      symbolSize: focused ? [3, 13] : [2, 7],
      itemStyle: { color: focused ? hue : colors.muted, opacity: focused ? 1 : 0.32 },
      _t: r.t, _epId: r.epId,
    };
  });

  const rescueTags = (rows || []).filter((r) => preempted && preempted.has(r.t) && rowBand(r) !== 'quiet').map((r) => ({
    value: [toMs(r.t), (r.bg != null ? r.bg : bgLookup(r.t))],
    label: { show: true, position: 'bottom', distance: 7, formatter: '⤴', fontSize: 12, fontWeight: 700, color: colors.manualCarb },
  }));

  return [
    { id: 'day-anchor-rescue', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: rescueTags, z: 8, silent: true, symbolSize: 1 },
    { id: 'day-anchor-quiet', name: 'Quiet', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: quietTicks, z: 6, cursor: 'pointer' },
    { id: 'day-anchor-markers', name: 'Anchors', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: markers, z: 9, cursor: 'pointer' },
  ];
}

// The whole hero focus update as ONE mergeable payload: the refreshed overlay (so the
// focused ring/tick pops) + the single cross-track hairline positioned from the live
// chart's own pixel geometry (spanning just the hero card here; stripFocusGraphic
// continues the same line through each open accordion strip). `chart` need only answer
// convertToPixel. Pure over its inputs — a node test drives it with a fake chart.
export function heroFocusUpdate(chart, { mvDay, rows, colors, focusT, preempted, bgLookup }) {
  const series = buildHeroAnchorOverlay(mvDay, rows, colors, focusT, preempted, bgLookup);
  let graphic = [];
  if (focusT) {
    const x = chart.convertToPixel({ xAxisIndex: 0 }, toMs(focusT));
    const row = rowForT(rows, focusT);
    const hue = row ? anchorStateColor(row.state, colors) : colors.accent;
    graphic = evidenceFocusGraphic(x, HERO.spanTop, HERO.spanBottom, hue);
  }
  return { series, graphic };
}

// The hairline for an expanded strip instance at the focused time (full strip height),
// so one focus line crosses the hero AND every open accordion section.
export function stripFocusGraphic(chart, focusT, hue) {
  if (!focusT) return [];
  const x = chart.convertToPixel({ xAxisIndex: 0 }, toMs(focusT));
  return evidenceFocusGraphic(x, 0, chart.getHeight(), hue);
}

/* ================= BASAL Δ strip (fork of buildLanesOption lane 3) ================= */
export function buildBasalStripOption(day, { colors, xMin, xMax, showTimeAxis = false } = {}) {
  const basalSorted = day.basal.slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const basalDiffData = basalSorted.map((e, i) => [
    toMs(e.t), i + 1 < basalSorted.length ? toMs(basalSorted[i + 1].t) : xMax,
    +(((e.basal_rate ?? 0) - (e.profile_basal_rate ?? 0)).toFixed(3)),
  ]);
  const maxAbsDiff = Math.max(0.3, ...basalDiffData.map((d) => Math.abs(d[2])));
  const basalYMax = +(maxAbsDiff * 1.15).toFixed(2);

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }, animation: false,
    grid: [{ left: LAYOUT.LEFT, right: LAYOUT.RIGHT, top: 14, height: 50 }],
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      backgroundColor: colors.surface, borderColor: colors.line, textStyle: { color: colors.text }, confine: true,
      formatter: (ps) => {
        if (!ps || !ps.length) return '';
        const ms = +ps[0].axisValue;
        let found = basalSorted[0] || null;
        for (const b of basalSorted) { if (toMs(b.t) <= ms) found = b; else break; }
        if (!found) return '';
        const diff = (found.basal_rate ?? 0) - (found.profile_basal_rate ?? 0);
        const hm = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `<div style="font-weight:700;margin-bottom:2px">${hm}</div>`
          + `Basal Δ <b>${(diff >= 0 ? '+' : '') + diff.toFixed(2)} U/h</b><br/>`
          + `delivered ${(found.basal_rate ?? 0).toFixed(2)} · programmed ${(found.profile_basal_rate ?? 0).toFixed(2)}`;
      },
    },
    xAxis: [{ type: 'time', gridIndex: 0, min: xMin, max: xMax,
      axisLine: { lineStyle: { color: showTimeAxis ? colors.muted : colors.line } },
      axisTick: { show: showTimeAxis },
      axisLabel: showTimeAxis ? { color: colors.text, fontSize: 11, formatter: '{HH}:{mm}' } : { show: false },
      splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.35 } } }],
    yAxis: [{ type: 'value', gridIndex: 0, min: -basalYMax, max: basalYMax,
      axisLabel: { color: colors.muted, fontSize: 9, formatter: (v) => v > 0 ? '+' + v.toFixed(1) : v.toFixed(1) },
      axisLine: { show: false }, splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.5 } } }],
    series: [
      { name: 'Basal zero', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: [], silent: true, z: 1,
        markLine: { symbol: 'none', silent: true, label: { show: false },
          lineStyle: { color: colors.text, opacity: 0.4, width: 1 }, data: [{ yAxis: 0 }] } },
      { name: 'Basal difference', type: 'custom', xAxisIndex: 0, yAxisIndex: 0, z: 3,
        renderItem: (params, api) => {
          const v = api.value(2);
          const x0 = api.coord([api.value(0), 0]);
          const xv = api.coord([api.value(1), v]);
          const yZero = x0[1];
          const shape = echarts.graphic.clipRectByRect({
            x: x0[0] + 1, y: v >= 0 ? xv[1] : yZero,
            width: Math.max(1, xv[0] - x0[0] - 2), height: Math.max(1, Math.abs(yZero - xv[1])),
          }, params.coordSys);
          return shape && { type: 'rect', shape, style: {
            fill: v > 0 ? colors.primary : v < 0 ? colors.secondary : colors.line, opacity: v === 0 ? 0.5 : 0.72 } };
        },
        encode: { x: [0, 1], y: 2 }, data: basalDiffData },
    ],
  };
}

/* ================= CONTEXT strip (fork of buildLanesOption lane 4) ================= */
export function buildContextStripOption(day, { colors, restWindows = [], xMin, xMax, showTimeAxis = true } = {}) {
  const clip = (a, b) => [Math.max(xMin, toMs(a)), Math.min(xMax, toMs(b))];
  const CTX = { sleep: 0.82, fasting: 0.58, exercise: 0.34, suspend: 0.10 };
  const basalSorted = day.basal.slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const sleepRanges = (day.sleep_windows || []).map((w) => [...clip(w.start, w.end), CTX.sleep]);
  const fastingRanges = (restWindows || []).map((w) => [...clip(w.start, w.end), CTX.fasting]);
  const exerciseRanges = (day.pump_events || []).filter((p) => p.event_type === 'Exercise')
    .map((p) => [...clip(p.t, addMinutesIso(p.t, p.duration_mins || 0)), CTX.exercise]);
  const suspendRunPairs = suspendRuns(basalSorted);
  const suspendRanges = suspendRunPairs.map(([s, e]) => [...clip(s, e), CTX.suspend]);
  const RAIL_SKIP = new Set(['Exercise', 'Sleep', 'User Suspended']);
  const eventPins = (day.pump_events || []).filter((p) => !RAIL_SKIP.has(p.event_type)).map((p) => ({
    value: [toMs(p.t), CTX.exercise],
    label: { show: true, position: 'top', formatter: p.event_type, fontSize: 8.5, color: colors.muted },
    itemStyle: { color: colors.secondary },
  }));

  const ribbon = (name, yRow, ranges, color, opacity) => ({
    name, type: 'custom', xAxisIndex: 0, yAxisIndex: 0, silent: true, z: 3,
    renderItem: (params, api) => {
      const s = api.coord([api.value(0), yRow - 0.16]);
      const e = api.coord([api.value(1), yRow + 0.16]);
      const shape = echarts.graphic.clipRectByRect(
        { x: s[0], y: e[1], width: Math.max(1, e[0] - s[0]), height: s[1] - e[1] }, params.coordSys);
      return shape && { type: 'rect', shape, style: { fill: color, opacity } };
    },
    encode: { x: [0, 1], y: 2 }, data: ranges,
  });

  const contextAtMs = (ms) => {
    const active = [];
    const within = (a, b) => ms >= toMs(a) && ms <= toMs(b);
    for (const w of day.sleep_windows || []) if (within(w.start, w.end)) active.push('Sleep');
    for (const w of restWindows || []) if (within(w.start, w.end)) active.push('Fasting');
    for (const p of day.pump_events || []) { const s = toMs(p.t); if (ms >= s && ms <= s + (p.duration_mins || 0) * 6e4) active.push(p.event_type); }
    for (const [s, e] of suspendRunPairs) if (within(s, e)) active.push('CIQ suspend');
    return active;
  };

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' }, animation: false,
    grid: [{ left: LAYOUT.LEFT, right: LAYOUT.RIGHT, top: 10, height: 44 }],
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      backgroundColor: colors.surface, borderColor: colors.line, textStyle: { color: colors.text }, confine: true,
      formatter: (ps) => {
        if (!ps || !ps.length) return '';
        const ms = +ps[0].axisValue;
        const ctx = contextAtMs(ms);
        const hm = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        return `<div style="font-weight:700;margin-bottom:2px">${hm}</div>` + (ctx.length ? ctx.join(' · ') : 'no active context');
      },
    },
    xAxis: [{ type: 'time', gridIndex: 0, min: xMin, max: xMax,
      axisLine: { lineStyle: { color: showTimeAxis ? colors.muted : colors.line } },
      axisTick: { show: showTimeAxis },
      axisLabel: showTimeAxis ? { color: colors.text, fontSize: 11, formatter: '{HH}:{mm}' } : { show: false },
      splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.35 } } }],
    yAxis: [{ type: 'value', gridIndex: 0, min: 0, max: 1, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } }],
    series: [
      ribbon('Sleep', CTX.sleep, sleepRanges, colors.secondary, 0.24),
      ribbon('Fasting', CTX.fasting, fastingRanges, colors.basal, 0.34),
      ribbon('Exercise', CTX.exercise, exerciseRanges, colors.accent, 0.5),
      ribbon('Suspend', CTX.suspend, suspendRanges, colors.muted, 0.55),
      { name: 'Events', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, z: 6, symbol: 'pin', symbolSize: 15, data: eventPins },
    ],
  };
}
