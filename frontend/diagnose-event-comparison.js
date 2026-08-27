/* The By-event canvas is a rendering adapter for one served Finding case file.
 * Cohort identity, names, support, membership, and selection all arrive from
 * the case-file endpoint; this module never reconstructs them. */

const STYLE = {
  matched: { color: '--ec-matched', lineType: 'solid' },
  nearly_matched: { color: '--ec-nearly-matched', lineType: 'dashed' },
  comparison: { color: '--ec-comparison', lineType: 'dotted' },
};

import { createDiagnoseWorkstation } from './diagnose-workstation.js';
import { GRID } from './diagnose-workstation-chart.js';

/* The registry adapter builds an option with no surface to read tokens off, so
   the document element answers for it. Outside a browser neither exists, and an
   empty token lets the chart fall back to its own default ink. */
const css = (element, name) => {
  if (typeof getComputedStyle !== 'function') return '';
  const host = element || (typeof document === 'undefined' ? null : document.documentElement);
  if (!host) return '';
  return getComputedStyle(host).getPropertyValue(name).trim();
};
const rounded = (value) => value == null ? '—' : String(Math.round(value));
const dateLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(
  'en-US', { month: 'short', day: 'numeric' },
);
/* At the anchor the axis prints the event's own name — "Completed carb bolus" —
   which is most of a quad tile wide and lands on top of "+1 h" beside it. The
   mini caller passes the empty string there instead: the chart already draws
   its dashed anchor line and marker at zero, and the tile's title names the
   finding the events belong to. */
const axisLabel = (minute, anchor) => {
  if (minute === 0) return anchor;
  return `${minute < 0 ? '−' : '+'}${Math.abs(minute) / 60} h`;
};

export function caseFileSelectionCohort(detail) {
  return detail?.comparison_cohort || null;
}

function selection(caseFile) {
  if (caseFile.selection.state !== 'selected') return null;
  const detail = caseFile.selection.detail;
  return { ...detail, cohort: caseFileSelectionCohort(detail) };
}

function lineSeries(surface, cohort, rows, selectedCohort, support) {
  const style = STYLE[cohort.key];
  const color = css(surface, style.color);
  return { id: `${cohort.key}:line:${support}`, name: cohort.name, type: 'line', silent: true,
    showSymbol: false, connectNulls: false,
    data: rows.map((row) => [row.minute, row.support === support ? row.median : null]),
    lineStyle: { color, type: style.lineType,
      opacity: selectedCohort ? (selectedCohort === cohort.key ? 1 : .28) : 1,
      width: support === 'limited' ? 1.25 : 2 }, itemStyle: { color }, z: 3 };
}

function spreadSeries(surface, cohort, rows, selectedCohort, support) {
  const color = css(surface, STYLE[cohort.key].color);
  return { id: `${cohort.key}:spread:${support}`, name: `${cohort.name} spread`, type: 'custom',
    silent: true, data: rows.filter((row) => row.support === support && row.minute % 60 === 0
      && row.p25 != null && row.p75 != null).map((row) => [row.minute, row.p25, row.p75]),
    renderItem(_params, api) {
      const low = api.coord([api.value(0), api.value(1)]);
      const high = api.coord([api.value(0), api.value(2)]);
      return { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] },
        style: { stroke: color, lineWidth: 1, opacity: selectedCohort
          ? (selectedCohort === cohort.key ? .75 : .2) : .55 } };
    }, z: 2 };
}

function episodeSeries(surface, cohort, selectedCohort) {
  const color = css(surface, STYLE[cohort.key].color);
  return (cohort.episodes || []).map((episode, index) => ({
    id: `${cohort.key}:episode:${index}`, name: `${cohort.name} occurrence`, type: 'line',
    silent: true, showSymbol: false, data: episode.glucose.map((point) => [point.minute, point.bg]),
    lineStyle: { color, type: STYLE[cohort.key].lineType, width: 1,
      opacity: selectedCohort ? (selectedCohort === cohort.key ? .72 : .18) : .42 }, z: 1,
  }));
}

function selectedSeries(surface, detail) {
  if (!detail) return [];
  return [{ id: 'selected:trace', name: 'Selected trace', type: 'line', silent: true,
    showSymbol: false, data: detail.glucose.map((point) => [point.minute, point.bg]),
    lineStyle: { color: css(surface, '--ec-focus'), width: 2.5 }, z: 6 }];
}

function legend(surface, caseFile, selected) {
  const key = surface.querySelector('#ec-chart-key');
  key.dataset.hasSelection = String(Boolean(selected));
  key.innerHTML = caseFile.projection.cohorts.map((cohort) => {
    const selectedCohort = selected?.cohort === cohort.key;
    const count = `${cohort.routed_count} ${cohort.routed_count === 1 ? 'occurrence' : 'occurrences'}`;
    const state = cohort.support === 'supported' ? count
      : cohort.support === 'limited' ? `${count} · limited support`
        : cohort.usable_count === 0 ? `${count} · unavailable`
          : `${count} · unavailable for an average`;
    return `<span class="ec-key-item" data-cohort="${cohort.key}" data-support="${cohort.support}" data-selected-cohort="${selectedCohort}"><i class="ec-key-mark" aria-hidden="true"></i><strong>${cohort.name}</strong><small>${state}${selectedCohort ? ' · selected cohort' : ''}</small></span>`;
  }).join('');
  if (caseFile.projection.comparison.state === 'unavailable') key.insertAdjacentHTML('beforeend',
    `<span class="ec-comparison-unavailable" role="status">${caseFile.projection.comparison.name} is unavailable for comparison.</span>`);
  if (selected) key.insertAdjacentHTML('beforeend', `<span class="ec-key-item" data-cohort="selected"><i class="ec-key-mark" aria-hidden="true"></i><strong>Selected trace</strong><small>${dateLabel(selected.date)} · observed</small></span>`);
}

function option(surface, caseFile, selected, range, mini = false) {
  const { projection } = caseFile;
  const series = [{ type: 'line', data: [], silent: true, name: 'Target range',
    markArea: { silent: true, itemStyle: { color: `color-mix(in srgb, ${css(surface, '--mk-ok')} 7%, transparent)` }, data: [[{ yAxis: 70, ...(mini ? {} : { name: 'target 70–180' }) }, { yAxis: 180 }]] } }];
  for (const cohort of projection.cohorts) {
    for (const support of ['supported', 'limited']) {
      if (!cohort.points.some((point) => point.support === support)) continue;
      series.push(spreadSeries(surface, cohort, cohort.points, selected?.cohort, support));
      series.push(lineSeries(surface, cohort, cohort.points, selected?.cohort, support));
    }
    if (cohort.support === 'withheld') series.push(...episodeSeries(surface, cohort, selected?.cohort));
  }
  series.push(...selectedSeries(surface, selected));
  return { animation: false, backgroundColor: 'transparent', grid: { left: GRID.left, right: mini ? 14 : 34, top: mini ? 8 : 26, bottom: mini ? 20 : 42 }, tooltip: { trigger: 'axis', showContent: false },
    xAxis: { type: 'value', min: projection.window_min[0], max: projection.window_min[1], interval: 60, axisLine: { onZero: false, lineStyle: { color: css(surface, '--mk-line') } }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .48 } }, axisLabel: { color: css(surface, '--mk-muted'), fontSize: mini ? 8 : 10, formatter: (minute) => (mini && minute === 0 ? '' : axisLabel(minute, projection.anchor.label)) } },
    yAxis: { type: 'value', min: range[0], max: range[1], interval: 60, name: mini ? undefined : 'mg/dL', nameLocation: 'end', nameTextStyle: { color: css(surface, '--mk-muted'), fontSize: 9 }, nameGap: 8, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .58 } }, axisLabel: { color: css(surface, '--mk-muted'), fontSize: mini ? 8 : 10 } }, series };
}

/* ONE GLUCOSE AXIS FOR A WHOLE ARRANGEMENT. The envelope is the range every
   glucose chart shows at rest; served values outside it widen the axis in fixed
   steps so tiles seated side by side are read against the same ruler. The range
   is computed once by whoever composes the field and injected, never
   re-derived per chart. */
export const GLUCOSE_STEP = 20;
export const GLUCOSE_ENVELOPE = [60, 200];

export function glucoseRange(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  const [floorFloor, ceilCeil] = GLUCOSE_ENVELOPE;
  if (finite.length === 0) return [floorFloor, ceilCeil];
  const low = Math.min(floorFloor, Math.floor(Math.min(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  const high = Math.max(ceilCeil, Math.ceil(Math.max(...finite) / GLUCOSE_STEP) * GLUCOSE_STEP);
  return [low, high];
}

/** Every glucose value this case file's comparison actually draws. */
export function eventComparisonGlucoseValues(caseFile) {
  const projection = caseFile?.projection;
  const cohortValues = (projection?.cohorts || []).flatMap((cohort) => [
    ...(cohort.points || []).flatMap((point) => [point.median, point.p25, point.p75]),
    ...(cohort.episodes || []).flatMap((episode) =>
      (episode.glucose || []).map((point) => point.bg)),
  ]);
  const detail = caseFile?.selection?.state === 'selected' ? caseFile.selection.detail : null;
  const selectedValues = (detail?.glucose || []).map((point) => point.bg);
  return [...cohortValues, ...selectedValues].filter(Number.isFinite);
}

function assertEventCaseFile(caseFile) {
  if (caseFile?.schema !== 'diagnose-finding-case-file-v1'
      || caseFile?.projection?.alignment !== 'event') {
    throw new Error('Finding case file is not event-aligned.');
  }
}

/* PRESENTATION ADAPTER, NOT A SECOND CHART. The evidence-tile registry draws
   the meals/lows comparison from the same served case file the shipped mount
   reads, through the same series builders — the only difference is that a tile
   is handed the field's glucose range instead of computing its own, and
   has no surface to read tokens off. (#181/#135: the case file is the one
   authority for this fact, and this is its second consumer.) */
/* `mini` is the same rank the other evidence kinds carry: a quad tile gets the
   tight grid, the small label rank and no axis name. Without it this builder
   drew full-size furniture inside a 250px tile — a taller top and bottom than
   its neighbours, so three tiles in a row had plots of different heights, and a
   right inset sized for the strip's value tags, which nothing here has. */
export function eventComparisonChartOption(caseFile, range, surface = null, mini = false) {
  if (!Array.isArray(range) || range.length !== 2
      || !range.every(Number.isFinite) || range[0] >= range[1]) {
    throw new TypeError('event comparison needs one injected field glucose range');
  }
  assertEventCaseFile(caseFile);
  return option(surface, caseFile, selection(caseFile), range, mini);
}

/* The canvas header, rest line and docked readout together. The readout is the
   same shape the clock canvas docks into this header, so the two alignments
   swap inside one rectangle instead of stacking a second header beside it. */
function headMarkup(caseFile) {
  return `<div class="head-swap"><div class="head-line head-rest"><h2>${caseFile.finding.title} response comparison</h2><span class="meta persist">${caseFile.projection.anchor.label}</span></div><div class="head-line head-live" id="ec-readout" aria-hidden="true"></div></div>`;
}

function markup(caseFile, headerHost) {
  const title = `${caseFile.finding.title} response comparison`;
  const body = `<div class="body ec-event-body"><div id="ec-chart" class="ec-chart" role="img" tabindex="0" aria-label="${title}. Use left and right arrow keys to inspect five-minute points."></div><div id="ec-chart-key" class="ec-chart-key" aria-label="Comparison legend"></div></div>`;
  if (headerHost) return body;
  return `<main class="panes ec-panes"><section class="pane canvas-pane ec-canvas" aria-label="${title}"><header class="canvas-head" id="ec-canvas-head" data-hover="0">${headMarkup(caseFile)}</header>${body}</section></main>`;
}

export function renderEventSurface(surface, caseFile, { headerHost = null } = {}) {
  assertEventCaseFile(caseFile);
  const selected = selection(caseFile);
  const previousHeader = headerHost && { html: headerHost.innerHTML, hover: headerHost.dataset.hover };
  if (headerHost) { headerHost.innerHTML = headMarkup(caseFile); headerHost.dataset.hover = '0'; }
  surface.innerHTML = markup(caseFile, headerHost);
  legend(surface, caseFile, selected);
  const chartElement = surface.querySelector('#ec-chart');
  const chart = window.echarts.init(chartElement, null, { renderer: 'canvas' });
  /* The mount reads its own axis off the cohort values it is about to draw:
     alone on the surface, this chart IS the whole field. */
  chart.setOption(eventComparisonChartOption(
    caseFile, glucoseRange(eventComparisonGlucoseValues(caseFile)), surface,
  ));
  const head = headerHost || surface.querySelector('#ec-canvas-head');
  const [windowStart, windowEnd] = caseFile.projection.window_min;
  /* One reading of the served points, feeding both disclosures — the keyboard
     label and the pointer readout say the same server-owned thing. */
  const readingsAt = (at) => caseFile.projection.cohorts.map((cohort) => {
    const point = cohort.points.find((row) => row.minute === at);
    return { name: cohort.name, withheld: point?.support === 'withheld' || !point,
      median: point?.median ?? null, n: point?.n ?? 0 };
  });
  let minute = 0;
  const inspect = (at) => {
    minute = at;
    const readings = readingsAt(at);
    chartElement.setAttribute('aria-label', `${caseFile.finding.title} response comparison. ${axisLabel(at, caseFile.projection.anchor.label)}. ${readings.map((reading) => `${reading.name} ${reading.withheld ? 'unavailable' : rounded(reading.median)}`).join('. ')}.`);
    const readout = head?.querySelector('#ec-readout');
    if (!readout) return;
    readout.innerHTML = `<span class="rd-time">${axisLabel(at, caseFile.projection.anchor.label)}</span>${readings.map((reading) => `<span class="rd-pair"><span class="k">${reading.name}</span><span class="v">${reading.withheld ? 'unavailable' : `${rounded(reading.median)} · n${reading.n}`}</span></span>`).join('')}`;
    head.dataset.hover = '1';
  };
  chartElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    inspect(event.key === 'Home' ? windowStart : event.key === 'End' ? windowEnd
      : Math.max(windowStart, Math.min(windowEnd, minute + (event.key === 'ArrowRight' ? 5 : -5))));
  });
  chartElement.addEventListener('mousemove', (event) => {
    const at = chart.convertFromPixel({ gridIndex: 0 }, [event.offsetX, event.offsetY])?.[0];
    if (!Number.isFinite(at)) return;
    inspect(Math.max(windowStart, Math.min(windowEnd, Math.round(at / 5) * 5)));
  });
  const rest = () => { if (head) head.dataset.hover = '0'; };
  chartElement.addEventListener('mouseleave', rest);
  chartElement.addEventListener('blur', rest);
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(chartElement);
  const restoreHeader = () => { if (previousHeader) { headerHost.innerHTML = previousHeader.html; headerHost.dataset.hover = previousHeader.hover; } };
  const rendered = { chart, observer, restoreHeader, projection: caseFile, selected,
    cohorts: Object.fromEntries(caseFile.projection.cohorts.map((cohort) => [cohort.key, cohort])),
    aggregates: Object.fromEntries(caseFile.projection.cohorts.map((cohort) => [cohort.key, cohort.points])) };
  window.__diagnoseEventComparison = rendered;
  return rendered;
}

/* Compatibility shell: `view=glucose` remains a stable Diagnose route and the
 * browser lifecycle marker, but all evidence requests flow through case files. */
export function createDiagnoseEventComparison({ root, callbacks = {} }) {
  const host = document.createElement('div');
  host.className = 'ec-host';
  host.dataset.eventView = 'glucose';
  root.replaceChildren(host);
  const workstation = createDiagnoseWorkstation({ root: host, callbacks });
  return {
    setData: (payload) => workstation.setData(payload),
    setError: (message) => workstation.setError(message),
    refresh: () => workstation.refresh(),
    repaintDay: () => workstation.repaintDay(),
    gotoState: (state) => workstation.gotoState(state),
    // #135: leaving Diagnose drops the nested canvas's pins and focus. The
    // shell owns no session of its own, so it forwards the reset inward.
    leaveSurface: () => workstation.leaveSurface(),
  };
}
