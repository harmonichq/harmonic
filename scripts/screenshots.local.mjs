#!/usr/bin/env node
/**
 * Repository-local screenshot wrapper: the canonical harness in
 * scripts/screenshots.mjs does the capturing; this file contributes only the
 * three concerns that are genuinely this repo's —
 *
 *   1. Theme: the app themes on a `.dark` class on <html> (frontend/theme.css),
 *      not on data-theme alone, and its chart layouts re-measure on a window
 *      resize event. The harness default would render a "dark" shot light.
 *   2. Vendored CDN assets: with VENDOR_DIR set, the serve hook answers the
 *      app's two exact Vue/ECharts CDN URLs from disk.
 *   3. fetchStubFiles: fixture-backed fetch stubs — { "<url-substr>":
 *      { "file": "fixture.json", "key": "nested.value" } } (or a bare file
 *      path) — expanded into the harness's inline fetchStub, so a 100 KB
 *      payload never has to be inlined in a config.
 *
 * Usage (unchanged):
 *   node scripts/screenshots.local.mjs <config.json>
 *   node scripts/screenshots.local.mjs --self-check [--out-dir <dir>]
 * Config schema: scripts/screenshots.mjs, plus "fetchStubFiles".
 */

import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { main, runConfig } from './screenshots.mjs';

function die(msg) {
  console.error('[screenshots] ' + msg);
  process.exit(1);
}

// The two CDN assets frontend/index.html loads, matched by exact URL (a substring
// match would shadow any served-from-disk path containing "vue" or "echarts").
const VENDORED = {
  'https://unpkg.com/vue@3/dist/vue.esm-browser.js': 'vue.esm-browser.js',
  'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js': 'echarts.min.js',
};

function serveVendored(url) {
  const vendor = process.env.VENDOR_DIR;
  const file = vendor && VENDORED[url.split('?')[0]];
  if (!file) return null;
  return { body: readFileSync(join(vendor, file)), contentType: 'text/javascript' };
}

async function applyTheme(page, theme) {
  await page.evaluate(function (t) {
    document.documentElement.dataset.theme = t;
    document.documentElement.classList.toggle('dark', t === 'dark');
    window.dispatchEvent(new Event('resize'));
  }, theme);
}

// Resolve one fetchStubFiles entry to its JSON value, failing loudly when the
// fixture file or the dotted key inside it is absent.
function fixtureValue(spec) {
  if (typeof spec === 'string') return JSON.parse(readFileSync(resolve(spec), 'utf8'));
  if (!spec || typeof spec.file !== 'string') die('fetchStubFiles entries need a file path');
  let value = JSON.parse(readFileSync(resolve(spec.file), 'utf8'));
  if (spec.key) {
    for (const key of spec.key.split('.')) value = value?.[key];
    if (value === undefined) die(`fetchStubFiles key ${spec.key} is absent from ${spec.file}`);
  }
  return value;
}

// Expand fetchStubFiles into the harness's inline fetchStub, in place, so the
// harness's own key-wise defaults merge applies to the result.
function expandFetchStubFiles(shot) {
  if (!shot.fetchStubFiles) return shot;
  const expanded = Object.fromEntries(
    Object.entries(shot.fetchStubFiles).map(([url, spec]) => [url, fixtureValue(spec)])
  );
  const { fetchStubFiles, ...rest } = shot;
  return { ...rest, fetchStub: { ...rest.fetchStub, ...expanded } };
}

const options = { serve: serveVendored, applyTheme };

const args = process.argv.slice(2);
if (args[0] && args[0] !== '--self-check') {
  // main() reads the config file itself, so fetchStubFiles is expanded here and
  // the result handed to runConfig; every other path delegates to main() as is.
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
  if (config.defaults) config.defaults = expandFetchStubFiles(config.defaults);
  config.shots = config.shots.map(expandFetchStubFiles);
  await runConfig(config, options);
} else {
  await main(args, options);
}
