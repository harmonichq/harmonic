/* Diagnose Plan-staging helpers.
 *
 * What survives of the #636 Diagnose module after #654 replaced its surface with
 * the locked mock's own code (frontend/diagnose-workstation.js). These two
 * functions are not part of that surface: they map a staged parameter item onto
 * the app's Plan draft and back, which is app wiring the mock has no notion of.
 *
 * Deliberately Vue-free. The server owns evidence, rank, the active threshold,
 * and every eligibility decision; nothing here re-derives one.
 */

const DAY = 1440;

export const hhmm = (minutes) => {
  const wrapped = ((Number(minutes) % DAY) + DAY) % DAY;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};
export const blockKey = (block) =>
  `carb_ratio:${block.block_id}:${(block.current_values || [])[0]}`;
export function stageItemsFor(key, analyze = {}, memberStartMins = null) {
  if (String(key).startsWith('basal:')) {
    /* #372: a merged finding covers a RUN of slots, and the projection publishes
       that run as the row's `members`. Given those served start minutes, every
       member the backend qualifies stages together; given none, the key names its
       own slot, which is what a single-slot finding is. Membership is read from
       the row — never expanded from the key's own minutes — and eligibility stays
       the backend's `asserts_move` with both numbers present, which is the ONE
       predicate the surface's tally is built from too. */
    const members = memberStartMins?.length ? new Set(memberStartMins) : null;
    return (analyze.basal || [])
      .filter((slot) => slot.asserts_move === true && slot.recommended != null
        && slot.current != null
        && (members ? members.has(slot.slot * 30) : key === `basal:${slot.slot}`))
      .map((slot) => ({
        type: 'basal', key: slot.slot, start_min: slot.slot * 30, label: slot.label,
        current: slot.current, recommended: slot.recommended, value: slot.recommended,
      }));
  }
  if (String(key).startsWith('carb_ratio:')) {
    const block = (analyze.ic_blocks || []).find((candidate) => blockKey(candidate) === key);
    if (!block || block.asserts_move !== true || block.recommended == null) return [];
    // #581: stamp every fanned-out member row with the block it came from, so a
    // later Plan-lifecycle edit (or Verify trial) can bind evidence back to the
    // whole block rather than one arbitrary member slot. The list is a copy so
    // no downstream mutation of one item's provenance can leak into the block.
    const provenance = {
      block_start_min: block.start_min,
      block_end_min: block.end_min,
      block_member_start_mins: [...(block.member_start_mins || [])],
    };
    return (block.member_start_mins || []).map((start) => ({
      type: 'ic', key: start, start_min: start, label: hhmm(start),
      current: (block.current_values || [])[0], recommended: block.recommended,
      value: block.recommended, ic_block_provenance: provenance,
    }));
  }
  return [];
}

export function auditIdForPlanItem(item, analyze = {}) {
  if (!item) return null;
  if (item.type === 'isf') return 'isf';
  if (item.type === 'ic') {
    const block = (analyze.ic_blocks || []).find((candidate) =>
      (candidate.member_start_mins || []).includes(item.start_min));
    return block ? `ic:${block.block_id}` : null;
  }
  if (item.type === 'basal') {
    const owner = (analyze.basal || []).find((slot) => slot.asserts_move === true
      && (slot.slot === item.key || slot.slot * 30 === item.start_min));
    return owner ? `basal:${owner.slot}` : null;
  }
  return null;
}

/* Diagnose workstation (#636). The shell is mounted once; level changes replace
 * only the inspector body, and ECharts owns one persistent canvas instance. */
