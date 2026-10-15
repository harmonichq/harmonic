// The Queue components' data, read from one served store (#483). This is the
// provenance table in code: every number a Queue component shows is built here
// as a Sourced value naming its field, and nothing here invents a threshold or
// a verdict — uncertain, pinned, matured and the cause shares are all served.
//
// A store is one entry of `answers.queue`; the screens will hand the same
// answers in from the live API.
import { answers, sourced, type Sourced } from './answers';
import { delta } from './changes-model';
import type { Change } from './Delta';
import { isfData, type IsfAnswer, type IsfData } from './overview-model';
import { PARAMETER_FORMATS, PARAMETER_NAMES } from './settings-model';

export type QueueStore = keyof typeof answers.queue;
export type Tone = 'high' | 'low';

export type Magnitude = {
  count: Sourced<number>;
  denominator: Sourced<number>;
  /** The served count noun: "meals", "lows", "nights". */
  noun: string;
};

export type Cause = { title: string; count: number };

/** The open card's impact line: the Pattern's own episodes against the
 *  comparison episodes, at the peak (highs) or nadir (lows) of each cohort's
 *  median trace after the anchor. */
export type Impact = { kind: 'peak' | 'nadir'; own: Sourced<number>; typical: Sourced<number> };

export type PatternData = {
  title: string;
  tone: Tone;
  /** Null when the engine serves no count for this pattern. */
  magnitude: Magnitude | null;
  /** Pattern-scope cause shares, largest first. */
  causes: Cause[];
  /** The engine flags the pattern as too broad to rely on (ADR 485). */
  uncertain: boolean;
  pinned: boolean;
  /** Null when the engine serves no comparison for this pattern. */
  impact: Impact | null;
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
  /** Basal's night evidence: the count, each night's delivered rate, and the
   *  roster's own path, so the chart can name the nights beyond its axis. Null
   *  for ISF and I:C, whose evidence is not nights. */
  days: Sourced<number> | null;
  nights: { rate: Sourced<number> }[] | null;
  roster: string | null;
  /** The slot's change was detected and has matured into a Trial. */
  trial: boolean;
  /** The engine serves the card back from a Done the next sync found unchanged on the pump (#518). */
  notOnPump: boolean;
};

type Candidate = (typeof answers.queue)[QueueStore]['guidance']['candidates'][number];

/** The candidate's served Done state is Not on pump (#518). */
const notOnPump = (candidate: Candidate | undefined) =>
  (candidate?.acknowledgment as { state?: string } | null | undefined)?.state === 'not_on_pump';

const store = (name: QueueStore) => answers.queue[name];

/** The findings row a Pattern is read through, or none. A pattern that
 *  collapses to its one member is served as that member's habit row: the Queue
 *  reads it through that row, whose habit is its cause. */
function patternRow(name: QueueStore, key: string) {
  const s = store(name);
  const outcome = s.findings.outcome_patterns.find((p) => p.key === key);
  const member = outcome?.collapse === 'collapse_to_member' && outcome.action
    ? `finding:${outcome.action.split(':')[1]}` : null;
  const rowId = member ?? `pattern:${key}`;
  return { outcome, member, rowId, row: s.findings.rows.find((r) => r.id === rowId) };
}

export function pattern(name: QueueStore, key: string): PatternData {
  const root = `queue.${name}.findings`;
  const s = store(name);
  const id = `pattern:${key}`;
  const { outcome, member, rowId, row } = patternRow(name, key);
  if (!row) throw new Error(`${name} serves no ${rowId} row`);
  const rowPath = `${root}.rows[id=${rowId}].0`;
  const counted = Boolean(row.count_sentences?.length);
  const causes = member
    ? [{ title: row.title, count: row.count_sentences![0].count }]
    : s.findings.rows
      .filter((r) => r.claimed_by === id)
      .flatMap((r) => (r.fold_sentences ?? [])
        .filter((f) => f.scope === 'pattern')
        .map((f) => ({ title: r.title, count: f.count })))
      .sort((a, b) => b.count - a.count);
  const tone: Tone = row.chips?.includes('highs') ? 'high' : 'low';
  return {
    title: outcome?.title ?? row.title,
    tone,
    magnitude: counted
      ? {
          count: sourced(`${rowPath}.count_sentences.0.count`),
          denominator: sourced(`${rowPath}.count_sentences.0.denominator`),
          noun: row.count_sentences![0].noun,
        }
      : null,
    causes,
    uncertain: (outcome?.wide as boolean | null | undefined) === true,
    pinned: s.focus.focuses.some((f) => f.status === 'active' && f.pattern_key === key),
    impact: impact(name, key, tone),
  };
}

type CasePoint = { minute: number; median: number | null };

/** The impact pair from the Pattern's served case file, or null when it has
 *  none or either cohort's median is withheld. Each value is the served median
 *  at the minute where that cohort's trace peaks (or bottoms out) after the
 *  anchor, so the story check proves the printed number is that point. */
function impact(name: QueueStore, key: string, tone: Tone): Impact | null {
  const cases = store(name).cases as Record<string, {
    comparison: { state: string };
    cohorts: { key: string; points: CasePoint[] }[];
  }>;
  const served = cases[key];
  if (!served || served.comparison.state !== 'available') return null;
  const kind = tone === 'high' ? 'peak' : 'nadir';
  const extreme = (cohort: string): Sourced<number> | null => {
    const points = served.cohorts.find((c) => c.key === cohort)?.points
      .filter((p): p is { minute: number; median: number } => p.minute >= 0 && p.median !== null) ?? [];
    if (points.length === 0) return null;
    const at = points.reduce((best, p) => ((kind === 'peak' ? p.median > best.median : p.median < best.median) ? p : best));
    return sourced(`queue.${name}.cases.${key}.cohorts[key=${cohort}].0.points[minute=${at.minute}].0.median`, 'round');
  };
  const own = extreme('matched');
  const typical = extreme('comparison');
  return own && typical ? { kind, own, typical } : null;
}

/** The collapsed row's impact: the Pattern's own value against Typical, as
 *  printed (own − typical; the arrow carries the sign). Neutral: the engine
 *  judges neither cohort better or worse, so no colour (§2.5, 2026-10-14). */
export const impactChange = (impact: Impact): Change => delta(impact.typical, impact.own, undefined);

export function basalSetting(name: QueueStore, startMin: number): SettingData {
  const s = store(name);
  const row = s.findings.rows.find((r) => r.kind === 'setting' && r.parameter === 'basal_rate'
    && r.span?.start_min === startMin);
  if (!row) throw new Error(`${name} serves no basal block at ${startMin}`);
  const rowPath = `queue.${name}.findings.rows[id=${row.id}].0`;
  const slot = startMin / 30;
  const slotPath = `queue.${name}.analyze.basal[slot=${slot}].0`;
  const roster = s.analyze.basal.find((b) => b.slot === slot)!.evidence.night_roster;
  const candidate = s.guidance.candidates.find((c) => c.subject === 'setting:basal_rate')!;
  const span = row.span!;
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
    trial: s.trials.trials.some((t) => t.parameter === 'basal_rate' && t.state === 'complete'
      && maturedTrial(span, t)),
    notOnPump: notOnPump(candidate),
  };
}

/** The half-hours from `start` to `end`, wrapping midnight when `end` is not after `start`. */
function halfHours(start: number, end: number): Set<number> {
  const out = new Set<number>();
  for (let m = start; m < (end > start ? end : end + 1440); m += 30) out.add(m % 1440);
  return out;
}

/** Whether a queued basal block lies in a Trial: it shares a half-hour with the
 *  block the Trial is measured across (#506), not merely its starting slot, so a
 *  block that starts after the Trial's start still names it. A Trial served with
 *  no block is read at its one slot, or over the whole day when it has none. */
export function maturedTrial(span: { start_min: number; end_min: number },
  trial: { slot: string | null; block?: number[] | null }): boolean {
  let block = trial.block;
  if (!block) {
    const start = trial.slot ? Number(trial.slot.slice(0, 2)) * 60 + Number(trial.slot.slice(3, 5)) : 0;
    block = trial.slot ? [start, start + 30] : [0, 1440];
  }
  const inTrial = halfHours(block[0], block[1]);
  return [...halfHours(span.start_min, span.end_min)].some((m) => inTrial.has(m));
}


/** An I:C Setting, from its admitted findings row: its block, and its
 *  first member's current, suggested and estimate range, each printed as the
 *  pump profile prints that setting. Null when the findings serve no admitted
 *  row for it. Its evidence is not nights, so it has no night chart or count. */
export function otherSetting(name: QueueStore, parameter: 'carb_ratio'): SettingData | null {
  const s = store(name);
  const row = s.findings.rows.find((r) => r.kind === 'setting' && r.parameter === parameter && r.members?.length);
  const candidate = s.guidance.candidates.find((c) => c.subject === `setting:${parameter}`);
  if (!row?.span || !candidate?.units) return null;
  const rowPath = `queue.${name}.findings.rows[id=${row.id}].0`;
  const member = `${rowPath}.members.0`;
  const format = PARAMETER_FORMATS[parameter];
  return {
    title: PARAMETER_NAMES[parameter],
    units: candidate.units,
    start: sourced(`${rowPath}.span.start_min`, 'clock'),
    end: sourced(`${rowPath}.span.end_min`, 'clock'),
    current: sourced(`${member}.current`, format),
    suggested: sourced(`${member}.recommended`, format),
    estimate: sourced(`${member}.estimate.value`, format),
    lo: sourced(`${member}.estimate.lo`, format),
    hi: sourced(`${member}.estimate.hi`, format),
    days: null,
    nights: null,
    roster: null,
    trial: false,
    notOnPump: notOnPump(candidate),
  };
}

/** A queued ISF is the Overview's ISF card (§2.5, 2026-10-14) with the change
 *  the engine stages: its row prints current → recommended. */
export type IsfSettingData = IsfData & { title: string; recommended: Sourced<number>; notOnPump: boolean };

/** The queued ISF, from the store's analysis (the Overview's ISF card, over the
 *  engine's default window). Null when the analysis serves no estimate, or no
 *  recommendation: the engine stamps one only with its ISF staging verdict. */
export function isfSetting(name: QueueStore): IsfSettingData | null {
  const data = isfData(`queue.${name}.analyze.isf`, store(name).analyze.isf as IsfAnswer[]);
  if (data === 'none' || !data.recommended) return null;
  const candidate = store(name).guidance.candidates.find((c) => c.subject === 'setting:isf');
  return { ...data, title: PARAMETER_NAMES.isf, recommended: data.recommended, notOnPump: notOnPump(candidate) };
}

/** The story states the generator found in the served answers, by name. */
const states = () => answers.states;
type PatternState = 'multi_cause' | 'single_cause' | 'pinned' | 'uncertain';
type SettingState = 'setting' | 'setting_trial';

export function patternState(name: PatternState): PatternData {
  const { store, pattern: key } = states()[name];
  return pattern(store as QueueStore, key);
}

export function settingState(name: SettingState): SettingData {
  const { store, start_min: start } = states()[name];
  return basalSetting(store as QueueStore, start);
}

// --- The Queue screen --------------------------------------------------------

export type QueueItem =
  | { subject: string; kind: 'pattern'; data: PatternData }
  | { subject: string; kind: 'setting'; data: SettingData }
  | { subject: string; kind: 'isf'; data: IsfSettingData };

/** A candidate as its Queue component draws it, or null for one no Queue
 *  component draws (a kind the app does not know), or one whose served
 *  findings or analysis lack what its component reads. The candidates are served data: one
 *  the Queue cannot draw is left out, never fatal to the screen. */
function item(name: QueueStore, candidate: Candidate): QueueItem | null {
  const s = store(name);
  if (candidate.kind === 'pattern') {
    const key = candidate.subject.split(':')[1];
    return patternRow(name, key).row ? { subject: candidate.subject, kind: 'pattern', data: pattern(name, key) } : null;
  }
  if (candidate.subject === 'setting:basal_rate') {
    // The basal Setting opens on its admitted block, the earliest in the day.
    const starts = s.findings.rows.filter((r) => r.kind === 'setting' && r.parameter === 'basal_rate'
      && r.members?.length).map((r) => r.span!.start_min);
    if (starts.length === 0) return null;
    const start = Math.min(...starts);
    return s.analyze.basal.some((b) => b.slot === start / 30)
      ? { subject: candidate.subject, kind: 'setting', data: basalSetting(name, start) } : null;
  }
  if (candidate.subject === 'setting:isf') {
    const data = isfSetting(name);
    return data ? { subject: candidate.subject, kind: 'isf', data } : null;
  }
  if (candidate.subject === 'setting:carb_ratio') {
    const data = otherSetting(name, 'carb_ratio');
    return data ? { subject: candidate.subject, kind: 'setting', data } : null;
  }
  return null;
}

const drawn = <T>(value: T | null): value is T => value !== null;

/** The Queue's order (the brief's Queue section): the candidates the engine
 *  admitted and the person has not snoozed, by priority, highest first, an
 *  exact tie broken by subject as the engine breaks it. */
export function ranking(name: QueueStore): QueueItem[] {
  return store(name).guidance.candidates
    .filter((c) => c.queued)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.subject.localeCompare(b.subject))
    .map((c) => item(name, c)).filter(drawn);
}

/** How many the Queue holds, and how many are snoozed, as served counts. */
export const queuedCount = (name: QueueStore) => sourced<number>(`queue.${name}.guidance.candidates[queued=true].length`);
export const snoozedCount = (name: QueueStore) => sourced<number>(`queue.${name}.guidance.candidates[set_aside=true].length`);

export type SnoozedItem = QueueItem & { until: Sourced<string> };

/** The Snoozed list: each snoozed candidate as its Queue row reads it, until
 *  fourteen days after the engine's served decision time. */
export function snoozed(name: QueueStore): SnoozedItem[] {
  return store(name).guidance.candidates.filter((c) => c.set_aside).flatMap((c) => {
    const drawable = item(name, c);
    return drawable ? [{
      ...drawable,
      until: sourced<string>(`queue.${name}.guidance.candidates[subject=${c.subject}].0.decided_at`, 'until'),
    }] : [];
  });
}
