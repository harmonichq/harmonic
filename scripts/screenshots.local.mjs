#!/usr/bin/env node
/**
 * Repository-local screenshot wrapper around the canonical harness in
 * scripts/screenshots.mjs. It keeps extensions that cannot live there, so
 * that file stays minimal enough to audit at a glance.
 *
 * Usage:
 *   node scripts/screenshots.local.mjs <config.json>
 *   node scripts/screenshots.local.mjs --self-check [--out-dir <dir>]
 *
 * Config JSON schema:
 *   {
 *     "serveRoot": [ "<dir>", { "dir": "<dir>", "stripPrefix": "/prefix/" } ],
 *                                           // optional: serve http(s) requests from disk
 *     "defaults": { "storage": { ... }, "fetchStub": { ... } }, // optional shot defaults
 *     "shots": [
 *       {
 *         "url":       string,              // checkout-relative path, file:///abs/path, or http://...
 *         "theme":     "light" | "dark",    // sets data-theme on <html> after page load
 *         "out":       string,              // PNG output path (absolute or relative to cwd)
 *         "viewport":  { "width": N, "height": N },           // optional; defaults to 1280x900
 *         "settle":    number,              // optional extra ms wait before the shot
 *         "selector":  string,              // optional element crop instead of the viewport
 *         "clicks":    [ "<css-selector>", ... ],             // optional: click each in order after load
 *         "jsClicks":  [ "<css-selector>", ... ],             // optional direct DOM clicks
 *         "focus":     string,              // optional focus target before presses
 *         "presses":   [ "<key>", ... ],    // optional keys after focus
 *         "scrollTop": boolean,             // optional viewport reset before capture
 *         "storage":   { "<localStorage-key>": "<value>", ... }, // optional fixture boot state
 *         "fetchStub": { "<url-substr>": <json-value>, ... }, // optional per-shot stubs
 *         "fetchStubFiles": { "<url-substr>": { "file": "fixture.json",
 *                             "key": "nested.value" } }, // optional fixture-backed stubs
 *         "clock":     "<ISO-8601>",        // optional: pin Date.now() so relative ages don't move
 *         "assert": {                       // optional: checked after clicks/theme, fails the run
 *           "theme": { "selector": "<css>", "value": "<data-theme>",
 *                      "backgroundColor": "rgb(r, g, b)" },   // backgroundColor optional
 *           "noConsoleErrors": true,
 *           "ignoreConsole": [ "<substr>", ... ],   // optional: known-irrelevant console noise
 *           "noHorizontalOverflow": true | "<css-selector>"  // whole page, or one surface
 *         }
 *       }
 *     ]
 *   }
 *
 * Sandbox recipe baked in (headless Chromium under a sandboxed shell needs all of these):
 *   - --no-sandbox --disable-setuid-sandbox --single-process --allow-file-access-from-files
 *   - ONE context for ALL shots: --single-process browser dies on context.close()
 *   - fetch stubbed via addInitScript (page.route doesn't intercept file:// fetches)
 *   - theme set via page.evaluate AFTER content renders (before-boot sets race with the app)
 *   - Playwright's managed Chromium (avoids crashpad path and 104-char sockaddr_un limit)
 *   - no fullPage:true (composites onto white backdrop; fixed tall viewport instead)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'path';
import { pathToFileURL } from 'url';
import { execSync } from 'child_process';

// Flags that survive the Claude agent sandbox. Do NOT add --user-data-dir with a deep
// path — the worktree nesting pushes the socket name past the 104-char sockaddr_un limit.
// Playwright's managed browser picks its own short tempdir; we don't override it.
const CHROMIUM_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--single-process',
  '--allow-file-access-from-files',
];

function die(msg) {
  console.error('[screenshots] ' + msg);
  process.exit(1);
}

// Enrollment installs a pinned Playwright beside the drive-local-webapp skill. Prefer
// that reproducible project-local runtime; retain the older global locations so existing
// enrolled repositories keep working until they are re-enrolled.
function playwrightCandidates() {
  const candidates = [
    join(process.cwd(), '.agents', 'skills', 'drive-local-webapp',
      'node_modules', 'playwright', 'index.mjs'),
    'playwright',
  ];
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    if (globalRoot) candidates.push(join(globalRoot, 'playwright', 'index.mjs'));
  } catch {
    // npm not on PATH — fall through to the known fixed locations below.
  }
  candidates.push('/opt/homebrew/lib/node_modules/playwright/index.mjs');
  return candidates;
}

async function loadPlaywright() {
  const tried = [];
  for (const candidate of playwrightCandidates()) {
    try {
      const mod = await import(candidate);
      return mod.default || mod;
    } catch (e) {
      tried.push('  ' + candidate + '  (' + (e.code || e.message) + ')');
    }
  }
  die('Cannot load playwright. Tried:\n' + tried.join('\n') +
      '\nInstall Playwright where node can resolve it (a global install), or set NODE_PATH.');
}

/**
 * Build a single addInitScript payload that stubs fetch for every shot.
 * Each shot navigates to url?shot=<idx>, and the init script reads that index
 * to select the right stub map. This is keyed by index (not name) so no shot
 * URL needs more than one query param — Bash's static analyzer treats & as a
 * background-process operator and blocks commands that embed file://...?a=1&b=2.
 */
function fixtureValue(spec) {
  if (typeof spec === 'string') return JSON.parse(readFileSync(resolve(spec), 'utf8'));
  if (!spec || typeof spec.file !== 'string') die('fetchStubFiles entries need a file path');
  let value = JSON.parse(readFileSync(resolve(spec.file), 'utf8'));
  if (spec.key) {
    for (const key of spec.key.split('.')) value = value[key];
    if (value === undefined) die(`fetchStubFiles key ${spec.key} is absent from ${spec.file}`);
  }
  return value;
}

function buildInitScript(shots) {
  const stubMap = Object.fromEntries(
    shots.map((s, i) => [String(i), {
      ...(s.fetchStub || {}),
      ...Object.fromEntries(Object.entries(s.fetchStubFiles || {})
        .map(([url, spec]) => [url, fixtureValue(spec)])),
    }])
  );
  const storageMap = Object.fromEntries(
    shots.map((s, i) => [String(i), s.storage || {}])
  );
  // Optional pinned clock, same index keying. An app that words ages relative to Date.now()
  // otherwise renders a different string every run, so two captures of one state differ
  // where nothing changed. Only Date.now() is pinned — Date.parse and explicit timestamps
  // still work normally, which is all the relative-time helpers need.
  const clockMap = Object.fromEntries(
    shots.map((s, i) => [String(i), s.clock ? Date.parse(s.clock) : null])
  );
  return `(function () {
  var idx = new URLSearchParams(location.search).get('shot') || '0';
  var storageMap = ${JSON.stringify(storageMap)};
  var storage = storageMap[idx] || {};
  Object.keys(storage).forEach(function (key) {
    localStorage.setItem(key, String(storage[key]));
  });
  var clocks = ${JSON.stringify(clockMap)};
  var pinned = clocks[idx];
  if (pinned !== null && pinned !== undefined) Date.now = function () { return pinned; };
  var map = ${JSON.stringify(stubMap)};
  var stubs = map[idx] || {};
  var keys = Object.keys(stubs);
  if (!keys.length) return;
  var _fetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (url) {
    var s = String(url);
    for (var i = 0; i < keys.length; i++) {
      if (s.indexOf(keys[i]) !== -1) {
        return Promise.resolve(new Response(JSON.stringify(stubs[keys[i]]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }
    return _fetch ? _fetch.apply(window, arguments) : Promise.reject(new Error('fetch unavailable'));
  };
})();`;
}

/**
 * Append ?shot=<idx> to a URL so the init script picks the right fetch stub.
 * Uses & inside JS string concatenation (not a shell command), so the Bash
 * static analyzer never sees it. For file:// URLs with no existing query string,
 * the result is file:///path?shot=0 — a single param, no &.
 */
function withShotParam(url, idx) {
  return url.includes('?') ? url + '&shot=' + idx : url + '?shot=' + idx;
}

function resolveShotUrl(url) {
  if (typeof url !== 'string' || !url) die('Every shot must provide a non-empty "url"');
  return /^[a-z][a-z\d+.-]*:/i.test(url) ? url : pathToFileURL(resolve(url)).href;
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2' };

// Answer every http(s) request from disk. The URL path is checked under each root in
// order; a root can strip a public prefix before the on-disk lookup. Unmatched requests
// abort so a screenshot cannot silently succeed with an incomplete page.
async function serveFromDisk(page, roots) {
  const vendor = process.env.VENDOR_DIR;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (vendor && url.includes('echarts')) {
      return route.fulfill({ status: 200, body: readFileSync(join(vendor, 'echarts.min.js')),
        contentType: 'text/javascript' });
    }
    if (vendor && url.includes('vue')) {
      return route.fulfill({ status: 200, body: readFileSync(join(vendor, 'vue.esm-browser.js')),
        contentType: 'text/javascript' });
    }
    const path = decodeURIComponent(new URL(url).pathname);
    for (const root of roots) {
      const localPath = root.stripPrefix && path.startsWith(root.stripPrefix)
        ? path.slice(root.stripPrefix.length) : path;
      const file = join(root.dir, localPath);
      if (!existsSync(file)) continue;
      return route.fulfill({ status: 200, body: readFileSync(file),
        contentType: MIME[file.slice(file.lastIndexOf('.'))] || 'text/plain' });
    }
    return route.abort();
  });
}

/**
 * Opt-in per-shot checks, run after the clicks and the theme so they see the state the PNG
 * shows. A shot with no "assert" block is unchanged. Returns a list of failure strings.
 */
async function checkShot(page, shot, consoleErrors) {
  const want = shot.assert;
  if (!want) return [];
  const failures = [];

  if (want.theme) {
    const { selector, value, backgroundColor } = want.theme;
    const got = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      return { theme: el.getAttribute('data-theme'),
               background: getComputedStyle(el).backgroundColor };
    }, selector);
    if (!got) failures.push('theme: no element matched ' + selector);
    else if (got.theme !== value) {
      failures.push('theme: ' + selector + ' is ' + got.theme + ', wanted ' + value);
    } else if (backgroundColor && got.background !== backgroundColor) {
      failures.push('theme: ' + selector + ' painted ' + got.background +
                    ', wanted ' + backgroundColor);
    }
  }

  if (want.noConsoleErrors) {
    const ignore = want.ignoreConsole || [];
    const real = consoleErrors.filter((e) => !ignore.some((skip) => e.includes(skip)));
    if (real.length) failures.push('console: ' + real.join(' | '));
  }

  if (want.noHorizontalOverflow) {
    // `true` measures the whole page; a selector measures one surface, for a page whose
    // surrounding chrome has its own (out-of-scope) width floor.
    const selector = typeof want.noHorizontalOverflow === 'string'
      ? want.noHorizontalOverflow : null;
    const overflow = await page.evaluate((sel) => {
      const el = sel ? document.querySelector(sel) : document.documentElement;
      return el ? el.scrollWidth - el.clientWidth : null;
    }, selector);
    if (overflow === null) {
      failures.push('overflow: no element matched ' + selector);
    } else if (overflow > 0) {
      failures.push('overflow: ' + (selector || 'the page') + ' scrolls ' + overflow +
                    'px horizontally');
    }
  }

  return failures;
}

async function captureShots(shots, serveRoot) {
  const pw = await loadPlaywright();

  const browser = await pw.chromium.launch({ args: CHROMIUM_ARGS });

  // ONE context for all shots — do NOT call context.close() with --single-process:
  // the browser process dies immediately, terminating before screenshot writes flush.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  await context.addInitScript(buildInitScript(shots));
  const page = await context.newPage();
  if (serveRoot && serveRoot.length) await serveFromDisk(page, serveRoot);

  // Collected per shot (cleared at each navigation) for the opt-in noConsoleErrors check.
  let consoleErrors = [];
  page.on('console', (msg) => {
    // A failed subresource reports only "Failed to load resource: ..." as its text; the URL
    // that failed is in the location, so record both or an ignore list has nothing to match.
    if (msg.type() === 'error') {
      const where = (msg.location() && msg.location().url) || '';
      consoleErrors.push(where ? msg.text() + ' [' + where + ']' : msg.text());
    }
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const violations = [];

  for (let i = 0; i < shots.length; i++) {
    const { url, theme, out, viewport } = shots[i];

    // Optional per-shot viewport (e.g. a phone width) — defaults to the context
    // viewport when omitted, so existing single-size configs are unaffected.
    if (viewport) await page.setViewportSize(viewport);

    // Append the shot index so the init script selects the right fetch stub.
    consoleErrors = [];
    await page.goto(withShotParam(url, i), { waitUntil: 'networkidle' });

    // Optional interaction steps for screens that are only reached by clicking
    // (e.g. a Generate button, then opening a results card). Each entry is a CSS
    // selector; Playwright's click auto-waits for the element to be visible and
    // enabled. Omitted for static screens, so existing configs are unaffected.
    if (Array.isArray(shots[i].clicks)) {
      for (const selector of shots[i].clicks) {
        await page.click(selector);
        await page.waitForTimeout(200);
      }
    }

    if (Array.isArray(shots[i].jsClicks)) {
      for (const selector of shots[i].jsClicks) {
        await page.locator(selector).first().evaluate((el) => el.click());
        await page.waitForTimeout(200);
      }
    }
    if (shots[i].focus) await page.locator(shots[i].focus).first().focus();
    if (Array.isArray(shots[i].presses)) {
      for (const key of shots[i].presses) {
        await page.keyboard.press(key);
        await page.waitForTimeout(200);
      }
    }

    if (theme) {
      // Set theme AFTER content renders — setting it before boot races the app
      // initializer and the page silently stays light.
      await page.evaluate(function (t) {
        document.documentElement.dataset.theme = t;
        document.documentElement.classList.toggle('dark', t === 'dark');
        window.dispatchEvent(new Event('resize'));
      }, theme);
      // Brief settle so any theme-driven re-renders complete before the shot.
      await page.waitForTimeout(200);
    }

    // Optional extra settle for apps whose content arrives after a debounce or
    // a stubbed fetch (which doesn't register as network activity for
    // networkidle). Defaults to none, so existing configs are unaffected.
    if (shots[i].settle) await page.waitForTimeout(shots[i].settle);

    // A click scrolls its target into view; on a narrow viewport that can leave the page
    // scrolled sideways, so the shot would frame the wrong part of it. Always shoot from
    // the top-left.
    if (shots[i].scrollTop !== false) await page.evaluate(() => window.scrollTo(0, 0));

    const outPath = resolve(out);
    mkdirSync(dirname(outPath), { recursive: true });
    if (shots[i].selector) await page.locator(shots[i].selector).screenshot({ path: outPath });
    else await page.screenshot({ path: outPath });
    console.log('[screenshots] wrote ' + outPath + (theme ? ' (' + theme + ')' : ''));

    for (const failure of await checkShot(page, shots[i], consoleErrors)) {
      violations.push(out + ': ' + failure);
      console.error('[screenshots] FAIL ' + out + ': ' + failure);
    }
  }

  // Close the browser (not the context) — context.close() kills --single-process browsers.
  await browser.close();

  // Every PNG is written before anything fails, so the shots stay inspectable — but a run
  // whose assertions failed exits nonzero rather than handing back evidence that lies.
  if (violations.length) die(violations.length + ' assertion(s) failed');
}

async function selfCheck(outDir) {
  // Resolve to absolute up front: a relative --out-dir would otherwise produce
  // 'file://selfcheck.html' (no leading slash), an invalid URL that aborts goto.
  outDir = resolve(outDir || join(tmpdir(), 'af-selfcheck-' + Date.now()));
  mkdirSync(outDir, { recursive: true });

  const htmlPath = join(outDir, 'selfcheck.html');
  writeFileSync(htmlPath, [
    '<!DOCTYPE html>',
    '<html><head><meta charset="utf-8"></head>',
    '<body style="background:#00cc44;color:#000;font:48px monospace;padding:32px">',
    'screenshots harness self-check OK',
    '</body></html>',
  ].join('\n'));

  const outPng = join(outDir, 'selfcheck.png');
  // Self-check covers the three known failure modes:
  //   1. unwritable $HOME-adjacent dirs  → Playwright's managed browser uses its own tmpdir
  //   2. no npm at session time          → we import from PLAYWRIGHT_ESM, no npm install
  //   3. no crashpad                     → --no-sandbox/--single-process bypass it
  await captureShots([{ url: 'file://' + htmlPath, theme: 'light', out: outPng }]);

  if (!existsSync(outPng)) {
    die('self-check: PNG was not written to ' + outPng);
  }
  console.log('[screenshots] self-check passed — PNG at ' + outPng);
}

// --- main ---

const args = process.argv.slice(2);

if (args[0] === '--self-check') {
  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx !== -1 ? args[outDirIdx + 1] : null;
  await selfCheck(outDir);
} else if (args[0]) {
  const configPath = resolve(args[0]);
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (e) {
    die('Cannot read config ' + configPath + ': ' + e.message);
  }
  if (!Array.isArray(config.shots) || config.shots.length === 0) {
    die('Config must have a non-empty "shots" array');
  }
  const defaults = config.defaults || {};
  const shots = config.shots.map((shot) => ({
    ...defaults,
    ...shot,
    url: resolveShotUrl(shot.url || defaults.url),
    storage: { ...(defaults.storage || {}), ...(shot.storage || {}) },
    fetchStub: { ...(defaults.fetchStub || {}), ...(shot.fetchStub || {}) },
  }));
  const serveRoot = config.serveRoot ? [].concat(config.serveRoot).map((entry) => {
    const spec = typeof entry === 'string' ? { dir: entry } : entry;
    if (!spec || typeof spec.dir !== 'string') die('serveRoot entries need a directory');
    return { dir: resolve(spec.dir), stripPrefix: spec.stripPrefix || null };
  }) : null;
  await captureShots(shots, serveRoot);
} else {
  process.stderr.write(
    'Usage: node scripts/screenshots.local.mjs <config.json>\n' +
    '       node scripts/screenshots.local.mjs --self-check [--out-dir <dir>]\n'
  );
  process.exit(1);
}
