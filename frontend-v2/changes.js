// Changes: the one concern that leads, what it asks for, and the one route
// into its evidence (HV2-10) — plus setting it aside and restoring it (HV2-16).
//
// Ported from the ★ LOCKED desktop prototype's shared journey, under the
// harmonic-v2-desktop lock manifest, keeping its selectors. What changed is
// the source: the prototype
// chose the lead row itself, out of a captured read, and held its set-asides in
// page memory. Here BOTH are the backend's. `/api/guidance` selects, and its
// `disposition` says under which rule; set aside and Restore are durable Store
// writes whose answer is the next read (guidance.js owns that re-read).
//
// THIS SURFACE DERIVES NOTHING CLINICAL. Which concern leads, whether it carries
// an action, why it was admitted, how it was ordered, whether a member can move
// and why one is held — every one of those is a served field rendered verbatim
// (lock precedence rule 3, HV2-19). There is no threshold, floor or ranking here.
//
// It does NOT duplicate Diagnose's findings roster: it shows the selected
// concern's own members and one named route across (HV2-10, S14).
import { formatStartMin } from '../frontend/plan.js';
import { desk, e, emptyFrame, nameplate, readingHeader, sheetToggle, stamp } from './frame.js';
import {
  asideRows, candidateFor, clearGuidanceWriteError, disposition, guidance, guidanceError,
  guidanceSettled, guidanceWriteError, hasAction, loadGuidance, restore,
  selectedConcern, setAside, unavailableReason,
} from './guidance.js';
import { navigate, registerDestination, registerEscape, render, view } from './routes.js';
import { SETTING_NAME, stage as stagePlan, unstage, phase, planUnderway, mount as mountPlan, installPlan } from './plan-view.js';
import { openUtility } from './utilities.js';

// The set-aside form is this destination's own layer, so its open state and the
// half-typed reason live here rather than on the desk's shared view.
const aside = { open: false, reason: '', subject: null };
let planOpen = false;

function inspectSelected() {
  const candidate = candidateFor(aside.subject) || selectedConcern();
  const action = Array.isArray(candidate?.action) ? candidate.action[0] : null;
  navigate('diagnose', { subject: candidate?.subject || '', from: 'changes',
    ...(action ? { window: `${action.start_min}-${action.end_min}`, lever: action.parameter || candidate.parameter } : {}) });
}

/** The evidence noun each kind of concern is inspected through (the lock's
    verbatim decision routes: Inspect nights / lows / meals). */
const INSPECT_NOUN = { basal_rate: 'nights', carb_ratio: 'meals', isf: 'Rest windows' };
const nounFor = (candidate) => INSPECT_NOUN[candidate?.parameter] || 'evidence';

/** The one route across into a concern's evidence — Diagnose owns the evidence. */
const inspectRoute = (candidate) =>
  `<div class="gf-actions"><button class="gf-btn primary" data-action="explore">Inspect ${e(nounFor(candidate))}</button></div>`;

/* --------------------------------------------------------------- the frames */

/**
 * The set-aside form, in the reading pane's seat.
 * The reason is optional and the wearer's own; nothing is written until submit.
 */
function asideForm() {
  return `${readingHeader('Set aside')}<div class="gf-pane-body"><form data-form="aside"><label for="aside-reason">Reason (optional)</label><textarea id="aside-reason">${e(aside.reason)}</textarea><div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Set aside</button><button class="gf-btn" type="button" data-action="cancel-aside">Cancel</button></div></form></div>`;
}

/**
 * What a set-aside concern says while it is the subject in hand: that it is set
 * aside, the wearer's own reason if they gave one, and its Restore.
 */
function asideLead(candidate) {
  const decision = candidate.decision || {};
  const following = selectedConcern();
  return `<section class="gf-section"><h3>Set aside${decision.decided_at ? ` <span class="meta">${e(stamp(decision.decided_at))}</span>` : ''}</h3>
    ${decision.reason ? `<p>${e(decision.reason)}</p>` : ''}
    <p class="gf-meta">It stays in Findings with its reason until it is restored.</p>
    ${candidate.preference?.return_reason ? `<p class="gf-note">${e(candidate.preference.return_reason)}</p>` : ''}
    <div class="gf-actions"><button class="gf-btn primary" data-restore="${e(candidate.subject)}">Restore</button></div>
    ${following ? `<p class="gf-meta">${e(following.title || following.subject)} leads now.</p>` : ''}</section>`;
}

/** The action this concern asks for, in the served units and direction. */
function actionLead(candidate) {
  const read = guidance();
  const action = Array.isArray(candidate.action) ? candidate.action : [];
  const change = action.length
    ? `${e(action[0].direction)} to ${e(action[0].recommended)} ${e(candidate.units || '')}`
    : candidate.action?.action_id ? e(candidate.action.action_id) : 'No action is staged from this read';
  const span = action.length
    ? `${formatStartMin(Math.min(...action.map((row) => row.start_min)))} to ${formatStartMin(Math.max(...action.map((row) => row.end_min)) % 1440)}`
    : '';
  return `<section class="gf-section"><h3>Action <span class="meta">${e(disposition() || '')}</span></h3>
    <div class="gf-figure">${change}<small>${e(span)}</small></div>
    ${read?.reasons?.admission ? `<p>${e(read.reasons.admission)}</p>` : ''}
    ${read?.reasons?.ordering ? `<p class="gf-meta">${e(read.reasons.ordering)}</p>` : ''}
    ${candidate.readiness?.reason ? `<p>${e(candidate.readiness.reason)}</p>` : ''}
    ${candidate.action ? '' : '<p class="gf-note">This read stages no action for this concern; its evidence stays inspectable.</p>'}</section>`;
}

function setAsideList(inline = false) {
  const rows = asideRows();
  if (!rows.length) return '';
  if (inline) return rows.map(row => `<span>${e(row.title || row.subject)} · Set aside <button class="gf-btn" data-restore="${e(row.subject)}">Restore</button></span>`).join(' ');
  return `<section class="gf-section"><h3>Set aside</h3>${rows.map(row =>
    `<p>${e(row.title || row.subject)}${row.decision?.reason ? ` · ${e(row.decision.reason)}` : ''} <button class="gf-btn" data-restore="${e(row.subject)}">Restore</button></p>`).join('')}</section>`;
}

/**
 * The reading pane. Its head is "Action" — the word S14 asserts — so the
 * decision, not a roster, is what Changes leads with.
 */
function actionPane(candidate) {
  if (aside.open) return asideForm();
  const setAsideRow = candidate.preference?.set_aside;
  return `${readingHeader('Action', e(candidate.title || candidate.subject))}<div class="gf-pane-body">
    ${setAsideRow ? asideLead(candidate) : actionLead(candidate)}
    ${setAsideRow ? '' : inspectRoute(candidate)}
    ${setAsideRow ? '' : setAsideList()}
  </div>`;
}

/**
 * The selected concern's own members, as served: each span's direction, whether
 * the owner staged it, and the reason it is held when it is not.
 * A held or thin member keeps its numbers and cannot move (HV2-19, HV2-31).
 */
function membersTable(candidate) {
  const members = candidate.members || [];
  if (!members.length) return '<p class="gf-note">This read serves no member evidence for this concern.</p>';
  if (candidate.kind === 'pattern') return `<table class="gf-table"><thead><tr><th>Member</th><th>Action</th></tr></thead><tbody>${members.map(member => `<tr><td>${e(member.subject)}</td><td>${e(member.action || 'No action')}</td></tr>`).join('')}</tbody></table>`;
  return `<table class="gf-table gf-windows"><thead><tr><th>Span</th><th>Direction</th><th>Stages</th><th>Reason</th></tr></thead><tbody>${members.map((member) => `<tr><td>${e(formatStartMin(member.span?.start_min ?? 0))}–${e(formatStartMin((member.span?.end_min ?? 0) % 1440))}</td><td>${e(member.direction || member.safety_status || '—')}</td><td>${member.asserts_move ? 'yes' : 'no'}</td><td>${e(member.held_reason || '')}</td></tr>`).join('')}</tbody></table>`;
}

function concernFrame(candidate) {
  const read = guidance();
  const failed = guidanceError();
  const writeFailed = guidanceWriteError();
  const family = SETTING_NAME[candidate.parameter] || (candidate.kind === 'setting' ? 'Setting' : 'Findings');
  const end = candidate.preference?.set_aside
    ? `<button class="gf-btn" data-restore="${e(candidate.subject)}">Restore</button>`
    : `<button class="gf-btn" data-action="aside">Set aside</button>${phase() === 'Staged' ? '<span role="status">Staged · <button class="gf-btn" data-set="unstage">Undo</button></span><button class="gf-btn primary" data-set="open-plan">Open Plan</button>' : hasAction(candidate) ? '<button class="gf-btn primary" data-set="stage">Stage change</button>' : ''}`;
  const head = nameplate({
    kicker: `${e(family)} · read ${e(read?.window?.end || '')}`,
    title: e(candidate.title || candidate.subject),
    sub: `<b>${e(candidate.priority ?? '—')} priority</b> · ${e(disposition() || '')}${candidate.preference?.set_aside ? ' · Set aside' : ''}`,
    end: end + '<button class="gf-btn" data-action="pump">Pump settings</button>',
  });
  const stale = failed
    ? `<p class="gf-note" role="status">The current read failed. This is the last read that answered. <button class="gf-btn" data-action="retry">Retry</button></p>`
    : '';
  const wrote = writeFailed
    ? `<p class="gf-error" role="alert">That did not save: ${e(writeFailed.message)}</p>`
    : '';
  const stage = `<section class="pane gf-stage gf-stage-table" aria-label="Evidence">${head}
    <div class="instruments"><div class="instrument"><span class="cap">Members in this read</span><span class="meta">${e(read?.reasons?.admission || '')}</span></div><div class="instrument gf-tools">${sheetToggle('Action', view.sheetOpen)}</div></div>
    <div class="gf-scroll">${stale}${wrote}${membersTable(candidate)}</div></section>`;
  return desk(stage, `<aside class="pane gf-reading" aria-label="${aside.open ? 'Set aside' : 'Action'}">${actionPane(candidate)}</aside>`);
}

/** No priority needs action — a distinct claim from thin, failed or held (S18). */
function quietFrame() {
  const set = asideRows().length;
  const copy = [set ? `${set} set aside` : '', `read ${guidance()?.window?.end || ''}`].filter(Boolean).join(' · ');
  return emptyFrame('Changes', 'No priority needs action', e(copy),
    '<button class="gf-btn primary" data-action="explore">Open Diagnose</button><button class="gf-btn" data-action="day">Open Day</button>', setAsideList(true));
}

/**
 * An unavailable disposition carries the reason the source served (HV2-31).
 *
 * The served reason is a code; what the wearer reads is what it means. The code
 * itself stays in the response, where a test reads it — it is transport
 * vocabulary, not something anyone can act on. This is not an unresolved
 * criterion, and it is not quiet: the evidence is still there to look at.
 */
function unavailableFrame() {
  const reason = unavailableReason();
  return emptyFrame('Changes', 'No action from this read',
    e(reason?.said || 'The source served no reason.'),
    '<button class="gf-btn primary" data-action="explore">Open Diagnose</button><button class="gf-btn" data-action="retry">Retry</button>', setAsideList(true));
}

/**
 * The read selected no concern, under a disposition that is not quiet.
 *
 * Every disposition the source documents is handled above. This is the honest
 * frame for one it does not: it says nothing was selected, without claiming the
 * data is clear and without inventing a concern to lead with.
 */
function unselectedFrame(state) {
  return emptyFrame('Changes', 'No concern is selected',
    e(guidance()?.reasons?.admission || `This read returned "${state || 'nothing'}" and selected no concern.`),
    '<button class="gf-btn primary" data-action="explore">Open Diagnose</button><button class="gf-btn" data-action="retry">Retry</button>');
}

/** The active change leads; a new concern cannot claim the seat beside it. */
function activeChangeFrame() {
  const read = guidance();
  return emptyFrame('Changes', 'A change is underway', e(read?.reasons?.ordering || 'The active change precedes every new concern.'),
    '<button class="gf-btn primary" data-destination-action="changes">Open Changes</button><button class="gf-btn" data-action="explore">Open Diagnose</button>');
}

/**
 * The read failed and none has answered before it. Distinct from quiet: this
 * says the evidence could not load, and offers the retry (S19).
 */
function failedFrame() {
  return emptyFrame('Changes', 'Guidance unavailable', 'The guidance read could not load.',
    '<button class="gf-btn primary" data-action="explore">Open Diagnose</button><button class="gf-btn" data-action="retry">Retry</button>');
}

/* --------------------------------------------------------------- the wiring */

function bind(host) {
  for (const button of host.querySelectorAll('[data-action]')) {
    const action = button.dataset.action;
    if (action === 'explore') button.onclick = () => inspectSelected();
    else if (action === 'pump') button.onclick = () => openUtility('pump', button);
    else if (action === 'day') button.onclick = () => navigate('day');
    else if (action === 'retry') {
      button.onclick = () => { clearGuidanceWriteError(); loadGuidance({ force: true }); };
    } else if (action === 'aside') {
      button.onclick = () => {
        aside.open = true;
        aside.subject = selectedConcern()?.subject || null;
        view.sheetOpen = true;
        view.focusAfterRender = '#aside-reason';
        render();
      };
    } else if (action === 'cancel-aside') {
      // Closes without recording anything: no write is attempted, and the half-
      // typed reason goes with the form it was typed into (S17).
      button.onclick = () => {
        aside.open = false;
        aside.reason = '';
        view.sheetOpen = false;
        view.focusAfterRender = '[data-action="aside"]';
        render();
      };
    }
  }
  for (const button of host.querySelectorAll('[data-restore]')) {
    button.onclick = () => {
      const { restore: subject } = button.dataset;
      restore(subject).then(() => { view.focusAfterRender = '.gf-reading > header h2'; render(); });
    };
  }
  for (const button of host.querySelectorAll('[data-set="stage"]')) {
    button.onclick = () => {
      if (stagePlan(selectedConcern())) {
        view.focusAfterRender = '[data-set="open-plan"]';
        render();
      }
    };
  }
  for (const button of host.querySelectorAll('[data-set="open-plan"]')) button.onclick = () => {
    planOpen = true; view.focusAfterRender = '[data-set="save-draft"]'; render();
  };
  for (const button of host.querySelectorAll('[data-set="unstage"]')) button.onclick = () => {
    unstage(); view.focusAfterRender = '[data-set="stage"]'; render();
  };
  const form = host.querySelector('form[data-form="aside"]');
  if (form) {
    const field = form.querySelector('#aside-reason');
    if (field) field.oninput = () => { aside.reason = field.value; };
    form.onsubmit = (event) => {
      event.preventDefault();
      const subject = aside.subject || selectedConcern()?.subject;
      if (!subject) return;
      const reason = (field?.value || '').trim();
      // The concern stays the subject in hand, so its acknowledgment is what
      // shows — and it shows only after the write and its re-read answer.
      setAside(subject, reason).then((saved) => {
        if (saved) { aside.open = false; aside.reason = ''; view.sheetOpen = false; }
        view.focusAfterRender = saved ? '[data-restore]' : '#aside-reason';
        render();
      });
      render();
    };
  }
}

/**
 * Changes, mounted. The frame follows the served disposition, and each
 * disposition makes its own claim — quiet is not failed, failed is not
 * unavailable, and an active change is neither (HV2-31, S18, S19).
 */
export function mount(host, deps = {}) {
  if ((planOpen && planUnderway()) || ['draft', 'pending_plan'].includes(disposition()) || deps.context?.subject === 'plan') { mountPlan(host, deps); return; }
  if (!guidanceSettled()) {
    loadGuidance();
    host.innerHTML = emptyFrame('Changes', 'Reading', 'Asking what needs attention.', '');
    return;
  }
  if (!guidance()) { host.innerHTML = failedFrame(); bind(host); return; }

  const state = disposition();
  // A concern the wearer set aside and is still looking at keeps the seat, so
  // the acknowledgment and its Restore are what they see (S15).
  const held = aside.subject ? candidateFor(aside.subject) : null;
  const candidate = (held?.preference?.set_aside ? held : null) || selectedConcern();

  if (state === 'active_change') { host.innerHTML = activeChangeFrame(); bind(host); return; }
  // A Plan already recorded or drafted holds the seat too, and Changes carries
  // it — this is not a concern Changes can lead with (HV2-15).
  if (candidate) { host.innerHTML = concernFrame(candidate); bind(host); return; }
  if (state === 'unavailable') { host.innerHTML = unavailableFrame(); bind(host); return; }
  // Quiet is claimed ONLY when quiet was served. `disposition` is an open string
  // from outside this surface, and every other value that selects no concern
  // means something else — falling through to "no priority needs action" would
  // tell a wearer their data was clear when the source never said so (HV2-31).
  if (state === 'quiet') { host.innerHTML = quietFrame(); bind(host); return; }
  host.innerHTML = unselectedFrame(state);
  bind(host);
}

/** Seat Changes on the desk. */
export function installChanges() {
  installPlan();
  registerDestination({ id: 'changes', title: 'Changes', mount });
  // Escape steps the set-aside form back before the desk's own layers, and
  // discards nothing the wearer typed anywhere else.
  registerEscape('aside', () => {
    if (!aside.open) return false;
    aside.open = false;
    view.focusAfterRender = '[data-action="aside"]';
    render();
    return true;
  });
}
