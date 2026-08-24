// #136 — pure date/bounds helpers for the Daily Report day-picker nav.
//
// Vue-free so Node's built-in runner can cover the arrow-bounds / cold-arrival /
// empty-day-nudge / label logic with no DOM and no importmap (see CLAUDE.md
// "Frontend tests"). Every date here is a pump-local 'YYYY-MM-DD' string. The
// day bounds (earliest/latest day WITH data) come from /api/status
// (earliest_data_day / latest_data_day, added in #137) — this module never
// re-derives them from timestamps.

// Add n calendar days to a 'YYYY-MM-DD' string. Parsed as local midnight so a
// UTC offset or DST edge never bumps the calendar day (the bug #136 fixes).
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// The [start, end) wall-clock range covering one calendar day, in the local
// 'YYYY-MM-DDTHH:MM:SS' shape the /api/timeline fetch expects.
export function dayBounds(dateStr) {
  return { start: `${dateStr}T00:00:00`, end: `${addDays(dateStr, 1)}T00:00:00` };
}

// Whole-day signed distance b - a between two 'YYYY-MM-DD' strings.
export function dayDelta(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

// Clamp a day into [earliest, latest]; a missing bound passes the day through.
export function clampDay(day, earliest, latest) {
  if (!day) return day;
  if (earliest && day < earliest) return earliest;
  if (latest && day > latest) return latest;
  return day;
}

// Arrow-enable predicates: prev is live above the earliest data day, next below
// the latest. With no bounds yet there is nothing to step onto — stay disabled.
export function canStepPrev(day, earliest) { return !!(day && earliest && day > earliest); }
export function canStepNext(day, latest) { return !!(day && latest && day < latest); }

// Cold-arrival day: the most-recent pump-local day WITH data (latest_data_day),
// falling back to a supplied local 'today' only when the store is empty.
export function coldArrivalDay(latestDataDay, todayFallback) {
  return latestDataDay || todayFallback || null;
}

// Empty/gap-day nudge target. earliest & latest are the only days GUARANTEED to
// carry data (they are the CGM min/max day), so nudge to whichever bound is
// nearer — always lands on a day with data. Ties prefer the more recent day.
export function nearestDataDay(day, earliest, latest) {
  if (!earliest || !latest) return earliest || latest || null;
  if (day <= earliest) return earliest;
  if (day >= latest) return latest;
  const toEarliest = dayDelta(earliest, day); // day - earliest (> 0)
  const toLatest = dayDelta(day, latest);     // latest - day (> 0)
  return toEarliest < toLatest ? earliest : latest;
}

// Flag-count label for the date-button: "3 flags" / "1 flag" / "clean".
export function flagCountLabel(count) {
  if (!count) return 'clean';
  return `${count} flag${count === 1 ? '' : 's'}`;
}

// Weekday + month/day label, e.g. "Sat, Jun 21". Parsed as local midnight so the
// label matches the pump-local calendar day, never a UTC-shifted one.
export function weekdayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
