// The Day components' data, read from the served answers (#483). As with
// queue-model.ts, every number a Day component prints is built here as a
// Sourced value naming its field; the chart's marks read the same served rows.
//
// `fixtures.day` holds the wearer's timeline and logged carbs for the days its
// generator picked by rule; the prompts are the top-level `prompts`, and
// `day.prompts` the same wearer's before and after the Day screen's answers.
import { fixtures, sourced, type Sourced } from './fixtures';
import { MONTHS } from './provenance.js';

export type DayState = keyof typeof fixtures.day.states;
type ServedDay = typeof fixtures.day.days[keyof typeof fixtures.day.days];
const servedDays = fixtures.day.days as Record<string, ServedDay>;

/** Minutes since midnight of a served "YYYY-MM-DD HH:MM:SS" time. */
export const minuteOf = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

// The engine's one clinical range, as the glucose profile serves it.
const RANGE = 'overview.wearer.time_of_day.target_range';
export const targetRange = () => ({
  low: sourced<number>(`${RANGE}.low`),
  high: sourced<number>(`${RANGE}.high`),
});

// --- DayChart ----------------------------------------------------------------

/** A bolus is a meal bolus when it carries carbs, else a correction (the
 *  timeline serves no other type); logged carbs are the manual carb log; a site
 *  change is the pump's own event. */
export type DayEvent =
  | { kind: 'meal' | 'correction'; minute: number; time: Sourced<string>; insulin: Sourced<number>;
      carbs: Sourced<number> | null }
  | { kind: 'carbs'; minute: number; time: Sourced<string>; grams: Sourced<number> }
  | { kind: 'site'; minute: number; time: Sourced<string> };

// The pump event the glossary names, and the only one this timeline draws.
const SITE_CHANGE = 'Site/Cartridge Change';

export type DayChartData = {
  low: Sourced<number>;
  high: Sourced<number>;
  cgm: { minute: number; bg: number }[];
  basal: { minute: number; duration: number; delivered: number; programmed: number }[];
  /** The pump's sleep schedule over this day, in minutes, clipped to it. */
  sleep: { from: number; to: number }[];
  /** Boluses, logged carbs and site changes, in time order. */
  events: DayEvent[];
};

export function dayChart(state: DayState): DayChartData {
  return dayChartOf(fixtures.day.states[state])!;
}

/** The chart of one served day; null for a day whose timeline is not served. */
export function dayChartOf(iso: string): DayChartData | null {
  const root = `day.days.${iso}`;
  const day = servedDays[iso];
  if (!day) return null;
  const { timeline, carbs } = day;
  const boluses: DayEvent[] = timeline.boluses.map((b, i) => {
    const path = `${root}.timeline.boluses.${i}`;
    return {
      kind: b.carbs ? 'meal' : 'correction',
      minute: minuteOf(b.t),
      time: sourced(`${path}.t`, 'time'),
      insulin: sourced(`${path}.insulin`, 'fixed2'),
      carbs: b.carbs ? sourced(`${path}.carbs`, 'round') : null,
    };
  });
  const logged: DayEvent[] = carbs.carb_entries.map((entry, i) => {
    const path = `${root}.carbs.carb_entries.${i}`;
    return { kind: 'carbs', minute: minuteOf(entry.t), time: sourced(`${path}.t`, 'time'),
      grams: sourced(`${path}.grams`, 'round') };
  });
  const sites: DayEvent[] = timeline.pump_events.flatMap((event, i) => event.event_type === SITE_CHANGE
    ? [{ kind: 'site' as const, minute: minuteOf(event.t), time: sourced<string>(`${root}.timeline.pump_events.${i}.t`, 'time') }]
    : []);
  const dayStart = `${iso} 00:00:00`;
  const clip = (t: string) => (t < dayStart ? 0 : t.slice(0, 10) > iso ? 1440 : minuteOf(t));
  return {
    ...targetRange(),
    cgm: timeline.cgm.map((reading) => ({ minute: minuteOf(reading.t), bg: reading.bg })),
    basal: timeline.basal.map((row) => ({ minute: minuteOf(row.t), duration: row.duration_mins,
      delivered: row.basal_rate, programmed: row.profile_basal_rate })),
    sleep: timeline.sleep_windows.map((w) => ({ from: clip(w.start), to: clip(w.end) })).filter((w) => w.to > w.from),
    events: [...boluses, ...logged, ...sites].sort((a, b) => a.minute - b.minute),
  };
}

// --- InsulinBar --------------------------------------------------------------

export type InsulinKey = 'basal' | 'meal' | 'correction' | 'control_iq_bolus';
export type InsulinPart = { key: InsulinKey; units: Sourced<number>; share: Sourced<number> };
export type InsulinData = {
  total: Sourced<number>;
  /** Basal, Meal, Correction and Control-IQ, in that order. */
  parts: InsulinPart[];
  /** Basal delivered − Pump profile, as printed; null when no programmed rate is served. */
  againstProfile: Sourced<number> | null;
};

const INSULIN_KEYS: InsulinKey[] = ['basal', 'meal', 'correction', 'control_iq_bolus'];

/** The day's insulin as the timeline serves it (ADR 492); null when it serves
 *  none. Each part prints to one decimal, and the largest part prints as the
 *  printed total less the others as printed, so the printed parts always add
 *  up to the printed total; each share is its part ÷ the total, as printed. */
export function insulinBar(iso: string): InsulinData | null {
  const totals = servedDays[iso]?.timeline.insulin_totals as Record<string, number | null> | null | undefined;
  if (!totals) return null;
  const root = `day.days.${iso}.timeline.insulin_totals`;
  const largest = INSULIN_KEYS.reduce((a, b) => ((totals[b] ?? 0) > (totals[a] ?? 0) ? b : a));
  const unitsSource = (key: InsulinKey) => (key === largest
    ? [`${root}.total`, ...INSULIN_KEYS.filter((k) => k !== key).map((k) => `${root}.${k}`)].join(' − ')
    : `${root}.${key}`);
  const parts = INSULIN_KEYS.map((key) => ({
    key,
    units: sourced<number>(unitsSource(key), 'fixed1'),
    share: sourced<number>(`${unitsSource(key)} ÷ ${root}.total`, 'share'),
  }));
  return {
    total: sourced(`${root}.total`, 'fixed1'),
    parts,
    againstProfile: totals.basal_programmed === null
      ? null : sourced(`${unitsSource('basal')} − ${root}.basal_programmed`, 'signed1'),
  };
}

// --- Day navigator -----------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const navigator = () => fixtures.overview.wearer.day_navigator;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shift = (iso: string, days: number) => {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** The latest day the navigator serves readings for: Day's default. */
export function latestDay(): string {
  const withData = navigator().days.filter((d) => d.has_data);
  return withData[withData.length - 1].iso;
}

/** The day as Day's header names it: its weekday and served date ("Sun 25 May"). */
export function dayDate(iso: string): { weekday: string; date: Sourced<string> } {
  if (!navigator().days.some((d) => d.iso === iso)) throw new Error(`the day navigator serves no ${iso}`);
  return {
    weekday: WEEKDAYS[utc(iso).getUTCDay()],
    date: sourced(`overview.wearer.day_navigator.days[iso=${iso}].0.iso`, 'date'),
  };
}

/** The Monday-to-Sunday week holding a day, when the navigator serves all of it. */
export function weekOf(iso: string): string[] | null {
  const monday = shift(iso, -((utc(iso).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  const served = new Set(navigator().days.map((d) => d.iso));
  return week.every((d) => served.has(d)) ? week : null;
}

/** The served month's name, as a date prints its month ("May"). */
export const monthName = () => MONTHS[Number(navigator().month.slice(5, 7)) - 1];

/** The served month as weeks, Monday first; the navigator's week of padding on
 *  each side fills the first and last rows. */
export function monthWeeks(): { month: string; weeks: string[][] } {
  const { month } = navigator();
  const weeks: string[][] = [];
  for (let first = `${month}-01`; first.slice(0, 7) <= month;) {
    const week = weekOf(first);
    if (!week) throw new Error(`the day navigator does not serve the week of ${first}`);
    weeks.push(week);
    first = shift(week[6], 1);
  }
  return { month, weeks };
}

// --- PromptCard --------------------------------------------------------------

/** The wearer's prompts one answer apart: before the person answers any, as
 *  the top-level `prompts` serves them after one, and after the last. */
export const PROMPT_STEPS = ['wearer-pending', 'wearer', 'wearer-answered'] as const;
export type PromptStore = (typeof PROMPT_STEPS)[number];

const promptsPath = (store: PromptStore) => (store === 'wearer' ? 'prompts' : `day.prompts.${store}`);
const promptsOf = (store: PromptStore) => (store === 'wearer' ? fixtures.prompts : fixtures.day.prompts[store]);

/** The unanswered prompts: the Day badge and Day's Prompts row. */
export const unanswered = (store: PromptStore) => sourced<number>(`${promptsPath(store)}[answer=null].length`);

/** The store once the first unanswered prompt of `store` is answered. */
export function afterAnswer(store: PromptStore): PromptStore {
  const next = PROMPT_STEPS[PROMPT_STEPS.indexOf(store) + 1];
  if (!next) throw new Error(`${store} serves no unanswered prompt`);
  return next;
}

/** "n / N" for the first unanswered prompt of `shown`, stepping through the
 *  prompts `entry` served: N is entry's count, and n the count entry served
 *  less the count left once this one is answered. */
export function promptPlace(entry: PromptStore, shown: PromptStore = entry) {
  return {
    count: sourced<number>(`${promptsPath(entry)}[answer=null].length − ${promptsPath(afterAnswer(shown))}[answer=null].length`),
    total: unanswered(entry),
  };
}

export type PromptData = {
  date: Sourced<string>;
  time: Sourced<string>;
  /** The low's own reading, mg/dL. */
  bg: Sourced<number>;
  low: Sourced<number>;
  /** The served readings around it, minutes from the first. */
  cgm: { minute: number; bg: number }[];
  anchor: number;
  start: number;
};

/** The n-th low prompt still unanswered, in served order. */
export function lowPrompt(n = 0, store: PromptStore = 'wearer'): PromptData {
  const prompts = promptsOf(store);
  const index = prompts
    .map((prompt, i) => ({ prompt, i }))
    .filter(({ prompt }) => prompt.detector === 'low' && prompt.answer === null)[n]?.i;
  if (index === undefined) throw new Error(`${store} serves no unanswered low prompt ${n}`);
  const prompt = prompts[index];
  const path = `${promptsPath(store)}.${index}`;
  const start = minuteOf(prompt.cgm[0].t);
  // The window may cross midnight: minutes keep counting past 1440.
  const at = (t: string) => {
    const minute = minuteOf(t) + (t.slice(0, 10) === prompt.cgm[0].t.slice(0, 10) ? 0 : 1440);
    return minute - start;
  };
  return {
    date: sourced(`${path}.anchor_t`, 'date'),
    time: sourced(`${path}.anchor_t`, 'time'),
    bg: sourced(`${path}.key_bg`, 'round'),
    low: targetRange().low,
    cgm: prompt.cgm.map((reading) => ({ minute: at(reading.t), bg: reading.bg })),
    anchor: at(prompt.anchor_t),
    start,
  };
}

// --- LogCarbsEntry -----------------------------------------------------------

/** A served amount for the filled field: the first entry the wearer logged on
 *  the day the stories show with logged carbs. */
export function loggedGrams(): Sourced<number> {
  return sourced(`day.days.${fixtures.day.states.with_carbs}.carbs.carb_entries.0.grams`, 'round');
}

/** A served time for the edited Time row: when the wearer logged that entry. */
export function loggedTime(): Sourced<string> {
  return sourced(`day.days.${fixtures.day.states.with_carbs}.carbs.carb_entries.0.t`, 'time');
}
