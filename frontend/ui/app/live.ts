// The live adapter (#495): the engine's answers, read through the app's one
// client (frontend/data.js) and served to the models (answers.ts) in the
// shape the stories' generated answers have, the person's own under the
// `wearer` store every model reads. Nothing else is served live: no fixture
// value can stand in for a live one, because the live answers start empty and
// a tab is shown only once its own reads have landed.
//
// Most answers are served as the API returns them; the models read a subset of
// their fields. Where scripts/gen_ui_fixtures.py reshapes an answer, this does
// the same, and names the generator function it mirrors.
//
// Every write here resolves only once the answers it changed are read again,
// and a write that fails reads them again before it rejects, so a screen
// never shows a state the engine did not serve.
import { client } from '../../data.js';
import { glossary } from '../__fixtures__/ui-fixtures.json';
import { serve, type Answers } from '../answers';
import type { Answer } from '../components/PromptCard/PromptCard';
import type { PromptData } from '../day-model';

export type Tab = 'queue' | 'changes' | 'overview' | 'day' | 'settings';
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The account rows never print the address (lock, Settings: "never show a real email"). */
const MASK = '••••••••';
const WINDOWS = ['14', '30', '90'] as const;
/** A Pattern Focus is pinned over the whole day, the window the Queue's findings read. */
const WHOLE_DAY = { start_min: 0, end_min: 1440 };

const NO_STATUS = { last_attempt_at: null, last_success_at: null, last_error: null };

const live: Json = {
  status: { ok: NO_STATUS },
  prompts: [],
  outcomes: {},
  queue: { wearer: { guidance: { candidates: [] } } },
  overview: { wearer: {} },
  changes: {},
  day: { states: {}, days: {}, prompts: {} },
  settings: { credentials: {}, status: {}, pump_settings: {} },
  glossary,
  states: {},
};
serve(live as Answers);

// What a write must quote back, from the reads it follows.
const quoted = { generation: '', guidanceRevision: 0, focusRevision: 0, trialsRevision: 0, candidates: [] as Json[] };

// --- Reads -------------------------------------------------------------------

/** gen_ui_fixtures._queue_store's candidate: the preference and decision flattened, and the Queue's order rule. */
function candidates(guidance: Json) {
  return guidance.candidates.map((c: Json) => ({
    ...c,
    set_aside: c.preference.set_aside,
    decided_at: c.decision?.decided_at ?? null,
    queued: c.admitted && !c.preference.set_aside,
  }));
}

async function readGuidance() {
  const guidance = await client.fetchGuidance();
  quoted.generation = guidance.analysis_generation;
  quoted.candidates = guidance.candidates;
  live.queue.wearer.guidance = { candidates: candidates(guidance) };
  return guidance;
}

/** gen_ui_fixtures._pattern_cases: each admitted Pattern's case file, its two cohorts' median traces. */
async function readCases(subjects: string[]) {
  const preparation = await client.fetchDiagnoseFindingCasePreparation();
  const cases: Json = {};
  await Promise.all(subjects.map(async (subject) => {
    let answer: Json;
    try {
      answer = await client.fetchDiagnoseFindingCase({
        projection_id: preparation.projection_id, finding_id: subject, alignment: 'event' });
    } catch (error) {
      if ((error as { status?: number }).status === 404) return; // no inspectable member: no impact line
      throw error;
    }
    const { projection } = answer;
    cases[subject.replace(/^pattern:/, '')] = {
      comparison: { state: projection.comparison.state },
      cohorts: projection.cohorts.filter((c: Json) => c.key === 'matched' || c.key === 'comparison'),
    };
  }));
  return cases;
}

async function readQueue() {
  const [findings, guidance, analyze, trials, focus] = await Promise.all([
    client.fetchDiagnoseFindings(), readGuidance(), client.fetchAnalysis(), client.fetchVerifyTrials(), client.fetchFocuses(),
  ]);
  quoted.focusRevision = focus.input_revision;
  // gen_ui_fixtures._queue_store: the rows a Queue component reads, among them only the admitted basal blocks.
  const collapsed = new Set(findings.outcome_patterns
    .filter((p: Json) => p.collapse === 'collapse_to_member' && p.action)
    .map((p: Json) => `finding:${p.action.split(':')[1]}`));
  const rows = findings.rows.filter((r: Json) => r.kind === 'pattern' || r.claimed_by || collapsed.has(r.id)
    || (r.kind === 'setting' && r.parameter === 'basal_rate' && r.members?.length));
  const cases = await readCases(guidance.candidates
    .filter((c: Json) => c.kind === 'pattern' && c.admitted).map((c: Json) => c.subject));
  live.queue.wearer = {
    findings: { outcome_patterns: findings.outcome_patterns, rows },
    guidance: live.queue.wearer.guidance,
    analyze: { basal: analyze.basal.filter((b: Json) => b.asserts_move) },
    trials,
    focus,
    cases,
  };
}

/** gen_ui_fixtures._focus_tracking: a Focus's comparison, as its card reads it. */
async function focusTracking(id: number) {
  const { comparison } = (await client.fetchVerifyTrials({ kind: 'focus', selected: String(id), assessment: 'retained' }))
    .selected.reassessment;
  if (!('readiness' in comparison)) return { availability: comparison.availability };
  return {
    readiness: comparison.readiness.after,
    adherence: comparison.adherence,
    outcomes: comparison.outcomes.filter((r: Json) => ['tir', 'tbr', 'tar', 'peak', 'nadir'].includes(r.key)),
  };
}

/** gen_ui_fixtures._changes_store: the admission, the active or ended Trials, the Focus records with their titles. */
async function readChanges() {
  const [answer] = await Promise.all([client.fetchVerifyTrials(), readGuidance()]);
  quoted.trialsRevision = answer.input_revision;
  const { admission } = answer;
  const trials = await Promise.all(answer.trials
    .filter((t: Json) => t.watch_disposition === 'active' || 'kind' in t.ending)
    .map(async (t: Json) => (t.watch_disposition === 'active' && admission.can_finish_trial
      ? { ...t, reassessment: { outcomes: (await client.fetchVerifyTrials({ selected: t.id, assessment: 'retained' }))
          .selected.reassessment.comparison.outcomes } }
      : t)));
  const focuses = await Promise.all(answer.focuses.map(async (f: Json) => {
    const detail = (await client.fetchVerifyTrials({ kind: 'focus', selected: String(f.id) })).selected;
    return { ...f, title: detail.title, lever_title: detail.lever_title,
      ...(f.status === 'active' ? { tracking: await focusTracking(f.id) } : {}) };
  }));
  live.changes.wearer = { admission, trials, focuses };
}

async function readNavigator() {
  live.overview.wearer.day_navigator = await client.fetchDayNavigator();
}

async function readTimeOfDay() {
  live.overview.wearer.time_of_day = await client.fetchExploreTimeOfDay();
}

async function readOverview() {
  const outcomes = await Promise.all(WINDOWS.map((w) => client.fetchOutcomes(Number(w))));
  live.outcomes = Object.fromEntries(WINDOWS.map((w, i) => [w, outcomes[i]]));
  await Promise.all([readTimeOfDay(), readNavigator()]);
}

/** The Prompts the Day screen draws: its lows (§1.5: Day calls its prompts "Lows"). */
async function readPrompts() {
  live.prompts = (await client.fetchPrompts()).filter((p: Json) => p.detector === 'low');
}

async function readStatus() {
  live.status.ok = await client.fetchStatus();
}

const shift = (iso: string, days: number) => {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** One day's timeline and the carbs logged by hand on it. */
export async function readDay(iso: string) {
  const range = { start: `${iso}T00:00:00`, end: `${shift(iso, 1)}T00:00:00` };
  const [timeline, carbs] = await Promise.all([client.fetchTimeline(range), client.fetchCarbs(range)]);
  live.day.days[iso] = { timeline, carbs };
}

async function readSettings() {
  const [credentials, , pump] = await Promise.all([
    client.fetchCredentials(), readStatus(), client.fetchPumpSettings(), readGuidance()]);
  const account = { configured: credentials.configured, region: credentials.region, email: credentials.email ? MASK : null };
  live.settings.credentials = { set: account, unset: account };
  live.settings.pump_settings.wearer = pump;
}

/** The reads each tab needs before it is shown. Status and the Prompts feed every NavBar. */
const READS: Record<Tab, () => Promise<unknown>> = {
  queue: readQueue,
  changes: readChanges,
  overview: readOverview,
  day: () => Promise.all([readNavigator(), readTimeOfDay()]),
  settings: readSettings,
};

/** Read everything `tab` shows, and the NavBar's badges. */
export const readTab = (tab: Tab) => Promise.all([READS[tab](), readStatus(), readPrompts()]);

/** The account the Settings screen shows: set, or not. */
export const accountState = () => (live.settings.credentials.set?.configured ? 'set' : 'unset');

// --- Writes ------------------------------------------------------------------

/** Run a write, then read again what it changed, whether or not it saved. */
async function write<T>(run: () => Promise<T>, reread: () => Promise<unknown>): Promise<T> {
  try {
    return await run();
  } finally {
    await reread().catch(() => undefined);
  }
}

/** A request identity for a durable write, kept across its Retries. Plain
 *  random bytes: crypto.randomUUID needs a secure origin, and a LAN address over
 *  http is not one. */
const identities = new Map<string, string>();
function requestId(intent: string) {
  if (!identities.has(intent)) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    identities.set(intent, Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
  }
  return identities.get(intent)!;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** Now, on the wall clock the store keeps (`YYYY-MM-DD HH:MM:SS`). */
function now() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const reread = (...reads: (() => Promise<unknown>)[]) => () => Promise.all(reads.map((read) => read()));

export const queueWrites = {
  snooze: (subject: string) => write(
    () => client.setGuidancePreference(subject, { generation: quoted.generation }), readQueue).then(() => undefined),
  restore: (subject: string) => write(() => client.restoreGuidancePreference(subject), readQueue).then(() => undefined),
  pin: (subject: string) => write(async () => {
    const candidate = quoted.candidates.find((c) => c.subject === subject);
    await client.pinFocus({
      pattern_key: candidate?.pattern_key ?? subject.replace(/^pattern:/, ''), outcome_window: WHOLE_DAY,
      request_id: requestId(`pin ${subject}`), input_revision: quoted.focusRevision, subject,
      analysis_generation: quoted.generation,
    });
    identities.delete(`pin ${subject}`);
  }, reread(readQueue, readChanges)),
};

export const changesWrites = {
  /** End the change the served admission names as active. */
  end: () => write(async () => {
    const { active_kind: kind, active_id: id } = live.changes.wearer.admission;
    if (kind === 'focus') await client.resolveFocus(id);
    else await client.finishTrial(id, { request_id: requestId(`end ${id}`), input_revision: quoted.trialsRevision });
    identities.delete(`end ${id}`);
  }, reread(readChanges, readQueue)),
};

/** The days whose timeline is on screen, read again after a carb write. */
const daysShown = () => Object.keys(live.day.days);

export const dayWrites = {
  answer: (prompt: PromptData, answer: Answer) => write(async () => {
    const saved = await client.answerPrompt({
      detector: prompt.detector, anchor_t: prompt.anchorT, answer,
      ...(answer === 'carbs' ? { entry: { grams: null, certainty: 'unknown' } } : {}),
    });
    return { carbEntryId: saved.carb_entry_id ?? null };
  }, reread(readPrompts, ...daysShown().map((iso) => () => readDay(iso)))),
  grams: (carbEntryId: number, grams: number) => write(
    () => client.updateCarb(carbEntryId, { grams, certainty: 'exact' }),
    reread(...daysShown().map((iso) => () => readDay(iso)))).then(() => undefined),
  logCarbs: (grams: number) => {
    const t = now();
    return write(() => client.createCarb({ t, grams, certainty: 'exact', source: 'manual' }),
      reread(() => readDay(t.slice(0, 10)), ...daysShown().map((iso) => () => readDay(iso)))).then(() => undefined);
  },
};

export const settingsWrites = {
  saveCredentials: (email: string, password: string) => write(
    () => client.saveCredentials({ email, password, region: live.settings.credentials.set?.region ?? 'US' }),
    readSettings).then(() => undefined),
};
