// The Changes components' data, read from the served stores (#483). As with
// queue-model.ts, every number ChangeCard prints is built here as a Sourced
// value naming its field; the state, the result and the End action all follow
// what the engine served, and nothing here invents a verdict.
//
// A store is one entry of `fixtures.changes`: its admission names the active
// change, and its trials hold that Trial with its comparison, and any Trial the
// person has ended (the last change).
import { fixtures, sourced, type Sourced } from './fixtures';

export type ChangesStore = keyof typeof fixtures.changes;
export type Result = 'better' | 'worse' | 'unclear';

/** One outcome's Before and After, named by its glossary metric. */
export type OutcomeRow = {
  key: 'tir' | 'tbr' | 'tar' | 'peak' | 'nadir';
  before: Sourced<number>;
  after: Sourced<number>;
  unit: string;
  /** The Trial's own target metric: the row its result reads. */
  target: boolean;
};

export type TrialData = {
  kind: 'trial';
  /** The parameter's served title and units, as the Queue names the setting. */
  title: string;
  units: string;
  slot: Sourced<string>;
  changedAt: Sourced<string>;
  before: Sourced<number>;
  after: Sourced<number>;
  daysElapsed: Sourced<number>;
  daysRequired: Sourced<number>;
  maturing: boolean;
  /** The target metric's verdict; null while the Trial matures. */
  result: Result | null;
  outcomes: OutcomeRow[];
  /** Served once the person has ended the Trial. */
  endedAt: Sourced<string> | null;
  /** The engine accepts End: a matured active Trial. */
  canEnd: boolean;
};

export type FocusData = {
  kind: 'focus';
  /** The watched habit's served title, and the pattern it was pinned from. */
  habit: string;
  pattern: string;
  pinnedAt: Sourced<string>;
  /** Collecting its after period: no after data yet, or fewer counted events
   *  than the engine's gate. */
  maturing: boolean;
  /** The after period's counted events against the gate ("2 / 12 meals"); null
   *  before any after data exists. */
  counted: { count: Sourced<number>; required: Sourced<number>; unit: string } | null;
  /** How often the habit happened, before and after the pin, as a share of the
   *  counted events; null before any after data exists. */
  adherence: { before: Sourced<number>; after: Sourced<number>; unit: string } | null;
  /** The engine's verdict on adherence; null while the Focus matures. */
  result: Result | null;
  /** The outcomes the Pattern maps to (peak, nadir), then the glossary metrics. */
  outcomes: OutcomeRow[];
};

export type ChangeData = TrialData | FocusData | { kind: 'none' };

// The engine's outcome keys that the glossary names; its other rows (rest
// windows with a low) have no glossary term and are not shown.
const OUTCOMES = ['tir', 'tbr', 'tar'] as const;
// A Focus's rows: the outcomes its Pattern maps to first, then those.
const FOCUS_OUTCOMES = ['peak', 'nadir', ...OUTCOMES] as const;

// The engine's assessment states, in the glossary's result words.
const RESULTS: Record<string, Result> = { favorable: 'better', concerning: 'worse', unclear: 'unclear' };

type FocusRow = {
  id: number;
  title: string;
  lever_title: string;
  tracking?: { availability: { state: string } } | {
    readiness: { unit: string; count: number; required: number; criterion_met: boolean };
    adherence: { assessment: { state: string } };
    outcomes: Outcome[];
  };
};

type Outcome = { key: string; unit: string; before: number; after: number; assessment?: { state: string } };
type TrialRow = {
  id: string;
  parameter: string;
  state: string;
  target_metrics: string[];
  ending: { kind?: string; effective_at?: string; assessment?: { outcomes: Outcome[] } };
  reassessment?: { outcomes: Outcome[] };
};

function outcomeRows(path: string, rows: readonly Outcome[], targets: readonly string[],
  keys: readonly OutcomeRow['key'][] = OUTCOMES): OutcomeRow[] {
  return keys.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return [];
    return [{
      key,
      // Glucose in whole mg/dL; the shares to one decimal.
      before: sourced<number>(`${path}[key=${key}].0.before`, row.unit === 'mg/dL' ? 'round' : 'fixed1'),
      after: sourced<number>(`${path}[key=${key}].0.after`, row.unit === 'mg/dL' ? 'round' : 'fixed1'),
      unit: row.unit,
      target: targets.includes(key),
    }];
  });
}

/** The active change: its Trial or Focus, or none. */
export function change(name: ChangesStore): ChangeData {
  const store = fixtures.changes[name];
  const root = `changes.${name}`;
  const { admission } = store;
  if (admission.active_kind === 'focus') {
    const focus = store.focuses.find((f) => f.id === admission.active_id)! as FocusRow;
    const path = `${root}.focuses[id=${focus.id}].0`;
    const tracking = focus.tracking;
    const tracked = tracking && 'readiness' in tracking ? tracking : null;
    const maturing = !tracked || !tracked.readiness.criterion_met;
    return {
      kind: 'focus',
      habit: focus.lever_title,
      pattern: focus.title,
      pinnedAt: sourced(`${path}.pinned_at`, 'date'),
      maturing,
      counted: tracked && {
        count: sourced(`${path}.tracking.readiness.count`),
        required: sourced(`${path}.tracking.readiness.required`),
        unit: tracked.readiness.unit,
      },
      adherence: tracked && {
        before: sourced(`${path}.tracking.adherence.before.rate`, 'pct1'),
        after: sourced(`${path}.tracking.adherence.after.rate`, 'pct1'),
        unit: tracked.readiness.unit,
      },
      result: tracked && !maturing ? RESULTS[tracked.adherence.assessment.state] ?? null : null,
      outcomes: tracked ? outcomeRows(`${path}.tracking.outcomes`, tracked.outcomes, [], FOCUS_OUTCOMES) : [],
    };
  }
  const trial = (store.trials as readonly TrialRow[]).find((t) => t.id === admission.active_id);
  return trial ? trialData(name, trial) : { kind: 'none' };
}

/** The last finished change: the Trial the person ended most recently, or null. */
export function lastChange(name: ChangesStore): TrialData | null {
  const ended = (fixtures.changes[name].trials as readonly TrialRow[])
    .filter((t) => t.ending.kind)
    .sort((a, b) => (b.ending.effective_at ?? '').localeCompare(a.ending.effective_at ?? ''));
  return ended[0] ? trialData(name, ended[0]) : null;
}

function trialData(name: ChangesStore, trial: TrialRow): TrialData {
  const store = fixtures.changes[name];
  const root = `changes.${name}`;
  const { admission } = store;
  const path = `${root}.trials[id=${trial.id}].0`;
  const ended = trial.ending.assessment ?? null;
  const compared = ended ? { path: `${path}.ending.assessment.outcomes`, rows: ended.outcomes }
    : trial.reassessment ? { path: `${path}.reassessment.outcomes`, rows: trial.reassessment.outcomes } : null;
  const target = compared?.rows.find((r) => trial.target_metrics.includes(r.key));
  const candidate = fixtures.queue.wearer.guidance.candidates.find((c) => c.subject === `setting:${trial.parameter}`);
  if (!candidate?.units) throw new Error(`the engine serves no title for ${trial.parameter}`);
  return {
    kind: 'trial',
    title: candidate.title,
    units: candidate.units,
    slot: sourced(`${path}.slot`),
    changedAt: sourced(`${path}.changed_at`, 'date'),
    // The engine serves no pump increment, so every U/h value prints at 2
    // decimals, as the SettingCard prints it.
    before: sourced(`${path}.before`, 'fixed2'),
    after: sourced(`${path}.after`, 'fixed2'),
    daysElapsed: sourced(`${path}.maturing.days_elapsed`),
    daysRequired: sourced(`${path}.maturing.days_required`),
    maturing: trial.state === 'maturing',
    result: target ? RESULTS[target.assessment?.state ?? ''] ?? null : null,
    outcomes: compared ? outcomeRows(compared.path, compared.rows, trial.target_metrics) : [],
    endedAt: ended ? sourced(`${path}.ending.effective_at`, 'date') : null,
    canEnd: admission.active_id === trial.id && admission.can_finish_trial,
  };
}
