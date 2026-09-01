import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const shell = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const favicon = readFileSync(new URL('./favicon.svg', import.meta.url), 'utf8');
const theme = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');
const workstation = readFileSync(new URL('./diagnose-workstation.css', import.meta.url), 'utf8');

test('Dark derives the Diagnose material ladder through the shipped role owners (#255)', () => {
  const root = page.match(/:root \{[\s\S]*?\n    \}/)[0];
  assert.match(root, /--wk-canvas:#0f0d0b; --wk-field:#1e1a17; --wk-surface:#221e1b; --wk-surface-rail:#2b2622; --wk-surface-sunken:#14120f;/,
    'the app token owner orders desk, sheet, rail, and well');
  assert.match(root, /--wk-ink:#f2ede2; --wk-ink-body:#cfc8bd; --wk-ink-meta:#a49c90; --wk-ink-nav:#c6bfb3;/,
    'the app token owner carries the approved Dark ink hierarchy');
  assert.match(root, /--wk-rule:#3f3833; --wk-rule-strong:#453d35;/,
    'quiet rules and vessel edges remain separate roles');
  assert.match(theme, /:root \{[\s\S]*?--mk-line: var\(--wk-rule\);/,
    'chart grid ink derives from the quiet rule role');
  assert.match(workstation, /--ck-tile-edge: var\(--wk-rule-strong\);/,
    'chart vessel edges derive from the strong edge role, not grid ink');
  assert.match(workstation, /\.tile-field > \.tile-focal > \.evidence-tile \{[\s\S]*?background: var\(--ck-well\);[\s\S]*?inset 0 0 0 1px var\(--ck-tile-edge\), var\(--wk-elevation\);/,
    'the Dark focal chart uses the shared well and shadow-only elevation');
});

test('the vessel cascade composes one Dark 1px/4px grammar (#255)', () => {
  assert.match(workstation, /--ck-tile-edge: var\(--wk-rule-strong\);/,
    'the vessel edge resolves through the strong edge role');
  assert.match(workstation, /\.tile-field > \.tile-focal > \.evidence-tile \{[\s\S]*?border-radius: 4px;[\s\S]*?inset 0 0 0 1px var\(--ck-tile-edge\), var\(--wk-elevation\);/,
    'the spotlight adds only elevation beyond the shared vessel edge');
  assert.match(workstation, /\.tile-field\[data-dock="docked"\][\s\S]*?\.tile-field\[data-raised\][\s\S]*?\.tile-field\[data-explorer\] \.evidence-tile \{[\s\S]*?border-radius: 4px;[\s\S]*?inset 0 0 0 1px var\(--ck-tile-edge\)/,
    'docked, raised, and Explorer cells keep the shared vessel edge and radius');
  assert.match(workstation, /\.tile-field:is\(\[data-fullscreen-tile\], \[data-explorer\]\) \.evidence-tile \{[\s\S]*?border-radius: 4px;[\s\S]*?inset 0 0 0 1px var\(--ck-tile-edge\)/,
    'fullscreen cells keep the shared vessel edge and radius');
});

test('Diagnose mounts the merged workstation surface (#636)', () => {
  assert.match(page, /ref="diagnoseRoot"/, 'one Diagnose root owns the merged instrument');
  assert.match(page, /from '\/assets\/diagnose-workspaces\.js'/, 'the workstation renderer is mounted');
  assert.doesNotMatch(page, /from '\.\/settings-audit|ref="saRoot"|\bsaView\b/, 'the retired ledger/morph surface has no runtime composition');
  assert.match(page, /dataFetchExploreTimeOfDay/, 'the canvas uses its server-owned aggregate adapter');
});

test('Glossary overlay has dialog semantics and accessible name', () => {
  assert.match(page, /class="modal glossary"[^>]*role="dialog"/,
    'glossary panel carries role="dialog"');
  assert.match(page, /class="modal glossary"[^>]*aria-modal="true"/,
    'glossary panel carries aria-modal="true"');
  assert.match(page, /aria-labelledby="glossary-heading"/,
    'glossary panel is labelled by its heading id');
  assert.match(page, /id="glossary-heading"/,
    'Glossary heading has the id that aria-labelledby points at');
});

test('Month-expand panel has dialog semantics and accessible name', () => {
  assert.match(page, /class="dn-month-panel"[^>]*role="dialog"/,
    'month panel carries role="dialog"');
  assert.match(page, /class="dn-month-panel"[^>]*aria-modal="true"/,
    'month panel carries aria-modal="true"');
  assert.match(page, /aria-labelledby="dn-month-heading"/,
    'month panel is labelled by its title id');
  assert.match(page, /id="dn-month-heading"/,
    'month title element has the id that aria-labelledby points at');
});

// #660: Verify is the ported workstation now — the tab holds a mount and its two
// gates, and the surface itself is built by verify-workstation.js from the locked
// mock. Rendered-markup assertions belong to the behaviour replay, not here.
test('Verify mounts the ported workstation and none of the retired workbench (#660)', () => {
  const verify = page.match(/<div v-show="tab === 'verify'">[\s\S]*?<\/div>\n\n    <!-- ============================ PLAN/)[0];
  assert.match(verify, /ref="verifyRoot"/, 'the workstation mounts into its own root');
  assert.match(verify, /v-show="hasToken && verifyReady"/, 'the mount waits for the roster');
  assert.match(verify, /Verify needs an API token/, "the token gate matches Diagnose's");
  assert.doesNotMatch(verify, /vt-intro|vt-workspace|vt-decision|vt-proof|vfy-split/,
    'the retired Decision + Proof workbench is gone');
  assert.match(page, /<link rel="stylesheet" href="\/assets\/verify-workstation\.css" \/>/,
    'the ported surface loads its own stylesheet');
});

test('Guide sidebar intro does not claim the preview unconditionally sits beside the article', () => {
  assert.doesNotMatch(page, /sits beside a live preview/,
    'unconditional "sits beside" is false at narrow viewports');
  assert.match(page, /is paired with a live preview/,
    'new wording is true at all widths');
});

test('the page declares its own app icon', () => {
  assert.match(page, /<link rel="icon" type="image\/svg\+xml" href="\/assets\/favicon\.svg" \/>/,
    'the head links the SVG app mark so the browser tab is not a blank page icon');
});

// #634: the cockpit status strip carries the full advisory sentence visibly on
// every tab; there is no shared page masthead under the workflow chrome.
test('the cockpit footer keeps the full advisory sentence visible (#535)', () => {
  // #654 carries the behaviour contract's own `status` class alongside this one,
  // so the replay addresses a single footer on both the mock and the build.
  const footer = page.match(/<footer class="cockpit-footer[^"]*">[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /Advisory only — review with your clinician before changing pump settings\./,
    'every tab shares the full locked advisory sentence');
  assert.doesNotMatch(footer, /class="sr-only"/,
    'the advisory sentence is not screen-reader-only');
  assert.doesNotMatch(page, /class="workspace-head"/,
    'the retired shared workspace masthead is absent');
  assert.match(page, /<title>Harmonic<\/title>/,
    'the browser tab title remains the product name');
});

/* #736 re-settled this. The outlined/fill glyph was the pre-Harmonic mark; the
   Harmonic identity is a native capital H in a FILLED burnt-orange rounded
   square, and the square carries its own orange instead of reading
   --ck-accent, so the mark stays one constant object wherever it sits. The empty aria-hidden span is unchanged: the H is drawn by ::before,
   so it never enters the accessibility tree or a text selection. */
test('the cockpit identity wears the locked Harmonic mark', () => {
  const mark = page.match(/<span class="cockpit-mark"[\s\S]*?<\/span>/)[0];
  assert.equal(mark, '<span class="cockpit-mark" aria-hidden="true"></span>');
  assert.match(shell, /\.cockpit-mark\s*\{[\s\S]*?width:\s*20px;[\s\S]*?height:\s*20px;[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*5px;[\s\S]*?background:\s*#b35b2e;/,
    'the mark keeps the locked 20px burnt-orange rounded square');
  assert.match(shell, /\.cockpit-mark::before\s*\{[\s\S]*?content:\s*"H";[\s\S]*?font-weight:\s*650;/,
    'the mark draws the native capital H at the locked weight');
  assert.doesNotMatch(shell.match(/\.cockpit-mark\s*\{[^}]*\}/)[0], /var\(--ck-accent\)/,
    'the mark does not follow the chrome accent — it is one constant object');
  assert.match(favicon, /aria-label="Harmonic"/,
    'the tab icon carries the product name as its accessible name');
  assert.match(favicon, /fill="#b35b2e"/,
    'the tab icon is the same burnt-orange square as the topbar mark');
});
