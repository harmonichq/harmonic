// day-chart.js — pure render/logic core for the Day surface (#248, ADR 0027).
// The Day forensics tab: a fixed daily glucose chart on the LEFT, a scrollable,
// chronological EPISODE LOG on the RIGHT (Model view's reasoning folded in as
// tier-2 inline disclosure, ADR 0024). Lifted from the LOCKED mockup
// (the archived Day-reasoning-rail mock, #248, ADR 0027). No Vue, no DOM —
// pure over its arguments, so Node's built-in runner covers it (see CLAUDE.md
// "Frontend tests"). The navigator's severity/sparkline logic lives in nav-chart.js.

/* ================= number formatting (kill 11.000001 float artifacts) ================= */
export function fmtU(v) {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;
  return (Math.round(r) === r ? String(Math.round(r)) : r.toFixed(1));
}
export function fmtG(v) { return v == null ? null : String(Math.round(v)); }

/* ================= vocab (lifted verbatim from model-view-log.js) ================= */
export const KIND_GLYPH = { meal: '◍', high: '△', low: '▽', correction: '↓', suspend: '❚❚' };
export const KIND_LABEL = { meal: 'Meal bolus', high: 'High', low: 'Low', correction: 'Correction', suspend: 'Suspend' };

export function humanize(s) {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
const CLS_NAME = {
  carb_undercount: 'Carb undercount', late_bolus: 'Late bolus',
  meal_over_delivery: 'Meal over-delivery', over_treated_low: 'Over-treated low',
  correction_on_iob: 'Correction on IOB',
  correction_stacking: 'Correction stacking', missed_meal: 'Missed meal',
};
export function clsName(c) { return CLS_NAME[c] || humanize(c); }

/* ================= time helpers ================= */
export function parseTs(s) { return new Date(s.replace(' ', 'T')); }
export function clock(s) {
  return parseTs(s).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}
// Epoch ms for the shared time axis. buildAnchorOverlay is composed onto
// chart-builders.buildLanesOption, which feeds every series ms, so the overlay
// must too — one value type on the axis, and convertToPixel (focusUpdate below)
// gets the number the time axis natively uses rather than an ISO string.
const toMs = (t) => new Date(String(t).replace(' ', 'T')).getTime();

/* ================= flatten day → chronological anchor rows (the Episode Log) =================
   One row per anchor, time-sorted; it carries its episode's lever + headline verdict (the
   matched one, else the sharpest near-miss, else the first). Episode-only display context is
   deliberately kept out of these anchor rows; buildEpisodeLedger owns that boundary. */
export function buildRows(day) {
  const rows = [];
  for (const ep of day.episodes) {
    for (const a of ep.anchors) {
      const verdicts = a.verdicts || [];
      const matched = verdicts.find((v) => v.matched);
      const nearMiss = verdicts.find(
        (v) => v.silence_reason && v.silence_reason !== 'no_trigger' && v.silence_reason !== 'insufficient_data');
      const headline = matched || nearMiss || verdicts[0] || null;
      rows.push({
        t: a.t, kind: a.kind, bg: a.bg, insulin: a.insulin, carbs: a.carbs,
        state: a.state, verdicts, headline,
        lever: ep.lever, epId: ep.id,
        day: a.t.slice(0, 10),
      });
    }
  }
  rows.sort((x, y) => (x.t < y.t ? -1 : x.t > y.t ? 1 : 0));
  return rows;
}

/* ================= Episode Log ledger =================
   The interface is a three-band view of the day. It keeps disclosure policy out of Vue:
   findings lead, actionable near-misses are also checked, and silent anchors become one quiet
   stretch. An episode's midnight marker is emitted once with its first visible ledger entry,
   never copied onto every anchor. */
const QUIET_SILENCE_REASONS = new Set(['no_trigger', 'insufficient_data', 'upstream_cause']);

export function loadBearingVerdicts(row) {
  return (row.verdicts || []).filter((v) => v.matched ||
    (v.silence_reason && !QUIET_SILENCE_REASONS.has(v.silence_reason)));
}

export function isQuietLedgerRow(row) {
  if (row.state === 'clean' || row.state === 'no_data') return true;
  if (row.state !== 'near_miss') return false;
  return row.headline?.silence_reason === 'upstream_cause' || !loadBearingVerdicts(row).length;
}

// The Episode-Log band an anchor row belongs to — the same three-way split
// buildEpisodeLedger draws (findings lead · actionable near-misses are also
// checked · everything else is quiet), named so the mobile hero (day-hero-chart.js)
// can key its ring prominence off the ledger band instead of a bare `state` check.
// One source of truth: it reads isQuietLedgerRow, exactly as the ledger does.
export function rowBand(row) {
  if (row.state === 'fired' || row.state === 'outranked') return 'finding';
  if (row.state === 'near_miss' && !isQuietLedgerRow(row)) return 'alsoChecked';
  return 'quiet';
}

function ledgerEntries(rows, episodeById, markedEpisodes) {
  return rows.map((row) => {
    const ep = episodeById.get(row.epId);
    const firstVisibleAnchor = ep?.spans_midnight && !markedEpisodes.has(row.epId);
    if (firstVisibleAnchor) markedEpisodes.add(row.epId);
    return {
      type: 'anchor', row,
      episode: firstVisibleAnchor ? { id: ep.id, start: ep.start, end: ep.end, lever: ep.lever, spansMidnight: true } : null,
    };
  });
}

export function buildEpisodeLedger(day, { selectedLever = null, focusT = null } = {}) {
  const allRows = buildRows(day);
  // A focused anchor is never filtered away: a Diagnose deep-link must still open a clean row.
  const rows = allRows.filter((row) => !selectedLever || row.lever === selectedLever || row.t === focusT);
  const episodeById = new Map((day.episodes || []).map((ep) => [ep.id, ep]));
  const findings = rows.filter((row) => row.state === 'fired' || row.state === 'outranked');
  const alsoChecked = rows.filter((row) => row.state === 'near_miss' && !isQuietLedgerRow(row));
  const quietRows = rows.filter((row) => isQuietLedgerRow(row));
  const markedEpisodes = new Set();
  const quietCounts = {
    clean: quietRows.filter((row) => row.state === 'clean').length,
    noData: quietRows.filter((row) => row.state === 'no_data').length,
    explained: quietRows.filter((row) => row.state === 'near_miss').length,
  };

  return {
    findings: ledgerEntries(findings, episodeById, markedEpisodes),
    alsoChecked: ledgerEntries(alsoChecked, episodeById, markedEpisodes),
    quiet: {
      rows: ledgerEntries(quietRows, episodeById, markedEpisodes),
      start: quietRows[0]?.t || null,
      end: quietRows[quietRows.length - 1]?.t || null,
      ...quietCounts,
    },
    total: rows.length,
    fired: findings.filter((row) => row.state === 'fired').length,
  };
}

// The near-miss silence reason a near_miss row is bucketed under.
export function rowReason(row) {
  if (row.state !== 'near_miss') return null;
  const v = row.verdicts.find(
    (v) => v.silence_reason && v.silence_reason !== 'no_trigger' && v.silence_reason !== 'insufficient_data');
  return v ? v.silence_reason : (row.verdicts.find((v) => v.silence_reason) || {}).silence_reason || null;
}

// The log row a chart marker's `_t` maps to (first match — one marker per row).
export function rowForT(rows, t) { return (rows || []).find((r) => r.t === t) || null; }
// Stable per-row DOM id, keyed the same way the v-for :key is (epId + t).
export function rowDomId(row) { return row ? 'day-row-' + row.epId + row.t : null; }

/* ================= nearest-CGM lookup (anchors carry bg=null for meals) ================= */
export function bgAt(day, t) {
  const target = parseTs(t).getTime();
  let best = null, bestD = Infinity;
  for (const p of day.window.cgm) {
    if (p.bg == null) continue;
    const dd = Math.abs(parseTs(p.t).getTime() - target);
    if (dd < bestD) { bestD = dd; best = p.bg; }
  }
  return best;
}

/* ================= pre-empted-low derivation =================
   A low/suspend anchor is "pre-empted" (arrested by rescue carbs before it went deep) when
   its episode lever is over_treated_low OR a carb_exclusion_span sits within ±45 min of it.
   Returns a Set of anchor times so both chart + log agree (ADR 0012/0027). */
export function preemptedTimes(day) {
  const spans = ((day.window && day.window.carb_exclusion_spans) || []).map((s) => ({
    start: parseTs(s.start || s.t).getTime(),
    end: parseTs(s.end || s.t).getTime(),
  }));
  const near = (t) => {
    const ms = parseTs(t).getTime();
    return spans.some((s) => ms >= s.start - 45 * 6e4 && ms <= s.end + 45 * 6e4);
  };
  const out = new Set();
  for (const ep of day.episodes) {
    for (const a of ep.anchors) {
      if (a.kind !== 'low' && a.kind !== 'suspend') continue;
      if (ep.lever === 'over_treated_low' || near(a.t)) out.add(a.t);
    }
  }
  return out;
}

/* ================= day-at-a-glance stats for the chart header ================= */
export function dayStats(day) {
  const bgs = day.window.cgm.filter((p) => p.bg != null && p.t.slice(0, 10) === day.date).map((p) => p.bg);
  if (!bgs.length) return { tir: null, low: 0, high: 0, n: 0 };
  const inr = bgs.filter((b) => b >= 70 && b <= 180).length;
  // distinct excursions (runs), not every 5-min tick
  let below = false, lowRuns = 0, aboveH = false, highRuns = 0;
  for (const b of bgs) {
    if (b < 70) { if (!below) { lowRuns++; below = true; } } else below = false;
    if (b > 180) { if (!aboveH) { highRuns++; aboveH = true; } } else aboveH = false;
  }
  return {
    tir: Math.round((inr / bgs.length) * 100), low: lowRuns, high: highRuns, n: bgs.length,
    min: Math.round(Math.min(...bgs)), max: Math.round(Math.max(...bgs)),
  };
}

/* ================= reasoning overlay for the rich daily chart (#276) =================
   The Day surface renders the five-strip daily chart (chart-builders.buildLanesOption —
   glucose · EVIDENCE (empty) · insulin+carbs · signed basal difference · context), then folds
   the Model-view reasoning into the dedicated EVIDENCE strip (xAxisIndex/yAxisIndex 1) as these
   overlay series: one QUIET OUTLINED marker per anchor at rest (state color as a ring, hollow
   fill), enlarged + accent-ringed when its moment is focused; plus a per-low "⤴" pre-empted
   mark. Markers carry `_t`/`_epId` for the chart↔Episode-Log link. There is NO persistent
   full-height evidence line — the single cross-track hairline is drawn by the host from
   evidenceFocusGraphic only while a moment (or its log row) is hovered/keyboard-focused.
   `mvDay` is the /model-view payload; `focusT` the spotlighted anchor time; `preempted` the Set
   from preemptedTimes. `selectedLever` (#272) dims anchors NOT on that lever so the lever's own
   markers read as isolated. Returns ECharts series to append to the lanes option. */
// The one state→hue map both the anchor rings and the focus hairline read from,
// so a moment's ring color and its cross-track line always agree.
export function anchorStateColor(state, colors) {
  return ({
    fired: colors.primary, outranked: colors.warn, near_miss: colors.accent,
    clean: colors.muted, no_data: colors.notindata,
  }[state]) || colors.muted;
}

export function buildAnchorOverlay(mvDay, rows, colors, focusT, preempted, selectedLever) {
  // Anchors sit on their own strip now, so their y is a fixed row (0..1), not the
  // glucose value. Stagger by parity so a busy day's dots don't stack exactly.
  const yRow = (i) => (i % 2 ? 0.64 : 0.36);

  const markers = rows.map((r, i) => {
    const focused = focusT && r.t === focusT;
    const onLever = !selectedLever || r.lever === selectedLever;
    const big = r.state === 'near_miss' || r.state === 'fired';
    const hue = anchorStateColor(r.state, colors);
    return {
      value: [toMs(r.t), yRow(i)],
      symbolSize: focused ? 15 : (big ? 10 : 8),
      itemStyle: {
        // Quiet at rest: hollow (surface fill) with a state-colored ring; the
        // focused moment fills solid + gains an accent ring so it reads as picked.
        color: focused ? hue : colors.surface,
        borderColor: focused ? colors.accent : hue,
        borderWidth: focused ? 2.5 : 2,
        opacity: onLever ? 1 : 0.18,
        shadowBlur: focused ? 10 : 0, shadowColor: focused ? colors.accent : hue,
      },
      _t: r.t, _epId: r.epId,
    };
  });

  // per-low pre-empted ("rescued") mark: a compact ⤴ glyph beneath the anchor. The
  // word lives in the legend + every log row.
  const rescueTags = (rows || []).map((r, i) => ({ r, i }))
    .filter(({ r }) => preempted && preempted.has(r.t)).map(({ r, i }) => ({
      value: [toMs(r.t), yRow(i)],
      label: { show: true, position: 'bottom', distance: 6, formatter: '⤴',
        fontSize: 12, fontWeight: 700, color: colors.manualCarb },
    }));

  // Stable ids so a focus change can MERGE just these two series (by id) back into
  // the live chart — never a full notMerge rebuild, which would blank the shared
  // time tooltip (#276 review).
  return [
    // rescue "⤴" marks (beneath the state markers), evidence strip
    { id: 'day-anchor-rescue', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: rescueTags, z: 8, silent: true, symbolSize: 1 },
    // state-colored anchor markers (clickable → log row / hoverable → hairline)
    { id: 'day-anchor-markers', name: 'Anchors', type: 'scatter', xAxisIndex: 1, yAxisIndex: 1, data: markers, z: 9, cursor: 'pointer' },
  ];
}

/* ================= single cross-track focus hairline (#276) =================
   The ONLY cross-track evidence mark. Given the focused moment's pixel x and the
   strip stack's top/bottom pixels (host resolves both from the live chart), returns
   the ECharts `graphic` array — exactly one vertical line, or an empty array when
   nothing is focused. Pure so a node test can prove "focus ⇒ exactly 1, blur ⇒ 0"
   without an ECharts instance. The host sets it via replaceMerge:['graphic']. */
export function evidenceFocusGraphic(x, top, bottom, color) {
  if (x == null || !Number.isFinite(x) || !Number.isFinite(top) || !Number.isFinite(bottom)) return [];
  return [{
    id: 'evidence-crosshair', type: 'line', silent: true, z: 100,
    shape: { x1: x, y1: top, x2: x, y2: bottom },
    style: { stroke: color, lineWidth: 1, opacity: 0.92 },
  }];
}

/* ================= the focus interaction, end to end (#276) =================
   Everything a hover/keyboard-focus (or blur) must apply to the live chart, resolved
   as ONE mergeable payload: the refreshed anchor overlay (so the focused ring enlarges)
   plus the single cross-track hairline positioned from the live chart's own pixel
   geometry. `chart` need only answer `convertToPixel` (evidence-strip x for the focused
   time) and `getHeight` (to span the strip stack via `laneSpan`) — so the host MERGES this
   by series id + replaces only the `graphic`, never a notMerge rebuild that would blank the
   shared tooltip. Pure over its inputs: a node test drives the whole focus path (Vue state →
   pixel conversion → graphic) with a fake chart, no ECharts/DOM. `focusT` null ⇒ zero
   hairline. Returns `{ series, graphic }`. */
export function focusUpdate(chart, { day, rows, colors, focusT, preempted, selectedLever, laneSpan }) {
  const series = buildAnchorOverlay(day, rows, colors, focusT, preempted, selectedLever);
  let graphic = [];
  if (focusT) {
    const x = chart.convertToPixel({ xAxisIndex: 1 }, toMs(focusT));
    const h = chart.getHeight();
    const row = rowForT(rows, focusT);
    const hue = row ? anchorStateColor(row.state, colors) : colors.accent;
    graphic = evidenceFocusGraphic(x, h * laneSpan.top, h * laneSpan.bottom, hue);
  }
  return { series, graphic };
}

/* ================= detector + silence-reason reference (tier-2 meaning) =================
   Criteria strings mirror the live constants in ciq_autotune/analyzers/classifiers/*.py.
   Kept in sync with frontend/model-view-log.js. */
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

export const REASON_REFERENCE = [
  { id: 'no_trigger', tier: 'observed', def: 'The behavior plainly did not happen — a genuinely clean opportunity.' },
  { id: 'under_threshold', tier: 'observed', def: 'It happened but fell short of the firing bar — the near-miss where a mis-tuned threshold hides.' },
  { id: 'upstream_cause', tier: 'inferred', def: 'An observable recent low (≤ 70 mg/dL within 90 min) and/or defensive suspend explains the move — a recovery, not the behavior.' },
  { id: 'prior_high_baseline', tier: 'observed', def: 'The rise was from an already-high start, not from flat.' },
  { id: 'owned_by_prior_bolus', tier: 'inferred', def: 'A completed carb bolus in the prior 60 min already owns the rise this dose landed on.' },
  { id: 'horizon_expired', tier: 'observed', def: "The outcome never arrived inside the classifier's window." },
  { id: 'insufficient_data', tier: 'not_in_data', def: 'The window was too sparse — or settings were missing — to judge.' },
];

// String-valued lookups (def [— criteria]) so the log body can print the meaning inline.
export const DETECTOR_DEF = Object.fromEntries(DETECTOR_REFERENCE.map((d) => [d.id, `${d.def} — ${d.criteria}`]));
export const REASON_DEF = Object.fromEntries(REASON_REFERENCE.map((r) => [r.id, r.def]));
