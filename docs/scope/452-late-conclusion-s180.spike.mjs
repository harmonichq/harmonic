// #452 spike: replay story S180 and the fake page its node tests drive. Not
// shipped code; the implementation ports the story body into
// frontend/c4.replay.mjs (C4_STORIES.S180, using that module's own `read`) and
// the fake page and its tests into frontend/c4.replay.test.js.
// Run: node --test docs/scope/452-late-conclusion-s180.spike.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// c4.replay.mjs's served-read helper, same semantics.
const read = async (page, path, params = {}) => {
  const url = new URL(path, page.url());
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await page.request.get(url.href, { timeout: 30000 });
  assert.equal(response.status(), 200, `${path}: ${await response.text()}`);
  return response.json();
};

const CONCLUSION_POST = /\/api\/verify\/trials\/[^/]+\/conclusion$/;

// S180 on c4-isf. The carry-over from one expired Trial into ANOTHER is proved
// at node level (frontend/follow-up-lifecycle.test.js): no committed case store
// serves two expired Trials, so the replay proves the same rule on the one
// record c4-isf serves — leaving it for the roster and reopening it.
async function S180(page) {
  await page.goto(new URL('/?to=changes&subject=history', page.url()).href);
  await page.locator('table.gf-table').waitFor({ timeout: 30000 });
  const roster = await read(page, '/api/verify/trials');
  const expired = (roster.trials || []).filter(row => row.ending?.kind === 'expired_unreviewed');
  assert.ok(expired.length >= 1, 'S180 premise: the store serves an expired Trial');
  const { id } = expired[0];
  const record = await read(page, '/api/verify/trials', { kind: 'trial', selected: id });
  assert.notEqual(record.selected.original.late_conclusion?.state, 'available',
    'S180 premise: the expired Trial has no later conclusion saved');

  const row = page.locator(`table.gf-table [data-record="trial:${id}"]`);
  const form = page.locator('[data-form="late-conclusion"]');
  const field = page.locator('#late-conclusion-conclusion');
  await row.click();
  await form.waitFor({ timeout: 30000 });

  // The first save is refused by a routed synthetic answer, so nothing reaches
  // the store; its request id is recorded from the routed request.
  const refused = [];
  const refuse = async route => {
    refused.push(route.request().postDataJSON());
    await route.fulfill({ status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: 'Synthetic refusal' }) });
  };
  await page.route(CONCLUSION_POST, refuse);
  try {
    await field.fill('Synthetic observation typed before leaving');
    await form.locator('[type="submit"]').click();
    await page.locator('[data-save-error="conclude"]').waitFor({ timeout: 30000 });
  } finally { await page.unroute(CONCLUSION_POST, refuse); }
  assert.equal(refused.length, 1, 'S180 premise: the routed save must be sent once and refused');

  await page.locator('[data-record-close]').click();
  await page.locator('table.gf-table').waitFor({ timeout: 30000 });
  await row.click();
  await form.waitFor({ timeout: 30000 });
  assert.equal(await field.inputValue(), '',
    'S180 reopening the record from the roster must start its later conclusion empty');
  assert.equal(await page.locator('[data-save-error]').count(), 0,
    'S180 reopening the record must carry no failed save');

  const posted = [];
  const listener = request => {
    if (request.method() === 'POST' && CONCLUSION_POST.test(new URL(request.url()).pathname)) {
      posted.push(request.postDataJSON());
    }
  };
  page.on('request', listener);
  try {
    await field.fill('Synthetic observation recorded after reopening');
    await form.locator('[type="submit"]').click();
    await page.locator('[data-late-conclusion="available"]').waitFor({ timeout: 30000 });
  } finally { page.off('request', listener); }
  assert.equal(posted.length, 1, 'S180 the next save must be sent once');
  assert.notEqual(posted[0].request_id, refused[0].request_id,
    'S180 the next save must send a request id of its own');
  assert.equal(await page.locator('[data-late-conclusion-text]').innerText(),
    'Synthetic observation recorded after reopening', 'S180 the next save must record the later conclusion');
}

// A fake of the record destination's page: one expired Trial on the roster.
// `carries` names what a reopen keeps, as the base app does: the typed text,
// the failed save and the request id.
function fakeRecordPage({ carries = [] } = {}) {
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
  await S180(fakeRecordPage());
});

test('S180 fails at its feature assertion when a reopened record keeps the typed words', async () => {
  await assert.rejects(S180(fakeRecordPage({ carries: ['text', 'failure', 'attempt'] })),
    /S180 reopening the record from the roster must start its later conclusion empty/);
});

test('S180 fails when a reopened record keeps only the failed save', async () => {
  await assert.rejects(S180(fakeRecordPage({ carries: ['failure'] })),
    /S180 reopening the record must carry no failed save/);
});

test('S180 fails when the next save reuses the refused request id', async () => {
  await assert.rejects(S180(fakeRecordPage({ carries: ['attempt'] })),
    /S180 the next save must send a request id of its own/);
});
