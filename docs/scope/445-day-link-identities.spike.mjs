// Spike for #445 (triage evidence, not shipped). The identity grammar the Changes
// and carb-utility Day links carry, and the rules by which each owner resolves an
// identity from the address to its own control, as table tests. The address owner
// is the real frontend/tab-routing.js; the two resolvers are stand-ins for the
// rules the pinned design states, which the implementation places in the modules
// that render those controls.
//
//   node --test docs/scope/445-day-link-identities.spike.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, serializeRoute } from '../../frontend/tab-routing.js';

// A utility identity is built from a served item, never from display text.
const IDENTITY = {
  carbs: (entry) => `carb:${entry.id}`,
  questions: (prompt) => `question:${prompt.detector}|${prompt.anchor_t}`,
};
const UTILITY_HEADING = '.gf-utility header h2';

// The utility matches the identity its Day entry carried against what it serves
// now. Only a matched item's own identity ever becomes selector text.
function utilityReturn(kind, subject, served) {
  const match = served.find((item) => IDENTITY[kind](item) === subject);
  return match
    ? [`.gf-utility [data-action="day"][data-subject="${IDENTITY[kind](match)}"]`, UTILITY_HEADING]
    : [UTILITY_HEADING];
}

// Changes: a Day return is an arrival whose context came back from a Changes Day
// link (`from=changes`) carrying the date that link opened. Only a well-formed
// ISO date becomes selector text.
const READING_HEADING = '.gf-reading > header h2';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function changesReturn(context) {
  if (context.from !== 'changes' || !context.date) return null;
  return ISO_DATE.test(context.date) ? [`[data-day-date="${context.date}"]`, READING_HEADING] : [READING_HEADING];
}

const ENTRY = { id: 41, t: '2024-06-26 13:55:00' };
const PROMPT = { detector: 'low', anchor_t: '2024-06-26 13:55:00' };

test('both utility identities, beside the printed title, survive the real address owner', () => {
  for (const [kind, item, title, from] of [
    ['carbs', ENTRY, 'Log carbs · Jun 26 13:55', 'diagnose.carbs'],
    ['questions', PROMPT, 'Carb questions · Jun 26 13:55', 'changes.questions'],
  ]) {
    const context = { date: '2024-06-26', subject: IDENTITY[kind](item), title, from };
    const address = serializeRoute({ destination: 'day', context });
    assert.doesNotMatch(address, /%5B|\[/, `${kind}: the Day address carries no selector bracket`);
    assert.deepEqual(parseRoute({ pathname: '/day', search: address.slice(address.indexOf('?')) }).context, context);
  }
  assert.equal(IDENTITY.carbs(ENTRY), 'carb:41');
  assert.equal(IDENTITY.questions(PROMPT), 'question:low|2024-06-26 13:55:00');
});

test('a utility resolves a served identity to that item\'s own Open Day control', () => {
  assert.deepEqual(utilityReturn('carbs', 'carb:41', [{ id: 7 }, ENTRY]),
    ['.gf-utility [data-action="day"][data-subject="carb:41"]', UTILITY_HEADING]);
  assert.deepEqual(utilityReturn('questions', 'question:low|2024-06-26 13:55:00', [PROMPT]),
    ['.gf-utility [data-action="day"][data-subject="question:low|2024-06-26 13:55:00"]', UTILITY_HEADING]);
});

test('an identity that matches nothing served falls back to the utility heading, and never becomes selector text', () => {
  for (const [kind, subject, served] of [
    ['carbs', 'carb:41', []],                                          // removed while away
    ['carbs', 'Log carbs · Jun 26 13:55', [ENTRY]],                    // an old link's display-text subject
    ['carbs', 'carb:41"] , body [x="', [ENTRY]],                        // hostile address text
    ['questions', 'question:low|2024-06-26 13:55:00', []],             // answered and dropped
    ['questions', 'carb:41', [PROMPT]],                                // another utility's identity
  ]) assert.deepEqual(utilityReturn(kind, subject, served), [UTILITY_HEADING], `${kind} ${subject}`);
});

test('Changes resolves a returned date to its supporting-date control; anything else is its reading heading', () => {
  assert.deepEqual(changesReturn({ date: '2024-05-10', from: 'changes', occurrence: 'record:trial:t-1' }),
    ['[data-day-date="2024-05-10"]', READING_HEADING]);
  assert.deepEqual(changesReturn({ date: '2024-05-10"] , body [x="', from: 'changes' }), [READING_HEADING]);
  assert.deepEqual(changesReturn({ date: 'May 10', from: 'changes' }), [READING_HEADING]);
});

test('an arrival that is not a Changes Day return asks Changes for no return focus', () => {
  assert.equal(changesReturn({}), null);                                          // topbar
  assert.equal(changesReturn({ subject: 'plan' }), null);                         // Open Plan
  assert.equal(changesReturn({ subject: 'setting:basal_rate', from: 'diagnose', window: '180-210' }), null);
  assert.equal(changesReturn({ from: 'changes' }), null);                         // no date
});
