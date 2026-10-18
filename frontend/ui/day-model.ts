// The Day components' data, read from the served answers (#483). As with
// queue-model.ts, every number a Day component prints is built here as a
// Sourced value naming its field; the chart's marks read the same served rows.
//
// `answers.day` holds the wearer's timeline and logged carbs for the days its
// generator picked by rule; the prompts are the top-level `prompts`, and
// `day.prompts` the same wearer's before and after the Day screen's answers.
import { answers, sourced, type Sourced } from './answers';
import { otherMonths, servedDay } from './overview-model';
import { MONTHS } from './provenance.js';

export type DayState = keyof typeof answers.day.states;
type ServedDay = typeof answers.day.days[keyof typeof answers.day.days];
const servedDays = () => answers.day.days as Record<string, ServedDay>;

/** Minutes since midnight of a served "YYYY-MM-DD HH:MM:SS" time. */
export const minuteOf = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

// The engine's one clinical range, as every window's glucose profile serves it;
// Day reads the Overview's first window's.
const RANGE = 'overview.wearer.time_of_day.14.target_range';
export const targetRange = () => ({
  low: sourced<number>(`${RANGE}.low`),
  high: sourced<number>(`${RANGE}.high`),
});

// --- DayChart ----------------------------------------------------------------

/** A bolus is a meal bolus when it carries carbs, else a correction (the
 *  timeline serves no other type); logged carbs are the manual carb log; a site
 *  change is the pump's own event. A Pattern is a moment the engine counted
 *  toward a habit (the model-view's findings), named by the habits' served
 *  titles; a bolus the engine counted carries those titles itself. */
export type DayEvent =
  | { kind: 'meal' | 'correction'; minute: number; time: Sourced<string>; insulin: Sourced<number>;
      carbs: Sourced<number> | null; habits: string[] }
  | { kind: 'carbs'; minute: number; time: Sourced<string>; grams: Sourced<number> }
  | { kind: 'site'; minute: number; time: Sourced<string> }
  | { kind: 'pattern'; minute: number; time: Sourced<string>; bg: Sourced<number> | null; habits: string[] };

// The pump event the glossary names, and the only one this timeline draws.
const SITE_CHANGE = 'Site/Cartridge Change';

type ServedModelView = ServedDay['model_view'];

/** The day's findings, one per minute, each with its habits' served titles:
 *  the engine serves which of the day's moments count toward which habits
 *  (model_view.day_findings), and two in one minute (a meal and the suspend
 *  it owns) share one mark and one row. */
function counted(view: ServedModelView, root: string) {
  const byMinute = new Map<number, { t: string; path: string; bg: number | null; habits: string[] }>();
  view.findings.forEach((finding, i) => {
    const habits = finding.levers.map((lever) => lever.title);
    const minute = minuteOf(finding.t);
    const at = byMinute.get(minute);
    if (at) {
      for (const habit of habits) if (!at.habits.includes(habit)) at.habits.push(habit);
      if (at.bg === null && finding.bg !== null) Object.assign(at, { bg: finding.bg, path: `${root}.findings.${i}` });
    } else {
      byMinute.set(minute, { t: finding.t, path: `${root}.findings.${i}`, bg: finding.bg, habits });
    }
  });
  return byMinute;
}

export type DayChartData = {
  low: Sourced<number>;
  high: Sourced<number>;
  cgm: { minute: number; bg: number }[];
  basal: { minute: number; duration: number; delivered: number; programmed: number }[];
  /** The pump's sleep schedule over this day, in minutes, clipped to it. */
  sleep: { from: number; to: number }[];
  /** Boluses, logged carbs, site changes and the moments the engine counted, in time order. */
  events: DayEvent[];
};

export function dayChart(state: DayState): DayChartData {
  return dayChartOf(answers.day.states[state])!;
}

/** The chart of one served day; null for a day whose timeline is not served. */
export function dayChartOf(iso: string): DayChartData | null {
  const root = `day.days.${iso}`;
  const day = servedDays()[iso];
  if (!day) return null;
  const { timeline, carbs, model_view: view } = day;
  const habits = counted(view, `${root}.model_view`);
  const boluses: DayEvent[] = timeline.boluses.map((b, i) => {
    const path = `${root}.timeline.boluses.${i}`;
    const minute = minuteOf(b.t);
    const at = habits.get(minute);
    habits.delete(minute);
    return {
      kind: b.carbs ? 'meal' : 'correction',
      minute,
      time: sourced(`${path}.t`, 'time'),
      insulin: sourced(`${path}.insulin`, 'fixed2'),
      carbs: b.carbs ? sourced(`${path}.carbs`, 'round') : null,
      habits: at?.habits ?? [],
    };
  });
  const patterns: DayEvent[] = [...habits.entries()].map(([minute, at]) => ({
    kind: 'pattern', minute, time: sourced(`${at.path}.t`, 'time'),
    bg: at.bg === null ? null : sourced(`${at.path}.bg`, 'round'), habits: at.habits,
  }));
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
    events: [...boluses, ...logged, ...sites, ...patterns].sort((a, b) => a.minute - b.minute),
  };
}

// --- InsulinBar --------------------------------------------------------------

export type InsulinKey = 'basal' | 'meal' | 'correction' | 'control_iq_bolus';
export type InsulinPart = { key: InsulinKey; units: Sourced<number>; share: Sourced<number> };
export type InsulinData = {
  total: Sourced<number>;
  /** Basal, Meal, Correction and Control-IQ, in that order. */
  parts: InsulinPart[];
};

const INSULIN_KEYS: InsulinKey[] = ['basal', 'meal', 'correction', 'control_iq_bolus'];

/** The day's insulin as the timeline serves it (ADR 492); null when it serves
 *  none. The total and each part print their own value to one decimal, and
 *  each share is its part ÷ the total as printed, so the shares need not sum
 *  to exactly 100. */
export function insulinBar(iso: string): InsulinData | null {
  const totals = servedDays()[iso]?.timeline.insulin_totals;
  if (!totals) return null;
  const root = `day.days.${iso}.timeline.insulin_totals`;
  return {
    total: sourced(`${root}.total`, 'fixed1'),
    parts: INSULIN_KEYS.map((key) => ({
      key,
      units: sourced<number>(`${root}.${key}`, 'fixed1'),
      share: sourced<number>(`${root}.${key} ÷ ${root}.total`, 'share'),
    })),
  };
}

// --- Day navigator -----------------------------------------------------------

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const navigator = () => answers.overview.wearer.day_navigator;
const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const shift = (iso: string, days: number) => {
  const date = utc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** The latest day the navigator serves readings for: Day's default. A store
 *  with no readings yet (before its first sync) has none, and Day opens on the
 *  served month's last day up to today instead, which the chart shows as
 *  "No data". */
export function latestDay(): string {
  const { days, month } = navigator();
  const withData = days.filter((d) => d.has_data);
  if (withData.length) return withData[withData.length - 1].iso;
  const today = new Date().toISOString().slice(0, 10);
  const inMonth = days.filter((d) => d.iso.startsWith(month));
  const past = inMonth.filter((d) => d.iso <= today);
  return (past[past.length - 1] ?? inMonth[0] ?? days[0]).iso;
}

/** The day as Day's header names it: its weekday and served date ("Sun 25 May"). */
export function dayDate(iso: string): { weekday: string; date: Sourced<string> } {
  const served = servedDay(iso);
  if (!served) throw new Error(`the day navigator serves no ${iso}`);
  return { weekday: WEEKDAYS[utc(iso).getUTCDay()], date: sourced(`${served.path}.iso`, 'date') };
}

/** The Monday-to-Sunday week holding a day, when the navigator serves all of it. */
export function weekOf(iso: string): string[] | null {
  const monday = shift(iso, -((utc(iso).getUTCDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => shift(monday, i));
  return week.every((d) => servedDay(d)) ? week : null;
}

/** A month's name, as a date prints its month ("May"). */
export const monthName = (month: string) => MONTHS[Number(month.slice(5, 7)) - 1];

/** The month `step` months from `month` (`YYYY-MM`). */
export function monthBy(month: string, step: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + step;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Whether the navigator has served a month's weeks: the Overview's, or one the Day screen read. */
export const monthServed = (month: string) => navigator().month === month || month in otherMonths();

/** The first and last months with readings, as the status serves the data's
 *  span; the served month alone before there is any. */
export function monthSpan(): { first: string; last: string } {
  const { earliest_data_day: first, latest_data_day: last } = answers.status.ok;
  return first && last ? { first: first.slice(0, 7), last: last.slice(0, 7) }
    : { first: navigator().month, last: navigator().month };
}

/** A month as weeks, Monday first; the navigator's week of padding on each
 *  side fills the first and last rows. */
export function monthWeeks(month: string): string[][] {
  const weeks: string[][] = [];
  for (let first = `${month}-01`; first.slice(0, 7) <= month;) {
    const week = weekOf(first);
    if (!week) throw new Error(`the day navigator does not serve the week of ${first}`);
    weeks.push(week);
    first = shift(week[6], 1);
  }
  return weeks;
}

// --- PromptCard --------------------------------------------------------------

/** A Prompt as Day lists it (§1.5): a Low, or a Rise, the engine's
 *  missed-meal prompt (#529). */
export type PromptKind = 'low' | 'rise';
const DETECTOR: Record<PromptKind, string> = { low: 'low', rise: 'missed-meal' };

/** Each kind's prompts one answer apart. Lows: the wearer before the person
 *  answers any, as the top-level `prompts` serves them after one, and after the
 *  last. Rises: the wearer with lunches never bolused for, before any rise is
 *  answered, after one, and after the last, one low open throughout. */
export const PROMPT_STEPS = {
  low: ['wearer-pending', 'wearer', 'wearer-answered'],
  rise: ['rises-pending', 'rises', 'rises-answered'],
} as const;
export type PromptStore = (typeof PROMPT_STEPS)[PromptKind][number];

const promptsPath = (store: PromptStore) => (store === 'wearer' ? 'prompts' : `day.prompts.${store}`);
const promptsOf = (store: PromptStore) => (store === 'wearer' ? answers.prompts : answers.day.prompts[store]);
const open = (kind?: PromptKind) => `${kind ? `[detector=${DETECTOR[kind]}]` : ''}[answer=null]`;

/** The unanswered prompts of one kind: Day's Lows or Rises row. Of both: the Day badge. */
export const unanswered = (store: PromptStore, kind?: PromptKind) =>
  sourced<number>(`${promptsPath(store)}${open(kind)}.length`);

/** The store once the first unanswered prompt of `kind` in `store` is answered. */
export function afterAnswer(store: PromptStore, kind: PromptKind): PromptStore {
  const steps: readonly PromptStore[] = PROMPT_STEPS[kind];
  const next = steps.includes(store) ? steps[steps.indexOf(store) + 1] : undefined;
  if (!next) throw new Error(`${store} serves no ${kind} prompt to answer`);
  return next;
}

/** "n / N" for the first unanswered prompt of `kind` in `shown`, stepping
 *  through the prompts `entry` served: N is entry's count, and n the count
 *  entry served less the count left once this one is answered. */
export function promptPlace(kind: PromptKind, entry: PromptStore, shown: PromptStore = entry) {
  return {
    count: sourced<number>(`${promptsPath(entry)}${open(kind)}.length − ${promptsPath(afterAnswer(shown, kind))}${open(kind)}.length`),
    total: unanswered(entry, kind),
  };
}

export type PromptData = {
  kind: PromptKind;
  /** The prompt's identity, as an answer names it. */
  detector: string;
  anchorT: string;
  /** When its reading was: a low's nadir, a rise's peak (`key_t`). */
  date: Sourced<string>;
  time: Sourced<string>;
  /** Its reading, mg/dL: a low's nadir, a rise's peak. */
  bg: Sourced<number>;
  /** The target range; a low is drawn against its low end, a rise its high. */
  low: Sourced<number>;
  high: Sourced<number>;
  /** The served readings around it, minutes from the first. */
  cgm: { minute: number; bg: number }[];
  /** Its reading's minute, from the first. */
  key: number;
  start: number;
};

/** The n-th prompt of `kind` still unanswered, in served order. */
export function promptOf(kind: PromptKind, n = 0, store: PromptStore = 'wearer'): PromptData {
  const prompts = promptsOf(store);
  const index = prompts
    .map((prompt, i) => ({ prompt, i }))
    .filter(({ prompt }) => prompt.detector === DETECTOR[kind] && prompt.answer === null)[n]?.i;
  if (index === undefined) throw new Error(`${store} serves no unanswered ${kind} prompt ${n}`);
  const prompt = prompts[index];
  const path = `${promptsPath(store)}.${index}`;
  const start = minuteOf(prompt.cgm[0].t);
  // The window may cross midnight: minutes keep counting past 1440.
  const at = (t: string) => {
    const minute = minuteOf(t) + (t.slice(0, 10) === prompt.cgm[0].t.slice(0, 10) ? 0 : 1440);
    return minute - start;
  };
  return {
    kind,
    detector: prompt.detector,
    anchorT: prompt.anchor_t,
    date: sourced(`${path}.key_t`, 'date'),
    time: sourced(`${path}.key_t`, 'time'),
    bg: sourced(`${path}.key_bg`, 'round'),
    ...targetRange(),
    cgm: prompt.cgm.map((reading) => ({ minute: at(reading.t), bg: reading.bg })),
    key: at(prompt.key_t),
    start,
  };
}

/** Every prompt of `kind` still unanswered, in served order. */
export function promptsOfKind(kind: PromptKind, store: PromptStore = 'wearer'): PromptData[] {
  return Array.from({ length: unanswered(store, kind).value }, (_, n) => promptOf(kind, n, store));
}

/** "n / N" while answering the live engine, where no served store holds the
 *  Prompts as they were: N the unanswered count held from when the Prompts
 *  opened, and n the shown card's place among them, N less those still to come. */
export function livePromptPlace(total: Sourced<number>, place: number) {
  const count: Sourced<number> = { value: place, source: `${total.source} − ${total.value - place}` };
  return { count, total };
}

// --- LogCarbsEntry -----------------------------------------------------------

/** A served amount for the filled field: the first entry the wearer logged on
 *  the day the stories show with logged carbs. */
export function loggedGrams(): Sourced<number> {
  return sourced(`day.days.${answers.day.states.with_carbs}.carbs.carb_entries.0.grams`, 'round');
}

/** A served time for the edited Time row: when the wearer logged that entry. */
export function loggedTime(): Sourced<string> {
  return sourced(`day.days.${answers.day.states.with_carbs}.carbs.carb_entries.0.t`, 'time');
}
