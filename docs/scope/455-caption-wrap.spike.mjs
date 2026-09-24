// #455 spike — does ECharts 5.5's text engine (ZRender 5.5) wrap the glucose
// overview's window caption with every word kept whole, and where must the
// stacking line break sit? Port-free; run after `npm ci`:
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
const style = (width) => ({
  font: '700 10px sans-serif', width, overflow: 'break',
  rich: { th: { font: '700 9.5px sans-serif' } },
});
const linesOf = (text, width) => parseRichText(text, style(width)).lines
  .map((line) => line.tokens.map((token) => token.text).join(''));
const words = (text) => text.split(/\s+/).filter((word) => word && word !== '·');

const cases = [
  // [name, formatter, wrap width, expected line count, words expected whole]
  ['newline opens the rich token (24 h at 832)', `24 H 00:00–24:00{th|\n${TAIL}}`, 306, 2, true],
  ['newline opens the rich token, narrow margin', `AFTERNOON 12:00–18:00{th|\n${TAIL}}`, 152, 3, true],
  // With `overflow: 'break'` on, a newline that ENDS a plain segment is dropped,
  // so the head and the tail fuse into one line and one word ("24:00INSUFFICIENT").
  ['newline ends the plain segment (the trap)', `24 H 00:00–24:00\n{th|${TAIL}}`, 306, 1, false],
  ['one line that fits is left alone', `24 H 00:00–24:00{th|  ·  ${TAIL}}`, 400, 1, true],
];
let failed = 0;
for (const [name, formatter, width, expectedLines, expectWhole] of cases) {
  const lines = linesOf(formatter, width);
  const whole = JSON.stringify(words(lines.join(' ')))
    === JSON.stringify(words(formatter.replace(/\{th\||\}/g, ' ')));
  const ok = whole === expectWhole && lines.length === expectedLines;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} @${width}px → ${JSON.stringify(lines)} (words whole: ${whole})`);
}
process.exit(failed ? 1 : 0);
