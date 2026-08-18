/* =========================================================================
   #64 SCENARIO SCREEN — pure chart logic, extracted from index.html (#100).
   Ported verbatim from the archived Scenario mock (the signed-off shipping
   design, #64); only wrapped in ES `export`s here.

   This module is deliberately VUE-FREE and DOM-FREE at import time so
   `node --test` can import it with no importmap and no DOM. The seam is
   scnBuildEpisodeOption(episode, activeStep, colors): `colors` is a plain
   dict, so getComputedStyle never crosses into here — scnColors() (which reads
   CSS custom properties off document) stays in index.html and feeds this the
   dict. The Vue components (ScnEpisodePanel, ScnPatternPanel) live in
   index.html, import vue, and import these helpers.
   ========================================================================= */

export const SCN_LEVER_COLOR = {
  carb_undercount: '#E4796F', late_bolus: '#D9A93A', missed_meal: '#4BA3C7',
  meal_over_delivery: '#B98BD9',
  over_treated_low: '#4CB584',
  correction_on_iob: '#3E8E7E',
};
export function scnPatternColor(lever) { return SCN_LEVER_COLOR[lever] || '#E4796F'; }

/* Display title for a lever that surfaces only as an episode (no surfaced
   pattern carries a title for it). The catalog payload owns the lever titles now
   (#157: /api/catalog, generated from levers._META) — pass its value->title map
   as `titles` and this reads it, retiring the hand-kept SCN_LEVER_TITLE. Falls
   back to a de-slugged value when the catalog hasn't loaded yet. */
export function scnHumanizeLever(lever, titles = {}) {
  return titles[lever] || (lever[0].toUpperCase() + lever.slice(1)).replace(/_/g, ' ');
}

export const SCN_DAY_MS = 86400000;
export function scnParseTs(s) { return new Date(s.replace(' ', 'T')); }
export function scnDayKey(d) { const p=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
export function scnFmtClock(d) { return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', ''); }

export const SCN_EVIDENCE_TIER = {
  observed:    { key: 'observed',    label: 'Observed',    dash: false, hedge: false },
  inferred:    { key: 'inferred',    label: 'Inferred',    dash: true,  hedge: true  },
  not_in_data: { key: 'not_in_data', label: "Can't see this", dash: true, hedge: true },
};
export const SCN_BOLUS_SYMBOL = { food: 'circle', correction: 'diamond', 'food+correction': 'pin' };
export function scnBolusKind(b) {
  const hasCarbs = (b.carbs || 0) > 0;
  const hasCorrection = (b.bg || 0) > 0;
  if (hasCarbs && hasCorrection) return 'food+correction';
  if (hasCarbs) return 'food';
  if (hasCorrection) return 'correction';
  return 'food';
}
export const scnToISO = (t) => t.replace(' ', 'T');
export const SCN_FIXED_BASAL_MAX = 4; // U/h — one sane scale for ALL windows (owner note 6)

export function scnBeatSpan(episode, i) {
  const steps = episode.steps || [];
  if (!steps.length) return null;
  const start = steps[i].t;
  const end = i + 1 < steps.length ? steps[i + 1].t : (episode.window && episode.window.end) || episode.end;
  return { start, end };
}
/* #118: the look-back/ahead span a step scanned (e.g. the missed-meal digestion
   window), as markArea coords. Empty unless the step carries a cited_window. */
export function scnLookbackBandCoords(step) {
  const w = step && step.cited_window;
  if (!w || !w.start || !w.end) return [];
  return [[{ xAxis: scnToISO(w.start) }, { xAxis: scnToISO(w.end) }]];
}
/* THE SHIPPING JOIN (#82): resolve a step's cited_event_refs against real window rows. */
export function scnCitedEventsForStep(episode, i) {
  const step = (episode.steps || [])[i];
  if (!step) return [];
  const refs = step.cited_event_refs || [];
  if (!refs.length) return [];
  const w = episode.window || {};
  const bolusBy = new Map((w.boluses || []).map((b) => [b.t, b]));
  const cgmBy = new Map((w.cgm || []).map((c) => [c.t, c]));
  const basalBy = new Map((w.basal || []).map((x) => [x.t, x]));
  const out = [];
  for (const r of refs) {
    if (bolusBy.has(r)) out.push({ type: 'bolus', t: r, row: bolusBy.get(r) });
    else if (cgmBy.has(r)) out.push({ type: 'cgm', t: r, row: cgmBy.get(r) });
    else if (basalBy.has(r)) out.push({ type: 'basal', t: r, row: basalBy.get(r) });
  }
  return out;
}
export function scnWithin(t, span) { return t >= span.start && t < span.end; }
export function scnMergeIntervals(intervals) {
  const ok = intervals.filter((s) => s && s.start != null && s.end != null && s.start < s.end);
  ok.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  const out = [];
  for (const iv of ok) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) { if (iv.end > last.end) last.end = iv.end; }
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
}
/* #158: per-window glucose y-axis range. A fixed 40–400 scale flattened the
   flagged excursion into the bottom quarter of the chart; instead frame the
   window's actual glucose trace while keeping the 70/180 target band in view.

   yMin = min(70, dataMin) - 15, yMax = max(180, dataMax) + 15 — the min/max
   against the band guarantees BOTH target lines stay in frame even for a
   one-sided excursion; padding is a fixed ±15. Round outward to the nearest 10
   for clean labels, then clamp to the sensor range [40, 400]. With zero CGM
   points there is nothing to scale on, so fall back to the band plus a wider
   pad: [40, 220] (NOT the old 40–400). Only this axis auto-scales; the insulin
   (U) and basal (U/h) axes keep their fixed scales. */
export const SCN_GLUCOSE_AXIS_MIN = 40;
export const SCN_GLUCOSE_AXIS_MAX = 400;
export function scnGlucoseYRange(w) {
  const bgs = ((w && w.cgm) || []).map((p) => p.bg).filter((bg) => bg != null);
  if (bgs.length === 0) {
    return { min: Math.max(SCN_GLUCOSE_AXIS_MIN, 70 - 40), max: 180 + 40 };
  }
  const dataMin = Math.min(...bgs);
  const dataMax = Math.max(...bgs);
  const min = Math.floor((Math.min(70, dataMin) - 15) / 10) * 10;
  const max = Math.ceil((Math.max(180, dataMax) + 15) / 10) * 10;
  return {
    min: Math.max(SCN_GLUCOSE_AXIS_MIN, min),
    max: Math.min(SCN_GLUCOSE_AXIS_MAX, max),
  };
}
export function scnBuildEpisodeOption(episode, activeStep, colors) {
  const w = episode.window || {};
  const glucoseRange = scnGlucoseYRange(w);
  const steps = episode.steps || [];
  const active = steps[activeStep] || null;
  const span = active ? scnBeatSpan(episode, activeStep) : null;
  const tier = active ? active.evidence_tier : 'observed';
  const hedged = tier !== 'observed';
  const DIM = 0.72;

  const citedEvents = active ? scnCitedEventsForStep(episode, activeStep) : [];
  const citedBolusSet = new Set(citedEvents.filter((e) => e.type === 'bolus').map((e) => e.t));
  const citedCgmSet = new Set(citedEvents.filter((e) => e.type === 'cgm').map((e) => e.t));
  const citedBasalSet = new Set(citedEvents.filter((e) => e.type === 'basal').map((e) => e.t));

  const rangeColor = (bg) => bg == null ? colors.muted
    : bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange;

  const cgmSorted = (w.cgm || []).filter((p) => p.bg != null).slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const cgmPoints = cgmSorted.map((p) => {
    const lit = !span || scnWithin(p.t, span);
    const cited = citedCgmSet.has(p.t);
    return {
      value: [scnToISO(p.t), p.bg],
      itemStyle: {
        color: rangeColor(p.bg), opacity: cited ? 1 : (lit ? 1 : DIM),
        borderColor: cited ? (hedged ? colors.inferred : colors.observed) : 'transparent',
        borderWidth: cited ? 3 : 0,
        shadowBlur: cited ? 10 : 0, shadowColor: cited ? rangeColor(p.bg) : 'transparent',
      },
      symbolSize: cited ? 13 : (lit ? 6 : 4),
    };
  });
  if (cgmSorted.length > 0) {
    let maxIdx = 0, minIdx = 0;
    cgmSorted.forEach((p, i) => {
      if (p.bg > cgmSorted[maxIdx].bg) maxIdx = i;
      if (p.bg < cgmSorted[minIdx].bg) minIdx = i;
    });
    const labelPoint = (i) => {
      cgmPoints[i].label = { show: true, position: cgmSorted[i].bg > 180 ? 'top' : 'bottom',
        formatter: String(Math.round(cgmSorted[i].bg)), fontSize: 10, color: rangeColor(cgmSorted[i].bg) };
    };
    labelPoint(maxIdx);
    if (minIdx !== maxIdx) labelPoint(minIdx);
  }

  const basalSorted = (w.basal || []).slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const isSuspendRow = (b) =>
    (b.basal_rate === 0) ||
    b.delivery_type === 'algorithmDelivery (control-iq suspension)';
  const suspendRaw = [];
  let bandStart = null, bandCited = false;
  for (let i = 0; i < basalSorted.length; i++) {
    const sus = isSuspendRow(basalSorted[i]);
    if (sus && bandStart == null) { bandStart = basalSorted[i].t; bandCited = false; }
    if (sus && citedBasalSet.has(basalSorted[i].t)) bandCited = true;
    const isLast = i === basalSorted.length - 1;
    if ((!sus || isLast) && bandStart != null) {
      const endT = basalSorted[i].t;
      suspendRaw.push({ start: bandStart, end: endT, cited: bandCited });
      bandStart = null; bandCited = false;
    }
  }
  const suspendMerged = scnMergeIntervals(suspendRaw);
  const suspendCited = scnMergeIntervals(suspendRaw.filter((s) => s.cited));
  const basalArea = basalSorted.map((e) => [scnToISO(e.t), Math.min(e.basal_rate, SCN_FIXED_BASAL_MAX)]);
  const profileLine = basalSorted.map((e) => [scnToISO(e.t), Math.min(e.profile_basal_rate, SCN_FIXED_BASAL_MAX)]);

  const sleepMerged = scnMergeIntervals((w.sleep_windows || []).map((s) => ({ start: s.start, end: s.end })));
  const exerciseMerged = scnMergeIntervals((w.pump_events || []).filter((p) => p.event_type === 'Exercise')
    .map((p) => ({ start: p.t, end: scnAddMinutesIso(p.t, p.duration_mins || 0) })));
  const toCoords = (ivs) => ivs.map((s) => [{ xAxis: scnToISO(s.start) }, { xAxis: scnToISO(s.end) }]);
  const sleepBars = toCoords(sleepMerged);
  const exerciseBars = toCoords(exerciseMerged);
  const suspendAreaData = toCoords(suspendMerged);
  const suspendCitedData = toCoords(suspendCited);

  const bolusSeriesByKind = { food: [], correction: [], 'food+correction': [] };
  for (const b of (w.boluses || [])) {
    const cited = citedBolusSet.has(b.t);
    const inSpan = !span || scnWithin(b.t, span);
    const lit = cited || (!span);
    bolusSeriesByKind[scnBolusKind(b)].push({
      value: [scnToISO(b.t), b.insulin],
      itemStyle: {
        color: colors.accent,
        opacity: lit ? 1 : (inSpan ? 0.75 : DIM),
        borderColor: cited ? (hedged ? colors.inferred : colors.observed) : 'transparent',
        borderWidth: cited ? 2.5 : 0,
        borderType: cited && hedged ? 'dashed' : 'solid',
        shadowBlur: cited ? 8 : 0,
        shadowColor: cited ? colors.accent : 'transparent',
      },
      symbolSize: cited ? 17 : 12,
      label: { show: lit, position: 'top', formatter: (b.insulin || 0).toFixed(1),
        fontSize: cited ? 11 : 10, fontWeight: cited ? 700 : 400,
        color: cited ? colors.text : colors.accent },
    });
  }
  const carbPoints = (w.boluses || []).filter((b) => (b.carbs || 0) > 0).map((b) => {
    const lit = !span || scnWithin(b.t, span);
    return {
      value: [scnToISO(b.t), -(b.carbs || 0)],
      itemStyle: { color: colors.secondary, opacity: lit ? 1 : DIM },
      label: { show: lit, position: 'bottom', formatter: String(Math.round(b.carbs || 0)),
        fontSize: 10, color: colors.secondary },
    };
  });

  const stepColor = (t) => t === 'observed' ? colors.observed
    : t === 'not_in_data' ? colors.notindata : colors.inferred;
  const stepLines = steps.map((s, i) => {
    const isActive = i === activeStep;
    return {
      xAxis: scnToISO(s.t),
      lineStyle: {
        type: s.evidence_tier === 'observed' ? 'solid' : 'dashed',
        color: stepColor(s.evidence_tier),
        width: isActive ? 2.5 : 1,
        opacity: isActive ? 1 : 0.28,
      },
      label: { show: true, position: 'insideEndTop', color: stepColor(s.evidence_tier),
        fontSize: isActive ? 12 : 9, fontWeight: isActive ? 700 : 400,
        opacity: isActive ? 1 : 0.4, formatter: String(i + 1) },
    };
  });

  // #118: the scan window (digestion lookback) the active step reasoned over,
  // shaded back from the trigger so the peak-vs-onset detection is legible.
  const lookbackBand = active ? scnLookbackBandCoords(active) : [];
  const spanBands = span ? [[{ xAxis: scnToISO(span.start) }, { xAxis: scnToISO(span.end) }]] : [];
  const spanItemStyle = hedged
    ? { color: stepColor(tier), opacity: 0.06,
        borderColor: stepColor(tier), borderWidth: 1, borderType: 'dashed',
        decal: { symbol: 'line', dashArrayX: [1, 0], dashArrayY: [3, 4],
          rotation: -Math.PI / 4, color: stepColor(tier) } }
    : { color: stepColor(tier), opacity: 0.10,
        borderColor: stepColor(tier), borderWidth: 1, borderType: 'solid' };

  const midnightLines = scnMidnightBoundaries(w).map((iso) => ({
    xAxis: iso,
    lineStyle: { type: 'solid', color: colors.text, width: 1.5, opacity: 0.55 },
    label: { show: true, position: 'insideEndBottom', color: colors.text, fontSize: 10,
      fontWeight: 700, backgroundColor: colors.surface, padding: [2, 4], borderRadius: 3,
      formatter: scnDayLabelFor(iso) },
  }));

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { left: 46, right: 66, top: 22, bottom: 30 },
    xAxis: {
      type: 'time', axisLine: { lineStyle: { color: colors.line } },
      axisLabel: {
        color: colors.muted, fontSize: 10,
        formatter: (val) => {
          const d = new Date(val);
          if (d.getHours() === 0 && d.getMinutes() === 0) {
            return `{day|${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}}`;
          }
          return d.toLocaleTimeString(undefined, { hour: 'numeric' });
        },
        rich: { day: { color: colors.text, fontWeight: 700, fontSize: 10 } },
      },
      splitLine: { show: false },
      min: scnToISO(w.start), max: scnToISO(w.end),
    },
    yAxis: [
      { type: 'value', name: 'mg/dL', nameLocation: 'end', nameTextStyle: { color: colors.muted, fontSize: 9 },
        min: glucoseRange.min, max: glucoseRange.max, axisLabel: { color: colors.muted, fontSize: 9 }, axisLine: { show: false },
        splitLine: { lineStyle: { color: colors.line, opacity: 0.5 } } },
      { type: 'value', name: 'U', nameLocation: 'end', nameTextStyle: { color: colors.accent, fontSize: 9 },
        min: -80, max: 12, axisLabel: { show: false }, axisLine: { show: false }, splitLine: { show: false } },
      { type: 'value', name: 'U/h', nameLocation: 'end', nameTextStyle: { color: colors.basal, fontSize: 9 },
        min: 0, max: SCN_FIXED_BASAL_MAX, position: 'right', offset: 0,
        axisLabel: { color: colors.basal, fontSize: 9 }, axisLine: { show: false }, splitLine: { show: false } },
    ],
    series: [
      { name: 'Delivered basal', type: 'line', yAxisIndex: 2, step: 'end', symbol: 'none',
        lineStyle: { color: colors.basal, width: 1, opacity: span ? 0.5 : 0.8 }, z: 1,
        areaStyle: { color: colors.basal, opacity: span ? 0.10 : 0.16 }, data: basalArea,
        markArea: { silent: true, z: 0,
          itemStyle: { color: colors.muted, opacity: 0.14,
            decal: { symbol: 'line', dashArrayX: [1, 0], dashArrayY: [4, 4], rotation: Math.PI / 4, color: colors.muted, opacity: 0.5 } },
          data: suspendAreaData } },
      { name: 'Programmed basal', type: 'line', yAxisIndex: 2, step: 'end', symbol: 'none',
        lineStyle: { color: colors.basal, type: 'dashed', width: 1, opacity: 0.45 }, data: profileLine, z: 2 },
      { name: 'Suspend (cited)', type: 'line', yAxisIndex: 2, data: [], z: 3,
        markArea: { silent: true, itemStyle: { color: colors.inferred, opacity: 0.12 }, data: suspendCitedData } },
      { name: 'Lookback window', type: 'line', data: [], z: 4,
        markArea: { silent: true,
          itemStyle: { color: colors.inferred, opacity: 0.07,
            borderColor: colors.inferred, borderWidth: 1, borderType: 'dashed',
            decal: { symbol: 'line', dashArrayX: [1, 0], dashArrayY: [2, 5],
              rotation: Math.PI / 4, color: colors.inferred, opacity: 0.4 } },
          label: { show: true, position: 'insideTop', color: colors.muted, fontSize: 9,
            formatter: 'digestion lookback' },
          data: lookbackBand } },
      { name: 'Glucose line', type: 'line', symbol: 'none', z: 5, silent: true,
        lineStyle: { color: colors.inRange, width: 1.5, opacity: span ? 0.35 : 0.5 },
        data: cgmSorted.map((p) => [scnToISO(p.t), p.bg]) },
      { name: 'Glucose', type: 'scatter', symbolSize: 6, data: cgmPoints, z: 6,
        markLine: {
          symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: colors.muted, opacity: 0.5 },
          label: { show: false },
          data: [
            { yAxis: 70, lineStyle: { opacity: 0.4 } },
            { yAxis: 180, lineStyle: { opacity: 0.4 } },
            ...stepLines, ...midnightLines,
          ],
        },
        markArea: { silent: true, z: 0, data: spanBands, itemStyle: spanItemStyle } },
      { name: 'Bolus (food)', type: 'scatter', yAxisIndex: 1, symbol: SCN_BOLUS_SYMBOL.food, itemStyle: { color: colors.accent }, data: bolusSeriesByKind.food, z: 7 },
      { name: 'Bolus (correction)', type: 'scatter', yAxisIndex: 1, symbol: SCN_BOLUS_SYMBOL.correction, itemStyle: { color: colors.accent }, data: bolusSeriesByKind.correction, z: 7 },
      { name: 'Bolus (food+correction)', type: 'scatter', yAxisIndex: 1, symbol: SCN_BOLUS_SYMBOL['food+correction'], itemStyle: { color: colors.accent }, data: bolusSeriesByKind['food+correction'], z: 7 },
      { name: 'Carbs', type: 'scatter', yAxisIndex: 1, symbol: 'circle', symbolSize: 10, itemStyle: { color: colors.secondary }, data: carbPoints, z: 7,
        tooltip: { valueFormatter: (v) => `${Math.abs(Math.round(v))} g` } },
      { type: 'line', data: [], silent: true, z: 0,
        markArea: { silent: true, data: [[{ yAxis: 70, itemStyle: { color: colors.inRange, opacity: 0.05 } }, { yAxis: 180 }]] } },
      { name: 'Sleep', type: 'line', data: [], markArea: { silent: true, itemStyle: { color: colors.secondary, opacity: 0.10 }, data: sleepBars } },
      { name: 'Exercise', type: 'line', data: [], markArea: { silent: true, itemStyle: { color: colors.accent, opacity: 0.12 }, data: exerciseBars } },
    ],
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, backgroundColor: colors.surface, borderColor: colors.line, textStyle: { color: colors.text } },
    legend: { show: false },
  };
}
export function scnMidnightBoundaries(w) {
  if (!w.start || !w.end) return [];
  const out = [];
  const start = new Date(scnToISO(w.start));
  const end = new Date(scnToISO(w.end));
  const d = new Date(start);
  d.setHours(24, 0, 0, 0);
  while (d < end) {
    const p = (n) => String(n).padStart(2, '0');
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T00:00:00`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}
export function scnDayLabelFor(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function scnAddMinutesIso(t, mins) {
  const d = new Date(t.replace(' ', 'T'));
  d.setMinutes(d.getMinutes() + mins);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
export const SCN_EXPOSURE_NOUN = {
  carb_undercount: 'meals', late_bolus: 'meals', missed_meal: 'rises',
  meal_over_delivery: 'meals', over_treated_low: 'lows',
  correction_stacking: 'corrections',
  correction_on_iob: 'lows',
};
export function scnRateLine(pattern) {
  const c = pattern.confidence;
  const pct = Math.round(c.rate * 100);
  const noun = SCN_EXPOSURE_NOUN[pattern.lever] || 'times';
  return { pct, noun, k: c.k, n: c.n };
}

/* The #172 pre-empted-low card: a COUNT with attribution (ADR 0012), never a rate.
   Kept deliberately separate from scnRateLine above so the presentation can never be
   mistaken for a "% of meals" pattern. `preempted` is the payload's preempted_lows
   count-object ({total, ic, isf, unattributed, floor_u}); returns null when there is
   nothing to show (total 0), else {total, parts:[{kind,count,label,hint}…]} in a
   fixed I:C → ISF → unattributed order. */
export function scnPreemptedSummary(preempted) {
  if (!preempted || !preempted.total) return null;
  const parts = [];
  if (preempted.ic) {
    parts.push({
      kind: 'ic', count: preempted.ic,
      label: preempted.ic === 1 ? 'after a meal' : 'after meals',
      hint: 'look at your I:C or carb counting',
    });
  }
  if (preempted.isf) {
    parts.push({
      kind: 'isf', count: preempted.isf,
      label: preempted.isf === 1 ? 'after a correction' : 'after corrections',
      hint: 'look at your ISF',
    });
  }
  if (preempted.unattributed) {
    parts.push({
      kind: 'unattributed', count: preempted.unattributed,
      label: 'with no active bolus',
      hint: 'a basal or activity drop, not a dose',
    });
  }
  return { total: preempted.total, parts };
}
export function scnFmtWhen(ts) {
  const d = new Date(ts.replace(' ', 'T'));
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
}
export function scnFmtTimeOnly(ts) {
  return new Date(ts.replace(' ', 'T')).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
export function scnFmtDayShort(ts) {
  return new Date(ts.replace(' ', 'T')).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
