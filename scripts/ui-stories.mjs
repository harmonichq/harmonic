// Render every component story from the built Storybook in Chromium (#483).
//
//   node scripts/ui-stories.mjs check   the story prechecks, one test per story
//   node scripts/ui-stories.mjs shots   one PNG per story into frontend/ui/__shots__/
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
// The rules themselves are frontend/ui/prechecks.js; this file gathers what
// they read from each rendered story.
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

// What the prechecks read, gathered in the page.
function inspect() {
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
    texts.push({ text, source: element.closest('[data-source]')?.dataset.source ?? null });
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
  return { texts, names, buttons, primaries };
}

for (const [what, path] of [['the built Storybook (npm run build-storybook)', join(STATIC, 'index.json')]]) {
  if (!existsSync(path)) {
    console.error(`missing ${what}: ${path}`);
    process.exit(1);
  }
}
const stories = Object.values(JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries)
  .filter((entry) => entry.type === 'story');
if (stories.length === 0) {
  console.error('the built Storybook indexes no stories');
  process.exit(1);
}

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium().launch();

async function render(page, id) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.waitForSelector('[data-shot]');
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
