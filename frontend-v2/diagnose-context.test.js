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

test('Day carries canonical subject, opaque occurrence, moment and source window', () => {
  assert.deepEqual(evidenceDayContext({
    occurrence: { id: 'opaque-7', anchor: { t: '2024-06-01 08:12:00' } },
    selected: { subject: 'pattern:served', occurrence: 'opaque-7', window: { start_min: 360, end_min: 720 } },
    focus: '.occ-foot button:last-child',
  }), { date: '2024-06-01', moment: '2024-06-01 08:12:00', subject: 'pattern:served', occurrence: 'opaque-7',
    window: '360-720', lever: '', from: 'diagnose', focus: '.occ-foot button:last-child' });
  const night = evidenceDayContext({ occurrence: { t: '2024-06-01 03:00:00' }, slot: { start: 180, end: 210 }, focus: '#crumb-trail' });
  assert.equal(night.subject, 'basal:180');
  assert.equal(night.occurrence, '2024-06-01');
});

test('the Day return keeps moment and evidence coordinates through the shared router', async () => {
  const { dayReturnContext } = await import('./day.js');
  const { parseV2Route, serializeV2Route } = await import('../frontend/tab-routing.js');
  const entry = { key: 'private-memory-key', date: '2024-06-01', moment: '2024-06-01 08:12:00',
    subject: 'pattern:served', occurrence: 'opaque-7', window: '360-720', lever: 'served-lever', from: 'diagnose', focus: '.occ-foot button:last-child' };
  const context = dayReturnContext(entry);
  const address = serializeV2Route({ destination: 'diagnose', context });
  assert.deepEqual(parseV2Route({ search: address.slice(address.indexOf('?')) }).context, context);
  assert.equal(context.moment, entry.moment);
  assert.equal(Object.hasOwn(context, 'key'), false);
});
