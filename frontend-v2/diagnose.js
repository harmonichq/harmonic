// ADR 397: seat the shipped Diagnose composition once. The rail, case stack,
// scoped requests, charts and clinical verdicts remain in their existing owners.
import { createDiagnoseEventComparison } from '../frontend/diagnose-event-comparison.js';
import { recordDiagnoseAge } from '../frontend/diagnose-data-age.js';
import * as client from './client.js';
import { currentDestination, hold, navigate, registerDestination, render, view } from './routes.js';
import { loadingFrame, emptyFrame } from './frame.js';
import { openUtility } from './utilities.js';
import { stageEvidence, evidenceIsStaged, loadPlanState } from './plan-view.js';
import { formatStartMin } from '../frontend/plan.js';

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

  async function read() {
    if (pending) return pending;
    error = null;
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
      if (seated) { workstation.setData(payload); restoreEntry(); }
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
    const row = [...root.querySelectorAll('.qrow[data-id]')].find((node) => node.dataset.id === subject);
    if (row) row.click();
    else if (subject === 'setting:basal_rate' || /^basal:\d+(?:-\d+)?$/.test(subject || '')) {
      const start = subject === 'setting:basal_rate' ? entry.window?.split('-')[0] : subject.split(':')[1].split('-')[0];
      if (start !== undefined) {
        const label = `${formatStartMin(Number(start))} basal slot,`;
        [...root.querySelectorAll('#lane > button.lane-cell')]
          .find(button => button.getAttribute('aria-label')?.startsWith(label))?.click();
      }
    }
    const heading = root.querySelector('#crumb-trail');
    if (heading) heading.tabIndex = -1;
    if (!view.focusAfterRender) view.focusAfterRender = '#crumb-trail';
  }

  function ensureView(host) {
    if (root) return;
    root = host.ownerDocument.createElement('div');
    root.className = 'v2-diagnose';
    root.dataset.v2Diagnose = '';
    workstation = createView({ root, callbacks: {
      stage: (item, desired) => stageEvidence(item, desired, payload?.analyze),
      isStaged: (item) => evidenceIsStaged(item, payload?.analyze),
      retry: read,
      settings: () => openUtility('settings'),
      day: (occurrence) => {
        const at = occurrence.t || occurrence.anchor?.t;
        navigate('day', { date: String(at || '').slice(0, 10),
          subject: entry.subject || occurrence.text || occurrence.anchor?.label || '',
          occurrence: at || '', lever: occurrence.cause_lever || '',
          window: entry.window || '', from: 'diagnose',
          focus: document.activeElement?.id ? `#${CSS.escape(document.activeElement.id)}` : '#crumb-trail' });
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
      loadCase,
      go: (to) => to === 'settings' ? openUtility('settings')
        : navigate(to === 'day' ? 'day' : 'changes', to === 'plan' ? { subject: 'plan' } : {}),
    } });
  }

  function leave() {
    if (!seated) return;
    seated = false;
    workstation.leaveSurface();
    // setData(null) runs the shared owner's teardown and aborts its listeners
    // before its no-payload return. No private renderer cleanup is copied here.
    workstation.setData(null);
    root.remove();
  }

  function mount(host, deps = {}) {
    entry = deps.context || {};
    if (!payload && !error) {
      host.innerHTML = loadingFrame('Diagnose');
      read();
      return;
    }
    if (error && !payload) {
      host.innerHTML = emptyFrame('Diagnose', 'Evidence unavailable', 'The evidence read could not load.',
        '<button class="gf-btn primary" data-action="retry">Retry</button>');
      host.querySelector('[data-action="retry"]').onclick = read;
      return;
    }
    ensureView(host);
    host.replaceChildren(root);
    if (!seated) { seated = true; workstation.setData(payload); restoreEntry(); }
    else if (deps.navigation !== arrival) { workstation.leaveSurface(); workstation.refresh(); restoreEntry(); }
    arrival = deps.navigation;
    if (error) workstation.setError(error);
    (deps.hold || hold)((pagehide) => { if (pagehide || currentDestination() !== 'diagnose' || !host.isConnected) leave(); });
  }
  return { mount, read, leave };
}

export function installDiagnose(options) {
  const destination = createDiagnoseDestination(options);
  registerDestination({ id: 'diagnose', title: 'Diagnose', mount: destination.mount });
  return destination;
}
