#!/usr/bin/env node
/**
 * #317 palette-only evidence — only colour moved, and only where a ruling said.
 *
 * Opens the ticket base and the revision from two running `harmonic serve`
 * instances over the same generated synthetic database, walks every element of
 * the gated shell, Diagnose, Verify, Day and Plan states at three viewports,
 * and diffs the FULL `getComputedStyle` of each. The one sanction rule is
 * `admits` from ./palette-rule.mjs, fed the moved-token list and the colour-pair
 * table read from ../design.md: a difference is admitted only when it is a
 * moved custom property, or a colour-valued property whose only change is a
 * listed before → after pair. Anything else — a layout or typographic
 * property, an added or removed element, a colour pair no ruling explains — is
 * unexplained and fails the run.
 *
 * Adapted from the archived #304 identity diff
 * (openspec/changes/archive/2026-09-01-dark-only-theme/evidence/identity-diff.mjs):
 * same element keying, same full-style dump, same fail-closed prerequisites;
 * its Theme removal and reflow rules, its `theme` seeding and its Theme-control
 * base check are gone, because the base is now the one-theme app.
 *
 * Usage (both servers must already be up — see README.md in this directory):
 *
 *   BASE_URL_BASE=http://127.0.0.1:8318 BASE_URL_REVISION=http://127.0.0.1:8317 \
 *   OUT_DIR=openspec/changes/graphite-palette/evidence \
 *   PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
 *   node openspec/changes/graphite-palette/evidence/palette-diff.mjs
 *
 * Fails closed: a missing driver, vendored asset, environment variable or
 * surface exits nonzero naming what is absent. The base check: every moved
 * token must resolve on the base side to the before-value the record lists and
 * on the revision side to the after-value; otherwise the run fails as "not the
 * ticket base". A state that compares zero elements fails too.
 */

import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admits, norm } from './palette-rule.mjs';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));

/* ---------------------------------------------------------------- fail closed
   Every missing prerequisite is named and accumulated, so one failing run
   points at everything wrong rather than at the first thing checked — the same
   contract the shipped `*.browser.test.mjs` suites keep. */
const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) {
  missing.push('PLAYWRIGHT_MODULE is unset (point it at an installed playwright module, '
    + 'e.g. PLAYWRIGHT_MODULE=$PW/node_modules/playwright)');
} else {
  try {
    chromium = require(process.env.PLAYWRIGHT_MODULE).chromium;
  } catch (e) {
    missing.push(`PLAYWRIGHT_MODULE=${process.env.PLAYWRIGHT_MODULE} could not be required (${e.message})`);
  }
}
const EXECUTABLE = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
if (chromium && !EXECUTABLE && !existsSync(chromium.executablePath())) {
  missing.push('Chromium executable is missing (no PLAYWRIGHT_EXECUTABLE_PATH and '
    + `${chromium.executablePath()} does not exist — run playwright install chromium)`);
}
const VENDOR_DIR = process.env.VENDOR_DIR;
if (!VENDOR_DIR) {
  missing.push('VENDOR_DIR is unset (point it at a directory holding vendored '
    + 'vue.esm-browser.js and echarts.min.js)');
} else {
  for (const asset of ['vue.esm-browser.js', 'echarts.min.js']) {
    if (!existsSync(join(VENDOR_DIR, asset))) missing.push(`VENDOR_DIR=${VENDOR_DIR} is missing ${asset}`);
  }
}
const OUT_DIR = process.env.OUT_DIR;
if (!OUT_DIR) missing.push('OUT_DIR is unset (the directory this run writes its diff and report to)');

/** Both sides must be a local `harmonic serve`; the evidence never leaves this machine. */
function localUrl(name) {
  const raw = process.env[name];
  if (!raw) return missing.push(`${name} is unset (point it at a running harmonic serve)`), null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return missing.push(`${name}=${raw} is not a URL`), null;
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    return missing.push(`${name} must name localhost, got ${url.hostname}`), null;
  }
  return url;
}
const BASE = localUrl('BASE_URL_BASE');
const REVISION = localUrl('BASE_URL_REVISION');
if (BASE && REVISION && BASE.href === REVISION.href) {
  missing.push(`BASE_URL_BASE and BASE_URL_REVISION are the same origin (${BASE.href}) — `
    + 'the two builds must be served on distinct ports');
}

/* ------------------------------------------------------------- the sanction
   The design record is the only authority for what may differ. Its "## Moved
   tokens" list gives each moved custom property with the element it is read on
   (`on \`.selector\`` — the document element when absent) and its computed
   before/after; its "### Derived colour pairs" list gives every further
   before → after pair a ruling explains. Both are read from the file, never
   restated here, so a token that lands without its record entry fails the run. */
const DESIGN = join(HERE, '..', 'design.md');
const movedTokens = new Set();
const tokenChecks = [];   // { token, selector, before, after }
const colourPairs = [];   // [before, after]
if (!existsSync(DESIGN)) {
  missing.push(`${DESIGN} is missing — the moved-token list has no home`);
} else {
  const text = readFileSync(DESIGN, 'utf8');
  const section = (heading, next) => {
    const start = text.indexOf(heading);
    if (start < 0) return '';
    const end = text.indexOf(next, start + heading.length);
    return text.slice(start, end < 0 ? undefined : end);
  };
  const moved = section('## Moved tokens', '### Derived colour pairs');
  for (const m of moved.matchAll(/^- `(--[\w-]+)`(?:\s+on\s+`([^`]+)`)?[\s\S]*?·\s*before\s*`([^`]+)`\s*·\s*after\s*`([^`]+)`/gm)) {
    const [, token, selector, before, after] = m;
    movedTokens.add(token);
    tokenChecks.push({ token, selector: selector || null, before, after });
    colourPairs.push([before, after]);
  }
  const derived = section('### Derived colour pairs', '## Base story counts');
  for (const m of derived.matchAll(/^- `([^`]+)`\s*→\s*`([^`]+)`/gm)) colourPairs.push([m[1], m[2]]);
  if (!movedTokens.size) missing.push(`${DESIGN} lists no moved token — nothing is sanctioned to differ`);
}

if (missing.length) {
  console.error(`palette-diff.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- surfaces
   Each state is reached exactly as the shipped gate that owns it reaches it:
   the path the router admits, and the rendered root that gate waits on.
     Diagnose  frontend/diagnose-workstation.browser.test.mjs  → `.dw`
     Verify    frontend/verify-660-story-behavior.replay.mjs   → `.vw`
     Day       frontend/day-surface.browser.mjs                → `.ds-root`
     Plan      frontend/cockpit-shell.browser.test.mjs         → `.active-profile-ref`
     Shell     frontend/cockpit-shell.browser.test.mjs         → `.cockpit-shell`
   `shell-drawer` is the same shell with the navigation drawer opened. Above the
   cockpit breakpoint the drawer trigger is `display: none`; the state then
   records that fact instead of failing, and does so on both sides, so the pair
   stays comparable. */
const STATES = [
  { id: 'shell', tab: 'diagnose', path: '/', ready: '.cockpit-shell' },
  { id: 'shell-drawer', tab: 'diagnose', path: '/', ready: '.cockpit-shell', drawer: true },
  { id: 'diagnose', tab: 'diagnose', path: '/diagnose', ready: '.dw' },
  { id: 'verify', tab: 'verify', path: '/verify', ready: '.vw' },
  { id: 'day', tab: 'day', path: '/day', ready: '.ds-root' },
  { id: 'plan', tab: 'plan', path: '/plan', ready: '.active-profile-ref' },
];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

// The two CDN assets frontend/index.html loads, matched by exact URL so a
// substring match cannot shadow a served-from-disk path containing "vue".
const CDN = new Map([
  ['https://unpkg.com/vue@3/dist/vue.esm-browser.js', 'vue.esm-browser.js'],
  ['https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js', 'echarts.min.js'],
]);
const vendored = new Map();
async function vendorBody(file) {
  if (!vendored.has(file)) vendored.set(file, await readFile(join(VENDOR_DIR, file)));
  return vendored.get(file);
}

/* --------------------------------------------------------------- the dump
   The key is a path of `tag#id.class.class` signatures, each suffixed with the
   element's index among the siblings carrying that same signature — NOT a bare
   position among all siblings, so a deletion drops exactly its own key and
   leaves every survivor's key untouched.

   `getComputedStyle` is enumerated in full — whatever the engine resolves,
   including the custom properties the theme tokens live in. Nothing is
   filtered, so nothing can be quietly forgiven. */
function collectStyles() {
  const hash = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const sigOf = (el) => {
    if (el === document.documentElement) return el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase();
    const base = tag
      + (el.id ? `#${el.id}` : '')
      + [...el.classList].sort().map((c) => `.${c}`).join('');
    /* Head resources carry no id and no class; name each by its URL, or by a
       hash of its inline text, so a removal drops its own key and shifts
       nothing. <style> blocks stay keyed by position: their bytes are what a
       palette revision rewrites, and hashing them would manufacture a
       difference between two elements that are the same element. */
    if (!el.closest('head')) return base;
    if (el.hasAttribute('src')) return `${base}[src=${el.getAttribute('src')}]`;
    if (el.hasAttribute('href')) return `${base}[href=${el.getAttribute('href')}]`;
    if (tag === 'script') return `${base}@${hash(el.textContent)}`;
    return base;
  };
  const keyOf = (el) => {
    const parts = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const sig = sigOf(node);
      const twins = node.parentElement
        ? [...node.parentElement.children].filter((sib) => sigOf(sib) === sig)
        : [node];
      parts.unshift(`${sig}:${twins.indexOf(node)}`);
    }
    return parts.join('>');
  };
  const out = {};
  for (const el of document.querySelectorAll('*')) {
    const style = getComputedStyle(el);
    const props = {};
    for (let i = 0; i < style.length; i += 1) props[style[i]] = style.getPropertyValue(style[i]);
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
      .replace(/\s+/g, ' ').trim().slice(0, 200);
    out[keyOf(el)] = { tag: el.tagName.toLowerCase(), sig: sigOf(el), text, props };
  }
  return out;
}

/** The moved tokens as each side actually resolves them: read off the element
    the record names, or, for an entry that names none, off the first element
    that defines the token (a bar-scoped token is empty on the document element). */
function readTokens(checks) {
  return checks.map(({ token, selector }) => {
    let el = selector ? document.querySelector(selector) : document.documentElement;
    let value = el ? getComputedStyle(el).getPropertyValue(token).trim() : null;
    if (!selector && !value) {
      el = [...document.querySelectorAll('*')].find((n) => getComputedStyle(n).getPropertyValue(token).trim());
      value = el ? getComputedStyle(el).getPropertyValue(token).trim() : null;
    }
    return { token, selector, value };
  });
}

/** Open one side in one state at one viewport, and return its full style dump. */
async function dump(browser, origin, state, viewport) {
  const page = await browser.newPage({ viewport });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    const asset = CDN.get(url.href.split('?')[0]);
    if (asset) {
      return route.fulfill({ body: await vendorBody(asset), contentType: 'text/javascript' });
    }
    if (url.origin === origin.origin) return route.continue();
    return route.abort();
  });
  await page.addInitScript(({ tab }) => {
    localStorage.setItem('ciq_token', 'palette-diff');
    localStorage.setItem('tab', tab);
  }, { tab: state.tab });
  const target = new URL(state.path, origin);
  await page.goto(target.href);
  await page.locator(state.ready).waitFor({ timeout: 20_000 });
  let note = null;
  if (state.drawer) {
    const trigger = page.locator('.cockpit-menu-button');
    if (await trigger.isVisible()) {
      await trigger.click();
      await page.locator('.cockpit-drawer').waitFor({ timeout: 10_000 });
    } else {
      note = 'drawer trigger is display:none at this width — drawer left closed on both sides';
    }
  }
  // Let the CDN-driven charts finish their first paint before anything is read;
  // a computed style sampled mid-layout is noise, not evidence.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1200);
  const styles = await page.evaluate(collectStyles);
  const tokens = await page.evaluate(readTokens, tokenChecks);
  await page.close();
  return { styles, tokens, note };
}

/** Diff one state/viewport pair: every difference passes through `admits` or is unexplained. */
function diffPair(baseDump, revisionDump) {
  const removed = [];
  const added = [];
  const admitted = [];
  const refused = [];
  for (const [key, node] of Object.entries(baseDump)) {
    if (!revisionDump[key]) removed.push({ key, sig: node.sig, tag: node.tag, text: node.text });
  }
  for (const [key, node] of Object.entries(revisionDump)) {
    if (!baseDump[key]) added.push({ key, sig: node.sig, tag: node.tag, text: node.text });
  }
  for (const [key, node] of Object.entries(baseDump)) {
    const other = revisionDump[key];
    if (!other) continue;
    for (const prop of new Set([...Object.keys(node.props), ...Object.keys(other.props)])) {
      const a = node.props[prop];
      const b = other.props[prop];
      if (a === b) continue;
      const entry = { key, property: prop, base: a ?? '(absent)', revision: b ?? '(absent)' };
      const verdict = admits({ property: prop, base: a ?? '', revision: b ?? '' }, movedTokens, colourPairs);
      (verdict.admitted ? admitted : refused).push({ ...entry, why: verdict.why });
    }
  }
  return { removed, added, admitted, refused };
}

/** The base check: the record's before-values on the base, after-values on the revision. */
function checkTokens(side, tokens, expectKey) {
  const bad = [];
  for (const read of tokens) {
    const expected = tokenChecks.find((c) => c.token === read.token && c.selector === read.selector)[expectKey];
    if (read.value === null) bad.push(`${read.token}: ${read.selector} not found on the ${side}`);
    else if (norm(read.value) !== norm(expected)) bad.push(`${read.token}${read.selector ? ` on ${read.selector}` : ''}: ${side} resolves ${read.value}, record says ${expected}`);
  }
  return bad;
}

/* ------------------------------------------------------------------- the run */
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const lines = [];
const say = (line = '') => { lines.push(line); console.log(line); };
const results = [];
const emptyComparisons = [];
const baseMismatches = [];
let elementsCompared = 0;
let propertiesCompared = 0;
let admittedTotal = 0;
let unexplained = 0;

const brief = (text) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

say('#317 palette-only evidence — base vs revision computed style');
say(`base     ${BASE.href}`);
say(`revision ${REVISION.href}`);
say(`moved tokens   ${[...movedTokens].join(', ')}`);
say(`colour pairs   ${colourPairs.map(([b, a]) => `${b} → ${a}`).join(' · ')}`);
say('');

try {
  for (const state of STATES) {
    for (const viewport of VIEWPORTS) {
      const label = `${state.id} @ ${viewport.width}x${viewport.height}`;
      const base = await dump(browser, BASE, state, viewport);
      const revision = await dump(browser, REVISION, state, viewport);
      const diff = diffPair(base.styles, revision.styles);
      const shared = Object.keys(base.styles).filter((key) => revision.styles[key]);
      const propsHere = shared.reduce((sum, key) => sum + Object.keys(base.styles[key].props).length, 0);
      elementsCompared += shared.length;
      propertiesCompared += propsHere;
      admittedTotal += diff.admitted.length;
      unexplained += diff.removed.length + diff.added.length + diff.refused.length;
      const mismatches = [
        ...checkTokens('base', base.tokens, 'before'),
        ...checkTokens('revision', revision.tokens, 'after'),
      ];
      for (const m of mismatches) baseMismatches.push(`${label}: ${m}`);

      say(`## ${label}`);
      if (base.note) say(`   note (base):     ${base.note}`);
      if (revision.note) say(`   note (revision): ${revision.note}`);
      say(`   elements compared ${shared.length} · properties compared ${propsHere} · admitted colour differences ${diff.admitted.length}`);
      for (const m of mismatches) say(`   NOT THE TICKET BASE: ${m}`);
      for (const node of diff.removed) {
        say(`   UNEXPECTED removed element ${node.sig}${node.text ? ` "${brief(node.text)}"` : ''}`);
        say(`             path: ${node.key}`);
      }
      for (const node of diff.added) {
        say(`   UNEXPECTED added element ${node.sig}${node.text ? ` "${brief(node.text)}"` : ''}`);
        say(`             path: ${node.key}`);
      }
      for (const entry of diff.refused) {
        say(`   UNEXPLAINED difference — ${entry.why}`);
        say(`             path:     ${entry.key}`);
        say(`             property: ${entry.property}`);
        say(`             base:     ${entry.base}`);
        say(`             revision: ${entry.revision}`);
      }
      if (!shared.length) {
        emptyComparisons.push(label);
        say(`   FAIL: ${label} compared 0 elements — the two trees share no key, `
          + 'so this state proves nothing');
      } else if (!diff.removed.length && !diff.added.length && !diff.refused.length && !diff.admitted.length) {
        say('   identical');
      }
      say('');
      results.push({ state: state.id, viewport, notes: { base: base.note, revision: revision.note },
        elementsCompared: shared.length, propertiesCompared: propsHere,
        tokens: { base: base.tokens, revision: revision.tokens }, ...diff });
    }
  }
} finally {
  await browser.close();
}

say('## summary');
say(`states × viewports          ${results.length}`);
say(`elements compared           ${elementsCompared}`);
say(`computed properties read    ${propertiesCompared}`);
say(`admitted colour differences ${admittedTotal}`);
say(`unexplained differences     ${unexplained}`);
say(`base-check mismatches       ${baseMismatches.length}`);
say(`states comparing nothing    ${emptyComparisons.length}`);
if (baseMismatches.length) {
  say('');
  say('FAIL: not the ticket base / not the revision — the moved tokens do not resolve as the record says.');
}
if (emptyComparisons.length) {
  say('');
  say(`FAIL: these states compared 0 elements — ${emptyComparisons.join(', ')}`);
}
const ok = unexplained === 0 && baseMismatches.length === 0 && emptyComparisons.length === 0;
say('');
say(ok ? 'PASS: only sanctioned colour differs between base and revision.'
       : 'FAIL: see the differences above.');

const out = resolve(OUT_DIR);
await mkdir(out, { recursive: true });
await writeFile(join(out, 'palette-diff.json'), `${JSON.stringify({
  base: BASE.href, revision: REVISION.href,
  movedTokens: [...movedTokens], colourPairs,
  elementsCompared, propertiesCompared, admitted: admittedTotal,
  unexplained, baseMismatches, emptyComparisons, pass: ok,
  results,
}, null, 2)}\n`);
await writeFile(join(out, 'palette-diff.report.txt'), `${lines.join('\n')}\n`);
console.log(`\nwrote ${join(out, 'palette-diff.json')}`);
console.log(`wrote ${join(out, 'palette-diff.report.txt')}`);
process.exit(ok ? 0 : 1);
