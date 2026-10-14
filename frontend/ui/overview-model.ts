// The Overview components' data, read from the served stores (#483). As with
// queue-model.ts, every number an Overview component prints is built here as a
// Sourced value naming its field or formula; nothing here invents a value.
//
// The wearer's own outcomes are the top-level `outcomes`; the other stores'
// answers sit under `overview.<store>`. The glucose profile and the ISF
// estimate are served per window, under `time_of_day.<window>` and
// `analyze.<window>`; a window the live adapter has not read yet is absent.
import { answers, sourced, type Format, type Sourced } from './answers';
import { formatValue } from './provenance.js';
import { PARAMETER_FORMATS } from './settings-model';

export type OverviewStore = keyof typeof answers.overview;
export type Window = '14' | '30' | '90';

// --- GlucoseProfile ----------------------------------------------------------

export type ProfileBin = {
  minute: number; median: number; p10: number; p25: number; p75: number; p90: number; supported: boolean;
};

export type ProfileData = {
  /** `window.data_days`, the selected window; null when the store has no readings at all. */
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

/** The glucose profile over `window`, or null when it has not been read yet. */
export function profile(store: OverviewStore, window: Window): ProfileData | null {
  const root = `overview.${store}.time_of_day.${window}`;
  const answer = (answers.overview[store] as { time_of_day?: Partial<Record<Window, TimeOfDay>> })
    .time_of_day?.[window];
  if (!answer) return null;
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
  /** The same metric over the period of the same length just before the window. */
  previous: Sourced<number | null>;
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
    previous: sourced(`${root}.${window}.previous.metrics.${key}`, format),
  };
}

export type PeriodData = {
  /** The window's first and last served days. */
  start: Sourced<string>;
  end: Sourced<string>;
  /** The previous period's length, or null when it holds no readings. */
  previous: Sourced<number> | null;
};

/** The line under the window switch: the window's date span and, when the
 *  period before it has data, the comparison. Null when the window has none. */
export function period(store: OverviewStore | 'wearer', window: Window): PeriodData | null {
  const root = `${outcomesPath(store)}.${window}`;
  const served = (store === 'wearer' ? answers.outcomes : (answers.overview[store] as { outcomes: typeof answers.outcomes }).outcomes)[window];
  if (served.span_start === null) return null;
  return {
    start: sourced(`${root}.span_start`, 'date'),
    end: sourced(`${root}.span_end`, 'date'),
    previous: served.previous.span_start === null ? null : sourced(`${root}.previous.window_days`),
  };
}

import type { Change } from './Delta';
export type { Change };

/** The change against the previous period, as printed: an amount that is never
 *  negative (the formula is ordered larger − smaller) and a direction; neither
 *  direction nor tone when it prints as zero. Null when either side is not
 *  served. */
export function change({ metric: key, value, previous }: MetricData): Change | null {
  if (value.value === null || previous.value === null) return null;
  const { format, better } = METRICS[key];
  const rises = value.value >= previous.value;
  const amount = sourced<number>(rises ? `${value.source} − ${previous.source}` : `${previous.source} − ${value.source}`,
    format);
  if (formatValue(amount.value, format) === formatValue(0, format)) return { direction: null, tone: null, amount };
  const direction = rises ? 'up' : 'down';
  // Colour only the below- and above-range shares; every other change keeps a
  // neutral arrow (operator, 2026-10-13: "quiet the colors down").
  const toned = key === 'tbr_lvl1' || key === 'tar_lvl1';
  return { direction, tone: toned ? (direction === better ? 'favorable' : 'adverse') : null, amount };
}

const SCANNED_STORES = ['wearer', 'wearer-pinned', 'wearer-worse', 'wearer-unsynced'] as const;
const SCANNED_WINDOWS: Window[] = ['14', '30', '90'];

/** The first served metric, over the stores and windows above, in each state. */
export function metricState(state: 'better' | 'worse' | 'unavailable' | 'no_previous'): MetricData {
  for (const store of SCANNED_STORES) {
    for (const window of SCANNED_WINDOWS) {
      for (const key of Object.keys(METRICS) as MetricKey[]) {
        const data = metric(store as OverviewStore, window, key);
        const shown = change(data);
        const found = state === 'unavailable' ? data.value.value === null
          : state === 'no_previous' ? data.value.value !== null && data.previous.value === null
            : shown?.tone === (state === 'better' ? 'favorable' : 'adverse');
        if (found) return data;
      }
    }
  }
  throw new Error(`no served metric is ${state}`);
}

// --- IsfCard -----------------------------------------------------------------

export type IsfData = {
  current: Sourced<number>;
  /** The engine's one ISF staging verdict (`asserts_move`): only then is
   *  "current → recommended" shown. */
  recommended: Sourced<number> | null;
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  /** The engine flags the estimate wide: Uncertain. */
  uncertain: boolean;
  /** The fasting nights the estimate counts. */
  nights: Sourced<number>;
  fits: { rate: Sourced<number> }[];
  roster: string;
  units: string;
};

type IsfAnswer = {
  current: number | null;
  recommended: number | null;
  asserts_move: boolean;
  estimate: { value: number; lo: number; hi: number; wide: boolean; n_clusters: number } | null;
  evidence: { night_fits: { date: string; isf: number }[] };
};

/** The ISF estimate over `window`: null when it has not been read yet, 'none'
 *  when the engine serves no estimate (or no programmed value to draw it
 *  against). */
export function isfEstimate(store: OverviewStore, window: Window): IsfData | 'none' | null {
  const served = (answers.overview[store] as { analyze?: Partial<Record<Window, { isf: IsfAnswer[] }>> })
    .analyze?.[window];
  if (!served) return null;
  const row = served.isf[0];
  if (!row?.estimate || row.current === null) return 'none';
  const root = `overview.${store}.analyze.${window}.isf.0`;
  const format = PARAMETER_FORMATS.isf;
  return {
    current: sourced(`${root}.current`, format),
    recommended: row.asserts_move === true ? sourced(`${root}.recommended`, format) : null,
    estimate: sourced(`${root}.estimate.value`, format),
    lo: sourced(`${root}.estimate.lo`, format),
    hi: sourced(`${root}.estimate.hi`, format),
    uncertain: row.estimate.wide === true,
    nights: sourced(`${root}.estimate.n_clusters`),
    fits: row.evidence.night_fits.map((_, i) => ({ rate: sourced(`${root}.evidence.night_fits.${i}.isf`) })),
    roster: `${root}.evidence.night_fits`,
    units: 'mg/dL/U',
  };
}

/** The story states the generator found in the served ISF answers, by name. */
export function isfState(name: 'supported' | 'held' | 'uncertain' | 'edges'): IsfData {
  const { store, window } = answers.states.isf[name];
  const data = isfEstimate(store as OverviewStore, window as Window);
  if (!data || data === 'none') throw new Error(`${store} serves no ISF estimate at ${window} d`);
  return data;
}

// --- DayRibbon ---------------------------------------------------------------

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
const navigatorDays = () => answers.overview.wearer.day_navigator.days;

type Navigator = typeof answers.overview.wearer.day_navigator;
/** The other months the Day screen has read (live only), by `YYYY-MM`. */
export const otherMonths = () => (answers.day as { months?: Record<string, Navigator> }).months ?? {};

/** Where the navigator serves a day: the Overview's month first, then any other month read. */
export function servedDay(iso: string): { path: string; found: Navigator['days'][number] } | null {
  const first = navigatorDays().find((d) => d.iso === iso);
  if (first) return { path: `overview.wearer.day_navigator.days[iso=${iso}].0`, found: first };
  for (const [month, navigator] of Object.entries(otherMonths())) {
    const found = navigator.days.find((d) => d.iso === iso);
    if (found) return { path: `day.months.${month}.days[iso=${iso}].0`, found };
  }
  return null;
}

export function day(iso: string): DayData {
  const served = servedDay(iso);
  if (!served) throw new Error(`the day navigator serves no ${iso}`);
  const { found, path } = served;
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
