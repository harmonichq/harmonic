// The Changes components' data, read from the served stores (#483, #524). As
// with queue-model.ts, every number the screen prints is built here as a
// Sourced value naming its field; the state, the result and the End action all
// follow what the engine served, and nothing here invents a verdict or computes
// a statistic: the traces, the metrics, the meal counts and Control-IQ's
// delivery are the active Trial's served comparison, read as they come.
//
// A store is one entry of `answers.changes`: its admission names the active
// change; its trials hold every Trial on the roster, the active one with its
// retained comparison; its focuses hold the Focus records.
//
// `ending`: the screen has confirmed End and the engine has not answered yet
// (ADR 630). The store is read as if its admission named no active change, so
// the change just ended is a previous one; its result is read only from a saved
// ending, which the active record does not have.
import { answers, sourced, type Sourced } from './answers';
import { delta, type Change } from './direction';
import { PARAMETER_FORMATS, PARAMETER_NAMES, PARAMETER_UNITS } from './settings-model';

export type ChangesStore = keyof typeof answers.changes;
export type Result = 'better' | 'worse' | 'unclear';

/** One metric's Before and After, named by its glossary term. */
export type OutcomeRow = {
  key: 'tir' | 'tbr' | 'tar' | 'peak' | 'nadir' | 'mean' | 'gmi' | 'cv' | 'delivered' | 'above' | 'below';
  before: Sourced<number>;
  after: Sourced<number>;
  unit: string;
  /** The Trial's own target metric: the row its result reads. */
  target: boolean;
  /** After against before, green or red by the way it moved for its metric
   *  (direction.ts); the engine's verdict is the result pill's, never this. */
  delta: Change;
};

/** One of a Trial's metric rows (#554): its after is null while the after arm
 *  has no reading yet, and its Δ with it. */
export type MetricRow = Omit<OutcomeRow, 'after' | 'delta'> & { after: Sourced<number> | null; delta: Change | null };

/** How many readings a module's rows are read from, before and after. */
export type Count = { before: Sourced<number>; after: Sourced<number> };

/** A time block, its start and end in minutes since midnight. */
export type Block = { start: Sourced<number>; end: Sourced<number> };

/** One setting a Trial moved, as the pump profile prints it: its name, where
 *  in the day (the block's or the setting's first changed start), and the
 *  value before → after. */
export type Move = {
  name: string | null;
  slot: Sourced<string> | null;
  before: Sourced<number>;
  after: Sourced<number>;
  units: string;
};

/** One arm of the glucose trace, as served: the band and median per bin, or,
 *  under three episodes, each episode on its own. Chart geometry, never printed. */
export type TraceArm = {
  episodes: Sourced<number>;
  /** The arm's meals, the population Meals before / after count, when the
   *  engine left any of them off the trace for want of a reading before the
   *  bolus (#575): the legend prints its episodes against them ("71 of 74").
   *  Null when every meal is drawn, and for a clock trace. */
  of: Sourced<number> | null;
  bins: { t: number; median: number; p25: number; p75: number }[];
  traces: { t: number; bg: number }[][] | null;
};

export type Trace = {
  /** By clock time across the block, or from each in-block meal bolus. */
  alignment: 'clock' | 'meal';
  /** The block's start (a clock trace), in minutes since midnight. */
  startMin: number;
  /** The span drawn, in minutes from the alignment point. */
  start: number;
  end: number;
  /** What one episode is: a night of the block, a day, or a meal. */
  episode: 'nights' | 'days' | 'meals';
  before: TraceArm;
  after: TraceArm;
};

export type TrialData = {
  kind: 'trial';
  /** What changed, by its name: the setting's glossary name, "Pump profile"
   *  for a whole-profile switch, "Target" for the target; null for a parameter
   *  the engine serves that the app has no name for. */
  title: string | null;
  /** The block the Trial is measured across; null for a whole-day change. */
  block: Block | null;
  changedAt: Sourced<string>;
  /** What moved, before → after: one setting, or each a profile switch moved. */
  moves: Move[];
  daysElapsed: Sourced<number>;
  daysRequired: Sourced<number>;
  /** A carb ratio Trial's in-block meals, before and after; null otherwise. */
  meals: { before: Sourced<number>; after: Sourced<number> } | null;
  maturing: boolean;
  /** The target metric's verdict; null while the Trial matures. */
  result: Result | null;
  /** The before-vs-after glucose trace; null without a served comparison. */
  trace: Trace | null;
  /** In range, Below 70, Above 180. */
  ranges: MetricRow[];
  /** Mean, GMI, CV. */
  glucose: MetricRow[];
  /** The readings those rows are read from, before and after; null without a
   *  served comparison. */
  readings: Count | null;
  /** A basal Trial: Control-IQ's delivery against the programmed rate. */
  basal: MetricRow[];
  /** The engine accepts End: a matured active Trial. */
  canEnd: boolean;
};

export type FocusData = {
  kind: 'focus';
  /** The watched habit's served title, and the pattern it was pinned from:
   *  none for a Focus pinned on a standalone habit (ADR 528). */
  habit: string;
  pattern: string | null;
  pinnedAt: Sourced<string>;
  /** Collecting its after period: no after data yet, or fewer counted events
   *  than the engine's gate. */
  maturing: boolean;
  /** The after period's counted events against the gate ("2 / 12 meals"); null
   *  before any after data exists. */
  counted: { count: Sourced<number>; required: Sourced<number>; unit: string } | null;
  /** How often the habit happened, before and after the pin, as a share of the
   *  counted events; null before any after data exists. */
  adherence: { before: Sourced<number>; after: Sourced<number>; unit: string; delta: Change } | null;
  /** The engine's verdict on adherence; null while the Focus matures. */
  result: Result | null;
  /** The outcomes the Pattern maps to (peak, nadir), then the glossary metrics. */
  outcomes: OutcomeRow[];
};

export type ChangeData = TrialData | FocusData | { kind: 'none' };

/** One previous change, as the Previous list prints it. */
export type PreviousRow = {
  id: string;
  /** A Trial's setting name (as TrialData's title), or a Focus's Pattern. */
  title: string | null;
  block: Block | null;
  moves: Move[];
  date: Sourced<string>;
  /** The verdict its ending saved, where it saved one. */
  result: Result | null;
};

// A Focus's rows: the outcomes its Pattern maps to first, then the ranges.
const FOCUS_OUTCOMES = ['peak', 'nadir', 'tir', 'tbr', 'tar'] as const;
const RANGES = ['tir', 'tbr', 'tar'] as const;
const GLUCOSE = ['mean', 'gmi', 'cv'] as const;

// The engine's assessment states, in the glossary's result words.
const RESULTS: Record<string, Result> = { favorable: 'better', concerning: 'worse', unclear: 'unclear' };

type Outcome = { key: string; unit: string; before: number | null; after: number | null; assessment?: { state: string } };
type TraceServed = {
  alignment: 'clock' | 'meal'; start_min?: number; start: number; end: number; episodes: number; left_off: number;
  bins: TraceArm['bins']; traces: TraceArm['traces'];
};
type Basal = { delivered: number; programmed: number; above: number; below: number };
type Arm = 'before' | 'after';
type Comparison = {
  availability: { state: string };
  outcomes: Outcome[];
  denominators: Partial<Record<Arm, { contributing_meals: number }>>;
  views: Partial<Record<Arm, { trace: TraceServed; basal?: Basal | null }>>;
};
type TrialRow = {
  id: string;
  parameter: string;
  slot: string | null;
  before: number | null;
  after: number | null;
  block: [number, number] | null;
  changed_at: string;
  state: string;
  target_metrics: string[];
  changes?: { parameter: string; slot: string; before: number; after: number }[];
  ending: { kind?: string; effective_at?: string; assessment?: { outcomes: Outcome[] } };
  reassessment?: Comparison;
};
type FocusRow = {
  id: number;
  /** Served only for a Focus pinned from a Pattern. */
  pattern_key?: string | null;
  title: string;
  lever_title: string;
  pinned_at: string;
  status: string;
  tracking?: { availability: { state: string } } | {
    readiness: { unit: string; count: number; required: number; criterion_met: boolean };
    adherence: { assessment: { state: string } };
    outcomes: Outcome[];
  };
  ending?: { kind: string; effective_at: string; assessment: { adherence?: { assessment: { state: string } } } };
};

const trialsOf = (name: ChangesStore) => answers.changes[name].trials as readonly TrialRow[];
const focusesOf = (name: ChangesStore) => answers.changes[name].focuses as readonly FocusRow[];

// Glucose in whole mg/dL; the shares, GMI and CV to one decimal.
function outcomeRows(path: string, rows: readonly Outcome[], targets: readonly string[],
  keys: readonly OutcomeRow['key'][]): OutcomeRow[] {
  return keys.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    if (!row || row.before === null || row.after === null) return [];
    const format = row.unit === 'mg/dL' ? 'round' : 'fixed1';
    const before = sourced<number>(`${path}[key=${key}].0.before`, format);
    const after = sourced<number>(`${path}[key=${key}].0.after`, format);
    return [{ key, before, after, unit: row.unit, target: targets.includes(key), delta: delta(before, after, key) }];
  });
}

/** A Trial's metric rows, each read as its comparison is collected (#554):
 *  every row with a before, its after and Δ as far as the after arm has one,
 *  the Δ coloured by its direction whether or not the Trial has matured
 *  (§2.5, 2026-10-19). */
function metricRows(path: string, rows: readonly Outcome[], targets: readonly string[],
  keys: readonly OutcomeRow['key'][]): MetricRow[] {
  return keys.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    if (!row || row.before === null) return [];
    const format = row.unit === 'mg/dL' ? 'round' : 'fixed1';
    const before = sourced<number>(`${path}[key=${key}].0.before`, format);
    const after = row.after === null ? null : sourced<number>(`${path}[key=${key}].0.after`, format);
    return [{ key, before, after, unit: row.unit, target: targets.includes(key),
      delta: after && delta(before, after, key) }];
  });
}

/** A basal Trial's Control-IQ rows: the delivered rate, and the share of the
 *  time above and below the programmed rate. Neither way is better for any of
 *  them, so their Δ stays neutral. */
function basalRows(path: string, views: Comparison['views']): MetricRow[] {
  if (!views.before?.basal) return [];
  // An after arm with no delivery read yet serves none (#554): its column stays empty.
  const read = Boolean(views.after?.basal);
  return (['delivered', 'above', 'below'] as const).map((key) => {
    // The delivered rate as the pump profile prints basal; the shares to one decimal.
    const format = key === 'delivered' ? 'fixed2' : 'fixed1';
    const before = sourced<number>(`${path}.views.before.basal.${key}`, format);
    const after = read ? sourced<number>(`${path}.views.after.basal.${key}`, format) : null;
    return { key, before, after, unit: key === 'delivered' ? 'U/h' : '%', target: false,
      delta: after && delta(before, after, key) };
  });
}

/** One arm's trace. A meal the engine left off still counts among the arm's
 *  meals (ADR 554), so an arm that left any off names that count beside its
 *  episodes: one population, the head card's, on both (#575). */
function traceArm(path: string, arm: Arm, served: TraceServed): TraceArm {
  return {
    episodes: sourced(`${path}.views.${arm}.trace.episodes`),
    of: served.left_off > 0 ? sourced(`${path}.denominators.${arm}.contributing_meals`) : null,
    bins: served.bins,
    traces: served.traces,
  };
}

function trace(path: string, parameter: string, views: Comparison['views']): Trace | null {
  const before = views.before?.trace;
  const after = views.after?.trace;
  if (!before || !after) return null;
  return {
    alignment: before.alignment,
    startMin: before.start_min ?? 0,
    start: before.start,
    end: before.end,
    episode: before.alignment === 'meal' ? 'meals' : parameter === 'profile' ? 'days' : 'nights',
    before: traceArm(path, 'before', before),
    after: traceArm(path, 'after', after),
  };
}

/** What a Trial changed that is not a profile setting: a whole-profile switch
 *  (§1.5 Pump profile), and the pump's target. */
const TRIAL_NAMES: Record<string, { title: string; units?: string }> = {
  profile: { title: 'Pump profile' },
  target_bg: { title: 'Target', units: 'mg/dL' },
};

const nameOf = (parameter: string) =>
  PARAMETER_NAMES[parameter as keyof typeof PARAMETER_NAMES] ?? TRIAL_NAMES[parameter]?.title ?? null;
const unitsOf = (parameter: string) =>
  PARAMETER_UNITS[parameter as keyof typeof PARAMETER_UNITS] ?? TRIAL_NAMES[parameter]?.units ?? null;
const formatOf = (parameter: string) => PARAMETER_FORMATS[parameter as keyof typeof PARAMETER_FORMATS];

/** What a Trial moved: its own setting's pair, or each setting a profile
 *  switch moved. A parameter the app cannot print, or a pair the engine does
 *  not serve, is left out, never failed on. */
function moves(path: string, trial: TrialRow): Move[] {
  if (trial.changes) {
    return trial.changes.flatMap((change) => {
      const units = unitsOf(change.parameter);
      const format = formatOf(change.parameter);
      if (!units || !format) return [];
      const at = `${path}.changes[parameter=${change.parameter}].0`;
      return [{ name: nameOf(change.parameter), slot: sourced<string>(`${at}.slot`),
        before: sourced<number>(`${at}.before`, format), after: sourced<number>(`${at}.after`, format), units }];
    });
  }
  const units = unitsOf(trial.parameter);
  const format = formatOf(trial.parameter);
  if (!units || !format || trial.before === null || trial.after === null) return [];
  return [{ name: nameOf(trial.parameter), slot: trial.slot ? sourced(`${path}.slot`) : null,
    before: sourced(`${path}.before`, format), after: sourced(`${path}.after`, format), units }];
}

const blockOf = (path: string, trial: TrialRow): Block | null => (trial.block
  ? { start: sourced(`${path}.block.0`, 'clock'), end: sourced(`${path}.block.1`, 'clock') } : null);

function trialData(name: ChangesStore, trial: TrialRow): TrialData {
  const { admission } = answers.changes[name];
  const path = `changes.${name}.trials[id=${trial.id}].0`;
  const comparison = trial.reassessment?.availability.state === 'available' ? trial.reassessment : null;
  const compared = `${path}.reassessment`;
  const target = comparison?.outcomes.find((r) => trial.target_metrics.includes(r.key));
  const maturing = trial.state === 'maturing';
  const meals = trial.parameter === 'carb_ratio' && comparison?.denominators.before && comparison.denominators.after;
  return {
    kind: 'trial',
    title: nameOf(trial.parameter),
    block: blockOf(path, trial),
    changedAt: sourced(`${path}.changed_at`, 'date'),
    moves: moves(path, trial),
    daysElapsed: sourced(`${path}.maturing.days_elapsed`),
    daysRequired: sourced(`${path}.maturing.days_required`),
    meals: meals ? {
      before: sourced(`${compared}.denominators.before.contributing_meals`),
      after: sourced(`${compared}.denominators.after.contributing_meals`),
    } : null,
    maturing,
    result: !maturing && target ? RESULTS[target.assessment?.state ?? ''] ?? null : null,
    trace: comparison ? trace(compared, trial.parameter, comparison.views) : null,
    ranges: comparison
      ? metricRows(`${compared}.outcomes`, comparison.outcomes, trial.target_metrics, RANGES) : [],
    glucose: comparison ? metricRows(`${compared}.outcomes`, comparison.outcomes, [], GLUCOSE) : [],
    readings: comparison ? {
      before: sourced(`${compared}.outcomes[key=tir].0.denominators.before`),
      after: sourced(`${compared}.outcomes[key=tir].0.denominators.after`),
    } : null,
    basal: comparison ? basalRows(compared, comparison.views) : [],
    canEnd: admission.active_id === trial.id && admission.can_finish_trial,
  };
}

// How often the habit happened: the habit happening less is the good way.
function adherence(path: string, unit: string): NonNullable<FocusData['adherence']> {
  const before = sourced<number>(`${path}.tracking.adherence.before.rate`, 'pct1');
  const after = sourced<number>(`${path}.tracking.adherence.after.rate`, 'pct1');
  return { before, after, unit, delta: delta(before, after, 'habit') };
}

/** The store's admission, or, while End is in flight, one naming no active change. */
const admitted = (name: ChangesStore, ending: boolean) => {
  const { admission } = answers.changes[name];
  return ending ? { ...admission, active_id: null, active_kind: null } : admission;
};

/** The active change: its Trial or Focus, or none. */
export function change(name: ChangesStore, ending = false): ChangeData {
  const admission = admitted(name, ending);
  if (admission.active_kind === 'focus') {
    const focus = focusesOf(name).find((f) => f.id === admission.active_id)!;
    const path = `changes.${name}.focuses[id=${focus.id}].0`;
    const tracking = focus.tracking;
    const tracked = tracking && 'readiness' in tracking ? tracking : null;
    const maturing = !tracked || !tracked.readiness.criterion_met;
    return {
      kind: 'focus',
      habit: focus.lever_title,
      pattern: focus.pattern_key ? focus.title : null,
      pinnedAt: sourced(`${path}.pinned_at`, 'date'),
      maturing,
      counted: tracked && {
        count: sourced(`${path}.tracking.readiness.count`),
        required: sourced(`${path}.tracking.readiness.required`),
        unit: tracked.readiness.unit,
      },
      adherence: tracked && adherence(path, tracked.readiness.unit),
      result: tracked && !maturing ? RESULTS[tracked.adherence.assessment.state] ?? null : null,
      outcomes: tracked ? outcomeRows(`${path}.tracking.outcomes`, tracked.outcomes, [], FOCUS_OUTCOMES) : [],
    };
  }
  const trial = trialsOf(name).find((t) => t.id === admission.active_id);
  return trial ? trialData(name, trial) : { kind: 'none' };
}

/** A Setting a Done left waiting for the pump (#518), drawn as a Previous row
 *  is: its name, its block (none when the setting has none), and the value it
 *  was Done from → the suggestion, as one move in the list's shared columns. */
export type WaitingRow = {
  subject: string;
  title: string;
  block: Block | null;
  moves: Move[];
};

type WaitingAnswer = {
  subject: string; parameter: string;
  acknowledgment: { blocks: { start_min: number; end_min: number; units: string }[] };
};

/** Each Setting waiting for the pump, as the engine serves it and its Queue card
 *  showed it: the span of its first run of adjacent blocks, with the first
 *  block's current → suggested. */
export function waiting(name: ChangesStore): WaitingRow[] {
  const rows = (answers.changes[name] as { waiting?: readonly WaitingAnswer[] }).waiting ?? [];
  return rows.filter((row) => row.acknowledgment.blocks.length > 0).map((row) => {
    const blocks = `changes.${name}.waiting[subject=${row.subject}].0.acknowledgment.blocks`;
    const served = row.acknowledgment.blocks;
    let last = 0;
    while (last + 1 < served.length && served[last + 1].start_min === served[last].end_min) last += 1;
    const parameter = row.parameter as keyof typeof PARAMETER_NAMES;
    const format = PARAMETER_FORMATS[parameter];
    return {
      subject: row.subject,
      title: PARAMETER_NAMES[parameter],
      block: parameter === 'isf' ? null
        : { start: sourced(`${blocks}.0.start_min`, 'clock'), end: sourced(`${blocks}.${last}.end_min`, 'clock') },
      moves: [{ name: null, slot: null, before: sourced(`${blocks}.0.current`, format),
        after: sourced(`${blocks}.0.recommended`, format), units: served[0].units }],
    };
  });
}

/** How many previous changes there are: every Trial and Focus the store holds
 *  (the active Focus and the ended ones), less the active change. */
export function previousCount(name: ChangesStore, ending = false): Sourced<number> {
  const root = `changes.${name}`;
  const active = admitted(name, ending).active_id === null ? '' : ' − 1';
  return sourced(`${root}.trials.length + ${root}.focuses.length${active}`);
}

/** Every change but the active one, newest first: each Trial on the roster and
 *  each ended Focus, and while End is in flight the Focus it ends. All of them;
 *  the list has no cutoff. */
export function previousChanges(name: ChangesStore, ending = false): PreviousRow[] {
  const { admission } = answers.changes[name];
  const activeId = admitted(name, ending).active_id;
  const root = `changes.${name}`;
  const trials = trialsOf(name).filter((t) => t.id !== activeId).map((trial): PreviousRow => {
    const path = `${root}.trials[id=${trial.id}].0`;
    const saved = trial.ending.assessment?.outcomes.find((r) => trial.target_metrics.includes(r.key));
    return { id: trial.id, title: nameOf(trial.parameter), block: blockOf(path, trial), moves: moves(path, trial),
      date: sourced(`${path}.changed_at`, 'date'), result: RESULTS[saved?.assessment?.state ?? ''] ?? null };
  });
  const ended = (f: FocusRow) => f.ending || (ending && admission.active_kind === 'focus' && f.id === admission.active_id);
  const focuses = focusesOf(name).filter(ended).map((focus): PreviousRow => {
    const path = `${root}.focuses[id=${focus.id}].0`;
    const state = focus.ending?.assessment.adherence?.assessment.state;
    return { id: `focus-${focus.id}`, title: focus.title, block: null, moves: [],
      date: sourced(`${path}.pinned_at`, 'date'), result: RESULTS[state ?? ''] ?? null };
  });
  return [...trials, ...focuses].sort((a, b) => String(b.date.value).localeCompare(String(a.date.value)));
}
