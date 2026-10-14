// The live adapter's reads (#495), through its public interface with a fake
// client that counts every call, over a long history: forty Focus records,
// thirty Trials and twenty admitted Patterns. The server answers one request
// at a time, so what is asserted is how many requests each tab costs.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createLive } from './live.js';

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
  const comparison = { readiness: { after: { unit: 'meals', count: 2, required: 12, criterion_met: false } },
    adherence: { before: {}, after: {}, assessment: { state: 'unclear' } }, outcomes: [] };
  const client = {
    fetchStatus: answer('status', () => ({ last_attempt_at: null, last_success_at: null, last_error: null })),
    fetchPrompts: answer('prompts', () => []),
    fetchGuidance: answer('guidance', () => ({ analysis_generation: 'g1', candidates: served.candidates })),
    fetchDiagnoseFindings: answer('findings', () => ({ outcome_patterns: [], rows: [] })),
    fetchAnalysis: answer('analyze', () => ({ basal: [] })),
    fetchFocuses: answer('focus', () => ({ focuses: served.focuses, input_revision: 7 })),
    fetchVerifyTrials: answer('trials', (opts = {}) => (opts.selected
      ? { selected: { title: 'Pattern', lever_title: 'Habit', reassessment: { comparison: { ...comparison, outcomes: [] } } } }
      : { trials: served.trials, focuses: served.focuses, admission: served.admission, input_revision: 7 })),
    fetchDiagnoseFindingCasePreparation: answer('case-preparation', () => ({ projection_id: 'fp' })),
    fetchDiagnoseFindingCase: answer('case', () => ({ projection: { comparison: { state: 'available' }, cohorts: [] } })),
    fetchOutcomes: answer('outcomes', () => ({})),
    fetchExploreTimeOfDay: answer('time-of-day', () => ({})),
    fetchDayNavigator: answer('navigator', (month) => ({ month: month ?? '2026-01', days: [] })),
    fetchCredentials: answer('credentials', () => ({ configured: false, email: null, region: null })),
    fetchPumpSettings: answer('pump', () => ({ configured: false })),
    fetchTimeline: answer('timeline', () => ({})),
    fetchCarbs: answer('carbs', () => ({ carb_entries: [] })),
    setGuidancePreference: answer('snooze', () => ({})),
    answerPrompt: answer('answer', () => ({ carb_entry_id: null })),
    createCarb: answer('log', () => ({})),
  };
  const count = (name, where = () => true) => calls.filter((c) => c.name === name && where(c)).length;
  return { client, calls, count };
}

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

test('the Queue reads a case file only for each Pattern it ranks', async () => {
  const fake = fakeClient();
  await createLive({ client: fake.client, glossary: [] }).readTab('queue');
  assert.equal(fake.count('case'), 3, 'three of the twenty admitted Patterns are ranked; the rest are snoozed');
  assert.equal(fake.count('case-preparation'), 1);
});

test('switching tabs back and forth reads nothing again', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  for (const tab of ['queue', 'changes', 'overview', 'day', 'settings']) await live.readTab(tab);
  const first = fake.calls.length;
  for (const tab of ['changes', 'queue', 'settings', 'day', 'overview', 'queue']) await live.readTab(tab);
  assert.equal(fake.calls.length, first);
  // One read of each shared answer across every tab: the badges, the roster, the guidance.
  for (const name of ['status', 'prompts', 'guidance', 'focus', 'navigator', 'time-of-day']) {
    assert.equal(fake.count(name), 1, name);
  }
  assert.equal(fake.count('trials', (c) => !detail(c)), 1);
});

test('Retry and a write read again only what they change', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await live.readTab('overview');
  await live.readTab('queue');
  const navigator = fake.count('navigator');
  await live.queueWrites.snooze('pattern:p0');
  assert.equal(fake.count('guidance'), 2, 'the snooze reads the guidance again');
  assert.equal(fake.count('navigator'), navigator, 'and not the Overview');
  await live.dayWrites.answer({ detector: 'low', anchorT: '2026-01-01 03:00:00' }, 'no');
  assert.equal(fake.count('prompts'), 2, 'an answer reads the Prompts again');
  await live.retryTab('overview');
  assert.equal(fake.count('navigator'), navigator + 1, 'Retry reads the tab again');
});

test('concurrent tabs share one request for an answer in flight', async () => {
  const fake = fakeClient();
  const live = createLive({ client: fake.client, glossary: [] });
  await Promise.all([live.readTab('queue'), live.readTab('changes'), live.readTab('settings')]);
  assert.equal(fake.count('guidance'), 1);
  assert.equal(fake.count('trials', (c) => !detail(c)), 1);
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
