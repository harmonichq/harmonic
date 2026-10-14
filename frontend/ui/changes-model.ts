// The Changes components' data, read from the served stores (#483). As with
// queue-model.ts, every number ChangeCard prints is built here as a Sourced
// value naming its field; the state, the result and the End action all follow
// what the engine served, and nothing here invents a verdict.
//
// A store is one entry of `answers.changes`: its admission names the active
// change, and its trials hold that Trial with its comparison, and any Trial the
// person has ended (the last change).
import type { Change } from './Delta';
import { answers, sourced, type Sourced } from './answers';
import { formatValue } from './provenance.js';
import { PARAMETER_FORMATS } from './settings-model';

export type ChangesStore = keyof typeof answers.changes;
export type Result = 'better' | 'worse' | 'unclear';

/** One outcome's Before and After, named by its glossary metric. */
export type OutcomeRow = {
  key: 'tir' | 'tbr' | 'tar' | 'peak' | 'nadir';
  before: Sourced<number>;
  after: Sourced<number>;
  unit: string;
  /** The Trial's own target metric: the row its result reads. */
  target: boolean;
  /** After against before, toned by the engine's own verdict on this row. */
  delta: Change;
};

export type TrialData = {
  kind: 'trial';
  /** The parameter's served title and units, as the Queue names the setting. */
  title: string;
  units: string;
  /** Null for a change the engine serves no time block for (a whole-profile change). */
  slot: Sourced<string> | null;
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
  adherence: { before: Sourced<number>; after: Sourced<number>; unit: string; delta: Change } | null;
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

/** After against before, as printed: the amount ordered larger − smaller, its
 *  direction, and the tone of the engine's verdict on the row (favourable,
 *  concerning). A row the engine judges unclear, or serves only as context,
 *  stays neutral whichever way it moved: no colour the engine has not served. */
export function delta(before: Sourced<number>, after: Sourced<number>, state: string | undefined): Change {
  const rises = after.value >= before.value;
  const amount = sourced<number>(rises ? `${after.source} − ${before.source}` : `${before.source} − ${after.source}`,
    after.format);
  if (formatValue(amount.value, after.format) === formatValue(0, after.format)) {
    return { direction: null, tone: null, amount };
  }
  const tone = state === 'favorable' ? 'favorable' : state === 'concerning' ? 'adverse' : null;
  return { direction: rises ? 'up' : 'down', tone, amount };
}

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
    // Glucose in whole mg/dL; the shares to one decimal.
    const format = row.unit === 'mg/dL' ? 'round' : 'fixed1';
    const before = sourced<number>(`${path}[key=${key}].0.before`, format);
    const after = sourced<number>(`${path}[key=${key}].0.after`, format);
    return [{ key, before, after, unit: row.unit, target: targets.includes(key),
      delta: delta(before, after, row.assessment?.state) }];
  });
}

function adherence(path: string, unit: string, state: string): NonNullable<FocusData['adherence']> {
  const before = sourced<number>(`${path}.tracking.adherence.before.rate`, 'pct1');
  const after = sourced<number>(`${path}.tracking.adherence.after.rate`, 'pct1');
  return { before, after, unit, delta: delta(before, after, state) };
}

/** The active change: its Trial or Focus, or none. */
export function change(name: ChangesStore): ChangeData {
  const store = answers.changes[name];
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
      adherence: tracked && adherence(path, tracked.readiness.unit, tracked.adherence.assessment.state),
      result: tracked && !maturing ? RESULTS[tracked.adherence.assessment.state] ?? null : null,
      outcomes: tracked ? outcomeRows(`${path}.tracking.outcomes`, tracked.outcomes, [], FOCUS_OUTCOMES) : [],
    };
  }
  const trial = (store.trials as readonly TrialRow[]).find((t) => t.id === admission.active_id);
  return trial ? trialData(name, trial) : { kind: 'none' };
}

/** The last finished change: the Trial the person ended most recently, or null. */
export function lastChange(name: ChangesStore): TrialData | null {
  const ended = (answers.changes[name].trials as readonly TrialRow[])
    .filter((t) => t.ending.kind)
    .sort((a, b) => (b.ending.effective_at ?? '').localeCompare(a.ending.effective_at ?? ''));
  return ended[0] ? trialData(name, ended[0]) : null;
}

function trialData(name: ChangesStore, trial: TrialRow): TrialData {
  const store = answers.changes[name];
  const root = `changes.${name}`;
  const { admission } = store;
  const path = `${root}.trials[id=${trial.id}].0`;
  const ended = trial.ending.assessment ?? null;
  const compared = ended ? { path: `${path}.ending.assessment.outcomes`, rows: ended.outcomes }
    : trial.reassessment ? { path: `${path}.reassessment.outcomes`, rows: trial.reassessment.outcomes } : null;
  const target = compared?.rows.find((r) => trial.target_metrics.includes(r.key));
  const candidate = answers.queue.wearer.guidance.candidates.find((c) => c.subject === `setting:${trial.parameter}`);
  if (!candidate?.units) throw new Error(`the engine serves no title for ${trial.parameter}`);
  const format = PARAMETER_FORMATS[trial.parameter as keyof typeof PARAMETER_FORMATS];
  if (!format) throw new Error(`no pump profile format for ${trial.parameter}`);
  return {
    kind: 'trial',
    title: candidate.title,
    units: candidate.units,
    slot: (trial as { slot?: string | null }).slot ? sourced(`${path}.slot`) : null,
    changedAt: sourced(`${path}.changed_at`, 'date'),
    // Each setting as the pump profile prints it.
    before: sourced(`${path}.before`, format),
    after: sourced(`${path}.after`, format),
    daysElapsed: sourced(`${path}.maturing.days_elapsed`),
    daysRequired: sourced(`${path}.maturing.days_required`),
    maturing: trial.state === 'maturing',
    result: target ? RESULTS[target.assessment?.state ?? ''] ?? null : null,
    outcomes: compared ? outcomeRows(compared.path, compared.rows, trial.target_metrics) : [],
    endedAt: ended ? sourced(`${path}.ending.effective_at`, 'date') : null,
    canEnd: admission.active_id === trial.id && admission.can_finish_trial,
  };
}
