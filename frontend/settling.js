// #95 — per-parameter post-change "settling" state, pure/vue-free so it is
// node-testable with no DOM or importmap.
//
// A settling parameter changed recently and its post-change data hasn't cleared
// its analyzer's OWN sufficiency gate yet, so Review REPLACES its recommendation
// with the settling state (criteria + progress). All explanatory text is
// code-driven from the backend `describe_gate()` descriptor — the frontend
// authors NO model text. The countdown is shown in each parameter's native unit:
//   basal  → "N more clean days"      (ModelConfig.high_min_days)
//   I:C    → "N more meal runs"        (IcConfig.min_runs; a run is one closed
//            chain of meals, #518). This countdown speaks only to the WHOLE-DAY
//            gate — a block's own "N of 8 meal runs" is a different denominator,
//            and the two never share a line on screen.
//   ISF    → soft "collecting …" line, NO fabricated number (est. is a fasting
//            regression with no per-day breakdown; ADR 0001)
//
// The gating happens backend-side too: preview / steady-state mode nulls the
// epochs so `settling` comes back empty and the suppressed recommendations
// reappear — the preview toggle is the manual override.

// Index the result's `settling` list by parameter ("basal_rate" | "isf" |
// "carb_ratio"). Tolerates a missing/empty list.
export function settlingByParam(settling) {
  const map = {};
  for (const s of settling || []) map[s.parameter] = s;
  return map;
}

// The countdown line for a settling parameter, built entirely from its descriptor.
// Soft gate (ISF): a "collecting …" line with no number. Hard gate (basal/I:C):
// "N more <unit> (have of needed)".
export function settlingCountdown(s) {
  if (!s) return '';
  const g = s.gate || {};
  if (g.soft || g.needed == null || s.have == null) {
    const what = (g.criteria && g.criteria[0]) || 'data';
    return 'collecting ' + what + ' — no estimate yet';
  }
  const remaining = Math.max(0, g.needed - s.have);
  return remaining + ' more ' + g.unit + ' (' + s.have + ' of ' + g.needed + ')';
}
