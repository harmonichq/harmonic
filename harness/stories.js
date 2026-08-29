import {
  createDiagnoseWorkstation,
} from '../frontend/diagnose-workstation.js';

export const STORIES = [
  { id: 'basal', label: 'Basal evidence', modes: ['clock', 'event'], sizes: true, range: false },
  { id: 'isf', label: 'Correction factor evidence', modes: ['event', 'clock'], sizes: true, range: false },
  { id: 'carb-ratio', label: 'Carb ratio evidence', modes: ['event', 'clock'], sizes: true, range: true },
  { id: 'event-comparison', label: 'Response comparison', modes: [], sizes: true, range: true },
  { id: 'strip', label: 'Glucose by clock', modes: [], sizes: false, range: true },
  { id: 'workstation', label: 'Diagnose workstation', modes: [], sizes: false, range: false },
];

async function request(path) {
  const response = await fetch(path);
  if (!response.ok) {
    let detail = null;
    try { detail = (await response.json()).detail; } catch {}
    throw new Error(typeof detail === 'string' ? detail : detail?.message || response.statusText);
  }
  return response.json();
}

async function drawWorkstation(host, state, story) {
  const [analyze, scenarios, evidence, exposures, preparation, outcomes] = await Promise.all([
    request('/api/analyze?window=30&pool=1'),
    request('/api/scenarios?window=30'),
    request('/api/explore/time-of-day'),
    request('/api/explore/exposures'),
    request('/api/diagnose/finding-case-file-preparation'),
    request('/api/outcomes?window=30'),
  ]);
  const shell = document.createElement('div');
  shell.className = 'cockpit-shell cockpit harness-cockpit';
  const stage = document.createElement('main');
  stage.className = 'cockpit-stage';
  const main = document.createElement('div');
  main.className = 'main-content';
  const mount = document.createElement('div');
  const root = document.createElement('div');
  mount.append(root);
  main.append(mount);
  stage.append(main);
  shell.append(stage);
  host.replaceChildren(shell);
  const view = createDiagnoseWorkstation({
    root,
    callbacks: {
      stage: () => {},
      isStaged: () => false,
      day: () => {},
      retry: () => {},
      loadDay: async () => null,
      onDayLoaded: () => view.repaintDay(),
      loadBasalEvidence: (coordinates) => request(`/api/diagnose/basal-night-evidence?slot=${encodeURIComponent(coordinates.slot ?? '')}`),
      loadIsfEvidence: () => request('/api/diagnose/isf-rest-window-evidence'),
      loadCarbRatioEvidence: (coordinates) => request(
        `/api/diagnose/carb-ratio-block-evidence?block_id=${encodeURIComponent(coordinates.block_id ?? '')}`
          + `&analysis_generation=${encodeURIComponent(coordinates.analysis_generation ?? '')}`,
      ),
      loadFindings: (window, selectedHistoryId) => {
        const params = new URLSearchParams();
        if (window) {
          params.set('start_min', window.start_min);
          params.set('end_min', window.end_min);
        }
        if (selectedHistoryId) params.set('selected_id', selectedHistoryId);
        return request(`/api/diagnose/findings${params.size ? `?${params}` : ''}`);
      },
      loadHistoryEvents: (coordinates) => request(
        `/api/diagnose/carb-ratio-history/events?history_id=${encodeURIComponent(coordinates.historyId ?? '')}`
          + `&analysis_generation=${encodeURIComponent(coordinates.analysisGeneration ?? '')}`
          + (coordinates.selectedRunId ? `&selected_run_id=${encodeURIComponent(coordinates.selectedRunId)}` : ''),
      ),
      loadPreparation: (window) => {
        const params = new URLSearchParams();
        if (window) {
          params.set('start_min', window.start_min);
          params.set('end_min', window.end_min);
        }
        return request(`/api/diagnose/finding-case-file-preparation${params.size ? `?${params}` : ''}`);
      },
      loadCase: (coordinates) => {
        const params = new URLSearchParams(coordinates);
        return request(`/api/diagnose/finding-case-file?${params}`);
      },
      go: () => {},
    },
  });
  view.setData({
    analyze,
    scenarios,
    evidence,
    exposures,
    findings: { ...preparation.findings, rows: preparation.rendered_rows },
    casePreparation: preparation,
    watched: outcomes.watched_change || null,
  });
  const findTile = () => [...root.querySelectorAll('.evidence-tile[data-chart-id]')]
    .find((candidate) => candidate.dataset.state === 'ok' && (
      state.chart ? candidate.dataset.chartId === state.chart
        : story.id === 'basal' ? candidate.dataset.chartId.startsWith('basal:')
          : story.id === 'isf' ? candidate.dataset.chartId === 'isf'
            : story.id === 'carb-ratio' ? candidate.dataset.chartId.startsWith('ic:')
              : story.id === 'event-comparison' ? candidate.dataset.chartId.startsWith('finding:')
                : false));
  if (story.id === 'strip' || story.id === 'workstation') return 'Diagnose workstation · undrilled';
  const tile = await new Promise((resolve) => {
    const deadline = performance.now() + 8000;
    const poll = () => {
      const match = findTile();
      if (match || performance.now() >= deadline) resolve(match || null);
      else setTimeout(poll, 50);
    };
    poll();
  });
  if (!tile) return `Diagnose workstation · ${story.label} unavailable`;
  tile.click();
  return `Diagnose workstation · drilled ${tile.dataset.chartId}`;
}

export async function renderStory(host, story, state) {
  return drawWorkstation(host, state, story);
}
