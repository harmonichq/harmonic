/* =========================================================================
   #126 CARB-LOG — pure capture logic for the header quick-log sheet.

   Vue-free and DOM-free at import time (same seam discipline as
   scenario-chart.js / chart-builders.js, the #100 harness) so `node --test`
   imports it with no importmap and no DOM. The Vue popover in index.html is a
   thin shell over these: it owns the refs and the fetch calls; the time math
   and payload shaping — the parts worth testing — live here.

   Everything logged from the sheet is source='manual' and follows the #125
   CarbEntry contract {t, grams, certainty, source, note}. certainty drives
   grams nullability: 'unknown' forces grams=null (the "ate something, don't
   know" path); 'exact' and 'estimate' both carry a number (split preset chips
   — tap the number for exact, tap ~ for estimate; see the locked mockup).
   ========================================================================= */

// Preset chip amounts (grams) — the locked spec's real-world candy sizes,
// NOT the issue's original 15/30/45.
export const QUICKLOG_PRESETS = [4, 8, 12];

// Time segment options. Default 'now' — the common case is one tap + preset.
// 'custom' expands to a full datetime-local picker in the shell.
export const QUICKLOG_TIMES = [
  { k: 'now', label: 'Now' },
  { k: '15', label: '15m ago' },
  { k: '30', label: '30m ago' },
  { k: '60', label: '1h ago' },
  { k: 'custom', label: 'Custom…' },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// Format a Date to the stored wall-clock string 'YYYY-MM-DD HH:MM:SS', using
// LOCAL getters (never toISOString, which would smear the browser's tz offset
// in — same rule as chart-builders.addMinutesIso).
export function formatWallClock(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
         `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// Resolve a "when" segment selection to a stored wall-clock timestamp string.
// `now` is injected (a Date) so this is pure and testable. Relative options are
// snapped to the minute; 'custom' expands a datetime-local value
// ("YYYY-MM-DDTHH:MM" or "...:SS") into the stored space-separated form.
// Returns null for a custom selection with no value yet.
export function whenToT(when, customAt, now = new Date()) {
  if (when === 'custom') {
    if (!customAt) return null;
    const s = customAt.replace('T', ' ');
    return s.length === 16 ? s + ':00' : s; // add seconds if the picker omitted them
  }
  const d = new Date(now.getTime());
  if (when !== 'now') d.setMinutes(d.getMinutes() - Number(when));
  d.setSeconds(0, 0);
  return formatWallClock(d);
}

// Build the #125 CarbEntry-shaped POST body from the sheet's fields.
// certainty='unknown' forces grams=null regardless of any typed value.
export function buildCarbPayload({ grams = null, certainty, when = 'now',
                                   customAt = null, note = null, now = new Date() } = {}) {
  return {
    t: whenToT(when, customAt, now),
    grams: certainty === 'unknown' ? null : Number(grams),
    certainty,
    source: 'manual',
    note: note || null,
  };
}

// Is a (grams, certainty) pair loggable? 'unknown' needs no grams; 'exact' /
// 'estimate' need a positive number. Guards the shell's Log buttons.
export function isLoggable(grams, certainty) {
  if (certainty === 'unknown') return true;
  return grams != null && grams !== '' && Number(grams) > 0;
}

// One-line confirmation copy for the toast after a successful log.
export function carbToast(grams, certainty) {
  if (grams == null) return 'Logged carbs (unknown amount)';
  return `Logged ${certainty === 'estimate' ? '~' : ''}${Math.round(grams)} g`;
}

// Convert a millisecond timestamp to the 'YYYY-MM-DDTHH:MM' string the
// datetime-local input expects. Uses LOCAL getters — same no-tz-smear rule as
// formatWallClock — so the clicked chart time lands in the picker unchanged.
export function msToDatetimeLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
