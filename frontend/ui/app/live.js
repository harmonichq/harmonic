// The live adapter (#495): the engine's answers, read through the app's one
// client (frontend/data.js) and assembled into the shape the stories'
// generated answers have, the person's own under the `wearer` store every model
// reads. The app serves the result to the models (answers.ts). No fixture value
// stands in for a live one: the answers start empty, and a tab is shown only
// once its own reads have landed.
//
// Most answers are served as the API returns them; the models read a subset of
// their fields. Where the stories' fixture generator reshapes an answer, this
// does the same, and names the generator function it mirrors (gen_ui_fixtures,
// which the public tree excludes).
//
// THE READS ARE BOUNDED. The server answers one request at a time, so every
// read waits behind every other, and a read that fans out with the length of
// the history starves the rest (on a real history, a Prompts read waited 90 s
// behind the Changes tab's per-Focus reads). So:
// - each answer is read once and shared by every tab that shows it, and read
//   again only after a write that changes it, or on the tab's Retry;
// - a detail read is made only for what a screen draws: Changes reads at most
//   the active change's detail, never one per Focus or Trial; the Queue reads a
//   case file only for each Pattern it ranks, and for a standalone habit it
//   holds, whose row prints its case file's count (ADR 528);
// - the badges' reads (status, Prompts) are shared, and refreshed by the
//   writes that change them.
//
// Every write resolves only once what it changed has been read again, and a
// write that fails reads that again before it rejects, so a screen never shows
// a state the engine did not serve.
//
// THE ANSWERS ARE REMEMBERED (#522). With a `memory` (memory.js), each tab's
// answers are kept in the browser as they land, and a page refresh starts from
// them: `remembered(tab)` says a tab can draw at once, while its first read
// fetches it again behind what it shows. Saving a token `reset`s everything.
//
// AN EARLIER ANSWER IS NEVER SHOWN AS CURRENT (#566). Right after a sync the
// engine answers at once with its previous answer, labelled with how far that
// answer's data reaches (`input_data_age`), while it computes the new one, and
// while a sync is landing it answers the same way (#579): the Queue's findings,
// guidance and Focus list, and the Trial roster with the active change's detail,
// as well as the Overview's. `behind(tab)` says a tab drew such an answer, and `catchUp(tab)` reads those
// answers again, a few times with a growing pause, until each is current.
//
// Plain JS, with its client injected, so node --test drives it with a fake.

/** The account rows never print the address (lock, Settings: "never show a real email"). */
const MASK = '••••••••';
const WINDOWS = ['14', '30', '90'];
/** The pauses before each read again of an answer the engine served from before its last sync (#566). */
const CATCH_UP_MS = [1000, 2000, 4000, 8000, 15000, 30000];
/** The Overview's first window, and the analysis window the engine answers by default. */
const FIRST_WINDOW = '14';
const DEFAULT_ANALYSIS = '30';
/** A Pattern Focus watches the whole day, the window the Queue's findings read. */
const WHOLE_DAY = { start_min: 0, end_min: 1440 };
const NO_STATUS = { last_attempt_at: null, last_success_at: null, last_error: null, last_error_label: null };

// The analysis and case-file answers, trimmed to what their cards draw (ADR 523), so
// the remembered answers hold no evidence a screen does not read.

/** gen_ui_fixtures._traces: a case file's trace chart, without its anchor lists. */
const cohort = ({ episodes, points }) => ({ episodes, points });
const traceChart = ({ anchor, window_min, pattern, typical }) => ({
  anchor, window_min, pattern: cohort(pattern), typical: { points: typical.points },
});

/** gen_ui_fixtures._case_file: a case file as its card reads it: a Pattern's trace chart (ADR 523), and a
 *  standalone habit's with the count its card prints, the habit's own claimed of its denominator (ADR 528). */
const caseFile = (subject, { summary, traces }) => (subject.startsWith('habit:')
  ? { summary: { claimed: summary.claimed, denominator: summary.denominator, noun: summary.noun }, traces: traceChart(traces) }
  // A Pattern's case file also draws each cause, in the engine's order, against its one Typical (ADR 593).
  : { traces: { ...traceChart(traces),
    causes: traces.causes.map(({ subject: cause, pattern }) => ({ subject: cause, pattern: cohort(pattern) })) } });

/** gen_ui_fixtures._ic_blocks: the carb-ratio blocks the engine stages a move for, with the runs they count. */
const icBlocks = (blocks) => blocks.filter((b) => b.asserts_move).map((b) => ({
  block_id: b.block_id, start_min: b.start_min, end_min: b.end_min, current_values: b.current_values,
  recommended: b.recommended, estimate: { value: b.estimate.value, lo: b.estimate.lo, hi: b.estimate.hi },
  evidence: { counted_runs: b.evidence.counted_runs },
}));

/** gen_ui_fixtures._queue_store's basal: the slots the engine stages a move for, with their nights. */
const stagedSlots = (basal) => basal.filter((b) => b.asserts_move).map((b) => ({
  slot: b.slot, label: b.label, current: b.current, recommended: b.recommended, estimate: b.estimate, days: b.days,
  evidence: { night_roster: b.evidence.night_roster.map(({ date, delivered_rate, programmed_rate }) =>
    ({ date, delivered_rate, programmed_rate })) },
}));

/** gen_ui_fixtures._basal_slots: the day's 48 slots, as the Overview's basal card reads them. */
const basalSlots = (basal) => basal.map((b) => ({
  slot: b.slot, current: b.current, asserts_move: b.asserts_move, direction: b.direction,
  estimate: b.estimate && { value: b.estimate.value, lo: b.estimate.lo, hi: b.estimate.hi },
}));

/** gen_ui_fixtures._meal_size: the Meal size card's answer for one window: each size as served (its count and
 *  percentiles, #570), the window kept to its days (null for a store with no readings), and the hours At 3 h is
 *  read at (#501, #565). */
const mealSizes = ({ window, horizon_hours, sizes }) => ({
  window: window && { data_days: window.data_days },
  horizon_hours,
  sizes,
});

/** The model-view trimmed to what the Day chart marks: the day's findings,
 *  each anchor's time, kind and glucose and the habits it counts toward
 *  (mirrors gen_ui_fixtures.model_view_marks). */
export function modelViewMarks(view) {
  return {
    date: view.date,
    findings: view.findings.map(({ t, kind, bg, levers }) => ({
      t, kind, bg, levers: levers.map(({ lever, title }) => ({ lever, title })),
    })),
  };
}

/** A prompt trimmed to what a PromptCard draws: its identity, the reading it
 *  is about and when, the readings around it, and its answer; never the
 *  engine's question and context sentences, so the browser remembers only
 *  what is shown (mirrors gen_ui_fixtures.prompt_marks). */
export function promptMarks({ detector, anchor_t, key_t, key_bg, cgm, answer }) {
  return { detector, anchor_t, key_t, key_bg, cgm, answer };
}

/**
 * @param {{ client: object, glossary: object[], memory?: { load: Function, save: Function },
 *   pause?: (ms: number) => Promise<void> }} deps —
 *   the client namespace (frontend/data.js makeDeps), §1.5's rows for the
 *   Glossary page, where the answers are remembered (memory.js), if anywhere,
 *   and how `catchUp` waits between its reads.
 */
export function createLive({ client, glossary, memory = null,
  pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); }) }) {
  const empty = () => ({
    status: { ok: NO_STATUS },
    prompts: [],
    outcomes: {},
    queue: { wearer: { guidance: { candidates: [] } } },
    overview: { wearer: { time_of_day: {}, analyze: {}, meal_size: {} } },
    changes: {},
    day: { states: {}, days: {}, prompts: {}, months: {} },
    settings: { credentials: {}, status: {}, pump_settings: {} },
    glossary,
    states: {},
  });
  const answers = empty();

  // The tabs (and Settings' parts) whose answers have landed, kept with them,
  // and those drawn from an earlier visit's answers and not yet read again.
  const kept = memory?.load();
  if (kept?.answers) Object.assign(answers, kept.answers, { glossary });
  const landed = new Set(kept?.answers ? kept.tabs : []);
  const fromMemory = new Set(landed);
  const remember = (tab) => {
    if (tab) {
      landed.add(tab);
      fromMemory.delete(tab);
    }
    memory?.save({ tabs: [...landed], answers });
  };

  // One promise per answer: in flight or landed, shared by every reader. A
  // failed read is forgotten, so the next asks again. Each answer's read is kept
  // beside it, so an answer that landed behind the engine can be read again.
  const reads = new Map();
  const runs = new Map();
  const once = (key, run) => {
    runs.set(key, run);
    if (!reads.has(key)) {
      reads.set(key, run().catch((error) => { reads.delete(key); throw error; }));
    }
    return reads.get(key);
  };
  const forget = (...keys) => keys.forEach((key) => reads.delete(key));

  // The reads whose answer the engine served from before its last sync (#566).
  const behindReads = new Set();
  /** Note whether `answer`, read under `key`, is the engine's previous answer; return it. */
  const served = (key, answer) => {
    if (answer?.input_data_age) behindReads.add(key);
    else behindReads.delete(key);
    return answer;
  };

  // --- The answers, each read once ------------------------------------------

  /** gen_ui_fixtures._queue_store's candidate: preference and decision flattened, and the Queue's order rule:
   *  admitted, not snoozed, and not waiting for the pump after a Done (#518). */
  const guidance = () => once('guidance', async () => {
    const answer = served('guidance', await client.fetchGuidance());
    answers.queue.wearer.guidance = {
      candidates: answer.candidates.map((c) => ({
        ...c,
        set_aside: c.preference.set_aside,
        decided_at: c.decision?.decided_at ?? null,
        acknowledgment: c.acknowledgment ?? null,
        queued: c.admitted && !c.preference.set_aside && c.acknowledgment?.state !== 'waiting',
      })),
    };
    return answer;
  });
  const findings = () => once('findings', async () => served('findings', await client.fetchDiagnoseFindings()));
  /** The analysis at the engine's default window, 30 days: the Queue's, and the Overview's 30 d basal estimate. */
  const analyze = () => once('analyze', async () => served('analyze', await client.fetchAnalysis()));
  const trials = () => once('trials', async () => served('trials', await client.fetchVerifyTrials()));
  const focus = () => once('focus', async () => served('focus', await client.fetchFocuses()));
  const status = () => once('status', async () => { answers.status.ok = await client.fetchStatus(); });
  /** The Prompts the Day screen draws: its Lows and its Rises (#529), each trimmed to its card. */
  const prompts = () => once('prompts', async () => {
    answers.prompts = (await client.fetchPrompts()).map(promptMarks);
  });
  const navigator = () => once('navigator', async () => {
    answers.overview.wearer.day_navigator = await client.fetchDayNavigator();
  });
  /** Another month's weeks, read once when the Day screen steps to it. The month the
   *  navigator already holds is not read again. */
  const month = (iso) => once(`month ${iso}`, async () => {
    await navigator();
    if (answers.overview.wearer.day_navigator.month === iso) return;
    answers.day.months[iso] = await client.fetchDayNavigator(iso);
  });
  /** The glucose profile over one window, read when the Overview first shows it. */
  const timeOfDay = (window) => once(`time-of-day ${window}`, async () => {
    answers.overview.wearer.time_of_day[window] = served(`time-of-day ${window}`,
      await client.fetchExploreTimeOfDay(Number(window)));
  });
  /** gen_ui_fixtures._windows: one window's 48 basal slots, for the Overview's basal estimate. The 30 d
   *  analysis is the Queue's own read, shared. */
  const basal = (window) => once(`basal ${window}`, async () => {
    const answer = served(`basal ${window}`,
      window === DEFAULT_ANALYSIS ? await analyze() : await client.fetchAnalysis(Number(window)));
    answers.overview.wearer.analyze[window] = { basal: basalSlots(answer.basal) };
  });
  /** The Meal size card over one window, read when the Overview first shows it (#501, #565). */
  const mealSize = (window) => once(`meal-size ${window}`, async () => {
    answers.overview.wearer.meal_size[window] = mealSizes(served(`meal-size ${window}`,
      await client.fetchMealSize(Number(window))));
  });
  /** What the Overview reads for a window it shows: its profile, its basal estimate and its Meal size. */
  const overviewWindow = (window) => Promise.all([timeOfDay(window), basal(window), mealSize(window)]);
  const outcomes = () => once('outcomes', async () => {
    const windows = await Promise.all(WINDOWS.map((w) => client.fetchOutcomes(Number(w))));
    served('outcomes', windows.find((answer) => answer?.input_data_age));
    answers.outcomes = Object.fromEntries(WINDOWS.map((w, i) => [w, windows[i]]));
  });

  /** gen_ui_fixtures._cases: each subject's case file, by its key (a Pattern's, or a habit's lever): a
   *  Pattern's is its own subject, a habit's its finding (ADR 528). */
  async function cases(subjects) {
    if (subjects.length === 0) return {};
    const preparation = await client.fetchDiagnoseFindingCasePreparation();
    // The case files, like the Queue's other reads, can be an earlier answer (#581).
    const earlier = [preparation];
    const out = {};
    await Promise.all(subjects.map(async (subject) => {
      const [kind, key] = subject.split(':');
      let answer;
      try {
        answer = await client.fetchDiagnoseFindingCase({ projection_id: preparation.projection_id,
          finding_id: kind === 'habit' ? `finding:${key}` : subject, alignment: 'event' });
      } catch (error) {
        if (error?.status === 404) return; // no inspectable member: no chart, no impact line
        throw error;
      }
      earlier.push(answer);
      out[key] = caseFile(subject, answer);
    }));
    served('queue', earlier.find((answer) => answer?.input_data_age));
    return out;
  }

  /** The Queue, composed with `held`, the roster it already holds, after a Queue write (ADR 610), or with the
   *  roster read now. */
  const queue = (held) => once('queue', async () => {
    const [served, guided, analysis, roster, focused] = await Promise.all([
      findings(), guidance(), analyze(), held ?? trials(), focus()]);
    // gen_ui_fixtures._queue_store: the rows a Queue component reads, among them every admitted setting block
    // and each admitted standalone habit's own row, which its card's tone is read from (ADR 528).
    const habits = guided.candidates.filter((c) => c.kind === 'habit' && c.admitted).map((c) => c.subject);
    const habitRows = new Set([...served.outcome_patterns
      .filter((p) => p.collapse === 'collapse_to_member' && p.action)
      .map((p) => `finding:${p.action.split(':')[1]}`), ...habits.map((s) => `finding:${s.split(':')[1]}`)]);
    const rows = served.rows.filter((r) => r.kind === 'pattern' || r.claimed_by || habitRows.has(r.id)
      || (r.kind === 'setting' && r.members?.length));
    // Only the Patterns the Queue ranks open into a card; a snoozed one is a row. A habit's row, snoozed
    // or not, prints the count its case file serves.
    const ranked = guided.candidates
      .filter((c) => c.kind === 'pattern' && c.admitted && !c.preference.set_aside).map((c) => c.subject);
    answers.queue.wearer = {
      findings: { outcome_patterns: served.outcome_patterns, rows },
      guidance: answers.queue.wearer.guidance,
      analyze: { basal: stagedSlots(analysis.basal), ic_blocks: icBlocks(analysis.ic_blocks) },
      trials: roster,
      focus: focused,
      cases: await cases([...ranked, ...habits]),
    };
  });

  /** gen_ui_fixtures._focus_tracking: a Focus's comparison, as its card reads it. */
  function tracking(comparison) {
    if (!('readiness' in comparison)) return { availability: comparison.availability };
    return {
      readiness: comparison.readiness.after,
      adherence: comparison.adherence,
      outcomes: comparison.outcomes.filter((r) => ['tir', 'tbr', 'tar', 'peak', 'nadir'].includes(r.key)),
    };
  }

  /** gen_ui_fixtures._comparison: the active Trial's comparison, kept to what Changes draws (its availability,
   *  outcome rows, each arm's meals, trace and Control-IQ delivery), so the browser remembers no raw episode. */
  function trimmed(comparison) {
    const arms = (served, pick) => Object.fromEntries(Object.entries(served ?? {}).map(([arm, value]) => [arm, pick(value)]));
    return {
      availability: { state: comparison.availability.state },
      outcomes: comparison.outcomes,
      denominators: arms(comparison.denominators, (d) => ({ contributing_meals: d.contributing_meals })),
      views: arms(comparison.views, (view) => Object.fromEntries(
        ['trace', 'basal'].filter((key) => key in view).map((key) => [key, view[key]]))),
    };
  }

  // How many Queue writes were made and answered, and the last of them in order (#610): a Changes read
  // checks them, so it never lands an answer a Queue write crossed.
  let queueWritesMade = 0;
  let queueWritesAnswered = 0;
  let queueTail = Promise.resolve();

  /** gen_ui_fixtures._changes_store, for what the screen draws: every Trial on the roster (the active one and
   *  the previous ones, #524), the active Focus and every ended one. Only the active change takes a detail
   *  read: a Trial's retained comparison (its traces, metrics and meals), or a Focus's tracking. A previous
   *  change prints only what the roster serves.
   *  A read a Queue write crosses, one started while a write was unanswered or during which a write was
   *  made, is discarded and made again behind the Queue's writes, so Changes lands only an answer read
   *  after the last of them (#610). */
  const changes = () => once('changes', async () => {
    for (;;) {
      const made = queueWritesMade;
      const clear = queueWritesAnswered === made;
      const read = await changesRead();
      if (clear && made === queueWritesMade) {
        answers.changes.wearer = read;
        return;
      }
      await queueTail;
    }
  });
  async function changesRead() {
    const answer = await trials();
    const { admission } = answer;
    const active = admission.active_kind === 'trial'
      ? answer.trials.find((t) => t.id === admission.active_id) : null;
    const reassessed = active && await client.fetchVerifyTrials({ selected: active.id, assessment: 'retained' });
    const comparison = reassessed && trimmed(reassessed.selected.reassessment.comparison);
    const pinned = admission.active_kind === 'focus'
      ? answer.focuses.find((f) => f.id === admission.active_id) : null;
    const tracked = pinned && await client.fetchVerifyTrials({
      kind: 'focus', selected: String(pinned.id), assessment: 'retained' });
    const detail = tracked && tracked.selected;
    // The active change's detail, read with the roster, can be an earlier answer too (#579).
    served('changes', [reassessed, tracked].find((read) => read?.input_data_age));
    return {
      admission,
      input_revision: answer.input_revision,
      trials: answer.trials.map((t) => (t === active ? { ...t, reassessment: comparison } : t)),
      focuses: [
        ...(pinned ? [{ ...pinned, title: detail.title, lever_title: detail.lever_title,
          tracking: tracking(detail.reassessment.comparison) }] : []),
        ...answer.focuses.filter((f) => f.status !== 'active' && f.ending && 'kind' in f.ending),
      ],
      // The Settings a Done left waiting for the pump, served on the roster (#518).
      waiting: answer.waiting ?? [],
    };
  }

  const credentials = () => once('credentials', async () => {
    const served = await client.fetchCredentials();
    const account = { configured: served.configured, region: served.region, email: served.email ? MASK : null };
    answers.settings.credentials = { set: account, unset: account };
  });
  const pump = () => once('pump', async () => {
    answers.settings.pump_settings.wearer = await client.fetchPumpSettings();
  });

  const shift = (iso, days) => {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  /** One day's timeline, the carbs logged by hand on it, and what the engine
   *  counted on it, read when the day is picked. */
  const day = (iso) => once(`day ${iso}`, async () => {
    const range = { start: `${iso}T00:00:00`, end: `${shift(iso, 1)}T00:00:00` };
    const [timeline, carbs, modelView] = await Promise.all([
      client.fetchTimeline(range), client.fetchCarbs(range), client.fetchModelView(iso)]);
    answers.day.days[iso] = { timeline, carbs, model_view: modelViewMarks(modelView) };
  });

  /** The answers each tab shows; the NavBar's badges read status and the Prompts on every tab. */
  const TABS = {
    queue: { read: queue, keys: ['queue', 'findings', 'guidance', 'analyze', 'trials', 'focus'] },
    changes: { read: changes, keys: ['changes', 'trials'] },
    // The first window, then the other two read behind it (#566), so a switch draws at once.
    overview: { read: () => Promise.all([outcomes(), overviewWindow(FIRST_WINDOW)]).then(() => {
      WINDOWS.filter((w) => w !== FIRST_WINDOW)
        .reduce((before, w) => before.then(() => overviewWindow(w)), Promise.resolve())
        .then(() => remember(), () => undefined);
    }),
      // The 30 d basal estimate is the Queue's analysis, so the Overview reads it again with its own.
      keys: ['outcomes', 'analyze', ...WINDOWS.flatMap((w) => [`time-of-day ${w}`, `basal ${w}`, `meal-size ${w}`])] },
    // Day reads the engine's one target range, which every window's profile serves; the Overview's first.
    day: { read: () => Promise.all([navigator(), timeOfDay(FIRST_WINDOW)]),
      keys: ['navigator', `time-of-day ${FIRST_WINDOW}`] },
  };
  const BADGES = ['status', 'prompts'];

  /** Whether `tab` has its answer to draw: a Queue write drops Changes' (#610), even while its badges land. */
  const drawable = (tab) => tab !== 'changes' || answers.changes.wearer !== undefined;
  /** Read what `tab` shows, and the badges; whatever has landed already is not read again. Changes whose
   *  answer was dropped meanwhile is read again, never landed without one. */
  const readTab = (tab) => Promise.all([TABS[tab].read(), status(), prompts()])
    .then(() => (drawable(tab) ? remember(tab) : readTab(tab)));

  /** Retry: forget what `tab` shows, and the badges, and read them again. */
  const retryTab = (tab) => {
    forget(...TABS[tab].keys, ...BADGES);
    return readTab(tab);
  };

  /** Whether `tab` draws an answer the engine served from before its last sync (#566). */
  const behind = (tab) => TABS[tab].keys.some((key) => behindReads.has(key));

  /** Read again what `tab` drew from before the engine's last sync, and only that, after a
   *  pause that grows, until it is all current or the reads run out; one catch-up per tab. */
  const catchingUp = new Map();
  const catchUp = (tab) => {
    if (!catchingUp.has(tab)) {
      catchingUp.set(tab, (async () => {
        for (const ms of CATCH_UP_MS) {
          if (!behind(tab)) return;
          await pause(ms);
          const keys = TABS[tab].keys.filter((key) => behindReads.has(key));
          // A tab's own composed read (the Queue's, Changes') is composed again from them.
          forget(...keys, tab);
          await Promise.all([TABS[tab].read(), ...keys.map((key) => once(key, runs.get(key)))])
            .then(() => { if (drawable(tab)) remember(tab); }, () => undefined);
        }
      })().finally(() => catchingUp.delete(tab)));
    }
    return catchingUp.get(tab);
  };

  /** Settings is read in parts, so each draws as it lands rather than the screen waiting on the slowest:
   *  the sync status (the root's first row and the NavBar's alert), the account, and the pump profile.
   *  Nothing Settings draws reads the guidance. The Prompts badge is read beside them, never waited on. */
  const SETTINGS = {
    status: { read: status, keys: ['status'] },
    account: { read: credentials, keys: ['credentials'] },
    pump: { read: pump, keys: ['pump'] },
  };
  const settings = {
    read: (part) => SETTINGS[part].read().then(() => remember(`settings ${part}`)),
    /** Retry: forget what `part` shows and read it again. */
    retry: (part) => {
      forget(...SETTINGS[part].keys);
      return settings.read(part);
    },
    badges: prompts,
  };

  // --- Writes ----------------------------------------------------------------

  /** Run a write, then forget and read again what it changed, whether or not it saved. */
  async function write(run, keys, reread) {
    try {
      return await run();
    } finally {
      forget(...keys);
      await reread().then(() => remember(), () => undefined);
    }
  }

  /** A request identity for a durable write, kept across its Retries. Plain
   *  random bytes: crypto.randomUUID needs a secure origin, and a LAN address
   *  over http is not one. */
  const identities = new Map();
  function requestId(intent) {
    if (!identities.has(intent)) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      identities.set(intent, Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(''));
    }
    return identities.get(intent);
  }

  const pad = (n) => String(n).padStart(2, '0');
  /** Now, on the wall clock the store keeps (`YYYY-MM-DD HH:MM:SS`). */
  function now() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  // What a Queue or Changes write changes: the guidance, the change roster, and both screens' answers.
  const FOLLOW_UP = ['queue', 'changes', 'guidance', 'trials', 'focus', 'findings'];
  const both = () => Promise.all([queue(), changes()]);
  /** The day the Day screen last read, which a Prompt answer leaves for the app to read again (#610). */
  let onScreen;
  /** The days visited, which a carb write changes. */
  const shownDays = () => Object.keys(answers.day.days);
  const rereadDays = () => Promise.all(shownDays().map(day));

  /** Each Queue write's request, on the guidance (and Focus list) it reads as it is sent. */
  const SENDS = {
    snooze: async (subject) => {
      const { analysis_generation: generation } = await guidance();
      await client.setGuidancePreference(subject, { generation });
    },
    restore: (subject) => client.restoreGuidancePreference(subject),
    /** Done on a Setting card (#518): the subject's served suggestion is on the pump. */
    done: async (subject) => {
      const guided = await guidance();
      await client.recordDone({ subject, request_id: requestId(`done ${subject}`),
        input_revision: guided.input_revision, analysis_generation: guided.analysis_generation });
      identities.delete(`done ${subject}`);
    },
    /** Undo a Done: withdraw the subject's acknowledgment while it still waits for the pump. */
    undoDone: async (subject) => {
      const guided = await guidance();
      const { applied_at: appliedAt } = guided.candidates.find((c) => c.subject === subject).acknowledgment;
      await client.withdrawDone({ applied_at: appliedAt, request_id: requestId(`undo ${appliedAt}`),
        input_revision: guided.input_revision });
      identities.delete(`undo ${appliedAt}`);
    },
    /** Start a Focus on a Pattern, on one of its causes (`lever`, ADR 594), or on a standalone habit itself,
     *  whose Focus is its own, with no Pattern and no outcome window (ADR 528). A cause's request identity
     *  names its lever, so a Retry never reuses another cause's. */
    pin: async (subject, lever) => {
      const [guided, focused] = await Promise.all([guidance(), focus()]);
      const candidate = guided.candidates.find((c) => c.subject === subject);
      const target = candidate?.kind === 'habit' ? { lever: candidate.lever }
        : { pattern_key: candidate?.pattern_key ?? subject.replace(/^pattern:/, ''), ...(lever ? { lever } : {}),
          outcome_window: WHOLE_DAY };
      const intent = lever ? `pin ${subject} ${lever}` : `pin ${subject}`;
      await client.pinFocus({
        ...target, request_id: requestId(intent), input_revision: focused.input_revision, subject,
        analysis_generation: guided.analysis_generation,
      });
      identities.delete(intent);
    },
  };
  /** The writes that take their item out of its list while in flight; a Focus shows its pill instead. */
  const TAKES_OUT = new Set(['snooze', 'restore', 'done']);

  // The Queue's writes (#610), sent one at a time in the order made, so each reads the guidance its write
  // before it left behind and none spends another's generation. The subjects in flight and the refused writes
  // are held here, not by the screen, so a tab change neither brings back an item in flight nor loses a
  // refusal. A Queue write never reads the roster or Changes' detail (ADR 610): it drops Changes' answer,
  // and Changes reads its own when next shown.
  const inFlight = new Set();
  let refused = [];
  let retrying = null;
  const same = (a) => (b) => a.kind === b.kind && a.subject === b.subject && a.lever === b.lever;
  const dropChanges = () => {
    forget('changes', 'trials');
    delete answers.changes.wearer;
    landed.delete('changes');
    fromMemory.delete('changes');
  };
  function queueWrite(write) {
    queueWritesMade += 1;
    const takesOut = TAKES_OUT.has(write.kind);
    if (takesOut) inFlight.add(write.subject);
    dropChanges();
    remember();
    const run = queueTail.then(async () => {
      const retried = refused.some(same(write));
      try {
        await SENDS[write.kind](write.subject, write.lever);
        refused = refused.filter((r) => !same(write)(r));
      } catch (error) {
        // A refusal is held until it saves, or until Retry finds its subject no longer served.
        if (retried && error?.status === 404) refused = refused.filter((r) => !same(write)(r));
        else if (!retried) refused = [...refused, write];
        throw error;
      } finally {
        queueWritesAnswered += 1;
        const roster = answers.queue.wearer.trials;
        forget(...FOLLOW_UP);
        await queue(roster).then(() => remember(), () => undefined);
        if (takesOut) inFlight.delete(write.subject);
      }
    });
    queueTail = run.catch(() => undefined);
    return run;
  }
  const queueWrites = {
    snooze: (subject) => queueWrite({ kind: 'snooze', subject }),
    restore: (subject) => queueWrite({ kind: 'restore', subject }),
    done: (subject) => queueWrite({ kind: 'done', subject }),
    undoDone: (subject) => queueWrite({ kind: 'undoDone', subject }),
    pin: (subject, lever) => queueWrite({ kind: 'pin', subject, ...(lever ? { lever } : {}) }),
    /** The subjects a write in flight takes out of their list, and the refused writes, in the order made. */
    held: () => ({ inFlight: new Set(inFlight), refused }),
    /** Send every refused write again, in order; it resolves, once each is answered, with those that saved.
     *  A Retry pressed while one is in flight sends nothing more, and resolves with it. */
    retry: () => {
      retrying ??= Promise.all(refused.map((write) => queueWrite(write).then(() => write, () => null)))
        .then((sent) => sent.filter(Boolean)).finally(() => { retrying = null; });
      return retrying;
    },
  };

  const changesWrites = {
    /** End the change the served admission names as active. */
    end: async () => {
      const { admission, input_revision: revision } = answers.changes.wearer;
      const { active_kind: kind, active_id: id } = admission;
      await write(async () => {
        if (kind === 'focus') await client.resolveFocus(id);
        else await client.finishTrial(id, { request_id: requestId(`end ${id}`), input_revision: revision });
        identities.delete(`end ${id}`);
      }, FOLLOW_UP, both);
    },
  };

  const dayWrites = {
    /** A Prompt answer resolves once the Prompts are read again, so the badge moves then (#610). It drops every
     *  visited day: the one on screen stays drawn until the app reads it again, and the others are read when
     *  next shown. */
    answer: (prompt, answer) => {
      const days = shownDays();
      return write(async () => {
        const saved = await client.answerPrompt({
          detector: prompt.detector, anchor_t: prompt.anchorT, answer,
          ...(answer === 'carbs' ? { entry: { grams: null, certainty: 'unknown' } } : {}),
        });
        return { carbEntryId: saved.carb_entry_id ?? null };
      }, ['prompts', ...days.map((iso) => `day ${iso}`)], () => {
        days.filter((iso) => iso !== onScreen).forEach((iso) => { delete answers.day.days[iso]; });
        return prompts();
      });
    },
    grams: async (carbEntryId, grams) => {
      await write(() => client.updateCarb(carbEntryId, { grams, certainty: 'exact' }),
        shownDays().map((iso) => `day ${iso}`), rereadDays);
    },
    /** Today at `time` (`HH:MM`) when the person picked one, else now. */
    logCarbs: async (grams, time) => {
      const t = time ? `${now().slice(0, 10)} ${time}:00` : now();
      const days = [...new Set([...shownDays(), t.slice(0, 10)])];
      await write(() => client.createCarb({ t, grams, certainty: 'exact', source: 'manual' }),
        days.map((iso) => `day ${iso}`), () => Promise.all(days.map(day)));
    },
  };

  const settingsWrites = {
    saveCredentials: async (email, password) => {
      await write(() => client.saveCredentials({
        email, password, region: answers.settings.credentials.set?.region ?? 'US' }),
      ['credentials', 'status'], () => Promise.all([credentials(), status()]));
    },
  };

  /** A read a screen makes as it is used, remembered once it lands. */
  const remembering = (read) => (...args) => read(...args).then((value) => { remember(); return value; });

  return {
    answers,
    readTab,
    retryTab,
    settings,
    /** One day, which is then the day on screen. */
    readDay: remembering((iso) => { onScreen = iso; return day(iso); }),
    /** The day on screen: the one `readDay` last read. */
    shownDay: () => onScreen,
    /** The weeks of one month (`YYYY-MM`), read once; Retry is a second call after a failure. */
    readMonth: remembering(month),
    /** The Overview's profile, basal estimate and Meal size for a window it switched to. */
    readWindow: remembering(overviewWindow),
    /** Whether `tab` (or `settings <part>`) draws from an earlier visit's answers, not yet read again. */
    remembered: (tab) => fromMemory.has(tab),
    behind,
    catchUp,
    /** Forget every answer, landed or remembered: a new token reads the app afresh. */
    reset: () => {
      reads.clear();
      behindReads.clear();
      landed.clear();
      fromMemory.clear();
      Object.assign(answers, empty());
    },
    /** The account the Settings screen shows: set, or not. */
    accountState: () => (answers.settings.credentials.set?.configured ? 'set' : 'unset'),
    queueWrites,
    changesWrites,
    dayWrites,
    settingsWrites,
  };
}
