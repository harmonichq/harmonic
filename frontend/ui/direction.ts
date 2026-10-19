// Which way a printed change moved, and whether that way is good for its
// metric (§2.5, 2026-10-19: "Color shows direction"). Every model that prints
// a change builds it here, and Delta draws it: ▲ or ▼, the amount, green the
// good way and red the bad way. Whether a change should be kept is the
// engine's verdict, which a result pill carries; the colour never stands for
// it.
import { sourced, type Sourced } from './answers';
import { formatValue } from './provenance.js';

export type Change = {
  direction: 'up' | 'down' | null;
  tone: 'favorable' | 'adverse' | null;
  /** Never negative: the formula is ordered larger − smaller. */
  amount: Sourced<number>;
};

/** Which way each metric moves when it gets better (the consensus targets'
 *  direction: more time in range, less of everything else; a lower Peak and a
 *  higher Nadir; a habit that happens less), and null where neither way is
 *  better: Control-IQ's delivery against the Pump profile. The one table:
 *  Changes, the Overview and the Queue all read it. */
export const GOOD = {
  tir: 'up',
  tbr: 'down',
  tar: 'down',
  mean: 'down',
  gmi: 'down',
  cv: 'down',
  peak: 'down',
  nadir: 'up',
  habit: 'down',
  delivered: null,
  above: null,
  below: null,
} as const satisfies Record<string, 'up' | 'down' | null>;

export type Metric = keyof typeof GOOD;

/** After against before, as printed: the amount ordered larger − smaller, its
 *  direction, and that direction's tone for the metric. Neither direction nor
 *  tone when it prints as zero. */
export function delta(before: Sourced<number>, after: Sourced<number>, metric: Metric): Change {
  const rises = after.value >= before.value;
  const amount = sourced<number>(rises ? `${after.source} − ${before.source}` : `${before.source} − ${after.source}`,
    after.format);
  if (formatValue(amount.value, after.format) === formatValue(0, after.format)) {
    return { direction: null, tone: null, amount };
  }
  const direction = rises ? 'up' : 'down';
  const good: 'up' | 'down' | null = GOOD[metric];
  return { direction, tone: good === null ? null : direction === good ? 'favorable' : 'adverse', amount };
}
