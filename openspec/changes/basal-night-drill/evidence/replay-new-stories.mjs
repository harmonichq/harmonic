// Runs the #291 additions from the revision replay against a supplied app
// server. The imported driver supplies deterministic synthetic API replies;
// BASE_URL supplies the built frontend under test, so base and revision never
// mix source trees. It writes one verdict per new story and fails closed.
//
// PLAYWRIGHT_MODULE=<playwright> REVISION_ROOT=<checkout> \
// BASE_URL=http://127.0.0.1:<port> PAYLOAD=<payload> \
// node replay-new-stories.mjs
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const need = (name) => process.env[name] || (() => { throw new Error(`${name} is required`); })();
const revisionRoot = resolve(need('REVISION_ROOT'));
const replay = await import(pathToFileURL(resolve(revisionRoot,
  'frontend/diagnose-workstation-behavior.replay.mjs')).href);
const { chromium } = createRequire(import.meta.url)(need('PLAYWRIGHT_MODULE'));
const frozenOnly = process.env.FROZEN_ONLY === '1';
const stories = replay.STORIES.filter(([id]) => frozenOnly ? !/^S13[3-8]$/.test(id) : /^S13[3-8]$/.test(id));
const expected = frozenOnly ? 151 : 6;
if (stories.length !== expected) throw new Error(`expected ${expected} stories, got ${stories.length}`);

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined });
const results = [];
try {
  for (const [id, story, state, options] of stories) {
    const page = await replay.openApp(browser, { state, ...(options || {}) });
    try {
      await story(page);
      results.push([id, 'pass', '']);
    } catch (error) {
      results.push([id, 'FAIL', error.message]);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
for (const [id, verdict, detail] of results) console.log(`${verdict === 'pass' ? '  ok' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`);
const failed = results.filter(([, verdict]) => verdict !== 'pass').length;
console.log(`\napp: ${results.length - failed} of ${results.length} stories passed`);
process.exitCode = failed ? 1 : 0;
