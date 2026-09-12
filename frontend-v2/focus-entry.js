// Pattern entry shares one durable write path between Changes and the explicit
// Diagnose drill. Membership, admission and readiness come from the API.
import * as client from './client.js';
import { admissionReason, guidance, guidanceError, loadGuidance } from './guidance.js';
import { e, emptyFrame, loadingFrame } from './frame.js';
import { navigate, render, view } from './routes.js';

export function createFocusEntry({ api = client, readGuidance = async () => {
  await loadGuidance({ force: true });
  if (guidanceError()) throw guidanceError();
  return guidance();
}, changed = () => {} } = {}) {
  let source = null;
  let roster = null;
  let pending = null;
  let attempt = null;
  let failure = null;
  let readFailure = null;
  let saving = false;
  const candidate = subject => !readFailure && roster?.admission?.focus_pin?.available === true
    ? roster.pinnable_patterns?.find(row => row.subject === subject) || null : null;
  const parentSubject = (selected) => {
    if (!selected) return null;
    if (source?.candidates?.some(row => row.subject === selected.subject)
        || roster?.pinnable_patterns?.some(row => row.subject === selected.subject)) return selected.subject;
    // This follows the served collapse relation only. A child cannot nominate
    // its own parent or calculate whether that parent is admissible.
    if (!selected.subject?.startsWith('finding:') || !selected.finding?.lever) return null;
    const member = `habit:${selected.finding.lever}`;
    /* A case-file child names a served habit. Its Pattern parent may remain a
       Pattern or collapse to that member; either way the published membership
       is the only relation that may lead back to parent context. */
    const owners = source?.candidates?.filter(row => row.kind === 'pattern'
      && (row.chosen_member?.subject === member
        || row.members?.some(candidate => candidate.subject === member))) || [];
    return owners.length === 1 ? owners[0].subject : null;
  };
  return {
    candidate,
    forCase(selected) {
      const subject = parentSubject(selected);
      return subject ? candidate(subject) : null;
    },
    contextForCase(selected) {
      const subject = parentSubject(selected)
        || (selected?.subject?.startsWith('pattern:') ? selected.subject : '');
      if (!subject && !readFailure) return null;
      const parent = source?.candidates?.find(row => row.subject === subject) || null;
      const offered = candidate(subject);
      if (readFailure) return { subject, offered, title: parent?.title || offered?.subject || subject,
        reason: 'Focus status could not load. Retry the read.', label: 'Focus status unavailable', retry: true };
      if (!roster) return null;
      const admission = roster.admission?.focus_pin?.reason || parent?.readiness?.reason;
      const copy = admissionReason(admission);
      return { subject, offered, title: parent?.title || offered?.subject || subject,
        reason: copy.said, label: copy.label, action: copy.action,
        ...(copy.route ? { route: copy.route } : {}), retry: false };
    },
    state: () => ({ source, roster, failure, readFailure, saving, loading: Boolean(pending) }),
    read() {
      if (pending) return pending;
      pending = Promise.all([api.fetchFocuses(), readGuidance()]).then(([f, g]) => {
        if (!g || f.input_revision !== g.input_revision) throw new Error('The Focus source changed. Retry the read.');
        roster = f; source = g; failure = null; readFailure = null;
      }).catch(error => { failure = error; readFailure = error; })
        .finally(() => { pending = null; changed(); });
      return pending;
    },
    async start(subject, outcomeWindow = null) {
      if (saving) return null;
      const offered = candidate(subject);
      if (!offered || !source) return null;
      if (!attempt || attempt.subject !== subject) attempt = { subject, id: crypto.randomUUID() };
      saving = true; failure = null; readFailure = null; changed();
      try {
        const saved = await api.pinFocus(null, { pattern_key: offered.key, subject: offered.subject,
          outcome_window: outcomeWindow,
          request_id: attempt.id, input_revision: roster.input_revision,
          analysis_generation: source.analysis_generation });
        attempt = null; roster = null; source = null;
        return saved;
      } catch (error) { failure = error; return null; }
      finally { saving = false; changed(); }
    },
  };
}

const entry = createFocusEntry({ changed: render });
export const focusOffer = subject => entry.candidate(subject);
export const focusOfferForCase = selected => entry.forCase(selected);
export const focusContextForCase = selected => entry.contextForCase(selected);
export const readFocusOptions = () => entry.read();
let arrival = null;
export function mount(host, deps = {}) {
  const subject = deps.context?.subject;
  if (arrival !== deps.navigation) { arrival = deps.navigation; entry.read(); }
  const state = entry.state();
  if (state.loading) { host.innerHTML = loadingFrame('Focus'); return; }
  const offered = entry.candidate(subject);
  const candidate = state.source?.candidates?.find(row => row.subject === subject);
  const copy = state.readFailure
    ? 'Focus status could not load. Retry the read.'
    : offered
    ? `${e(candidate?.title || offered.subject)}. This Pattern is ready to start a Focus.`
    : e(state.roster?.admission?.focus_pin?.reason || 'This Pattern is not currently offered as a Focus.');
  host.innerHTML = emptyFrame('Changes', 'Start a Pattern Focus', copy,
    `${offered ? `<button class="gf-btn primary" data-focus="${state.failure ? 'retry-pin' : 'pin'}" ${state.saving ? 'disabled' : ''}>${state.failure ? 'Retry' : 'Start Focus'}</button>` : '<button class="gf-btn" data-focus="refresh">Retry read</button>'}<button class="gf-btn" data-destination-action="changes">Cancel</button>`,
    state.readFailure ? 'Focus status could not load. Retry the read.'
      : state.failure ? `Starting the Focus failed: ${e(state.failure.message)}. No successful pin was confirmed.`
        : 'No pump setting changes.');
  const start = host.querySelector('[data-focus="pin"], [data-focus="retry-pin"]');
  if (start) start.onclick = async () => {
    if (state.failure) await entry.read();
    const parts = String(deps.context?.window || '').split('-').map(Number);
    const outcomeWindow = parts.length === 2 && parts.every(Number.isInteger)
      ? { start_min: parts[0], end_min: parts[1] } : null;
    const saved = await entry.start(subject, outcomeWindow);
    if (saved) {
      await loadGuidance({ force: true });
      navigate('changes');
    } else { view.focusAfterRender = '[data-focus="retry-pin"]'; render(); }
  };
  const refresh = host.querySelector('[data-focus="refresh"]');
  if (refresh) refresh.onclick = () => entry.read();
}
