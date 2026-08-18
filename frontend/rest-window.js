/* =========================================================================
   #202 REST-WINDOW DISPLAY HELPERS — pure, vue-free, node-testable.

   subtractIntervals: given a clipped rest-window band and an array of
   carb-exclusion spans, return the non-excluded slices of the band so the
   frontend can render gaps around rescue carbs without re-implementing COB
   decay in JS (the backend already computed the spans via carb_log_exclusion_spans).
   ========================================================================= */

/**
 * Subtract exclusion spans from a single window, returning the remaining slices.
 *
 * @param {string} winStart  - ISO-like start string ("2026-06-11 02:00:00")
 * @param {string} winEnd    - ISO-like end string
 * @param {Array<{start:string,end:string}>} exclusions - sorted exclusion spans
 * @returns {Array<{start:string,end:string}>}
 */
export function subtractIntervals(winStart, winEnd, exclusions) {
  if (!exclusions || exclusions.length === 0) {
    return [{ start: winStart, end: winEnd }];
  }
  const slices = [];
  let cursor = winStart;
  for (const excl of exclusions) {
    if (excl.end <= cursor) continue;        // exclusion already behind cursor
    if (excl.start >= winEnd) break;          // exclusion past window end
    const lo = excl.start > cursor ? excl.start : cursor;
    if (cursor < lo) {
      slices.push({ start: cursor, end: lo });
    }
    cursor = excl.end > cursor ? excl.end : cursor;
  }
  if (cursor < winEnd) {
    slices.push({ start: cursor, end: winEnd });
  }
  return slices;
}
