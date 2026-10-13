// The Overview components' data, read from the served stores (#483). As with
// queue-model.ts, every number an Overview component prints is built here as a
// Sourced value naming its field or formula; nothing here invents a value.
//
// The wearer's own outcomes are the top-level `outcomes`; the other stores'
// answers sit under `overview.<store>`.
import { fixtures, sourced, type Format, type Sourced } from './fixtures';
import { formatValue } from './provenance.js';

export type OverviewStore = keyof typeof fixtures.overview;
export type Window = '14' | '30' | '90';
export const COMPARE_WINDOW: Window = '90';

// --- GlucoseProfile ----------------------------------------------------------

export type ProfileBin = {
  minute: number; median: number; p10: number; p25: number; p75: number; p90: number; supported: boolean;
};

export type ProfileData = {
  /** `window.data_days`; null when the store has no readings at all. */
  days: Sourced<number> | null;
  low: Sourced<number>;
  high: Sourced<number>;
  binMinutes: number;
  bins: ProfileBin[];
  meals: { minute: number; count: number }[];
};

type TimeOfDay = {
  window: { data_days: number } | null;
  target_range: { low: number; high: number };
  pooled: { bin_minutes: number; bins: ProfileBin[]; meals: { minute: number; count: number }[] } | null;
};

export function profile(store: OverviewStore): ProfileData {
  const root = `overview.${store}.time_of_day`;
  const answer = (fixtures.overview[store] as { time_of_day?: TimeOfDay }).time_of_day;
  if (!answer) throw new Error(`${store} serves no time of day`);
  const bins = answer.pooled?.bins ?? [];
  return {
    days: answer.window ? sourced(`${root}.window.data_days`) : null,
    low: sourced(`${root}.target_range.low`),
    high: sourced(`${root}.target_range.high`),
    binMinutes: answer.pooled?.bin_minutes ?? 15,
    bins,
    meals: answer.pooled?.meals ?? [],
  };
}

// --- TimeInRangeBar ----------------------------------------------------------

export type TirBands = {
  below54: Sourced<number>;
  below70: Sourced<number>;
  inRange: Sourced<number>;
  above180: Sourced<number>;
  above250: Sourced<number>;
};

/** The five AGP bands of one window. The served levels nest: tbr_lvl1 (<70)
 *  includes tbr_lvl2 (<54), and tar_lvl1 (>180) includes tar_lvl2 (>250), so the
 *  54–69 and 181–250 bands are their differences. */
export function tirBands(window: Window): TirBands {
  const m = `outcomes.${window}.metrics`;
  return {
    below54: sourced(`${m}.tbr_lvl2`, 'fixed1'),
    below70: sourced(`${m}.tbr_lvl1 − ${m}.tbr_lvl2`, 'fixed1'),
    inRange: sourced(`${m}.tir`, 'fixed1'),
    above180: sourced(`${m}.tar_lvl1 − ${m}.tar_lvl2`, 'fixed1'),
    above250: sourced(`${m}.tar_lvl2`, 'fixed1'),
  };
}

// --- MetricFigure ------------------------------------------------------------

export type MetricKey = 'tir' | 'mean_glucose' | 'gmi' | 'cv' | 'tbr_lvl1' | 'tar_lvl1';

/** How each metric prints, and which way is good (the consensus targets'
 *  direction: more time in range, less of everything else). */
export const METRICS: Record<MetricKey, { format: Format; better: 'up' | 'down' }> = {
  tir: { format: 'fixed1', better: 'up' },
  mean_glucose: { format: 'round', better: 'down' },
  gmi: { format: 'fixed1', better: 'down' },
  cv: { format: 'fixed1', better: 'down' },
  tbr_lvl1: { format: 'fixed1', better: 'down' },
  tar_lvl1: { format: 'fixed1', better: 'down' },
};

export type MetricData = {
  metric: MetricKey;
  value: Sourced<number | null>;
  /** The same metric over the 90 d window. */
  baseline: Sourced<number | null>;
};

function outcomesPath(store: OverviewStore | 'wearer'): string {
  return store === 'wearer' ? 'outcomes' : `overview.${store}.outcomes`;
}

export function metric(store: OverviewStore, window: Window, key: MetricKey): MetricData {
  const root = outcomesPath(store);
  const format = METRICS[key].format;
  return {
    metric: key,
    value: sourced(`${root}.${window}.metrics.${key}`, format),
    baseline: sourced(`${root}.${COMPARE_WINDOW}.metrics.${key}`, format),
  };
}

export type Change = { direction: 'up' | 'down' | null; tone: 'favorable' | 'adverse' | null; amount: Sourced<number> };

/** The change against 90 d, as printed: an amount that is never negative (the
 *  formula is ordered larger − smaller) and a direction; neither direction nor
 *  tone when it prints as zero. Null when either side is not served. */
export function change({ metric: key, value, baseline }: MetricData): Change | null {
  if (value.value === null || baseline.value === null) return null;
  const { format, better } = METRICS[key];
  const rises = value.value >= baseline.value;
  const amount = sourced<number>(rises ? `${value.source} − ${baseline.source}` : `${baseline.source} − ${value.source}`,
    format);
  if (formatValue(amount.value, format) === formatValue(0, format)) return { direction: null, tone: null, amount };
  const direction = rises ? 'up' : 'down';
  return { direction, tone: direction === better ? 'favorable' : 'adverse', amount };
}

const SCANNED_STORES = ['wearer', 'wearer-pinned', 'wearer-unsynced'] as const;
const SCANNED_WINDOWS: Window[] = ['14', '30'];

/** The first served metric, over the stores and windows above, in each state. */
export function metricState(state: 'better' | 'worse' | 'unchanged' | 'unavailable'): MetricData {
  for (const store of SCANNED_STORES) {
    for (const window of SCANNED_WINDOWS) {
      for (const key of Object.keys(METRICS) as MetricKey[]) {
        const data = metric(store as OverviewStore, window, key);
        const shown = change(data);
        const found = state === 'unavailable' ? data.value.value === null
          : state === 'unchanged' ? shown?.direction === null
            : shown?.tone === (state === 'better' ? 'favorable' : 'adverse');
        if (found) return data;
      }
    }
  }
  throw new Error(`no served metric is ${state}`);
}

// --- DayTile -----------------------------------------------------------------

export type DayData = {
  /** The served date, printed as its day of the month. */
  date: Sourced<string>;
  /** Mon … Sun, from the served date. */
  weekday: string;
  hasData: boolean;
  lows: Sourced<number>;
  highs: Sourced<number>;
  tir: Sourced<number>;
  curve: { x: number; bg: number }[];
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const navigatorDays = () => fixtures.overview.wearer.day_navigator.days;

export function day(iso: string): DayData {
  const found = navigatorDays().find((d) => d.iso === iso);
  if (!found) throw new Error(`the day navigator serves no ${iso}`);
  const path = `overview.wearer.day_navigator.days[iso=${iso}].0`;
  return {
    date: sourced(`${path}.iso`, 'day'),
    weekday: WEEKDAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()],
    hasData: found.has_data,
    lows: sourced(`${path}.lows`),
    highs: sourced(`${path}.highs`),
    tir: sourced(`${path}.tir`),
    curve: found.curve,
  };
}

/** A day with no lows and no highs is clean (✓). */
export const isClean = (d: DayData) => d.hasData && d.lows.value === 0 && d.highs.value === 0;

/** The latest served day in each state; "default" is the latest day with data
 *  that is not clean. */
export function dayState(state: 'default' | 'clean' | 'no_data'): DayData {
  const withData = navigatorDays().filter((d) => d.has_data);
  const last = withData[withData.length - 1].iso;
  const days = navigatorDays().map((d) => day(d.iso));
  const pick = state === 'no_data'
    ? days.find((d) => !d.hasData && d.date.value > last)
    : [...days].reverse().find((d) => (state === 'clean' ? isClean(d) : d.hasData && !isClean(d)));
  if (!pick) throw new Error(`the day navigator serves no ${state} day`);
  return pick;
}
