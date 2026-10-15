// Served-shape variants for the stories (#495): answers the engine serves that
// the generated wearer does not happen to, each derived from a generated
// answer with only the field under test changed, so the stories cover the
// screens' handling of them. Each is added under its own store name; none
// changes a generated store, except Day's navigator, which the Day model reads
// at one fixed key and `withNavigator` swaps only for one story's render.
//
// - A whole-profile Trial: the engine's `profile` parameter (an active-profile
//   switch that moved more than one setting), served with no slot and no
//   before or after value (watched_change.TrialView, _Cand("profile", None, …)).
// - A Trial whose parameter the app has no name for, as a newer engine might serve.
// - A Queue whose ranking holds candidates the Queue cannot draw: an ISF and an
//   I:C Setting the findings serve no admitted row for, a Pattern the findings
//   hold no row for, and a candidate of a kind the app does not know.
// - A Pattern whose trace chart is served with nothing to draw (ADR 523).
// - A day navigator with no readings, as a store before its first sync serves it.
// - A day with no Control-IQ boluses: the latest day's timeline with
//   `insulin_totals.control_iq_bolus` served as 0 and its `total` the served
//   sum of the other three, as the engine adds them (timeline.insulin_totals).
import { useEffect, type ReactNode } from 'react';
import { answers } from './answers';
import { fixtures } from './fixtures';

type Json = Record<string, unknown>;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** A Changes store whose one Trial is retargeted to `parameter`, as the engine
 *  serves it; a whole-profile Trial targets in range and the arc
 *  (watched_change._PROFILE_TARGET). */
function trialAs(from: 'wearer' | 'wearer-ended', parameter: string): Json {
  const store = clone(fixtures.changes[from]) as Json & { trials: Json[] };
  for (const trial of store.trials) {
    Object.assign(trial, { parameter, slot: null, before: null, after: null },
      parameter === 'profile' ? { target_metrics: ['tir', 'arc'] } : {});
  }
  return store;
}

/** Every store this module adds, by section: the story check (scripts/ui-stories.mjs)
 *  reads them beside the generated answers, at their own keys only. */
const added: Record<'changes' | 'queue' | 'days', Record<string, unknown>> = { changes: {}, queue: {}, days: {} };
function add(section: 'changes' | 'queue' | 'days', name: string, store: unknown) {
  const into = (section === 'days' ? fixtures.day.days : fixtures[section]) as Record<string, unknown>;
  if (name in into) throw new Error(`${section}.${name} is a generated store`);
  added[section][name] = store;
  into[name] = store;
}
(globalThis as { __uiVariants?: typeof added }).__uiVariants = added;

add('changes', 'wearer-profile', trialAs('wearer', 'profile'));
add('changes', 'wearer-profile-ended', trialAs('wearer-ended', 'profile'));
add('changes', 'wearer-unnamed', trialAs('wearer', 'reservoir_volume'));

/** The wearer's Queue with every Setting candidate queued, and one queued
 *  Pattern the findings serve no row for. */
const queue = clone(fixtures.queue.wearer) as typeof fixtures.queue.wearer;
for (const candidate of queue.guidance.candidates) {
  if (candidate.kind === 'setting') Object.assign(candidate, { admitted: true, set_aside: false, queued: true });
}
const pattern = queue.guidance.candidates.find((c) => c.kind === 'pattern')!;
queue.guidance.candidates.push(
  { ...pattern, subject: 'pattern:unserved', title: 'Unserved', priority: 1000, queued: true },
  { ...pattern, subject: 'habit:missed_meal', kind: 'habit', title: 'Unknown', priority: 1001, queued: true },
);
add('queue', 'wearer-undrawable', queue);

/** The wearer's Queue with one Pattern's trace chart served with nothing to draw
 *  (ADR 523): no episode has its early readings and no bin of either cohort has
 *  three readings, as a history too short or too gappy serves it. */
const blank = clone(fixtures.queue.wearer) as typeof fixtures.queue.wearer;
const blankKey = fixtures.states.traces_episodes.pattern as keyof typeof blank.cases;
Object.assign(blank.cases[blankKey].traces, { pattern: { episodes: [], points: [] }, typical: { points: [] } });
add('queue', 'wearer-traces-empty', blank);

export const CHANGES_PROFILE = 'wearer-profile' as keyof typeof fixtures.changes;
export const CHANGES_PROFILE_ENDED = 'wearer-profile-ended' as keyof typeof fixtures.changes;
export const CHANGES_UNNAMED = 'wearer-unnamed' as keyof typeof fixtures.changes;
export const QUEUE_UNDRAWABLE = 'wearer-undrawable' as keyof typeof fixtures.queue;
export const QUEUE_TRACES_EMPTY = 'wearer-traces-empty' as keyof typeof fixtures.queue;

/** The latest day as served on a day Control-IQ gave no automatic bolus. */
const noControlIq = (() => {
  const day = clone(fixtures.day.days[fixtures.day.states.latest as keyof typeof fixtures.day.days]);
  const totals = day.timeline.insulin_totals!;
  totals.control_iq_bolus = 0;
  totals.total = totals.basal + totals.meal + totals.correction + totals.control_iq_bolus;
  return day;
})();
add('days', 'latest-no-control-iq', noControlIq);
export const DAY_NO_CONTROL_IQ = 'latest-no-control-iq';

/** The navigator before the first sync: every served day, none with readings. */
const unsynced = (() => {
  const navigator = clone(fixtures.overview.wearer.day_navigator);
  for (const day of navigator.days) Object.assign(day, { has_data: false, lows: 0, highs: 0, tir: 0, curve: [] });
  return navigator;
})();

/** Draw `children` with Day's navigator serving no readings, then put it back. */
export function WithoutReadings({ children }: { children: ReactNode }) {
  const served = answers.overview.wearer;
  const original = fixtures.overview.wearer.day_navigator;
  served.day_navigator = unsynced as typeof original;
  useEffect(() => () => { served.day_navigator = original; }, [served, original]);
  return children;
}

/** A month the Day screen can step to, as the engine serves `/api/day-navigator?month=…`: every week
 *  that touches it, Monday first, its days the served May navigator's days in turn (dates changed). */
function monthOf(month: string) {
  const navigator = clone(fixtures.overview.wearer.day_navigator);
  const served = navigator.days;
  const first = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const lead = (first.getUTCDay() + 6) % 7;
  first.setUTCDate(first.getUTCDate() - lead);
  const weeks = Math.ceil((lead + end.getUTCDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + i);
    return { ...clone(served[i % served.length]), iso: date.toISOString().slice(0, 10) };
  });
  return { ...navigator, month, days };
}
const STEPPABLE = ['2025-03', '2025-04'];
const stepped = Object.fromEntries(STEPPABLE.map((month) => [month, monthOf(month)]));
(globalThis as { __uiMonths?: Record<string, unknown> }).__uiMonths = stepped;

/** The Day screen's month reader for a story: March and April 2025 are served, and any month in
 *  `failing` cannot be read. What was read in is taken back out when the story ends (the cleanup). */
export function monthReader(failing: string[] = []): { readMonth: (month: string) => Promise<void>; cleanup: () => void } {
  const day = answers.day as { months?: Record<string, unknown> };
  return {
    readMonth: async (month) => {
      if (failing.includes(month) || !(month in stepped)) throw new Error(`no ${month}`);
      day.months = { ...day.months, [month]: stepped[month] };
    },
    cleanup: () => { delete day.months; },
  };
}
