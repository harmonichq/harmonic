// The chart family's one scale (§2.2 Charts, ADR 523): the round ticks an axis
// covers its marks with, which of them keep a label, the paths a line or a
// band is drawn with, and the dot row's beeswarm. EvidenceChart, TraceChart,
// BasalCard's day chart, ChangeTrace and MealSizeCard all read this module, so
// their axes snap, label and break the same way and every dot row spreads the
// same way; the glucose axis itself is glucose-zones' one rule.

const STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];

/** Round ticks covering [min, max]: the finest step that needs at most `most`,
 *  and at least `least` ticks even when the span is narrow. */
export function niceTicks(min: number, max: number, most = 5, least = 3): { values: number[]; decimals: number } {
  for (const step of STEPS) {
    const first = Math.floor(min / step + 1e-9) * step;
    const last = Math.ceil(max / step - 1e-9) * step;
    const count = Math.round((last - first) / step) + 1;
    if (count <= most) {
      const decimals = step >= 1 ? 0 : step >= 0.1 && step !== 0.25 ? 1 : 2;
      const values = Array.from({ length: Math.max(count, least) },
        (_, i) => Number((first + i * step).toFixed(6)));
      return { values, decimals };
    }
  }
  return { values: [min, max], decimals: 2 };
}

/** The least space between two tick labels, so they never read as one. */
const TICK_GAP = 16;

/** The ticks whose labels are drawn, given each label's [left, right] extent:
 *  left to right, each that clears the last one kept; then the last tick,
 *  displacing any kept label it would touch, since it always shows. */
export function labelledTicks(extents: [number, number][]): Set<number> {
  const kept: number[] = [];
  const last = extents.length - 1;
  for (let i = 0; i < last; i += 1) {
    if (kept.length === 0 || extents[i][0] >= extents[kept[kept.length - 1]][1] + TICK_GAP) kept.push(i);
  }
  while (kept.length && extents[kept[kept.length - 1]][1] + TICK_GAP > extents[last][0]) kept.pop();
  return new Set([...kept, last]);
}

/** Runs of a series broken wherever two neighbours are more than `gap` apart in
 *  x, so a line never bridges a stretch the series does not cover. */
export function runs<T>(points: readonly T[], at: (point: T) => number, gap: number): T[][] {
  const out: T[][] = [];
  for (const point of points) {
    const run = out[out.length - 1];
    if (run && at(point) - at(run[run.length - 1]) <= gap) run.push(point);
    else out.push([point]);
  }
  return out;
}

/** One SVG path through [x, y] pairs. */
export const linePath = (points: readonly [number, number][]) =>
  points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** One closed SVG area between an upper and a lower edge over the same xs. */
export const bandPath = (points: readonly [number, number, number][]) => `${linePath(points.map(([x, upper]) => [x, upper]))} ${
  [...points].reverse().map(([x, , lower]) => `L${x.toFixed(1)},${lower.toFixed(1)}`).join(' ')} Z`;

/** A dot row's dot radius, and the pitch from one dot to the next: a 6 px dot and its gap. */
export const DOT_R = 3;
export const DOT_PITCH = 6.6;

/** A symmetric beeswarm (ADR 523): each dot, left to right, takes the level
 *  nearest the row where it touches no dot already placed, at most `maxLevels`
 *  either side (the outermost when none is free). Returns each dot's level,
 *  in the order of `xs`. */
export function swarm(xs: number[], maxLevels = 5): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const placed: { x: number; level: number }[] = [];
  const levels = new Array<number>(xs.length);
  for (const { x, i } of order) {
    let chosen = 0;
    for (let k = 0; k <= 2 * maxLevels; k += 1) {
      chosen = k === 0 ? 0 : (k % 2 ? -1 : 1) * Math.ceil(k / 2);
      if (!placed.some((p) => Math.hypot(p.x - x, (p.level - chosen) * DOT_PITCH) < DOT_PITCH - 0.4)) break;
    }
    placed.push({ x, level: chosen });
    levels[i] = chosen;
  }
  return levels;
}
