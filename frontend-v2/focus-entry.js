// Pattern entry shares one durable write path between Changes and the explicit
// Diagnose drill. Membership, admission and readiness come from the API.
import * as client from './client.js';
import { guidance, guidanceError, loadGuidance } from './guidance.js';
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
  let saving = false;
  const candidate = subject => roster?.admission?.focus_pin?.available === true
    ? roster.pinnable_patterns?.find(row => row.subject === subject) || null : null;
  return {
    candidate,
    forCase(selected) {
      if (!selected) return null;
      const direct = candidate(selected.subject);
      if (direct) return direct;
      // A collapsed rail row is still the selected case. The backend's explicit
      // collapse and chosen_member supply its owning Pattern; no membership is
      // reconstructed from a frontend list or from a rate/count.
      if (!selected.subject?.startsWith('finding:') || !selected.finding?.lever) return null;
      const owners = source?.candidates?.filter(row => row.collapse === 'collapse_to_member'
        && row.chosen_member?.subject === `habit:${selected.finding.lever}`) || [];
      return owners.length === 1 ? candidate(owners[0].subject) : null;
    },
    state: () => ({ source, roster, failure, saving, loading: Boolean(pending) }),
    read() {
      if (pending) return pending;
      pending = Promise.all([api.fetchFocuses(), readGuidance()]).then(([f, g]) => {
        if (!g || f.input_revision !== g.input_revision) throw new Error('The Focus source changed. Retry the read.');
        roster = f; source = g; failure = null;
      }).catch(error => { roster = null; source = null; failure = error; })
        .finally(() => { pending = null; changed(); });
      return pending;
    },
    async start(subject) {
      if (saving) return null;
      const offered = candidate(subject);
      if (!offered || !source) return null;
      if (!attempt || attempt.subject !== subject) attempt = { subject, id: crypto.randomUUID() };
      saving = true; failure = null; changed();
      try {
        const saved = await api.pinFocus(null, { pattern_key: offered.key, subject: offered.subject,
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
export const readFocusOptions = () => entry.read();
let arrival = null;
export function mount(host, deps = {}) {
  const subject = deps.context?.subject;
  if (arrival !== deps.navigation) { arrival = deps.navigation; entry.read(); }
  const state = entry.state();
  if (state.loading) { host.innerHTML = loadingFrame('Focus'); return; }
  const offered = entry.candidate(subject);
  const candidate = state.source?.candidates?.find(row => row.subject === subject);
  const copy = offered
    ? `${e(candidate?.title || offered.subject)}. ${e(candidate?.readiness?.reason || '')}`
    : e(state.roster?.admission?.focus_pin?.reason || 'This Pattern is not currently offered as a Focus.');
  host.innerHTML = emptyFrame('Changes', 'Start a Pattern Focus', copy,
    `${offered ? `<button class="gf-btn primary" data-focus="${state.failure ? 'retry-pin' : 'pin'}" ${state.saving ? 'disabled' : ''}>${state.failure ? 'Retry' : 'Start Focus'}</button>` : '<button class="gf-btn" data-focus="refresh">Retry read</button>'}<button class="gf-btn" data-destination-action="changes">Cancel</button>`,
    state.failure ? `Starting the Focus failed: ${e(state.failure.message)}. No successful pin was confirmed.` : 'No pump setting changes.');
  const start = host.querySelector('[data-focus="pin"], [data-focus="retry-pin"]');
  if (start) start.onclick = async () => {
    if (state.failure) await entry.read();
    const saved = await entry.start(subject);
    if (saved) {
      await loadGuidance({ force: true });
      navigate('changes');
    } else { view.focusAfterRender = '[data-focus="retry-pin"]'; render(); }
  };
  const refresh = host.querySelector('[data-focus="refresh"]');
  if (refresh) refresh.onclick = () => entry.read();
}
