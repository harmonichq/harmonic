import test from 'node:test';
import assert from 'node:assert/strict';
import { withReplayAssertionTimeout } from './replay-assertions.mjs';
import { readFileSync } from 'node:fs';
import {
  historicalAbsence, C4_RETIREMENTS, assertS107RosterGeometry, assertBasalLaneGallery, assertRankedMinis,
  assertBasalLaneReachable, LANE_REACH_SIZES, assertRecurringLowsVariant, assertClaimedEpisodeLog, assertBandGlossary,
  assertServedComparison424, assertComparisonCaption424, assertServedFold424, assertFoldLine424,
  assertServedRowDescriptions432, assertSelectedFacts432, assertSentenceOnce454, queueNumbers451,
  OVERVIEW_PRESETS, overviewTextFailures, assertOverviewText, spotlightVerdictFailures, assertSpotlightVerdict,
  canvasHeadFailures, assertCanvasHead, readSettled,
} from './c4.replay.mjs';
import { queueRows, scopeNote } from './diagnose-findings-queue.js';
import { C2_STORIES } from './c2.replay.mjs';
import { railRowLocator } from './diagnose-replay.mjs';
import { REGISTRY } from './desk-behavior.replay.mjs';
import { storyCase } from './replay-cases.mjs';

function inputPage(rows, roster = { trials: [{}], focuses: [{}] }) {
  return {
    url: () => 'http://synthetic.invalid/',
    request: { get: async url => ({ status: () => 200, text: async () => '',
      json: async () => new URL(url).pathname.endsWith('preparation')
        ? { findings: { rows } } : roster }) },
  };
}

test('R18 is a unique app-only registry function with a manufactured history case', () => {
  const entries = REGISTRY.filter(([id]) => id === 'R18');
  assert.equal(entries.length, 1);
  assert.equal(entries[0][1].deferred.term, 'HV2-31');
  assert.equal(storyCase('R18'), 'c4-history');
});

test('S106 and S107 are unique app-only C4 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [['S106', 'pattern-near-tie', 'HV2-17'], ['S107', 'showcase', 'HV2-11']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S107 keeps a grouped comparison heading distinct from readable mixed-tier case rows', () => {
  const rect = (left, right, top = 0, bottom = 10) => ({ left, right, top, bottom });
  const meal = { id: `o_${'1'.repeat(32)}`, verdict: 'fired',
    anchor: { t: '2024-05-24 12:05:00', kind: 'meal', label: 'Completed carb bolus', bg: null,
      insulin: 4, carbs: 40 },
    outcome: { kind: 'peak', bg: 149.6, t: '2024-05-24 13:35:00', minute: 90 } };
  const served = { occurrences: [meal] };
  const text = '40 g · 4 U · peak 150';
  const event = { occurrenceId: meal.id, comparisonCohort: 'matched',
    description: { text, truncated: false, ...rect(120, 260) }, tier: null };
  const fired = { occurrenceId: meal.id, description: { text, truncated: false, ...rect(120, 260) },
    tier: { text: 'Meets criteria', ...rect(280, 360) } };
  const near = { occurrenceId: meal.id, description: { text, truncated: false, ...rect(120, 260) },
    tier: { text: 'Borderline', ...rect(280, 350) } };
  const expectedCohorts = [
    { key: 'matched', name: 'Matched' },
    { key: 'nearly_matched', name: 'Nearly matched' },
    { key: 'comparison', name: 'Other completed carb-bolus meals' },
  ];
  assert.doesNotThrow(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] }, tierRows: [fired, near], expectedCohorts, served,
  }));
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.slice(1).map(cohort => cohort.name), rows: [event] }, tierRows: [fired, near], expectedCohorts, served,
  }), /exact served cohorts once/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [{ ...event, description: { ...event.description, truncated: true } }] },
    tierRows: [fired, near], expectedCohorts, served,
  }), /fully readable/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] },
    tierRows: [{ ...fired, tier: { ...fired.tier, truncated: true } }, near], expectedCohorts, served,
  }), /fully readable/);
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [event] },
    tierRows: [{ ...fired, tier: { ...fired.tier, ...rect(240, 360) } }, near], expectedCohorts, served,
  }), /columns overlap/);
  // #432 amendment: readability keys on the served description, so the retired
  // constant-label row no longer counts as readable text.
  const retired = { ...event.description, text: '— · Completed carb bolus' };
  assert.throws(() => assertS107RosterGeometry({
    comparison: { cohortHeadings: expectedCohorts.map(cohort => cohort.name), rows: [{ ...event, description: retired }] },
    tierRows: [fired, near], expectedCohorts, served,
  }), /fully readable/);
});

test('S148–S150 are unique app-only #432 stories with their required manufactured cases', () => {
  for (const [id, expectedCase] of [['S148', 'showcase'], ['S149', 'showcase'], ['S150', 'pattern-near-tie']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'ADR 432');
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S177–S179 are unique app-only #451 stories on the isf-strengthen store', () => {
  for (const id of ['S177', 'S178', 'S179']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'ADR 451');
    assert.equal(storyCase(id), 'isf-strengthen');
  }
});

test('S186 is a unique app-only #460 story on the basal-lower store', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S186');
  assert.equal(entries.length, 1, 'S186 is registered once');
  assert.equal(entries[0][1].deferred.term, 'ADR 460');
  assert.equal(storyCase('S186'), 'basal-lower');
});

test('S187 is a unique app-only #459 story on the basal-and-carb-ratio-lower store', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S187');
  assert.equal(entries.length, 1, 'S187 is registered once');
  assert.equal(entries[0][1].deferred.term, 'ADR 459');
  assert.equal(storyCase('S187'), 'basal-and-carb-ratio-lower');
});

test('S178 expects the numbers line the queue prints, served scope note included', () => {
  const projection = JSON.parse(readFileSync(new URL('./__fixtures__/findings-projection.json', import.meta.url), 'utf8'))
    .windows.low_block;
  // Shaped like isf-strengthen's served row: asserting, whole-day, 40 → 32.
  const served = { ...projection.rows.find(row => row.parameter === 'isf'), register: 'assert',
    direction: 'strengthen', asserts_move: true, current: 40, recommended: 32, window_scope: 'whole_day' };
  const [row] = queueRows({ ...projection, rows: [served] });
  const printed = `${row.detail.now}${row.detail.then}${scopeNote(served)}`;
  assert.equal(queueNumbers451(served), printed);
  assert.equal(printed, 'now 1 U : 40.0 mg/dL → 1 U : 32.0 mg/dL · Whole day');
  assert.doesNotMatch(printed, /mg\/dL\/U/);
  assert.equal(queueNumbers451({ ...served, window_scope: 'window' }), 'now 1 U : 40.0 mg/dL → 1 U : 32.0 mg/dL',
    'a windowed row carries no scope note');
});

const servedCaseFiles432 = JSON.parse(readFileSync(new URL(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json', import.meta.url), 'utf8'));
const mealCase432 = () => JSON.parse(JSON.stringify(servedCaseFiles432.cases['finding:meal_bolus_short'].event));
// The base server's shape: an anchor with no dose or carbs, and no outcome.
const baseShaped432 = (served) => {
  for (const row of served.occurrences) {
    delete row.anchor.insulin; delete row.anchor.carbs; delete row.outcome;
  }
  return served;
};

test('S148/S150 row descriptions pass when each rendered row reads its own served meal', () => {
  const served = mealCase432();
  const [first] = served.occurrences;
  assert.deepEqual([first.anchor.carbs, first.anchor.insulin, first.outcome.kind, first.outcome.bg],
    [40, 4, 'peak', 147.5]);
  assert.doesNotThrow(() => assertServedRowDescriptions432('S148', served,
    [{ occurrenceId: first.id, text: '40 g · 4 U · peak 148' }]));
});

test('S148/S150 reach their feature assertion on the base server shape, never a premise', () => {
  const served = baseShaped432(mealCase432());
  const [first] = served.occurrences;
  assert.throws(() => assertServedRowDescriptions432('S148', served,
    [{ occurrenceId: first.id, text: '— · Completed carb bolus' }]), /S148 every meal row must serve its carbs and dose/);
  assert.throws(() => assertServedRowDescriptions432('S148', mealCase432(),
    [{ occurrenceId: first.id, text: '— · Completed carb bolus' }]), /S148 no meal row may lead with a dash/);
  assert.throws(() => assertServedRowDescriptions432('S150', mealCase432(),
    [{ occurrenceId: first.id, text: '40 g · 4 U' }]), /S150 .* must read its own served carbs, dose and outcome/);
});

test('S148/S150 separate a setup error from the feature', () => {
  const served = mealCase432();
  assert.throws(() => assertServedRowDescriptions432('S148', served, []),
    /S148 premise: the drilled case renders Occurrence rows/);
  assert.throws(() => assertServedRowDescriptions432('S148', served,
    [{ occurrenceId: `o_${'9'.repeat(32)}`, text: '40 g · 4 U' }]), /S148 premise: rendered row .* is a served Occurrence/);
});

const claimedDetail432 = () => {
  const file = servedCaseFiles432.cases['finding:carb_undercount'];
  const [claimed] = file.clock.projection.clock.buckets.flatMap((bucket) => bucket.occurrence_ids);
  return JSON.parse(JSON.stringify(file.selected_event[claimed].selection.detail));
};
// The rendered block, its habit line composed as the renderer does: a null sentence
// is omitted.
const block432 = (detail) => {
  const lines = [
    { kind: 'outcome', text: 'Peak 148 mg/dL, 180 min after the bolus' },
    { kind: 'cause', text: `Attributed to Carb undercount · ${detail.reason.cause.text}` },
    { kind: 'habit', text: ['Carb undercount', 'Meets criteria', detail.reason.habits[0].detail]
      .filter(Boolean).join(' · ') },
  ];
  return { figure: '40 g · 4 U at completed carb bolus', lines,
    text: ['Mar 1 · 08:00 Matched 40 g · 4 U at completed carb bolus', 'Evidence facts',
      ...lines.map((line) => line.text)].join(' ') };
};

test('S149/S150 selected facts pass on the served detail and its rendered block', () => {
  const detail = claimedDetail432();
  assert.doesNotThrow(() => assertSelectedFacts432('S149', detail, block432(detail), { outcome: 'peak' }));
});

test('S149 reaches its feature assertion on the base server shape, never a premise', () => {
  const detail = claimedDetail432();
  delete detail.anchor.insulin; delete detail.anchor.carbs; delete detail.outcome; delete detail.reason;
  const base = { figure: '— at completed carb bolus', text: 'The canvas shows the selected glucose trace and evidence markers.',
    lines: [{ kind: null, text: '37 glucose readings' }, { kind: null, text: '4 event markers' }] };
  assert.throws(() => assertSelectedFacts432('S149', detail, base, { outcome: 'peak' }),
    /S149 the selected meal must serve its carbs and dose/);
  assert.throws(() => assertSelectedFacts432('S149', null, base), /S149 premise/);
});

test('S149/S150 refuse a count-only line, the canvas sentence, or a reason that disagrees', () => {
  const detail = claimedDetail432();
  const counted = block432(detail);
  counted.lines.push({ kind: null, text: '37 glucose readings' });
  assert.throws(() => assertSelectedFacts432('S149', detail, counted), /no line may be only a count/);
  const canvas = block432(detail);
  canvas.text += ' The canvas shows the selected glucose trace and evidence markers.';
  assert.throws(() => assertSelectedFacts432('S149', detail, canvas), /no sentence may describe the canvas/);
  const silent = block432(detail);
  silent.lines = silent.lines.filter((line) => line.kind !== 'habit');
  assert.throws(() => assertSelectedFacts432('S150', detail, silent), /S150 the block must list each served habit/);
  const noPeak = block432(detail);
  noPeak.lines = noPeak.lines.filter((line) => line.kind !== 'outcome');
  assert.throws(() => assertSelectedFacts432('S149', detail, noPeak, { outcome: 'peak' }),
    /S149 the outcome line must equal the served outcome/);
});

test('S182 is a unique app-only #454 story on pattern-near-tie', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S182');
  assert.equal(entries.length, 1, 'S182 is registered once');
  assert.equal(entries[0][1].deferred.term, 'ADR 454');
  assert.equal(storyCase('S182'), 'pattern-near-tie');
});

// A claimed detail served once: the claimant's sentence is the cause's text alone.
const onceDetail454 = () => {
  const detail = claimedDetail432();
  detail.reason.habits[0].detail = null;
  return detail;
};

test('S182 passes when the claimant sentence prints once, on the cause line', () => {
  const detail = onceDetail454();
  assert.ok(detail.reason.cause.text, 'premise: the claimed detail serves its cause text');
  assert.doesNotThrow(() => assertSentenceOnce454('S182', detail, block432(detail)));
});

test('S182 reaches its feature assertion when a habit line repeats the cause sentence, never a premise', () => {
  // The base server's shape: the claimant's entry serves the cause's sentence again.
  const repeated = onceDetail454();
  repeated.reason.habits[0].detail = repeated.reason.cause.text;
  assert.throws(() => assertSentenceOnce454('S182', repeated, block432(repeated)),
    /^AssertionError.*S182 the cause's sentence must print once; it repeats on: Carb undercount · Meets criteria · /s);
  const detail = onceDetail454();
  const lost = block432(detail);
  lost.lines = lost.lines.map((line) => line.kind === 'cause' ? { ...line, text: 'Attributed to Carb undercount' } : line);
  assert.throws(() => assertSentenceOnce454('S182', detail, lost), /S182 the cause line must carry the served sentence/);
  const renamed = block432(detail);
  renamed.lines = renamed.lines.map((line) => line.kind === 'habit' ? { ...line, text: 'Carb undercount' } : line);
  assert.throws(() => assertSentenceOnce454('S182', detail, renamed),
    /S182 the claimant's habit line must read its title and band label only/);
});

test('S182 separates a setup error from the feature', () => {
  const detail = onceDetail454();
  const block = block432(detail);
  assert.throws(() => assertSentenceOnce454('S182', null, block), /S182 premise: a selected Occurrence/);
  const unclaimed = onceDetail454();
  unclaimed.reason.cause = null;
  assert.throws(() => assertSentenceOnce454('S182', unclaimed, block), /S182 premise: the selected Occurrence is claimed/);
  const outside = onceDetail454();
  outside.reason.habits = [];
  assert.throws(() => assertSentenceOnce454('S182', outside, block), /S182 premise: the claimant is one of the served habits/);
});

test('S108–S114 are unique app-only C4 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [
    ['S108', 'showcase', 'HV2-34'], ['S109', 'showcase', 'HV2-34'],
    ['S110', 'edit-chain', 'HV2-28'], ['S111', 'edit-chain', 'HV2-28'], ['S112', 'edit-chain', 'HV2-28'],
    ['S113', 'basal-verdict-gallery', 'HV2-17'], ['S114', 'showcase', 'HV2-29'],
  ]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S142 and S143 are unique app-only C4 record stories with their manufactured cases', () => {
  for (const [id, expectedCase] of [['S142', 'c3-trial'], ['S143', 'edit-chain']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-28');
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S180 is a unique app-only C4 record story on the manufactured case serving one expired Trial', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S180');
  assert.equal(entries.length, 1, 'S180 is registered once');
  assert.equal(entries[0][1].deferred.term, 'HV2-28');
  assert.equal(storyCase('S180'), 'c4-isf');
});

test('S162–S165 are unique app-only C4 Day-return stories on their manufactured cases', () => {
  for (const [id, expectedCase, term] of [
    ['S162', 'c3-trial', 'HV2-14'], ['S163', 'c3-trial', 'HV2-14'],
    ['S164', 'showcase', 'HV2-14'], ['S165', 'showcase', 'HV2-34'],
  ]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

// A fake page for the #445 carb-utility stories, S164 and S165. It keeps the
// page's address and answers the served reads the stories make. As in the
// app, a click that moves the desk rewrites the address at once: an Open Day
// writes a Day address, and each Return from Day leaves the address its
// scripted `returns` entry names. The return then plays its requests in the
// shape the coordinator's replay of the real app showed: its GET /api/status
// first, then — only once that read has been answered — whatever the answer set
// off (a moved store's re-read: its own status read, then its guidance read).
// The desk settles, and every wait on the page resolves, only once the return
// has played out, as the app's loading frame stands until a re-read lands.
function qa445Page({ returns, focused = true } = {}) {
  const held = 'o-1';
  const latest = '2024-06-28';
  const entry = { id: 77, t: `${latest} 12:07:00` };
  const actions = [];
  const routes = new Map();
  const listeners = new Set();
  const waiters = new Set();
  let address = {};
  let windowLabel = '24 h';
  let logged = false;
  let played = 0;
  let settling = Promise.resolve();
  const request = pathname => ({ url: () => `http://synthetic.invalid${pathname}` });
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const fire = pathname => {
    actions.push(`request:${pathname}`);
    for (const listener of [...listeners]) listener(request(pathname));
    for (const waiter of [...waiters]) waiter.offer(pathname);
  };
  // No request a waiter wants arrived: time it out, as Playwright would.
  const expire = () => { for (const waiter of [...waiters]) waiter.expire(); };
  // A click does not wait on the network, so the return plays on after it.
  function playReturn() {
    const { address: left, after = [] } = returns[played++];
    let settle;
    settling = new Promise(resolve => { settle = resolve; });
    const answered = async () => {
      await tick();
      for (const pathname of after) { fire(pathname); await tick(); }
      await tick(); expire(); settle();
    };
    address = left;
    fire('/api/status');
    const route = [...routes.values()][0];
    (route ? route({ request: () => request('/api/status'), continue: answered }) : answered()).catch(() => {});
  }
  const caseFile = { finding: { id: 'finding:over_treated_low' },
    projection: { alignment: 'event', cohorts: [{ occurrence_ids: [held, 'o-2'] }] } };
  const responses = [
    { url: () => `http://synthetic.invalid/api/diagnose/finding-case-file?finding_id=${encodeURIComponent(caseFile.finding.id)}`,
      ok: () => true, json: async () => caseFile },
    { url: () => 'http://synthetic.invalid/api/status', ok: () => true },
  ];
  const served = { '/api/status': { latest_data_day: latest }, '/api/prompts': [{ detector: 'low' }] };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => { actions.push(`wait:${selector}`); },
    count: async () => 1,
    getAttribute: async name => (name === 'data-occurrence-id' ? held
      : name === 'data-subject' ? `question:low|${latest} 12:10:00` : null),
    evaluate: async () => (selector.includes('seg-window') ? windowLabel : selector.includes('crumb-trail') ? 'Over-treated low' : ''),
    click: async () => {
      actions.push(`click:${selector}`);
      if (selector === 'Afternoon' || selector === '24 h') windowLabel = selector;
      else if (selector.includes('case-occurrence')) {
        address = { subject: caseFile.finding.id, occurrence: held, ...(windowLabel === 'Afternoon' ? { window: '720-1080' } : {}) };
      } else if (selector.includes('occ-foot')) {
        address = { date: latest, moment: `${latest} 12:10:00`, subject: caseFile.finding.id, title: 'Over-treated low',
          occurrence: held, from: 'diagnose' };
      } else if (selector.includes('gf-chips')) logged = true;
      else if (selector.includes('data-utility-remove') || selector.includes('data-subject="carb:')) {
        address = { date: latest, subject: `carb:${entry.id}`, title: 'Log carbs · 12:07', from: 'diagnose.carbs' };
      } else if (selector.includes('[data-action="day"]')) {
        address = { date: latest, subject: `question:low|${latest} 12:10:00`, title: 'Carb questions · 12:10',
          from: 'diagnose.questions' };
      } else if (selector === '[data-day="return"]') playReturn();
    },
  });
  return {
    _actions: actions,
    url: () => 'http://synthetic.invalid/diagnose',
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    fill: async (selector, value) => { actions.push(`fill:${selector}=${value}`); },
    reload: async () => { actions.push('reload'); },
    evaluate: async (fn, arg) => {
      const source = fn.toString();
      if (source.includes('activeElement')) return focused;
      if (source.includes('URLSearchParams')) return { ...address };
      if (source.includes('case-occurrence')) return held;
      return null;
    },
    waitForFunction: async () => { await settling; },
    request: { get: async url => {
      const { pathname } = new URL(url);
      const body = pathname === '/api/carbs' ? { carb_entries: logged ? [entry] : [] } : served[pathname];
      return { status: () => 200, text: async () => '', json: async () => body };
    } },
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
    on: (type, listener) => { if (type === 'request') listeners.add(listener); },
    off: (type, listener) => { if (type === 'request') listeners.delete(listener); },
    waitForResponse: predicate => {
      const match = responses.find(response => predicate(response));
      return match ? Promise.resolve(match) : new Promise(() => {});
    },
    waitForRequest: predicate => new Promise((resolve, reject) => {
      const waiter = {
        offer: pathname => { if (predicate(request(pathname))) { waiters.delete(waiter); resolve(request(pathname)); } },
        expire: () => { waiters.delete(waiter); reject(new Error('synthetic waitForRequest timeout')); },
      };
      waiters.add(waiter);
    }),
  };
}
const CASE445 = { subject: 'finding:over_treated_low', occurrence: 'o-1' };
const AFTERNOON445 = { ...CASE445, window: '720-1080' };
// The address the Diagnose Day return leaves: that entry's own keys (ADR 428).
const DAY_RETURN445 = { date: '2024-06-28', moment: '2024-06-28 12:10:00', ...CASE445, title: 'Over-treated low', from: 'diagnose' };

test('S164 finds the moved return\'s re-read a round trip after its status read, then the retained return', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa445Page({ returns: [
    { address: AFTERNOON445, after: ['/api/status', '/api/analyze'] },
    { address: AFTERNOON445 },
  ] });
  await C4_STORIES.S164(page);
  const status = page._actions.indexOf('request:/api/status');
  assert.ok(status >= 0 && page._actions.indexOf('request:/api/analyze') > status + 1,
    'premise: the guidance read comes after the return\'s status read and the re-read\'s own');
});

test('S164 fails at its re-read when the return after logging reads nothing but status', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa445Page({ returns: [{ address: AFTERNOON445 }, { address: AFTERNOON445 }] });
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S164(page)),
    /S164 the return after logging must re-read Diagnose: the store moved/);
});

test('S165 reads the retained case from an address that still carried the Day entry\'s keys before the return', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S165(qa445Page({ returns: [{ address: DAY_RETURN445 }, { address: CASE445 }] }));
});

test('S165 fails at its address when the return leaves a title or a from in it', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa445Page({ returns: [{ address: DAY_RETURN445 }, { address: DAY_RETURN445 }] });
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S165(page)),
    /S165 the address must name the retained case, with no title, from or focus/);
});

// A return that should be retained but re-reads once its status read is
// answered: the re-read's requests come after heldStatusReturn has stopped
// recording, and before the desk settles.
const LATE_REREAD445 = ['/api/status', '/api/analyze'];

test('S164 fails when the return after a reload re-reads once its status read is answered', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa445Page({ returns: [
    { address: AFTERNOON445, after: ['/api/status', '/api/analyze'] },
    { address: AFTERNOON445, after: LATE_REREAD445 },
  ] });
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S164(page)),
    /S164 the return after a reload must issue no request besides the held status check/);
});

test('S165 fails when its return re-reads once its status read is answered', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa445Page({ returns: [{ address: DAY_RETURN445 }, { address: CASE445, after: LATE_REREAD445 }] });
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S165(page)),
    /S165 the Carb questions return must issue no request besides the held status check/);
});

test('S157 is a unique app-only C4 record story on the c4-ic case', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S157');
  assert.equal(entries.length, 1, 'S157 is registered once');
  assert.equal(entries[0][1].deferred.term, 'HV2-28');
  assert.equal(storyCase('S157'), 'c4-ic');
});

test('S115–S117 are unique app-only C4 rail stories, served from the showcase', () => {
  const term = '#413 design lock';
  for (const id of ['S115', 'S116', 'S117']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), 'showcase');
  }
});

test('S121 and S122 are unique app-only Day Episode Log stories on pattern-near-tie', () => {
  for (const id of ['S121', 'S122']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-13');
    assert.equal(storyCase(id), 'pattern-near-tie');
  }
});

test('S127 is a unique app-only Day story, served from the showcase', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S127');
  assert.equal(entries.length, 1, 'S127 is registered once');
  assert.equal(entries[0][1].deferred.term, 'HV2-13');
  assert.equal(storyCase('S127'), 'showcase');
});

test('S139 and S140 are unique app-only C4 dock stories on their watched cases', () => {
  for (const [id, expectedCase] of [['S139', 'c3-trial'], ['S140', 'c3-focus']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-12');
    assert.equal(storyCase(id), expectedCase);
  }
});

test('S166–S168 are unique app-only #446 arrival stories on their watched cases', () => {
  for (const [id, expectedCase] of [['S166', 'basal-lower'], ['S167', 'basal-lower'], ['S168', 'c3-focus']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-15');
    assert.equal(storyCase(id), expectedCase);
  }
});

// #446: a c3-focus page whose server serves an active Focus and saves a draft
// beside it. `returnLabel` and `nameplateOpenPlan` shape it like the base (no
// nameplate Open Plan, "Return to Trial") or like the branch.
function focusDraftPage446({ returnLabel, nameplateOpenPlan }) {
  let url = 'http://synthetic.invalid/';
  let at = 'diagnose';
  const writes = [];
  const shown = {
    changes: { 'nav.v2-nav [aria-current="page"][data-destination="changes"]': 1, '.gf-stage-focus': 1,
      '.gf-stage-focus [data-follow-up-inspect]': 1,
      '.gf-stage-focus .gf-end [data-action="open-plan"]': nameplateOpenPlan ? 1 : 0,
      '.gf-stage-focus [data-action="open-plan"]': nameplateOpenPlan ? 1 : 0 },
    diagnose: { '[data-action="watch"]': 1 },
    plan: { 'nav.v2-nav [aria-current="page"][data-destination="changes"]': 1, '.gf-plan': 1 },
  };
  const texts = { diagnose: { '[data-action="watch"]': [returnLabel] }, plan: { '.gf-stage .gf-kicker b': ['Draft saved'] } };
  const presses = { '.gf-stage-focus [data-follow-up-inspect]': ['diagnose', '/diagnose?from=changes'],
    '[data-action="watch"]': ['changes', '/changes'], '.gf-stage-focus [data-action="open-plan"]': ['plan', '/changes?subject=plan'] };
  const served = {
    '/api/verify/trials': { admission: { state: 'available', active_kind: 'focus', active_id: 1 }, trials: [], focuses: [{ id: 1 }] },
    '/api/pump-settings': { profile: { segments: [{ start_min: 0, basal_rate: 0.8 }] } },
    '/api/guidance': { disposition: 'active_change', draft: { items: [{ type: 'basal', start_min: 0, value: 0.8 }] } },
    '/api/plan': { items: [{ type: 'basal', start_min: 0, value: 0.8 }], updated_at: '2026-01-02 04:00:00' },
  };
  const answer = body => ({ status: () => 200, text: async () => '', json: async () => body });
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => { if (!shown[at][selector]) throw new Error(`synthetic page: ${selector} is not on ${at}`); },
    click: async () => { const [next, path] = presses[selector]; at = next; url = new URL(path, url).href; },
    count: async () => shown[at][selector] ?? 0,
    allTextContents: async () => texts[at]?.[selector] ?? [],
  });
  return {
    writes, url: () => url, locator: node,
    goto: async target => { url = target; at = new URL(target).searchParams.get('subject') === 'plan' ? 'plan' : 'changes'; },
    request: {
      get: async target => answer(served[new URL(target).pathname]),
      put: async (target, { data }) => { writes.push([new URL(target).pathname, data]); return answer({}); },
    },
  };
}

test('S168 names the Focus in its return and opens its draft on a branch-shaped page', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = focusDraftPage446({ returnLabel: 'Return to Focus', nameplateOpenPlan: true });
  await C4_STORIES.S168(page);
  assert.deepEqual(page.writes, [['/api/plan', { items: [{ type: 'basal', start_min: 0, value: 0.8 }] }]],
    'S168 saves one draft beside the Focus, from the served pump profile');
});

test('S168 reaches its feature assertion on the base shape, never a premise', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S168(
    focusDraftPage446({ returnLabel: 'Return to Trial', nameplateOpenPlan: false }))),
  /S168 Diagnose opened from the watched Focus must offer "Return to Focus" and no "Return to Trial"/);
});

test('S151–S153 are unique app-only C4 basal-lane stories, served from the verdict gallery', () => {
  for (const id of ['S151', 'S152', 'S153']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-17');
    assert.equal(storyCase(id), 'basal-verdict-gallery');
  }
});

// A minimal fake page for the #414 chunk 3 stories. `click` on the Diagnose nav
// button simulates the one GET /api/status the retained desk issues by routing
// it through any registered `**/api/status*` handler, so the held-request
// control flow runs without a real browser or server.
function qa414Page({ crumb = 'Finding X', extraRequest = null } = {}) {
  const actions = [];
  const routes = new Map();
  const requestListeners = new Set();
  let url = 'http://synthetic.invalid/?to=diagnose';
  let level = { scrollTop: 0, scrollHeight: 400, clientHeight: 100 };
  const fireRequest = pathname => {
    const request = { url: () => `http://synthetic.invalid${pathname}` };
    for (const listener of requestListeners) listener(request);
    for (const [pattern, handler] of routes) {
      if (pattern.replace('**', '').replace('*', '') && pathname.startsWith(pattern.replace('**', '').replace('*', ''))) {
        handler({ request: () => request, continue: async () => { actions.push(`continued:${pathname}`); } });
      }
    }
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => { actions.push(`wait:${selector}`); },
    click: async () => {
      actions.push(`click:${selector}`);
      if (selector === 'nav.v2-nav [data-destination="diagnose"]') {
        if (extraRequest) fireRequest(extraRequest);
        fireRequest('/api/status');
      }
    },
    getAttribute: async name => {
      if (selector.includes('qrow') && name === 'data-id') return 'finding:x';
      if (name === 'aria-pressed') return 'true';
      return null;
    },
    innerText: async () => selector.includes('crumb-trail') ? crumb
      : selector.includes('seg-window') ? 'Slot 03:00' : '',
    evaluate: async fn => {
      if (selector !== '#level') return null;
      if (fn.toString().includes('node.scrollTop = Math.min')) {
        level.scrollTop = Math.min(40, level.scrollHeight - level.clientHeight);
        return level.scrollTop;
      }
      return level.scrollTop;
    },
    count: async () => 1,
  });
  return {
    _actions: actions,
    url: () => url,
    goto: async target => { url = target; actions.push(`goto:${target}`); },
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => { actions.push('waitForFunction'); },
    waitForLoadState: async state => { actions.push(`waitForLoadState:${state}`); },
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
    on: (type, listener) => { if (type === 'request') requestListeners.add(listener); },
    off: (type, listener) => { if (type === 'request') requestListeners.delete(listener); },
    waitForResponse: () => Promise.resolve({ ok: () => true, url: () => 'http://synthetic.invalid/api/status' }),
  };
}

test('S108 reaches its held-return assertions after a clean round trip through Changes', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  await C4_STORIES.S108(page);
  assert.ok(page._actions.includes('click:[data-destination="diagnose"]'));
  assert.ok(page._actions.includes('click:nav.v2-nav [data-destination="diagnose"]'));
  assert.ok(page._actions.includes('continued:/api/status'), 'the held status read must be released and continued');
});

test('S108 fails when the return issues more than the held status check', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page({ extraRequest: '/api/diagnose/findings' });
  await assert.rejects(C4_STORIES.S108(page), /no request besides the held status check/);
});

test('S108 surfaces a lost status response as its own assertion, never an unhandled rejection', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  // Playwright's own waitForResponse can reject on its own clock, independent
  // of the held-request wait. Before the fix, a bare unattached promise like
  // this crashed the whole runner instead of failing this one story.
  page.waitForResponse = () => Promise.reject(new Error('synthetic Playwright response timeout'));
  const unhandled = [];
  const onUnhandledRejection = reason => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandledRejection);
  try {
    await assert.rejects(C4_STORIES.S108(page),
      /S108 the return must issue GET \/api\/status; none arrived within 30 s/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(unhandled, [], 'the lost response must never escape as an unhandled rejection');
  } finally {
    process.off('unhandledRejection', onUnhandledRejection);
  }
});

test('S109 settles the network before scrolling, then preserves the offset across the held round trip', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa414Page();
  await C4_STORIES.S109(page);
  assert.equal(page._actions.filter(action => action === 'waitForLoadState:networkidle').length, 1,
    'S109 must settle on the network before reading #level');
  const waitIndex = page._actions.indexOf('waitForLoadState:networkidle');
  const scrollWaitIndex = page._actions.indexOf('wait:#level');
  assert.ok(waitIndex >= 0 && scrollWaitIndex > waitIndex,
    'S109 must wait for the settled network before touching the reading pane');
});

function qa414EditChainPage({ summary = '3 setting changes · Basal · Sep 8 – Sep 10', editKey = 'edit-1',
  memberRecord = 'trial:member-1', memberCount = 3, flatCount = 1, cellWord = 'Not watched', cellCount = 4 } = {}) {
  let url = 'http://synthetic.invalid/?to=changes&subject=history';
  const node = selector => ({
    filter() { return this; }, first() { return this; }, nth() { return this; },
    waitFor: async () => {},
    click: async () => { if (selector.startsWith('[data-record')) url += `&occurrence=record:${memberRecord}`; },
    count: async () => {
      if (selector.includes('gf-edit-row')) return 1;
      if (selector.includes(`data-edit-member="${editKey}"`)) return memberCount;
      if (selector.includes(':not(.gf-edit-row):not([data-edit-member])')) return flatCount;
      if (selector === '[data-record-open="true"]') return cellCount;
      return 1;
    },
    getAttribute: async name => {
      if (name === 'data-edit') return editKey;
      if (name === 'data-record') return memberRecord;
      return null;
    },
    innerText: async () => selector.includes('gf-edit-summary') ? summary
      : selector.includes('following-sibling::small') ? cellWord : '',
    locator: nested => node(nested),
  });
  return {
    url: () => url,
    goto: async target => { url = target; },
    locator: node,
  };
}

test('S110 counts the titled Edit entry and its members, then addresses and reloads the exact member record', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S110(qa414EditChainPage());
});

test('S110 fails when the served Edit entry does not name its member count', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S110(qa414EditChainPage({ summary: 'Basal changed' })),
    /must name its member count/);
});

test('S111 fails on a raw disposition token, and passes on the served word', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S111(qa414EditChainPage());
  await assert.rejects(C4_STORIES.S111(qa414EditChainPage({ cellWord: 'not_selected_for_watch' })),
    /never a raw disposition token/);
});

// Routes behave as Playwright's do: the newest matching handler takes the
// request, `continue()` sends it on, and `unroute` removes one handler. A
// record read that is sent on renders the open record, which (ADR 430) asks for
// its retained comparison with no control pressed.
function qa414RecordHoldPage({ recordSelector = 'trial:member-1' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  let routes = [];
  const fire = (pathname, search = '') => {
    const request = { url: () => `http://synthetic.invalid${pathname}${search}` };
    const params = new URLSearchParams(search);
    const sent = async () => {
      if (params.has('selected') && !params.has('assessment')) fire(pathname, `${search}&assessment=retained`);
    };
    const route = routes.find(([pattern]) => {
      const base = pattern.replace('**', '').replace('*', '');
      return base && pathname.startsWith(base);
    });
    if (route) route[1]({ request: () => request, continue: sent });
    else sent();
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => {
      if (selector.startsWith('table.gf-table [data-record]')) fire('/api/verify/trials', `?selected=${recordSelector}`);
    },
    getAttribute: async () => recordSelector,
    count: async () => 1,
    locator: nested => node(nested),
  });
  return {
    url: () => url,
    goto: async target => { url = target; fire('/api/verify/trials', ''); },
    locator: selector => node(selector),
    route: async (pattern, handler) => { routes.unshift([pattern, handler]); },
    unroute: async (pattern, handler) => { routes = routes.filter(([p, h]) => p !== pattern || h !== handler); },
  };
}

test('S112 holds the roster and record reads, then the retained read the record asks for itself', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S112(qa414RecordHoldPage());
});

// #430: one still-open record on a Changes roster. Pressing its row sends the
// record read and, when `retainedOnOpen`, the retained read the record door
// makes with no control pressed; the rendered record is read back by selector.
function qa430RecordPage({ retainedOnOpen = true, figureState = 'paired', periods = 1, pressed = 1, stillOpen = 1,
  canvases = figureState === 'paired' ? 1 : 0, served = { state: 'unavailable', reason: 'missing_comparison_context' },
  figureReason = 'no retained comparison context was recorded with this change',
  result = 'Unavailable · no retained comparison context was recorded with this change',
  stage = 'Setting change · Still open\ncomparison unavailable' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  const listeners = new Set();
  const send = search => {
    const request = { url: () => `http://synthetic.invalid/api/verify/trials${search}` };
    for (const listener of listeners) listener(request);
  };
  const counts = {
    'table.gf-table tr [data-record]': 1,
    '[data-period="before"]': periods, '[data-period="after"]': periods,
    '[data-figure-state="paired"] .gf-chart canvas': figureState === 'paired' ? canvases : 0,
    '[data-figure-state="unavailable"]': figureState === 'unavailable' ? 1 : 0,
    '[data-assessment="retained"][aria-pressed="true"]': pressed,
    '[data-unavailable="ending"]': stillOpen,
    '.gf-stage .gf-chart canvas': canvases,
  };
  const text = { '[data-figure-reason]': figureReason, '[data-reassessment-state]': result, '.gf-stage': stage };
  const node = selector => ({
    first() { return this; },
    locator: nested => node(`${selector} ${nested}`),
    waitFor: async () => {},
    count: async () => counts[selector] ?? 0,
    innerText: async () => text[selector] ?? '',
    getAttribute: async name => (name === 'data-record' ? 'trial:open-1' : null),
    click: async () => {
      send('?selected=open-1&kind=trial');
      if (retainedOnOpen) send('?selected=open-1&kind=trial&assessment=retained');
    },
  });
  return {
    url: () => url,
    goto: async target => { url = target; send(''); },
    locator: selector => node(selector),
    on: (type, listener) => { if (type === 'request') listeners.add(listener); },
    off: (type, listener) => { if (type === 'request') listeners.delete(listener); },
    request: { get: async () => ({ status: () => 200, text: async () => '',
      json: async () => ({ selected: { reassessment: { comparison: { availability: served } } } }) }) },
  };
}

test('S142 opens the still-open record and finds its retained comparison with no press', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S142(qa430RecordPage());
});

test('S142 fails at its feature assertion when opening the record asks for no retained comparison', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S142(qa430RecordPage({ retainedOnOpen: false, figureState: 'not-requested', periods: 0, pressed: 0 })),
    /S142 opening a still-open record must request its retained comparison once, with no control pressed/);
});

test('S143 reads an unavailable figure naming its reason in the result line\u2019s words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S143(qa430RecordPage({ figureState: 'unavailable', periods: 0 }));
});

test('S143 fails at its feature assertion when the record shows no unavailable figure', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S143(qa430RecordPage({
    figureState: 'not-requested', periods: 0, figureReason: '', result: '',
    stage: 'no clock envelope is retained for this record\n0 → 0 half-hours read',
  }))), /S143 the figure must read as an unavailable comparison/);
});

test('S143 fails when the figure prints the served code instead of its words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S143(qa430RecordPage({
    figureState: 'unavailable', periods: 0, figureReason: 'missing_comparison_context',
    result: 'Unavailable · missing_comparison_context',
  }))), /S143 the figure must name the reason in words, never its code/);
});

// #452: the record destination's page with one expired Trial on its roster.
// `carries` names what a reopen keeps, as the unfixed desk kept all three: the
// typed text, the failed save and its request id.
function qa452RecordPage({ carries = [] } = {}) {
  const ID = 'expired-isf-synthetic';
  const state = { view: 'none', text: '', failure: null, attempt: null, saved: null, url: 'http://synthetic.invalid/' };
  const routes = []; const listeners = new Set(); let serial = 0;
  const open = () => {
    state.view = 'record';
    if (!carries.includes('text')) state.text = '';
    if (!carries.includes('failure')) state.failure = null;
    if (!carries.includes('attempt')) state.attempt = null;
  };
  const present = {
    'table.gf-table': () => state.view === 'roster',
    [`table.gf-table [data-record="trial:${ID}"]`]: () => state.view === 'roster',
    '[data-form="late-conclusion"]': () => state.view === 'record' && !state.saved,
    '#late-conclusion-conclusion': () => state.view === 'record' && !state.saved,
    '[data-form="late-conclusion"] [type="submit"]': () => state.view === 'record' && !state.saved,
    '[data-save-error="conclude"]': () => state.view === 'record' && Boolean(state.failure),
    '[data-save-error]': () => state.view === 'record' && Boolean(state.failure),
    '[data-record-close]': () => state.view === 'record',
    '[data-late-conclusion="available"]': () => state.view === 'record' && Boolean(state.saved),
    '[data-late-conclusion-text]': () => state.view === 'record' && Boolean(state.saved),
  };
  async function submit() {
    state.attempt ||= `conclude:synthetic-${++serial}`;
    const body = { request_id: state.attempt, input_revision: 7, conclusion: state.text };
    const request = { method: () => 'POST', url: () => `${state.url}api/verify/trials/${ID}/conclusion`,
      postDataJSON: () => body };
    for (const listener of listeners) listener(request);
    const route = routes.find(([matcher]) => matcher.test(new URL(request.url()).pathname));
    if (route) {
      await route[1]({ request: () => request, fulfill: async ({ status }) => {
        state.failure = { status };
      } });
      return;
    }
    state.saved = state.text; state.text = ''; state.failure = null; state.attempt = null;
  }
  const node = selector => {
    const here = () => present[selector]?.() ?? false;
    return {
      locator: nested => node(`${selector} ${nested}`),
      waitFor: async () => { if (!here()) throw new Error(`locator.waitFor: timeout waiting for ${selector}`); },
      count: async () => (here() ? 1 : 0),
      click: async () => {
        if (!here()) throw new Error(`locator.click: no ${selector}`);
        if (selector.includes('[data-record="')) open();
        else if (selector === '[data-record-close]') state.view = 'roster';
        else if (selector.endsWith('[type="submit"]')) await submit();
      },
      fill: async value => { if (!here()) throw new Error(`locator.fill: no ${selector}`); state.text = value; },
      inputValue: async () => state.text,
      innerText: async () => (selector === '[data-late-conclusion-text]' ? state.saved : ''),
    };
  };
  return {
    url: () => state.url,
    goto: async target => { state.url = new URL('/', target).href; state.view = 'roster'; },
    locator: node,
    route: async (matcher, handler) => { routes.push([matcher, handler]); },
    unroute: async (matcher, handler) => {
      const at = routes.findIndex(([m, h]) => m === matcher && h === handler);
      if (at >= 0) routes.splice(at, 1);
    },
    on: (type, listener) => { if (type === 'request') listeners.add(listener); },
    off: (type, listener) => { if (type === 'request') listeners.delete(listener); },
    request: { get: async href => {
      const selected = new URL(href).searchParams.get('selected');
      const trial = { id: ID, ending: { kind: 'expired_unreviewed' } };
      const body = selected
        ? { trials: [trial], selected: { id: ID, original: { ending: trial.ending, late_conclusion: { state: 'unavailable' } } } }
        : { trials: [trial], focuses: [] };
      return { status: () => 200, text: async () => '', json: async () => body };
    } },
  };
}

test('S180 passes when a reopened record starts empty with a request id of its own', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S180(qa452RecordPage());
});

test('S180 fails at its feature assertion when a reopened record keeps the typed words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S180(qa452RecordPage({ carries: ['text', 'failure', 'attempt'] })),
    /S180 reopening the record from the roster must start its later conclusion empty/);
});

test('S180 fails when a reopened record keeps only the failed save', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S180(qa452RecordPage({ carries: ['failure'] })),
    /S180 reopening the record must carry no failed save/);
});

test('S180 fails when the next save reuses the refused request id', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S180(qa452RecordPage({ carries: ['attempt'] })),
    /S180 the next save must send a request id of its own/);
});

// #442: c4-ic's roster as ADR 442 serves it — the watched 06-10 carb-ratio
// change still open, the older 06-01 one ended superseded at 06-10 09:00 — and
// that older record as the desk renders it, read back by selector. As in
// Playwright, a `has` locator is queried inside each outer match, and a locator
// that matches nothing never returns its text.
const OLDER442 = 'carb_ratio-all-20240601000000';
const RECORD442 = `[data-record="trial:${OLDER442}"]`;
const ROW442 = `table.gf-table tr:has(${RECORD442})`;
function qa442RecordPage({ servedKind = 'superseded', cell = 'Superseded by a later change\nJun 10, 2024 · 09:00',
  openCells = 0, kindLine = 'Superseded by a later change',
  note = 'A later setting change was detected inside the watch window. This record keeps the period it actually observed.',
  finished = 'Jun 10, 2024 · 09:00', readTo = 'Jun 10, 2024 · 09:00' } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  const roster = {
    trials: [{ id: 'carb_ratio-all-20240610090000', ending: { state: 'unavailable', reason: 'not_recorded' } },
      { id: OLDER442, ending: servedKind ? { kind: servedKind, effective_at: '2024-06-10 09:00:00' }
        : { state: 'unavailable', reason: 'not_recorded' } }],
    admission: { active_kind: 'trial', active_id: 'carb_ratio-all-20240610090000' },
  };
  const ending = '[data-record-part="ending"]';
  const counts = {
    [`${ending} [data-ending-kind="superseded"]`]: kindLine === null ? 0 : 1,
    [`${ROW442} [data-record-open="true"]`]: openCells,
  };
  const text = {
    [`${ROW442} td.v`]: cell,
    [`${ending} [data-ending-kind="superseded"]`]: kindLine ?? '',
    [ending]: `Saved ending immutable\nHow it ended\n${kindLine}\nFinished\n${finished}\n${note}`,
    [`${ending} dt xpath=following-sibling::dd[1]`]: finished,
    '[data-part="periods"]': `Evidence periods\nBefore\n…\nTrial\n…\nPump-local time, half-open. Observations are limited to these periods; data was read to ${readTo}.`,
  };
  const node = selector => ({
    selector,
    first() { return this; },
    locator: nested => node(`${selector} ${nested}`),
    waitFor: async () => {},
    count: async () => counts[selector] ?? 0,
    innerText: () => (selector in text ? Promise.resolve(text[selector]) : new Promise(() => {})),
    click: async () => { assert.equal(selector, `${ROW442} ${RECORD442}`); },
  });
  return {
    url: () => url,
    goto: async target => { url = target; },
    locator: (selector, { has } = {}) => node(has ? `${selector}:has(${has.selector})` : selector),
    request: { get: async () => ({ status: () => 200, text: async () => '', json: async () => roster }) },
  };
}

test('S157 reads the older superseded record’s ending in the roster and on the record', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S157(qa442RecordPage());
});

test('S157 fails at its first feature assertion when the older record is served still open, as on base', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S157(qa442RecordPage({ servedKind: null })),
    /S157 the older Trial row must carry its served superseded ending/);
});

test('S157 fails when the roster row still reads Still open or carries a still-open cell', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    cell: 'Still open\nNot watched', openCells: 1 }))), /S157 the roster row must read its ending/);
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    cell: 'Superseded by a later change\nStill open' }))), /S157 an ended record's roster row must not read Still open/);
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    openCells: 1 }))), /S157 an ended record must carry no still-open cell/);
});

test('S157 fails when the opened record shows no superseded ending, or prints its kind as a code', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    kindLine: null }))), /S157 the opened record must show its saved superseded ending/);
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    kindLine: 'superseded' }))), /S157 the ending kind line must read its words, never an underscore-token code/);
});

test('S157 fails when the saved-ending note still claims the same setting', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    note: 'A later change to the same setting took over. This record keeps the period it actually observed.',
  }))), /S157 the saved-ending note must not claim the same setting/);
});

test('S157 fails when the periods note reads data past the saved ending', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S157(qa442RecordPage({
    readTo: 'Jul 1, 2024 · 23:55' }))), /S157 the periods note must read data to the saved ending's Finished time/);
});

// #442: S91's c4 readiness helper over an ended record whose saved ending read
// its evidence to the ending while the retained read runs to the data tail, as
// c4-isf serves them. `lines` is the readiness the page prints.
function qa442ReadinessPage(lines, { rawReason = false } = {}) {
  let url = 'http://synthetic.invalid/?to=diagnose';
  const arm = (observed, met, reason = null) => ({ unit: 'qualifying fasting Rest windows', required: 30,
    observed, criterion_met: met, reason, elapsed_days: 31 });
  const retained = { readiness: { before: arm(31, true), after: arm(30, true) }, assessment: { state: 'unclear' } };
  const saved = { readiness: { before: arm(31, true), after: arm(27, false, 'collecting') } };
  const detail = { original: { ending: { kind: 'expired_unreviewed', assessment: saved } },
    reassessment: { comparison: retained } };
  const roster = { trials: [{ id: 'isf-all-20240601000000', parameter: 'isf' }],
    admission: { active_kind: null, active_id: null } };
  const printed = lines === 'saved' ? saved : retained;
  const criterion = side => (side.criterion_met ? 'Criterion met.'
    : rawReason ? `Not met — ${side.reason}.` : 'Not met — still collecting.');
  const node = selector => ({
    filter() { return this; },
    first() { return this; },
    waitFor: async () => {},
    click: async () => {},
    getAttribute: async () => String(printed.readiness[/"(\w+)"/.exec(selector)[1]].criterion_met),
    innerText: async () => {
      const side = printed.readiness[/"(\w+)"/.exec(selector)[1]];
      return `${side.observed} of 30 qualifying fasting Rest windows\n${criterion(side)}`;
    },
    // The criterion line, as the desk prints it since ADR 450: a served reason in words.
    locator: () => ({ innerText: async () => criterion(printed.readiness[/"(\w+)"/.exec(selector)[1]]) }),
  });
  return {
    url: () => url,
    goto: async target => { url = target; },
    locator: selector => node(selector),
    request: { get: async target => ({ status: () => 200, text: async () => '',
      json: async () => (new URL(target).searchParams.has('selected') ? { selected: detail } : roster) }) },
  };
}

test('S91 readiness compares an ended record’s lines with its saved ending, and returns the retained read', async () => {
  const { readiness } = await import('./c4.replay.mjs');
  const comparison = await readiness(qa442ReadinessPage('saved'), 'qualifying fasting Rest windows', 30);
  assert.equal(comparison.readiness.after.observed, 30);
  assert.equal(comparison.readiness.after.criterion_met, true);
});

test('S91 readiness rejects an arm that prints its served reason code instead of words', async () => {
  const { readiness } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => readiness(qa442ReadinessPage('saved', { rawReason: true }),
    'qualifying fasting Rest windows', 30)), /a served reason prints in words, never its code/);
});

test('S91 readiness fails when an ended record’s lines print the retained read instead', async () => {
  const { readiness } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => readiness(qa442ReadinessPage('retained'),
    'qualifying fasting Rest windows', 30)), /the after readiness line must print the criterion of the comparison the page shows/);
});

// #413: a cold Diagnose arrival. `reload()` fires the held /api/analyze route
// synchronously (mirroring real navigation, which commits before client-side
// fetches resolve); the loading frame's skeleton is asserted while the read
// is still held open.
function qa413ColdDiagnosePage({ skeletons = { stage: 1, rail: 1 }, marks = 4, skeletonText = '',
  status = 'Loading Diagnose', railWidth = 430, reference = '430px', animationName = 'none', spilled = 0 } = {}) {
  const routes = new Map();
  const fire = pathname => {
    const request = { url: () => `http://synthetic.invalid${pathname}` };
    for (const [pattern, handler] of routes) {
      const base = pattern.replace('**', '').replace('*', '');
      if (base && pathname.startsWith(base)) handler({ request: () => request, continue: async () => {} });
    }
  };
  const pane = selector => (selector.startsWith('.gf-loading ') ? 'stage'
    : selector.includes('.gf-pane-body > .gf-skeleton') ? 'rail' : null);
  const node = selector => ({
    waitFor: async () => {},
    locator: sub => node(`${selector} ${sub}`),
    count: async () => {
      if (selector.endsWith(' .gf-skel')) return marks;
      if (pane(selector)) return skeletons[pane(selector)];
      return 1;
    },
    innerText: async () => skeletonText,
    getAttribute: async name => (name === 'aria-label' ? status : null),
    boundingBox: async () => ({ x: 0, y: 0, width: railWidth, height: 400 }),
  });
  return {
    url: () => 'http://synthetic.invalid/?to=diagnose',
    reload: async () => { fire('/api/analyze'); },
    locator: node,
    route: async (pattern, handler) => { routes.set(pattern, handler); },
    unroute: async pattern => { routes.delete(pattern); },
    emulateMedia: async () => {},
    evaluate: async fn => {
      const src = fn.toString();
      if (src.includes('animationName')) return animationName;
      if (src.includes('getBoundingClientRect')) return spilled;
      return reference;
    },
  };
}

test('S114 stands the skeleton while the cold analyze read is held, then releases it', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S114(qa413ColdDiagnosePage());
});

test('S114 fails when the skeleton still carries text, count or value', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ skeletonText: '3 findings' })),
    /must state no count, title or value/));
});

test('S114 fails when the rail pane stands without its own skeleton', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ skeletons: { stage: 1, rail: 0 } })),
    /must carry one rail skeleton block/));
});

test('S114 fails when a skeleton mark runs past the loading card', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ spilled: 1 })),
    /the loading card must contain its skeleton; 1 mark\(s\) run past it/));
});

test('S114 fails when the rail does not hold the Diagnose reference width', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S114(qa413ColdDiagnosePage({ railWidth: 256 })),
    /reference width/));
});

test('S114 fails when the skeleton still animates under reduced motion', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(C4_STORIES.S114(qa413ColdDiagnosePage({ animationName: 'gf-skel-shimmer' })),
    /hold still under reduced motion/);
});

test('R18 fails before touching the UI when historical input is absent', async () => {
  await assert.rejects(historicalAbsence(inputPage([{ kind: 'setting', register: 'assert' }])), /actual register=history/);
});

test('R18 refuses to prove absence by also removing current evidence or records', async () => {
  const history = { kind: 'setting', register: 'history' };
  await assert.rejects(historicalAbsence(inputPage([history])), /current-setting evidence/);
  await assert.rejects(historicalAbsence(inputPage([history, { kind: 'setting', register: 'assert' }],
    { trials: [{}], focuses: [] })), /both Trial and Focus/);
});


// R8's case ('behavioral-carb-undercount') claims finding:carb_undercount
// under a Pattern (#413): the served row is a `.qmember` under a closed fold,
// never a sibling `.qrow`. A raw `.qrow[data-id]` lookup (the pre-#413
// locator) never resolves for it — this fails on that locator and passes
// only through the fold-aware `railRowLocator` resolution.
function foldedComparisonPage(id) {
  const actions = [];
  const qrowSel = `#level .qrow[data-id="${id}"]`;
  const qmemberSel = `#level .qmember[data-id="${id}"]`;
  const foldSel = '#level .qfold[aria-expanded="false"]';
  let foldClosed = true;
  const node = selector => ({
    first() { return this; },
    filter() { return this; },
    count: async () => {
      if (selector === qrowSel) return 0;
      if (selector === foldSel) return foldClosed ? 1 : 0;
      if (selector === qmemberSel) return 1;
      return 1;
    },
    waitFor: async () => {
      if (selector === qrowSel) throw new Error(`Timeout waiting for ${qrowSel}`);
    },
    click: async () => {
      actions.push(selector);
      if (selector === foldSel) foldClosed = false;
    },
    getAttribute: async () => null,
  });
  return {
    actions,
    url: () => 'http://synthetic.invalid/',
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => true,
    waitForResponse: async predicateFn => {
      const response = {
        url: () => 'http://synthetic.invalid/api/diagnose/finding-case-file?finding_id=' + encodeURIComponent(id),
        ok: () => true,
        json: async () => ({ finding: { id }, projection: { alignment: 'event' } }),
      };
      assert.ok(predicateFn(response), 'fake response never matched the expected finding-case-file request');
      return response;
    },
  };
}

test('R8 opens finding:carb_undercount through its Pattern fold, never a raw qrow lookup', async () => {
  const page = foldedComparisonPage('finding:carb_undercount');
  const file = await C2_STORIES.openComparisonCase(page, 'finding:carb_undercount');
  assert.equal(file.finding.id, 'finding:carb_undercount');
  assert.ok(page.actions.includes('#level .qfold[aria-expanded="false"]'),
    'R8 must open the closed fold before it can reach the claimed cause');
  assert.ok(page.actions.includes('#level .qmember[data-id="finding:carb_undercount"]'),
    'R8 must click the folded .qmember row, not a sibling .qrow');
});

// ADR 457: the rail reads "Loading findings…" (no row, no fold) until it
// settles, so a resolver that counts first finds neither shape. This rail
// paints only once the resolver waits for it, then shows the claimed cause
// behind one closed fold.
function loadingRailPage(id) {
  const clicks = [];
  const fold = '#level .qfold[aria-expanded="false"]';
  const member = `#level .qmember[data-id="${id}"]`;
  let painted = false;
  let foldOpen = false;
  const present = selector => {
    if (!painted) return 0;
    if (selector === fold) return foldOpen ? 0 : 1;
    if (selector === member) return foldOpen ? 1 : 0;
    return 0;
  };
  return {
    clicks,
    locator: selector => ({
      selector,
      first() { return this; },
      count: async () => present(selector),
      waitFor: async () => {
        if (!present(selector)) throw new Error(`Timeout waiting for ${selector}`);
      },
      click: async () => {
        clicks.push(selector);
        if (selector === fold) foldOpen = true;
      },
    }),
    waitForFunction: async () => { painted = true; return true; },
  };
}

test('railRowLocator waits for a settled Findings rail before it reads the row shape', async () => {
  const id = 'finding:high_carb_sequence';
  const page = loadingRailPage(id);
  const row = await railRowLocator(page, id);
  assert.equal(row.selector, `#level .qmember[data-id="${id}"]`, 'the claimed cause resolves to its folded line');
  assert.deepEqual(page.clicks, ['#level .qfold[aria-expanded="false"]'], 'the closed fold opens before the cause is read');
});

test('R17 requires the generated finishable Trial, never a mock ready selector', async () => {
  assert.equal(storyCase('R17'), 'c3-trial');
  const page = admission => ({ url: () => 'http://synthetic.invalid/',
    request: { get: async () => ({ status: () => 200, text: async () => '', json: async () => ({ admission }) }) } });
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'focus', can_finish_trial: true })), /served active Trial/);
  await assert.rejects(C4_RETIREMENTS.R17(page({ active_kind: 'trial', can_finish_trial: false })), /finishable Trial/);
});


// These exercise story control flow without Chromium. A missing helper or an
// unreachable setup control must not be mistaken for the feature assertion.
// The coordinator still owns the actual browser fail-first proof.
function qa404Page() {
  const actions = [];
  const brace = (width = 500, range = [720, 1080]) => {
    const x = minute => 34 + minute / 1425 * (width - 86);
    return { width, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, index) =>
      [name, { x: x(range[index]), y: 70, left: x(range[index]) }])) };
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => { actions.push(selector); },
    boundingBox: async () => ({ x: 0, y: 0, width: 500, height: 210 }),
    evaluate: async fn => fn.toString().includes('document.querySelector') ? brace() : 500,
  });
  return {
    actions, node,
    url: () => 'http://synthetic.invalid/',
    goto: async () => {},
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => {},
    mouse: { move: async () => {}, down: async () => {}, up: async () => {} },
  };
}

const copy404 = 'S101 custom Window chip contains only the span';
const graph404 = 'S102 thin basal slot click left the Pattern graph on stage';
const window404 = 'S103 backing out of a slot must restore each reader-selected window';
const day404 = 'S104 day click detached the standing stage, reading pane or navigator while the read was pending';

test('S101 reaches the Window copy assertion after the shared full-day opener', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  page.locator = selector => ({ ...page.node(selector), innerText: async () => 'Window 15:30–21:30 ×' });
  await assert.rejects(C4_STORIES.S101(page), { code: 'ERR_ASSERTION', message: new RegExp(copy404) });
  assert.deepEqual(page.actions, ['[data-destination="diagnose"]', '24 h', 'Afternoon']);
});

test('S102 reaches graph identity after opening a Pattern and selecting a thin slot', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const id = 'pattern:highs_after_meals';
  page.request = { get: async () => ({ status: () => 200, text: async () => '',
    json: async () => ({ rendered_rows: [{ id, kind: 'pattern', pattern_chart: { key: 'highs_after_meals' } }] }) }) };
  page.locator = selector => ({ ...page.node(selector), getAttribute: async () => id });
  page.getByRole = (_role, { name }) => ({ ...page.node(String(name)), getAttribute: async () => 'nodata' });
  await assert.rejects(withReplayAssertionTimeout(80, () => C4_STORIES.S102(page)),
    error => error.cause?.code === 'ERR_ASSERTION' && error.message.includes(graph404));
  assert.deepEqual(page.actions.slice(0, 4), ['[data-destination="diagnose"]', '24 h', 'All charts',
    `#tile-row .evidence-tile[data-chart-id="${id}"]`]);
  assert.equal(page.actions.at(-1), String(/^12:00 basal slot,/));
});

test('S102 waits through intermediate focal frames without selecting the slot again', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const id = 'pattern:highs_after_meals';
  page.request = { get: async () => ({ status: () => 200, text: async () => '',
    json: async () => ({ rendered_rows: [{ id, kind: 'pattern', pattern_chart: {} }] }) }) };
  const frames = [null, id, 'basal:720'];
  page.locator = selector => ({ ...page.node(selector), getAttribute: async () => frames.shift() });
  page.getByRole = (_role, { name }) => ({ ...page.node(String(name)), getAttribute: async () => 'nodata' });
  await C4_STORIES.S102(page);
  assert.equal(frames.length, 0);
  assert.equal(page.actions.filter(action => action === String(/^12:00 basal slot,/)).length, 1);
});

test('S103 reaches its aggregate return assertion after exercising all three window entries', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  const whole = { label: '24 h', min: 0, max: 95 };
  const morning = { ...whole, label: 'Morning' };
  const drawn = { ...whole, label: '15:30–21:30 ×' };
  const reads = [whole, whole, morning, morning, drawn, whole];
  page.evaluate = async () => { assert.ok(reads.length); return reads.shift(); };
  await assert.rejects(C4_STORIES.S103(page), error => {
    assert.equal(error.code, 'ERR_ASSERTION'); assert.ok(error.message.includes(window404));
    assert.deepEqual(error.actual, [{ mode: 'drawn', before: drawn, after: whole }]);
    return true;
  });
  assert.equal(reads.length, 0);
  assert.equal(page.actions.filter(action => action === 'Findings').length, 3);
  assert.equal(page.actions.filter(action => action === '24 h').length, 3);
  assert.ok(page.actions.includes('Morning'));
});

test('S104 establishes a populated week before observing teardown and releases the held read on failure', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa404Page();
  let previousPicked = false, handler, responded, continued = false, disposed = false, unregistered = false;
  const date = '2024-06-23';
  const response = new Promise(resolve => { responded = resolve; });
  page.getByRole = (role, options) => {
    assert.equal(role, 'button'); assert.equal(options.name, 'Previous recorded day');
    return { isEnabled: async () => true, click: async () => { previousPicked = true; } };
  };
  page.locator = selector => ({ ...page.node(selector),
    evaluateAll: async fn => {
      assert.ok(previousPicked, 'the Sunday arrival must first step into its preceding week');
      return fn([{ dataset: { pick: date } }]);
    },
    getAttribute: async () => { throw new Error('the unresolved arrival-week locator must not be read'); },
    click: async () => {
      if (selector === 'nav.v2-nav [data-destination="day"]') return;
      assert.equal(selector, `.gf-nav-col[data-pick="${date}"]`);
      void handler({ continue: async () => { continued = true; responded(); } });
    },
  });
  page.evaluateHandle = async () => {
    assert.ok(previousPicked, 'capture the frame only after the setup day settles');
    return { evaluate: async fn => fn({ stage: { isConnected: false }, reading: { isConnected: false }, nav: { isConnected: false } }),
      dispose: async () => { disposed = true; } };
  };
  page.route = async (pattern, run) => { assert.equal(pattern, '**/api/model-view*'); handler = run; };
  page.waitForResponse = () => response;
  page.unroute = async () => { unregistered = true; };
  await assert.rejects(C4_STORIES.S104(page), { code: 'ERR_ASSERTION', message: new RegExp(day404) });
  assert.equal(continued, true); assert.equal(disposed, true); assert.equal(unregistered, true);
});

for (const width of [480, 760]) {
  test(`S101 measures the brace at chart width ${width} and observes each snapped move before release`, async () => {
    const { C4_STORIES } = await import('./c4.replay.mjs');
    const { xAtMinute, minuteAtX, snapWindow } = await import('./diagnose-workstation-chart.js');
    const page = qa404Page();
    const chart = { clientWidth: width };
    let range = [720, 1080], origin = 120, measured = false, laidOut = false;
    let pointer, held = false, edge, pending = null, chip = null;
    const measurements = [], painted = [], moves = [];
    page.locator = selector => ({ ...page.node(selector),
      evaluate: async fn => {
        assert.equal(selector, '#chart');
        if (!laidOut) return width;
        assert.ok(laidOut, 'wait for layout and animations before sampling grip pixels');
        measured = true; laidOut = false;
        measurements.push([...range]);
        return { width, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, i) =>
          [name, { x: origin + xAtMinute(chart, range[i]), y: 68, left: xAtMinute(chart, range[i]) }])) };
      },
      innerText: async () => chip,
    });
    page.waitForFunction = async (predicate, expected, options) => {
      if (predicate.constructor.name === 'AsyncFunction') { laidOut = true; return; }
      if (typeof expected !== 'string') return;
      assert.equal(options.timeout, 7000);
      // The app paints on a frame, and pointerup cancels an outstanding frame.
      // A chip wait must occur while held, before release, to observe that paint.
      if (pending) {
        assert.ok(held); range = pending; pending = null;
        chip = `Window ${expected} ×`; painted.push([...range]);
      }
      assert.equal(chip?.replace(/^Window\s+/, '').replace('×', '').trim(), expected);
    };
    page.mouse = {
      move: async (x, y) => {
        assert.ok(measured, 'the gesture must use freshly measured grips');
        assert.equal(y, 68, 'use the grip, not a guessed mid-chart ordinate');
        pointer = x; moves.push(x);
        if (held) {
          const minute = minuteAtX(chart, x - origin);
          pending = edge === 'a' ? snapWindow([minute, range[1]], 45, 'end')
            : snapWindow([range[0], minute], 45, 'start');
        }
      },
      down: async () => {
        held = true;
        edge = Math.abs(pointer - origin - xAtMinute(chart, range[0])) < 1 ? 'a' : 'b';
        assert.ok(Math.abs(pointer - origin - xAtMinute(chart, range[edge === 'a' ? 0 : 1])) < 1);
      },
      up: async () => {
        assert.equal(pending, null, 'releasing before paint loses the final move');
        held = false; measured = false; origin += 23; // force a fresh measurement for the other edge
      },
    };
    await assert.rejects(C4_STORIES.S101(page), { code: 'ERR_ASSERTION', message: new RegExp(copy404) });
    assert.deepEqual(measurements, [[720, 1080], [720, 1290]]);
    assert.deepEqual(painted, [[720, 1290], [930, 1290]]);
    assert.equal(moves.at(1), moves.at(2), 'the first resize repeats its terminal coordinate before release');
    assert.equal(moves.at(4), moves.at(5), 'the second resize repeats its terminal coordinate before release');
  });
}

test('S101 rejects an unpainted 24 h brace before it can drag the named Afternoon preset', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const { xAtMinute } = await import('./diagnose-workstation-chart.js');
  const page = qa404Page();
  const chart = { clientWidth: 480 };
  const stale = [0, 1440];
  page.locator = selector => ({ ...page.node(selector),
    evaluate: async fn => fn.toString().includes('document.querySelector')
      ? ({ width: chart.clientWidth, selected: 'Afternoon', grips: Object.fromEntries(
      ['a', 'b'].map((name, index) => [name, {
        x: xAtMinute(chart, stale[index]), y: 68, left: xAtMinute(chart, stale[index]),
      }]),
    ) }) : chart.clientWidth,
  });
  page.mouse.down = async () => assert.fail('a stale 24 h brace must fail before the mouse gesture');
  await assert.rejects(C4_STORIES.S101(page),
    /Afternoon brace must span 12:00–18:00 before dragging/);
  assert.deepEqual(page.actions, ['[data-destination="diagnose"]', '24 h', 'Afternoon']);
});

for (const seen of ['(absent)', '12:00–18:00 ×']) {
  test(`a bounded drawn-window failure reports chip seen: ${seen}`, async () => {
    const { C4_STORIES } = await import('./c4.replay.mjs');
    const page = qa404Page();
    let released = false;
    page.mouse.up = async () => { released = true; };
    page.waitForFunction = async (_predicate, expected, options) => {
      if (typeof expected === 'string') {
        assert.equal(options.timeout, 7000);
        throw new Error('simulated chip timeout');
      }
    };
    const x = minute => 34 + minute / 1425 * (500 - 86);
    page.locator = selector => ({ ...page.node(selector),
      evaluate: async fn => {
        if (selector === '#seg-window') return seen;
        return fn.toString().includes('document.querySelector')
          ? { width: 500, selected: 'Afternoon', grips: Object.fromEntries(['a', 'b'].map((name, index) =>
            [name, { x: x([720, 1080][index]), y: 70, left: x([720, 1080][index]) }])) }
          : 500;
      },
    });
    await assert.rejects(C4_STORIES.S101(page), error => {
      assert.equal(error.code, 'ERR_ASSERTION');
      assert.equal(error.message, `#404 drawn-window premise: expected 12:00–21:30; chip seen: ${seen}`);
      return true;
    });
    assert.equal(released, true, 'a failed live-chip wait must release the pointer');
  });
}

// #413: a fake page for `assertBasalLaneGallery` — the scenario S113 drives
// after `openBasalLane`. It exercises the paint-comparison logic directly,
// without also having to fake that shared opener's own network reads and
// navigation (S31-S35 leave that same boundary to the coordinator's browser
// proof). Every knob defaults to a passing lane; each test below breaks
// exactly one.
function qa413GalleryPage({
  verdicts = { up: 5, down: 5, hold: 30, insufficient: 3, nodata: 5 },
  cellTokens = { up: 'color-mix(up)', down: 'color-mix(down)', hold: 'var(--ck-hold)', insufficient: 'transparent', nodata: 'transparent' },
  keyTokens = null,
  cellImages = { insufficient: 'repeating-linear-gradient(135deg, ...)', nodata: 'radial-gradient(circle, ...)' },
  keyImages = null,
  cellGlyph = { up: '""', down: '""' },
  keyGlyph = null,
  groundColor = 'rgb(20, 18, 15)',
  holdCellColor = 'rgb(164, 156, 144)',
  laneWrapBox = { x: 0, y: 0, width: 400, height: 40 },
  keyBox = { x: 0, y: 0, width: 400, height: 16 },
  laneBox = { x: 0, y: 24, width: 400, height: 11 },
  keyCounts = null,
  order = ['lane-key', 'lane'],
  staged = true,
  distinctSelection = true,
  marks = {},
  // #433: the canvas pane at the run's size — how far the lane runs below its
  // visible box, how far the pane can scroll, and whether the key wrapped
  paneOverrun = 0,
  paneScroll = 0,
  keyWrapped = false,
} = {}) {
  marks = { primary: 'rgb(224, 127, 63)', outlineStyle: 'solid', outlineColor: 'rgb(224, 127, 63)',
    fill: 'color(srgb 0.8 0.5 0.3 / 0.72)', underline: '""', underlineHeight: '2px', clipped: 0, ...marks };
  keyTokens = keyTokens || cellTokens;
  keyImages = keyImages || cellImages;
  keyGlyph = keyGlyph || cellGlyph;
  keyCounts = keyCounts || verdicts;
  const verdictOf = selector => (/data-verdict="([a-z]+)"/.exec(selector) || [])[1];
  // a key entry is its verdict, or its verdict and served reason (#433, D6)
  const entryOf = selector => {
    const reason = (/data-reason="([a-z-]+)"/.exec(selector) || [])[1];
    return reason ? `${verdictOf(selector)}:${reason}` : verdictOf(selector);
  };
  const box = (top, bottom, left, right) => ({ top, bottom, left, right, height: bottom - top });
  const lane = {
    pane: { top: 0, bottom: 616, left: 0, right: 850, overflowY: 'auto', scrollTop: 0, scrollLeft: 0,
      scrollHeight: 616 + paneScroll, clientHeight: 616 },
    wrap: box(575 + paneOverrun, 616 + paneOverrun, 0, 850),
    entries: [['Basal slots', 34, 89], ['raise 5', 100, 152], ['lower 5', 163, 218], ['hold 30', 229, 283],
      ['insufficient 3', 294, 378], ['no data 5', 389, 460]].map(([text, left, right], i, all) => {
      const top = 575 + (keyWrapped && i === all.length - 1 ? 16 : 0);
      return { text, ...box(top, top + 14, left, right) };
    }),
  };
  const node = selector => ({
    first() { return this; },
    click: async () => {},
    waitFor: async () => {},
    getAttribute: async name => {
      const verdict = verdictOf(selector);
      if (verdict === 'up' && name === 'data-staged') return staged ? 'true' : 'false';
      if (verdict === 'up' && name === 'aria-pressed') return distinctSelection ? 'false' : 'true';
      if (verdict === 'down' && name === 'aria-pressed') return 'true';
      return null;
    },
    innerText: async () => String(keyCounts[entryOf(selector)]),
    boundingBox: async () => {
      if (selector === '#lane-wrap') return laneWrapBox;
      if (selector === '#lane-key') return keyBox;
      if (selector === '#lane') return laneBox;
      return null;
    },
    evaluate: async fn => {
      const src = fn.toString();
      const isKey = selector.includes('#lane-key');
      const verdict = verdictOf(selector);
      if (selector === '#lane' && src.includes('backgroundColor')) return groundColor;
      if (src.includes("getPropertyValue('--cell')")) return (isKey ? keyTokens : cellTokens)[verdict];
      if (src.includes('::before')) return (isKey ? keyGlyph : cellGlyph)[verdict] || 'none';
      if (src.includes('backgroundImage')) return (isKey ? keyImages : cellImages)[verdict] || 'none';
      if (src.includes('backgroundColor')) return verdict === 'hold' ? holdCellColor : 'rgba(0, 0, 0, 0)';
      throw new Error(`unexpected evaluate on ${selector}: ${src}`);
    },
  });
  return {
    evaluate: async fn => {
      const src = fn.toString();
      if (fn.name === 'laneGeometry') return lane;
      if (src.includes('lane-wrap')) return order;
      if (src.includes('outlineStyle')) return { ...marks };
      if (src.includes('lane-cell')) return { ...verdicts };
      throw new Error(`unexpected page.evaluate: ${src}`);
    },
    locator: selector => node(selector),
  };
}

test('assertBasalLaneGallery passes on a lane serving all five verdicts, staged and selected', async () => {
  await assertBasalLaneGallery(qa413GalleryPage());
});

test('assertBasalLaneGallery fails closed when the case lacks a served verdict', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ verdicts: { up: 5, down: 5, hold: 30, nodata: 8 } })),
    /premise: the gallery case must serve a insufficient slot/);
});

test('assertBasalLaneGallery fails closed when the raise cell was never staged', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ staged: false })),
    /premise: the raise cell must carry the staged mark/));
});

test('assertBasalLaneGallery fails closed when the staged cell is also the selection', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ distinctSelection: false })),
    /staged cell and the selected cell must be distinct/));
});

test('assertBasalLaneGallery fails when the key count disagrees with the served lane count', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyCounts: { up: 4, down: 5, hold: 30, insufficient: 3, nodata: 5 } })),
    /the key's up count must equal the served lane count/);
});

test('assertBasalLaneGallery fails when a key mark does not share its cells\' --cell paint token', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({
      keyTokens: { up: 'color-mix(up)', down: 'wrong-token', hold: 'var(--ck-hold)', insufficient: 'transparent', nodata: 'transparent' },
    })),
    /the down key mark must share the cell's --cell paint token/);
});

test('assertBasalLaneGallery fails when a hold cell paints as the bare ground', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ holdCellColor: 'rgb(20, 18, 15)', groundColor: 'rgb(20, 18, 15)' })),
    /a hold cell must not paint as the bare ground/);
});

test('assertBasalLaneGallery fails when a raise/lower cell carries no directional glyph', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ cellGlyph: { up: 'none', down: '""' } })),
    /a up cell must carry its directional glyph/);
});

test('assertBasalLaneGallery fails when the insufficient key mark does not mirror its cells\' hatch/dot structure', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyImages: { insufficient: 'radial-gradient(circle, ...)', nodata: 'radial-gradient(circle, ...)' } })),
    /the insufficient key mark's structure must match/);
});

test('assertBasalLaneGallery fails when the key does not render above the cells', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ order: ['lane', 'lane-key'] })),
    /the key must render as the lane's head row, above the cells/));
});

test('assertBasalLaneGallery fails when lane cells overflow the lane track', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { clipped: 48 } })),
    /every lane cell must stand wholly inside the lane's track; 48 overflow it/);
});

test('assertBasalLaneGallery fails when the selected outline is not primary', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { outlineColor: 'rgb(242, 237, 226)' } })),
    /the selected cell must keep the primary outline/);
});

test('assertBasalLaneGallery fails when the staged mark is not an underline', async () => {
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ marks: { underlineHeight: '11px' } })),
    /the staged mark must be an underline, not a fill/);
});

// #433: S113's pane checks at the run's own size, and its key counts scoped
// to verdict plus reason.
test('assertBasalLaneGallery fails when the lane overruns the canvas pane at rest', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ paneOverrun: 44 })),
    /the lane and every key entry must stand wholly inside the canvas pane at rest; #lane-wrap overruns it by 44px/));
});

test('assertBasalLaneGallery fails when the canvas pane has a scroll range at a supported size', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ paneScroll: 44 })),
    /the canvas pane must have no scroll range at this size; it scrolls 44px/));
});

test('assertBasalLaneGallery fails when the key wraps onto a second line at a supported size', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ keyWrapped: true })),
    /the key must stand on one line at this size; no data 5 wrapped below the lead entry/));
});

test('assertBasalLaneGallery counts a recurring-lows lower apart from a measured lower', async () => {
  const verdicts = { up: 5, down: 4, 'down:recurring-lows': 1, hold: 30, insufficient: 3, nodata: 5 };
  await assertBasalLaneGallery(qa413GalleryPage({ verdicts }));
  await assert.rejects(
    assertBasalLaneGallery(qa413GalleryPage({ verdicts, keyCounts: { ...verdicts, 'down:recurring-lows': 2 } })),
    /the key's down:recurring-lows count must equal the served lane count/);
});

// #433: a fake page for `assertBasalLaneReachable` — S151's scenario. Each size
// names how far the lane runs below the canvas pane's visible box at rest
// (`below`), whether the pane can scroll that far (`scrolls`), and how far the
// last key entry, the last cell and the chart run past its right edge
// (`past`). A wheel moves the fake pane within its scroll range, as a browser
// would; nothing else ever moves.
function qa433ReachPage(sizes = {}) {
  let viewport = { width: 1280, height: 720 };
  let offset = 0;
  const log = [];
  const at = () => ({ below: 0, scrolls: true, past: 0, ...sizes[`${viewport.width}x${viewport.height}`] });
  const box = (top, bottom, left, right) => ({ top, bottom, left, right, height: bottom - top });
  const reading = () => {
    const { below, scrolls, past } = at();
    const range = scrolls ? below : 0;
    const scrollTop = Math.min(offset, range);
    const bottom = 400 + below - scrollTop; // the lane's bottom edge; the pane's is 400
    return {
      viewport: { ...viewport },
      root: { scrollTop: 0, scrollLeft: 0, scrollHeight: viewport.height, clientHeight: viewport.height,
        scrollWidth: viewport.width, clientWidth: viewport.width },
      pane: { top: 100, bottom: 400, left: 0, right: 400, overflowY: scrolls ? 'auto' : 'visible',
        scrollTop, scrollLeft: 0, scrollHeight: 300 + range, clientHeight: 300 },
      head: box(160 - scrollTop, 190 - scrollTop, 0, 400),
      wrap: box(bottom - 41, bottom, 0, 400 + past),
      key: box(bottom - 41, bottom - 27, 34, past ? 400 + past : 348),
      entries: [['Basal slots', 34, 89], ['raise 1', 100, 152], ['no data 44', 163, past ? 400 + past : 348]]
        .map(([text, left, right]) => ({ text, ...box(bottom - 41, bottom - 27, left, right) })),
      cells: [0, 1, 2].map(i => ({ cell: String(i), verdict: 'nodata', name: `slot ${i}`,
        ...box(bottom - 19, bottom - 8, 34 + i * 105, i === 2 && past ? 400 + past : 134 + i * 105) })),
      chart: box(190 - scrollTop, bottom - 41, 0, 400 + past),
      ancestors: [{ name: '.panes', scrollTop: 0, scrollLeft: 0 }],
    };
  };
  return {
    log,
    viewportSize: () => ({ ...viewport }),
    setViewportSize: async size => { viewport = { ...size }; log.push(`${size.width}x${size.height}`); },
    evaluate: async fn => {
      if (fn.name === 'laneGeometry') return reading();
      throw new Error(`unexpected page.evaluate: ${fn}`);
    },
    mouse: {
      move: async () => {},
      wheel: async (_x, y) => {
        const { below, scrolls } = at();
        offset = Math.min(scrolls ? below : 0, Math.max(0, offset + y));
      },
    },
  };
}

test('assertBasalLaneReachable passes when the pane scrolls a short window\'s lane into reach', async () => {
  const page = qa433ReachPage({ '1200x560': { below: 44 }, '832x560': { below: 44 } });
  await assertBasalLaneReachable(page);
  assert.deepEqual(page.log, [...LANE_REACH_SIZES.map(size => `${size.width}x${size.height}`), '1280x720'],
    'every split size is visited, then the run\'s own size restored');
});

test('assertBasalLaneReachable fails on a key entry past the canvas pane\'s right edge', async () => {
  await assert.rejects(assertBasalLaneReachable(qa433ReachPage({ '832x560': { past: 58.75 } })),
    /832×560 horizontal: 1 of 3 key entries run past the canvas pane's client box, "no data 44" by 58\.75px/);
});

test('assertBasalLaneReachable fails on a lane below a canvas pane that cannot scroll', async () => {
  await assert.rejects(assertBasalLaneReachable(qa433ReachPage({ '1200x560': { below: 44, scrolls: false } })),
    /1200×560 vertical: #lane-wrap overruns the canvas pane's visible box by 44px at rest, and the pane cannot scroll \(overflow-y: visible\)/);
});

test('assertBasalLaneReachable names a vertical failure at one size and a horizontal one at another, once', async () => {
  const page = qa433ReachPage({ '1200x560': { below: 44, scrolls: false }, '832x560': { past: 58.75 } });
  await assert.rejects(assertBasalLaneReachable(page), error => {
    assert.match(error.message, /^S151 the basal lane must stay within reach at every split size; \d+ failures:/);
    assert.match(error.message, /1200×560 vertical: #lane-wrap still overruns the canvas pane's visible box by 44px after wheeling the pane/);
    assert.match(error.message, /832×560 horizontal: 1 of 3 key entries run past the canvas pane's client box, "no data 44" by 58\.75px/);
    assert.match(error.message, /832×560 horizontal: #chart runs past the canvas pane's client box by 58\.75px/);
    return true;
  });
  assert.equal(page.log.at(-1), '1280x720', 'the run\'s own size is restored even when checks failed');
});

// #433 (D6): a fake page for `assertRecurringLowsVariant` — S113's route on the
// `basal-recurring-low-no-clean-median` store. That store's 05:00 slot serves no
// steady night, so no `#level .case-occurrence` row ever renders: a wait on one
// times out here, as it did in the browser. The defaults are the branch's lane;
// the key-word knobs reproduce base, which counts the slot under plain "lower".
function qa433RecurringLowsPage({
  keyEntries = ['Basal slots', 'lower · recurring lows 1', 'no data 47'],
  counts = { 'down:recurring-lows': 1, nodata: 47 },
} = {}) {
  const asked = [];
  let panel = null;
  const verdictOf = selector => (/data-verdict="([a-z]+)"/.exec(selector) || [])[1];
  const entryOf = selector => {
    const reason = (/data-reason="([a-z-]+)"/.exec(selector) || [])[1];
    return reason ? `${verdictOf(selector)}:${reason}` : verdictOf(selector);
  };
  const recurring = selector => selector.includes('[data-reason="recurring-lows"]');
  const node = selector => {
    asked.push(selector);
    const self = {
      filter() { return self; },
      first() { return self; },
      waitFor: async () => {
        if (selector.includes('case-occurrence')) {
          throw new Error('locator.waitFor: Timeout 30000ms exceeded (this store renders no steady night)');
        }
      },
      click: async () => {
        if (recurring(selector)) {
          panel = { time: '05:00–05:30', verdict: 'lower (recurring lows)', recommended: '0.48', stage: 1,
            text: '05:00–05:30 lower (recurring lows) Recommended 0.48 Stage change' };
        }
      },
      count: async () => (selector === '#lane > button.lane-cell' ? 48
        : recurring(selector) ? counts['down:recurring-lows'] || 0 : 0),
      getAttribute: async name => (name === 'aria-label' && recurring(selector)
        ? '05:00 basal slot, suggests a lower because lows keep happening at this hour' : null),
      evaluateAll: async () => [...keyEntries],
      innerText: async () => String(counts[entryOf(selector)]),
      evaluate: async fn => {
        const src = fn.toString();
        if (src.includes("getPropertyValue('--cell')")) return `token(${verdictOf(selector)})`;
        if (src.includes('::before')) return verdictOf(selector) === 'down' ? '""' : 'none';
        if (src.includes('backgroundImage')) return verdictOf(selector) === 'nodata' ? 'radial-gradient(circle, ...)' : 'none';
        throw new Error(`unexpected evaluate on ${selector}: ${src}`);
      },
    };
    return self;
  };
  return {
    asked,
    // the store's served preparation: one basal Finding, the 05:00 slot's, which
    // the old `openBasalLane` route drills before its steady-night wait
    url: () => 'http://synthetic.invalid/',
    request: { get: async () => ({ ok: () => true, status: () => 200,
      json: async () => ({ rendered_rows: [{ id: 'basal:300-330' }] }) }) },
    locator: node,
    getByRole: (role, { name }) => {
      asked.push(`${role}:${name}`);
      return { click: async () => {} };
    },
    waitForFunction: async () => {},
    evaluate: async fn => {
      if (fn.name === 'readSlotPanel') return panel && { ...panel };
      if (fn.toString().includes('lane-cell')) return { ...counts };
      throw new Error(`unexpected page.evaluate: ${fn}`);
    },
  };
}

test('assertRecurringLowsVariant reaches the lane on a store with no steady night, never waiting for one', async () => {
  const page = qa433RecurringLowsPage();
  await assertRecurringLowsVariant(page);
  assert.ok(page.asked.includes('button:24 h'), 'the route opens the 24 h rail');
  assert.ok(page.asked.includes('#lane > button.lane-cell'), 'the route waits for the 48 basal slots');
  assert.deepEqual(page.asked.filter(selector => selector.includes('case-occurrence')), [],
    'the route never waits for a steady-night row, which this store never renders');
  assert.ok(page.asked.includes('#lane > .lane-cell[data-verdict="down"][data-reason="recurring-lows"]'),
    'the route opens the recurring-lows cell itself');
});

test('assertRecurringLowsVariant fails at the key word when the key counts the slot under plain "lower"', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRecurringLowsVariant(qa433RecurringLowsPage({
      keyEntries: ['Basal slots', 'lower 1', 'no data 47'], counts: { down: 1, nodata: 47 },
    })),
    /S113 the key must read "lower · recurring lows 1"; it reads \["Basal slots","lower 1","no data 47"\]/));
});

// #413: a fake page for `assertRankedMinis` — the scenario S116 drives after
// opening the rail. `graphics` maps a row id to its mounted mini's graphic
// texts; an absent id is an unmounted mini. The story's own in-page function
// runs against a DOM shaped as the served desk mounts a mini: the ECharts
// instance on `SPAN.mini`, its canvas inside an inner DIV, and `getOption()`
// returning the texts as ONE graphic group's `elements` (coordinator probe of
// the branch showcase, 2026-09-22).
function qa413MiniPage(graphics) {
  const charts = new Map();
  const miniFor = (id) => {
    if (!(id in graphics)) return null;
    const mini = { tagName: 'SPAN' };
    const div = { tagName: 'DIV', parentElement: mini };
    mini.querySelector = (selector) => (selector === 'canvas' ? { tagName: 'CANVAS', parentElement: div } : null);
    charts.set(mini, { getOption: () => ({ graphic: [{ type: 'group',
      elements: graphics[id].map((text) => ({ type: 'text', style: { text } })) }] }) });
    return mini;
  };
  return {
    evaluate: async (fn, id) => {
      const saved = { document: globalThis.document, window: globalThis.window, CSS: globalThis.CSS };
      Object.assign(globalThis, {
        CSS: { escape: (value) => value },
        window: { echarts: { getInstanceByDom: (node) => charts.get(node) } },
        document: { querySelector: (selector) => {
          const match = /^\.qrow\[data-id="([^"]+)"\] \.mini$/.exec(selector);
          return match ? miniFor(match[1]) : null;
        } },
      });
      try { return fn(id); } finally { Object.assign(globalThis, saved); }
    },
  };
}
const minied = { id: 'pattern:p', pattern_chart: { key: 'p' },
  count_sentences: [{ outcome: 'ran high', count: 5, denominator: 12, noun: 'meals' }] };

test('assertRankedMinis passes when every mounted mini draws its served count sentence', async () => {
  await assertRankedMinis(qa413MiniPage({ 'pattern:p': ['RAN HIGH · 5', 'TYPICAL · 12'] }), [minied]);
});

test('assertRankedMinis fails at its premise when no row carries a chart coordinate', async () => {
  await assert.rejects(assertRankedMinis(qa413MiniPage({}), [{ id: 'finding:x' }]),
    /S116 premise: the showcase must rank a mini-bearing Pattern or Cause/);
});

test('assertRankedMinis reaches its feature assertion when the row serves no count sentence', async () => {
  const unserved = { id: 'pattern:p', pattern_chart: { key: 'p' } };
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({ 'pattern:p': ['RAN HIGH · 5', 'TYPICAL · 12'] }), [unserved]),
    /must draw from its served count sentence; none is served/));
});

test('assertRankedMinis fails when a mini draws words other than the served sentence', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({ 'pattern:p': ['MATCHED · 5', 'TYPICAL · 12'] }), [minied]),
    /must draw the served outcome word and count/));
});

test('assertRankedMinis fails when no candidate mini is mounted', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertRankedMinis(qa413MiniPage({}), [minied]),
    /at least one ranked mini must be mounted/));
});

// #429: a fake page for S139/S140 — the served admission, the dock at the foot
// of the Diagnose inspector, and the Changes landing its link opens.
function qa429DockPage(kind, { label = 'Open Changes ›' } = {}) {
  let url = 'http://synthetic.invalid/';
  const roster = { admission: { state: 'available', active_kind: kind, active_id: kind === 'trial' ? 'basal:390' : 7 },
    trials: [], focuses: [{ id: 7, pinned_at: '2026-08-04 09:00:00' }] };
  const detail = kind === 'focus' ? 'Pinned 08-04 · adherence and outcome are read in Changes'
    : 'Maturing — 6 of 14 days since 08-11';
  const text = {
    '.inspector > .watch': `${kind.toUpperCase()} · WATCHING\nThe watched change\n${detail}\n${label}`,
    '.inspector > .watch .go': label,
    '.inspector > .watch .how': detail,
    '.gf-stage-trial .gf-title': 'Basal 06:30 · 0.85 → 1.05 U/hr',
  };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    locator: sub => node(`${selector} ${sub}`),
    waitFor: async () => {},
    click: async () => { if (selector === '.inspector > .watch .go') url = 'http://synthetic.invalid/changes?subject=watch'; },
    getAttribute: async name => (selector === '.inspector > .watch' && name === 'data-state' ? kind : null),
    innerText: async () => text[selector] ?? '',
  });
  return {
    url: () => url,
    request: { get: async href => ({ status: () => 200, text: async () => '',
      json: async () => (new URL(href).searchParams.has('selected')
        ? { ...roster, selected: { changes: [{ slot: '06:30' }] } } : roster) }) },
    locator: node,
  };
}

test('S139 and S140 pass when the dock names Changes and its link lands on the watch', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S139(qa429DockPage('trial'));
  await C4_STORIES.S140(qa429DockPage('focus'));
});

test('S139 and S140 fail at the label, not at a premise, when the dock still reads "Open Verify ›"', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  for (const [id, kind] of [['S139', 'trial'], ['S140', 'focus']]) {
    await withReplayAssertionTimeout(10, () => assert.rejects(
      C4_STORIES[id](qa429DockPage(kind, { label: 'Open Verify ›' })),
      error => error.message.includes(`${id} the dock's link must read "Open Changes ›"`)
        && !error.message.includes('premise')));
  }
});

test('S169 and S170 are unique app-only C4 stories on their cases and terms', () => {
  for (const [id, expectedCase, term] of [['S169', 'c3-trial', 'HV2-24'], ['S170', 'showcase', 'HV2-12']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

// #447: a fake page for S169 — the served admission and selected Trial (15 of 14,
// complete, changed 05-15, target TBR), the dock, and the Changes Watch maturity
// and outcomes its link opens. `dock` is the dock's detail line: the branch prints
// the served count, the base clamped it. `lead` is the outcomes table's first row:
// the branch leads with the served target, the base kept TIR first, unmarked.
function qa447CountPage(dock, lead = { 'data-outcome': 'tbr', class: 'gf-target' }) {
  const roster = { admission: { state: 'available', active_kind: 'trial', active_id: 'basal_rate-0300' } };
  const selected = { state: 'complete', changed_at: '2024-05-15 00:00:00', target_metrics: ['tbr'],
    maturing: { days_elapsed: 15, days_required: 14, gap_count: 0 } };
  const text = {
    '.inspector > .watch .how': dock,
    '[data-part="maturity"] .gf-figure': '15 days14 required · 0 data gaps',
  };
  const attributes = { 'progress[aria-label="Trial progress"]': { value: '14', max: '14' },
    '.gf-stage-trial [data-table="outcomes"] tbody tr': lead };
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    locator: sub => node(`${selector} ${sub}`),
    waitFor: async () => {}, click: async () => {},
    getAttribute: async name => attributes[selector]?.[name] ?? null,
    innerText: async () => text[selector] ?? '',
  });
  return {
    url: () => 'http://synthetic.invalid/',
    request: { get: async href => ({ status: () => 200, text: async () => '',
      json: async () => (new URL(href).searchParams.has('selected') ? { ...roster, selected } : roster) }) },
    locator: node,
  };
}

test('S169 passes when the dock prints the served count in Changes\' words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S169(qa447CountPage('Ready to judge — 15 days since 05-15 · 14 required'));
  // #451: the same count after the Trial's values, which lead the detail line.
  await C4_STORIES.S169(qa447CountPage('0.85 → 1.05 U/hr · Ready to judge — 15 days since 05-15 · 14 required'));
});

test('S169 fails at the outcomes lead, not at a premise, when Changes keeps TIR first', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S169(qa447CountPage('Ready to judge — 15 days since 05-15 · 14 required',
      { 'data-outcome': 'tir', class: '' })),
    error => error.message.includes("S169 Changes' outcomes must lead with the served target metric tbr")
      && !error.message.includes('premise')));
});

test('S169 fails at the dock count when the values ahead of it print a second count', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S169(qa447CountPage('14 of 14 days · Ready to judge — 15 days since 05-15 · 14 required')),
    error => error.message.includes('S169 the dock must print the served day count')
      && !error.message.includes('premise')));
});

test('S169 fails at the dock count, not at a premise, when the dock clamps to "14 of 14"', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S169(qa447CountPage('Ready to judge — 14 of 14 days since 05-15')),
    error => error.message.includes('S169 the dock must print the served day count')
      && !error.message.includes('premise')));
});

// #447: a fake page for S170 — the served article and the Guide rendering it.
function qa447GuidePage(line) {
  const article = `Reading the Diagnose surface\n- ◈ Cause levers (late bolus, over-treated low) ${line}`;
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {}, click: async () => {},
    innerText: async () => (selector === '.gf-article' ? article : ''),
  });
  return {
    url: () => 'http://synthetic.invalid/',
    request: { get: async () => ({ status: () => 200, text: async () => `- **◈ Cause** levers ${line}` }) },
    locator: node,
  };
}

test('S170 passes when the Guide article sends Cause levers to a Focus followed in Changes', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S170(qa447GuidePage('flow to a Focus, followed in\n  Changes, because no pump setting fixes them.'));
});

test('S170 fails at its no-Verify assertion, not at a premise, on the base article', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES.S170(qa447GuidePage('flow to Focus / Verify, because\n  no pump setting fixes them.')),
    error => error.message.includes('S170 the article must name no Verify')
      && !error.message.includes('premise')));
});

test('S154 is a unique app-only C4 story, served from the showcase', () => {
  const entries = REGISTRY.filter(([entry]) => entry === 'S154');
  assert.equal(entries.length, 1, 'S154 is registered once');
  assert.equal(entries[0][1].deferred.term, '#434 reader words');
  assert.equal(storyCase('S154'), 'showcase');
});

// #434: a fake page for S154. `served` answers the story's one read (the 12:30
// night evidence); `lines` are the panel's `.empty` lines once the slot is open;
// `label` is the focal basal tile host's aria-label. Controls pressed and reads
// made are recorded in order, so a premise failure can be told from a feature one.
function qa434Page({ served, lines, label }) {
  const actions = [];
  const node = selector => ({
    filter() { return this; }, first() { return this; },
    waitFor: async () => {},
    click: async () => { actions.push(`click:${selector}`); },
    allInnerTexts: async () => (selector === '#level .empty' ? lines : []),
    getAttribute: async name => (name === 'aria-label'
      && selector === '#tile-focal .evidence-tile[data-chart-id="basal:750"] .tile-chart' ? label : null),
  });
  return {
    actions,
    url: () => 'http://synthetic.invalid/',
    request: { get: async url => {
      const { pathname, search } = new URL(url);
      actions.push(`read:${pathname}${search}`);
      return { status: () => 200, text: async () => '', json: async () => served };
    } },
    locator: node,
    getByRole: (_role, { name }) => node(String(name)),
    waitForFunction: async () => {},
  };
}
const served434 = { excluded_night_count: 3, excluded_night_reasons: {
  before_current_setting: 0, below_range_or_suspended: 0, above_range: 0,
  insulin_acting: 1, carb_log: 0, other: 2 } };
const line434 = '3 excluded nights: 1 insulin on board, 2 other reasons';
const label434 = '27 steady nights at 12:30; 3 nights excluded: 1 insulin on board, 2 other reasons';
const slot434 = `click:${/^12:30 basal slot,/}`;

test('S154 passes when the panel line and the tile description name the served reasons', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa434Page({ served: served434, lines: [line434], label: label434 });
  await C4_STORIES.S154(page);
  assert.deepEqual(page.actions, ['click:nav.v2-nav [data-destination="diagnose"]', 'click:24 h',
    'read:/api/diagnose/basal-night-evidence?slot=25', slot434]);
});

test('S154 fails at its premise, before opening the slot, when the showcase serves another total', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa434Page({ served: { ...served434, excluded_night_count: 2 }, lines: [line434], label: label434 });
  await assert.rejects(C4_STORIES.S154(page), /S154 premise: the showcase must serve three excluded nights at 12:30/);
  assert.equal(page.actions.includes(slot434), false, 'the slot is never opened on a failed premise');
});

test('S154 fails at its pinned panel line on the base, before reading the served breakdown', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  // The base serves the total and no breakdown, and its panel prints the total alone.
  const page = qa434Page({ served: { excluded_night_count: 3 }, lines: ['3 excluded nights'],
    label: '27 steady nights at 12:30; 3 nights excluded' });
  await assert.rejects(withReplayAssertionTimeout(10, () => C4_STORIES.S154(page)), error => {
    assert.match(error.message, /S154 the panel line names the served reasons/);
    assert.equal(error.cause?.code, 'ERR_ASSERTION');
    assert.match(error.cause.message, /S154 the panel's excluded-night line must name each served reason/);
    return true;
  });
  assert.equal(page.actions.at(-1), slot434, 'the feature assertion is reached with the slot open');
});

test('S154 fails when the panel prints counts the showcase did not serve', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa434Page({ served: { ...served434, excluded_night_reasons: {
    ...served434.excluded_night_reasons, insulin_acting: 2, other: 1 } }, lines: [line434], label: label434 });
  await assert.rejects(C4_STORIES.S154(page), /S154 the pinned counts must be the served breakdown/);
});

test('S154 fails when the tile description does not name the served reasons', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  const page = qa434Page({ served: served434, lines: [line434],
    label: '27 steady nights at 12:30; 3 nights excluded' });
  await assert.rejects(withReplayAssertionTimeout(10, () => C4_STORIES.S154(page)), error => {
    assert.match(error.message, /S154 the tile description names the served reasons/);
    assert.match(error.cause?.message ?? '', /S154 the tile's accessible description must name each served reason/);
    return true;
  });
});

const C4_STORIES_424 = async () => (await import('./c4.replay.mjs')).C4_STORIES;

// #424 · the case-file counts revision's three stories, and the helpers they
// read the desk through. The served inputs are generator-owned fixtures; the
// base-shaped copies strip exactly the three fields the base does not serve.
const fixtureJson = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const missedMealCase = () => fixtureJson('./__fixtures__/missed-meal-comparison.json').payload;
const samePopulationCase = () => fixtureJson(
  '../mockups/diagnose-workstation.synthetic/finding-case-files.json').cases['finding:carb_undercount'].event;
const BAND_LEADS_424 = { fired: 'Meets criteria', near_miss: 'Borderline', clean: 'Does not meet' };
function baseShaped424(file) {
  const copy = structuredClone(file);
  const { outside_comparison: _outside, ...counts } = copy.projection.counts;
  copy.projection.counts = { ...counts, not_comparable: copy.projection.counts.comparison };
  for (const cohort of copy.projection.cohorts) delete cohort.band_verdict;
  return copy;
}
const captionView424 = (file, caption, extra = {}) => ({
  caption,
  headings: file.projection.cohorts.map(cohort => ({ name: cohort.name, count: cohort.routed_count })),
  bandLeads: BAND_LEADS_424,
  notComparable: file.verdict_counts.no_data ? [`${file.verdict_counts.no_data} not comparable`] : [],
  foot: file.verdict_counts.no_data ? `${file.verdict_counts.no_data} not comparable` : '',
  denominator: file.summary.denominator,
  ...extra,
});
// A fake desk for the caption stories: the rail row, the served case file and
// the rendered comparison view, so a story's control flow runs without Chromium.
function comparisonStoryPage(file, view) {
  const node = () => ({
    first() { return this; }, filter() { return this; },
    count: async () => 1, waitFor: async () => {}, click: async () => {}, getAttribute: async () => null,
  });
  return {
    url: () => 'http://synthetic.invalid/',
    locator: node,
    getByRole: node,
    waitForFunction: async () => true,
    waitForResponse: async predicate => {
      const response = {
        url: () => `http://synthetic.invalid/api/diagnose/finding-case-file?finding_id=${encodeURIComponent(file.finding.id)}`,
        ok: () => true, json: async () => file,
      };
      assert.ok(predicate(response), 'the fake case file must answer the story\'s own request');
      return response;
    },
    evaluate: async () => view,
  };
}

test('S124–S126 are unique app-only #424 stories on their manufactured case stores', () => {
  for (const [id, expectedCase, term] of [
    ['S124', 'behavioral-carb-undercount', 'HV2-18'],
    ['S125', 'behavioral-missed-meal', 'HV2-18'],
    ['S126', 'behavioral-correction-stacking', '#413 design lock'],
  ]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

test('#424 the served-shape check passes on the branch shape and fails on the base shape', () => {
  assert.doesNotThrow(() => assertServedComparison424('S125', missedMealCase()));
  assert.throws(() => assertServedComparison424('S125', baseShaped424(missedMealCase())),
    /S125 the case file must serve its count outside the comparison and each cohort's band state/);
});

test('#424 a same-population caption passes as the branch renders it and fails as the base did', () => {
  const file = samePopulationCase();
  assert.doesNotThrow(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities')));
  assert.throws(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 matched · 1 nearly matched · 3 comparison · 3 not comparable',
    { notComparable: ['1 not comparable', '3 not comparable'] })), /S124 caption term 1 must read/);
  assert.throws(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities (does not meet)')),
  /S124 caption term 3 must read/);
  assert.throws(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities',
    { headings: [{ name: 'Matched', count: 6 }, { name: 'Nearly matched', count: 1 }, { name: 'Comparison', count: 3 }] })),
  /S124 the caption's Other meal opportunities must match its section heading/);
  assert.throws(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities',
    { notComparable: ['1 not comparable', '3 not comparable'] })),
  /S124 only the band's no-data count may read "not comparable"/);
  assert.throws(() => assertComparisonCaption424('S124', file, captionView424(file,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities · 0 meals outside the comparison')),
  /S124 nothing outside the comparison may print when none is served/);
});

test('#424 a cross-population caption names its Highs outside the comparison and no band on Matched', () => {
  const file = missedMealCase();
  assert.doesNotThrow(() => assertComparisonCaption424('S125', file, captionView424(file,
    '2 Matched · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals · 1 high outside the comparison')));
  assert.throws(() => assertComparisonCaption424('S125', file, captionView424(file,
    '2 Matched · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals')),
  /S125 the caption must name the 1 high outside the comparison/);
  assert.throws(() => assertComparisonCaption424('S125', file, captionView424(file,
    '2 Matched (meets criteria) · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals · 1 high outside the comparison')),
  /S125 caption term 1 must read "2 Matched"/);
});

test('S124 fails at its served-shape feature check on the base case file, never at a setup step', async () => {
  const file = baseShaped424(samePopulationCase());
  file.finding = { ...file.finding, id: 'pattern:highs_after_meals' };
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES_424().then(stories => stories.S124(comparisonStoryPage(file, captionView424(file, '')))),
    /S124 the case file must serve its count outside the comparison and each cohort's band state/));
});

test('S124 names a premise failure when the served case is not a same-population comparison', async () => {
  const file = missedMealCase();
  file.finding = { ...file.finding, id: 'pattern:highs_after_meals' };
  await withReplayAssertionTimeout(10, () => assert.rejects(
    C4_STORIES_424().then(stories => stories.S124(comparisonStoryPage(file, captionView424(file, '')))),
    /S124 premise:/));
});

test('S124 and S125 reach their caption assertions on a served branch case file', async () => {
  const same = samePopulationCase();
  same.finding = { ...same.finding, id: 'pattern:highs_after_meals' };
  same.verdict_counts = { ...same.verdict_counts };
  const stories = await C4_STORIES_424();
  await withReplayAssertionTimeout(10, () => stories.S124(comparisonStoryPage(same, captionView424(same,
    '6 Matched (meets criteria) · 1 Nearly matched (borderline) · 3 Other meal opportunities'))));
  const missed = missedMealCase();
  missed.verdict_counts = { ...missed.verdict_counts, no_data: 1 };
  await withReplayAssertionTimeout(10, () => stories.S125(comparisonStoryPage(missed, captionView424(missed,
    '2 Matched · 0 Nearly matched (borderline) · 1 Completed carb-bolus meals · 1 high outside the comparison'))));
  await withReplayAssertionTimeout(10, () => assert.rejects(stories.S125(comparisonStoryPage(missed,
    captionView424(missed, '2 matched · 0 nearly matched · 1 comparison · 1 not comparable',
      { notComparable: ['1 not comparable', '1 not comparable'] }))), /S125 caption term 1 must read/));
});

test('#424 a folded cause line passes on its share and set-apart counts, and fails on the base line', () => {
  const rows = fixtureJson('./__fixtures__/findings-projection.json').windows.global.rows;
  const carb = rows.find(row => row.id === 'finding:carb_undercount');
  assert.doesNotThrow(() => assertFoldLine424('S126', carb,
    { den: '1 of 3 meals', out: 'outside the count·2 of 4 highs' }));
  assert.throws(() => assertFoldLine424('S126', carb, { den: '2 of 4 highs·1 of 3 meals', out: '' }),
    /S126 finding:carb_undercount must set its other counts apart behind "outside the count"/);
  assert.throws(() => assertFoldLine424('S126', carb,
    { den: '1 of 3 meals ran high', out: 'outside the count·2 of 4 highs' }), /must not print an outcome word/);
  assert.throws(() => assertFoldLine424('S126', carb,
    { den: '', out: 'outside the count·2 of 4 highs' }), /must print its share of the Pattern beside its name/);
  // Under a Pattern that serves no count, every sentence is outside and the line leads with the words.
  const stacking = rows.find(row => row.id === 'finding:correction_stacking');
  assert.doesNotThrow(() => assertFoldLine424('S115', stacking,
    { den: '', out: 'outside the count·1 of 1 correction clusters' }));
});

test('#424 a folded cause without served fold sentences fails the served-shape check', () => {
  const rows = fixtureJson('./__fixtures__/findings-projection.json').windows.global.rows;
  const members = rows.filter(row => row.claimed_by === 'pattern:lows_after_correcting_highs');
  assert.doesNotThrow(() => assertServedFold424('S126', members));
  assert.throws(() => assertServedFold424('S126', members.map(({ fold_sentences: _fold, ...row }) => row)),
    /S126 every folded cause must serve its fold sentences/);
  assert.throws(() => assertServedFold424('S126', []), /S126 every folded cause must serve its fold sentences/);
});

test('S126 fails at its served-shape feature check before opening the fold on the base projection', async () => {
  const rows = fixtureJson('./__fixtures__/findings-projection.json').windows.global.rows
    .map(({ fold_sentences: _fold, ...row }) => row);
  const clicked = [];
  const node = selector => ({
    first() { return this; }, filter() { return this; },
    waitFor: async () => {}, click: async () => { clicked.push(selector); },
  });
  const page = {
    url: () => 'http://synthetic.invalid/',
    locator: node, getByRole: (_role, { name }) => node(name),
    waitForFunction: async () => true,
    request: { get: async () => ({ status: () => 200, text: async () => '',
      json: async () => ({ rendered_rows: rows }) }) },
    evaluate: async () => { throw new Error('S126 must not open the fold before its served-shape check'); },
  };
  const stories = await C4_STORIES_424();
  await assert.rejects(stories.S126(page), /S126 every folded cause must serve its fold sentences/);
  assert.ok(!clicked.some(selector => selector.includes('qfold')), 'no fold is opened on the base shape');
});

// #423: the served model-view day S121 reads — pattern-near-tie 2024-05-25, as
// the branch serves it (episode 2024-05-25-ep13's anchors are stamped the day
// before, so the Day axis clips their rings).
const MODEL423 = { date: '2024-05-25', episodes: [
  { id: '2024-05-25-ep13', lever: 'carb_undercount', lever_title: 'Carb undercount', anchors: [
    { t: '2024-05-24 19:00:00', kind: 'meal', state: 'fired',
      verdicts: [{ classifier: 'carb_undercount', title: 'Carb undercount', matched: true }] },
    { t: '2024-05-24 20:00:00', kind: 'correction', state: 'clean', verdicts: [] },
    { t: '2024-05-24 22:00:00', kind: 'low', state: 'outranked',
      verdicts: [{ classifier: 'over_treated_low', title: 'Over-treated low', matched: false },
        { classifier: 'correction_on_iob', title: 'Correction on active insulin', matched: true }] },
  ] },
  { id: '2024-05-25-ep14', lever: null, lever_title: null,
    anchors: [{ t: '2024-05-25 02:30:00', kind: 'correction', state: 'clean', verdicts: [] }] },
] };
const INK = { primary: 'rgb(134, 173, 120)', warn: 'rgb(214, 170, 60)' };
// The in-page reading of that day's Episode Log and overlay, as the branch renders it.
const LOG423 = {
  claimed: { word: 'claimed', state: 'outranked', ink: INK.primary,
    text: '▽ Low · 54 mg/dL · Correction on active insulin · Carb undercount' },
  firedInk: INK.primary, warnInk: INK.warn,
  captions: ['Findings · 1 · 1 claimed', 'Quiet · 2'],
  markers: { claimed: { size: 10, border: '#86ad78', fill: '#1f1b18' }, fired: { size: 10, border: '#86ad78', fill: '#1f1b18' } },
  surface: '#1f1b18', accent: '#d08150',
};
const variant423 = (change) => {
  const copy = structuredClone(LOG423);
  change(copy);
  return copy;
};
// A fake page for `assertClaimedEpisodeLog`: every in-page reading returns
// `rest` until the claimed row is pressed, then the pressed marker.
function qa423LogPage(rest = LOG423, pressed = { size: 15, border: '#d08150' }) {
  let isPressed = false;
  const locator = (selector) => {
    const node = { filter: () => node, first: () => node, waitFor: async () => {},
      click: async () => { if (selector.includes('data-day-row="2024-05-24 22:00:00"')) isPressed = true; } };
    return node;
  };
  return {
    locator,
    evaluate: async (fn, arg) => {
      assert.ok(fn.toString().includes('day-anchor-markers'), 'S121 reads the overlay by series id');
      assert.deepEqual(arg, { claimed: '2024-05-24 22:00:00', fired: '2024-05-24 19:00:00' });
      return isPressed ? { ...rest, markers: { ...rest.markers, claimed: { ...rest.markers.claimed, ...pressed } } } : rest;
    },
  };
}
// A feature failure names S121's feature sentence and the one thing that broke, never a premise.
const feature121 = (part) => (error) => {
  assert.match(error.message, /^S121 the claimed low must read as part of the Finding that claimed it: /);
  assert.ok(error.message.includes(part), `${error.message} does not name: ${part}`);
  return true;
};

test('S121 passes on the claimed low as the branch renders it', async () => {
  await assertClaimedEpisodeLog(qa423LogPage(), MODEL423);
});

test('S121 fails at its premise when the day serves no claimed low', async () => {
  const model = structuredClone(MODEL423);
  model.episodes[0].anchors[2].state = 'clean';
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(), model),
    /S121 premise: the day must serve a claimed low whose own verdict matched correction_on_iob/);
});

test('S121 fails at its premise when the Episode Log does not render the claimed row', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.claimed = null; })), MODEL423),
    /S121 premise: the Episode Log must render the claimed low's row \(2024-05-24 22:00:00\)/));
});

test('S121 fails on a warning-hued tier word', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.claimed.ink = INK.warn; })), MODEL423),
    feature121(`its tier word paints ${INK.warn}, not the fired tier's ${INK.primary} (it is the warning ink)`));
});

test('S121 fails on the bare engine state word', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.claimed.word = 'outranked'; })), MODEL423),
    feature121('its tier reads "outranked", not "claimed"'));
});

test('S121 fails when the model read serves no title on the matched verdict', async () => {
  const model = structuredClone(MODEL423);
  delete model.episodes[0].anchors[2].verdicts[1].title;
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(), model),
    feature121("the model read serves no title on the low's matched correction_on_iob verdict"));
});

test('S121 fails when the row does not name what the low matched', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => {
    log.claimed.text = '▽ Low · 54 mg/dL · Carb undercount';
  })), MODEL423), feature121('does not name what the low matched ("Correction on active insulin")'));
});

test('S121 fails when the row does not end with the claiming Finding\'s served name', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => {
    log.claimed.text = '▽ Low · 54 mg/dL · Carb undercount · Correction on active insulin';
  })), MODEL423), feature121('does not end with the claiming Finding\'s served name ("Carb undercount")'));
});

test('S121 fails on a caption that counts rows', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.captions = ['Findings · 2', 'Quiet · 2']; })), MODEL423),
    feature121('the Findings caption reads "Findings · 2", not "Findings · 1 · 1 claimed"'));
});

test('S121 fails on a claimed marker smaller than the fired one', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.markers.claimed.size = 8; })), MODEL423),
    feature121("its resting marker is 8, not the fired marker's 10"));
});

test('S121 fails on a claimed marker hued unlike the fired one', async () => {
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(variant423((log) => { log.markers.claimed.border = '#e2be4c'; })), MODEL423),
    feature121("its resting ring is #e2be4c, not the fired ring's #86ad78"));
});

test('S121 fails as a feature, never a premise, when the model read serves no lever_title', async () => {
  const model = structuredClone(MODEL423);
  delete model.episodes[0].lever_title;
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(), model),
    feature121('the model read serves no lever_title on the claiming episode'));
});

test('S121 names every changed feature at once on a desk serving neither the verdict title nor the lever_title', async () => {
  // The desk before #426: no served name at all, the Lever named from its own table.
  const model = structuredClone(MODEL423);
  delete model.episodes[0].anchors[2].verdicts[1].title;
  delete model.episodes[0].lever_title;
  const base = variant423((log) => {
    Object.assign(log.claimed, { word: 'outranked', ink: INK.warn, text: '▽ Low · 54 mg/dL · carbs undercounted' });
    log.captions = ['Findings · 2', 'Quiet · 2'];
    Object.assign(log.markers.claimed, { size: 8, border: '#e2be4c' });
  });
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(base), model), (error) => {
    for (const part of ['"outranked"', 'serves no title', 'serves no lever_title', 'the warning ink', '"Findings · 2"', 'is 8',
      'resting ring is #e2be4c']) {
      feature121(part)(error);
    }
    return true;
  });
});

test('S121 fails with exactly the six items the ticket\'s base (e229bef3) showed', async () => {
  // e229bef3 is the release trunk after #426: it serves the episode's
  // lever_title, so the row already ends "· Carb undercount", but no verdict
  // title. The inks and rings are the coordinator's 2026-09-23 base run's.
  const model = structuredClone(MODEL423);
  delete model.episodes[0].anchors[2].verdicts[1].title;
  const base = variant423((log) => {
    Object.assign(log, { firedInk: 'rgb(134, 173, 120)', warnInk: 'rgb(201, 138, 78)', captions: ['Findings · 2', 'Quiet · 2'] });
    Object.assign(log.claimed, { word: 'outranked', ink: 'rgb(201, 138, 78)', text: '▽ Low · 54 mg/dL · Carb undercount' });
    log.markers = { claimed: { size: 8, border: '#c98a4e', fill: '#1f1b18' }, fired: { size: 10, border: '#e07f3f', fill: '#1f1b18' } };
  });
  await assert.rejects(assertClaimedEpisodeLog(qa423LogPage(base), model), (error) => {
    // Node appends the collected list's diff after the sentence; the sentence is the first line.
    assert.equal(error.message.split('\n')[0], 'S121 the claimed low must read as part of the Finding that claimed it: '
      + 'its tier reads "outranked", not "claimed"; '
      + "the model read serves no title on the low's matched correction_on_iob verdict; "
      + "its tier word paints rgb(201, 138, 78), not the fired tier's rgb(134, 173, 120) (it is the warning ink); "
      + 'the Findings caption reads "Findings · 2", not "Findings · 1 · 1 claimed"; '
      + "its resting marker is 8, not the fired marker's 10; "
      + "its resting ring is #c98a4e, not the fired ring's #e07f3f");
    return true;
  });
});

test('S121 fails when pressing the claimed row does not pick its marker', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(
    assertClaimedEpisodeLog(qa423LogPage(LOG423, { size: 10, border: '#86ad78' }), MODEL423),
    /S121 pressing the claimed row must ring its marker in the accent at size 15/));
});

// A fake page for `assertBandGlossary`: the Findings caption, its control, the
// Glossary it opens from the keyboard, and where Close leaves focus.
function qa423GlossaryPage({ caption = true, control = { band: 'findings', name: 'Explain Findings in the Glossary', tag: 'BUTTON' },
  inView = true, returns = true } = {}) {
  let focused = false; let open = false; let closed = false;
  const locator = (selector) => {
    const node = { filter: () => node, first: () => node, waitFor: async () => {},
      focus: async () => { if (selector === '[data-log-glossary="findings"]' && control) focused = true; },
      click: async () => { if (selector === '[data-utility-close]' && open) { open = false; closed = true; } } };
    return node;
  };
  return {
    locator,
    keyboard: { press: async (key) => { if (key === 'Enter' && focused) { open = true; focused = false; } } },
    evaluate: async (fn) => {
      const source = fn.toString();
      if (source.includes('data-glossary-group')) return { open, group: open, inView: open && inView };
      if (source.includes('activeElement')) return closed && returns
        ? { onControl: true, was: 'button.linkbtn.gf-log-help' } : { onControl: false, was: 'body' };
      return { caption, control: caption ? control : null };
    },
  };
}

test('S122 passes when the caption control opens the Glossary at its group and Close returns to it', async () => {
  await assertBandGlossary(qa423GlossaryPage());
});

test('S122 fails at its premise when the Episode Log shows no Findings caption', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(assertBandGlossary(qa423GlossaryPage({ caption: false })),
    /S122 premise: the held Day's Episode Log must show a Findings caption/));
});

test('S122 fails at its feature assertion when the caption carries no Glossary control', async () => {
  await assert.rejects(assertBandGlossary(qa423GlossaryPage({ control: null })),
    /S122 the Findings caption must carry a Glossary button named for its band/);
});

test('S122 fails when the control is not named for its band', async () => {
  await assert.rejects(assertBandGlossary(qa423GlossaryPage({ control: { band: 'findings', name: 'Glossary', tag: 'BUTTON' } })),
    /S122 the Findings caption must carry a Glossary button named for its band/);
});

test('S122 fails when the Glossary opens without its Episode Log group in view', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(assertBandGlossary(qa423GlossaryPage({ inView: false })),
    /S122 the caption control must open the Glossary with its Episode Log group in view/));
});

test('S122 fails when Close does not return focus to the caption control', async () => {
  await withReplayAssertionTimeout(10, () => assert.rejects(assertBandGlossary(qa423GlossaryPage({ returns: false })),
    /S122 closing the Glossary must return focus to the Findings caption control; focus is on body/));
});

/* ----------------------------------------- #449/#450: served names and words */

test('S173–S176 are unique app-only #449 stories with their required manufactured cases', () => {
  for (const [id, expectedCase, term] of [['S173', 'c3-focus', 'HV2-26'], ['S174', 'c3-preempted', 'HV2-28'],
    ['S175', 'c4-history', 'HV2-28'], ['S176', 'c3-preempted', 'HV2-28']]) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, term);
    assert.equal(storyCase(id), expectedCase);
  }
});

// A page whose served reads answer from `api` and whose rendered text is
// whatever `texts` says for the address on screen, one string per element.
function qa449Page({ api, texts }) {
  let url = 'http://synthetic.invalid/';
  const all = selector => [].concat(texts(url)[selector] ?? []);
  const node = selector => ({
    first: () => node(selector), waitFor: async () => {},
    count: async () => all(selector).length,
    innerText: async () => all(selector)[0] ?? '',
    allInnerTexts: async () => all(selector),
  });
  return {
    url: () => url, goto: async target => { url = target; }, locator: node,
    request: { get: async href => {
      const body = api(new URL(href).searchParams);
      return { status: () => 200, text: async () => JSON.stringify(body), json: async () => body };
    } },
  };
}
const words449 = {
  unavailable_adherence: 'the watched behavior could not be measured in both periods',
  zero_opportunities: 'no opportunities in this period',
  insufficient_measurement: 'too little glucose data to judge every opportunity',
};

// c3-focus's active Pattern Focus on Late bolus, as the branch serves it.
function activeFocus449({ served = { lever_title: 'Late bolus' }, row = 'Late bolus\nthe intended behavior · meals',
  intent = 'What this Focus watches\nLate bolus', verdicts = ['Ready', 'Ready'] } = {}) {
  return qa449Page({
    api: params => (params.get('selected')
      ? { selected: { id: 1, kind: 'focus', lever: 'late_bolus', title: 'Highs after meals', ...served,
        original: { context: { state: 'unavailable', reason: 'not_recorded' } },
        reassessment: params.get('assessment') ? { comparison: { adherence: { before: {}, after: {} },
          readiness: { before: { verdict: 'ready' }, after: { verdict: 'ready' } } } } : null } }
      : { admission: { state: 'available', active_kind: 'focus', active_id: 1 }, trials: [], focuses: [{ id: 1 }] }),
    texts: () => ({ '[data-table="adherence"] tr.gf-target td': [row, '12 of 12'], '[data-part="intent"]': intent,
      '[data-opportunity-verdict]': verdicts }),
  });
}

test('S173 passes when the active Focus names its served behavior and its verdicts in words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S173(activeFocus449());
});

test('S173 fails at its feature assertion on the base server shape, never a premise', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S173(activeFocus449({ served: {} }))),
    /S173 the Observed behavior row must name the served behavior/);
});

test('S173 fails when the row prints the lever key or the Pattern title, or a verdict prints as served', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  for (const [page, message] of [
    [activeFocus449({ row: 'late_bolus\nthe intended behavior · meals' }), /S173 the Observed behavior row must name the served behavior/],
    [activeFocus449({ row: 'Highs after meals\nthe intended behavior · meals' }), /S173 the Observed behavior row must name the served behavior/],
    [activeFocus449({ intent: 'What this Focus watches\nlate_bolus' }), /S173 What this Focus watches must name the served behavior/],
    [activeFocus449({ verdicts: ['ready', 'Ready'] }), /S173 the opportunity verdict must print as a word/],
  ]) await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S173(page)), message);
});

// c3-preempted's Focus ended by hand: its saved ending is unavailable, its
// behavior, harm and readiness arms all serve zero opportunities.
function manualEnding449({ ending = `Unavailable · ${words449.unavailable_adherence}`,
  harm = `unavailable\n${words449.zero_opportunities}`, criterion = `Not met — ${words449.zero_opportunities}.`,
  verdict = `Withheld · ${words449.zero_opportunities}` } = {}) {
  const arm = { opportunities: 0, availability: { state: 'unavailable', reason: 'zero_opportunities' },
    harm_availability: { state: 'unavailable', reason: 'zero_opportunities' } };
  const ready = { verdict: 'withheld', reason: 'zero_opportunities', criterion_met: false };
  return qa449Page({
    api: params => (params.get('selected')
      ? { selected: { id: 1, kind: 'focus', original: { ending: { kind: 'manual', assessment: {
        state: 'unavailable', reason: 'unavailable_adherence', adherence: { before: arm, after: arm },
        readiness: { before: ready, after: ready } } } } } }
      : { admission: { state: 'available' }, trials: [], focuses: [{ id: 1, ending: { kind: 'manual' } }] }),
    texts: () => ({ '[data-ending-assessment]': ending, '[data-harm]': [harm, harm],
      '[data-criterion]': [criterion, criterion], '[data-opportunity-verdict]': [verdict, verdict] }),
  });
}

test('S174 passes when a saved Focus ending and its record lines print every served reason in words', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S174(manualEnding449());
});

test('S174 fails at its feature assertion when the saved ending prints its served code', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S174(manualEnding449({
    ending: 'Unavailable · unavailable_adherence' }))), /S174 the saved ending must name its reason in words, never its served code/);
});

test('S174 fails when a harm cell, a Not met line or an opportunity line prints a served code', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  for (const page of [
    manualEnding449({ harm: 'unavailable\nzero_opportunities' }),
    manualEnding449({ criterion: 'Not met — zero_opportunities.' }),
    manualEnding449({ verdict: 'withheld · zero_opportunities' }),
  ]) await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S174(page)), /S174 a served code must print in words/);
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S174(manualEnding449({
    verdict: `withheld · ${words449.zero_opportunities}` }))), /S174 the opportunity verdict must print as a word/);
});

// c4-history's preempted Focus: an unmeasured Before arm and a collecting one.
function unmeasured449({ cell = `unavailable\n${words449.insufficient_measurement} · 0 of 4 measured`,
  criterion = 'Not met — still collecting.' } = {}) {
  return qa449Page({
    api: params => (params.get('selected')
      ? { selected: { id: 1, kind: 'focus', original: { ending: { kind: 'trial_preempted', assessment: {
        state: 'unavailable', reason: 'unavailable_adherence',
        adherence: { before: { opportunities: 4, measured_opportunities: 0, rate: null,
          availability: { state: 'unavailable', reason: 'insufficient_measurement' } },
        after: { opportunities: 0, rate: null, availability: { state: 'unavailable', reason: 'zero_opportunities' } } },
        readiness: { before: { verdict: 'withheld', reason: 'collecting', criterion_met: false },
          after: { verdict: 'withheld', reason: 'zero_opportunities', criterion_met: false } } } } } } }
      : { admission: { state: 'available' }, trials: [], focuses: [{ id: 1, ending: { kind: 'trial_preempted' } }] }),
    texts: () => ({ '[data-adherence="before"]': cell, '[data-readiness="before"] [data-criterion]': criterion }),
  });
}

test('S175 passes when an unmeasured behavior cell names its reason in words and keeps its count', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S175(unmeasured449());
});

test('S175 fails at its feature assertion when the behavior cell prints its served code', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S175(unmeasured449({
    cell: 'unavailable\ninsufficient_measurement · 0 of 4 measured' }))),
  /S175 the Observed behavior cell must name its reason in words, never its served code/);
});

test('S175 fails when the measured count is dropped or the collecting arm prints its code', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S175(unmeasured449({
    cell: `unavailable\n${words449.insufficient_measurement}` }))), /S175 the Observed behavior cell must keep its measured count/);
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S175(unmeasured449({
    criterion: 'Not met — collecting.' }))), /S175 a still-collecting arm must say so in words/);
});

// c3-preempted's records: a Pattern Focus on Late bolus, and a Focus whose
// lever is no longer offered.
function records449({ served = true, pattern = 'The intended behavior: Late bolus. No pump setting changed.',
  outside = 'The behavior this Focus watched is no longer an offered lever. No pump setting changed.' } = {}) {
  const detail = {
    1: { id: 1, kind: 'focus', lever: 'late_bolus', title: 'Highs after meals', ...(served ? { lever_title: 'Late bolus' } : {}) },
    2: { id: 2, kind: 'focus', lever: 'overnight_drift', title: 'Focus', ...(served ? { lever_title: null } : {}) },
  };
  return qa449Page({
    api: params => (params.get('selected') ? { selected: detail[params.get('selected')] }
      : { admission: { state: 'available' }, trials: [], focuses: [{ id: 2 }, { id: 1, pattern_key: 'highs_after_meals' }] }),
    texts: url => {
      const id = /record%3Afocus%3A(\d+)/.exec(url)?.[1];
      return { '.gf-stage .gf-title': detail[id]?.title, '[data-record-part="change"]': `What changed\n${id === '1' ? pattern : outside}` };
    },
  });
}

test('S176 passes when each Focus record names its served behavior and the nameplate keeps its title', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await C4_STORIES.S176(records449());
});

test('S176 fails at its feature assertion on the base server shape, never a premise', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S176(records449({ served: false,
    pattern: 'The intended behavior: Highs after meals. No pump setting changed.',
    outside: 'The intended behavior: Focus. No pump setting changed.' }))), /S176 What changed must name the served behavior/);
});

test('S176 fails when What changed names the Pattern title, the lever key or "Focus" as the behavior', async () => {
  const { C4_STORIES } = await import('./c4.replay.mjs');
  for (const [page, message] of [
    [records449({ pattern: 'The intended behavior: Highs after meals. No pump setting changed.' }), /S176 What changed must name the served behavior/],
    [records449({ pattern: 'The intended behavior: Late bolus. Highs after meals. No pump setting changed.' }), /S176 What changed must not name the behavior by the nameplate title/],
    [records449({ outside: 'The intended behavior: Focus. No pump setting changed.' }), /S176 a record whose behavior has no served name must say it is no longer an offered lever/],
    [records449({ outside: 'The intended behavior: overnight_drift. No pump setting changed.' }), /S176 What changed must not print the lever key/],
  ]) await assert.rejects(withReplayAssertionTimeout(100, () => C4_STORIES.S176(page)), message);
});

// #455: fake readings of the glucose overview on the narrowest split's 402×154
// chart, whose plot runs from 34 to 350. `caption` lists the caption's spans
// as [text, x, y, width], `pads` its pad boxes as [x, y, width, height]; the
// target numerals and one y-axis label stand clear of both.
const CHART455 = { width: 402, height: 154 };
const span455 = (group, text, x, y, width, height = 10) => ({ group, text, x, y, width, height });
function overview455({ caption, pads = [], extra = [] }) {
  return {
    ...CHART455,
    spans: [
      ...caption.map(([text, x, y, width]) => span455(0, text, x, y, width)),
      span455(1, '70', 12, 110, 12), span455(2, '180', 6, 60, 18), span455(3, '120', 8, 82, 18),
      ...extra,
    ],
    pads: pads.map(([x, y, width, height]) => ({ group: 0, x, y, width, height })),
  };
}
const NOTICE455 = 'INSUFFICIENT SAMPLE — thinnest bin holds 0';
const narrow455 = { width: 832, height: 720 };
const day455 = OVERVIEW_PRESETS.find(({ label }) => label === '24 h');
const check455 = (reading, extra = {}) => ({ size: narrow455, state: '24 h', head: day455.head,
  range: day455.range, reading, ...extra });
// the 24 h caption wrapped inside its window: the head over the notice, each
// line on its own pad, centred inside [39, 345]
const wrapped455 = () => overview455({
  caption: [['24 H 00:00–24:00', 140, 25, 110], [NOTICE455, 60, 39, 250]],
  pads: [[135, 23, 120, 14], [55, 37, 260, 14]],
});

test('S183–S185 are unique app-only C4 stories under HV2-11, served from the verdict gallery', () => {
  for (const id of ['S183', 'S184', 'S185']) {
    const entries = REGISTRY.filter(([entry]) => entry === id);
    assert.equal(entries.length, 1, `${id} is registered once`);
    assert.equal(entries[0][1].deferred.term, 'HV2-11');
    assert.equal(storyCase(id), 'basal-verdict-gallery');
  }
});

test('S183 passes a caption wholly inside the chart, stacked on its pads', () => {
  assert.deepEqual(overviewTextFailures(check455(wrapped455())), []);
  // a window that is not thin may carry its spread tail instead of the notice
  assert.deepEqual(overviewTextFailures(check455(overview455({
    caption: [['24 H 00:00–24:00', 100, 25, 110], ['  ·  25–75 spread 27 mg/dL', 210, 25, 120]],
  }))), []);
});

/* A line whose tokens are right-aligned, as a caption parked left of its
   window is, is laid out from its right end, so its tail token paints before
   its head. The caption reads in reading order: line by line, left to right. */
test('S183 reads a caption parked left in reading order, though its tail paints first', () => {
  const afternoon = OVERVIEW_PRESETS.find(({ label }) => label === 'Afternoon');
  const reading = { width: 850, height: 154, pads: [], spans: [
    span455(0, `  ·  ${NOTICE455}`, 175, 25, 232), span455(0, 'AFTERNOON 12:00–18:00', 34, 25, 141),
    span455(1, '70', 12, 110, 12),
  ] };
  assert.deepEqual(overviewTextFailures({ size: { width: 1280, height: 720 }, state: 'Afternoon',
    head: afternoon.head, range: afternoon.range, runSize: true, reading }), []);
});

test('S183 fails a caption parked past the chart\'s right edge', () => {
  const failures = overviewTextFailures(check455(overview455({
    caption: [['24 H 00:00–24:00', 356, 25, 107], [`  ·  ${NOTICE455}`, 463, 25, 232]],
  })));
  assert.ok(failures.includes('832×720 24 h: caption span "24 H 00:00–24:00" lies 61px outside #chart\'s 402×154 box'),
    failures.join('\n'));
  assert.ok(failures.includes('832×720 24 h: caption span "24 H 00:00–24:00" reaches 61px past #chart\'s right edge'));
  assert.ok(failures.includes(`832×720 24 h: caption span "  ·  ${NOTICE455}" reaches 293px past #chart's right edge`));
});

test('S183 fails a caption parked past the chart\'s left edge after a narrowing', () => {
  const evening = OVERVIEW_PRESETS.find(({ label }) => label === 'Evening');
  const failures = overviewTextFailures({ size: narrow455, state: 'Evening, narrowed with nothing pressed',
    head: evening.head, range: evening.range, reading: overview455({
      caption: [['EVENING 18:00–24:00', -60, 25, 120], [`  ·  ${NOTICE455}`, 60, 25, 207]] }) });
  assert.ok(failures.includes('832×720 Evening, narrowed with nothing pressed: caption span "EVENING 18:00–24:00" '
    + 'lies 60px outside #chart\'s 402×154 box'), failures.join('\n'));
  assert.ok(failures.includes('832×720 Evening, narrowed with nothing pressed: caption span "EVENING 18:00–24:00" '
    + 'reaches 94px left of the plot\'s left edge, into the y-axis label column'));
});

test('S183 fails a word split across two spans', () => {
  const failures = overviewTextFailures(check455(overview455({
    caption: [['24 H 00:00–24:00', 140, 25, 110], ['INSUFFICIENT SAMPLE — thin', 90, 39, 170],
      ['nest bin holds 0', 130, 53, 100]],
  })));
  assert.deepEqual(failures, ['832×720 24 h: the caption reads ["24","H","00:00–24:00","INSUFFICIENT","SAMPLE","—",'
    + '"thin","nest","bin","holds","0"]; it must read the words of "24 H 00:00–24:00", then of "INSUFFICIENT SAMPLE '
    + '— thinnest bin holds <n>" with a whole count, every word whole']);
});

test('S183 fails a notice missing its count', () => {
  const failures = overviewTextFailures(check455(overview455({
    caption: [['24 H 00:00–24:00', 140, 25, 110], ['INSUFFICIENT SAMPLE — thinnest bin holds', 70, 39, 240]],
  })));
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^832×720 24 h: the caption reads .*"holds"\]; it must read the words of/);
});

test('S183 fails when the thin-path premise does not hold', () => {
  assert.deepEqual(overviewTextFailures(check455(overview455({ caption: [['24 H 00:00–24:00', 140, 25, 110]] }),
    { premiseThin: true })),
  ['832×720 24 h: premise: the 24 h caption must carry the insufficient-sample notice, so the store exercises the '
    + 'thin path']);
});

test('S183 fails two overlapping spans anywhere in the chart', () => {
  const reading = wrapped455();
  reading.spans.push(span455(4, 'TARGET 70–180 mg/dL', 39, 45, 99));
  assert.deepEqual(overviewTextFailures(check455(reading)),
    ['832×720 24 h: painted text "INSUFFICIENT SAMPLE — thinnest bin holds 0" and "TARGET 70–180 mg/dL" overlap by '
      + '78px × 4px']);
  // the struck y-axis label under a target numeral
  const struck = wrapped455();
  struck.spans.push(span455(5, '60', 10, 117.7, 12));
  assert.deepEqual(overviewTextFailures(check455(struck)),
    ['832×720 24 h: painted text "70" and "60" overlap by 10px × 2.3px']);
});

test('S183 fails a two-line caption at the run\'s own size', () => {
  assert.deepEqual(overviewTextFailures(check455(wrapped455(), { runSize: true })),
    ['832×720 24 h: the caption stands on 2 lines at the run\'s own size; it must stand on one']);
});

test('S183 fails a pad box inside the text\'s bounds that reaches into the y-axis label column', () => {
  const evening = OVERVIEW_PRESETS.find(({ label }) => label === 'Evening');
  const failures = overviewTextFailures({ size: narrow455, state: 'Evening', head: evening.head,
    range: evening.range, reading: overview455({
      caption: [['EVENING 18:00–24:00', 140, 25, 120], ['INSUFFICIENT SAMPLE —', 150, 39, 110],
        ['thinnest bin holds 0', 36, 53, 100]],
      pads: [[135, 23, 130, 14], [145, 37, 120, 14], [30, 51, 110, 14]] }) });
  assert.deepEqual(failures, ['832×720 Evening: caption pad box 3 reaches 4px left of the plot\'s left edge, into the '
    + 'y-axis label column']);
});

test('S183 fails a pad box straddling a gate', () => {
  const overnight = OVERVIEW_PRESETS.find(({ label }) => label === 'Overnight');
  const failures = overviewTextFailures({ size: narrow455, state: 'Overnight', head: overnight.head,
    range: overnight.range, reading: overview455({
      caption: [['OVERNIGHT 00:00–06:00', 122, 25, 125], [NOTICE455, 122, 39, 250]],
      pads: [[110, 23, 140, 14], [117, 37, 260, 14]] }) });
  assert.deepEqual(failures, ['832×720 Overnight: caption pad box 1 straddles the window\'s 06:00 gate by 3.83px']);
});

test('S183 fails once, naming failures at two sizes', () => {
  const parked = () => overview455({
    caption: [['24 H 00:00–24:00', 356, 25, 107], [`  ·  ${NOTICE455}`, 463, 25, 232]] });
  assert.throws(() => assertOverviewText([
    check455(parked()), { ...check455(parked()), size: { width: 832, height: 560 } }, check455(wrapped455()),
  ]), error => {
    assert.match(error.message, /^S183 the glucose overview's text must stay whole, inside the chart and unstruck at every size; 8 failures:/);
    assert.match(error.message, /\n {2}- 832×720 24 h: caption span "24 H 00:00–24:00" reaches 61px past #chart's right edge/);
    assert.match(error.message, /\n {2}- 832×560 24 h: caption span "24 H 00:00–24:00" reaches 61px past #chart's right edge/);
    return true;
  });
  assert.doesNotThrow(() => assertOverviewText([check455(wrapped455())]));
});

// #455: fake readings of the Spotlight at the narrowest split: a 381×260 chart
// with the Keep control in its top-right corner. `verdict` lists the verdict's
// lines as [text, x, y, width]; the tally line stands at `tallyTop`.
function spotlight455({ verdict, tallyTop = 38, keep = { x: 345, y: 6, width: 22, height: 22 } }) {
  return {
    width: 381, height: 260, keep, pads: [],
    spans: [
      ...verdict.map(([text, x, y, width]) => span455(0, text, x, y, width, 11)),
      span455(1, '30 steady nights · 20 more · 0 less · 10 as set · 3 excluded', 14, tallyTop, 320),
    ],
  };
}
const twoLines455 = [['SUPPORTED · 0.70 U/h · (0.70–0.70)', 14, 8, 230], ['programmed now 0.60', 14, 22, 130]];

test('S184 passes a verdict broken between facts, inside the chart, with the tally below it', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455, reading: spotlight455({ verdict: twoLines455 }) }), []);
  assert.deepEqual(spotlightVerdictFailures({ size: { width: 1200, height: 736 }, oneLine: true,
    reading: spotlight455({ verdict: [['SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60', 14, 8, 300]],
      tallyTop: 24 }) }), []);
});

test('S184 fails the rate past the chart\'s edge and under the Keep control', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455, reading: spotlight455({
    verdict: [['SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60', 14, 8, 390]], tallyTop: 24 }) }), [
    '832×720: verdict span "SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60" lies 23px outside the Spotlight '
      + 'chart\'s 381×260 box',
    '832×720: verdict span "SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60" runs 22px under the Keep control',
  ]);
});

test('S184 fails the rate under the Keep control inside the chart', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455, reading: spotlight455({
    verdict: [['SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60', 14, 8, 335]], tallyTop: 24 }) }), [
    '832×720: verdict span "SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now 0.60" runs 4px under the Keep control',
  ]);
});

test('S184 fails a line break inside a fact', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455, reading: spotlight455({
    verdict: [['SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now', 14, 8, 300], ['0.60', 14, 22, 30]] }) }),
  ['832×720: a line break falls inside a fact, after "now"']);
});

test('S184 fails a tally overlapping the verdict', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455,
    reading: spotlight455({ verdict: twoLines455, tallyTop: 24 }) }),
  ['832×720: the tally line starts 9px above the verdict\'s last line ends']);
});

test('S184 fails a missing verdict group, and a wrapped verdict where one line must hold', () => {
  assert.deepEqual(spotlightVerdictFailures({ size: narrow455, reading: spotlight455({
    verdict: [['INSUFFICIENT EVIDENCE · 0.74 U/h', 14, 8, 200]] }) }),
  ['832×720: 0 painted lines begin with "SUPPORTED"; exactly one verdict must']);
  assert.deepEqual(spotlightVerdictFailures({ size: { width: 1200, height: 736 }, oneLine: true,
    reading: spotlight455({ verdict: twoLines455 }) }),
  ['1200×736: the verdict line stands on 2 lines; at this size it must stand on one']);
});

test('S184 fails once, naming failures at two sizes', () => {
  const past = () => spotlight455({ verdict: [['SUPPORTED · 0.70 U/h · (0.70–0.70) · programmed now', 14, 8, 300],
    ['0.60', 14, 22, 30]] });
  assert.throws(() => assertSpotlightVerdict([
    { size: narrow455, reading: past() }, { size: { width: 832, height: 560 }, reading: past() },
  ]), error => {
    assert.equal(error.message, 'S184 the Spotlight\'s verdict line must keep every fact whole inside the chart; '
      + '2 failures:\n  - 832×720: a line break falls inside a fact, after "now"\n'
      + '  - 832×560: a line break falls inside a fact, after "now"');
    return true;
  });
});

// #455: fake readings of the canvas header, each part as its box, clientWidth
// and scrollWidth. The default is the narrowest split's 402px header on one
// line, the title truncated to a letter and an ellipsis, the control's word hidden.
const part455 = (left, right, top, bottom, scrollWidth = right - left, shown = right > left) => ({
  left, right, top, bottom, width: right - left, clientWidth: right - left, scrollWidth, shown });
function head455(parts = {}) {
  const control = parts.control ?? part455(785, 820, 44, 66);
  return {
    head: part455(430, 832, 40, 70), title: part455(464, 504, 47, 63, 144),
    provenance: part455(516, 771, 48, 62), control,
    // what the reader sees of the control: its icon (and word), inside its box
    controlInk: { left: control.left + 4, right: control.right - 4, top: control.top + 4, bottom: control.bottom - 4 },
    word: part455(0, 0, 0, 0, 0, false), titleFont: 13, controlName: 'All charts', controlTitle: 'All charts',
    ...parts,
  };
}

test('S185 passes an 832 header with a truncated title, a whole provenance and a named icon-only control', () => {
  assert.deepEqual(canvasHeadFailures({ size: narrow455, narrow: true, reading: head455() }), []);
  assert.deepEqual(canvasHeadFailures({ size: { width: 1280, height: 720 }, narrow: false, reading: head455({
    title: part455(464, 608, 47, 63), word: part455(760, 810, 49, 61) }) }), []);
});

test('S185 fails a zero-width title at the narrowest split', () => {
  assert.deepEqual(canvasHeadFailures({ size: narrow455, narrow: true,
    reading: head455({ title: part455(464, 464, 47, 63, 144) }) }),
  ['832×720: the title\'s box is 0px wide, under twice its 13px type, so it cannot show a letter and an ellipsis '
    + '(title 0px box, clientWidth 0, scrollWidth 144; provenance 255px box, clientWidth 255, scrollWidth 255; '
    + 'control 35px box, clientWidth 35, scrollWidth 35; word 0px box, clientWidth 0, scrollWidth 0)']);
});

test('S185 fails a cut provenance', () => {
  const failures = canvasHeadFailures({ size: narrow455, narrow: true,
    reading: head455({ provenance: { ...part455(516, 716, 48, 62), scrollWidth: 255 } }) });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^832×720: the provenance is cut: it needs 255px and shows 200px \(title 40px box/);
});

test('S185 fails a wide header whose control hides its word', () => {
  const failures = canvasHeadFailures({ size: { width: 1024, height: 768 }, narrow: false,
    reading: head455({ title: part455(464, 608, 47, 63) }) });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /^1024×768: the All charts control's word does not render \(/);
});

test('S185 fails a header on two lines, and a control that loses its name', () => {
  const failures = canvasHeadFailures({ size: narrow455, narrow: true,
    reading: head455({ control: part455(785, 820, 50, 70), controlName: null }) });
  assert.equal(failures.length, 2);
  assert.match(failures[0], /^832×720: the title, provenance and control do not share one line; their centres differ by 5px/);
  assert.match(failures[1], /^832×720: the All charts control is named "null" with the tooltip "All charts"; both must be "All charts"/);
});

/* The shell's 36px button floor outranks the control's 20px height, so its
   transparent, borderless box overhangs the 30px rail by 3.5px above and 2.5px
   below while its icon and word sit inside the rail. The story places the
   control by what the reader sees of it. */
test('S185 passes a control whose box overhangs the rail while its icon and word sit inside it', () => {
  assert.deepEqual(canvasHeadFailures({ size: { width: 1280, height: 720 }, narrow: false, reading: head455({
    title: part455(464, 608, 47, 63), control: part455(744, 821, 36.5, 72.5), word: part455(764, 815, 48, 62),
    controlInk: { left: 748, right: 815, top: 48, bottom: 62 } }) }), []);
});

test('S185 fails a control whose icon runs outside the header, or which draws no icon or word', () => {
  const outside = canvasHeadFailures({ size: narrow455, narrow: true,
    reading: head455({ controlInk: { left: 789, right: 802, top: 37, bottom: 50 } }) });
  assert.equal(outside.length, 2);
  assert.match(outside[0], /^832×720: the All charts control's icon and word lie 3px outside the header's box \(/);
  assert.match(outside[1], /^832×720: the title, provenance and control do not share one line; their centres differ by 11.5px/);
  const blank = canvasHeadFailures({ size: narrow455, narrow: true, reading: head455({ controlInk: null }) });
  assert.equal(blank.length, 1);
  assert.match(blank[0], /^832×720: the All charts control draws no icon or word \(/);
});

test('S185 fails once, naming failures at two sizes', () => {
  const zero = () => head455({ title: part455(464, 464, 47, 63, 144) });
  assert.throws(() => assertCanvasHead([
    { size: narrow455, narrow: true, reading: zero() },
    { size: { width: 832, height: 560 }, narrow: true, reading: zero() },
    { size: { width: 1024, height: 768 }, narrow: false, reading: head455({ title: part455(464, 608, 47, 63),
      word: part455(760, 810, 49, 61) }) },
  ]), error => {
    assert.match(error.message, /^S185 the canvas header must keep its title, provenance and All charts control on one line; 2 failures:/);
    assert.match(error.message, /\n {2}- 832×720: the title's box is 0px wide/);
    assert.match(error.message, /\n {2}- 832×560: the title's box is 0px wide/);
    return true;
  });
});

/* #455 — A RESIZE'S RELAYOUT LANDS IN A LATER FRAME THAN THE RESIZE. The story
   reads again until the check holds, within a bound, and judges the last
   reading with the same check: a reading that never comes clean keeps every
   failure, and a page error is never taken for one. */
test('readSettled judges the first reading its check passes', async () => {
  const readings = [{ stale: true }, { stale: true }, { stale: false }];
  let reads = 0;
  const reading = await readSettled(async () => readings[reads++], r => (r.stale ? ['wide layout'] : []), 'settles');
  assert.deepEqual(reading, { stale: false });
  assert.equal(reads, 3);
});

test('readSettled keeps the last reading when the check never passes within its bound', async () => {
  let reads = 0;
  const reading = await readSettled(async () => ({ read: ++reads }), () => ['still wide'], 'never settles', 120);
  assert.ok(reads >= 2, `it read more than once (${reads})`);
  assert.equal(reading.read, reads, 'the last reading is the one judged');
});

test('readSettled rethrows a page error rather than judging it', async () => {
  await assert.rejects(readSettled(async () => { throw new Error('Target page closed'); }, () => [], 'page', 120),
    /Target page closed/);
});
