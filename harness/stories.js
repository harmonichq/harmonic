import {
  DIAGNOSE_EVIDENCE_CHARTS,
  glucoseRange,
} from '../frontend/diagnose-evidence-charts.js';
import { fieldRange } from '../frontend/diagnose-canvas-layout.js';
import {
  renderCanvas,
  stripGlucoseRange,
} from '../frontend/diagnose-workstation-chart.js';
import {
  createDiagnoseWorkstation,
  resolveColors,
} from '../frontend/diagnose-workstation.js';
import { envelopeFromPooled } from '../frontend/diagnose-workstation-data.js';

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

async function directData() {
  const preparation = await request('/api/diagnose/finding-case-file-preparation');
  const findingId = preparation.rendered_rows.find((row) => row.register === 'finding')?.id;
  const comparison = findingId ? await request(
    `/api/diagnose/finding-case-file?projection_id=${encodeURIComponent(preparation.projection_id)}`
      + `&finding_id=${encodeURIComponent(findingId)}&alignment=event`,
  ) : null;
  const [basal, isf, carbRatio] = await Promise.all([
    request('/api/diagnose/basal-night-evidence'),
    request('/api/diagnose/isf-rest-window-evidence'),
    request('/api/diagnose/carb-ratio-block-evidence'),
  ]);
  return { basal, isf, 'carb-ratio': carbRatio, 'event-comparison': comparison };
}

function chartRange(kind, data, all, policy) {
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find((candidate) => candidate.kind === kind);
  if (!entry.glucoseValues) return null;
  if (policy === 'fitted') return glucoseRange(entry.glucoseValues(data));
  return evidenceFieldRange(all);
}

function evidenceFieldRange(all) {
  const descriptors = Object.entries(all).map(([descriptorKind, descriptorData]) => ({
    kind: descriptorKind,
    state: 'ok',
    data: descriptorData,
  }));
  return fieldRange(descriptors, DIAGNOSE_EVIDENCE_CHARTS, glucoseRange);
}

async function drawEvidence(host, story, state) {
  const all = await directData();
  const entry = DIAGNOSE_EVIDENCE_CHARTS.find(({ kind }) => kind === story.id);
  const data = all[story.id];
  const range = chartRange(story.id, data, all, state.range);
  const chartHost = document.createElement('div');
  chartHost.className = 'harness-chart ec-surface';
  chartHost.toggleAttribute('data-mini', state.size === 'mini');
  host.replaceChildren(chartHost);
  const chart = window.echarts.init(chartHost, null, { renderer: 'canvas' });
  chart.setOption(entry.option(state.mode || null, {
    data,
    caseFile: data,
    range,
    mini: state.size === 'mini',
    surface: chartHost,
  }), true);
  return entry.glucoseValues
    ? `${story.label} · ${state.range} range · ${state.size}`
    : `${story.label} · no glucose axis · ${state.size}`;
}

async function drawStrip(host, state) {
  const [pooled, all] = await Promise.all([
    request('/api/explore/time'),
    directData(),
  ]);
  const envelope = envelopeFromPooled(pooled);
  const chartHost = document.createElement('div');
  chartHost.className = 'harness-chart';
  host.replaceChildren(chartHost);
  const fitted = stripGlucoseRange(envelope);
  const range = state.range === 'shared'
    ? glucoseRange([...evidenceFieldRange(all), ...fitted])
    : fitted;
  renderCanvas(chartHost, window.echarts, {
    envelope,
    colors: resolveColors(),
    range,
    window: [0, 1440],
    windowLabel: 'WHOLE DAY',
  });
  return `Glucose by clock · ${state.range} range`;
}

async function drawWorkstation(host, state) {
  const [analyze, scenarios, evidence, exposures, preparation, outcomes] = await Promise.all([
    request('/api/analyze?window=30&pool=1'),
    request('/api/scenarios?window=30'),
    request('/api/explore/time'),
    request('/api/explore/exposures'),
    request('/api/diagnose/finding-case-file-preparation'),
    request('/api/outcomes?window=30'),
  ]);
  const root = document.createElement('div');
  root.className = 'harness-workstation';
  host.replaceChildren(root);
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
  if (!state.chart) return 'Diagnose workstation · undrilled';
  const findTile = () => [...root.querySelectorAll('.evidence-tile[data-chart-id]')]
    .find((candidate) => candidate.dataset.chartId === state.chart
      && candidate.dataset.state === 'ok');
  const allDay = [...root.querySelectorAll('button')]
    .find((button) => button.textContent.trim() === '24 h');
  allDay?.click();
  root.querySelector('#explorer-trigger')?.click();
  const tile = await new Promise((resolve) => {
    const deadline = performance.now() + 8000;
    const poll = () => {
      const match = findTile();
      if (match || performance.now() >= deadline) resolve(match || null);
      else setTimeout(poll, 50);
    };
    poll();
  });
  if (!tile) return `Diagnose workstation · chart id not found: ${state.chart}`;
  tile.click();
  return `Diagnose workstation · drilled ${state.chart}`;
}

export async function renderStory(host, story, state) {
  if (DIAGNOSE_EVIDENCE_CHARTS.some(({ kind }) => kind === story.id)) {
    return drawEvidence(host, story, state);
  }
  if (story.id === 'strip') return drawStrip(host, state);
  return drawWorkstation(host, state);
}
