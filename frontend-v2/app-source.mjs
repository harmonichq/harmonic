// The three facts the v2 desk shares with v1, read from v1's own file at build
// time rather than copied into this tree.
//
// WHY THIS EXISTS. HV2-07 binds the v2 desk to the shipped dark role ladder, and
// that ladder lives in ONE place: the single `:root` block of
// frontend/index.html, pinned by frontend/index.test.js. A second copy under
// frontend-v2/ would be a second home for one fact, and this repository has
// already paid for exactly that mistake once — a generated stylesheet extracted
// from the app went a whole round measuring a palette the app had left
// (AGENTS.md, "A mockup that extracts from the app is a generated artifact").
// Reading the source at build time has no committed copy to go stale.
//
// The same argument covers the Day legend rules and the Glossary definitions,
// which are v1's verbatim and are presented under CONTEXT.md's approved labels.
//
// EVERY LIFT IS BOUNDED AND FAILS CLOSED, AND CHECKS WHAT IT GOT. A moved
// marker raises rather than silently returning a truncated or empty result,
// because an empty material block builds a shell with no ladder and every
// HV2-07 assertion then reads an inherited default. The end markers are unique;
// the material's opening `<style>` is not (index.html carries a second one far
// below), so that lift takes the FIRST and then proves the result carries the
// ladder it is named for. A count is a weaker check than reading the answer.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const APP_SHELL = join(REPO, 'frontend', 'index.html');

export function readAppShell(path = APP_SHELL) {
  return readFileSync(path, 'utf8');
}

function between(html, what, start, end, ...proof) {
  const unsafe = (why) => {
    throw new Error(`frontend-v2/app-source.mjs: the ${what} lift from frontend/index.html is unsafe — ${why}`);
  };
  if (!html.includes(start)) unsafe(`its opening marker ${JSON.stringify(start)} is absent`);
  if (html.split(end).length !== 2) unsafe(`its closing marker ${JSON.stringify(end)} must appear exactly once`);
  const found = html.slice(html.indexOf(start) + start.length).split(end, 1)[0];
  if (!found.trim()) unsafe('it found nothing between its markers');
  for (const token of proof) {
    if (!found.includes(token)) unsafe(`what it lifted does not carry ${JSON.stringify(token)}`);
  }
  return found;
}

/** The app-wide material: the role ladder, the page reset and the body ground. */
export function materialCss(html = readAppShell()) {
  return between(html, 'material', '\n  <style>\n', '    /* #634: #app', ':root {', '--wk-canvas:', '--wk-ink:');
}

/** The shipped Day legend, which the desk's figure keys render. */
export function chartKeyCss(html = readAppShell()) {
  const rules = html.split('\n').filter((line) => line.trimStart().startsWith('.ds-chart-legend'));
  if (!rules.length) throw new Error('frontend-v2/app-source.mjs: frontend/index.html declares no .ds-chart-legend rules');
  return `${rules.join('\n')}\n`;
}

/** v1's glossary groups, as an ES module the desk imports. */
export function glossaryModule(html = readAppShell()) {
  const literal = between(html, 'glossary', '        const glossaryGroups = ref([\n',
    '        ]);\n\n        const tokenInput', 'title:', 'terms:', 'term:', 'def:');
  return `export const glossaryGroups = [\n${literal}];\n`;
}
