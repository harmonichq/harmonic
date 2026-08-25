import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = readFileSync(
  new URL('../../mockups/finding-evidence-routing.behavior.md', import.meta.url),
  'utf8',
);
const replay = readFileSync(
  new URL('../../frontend/diagnose-workstation-behavior.replay.mjs', import.meta.url),
  'utf8',
);

const idPattern = '[SCD]\\d+';

function expandRange(token) {
  const [first, last = first] = token.split(/[–-]/);
  const prefix = first[0];
  assert.equal(last[0], prefix, `mixed story range: ${token}`);
  const width = first.length - 1;
  const start = Number(first.slice(1));
  const end = Number(last.slice(1));
  assert.ok(start <= end, `reversed story range: ${token}`);
  return Array.from(
    { length: end - start + 1 },
    (_, offset) => `${prefix}${String(start + offset).padStart(width, '0')}`,
  );
}

function parseList(value, issued = []) {
  if (value.trim() === 'all issued') return [...issued];
  if (value.trim() === 'none') return [];
  return value
    .replace(/,?\s+and\s+/g, ', ')
    .split(/,\s*/)
    .flatMap(expandRange);
}

function ledgerInventory(source) {
  const issued = [...source.matchAll(/^\*\*(\d+) issued executable IDs:\*\* (.+)$/gm)];
  const active = [...source.matchAll(/^\*\*Active executable IDs:\*\* (.+)$/gm)];
  const retired = [...source.matchAll(/^\*\*Retired executable IDs:\*\* (.+)$/gm)];
  assert.equal(issued.length, 1, 'ledger must declare one issued-ID inventory');
  assert.equal(active.length, 1, 'ledger must declare one active-ID inventory');
  assert.equal(retired.length, 1, 'ledger must declare one retired-ID inventory');
  const issuedIds = parseList(issued[0][2]);
  return {
    declared: Number(issued[0][1]),
    issued: issuedIds,
    active: parseList(active[0][1], issuedIds),
    retired: parseList(retired[0][1], issuedIds),
  };
}

function replayInventory(source) {
  const start = source.indexOf('export const STORIES = [');
  const end = source.indexOf('\n];', start);
  assert.ok(start >= 0 && end > start, 'replay must register stories in one array');
  return [...source.slice(start, end).matchAll(
    new RegExp(`\\['(${idPattern})', \\1,`, 'g'),
  )].map((match) => match[1]);
}

const initialIssued = parseList('S01–S91, C41–C57, and D1–D3');

function validate(ledgerSource, replaySource) {
  const inventory = ledgerInventory(ledgerSource);
  const registered = replayInventory(replaySource);
  assert.equal(new Set(inventory.active).size, inventory.active.length, 'active ledger IDs must be unique');
  assert.equal(new Set(inventory.retired).size, inventory.retired.length, 'retired ledger IDs must be unique');
  assert.equal(new Set(registered).size, registered.length, 'replay IDs must be unique');
  assert.equal(new Set(inventory.issued).size, inventory.issued.length, 'issued ledger IDs must be unique');
  assert.equal(inventory.declared, inventory.issued.length, 'declared count must equal issued ledger IDs');
  assert.deepEqual(
    [...inventory.issued].sort(),
    [...initialIssued].sort(),
    'issued IDs cannot disappear or be renumbered without updating the compact guard',
  );
  assert.deepEqual(
    inventory.active.filter((id) => inventory.retired.includes(id)),
    [],
    'active and retired ledger IDs must be disjoint',
  );
  assert.deepEqual(
    [...inventory.active, ...inventory.retired].sort(),
    [...inventory.issued].sort(),
    'every issued ID must remain active or carry a permanent retirement',
  );
  assert.deepEqual([...registered].sort(), [...inventory.active].sort());
  return { ...inventory, registered };
}

const proposedLedger = ledger.replace(
  /\*\*(\d+) executable entries\*\*\s*\n?\(([^)]+)\), all/,
  '\n**$1 issued executable IDs:** $2\n**Active executable IDs:** all issued\n**Retired executable IDs:** none\nAll',
);
assert.notEqual(proposedLedger, ledger, 'current ledger header must be promoted to the proposed grammar');

const baseline = validate(proposedLedger, replay);

const withoutRetiredInventory = proposedLedger.replace('**Retired executable IDs:** none\n', '');
assert.throws(() => validate(withoutRetiredInventory, replay));

const withoutS91 = replay.replace("  ['S91', S91,", "  ['REMOVED_S91', S91,");
assert.throws(() => validate(proposedLedger, withoutS91));

const ledgerWithOrphan = proposedLedger
  .replace('**111 issued executable IDs:**', '**112 issued executable IDs:**')
  .replace('S01–S91', 'S01–S92');
assert.throws(() => validate(ledgerWithOrphan, replay));

const retiredS91 = proposedLedger
  .replace('**Active executable IDs:** all issued',
    '**Active executable IDs:** S01–S90, C41–C57, and D1–D3')
  .replace('**Retired executable IDs:** none', '**Retired executable IDs:** S91');
validate(retiredS91, withoutS91);

const coordinatedDeletion = proposedLedger
  .replace('**111 issued executable IDs:**', '**110 issued executable IDs:**')
  .replace('S01–S91', 'S01–S90');
assert.throws(() => validate(coordinatedDeletion, withoutS91));

const replayWithS92 = replay
  .replace("  ['S91', S91,", "  ['S92', S92,");
const coordinatedRenumber = proposedLedger.replace('S01–S91', 'S01–S90, S92');
assert.throws(() => validate(coordinatedRenumber, replayWithS92));

console.log(JSON.stringify({
  active: baseline.active.length,
  retired: baseline.retired.length,
  replay: baseline.registered.length,
  mutation_cases: 6,
}));
