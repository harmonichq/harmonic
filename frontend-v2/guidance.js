// The desk's one guidance read: what leads, why it leads, and what the wearer
// has set aside.
//
// WHAT THIS MODULE OWNS. `/api/guidance` is the backend's answer to "which one
// concern needs attention", and three destinations ask that question — Changes
// leads with it, Diagnose marks the roster row it selected, and Plan stages from
// the action it carries. One read, held here, is why they cannot disagree about
// it; three private fetches would let them.
//
// It owns three rules the API alone does not enforce:
//
//   1. A FAILED READ KEEPS THE LAST READ THAT ANSWERED. It is labelled as
//      failed, and nothing about it is presented as current (HV2-31, S19/S20).
//      A failure never edits what a previous read established.
//   2. SET ASIDE AND RESTORE RE-READ. They are durable Store writes OUTSIDE the
//      #387 receipt envelope — no request_id, no input_revision, a plain-string
//      `detail` on 409/404 — so a retry is not idempotent by receipt and the
//      `{subject, set_aside}` answer describes one row rather than the whole
//      read. The only way to know what leads next is to ask again (HV2-16, S88).
//   3. A FAILED WRITE IS NOT A SET-ASIDE. The error is held and shown; the
//      roster is not edited in anticipation of a write that did not land.
//
// It derives NO clinical verdict. The disposition, the selection, the ordering,
// every reason string and the set-aside comparison are the backend's, rendered
// verbatim (lock precedence rule 3).
import { ApiTransportError, fetchGuidance, restoreGuidancePreference, setGuidancePreference } from './client.js';
import { render } from './routes.js';

// `read` is the last read that ANSWERED; `error` is the state of the most
// recent attempt. Both can be set at once — that is the S20 state exactly.
const memory = { read: null, error: null, writeError: null };
let pending = null;

/** The last guidance read that answered, or null before the first one has. */
export const guidance = () => memory.read;

/** The failure of the most recent read, or null. A read that answered clears it. */
export const guidanceError = () => memory.error;

/** The failure of the most recent set-aside or restore, or null. */
export const guidanceWriteError = () => memory.writeError;

/** True once a read has either answered or failed, so a frame can stop loading. */
export const guidanceSettled = () => memory.read !== null || memory.error !== null;

/**
 * Read `/api/guidance`, at most one read in flight.
 *
 * Idempotent by default: a render that finds the guidance already read does not
 * ask again. `force` is the re-read every write owes, and the Retry control.
 */
export function loadGuidance({ force = false } = {}) {
  if (pending) return pending;
  if (memory.read && !force && !memory.error) return;
  pending = fetchGuidance().then((payload) => {
    pending = null;
    memory.read = payload;
    memory.error = null;
    render();
  }).catch((error) => {
    pending = null;
    // The former read stays exactly as it was. Only the error moves.
    memory.error = error;
    render();
  });
  return pending;
}

/** Clear a write failure once the reader has seen it and moved on. */
export function clearGuidanceWriteError() {
  memory.writeError = null;
}

// Both writes share one shape: attempt, then re-read whatever happened. A
// failure re-reads too, because a 409 means this desk's copy is already behind.
async function write(run) {
  memory.writeError = null;
  try {
    await run();
  } catch (error) {
    memory.writeError = error;
  }
  await loadGuidance({ force: true });
  return memory.writeError === null;
}

/**
 * Set a concern aside, with the wearer's own reason if they gave one.
 * @param {string} subject  a canonical guidance subject
 * @param {string|null} reason
 * @returns {Promise<boolean>} whether the write landed
 */
export function setAside(subject, reason) {
  const generation = memory.read?.analysis_generation;
  return write(() => setGuidancePreference(subject, { generation, reason: reason || null }));
}

/**
 * Restore a set-aside concern. It returns to the roster as an eligible subject.
 * @param {string} subject
 * @returns {Promise<boolean>} whether the write landed
 */
export function restore(subject) {
  return write(() => restoreGuidancePreference(subject));
}

/* ------------------------------------------------- reading the served answer */

/** Every candidate this read carries, set aside or not. */
export const candidates = () => memory.read?.candidates || [];

/** One candidate by its canonical subject, or null. */
export const candidateFor = (subject) =>
  candidates().find((row) => row.subject === subject) || null;

/**
 * The set-aside rows, each with the wearer's own reason and the time they gave
 * it. A subject this read no longer carries is `absent` and still listed, which
 * is what keeps its Restore reachable (HV2-16).
 */
export const asideRows = () => candidates().filter((row) => row.preference?.set_aside);

/**
 * The concern that leads, or null when none does.
 *
 * This is the backend's `selected`, never a row this surface picked. A quiet or
 * unavailable disposition selects nothing, and an active change selects nothing
 * either — the active change occupies the seat and Changes carries it (HV2-15).
 */
export const selectedConcern = () => memory.read?.selected || null;

/** The one word for what this read found, rendered verbatim. */
export const disposition = () => memory.read?.disposition || null;

/**
 * The lifecycle verdict this read was composed at.
 *
 * `/api/guidance` carries the same `admission` the Plan routes answer with, plus
 * whether a Plan is already pending or drafted. A destination reads them here
 * rather than asking again and risking a different revision's answer.
 */
export const admission = () => memory.read?.admission || null;
export const pendingPlan = () => memory.read?.pending_plan || null;
export const planDraft = () => memory.read?.draft || null;

// The one reason an admission can be unavailable for (#387 contracts, and
// api.py's guidance_payload copies it verbatim into `unavailable`). The served
// token is a code; this is the sentence for it, and the code is still shown
// beside it so nothing is hidden behind a friendlier word.
const REASON_SAID = {
  reconciliation_required:
    'Harmonic has not reconciled the latest pump and sensor data yet, so it is not offering an action from this read.',
};

/**
 * The served unavailable reason, said in a sentence when it is a known code.
 * An unrecognised value is rendered exactly as it arrived — this maps what the
 * backend documents and invents nothing for what it does not.
 */
export function unavailableReason() {
  const served = memory.read?.unavailable;
  if (!served) return null;
  return { code: served, said: REASON_SAID[served] || served };
}

/** True when a concern carries a staged, admitted action the wearer can take. */
export const hasAction = (candidate) =>
  Boolean(candidate && Array.isArray(candidate.action) && candidate.action.length);

/**
 * The one guidance write a Plan apply must quote back, so the store can refuse
 * a decision recorded against a read that has since moved.
 */
export const analysisGeneration = () => memory.read?.analysis_generation || null;

/** True when the error came back as a served conflict rather than a transport fault. */
export const isConflict = (error) =>
  error instanceof ApiTransportError && (error.status === 409 || error.status === 404);
