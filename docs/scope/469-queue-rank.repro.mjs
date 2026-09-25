/* #469 reproduction: where the rail breaks the one urgency ranking.

   Synthetic data only. Run from the repository root:

       node docs/scope/469-queue-rank.repro.mjs

   Reads the committed findings-projection fixture (the server's own frozen
   answers) through the rail's pure `queueRows`, and prints each ranked row's
   position, served priority, tier, caption, stripe, and its own count. */
import { readFileSync } from 'node:fs';
import { queueRows, TAIL_NOTE } from '../../frontend/diagnose-findings-queue.js';

const fixture = JSON.parse(readFileSync(
  new URL('../../frontend/__fixtures__/findings-projection.json', import.meta.url), 'utf8'));

function report(label, projection) {
  const rows = queueRows(projection).filter((row) => !row.hidden && !row.collapsed);
  console.log(`${label}`);
  for (const row of rows) {
    const raw = row.raw;
    const count = (raw.count_sentences || []).map((s) => s.sentence).join(' · ');
    const fields = [
      row.rank == null ? '  -' : String(row.rank).padStart(3),
      raw.id.padEnd(32),
      `priority ${raw.priority ?? '—'}`.padEnd(13),
      `tier ${row.tier}`.padEnd(18),
      row.caption ? `caption "${row.caption}"` : '',
      row.seam ? `seam "${TAIL_NOTE}"` : '',
      row.urgent ? 'urgent' : '',
      raw.kind === 'pattern' ? `route ${raw.pattern.admission_route}` : '',
      count ? `[${count}]` : '',
      raw.parameter === 'isf' ? `asserts_move ${raw.asserts_move} direction ${raw.direction}` : '',
    ];
    console.log(`  ${fields.filter(Boolean).join('  ')}`);
  }
  const captions = rows.filter((row) => row.caption).map((row) => row.caption);
  const first = rows.find((row) => row.rank === 1);
  console.log(`  tier words painted: ${[first?.tier, ...captions].filter(Boolean).length}`
    + ` (rank 1 "${first?.tier}", captions ${JSON.stringify(captions)})`);
}

for (const name of ['global', 'afternoon', 'drawn', 'low_block']) {
  report(`windows.${name}`, fixture.windows[name]);
}
report('direction_only_windows.global', fixture.direction_only_windows.global);
report('browser_windows.0-360', fixture.browser_windows['0-360']);
