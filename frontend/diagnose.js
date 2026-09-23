// ADR 397: seat the shipped Diagnose composition once. The rail, case stack,
// scoped requests, charts and clinical verdicts remain in their existing owners.
import { createDiagnoseEventComparison } from './diagnose-event-comparison.js';
import { recordDiagnoseAge } from './diagnose-data-age.js';
import * as client from './client.js';
import { currentDestination, hold, navigate, registerDestination, render, replaceAddress, view } from './routes.js';
import { caseAddress } from './tab-routing.js';
import { presetLabelFor } from './diagnose-workstation.js';
import { loadingFrame, emptyFrame } from './frame.js';
import { openUtility } from './utilities.js';
import { stageEvidence, evidenceIsStaged, loadPlanState } from './plan-view.js';
import { createCaseContext, evidenceDayContext } from './diagnose-context.js';
import { focusContextForCase, focusOfferForCase, readFocusOptions } from './focus-entry.js';
import { formatStartMin } from './plan.js';

// The held Occurrence's own "Open … in Day" control: the last control in the
// selection's foot, which renders only for the held Occurrence or night.
const OPEN_IN_DAY = '.occ-foot button:last-child';
// Moving focus, or a modifier pressed on its own, is not acting on the case
// (ADR 428 point 2).
const NOT_AN_ACT = new Set(['Tab', 'Shift', 'Control', 'Alt', 'Meta']);

// A case-file's unscoped WindowQuery is the reader's explicit 24 h selection.
// Routes carry concrete coordinates because Pattern Focus requires a retained
// outcome scope on its durable write; ordinary clock selections retain their
// served coordinates unchanged.
export function outcomeWindowForCase(selected) {
  const window = selected?.window;
  if (Number.isInteger(window?.start_min) && Number.isInteger(window?.end_min)) {
    return { start_min: window.start_min, end_min: window.end_min };
  }
  return window?.scoped === false ? { start_min: 0, end_min: 1440 } : null;
}

const outcomeWindowRoute = selected => {
  const scope = outcomeWindowForCase(selected);
  return scope ? `${scope.start_min}-${scope.end_min}` : '';
};

/** One mounted shared view and one coherent initial read. loadCase remains an
 * unchanged Promise seam for the journey's caller; it is NOT a selection event.
 * Tile loads use it too. C3 must observe the reader's drill separately. */
export function createDiagnoseDestination({ api = client, createView = createDiagnoseEventComparison,
  loadCase = (coordinates) => api.fetchDiagnoseFindingCase(coordinates) } = {}) {
  let root = null;
  let workstation = null;
  let payload = null;
  let error = null;
  let pending = null;
  // Retention (ADR 414): a status read on return, gated separately from `pending`
  // — the payload read the desk already holds must not be disturbed while it runs.
  let checking = false;
  let readRevision = null;
  // The one statement of this flag's lifecycle. Set when a guidance read
  // completes seated but parked (the workstation's own Retry resolving
  // off-screen), because a parked desk must not be re-seated by a completion. Consumed
  // by the return that re-seats that same read: mount applies the payload
  // with its restoration. Cleared by leave(), both the pagehide teardown and
  // the teardown every re-read starts with, because a re-read's own completion
  // decides what the next mount applies and the recorded one is stale.
  let deferredApply = false;
  // The reading pane's scroll offset when the root is parked. A browser
  // drops the scroll offset of an element it no longer lays out, so the
  // surviving node alone does not carry it; the retained re-seat puts it back.
  let levelScroll = null;
  // The root is parked hidden at the end of the document while another
  // destination holds the surface (see detach()). While parked, nothing
  // paints it from here; the workstation's own in-flight reads may.
  let parked = false;
  let seated = false;
  let arrival = null;
  let entry = {};
  const ages = {};
  const caseContext = createCaseContext(loadCase);
  let activeSubject = null;
  let restoreObserver = null;
  // ADR 428. `published` is the case the workstation last put on screen,
  // written or not. `restoring` is an entry restoration still pending: open
  // from mount's decision to apply a contextual entry until the restoration has
  // done its own work or the reader acts. `rebuilding` is a setData rebuild in
  // progress, whose Findings root is never written. `returnTo` is the
  // Occurrence a retained Day return puts focus back on when the root re-seats.
  let published = null;
  let restoring = false;
  let rebuilding = false;
  let returnTo = null;

  // Context names a served identity or an explicit slot; the window is the
  // route's own string coordinate. Equal on all three means "the same return".
  function sameEntry(a, b) {
    return (a?.subject || null) === (b?.subject || null)
      && (a?.occurrence || null) === (b?.occurrence || null)
      && (a?.window || null) === (b?.window || null);
  }
  const namesCase = (context) => Boolean(context.subject || context.occurrence || context.window);
  const onScreen = () => seated && !parked && currentDestination() === 'diagnose';

  // The address names the case on screen, and the entry held is what it wrote.
  function writeCase() {
    entry = caseAddress(published, entry.from);
    replaceAddress(entry);
  }

  // The workstation's one published case (ADR 428 points 2 and 4). A change is
  // written in place unless a restoration is pending, the workstation is being
  // rebuilt, or Diagnose is not the desk on screen. A suppressed publication
  // still counts as the last one, so a same-value repaint after a restoration
  // ends leaves the entry's own address standing.
  function caseChanged(next) {
    const changed = !sameEntry(published, next);
    published = next;
    if (changed && !restoring && !rebuilding && onScreen()) writeCase();
  }

  // The reader's own press supersedes the entry being restored. Registered in
  // the capture phase on the window, so it runs before every handler that
  // changes the case inside the same event — the lane's arrow keys, the
  // workstation's document-level Backspace, ↑/↓ and Escape, a window grip that
  // stops propagation — and caseChanged writes the case that event publishes.
  // The restoration's own clicks are untrusted and never end it. Once the
  // event's handlers have run, the case on screen is written even when the
  // press changed nothing, so the entry's address never outlives it.
  function readerActs(event) {
    if (!restoring || !event.isTrusted || currentDestination() !== 'diagnose') return;
    if (event.type === 'keydown' && NOT_AN_ACT.has(event.key)) return;
    restoring = false;
    setTimeout(() => { if (!restoring && !rebuilding && onScreen()) writeCase(); });
  }

  // ADR 428 point 5: a return lands on the held Occurrence's own Open in Day
  // control, else on its row, else on the crumb (absent while the workstation
  // shows its own failure).
  function focusReturn(occurrence) {
    const row = [...root.querySelectorAll('.case-occurrence')].find(node => node.dataset.occurrenceId === occurrence);
    ((row && root.querySelector(OPEN_IN_DAY)) || row || root.querySelector('#crumb-trail'))?.focus({ preventScroll: true });
  }

  async function read() {
    if (pending) return pending;
    error = null;
    readFocusOptions().then(() => { if (seated && !parked) showFocusAction(); });
    loadPlanState().then(() => { if (seated && !parked) workstation.refresh(); }).catch(() => {});
    // The one status read this call owns: answered before the payload reads
    // are issued, so the recorded revision is at or before every payload
    // snapshot and a write landing during them always moves the revision the
    // next return compares. Issued concurrently it could record a post-write
    // revision against a pre-write payload, and the return would seat a
    // stale desk as current.
    pending = api.fetchStatus().then((status) => {
      readRevision = status.input_revision;
      return Promise.all([
        api.fetchAnalysis({ window: 30, pool: true }), api.fetchScenarios(30),
        api.fetchExploreTimeOfDay(), api.fetchExploreExposures(),
        api.fetchDiagnoseFindingCasePreparation(null), api.fetchOutcomesTrend(30),
      ]);
    }).then(([a, s, e, x, preparation, outcomes]) => {
      const values = [a, s, e, x, outcomes].map((value, i) =>
        recordDiagnoseAge(ages, ['analysis', 'scenarios', 'time_of_day', 'exposures', 'trend'][i], value));
      if (values.some((value) => value === null)) throw new Error('Diagnose received invalid input-data age.');
      payload = { analyze: values[0], scenarios: values[1], evidence: values[2], exposures: values[3],
        casePreparation: preparation, findings: { ...preparation.findings, rows: preparation.rendered_rows },
        watched: values[4]?.watched_change || null };
      // seated && !parked: the one live path where this can fire mid-read is
      // the workstation's own Retry, which starts seated on the surface.
      // Everywhere else `seated` is false here (mount's own branches own the apply).
      if (seated && !parked) apply();
      // Retry resolved off-screen: record it (see deferredApply's lifecycle).
      else if (seated) { deferredApply = true; }
    }).catch((cause) => {
      error = cause;
      if (seated && !parked) workstation.setError(cause);
    }).finally(() => { pending = null; render(); });
    return pending;
  }

  // Every apply site rebuilds the workstation from the payload and then restores
  // the entry: mount deciding to apply it is where its restoration turns
  // pending (ADR 428 point 2), and the rebuild's own Findings root is never
  // written over it.
  function apply() {
    restoring = Boolean(entry.subject);
    rebuilding = true;
    workstation.setData(payload);
    rebuilding = false;
    restoreEntry(); showFocusAction();
  }

  // A re-read applies its entry afresh, so the restoration is pending before
  // the teardown; nothing the teardown or the rebuild publishes overwrites it.
  function reread() {
    restoring = Boolean(entry.subject);
    leave();
    read();
  }

  function restoreEntry() {
    if (!root || !payload) return;
    // Context names a served identity or an explicit slot. It never selects the
    // current first-ranked concern as a substitute for the retained subject.
    // The walk keeps its own copy: once the reader acts, `entry` follows the
    // case on screen instead of the entry being restored.
    const target = entry;
    const subject = target.subject;
    let subjectOpened = false;
    let occurrenceRequested = false;
    restoreObserver?.disconnect();
    const restore = () => {
      if (!subjectOpened && subject) {
        const row = [...root.querySelectorAll('.qrow[data-id]')].find(node => node.dataset.id === subject);
        if (row) { subjectOpened = true; row.click(); }
        else if (subject === 'setting:basal_rate' || /^basal:\d+(?:-\d+)?$/.test(subject)) {
          const start = subject === 'setting:basal_rate' ? target.window?.split('-')[0] : subject.split(':')[1].split('-')[0];
          if (start !== undefined) {
            const label = `${formatStartMin(Number(start))} basal slot,`;
            const cell = [...root.querySelectorAll('#lane > button.lane-cell')]
              .find(button => button.getAttribute('aria-label')?.startsWith(label));
            if (cell) { subjectOpened = true; cell.click(); }
          }
        }
      }
      if (!subjectOpened) return;
      if (target.occurrence) {
        const node = [...root.querySelectorAll('.case-occurrence')]
          .find(node => node.dataset.occurrenceId === target.occurrence);
        if (!node) return;
        if (node.getAttribute('aria-pressed') !== 'true') {
          if (!occurrenceRequested) { occurrenceRequested = true; node.click(); }
          return;
        }
        focusReturn(target.occurrence);
      }
      // Done, and settled without writing: the entry's own address stands
      // until the case on screen next changes.
      restoring = false;
      restoreObserver?.disconnect(); restoreObserver = null;
    };
    if (subject) {
      restoreObserver = new MutationObserver(restore);
      restoreObserver.observe(root, { childList: true, subtree: true });
      // Whole-day cases must not accidentally inherit the default Overnight
      // slice on return, and a Finding named in one of the Window control's
      // presets reopens in it (ADR 428 point 8). The shipped Window control
      // still owns the request.
      const preset = subject.startsWith('pattern:') || (!target.window && subject.startsWith('finding:')) ? '24 h'
        : subject.startsWith('finding:') ? presetLabelFor(target.window) : null;
      if (preset) [...root.querySelectorAll('#seg-window button')].find(button => button.textContent === preset)?.click();
      restore();
    } else {
      // #413 — "Diagnose opens on the 24 h window": a cold arrival with no
      // contextual entry (no Pattern, no Finding, no retained window — this
      // branch is unreached by the parked-return path that preserves those)
      // opens unscoped. The workstation's own presets keep booting on
      // Overnight for isf/drill/occurrence/drawn, which this does not touch.
      [...root.querySelectorAll('#seg-window button')].find(button => button.textContent === '24 h')?.click();
    }
    const heading = root.querySelector('#crumb-trail');
    if (heading) heading.tabIndex = -1;
    if (!view.focusAfterRender) view.focusAfterRender = '#crumb-trail';
  }

  // S129/S131: a catalog pick drills its chart. The owner no-ops a pick
  // already in the inspector; retaining/alignment controls do not pick it.
  function selectTile(tile) {
    if (tile.dataset.chartId === activeSubject) return;
    activeSubject = tile.dataset.chartId;
    caseContext.select(activeSubject);
    showFocusAction();
  }

  function ensureView(host) {
    if (root) return;
    root = host.ownerDocument.createElement('div');
    root.className = 'v2-diagnose main-content';
    root.dataset.v2Diagnose = '';
    host.ownerDocument.defaultView.addEventListener('pointerdown', readerActs, true);
    host.ownerDocument.defaultView.addEventListener('keydown', readerActs, true);
    root.addEventListener('keydown', event => {
      const tile = event.target.closest?.('.evidence-tile');
      if (event.target === tile && tile.dataset.seat === 'grid'
        && ['Enter', ' '].includes(event.key)) selectTile(tile);
    }, true);
    // The v2 lane contract adds traversal through the owner's existing buttons.
    root.addEventListener('keydown', event => {
      if (event.metaKey || event.ctrlKey || event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      const cell = event.target.closest?.('#lane > button.lane-cell');
      if (!cell) return;
      const cells = [...root.querySelectorAll('#lane > button.lane-cell')];
      const at = cells.indexOf(cell);
      if (at < 0) return;
      event.preventDefault();
      const next = (at + (event.key === 'ArrowLeft' ? -1 : 1) + cells.length) % cells.length;
      cells[next].click();
      // Picking rebuilds the lane; focus the new button at the same coordinate.
      root.querySelectorAll('#lane > button.lane-cell')[next]?.focus({ preventScroll: true });
    });
    let readingScroll = null;
    root.addEventListener('click', event => {
      const row = event.target.closest?.('.qrow[data-id]');
      const member = event.target.closest?.('.case-occurrence');
      const tile = event.target.closest?.('.evidence-tile');
      const control = event.target.closest?.('button');
      readingScroll = member ? { event, top: root.querySelector('#level')?.scrollTop || 0 } : null;
      if (row) { activeSubject = row.dataset.id; caseContext.select(activeSubject); }
      else if (member && activeSubject) caseContext.select(activeSubject, member.dataset.occurrenceId);
      else if (tile && (!control || control.classList.contains('tile-fullscreen'))) selectTile(tile);
      else if (event.target.closest?.('#crumb-trail button, #lane > button, #seg-window button, #seg-align button, #tab-strip button')) {
        activeSubject = null; caseContext.select(null);
      }
      showFocusAction();
    }, true);
    // A native night click rebuilds #level synchronously. Restore the same
    // subject's scroll after that handler; selecting a different subject does
    // not enter this path and keeps the shared owner's arrival-at-head behavior.
    root.addEventListener('click', event => {
      if (readingScroll?.event !== event) return;
      const level = root.querySelector('#level');
      if (level) level.scrollTop = readingScroll.top;
      readingScroll = null;
    });
    workstation = createView({ root, callbacks: {
      stage: (item, desired) => stageEvidence(item, desired, payload?.analyze),
      isStaged: (item) => evidenceIsStaged(item, payload?.analyze),
      retry: read,
      settings: () => openUtility('settings'),
      caseChanged,
      day: (occurrence) => {
        const context = evidenceDayContext({ occurrence, current: published });
        // A case callback alone never supplies a subject; a successful reader
        // drill (or explicitly selected basal cell) must have established it.
        if (context.subject) navigate('day', context);
      },
      loadDay: async (date) => {
        try {
          const window = await api.fetchTimeline({ start: `${date} 00:00:00`, end: `${date} 23:59:59` });
          return window?.cgm?.length ? { date, midnight: `${date} 00:00:00`, window } : null;
        } catch { return null; }
      },
      onDayLoaded: () => { if (seated) workstation.repaintDay(); },
      loadBasalEvidence: api.fetchDiagnoseBasalNightEvidence,
      loadIsfEvidence: api.fetchDiagnoseIsfRestWindowEvidence,
      loadCarbRatioEvidence: api.fetchDiagnoseCarbRatioBlockEvidence,
      loadFindings: api.fetchDiagnoseFindings,
      loadPreparation: api.fetchDiagnoseFindingCasePreparation,
      loadHistoryEvents: api.fetchDiagnoseCarbRatioHistoryEvents,
      loadCase: async coordinates => {
        try { return await caseContext.load(coordinates); }
        finally { showFocusAction(); }
      },
      go: (to) => to === 'settings' ? openUtility('settings')
        : navigate(to === 'day' ? 'day' : 'changes', to === 'plan' ? { subject: 'plan' } : {}),
    } });
  }

  function showFocusAction() {
    root?.querySelector('[data-start-focus]')?.remove();
    root?.querySelector('[data-focus-context]')?.remove();
    root?.querySelector('[data-focus-retry]')?.remove();
    root?.querySelector('[data-focus-reason]')?.remove();
    root?.querySelector('[data-action="watch"]')?.remove();
    if (!seated) return;
    if (entry.from === 'changes' && payload?.watched) {
      const back = root.ownerDocument.createElement('button');
      back.className = 'gf-btn'; back.dataset.action = 'watch'; back.textContent = 'Return to Trial';
      back.onclick = () => navigate('changes');
      root.querySelector('header.crumb')?.append(back);
    }
    const selected = caseContext.current();
    const selectedWindow = outcomeWindowRoute(selected);
    const offered = focusOfferForCase(selected);
    const context = focusContextForCase(selected);
    if (!offered) {
      if (!context) return;
      const crumb = root.querySelector('header.crumb');
      const reason = root.ownerDocument.createElement('span');
      reason.className = 'focus-reason'; reason.id = 'focus-context-reason';
      reason.dataset.focusReason = context.subject;
      reason.dataset.focusReasonKind = context.retry ? 'retry' : 'withheld';
      reason.textContent = context.reason;
      if (context.retry) {
        // A read error needs an explanation and a reachable recovery action.
        // Keeping Retry its own compact control prevents a long status label
        // from hiding the only available action in the narrow findings header.
        const status = root.ownerDocument.createElement('span');
        status.className = 'focus-context'; status.dataset.focusContext = context.subject;
        status.textContent = 'Focus status unavailable'; status.title = context.reason;
        status.setAttribute('role', 'status');
        const retry = root.ownerDocument.createElement('button');
        retry.className = 'gf-btn focus-retry'; retry.dataset.focusRetry = context.subject;
        retry.textContent = 'Retry'; retry.title = context.reason;
        retry.setAttribute('aria-describedby', reason.id);
        retry.onclick = () => readFocusOptions().then(showFocusAction);
        crumb?.append(status, retry, reason);
      } else {
        const action = root.ownerDocument.createElement(context.route ? 'button' : 'span');
        action.className = context.route ? 'gf-btn focus-context' : 'focus-context';
        action.dataset.focusContext = context.subject;
        action.textContent = context.action;
        action.title = context.reason;
        action.setAttribute('aria-describedby', reason.id);
        if (context.route) action.onclick = () => navigate('changes', context.route);
        else action.setAttribute('role', 'status');
        crumb?.append(action, reason);
      }
      return;
    }
    const button = root.ownerDocument.createElement('button');
    button.className = 'gf-btn'; button.dataset.startFocus = offered.subject;
    button.textContent = 'Start Focus';
    button.onclick = () => {
      if (focusOfferForCase(caseContext.current())?.subject === offered.subject)
        navigate('changes', { subject: offered.subject, from: 'diagnose',
          window: selectedWindow });
    };
    root.querySelector('header.crumb')?.append(button);
  }

  // The full teardown: every guidance completion mid-read becomes a no-op
  // (seated is false), and a return re-seats from scratch. Owns pagehide (S84)
  // and every re-read (a changed entry, a moved revision, Retry).
  function leave() {
    if (!seated) return;
    seated = false;
    restoreObserver?.disconnect(); restoreObserver = null;
    activeSubject = null; caseContext.select(null);
    workstation.leaveSurface();
    // setData(null) runs the shared owner's teardown and aborts its listeners
    // before its no-payload return. No private renderer cleanup is copied here.
    workstation.setData(null);
    root.remove();
    root.style.display = ''; parked = false;
    deferredApply = false;  // the recorded completion died with this read
  }

  // Retention (ADR 414): leaving TO ANOTHER DESTINATION disconnects only what
  // a return repaint must not inherit stale — the observer that would re-click
  // a row — and parks the root. `seated` stays true: the workstation keeps its
  // drill, its scroll and its canvas layout, none of which this discards.
  // Parked, not removed: the workstation resolves its elements by document id,
  // and a rail read that completes while the reader is away paints into them.
  // Hidden but in the document, that paint lands harmlessly; removed, it would
  // throw. The park is the end of the body, so an on-screen element that
  // shared an id would win a lookup (S83).
  function detach() {
    // A pending restoration ends with the walk it was tracking: nothing re-runs
    // it on a retained return.
    restoreObserver?.disconnect(); restoreObserver = null; restoring = false;
    // Only ever called after ensureView() has run (seated implies root is set).
    levelScroll = root.querySelector('#level')?.scrollTop ?? null;
    root.style.display = 'none';
    root.ownerDocument.body.append(root);
    parked = true;
  }

  function mount(host, deps = {}) {
    const previousEntry = entry;
    entry = deps.context || {};

    // A return: the desk was seated and a navigation moved since. A changed
    // subject/occurrence/window always re-reads; the same entry only checks
    // whether the store moved, and the loading frame stands for either. A
    // repeated press of Diagnose while on Diagnose is not a return: the root
    // was never parked by leaving, and re-pressing the destination restores
    // the shipped Findings index the way it always has (S3), by re-reading.
    if (seated && arrival !== null && deps.navigation !== arrival) {
      arrival = deps.navigation;
      // ADR 428 point 7: a return whose context names no case (a plain press of
      // Diagnose) is a retained return whatever entry was held. It keeps the
      // held case but not its `from` — a direct entry invents no return — and
      // the address names that case again.
      const plain = !namesCase(entry);
      if (parked && plain) {
        entry = caseAddress(previousEntry);
        replaceAddress(entry);
      }
      if (!parked || !sameEntry(previousEntry, entry)) {
        reread();
        host.innerHTML = loadingFrame('Diagnose');
        return;
      }
      // ADR 428 point 6: a Day return to the held case keeps the drill too, and
      // puts focus back on the Occurrence it opened Day from.
      returnTo = plain ? null : entry.occurrence || null;
      checking = true;
      host.innerHTML = loadingFrame('Diagnose');
      api.fetchStatus().then((status) => {
        checking = false;
        if (status.input_revision !== readRevision) reread();
        else render();
      }).catch(() => { checking = false; reread(); });
      return;
    }

    if (!payload && !error) {
      // A cold seat's restoration is pending from its first read.
      restoring = Boolean(entry.subject);
      host.innerHTML = loadingFrame('Diagnose');
      read();
      return;
    }
    if (error) {
      // A render that arrives while this frame already stands (the focus
      // options read's own change notification lands a beat after the failed
      // guidance read's) must not rebuild it: rebuilding replaces the Retry
      // control under the reader's press and moves focus a second time.
      // The mark lives on the frame element itself, never on the shared
      // surface: another destination's failure frame carries its own Retry but
      // not this mark, and the next destination's own write takes the marked
      // frame away with it.
      const frame = payload ? 'current-read-failed' : 'evidence-unavailable';
      if (host.firstElementChild?.dataset?.diagnoseFrame === frame) return;
      host.innerHTML = emptyFrame('Diagnose', payload ? 'Current read failed' : 'Evidence unavailable',
        payload ? 'The current read failed. The last read that answered is not a new result.' : 'The evidence read could not load.',
        '<button class="gf-btn primary" data-action="retry">Retry</button><button class="gf-btn" data-action="open-diagnose">Open Diagnose</button>');
      host.firstElementChild.dataset.diagnoseFrame = frame;
      host.querySelector('[data-action="retry"]').onclick = read;
      // Retry preserves the failed entry; Open Diagnose starts at Findings.
      host.querySelector('[data-action="open-diagnose"]').onclick = () => {
        navigate('diagnose');
        return read();
      };
      view.focusAfterRender = '[data-action="retry"]';
      return;
    }
    // A render arriving mid-read (the status check, or the guidance read
    // itself) must not re-seat the pre-write desk over its own loading frame.
    // A Retry pressed on the failed frame starts a read while that frame
    // stands; a render arriving mid-read (the focus options completion of the
    // previous cycle, S20b) leaves it standing: it is still the truthful
    // state, and swapping it for the loading frame would pull the Retry out
    // from under the reader's press. Every other mid-read render shows the
    // loading frame, never the retained desk.
    if (pending && host.firstElementChild?.dataset?.diagnoseFrame) return;
    if (checking || pending) { host.innerHTML = loadingFrame('Diagnose'); return; }
    ensureView(host);
    // Read before re-seating: a seated desk whose root is parked is a return
    // that skipped the re-read, not a fresh seat and not an in-place render.
    const wasParked = seated && parked;
    if (wasParked) { root.style.display = ''; parked = false; }
    host.replaceChildren(root);
    // A cold seat never has a deferred completion to consume: the flag is set
    // only while seated, and leave() is the one place seated turns false.
    if (!seated) { seated = true; apply(); }
    else if (wasParked && deferredApply) {
      // A Retry finished off-screen: apply the completion it recorded, restoration included.
      deferredApply = false;
      apply();
    // Never restoreEntry() here: the drill and scroll retention preserves are
    // exactly what restoreEntry()'s row/occurrence clicks would disturb.
    } else if (wasParked) {
      workstation.refresh(); showFocusAction();
      const level = root.querySelector('#level');
      if (level && levelScroll !== null) level.scrollTop = levelScroll;
      if (returnTo) { focusReturn(returnTo); returnTo = null; }
    }
    arrival = deps.navigation;
    (deps.hold || hold)((pagehide) => {
      if (pagehide) { leave(); return; }
      if (currentDestination() !== 'diagnose' || !host.isConnected) detach();
    });
  }
  return { mount, read, leave };
}

export function installDiagnose(options) {
  const destination = createDiagnoseDestination(options);
  registerDestination({ id: 'diagnose', title: 'Diagnose', mount: destination.mount });
  return destination;
}
