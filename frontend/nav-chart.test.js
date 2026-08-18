// Node built-in test runner (no npm). Covers the vue-free navigator core (#248, ADR 0031):
// severity encoding (lows win the tie), sparkline + week-ribbon geometry, calendar helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  navSeverity, navDaySummary, washOpacity, dayCurve, sparkGeom, weekRibbonGeom,
  fmtISO, monthOf, weekOf, monthCells,
} from './nav-chart.js';

test('navSeverity: lows win the tie even when highs outnumber', () => {
  const s = navSeverity({ lows: 1, highs: 4, tir: 40 });
  assert.equal(s.varName, '--low');
  assert.equal(s.glyph, '▽1 △4');
  assert.equal(s.label, '1 low, 4 highs');
});

test('navDaySummary: no-flag day names TIR once', () => {
  assert.equal(navDaySummary({ lows: 0, highs: 0, tir: 75 }), 'on target, 75% TIR');
  assert.equal(navDaySummary({ lows: 0, highs: 0, tir: 60 }), 'in range, 60% TIR');
});

test('navSeverity: two+ lows label pluralizes', () => {
  assert.equal(navSeverity({ lows: 3, highs: 0, tir: 50 }).label, '3 lows');
  assert.equal(navSeverity({ lows: 1, highs: 0, tir: 50 }).label, '1 low');
});

test('navSeverity: high-heavy when no lows and below target (ADR 0031)', () => {
  const s = navSeverity({ lows: 0, highs: 3, tir: 55 });
  assert.equal(s.varName, '--high');
  assert.equal(s.glyph, '△3');
});

test('navSeverity: green at TIR >= 70 with 0 lows (ADR 0031 impl default)', () => {
  assert.equal(navSeverity({ lows: 0, highs: 0, tir: 72 }).varName, '--on-target');
  // green wins over highs once at-target, even with some highs present
  assert.equal(navSeverity({ lows: 0, highs: 2, tir: 74 }).varName, '--on-target');
});

test('navSeverity: neutral in-range when below target with no lows/highs', () => {
  assert.equal(navSeverity({ lows: 0, highs: 0, tir: 60 }).varName, '--in-range');
});

test('washOpacity: problem days glow brighter than calm days', () => {
  assert.ok(washOpacity({ varName: '--low' }) > washOpacity({ varName: '--on-target' }));
  assert.ok(washOpacity({ varName: '--high' }) > washOpacity({ varName: '--in-range' }));
});

test('dayCurve: passes through a curve, guards a missing one', () => {
  assert.deepEqual(dayCurve({ curve: [{ x: 0, bg: 100 }] }), [{ x: 0, bg: 100 }]);
  assert.deepEqual(dayCurve(null), []);
  assert.deepEqual(dayCurve({}), []);
});

test('sparkGeom: builds a path, in-range band, and severity excursion dots', () => {
  const pts = [{ x: 0, bg: 60 }, { x: 0.5, bg: 120 }, { x: 1, bg: 200 }];
  const g = sparkGeom(pts, 100, 30);
  assert.ok(g.line.startsWith('M'));
  assert.ok(g.area.endsWith('Z'));
  assert.ok(g.band.h > 0);
  assert.ok(g.hasLow);   // the 60
  assert.ok(g.hasHigh);  // the 200
});

test('weekRibbonGeom: a no-data day breaks the trace into separate subpaths', () => {
  const days = [
    { iso: '2026-06-14', dom: 14, dow: 0 },
    { iso: '2026-06-15', dom: 15, dow: 1 },
    { iso: '2026-06-16', dom: 16, dow: 2 },
  ];
  const curves = [
    [{ x: 0, bg: 100 }, { x: 1, bg: 110 }],
    [],  // gap
    [{ x: 0, bg: 120 }, { x: 1, bg: 130 }],
  ];
  const g = weekRibbonGeom(days, curves, 300, 58);
  assert.equal(g.segments.length, 3);
  assert.equal(g.segments[1].hasData, false);
  assert.equal(g.subpaths.length, 2, 'the gap splits the trace');
});

test('calendar helpers: fmtISO / monthOf / weekOf / monthCells', () => {
  assert.equal(fmtISO(2026, 6, 3), '2026-06-03');
  assert.deepEqual(monthOf('2026-06-17'), { y: 2026, m: 6 });

  const wk = weekOf('2026-06-17');    // Wed Jun 17 2026 → week Sun Jun 14 .. Sat Jun 20
  assert.equal(wk.length, 7);
  assert.equal(wk[0], '2026-06-14');
  assert.equal(wk[6], '2026-06-20');
  assert.ok(wk.includes('2026-06-17'));

  const cells = monthCells(2026, 6);  // June 2026 starts on a Monday → 1 leading blank
  assert.equal(cells[0].blank, true);
  const first = cells.find((c) => !c.blank);
  assert.equal(first.iso, '2026-06-01');
  assert.equal(cells.filter((c) => !c.blank).length, 30);
});
