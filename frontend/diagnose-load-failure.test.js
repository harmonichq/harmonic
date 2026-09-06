import test from 'node:test';
import assert from 'node:assert/strict';
import { diagnoseLoadFailure } from './diagnose-load-failure.js';

const SERVER_MESSAGE = 'missing or invalid bearer token';

test('a rejected token is named as a token problem and routed to Settings', () => {
  const failure = diagnoseLoadFailure(
    Object.assign(new Error(SERVER_MESSAGE), { status: 401 }));
  assert.deepEqual(failure, {
    icon: 'lock',
    title: "Diagnose can't use this API token",
    body: 'This server rejected the token saved in this browser. Update it in Settings, then reload.',
    detail: null,
    action: 'settings',
  });
});

test("a server failure keeps the server's own message as detail under app copy", () => {
  const failure = diagnoseLoadFailure(
    Object.assign(new Error('internal server error'), { status: 500 }));
  assert.deepEqual(failure, {
    icon: null,
    title: "Diagnose couldn't read this server's evidence",
    body: 'The evidence request failed before Diagnose could read it.',
    detail: 'internal server error',
    action: 'retry',
  });
});

/* `showError`'s two internal callers pass a bare string, not an Error. */
test('a plain string cause is carried as detail and still offers a route out', () => {
  const failure = diagnoseLoadFailure('Diagnose is unavailable.');
  assert.equal(failure.detail, 'Diagnose is unavailable.');
  assert.equal(failure.action, 'retry');
  assert.equal(failure.icon, null);
});

test('a cause with no message still names a route out', () => {
  for (const cause of [undefined, null, '', new Error(''), {}]) {
    const failure = diagnoseLoadFailure(cause);
    assert.equal(failure.detail, null, `no detail invented for ${String(cause)}`);
    assert.equal(failure.action, 'retry');
    assert.ok(failure.title.length > 0 && failure.body.length > 0,
      'app copy is always present, whatever the cause');
  }
});

/* The whole point of the module: what the reader is told is app copy, decided by
   the status, never the sentence the server happened to send. */
test("the server's message is never promoted to the heading or the body", () => {
  for (const status of [401, 403, 404, 418, 500, 502, undefined]) {
    const failure = diagnoseLoadFailure(
      Object.assign(new Error(SERVER_MESSAGE), { status }));
    assert.notEqual(failure.title, SERVER_MESSAGE);
    assert.notEqual(failure.body, SERVER_MESSAGE);
  }
});

test('every failure names a route out, whatever the cause', () => {
  const causes = [
    Object.assign(new Error('unauthorized'), { status: 401 }),
    Object.assign(new Error('teapot'), { status: 418 }),
    Object.assign(new Error('gone'), { status: 404 }),
    new Error('network request failed'),
    'a bare string',
    null,
  ];
  for (const cause of causes) {
    const { action } = diagnoseLoadFailure(cause);
    assert.ok(action === 'settings' || action === 'retry',
      `expected a route out for ${String(cause)}, got ${String(action)}`);
  }
});

/* 401 is the whole token mapping: ciq_autotune/api.py's `require_token` is the
   only refusal in the tree and answers 401, so nothing else may claim the
   Settings route. */
test('only a 401 claims the Settings route', () => {
  for (const status of [400, 403, 404, 500]) {
    assert.equal(
      diagnoseLoadFailure(Object.assign(new Error('nope'), { status })).action,
      'retry', `status ${status} is not a token refusal`);
  }
});

test('a non-numeric status is not mistaken for a token refusal', () => {
  assert.equal(diagnoseLoadFailure(
    Object.assign(new Error('nope'), { status: '401' })).action, 'retry');
});
