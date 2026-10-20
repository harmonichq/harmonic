// The live adapter's reads (#495), through its public interface with a fake
// client that counts every call, over a long history: forty Focus records,
// thirty Trials and twenty admitted Patterns. The server answers one request
// at a time, so what is asserted is how many requests each tab costs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLive } from './live.js';
import { createMemory } from './memory.js';

function history({ activeKind = 'focus' } = {}) {
  const focuses = Array.from({ length: 40 }, (_, i) => ({
    id: i + 1, lever: 'over_treated_low', pattern_key: `p${i}`, pinned_at: '2026-01-01 00:00:00',
    status: i === 39 ? 'active' : 'resolved', title: `Focus ${i}`,
  }));
  const trials = Array.from({ length: 30 }, (_, i) => ({
    id: `trial:${i}`, parameter: 'basal_rate', slot: '03:00', changed_at: '2026-01-01 00:00:00', before: 1, after: 1.1,
    state: 'complete', maturing: { days_elapsed: 14, days_required: 14 }, target_metrics: ['tir'],
    watch_disposition: activeKind === 'trial' && i === 29 ? 'active' : 'not_selected_for_watch',
    ending: i === 29 && activeKind === 'trial' ? { state: 'none' }
      : { kind: 'user_finished', effective_at: `2026-01-${String((i % 28) + 1).padStart(2, '0')} 00:00:00`,
          assessment: { outcomes: [] } },
  }));
  const admission = activeKind === 'trial'
    ? { state: 'available', active_kind: 'trial', active_id: 'trial:29', can_finish_trial: true }
    : { state: 'available', active_kind: 'focus', active_id: 40, can_finish_trial: false };
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    subject: `pattern:p${i}`, pattern_key: `p${i}`, kind: 'pattern', title: `Pattern ${i}`, units: null,
    priority: i, admitted: true, preference: { set_aside: i >= 3 }, decision: null,
  }));
  return { focuses, trials, admission, candidates };
}

function fakeClient(served = history()) {
  const calls = [];
  const answer = (name, value) => (...args) => { calls.push({ name, args }); return Promise.resolve(value(...args)); };
  const comparison = { availability: { state: 'available', reason: null },
    readiness: { after: { unit: 'meals', count: 2, required: 12, criterion_met: false } },
    adherence: { before: {}, after: {}, assessment: { state: 'unclear' } }, outcomes: [] };
  const client = {
    fetchStatus: answer('status', () => ({ last_attempt_at: null, last_success_at: null, last_error: null })),
    fetchPrompts: answer('prompts', () => []),
    fetchGuidance: answer('guidance', () => ({ analysis_generation: 'g1', candidates: served.candidates })),
    fetchDiagnoseFindings: answer('findings', () => ({ outcome_patterns: [], rows: [] })),
    fetchAnalysis: answer('analyze', () => ({ basal: [], ic_blocks: [] })),
    fetchFocuses: answer('focus', () => ({ focuses: served.focuses, input_revision: 7 })),
    fetchVerifyTrials: answer('trials', (opts = {}) => (opts.selected
      ? { selected: { title: 'Pattern', lever_title: 'Habit', reassessment: { comparison: { ...comparison, outcomes: [] } } } }
      : { trials: served.trials, focuses: served.focuses, admission: served.admission, input_revision: 7 })),
    fetchDiagnoseFindingCasePreparation: answer('case-preparation', () => ({ projection_id: 'fp' })),
    fetchDiagnoseFindingCase: answer('case', () => ({ summary: { claimed: 1, denominator: 2, noun: 'meals' }, traces: { anchor: 'bolus', window_min: [-30, 240], pattern: { episodes: [], points: [] }, typical: { points: [] }, causes: [] } })),
    fetchOutcomes: answer('outcomes', () => ({})),
    fetchExploreTimeOfDay: answer('time-of-day', () => ({})),
    fetchMealSize: answer('meal-size', () => ({ window: null, sizes: [] })),
    fetchDayNavigator: answer('navigator', (month) => ({ month: month ?? '2026-01', days: [] })),
    fetchCredentials: answer('credentials', () => ({ configured: false, email: null, region: null })),
    fetchPumpSettings: answer('pump', () => ({ configured: false })),
    fetchTimeline: answer('timeline', () => ({})),
    fetchCarbs: answer('carbs', () => ({ carb_entries: [] })),
    fetchModelView: answer('model-view', (date) => ({
      date, midnight: null, window: { cgm: [{ t: `${date} 00:00:00`, bg: 120 }] },
      episodes: [{ id: 'e', lever: 'late_bolus', lever_title: 'Late bolus', steps: [{ t: 's' }],
        anchors: [{ t: `${date} 13:10:00`, kind: 'meal', label: 'Meal bolus', bg: null, insulin: 3, carbs: 30,
          state: 'fired', verdicts: [{ classifier: 'late_bolus', matched: true, title: 'Late bolus', detail: 'd' }] }] }],
      findings: [{ t: `${date} 13:10:00`, kind: 'meal', bg: null,
        levers: [{ lever: 'late_bolus', title: 'Late bolus' }] }],
    })),
    setGuidancePreference: answer('snooze', () => ({})),
    answerPrompt: answer('answer', () => ({ carb_entry_id: null })),
    createCarb: answer('log', () => ({})),
  };
  const count = (name, where = () => true) => calls.filter((c) => c.name === name && where(c)).length;
  return { client, calls, count };
}

/** Every part Settings draws, read as the app reads them. */
const readSettings = (live) => Promise.all(['status', 'account', 'pump'].map(live.settings.read));

const detail = (call) => Boolean(call.args[0]?.selected);

test('Changes reads at most the active change\'s detail, however long the history', async () => {
  for (const activeKind of ['focus', 'trial']) {
    const fake = fakeClient(history({ activeKind }));
    const live = createLive({ client: fake.client, glossary: [] });
    await live.readTab('changes');
    assert.ok(fake.count('trials', detail) <= 2, `${activeKind}: ${fake.count('trials', detail)} detail reads`);
    assert.equal(fake.count('trials', (c) => !detail(c)), 1, 'the roster is read once');
    assert.equal(live.answers.changes.wearer.admission.active_kind, activeKind);
  }
});

test('Changes keeps every previous change from the roster, and reads a maturing Trial\'s comparison', async () => {
  // #524: the Previous list is every Trial on the roster and every ended Focus,
  // read from the one roster answer; the active Trial's comparison is read
  // whether or not it has matured, since its trace and metrics show either way.
  const served = history({ activeKind: 'trial' });
  served.admission.can_finish_trial = false;
  for (const focus of served.focuses) {
    focus.ending = { kind: 'manual', effective_at: '2026-01-02 00:00:00', assessment: {} };
    focus.status = 'resolved';
  }
  served.focuses[0].ending = { state: 'none' };
  const fake = fakeClient(served);
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('changes');
  const store = live.answers.changes.wearer;
  assert.equal(store.trials.length, 30);
  assert.ok(store.trials.find((t) => t.id === 'trial:29').reassessment, 'the maturing Trial is compared');
  assert.equal(store.focuses.length, 39, 'every ended Focus, and none that never ended');
  assert.equal(fake.count('trials', detail), 1, 'one detail read: the active Trial');
  assert.equal(fake.count('guidance'), 0, 'Changes reads no guidance');
});

test('the Queue reads a case file only for each Pattern it ranks', async () => {
  const fake = fakeClient();
  await createLive({ client: fake.client, glossary: [] }).readTab('queue');
  assert.equal(fake.count('case'), 3, 'three of the twenty admitted Patterns are ranked; the rest are snoozed');
  assert.equal(fake.count('case-preparation'), 1);
});

test('the Queue and the Overview keep none of the ISF segments the analysis still serves (#564)', async () => {
  const fake = fakeClient();
  const segments = [{ start_min: 0, current: 40, recommended: 36.2, asserts_move: true }, { start_min: 720 }];
  fake.client.fetchAnalysis = () => Promise.resolve({ basal: [], isf: segments, ic_blocks: [] });
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('queue');
  await live.readTab('overview');
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(Object.keys(live.answers.queue.wearer.analyze).sort(), ['basal', 'ic_blocks']);
  for (const window of ['14', '30', '90']) {
    assert.deepEqual(Object.keys(live.answers.overview.wearer.analyze[window]), ['basal'], `${window} d`);
  }
});

test('switching tabs back and forth reads nothing again', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  for (const tab of ['queue', 'changes', 'overview', 'day']) await live.readTab(tab);
  await readSettings(live);
  const first = fake.calls.length;
  for (const tab of ['changes', 'queue', 'day', 'overview', 'queue']) await live.readTab(tab);
  await readSettings(live);
  assert.equal(fake.calls.length, first);
  // One read of each shared answer across every tab: the badges, the roster, the guidance.
  for (const name of ['status', 'prompts', 'guidance', 'focus', 'navigator']) {
    assert.equal(fake.count(name), 1, name);
  }
  assert.equal(fake.count('time-of-day'), 3, 'one profile per Overview window, Day\'s among them');
  assert.equal(fake.count('meal-size'), 3, 'one Meal size per Overview window');
  assert.equal(fake.count('trials', (c) => !detail(c)), 1);
});

test('Retry and a write read again only what they change', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('overview');
  await live.readTab('queue');
  const outcomes = fake.count('outcomes');
  await live.queueWrites.snooze('pattern:p0');
  assert.equal(fake.count('guidance'), 2, 'the snooze reads the guidance again');
  assert.equal(fake.count('outcomes'), outcomes, 'and not the Overview');
  await live.dayWrites.answer({ detector: 'low', anchorT: '2026-01-01 03:00:00' }, 'no');
  assert.equal(fake.count('prompts'), 2, 'an answer reads the Prompts again');
  await live.retryTab('overview');
  assert.equal(fake.count('outcomes'), outcomes + 3, 'Retry reads the tab again');
});

test('Done records the card\'s subject from the read it was made on, and a waiting Setting leaves the Queue for Changes', async () => {
  const basal = { subject: 'setting:basal_rate', kind: 'setting', parameter: 'basal_rate', title: 'Basal', units: 'U/h',
    priority: 99, admitted: true, preference: { set_aside: false }, decision: null, acknowledgment: null };
  let served = [basal];
  const fake = fakeClient();
  fake.client.fetchGuidance = (...args) => {
    fake.calls.push({ name: 'guidance', args });
    return Promise.resolve({ analysis_generation: 'g1', input_revision: 7, candidates: served });
  };
  // The roster serves the Settings waiting for the pump, as the engine does (#518).
  const roster = fake.client.fetchVerifyTrials;
  fake.client.fetchVerifyTrials = (opts) => roster(opts).then((answer) => (opts?.selected ? answer : {
    ...answer, waiting: served.filter((c) => c.acknowledgment?.state === 'waiting')
      .map(({ subject, parameter, acknowledgment }) => ({ subject, parameter, acknowledgment })),
  }));
  fake.client.recordDone = (body) => {
    fake.calls.push({ name: 'done', args: [body] });
    served = [{ ...basal, acknowledgment: { state: 'waiting', applied_at: '2026-01-02 00:00:00', read_at: null, blocks: [] } }];
    return Promise.resolve({});
  };
  fake.client.withdrawDone = (body) => {
    fake.calls.push({ name: 'undo', args: [body] });
    served = [basal];
    return Promise.resolve({});
  };
  const { storage, memory } = browser();
  const live = createLive({ client: fake.client, glossary: [], memory });
  await live.readTab('queue');
  assert.equal(live.answers.queue.wearer.guidance.candidates[0].queued, true);
  await live.queueWrites.done('setting:basal_rate');
  const [{ args: [done] }] = fake.calls.filter((c) => c.name === 'done');
  assert.deepEqual({ ...done, request_id: typeof done.request_id },
    { subject: 'setting:basal_rate', request_id: 'string', input_revision: 7, analysis_generation: 'g1' });
  assert.equal(live.answers.queue.wearer.guidance.candidates[0].queued, false, 'a waiting Setting is not queued');
  assert.deepEqual(live.answers.changes.wearer.waiting.map((w) => w.subject), ['setting:basal_rate']);
  // A refresh draws the Done state from the remembered answers before the engine answers (#522).
  const refreshed = createLive({ client: fake.client, glossary: [],
    memory: createMemory({ storage, build: 'build-1', token: () => 'token-a' }) });
  assert.equal(refreshed.answers.queue.wearer.guidance.candidates[0].acknowledgment.state, 'waiting');
  assert.equal(refreshed.answers.queue.wearer.guidance.candidates[0].queued, false);
  assert.deepEqual(refreshed.answers.changes.wearer.waiting.map((w) => w.acknowledgment.state), ['waiting']);
  await live.queueWrites.undoDone('setting:basal_rate');
  const [{ args: [undo] }] = fake.calls.filter((c) => c.name === 'undo');
  assert.deepEqual({ ...undo, request_id: typeof undo.request_id },
    { applied_at: '2026-01-02 00:00:00', request_id: 'string', input_revision: 7 });
  assert.equal(live.answers.queue.wearer.guidance.candidates[0].queued, true, 'Undo queues it again');
  assert.deepEqual(live.answers.changes.wearer.waiting, []);
});

test('the Overview reads each window\'s profile and basal estimate once, the first window first and the others behind it, shared with the Queue and Day', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  const windows = (name) => fake.calls.filter((c) => c.name === name).map((c) => c.args[0] ?? 'default');
  await live.readTab('overview');
  assert.equal(windows('time-of-day')[0], 14, 'the tab is shown once its first window lands');
  assert.equal(windows('analyze')[0], 14);
  assert.equal(fake.count('navigator'), 0, 'the Overview draws no days');
  // The other two windows are read behind the first (#566), with no switch to them...
  await new Promise((resolve) => { setImmediate(resolve); });
  assert.deepEqual(windows('time-of-day'), [14, 30, 90]);
  assert.deepEqual(Object.keys(live.answers.overview.wearer.analyze).sort(), ['14', '30', '90']);
  // ...so switching to one reads nothing more.
  await live.readWindow('30');
  await live.readWindow('90');
  await live.readWindow('14');
  assert.deepEqual(windows('time-of-day'), [14, 30, 90], 'every window, each read once');
  assert.deepEqual(windows('analyze'), [14, 'default', 90], 'the 30 d basal estimate is the Queue\'s analysis');
  await live.readTab('queue');
  assert.deepEqual(windows('analyze'), [14, 'default', 90], 'which the Queue shares');
  assert.deepEqual(Object.keys(live.answers.overview.wearer.analyze).sort(), ['14', '30', '90']);
  assert.deepEqual(Object.keys(live.answers.overview.wearer.time_of_day).sort(), ['14', '30', '90']);
  await live.readTab('day');
  assert.deepEqual(windows('time-of-day'), [14, 30, 90], 'Day reads the target range from the first window');
});

test('an answer the engine served from before its last sync marks its tab, and only it is read again until current (#566)', async () => {
  const fake = fakeClient();
  const age = { revision: 6, covers_to: '2026-01-01 00:00:00', newest_covers_to: '2026-01-01 01:00:00' };
  let earlier = 2;
  fake.client.fetchExploreTimeOfDay = (...args) => {
    fake.calls.push({ name: 'time-of-day', args });
    return Promise.resolve(args[0] === 14 && earlier-- > 0 ? { window: null, input_data_age: age } : { window: null });
  };
  const pauses = [];
  const live = createLive({ client: fake.client, glossary: [], pause: (ms) => { pauses.push(ms); return Promise.resolve(); } });
  await live.readTab('overview');
  await live.readWindow('90');
  assert.equal(live.behind('overview'), true, 'the 14 d profile is an earlier answer');
  assert.equal(live.behind('day'), true, 'and so is the Day screen\'s, which reads it');
  assert.equal(live.behind('queue'), false);
  const outcomes = fake.count('outcomes');
  await live.catchUp('overview');
  assert.equal(live.behind('overview'), false, 'read again until current');
  assert.equal(live.behind('day'), false);
  assert.deepEqual(pauses, [1000, 2000], 'a pause before each read again, growing');
  assert.equal(fake.count('time-of-day', (c) => c.args[0] === 14), 3);
  assert.equal(fake.count('time-of-day', (c) => c.args[0] !== 14), 2, 'the current windows are not read again');
  assert.equal(fake.count('outcomes'), outcomes, 'nor anything else the tab drew');
  assert.equal(live.answers.overview.wearer.time_of_day['14'].input_data_age, undefined);
});

test('a Queue drawn from an earlier case file is marked until its case files are current (#581)', async () => {
  const fake = fakeClient();
  const age = { revision: 6, covers_to: '2026-01-01 00:00:00' };
  let earlier = 1;
  const { fetchDiagnoseFindingCase } = fake.client;
  fake.client.fetchDiagnoseFindingCase = async (opts) => {
    const answer = await fetchDiagnoseFindingCase(opts);
    return earlier-- > 0 ? { ...answer, input_data_age: age } : answer;
  };
  const live = createLive({ client: fake.client, glossary: [], pause: () => Promise.resolve() });
  await live.readTab('queue');
  assert.equal(live.behind('queue'), true, 'a case file the Queue drew is an earlier answer');
  const preparations = fake.count('case-preparation');
  await live.catchUp('queue');
  assert.equal(live.behind('queue'), false, 'read again until current');
  assert.equal(fake.count('case-preparation'), preparations + 1, 'its preparation read again with it');
});

test('a Queue or Changes drawn from an answer served while a sync landed is marked until current (#579)', async () => {
  const fake = fakeClient(history({ activeKind: 'trial' }));
  const age = { revision: 6, covers_to: '2026-01-01 00:00:00' };
  const earlier = { guidance: 1, findings: 1, focus: 1, roster: 1, detail: 1 };
  const once = (name, answer) => (earlier[name]-- > 0 ? { ...answer, input_data_age: age } : answer);
  const { fetchGuidance, fetchDiagnoseFindings, fetchFocuses, fetchVerifyTrials } = fake.client;
  fake.client.fetchGuidance = async () => once('guidance', await fetchGuidance());
  fake.client.fetchDiagnoseFindings = async () => once('findings', await fetchDiagnoseFindings());
  fake.client.fetchFocuses = async () => once('focus', await fetchFocuses());
  fake.client.fetchVerifyTrials = async (opts) => once(opts?.selected ? 'detail' : 'roster', await fetchVerifyTrials(opts));
  const live = createLive({ client: fake.client, glossary: [], pause: () => Promise.resolve() });
  await Promise.all([live.readTab('queue'), live.readTab('changes')]);
  assert.equal(live.behind('queue'), true, 'the Queue drew earlier answers');
  assert.equal(live.behind('changes'), true, 'and so did Changes');
  assert.equal(live.behind('overview'), false);
  await Promise.all([live.catchUp('queue'), live.catchUp('changes')]);
  assert.equal(live.behind('queue'), false, 'read again until current');
  assert.equal(live.behind('changes'), false);
  assert.equal(fake.count('guidance'), 2);
  assert.equal(fake.count('findings'), 2);
  assert.equal(fake.count('focus'), 2);
  assert.equal(fake.count('trials', detail), 2, 'the active Trial\'s detail, once again');
});

test('an answer that stays behind is read again a bounded number of times', async () => {
  const fake = fakeClient();
  fake.client.fetchMealSize = (...args) => {
    fake.calls.push({ name: 'meal-size', args });
    return Promise.resolve({ window: null, sizes: [],
      ...(args[0] === 14 ? { input_data_age: { revision: 1, covers_to: '2026-01-01 00:00:00' } } : {}) });
  };
  const live = createLive({ client: fake.client, glossary: [], pause: () => Promise.resolve() });
  await live.readTab('overview');
  await Promise.all([live.catchUp('overview'), live.catchUp('overview')]);
  assert.equal(live.behind('overview'), true, 'still marked, never shown as current');
  assert.equal(fake.count('meal-size', (c) => c.args[0] === 14), 7, 'six reads again, one catch-up at a time');
});

test('concurrent tabs share one request for an answer in flight', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await Promise.all([live.readTab('queue'), live.readTab('changes'), readSettings(live)]);
  assert.equal(fake.count('guidance'), 1);
  assert.equal(fake.count('trials', (c) => !detail(c)), 1);
});

test('Settings reads no guidance, and its root resolves once the status has landed', async () => {
  const fake = fakeClient();
  // The pump profile and the account are the slow reads; the root must not wait on them.
  let landPump;
  fake.client.fetchPumpSettings = () => new Promise((resolve) => { landPump = resolve; });
  const live = createLive({ client: fake.client, glossary: [] });
  const pump = live.settings.read('pump');
  let pumpLanded = false;
  pump.then(() => { pumpLanded = true; });
  await live.settings.read('status');
  await live.settings.read('account');
  assert.equal(pumpLanded, false, 'the status and account resolved while the pump profile is still in flight');
  assert.equal(live.answers.status.ok.last_attempt_at, null, 'the status the root draws is read');
  landPump({ configured: false });
  await pump;
  await live.settings.badges();
  assert.equal(fake.count('guidance'), 0, 'no guidance read');
  assert.equal(fake.count('status'), 1);
  assert.deepEqual(live.answers.settings.pump_settings.wearer, { configured: false });
});

test('Retry on a Settings part reads only that part again', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await readSettings(live);
  await live.settings.retry('pump');
  assert.equal(fake.count('pump'), 2);
  assert.equal(fake.count('credentials'), 1);
  assert.equal(fake.count('status'), 1);
});

test('a picked day reads what the engine counted on it once, kept to what the chart marks', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readDay('2026-01-05');
  await live.readDay('2026-01-05');
  assert.equal(fake.count('model-view'), 1);
  assert.deepEqual(fake.calls.find((c) => c.name === 'model-view').args, ['2026-01-05']);
  assert.deepEqual(live.answers.day.days['2026-01-05'].model_view, {
    date: '2026-01-05',
    findings: [{ t: '2026-01-05 13:10:00', kind: 'meal', bg: null,
      levers: [{ lever: 'late_bolus', title: 'Late bolus' }] }],
  });
});

test('Log carbs posts the time picked, today, or now when none was', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.dayWrites.logCarbs(30, '07:45');
  await live.dayWrites.logCarbs(12);
  const [picked, unpicked] = fake.calls.filter((c) => c.name === 'log').map((c) => c.args[0]);
  assert.match(picked.t, /^\d{4}-\d{2}-\d{2} 07:45:00$/);
  assert.deepEqual({ grams: picked.grams, certainty: picked.certainty, source: picked.source },
    { grams: 30, certainty: 'exact', source: 'manual' });
  assert.match(unpicked.t, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(picked.t.slice(0, 10), unpicked.t.slice(0, 10));
});

test('a whole-profile Trial and a candidate of an unknown kind are read through, never dropped or fatal', async () => {
  const served = history({ activeKind: 'trial' });
  Object.assign(served.trials[29], { parameter: 'profile', slot: null, before: null, after: null });
  served.candidates.push({ subject: 'habit:missed_meal', kind: 'habit', title: 'Habit', units: null, priority: 99,
    admitted: true, preference: { set_aside: false }, decision: null });
  const fake = fakeClient(served);
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('changes');
  await live.readTab('queue');
  const active = live.answers.changes.wearer.trials.find((t) => t.id === 'trial:29');
  assert.equal(active.parameter, 'profile');
  assert.ok(active.reassessment, 'the active profile Trial is reassessed like any Trial');
  const unknown = live.answers.queue.wearer.guidance.candidates.find((c) => c.subject === 'habit:missed_meal');
  assert.equal(unknown.queued, true);
});

test('the Day screen reads each other month once, and the navigator\'s own month not at all', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('day');
  assert.equal(fake.count('navigator'), 1);
  await live.readMonth('2026-01');
  assert.equal(fake.count('navigator'), 1, 'the month already read is not read again');
  await live.readMonth('2025-12');
  await live.readMonth('2025-12');
  assert.equal(fake.count('navigator'), 2, 'stepping back reads the previous month once');
  assert.deepEqual(fake.calls.filter((c) => c.name === 'navigator').map((c) => c.args[0]), [undefined, '2025-12']);
  assert.equal(live.answers.day.months['2025-12'].month, '2025-12');
});

test('a month that cannot be read is read again on the next ask', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('day');
  const real = fake.client.fetchDayNavigator;
  fake.client.fetchDayNavigator = (month) => (month === '2025-12' ? Promise.reject(new Error('down')) : real(month));
  await assert.rejects(live.readMonth('2025-12'));
  fake.client.fetchDayNavigator = real;
  await live.readMonth('2025-12');
  assert.equal(live.answers.day.months['2025-12'].month, '2025-12');
});

// --- Remembered answers (#522) -------------------------------------------------

/** A Storage, in memory, with a switch that refuses every access. */
function fakeStorage() {
  const items = new Map();
  let refusing = false;
  const guard = () => { if (refusing) throw new Error('SecurityError'); };
  return {
    get length() { guard(); return items.size; },
    key: (i) => { guard(); return [...items.keys()][i] ?? null; },
    getItem: (k) => { guard(); return items.has(k) ? items.get(k) : null; },
    setItem: (k, v) => { guard(); items.set(k, String(v)); },
    removeItem: (k) => { guard(); items.delete(k); },
    keys: () => [...items.keys()],
    refuse: () => { refusing = true; },
  };
}

/** A browser's memory under one build and a token that can change. */
function browser(storage = fakeStorage(), build = 'build-1') {
  const holder = { token: 'token-a' };
  const memory = createMemory({ storage, build, token: () => holder.token });
  return { storage, memory, holder };
}

test('a refresh draws the remembered answers before the engine answers, then reads them again', async () => {
  const { storage, memory } = browser();
  const first = createLive({ client: fakeClient().client, glossary: [], memory });
  await first.readTab('queue');
  assert.equal(first.remembered('queue'), false, 'answers read this visit are not drawn from memory');

  // The page is refreshed: a new adapter over the same browser, and an engine that has not answered yet.
  let answer;
  const pending = new Promise((resolve) => { answer = resolve; });
  const fake = fakeClient();
  const slow = { ...fake.client, fetchGuidance: (...args) => pending.then(() => fake.client.fetchGuidance(...args)) };
  const refreshed = createLive({ client: slow, glossary: [], memory: createMemory({ storage, build: 'build-1', token: () => 'token-a' }) });
  assert.equal(refreshed.remembered('queue'), true);
  assert.equal(refreshed.remembered('overview'), false, 'a tab never read is not remembered');
  assert.equal(refreshed.answers.queue.wearer.guidance.candidates.length, 20, 'drawn before the engine answers');
  const read = refreshed.readTab('queue');
  assert.equal(refreshed.remembered('queue'), true, 'still drawn from memory while it is read again');
  answer();
  await read;
  assert.equal(fake.count('guidance'), 1, 'and read again behind what it shows');
  assert.equal(refreshed.remembered('queue'), false);
});

test('remembered answers are never read under another token or another build', async () => {
  const { storage, memory, holder } = browser();
  await createLive({ client: fakeClient().client, glossary: [], memory }).readTab('changes');
  holder.token = 'token-b';
  assert.equal(createLive({ client: fakeClient().client, glossary: [], memory }).remembered('changes'), false);
  const rebuilt = createMemory({ storage, build: 'build-2', token: () => 'token-a' });
  assert.equal(createLive({ client: fakeClient().client, glossary: [], memory: rebuilt }).remembered('changes'), false);
  // Saving under the new token drops what the old one kept.
  await createLive({ client: fakeClient().client, glossary: [], memory }).readTab('day');
  assert.equal(storage.keys().length, 1);
  holder.token = 'token-a';
  assert.equal(createLive({ client: fakeClient().client, glossary: [], memory }).remembered('changes'), false);
});

test('storage that refuses access keeps nothing, and every tab reads as before', async () => {
  const { storage, memory } = browser();
  storage.refuse();
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [], memory });
  await live.readTab('queue');
  assert.equal(live.remembered('queue'), false);
  assert.equal(fake.count('guidance'), 1);
});

test('a new token forgets every answer, and the next read asks the engine again', async () => {
  const { memory } = browser();
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [{ term: 'kept' }], memory });
  await live.readTab('queue');
  live.reset();
  assert.deepEqual(live.answers.queue.wearer.guidance.candidates, []);
  assert.deepEqual(live.answers.glossary, [{ term: 'kept' }]);
  await live.readTab('queue');
  assert.equal(fake.count('guidance'), 2);
});

test('a remembered Settings part and a picked day draw at once after a refresh', async () => {
  const { storage, memory } = browser();
  const live = createLive({ client: fakeClient().client, glossary: [], memory });
  await live.settings.read('account');
  await live.readDay('2026-01-05');
  const refreshed = createLive({ client: fakeClient().client, glossary: [], memory: createMemory({ storage, build: 'build-1', token: () => 'token-a' }) });
  assert.equal(refreshed.remembered('settings account'), true);
  assert.ok(refreshed.answers.day.days['2026-01-05'].model_view);
});

test('a refresh draws Changes\' comparison from memory, kept to what the screen draws (#524)', async () => {
  const { storage, memory } = browser();
  const served = history({ activeKind: 'trial' });
  const fake = fakeClient(served);
  const trace = { alignment: 'clock', start_min: 120, start: 0, end: 180, episodes: 3, left_off: 0, bins: [], traces: null };
  const comparison = {
    availability: { state: 'available', reason: null },
    outcomes: [{ key: 'tir', unit: '%', before: 90, after: 95, assessment: { state: 'unclear' } }],
    denominators: { before: { readings: 900, contributing_meals: 4, coverage: [{ date: '2026-01-01' }] },
      after: { readings: 800, contributing_meals: 3, coverage: [] } },
    views: {
      before: { trace, basal: { delivered: 1, programmed: 1, above: 0, below: 0, minutes: 60 },
        occurrences: [{ trace: { cgm: [{ minute: 0, bg: 100 }] } }], clock: [], rest_windows: [] },
      after: { trace, basal: null, occurrences: [], clock: [], rest_windows: [] },
    },
  };
  const roster = fake.client.fetchVerifyTrials;
  fake.client.fetchVerifyTrials = (opts = {}) => (opts.selected
    ? Promise.resolve({ selected: { reassessment: { comparison } } }) : roster(opts));
  await createLive({ client: fake.client, glossary: [], memory }).readTab('changes');

  const refreshed = createLive({ client: fakeClient(served).client, glossary: [],
    memory: createMemory({ storage, build: 'build-1', token: () => 'token-a' }) });
  assert.equal(refreshed.remembered('changes'), true);
  const kept = refreshed.answers.changes.wearer.trials.find((t) => t.id === 'trial:29').reassessment;
  assert.deepEqual(kept, {
    availability: { state: 'available' },
    outcomes: comparison.outcomes,
    denominators: { before: { contributing_meals: 4 }, after: { contributing_meals: 3 } },
    views: { before: { trace, basal: comparison.views.before.basal }, after: { trace, basal: null } },
  });
});

test('Day keeps its lows and its rises, remembered as their cards draw them, and a rise is answered as a rise (#529)', async () => {
  const { storage, memory } = browser();
  const fake = fakeClient();
  const cgm = [{ t: '2026-01-05 12:00:00', bg: 140 }, { t: '2026-01-05 13:00:00', bg: 290 }];
  const served = [
    { detector: 'low', anchor_t: '2026-01-04 03:15:00', key_t: '2026-01-04 03:15:00', key_bg: 55,
      question: 'Did you treat this low?', context: 'Glucose dropped to 55 mg/dL.', age_days: 1.4, cgm, answer: null },
    { detector: 'missed-meal', anchor_t: '2026-01-05 12:40:00', key_t: '2026-01-05 13:00:00', key_bg: 290,
      question: 'Did you eat here?', context: 'Glucose rose to 290 mg/dL with no bolus logged.', age_days: 0.5, cgm, answer: null },
  ];
  fake.client.fetchPrompts = () => Promise.resolve(served);
  const live = createLive({ client: fake.client, glossary: [], memory });
  await live.readTab('day');
  const marks = served.map(({ detector, anchor_t, key_t, key_bg, answer }) => ({ detector, anchor_t, key_t, key_bg, cgm, answer }));
  assert.deepEqual(live.answers.prompts, marks);

  const refreshed = createLive({ client: fakeClient().client, glossary: [],
    memory: createMemory({ storage, build: 'build-1', token: () => 'token-a' }) });
  assert.deepEqual(refreshed.answers.prompts, marks, 'the browser keeps no question or context sentence');

  await live.dayWrites.answer({ detector: 'missed-meal', anchorT: '2026-01-05 12:40:00' }, 'no');
  assert.deepEqual(fake.calls.find((c) => c.name === 'answer').args[0],
    { detector: 'missed-meal', anchor_t: '2026-01-05 12:40:00', answer: 'no' });
});

test('the Queue and Overview keep only what their charts draw, so the remembered answers stay small (ADR 523)', async () => {
  const fake = fakeClient();
  const night = { date: '2024-05-01', delivered_rate: 0.5, programmed_rate: 0.6, points: [1, 2, 3] };
  const slot = (n, asserts) => ({
    slot: n, label: '00:00', current: 0.6, recommended: 0.5, asserts_move: asserts, direction: asserts ? 'lower' : null,
    estimate: { value: 0.5, lo: 0.4, hi: 0.6, n: 9, method: 'bootstrap-median' }, days: 9, guidance: {},
    evidence: { night_roster: [night], points: [1, 2, 3] },
  });
  const run = { t: '2024-05-01T08:00:00', true_ic: 8 };
  fake.client.fetchAnalysis = () => Promise.resolve({
    basal: [slot(0, true), slot(1, false)],
    ic_blocks: [{ block_id: 0, start_min: 0, end_min: 1440, current_values: [10], recommended: 9, asserts_move: true,
      estimate: { value: 8, lo: 7, hi: 9, n: 8 }, harm: {}, evidence: { runs: [run], ledger: {}, counted_runs: [run] } }],
  });
  fake.client.fetchDiagnoseFindingCase = () => Promise.resolve({ projection: {}, occurrences: [], traces: {
    anchor: 'nadir', window_min: [0, 180],
    pattern: { anchors: ['2024-05-01 07:00:00'], episodes: [[{ minute: 0, bg: 60 }]], points: [] },
    typical: { anchors: ['2024-05-02 07:00:00'], points: [] },
    causes: [{ subject: 'habit:over_treated_low',
      pattern: { anchors: ['2024-05-01 07:00:00'], episodes: [[{ minute: 0, bg: 60 }]], points: [] } }],
  } });
  fake.client.fetchGuidance = () => Promise.resolve({ analysis_generation: 'g1', candidates: [
    { subject: 'pattern:highs_after_treating_lows', kind: 'pattern', admitted: true, preference: { set_aside: false } }] });
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('queue');
  await live.readWindow('14');
  const queue = live.answers.queue.wearer;
  assert.deepEqual(queue.cases.highs_after_treating_lows.traces, {
    anchor: 'nadir', window_min: [0, 180], pattern: { episodes: [[{ minute: 0, bg: 60 }]], points: [] }, typical: { points: [] },
    // Each cause's own trace, without its anchor list (ADR 593).
    causes: [{ subject: 'habit:over_treated_low', pattern: { episodes: [[{ minute: 0, bg: 60 }]], points: [] } }],
  });
  assert.deepEqual(queue.analyze.ic_blocks, [{ block_id: 0, start_min: 0, end_min: 1440, current_values: [10],
    recommended: 9, estimate: { value: 8, lo: 7, hi: 9 }, evidence: { counted_runs: [run] } }]);
  assert.deepEqual(queue.analyze.basal.map((b) => [b.slot, b.evidence.night_roster]),
    [[0, [{ date: '2024-05-01', delivered_rate: 0.5, programmed_rate: 0.6 }]]]);
  assert.deepEqual(live.answers.overview.wearer.analyze['14'].basal[1], {
    slot: 1, current: 0.6, asserts_move: false, direction: null, estimate: { value: 0.5, lo: 0.4, hi: 0.6 },
  });
});

test('a standalone habit\'s case file is read, queued or snoozed, and kept to its count and chart (ADR 528)', async () => {
  const fake = fakeClient();
  const habit = (lever, setAside) => ({ subject: `habit:${lever}`, kind: 'habit', lever, title: 'Habit', units: null,
    priority: 1, admitted: true, preference: { set_aside: setAside }, decision: null });
  fake.client.fetchGuidance = () => Promise.resolve({ analysis_generation: 'g1', candidates: [
    habit('missed_meal', false), habit('other_habit', true),
    { ...habit('unadmitted', false), admitted: false }] });
  fake.client.fetchDiagnoseFindings = () => Promise.resolve({ outcome_patterns: [], rows: [
    { id: 'finding:missed_meal', kind: 'habit', chips: ['highs'] },
    { id: 'finding:other_habit', kind: 'habit', chips: ['highs'] },
    { id: 'finding:unadmitted', kind: 'habit', chips: ['highs'] }] });
  const finding = [];
  fake.client.fetchDiagnoseFindingCase = ({ finding_id: id }) => {
    finding.push(id);
    return Promise.resolve({ projection: {}, occurrences: [], verdict_counts: {},
      summary: { claimed: 2, denominator: 6, noun: 'highs' },
      traces: { anchor: 'meal_start', window_min: [-60, 300],
        pattern: { anchors: ['2024-05-24 13:30:00'], episodes: [[{ minute: -60, bg: 110 }]], points: [] },
        typical: { anchors: ['2024-05-26 12:00:00'], points: [] } } });
  };
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('queue');
  assert.deepEqual(finding.sort(), ['finding:missed_meal', 'finding:other_habit'], 'each admitted habit, by its finding');
  const queue = live.answers.queue.wearer;
  assert.deepEqual(queue.cases.missed_meal, {
    summary: { claimed: 2, denominator: 6, noun: 'highs' },
    traces: { anchor: 'meal_start', window_min: [-60, 300], pattern: { episodes: [[{ minute: -60, bg: 110 }]], points: [] },
      typical: { points: [] } },
  });
  assert.deepEqual(queue.findings.rows.map((r) => r.id), ['finding:missed_meal', 'finding:other_habit']);
});

test('Pin on a standalone habit pins its lever under the habit\'s own subject, with no Pattern or outcome window', async () => {
  const fake = fakeClient();
  fake.client.fetchGuidance = () => Promise.resolve({ analysis_generation: 'g1', candidates: [
    { subject: 'habit:missed_meal', kind: 'habit', lever: 'missed_meal', title: 'Habit', units: null, priority: 1,
      admitted: true, preference: { set_aside: false }, decision: null },
    { subject: 'pattern:p0', pattern_key: 'p0', kind: 'pattern', title: 'Pattern', units: null, priority: 0,
      admitted: true, preference: { set_aside: false }, decision: null }] });
  const pinned = [];
  fake.client.pinFocus = (body) => { pinned.push(body); return Promise.resolve({}); };
  fake.client.resolveFocus = () => Promise.resolve({});
  fake.client.finishTrial = () => Promise.resolve({});
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('queue');
  await live.queueWrites.pin('habit:missed_meal');
  await live.queueWrites.pin('pattern:p0');
  const [habit, pattern] = pinned.map(({ request_id: id, ...rest }) => (assert.match(id, /^[0-9a-f]{32}$/), rest));
  assert.deepEqual(habit, { lever: 'missed_meal', subject: 'habit:missed_meal', input_revision: 7, analysis_generation: 'g1' });
  assert.deepEqual(pattern, { pattern_key: 'p0', outcome_window: { start_min: 0, end_min: 1440 }, subject: 'pattern:p0',
    input_revision: 7, analysis_generation: 'g1' });
});

test('the Overview reads each window\'s Meal size once, the first window first, kept to what the card draws (#501, #565, #566)', async () => {
  const fake = fakeClient();
  const size = (from, to, count) => ({ carbs_from: from, carbs_to: to, count,
    climb: { median: 62, p10: 40, p25: 55, p75: 70, p90: 88 }, to_peak: { median: 75 }, at_3h: { count: 1, median: 4 } });
  fake.client.fetchMealSize = (...args) => {
    fake.calls.push({ name: 'meal-size', args });
    return Promise.resolve({ window: { start: '2024-02-01 00:00:00', end: '2024-05-01 00:00:00', data_days: args[0] },
      horizon_hours: 3, sizes: [size(null, 25, 0), size(25, 40, 1), size(40, 60, 0), size(60, null, 0)] });
  };
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('overview');
  assert.equal(fake.calls.find((c) => c.name === 'meal-size').args[0], 14, 'the first window first');
  for (const window of ['30', '90', '14', '30']) await live.readWindow(window);
  await live.readTab('overview');
  assert.deepEqual(fake.calls.filter((c) => c.name === 'meal-size').map((c) => c.args[0]), [14, 30, 90],
    'each window once');
  assert.deepEqual(live.answers.overview.wearer.meal_size['90'], {
    window: { data_days: 90 },
    horizon_hours: 3,
    sizes: [size(null, 25, 0), size(25, 40, 1), size(40, 60, 0), size(60, null, 0)],
  }, 'each size as served, the window kept to its days');
  await live.retryTab('overview');
  await new Promise((resolve) => { setImmediate(resolve); });
  const again = fake.calls.filter((c) => c.name === 'meal-size').slice(3).map((c) => c.args[0]);
  assert.equal(again[0], 14, 'the Overview\'s Retry reads its first window first');
  assert.deepEqual(again.sort((a, b) => a - b), [14, 30, 90], 'and every window again, once');
});
