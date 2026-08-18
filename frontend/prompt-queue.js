/* =========================================================================
   #128 CARB-LOG PROMPT QUEUE — pure logic for the ribbon review overlay.

   Vue-free and DOM-free at import time (same seam discipline as
   scenario-chart.js / carb-log.js, the #100 harness) so `node --test` imports
   it with no importmap and no DOM. The Vue overlay in index.html is a thin
   shell over these: it owns the refs, the fetch calls, and the echarts.init
   handles; the ECharts option builders + the small date/label helpers — the
   parts worth testing — live here.

   The chart builders are lifted verbatim from the LOCKED visual spec
   (the archived prompt-queue ribbon mock, #128): the week ribbon (typed pins
   on one shared CGM trace) and the BIG ±2h pop-up sparkline. Both bind the real
   `GET /prompts` -> List[Prompt] shape { detector, anchor_t, key_bg, cgm[], ... }.

   answerToSource / prompt answers follow the #125 vocab: an answer is one of
   'carbs' | 'no' | 'not-sure'; a 'carbs' answer logs a CarbEntry whose source is
   rise-prompt (missed-meal) or low-prompt (low), pinned to the anchor.
   ========================================================================= */

const toISO = (t) => t.replace(' ', 'T');
const rangeColor = (bg, c) =>
  bg == null ? c.muted : bg > 180 ? c.high : bg < 70 ? c.low : c.inRange;

// A prompt's marker sits ON the trace at its anchor bg. missed-meal peaks are
// amber (manual-carb accent — the "did you eat?" question), lows are low-colored.
function markerColor(p, c) {
  return p.detector === 'missed-meal' ? c.manualCarb : c.low;
}

// --- pure helpers the Vue shell shares (node-tested) -------------------------

// The CarbEntry.source a 'carbs' answer is logged under, per detector (#125).
export function answerToSource(detector) {
  return detector === 'missed-meal' ? 'rise-prompt' : 'low-prompt';
}

// Human label for a stored answer value.
export function answerLabel(k) {
  if (k === 'carbs') return 'logged carbs';
  if (k === 'no') return 'no carbs';
  if (k === 'false-low') return 'not real (sensor artifact)';   // #381
  return 'not sure';
}

// The per-detector kicker + question framing (mirrors the LOCKED pop-up card).
export function detectorKicker(detector) {
  return detector === 'missed-meal' ? 'Rise with no bolus' : 'Low glucose';
}

// "Wed, Jun 24 3:15 PM" from a stored 'YYYY-MM-DD HH:MM:SS' anchor.
export function prettyAnchor(t) {
  const d = new Date(toISO(t));
  return (
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

// Oldest-first — the server already sorts this way, but the shell re-sorts after
// optimistic edits. Non-mutating.
export function sortOldestFirst(prompts) {
  return prompts.slice().sort((a, b) => (a.anchor_t < b.anchor_t ? -1 : 1));
}

// How many prompts are still open (unanswered) given the client-side answer map
// { [anchor_t]: 'carbs'|'no'|'not-sure' }.
export function openCount(prompts, answers = {}) {
  return prompts.filter((p) => !answers[p.anchor_t]).length;
}

// The span (in whole days) the pinned prompts cover — the drawer subheader line.
export function windowDays(prompts) {
  if (!prompts.length) return 0;
  const ts = prompts.map((p) => new Date(toISO(p.anchor_t)).getTime());
  return Math.max(1, Math.round((Math.max(...ts) - Math.min(...ts)) / 86400000));
}

/* ---- the week ribbon (the map) — verbatim from the LOCKED spec ------------- */
export function buildRibbonOption(prompts, colors, opts = {}) {
  const c = colors;
  const resolved = opts.resolved || {};       // { [anchor_t]: 'answer' } -> faded
  const openAnchor = opts.openAnchor || null; // anchor currently popped -> emphasized

  const allPts = [];
  for (const p of prompts) {
    for (const s of p.cgm) {
      if (s.bg == null) continue;
      allPts.push({ value: [toISO(s.t), s.bg], itemStyle: { color: rangeColor(s.bg, c) } });
    }
  }
  allPts.sort((a, b) => (a.value[0] < b.value[0] ? -1 : 1));
  const lineData = allPts.map((d) => d.value);

  const markerPts = prompts.map((p) => {
    const isResolved = !!resolved[p.anchor_t];
    const isOpen = openAnchor === p.anchor_t;
    const mc = markerColor(p, c);
    return {
      value: [toISO(p.anchor_t), p.key_bg],
      prompt: p,
      symbol: 'pin',
      symbolSize: isOpen ? 42 : 34,
      itemStyle: {
        color: isResolved ? c.surface : mc,
        borderColor: isResolved ? c.muted : mc,
        borderWidth: isResolved ? 1.5 : (isOpen ? 3 : 2),
        opacity: isResolved ? 0.55 : 1,
        shadowBlur: isOpen ? 14 : 0,
        shadowColor: mc,
      },
      label: {
        show: true,
        position: 'inside',
        offset: [0, -3],
        formatter: isResolved ? '✓' : '?',
        color: isResolved ? c.muted : c.onPrimary,
        fontSize: isOpen ? 17 : 14,
        fontWeight: 800,
      },
    };
  });

  return {
    backgroundColor: 'transparent',
    textStyle: { color: c.text, fontFamily: 'Inter, system-ui, sans-serif' },
    grid: { left: 46, right: 20, top: 22, bottom: 40 },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: c.line } },
      axisLabel: { color: c.muted, fontSize: 11, formatter: '{MMM} {d}' },
      splitLine: { show: true, lineStyle: { color: c.line, opacity: 0.5, type: 'dashed' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 40,
      max: 360,
      interval: 70,
      axisLabel: { color: c.muted, fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: c.line, opacity: 0.6 } },
    },
    series: [
      {
        name: 'trace', type: 'line', data: lineData, z: 2,
        symbol: 'none', smooth: false, connectNulls: false,
        lineStyle: { color: c.inRange, width: 1, opacity: 0.35 },
        markArea: {
          silent: true,
          itemStyle: { color: c.inRange, opacity: 0.06 },
          data: [[{ yAxis: 70 }, { yAxis: 180 }]],
        },
        markLine: {
          symbol: 'none', silent: true,
          lineStyle: { type: 'dashed', color: c.muted, opacity: 0.5 },
          label: { show: true, position: 'insideEndTop', color: c.muted, fontSize: 9, formatter: '{c}' },
          data: [{ yAxis: 70 }, { yAxis: 180 }],
        },
      },
      { name: 'cgm', type: 'scatter', data: allPts, symbolSize: 3.2, z: 4, silent: true },
      {
        name: 'prompts', type: 'scatter', data: markerPts, z: 8,
        emphasis: { scale: 1.12 },
        cursor: 'pointer',
      },
    ],
    tooltip: {
      trigger: 'item',
      backgroundColor: c.surface, borderColor: c.line, textStyle: { color: c.text },
      formatter: (p) => {
        if (!p.data || !p.data.prompt) return '';
        const q = p.data.prompt;
        return `<b>${q.context}</b><br>${q.anchor_t.slice(5, 16)} · ${q.age_days.toFixed(0)}d ago<br><i style="opacity:.8">click to review →</i>`;
      },
    },
  };
}

/* ---- the BIG, legible ±2h zoom — verbatim from the LOCKED spec ------------- */
export function buildSparklineOption(prompt, colors) {
  const isoT = (t) => t.replace(' ', 'T');
  const rc = (bg) =>
    bg == null ? colors.muted : bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange;

  const pts = (prompt.cgm || [])
    .filter((p) => p.bg != null)
    .slice()
    .sort((a, b) => (a.t < b.t ? -1 : 1));

  const anchorISO = isoT(prompt.anchor_t);
  const isLow = prompt.detector === 'low';

  const data = pts.map((p) => ({ value: [isoT(p.t), p.bg], itemStyle: { color: rc(p.bg) } }));

  if (pts.length) {
    let maxIdx = 0, minIdx = 0;
    pts.forEach((p, i) => {
      if (p.bg > pts[maxIdx].bg) maxIdx = i;
      if (p.bg < pts[minIdx].bg) minIdx = i;
    });
    const keyIdx = isLow ? minIdx : maxIdx;
    const label = (i, force) => {
      const bg = pts[i].bg;
      data[i].symbolSize = force ? 11 : 8;
      data[i].label = {
        show: true,
        position: bg > 180 ? 'top' : 'bottom',
        formatter: String(Math.round(bg)),
        fontSize: force ? 15 : 12,
        fontWeight: force ? 800 : 600,
        color: rc(bg),
      };
    };
    label(keyIdx, true);
    const otherIdx = isLow ? maxIdx : minIdx;
    if (otherIdx !== keyIdx) label(otherIdx, false);
  }

  const anchorColor = isLow ? colors.low : colors.high;

  return {
    backgroundColor: 'transparent',
    textStyle: { color: colors.text, fontFamily: 'Inter, system-ui, sans-serif' },
    animationDuration: 260,
    grid: { left: 14, right: 20, top: 30, bottom: 26 },
    xAxis: {
      type: 'time',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: colors.muted,
        fontSize: 11,
        hideOverlap: true,
        formatter: (v) => {
          const d = new Date(v);
          return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        },
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      min: (v) => Math.min(50, Math.floor((v.min - 12) / 10) * 10),
      max: (v) => Math.max(200, Math.ceil((v.max + 12) / 10) * 10),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    series: [
      {
        name: 'Glucose',
        type: 'line',
        data,
        smooth: 0.25,
        symbol: 'circle',
        symbolSize: 5,
        z: 5,
        showSymbol: true,
        lineStyle: { color: colors.inRange, width: 2, opacity: 0.55 },
        areaStyle: { color: colors.primary, opacity: 0.06 },
        markLine: {
          symbol: 'none',
          silent: true,
          data: [
            {
              yAxis: 70,
              lineStyle: { type: 'dashed', color: colors.low, opacity: 0.35, width: 1 },
              label: { show: true, position: 'insideEndTop', color: colors.low, fontSize: 10, opacity: 0.8, formatter: '70' },
            },
            {
              yAxis: 180,
              lineStyle: { type: 'dashed', color: colors.high, opacity: 0.35, width: 1 },
              label: { show: true, position: 'insideEndBottom', color: colors.high, fontSize: 10, opacity: 0.8, formatter: '180' },
            },
            {
              xAxis: anchorISO,
              lineStyle: { type: 'solid', color: anchorColor, opacity: 0.5, width: 1.5 },
              label: {
                show: true,
                position: 'insideStartTop',
                color: anchorColor,
                fontSize: 10,
                fontWeight: 700,
                formatter: isLow ? 'nadir' : 'rise',
              },
            },
          ],
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: colors.surface,
      borderColor: colors.line,
      textStyle: { color: colors.text },
      axisPointer: { type: 'line', lineStyle: { color: colors.muted, opacity: 0.4 } },
      formatter: (ps) => {
        const p = ps[0];
        if (!p) return '';
        const d = new Date(p.value[0]);
        const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return `<b>${Math.round(p.value[1])}</b> mg/dL<br>${hh}`;
      },
    },
  };
}
