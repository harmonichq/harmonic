// Render every component story from the built Storybook in Chromium (#483).
//
//   node scripts/ui-stories.mjs check   the story prechecks, one test per story
//   node scripts/ui-stories.mjs shots   one PNG per story into frontend/ui/__shots__/
//   UI_STORY=<id part> narrows either to the matching story ids
//
// Both read frontend/ui/storybook-static (`npm run build-storybook`) and serve
// it from this process on a loopback port. Playwright comes from
// PLAYWRIGHT_MODULE, as the desk's browser legs take it; when that is unset the
// repo's own provisioner (scripts/ensure_browser_gate_env.py) supplies it.
// Either way a missing driver or build fails closed, naming what is missing.
//
// The prechecks, per story:
//   (a) no sentence or question in any visible text
//   (b) every visible word, and every accessible name, is in the allowlist that
//       frontend/ui/__fixtures__/ui-allowlist.json holds, built from the glossary
//   (c) every button declares its role and is that role's §4.1 height
//   (d) at most one primary-filled control
//   (e) every visible number sits in a [data-source] whose fixture field it equals
//   (f) nothing scrolls but a screen's page or pane ([data-scroll="page"])
// The rules themselves are frontend/ui/prechecks.js; this file gathers what
// they read from each rendered story.
//
// A story with a play function (Storybook tags it "play-fn") is checked after
// its play has run: the page traps the preview's channel before Storybook
// starts, so a play or story exception is caught however early it fires, and
// the render must settle as "finished". Storybook 10 settles a render as
// finished even when its play threw, so the channel's exceptions are what
// fail it. A play that throws, or a render that
// errors or never settles, fails that story's test.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { precheckProblems } from '../frontend/ui/prechecks.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC = join(ROOT, 'frontend/ui/storybook-static');
const SHOTS = join(ROOT, 'frontend/ui/__shots__');
const FIXTURES = JSON.parse(readFileSync(join(ROOT, 'frontend/ui/__fixtures__/ui-fixtures.json'), 'utf8'));
const ALLOWED = new Set(JSON.parse(readFileSync(join(ROOT, 'frontend/ui/__fixtures__/ui-allowlist.json'), 'utf8')).words);

const mode = process.argv[2];
if (mode !== 'check' && mode !== 'shots') {
  console.error('usage: node scripts/ui-stories.mjs check|shots');
  process.exit(2);
}

function chromium() {
  let module = process.env.PLAYWRIGHT_MODULE;
  if (!module) {
    const exports = execFileSync('python3', [join(ROOT, 'scripts/ensure_browser_gate_env.py')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    module = /PLAYWRIGHT_MODULE=['"]?([^'"\n]+)/.exec(exports)?.[1];
    if (!module) throw new Error('PLAYWRIGHT_MODULE is unset and ensure_browser_gate_env.py did not export it');
  }
  return createRequire(import.meta.url)(module).chromium;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    const file = join(STATIC, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(STATIC) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(server)));
}

// What the prechecks read, gathered in the page. They read the render as it
// rests: anything still moving in (a popover a play has just opened, growing
// out of its arrow) is first finished where it will settle. The skeleton's
// endless shimmer has no end to finish at, and moves nothing it is measured by.
function inspect() {
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
  const primary = (() => {
    const probe = document.createElement('i');
    probe.style.background = 'var(--primary)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  })();
  const shot = document.querySelector('[data-shot]');
  const texts = [];
  const walker = document.createTreeWalker(shot, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const element = node.parentElement;
    if (!text || !element.checkVisibility({ visibilityProperty: true })) continue;
    const sourced = element.closest('[data-source]');
    texts.push({ text, source: sourced?.dataset.source ?? null, format: sourced?.dataset.format ?? null,
      axis: Boolean(element.closest('[data-axis]')), glossary: Boolean(element.closest('.glossary')) });
  }
  const names = [...shot.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'));
  const buttons = [...shot.querySelectorAll('button')].map((button) => ({
    role: button.dataset.role ?? null,
    height: button.getBoundingClientRect().height,
    label: button.textContent.trim() || button.getAttribute('aria-label'),
  }));
  const controls = [...shot.querySelectorAll('button, a, input, select, [role="button"]')];
  const primaries = controls.filter((control) => control.dataset.role === 'primary'
    || getComputedStyle(control).backgroundColor === primary).length;
  // §2.3 ban 6: only a screen's page or a desktop pane may scroll.
  const scrolls = [...shot.querySelectorAll('*')]
    .filter((element) => !element.matches('[data-scroll="page"]'))
    .filter((element) => {
      const style = getComputedStyle(element);
      return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
    })
    .map((element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`);
  return { texts, names, buttons, primaries, scrolls };
}

for (const [what, path] of [['the built Storybook (npm run build-storybook)', join(STATIC, 'index.json')]]) {
  if (!existsSync(path)) {
    console.error(`missing ${what}: ${path}`);
    process.exit(1);
  }
}
// UI_STORY narrows a run to the story ids containing it, for iterating on one
// component; the full run leaves it unset.
const only = process.env.UI_STORY;
const stories = Object.values(JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries)
  .filter((entry) => entry.type === 'story' && (!only || entry.id.includes(only)));
if (stories.length === 0) {
  console.error('the built Storybook indexes no stories');
  process.exit(1);
}

const plays = stories.filter((entry) => entry.tags?.includes('play-fn')).length;
console.log(`${stories.length} stories, ${plays} with a play function`);

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium().launch();

// Before Storybook loads: catch the channel as it is assigned and record every
// exception a story or its play function reports on it.
function trapChannel() {
  window.__uiStoryErrors = [];
  let channel;
  Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
    configurable: true,
    get: () => channel,
    set: (value) => {
      channel = value;
      for (const event of ['playFunctionThrewException', 'storyThrewException', 'storyErrored']) {
        value.on(event, (error) => window.__uiStoryErrors.push(`${event}: ${error?.message ?? error?.title ?? JSON.stringify(error)}`));
      }
    },
  });
}

async function render(page, id) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(trapChannel);
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.waitForSelector('[data-shot]');
  const phase = await page.waitForFunction(() => {
    const done = ['finished', 'completed', 'errored', 'aborted'];
    const current = window.__STORYBOOK_PREVIEW__?.currentRender?.phase;
    return done.includes(current) ? current : null;
  }, null, { timeout: 15000 }).then((handle) => handle.jsonValue());
  if (phase !== 'finished' && phase !== 'completed') errors.push(`the story's render ended ${phase}`);
  errors.push(...await page.evaluate(() => window.__uiStoryErrors));
  await page.evaluate(() => document.fonts.ready);
  return errors;
}

if (mode === 'check') {
  test.after(async () => {
    await browser.close();
    server.close();
  });
  for (const story of stories) {
    test(`${story.title} / ${story.name}`, async () => {
      const page = await browser.newPage();
      try {
        const errors = await render(page, story.id);
        assert.deepEqual(errors, [], 'the story threw');
        assert.deepEqual(precheckProblems(await page.evaluate(inspect), { fixtures: FIXTURES, allowed: ALLOWED }), []);
      } finally {
        await page.close();
      }
    });
  }
} else {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  try {
    for (const story of stories) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
      const errors = await render(page, story.id);
      if (errors.length) throw new Error(`${story.id} threw: ${errors.join('; ')}`);
      await page.locator('[data-shot]').screenshot({ path: join(SHOTS, `${story.id}.png`), animations: 'disabled' });
      await page.close();
    }
    console.log(`${stories.length} screenshots in ${SHOTS}`);
  } finally {
    await browser.close();
    server.close();
  }
}
