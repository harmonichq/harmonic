/**
 * The clock-window arithmetic a wrapping gesture has to produce, spiked as a
 * table so the implementer inherits a run rather than prose (#130).
 *
 * The committed value is what the route and the Findings projection already
 * accept today: `start_min` / `end_min` on the circular day, where an `end_min`
 * at or below `start_min` wraps, and the whole day is unscoped. Nothing here is
 * new backend behaviour — `ciq_autotune/window_membership.py` and the browser
 * gates' mirror in `mockups/findings-projection.mirror.mjs` both already read
 * that shape, and the frozen fixture table already freezes an `overnight`
 * 22:00–02:00 answer.
 *
 * Run: node mockups/clock-window-wrap.exploration/window-model.spike.mjs
 */
import assert from 'node:assert/strict';

export const DAY = 1440;
export const BIN = 15;          // the pooling grid, frontend/diagnose-workstation-chart.js
/**
 * The drawn-window floor is NOT a constant: `minWindowMinutes(pool)` in that same
 * module is `max(2 * BIN, 2 * pool)`, so it moves with the pooling diameter the
 * envelope was built at. Ledger P10's "90-minute floor" is that value under its
 * own fixture's pool, not a literal. Cases below pass it in.
 */
export const floorFor = (pool) => Math.max(2 * BIN, 2 * pool);

const snap = (min) => Math.round(min / BIN) * BIN;
const norm = (min) => ((min % DAY) + DAY) % DAY;

/**
 * Commit one gesture. `anchor` and `released` are DISPLAY minutes on the
 * unrolled axis: the axis runs -1440..2880 during a gesture, so `released` may
 * sit outside the day and that is what expresses a wrap. Returns the committed
 * window, or null for the whole day (the unscoped day scope).
 */
export function commit({ kind, anchor, released, duration, pool = 45 }) {
  if (kind === 'slide') {
    const start = snap(released);                      // length is preserved
    return { start_min: norm(start), end_min: norm(start + duration) };
  }
  const lo = snap(Math.min(anchor, released));
  const hi = snap(Math.max(anchor, released));
  const span = Math.min(DAY, Math.max(floorFor(pool), hi - lo));
  if (span >= DAY) return null;                        // ran right round: whole day
  return { start_min: norm(lo), end_min: norm(lo + span) };
}

const cases = [
  ['draw inside the day',
    { kind: 'draw', anchor: 11 * 60, released: 14 * 60 }, { start_min: 660, end_min: 840 }],
  ['draw rightwards past 24:00',
    { kind: 'draw', anchor: 22 * 60, released: 26 * 60 }, { start_min: 1320, end_min: 120 }],
  ['draw leftwards past 00:00',
    { kind: 'draw', anchor: 3 * 60, released: -60 }, { start_min: 1380, end_min: 180 }],
  ['a drawn window still respects the floor, which the pooling diameter sets',
    { kind: 'draw', anchor: 23 * 60 + 45, released: 24 * 60, pool: 45 }, { start_min: 1425, end_min: 75 }],
  ['the same draw against a finer pool takes the finer floor',
    { kind: 'draw', anchor: 23 * 60 + 45, released: 24 * 60, pool: 10 }, { start_min: 1425, end_min: 15 }],
  ['a draw that runs a full day is the whole day, not a 24h window',
    { kind: 'draw', anchor: 20 * 60, released: 44 * 60 }, null],
  ['resize carries one edge past the boundary, anchored on the other',
    { kind: 'resize', anchor: 21 * 60, released: 25 * 60 }, { start_min: 1260, end_min: 60 }],
  ['slide carries the whole window across, length preserved',
    { kind: 'slide', released: 23 * 60 + 30, duration: 180 }, { start_min: 1410, end_min: 150 }],
  ['a slide that travels a full day lands back on itself',
    { kind: 'slide', released: 11 * 60 + 1440, duration: 180 }, { start_min: 660, end_min: 840 }],
  ['both ends snap to the nearest bin: 22:07 down to 22:00, 25:08 up to 25:15 (01:15)',
    { kind: 'draw', anchor: 22 * 60 + 7, released: 25 * 60 + 8 }, { start_min: 1320, end_min: 75 }],
];

let failures = 0;
for (const [name, input, want] of cases) {
  try {
    assert.deepEqual(commit(input), want);
    console.log(`ok   ${name}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL ${name}\n     want ${JSON.stringify(want)}\n     got  ${JSON.stringify(commit(input))}`);
  }
}
console.log(`\n${cases.length - failures}/${cases.length} cases hold`);
process.exit(failures ? 1 : 0);
