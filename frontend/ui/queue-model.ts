// The Queue components' data, read from one served store (#483). This is the
// provenance table in code: every number a Queue component shows is built here
// as a Sourced value naming its field, and nothing here invents a threshold or
// a verdict — uncertain, pinned, matured and the cause shares are all served.
//
// A store is one entry of `fixtures.queue`; the screens will hand the same
// answers in from the live API.
import { fixtures, sourced, type Sourced } from './fixtures';
import { formatValue } from './provenance.js';

export type QueueStore = keyof typeof fixtures.queue;
export type Tone = 'high' | 'low';

export type Magnitude = {
  count: Sourced<number>;
  denominator: Sourced<number>;
  /** The served count noun: "meals", "lows", "nights". */
  noun: string;
};

export type Cause = { title: string; count: number };

export type PatternData = {
  title: string;
  tone: Tone;
  /** Null when the engine serves no count for this pattern. */
  magnitude: Magnitude | null;
  /** Pattern-scope cause shares, largest first. */
  causes: Cause[];
  range: { lo: Sourced<number>; hi: Sourced<number>; n: Sourced<number> } | null;
  /** The engine flags the pattern's own range as too broad to rely on. */
  uncertain: boolean;
  pinned: boolean;
};

export type SettingData = {
  title: string;
  units: string;
  start: Sourced<number>;
  end: Sourced<number>;
  current: Sourced<number>;
  suggested: Sourced<number>;
  /** The engine's estimate, which lo–hi bounds; the suggestion may be capped short of it. */
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  days: Sourced<number>;
  nights: { rate: Sourced<number> }[];
  /** The roster's own path, so the chart can name the nights beyond its axis. */
  roster: string;
  /** The slot's change was detected and has matured into a Trial. */
  trial: boolean;
};

const store = (name: QueueStore) => fixtures.queue[name];

export function pattern(name: QueueStore, key: string): PatternData {
  const root = `queue.${name}.findings`;
  const s = store(name);
  const id = `pattern:${key}`;
  const row = s.findings.rows.find((r) => r.id === id);
  if (!row) throw new Error(`${name} serves no ${id} row`);
  const rowPath = `${root}.rows[id=${id}].0`;
  const outcomePath = `${root}.outcome_patterns[key=${key}].0`;
  const counted = Boolean(row.count_sentences?.length);
  const causes = s.findings.rows
    .filter((r) => r.claimed_by === id)
    .flatMap((r) => (r.fold_sentences ?? [])
      .filter((f) => f.scope === 'pattern')
      .map((f) => ({ title: r.title, count: f.count })))
    .sort((a, b) => b.count - a.count);
  const outcome = s.findings.outcome_patterns.find((p) => p.key === key);
  return {
    title: row.title,
    tone: row.chips?.includes('highs') ? 'high' : 'low',
    magnitude: counted
      ? {
          count: sourced(`${rowPath}.count_sentences.0.count`),
          denominator: sourced(`${rowPath}.count_sentences.0.denominator`),
          noun: row.count_sentences![0].noun,
        }
      : null,
    causes,
    range: counted
      ? {
          lo: sourced(`${outcomePath}.wilson.lo × ${outcomePath}.n`, 'round'),
          hi: sourced(`${outcomePath}.wilson.hi × ${outcomePath}.n`, 'round'),
          n: sourced(`${outcomePath}.n`),
        }
      : null,
    uncertain: (outcome?.wide as boolean | null | undefined) === true,
    pinned: s.focus.focuses.some((f) => f.status === 'active' && f.pattern_key === key),
  };
}

export function basalSetting(name: QueueStore, startMin: number): SettingData {
  const s = store(name);
  const row = s.findings.rows.find((r) => r.kind === 'setting' && r.span?.start_min === startMin);
  if (!row) throw new Error(`${name} serves no basal block at ${startMin}`);
  const rowPath = `queue.${name}.findings.rows[id=${row.id}].0`;
  const slot = startMin / 30;
  const slotPath = `queue.${name}.analyze.basal[slot=${slot}].0`;
  const roster = s.analyze.basal.find((b) => b.slot === slot)!.evidence.night_roster;
  const candidate = s.guidance.candidates.find((c) => c.subject === 'setting:basal_rate')!;
  const label = formatValue(startMin, 'clock');
  return {
    title: candidate.title,
    units: candidate.units!,
    start: sourced(`${rowPath}.span.start_min`, 'clock'),
    end: sourced(`${rowPath}.span.end_min`, 'clock'),
    // §4.2: every number but the time block is the analyze slot's, the same
    // slot whose nights the chart plots, so the count and the dots agree. The
    // engine serves no pump increment, so every U/h value prints at 2 decimals.
    current: sourced(`${slotPath}.current`, 'fixed2'),
    suggested: sourced(`${slotPath}.recommended`, 'fixed2'),
    estimate: sourced(`${slotPath}.estimate.value`, 'fixed2'),
    lo: sourced(`${slotPath}.estimate.lo`, 'fixed2'),
    hi: sourced(`${slotPath}.estimate.hi`, 'fixed2'),
    days: sourced(`${slotPath}.days`),
    nights: roster.map((_, i) => ({ rate: sourced(`${slotPath}.evidence.night_roster.${i}.delivered_rate`) })),
    roster: `${slotPath}.evidence.night_roster`,
    trial: s.trials.trials.some((t) => t.parameter === 'basal_rate' && t.slot === label && t.state === 'complete'),
  };
}

/** The story states the generator found in the served answers, by name. */
const states = fixtures.states;
type PatternState = 'multi_cause' | 'single_cause' | 'no_cause' | 'pinned';
type SettingState = 'setting' | 'setting_trial';

export function patternState(name: PatternState): PatternData {
  const { store, pattern: key } = states[name];
  return pattern(store as QueueStore, key);
}

export function settingState(name: SettingState): SettingData {
  const { store, start_min: start } = states[name];
  return basalSetting(store as QueueStore, start);
}
