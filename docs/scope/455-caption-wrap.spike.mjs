// #455 spike — does ECharts 5.5's text engine (ZRender 5.5) wrap the glucose
// overview's window caption with every word kept whole, where must the
// stacking line break sit, and does a knock-out pad on the rich tokens stay
// inside the caption's region? Port-free; run after `npm ci`:
//
//   node docs/scope/455-caption-wrap.spike.mjs
//
// Node has no canvas, so ZRender's fallback measurer under-reports widths by
// about half. The spike installs a per-character measurer (0.56 of the type
// size) so the wraps it prints are the shape a browser paints; only the replay
// proves the painted pixels. Exits nonzero on any failed expectation.
import { setPlatformAPI } from 'zrender/lib/core/platform.js';

setPlatformAPI({
  measureText(text, font) {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(font || '12px')[1]);
    return { width: text.length * size * 0.56 };
  },
});
const { parseRichText } = await import('zrender/lib/graphic/helper/parseText.js');

const TAIL = 'INSUFFICIENT SAMPLE — thinnest bin holds 0';
const words = (text) => text.split(/\s+/).filter((word) => word && word !== '·');
let failed = 0;
const report = (ok, line) => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`);
};

/* ---- 1. Where the stacking newline must sit (no pad) ----------------------- */
const plain = (width) => ({
  font: '700 10px sans-serif', width, overflow: 'break',
  rich: { th: { font: '700 9.5px sans-serif' } },
});
const linesOf = (text, width) => parseRichText(text, plain(width)).lines
  .map((line) => line.tokens.map((token) => token.text).join(''));
for (const [name, formatter, width, expectedLines, expectWhole] of [
  ['newline opens the rich token (24 h at 832)', `24 H 00:00–24:00{th|\n${TAIL}}`, 306, 2, true],
  ['newline opens the rich token, narrow margin', `AFTERNOON 12:00–18:00{th|\n${TAIL}}`, 152, 3, true],
  // With `overflow: 'break'` on, a newline that ENDS a plain segment is dropped,
  // so the head and the tail fuse into one line and one word ("24:00INSUFFICIENT").
  ['newline ends the plain segment (the trap)', `24 H 00:00–24:00\n{th|${TAIL}}`, 306, 1, false],
  ['one line that fits is left alone', `24 H 00:00–24:00{th|  ·  ${TAIL}}`, 400, 1, true],
]) {
  const lines = linesOf(formatter, width);
  const whole = JSON.stringify(words(lines.join(' ')))
    === JSON.stringify(words(formatter.replace(/\{th\||\}/g, ' ')));
  report(whole === expectWhole && lines.length === expectedLines,
    `${name} @${width}px → ${JSON.stringify(lines)} (words whole: ${whole})`);
}

/* ---- 2. The pad on the rich tokens stays inside the region ----------------
   The pad rides the tokens (`hd` for the head, `th` for the tail), because
   ZRender draws a label-level background at the content block's full width,
   which is the label's `width` once one is set (checked below), while a
   token's background is drawn at the token's own width, its horizontal
   padding included. So the label `width` is the region less the token's two
   5 px side pads, and every token box then fits the region. Padding is given
   in ECharts' normalized four-value form, as ZRender reads it.
   The opening newline's empty first piece is not added to a line that already
   holds the head, so it moves nothing. `place` mirrors ZRender's
   `_renderRichText`: each line's tokens are laid from the right edge for a
   right-aligned label, from the left for a left-aligned one, and centred as a
   run for a centred one, inside a content box `width` wide anchored at `x`. */
const PAD = [2, 5, 2, 5];
const padded = (width, labelBackground = false) => ({
  font: '700 10px sans-serif', width, overflow: 'break',
  ...(labelBackground ? { backgroundColor: '#000' } : {}),
  rich: {
    hd: { font: '700 10px sans-serif', padding: PAD, backgroundColor: '#000' },
    th: { font: '700 9.5px sans-serif', padding: PAD, backgroundColor: '#000' },
  },
});
function place(block, x, align, width) {
  const left = align === 'right' ? x - width : align === 'center' ? x - width / 2 : x;
  const boxes = [];
  for (const line of block.lines) {
    const run = line.tokens.reduce((sum, token) => sum + token.width, 0);
    let cursor = align === 'right' ? left + width - run
      : align === 'center' ? left + (width - run) / 2 : left;
    for (const token of line.tokens) {
      if (!token.isLineHolder && token.text) boxes.push({ text: token.text, x0: cursor, x1: cursor + token.width });
      cursor += token.width;
    }
  }
  return boxes;
}
// Regions at 832 wide (#chart 402, plot 34–350): each case names its region
// [r0, r1], the label's anchor x and alignment, as renderCanvas would place it.
const regionCases = [
  ['24 h, inside, centred', '24 H 00:00–24:00', [39, 345], 192, 'center'],
  ['Evening, parked left', 'EVENING 18:00–24:00', [34, 267.5], 267.5, 'right'],
  ['Afternoon, parked left', 'AFTERNOON 12:00–18:00', [34, 187.7], 187.7, 'right'],
  ['Overnight, parked right', 'OVERNIGHT 00:00–06:00', [119.8, 402], 119.8, 'left'],
  ['a head that itself wraps, parked left', 'AFTERNOON 12:00–18:00', [34, 124], 124, 'right'],
];
for (const [name, head, [r0, r1], x, align] of regionCases) {
  const width = r1 - r0 - 2 * 5;
  const block = parseRichText(`{hd|${head}}{th|\n${TAIL}}`, padded(width));
  const boxes = place(block, x, align, width);
  const over = Math.max(0, ...boxes.map((box) => Math.max(r0 - box.x0, box.x1 - r1)));
  const whole = JSON.stringify(words(boxes.map((box) => box.text).join(' ')))
    === JSON.stringify(words(`${head} ${TAIL}`));
  const holders = block.lines.flatMap((line) => line.tokens).filter((token) => token.isLineHolder).length;
  report(Number.isFinite(over) && over <= 0.01 && whole && holders === 0,
    `${name}, width = region − 10 → ${block.lines.length} lines, every pad inside [${r0}, ${r1}] `
    + `(worst overrun ${over.toFixed(1)}px), words whole ${whole}, empty holders ${holders}`);
}
// Why not a label-level background: its box is the whole `width`, text or not.
const labelBox = parseRichText(`{hd|24 H 00:00–24:00}{th|\n${TAIL}}`, padded(296, true));
report(labelBox.outerWidth === 296,
  `a label-level background spans the full label width (${labelBox.outerWidth}px), not the text`);
process.exit(failed ? 1 : 0);
