// The Queue components' data, read from one served store (#483). This is the
// provenance table in code: every number a Queue component shows is built here
// as a Sourced value naming its field, and nothing here invents a threshold or
// a verdict — uncertain, pinned, matured, every chart's episodes and bands,
// every count, a Pattern's causes and whether a Focus can start are all served.
//
// A store is one entry of `answers.queue`; the screens will hand the same
// answers in from the live API.
import { answers, sourced, type Sourced } from './answers';
import { delta, type Change } from './direction';
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

/** The open card's impact line: the Pattern's own episodes against Typical,
 *  the comparison episodes, at the peak (highs) or nadir (lows) of each
 *  cohort's served median after the start (ADR 523). */
export type Impact = { kind: 'peak' | 'nadir'; own: Sourced<number>; typical: Sourced<number> };

/** One served 5-minute bin of a cohort: its median and 25–75 band. */
export type TraceBin = { minute: number; n: number; median: number; p25: number; p75: number };

/** The open card's trace chart, as the case file serves it (ADR 523): the
 *  start every episode is aligned at, the minutes drawn, the Pattern's (or a
 *  standalone habit's, ADR 528) own episodes (null when there are more than
 *  eight, which it then serves as its bins), and Typical's bins. */
export type TraceData = {
  anchor: 'bolus' | 'correction' | 'nadir' | 'meal_start';
  window: [number, number];
  tone: Tone;
  episodes: { minute: number; bg: number }[][] | null;
  pattern: TraceBin[];
  typical: TraceBin[];
};

/** An open Pattern card's data, or a standalone habit's: a habit the engine
 *  queues on its own, no Pattern owning it, is drawn by the same card (ADR 528),
 *  with no Uncertain (the engine serves none for a habit) and no impact line. */
export type PatternData = {
  kind: 'pattern' | 'habit';
  title: string;
  tone: Tone;
  /** Null when the engine serves no count for this pattern. */
  magnitude: Magnitude | null;
  /** Null when the engine serves no case file for this pattern. */
  traces: TraceData | null;
  /** The engine flags the pattern as too broad to rely on (ADR 485). */
  uncertain: boolean;
  pinned: boolean;
  /** Null when the engine serves no comparison for this pattern. */
  impact: Impact | null;
  /** The Pattern's counter serves more than one cause: its card opens the drill-down (ADR 594). */
  multiCause: boolean;
  /** The served title of the cause its active Focus watches, else null (ADR 594). */
  focusedCause: string | null;
};

/** A multi-cause Pattern's cause, as its drill-down card draws it (ADR 594): the
 *  cause's served title, its count over the Pattern's own, its own trace against
 *  the Pattern's Typical, whether the engine lets it be focused, and pinned while
 *  it is the Pattern's active Focus. */
export type CauseData = PatternData & { subject: string; lever: string; pinnable: boolean };

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
  /** What the chart's axis measures ("Basal", "I:C"). */
  axis: string;
  /** The evidence the estimate counts, as the stat row names it (Nights, Meal
   *  runs) with its served count; the chart's dots, one per item; and the
   *  served list's path and field, so the chart can name those beyond its axis. */
  count: { label: 'Nights' | 'Meal runs'; value: Sourced<number> };
  dots: { rate: Sourced<number> }[];
  roster: string;
  field: string;
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
 *  reads it through that row, which serves the pattern's own count and causes. */
function patternRow(name: QueueStore, key: string) {
  const s = store(name);
  const outcome = s.findings.outcome_patterns.find((p) => p.key === key);
  const member = outcome?.collapse === 'collapse_to_member' && outcome.action
    ? `finding:${outcome.action.split(':')[1]}` : null;
  const rowId = member ?? `pattern:${key}`;
  return { outcome, member, rowId, row: s.findings.rows.find((r) => r.id === rowId) };
}

type ServedCause = { subject: string; title: string; count: number; pinnable: boolean };
type Counter = { count_sentences?: { noun: string }[] | null; cause_counts?: ServedCause[] | null };

/** The object a Pattern's count and causes are served on, and its path: its own
 *  row, or, for a pattern served as its habit, that row's `served_as`, never the
 *  habit's own (ADR 520, ADR 594). */
function counterOf(name: QueueStore, key: string) {
  const found = patternRow(name, key);
  const { member, rowId, row } = found;
  if (!row) throw new Error(`${name} serves no ${rowId} row`);
  const rowPath = `queue.${name}.findings.rows[id=${rowId}].0`;
  return {
    ...found, row,
    counter: (member ? row.served_as : row) as Counter | null | undefined,
    path: member ? `${rowPath}.served_as` : rowPath,
  };
}

/** A Focus can start now: the served admission every Focus button follows (ADR 594). */
export const focusable = (name: QueueStore): boolean =>
  (store(name).focus as { admission?: { focus_pin?: { available?: boolean } } }).admission?.focus_pin?.available === true;

const activeFocus = (name: QueueStore, key: string) =>
  store(name).focus.focuses.find((f) => f.status === 'active' && f.pattern_key === key);

export function pattern(name: QueueStore, key: string): PatternData {
  const s = store(name);
  const { outcome, row, counter, path: countPath } = counterOf(name, key);
  const sentences = counter?.count_sentences;
  const causes = counter?.cause_counts ?? [];
  const tone: Tone = row.chips?.includes('highs') ? 'high' : 'low';
  const served = (s.cases as Record<string, { traces: ServedTraces }>)[key]?.traces;
  const focus = activeFocus(name, key);
  return {
    kind: 'pattern',
    title: outcome?.title ?? row.title,
    tone,
    magnitude: sentences?.length
      ? {
          count: sourced(`${countPath}.count_sentences.0.count`),
          denominator: sourced(`${countPath}.count_sentences.0.denominator`),
          noun: sentences[0].noun,
        }
      : null,
    traces: served ? traceData(served, tone) : null,
    uncertain: (outcome?.wide as boolean | null | undefined) === true,
    pinned: focus !== undefined,
    impact: served ? impact(name, key, tone, served) : null,
    multiCause: causes.length > 1,
    focusedCause: (focus && causes.find((c) => c.subject === `habit:${focus.lever}`)?.title) ?? null,
  };
}

/** A multi-cause Pattern's causes, in the order the engine serves them, never
 *  sorted, filtered or re-counted (ADR 594). Each count is over the Pattern's own
 *  count and noun, and each trace is the served one with the cause's subject,
 *  against the Pattern's Typical, so the card's count and chart read one
 *  population. */
export function causes(name: QueueStore, key: string): CauseData[] {
  const { counter, path } = counterOf(name, key);
  const { tone } = pattern(name, key);
  const focus = activeFocus(name, key);
  const served = (store(name).cases as Record<string, { traces: ServedTraces }>)[key]?.traces;
  return (counter?.cause_counts ?? []).map((cause, i) => {
    const drawn = served?.causes?.find((c) => c.subject === cause.subject);
    const lever = cause.subject.replace(/^habit:/, '');
    return {
      kind: 'habit',
      subject: cause.subject,
      lever,
      title: cause.title,
      tone,
      magnitude: {
        count: sourced(`${path}.cause_counts.${i}.count`),
        denominator: sourced(`${path}.count_sentences.0.count`),
        noun: counter!.count_sentences![0].noun,
      },
      traces: served && drawn ? traceData({ ...served, pattern: drawn.pattern }, tone) : null,
      uncertain: false,
      pinned: focus?.lever === lever,
      impact: null,
      pinnable: cause.pinnable,
      multiCause: false,
      focusedCause: null,
    };
  });
}

type ServedTraces = {
  anchor: TraceData['anchor'];
  window_min: [number, number];
  pattern: { episodes: TraceData['episodes']; points: TraceBin[] };
  typical: { points: TraceBin[] };
  /** A Pattern's own trace per cause, in the engine's order (ADR 593). */
  causes?: { subject: string; pattern: ServedTraces['pattern'] }[];
};

const traceData = (served: ServedTraces, tone: Tone): TraceData => ({
  anchor: served.anchor, window: served.window_min, tone,
  episodes: served.pattern.episodes, pattern: served.pattern.points, typical: served.typical.points,
});

/** A standalone habit's case file, as its card reads it (ADR 528): the habit's
 *  own claimed episodes of its denominator, and its trace chart. */
type HabitCase = { summary: { claimed: number; denominator: number; noun: string }; traces: ServedTraces };

/** A standalone habit the engine queues on its own (ADR 528), drawn as a
 *  Pattern is: its served title, the count its case file serves (the same
 *  population its chart draws), the trace chart, and its Focus, keyed by the
 *  habit's own subject. Its tone is its findings row's, as a Pattern's is. Null
 *  when the findings or the case files serve nothing for it. */
export function habit(name: QueueStore, subject: string): PatternData | null {
  const s = store(name);
  const key = subject.split(':')[1];
  const served = (s.cases as Record<string, HabitCase | undefined>)[key];
  const row = s.findings.rows.find((r) => r.id === `finding:${key}`);
  const candidate = s.guidance.candidates.find((c) => c.subject === subject);
  if (!served?.summary || !row || !candidate) return null;
  const tone: Tone = row.chips?.includes('highs') ? 'high' : 'low';
  const path = `queue.${name}.cases.${key}.summary`;
  return {
    kind: 'habit',
    title: candidate.title,
    tone,
    magnitude: {
      count: sourced(`${path}.claimed`), denominator: sourced(`${path}.denominator`), noun: served.summary.noun,
    },
    traces: traceData(served.traces, tone),
    uncertain: false,
    pinned: s.focus.focuses.some((f) => f.status === 'active' && f.subject === subject),
    impact: null,
    multiCause: false,
    focusedCause: null,
  };
}

/** The impact pair from the Pattern's served trace chart, or null when either
 *  cohort serves no bin from the start on. Each value is the served median at
 *  the minute where that cohort's median peaks (or bottoms out) after the
 *  start, so the story check proves the printed number is that bin's. */
function impact(name: QueueStore, key: string, tone: Tone, served: ServedTraces): Impact | null {
  const kind = tone === 'high' ? 'peak' : 'nadir';
  const extreme = (cohort: 'pattern' | 'typical'): Sourced<number> | null => {
    const points = served[cohort].points.filter((p) => p.minute >= 0);
    if (points.length === 0) return null;
    const at = points.reduce((best, p) => ((kind === 'peak' ? p.median > best.median : p.median < best.median) ? p : best));
    return sourced(`queue.${name}.cases.${key}.traces.${cohort}.points[minute=${at.minute}].0.median`, 'round');
  };
  const own = extreme('pattern');
  const typical = extreme('typical');
  return own && typical ? { kind, own, typical } : null;
}

/** The collapsed row's impact: the Pattern's own value against Typical, as
 *  printed (own − typical; the arrow carries the sign), green or red by the
 *  way a Peak or a Nadir is better (§2.5, 2026-10-19). */
export const impactChange = (impact: Impact): Change => delta(impact.typical, impact.own, impact.kind);

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
    axis: 'Basal',
    count: { label: 'Nights', value: sourced(`${slotPath}.days`) },
    dots: roster.map((_, i) => ({ rate: sourced(`${slotPath}.evidence.night_roster.${i}.delivered_rate`) })),
    roster: `${slotPath}.evidence.night_roster`,
    field: 'delivered_rate',
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

type IcBlock = { block_id: number; start_min: number; evidence: { counted_runs: unknown[] } };

/** The I:C Setting: the carb-ratio block the engine stages a move for (the
 *  earliest, when it stages several), its programmed ratio, the
 *  recommendation, the estimate in its range, each printed as the pump
 *  profile prints the setting, and the meal runs that estimate counts — the
 *  chart's dots and the Meal runs count are that one served list (ADR 523).
 *  Null when the analysis serves no such block or the guidance no unit. */
export function carbRatioSetting(name: QueueStore): SettingData | null {
  const s = store(name);
  const blocks = ((s.analyze as { ic_blocks?: IcBlock[] }).ic_blocks ?? []);
  const block = [...blocks].sort((a, b) => a.start_min - b.start_min)[0];
  const candidate = s.guidance.candidates.find((c) => c.subject === 'setting:carb_ratio');
  if (!block || !candidate?.units) return null;
  const path = `queue.${name}.analyze.ic_blocks[block_id=${block.block_id}].0`;
  const format = PARAMETER_FORMATS.carb_ratio;
  return {
    title: PARAMETER_NAMES.carb_ratio,
    units: candidate.units,
    start: sourced(`${path}.start_min`, 'clock'),
    end: sourced(`${path}.end_min`, 'clock'),
    current: sourced(`${path}.current_values.0`, format),
    suggested: sourced(`${path}.recommended`, format),
    estimate: sourced(`${path}.estimate.value`, format),
    lo: sourced(`${path}.estimate.lo`, format),
    hi: sourced(`${path}.estimate.hi`, format),
    axis: 'I:C',
    count: { label: 'Meal runs', value: sourced(`${path}.evidence.counted_runs.length`) },
    dots: block.evidence.counted_runs.map((_, i) => ({ rate: sourced(`${path}.evidence.counted_runs.${i}.true_ic`) })),
    roster: `${path}.evidence.counted_runs`,
    field: 'true_ic',
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
type PatternState = 'traces_episodes' | 'traces_band' | 'traces_gap' | 'pinned' | 'uncertain'
  | 'drill_down' | 'drill_down_pinned' | 'drill_down_unpinnable' | 'focusable';
type HabitState = 'habit_episodes' | 'habit_band' | 'habit_pinned';
type SettingState = 'setting' | 'setting_trial';

export function patternState(name: PatternState): PatternData {
  const { store, pattern: key } = patternStore(name);
  return pattern(store, key);
}

/** A Pattern's story state: its store and key. */
export function patternStore(name: PatternState): { store: QueueStore; pattern: string } {
  const { store, pattern: key } = states()[name];
  return { store: store as QueueStore, pattern: key };
}

/** A standalone habit's story state (ADR 528): its store and subject. */
export function habitState(name: HabitState): { store: QueueStore; subject: string; data: PatternData } {
  const { store, subject } = states()[name] as { store: QueueStore; subject: string };
  return { store, subject, data: habit(store, subject)! };
}

export function settingState(name: SettingState): SettingData {
  const { store, start_min: start } = states()[name];
  return basalSetting(store as QueueStore, start);
}

// --- The Queue screen --------------------------------------------------------

export type QueueItem =
  | { subject: string; kind: 'pattern' | 'habit'; data: PatternData }
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
  if (candidate.kind === 'habit') {
    const data = habit(name, candidate.subject);
    return data ? { subject: candidate.subject, kind: 'habit', data } : null;
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
    const data = carbRatioSetting(name);
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
