// Render the Verify workstation's trial ribbon on one synthetic Trial, at
// either tint setting, from any checkout — the #317 ribbon ruling's evidence
// of record. Neither committed synthetic database carries a Trial, so the app
// is answered from the Verify gate's fixture payload through the same request
// stub `frontend/verify-660-story-behavior.replay.mjs` uses (TARGET=app), and
// the ribbon's two soft tints are switched by rewriting the served
// `verify-workstation.js` in flight, which is what lets one checkout render
// both settings and the base checkout render the sanctioned one.
//
//   PLAYWRIGHT_MODULE=<playwright dir> VENDOR_DIR=<echarts+vue dir> \
//   FRONTEND_ROOT=<checkout> RIBBON=32/18|20/20 OUT=<png> \
//   [PAYLOAD=<payload.json>] [VIEWPORT=1440x900] [STATE=complete] [TRIAL=<label substring>] \
//   node openspec/changes/graphite-palette/evidence/verify-trial-opener.mjs
//
// FRONTEND_ROOT names the checkout whose `frontend/` is served; PAYLOAD
// defaults to that checkout's `mockups/verify-660-story.synthetic/payload.json`.
// RIBBON is `<accent>/<muted>`: the percentage of `--mk-primary` mixed into the
// Trial ribbon and of `--mk-muted` into the Before ribbon. TRIAL picks a Trial
// other than the one the state opens on, by a substring of its picker label
// (`Profile` selects the fixture's profile Trial, the one whose Before and
// Trial medians diverge enough to give the ribbon an area). The script fails
// closed: a missing driver, vendored asset, payload, or a served module whose
// mix line no longer matches the pattern below exits nonzero naming it.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.svg': 'image/svg+xml' };

const fail = (msg) => { console.error(`verify-trial-opener: ${msg}`); process.exit(1); };
const env = (name) => process.env[name] || fail(`${name} is required`);

const ROOT = resolve(env('FRONTEND_ROOT'));
const OUT = env('OUT');
const ribbon = env('RIBBON').match(/^(\d{1,2})\/(\d{1,2})$/) || fail('RIBBON must be <accent>/<muted>, e.g. 32/18 or 20/20');
const [accentPct, mutedPct] = [ribbon[1], ribbon[2]];
const payloadPath = process.env.PAYLOAD || join(ROOT, 'mockups/verify-660-story.synthetic/payload.json');
const [vw, vh] = (process.env.VIEWPORT || '1440x900').split('x').map(Number);
const state = process.env.STATE || 'complete';
const trial = process.env.TRIAL || null;

// The shipped mix line, whatever percentages the checkout carries.
const MIX_LINE = /accentSoft: mix\(v\('--mk-primary'\), \d+\), mutedSoft: mix\(v\('--mk-muted'\), \d+\)/;

const { chromium } = require(env('PLAYWRIGHT_MODULE'));
const vendored = (name) => readFile(join(env('VENDOR_DIR'), name));
const payload = JSON.parse(await readFile(payloadPath, 'utf8').catch(() => fail(`payload unreadable: ${payloadPath}`)));

const apiPattern = (path) => new RegExp(`^/api${path}`);
const STUBS = [
  [apiPattern('/verify/trials'), (url) => {
    const id = url.searchParams.get('selected');
    if (!id) return payload.roster;
    return payload.details[id] || fail(`payload has no detail for ${id}`);
  }],
  [apiPattern('/status'), () => ({ ok: true, last_fetch: null, counts: {} })],
  [apiPattern('/plan/history'), () => ({ history: [] })],
  [apiPattern('/plan'), () => ({ items: [], updated_at: null })],
  [apiPattern('/analyze'), () => payload.analyze || { slots: [] }],
  [apiPattern('/scenarios'), () => ({ scenarios: [] })],
  [apiPattern('/explore/'), () => ({})],
  [apiPattern('/catalog'), () => ({ articles: [] })],
  [apiPattern('/carbs'), () => ({ entries: [] })],
  [apiPattern('/prompts'), () => ({ prompts: [] })],
  [apiPattern('/credentials'), () => ({ configured: true })],
  [apiPattern('/audit/dismissals'), () => ({ dismissed: [] })],
  [apiPattern('/outcomes'), () => ({ points: [] })],
  [apiPattern('/timeline'), () => ({ events: [] })],
  [apiPattern('/backtest'), () => ({ folds: [] })],
  [apiPattern('/model'), () => ({ entries: [] })],
  [apiPattern('/day'), () => ({ days: [] })],
  [apiPattern('/pump'), () => ({ settings: {} })],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e}`));
await page.addInitScript(() => localStorage.setItem('ciq_token', 'trial-opener'));
let rewrote = false;
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  const path = url.pathname;
  if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
  if (url.href.includes('echarts')) return route.fulfill({ body: await vendored('echarts.min.js'), contentType: 'text/javascript' });
  if (url.href.includes('vue')) return route.fulfill({ body: await vendored('vue.esm-browser.js'), contentType: 'text/javascript' });
  if (path === '/' || path === '/verify') return route.fulfill({ body: await readFile(join(ROOT, 'frontend/index.html')), contentType: 'text/html' });
  if (/\.(js|css|svg|html)$/.test(path)) {
    const file = join(ROOT, 'frontend', path.replace(/^\/assets\//, ''));
    try {
      let body = await readFile(file, 'utf8');
      if (path.endsWith('verify-workstation.js')) {
        if (!MIX_LINE.test(body)) fail(`${file} carries no ribbon mix line matching ${MIX_LINE}`);
        body = body.replace(MIX_LINE, `accentSoft: mix(v('--mk-primary'), ${accentPct}), mutedSoft: mix(v('--mk-muted'), ${mutedPct})`);
        rewrote = true;
      }
      return route.fulfill({ body, contentType: MIME[extname(path)] || 'text/plain' });
    } catch (e) { if (e?.code !== 'ENOENT') throw e; }
  }
  for (const [pattern, body] of STUBS) {
    if (pattern.test(path)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body(url)) });
  }
  problems.push(`unstubbed ${route.request().method()} ${path}`);
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'not stubbed' }) });
});

await page.goto(`http://app.local/verify?state=${encodeURIComponent(state)}`);
await page.waitForSelector('.vw .trial-line .subject', { timeout: 15000 }).catch(() => fail(`Verify never reached state ${state}`));
if (trial) {
  await page.click('.vw .trial-more');
  const pick = page.locator('.vw .trial-pop button', { hasText: trial });
  if (await pick.count() !== 1) fail(`TRIAL=${trial} matches ${await pick.count()} picker entries, not one`);
  await pick.click();
  await page.waitForFunction((t) => document.querySelector('.vw .trial-line .subject')?.textContent.includes(t), trial, { timeout: 5000 })
    .catch(() => fail(`Trial ${trial} never became the selected Trial`));
}
await page.waitForTimeout(1200);
if (!rewrote) fail('verify-workstation.js was never served, so the ribbon setting was not applied');
if (problems.length) fail(problems.join('\n'));
await page.screenshot({ path: OUT });
console.log(`verify-trial-opener: ${OUT} — ${ROOT} · ribbon ${accentPct}/${mutedPct} · ${vw}x${vh} · state ${state}${trial ? ` · trial ${trial}` : ''}`);
await browser.close();
