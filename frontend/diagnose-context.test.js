import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaseContext, evidenceDayContext } from './diagnose-context.js';

test('tile loads, failed replacements and late responses do not choose a drill subject', async () => {
  const pending = [];
  const context = createCaseContext(coordinates => new Promise((resolve, reject) => pending.push({ coordinates, resolve, reject })));
  const a = { finding_id: 'pattern:served-a', projection_id: 'p' };
  const b = { finding_id: 'pattern:served-b', projection_id: 'p' };
  const result = c => ({ finding: { id: c.finding_id }, projection_id: 'p', selection: { state: 'none', requested_id: null }, window: { start_min: 0, end_min: 360 } });
  const background = context.load(a); pending.shift().resolve(result(a)); await background;
  assert.equal(context.current(), null);
  context.select(a.finding_id); const late = context.load(a);
  context.select(b.finding_id); const failed = context.load(b);
  pending.pop().reject(new Error('synthetic refusal'));
  await assert.rejects(failed, /synthetic refusal/);
  pending.shift().resolve(result(a)); await late;
  assert.equal(context.current(), null);
  const good = context.load(b); const served = result(b); pending.shift().resolve(served);
  assert.equal(await good, served, 'delegation preserves the served object');
  assert.equal(context.current().subject, b.finding_id);
});

// ADR 428 points 4 and 5: the Day entry reads subject, Occurrence and window
// from the one case the workstation publishes, and names its return target by
// that Occurrence — no CSS selector travels in it. Its title is the served
// finding title the workstation publishes with that case (ADR 426).
test('Day carries the published case, its served title, the Occurrence\'s own moment and lever, and no selector', () => {
  const context = evidenceDayContext({
    occurrence: { id: 'opaque-7', anchor: { t: '2024-06-01 08:12:00' }, cause_lever: 'late_bolus' },
    current: { subject: 'pattern:served', occurrence: 'opaque-7', window: '360-720', title: 'Highs after meals' },
  });
  assert.deepEqual(context, { date: '2024-06-01', moment: '2024-06-01 08:12:00', subject: 'pattern:served',
    title: 'Highs after meals', occurrence: 'opaque-7', window: '360-720', lever: 'late_bolus', from: 'diagnose' });
  assert.equal(Object.hasOwn(context, 'focus'), false, 'the return target is the Occurrence id, never a selector');
  // A case published before its file answers carries no title yet, so Day
  // names the way back instead (ADR 426 3.2), never the routing subject.
  const early = evidenceDayContext({ occurrence: { id: 'o-2', t: '2024-06-01 09:00:00' },
    current: { subject: 'finding:late_bolus', occurrence: 'o-2', window: '360-720', title: null } });
  assert.equal(early.title, '');
  // A basal slot has no case file to name it, so the door names the setting
  // and the half-hour range in the wearer's words (CONTEXT.md, Slot).
  const night = evidenceDayContext({ occurrence: { t: '2024-06-01 03:00:00', cause_lever: 'basal_rate' },
    current: { subject: 'basal:180', occurrence: '2024-06-01', window: '180-210', title: null } });
  assert.equal(night.subject, 'basal:180');
  assert.equal(night.title, 'Basal · 03:00–03:30');
  assert.equal(night.occurrence, '2024-06-01');
  assert.equal(night.window, '180-210');
  assert.equal(night.lever, 'basal_rate');
});

test('the Day return keeps moment, title and evidence coordinates through the shared router', async () => {
  const { dayReturnContext } = await import('./day.js');
  const { parseRoute, serializeRoute } = await import('./tab-routing.js');
  const entry = { key: 'private-memory-key', date: '2024-06-01', moment: '2024-06-01 08:12:00',
    subject: 'pattern:served', title: 'Highs after meals', occurrence: 'opaque-7', window: '360-720', lever: 'served-lever', from: 'diagnose' };
  const context = dayReturnContext(entry);
  const address = serializeRoute({ destination: 'diagnose', context });
  assert.deepEqual(parseRoute({ search: address.slice(address.indexOf('?')) }).context, context);
  assert.equal(context.moment, entry.moment);
  assert.equal(Object.hasOwn(context, 'key'), false);
});
