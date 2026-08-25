/* The By-event canvas is a rendering adapter for one served Finding case file.
 * Cohort identity, names, support, membership, and selection all arrive from
 * the case-file endpoint; this module never reconstructs them. */

const STYLE = {
  matched: { color: '--ec-matched', lineType: 'solid' },
  nearly_matched: { color: '--ec-nearly-matched', lineType: 'dashed' },
  comparison: { color: '--ec-comparison', lineType: 'dotted' },
};

const css = (element, name) => getComputedStyle(element).getPropertyValue(name).trim();
const rounded = (value) => value == null ? '—' : String(Math.round(value));
const dateLabel = (date) => new Date(`${date}T00:00:00`).toLocaleDateString(
  'en-US', { month: 'short', day: 'numeric' },
);
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

function option(surface, caseFile, selected) {
  const { projection } = caseFile;
  const series = [{ type: 'line', data: [], silent: true, name: 'Target range',
    markArea: { silent: true, itemStyle: { color: `color-mix(in srgb, ${css(surface, '--mk-ok')} 7%, transparent)` }, data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]] } }];
  for (const cohort of projection.cohorts) {
    for (const support of ['supported', 'limited']) {
      if (!cohort.points.some((point) => point.support === support)) continue;
      series.push(spreadSeries(surface, cohort, cohort.points, selected?.cohort, support));
      series.push(lineSeries(surface, cohort, cohort.points, selected?.cohort, support));
    }
    if (cohort.support === 'withheld') series.push(...episodeSeries(surface, cohort, selected?.cohort));
  }
  series.push(...selectedSeries(surface, selected));
  return { animation: false, backgroundColor: 'transparent', grid: { left: 52, right: 22, top: 24, bottom: 42 }, tooltip: { trigger: 'axis', showContent: false },
    xAxis: { type: 'value', min: projection.window_min[0], max: projection.window_min[1], interval: 60, axisLine: { onZero: false, lineStyle: { color: css(surface, '--mk-line') } }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .48 } }, axisLabel: { color: css(surface, '--mk-muted'), fontSize: 10, formatter: (minute) => axisLabel(minute, projection.anchor.label) } },
    yAxis: { type: 'value', min: 40, max: 300, interval: 60, name: 'mg/dL', nameLocation: 'end', axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .58 } }, axisLabel: { color: css(surface, '--mk-muted'), fontSize: 10 } }, series };
}

function markup(caseFile, headerHost) {
  const title = `${caseFile.finding.title} response comparison`;
  const body = `<div class="body ec-event-body"><div id="ec-chart" class="ec-chart" role="img" tabindex="0" aria-label="${title}. Use left and right arrow keys to inspect five-minute points."></div><div id="ec-chart-key" class="ec-chart-key" aria-label="Comparison legend"></div></div>`;
  if (headerHost) return body;
  return `<main class="panes ec-panes"><section class="pane canvas-pane ec-canvas" aria-label="${title}"><header class="canvas-head" id="ec-canvas-head" data-hover="0"><h2>${title}</h2><span class="meta persist">${caseFile.projection.anchor.label}</span></header>${body}</section></main>`;
}

export function renderEventSurface(surface, caseFile, { headerHost = null } = {}) {
  if (caseFile?.schema !== 'diagnose-finding-case-file-v1' || caseFile?.projection?.alignment !== 'event') throw new Error('Finding case file is not event-aligned.');
  const selected = selection(caseFile);
  const previousHeader = headerHost && { html: headerHost.innerHTML, hover: headerHost.dataset.hover };
  if (headerHost) { headerHost.innerHTML = `<div class="head-line"><h2>${caseFile.finding.title} response comparison</h2><span class="meta persist">${caseFile.projection.anchor.label}</span></div>`; headerHost.dataset.hover = '0'; }
  surface.innerHTML = markup(caseFile, headerHost);
  legend(surface, caseFile, selected);
  const chartElement = surface.querySelector('#ec-chart');
  const chart = window.echarts.init(chartElement, null, { renderer: 'canvas' });
  chart.setOption(option(surface, caseFile, selected));
  let minute = 0;
  chartElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const [start, end] = caseFile.projection.window_min;
    minute = event.key === 'Home' ? start : event.key === 'End' ? end : Math.max(start, Math.min(end, minute + (event.key === 'ArrowRight' ? 5 : -5)));
    const readings = caseFile.projection.cohorts.map((cohort) => {
      const point = cohort.points.find((row) => row.minute === minute);
      return `${cohort.name} ${point?.support === 'withheld' ? 'unavailable' : rounded(point?.median)}`;
    }).join('. ');
    chartElement.setAttribute('aria-label', `${caseFile.finding.title} response comparison. ${axisLabel(minute, caseFile.projection.anchor.label)}. ${readings}.`);
  });
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(chartElement);
  const restoreHeader = () => { if (previousHeader) { headerHost.innerHTML = previousHeader.html; headerHost.dataset.hover = previousHeader.hover; } };
  const rendered = { chart, observer, restoreHeader, projection: caseFile, selected,
    cohorts: Object.fromEntries(caseFile.projection.cohorts.map((cohort) => [cohort.key, cohort])),
    aggregates: Object.fromEntries(caseFile.projection.cohorts.map((cohort) => [cohort.key, cohort.points])) };
  window.__diagnoseEventComparison = rendered;
  return rendered;
}
