// The Changes components' data, read from the served stores (#483). As with
// queue-model.ts, every number ChangeCard prints is built here as a Sourced
// value naming its field; the state, the result and the End action all follow
// what the engine served, and nothing here invents a verdict.
//
// A store is one entry of `fixtures.changes`: its admission names the active
// change, and its trials hold that Trial (or the Trial just ended) with its
// comparison.
import { fixtures, sourced, type Sourced } from './fixtures';

export type ChangesStore = keyof typeof fixtures.changes;
export type Result = 'better' | 'worse' | 'unclear';

/** One outcome's Before and After, named by its glossary metric. */
export type OutcomeRow = {
  key: 'tir' | 'tbr' | 'tar';
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
};

export type ChangeData = TrialData | FocusData | { kind: 'none' };

// The engine's outcome keys that the glossary names; its other rows (rest
// windows with a low) have no glossary term and are not shown.
const OUTCOMES = ['tir', 'tbr', 'tar'] as const;

// The engine's assessment states, in the glossary's result words.
const RESULTS: Record<string, Result> = { favorable: 'better', concerning: 'worse', unclear: 'unclear' };

type Outcome = { key: string; unit: string; before: number; after: number; assessment: { state: string } };
type TrialRow = {
  id: string;
  parameter: string;
  state: string;
  target_metrics: string[];
  ending: { kind?: string; assessment?: { outcomes: Outcome[] } };
  reassessment?: { outcomes: Outcome[] };
};

function outcomeRows(path: string, rows: readonly Outcome[], targets: readonly string[]): OutcomeRow[] {
  return OUTCOMES.flatMap((key) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return [];
    return [{
      key,
      before: sourced<number>(`${path}[key=${key}].0.before`, 'fixed1'),
      after: sourced<number>(`${path}[key=${key}].0.after`, 'fixed1'),
      unit: row.unit,
      target: targets.includes(key),
    }];
  });
}

export function change(name: ChangesStore): ChangeData {
  const store = fixtures.changes[name];
  const root = `changes.${name}`;
  const { admission } = store;
  if (admission.active_kind === 'focus') {
    const focus = store.focuses.find((f) => f.id === admission.active_id)!;
    return {
      kind: 'focus',
      habit: focus.lever_title,
      pattern: focus.title,
      pinnedAt: sourced(`${root}.focuses[id=${focus.id}].0.pinned_at`, 'date'),
    };
  }
  // The active Trial, or else the Trial this store has just ended.
  const trials = store.trials as readonly TrialRow[];
  const trial = trials.find((t) => t.id === admission.active_id) ?? trials.find((t) => t.ending.kind);
  if (!trial) return { kind: 'none' };
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
    result: target ? RESULTS[target.assessment.state] ?? null : null,
    outcomes: compared ? outcomeRows(compared.path, compared.rows, trial.target_metrics) : [],
    endedAt: ended ? sourced(`${path}.ending.effective_at`, 'date') : null,
    canEnd: admission.active_id === trial.id && admission.can_finish_trial,
  };
}
