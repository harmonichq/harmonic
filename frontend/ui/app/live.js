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
//   case file only for each Pattern it ranks;
// - the badges' reads (status, Prompts) are shared, and refreshed by the
//   writes that change them.
//
// Every write resolves only once what it changed has been read again, and a
// write that fails reads that again before it rejects, so a screen never shows
// a state the engine did not serve.
//
// Plain JS, with its client injected, so node --test drives it with a fake.

/** The account rows never print the address (lock, Settings: "never show a real email"). */
const MASK = '••••••••';
const WINDOWS = ['14', '30', '90'];
/** A Pattern Focus is pinned over the whole day, the window the Queue's findings read. */
const WHOLE_DAY = { start_min: 0, end_min: 1440 };
const NO_STATUS = { last_attempt_at: null, last_success_at: null, last_error: null };

/**
 * @param {{ client: object, glossary: object[] }} deps — the client namespace
 *   (frontend/data.js makeDeps) and §1.5's rows for the Glossary page.
 */
export function createLive({ client, glossary }) {
  const answers = {
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

  // One promise per answer: in flight or landed, shared by every reader. A
  // failed read is forgotten, so the next asks again.
  const reads = new Map();
  const once = (key, run) => {
    if (!reads.has(key)) {
      reads.set(key, run().catch((error) => { reads.delete(key); throw error; }));
    }
    return reads.get(key);
  };
  const forget = (...keys) => keys.forEach((key) => reads.delete(key));

  // --- The answers, each read once ------------------------------------------

  /** gen_ui_fixtures._queue_store's candidate: preference and decision flattened, and the Queue's order rule. */
  const guidance = () => once('guidance', async () => {
    const answer = await client.fetchGuidance();
    answers.queue.wearer.guidance = {
      candidates: answer.candidates.map((c) => ({
        ...c,
        set_aside: c.preference.set_aside,
        decided_at: c.decision?.decided_at ?? null,
        queued: c.admitted && !c.preference.set_aside,
      })),
    };
    return answer;
  });
  const findings = () => once('findings', () => client.fetchDiagnoseFindings());
  const analyze = () => once('analyze', () => client.fetchAnalysis());
  const trials = () => once('trials', () => client.fetchVerifyTrials());
  const focus = () => once('focus', () => client.fetchFocuses());
  const status = () => once('status', async () => { answers.status.ok = await client.fetchStatus(); });
  /** The Prompts the Day screen draws: its lows (§1.5: Day calls its prompts "Lows"). */
  const prompts = () => once('prompts', async () => {
    answers.prompts = (await client.fetchPrompts()).filter((p) => p.detector === 'low');
  });
  const navigator = () => once('navigator', async () => {
    answers.overview.wearer.day_navigator = await client.fetchDayNavigator();
  });
  const timeOfDay = () => once('time-of-day', async () => {
    answers.overview.wearer.time_of_day = await client.fetchExploreTimeOfDay();
  });
  const outcomes = () => once('outcomes', async () => {
    const served = await Promise.all(WINDOWS.map((w) => client.fetchOutcomes(Number(w))));
    answers.outcomes = Object.fromEntries(WINDOWS.map((w, i) => [w, served[i]]));
  });

  /** gen_ui_fixtures._pattern_cases: each ranked Pattern's case file, its two cohorts' median traces. */
  async function cases(subjects) {
    if (subjects.length === 0) return {};
    const preparation = await client.fetchDiagnoseFindingCasePreparation();
    const out = {};
    await Promise.all(subjects.map(async (subject) => {
      let answer;
      try {
        answer = await client.fetchDiagnoseFindingCase({
          projection_id: preparation.projection_id, finding_id: subject, alignment: 'event' });
      } catch (error) {
        if (error?.status === 404) return; // no inspectable member: no impact line
        throw error;
      }
      const { projection } = answer;
      out[subject.replace(/^pattern:/, '')] = {
        comparison: { state: projection.comparison.state },
        cohorts: projection.cohorts.filter((c) => c.key === 'matched' || c.key === 'comparison'),
      };
    }));
    return out;
  }

  const queue = () => once('queue', async () => {
    const [served, guided, analysis, roster, focused] = await Promise.all([
      findings(), guidance(), analyze(), trials(), focus()]);
    // gen_ui_fixtures._queue_store: the rows a Queue component reads, among them every admitted setting block.
    const collapsed = new Set(served.outcome_patterns
      .filter((p) => p.collapse === 'collapse_to_member' && p.action)
      .map((p) => `finding:${p.action.split(':')[1]}`));
    const rows = served.rows.filter((r) => r.kind === 'pattern' || r.claimed_by || collapsed.has(r.id)
      || (r.kind === 'setting' && r.members?.length));
    // Only the Patterns the Queue ranks open into a card; a snoozed one is a row.
    const ranked = guided.candidates
      .filter((c) => c.kind === 'pattern' && c.admitted && !c.preference.set_aside).map((c) => c.subject);
    answers.queue.wearer = {
      findings: { outcome_patterns: served.outcome_patterns, rows },
      guidance: answers.queue.wearer.guidance,
      analyze: { basal: analysis.basal.filter((b) => b.asserts_move) },
      trials: roster,
      focus: focused,
      cases: await cases(ranked),
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

  /** gen_ui_fixtures._changes_store, for what the screen draws: the active change and every ended Trial (the
   *  last change is the latest of them, read from the list). Only the active change takes a detail read. */
  const changes = () => once('changes', async () => {
    const [answer] = await Promise.all([trials(), guidance()]);
    const { admission } = answer;
    const shown = answer.trials.filter((t) => t.watch_disposition === 'active' || 'kind' in t.ending);
    const active = admission.active_kind === 'trial' && admission.can_finish_trial
      ? shown.find((t) => t.id === admission.active_id) : null;
    const reassessed = active && (await client.fetchVerifyTrials({ selected: active.id, assessment: 'retained' }))
      .selected.reassessment.comparison.outcomes;
    const pinned = admission.active_kind === 'focus'
      ? answer.focuses.find((f) => f.id === admission.active_id) : null;
    const detail = pinned && (await client.fetchVerifyTrials({
      kind: 'focus', selected: String(pinned.id), assessment: 'retained' })).selected;
    answers.changes.wearer = {
      admission,
      input_revision: answer.input_revision,
      trials: shown.map((t) => (t === active ? { ...t, reassessment: { outcomes: reassessed } } : t)),
      focuses: pinned ? [{ ...pinned, title: detail.title, lever_title: detail.lever_title,
        tracking: tracking(detail.reassessment.comparison) }] : [],
    };
  });

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
  /** One day's timeline and the carbs logged by hand on it, read when the day is picked. */
  const day = (iso) => once(`day ${iso}`, async () => {
    const range = { start: `${iso}T00:00:00`, end: `${shift(iso, 1)}T00:00:00` };
    const [timeline, carbs] = await Promise.all([client.fetchTimeline(range), client.fetchCarbs(range)]);
    answers.day.days[iso] = { timeline, carbs };
  });

  /** The answers each tab shows; the NavBar's badges read status and the Prompts on every tab. */
  const TABS = {
    queue: { read: queue, keys: ['queue', 'findings', 'guidance', 'analyze', 'trials', 'focus'] },
    changes: { read: changes, keys: ['changes', 'trials', 'guidance'] },
    overview: { read: () => Promise.all([outcomes(), timeOfDay(), navigator()]),
      keys: ['outcomes', 'time-of-day', 'navigator'] },
    day: { read: () => Promise.all([navigator(), timeOfDay()]), keys: ['navigator', 'time-of-day'] },
    settings: { read: () => Promise.all([credentials(), pump(), guidance()]),
      keys: ['credentials', 'pump', 'guidance'] },
  };
  const BADGES = ['status', 'prompts'];

  /** Read what `tab` shows, and the badges; whatever has landed already is not read again. */
  const readTab = (tab) => Promise.all([TABS[tab].read(), status(), prompts()]);

  /** Retry: forget what `tab` shows, and the badges, and read them again. */
  const retryTab = (tab) => {
    forget(...TABS[tab].keys, ...BADGES);
    return readTab(tab);
  };

  // --- Writes ----------------------------------------------------------------

  /** Run a write, then forget and read again what it changed, whether or not it saved. */
  async function write(run, keys, reread) {
    try {
      return await run();
    } finally {
      forget(...keys);
      await reread().catch(() => undefined);
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
  /** The days on screen, which a carb write changes. */
  const shownDays = () => Object.keys(answers.day.days);
  const rereadDays = () => Promise.all(shownDays().map(day));

  const queueWrites = {
    snooze: async (subject) => {
      const { analysis_generation: generation } = await guidance();
      await write(() => client.setGuidancePreference(subject, { generation }), FOLLOW_UP, both);
    },
    restore: async (subject) => {
      await write(() => client.restoreGuidancePreference(subject), FOLLOW_UP, both);
    },
    pin: async (subject) => {
      const [guided, focused] = await Promise.all([guidance(), focus()]);
      const candidate = guided.candidates.find((c) => c.subject === subject);
      await write(async () => {
        await client.pinFocus({
          pattern_key: candidate?.pattern_key ?? subject.replace(/^pattern:/, ''), outcome_window: WHOLE_DAY,
          request_id: requestId(`pin ${subject}`), input_revision: focused.input_revision, subject,
          analysis_generation: guided.analysis_generation,
        });
        identities.delete(`pin ${subject}`);
      }, FOLLOW_UP, both);
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
    answer: (prompt, answer) => write(async () => {
      const saved = await client.answerPrompt({
        detector: prompt.detector, anchor_t: prompt.anchorT, answer,
        ...(answer === 'carbs' ? { entry: { grams: null, certainty: 'unknown' } } : {}),
      });
      return { carbEntryId: saved.carb_entry_id ?? null };
    }, ['prompts', ...shownDays().map((iso) => `day ${iso}`)], () => Promise.all([prompts(), rereadDays()])),
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

  return {
    answers,
    readTab,
    retryTab,
    readDay: day,
    /** The account the Settings screen shows: set, or not. */
    accountState: () => (answers.settings.credentials.set?.configured ? 'set' : 'unset'),
    queueWrites,
    changesWrites,
    dayWrites,
    settingsWrites,
  };
}
