import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = readFileSync(
  new URL('../mockups/finding-evidence-routing.behavior.md', import.meta.url),
  'utf8',
);
const replay = readFileSync(
  new URL('./diagnose-workstation-behavior.replay.mjs', import.meta.url),
  'utf8',
);

const idPattern = '[SCD]\\d+';

function expandRange(token) {
  assert.match(
    token,
    new RegExp(`^${idPattern}(?:[–-]${idPattern})?$`),
    `malformed story range: ${token}`,
  );
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
  const registry = source.slice(start, end);
  assert.doesNotMatch(
    registry,
    new RegExp(`\\[\\s*${idPattern}\\s*,`),
    'replay registration IDs must be quoted',
  );
  const quotedIds = [...registry.matchAll(new RegExp(`['"](${idPattern})['"]`, 'g'))];
  const registrations = [...registry.matchAll(/\[\s*['"]([^'"]+)['"]\s*,\s*([^,\]\s]+)\s*,/g)];
  assert.equal(
    registrations.length,
    quotedIds.length,
    'every quoted story ID must begin one parseable replay registration',
  );
  for (const [, id, symbol] of registrations) {
    assert.match(id, new RegExp(`^${idPattern}$`), `malformed replay ID: ${id}`);
    assert.equal(symbol, id, `replay registration ${id} must reference ${id}`);
  }
  const registered = registrations.map((match) => match[1]);
  const tags = [...new Set([...source.matchAll(
    new RegExp(`^// STORY:finding-evidence-routing:(${idPattern})$`, 'gm'),
  )].map((match) => match[1]))];
  return { registered, tags };
}

const initialIssued = parseList('S01–S132, C41–C57, and D1–D3');

function validate(ledgerSource, replaySource) {
  const inventory = ledgerInventory(ledgerSource);
  const { registered, tags } = replayInventory(replaySource);
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
  assert.deepEqual([...registered].sort(), [...inventory.active].sort(), 'active ledger IDs must equal replay IDs');
  assert.deepEqual([...tags].sort(), [...registered].sort(), 'unique STORY tag IDs must equal replay IDs');
  return { ...inventory, registered };
}

export function paritySummary() {
  const baseline = validate(ledger, replay);
  return {
    active: baseline.active.length,
    retired: baseline.retired.length,
    replay: baseline.registered.length,
    mutation_cases: 6,
  };
}

test('Diagnose behavior ledger inventory matches the replay registry', () => {
  assert.doesNotThrow(() => paritySummary());
});

test('Diagnose behavior ledger requires a retirement inventory', () => {
  const withoutRetiredInventory = ledger.replace('**Retired executable IDs:** S117\n', '');
  assert.throws(
    () => validate(withoutRetiredInventory, replay),
    /ledger must declare one retired-ID inventory/,
  );
});

test('Diagnose behavior ledger rejects a replay story removed without retirement', () => {
  const withoutS91 = replay
    .replace("  ['S91', S91, 'drawn'],\n", '')
    .replaceAll('// STORY:finding-evidence-routing:S91', '// RETIRED:finding-evidence-routing:S91');
  assert.throws(
    () => validate(ledger, withoutS91),
    /active ledger IDs must equal replay IDs/,
  );
});

test('Diagnose behavior ledger rejects an issued ID without a replay story', () => {
  const ledgerWithOrphan = ledger
    .replace('**152 issued executable IDs:**', '**153 issued executable IDs:**')
    .replace('S01–S132', 'S01–S133');
  assert.throws(() => validate(ledgerWithOrphan, replay));
});

test('Diagnose behavior ledger accepts a permanent retirement', () => {
  const retiredS91 = ledger
    .replace(
      '**Active executable IDs:** S01–S116, S118–S132, C41–C57, and D1–D3',
      '**Active executable IDs:** S01–S90, S92–S116, S118–S132, C41–C57, and D1–D3',
    )
    .replace('**Retired executable IDs:** S117', '**Retired executable IDs:** S91, S117');
  const withoutS91 = replay
    .replace("  ['S91', S91, 'drawn'],\n", '')
    .replaceAll('// STORY:finding-evidence-routing:S91', '// RETIRED:finding-evidence-routing:S91');
  assert.doesNotThrow(() => validate(retiredS91, withoutS91));
});

test('Diagnose behavior ledger rejects coordinated deletion of an issued ID', () => {
  const deletedS91 = ledger
    .replace('**152 issued executable IDs:**', '**151 issued executable IDs:**')
    .replace('S01–S132', 'S01–S90, S92–S132');
  const withoutS91 = replay
    .replace("  ['S91', S91, 'drawn'],\n", '')
    .replaceAll('// STORY:finding-evidence-routing:S91', '// REMOVED:finding-evidence-routing:S91');
  assert.throws(
    () => validate(deletedS91, withoutS91),
    /issued IDs cannot disappear or be renumbered/,
  );
});

test('Diagnose behavior ledger rejects coordinated renumbering of an issued ID', () => {
  const renumberedS91 = ledger.replace('S01–S132', 'S01–S90, S92–S133');
  const replayWithS133 = replay
    .replace("  ['S91', S91,", "  ['S133', S133,")
    .replaceAll('// STORY:finding-evidence-routing:S91', '// STORY:finding-evidence-routing:S133');
  assert.throws(
    () => validate(renumberedS91, replayWithS133),
    /issued IDs cannot disappear or be renumbered/,
  );
});

test('Diagnose behavior ledger rejects a malformed story range', () => {
  const malformedRange = ledger.replace('S01–S132', 'S01–S132-S999');
  assert.throws(() => validate(malformedRange, replay));
});

test('Diagnose behavior ledger rejects a malformed replay registration', () => {
  const malformedRegistration = replay.replace(
    'export const STORIES = [',
    "export const STORIES = [\n  ['S92', S91, 'typical'],",
  );
  assert.throws(() => validate(ledger, malformedRegistration));
});

test('Diagnose behavior ledger rejects an unquoted replay ID', () => {
  const unquotedRegistration = replay.replace(
    'export const STORIES = [',
    "export const STORIES = [\n  [S91, S91, 'drawn'],",
  );
  assert.throws(() => validate(ledger, unquotedRegistration));
});
