// The Day components' data, read from the served answers (#483). As with
// queue-model.ts, every number a Day component prints is built here as a
// Sourced value naming its field; the chart's marks read the same served rows.
//
// `fixtures.day` holds the wearer's timeline and logged carbs for the days its
// generator picked by rule; the prompts are the top-level `prompts`.
import { fixtures, sourced, type Sourced } from './fixtures';

export type DayState = keyof typeof fixtures.day.states;

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
 *  timeline serves no other type); logged carbs are the manual carb log. */
export type DayEvent =
  | { kind: 'meal' | 'correction'; minute: number; time: Sourced<string>; insulin: Sourced<number>;
      carbs: Sourced<number> | null }
  | { kind: 'carbs'; minute: number; time: Sourced<string>; grams: Sourced<number> };

export type DayChartData = {
  low: Sourced<number>;
  high: Sourced<number>;
  cgm: { minute: number; bg: number }[];
  basal: { minute: number; duration: number; delivered: number; programmed: number }[];
  /** Boluses and logged carbs, in time order. */
  events: DayEvent[];
};

export function dayChart(state: DayState): DayChartData {
  const iso = fixtures.day.states[state];
  const root = `day.days.${iso}`;
  const day = (fixtures.day.days as Record<string, typeof fixtures.day.days[keyof typeof fixtures.day.days]>)[iso];
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
  return {
    ...targetRange(),
    cgm: timeline.cgm.map((reading) => ({ minute: minuteOf(reading.t), bg: reading.bg })),
    basal: timeline.basal.map((row) => ({ minute: minuteOf(row.t), duration: row.duration_mins,
      delivered: row.basal_rate, programmed: row.profile_basal_rate })),
    events: [...boluses, ...logged].sort((a, b) => a.minute - b.minute),
  };
}

// --- PromptCard --------------------------------------------------------------

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
export function lowPrompt(n = 0): PromptData {
  const index = fixtures.prompts
    .map((prompt, i) => ({ prompt, i }))
    .filter(({ prompt }) => prompt.detector === 'low' && prompt.answer === null)[n]?.i;
  if (index === undefined) throw new Error(`the wearer serves no unanswered low prompt ${n}`);
  const prompt = fixtures.prompts[index];
  const path = `prompts.${index}`;
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
