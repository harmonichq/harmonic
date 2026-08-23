// model-view-log.js — logic for the #152 per-day model-view "event log" (variant A, r2).
// Pure/liftable: flatten→sort→humanize the /api/model-view payload into log rows, build the
// contextual daily chart option, and hold the detector reference (definitions + current
// criteria). No Vue here; the HTML wires it into a small Vue app.

/* ---------- number formatting (r2: kill float artifacts like 11.000001) ---------- */
export function fmtU(v) {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;          // 1 decimal
  return (Math.round(r) === r ? String(Math.round(r)) : r.toFixed(1));
}
export function fmtG(v) {
  if (v == null) return null;
  return String(Math.round(v));               // carbs are whole grams
}

/* ---------- vocab ---------- */
export const STATE_ORDER = ['near_miss', 'outranked', 'fired', 'no_data', 'clean'];
export const STATE_LABEL = {
  fired: 'Fired', outranked: 'Outranked', near_miss: 'Near-miss',
  clean: 'Clean', no_data: 'No data',
};
export const KIND_GLYPH = { meal: '◍', high: '△', low: '▽', correction: '↓', suspend: '❚❚' };
export const KIND_LABEL = { meal: 'Meal bolus', high: 'High', low: 'Low', correction: 'Correction', suspend: 'Suspend' };

export function humanize(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
// Classifier display names (a couple read better hand-tuned).
const CLS_NAME = {
  carb_undercount: 'Carb undercount', late_bolus: 'Late bolus',
  meal_over_delivery: 'Meal over-delivery', over_treated_low: 'Over-treated low',
  correction_on_iob: 'Correction on IOB',
  correction_stacking: 'Correction stacking', missed_meal: 'Missed meal',
};
export function clsName(c) { return CLS_NAME[c] || humanize(c); }

/* ---------- time helpers ---------- */
export function parseTs(s) { return new Date(s.replace(' ', 'T')); }
export function clock(s) {
  const d = parseTs(s);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ---------- flatten the day into chronological anchor rows ---------- */
// Each row is one anchor; carries its episode's lever + spans_midnight for context.
export function buildRows(day) {
  const rows = [];
  for (const ep of day.episodes) {
    for (const a of ep.anchors) {
      const verdicts = a.verdicts || [];
      // The headline verdict summarised on the collapsed row: the matched one if this
      // anchor fired/was outranked, else the most-specific silence (skip the boring
      // no_trigger / insufficient_data when a sharper reason exists).
      const matched = verdicts.find((v) => v.matched);
      const nearMiss = verdicts.find(
        (v) => v.silence_reason && v.silence_reason !== 'no_trigger' && v.silence_reason !== 'insufficient_data');
      const headline = matched || nearMiss || verdicts[0] || null;
      rows.push({
        t: a.t, kind: a.kind, bg: a.bg, insulin: a.insulin, carbs: a.carbs,
        state: a.state, verdicts, headline,
        lever: ep.lever, epId: ep.id, spansMidnight: ep.spans_midnight,
        // day-of the anchor (for the cross-day sub-label when the episode spans midnight)
        day: a.t.slice(0, 10),
      });
    }
  }
  rows.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
  return rows;
}

// The near-miss silence reason a near_miss row is bucketed under (for the count chips).
export function rowReason(row) {
  if (row.state !== 'near_miss') return null;
  const v = row.verdicts.find(
    (v) => v.silence_reason && v.silence_reason !== 'no_trigger' && v.silence_reason !== 'insufficient_data');
  return v ? v.silence_reason : (row.verdicts.find((v) => v.silence_reason) || {}).silence_reason || null;
}

/* ---------- contextual daily chart (forked from frontend/chart-builders.js buildLanesOption,
   trimmed to the glucose lane + state-colored anchor markers for this debug view) ---------- */
export function bgAt(day, t) {
  // Nearest CGM reading to an anchor time (meal/correction anchors carry bg=null).
  const target = parseTs(t).getTime();
  let best = null, bestD = Infinity;
  for (const p of day.window.cgm) {
    if (p.bg == null) continue;
    const dd = Math.abs(parseTs(p.t).getTime() - target);
    if (dd < bestD) { bestD = dd; best = p.bg; }
  }
  return best;
}

export function buildChartOption(day, rows, colors, focusT) {
  const toISO = (t) => t.replace(' ', 'T');
  const rangeColor = (bg) => bg == null ? colors.muted
    : bg > 180 ? colors.high : bg < 70 ? colors.low : colors.inRange;
  const stateColor = {
    fired: colors.primary, outranked: colors.warn, near_miss: colors.accent,
    clean: colors.muted, no_data: colors.notindata,
  };
  const cgm = day.window.cgm.filter((p) => p.bg != null)
    .map((p) => ({ value: [toISO(p.t), p.bg], itemStyle: { color: rangeColor(p.bg) } }));

  // One marker per anchor, at its time and the curve's value there, colored by state.
  // Near-miss markers are drawn largest/loudest so they pop on an otherwise-quiet day.
  // Every anchor renders (incl. a spanning episode's prior-day anchors) — the window is
  // extended back to cover them, so a midnight-crossing episode is shown, not clipped (r4).
  const markers = rows
    .map((r) => {
      const y = r.bg != null ? r.bg : bgAt(day, r.t);
      const focused = focusT && r.t === focusT;
      const big = r.state === 'near_miss' || r.state === 'fired';
      return {
        value: [toISO(r.t), y],
        symbolSize: focused ? 20 : (big ? 13 : 9),
        itemStyle: {
          color: stateColor[r.state] || colors.muted,
          borderColor: colors.surface, borderWidth: 2,
          shadowBlur: focused ? 10 : 0, shadowColor: stateColor[r.state],
        },
        _t: r.t,
      };
    });

  return {
    animation: false,
    grid: { left: 38, right: 12, top: 14, bottom: 22 },
    xAxis: {
      type: 'time', min: toISO(day.window.start), max: toISO(day.window.end),
      axisLabel: { color: colors.muted, fontSize: 10, formatter: '{HH}:{mm}' },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value', min: 40, max: 260, interval: 40,
      axisLabel: { color: colors.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: colors.line, type: 'dashed' } },
    },
    series: [
      { type: 'line', data: cgm, showSymbol: true, symbolSize: 3, smooth: false,
        lineStyle: { width: 1, color: colors.line }, z: 1,
        // Shade the prior-day lead-in (before this date's midnight) so the day-to-day
        // overlap reads as "yesterday", not part of today (r4).
        markArea: day.midnight ? {
          silent: true,
          itemStyle: { color: colors.muted, opacity: 0.06 },
          data: [[{ xAxis: toISO(day.window.start) }, { xAxis: toISO(day.midnight) }]],
        } : undefined,
        markLine: {
          silent: true, symbol: 'none',
          lineStyle: { color: colors.muted, type: 'dashed', width: 1, opacity: 0.5 },
          label: { color: colors.muted, fontSize: 9, formatter: '{c}' },
          data: [
            { yAxis: 180 }, { yAxis: 70 },
            // The calendar-day boundary this view is "about".
            ...(day.midnight ? [{
              xAxis: toISO(day.midnight),
              lineStyle: { color: colors.primary, type: 'solid', width: 1, opacity: 0.5 },
              label: { color: colors.muted, fontSize: 9, formatter: 'midnight', position: 'insideEndTop' },
            }] : []),
          ],
        } },
      { type: 'scatter', data: markers, z: 3, cursor: 'pointer' },
    ],
  };
}

/* ---------- detector reference: plain definition + CURRENT firing criteria (r2) ----------
   Criteria strings mirror the live constants in ciq_autotune/analyzers/classifiers/*.py and
   scenario/segment.py — kept beside them so the debug view states the bar it actually uses. */
export const DETECTOR_REFERENCE = [
  { id: 'carb_undercount', kind: 'meal',
    def: 'A meal ran away high — the excursion implies materially more carbs than were logged.',
    criteria: 'Peak ≥ 200 mg/dL within 180 min AND implied carbs ≥ 1.5× logged AND gap ≥ 30 g.' },
  { id: 'late_bolus', kind: 'meal',
    def: 'The dose chased a rise already underway instead of leading it.',
    criteria: 'BG rising ≥ 1.0 mg/dL/min over the 20 min before the bolus. Suppressed if a carb bolus in the prior 60 min owns the rise, or start BG ≥ 250 mg/dL.' },
  { id: 'meal_over_delivery', kind: 'meal',
    def: 'The meal dose crashed/suspended into a near-low afterward.',
    criteria: 'Control-IQ suspend ≥ 10 min after the meal AND BG reaches ≤ 75 mg/dL within 45 min of it.' },
  { id: 'over_treated_low', kind: 'low',
    def: 'A low was rescued past range into a rebound high (likely fast carbs).',
    criteria: 'Guarded post-nadir rebound peak ≥ 160 mg/dL (sub-70 nadir) or ≥ 180 mg/dL (near-low), before recovery/re-dip. Bar raised by residual-IOB credit.' },
  { id: 'correction_on_iob', kind: 'low',
    def: 'A lone user correction dropped onto live insulin drove a low that leaks today.',
    criteria: 'User correction ≥ 1.0 U landed with ≥ 0.5 U IOB still on board and BG not high/rising, then a sub-70 low followed.' },
  { id: 'correction_stacking', kind: 'correction',
    def: 'Two corrections stacked (not chasing a runaway) drove a later low.',
    criteria: 'Second correction within 60 min onto ≥ 0.5 U IOB, BG < 180 mg/dL and not rising, then a low ≤ 70 mg/dL within 240 min.' },
  { id: 'missed_meal', kind: 'high',
    def: 'A meal-shaped rise with no bolus behind it (an unannounced/forgotten meal).',
    criteria: 'Rise ≥ 1.0 mg/dL/min with no bolus in the 150-min digestion lookback before onset.' },
];

// Silence reasons — why a detector stayed quiet (closed taxonomy, evidence.py / ADR 0009).
export const REASON_REFERENCE = [
  { id: 'no_trigger', tier: 'observed', def: 'The behavior plainly did not happen — a genuinely clean opportunity.' },
  { id: 'under_threshold', tier: 'observed', def: 'It happened but fell short of the firing bar — the near-miss where a mis-tuned threshold hides.' },
  { id: 'upstream_cause', tier: 'inferred', def: 'An observable recent low (≤ 70 mg/dL within 90 min) and/or defensive suspend explains the move — a recovery, not the behavior.' },
  { id: 'prior_high_baseline', tier: 'observed', def: 'The rise was from an already-high start, not from flat.' },
  { id: 'owned_by_prior_bolus', tier: 'inferred', def: 'A completed carb bolus in the prior 60 min already owns the rise this dose landed on.' },
  { id: 'horizon_expired', tier: 'observed', def: "The outcome never arrived inside the classifier's window." },
  { id: 'insufficient_data', tier: 'not_in_data', def: 'The window was too sparse — or settings were missing — to judge.' },
];

export const REASON_DEF = Object.fromEntries(REASON_REFERENCE.map((r) => [r.id, r.def]));
export const DETECTOR_DEF = Object.fromEntries(DETECTOR_REFERENCE.map((d) => [d.id, `${d.def} — ${d.criteria}`]));

/* ---------- cross-link helpers (lifted from the mockup's model-view-refrail.js) ----------
   The rail concept's glue: which classifiers a log row references, so a rail
   detector/reason click can filter the log and a log token can highlight the rail. */

// Every classifier a row's verdicts touch (matched or silenced).
export function rowClassifiers(row) {
  return [...new Set((row.verdicts || []).map((v) => v.classifier).filter(Boolean))];
}

// Does this row touch the given detector id?
export function rowTouchesDetector(row, id) {
  return rowClassifiers(row).includes(id);
}

// Does this row sit under the given silence reason? (near-miss bucket + any verdict
// carrying that reason, so a rail reason-click catches every anchor it explains.)
export function rowTouchesReason(row, id) {
  if (rowReason(row) === id) return true;
  return (row.verdicts || []).some((v) => v.silence_reason === id);
}

/* ---------- chart-marker → log-row link (#217) ----------
   The Model view chart's anchor markers carry `_t` (the anchor time). Clicking a
   marker routes back to its log row: this finds the row for a marker's `_t`, and
   `rowDomId` derives the stable per-row DOM id the click scrolls to. Both are pure
   so the routing is node-tested; the DOM scroll/flash wiring stays in the Vue app. */

// The log row a chart marker's `_t` maps to (first match — one marker per row).
export function rowForT(rows, t) {
  return (rows || []).find((r) => r.t === t) || null;
}

// Stable DOM id for a log row, keyed the same way the v-for :key is (epId + t).
export function rowDomId(row) {
  return row ? 'mv-row-' + row.epId + row.t : null;
}
