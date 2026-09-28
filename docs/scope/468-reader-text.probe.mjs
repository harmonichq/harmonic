// #468 probe: the shipped Episode Log over every showcase day the Python probe
// dumped. Prints each day whose Quiet span covers a Findings row, and how many
// days carry one quiet anchor. Synthetic inputs only.
//
// Run from the repo root: node docs/scope/468-reader-text.probe.mjs "$TMPDIR/468-days.json"
import { readFileSync } from 'node:fs';
import { buildEpisodeLedger, clock } from '../../frontend/day-chart.js';

const days = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let single = 0;
for (const day of days) {
  const ledger = buildEpisodeLedger(day);
  if (!ledger.quiet.rows.length) continue;
  if (ledger.quiet.rows.length === 1) single += 1;
  const covered = ledger.findings.map((entry) => entry.row.t)
    .filter((t) => t > ledger.quiet.start && t < ledger.quiet.end);
  if (covered.length) {
    console.log(`${day.date}: Quiet ${ledger.quiet.rows.length}, span ${clock(ledger.quiet.start)}–${clock(ledger.quiet.end)}, covers Findings at ${covered.map(clock).join(', ')}`);
  }
}
console.log(`days with Quiet rows and exactly one quiet anchor: ${single}`);
