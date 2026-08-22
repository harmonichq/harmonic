import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, resolveRoute, serializeRoute } from './url-state.js';

const parse = (path) => parseRoute(`http://example.test${path}`);
test('all six canonical paths parse as pending routes', () => {
  for (const page of ['day', 'diagnose', 'verify', 'plan', 'settings', 'guide']) {
    assert.equal(parse(`/app/${page}`).kind, 'PendingRoute');
  }
});
test('root is the one legacy redirect and canonical queries serialize byte-stably', () => {
  assert.deepEqual(parse('/?old=state#day'), { kind: 'LegacyRedirect', address: '/?old=state#day', to: '/app/diagnose' });
  const route = parse('/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=abc');
  assert.equal(serializeRoute(route), '/app/diagnose?finding=f1&factor=ic.day&start_min=720&end_min=60&projection=event&occ=abc');
});
test('all invalid classes stop atomically', () => {
  for (const path of ['/app/day#x', '/app/plan?x=1', '/app/day?date=', '/app/day?date=2026-02-30',
    '/app/diagnose?start_min=60&start_min=60&end_min=120', '/app/diagnose?view=glucose',
    '/app/diagnose?finding=x&factor=ic.day&projection=clock', '/app/guide?article=start-here&article=x',
    '/app/day?date=2026-01-01&x=1']) assert.equal(parse(path).kind, 'InvalidRoute', path);
});
test('resolution inserts defaults and rejects unresolved membership', () => {
  const day = resolveRoute(parse('/app/day'), { day: () => ({ date: '2026-07-15' }) });
  assert.equal(serializeRoute(day), '/app/day?date=2026-07-15');
  assert.equal(resolveRoute(parse('/app/verify?trial=nope'), { verify: () => ({ invalid: true }) }).kind, 'InvalidRoute');
});
