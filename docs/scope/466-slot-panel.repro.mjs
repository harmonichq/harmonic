// #466 reproduction: the desk's slot panel on a served recurring-lows lower.
// Synthetic data only. Run from the repository root:
//
//   node docs/scope/466-slot-panel.repro.mjs
//
// It asks `466-recurring-low-explain.repro.py --row` for the served 03:00 row,
// builds its lane cell and renders the slot panel into a minimal fake document.
import { execFileSync } from 'node:child_process';
import { buildSlotLane } from '../../frontend/diagnose-workstation-chart.js';
import { renderSlotLevel } from '../../frontend/diagnose-workstation.js';

class Node {
  constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.html = []; this.dataset = {}; this.innerHTML = ''; }
  append(...nodes) { this.children.push(...nodes); }
  insertAdjacentHTML(_, html) { this.html.push(html); }
  addEventListener() {}
  setAttribute() {}
}
const text = (node) => [node.innerHTML, ...node.html, ...node.children.map(text)].join(' ');

const row = JSON.parse(execFileSync('uv', ['run', '--quiet', 'python',
  'docs/scope/466-recurring-low-explain.repro.py', '--row'], { encoding: 'utf8' }));
const [cell] = buildSlotLane([row]).cells;
globalThis.document = { createElement: (tag) => new Node(tag) };
const host = new Node();
renderSlotLevel(host, cell, new Set(), 30, 8, () => {}, { nightEvidence: { pending: true } });
const words = text(host).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

console.log(`served status ${JSON.stringify(row.safety_status)}, asserts_move ${row.asserts_move}`);
console.log(`stage button: ${/Stage change/.test(words)}`);
console.log(`"not established by it": ${/not established by it/.test(words)}`);
console.log(`"something outside the estimate set it": ${/something outside the estimate set it/.test(words)}`);
console.log(`served lows ${row.evidence.harm.lows.length}; a low's date in the panel: ${/Jul 11|2022-07-11/.test(words)}`);
