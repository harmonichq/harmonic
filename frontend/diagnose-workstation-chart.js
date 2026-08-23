// Explore/Diagnose canvas for the "cockpit" shell mockup.
// Vue-free, importable without a build step. ECharts 5.5.0 is a global.
//
// Everything here derives from PHI-safe captures:
//   explore-day.capture.json       — 3 captured CGM days (envelope + meal glyphs)
//   explore-exposures.capture.json — 35 days of exposure occurrences + verdicts
//   settings-audit.capture.json    — real /analyze basal slot estimates (verdict lane)
// No numbers are invented. Where a value is pooled, the function says so and the
// UI hedges the copy accordingly.

export const BIN_MINUTES = 15;
export const BIN_COUNT = (24 * 60) / BIN_MINUTES; // 96

// Shared plot insets. The HTML verdict lane is pinned to these so its cells sit
// in register with the x-axis ticks.
// the right margin seats the value tags that ride the median / lowest-median
// levels, so it is wider than a plain plot inset would be
export const GRID = { left: 52, right: 52 };

function minuteOfDay(stamp) {
  const time = stamp.slice(11);
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

export const hhmm = (mins) => {
  const m = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

function percentile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Pool every CGM reading in `days` into time-of-day bins and take percentiles. */
export function buildEnvelope(days, { pool = 45 } = {}) {
  const buckets = Array.from({ length: BIN_COUNT }, () => []);
  const samples = [];
  const perDate = {};
  for (const day of Object.values(days)) {
    for (const reading of day.window.cgm) {
      if (reading.bg == null) continue;
      samples.push([minuteOfDay(reading.t), reading.bg]);
      const date = reading.t.slice(0, 10);
      perDate[date] = (perDate[date] || 0) + 1;
    }
  }
  for (const [minute, bg] of samples) {
    const home = Math.floor(minute / BIN_MINUTES);
    const span = Math.ceil(pool / BIN_MINUTES);
    for (let offset = -span; offset <= span; offset += 1) {
      const index = (home + offset + BIN_COUNT) % BIN_COUNT;
      const centre = index * BIN_MINUTES + BIN_MINUTES / 2;
      let delta = Math.abs(centre - minute);
      if (delta > 720) delta = 1440 - delta;
      if (delta <= pool) buckets[index].push(bg);
    }
  }
  // raw (un-pooled) readings per bin, so a window can report its OWN count
  const raw = Array.from({ length: BIN_COUNT }, () => 0);
  for (const [minute] of samples) raw[Math.floor(minute / BIN_MINUTES)] += 1;

  const labels = [];
  const p10 = []; const p25 = []; const p50 = []; const p75 = []; const p90 = [];
  const counts = [];
  for (let index = 0; index < BIN_COUNT; index += 1) {
    labels.push(hhmm(index * BIN_MINUTES));
    const sorted = buckets[index].slice().sort((a, b) => a - b);
    counts.push(sorted.length);
    p10.push(percentile(sorted, 0.10));
    p25.push(percentile(sorted, 0.25));
    p50.push(percentile(sorted, 0.50));
    p75.push(percentile(sorted, 0.75));
    p90.push(percentile(sorted, 0.90));
  }
  // only dates carrying a substantial trace count as a CGM day; the capture's
  // windows spill a few readings into the neighbouring dates
  const fullDays = Object.values(perDate).filter((c) => c >= 144).length;
  return { labels, p10, p25, p50, p75, p90, counts, raw, readings: samples.length, days: fullDays, pool };
}

/**
 * What the canvas reports for the selected window: the readouts that ride the
 * plot's right edge, and the band annotation. All of it re-derived per window —
 * nothing here is a whole-range constant.
 */
export function windowStats(envelope, [startMin, endMin]) {
  const a = Math.floor(startMin / BIN_MINUTES);
  const b = Math.min(Math.ceil(endMin / BIN_MINUTES), BIN_COUNT) - 1;
  const take = (arr) => arr.slice(a, b + 1).filter((v) => v != null);
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const med = take(envelope.p50);
  const p25 = envelope.p25.slice(a, b + 1);
  const p75 = envelope.p75.slice(a, b + 1);
  const spread = p75.map((hi, i) => (hi == null || p25[i] == null ? null : hi - p25[i]))
    .filter((v) => v != null);
  const lowestIndex = med.length
    ? envelope.p50.indexOf(Math.min(...med), a)
    : -1;
  return {
    a,
    b,
    median: avg(med),
    lowest: med.length ? Math.round(Math.min(...med)) : null,
    lowestIndex,
    spread: avg(spread),
    readings: envelope.raw.slice(a, b + 1).reduce((s, x) => s + x, 0),
  };
}

/* ---------------------------------------------------------------------------
   Drawn (custom) selection window.

   The clock axis is a 96-category axis with boundaryGap:false, so category i
   sits at left + (i / 95) * plotWidth and carries minute i * BIN_MINUTES. Every
   px<->minute conversion below goes through that one mapping, which is why the
   brace, its handles and the basal lane can share an optical spine.
--------------------------------------------------------------------------- */

/**
 * The finest window the pooled data supports. Each bin's sample is drawn from
 * +/-`pool` minutes, so two windows closer together than the pooling diameter
 * are reading the same readings — the grid refuses to draw one that narrow.
 */
export const minWindowMinutes = (pool) => Math.max(2 * BIN_MINUTES, 2 * pool);

/** Snap a minute to the pooling grid: nearest bin edge, clamped to the day. */
export function snapMinute(minute) {
  const snapped = Math.round(minute / BIN_MINUTES) * BIN_MINUTES;
  return Math.min(1440, Math.max(0, snapped));
}

/**
 * Snap a drawn window to the grid and widen it to the minimum the pooling
 * supports, pushing whichever edge keeps it inside the day.
 * `anchor` is the edge the user is NOT dragging, so a resize grows away from it.
 */
export function snapWindow([rawStart, rawEnd], pool, anchor = 'start') {
  let start = snapMinute(Math.min(rawStart, rawEnd));
  let end = snapMinute(Math.max(rawStart, rawEnd));
  const min = minWindowMinutes(pool);
  if (end - start < min) {
    if (anchor === 'end') start = end - min; else end = start + min;
  }
  if (start < 0) { start = 0; end = min; }
  if (end > 1440) { end = 1440; start = Math.max(0, 1440 - min); }
  return [start, end];
}

/** The plot body's px box inside `el`, in the element's own coordinate space. */
export function plotBox(el) {
  const width = el.clientWidth;
  return { left: GRID.left, right: width - GRID.right, width: width - GRID.left - GRID.right };
}

const CAT_MAX = BIN_COUNT - 1; // 95 — the last category, 23:45

/* The window label owns a reserved band at the top of the plot. The occurrence
   ticks sit BELOW it (they used to render at 292, inside the band, so a narrow
   window's label crossed the tick row). Both are y-axis values, max 300. */
const LABEL_Y = 296;
const OCCURRENCE_Y = 268;

/**
 * Rough px width of a label. There is no measuring context here (the label is
 * drawn by ECharts into a canvas), so this is the same per-character estimate
 * used for the inspector's fixed columns: good to a few px, which is all the
 * fit/no-fit decision needs.
 */
function estimateTextPx(text, fontSize, { caps = false, letterSpacing = 0 } = {}) {
  if (!text) return 0;
  return text.length * (fontSize * (caps ? 0.62 : 0.52) + letterSpacing);
}

/** px offset inside `el` for a clock minute. */
export function xAtMinute(el, minute) {
  const box = plotBox(el);
  const index = Math.min(CAT_MAX, Math.max(0, minute / BIN_MINUTES));
  return box.left + (index / CAT_MAX) * box.width;
}

/** The clock minute under a px offset inside `el` (unsnapped). */
export function minuteAtX(el, offsetX) {
  const box = plotBox(el);
  const ratio = (offsetX - box.left) / (box.width || 1);
  return Math.min(1440, Math.max(0, ratio * CAT_MAX * BIN_MINUTES));
}

/**
 * Does the pooled sample under a window clear the SAME floor the basal slots
 * use? A slot needs `MIN_SUPPORTED_NIGHTS` independent nights before it may
 * assert anything; a pooled bin's sample is the canvas analogue, so a window
 * whose thinnest bin falls under that floor reports itself insufficient rather
 * than printing a precise median off a handful of readings.
 */
export function windowSupport(envelope, [startMin, endMin]) {
  const a = Math.floor(startMin / BIN_MINUTES);
  const b = Math.min(Math.ceil(endMin / BIN_MINUTES), BIN_COUNT) - 1;
  const counts = envelope.counts.slice(a, Math.max(a, b) + 1);
  const thinnest = counts.length ? Math.min(...counts) : 0;
  return { thinnest, supported: thinnest >= MIN_SUPPORTED_NIGHTS };
}

/**
 * One captured day's REAL CGM trace, sampled onto the clock axis (the reading
 * nearest each bin centre). Returns nulls where the day has no reading, so a
 * sensor gap stays a gap. Never synthesised — callers pass a captured day or
 * nothing at all.
 */
export function buildDayTrace(day) {
  const best = Array.from({ length: BIN_COUNT }, () => null);
  const dist = Array.from({ length: BIN_COUNT }, () => Infinity);
  for (const reading of day.window.cgm) {
    if (reading.bg == null) continue;
    const minute = minuteOfDay(reading.t);
    const index = Math.min(BIN_COUNT - 1, Math.floor(minute / BIN_MINUTES));
    const delta = Math.abs((index * BIN_MINUTES + BIN_MINUTES / 2) - minute);
    if (delta < dist[index]) { dist[index] = delta; best[index] = reading.bg; }
  }
  return best;
}

/**
 * Meals per captured day that fills the meal track (term 25, resettled #649).
 * Full height = a meal in this half hour on half the captured days.
 */
export const GLYPH_FULL_HEIGHT_RATE = 0.5;

/** Meal-bolus glyphs, clustered into clock groups so the track reads as a habit. */
export function buildMealMarkers(days, { bucket = 30, minCarbs = 12 } = {}) {
  const groups = new Map();
  for (const day of Object.values(days)) {
    for (const bolus of day.window.boluses) {
      if (!bolus.carbs || bolus.carbs < minCarbs) continue;
      const key = Math.floor(minuteOfDay(bolus.t) / bucket) * bucket;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(bolus);
    }
  }
  return [...groups.entries()].map(([minute, list]) => ({
    minute,
    index: Math.round(minute / BIN_MINUTES) % BIN_COUNT,
    count: list.length,
    carbs: list.reduce((sum, b) => sum + (b.carbs || 0), 0),
    medianCarbs: Math.round(
      percentile(list.map((b) => b.carbs).sort((a, b) => a - b), 0.5),
    ),
    insulin: list.reduce((sum, b) => sum + (b.insulin || 0), 0),
  })).sort((a, b) => a.minute - b.minute);
}

/** Two-hour clock buckets for a factor's occurrences. Counts are the fixture's. */
export function clockBuckets(occurrences, { bucketHours = 2 } = {}) {
  const count = 24 / bucketHours;
  const buckets = Array.from({ length: count }, (_, i) => ({
    index: i, startMin: i * bucketHours * 60, endMin: (i + 1) * bucketHours * 60, n: 0,
  }));
  for (const occ of occurrences) {
    buckets[Math.floor(minuteOfDay(occ.t) / (bucketHours * 60))].n += 1;
  }
  const peak = buckets.reduce((best, b) => (b.n > best.n ? b : best), buckets[0]);
  return { buckets, peak, total: occurrences.length };
}

/* ======================= basal verdict lane ============================ */

/**
 * The support floor for asserting a basal direction: a slot needs at least this
 * many clean nights AND a CI that is not wide. This is the app's hardest-won
 * safety rule (issue #273, safety._MIN_SUPPORTED_NIGHTS).
 */
export const MIN_SUPPORTED_NIGHTS = 8;

/**
 * PORT DEVIATION from the mock (#654) — the load-bearing one.
 *
 * The mock re-applies the support floor here because ITS capture predates the
 * backend rule: settings-audit.capture.json carries `asserts_move: true` on
 * slots with n=1..7 and a wide CI, so the mock could not trust the flag. The
 * live API can be trusted, but not for the reason this comment used to give.
 * `safety._MIN_SUPPORTED_NIGHTS` (8) is enforced inside `_sign_tails`
 * (ciq_autotune/safety.py): a slot with fewer than eight informative nights
 * gets p=1 for BOTH tails, so no direction is ever supported below the floor
 * and `asserts_move` cannot come back true. It is NOT applied through
 * `cap(..., min_directional_days=…)` — that parameter defaults to
 * `_MIN_DIRECTIONAL_DAYS`, which is 3, `analyzers/basal.py` never overrides it,
 * and the only caller in the tree that passes it is a test. Lock term 14 says
 * the frontend re-derives no floor, no threshold and no direction for any
 * parameter.
 *
 * Porting the workaround faithfully would have re-opened #273/#465 from the one
 * direction nobody was guarding: a fixture-era hack carried across verbatim.
 * The predicate is now the backend's own flag plus the same presence check
 * `stageItemsFor` already makes.
 */
export function slotAssertsMove(slot) {
  return Boolean(slot.asserts_move) && slot.recommended != null;
}

/**
 * One lane cell per basal slot, from the real SlotEstimate rows in
 * settings-audit.capture.json (`analysis.basal[]`). A slot that fails the
 * support floor renders INSUFFICIENT — its number and interval still print, at
 * full contrast, in the inspector.
 */
export function buildSlotLane(basal) {
  const cells = basal.map((slot, i) => {
    const start = i * (1440 / basal.length);
    const asserts = slotAssertsMove(slot);
    let verdict;
    /* PORT DEVIATION (#654): the mock reads which way a change points by
       comparing recommended against current. The backend publishes the answer
       as `direction` ("raise" / "lower" — safety.SafetyStatus), so the lane
       reads it rather than doing dose arithmetic (term 14, and the rule the
       #636 guard test spells out). An asserting slot carrying no direction
       falls through to insufficient instead of being guessed at. */
    if (asserts && slot.direction === 'raise') verdict = 'up';
    else if (asserts && slot.direction === 'lower') verdict = 'down';
    else if (slot.safety_status === 'no data') verdict = 'nodata';
    else if (slot.safety_status === 'insufficient evidence' || slot.asserts_move) verdict = 'insufficient';
    else verdict = 'hold';
    return {
      i,
      verdict,
      asserts,
      slot,
      startMin: start,
      endMin: start + 1440 / basal.length,
      label: slot.label,
      delta: slot.recommended == null ? null : slot.recommended - slot.current,
    };
  });
  const counts = {};
  for (const c of cells) counts[c.verdict] = (counts[c.verdict] || 0) + 1;
  return { cells, counts, slotMinutes: 1440 / basal.length };
}

/** The lane cell whose clock span contains `minute`. */
export function cellAtMinute(lane, minute) {
  return lane.cells.find((c) => minute >= c.startMin && minute < c.endMin) || lane.cells[0];
}

/* ============================== canvas ================================= */

const gap = (v) => (v == null ? null : v);

/**
 * Resize an ECharts instance from a ResizeObserver without re-entering the
 * observer's own callback. The pane grid animates its tracks, so a naive
 * observer -> resize -> layout chain re-fires every frame and the browser
 * reports "ResizeObserver loop completed with undelivered notifications".
 */
export function observeResize(el, getChart) {
  let lastW = 0; let lastH = 0; let pending = 0;
  const observer = new ResizeObserver((entries) => {
    const box = entries[0].contentRect;
    const w = Math.round(box.width);
    const h = Math.round(box.height);
    if (w === lastW && h === lastH) return;
    lastW = w; lastH = h;
    if (pending) return;
    pending = requestAnimationFrame(() => {
      pending = 0;
      const chart = getChart();
      if (chart && w > 0 && h > 0) chart.resize({ width: w, height: h });
    });
  });
  observer.observe(el);
  return observer;
}

/**
 * Accept a history-event response only when both halves of the requested pair
 * name the same opaque history identity, analysis generation, and run selection.
 * This is coherence validation, not lifecycle or membership policy: every fact
 * compared here is a server-published field from the request/response contract.
 */
export function validateHistoryEvents(projection, {
  historyId, analysisGeneration, selectedRunId = null,
} = {}) {
  const coherent = projection?.schema === 'diagnose-carb-ratio-history-events-v1'
    && projection.history_id === historyId
    && projection.analysis_generation === analysisGeneration
    && (projection.selected_run_id ?? null) === (selectedRunId ?? null)
    && Array.isArray(projection.run_ids)
    && Array.isArray(projection.series)
    && projection.series.length === projection.run_ids.length
    && new Set(projection.run_ids).size === projection.run_ids.length
    && projection.run_ids.every((runId) => typeof runId === 'string' && runId.length > 0)
    && (selectedRunId == null || projection.run_ids.includes(selectedRunId))
    && projection.series.every((run, index) => run?.run_id === projection.run_ids[index]
      && typeof run.first_member_at === 'string' && Number.isFinite(Date.parse(run.first_member_at))
      && Array.isArray(run.points) && run.points.every((point) => Number.isFinite(point?.minute)
        && Number.isFinite(point?.bg))
      && Array.isArray(run.member_offsets_min)
      && run.member_offsets_min.every(Number.isFinite));
  if (!coherent) throw new Error('Server did not return one coherent history evidence pair.');
  return projection;
}

const historyRunLabel = (run) => new Date(run.first_member_at).toLocaleDateString(
  'en-US', { month: 'short', day: 'numeric' },
);
const HISTORY_MEAL_RAIL_BG = 44;

/** Purpose-built event projection for one retired I:C item. */
export function renderHistoryEvents(el, echarts, projection, colors) {
  const selected = projection.selected_run_id;
  el.dataset.historyId = projection.history_id;
  el.dataset.analysisGeneration = projection.analysis_generation;
  el.dataset.selectedRunId = selected || '';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `Past-setting glucose evidence for ${projection.series.length} meal runs.`);
  const chart = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: 'canvas' });
  const lines = projection.series.map((run) => {
    const active = !selected || run.run_id === selected;
    return {
      name: historyRunLabel(run), type: 'line', symbol: 'none', animation: false,
      data: run.points.map((point) => [point.minute, point.bg]),
      lineStyle: {
        color: colors.primary, width: selected && active ? 2.4 : 1.25,
        opacity: active ? 0.88 : 0.2,
      },
      itemStyle: { color: colors.primary },
      emphasis: { disabled: true },
    };
  });
  const meals = projection.series.flatMap((run) => run.member_offsets_min.map((minute, index) => {
    const nearest = run.points.filter((point) => point.bg != null).reduce((best, point) => (
      !best || Math.abs(point.minute - minute) < Math.abs(best.minute - minute) ? point : best
    ), null);
    return {
      // A run may have no CGM points. The marker still belongs to the server's
      // published meal membership, so place it on a quiet plot-floor rail
      // rather than dropping it or inventing a glucose reading.
      value: [minute, nearest?.bg ?? HISTORY_MEAL_RAIL_BG],
      runId: run.run_id,
      mealNumber: index + 1,
      itemStyle: {
        color: colors.meal,
        opacity: !selected || run.run_id === selected ? 1 : 0.2,
        borderColor: colors.rail,
        borderWidth: 1,
      },
    };
  }));
  chart.setOption({
    backgroundColor: 'transparent', animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: colors.muted },
    grid: { left: 52, right: 28, top: 30, bottom: 42 },
    legend: {
      show: true, top: 0, right: 28, selectedMode: false,
      textStyle: { color: colors.muted, fontSize: 10 },
      // The inspector is the complete member roster. Repeating every run here
      // turns a dense population into several rows of redundant chrome and
      // starves the plot, especially on the narrow layout.
      data: [{ name: 'Meals', icon: 'diamond' }],
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => `${Math.round(value)} mg/dL`,
    },
    xAxis: {
      type: 'value', min: 'dataMin', max: 'dataMax',
      name: 'minutes from first meal', nameLocation: 'middle', nameGap: 28,
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value', min: 40, max: 300, name: 'mg/dL',
      axisLabel: { color: colors.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    series: [...lines, {
      name: 'Meals', type: 'scatter', symbol: 'diamond', symbolSize: 8,
      data: meals, animation: false, emphasis: { disabled: true }, tooltip: { show: false }, z: 8,
    }],
  }, true);
  return chart;
}

function bandPair(name, base, span, stack, color, z) {
  return [
    {
      name: `__${stack}`, type: 'line', stack, z, data: base.map(gap), symbol: 'none',
      silent: true, lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 }, animation: false,
    },
    {
      name, type: 'line', stack, z: z + 1, data: span.map(gap), symbol: 'none',
      silent: true, lineStyle: { opacity: 0 }, areaStyle: { color, opacity: 1 }, animation: false,
      // the legend chip samples itemStyle, NOT areaStyle — without this the chip
      // falls back to the default ECharts palette and mislabels the band
      itemStyle: { color },
    },
  ];
}

const edgeLine = (name, data, color, z) => ({
  name, type: 'line', z, data: data.map(gap), symbol: 'none', silent: true,
  smooth: 0.25, animation: false,
  lineStyle: { color, width: 1, type: [3, 3], opacity: 0.9 },
});

/**
 * @param {object} opts { envelope, markers, colors, window:[startMin,endMin],
 *                        windowLabel, occurrences, selectedOcc }
 */
export function renderCanvas(el, echarts, opts) {
  const { envelope, markers, colors } = opts;
  const stats = opts.stats || null;
  const target = opts.target || [70, 180];
  const [winStart, winEnd] = opts.window || [0, 360];
  const startIndex = Math.round(winStart / BIN_MINUTES);
  const endIndex = Math.min(Math.round(winEnd / BIN_MINUTES), BIN_COUNT - 1);

  /* Same floor the basal slots use, applied to the window's pooled sample: below
     it the canvas prints NO precise median — it says so, in the window's own
     label, in the warn colour. Thinness is loud, not gray. */
  const support = windowSupport(envelope, [winStart, winEnd]);
  const thin = !support.supported;

  /* ---- window label: fit it to the window, or move it out ------------------
     A narrow window used to get a label far wider than itself, which crossed
     both dashed edges and ran into the tick row and the legend. The label now
     sheds its tails in priority order and, if even the bare head does not fit,
     moves outside to whichever side has more room — never straddling an edge.
     Nothing is lost: the spread and the count both also print in the chart
     header and the inspector. The exception is the insufficient-sample notice,
     which is a safety statement and rides with the head wherever it goes. */
  const labelHead = opts.windowLabel || 'SELECTED WINDOW';
  const labelNote = opts.windowNote || '';
  const tailKey = thin ? 'th' : 'sp';
  const tailText = thin
    ? `INSUFFICIENT SAMPLE — thinnest bin holds ${support.thinnest}`
    : (stats && stats.spread != null ? `25–75 spread ${stats.spread} mg/dL` : '');
  const labelBox = plotBox(el);
  const xStart = labelBox.left + (startIndex / CAT_MAX) * labelBox.width;
  const xEnd = labelBox.left + (endIndex / CAT_MAX) * labelBox.width;
  const winPx = Math.max(0, xEnd - xStart);
  const capOpts = { caps: true, letterSpacing: 0.5 };
  const headPx = estimateTextPx(labelHead, 10, capOpts);
  const notePx = labelNote ? estimateTextPx(` · ${labelNote}`, 10, capOpts) : 0;
  const tailPx = tailText ? estimateTextPx(`  ·  ${tailText}`, 9.5) : 0;
  const LABEL_PAD = 10;   // breathing room inside the dashed edges
  const withTail = (base) => `${base}{${tailKey}|  ·  ${tailText}}`;
  const headNote = `${labelHead}${labelNote ? ` · ${labelNote}` : ''}`;

  let labelText = labelHead;
  let labelInside = true;
  if (tailText && headPx + notePx + tailPx + LABEL_PAD <= winPx) {
    labelText = withTail(headNote);
  } else if (labelNote && headPx + notePx + LABEL_PAD <= winPx && !thin) {
    labelText = headNote;
  } else if (!thin && headPx + LABEL_PAD <= winPx) {
    labelText = labelHead;
  } else if (thin && headPx + tailPx + LABEL_PAD <= winPx) {
    labelText = withTail(labelHead);
  } else {
    labelInside = false;                       // out it goes, one line, one side
    labelText = thin ? withTail(labelHead) : labelHead;
  }
  // outside: whichever margin has more room, anchored so it cannot cross an edge
  const rightRoom = labelBox.left + labelBox.width - xEnd;
  const labelSide = rightRoom >= xStart - labelBox.left ? 'right' : 'left';
  const labelRich = {
    sp: { color: colors.muted, fontSize: 9.5, fontWeight: 500, letterSpacing: 0 },
    th: { color: colors.warn || colors.danger, fontSize: 9.5, fontWeight: 700, letterSpacing: 0 },
  };

  /* A captured day's real trace, when the caller has one. With it on the plot
     the pooled envelope recedes to context — it is a different thing (many days
     pooled) and must not compete with one real day's line. */
  const trace = opts.trace || null;
  const recede = (c, pct) => (trace ? `color-mix(in srgb, ${c} ${pct}%, transparent)` : c);

  const outer = envelope.p10.map((lo, i) => (lo == null ? null : envelope.p90[i] - lo));
  const inner = envelope.p25.map((lo, i) => (lo == null ? null : envelope.p75[i] - lo));

  // Hovering must show the tooltip and the axis pointer, nothing else. An axis
  // tooltip dispatches highlight/downplay across every series at that index, and
  // ECharts' default blur state fades the non-highlighted ones — which drops the
  // envelope fills out of the plot. Disabling emphasis and pinning the blur state
  // to full opacity keeps every band rendered while the pointer moves.
  const noHoverFade = (series) => series.map((s) => ({
    ...s,
    emphasis: { disabled: true, ...(s.emphasis || {}) },
    blur: {
      areaStyle: { opacity: 1 }, lineStyle: { opacity: s.lineStyle?.opacity ?? 1 },
      itemStyle: { opacity: 1 }, label: { show: false },
    },
  }));

  const chart = echarts.getInstanceByDom(el) || echarts.init(el, null, { renderer: 'canvas' });
  chart.setOption({
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: colors.muted },
    // two grids sharing the clock axis: the envelope, and a glyph track that
    // sits UNDER the x-axis so meal boluses never float on the median
    grid: [
      // P4: the top gutter was ~40px of dead air between the title row and the
      // plot ceiling. The label band needs ~18px; the rest goes to the plot.
      { left: GRID.left, right: GRID.right, top: 20, bottom: 56 },
      { left: GRID.left, right: GRID.right, height: 18, bottom: 26 },
    ],
    /* THE ONLY MARK KEY. The overlay chips are gone, so this legend carries the
       whole naming job — and it must not be mistakable for controls: silent and
       non-selectable (no hover state, no pointer cursor, nothing to click), no
       container, no border, no fill behind it.

       Every swatch replicates its mark 1:1, and the way to guarantee that is to
       NOT override `icon` on anything that can draw itself: a line series then
       renders its own stroke at its own width (Median's 2.4px, That day's
       1.6px), a scatter renders its real symbol and fill (the occurrence
       circle), and the meal track's bar renders the coral rect it actually
       draws (#649 — it was a diamond until term 25 was resettled, and the
       swatch followed the mark rather than being told about it). Only the two
       stacked area bands need an explicit rect, because their inherited glyph
       would be a line rather than a fill — and each is filled with the very
       expression its band uses. */
    legend: {
      show: true, top: 0, right: GRID.right, itemWidth: 12, itemHeight: 8, itemGap: 16,
      selectedMode: false, silent: true,
      textStyle: { color: colors.muted, fontSize: 10 },
      data: [
        { name: '10–90th', icon: 'rect', itemStyle: { color: recede(colors.bandOuter, 45), borderWidth: 0 } },
        { name: '25–75th', icon: 'rect', itemStyle: { color: recede(colors.bandInner, 45), borderWidth: 0 } },
        { name: 'Median' },
        { name: 'Meal boluses' },
        ...((opts.occurrences || []).length ? [{ name: 'Occurrences' }] : []),
        ...(trace ? [{ name: 'That day' }] : []),
      ],
    },
    /* DOCKED READOUT — there is no floating box anywhere. Hover draws a thin
       crosshair and nothing else; the numbers are reported through
       `opts.onHover` and the card renders them in its header row (.head-live in
       the shell). The plot is never covered, and the values always land in the
       one place the eye has already learned. */
    tooltip: {
      trigger: 'axis',
      showContent: false,
      axisPointer: {
        type: 'line',
        lineStyle: { color: colors.muted, width: 1, type: 'solid', opacity: 0.85 },
        label: { show: false },
      },
    },
    xAxis: [
      {
        type: 'category', data: envelope.labels, boundaryGap: false,
        axisLine: { lineStyle: { color: colors.line } },
        axisTick: { show: false },
        splitLine: {
          show: true,
          interval: (i, v) => v.endsWith(':00') && Number(v.slice(0, 2)) % 3 === 0,
          lineStyle: { color: colors.grid },
        },
        axisLabel: {
          color: colors.muted, fontSize: 10, margin: 8,
          interval: (i, v) => v.endsWith(':00') && Number(v.slice(0, 2)) % 3 === 0,
        },
      },
      {
        type: 'category', data: envelope.labels, boundaryGap: false, gridIndex: 1,
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false },
        splitLine: {
          show: true,
          interval: (i, v) => v.endsWith(':00') && Number(v.slice(0, 2)) % 3 === 0,
          lineStyle: { color: colors.grid },
        },
      },
    ],
    yAxis: [
      {
        type: 'value', min: 40, max: 300, interval: 60,
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: colors.muted, fontSize: 10, formatter: '{value}' },
        splitLine: { lineStyle: { color: colors.grid } },
        /* the caption sits ON the column's spine (the plot's left edge), so it
           stops being a fourth competing left edge in the top 60px */
        name: 'mg/dL', nameTextStyle: { color: colors.muted, fontSize: 10, align: 'left' },
        nameGap: 6, nameLocation: 'end',
      },
      { type: 'value', min: 0, max: 1, gridIndex: 1, show: false },
    ],
    series: noHoverFade([
      // target band + selected window, hung off a silent carrier
      {
        name: '__context', type: 'line', data: envelope.p50.map(() => null), silent: true, z: 0,
        markArea: {
          silent: true,
          data: [
            [
              {
                yAxis: target[0], itemStyle: { color: colors.targetFill },
                /* A label must never be struck by linework. Two things crossed
                   this one: the dashed 180 rule it was sitting on, and the
                   3-hourly vertical gridlines. It now clears the rule (distance
                   10 drops it into the band's own clear space) AND carries an
                   opaque pad in the panel's ground colour, so gridlines and
                   dashes visibly break behind the text. The ground token is
                   theme-aware, so this holds in light mode too. */
                label: {
                  show: true, position: 'insideStartTop', distance: 10,
                  color: colors.targetText, fontSize: 10, fontWeight: 600,
                  formatter: `TARGET ${target[0]}–${target[1]} mg/dL`,
                  backgroundColor: colors.rail, padding: [2, 5], borderRadius: 2,
                },
              },
              { yAxis: target[1] },
            ],
            [
              {
                xAxis: envelope.labels[startIndex],
                itemStyle: {
                  color: colors.windowFill, borderColor: colors.windowEdge,
                  borderWidth: 1, borderType: [4, 3],
                },
                /* The 25–75 spread rides the window label rather than the band.
                   Anchored in the band it collided with the p75 edge and the
                   median at narrow windows and short viewports, and its two
                   words broke across the band edge. Here it is one line, at the
                   top edge inside the highlight, where nothing else is drawn —
                   a rich-text tail so it stays subordinate to the window name. */
                label: {
                  show: labelInside, position: 'insideTop', distance: 5,
                  color: colors.windowEdge,
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                  formatter: labelText, rich: labelRich,
                },
              },
              { xAxis: envelope.labels[endIndex] },
            ],
          ],
        },
        // the label, when it did not fit inside: parked in the margin beside the
        // window, on the same band, clear of both dashed edges
        markPoint: labelInside ? undefined : {
          silent: true, symbol: 'circle', symbolSize: 0, z: 10,
          data: [{
            coord: [envelope.labels[labelSide === 'right' ? endIndex : startIndex], LABEL_Y],
            label: {
              show: true, position: labelSide, distance: 6,
              formatter: labelText, rich: labelRich,
              align: labelSide === 'right' ? 'left' : 'right',
              color: colors.windowEdge, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
            },
          }],
        },
        markLine: {
          silent: true, symbol: 'none', z: 4,
          lineStyle: { color: colors.targetEdge, type: [4, 4], width: 1 },
          /* the 70 and 180 numerals had the same defect — each sat directly on
             the dashed rule it labels — so they take the same knock-out pad */
          label: {
            show: true, position: 'start', formatter: '{c}',
            color: colors.targetText, fontSize: 10,
            backgroundColor: colors.rail, padding: [2, 4], borderRadius: 2,
          },
          data: [{ yAxis: target[0] }, { yAxis: target[1] }],
        },
      },
      ...bandPair('10–90th', envelope.p10, outer, 'outer', recede(colors.bandOuter, 45), 2),
      ...bandPair('25–75th', envelope.p25, inner, 'inner', recede(colors.bandInner, 45), 4),
      // hairline edges so the two bands read as two bands, not one gradient
      edgeLine('__p25', envelope.p25, recede(colors.bandEdge, 40), 6),
      edgeLine('__p75', envelope.p75, recede(colors.bandEdge, 40), 6),
      {
        name: 'Median', type: 'line', z: 8, data: envelope.p50.map(gap),
        symbol: 'none', smooth: 0.25, animation: false,
        lineStyle: { color: recede(colors.median, 40), width: trace ? 1.4 : 2.4, cap: 'round' },
        itemStyle: { color: colors.median }, // legend chip source
        // readouts ride their own geometry: a value tag at the plot's right
        // margin on the window's median level, and on its lowest-median level
        markLine: (stats && !thin) ? {
          silent: true, symbol: 'none', z: 9,
          data: [
            {
              yAxis: stats.median,
              lineStyle: { color: colors.median, width: 1, type: [2, 3], opacity: 0.55 },
              label: {
                show: true, position: 'end', distance: 3,
                formatter: `${stats.median}`, fontSize: 10.5, fontWeight: 700,
                color: colors.onAccent, backgroundColor: colors.median,
                padding: [2, 4], borderRadius: 3,
              },
            },
            {
              yAxis: stats.lowest,
              lineStyle: { color: colors.muted, width: 1, type: [2, 3], opacity: 0.4 },
              label: {
                show: true, position: 'end', distance: 3,
                formatter: `${stats.lowest}`, fontSize: 10.5, fontWeight: 600,
                color: colors.text, backgroundColor: colors.surface2,
                borderColor: colors.line, borderWidth: 1,
                padding: [2, 4], borderRadius: 3,
              },
            },
          ],
        } : undefined,
        // the spread no longer hangs off the band — see the window label above
      },
      // occurrence lane: one tick per occurrence of the drilled factor
      ...(trace ? [{
        name: 'That day', type: 'line', z: 10, data: trace.map((v) => (v == null ? '-' : v)),
        symbol: 'none', smooth: 0.2, connectNulls: false, animation: false,
        lineStyle: { color: colors.text, width: 1.6, cap: 'round' },
        itemStyle: { color: colors.text },
      }] : []),
      {
        /* Occurrence marks. They used to float as unlabelled ticks in a reserved
           strip at the top of the plot, which read as debris; each one now sits
           at its own recorded glucose value and is named in the legend.

           SELECT-IN-PLACE (P35 retired): a selected roster row draws its own
           mark bigger and outlined rather than moving the window (P21
           retired) or opening a level of its own — the emphasis is drawn,
           never a re-derived scope. */
        name: 'Occurrences', type: 'scatter', z: 11,
        data: (opts.occurrences || []).map((o) => {
          const selected = opts.selectedOcc && o.t === opts.selectedOcc.t && o.date === opts.selectedOcc.date;
          return {
            value: [
              Math.round(minuteOfDay(o.t) / BIN_MINUTES) % BIN_COUNT,
              o.bg != null ? o.bg : (o.worst_bg != null ? o.worst_bg : OCCURRENCE_Y),
            ],
            meta: o,
            symbolSize: selected ? 11 : 7,
            itemStyle: selected
              ? { color: colors.text, opacity: 1, borderColor: colors.occurrence, borderWidth: 2 }
              : undefined,
          };
        }),
        symbol: 'circle', symbolSize: 7,
        itemStyle: {
          color: colors.occurrence, opacity: 0.95,
          borderColor: colors.surface, borderWidth: 1,
        },

      },
      /* Meal track, in its own grid beneath the axis.

         RESETTLED 2026-08-10 (term 25, issue #649, operator's pick). It was a
         diamond whose SIZE ran 7-14px scaled to the busiest bucket in view, and
         that rule fails at both ends of the only dimension nobody had varied —
         how many days the capture holds:

           3 captured days   every bucket holds 1, so the busiest holds 1 and
                             EVERY glyph renders at full size
           30 captured days  38 of 48 buckets occupied, counts 1-10, still on a
                             7-14px ramp: neighbours stop separating and the
                             three real meal habits sit level with the overnight
                             rescue-carb scatter

         Height on an ABSOLUTE scale answers both. The column is meals per
         CAPTURED DAY, so a bucket keeps its height as the capture widens and
         one meal in three days reads as the habit it is while one meal in
         thirty does not. Length is also the channel the eye compares accurately
         at small sizes, which area never was.

         The ceiling is the one parameter: full height = a meal in this half
         hour on GLYPH_FULL_HEIGHT_RATE of days. At 0.5 the busiest bucket in a
         real 30-day capture (10 meals / 30 days) reaches two thirds of the
         track and nothing clamps.

         The series NAME is unchanged on purpose: the docked readout branches on
         it (behaviour story S19), so a glyph still reports its count and median
         carbs through the one channel under the new encoding. */
      {
        name: 'Meal boluses', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, z: 7,
        barWidth: 5,
        data: markers.map((m) => ({
          value: [m.index, Math.min(1, (m.count / envelope.days) / GLYPH_FULL_HEIGHT_RATE)],
          meta: m,
        })),
        itemStyle: { color: colors.meal },
      },
    ]),
  }, true);
  /* Feed the docked header readout. renderCanvas re-runs on every window change
     and getInstanceByDom hands back the SAME chart, so rebind rather than stack
     handlers — otherwise every redraw adds another reporter.

     The occurrence dot and the meal glyph report through this one channel too,
     so no floating box survives anywhere. An item hover latches: the axis
     pointer keeps firing as the cursor moves over a dot, and without the latch
     it would overwrite the dot's own reading on the very next mousemove. */
  chart.off('updateAxisPointer');
  chart.off('globalout');
  chart.off('mouseover');
  chart.off('mouseout');
  const report = opts.onHover;
  if (report) {
    const last = envelope.labels.length - 1;
    let overItem = null;
    chart.on('mouseover', (ev) => {
      const meta = ev.data && ev.data.meta;
      if (!meta) return;
      if (ev.seriesName === 'Occurrences') {
        const value = meta.bg != null ? meta.bg : meta.worst_bg;
        overItem = {
          kind: 'occurrence',
          label: meta.t.slice(11, 16),
          note: `${meta.cause_title || 'no cause attributed'}`
            + `${value != null ? ` · ${Math.round(value)} mg/dL` : ''} · ${meta.date}`,
        };
      } else if (ev.seriesName === 'Meal boluses') {
        overItem = {
          kind: 'meal',
          label: `${hhmm(meta.minute)}–${hhmm(meta.minute + 30)}`,
          note: `${meta.count} meal bolus${meta.count === 1 ? '' : 'es'} captured`
            + ` · median ${meta.medianCarbs} g carbs`,
        };
      } else { return; }
      report(overItem);
    });
    chart.on('mouseout', () => { overItem = null; });
    chart.on('updateAxisPointer', (ev) => {
      if (overItem) { report(overItem); return; }
      const axis = (ev.axesInfo || [])[0];
      if (!axis || axis.value == null) { report(null); return; }
      const i = Math.max(0, Math.min(last, Math.round(axis.value)));
      report({
        kind: 'bin',
        label: envelope.labels[i],
        p50: envelope.p50[i], p25: envelope.p25[i], p75: envelope.p75[i],
        p10: envelope.p10[i], p90: envelope.p90[i],
        n: envelope.counts[i], pool: envelope.pool,
      });
    });
    chart.on('globalout', () => { overItem = null; report(null); });
  }

  return chart;
}
