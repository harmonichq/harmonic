import test from 'node:test';
import assert from 'node:assert/strict';

import { auditIdForPlanItem, blockKey, hhmm, stageItemsFor } from './diagnose-workspaces.js';

const analyze = {
  basal: [
    { slot: 2, label: '01:00', asserts_move: true, current: 1, recommended: 1.1 },
    { slot: 3, label: '01:30', asserts_move: false, current: 1, recommended: 1.1 },
    // A merged run's members as the projection publishes them (#372): contiguous
    // slots sharing register and direction, each with its own programmed rate.
    // Slot 12 sits inside the published run without asserting a move of its own.
    { slot: 10, label: '05:00', asserts_move: true, current: 0.6, recommended: 0.48 },
    { slot: 11, label: '05:30', asserts_move: true, current: 0.7, recommended: 0.56 },
    { slot: 12, label: '06:00', asserts_move: false, current: 0.7, recommended: 0.56 },
  ],
  ic_blocks: [
    { block_id: 720, start_min: 720, end_min: 900, current_values: [5],
      recommended: 4.6, member_start_mins: [720, 780], asserts_move: true },
    { block_id: 900, start_min: 900, end_min: 720, current_values: [6],
      recommended: 5.8, member_start_mins: [900], asserts_move: false },
  ],
};

test('backend-qualified basal and I:C items alone map into Plan rows', () => {
  assert.deepEqual(stageItemsFor('basal:2', analyze).map((item) => item.key), [2]);
  assert.deepEqual(stageItemsFor('basal:3', analyze), []);
  assert.deepEqual(stageItemsFor(blockKey(analyze.ic_blocks[0]), analyze)
    .map((item) => item.key), [720, 780]);
  assert.deepEqual(stageItemsFor(blockKey(analyze.ic_blocks[1]), analyze), []);

  const unstamped = structuredClone(analyze);
  delete unstamped.ic_blocks[0].asserts_move;
  assert.deepEqual(stageItemsFor(blockKey(unstamped.ic_blocks[0]), unstamped), []);

  // Deliberate: a float-noise recommendation still stages. A frontend
  // materiality threshold would be a second predicate of the kind #273/#465
  // forbid — if a 1e-12 move should not stage, asserts_move must not say so.
  const close = structuredClone(analyze);
  close.basal[0].recommended = close.basal[0].current + 1e-12;
  assert.deepEqual(stageItemsFor('basal:2', close).map((item) => item.key), [2],
    'the backend predicate remains the only staging gate');
});

test('a merged basal finding maps every eligible published member into Plan rows (#372)', () => {
  // The finding the projection published is `basal:300-390`: three members, of
  // which the first two carry a backend move verdict. Membership is the served
  // list; eligibility is each member's own `asserts_move` with both numbers.
  const members = [300, 330, 360];
  const items = stageItemsFor('basal:10', analyze, members);
  assert.deepEqual(items.map((item) => item.key), [10, 11],
    'every asserting member of the run stages, and only those');
  assert.deepEqual(items.map((item) => [item.start_min, item.current, item.recommended]),
    [[300, 0.6, 0.48], [330, 0.7, 0.56]],
    'each member keeps its own served numbers rather than the head slot\'s');
  assert.deepEqual(items.map((item) => item.value), [0.48, 0.56]);

  // Opening on the second member stages the same run, not a different one.
  assert.deepEqual(stageItemsFor('basal:11', analyze, members).map((item) => item.key), [10, 11]);

  // A run whose members none of them assert stages nothing at all.
  assert.deepEqual(stageItemsFor('basal:12', analyze, [360]), []);

  // Called without a member list, a slot key stages exactly its own slot.
  assert.deepEqual(stageItemsFor('basal:10', analyze).map((item) => item.key), [10]);
  assert.deepEqual(stageItemsFor('basal:10', analyze, []).map((item) => item.key), [10],
    'an empty member list is no membership, not a request to stage nothing');
});

test('every staged I:C block member carries an identical ic_block_provenance (#581)', () => {
  const items = stageItemsFor(blockKey(analyze.ic_blocks[0]), analyze);
  assert.equal(items.length, 2);
  const expected = { block_start_min: 720, block_end_min: 900, block_member_start_mins: [720, 780] };
  for (const item of items) {
    assert.deepEqual(item.ic_block_provenance, expected);
  }
  // Basal items carry no I:C provenance at all.
  for (const item of stageItemsFor('basal:2', analyze)) {
    assert.equal(item.ic_block_provenance, undefined);
  }
});

test('the stale aggregate basal key cannot stage sibling slots', () => {
  // #601 regression guard, ported from the pre-workstation suite.
  assert.deepEqual(stageItemsFor('basal_rate', analyze), []);
});

test('Plan rows resolve back to their backend-owned Diagnose item', () => {
  assert.equal(auditIdForPlanItem({ type: 'basal', key: 2, start_min: 60 }, analyze), 'basal:2');
  assert.equal(auditIdForPlanItem({ type: 'basal', key: 3, start_min: 90 }, analyze), null);
  assert.equal(auditIdForPlanItem({ type: 'ic', start_min: 780 }, analyze), 'ic:720');
  assert.equal(auditIdForPlanItem({ type: 'isf' }, analyze), 'isf');
});

test('hhmm pins midnight, wrap, negative, noon, and end boundaries', () => {
  assert.equal(hhmm(0), '00:00');
  assert.equal(hhmm(720), '12:00');
  assert.equal(hhmm(1439), '23:59');
  assert.equal(hhmm(1440), '00:00');
  assert.equal(hhmm(1500), '01:00');
  assert.equal(hhmm(-5), '23:55');
});
