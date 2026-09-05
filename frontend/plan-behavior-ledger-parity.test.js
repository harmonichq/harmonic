// The Plan behaviour ledger and its replay are one contract in two files: every
// issued story ID in the ledger is an exported replay function carrying its
// STORY tag, and nothing is exported that the ledger never issued (#344). This
// is the fast-gate half; the browser gate runs the stories themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ledger = readFileSync(new URL('../mockups/plan.behavior.md', import.meta.url), 'utf8');
const replay = readFileSync(new URL('./plan-behavior.replay.mjs', import.meta.url), 'utf8');

function expandRange(token) {
  const m = token.trim().match(/^S(\d+)(?:[–-]S(\d+))?$/);
  assert.ok(m, `malformed story range: ${token}`);
  const start = Number(m[1]); const end = Number(m[2] ?? m[1]);
  assert.ok(start <= end, `reversed story range: ${token}`);
  return Array.from({ length: end - start + 1 }, (_, i) => `S${start + i}`);
}
function parseList(value) {
  if (value.trim() === 'none') return [];
  return value.replace(/,?\s+and\s+/g, ', ').split(/,\s*/).flatMap(expandRange);
}
function ledgerInventory(source) {
  const issued = source.match(/^\*\*(\d+) issued executable IDs:\*\* (.+)$/m);
  const active = source.match(/^\*\*Active executable IDs:\*\* (.+)$/m);
  const retired = source.match(/^\*\*Retired executable IDs:\*\* (.+)$/m);
  assert.ok(issued && active && retired, 'ledger must declare issued, active and retired inventories');
  return { declared: Number(issued[1]), issued: parseList(issued[2]), active: parseList(active[1]), retired: parseList(retired[1]) };
}
function replayInventory(source) {
  const registry = source.match(/export const STORIES = \{([^}]+)\}/);
  assert.ok(registry, 'replay must register stories in one STORIES object');
  const registered = registry[1].split(',').map((s) => s.trim()).filter(Boolean);
  const tags = [...new Set([...source.matchAll(/^\/\/ STORY:plan:(S\d+)$/gm)].map((m) => m[1]))];
  const exported = [...source.matchAll(/^export const (S\d+) = async/gm)].map((m) => m[1]);
  return { registered, tags, exported };
}

test('the Plan ledger inventory is internally consistent', () => {
  const inv = ledgerInventory(ledger);
  assert.equal(inv.declared, inv.issued.length, 'declared count equals issued IDs');
  assert.equal(new Set(inv.issued).size, inv.issued.length, 'issued IDs are unique');
  assert.deepEqual(inv.active.filter((id) => inv.retired.includes(id)), [], 'active and retired are disjoint');
  assert.deepEqual([...inv.active, ...inv.retired].sort(), [...inv.issued].sort(), 'every issued ID is active or retired');
});

test('every active Plan story is exported, registered and tagged in the replay', () => {
  const inv = ledgerInventory(ledger);
  const rep = replayInventory(replay);
  assert.deepEqual([...rep.registered].sort(), [...inv.active].sort(), 'STORIES registry equals the active ledger IDs');
  assert.deepEqual([...rep.exported].sort(), [...inv.active].sort(), 'exported story functions equal the active ledger IDs');
  assert.deepEqual([...rep.tags].sort(), [...inv.active].sort(), 'STORY:plan tags equal the active ledger IDs');
  for (const id of inv.active) {
    assert.match(ledger, new RegExp(`^${id} · `, 'm'), `ledger carries an entry for ${id}`);
  }
});
