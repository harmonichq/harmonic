// ADR 397: seat the shipped Diagnose composition once. The rail, case stack,
// scoped requests, charts and clinical verdicts remain in their existing owners.
import { createDiagnoseEventComparison } from '../frontend/diagnose-event-comparison.js';
import { recordDiagnoseAge } from '../frontend/diagnose-data-age.js';
import * as client from './client.js';
import { currentDestination, hold, navigate, registerDestination, render, view } from './routes.js';
import { loadingFrame, emptyFrame } from './frame.js';
import { openUtility } from './utilities.js';
import { stageEvidence, evidenceIsStaged, loadPlanState } from './plan-view.js';
import { createCaseContext, evidenceDayContext } from './diagnose-context.js';
import { focusContextForCase, focusOfferForCase, readFocusOptions } from './focus-entry.js';
import { formatStartMin } from '../frontend/plan.js';

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
  let seated = false;
  let arrival = null;
  let entry = {};
  const ages = {};
  const caseContext = createCaseContext(loadCase);
  let activeSubject = null;
  let restoreObserver = null;

  async function read() {
    if (pending) return pending;
    error = null;
    readFocusOptions().then(() => { if (seated) showFocusAction(); });
    loadPlanState().then(() => { if (seated) workstation.refresh(); }).catch(() => {});
    pending = Promise.all([
      api.fetchAnalysis({ window: 30, pool: true }), api.fetchScenarios(30),
      api.fetchExploreTimeOfDay(), api.fetchExploreExposures(),
      api.fetchDiagnoseFindingCasePreparation(null), api.fetchOutcomesTrend(30),
    ]).then(([a, s, e, x, preparation, outcomes]) => {
      const values = [a, s, e, x, outcomes].map((value, i) =>
        recordDiagnoseAge(ages, ['analysis', 'scenarios', 'time_of_day', 'exposures', 'trend'][i], value));
      if (values.some((value) => value === null)) throw new Error('Diagnose received invalid input-data age.');
      payload = { analyze: values[0], scenarios: values[1], evidence: values[2], exposures: values[3],
        casePreparation: preparation, findings: { ...preparation.findings, rows: preparation.rendered_rows },
        watched: values[4]?.watched_change || null };
      if (seated) { workstation.setData(payload); restoreEntry(); showFocusAction(); }
    }).catch((cause) => {
      error = cause;
      if (seated) workstation.setError(cause);
    }).finally(() => { pending = null; render(); });
    return pending;
  }

  function restoreEntry() {
    if (!root || !payload) return;
    // Context names a served identity or an explicit slot. It never selects the
    // current first-ranked concern as a substitute for the retained subject.
    const subject = entry.subject;
    let subjectOpened = false;
    let occurrenceRequested = false;
    restoreObserver?.disconnect();
    const restore = () => {
      if (!subjectOpened && subject) {
        const row = [...root.querySelectorAll('.qrow[data-id]')].find(node => node.dataset.id === subject);
        if (row) { subjectOpened = true; row.click(); }
        else if (subject === 'setting:basal_rate' || /^basal:\d+(?:-\d+)?$/.test(subject)) {
          const start = subject === 'setting:basal_rate' ? entry.window?.split('-')[0] : subject.split(':')[1].split('-')[0];
          if (start !== undefined) {
            const label = `${formatStartMin(Number(start))} basal slot,`;
            const cell = [...root.querySelectorAll('#lane > button.lane-cell')]
              .find(button => button.getAttribute('aria-label')?.startsWith(label));
            if (cell) { subjectOpened = true; cell.click(); }
          }
        }
      }
      if (!subjectOpened) return;
      if (entry.occurrence) {
        const node = [...root.querySelectorAll('.case-occurrence')]
          .find(node => node.dataset.occurrenceId === entry.occurrence);
        if (!node) return;
        if (node.getAttribute('aria-pressed') !== 'true') {
          if (!occurrenceRequested) { occurrenceRequested = true; node.click(); }
          return;
        }
        (root.querySelector(entry.focus || '#crumb-trail') || node).focus({ preventScroll: true });
      }
      restoreObserver?.disconnect(); restoreObserver = null;
    };
    if (subject) {
      restoreObserver = new MutationObserver(restore);
      restoreObserver.observe(root, { childList: true, subtree: true });
      // Whole-day cases must not accidentally inherit the default Overnight
      // slice on return. The shipped Window control still owns the request.
      if (subject.startsWith('pattern:') || (!entry.window && subject.startsWith('finding:'))) {
        [...root.querySelectorAll('#seg-window button')].find(button => button.textContent === '24 h')?.click();
      }
      restore();
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
      day: (occurrence) => {
        const label = root.querySelector('#lane > button[aria-pressed="true"]')?.getAttribute('aria-label');
        const match = /^(\d{2}):(\d{2}) basal slot,/.exec(label || '');
        const start = match ? Number(match[1]) * 60 + Number(match[2]) : null;
        const selected = caseContext.current();
        const context = evidenceDayContext({ occurrence, selected,
          slot: !selected && start !== null ? { start, end: start + 30 } : null,
          focus: '.occ-foot button:last-child' });
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
      if (context.retry) {
        // A read error needs an explanation and a reachable recovery action.
        // Keeping Retry its own compact control prevents a long status label
        // from hiding the only available action in the narrow findings header.
        const status = root.ownerDocument.createElement('span');
        status.className = 'focus-context'; status.dataset.focusContext = context.subject;
        status.textContent = 'Focus status unavailable'; status.title = context.reason;
        const retry = root.ownerDocument.createElement('button');
        retry.className = 'gf-btn focus-retry'; retry.dataset.focusRetry = context.subject;
        retry.textContent = 'Retry'; retry.title = context.reason;
        retry.onclick = () => readFocusOptions().then(showFocusAction);
        crumb?.append(status, retry);
      } else {
        const button = root.ownerDocument.createElement('button');
        button.className = 'gf-btn focus-context'; button.dataset.focusContext = context.subject;
        button.textContent = context.action;
        button.title = context.reason;
        button.onclick = () => navigate('changes', context.route || { subject: context.subject, from: 'diagnose',
          window: selectedWindow });
        crumb?.append(button);
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
  }

  function mount(host, deps = {}) {
    entry = deps.context || {};
    if (payload && arrival !== null && deps.navigation !== arrival) {
      arrival = deps.navigation;
      leave();
      host.innerHTML = loadingFrame('Diagnose');
      read();
      return;
    }
    if (!payload && !error) {
      host.innerHTML = loadingFrame('Diagnose');
      read();
      return;
    }
    if (error) {
      host.innerHTML = emptyFrame('Diagnose', payload ? 'Current read failed' : 'Evidence unavailable',
        payload ? 'The current read failed. The last read that answered is not a new result.' : 'The evidence read could not load.',
        '<button class="gf-btn primary" data-action="retry">Retry</button><button class="gf-btn" data-action="open-diagnose">Open Diagnose</button>');
      host.querySelector('[data-action="retry"]').onclick = read;
      // Retry preserves the failed entry; Open Diagnose starts at Findings.
      host.querySelector('[data-action="open-diagnose"]').onclick = () => {
        navigate('diagnose');
        return read();
      };
      view.focusAfterRender = '[data-action="retry"]';
      return;
    }
    ensureView(host);
    host.replaceChildren(root);
    if (!seated) { seated = true; workstation.setData(payload); restoreEntry(); showFocusAction(); }
    else if (deps.navigation !== arrival) { workstation.leaveSurface(); workstation.refresh(); restoreEntry(); }
    arrival = deps.navigation;
    (deps.hold || hold)((pagehide) => { if (pagehide || currentDestination() !== 'diagnose' || !host.isConnected) leave(); });
  }
  return { mount, read, leave };
}

export function installDiagnose(options) {
  const destination = createDiagnoseDestination(options);
  registerDestination({ id: 'diagnose', title: 'Diagnose', mount: destination.mount });
  return destination;
}
