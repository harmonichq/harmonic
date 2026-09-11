import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusEntry } from './focus-entry.js';

const offered = { key: 'served-pattern', subject: 'pattern:served-pattern', readiness: { count: 1, gate: 12, verdict: 'ready' } };
const source = { input_revision: 7, analysis_generation: 'served-generation' };
const roster = { input_revision: 7, admission: { focus_pin: { available: true } }, pinnable_patterns: [offered] };

test('pin uses the served canonical Pattern and never chooses its member or calculates admission', async () => {
  const writes = [];
  const entry = createFocusEntry({ readGuidance: async () => source, api: {
    fetchFocuses: async () => roster,
    pinFocus: async (...args) => { writes.push(args); return { id: 4, subject: offered.subject }; },
  } });
  await entry.read();
  assert.equal(entry.candidate(offered.subject), offered, 'served permission holds even with a count below the gate');
  assert.equal(entry.candidate('habit:invented'), null);
  assert.equal((await entry.start(offered.subject, { start_min: 720, end_min: 1080 })).id, 4);
  assert.equal(writes[0][0], null);
  assert.deepEqual(Object.keys(writes[0][1]).sort(), ['analysis_generation','input_revision','outcome_window','pattern_key','request_id','subject']);
  assert.equal(writes[0][1].pattern_key, offered.key);
  assert.equal(writes[0][1].subject, offered.subject);
  assert.deepEqual(writes[0][1].outcome_window, { start_min: 720, end_min: 1080 });
});

test('failed pin preserves identity for retry and never publishes success', async () => {
  const writes = [];
  const entry = createFocusEntry({ readGuidance: async () => source, api: {
    fetchFocuses: async () => roster, pinFocus: async (_, body) => {
      writes.push(body); if (writes.length === 1) throw new Error('Synthetic refusal');
      return { id: 4 };
    },
  } });
  await entry.read();
  assert.equal(await entry.start(offered.subject), null);
  assert.match(entry.state().failure.message, /Synthetic refusal/);
  assert.equal((await entry.start(offered.subject)).id, 4);
  assert.equal(writes[0].request_id, writes[1].request_id);
  assert.equal(entry.state().failure, null);
});

test('occupied admission and crossed source revisions grant no pin', async () => {
  for (const response of [ { ...roster, admission: { focus_pin: { available: false } } }, { ...roster, input_revision: 8 } ]) {
    let writes = 0;
    const entry = createFocusEntry({ readGuidance: async () => source, api: { fetchFocuses: async () => response, pinFocus: async () => { writes++; } } });
    await entry.read();
    assert.equal(entry.candidate(offered.subject), null);
    assert.equal(await entry.start(offered.subject), null);
    assert.equal(writes, 0);
  }
});

test('a collapsed case uses only the backend-published owner and chosen member', async () => {
  const g = { ...source, candidates: [{ subject: offered.subject, collapse: 'collapse_to_member', chosen_member: { subject: 'habit:served-lever' } }] };
  const entry = createFocusEntry({ readGuidance: async () => g, api: { fetchFocuses: async () => roster } });
  await entry.read();
  const selected = { subject: 'finding:served-lever', finding: { lever: 'served-lever' } };
  assert.equal(entry.forCase(selected), offered);
  assert.equal(entry.forCase(null), null, 'background responses have no explicit selected case');
  assert.equal(entry.forCase({ ...selected, finding: { lever: 'another-lever' } }), null);
  g.candidates[0].collapse = 'remain_pattern';
  assert.equal(entry.forCase(selected), null, 'the browser cannot invent collapse from a single matching member');
});
