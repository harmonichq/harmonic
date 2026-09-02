#!/usr/bin/env node
/**
 * #304 identity evidence — the Dark surface did not move.
 *
 * Opens the ticket base and the revision from two running `harmonic serve`
 * instances over the same generated synthetic database, walks every element of
 * the gated Diagnose, Verify, Day and shell states at three viewports, and
 * diffs the FULL `getComputedStyle` of each. The base is opened with
 * localStorage `theme` set to `dark` — the stored choice that used to select
 * the shipped look; the revision is opened with nothing stored, because #304
 * retired the key. A green run means those two produce the same pixels' worth
 * of computed style everywhere, apart from the Theme control that #304 deleted.
 *
 * Usage (both servers must already be up — see README.md in this directory):
 *
 *   BASE_URL_BASE=http://127.0.0.1:8766 BASE_URL_REVISION=http://127.0.0.1:8765 \
 *   OUT_DIR=openspec/changes/dark-only-theme/evidence \
 *   PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
 *   node openspec/changes/dark-only-theme/evidence/identity-diff.mjs
 *
 * Fails closed: a missing driver, vendored asset, environment variable or
 * surface exits nonzero naming what is absent. A run that finds no Theme
 * control on the base side also fails — that would mean the "base" is not the
 * base, and a diff of two revisions proves nothing.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

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
if (missing.length) {
  console.error(`identity-diff.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}`);
  process.exit(1);
}

/* ------------------------------------------------------------------- surfaces
   Each state is reached exactly as the shipped gate that owns it reaches it:
   the path the router admits, and the rendered root that gate waits on.
     Diagnose  frontend/diagnose-workstation.browser.test.mjs  → `.dw`
     Verify    frontend/verify-660-story-behavior.replay.mjs   → `.vw`
     Day       frontend/day-surface.browser.mjs                → `.ds-root`
     Shell     frontend/cockpit-shell.browser.test.mjs         → `.cockpit-shell`
   `shell-drawer` is the same shell with the navigation drawer opened, because
   the second Theme control lived in that drawer and is invisible otherwise.
   Above the cockpit breakpoint the drawer trigger is `display: none`; the state
   then records that fact instead of failing, and does so on both sides, so the
   pair stays comparable. */
const STATES = [
  { id: 'shell', tab: 'diagnose', path: '/', ready: '.cockpit-shell' },
  { id: 'shell-drawer', tab: 'diagnose', path: '/', ready: '.cockpit-shell', drawer: true },
  { id: 'diagnose', tab: 'diagnose', path: '/diagnose', ready: '.dw' },
  { id: 'verify', tab: 'verify', path: '/verify', ready: '.vw' },
  { id: 'day', tab: 'day', path: '/day', ready: '.ds-root' },
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

/* -------------------------------------------------------------- what is forgiven
   Every sanctioned difference is a direct consequence of deleting the Theme
   control, and each one has a named rule. The report prints the rule that
   admitted each difference, so a reader can see exactly what was forgiven and
   why — a blanket "ignore anything with theme in it" would forgive a real
   regression. No rule forgives a colour, a font, a border or a spacing token. */
/** A key's signatures, with the `:index` suffix stripped off each one.
    Rules match whole segments, never raw substrings of the key: a substring
    would also match a longer class name that merely starts the same way, and it
    would read whatever the root element happens to carry. */
const segments = (key) => key.split('>').map((part) => part.replace(/:\d+$/, ''));

/* Removed elements. `kind` separates the control itself from the boot-time
   script that used to read the stored choice, so the two are counted and
   reported apart rather than as one lump. */
const REMOVAL_RULES = [
  { id: 'footer-theme-button', kind: 'theme-control',
    name: 'footer Theme button (button.cockpit-theme#theme-menu-button)',
    match: (node) => node.sig === 'button#theme-menu-button.cockpit-theme' },
  { id: 'footer-theme-menu', kind: 'theme-control',
    name: 'footer Theme preference menu (div.cockpit-utility-menu) and its items',
    match: (node) => segments(node.path).includes('div.cockpit-utility-menu') },
  { id: 'drawer-theme-button', kind: 'theme-control',
    name: 'navigation-drawer Theme button (drawer <button> labelled Theme)',
    match: (node) => node.tag === 'button'
      && segments(node.path).includes('aside#navigation-drawer.cockpit-drawer')
      && /^Theme\b/.test(node.text) },
  /* The inline gate in <head> that read the stored choice and put the `dark`
     class on the root before first paint. #304 retired the key it read, so the
     gate went with it. Matched on what the script says, never on its position
     among its siblings — a head script's index is not a contract. */
  { id: 'boot-theme-gate', kind: 'boot-gate',
    name: "boot-time theme gate script (head > script whose text contains localStorage.getItem('theme'))",
    match: (node) => node.tag === 'script'
      && segments(node.path).includes('head')
      && node.text.includes("localStorage.getItem('theme')") },
];
function classifyRemoval(node) {
  return REMOVAL_RULES.find((rule) => rule.match(node)) || null;
}

/* Changed computed properties. Exactly one is sanctioned: the utilities nav in
   the footer is narrower once the Theme button is no longer inside it, and its
   auto margin takes up the difference. Only these six properties, only on that
   one node, and only in a pair that also recorded the footer Theme button's
   removal — so the reflow can never be claimed where its cause is absent.
   Anything else on that node, and these properties anywhere else, stay
   unexplained. */
const REFLOW_RULE = {
  id: 'utilities-nav-reflow',
  name: 'the removed Theme button\'s container reflows (nav.cockpit-utilities, '
    + 'width/inline-size/margin-left/margin-inline-start/transform-origin/perspective-origin, '
    + 'only in a pair that also removed the footer Theme button)',
  properties: new Set(['width', 'inline-size', 'margin-left', 'margin-inline-start',
    'transform-origin', 'perspective-origin']),
  node: (key) => {
    const parts = segments(key);
    return parts.at(-1) === 'nav.cockpit-utilities'
      && parts.at(-2) === 'footer.cockpit-footer.status';
  },
};

/* ------------------------------------------------------------------- the dump
   Runs in the page. Every element gets a stable key and its complete computed
   style.

   The key is a path of `tag#id.class.class` signatures, each suffixed with the
   element's index among the siblings carrying that same signature — NOT a bare
   position among all siblings. A bare position shifts for every sibling after a
   deleted node, which would turn the one removed Theme button into a cascade of
   false differences across the whole footer. Keying on the signature means a
   deletion drops exactly its own key and leaves every survivor's key untouched.

   `getComputedStyle` is enumerated in full — whatever the engine resolves,
   including the custom properties the theme tokens live in. Nothing is
   filtered, so nothing can be quietly forgiven. */
function collectStyles() {
  // djb2 over a string, base36 — a short, deterministic identity for an inline
  // head resource that has no URL to be named by.
  const hash = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i += 1) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };
  const sigOf = (el) => {
    // The document element is signed by its tag alone. Its class list is the one
    // intentional DOM difference between the two builds — the base carries the
    // `dark` class this change retired — and every key on the page begins with
    // it, so letting it into the signature would misalign the entire tree and
    // compare nothing. Keyed on `html` alone, the two roots line up and the
    // root's own computed style is diffed like every other element's, which is
    // where a token that failed to collapse would show up.
    if (el === document.documentElement) return el.tagName.toLowerCase();
    const tag = el.tagName.toLowerCase();
    const base = tag
      + (el.id ? `#${el.id}` : '')
      + [...el.classList].sort().map((c) => `.${c}`).join('');
    /* Head resources carry no id and no class, so a bare signature makes every
       <script> in <head> identical and keys them by position — and position is
       exactly what a removal destroys. Deleting the boot-time theme gate shifted
       the importmap and the echarts loader up one, so the key that disappeared
       was the loader's rather than the gate's, and the gate's own text was never
       offered to the rule written to recognise it. Naming each head resource by
       its URL, or by a hash of its inline text, keys it by identity instead: a
       removal then drops its own key and shifts nothing.

       Two deliberate exceptions, both because their bytes are what this change
       rewrites: <style> blocks are keyed by position (there are two, in the same
       order on both sides, and neither is removed), and the body's module script
       is outside <head> and untouched by this rule. Hashing either would
       manufacture a difference between two elements that are the same element. */
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
    // Own text only, trimmed and clipped: it names a node in the report, and it
    // is what identifies the two class-less nodes the rules have to recognise —
    // the drawer's Theme button and the head's boot-time theme gate script. The
    // clip is wide enough to carry the gate's `localStorage.getItem` call rather
    // than stopping just short of it.
    const text = [...el.childNodes]
      .filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ')
      .replace(/\s+/g, ' ').trim().slice(0, 200);
    out[keyOf(el)] = { tag: el.tagName.toLowerCase(), sig: sigOf(el), text, props };
  }
  return out;
}

/** Open one side in one state at one viewport, and return its full style dump. */
async function dump(browser, origin, { storeDarkTheme }, state, viewport) {
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
  await page.addInitScript(({ tab, dark }) => {
    localStorage.setItem('ciq_token', 'identity-diff');
    localStorage.setItem('tab', tab);
    // The base carries the stored choice that used to select the shipped look.
    // The revision stores nothing at all: #304 retired the key, and a run that
    // seeded it there would be testing a value the app no longer reads.
    if (dark) localStorage.setItem('theme', 'dark');
  }, { tab: state.tab, dark: storeDarkTheme });
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
  await page.close();
  return { styles, note };
}

/** Diff one state/viewport pair. */
function diffPair(baseDump, revisionDump) {
  const removed = [];
  const added = [];
  const changed = [];
  const reflow = [];
  for (const [key, node] of Object.entries(baseDump)) {
    if (revisionDump[key]) continue;
    const rule = classifyRemoval({ path: key, sig: node.sig, tag: node.tag, text: node.text });
    removed.push({ key, sig: node.sig, tag: node.tag, text: node.text,
      rule: rule?.id || null, kind: rule?.kind || null, expected: rule?.name || null });
  }
  for (const [key, node] of Object.entries(revisionDump)) {
    if (!baseDump[key]) added.push({ key, sig: node.sig, tag: node.tag, text: node.text });
  }
  /* The reflow rule is only available to a pair that actually lost the footer
     Theme button — the box whose absence causes it. */
  const themeButtonRemoved = removed.some((node) => node.rule === 'footer-theme-button');
  for (const [key, node] of Object.entries(baseDump)) {
    const other = revisionDump[key];
    if (!other) continue;
    for (const prop of new Set([...Object.keys(node.props), ...Object.keys(other.props)])) {
      const a = node.props[prop];
      const b = other.props[prop];
      if (a === b) continue;
      const entry = { key, property: prop, base: a ?? '(absent)', revision: b ?? '(absent)' };
      if (themeButtonRemoved && REFLOW_RULE.node(key) && REFLOW_RULE.properties.has(prop)) {
        reflow.push({ ...entry, rule: REFLOW_RULE.id, expected: REFLOW_RULE.name });
      } else {
        changed.push(entry);
      }
    }
  }
  return { removed, added, changed, reflow };
}

/* ------------------------------------------------------------------- the run */
const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
const lines = [];
const say = (line = '') => { lines.push(line); console.log(line); };
const results = [];
const emptyComparisons = [];
let elementsCompared = 0;
let propertiesCompared = 0;
let sanctionedRemovals = 0;
let sanctionedGateRemovals = 0;
let sanctionedReflows = 0;
let unexplained = 0;

/** One line of a node's own text, clipped for the report. */
const brief = (text) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

say('#304 identity evidence — base vs revision computed style');
say(`base     ${BASE.href}   (localStorage theme='dark')`);
say(`revision ${REVISION.href}   (nothing stored)`);
say('');

try {
  for (const state of STATES) {
    for (const viewport of VIEWPORTS) {
      const label = `${state.id} @ ${viewport.width}x${viewport.height}`;
      const base = await dump(browser, BASE, { storeDarkTheme: true }, state, viewport);
      const revision = await dump(browser, REVISION, { storeDarkTheme: false }, state, viewport);
      const diff = diffPair(base.styles, revision.styles);
      const shared = Object.keys(base.styles).filter((key) => revision.styles[key]);
      elementsCompared += shared.length;
      propertiesCompared += shared.reduce((sum, key) => sum + Object.keys(base.styles[key].props).length, 0);
      const themeControls = diff.removed.filter((node) => node.kind === 'theme-control');
      const bootGates = diff.removed.filter((node) => node.kind === 'boot-gate');
      const unexplainedRemovals = diff.removed.filter((node) => !node.expected);
      sanctionedRemovals += themeControls.length;
      sanctionedGateRemovals += bootGates.length;
      sanctionedReflows += diff.reflow.length;
      unexplained += unexplainedRemovals.length + diff.added.length + diff.changed.length;

      say(`## ${label}`);
      if (base.note) say(`   note (base):     ${base.note}`);
      if (revision.note) say(`   note (revision): ${revision.note}`);
      say(`   elements compared ${shared.length} · properties compared ${
        shared.reduce((sum, key) => sum + Object.keys(base.styles[key].props).length, 0)}`);
      for (const node of themeControls) {
        say(`   expected: removed Theme control — ${node.sig}${node.text ? ` "${brief(node.text)}"` : ''}`);
        say(`             rule: ${node.expected}`);
        say(`             path: ${node.key}`);
      }
      for (const node of bootGates) {
        say(`   expected: removed boot-time theme gate — ${node.sig}`);
        say(`             rule: ${node.expected}`);
        say(`             path: ${node.key}`);
        say(`             text: ${brief(node.text)}`);
      }
      for (const entry of diff.reflow) {
        say(`   expected: Theme button container reflow — ${entry.property}`);
        say(`             rule:     ${entry.expected}`);
        say(`             path:     ${entry.key}`);
        say(`             base:     ${entry.base}`);
        say(`             revision: ${entry.revision}`);
      }
      for (const node of unexplainedRemovals) {
        say(`   UNEXPECTED removed element ${node.sig}${node.text ? ` "${brief(node.text)}"` : ''}`);
        say(`             path: ${node.key}`);
      }
      for (const node of diff.added) {
        say(`   UNEXPECTED added element ${node.sig}${node.text ? ` "${brief(node.text)}"` : ''}`);
        say(`             path: ${node.key}`);
      }
      for (const entry of diff.changed) {
        say(`   UNEXPECTED computed-style difference`);
        say(`             path:     ${entry.key}`);
        say(`             property: ${entry.property}`);
        say(`             base:     ${entry.base}`);
        say(`             revision: ${entry.revision}`);
      }
      /* A pair that shares no key compared nothing, and a diff that compared
         nothing must never read as agreement. This is how the first run failed:
         the keys were misaligned, every element looked removed, and the state
         still reported a tidy list. */
      if (!shared.length) {
        emptyComparisons.push(label);
        say(`   FAIL: ${label} compared 0 elements — the two trees share no key, `
          + 'so this state proves nothing');
      } else if (!diff.removed.length && !diff.added.length
                 && !diff.changed.length && !diff.reflow.length) {
        say('   identical');
      }
      say('');
      results.push({ state: state.id, viewport, notes: { base: base.note, revision: revision.note },
        elementsCompared: shared.length, ...diff });
    }
  }
} finally {
  await browser.close();
}

say('## summary');
say(`states × viewports        ${results.length}`);
say(`elements compared         ${elementsCompared}`);
say(`computed properties read  ${propertiesCompared}`);
say(`sanctioned Theme removals ${sanctionedRemovals}`);
say(`sanctioned gate removals  ${sanctionedGateRemovals}`);
say(`sanctioned reflow diffs   ${sanctionedReflows}`);
say(`unexplained differences   ${unexplained}`);
say(`states comparing nothing  ${emptyComparisons.length}`);

/* A base that carries no Theme control is not the base. Without this the script
   would happily "prove" identity between two copies of the revision. */
if (!sanctionedRemovals) {
  say('');
  say('FAIL: no Theme control was found on the base side — BASE_URL_BASE is not the ticket base.');
}
if (emptyComparisons.length) {
  say('');
  say(`FAIL: these states compared 0 elements — ${emptyComparisons.join(', ')}`);
}
const ok = unexplained === 0 && sanctionedRemovals > 0 && emptyComparisons.length === 0;
say('');
say(ok ? 'PASS: the Dark surface is identical apart from the removed Theme control.'
       : 'FAIL: see the differences above.');

const out = resolve(OUT_DIR);
await mkdir(out, { recursive: true });
await writeFile(join(out, 'identity-diff.json'), `${JSON.stringify({
  base: BASE.href, revision: REVISION.href,
  elementsCompared, propertiesCompared,
  sanctionedRemovals, sanctionedGateRemovals, sanctionedReflows,
  unexplained, emptyComparisons, pass: ok,
  results,
}, null, 2)}\n`);
await writeFile(join(out, 'identity-diff.report.txt'), `${lines.join('\n')}\n`);
console.log(`\nwrote ${join(out, 'identity-diff.json')}`);
console.log(`wrote ${join(out, 'identity-diff.report.txt')}`);
process.exit(ok ? 0 : 1);
