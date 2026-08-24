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
  'ribbon-card', 'ribbon-chart', 'ribbon-legend', 'evidence-strip-chart',
  'basal-lede', 'sw-prog', 'sw-solid', 'sw-hatch', 'sw-hollow', 'sw-gap',
  'tier-toggle',
  'diff-block', 'diff-block-body', 'diff-block-head', 'diff-block-tag', 'diff-block-title',
  'diff-caret', 'diff-range', 'diff-cell', 'diff-fold', 'diff-n', 'diff-note', 'diff-rate', 'diff-row',
  'diff-time', 'diff-gutter',
  'g-add', 'g-context', 'g-del', 'g-nodata', 'g-unver', 'hunk-actions',
  'hunk-detail', 'hunk-head', 'hunk-why', 'r-add', 'r-del', 'r-unver',
  'unver-why', 'range-legend', 'basal-block-row', 'basal-block-actions',
  'basal-block-member', 'tag-change', 'tag-confirmed', 'tag-insufficient',
  'tag-nodata',
]);

const retiredStyleSelectors = () => [...indexHtml.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
  .flatMap(([, css]) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^{}]*\}/g)])
  .flatMap(([, selectors]) => selectors.split(','))
  .map((selector) => selector.trim())
  .filter((selector) => {
    const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(([, name]) => name);
    return classes.length > 0 && classes.every((name) => retiredClasses.has(name));
  });

test('the unreachable basal ribbon inventory stays retired (#104)', () => {
  assert.equal(retiredClasses.size, 47, 'the closed retired-class inventory must stay complete');
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
