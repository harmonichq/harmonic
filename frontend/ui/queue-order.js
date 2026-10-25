// The Queue's order rule (#518, ADR 629): a candidate is in the Queue when the
// engine admitted it, the person has not snoozed it, and no Done on it waits for
// the pump. It reads those served fields and derives nothing. The live adapter
// composes the served guidance with it, and the Queue model draws a write in
// flight by it; the stories' fixture generator keeps its Python copy
// (gen_ui_fixtures._queue_store), which the live contract tests compare.
//
// Plain JS, so node --test and the TypeScript models share it.

/** @param {{ admitted: boolean, set_aside: boolean, acknowledgment?: { state?: string } | null }} candidate */
export const queued = (candidate) => candidate.admitted && !candidate.set_aside
  && candidate.acknowledgment?.state !== 'waiting';
