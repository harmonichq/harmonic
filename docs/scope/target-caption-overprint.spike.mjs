/**
 * Ticket #370 triage spike — is the TARGET caption struck by a window gate?
 *
 * The drawn-window brace is a DOM overlay (`.brace`, z-index 4) painted OVER the
 * ECharts canvas: a full-plot-height 1px `.edge` line at each gate, and a 7x22px
 * OPAQUE `.grip` pill centred on it. No ECharts `z` can win against it, so the
 * caption's knock-out pad — which does defeat the gridlines and the dashed 180
 * rule, both of which are canvas — loses to the gates.
 *
 * `paintBrace` places both gates with `xAtMinute`, which this chart module
 * exports. So the module can decide "would a gate strike the caption?" from the
 * SAME function that draws the gate — no second copy of the geometry.
 *
 * Run: node docs/scope/target-caption-overprint.spike.mjs
 */
import { GRID, plotBox, xAtMinute } from '../../frontend/diagnose-workstation-chart.js';

/* Mirrors the module's private `estimateTextPx` (diagnose-workstation-chart.js).
   The caption is drawn into a canvas, so there is no measuring context; the
   per-character estimate is all a fit/no-fit decision needs. */
const estimateTextPx = (text, fontSize) => text.length * fontSize * 0.52;

const CAPTION = 'TARGET 70–180 mg/dL';   // formatter at diagnose-workstation-chart.js:1036
const LABEL_PAD_X = 5;                   // label padding [2, 5]
const GRIP_HALF = 4;                     // .brace .grip is 7px wide, margin-left -4px

/* Chart element clientWidth measured in the running app (8803, Overnight preset)
   at each viewport width. plotBox reads clientWidth only. */
const MEASURED = [
  { viewport: 390, chartWidth: 390 },
  { viewport: 768, chartWidth: 399.6 },
  { viewport: 900, chartWidth: 470 },
  { viewport: 1100, chartWidth: 670 },
  { viewport: 1440, chartWidth: 1010 },
];

const OVERNIGHT = [0, 360];              // the preset pressed on cold load

const round = (n) => Math.round(n * 10) / 10;

console.log('caption glyph run vs the two drawn gate edges — Overnight, axis 40-220');
console.log('viewport  chartW   plotLeft  glyphRun          gateA   gateB   struck by');
for (const { viewport, chartWidth } of MEASURED) {
  const el = { clientWidth: chartWidth };
  const box = plotBox(el);
  const glyphLeft = box.left + LABEL_PAD_X;
  const glyphRight = glyphLeft + estimateTextPx(CAPTION, 10);
  const gates = OVERNIGHT.map((m) => xAtMinute(el, m));
  const struck = gates
    .map((x, i) => ({ x, name: i === 0 ? 'gateA' : 'gateB' }))
    .filter(({ x }) => x + GRIP_HALF > glyphLeft && x - GRIP_HALF < glyphRight)
    .map(({ name }) => name);
  console.log(
    `${String(viewport).padStart(8)}  ${String(chartWidth).padStart(6)}   `
    + `${String(round(box.left)).padStart(8)}  `
    + `${`${round(glyphLeft)}–${round(glyphRight)}`.padEnd(16)}  `
    + `${String(round(gates[0])).padStart(5)}   ${String(round(gates[1])).padStart(5)}   `
    + (struck.length ? struck.join(', ') : '—'),
  );
}
console.log(`\nGRID.left=${GRID.left} — the caption is anchored to the plot's left edge,`);
console.log('so gateA always sits on its pad; only a gate INSIDE the glyph run hides a digit.');
