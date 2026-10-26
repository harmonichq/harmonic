// The Overview components' data, read from the served stores (#483). As with
// queue-model.ts, every number an Overview component prints is built here as a
// Sourced value naming its field or formula; nothing here invents a value.
//
// The wearer's own outcomes are the top-level `outcomes`; the other stores'
// answers sit under `overview.<store>`. The glucose profile and the basal
// estimate are served per window, under `time_of_day.<window>` and
// `analyze.<window>`; a window the live adapter has not read yet is absent.
// The Meal size card is served per window too, under `meal_size.<window>` (#565),
// and the insulin cards under `insulin.<window>` (#632, ADR 633).
import { answers, sourced, type Format, type Sourced } from './answers';
import { delta, type Change, type Metric } from './direction';
import { PARAMETER_UNITS } from './settings-model';

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

/** How each metric prints, and its name in the table of good ways its change
 *  is coloured by (direction.ts). */
export const METRICS: Record<MetricKey, { format: Format; delta: Metric }> = {
  tir: { format: 'fixed1', delta: 'tir' },
  mean_glucose: { format: 'round', delta: 'mean' },
  gmi: { format: 'fixed1', delta: 'gmi' },
  cv: { format: 'fixed1', delta: 'cv' },
  tbr_lvl1: { format: 'fixed1', delta: 'tbr' },
  tar_lvl1: { format: 'fixed1', delta: 'tar' },
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

export type { Change };

/** The change against the previous period, as printed, green or red by the way
 *  it moved for its metric (direction.ts). Null when either side is not served. */
export function change({ metric: key, value, previous }: MetricData): Change | null {
  if (value.value === null || previous.value === null) return null;
  return delta({ ...previous, value: previous.value }, { ...value, value: value.value }, METRICS[key].delta);
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

// --- BasalCard -----------------------------------------------------------------

/** One of the day's 48 half-hour slots, as the basal analyzer serves it: the
 *  programmed rate, the median clean delivered rate over its range (none for a
 *  slot without evidence), and the direction of a move the engine stages there,
 *  read from its one staging verdict (ADR 523). */
export type BasalSlot = {
  start: number;
  end: number;
  current: number;
  estimate: { value: number; lo: number; hi: number } | null;
  move: 'raise' | 'lower' | null;
};
export type BasalDayData = { slots: BasalSlot[]; units: string };

type BasalAnswer = {
  slot: number; current: number; asserts_move: boolean; direction: string | null;
  estimate: { value: number; lo: number; hi: number } | null;
};

/** The basal estimate over `window`: null when it has not been read yet, 'none'
 *  when the engine serves no slot an estimate. */
export function basalEstimate(store: OverviewStore, window: Window): BasalDayData | 'none' | null {
  const served = (answers.overview[store] as { analyze?: Partial<Record<Window, { basal?: BasalAnswer[] }>> })
    .analyze?.[window];
  if (!served?.basal) return null;
  if (!served.basal.some((slot) => slot.estimate)) return 'none';
  return {
    units: PARAMETER_UNITS.basal_rate,
    slots: served.basal.map((slot) => ({
      start: slot.slot * 30,
      end: slot.slot * 30 + 30,
      current: slot.current,
      estimate: slot.estimate,
      move: slot.asserts_move && (slot.direction === 'raise' || slot.direction === 'lower') ? slot.direction : null,
    })),
  };
}

// --- MealSizeCard --------------------------------------------------------------

/** One meal size, as the engine serves it (#501, ADR 501): its carbs bound
 *  (`from` ≤ carbs < `to`, either open), its climbs' percentiles, and the
 *  medians the table prints. Nothing here is computed: the whisker is the
 *  served 10th–90th percentiles, the Range the 25th–75th, the tick the median
 *  (#570). */
export type MealSizeRow = {
  /** The label's bounds: "<25 g" (no `from`), "25–39 g" (`last` = to − 1), "60 g+" (no `to`). */
  from: Sourced<number> | null;
  to: Sourced<number> | null;
  last: Sourced<number> | null;
  /** The served median and 10th, 25th, 75th and 90th percentiles of the climbs; null with no meal. */
  median: Sourced<number> | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  toPeak: Sourced<number> | null;
  at3h: Sourced<number> | null;
  /** How many meals the row counts, and how many of them At 3 h was read from. */
  meals: Sourced<number>;
  at3hMeals: Sourced<number>;
};
export type MealSizeData = {
  /** The hours At 3 h is read at, the engine's own horizon. */
  hours: Sourced<number>;
  rows: MealSizeRow[];
};

type MealSizeAnswer = {
  window: { data_days: number } | null;
  horizon_hours: number;
  sizes: {
    carbs_from: number | null; carbs_to: number | null; count: number;
    climb: { median: number | null; p10: number | null; p25: number | null; p75: number | null; p90: number | null };
    to_peak: { median: number | null };
    at_3h: { count: number; median: number | null };
  }[];
};

/** The Meal size card over `window`: null when it has not been read yet,
 *  'none' when the engine counts no meal in it. */
export function mealSize(store: OverviewStore, window: Window): MealSizeData | 'none' | null {
  const served = (answers.overview[store] as { meal_size?: Partial<Record<Window, MealSizeAnswer>> })
    .meal_size?.[window];
  if (!served) return null;
  if (!served.window || served.sizes.every((size) => size.count === 0)) return 'none';
  const root = `overview.${store}.meal_size.${window}`;
  const median = (path: string, value: number | null, format: Format) =>
    (value === null ? null : sourced<number>(path, format));
  return {
    hours: sourced(`${root}.horizon_hours`),
    rows: served.sizes.map((size, i) => {
      const at = `${root}.sizes.${i}`;
      return {
        from: size.carbs_from === null ? null : sourced(`${at}.carbs_from`),
        to: size.carbs_to === null ? null : sourced(`${at}.carbs_to`),
        last: size.carbs_from === null || size.carbs_to === null ? null : sourced(`${at}.carbs_to − 1`),
        median: median(`${at}.climb.median`, size.climb.median, 'signed'),
        p10: size.climb.p10,
        p25: size.climb.p25,
        p75: size.climb.p75,
        p90: size.climb.p90,
        toPeak: median(`${at}.to_peak.median`, size.to_peak.median, 'round'),
        at3h: median(`${at}.at_3h.median`, size.at_3h.median, 'signed'),
        meals: sourced(`${at}.count`),
        at3hMeals: sourced(`${at}.at_3h.count`),
      };
    }),
  };
}

// --- InsulinSummaryCard and BolusReviewCard ------------------------------------

/** One row's served figures: its units or count, and its share of the
 *  headline's total. Either is null where the engine serves none (a share of
 *  a zero total, ADR 632), and the card prints "–" for it. */
export type InsulinRow = { value: Sourced<number> | null; share: Sourced<number> | null };

export type InsulinSummaryData = {
  /** Average daily insulin, U; Basal and Bolus its parts. */
  insulin: Sourced<number> | null;
  basal: InsulinRow;
  bolus: InsulinRow;
  /** Average daily boluses, a count; Manual and Control-IQ its parts. */
  boluses: Sourced<number> | null;
  manual: InsulinRow;
  controlIq: InsulinRow;
  /** Average daily carbs, g. */
  carbs: Sourced<number> | null;
};

export type BolusType = 'food' | 'correction' | 'override' | 'control_iq';
export type BolusMethod = 'standard' | 'extended' | 'quick' | 'control_iq';
export type BolusReviewData = {
  byType: (InsulinRow & { key: BolusType })[];
  byMethod: (InsulinRow & { key: BolusMethod })[];
};

type InsulinPart = { units: number | null; share: number | null };
type InsulinAnswer = {
  window: { data_days: number } | null;
  delivery_days: number;
  daily_dose: { units: number | null };
  basal: InsulinPart;
  bolus: InsulinPart;
  boluses: {
    count: number | null;
    manual: { count: number | null; share: number | null };
    control_iq: { count: number | null; share: number | null };
  };
  carbs: { grams: number | null };
  by_type: Record<BolusType, InsulinPart>;
  by_method: Record<BolusMethod, InsulinPart>;
};

const BOLUS_TYPES: BolusType[] = ['food', 'correction', 'override', 'control_iq'];
const BOLUS_METHODS: BolusMethod[] = ['standard', 'extended', 'quick', 'control_iq'];

/** The served insulin answer over `window` and its field root: null when it
 *  has not been read yet, 'none' when the window holds no day with delivery. */
function insulinAnswer(store: OverviewStore, window: Window): { served: InsulinAnswer; root: string } | 'none' | null {
  const served = (answers.overview[store] as { insulin?: Partial<Record<Window, InsulinAnswer>> })
    .insulin?.[window];
  if (!served) return null;
  if (!served.window || served.delivery_days === 0) return 'none';
  return { served, root: `overview.${store}.insulin.${window}` };
}

/** A served figure in its format, or null where the engine serves none. */
const figure = (path: string, value: number | null, format: Format) =>
  (value === null ? null : sourced<number>(path, format));

/** A part at `at`: its units (or count) to one decimal, its share as a whole percent. */
const part = (at: string, field: 'units' | 'count', served: Record<string, number | null>): InsulinRow => ({
  value: figure(`${at}.${field}`, served[field], 'fixed1'),
  share: figure(`${at}.share`, served.share, 'share'),
});

/** The Insulin summary over `window` (ADR 633): null when it has not been
 *  read yet, 'none' when the window holds no day with delivery. */
export function insulinSummary(store: OverviewStore, window: Window): InsulinSummaryData | 'none' | null {
  const answer = insulinAnswer(store, window);
  if (!answer || answer === 'none') return answer;
  const { served, root } = answer;
  return {
    insulin: figure(`${root}.daily_dose.units`, served.daily_dose.units, 'fixed1'),
    basal: part(`${root}.basal`, 'units', served.basal),
    bolus: part(`${root}.bolus`, 'units', served.bolus),
    boluses: figure(`${root}.boluses.count`, served.boluses.count, 'fixed1'),
    manual: part(`${root}.boluses.manual`, 'count', served.boluses.manual),
    controlIq: part(`${root}.boluses.control_iq`, 'count', served.boluses.control_iq),
    carbs: figure(`${root}.carbs.grams`, served.carbs.grams, 'round'),
  };
}

/** The Bolus review over `window` (ADR 633), each type and delivery method in
 *  the card's order: null when it has not been read yet, 'none' when the
 *  window holds no day with delivery. */
export function bolusReview(store: OverviewStore, window: Window): BolusReviewData | 'none' | null {
  const answer = insulinAnswer(store, window);
  if (!answer || answer === 'none') return answer;
  const { served, root } = answer;
  return {
    byType: BOLUS_TYPES.map((key) => ({
      key, ...part(`${root}.by_type.${key}`, 'units', served.by_type[key]),
    })),
    byMethod: BOLUS_METHODS.map((key) => ({
      key, ...part(`${root}.by_method.${key}`, 'units', served.by_method[key]),
    })),
  };
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
