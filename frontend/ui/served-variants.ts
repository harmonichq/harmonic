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
// - A Queue with an admitted ISF Setting, and one with an admitted I:C Setting:
//   the findings row the engine serves for an admitted block (the shape of the
//   generated basal block's), its current value the generated pump profile's,
//   its suggestion and range test values a tenth below it. No generated store
//   admits either; the synthetic wearer's ISF and I:C hold.
// - A day navigator with no readings, as a store before its first sync serves it.
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
const added: Record<'changes' | 'queue', Record<string, unknown>> = { changes: {}, queue: {} };
function add(section: 'changes' | 'queue', name: string, store: unknown) {
  if (name in fixtures[section]) throw new Error(`${section}.${name} is a generated store`);
  added[section][name] = store;
  (fixtures[section] as Record<string, unknown>)[name] = store;
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

type Store = typeof fixtures.queue.wearer;
type Row = Store['findings']['rows'][number];

/** The wearer's Queue with its `parameter` Setting admitted, over the whole day. */
function admitted(parameter: 'isf' | 'carb_ratio'): Store {
  const store = clone(fixtures.queue.wearer);
  const current = fixtures.settings.pump_settings.wearer.profile.segments[0][parameter];
  const suggested = Math.round(current * 9) / 10;
  const block = clone(fixtures.queue['wearer-pinned'].findings.rows.find((r) => r.kind === 'setting')!) as Row;
  Object.assign(block, {
    id: `${parameter}:0-1440`, parameter, chips: [],
    span: { start_min: 0, end_min: 1440, label: '00:00 to 24:00' },
    members: [{
      start_min: 0, current, recommended: suggested, days: 0,
      estimate: { confidence: 0.8, method: 'test', n: 30, wide: false,
        value: suggested, lo: Math.round(current * 8) / 10, hi: suggested },
    }],
  });
  store.findings.rows.push(block);
  for (const candidate of store.guidance.candidates) {
    if (candidate.subject === `setting:${parameter}`) {
      Object.assign(candidate, { admitted: true, set_aside: false, queued: true, priority: 100 });
    }
  }
  return store;
}
add('queue', 'wearer-isf', admitted('isf'));
add('queue', 'wearer-ic', admitted('carb_ratio'));
export const QUEUE_ISF = 'wearer-isf' as keyof typeof fixtures.queue;
export const QUEUE_IC = 'wearer-ic' as keyof typeof fixtures.queue;

export const CHANGES_PROFILE = 'wearer-profile' as keyof typeof fixtures.changes;
export const CHANGES_PROFILE_ENDED = 'wearer-profile-ended' as keyof typeof fixtures.changes;
export const CHANGES_UNNAMED = 'wearer-unnamed' as keyof typeof fixtures.changes;
export const QUEUE_UNDRAWABLE = 'wearer-undrawable' as keyof typeof fixtures.queue;

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
