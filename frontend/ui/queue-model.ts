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
  const outcome = s.findings.outcome_patterns.find((p) => p.key === key);
  // A pattern that collapses to its one member is served as that member's
  // habit row: the Queue reads it through that row, whose habit is its cause.
  const member = outcome?.collapse === 'collapse_to_member' && outcome.action
    ? `finding:${outcome.action.split(':')[1]}` : null;
  const rowId = member ?? id;
  const row = s.findings.rows.find((r) => r.id === rowId);
  if (!row) throw new Error(`${name} serves no ${rowId} row`);
  const rowPath = `${root}.rows[id=${rowId}].0`;
  const outcomePath = `${root}.outcome_patterns[key=${key}].0`;
  const counted = Boolean(row.count_sentences?.length);
  const causes = member
    ? [{ title: row.title, count: row.count_sentences![0].count }]
    : s.findings.rows
      .filter((r) => r.claimed_by === id)
      .flatMap((r) => (r.fold_sentences ?? [])
        .filter((f) => f.scope === 'pattern')
        .map((f) => ({ title: r.title, count: f.count })))
      .sort((a, b) => b.count - a.count);
  return {
    title: outcome?.title ?? row.title,
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

// --- The Queue screen --------------------------------------------------------

export type QueueItem =
  | { subject: string; kind: 'pattern'; data: PatternData }
  | { subject: string; kind: 'setting'; data: SettingData };

type Candidate = (typeof fixtures.queue)[QueueStore]['guidance']['candidates'][number];

function item(name: QueueStore, candidate: Candidate): QueueItem {
  if (candidate.kind === 'pattern') {
    return { subject: candidate.subject, kind: 'pattern', data: pattern(name, candidate.subject.split(':')[1]) };
  }
  if (candidate.subject === 'setting:basal_rate') {
    // The basal Setting opens on its admitted block, the earliest in the day.
    const start = Math.min(...store(name).findings.rows
      .filter((r) => r.kind === 'setting' && r.members?.length).map((r) => r.span!.start_min));
    return { subject: candidate.subject, kind: 'setting', data: basalSetting(name, start) };
  }
  throw new Error(`no Queue component draws ${candidate.subject}`);
}

/** The Queue's order (the brief's Queue section): the candidates the engine
 *  admitted and the person has not snoozed, by priority, highest first, an
 *  exact tie broken by subject as the engine breaks it. */
export function ranking(name: QueueStore): QueueItem[] {
  return store(name).guidance.candidates
    .filter((c) => c.queued)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.subject.localeCompare(b.subject))
    .map((c) => item(name, c));
}

/** How many the Queue holds, and how many are snoozed, as served counts. */
export const queuedCount = (name: QueueStore) => sourced<number>(`queue.${name}.guidance.candidates[queued=true].length`);
export const snoozedCount = (name: QueueStore) => sourced<number>(`queue.${name}.guidance.candidates[set_aside=true].length`);

export type SnoozedItem = QueueItem & { until: Sourced<string> };

/** The Snoozed list: each snoozed candidate as its Queue row reads it, until
 *  fourteen days after the engine's served decision time. */
export function snoozed(name: QueueStore): SnoozedItem[] {
  return store(name).guidance.candidates.filter((c) => c.set_aside).map((c) => ({
    ...item(name, c),
    until: sourced<string>(`queue.${name}.guidance.candidates[subject=${c.subject}].0.decided_at`, 'until'),
  }));
}
