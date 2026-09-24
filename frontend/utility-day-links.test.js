import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

// ADR 445 and ADR 444, through the carb utilities on a desktop desk (the 700px
// query does not match) with the desk's own router. No destination is
// installed, so the desk renders its unclaimed frame and issues no read of its
// own; the seated utility takes the reading pane, and the seat keeps the pane
// markup it wrote. The seat hands the utility's binding its Open Day controls,
// read off that markup, so a test can press one the way a reader does.
//
// The carbs and prompts reads are stubbed before the modules are imported,
// because data.js binds fetch once at import (the day.test.js pattern).
const ENTRY = { id: 41, t: '2024-06-26 13:55:00', grams: 30, certainty: 'exact', source: 'manual', note: null };
const PROMPT = { detector: 'low', anchor_t: '2024-06-26 13:55:00', age_days: 4, key_bg: 52,
  question: 'Did you eat before this low?', context: 'A low with no carbs logged near it.' };
function served(address) {
  const { pathname } = new URL(address, 'http://desk.test');
  if (pathname === '/api/carbs') return { carb_entries: [ENTRY] };
  if (pathname === '/api/prompts') return [PROMPT];
  throw new Error(`the utility test serves no ${address}`);
}
const unstubbed = globalThis.fetch;
globalThis.fetch = async (address) => ({ ok: true, json: async () => served(address) });
const { installUtilities, openUtility, reopenUtility } = await import('./utilities.js');
const { loading, navigate, render, startDesk, view } = await import('./routes.js');
const { parseRoute } = await import('./tab-routing.js');
const { clock, shortDate } = await import('./frame.js');
globalThis.fetch = unstubbed;

const HEADING = '.gf-utility header h2';
const OPEN_DAY = (identity) => `.gf-utility [data-action="day"][data-subject="${identity}"]`;
const QUESTION = 'question:low|2024-06-26 13:55:00';
// A moment as the pane prints it beside a utility's name.
const printed = (t) => `${shortDate(t)} ${clock(t)}`;

// Every focus request the desk is handed, in order. The router takes each one
// on the render that follows, so this log is how a test reads what was asked.
const requests = [];
let request = null;
Object.defineProperty(view, 'focusAfterRender', { configurable: true, enumerable: true,
  get: () => request, set: (value) => { request = value; if (value) requests.push(value); } });

const unescape = (text) => text.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const camel = (name) => name.replace(/-(\w)/g, (_, letter) => letter.toUpperCase());
const seat = {
  innerHTML: '', dataset: {}, pane: '', openDay: [],
  insertAdjacentHTML() {},
  querySelector(selector) {
    if (selector === '.gf-desk > .gf-reading') return reading;
    if (selector === '.gf-utility-strip') return { toggleAttribute() {} };
    return null;
  },
  querySelectorAll(selector) {
    if (selector !== '.gf-utility [data-action="day"][data-date]') return [];
    seat.openDay = [...seat.pane.matchAll(/<button[^>]*data-action="day"[^>]*>/g)].map(([tag]) => ({
      dataset: Object.fromEntries([...tag.matchAll(/data-([\w-]+)="([^"]*)"/g)]
        .map(([, name, value]) => [camel(name), unescape(value)])),
    }));
    return seat.openDay;
  },
};
const reading = { getAttribute: () => null, querySelector: () => null, set outerHTML(markup) { seat.pane = markup; } };

const listeners = {};
const location = { pathname: '/diagnose', search: '', hash: '' };
const goTo = (address) => {
  const url = new URL(address, 'http://desk.test');
  Object.assign(location, { pathname: url.pathname, search: url.search, hash: url.hash });
};
const browser = {
  location,
  history: { pushState: (_state, _title, address) => goTo(address), replaceState: (_state, _title, address) => goTo(address) },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener: (type, listener) => { listeners[type] = listener; },
};

// Every open read has landed and rendered.
async function arrived() {
  do await new Promise((resolve) => setImmediate(resolve)); while (loading());
}
// Escape closes a seated utility before anything else on the desk.
const closeUtility = () => listeners.keydown({ key: 'Escape' });

let seated = false;
async function onDesk(run) {
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { activeElement: null, querySelectorAll: () => [], querySelector: () => null };
  globalThis.window = browser;
  try {
    if (!seated) { seated = true; installUtilities({ glossary: [] }); startDesk(seat, { browser }); }
    await arrived();
    await run();
  } finally {
    Object.assign(globalThis, previous);
  }
}

test('#444 · the Log carbs header names the reader\'s local date beside the local time', async () => {
  const zone = process.env.TZ;
  process.env.TZ = 'America/Denver';
  // 22:45 local in Denver, after the UTC date has already turned over.
  mock.timers.enable({ apis: ['Date'], now: Date.parse('2024-06-30T04:45:05Z') });
  try {
    await onDesk(async () => {
      try {
        openUtility('carbs');
        await arrived();
        assert.match(seat.pane, /data-utility="carbs"/, 'premise: Log carbs is seated');
        assert.match(seat.pane, /<span class="meta">at Jun 29 · 22:45<\/span>/);
      } finally { closeUtility(); }
    });
  } finally {
    mock.timers.reset();
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  }
});

test('a reopened utility holds its identity until its items load, then asks for that item\'s Open Day, then its heading, once', async () => {
  await onDesk(async () => {
    try {
      requests.length = 0;
      reopenUtility('questions', QUESTION);
      render();
      assert.match(seat.pane, /data-utility="questions"/, 'premise: Carb questions is seated');
      assert.deepEqual(requests, [], 'a pane still reading its questions asked for focus');
      await arrived();
      assert.deepEqual(requests, [[OPEN_DAY(QUESTION), HEADING]],
        'the render that seats the loaded questions asks for that prompt\'s Open Day, then the heading');
      requests.length = 0;
      render();
      assert.deepEqual(requests, [], 'a later render asked a second time');
    } finally { closeUtility(); }
  });
});

test('each carb utility\'s Open Day writes a Day address that names its item, prints its label and carries no selector', async () => {
  await onDesk(async () => {
    try {
      for (const [kind, subject, title] of [
        ['carbs', 'carb:41', `Log carbs · ${printed(ENTRY.t)}`],
        ['questions', QUESTION, `Carb questions · ${printed(PROMPT.anchor_t)}`],
      ]) {
        navigate('diagnose');
        openUtility(kind);
        await arrived();
        assert.equal(seat.openDay.length, 1, `premise: ${kind} renders one Open Day control`);
        seat.openDay[0].onclick();
        assert.equal(location.pathname, '/day');
        assert.doesNotMatch(location.search, /%5B|\[/, `${kind}: the Day address carries a selector bracket`);
        assert.deepEqual(parseRoute(location).context, { date: '2024-06-26', subject, title, from: `diagnose.${kind}` });
        closeUtility();
      }
    } finally { navigate('diagnose'); }
  });
});

test('an identity the utility does not serve, an old link\'s display text and a crafted value ask only for the heading, once', async () => {
  await onDesk(async () => {
    try {
      for (const identity of ['carb:99', `Log carbs · ${printed(ENTRY.t)}`, 'carb:41"] , body [x="', QUESTION]) {
        requests.length = 0;
        reopenUtility('carbs', identity);
        render();
        assert.deepEqual(requests, [HEADING], `${identity}: the return asked for something other than the heading`);
        requests.length = 0;
        render();
        assert.deepEqual(requests, [], `${identity}: a later render asked a second time`);
        closeUtility();
      }
    } finally { navigate('diagnose'); }
  });
});
