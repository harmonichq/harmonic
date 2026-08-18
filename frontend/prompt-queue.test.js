// #128 prompt-queue.js tests — Node's built-in runner, no npm deps:
//
//     node --test frontend/
//
// Same harness rule as scenario-chart.test.js (#100): pure logic lives in a
// vue-free module so it imports with no importmap and no DOM.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  answerToSource,
  answerLabel,
  detectorKicker,
  sortOldestFirst,
  openCount,
  windowDays,
  buildRibbonOption,
  buildSparklineOption,
} from './prompt-queue.js';

const COLORS = {
  text: '#1B2126', muted: '#69727B', line: '#E3E7EA',
  primary: '#1C6E8C', high: '#B3402C', inRange: '#1C6E8C', low: '#B3402C',
  surface: '#FFFFFF', onPrimary: '#FFFFFF', manualCarb: '#866619',
};

function lowPrompt(anchor, key = 55) {
  return {
    detector: 'low', anchor_t: anchor, key_bg: key, age_days: 2,
    question: 'Did you treat this low?', context: `Glucose dropped to ${key} mg/dL.`,
    cgm: [
      { t: '2026-06-24 02:50:00', bg: 95 },
      { t: '2026-06-24 03:00:00', bg: 70 },
      { t: '2026-06-24 03:15:00', bg: key },
      { t: '2026-06-24 03:30:00', bg: 90 },
    ],
  };
}

function mealPrompt(anchor, key = 260) {
  return {
    detector: 'missed-meal', anchor_t: anchor, key_bg: key, age_days: 1,
    question: 'Did you eat here?', context: `Glucose rose to ${key} mg/dL with no bolus logged.`,
    cgm: [
      { t: '2026-06-25 08:30:00', bg: 110 },
      { t: '2026-06-25 08:45:00', bg: 195 },
      { t: '2026-06-25 09:00:00', bg: key },
    ],
  };
}

// --- pure helpers ------------------------------------------------------------

test('answerToSource maps detector -> CarbEntry source', () => {
  assert.equal(answerToSource('missed-meal'), 'rise-prompt');
  assert.equal(answerToSource('low'), 'low-prompt');
});

test('answerLabel covers the three stored answers', () => {
  assert.equal(answerLabel('carbs'), 'logged carbs');
  assert.equal(answerLabel('no'), 'no carbs');
  assert.equal(answerLabel('not-sure'), 'not sure');
});

test('detectorKicker is per-detector', () => {
  assert.equal(detectorKicker('missed-meal'), 'Rise with no bolus');
  assert.equal(detectorKicker('low'), 'Low glucose');
});

test('sortOldestFirst orders by anchor_t without mutating input', () => {
  const input = [lowPrompt('2026-06-26 03:00:00'), lowPrompt('2026-06-24 03:00:00')];
  const sorted = sortOldestFirst(input);
  assert.deepEqual(sorted.map((p) => p.anchor_t),
    ['2026-06-24 03:00:00', '2026-06-26 03:00:00']);
  // original untouched
  assert.equal(input[0].anchor_t, '2026-06-26 03:00:00');
});

test('openCount excludes answered anchors', () => {
  const prompts = [lowPrompt('2026-06-24 03:00:00'), mealPrompt('2026-06-25 08:30:00')];
  assert.equal(openCount(prompts, {}), 2);
  assert.equal(openCount(prompts, { '2026-06-24 03:00:00': 'no' }), 1);
});

test('windowDays spans the pinned anchors', () => {
  const prompts = [lowPrompt('2026-06-24 03:00:00'), mealPrompt('2026-06-27 08:30:00')];
  assert.equal(windowDays(prompts), 3);
  assert.equal(windowDays([]), 0);
});

// --- chart builders ----------------------------------------------------------

test('buildRibbonOption drops one typed pin per prompt on a time axis', () => {
  const prompts = [lowPrompt('2026-06-24 03:15:00'), mealPrompt('2026-06-25 08:30:00')];
  const opt = buildRibbonOption(prompts, COLORS);
  assert.equal(opt.xAxis.type, 'time');
  const pins = opt.series.find((s) => s.name === 'prompts');
  assert.equal(pins.data.length, 2);
  // every pin carries its prompt (the click hit-test the shell binds on).
  assert.ok(pins.data.every((d) => d.prompt && d.symbol === 'pin'));
  // pins sit at (anchor_t, key_bg).
  assert.equal(pins.data[0].value[1], 55);
});

test('buildRibbonOption fades a resolved pin to a check', () => {
  const prompts = [lowPrompt('2026-06-24 03:15:00')];
  const opt = buildRibbonOption(prompts, COLORS, {
    resolved: { '2026-06-24 03:15:00': 'no' },
  });
  const pin = opt.series.find((s) => s.name === 'prompts').data[0];
  assert.equal(pin.label.formatter, '✓');
  assert.ok(pin.itemStyle.opacity < 1);
});

test('buildSparklineOption anchors a low at its nadir', () => {
  const opt = buildSparklineOption(lowPrompt('2026-06-24 03:15:00', 55), COLORS);
  const anchorLine = opt.series[0].markLine.data.find((d) => d.xAxis);
  assert.equal(anchorLine.label.formatter, 'nadir');
  assert.equal(anchorLine.xAxis, '2026-06-24T03:15:00');
});

test('buildSparklineOption labels a missed-meal rise', () => {
  const opt = buildSparklineOption(mealPrompt('2026-06-25 08:30:00'), COLORS);
  const anchorLine = opt.series[0].markLine.data.find((d) => d.xAxis);
  assert.equal(anchorLine.label.formatter, 'rise');
});
