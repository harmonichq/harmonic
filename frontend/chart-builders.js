/* =========================================================================
   #101 CHART BUILDERS — pure ECharts / Chart.js option builders, extracted
   from index.html. Same seam discipline as scenario-chart.js (#100).

   This module is deliberately VUE-FREE and DOM-FREE at import time so
   `node --test` can import it with no importmap and no DOM. The builders take
   everything they need as PLAIN arguments:

     - `colors`  — a plain dict of resolved theme colors.
                   Callers resolve their own visual tokens before invoking a builder.
     - `analysis`, `filters`, `highlights`, `dailyHighlight` — the reactive
                   state that buildDayOption used to reach through setup()'s
                   closure is now injected, breaking the closure capture so
                   the returned option JSON is testable.
                   The option carries every derived value it needs.
                   No builder reaches back into the page shell.

   No `ref`/`reactive`/`computed`, no `getComputedStyle`, no `fetch` inside.
   These return option JSON only. scnBuildEpisodeOption stays in
   scenario-chart.js.
   ========================================================================= */

// --- small pure helpers (single source of truth; index.html re-imports) ----

// #381 FALSE-LOW ghost: a flagged compression low stays DRAWN on the glucose lane but
// greyed + dashed as a "sensor artifact" (concept B). The live range-colored curve is
// bridged across the excursion (its in-span points nulled + connectNulls), and this
// returns the muted dashed ghost of the fabricated V that overlays the gap, plus an
// "excluded" tag at each nadir — so the pulled V is always visible (and undoable). Pure
// over its inputs (cgmSorted + the /api/timeline false_low_exclusion_spans), node-tested.
export function falseLowGhost(cgmSorted, spans, colors, toMs, { xAxisIndex = 0, yAxisIndex = 0 } = {}) {
  const ranges = (spans || []).map((s) => [toMs(s.start), toMs(s.end)]);
  const inSpan = (ms) => ranges.some(([a, b]) => ms >= a && ms <= b);
  if (!ranges.length) return { inSpan: () => false, ghostSeries: [] };

  const ghostData = cgmSorted.map((p) => ({ value: [toMs(p.t), inSpan(toMs(p.t)) ? p.bg : null] }));
  const tags = ranges.map(([a, b]) => {
    const pts = cgmSorted.filter((p) => { const m = toMs(p.t); return m >= a && m <= b; });
    if (!pts.length) return null;
    const nadir = pts.reduce((lo, p) => (p.bg < lo.bg ? p : lo), pts[0]);
    return {
      value: [toMs(nadir.t), nadir.bg], symbolSize: 1,
      label: { show: true, position: 'bottom', distance: 10, formatter: 'excluded',
        color: colors.muted, fontSize: 10, fontWeight: 700,
        backgroundColor: colors.surface2 || colors.surface, padding: [2, 6], borderRadius: 4 },
    };
  }).filter(Boolean);

  const ghostSeries = [
    { id: 'false-low-ghost', name: 'Sensor artifact', type: 'line', xAxisIndex, yAxisIndex,
      data: ghostData, z: 3, connectNulls: false, symbol: 'circle', symbolSize: 3, showSymbol: true,
      lineStyle: { width: 1.4, type: 'dashed', color: colors.muted, opacity: 0.55 },
      itemStyle: { color: colors.muted, opacity: 0.5 } },
    { id: 'false-low-tag', type: 'scatter', xAxisIndex, yAxisIndex, data: tags, z: 8, silent: true },
  ];
  return { inSpan, ghostSeries };
}

export function fmt(v, decimals = 3) {
  return v == null ? '—' : Number(v.toFixed(decimals)).toString();
}

export function direction(s) {
  if (s.recommended == null || s.current == null) return null;
  if (Math.abs(s.recommended - s.current) < 1e-9) return 'on target';
  return s.recommended > s.current ? 'raise' : 'lower';
}

export function bolusKind(b) {
  const hasCarbs = (b.carbs || 0) > 0;
  const hasCorrection = (b.bg || 0) > 0;
  if (hasCarbs && hasCorrection) return 'food+correction';
  if (hasCarbs) return 'food';
  if (hasCorrection) return 'correction';
  return 'food'; // fallback: most unlabeled boluses are meal boluses
}

// ECharts symbol strings (built-ins) per bolus kind — droplet family per the
// reference design (filled = correction, half = both).
export const BOLUS_SYMBOL = {
  food: 'circle',
  correction: 'diamond',
  'food+correction': 'pin',
};

// #385 insulin-lane fixed rows — the bolus glyphs sit on the upper row, carbs
// (pump + manual) on the lower one. Exported as the single source of truth so the
// dose-focus overlay (day-dose-focus.js) maps events to the SAME pixel rows the
// builder plots them on; buildLanesOption's B_ROW/C_ROW read from here.
export const DOSE_ROWS = { bolus: 0.72, carbs: 0.26 };

// Stay in local wall-clock: `new Date(naiveString)` parses as local, but
// toISOString() would emit UTC and smear the browser's tz offset into the
// result. Format back with local getters so addMinutesIso(t, 0) === toISO(t).
// This is what keeps a midnight-crossing exercise band's end on the same wall
// clock the rest of the day is drawn in (cf. #89).
export function addMinutesIso(t, mins) {
  const d = new Date(t.replace(' ', 'T'));
  d.setMinutes(d.getMinutes() + mins);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T` +
         `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// #82 zero-rate-run contract: a SUSPEND is a contiguous run of delivered-basal
// rows whose basal_rate === 0. We do NOT key off delivery_type — on real data
// that string tags only a handful of the true zero-rate rows (#82). Each run
// spans [runStart.t, lastRow.t + its duration] so the block has real width.
export function suspendRuns(basalSorted) {
  const runs = [];
  let start = null;
  for (let i = 0; i < basalSorted.length; i++) {
    const r = basalSorted[i];
    const isZero = r.basal_rate === 0;
    if (isZero && start == null) start = r;
    const isLast = i === basalSorted.length - 1;
    if ((!isZero || isLast) && start != null) {
      // end = last zero row's start + its own 5-min duration (or the current
      // non-zero row's start, whichever we hit first).
      const prev = basalSorted[i - (isZero ? 0 : 1)] || r;
      const end = isZero && isLast
        ? addMinutesIso(prev.t, prev.duration_mins || 5)
        : r.t;
      runs.push([start.t, end]);
      start = null;
    }
  }
  return runs;
}

// #394 signed-delta stepped plateaus. Each basal slot spans its OWN duration
// (t → t + duration_mins), NEVER to the next row and NEVER to end-of-day — so a
// data gap (or a mid-day view whose last synced slot is simply the newest row)
// renders as empty lane instead of smearing that slot's delta across the hours
// with no data. Consecutive slots carrying the SAME signed delta merge into one
// plateau ("one sustained Control-IQ command"); the run only merges when the next
// slot begins where the last plateau ended (a gap breaks it), so contiguity comes
// from the merge, not from stretching a bar over empty time. Returns segments
// `{ t0, t1, v, slots }` in ms, sorted by start.
export function basalPlateaus(basalSorted) {
  const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();
  const segs = [];
  for (const b of basalSorted) {
    const t0 = toMs(b.t);
    const t1 = t0 + (b.duration_mins || 5) * 6e4;
    const v = +(((b.basal_rate ?? 0) - (b.profile_basal_rate ?? 0)).toFixed(3));
    const last = segs[segs.length - 1];
    // Merge only when this slot abuts the last plateau (within a slot of its end,
    // to tolerate the few-second timestamp jitter) AND carries the identical delta.
    if (last && last.v === v && Math.abs(last.t1 - t0) < 6e4) {
      last.t1 = t1;
      last.slots += 1;
    } else {
      segs.push({ t0, t1, v, slots: 1 });
    }
  }
  return segs;
}

// --- 1. daily chart (five aligned signal strips) ----------------------------
// buildLanesOption(day, dateStr, { colors, carbEntries, showContext, restWindows })
//   #276 (locked mockup day-chart-legibility-signal-strips): FIVE aligned tracks
//   on one shared clock, replacing the old four crowded lanes —
//     0 glucose (range-colored, 70/180 guides, min/max labels)
//     1 model evidence — left EMPTY here; the Day surface fills it from the model
//       anchors (day-chart.buildAnchorOverlay), keeping this builder bound to the
//       /api/timeline + /api/carbs feeds only
//     2 insulin + carbs (bolus glyphs by kind, bolus-carb + manual-carb marks)
//     3 signed basal difference (delivered − programmed: CIQ ADDING above zero,
//       CUTTING below) — the shared tooltip still reports both raw rates in U/h
//     4 context — sleep, fasting, exercise, suspend rows + discrete pump pins
//   A nearest-signal hover tooltip reads glucose, both basal rates, dosing, carbs
//   and the active context at the scrubbed time. The Day chart's reasoning surface
//   is the Episode Log beside it (ADR 0027); its only cross-track mark is the
//   single focus hairline (day-chart.evidenceFocusGraphic).
export function buildLanesOption(day, dateStr, {
  colors, carbEntries = [], showContext = true, restWindows = [] } = {}) {
  const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();
  const rangeColor = (bg) => bg == null ? colors.muted
    : bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange;

  // Every lane shares this exact x-range (in ms) so columns line up.
  const xMin = toMs(day.start || `${dateStr} 00:00:00`);
  const xMax = toMs(day.end || `${dateStr} 23:59:59`);

  /* ---------- LANE 0: glucose ---------- */
  const cgmSorted = day.cgm.filter((p) => p.bg != null)
    .slice().sort((a, b) => a.t < b.t ? -1 : 1);
  const cgmPoints = cgmSorted.map((p) => ({
    value: [toMs(p.t), p.bg], itemStyle: { color: rangeColor(p.bg) },
  }));
  // #381: flagged false-low excursions are greyed as sensor artifacts (still drawn).
  const fl = falseLowGhost(cgmSorted, day.false_low_exclusion_spans, colors, toMs);
  // Label only the day's min & max (sparse context; hover gives the rest) — skipping
  // any greyed excursion so the fake nadir never claims the day-min label.
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
        formatter: String(Math.round(cgmSorted[i].bg)), fontSize: 11,
        fontWeight: 700, color: rangeColor(cgmSorted[i].bg),
      };
    };
    if (maxIdx >= 0) labelPoint(maxIdx);
    if (minIdx >= 0 && minIdx !== maxIdx) labelPoint(minIdx);
  }
  // Bridge the live curve across each excursion so the range-colored line reads as if
  // the plunge never happened; the muted dashed ghost (fl.ghostSeries) overlays it.
  cgmPoints.forEach((pt) => {
    if (fl.inSpan(pt.value[0])) { pt.value = [pt.value[0], null]; delete pt.label; }
  });

  /* ---------- LANE 2: insulin + carbs ---------- */
  // Bolus glyph per kind at a fixed height (the dose is read from the dose-focus
  // reveal, not an inline label — #385: closely-timed doses had their U/g labels
  // overprint into unreadable glyphs). Carbs (pump + manual) sit on a lower fixed
  // row so a meal's dose and its carbs read as a stacked pair without competing
  // for the same y.
  const B_ROW = DOSE_ROWS.bolus, C_ROW = DOSE_ROWS.carbs;
  const bolusPoints = (day.boluses || []).map((b) => ({
    value: [toMs(b.t), B_ROW], raw: b,
    symbol: BOLUS_SYMBOL[bolusKind(b)],
    symbolSize: bolusKind(b) === 'food+correction' ? 16 : 13,
    itemStyle: { color: colors.accent },
  }));
  // Bolus-carbs: a pump FACT — grey diamond. Amount lives in the dose-focus reveal.
  const bolusCarbPoints = (day.boluses || []).filter((b) => (b.carbs || 0) > 0).map((b) => ({
    value: [toMs(b.t), C_ROW], carbs: b.carbs, symbolSize: 11,
    itemStyle: { color: colors.secondary },
  }));
  // Manual carb pills: a user CLAIM — amber outlined pill, certainty in the glyph
  // (dashed border = estimate). Amount lives in the dose-focus reveal.
  const cSoft = colors.manualCarbSoft, cMan = colors.manualCarb;
  const manualCarbPoints = (carbEntries || []).map((e) => ({
    value: [toMs(e.t), C_ROW], symbolSize: 14,
    itemStyle: { color: cSoft, borderColor: cMan, borderWidth: 2,
      borderType: e.certainty === 'estimate' ? 'dashed' : 'solid' },
  }));

  /* ---------- LANE 3: signed basal difference ---------- */
  // delivered = basal_rate, programmed = profile_basal_rate. The lane draws the
  // SIGNED difference as one bar per 5-min slot: accent ABOVE zero where CIQ
  // ADDED (delivered > programmed), on-target BELOW zero where it CUT. Both raw
  // rates are kept on `basalSorted` so the shared tooltip still reports them.
  const basalSorted = day.basal.slice().sort((a, b) => a.t < b.t ? -1 : 1);
  // Merge into duration-true stepped plateaus (#394): one solid block per sustained
  // CIQ command, each spanning only its own slots — no smear to the next row or
  // to midnight. Each datum is [startMs, endMs, signedDiff].
  const basalSegments = basalPlateaus(basalSorted);
  const basalDiffData = basalSegments.map((s) => [s.t0, s.t1, s.v]);
  // Plain linear axis, per-side extents, floored ±0.3 so a near-flat day still
  // reads, with the ×1.15 headroom. No compression (day peaks are only ~3–4× the
  // texture, so the fine detail stays legible on a linear scale — #394).
  const diffs = basalSegments.map((s) => s.v);
  const basalYMax = +(Math.max(0.3, ...diffs, 0) * 1.15).toFixed(2);
  const basalYMin = +(Math.min(-0.3, ...diffs, 0) * 1.15).toFixed(2);

  /* ---------- LANE 4: context (sleep · fasting · exercise · suspend + pins) ---------- */
  // Each context kind is a thin ribbon on its own row inside the lane, so two
  // overlapping contexts (e.g. sleep + fasting) don't blend into one muddy band.
  const clip = (a, b) => [Math.max(xMin, toMs(a)), Math.min(xMax, toMs(b))];
  const CTX = { sleep: 0.82, fasting: 0.58, exercise: 0.34, suspend: 0.10 };
  const sleepRanges = showContext
    ? (day.sleep_windows || []).map((w) => [...clip(w.start, w.end), CTX.sleep]) : [];
  const fastingRanges = showContext
    ? (restWindows || []).map((w) => [...clip(w.start, w.end), CTX.fasting]) : [];
  const exerciseRanges = showContext
    ? (day.pump_events || []).filter((p) => p.event_type === 'Exercise')
        .map((p) => [...clip(p.t, addMinutesIso(p.t, p.duration_mins || 0)), CTX.exercise]) : [];
  // #82: a suspend is a contiguous run of basal_rate===0 rows, NOT delivery_type.
  const suspendRunPairs = showContext ? suspendRuns(basalSorted) : [];
  const suspendRanges = suspendRunPairs.map(([s, e]) => [...clip(s, e), CTX.suspend]);
  // Discrete pump events (Site/Cartridge Change …) as pins; the context types
  // already drawn as ribbons are excluded so their labels don't crowd the rail.
  const RAIL_SKIP = new Set(['Exercise', 'Sleep', 'User Suspended']);
  const eventPins = showContext
    ? (day.pump_events || [])
        .filter((p) => !RAIL_SKIP.has(p.event_type))
        .map((p) => ({
          value: [toMs(p.t), CTX.exercise],
          label: { show: true, position: 'top', formatter: p.event_type,
            fontSize: 9, color: colors.muted },
          itemStyle: { color: colors.secondary },
        }))
    : [];

  /* ---------- shared-clock hover tooltip: nearest meaningful signal ---------- */
  // Axis trigger gives one x column; we read the nearest CGM / basal slot / dose /
  // carb and the active context at that instant. This is what keeps BOTH raw basal
  // rates in the tooltip even though the basal track only draws their difference.
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
  const contextAtMs = (ms) => {
    if (!showContext) return [];
    const active = [];
    const within = (a, b) => ms >= toMs(a) && ms <= toMs(b);
    for (const w of day.sleep_windows || []) if (within(w.start, w.end)) active.push('Sleep');
    for (const w of restWindows || []) if (within(w.start, w.end)) active.push('Fasting');
    for (const p of day.pump_events || []) { const s = toMs(p.t); if (ms >= s && ms <= s + (p.duration_mins || 0) * 6e4) active.push(p.event_type); }
    for (const [s, e] of suspendRunPairs) if (within(s, e)) active.push('CIQ suspend');
    return active;
  };
  const KIND_TEXT = { food: 'meal', correction: 'correction', 'food+correction': 'meal + correction' };

  // A context ribbon: one thin rect per window on its own row inside lane 4, so
  // overlapping contexts don't blend. `echarts` is a browser global (never called
  // at import — the node tests only inspect the option, never renderItem).
  const ribbon = (name, yRow, ranges, color, opacity) => ({
    name, type: 'custom', xAxisIndex: 4, yAxisIndex: 4, silent: true, z: 3,
    renderItem: (params, api) => {
      const s = api.coord([api.value(0), yRow - 0.16]);
      const e = api.coord([api.value(1), yRow + 0.16]);
      const shape = echarts.graphic.clipRectByRect(
        { x: s[0], y: e[1], width: Math.max(1, e[0] - s[0]), height: s[1] - e[1] },
        params.coordSys);
      return shape && { type: 'rect', shape, style: { fill: color, opacity } };
    },
    encode: { x: [0, 1], y: 2 }, data: ranges,
  });

  /* ---------- axis / grid scaffolding (5 aligned strips, shared time x) ---- */
  // Vertical budget as fractions (survive host resize): glucose keeps the lion's
  // share; evidence/insulin/basal/context are thin aligned strips. LANE_SPAN
  // (exported) is the top/bottom the focus hairline spans, kept in sync here.
  const trackName = ['GLUCOSE', 'EVIDENCE', 'INSULIN', 'BASAL Δ', 'CONTEXT'];
  const grids = [
    { left: 76, right: 22, top: '2%',  height: '41%' },
    { left: 76, right: 22, top: '47%', height: '6%'  },
    { left: 76, right: 22, top: '57%', height: '13%' },
    { left: 76, right: 22, top: '73%', height: '13%' },
    { left: 76, right: 22, top: '90%', height: '7%'  },
  ];
  // Every xAxis shares the SAME min/max so the strips line up column-for-column.
  const xAxisBase = (gridIndex, showLabel) => ({
    type: 'time', gridIndex, min: xMin, max: xMax,
    axisLine: { lineStyle: { color: showLabel ? colors.muted : colors.line } },
    axisTick: { show: showLabel },
    axisLabel: showLabel
      // Uniform HH:MM so the day-boundary tick reads `00:00`, not day-of-month.
      ? { color: colors.text, fontSize: 11, formatter: '{HH}:{mm}' }
      : { show: false },
    splitLine: { show: false },
  });
  const yAxisFor = (gridIndex, opts) => Object.assign({
    type: 'value', gridIndex, scale: true,
    name: trackName[gridIndex], nameLocation: 'middle', nameGap: 52, nameRotate: 0,
    nameTextStyle: { color: colors.muted, fontSize: 9, fontWeight: 700, align: 'center' },
    axisLabel: { color: colors.muted, fontSize: 9 },
    axisLine: { show: false },
    splitLine: { show: false },
  }, opts);

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' },
    animation: false,
    grid: grids,
    // Axis pointer links all five strips so hovering scrubs one time column.
    axisPointer: {
      link: [{ xAxisIndex: 'all' }], type: 'line',
      lineStyle: { color: colors.muted, opacity: 0.5, type: 'dashed' },
      label: { show: false },
    },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'line' },
      backgroundColor: colors.surface, borderColor: colors.line,
      textStyle: { color: colors.text }, confine: true,
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
        // A gap in the duration-true lane means there is no basal reading at
        // this instant. Do not present the preceding row as if it were current.
        const seg = basalSegments.find((s) => ms >= s.t0 && ms < s.t1);
        const b = seg ? basalAtMs(ms) : null;
        if (b) {
          const diff = (b.basal_rate ?? 0) - (b.profile_basal_rate ?? 0);
          add(diff > 0 ? colors.primary : diff < 0 ? colors.secondary : colors.line,
            'Basal Δ', (diff >= 0 ? '+' : '') + diff.toFixed(2) + ' U/h');
          add(colors.basal, 'Delivered basal', (b.basal_rate ?? 0).toFixed(2) + ' U/h');
          add(colors.secondary, 'Programmed basal', (b.profile_basal_rate ?? 0).toFixed(2) + ' U/h');
          add(colors.muted, 'Command held', Math.round((seg.t1 - seg.t0) / 6e4) + ' min');
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
      xAxisBase(0, false),
      xAxisBase(1, false),
      xAxisBase(2, false),
      xAxisBase(3, false),
      xAxisBase(4, true), // only the bottom strip carries the time labels
    ],
    yAxis: [
      // 0: glucose
      yAxisFor(0, {
        min: (v) => Math.min(50, v.min - 10),
        splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.6 } },
      }),
      // 1: model evidence — hidden 0..1; filled by the Day surface's anchor overlay
      yAxisFor(1, { min: 0, max: 1, axisLabel: { show: false } }),
      // 2: insulin + carbs — hidden 0..1 (glyphs at fixed rows)
      yAxisFor(2, { min: 0, max: 1, axisLabel: { show: false } }),
      // 3: signed basal difference (U/h), zero-centered, per-side linear extents
      yAxisFor(3, {
        min: basalYMin, max: basalYMax,
        axisLabel: { color: colors.muted, fontSize: 9,
          formatter: (v) => v > 0 ? '+' + v.toFixed(1) : v.toFixed(1) },
        splitLine: { show: true, lineStyle: { color: colors.line, opacity: 0.55 } },
      }),
      // 4: context — hidden 0..1 (ribbon rows)
      yAxisFor(4, { min: 0, max: 1, axisLabel: { show: false } }),
    ],
    series: [
      /* ===== STRIP 0: glucose ===== */
      {
        name: 'Glucose', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        showSymbol: true, symbolSize: 4, sampling: 'lttb', connectNulls: true,
        lineStyle: { width: 1.2, color: colors.inRange, opacity: 0.75 },
        data: cgmPoints, z: 5,
        markArea: { silent: true, itemStyle: { color: colors.inRange, opacity: 0.05 },
          data: [[{ yAxis: 70 }, { yAxis: 180 }]] },
        markLine: {
          symbol: 'none', silent: true,
          lineStyle: { type: 'dashed', color: colors.muted, opacity: 0.6 },
          label: { show: true, position: 'insideEndTop', color: colors.muted,
            fontSize: 10, formatter: '{c}' },
          data: [{ yAxis: 70 }, { yAxis: 180 }],
        },
      },
      // #381: the greyed sensor-artifact ghost over each flagged excursion (empty when none).
      ...fl.ghostSeries,

      /* ===== STRIP 1: model evidence — intentionally EMPTY here (overlay fills it) ===== */

      /* ===== STRIP 2: insulin + carbs =====
         No inline U/g labels (#385) — the dose-focus overlay reveals exact amounts
         on hover/focus. Focus enlarges each native glyph in place (emphasis.scale),
         so a selected mark reads without a competing overlay symbol. */
      { name: 'Bolus', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2, z: 6,
        emphasis: { scale: 1.35 }, data: bolusPoints },
      { name: 'Bolus carbs', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2,
        symbol: 'diamond', z: 5, emphasis: { scale: 1.35 }, data: bolusCarbPoints },
      { name: 'Carbs (logged)', type: 'scatter', xAxisIndex: 2, yAxisIndex: 2,
        symbol: 'circle', z: 7, emphasis: { scale: 1.35 }, data: manualCarbPoints },

      /* ===== STRIP 3: signed basal difference ===== */
      { name: 'Basal zero', type: 'line', xAxisIndex: 3, yAxisIndex: 3, data: [], silent: true, z: 1,
        markLine: { symbol: 'none', silent: true, label: { show: false },
          lineStyle: { color: colors.text, opacity: 0.4, width: 1 }, data: [{ yAxis: 0 }] } },
      { name: 'Basal difference', type: 'custom', xAxisIndex: 3, yAxisIndex: 3, z: 3,
        renderItem: (params, api) => {
          const v = api.value(2);
          const x0 = api.coord([api.value(0), 0]);
          const xv = api.coord([api.value(1), v]);
          const yZero = x0[1];
          const shape = echarts.graphic.clipRectByRect({
            x: x0[0] + 1, y: v >= 0 ? xv[1] : yZero,
            width: Math.max(1, xv[0] - x0[0] - 2),
            height: Math.max(1, Math.abs(yZero - xv[1])),
          }, params.coordSys);
          // Solid signed fill with a thin surface-color stroke; the +1/-2 x-inset
          // leaves a hairline gap so adjacent plateaus read as discrete commands.
          return shape && { type: 'rect', shape, style: {
            fill: v > 0 ? colors.primary : v < 0 ? colors.secondary : colors.line,
            stroke: colors.surface, lineWidth: 1,
            opacity: v === 0 ? 0.5 : 1 } };
        },
        encode: { x: [0, 1], y: 2 }, data: basalDiffData },

      /* ===== STRIP 4: context ===== */
      ribbon('Sleep', CTX.sleep, sleepRanges, colors.secondary, 0.24),
      ribbon('Fasting', CTX.fasting, fastingRanges, colors.basal, 0.34),
      ribbon('Exercise', CTX.exercise, exerciseRanges, colors.accent, 0.5),
      ribbon('Suspend', CTX.suspend, suspendRanges, colors.muted, 0.55),
      { name: 'Events', type: 'scatter', xAxisIndex: 4, yAxisIndex: 4, z: 6,
        symbol: 'pin', symbolSize: 16, data: eventPins },
    ],
    legend: { show: false }, // per-point color + custom glyphs -> HTML legend
  };
}

// Vertical fractions the focus hairline spans — glucose strip top to context
// strip bottom, kept in sync with the grid layout in buildLanesOption so the Day
// surface can draw one cross-track line without re-deriving the shell geometry.
export const LANE_SPAN = { top: 0.02, bottom: 0.97 };
