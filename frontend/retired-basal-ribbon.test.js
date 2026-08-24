import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const chartBuilders = readFileSync(new URL('./chart-builders.js', import.meta.url), 'utf8');

const setupReturnNames = [
  'basalTierMeta', 'activeBasalTiers', 'toggleBasalTier', 'basalTierCounts',
  'basalChangeCount', 'basalBlocks', 'visibleBasalBlocks', 'collapsedBlocks',
  'toggleBlock', 'basalSlotNote', 'ribbonEl', 'setEvidenceStripEl',
];

const retiredNames = [
  ...setupReturnNames,
  'renderRibbonChart', 'renderEvidenceStrips', 'evidenceStripCharts',
  'chartColors', 'cssVar', 'ribbonYMax', 'buildEvidenceStripOption', 'basalTier',
];

const retiredClasses = new Set([
  'active', 'badge-lg', 'band', 'basal-block-actions', 'basal-block-member',
  'basal-block-row', 'basal-lede', 'cnt', 'collapsed', 'diamond',
  'diff-block', 'diff-block-body', 'diff-block-head', 'diff-block-tag', 'diff-block-title',
  'diff-caret', 'diff-range', 'diff-cell', 'diff-fold', 'diff-n', 'diff-note', 'diff-rate', 'diff-row',
  'diff-time', 'diff-gutter', 'dot', 'evidence-strip', 'evidence-strip-chart', 'foot',
  'g-add', 'g-context', 'g-del', 'g-nodata', 'g-unver', 'hatch', 'head', 'hunk-actions',
  'hunk-detail', 'hunk-head', 'hunk-why', 'line', 'logged', 'off', 'pin', 'r-add', 'r-del',
  'r-unver', 'range-legend', 'ribbon-card', 'ribbon-chart', 'ribbon-legend', 'sw', 'sw-gap',
  'sw-hatch', 'sw-hollow', 'sw-prog', 'sw-solid', 'tag-change', 'tag-confirmed',
  'tag-insufficient', 'tag-nodata', 'tier-toggle', 'unver-why',
]);

const retiredSelectors = new Set([
  '.basal-block-row td', '.basal-block-actions', '.basal-block-member td:first-child',
  '.basal-lede', '.basal-lede b', '.ribbon-card', '.ribbon-chart', '.ribbon-legend',
  '.ribbon-legend span', '.ribbon-legend .sw', '.sw-prog', '.sw-solid', '.sw-hatch',
  '.sw-hollow', '.sw-gap', '.tier-toggle', '.tier-toggle:hover', '.tier-toggle .sw',
  '.tier-toggle .cnt', '.tier-toggle.active', '.tier-toggle.off', '.diff-block',
  '.diff-block:first-child', '.diff-block-head', '.diff-block-head:hover', '.diff-caret',
  '.diff-block.collapsed .diff-caret', '.diff-range', '.diff-block-title', '.diff-block-tag',
  '.diff-block-tag .dot', '.tag-change', '.tag-confirmed', '.tag-insufficient', '.tag-nodata',
  '.diff-block.collapsed .diff-block-body', '.diff-row', '.diff-block-body .diff-row:first-child',
  '.diff-gutter', '.g-context', '.g-add', '.g-del', '.g-unver', '.g-nodata', '.diff-cell',
  '.r-add .diff-cell', '.r-del .diff-cell', '.r-unver .diff-cell', '.diff-time', '.diff-rate',
  '.r-add .diff-rate', '.r-del .diff-rate', '.diff-note', '.diff-n', '.diff-fold',
  '.diff-fold a', '.diff-fold a:hover', '.hunk-head', '.hunk-detail', '.hunk-why',
  '.hunk-why b', '.hunk-actions', '.unver-why', '.unver-why b', '.evidence-strip',
  '.evidence-strip .head', '.evidence-strip-chart', '.evidence-strip .foot', '.range-legend',
  '.range-legend span', '.range-legend .sw', '.range-legend .sw.logged',
  '.range-legend .sw.diamond', '.range-legend .sw.pin', '.range-legend .sw.line',
  '.range-legend .sw.hatch', '.range-legend .sw.band', '.range-legend .sw.badge-lg',
]);

const retiredStyleSelectors = () => [...indexHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
  .flatMap(([, css]) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)])
  .flatMap(([, selectors]) => selectors.split(','))
  .map((selector) => selector.trim())
  .filter((selector) => retiredSelectors.has(selector));

const selectorClasses = new Set([...retiredSelectors]
  .flatMap((selector) => [...selector.matchAll(/\.([\w-]+)/g)].map(([, name]) => name)));

test('the unreachable basal ribbon inventory stays retired (#104)', () => {
  assert.deepEqual([...retiredClasses].sort(), [...selectorClasses].sort(),
    'the class inventory must remain exhaustive for every deleted selector');
  for (const source of [indexHtml, chartBuilders]) {
    for (const name of retiredNames) {
      assert.equal(source.includes(name), false, `${name} must stay retired`);
    }
  }
  assert.deepEqual(retiredStyleSelectors(), [],
    'no selector may remain that belongs only to the retired basal ribbon inventory');
});

test('the live prompt-queue ribbon retains its explicit alias (#104)', () => {
  const aliases = indexHtml.match(/buildRibbonOption as pqBuildRibbonOption/g) || [];
  assert.deepEqual(aliases, ['buildRibbonOption as pqBuildRibbonOption']);
  const occurrences = indexHtml.match(/\bbuildRibbonOption\b/g) || [];
  assert.deepEqual(occurrences, ['buildRibbonOption'],
    'the prompt-queue import is the shell\'s only ribbon-builder reference');
  assert.equal(chartBuilders.includes('buildRibbonOption'), false,
    'the retired chart-builder export must not be confused with the prompt-queue ribbon');
});
