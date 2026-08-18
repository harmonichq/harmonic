/* ★ LOCKED 2026-08-13 by Codex for unattended ui-craft issue #677.
 * Meals and Lows are evidence-only lenses inside the shipped Diagnose
 * workstation; Glucose remains the recommendation and setting-action surface.
 * The instrument rail selects View, Factor, and a fixed anchor-time block. The
 * chart compares rule-matched, factor-specific near-rule, and rule-did-not-match
 * cohorts with median lines and hourly 25–75 whiskers; another-factor events are
 * hidden by default. Meals align on one completed positive-dose carb bolus over
 * −1 h/+5 h; Lows align on the nadir over −5 h/+2 h; glucose stays fixed at
 * 40–300 mg/dL. Selecting one exact occurrence dims aggregates, overlays its
 * observed trace, shows logged rescue carbs when present, and links to Day.
 * Near-rule is disclosure only and never enters Priority, recommendations,
 * Plan, or settings actions. Full contract: diagnose-event-comparison.lock.md.
 *
 * RE-SETTLED TERMS 1 and 3 · 2026-08-13. The View
 * control is the rail's first instrument on EVERY view, Glucose included
 * (injected into the shipped workstation's rail via `railLead`), so no view is
 * a dead end; and Glucose, the recommendation surface, is the default view.
 * Supersedes the terms quoted in the lock manifest's re-settle block.
 *
 * RE-SETTLED TERM 17 · 2026-08-16 · resolved via ADR 678. A selected Low
 * renders every in-window rescue-carb entry with
 * a finite positive amount. Manual, rise-prompt, and low-prompt provenance
 * follow the same projection rule; unknown amounts and provenance stay out of
 * the browser contract.
 */
import { createDiagnoseWorkstation } from './diagnose-workstation.js';

let params = new URLSearchParams();
let activeInstance = null;
/* Glucose leads and is the fallback: it is the recommendation surface, so a
   bare #diagnose opens there. Meals and Lows are evidence lenses you choose. */
const VIEWS = ['glucose', 'meals', 'lows'];

const COHORTS = {
  fired: {
    label: 'Rule matched',
    short: 'Matched',
    note: 'Current factor matched',
    color: '--ec-fired',
    lineType: 'solid',
  },
  near_rule: {
    label: 'Near rule',
    short: 'Near',
    note: 'Narrowly outside the rule',
    color: '--ec-near',
    lineType: 'dashed',
  },
  neutral: {
    label: 'Rule did not match',
    short: 'No match',
    note: 'Comparable; no factor matched',
    color: '--ec-neutral',
    lineType: 'dotted',
  },
  another_factor: {
    label: 'Another factor applies',
    short: 'Other',
    note: 'A different current factor matched',
    color: '--ec-other',
    lineType: 'dashed',
  },
};

const viewCopy = {
  meals: {
    title: 'Meal response comparison',
    axisAnchor: 'bolus',
    occurrence: 'meal',
    context: 'completed carb bolus · −1 h to +5 h',
  },
  lows: {
    title: 'Low response comparison',
    axisAnchor: 'low',
    occurrence: 'low',
    context: 'excursion nadir · −5 h to +2 h',
  },
};

const isRecord = (value) => value !== null && typeof value === 'object'
  && !Array.isArray(value);
const hasExactKeys = (value, keys) => isRecord(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const nullableNumber = (value) => value === null || finiteNumber(value);
const localTimestamp = (value) => typeof value === 'string'
  && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value);
const isoDate = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value);
const supportState = (value) => ['supported', 'limited', 'withheld'].includes(value);
const cohortKey = (value) => ['fired', 'near_rule', 'neutral', 'another_factor', 'excluded'].includes(value);
const factorKey = (value) => [
  'carb_undercount', 'late_bolus', 'meal_over_delivery',
  'over_treated_low', 'correction_on_iob', 'correction_stacking',
].includes(value);
const blockKey = (value) => ['overnight', 'morning', 'afternoon', 'evening', 'all'].includes(value);

function validOccurrence(value, view, selected = false) {
  const identityKind = view === 'meals' ? 'meal' : 'low';
  const anchorKind = view === 'meals' ? 'completed_carb_bolus' : 'excursion_nadir';
  const keys = selected
    ? ['identity', 'anchor', 'verdict', 'glucose', 'markers', 'day_target']
    : ['identity', 'anchor', 'verdict'];
  return hasExactKeys(value, keys)
    && hasExactKeys(value.identity, ['id', 'kind'])
    && typeof value.identity.id === 'string' && value.identity.kind === identityKind
    && hasExactKeys(value.anchor, ['kind', 't', 'date', 'bg', 'worst_bg', 'label'])
    && value.anchor.kind === anchorKind && localTimestamp(value.anchor.t)
    && isoDate(value.anchor.date) && nullableNumber(value.anchor.bg)
    && nullableNumber(value.anchor.worst_bg) && (value.anchor.label === null || typeof value.anchor.label === 'string')
    && hasExactKeys(value.verdict, ['factor', 'cohort', 'provenance', 'detail', 'evidence_tier', 'other_factors', 'boundary_facts'])
    && factorKey(value.verdict.factor) && cohortKey(value.verdict.cohort)
    && typeof value.verdict.provenance === 'string'
    && (value.verdict.detail === null || typeof value.verdict.detail === 'string')
    && (value.verdict.evidence_tier === null
      || ['observed', 'inferred', 'not_in_data'].includes(value.verdict.evidence_tier))
    && Array.isArray(value.verdict.other_factors)
    && value.verdict.other_factors.every((factor) => hasExactKeys(factor, ['key', 'label'])
      && factorKey(factor.key) && typeof factor.label === 'string')
    && Array.isArray(value.verdict.boundary_facts)
    && value.verdict.boundary_facts.every((fact) => hasExactKeys(fact, ['key', 'label', 'value', 'unit'])
      && typeof fact.key === 'string' && typeof fact.label === 'string'
      && finiteNumber(fact.value) && typeof fact.unit === 'string');
}

function validProjection(value, requestedView) {
  if (!hasExactKeys(value, ['schema', 'coordinates', 'population', 'cohorts', 'occurrences', 'selection'])
      || value.schema !== 'diagnose-event-comparison-v2') return false;
  const { coordinates, population, cohorts, occurrences, selection } = value;
  const factorKeys = coordinates?.view === 'meals'
    ? ['carb_undercount', 'late_bolus', 'meal_over_delivery']
    : ['over_treated_low', 'correction_on_iob', 'correction_stacking'];
  const alignmentWindow = coordinates?.view === 'meals' ? [-60, 300] : [-300, 120];
  const blockKeys = ['overnight', 'morning', 'afternoon', 'evening', 'all'];
  if (!hasExactKeys(coordinates, ['view', 'factor', 'block', 'another', 'source_window', 'anchor', 'alignment_window_min', 'factor_options', 'block_options'])
      || coordinates.view !== requestedView || !['meals', 'lows'].includes(coordinates.view)
      || !factorKeys.includes(coordinates.factor) || !blockKey(coordinates.block)
      || typeof coordinates.another !== 'boolean'
      || !hasExactKeys(coordinates.source_window, ['start', 'end'])
      || !isoDate(coordinates.source_window.start) || !isoDate(coordinates.source_window.end)
      || !hasExactKeys(coordinates.anchor, ['kind', 'label'])
      || typeof coordinates.anchor.label !== 'string'
      || !Array.isArray(coordinates.alignment_window_min) || coordinates.alignment_window_min.length !== 2
      || coordinates.alignment_window_min.some((value, index) => value !== alignmentWindow[index])
      || !Array.isArray(coordinates.factor_options) || !Array.isArray(coordinates.block_options)
      || coordinates.factor_options.length !== factorKeys.length
      || coordinates.block_options.length !== blockKeys.length
      || !coordinates.factor_options.every((option, index) => hasExactKeys(option, ['key', 'label'])
        && option.key === factorKeys[index]
        && typeof option.label === 'string')
      || !coordinates.block_options.every((option, index) => hasExactKeys(option, ['key', 'label'])
        && option.key === blockKeys[index]
        && typeof option.label === 'string')) return false;
  const anchorKind = coordinates.view === 'meals' ? 'completed_carb_bolus' : 'excursion_nadir';
  if (coordinates.anchor.kind !== anchorKind
      || !coordinates.factor_options.some((option) => option.key === coordinates.factor)) return false;
  const countKeys = ['fired', 'near_rule', 'neutral', 'another_factor', 'excluded'];
  if (!hasExactKeys(population, ['denominator', 'counts'])
      || !Number.isInteger(population.denominator) || population.denominator < 0
      || !hasExactKeys(population.counts, countKeys)
      || !countKeys.every((key) => Number.isInteger(population.counts[key]) && population.counts[key] >= 0)
      || population.denominator !== countKeys.reduce((sum, key) => sum + population.counts[key], 0)) return false;
  const visibleKeys = ['fired', 'near_rule', 'neutral', ...(coordinates.another ? ['another_factor'] : [])];
  if (!Array.isArray(cohorts) || cohorts.length !== visibleKeys.length
      || !cohorts.every((cohort, index) => hasExactKeys(cohort, ['key', 'routed_count', 'usable_count', 'support', 'occurrence_ids', 'points'])
        && cohort.key === visibleKeys[index] && Number.isInteger(cohort.routed_count)
        && cohort.routed_count >= 0 && Number.isInteger(cohort.usable_count)
        && cohort.usable_count >= 0 && cohort.usable_count <= cohort.routed_count
        && supportState(cohort.support) && Array.isArray(cohort.occurrence_ids)
        && cohort.occurrence_ids.every((id) => typeof id === 'string')
        && cohort.routed_count === cohort.occurrence_ids.length
        && Array.isArray(cohort.points) && cohort.points.every((point) => hasExactKeys(point, ['minute', 'n', 'support', 'median', 'p25', 'p75'])
          && Number.isInteger(point.minute) && Number.isInteger(point.n) && point.n >= 0
          && supportState(point.support) && nullableNumber(point.median)
          && nullableNumber(point.p25) && nullableNumber(point.p75)
          && (point.support !== 'withheld' || (point.median === null && point.p25 === null && point.p75 === null))))) return false;
  if (!Array.isArray(occurrences) || !occurrences.every((occurrence) => validOccurrence(occurrence, coordinates.view))) return false;
  const occurrenceById = new Map(occurrences.map((occurrence) => [occurrence.identity.id, occurrence]));
  if (!isRecord(selection)) return false;
  if (selection.state === 'none') return hasExactKeys(selection, ['state', 'detail']) && selection.detail === null;
  if (selection.state === 'unavailable') {
    return hasExactKeys(selection, ['state', 'requested_id', 'detail'])
      && typeof selection.requested_id === 'string' && selection.detail === null;
  }
  if (!hasExactKeys(selection, ['state', 'requested_id', 'detail'])
      || selection.state !== 'selected' || typeof selection.requested_id !== 'string'
      || !validOccurrence(selection.detail, coordinates.view, true)
      || selection.detail.identity.id !== selection.requested_id
      || !occurrenceById.has(selection.requested_id)
      || !Array.isArray(selection.detail.glucose)
      || !selection.detail.glucose.every((point) => hasExactKeys(point, ['t', 'minute', 'bg'])
        && localTimestamp(point.t) && finiteNumber(point.minute) && finiteNumber(point.bg))
      || !Array.isArray(selection.detail.markers)
      || !selection.detail.markers.every((marker) => hasExactKeys(marker, ['kind', 't', 'minute', 'grams', 'certainty'])
        && marker.kind === 'rescue_carb' && localTimestamp(marker.t) && finiteNumber(marker.minute)
        && finiteNumber(marker.grams) && marker.grams > 0
        && ['exact', 'estimate', 'unknown'].includes(marker.certainty))
      || (coordinates.view === 'meals' && selection.detail.markers.length !== 0)
      || !hasExactKeys(selection.detail.day_target, ['date']) || !isoDate(selection.detail.day_target.date)) return false;
  const summary = occurrenceById.get(selection.requested_id);
  return JSON.stringify(summary.identity) === JSON.stringify(selection.detail.identity)
    && JSON.stringify(summary.anchor) === JSON.stringify(selection.detail.anchor)
    && JSON.stringify(summary.verdict) === JSON.stringify(selection.detail.verdict);
}

const setUrl = (changes) => {
  activeInstance?.applyChanges(changes);
};

const css = (element, name) =>
  getComputedStyle(element).getPropertyValue(name).trim();

const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString(
  'en-US', { month: 'short', day: 'numeric' },
);

const fmtTime = (stamp) => stamp.slice(11, 16);
const rounded = (value) => value == null ? '—' : String(Math.round(value));

/* The lens selector is the rail's first instrument on every view, Glucose
   included (#677 re-settle, term 3). Glucose renders it inside the shipped
   workstation's own rail via `railLead`, so all three views share one optical
   row and none of them is a dead end. */
function createViewInstrumentMarkup(viewKey) {
  return `
      <div class="instrument ec-view-coordinate">
        <span class="cap">View</span>
        <div class="seg ec-view-seg" role="group" aria-label="Diagnose view">
          ${VIEWS.map((key) => `<button type="button" data-view="${key}" aria-pressed="${key === viewKey}">${key[0].toUpperCase()}${key.slice(1)}</button>`).join('')}
        </div>
      </div>`;
}

function createCoordinateMarkup(viewKey, coordinates) {
  return `
    <div class="ec-coordinates" aria-label="Diagnose lens coordinates">
      ${createViewInstrumentMarkup(viewKey)}
      <label class="instrument ec-factor-coordinate">
        <span class="cap">Factor</span>
        <select id="ec-factor" aria-label="Factor">
          ${coordinates.factor_options.map(({ key, label }) => `<option value="${key}" ${key === coordinates.factor ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </label>
      <div class="instrument ec-block-coordinate">
        <span class="cap">Anchor time</span>
        <div class="seg ec-block-seg" role="group" aria-label="Anchor time block">
          ${coordinates.block_options.map(({ key, label }) => `<button type="button" data-block="${key}" aria-pressed="${key === coordinates.block}">${label}</button>`).join('')}
        </div>
      </div>
      <label class="ec-another">
        <input id="ec-another" type="checkbox" ${coordinates.another ? 'checked' : ''}>
        <span class="ec-label">Other factors</span>
        <output id="ec-another-count">0</output>
      </label>
    </div>`;
}

function createSurfaceMarkup(viewKey, coordinates) {
  const copy = viewCopy[viewKey];
  return `
    ${createCoordinateMarkup(viewKey, coordinates)}
    <main class="panes ec-panes">
      <section class="pane canvas-pane ec-canvas" aria-label="${copy.title}">
        <header class="canvas-head" id="ec-canvas-head" data-hover="0">
          <div class="head-swap">
            <div class="head-line head-rest">
              <h2>${copy.title}</h2>
              <span class="ec-title-context">${coordinates.factor_options.find(({ key }) => key === coordinates.factor)?.label || coordinates.factor}</span>
            </div>
            <!-- The resting placeholder is load-bearing, exactly as in the
                 shipped header: it holds the readout's line box open so the
                 header is the same height hovering or not. Left empty, the
                 header grew 2px and pushed the chart down on first hover. -->
            <div class="head-line head-live ec-canvas-readout" id="ec-readout" aria-hidden="true"><span class="ec-rd-time">--:--</span></div>
          </div>
          <span class="meta persist">${copy.context}</span>
        </header>
        <div class="body">
          <div id="ec-chart" class="ec-chart" role="img" tabindex="0" aria-label="${copy.title}. Use left and right arrow keys to inspect five-minute points."></div>
          <div class="ec-chart-key" id="ec-chart-key" aria-label="Cohort legend"></div>
        </div>
      </section>
      <section class="pane inspector ec-inspector" aria-label="Factor inspector">
        <header><h2>Factor judgment</h2><span class="meta" id="ec-inspector-meta">—</span></header>
        <div class="body">
          <section class="ec-judgment" aria-labelledby="ec-judgment-title">
            <h3 id="ec-judgment-title">${coordinates.factor_options.find(({ key }) => key === coordinates.factor)?.label || coordinates.factor}</h3>
            <p class="ec-judgment-summary" id="ec-judgment-summary"></p>
            <div class="ec-counts" id="ec-counts"></div>
            <p class="ec-boundary-note"><b>Near rule is disclosure only.</b> It explains the boundary and never enters Priority, a suggestion, or Plan.</p>
            <div class="ec-zero" id="ec-zero" hidden>No events in this state met the current factor rule. Near-rule and neutral evidence remain visible.</div>
          </section>
          <section class="ec-occurrences" aria-labelledby="ec-occurrences-title">
            <div class="ec-occurrences-head">
              <h3 id="ec-occurrences-title">Inspect an occurrence</h3>
              <span id="ec-occurrence-count">—</span>
            </div>
            <select class="ec-occurrence-select" id="ec-occurrence" aria-label="Occurrence overlay">
              <option value="">No observed trace overlaid</option>
            </select>
            <div class="ec-occ-detail" id="ec-occ-detail" hidden>
              <div class="ec-occ-title"><strong id="ec-occ-title"></strong><span id="ec-occ-cohort"></span></div>
              <p class="ec-occ-verdict" id="ec-occ-verdict"></p>
              <div class="ec-occ-facts" id="ec-occ-facts"></div>
              <div class="ec-rescue" id="ec-rescue" hidden></div>
              <div class="ec-occ-actions">
                <a class="ec-day-link" id="ec-day-link" href="#">Open this date in Day</a>
                <button class="ec-clear" id="ec-clear" type="button">Clear trace</button>
              </div>
            </div>
          </section>
          <p class="ec-inspector-note">This comparison describes recorded events. It does not change the current glucose recommendation or pump settings.<br><a class="ec-glucose-link" href="?view=glucose">Review the full-window Glucose recommendation →</a></p>
        </div>
      </section>
    </main>`;
}

/* Scoped to the View instrument alone, because on Glucose it is installed into
   the shipped workstation's rail, which carries its own `.seg[role="group"]`
   (Window) with its own key handling. */
function installViewControls(scope) {
  const group = scope.querySelector('.ec-view-seg');
  for (const button of group.querySelectorAll('[data-view]')) {
    button.addEventListener('click', () => setUrl({ view: button.dataset.view, factor: null, occ: null }));
  }
  installSegKeys([group]);
}

function installCoordinateControls(surface) {
  installViewControls(surface);
  for (const button of surface.querySelectorAll('[data-block]')) {
    button.addEventListener('click', () => setUrl({ block: button.dataset.block, occ: null }));
  }
  installSegKeys(surface.querySelectorAll('.ec-block-seg[role="group"]'));
}

function installSegKeys(groups) {
  for (const group of groups) {
    group.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...group.querySelectorAll('button')];
      const at = buttons.indexOf(event.target.closest('button'));
      if (at < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0
        : event.key === 'End' ? buttons.length - 1
          : (at + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
    });
  }
}

function colorFor(surface, cohort) {
  return css(surface, COHORTS[cohort].color);
}

function emphasisOpacity(selectedCohort, cohort, normal, selected, dimmed) {
  if (!selectedCohort) return normal;
  return selectedCohort === cohort ? selected : dimmed;
}

function whiskerSeries(surface, cohort, aggregateRows, selectedCohort, support) {
  const color = colorFor(surface, cohort);
  const limited = support === 'limited';
  return {
    id: `${cohort}:spread:${support}`,
    name: `${COHORTS[cohort].label} ${support} spread`,
    type: 'custom',
    silent: true,
    z: 2,
    data: aggregateRows
      .filter((row) => row.support === support && row.minute % 60 === 0
        && row.p25 != null && row.p75 != null)
      .map((row) => [row.minute, row.p25, row.p75]),
    renderItem(_params, api) {
      const low = api.coord([api.value(0), api.value(1)]);
      const high = api.coord([api.value(0), api.value(2)]);
      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: low[0], y1: low[1], x2: high[0], y2: high[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .27 : .42, limited ? .24 : .38, limited ? .08 : .11), lineWidth: limited ? .8 : 1, lineDash: limited ? [2, 2] : null } },
          { type: 'line', shape: { x1: low[0] - (limited ? 2.5 : 3), y1: low[1], x2: low[0] + (limited ? 2.5 : 3), y2: low[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .34 : .52, limited ? .31 : .48, limited ? .11 : .15), lineWidth: limited ? .8 : 1 } },
          { type: 'line', shape: { x1: high[0] - (limited ? 2.5 : 3), y1: high[1], x2: high[0] + (limited ? 2.5 : 3), y2: high[1] }, style: { stroke: color, opacity: emphasisOpacity(selectedCohort, cohort, limited ? .34 : .52, limited ? .31 : .48, limited ? .11 : .15), lineWidth: limited ? .8 : 1 } },
        ],
      };
    },
  };
}

function lineSeries(surface, cohort, aggregateRows, selectedCohort, support) {
  const limited = support === 'limited';
  return {
    id: `${cohort}:line:${support}`,
    name: `${COHORTS[cohort].label} ${support}`,
    type: 'line',
    z: 4,
    showSymbol: limited,
    symbol: 'emptyCircle',
    symbolSize: limited ? 3.5 : 0,
    connectNulls: false,
    animation: false,
    emphasis: { disabled: true },
    data: aggregateRows.map((row) => [row.minute,
      row.support === support ? row.median : null]),
    lineStyle: {
      color: colorFor(surface, cohort),
      width: limited ? 1.05 : cohort === 'fired' ? 2.4 : 1.8,
      type: COHORTS[cohort].lineType,
      opacity: emphasisOpacity(selectedCohort, cohort,
        limited ? .58 : cohort === 'neutral' ? .82 : 1,
        limited ? .5 : .7,
        limited ? .12 : .18),
    },
    itemStyle: {
      color: css(surface, '--mk-surface'), borderColor: colorFor(surface, cohort),
      borderWidth: limited ? 1 : 0,
      opacity: emphasisOpacity(selectedCohort, cohort,
        limited ? .72 : 1, limited ? .64 : .8, .18),
    },
  };
}

function selectedSeries(surface, occurrence) {
  if (!occurrence) return [];
  const series = [{
    name: 'Selected occurrence',
    type: 'line',
    z: 8,
    showSymbol: false,
    animation: false,
    data: occurrence.glucose.map((point) => [point.minute, point.bg]),
    lineStyle: { color: css(surface, '--ec-focus'), width: 2.2, opacity: 1 },
    itemStyle: { color: css(surface, '--ec-focus') },
  }];
  if (occurrence.markers.length && occurrence.glucose.length) {
    const readings = occurrence.glucose;
    series.push({
      name: 'Rescue carbs',
      type: 'scatter',
      z: 10,
      symbol: 'triangle',
      symbolSize: 11,
      data: occurrence.markers.map((carbs) => {
        const nearest = readings.reduce((best, point) =>
          Math.abs(point.minute - carbs.minute) < Math.abs(best.minute - carbs.minute) ? point : best,
        );
        return [carbs.minute, nearest.bg, carbs.grams];
      }),
      itemStyle: { color: css(surface, '--ck-manual'), borderColor: css(surface, '--mk-surface'), borderWidth: 1 },
    });
  }
  return series;
}

function axisLabel(value, anchor) {
  if (value === 0) return anchor;
  const hours = Math.abs(value / 60);
  return `${value < 0 ? '−' : '+'}${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}

function paintReadout(surface, minute, aggregates, cohortOrder, copy) {
  const head = surface.querySelector('#ec-canvas-head');
  const host = surface.querySelector('#ec-readout');
  if (minute == null) {
    head.dataset.hover = '0';
    host.setAttribute('aria-hidden', 'true');
    return;
  }
  const snapped = Math.round(minute / 5) * 5;
  const pieces = [`<span class="ec-rd-time">${axisLabel(snapped, copy.axisAnchor)}</span>`];
  for (const cohort of cohortOrder) {
    const row = aggregates[cohort].find((item) => item.minute === snapped);
    const support = row?.support || 'withheld';
    const value = support === 'withheld' ? '—' : rounded(row?.median);
    pieces.push(`<span class="ec-rd-value" data-support="${support}">${COHORTS[cohort].short} <b>${value}</b><em>${support[0].toUpperCase()}${support.slice(1)} · n${row?.n ?? 0}</em></span>`);
  }
  host.innerHTML = pieces.join('');
  host.setAttribute('aria-hidden', 'false');
  head.dataset.hover = '1';
}

function pointStateSummary(rows) {
  const counts = { supported: 0, limited: 0, withheld: 0 };
  for (const row of rows) counts[row.support] += 1;
  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([support, count]) => `${count} ${support}`)
    .join(' · ');
}

function paintLegend(surface, cohortOrder, cohorts, aggregates, selected) {
  const key = surface.querySelector('#ec-chart-key');
  key.dataset.hasSelection = String(Boolean(selected));
  key.innerHTML = cohortOrder.map((cohort) => {
    const record = cohorts[cohort];
    const support = record.support[0].toUpperCase() + record.support.slice(1);
    const selectedCohort = selected?.verdict.cohort === cohort;
    const detail = record.support === 'withheld'
      ? `${record.routed_count} ${record.routed_count === 1 ? 'event' : 'events'} · aggregate not shown`
      : `${record.routed_count} events · ${pointStateSummary(aggregates[cohort])} points`;
    return `
      <span class="ec-key-item" data-cohort="${cohort}" data-support="${record.support}" data-selected-cohort="${selectedCohort}">
        <i class="ec-key-mark" aria-hidden="true"></i>
        <strong>${COHORTS[cohort].label}<em class="ec-support-label">${support}</em></strong>
        <small>${detail}${selectedCohort ? ' · selected cohort' : ''}</small>
      </span>`;
  }).join('');
  if (selected) {
    key.insertAdjacentHTML('beforeend', `
      <span class="ec-key-item" data-cohort="selected">
        <i class="ec-key-mark" aria-hidden="true" style="color:var(--ec-focus)"></i>
        <strong>Selected trace</strong><small>${fmtDate(selected.anchor.date)} · observed</small>
      </span>`);
  }
}

function chartOption(surface, coordinates, copy, cohortOrder, cohorts, aggregates, selected) {
  const series = [{
    name: 'Target range',
    type: 'line',
    data: [],
    silent: true,
    markArea: {
      silent: true,
      itemStyle: { color: `color-mix(in srgb, ${css(surface, '--mk-ok')} 7%, transparent)` },
      data: [[{ yAxis: 70, name: 'target 70–180' }, { yAxis: 180 }]],
      label: { show: true, position: 'insideTopLeft', color: css(surface, '--mk-muted'), fontSize: 10, fontFamily: 'Inter' },
    },
  }];
  for (const cohort of cohortOrder) {
    for (const support of ['supported', 'limited']) {
      if (!aggregates[cohort].some((row) => row.support === support)) continue;
      const selectedCohort = selected?.verdict.cohort;
      series.push(whiskerSeries(surface, cohort, aggregates[cohort], selectedCohort, support));
      series.push(lineSeries(surface, cohort, aggregates[cohort], selectedCohort, support));
    }
  }
  series.push(...selectedSeries(surface, selected));

  return {
    animation: false,
    backgroundColor: 'transparent',
    aria: {
      enabled: true,
      decal: { show: false },
      description: `${copy.title}. Median lines compare ${cohortOrder.map((key) => COHORTS[key].label).join(', ')}. Sparse whiskers show the 25th to 75th percentile.`,
    },
    grid: { left: 52, right: 22, top: 24, bottom: 42, containLabel: false },
    tooltip: { trigger: 'axis', showContent: false, axisPointer: { type: 'cross', label: { show: false } } },
    xAxis: {
      type: 'value',
      min: coordinates.alignment_window_min[0],
      max: coordinates.alignment_window_min[1],
      interval: 60,
      axisLine: { onZero: false, lineStyle: { color: css(surface, '--mk-line') } },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .48 } },
      axisLabel: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10, formatter: (value) => axisLabel(value, copy.axisAnchor) },
    },
    yAxis: {
      type: 'value',
      min: 40,
      max: 300,
      interval: 60,
      name: 'mg/dL',
      nameLocation: 'end',
      nameGap: 8,
      nameTextStyle: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10, align: 'left' },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: true, lineStyle: { color: css(surface, '--mk-line'), opacity: .58 } },
      axisLabel: { color: css(surface, '--mk-muted'), fontFamily: 'Inter', fontSize: 10 },
    },
    series,
  };
}

function summarySentence(counts) {
  return `${counts.fired} events met this factor’s rule. ${counts.near_rule} sat narrowly outside it. ${counts.neutral} comparable events did not match any factor.`;
}

function boundaryFacts(facts) {
  return facts.map(({ label, value, unit }) => `${label} ${value}${unit ? ` ${unit}` : ''}`);
}

function paintInspector(surface, projection, viewKey, cohortOrder, cohorts, selected) {
  const { coordinates, population, occurrences } = projection;
  const { counts } = population;
  const unit = viewKey === 'meals' ? 'completed meals' : 'lows';
  surface.querySelector('#ec-inspector-meta').textContent = `${fmtDate(coordinates.source_window.start)}–${fmtDate(coordinates.source_window.end)} · ${coordinates.block_options.find(({ key }) => key === coordinates.block)?.label || coordinates.block}`;
  surface.querySelector('#ec-judgment-summary').textContent = `${summarySentence(counts)} ${counts.another_factor} had another factor; ${counts.excluded} of ${population.denominator} ${unit} were excluded as not safely comparable.`;
  surface.querySelector('#ec-counts').innerHTML = ['fired', 'near_rule', 'neutral'].map((key) => `
    <div class="ec-count" data-support="${cohorts[key].support}"><b>${counts[key]}</b>${COHORTS[key].label}<em>${cohorts[key].support[0].toUpperCase()}${cohorts[key].support.slice(1)}</em></div>`).join('');
  const fired = cohorts.fired;
  const withheld = surface.querySelector('#ec-zero');
  withheld.hidden = fired.support !== 'withheld';
  withheld.textContent = fired.routed_count === 0
    ? 'No events met this rule. There is no aggregate to show; near-rule and no-match evidence remain available.'
    : 'One event met this rule. Its exact occurrence remains available, but the cohort aggregate is withheld.';
  surface.querySelector('#ec-another-count').textContent = String(
    counts.another_factor,
  );
  surface.querySelector('#ec-occurrence-count').textContent = `${occurrences.length} available`;

  const select = surface.querySelector('#ec-occurrence');
  for (const occurrence of occurrences) {
    const option = document.createElement('option');
    option.value = occurrence.identity.id;
    option.textContent = `${COHORTS[occurrence.verdict.cohort].label} · ${fmtDate(occurrence.anchor.date)} ${fmtTime(occurrence.anchor.t)}`;
    option.selected = selected?.identity.id === occurrence.identity.id;
    select.append(option);
  }

  const detail = surface.querySelector('#ec-occ-detail');
  if (!selected) return;
  detail.hidden = false;
  surface.querySelector('#ec-occ-title').textContent = `${fmtDate(selected.anchor.date)} · ${fmtTime(selected.anchor.t)}`;
  surface.querySelector('#ec-occ-cohort').textContent = COHORTS[selected.verdict.cohort].label;
  surface.querySelector('#ec-occ-verdict').textContent = selected.verdict.detail || COHORTS[selected.verdict.cohort].note;
  const facts = [
    selected.anchor.bg == null ? null : `at anchor ${Math.round(selected.anchor.bg)} mg/dL`,
    selected.anchor.worst_bg == null ? null : `range extreme ${Math.round(selected.anchor.worst_bg)} mg/dL`,
    selected.verdict.evidence_tier?.replaceAll('_', ' '),
    ...boundaryFacts(selected.verdict.boundary_facts),
  ].filter(Boolean);
  surface.querySelector('#ec-occ-facts').textContent = facts.join(' · ');
  surface.querySelector('#ec-day-link').href = `../?tab=day&date=${selected.day_target.date}`;

  const rescue = surface.querySelector('#ec-rescue');
  if (viewKey === 'lows' && selected.markers.length) {
    rescue.textContent = `Rescue carbs: ${selected.markers.map((item) => `${item.grams} g`).join(', ')}.`;
    rescue.hidden = false;
  }
}

function renderEventSurface(surface, projection) {
  const { coordinates } = projection;
  const viewKey = coordinates.view;
  const cohortOrder = projection.cohorts.map(({ key }) => key);
  const cohorts = Object.fromEntries(projection.cohorts.map((cohort) => [cohort.key, cohort]));
  const aggregates = Object.fromEntries(projection.cohorts.map((cohort) => [cohort.key, cohort.points]));
  const selected = projection.selection.state === 'selected'
    ? projection.selection.detail : null;
  const copy = viewCopy[viewKey];

  surface.innerHTML = createSurfaceMarkup(viewKey, coordinates);
  /* Comparison population is projection data, not an app-side `data-state`.
     Aside from duplicating server policy, a `dense` state on this `.dw` would
     collide with the workstation density selector and shift shared geometry. */
  installCoordinateControls(surface);
  surface.querySelector('#ec-factor').addEventListener('change', (event) =>
    setUrl({ factor: event.target.value, occ: null }),
  );
  surface.querySelector('#ec-another').addEventListener('change', (event) =>
    setUrl({ another: event.target.checked ? '1' : null, occ: null }),
  );
  surface.querySelector('#ec-occurrence').addEventListener('change', (event) =>
    setUrl({ occ: event.target.value || null }),
  );
  surface.querySelector('#ec-clear').addEventListener('click', () => setUrl({ occ: null }));

  paintInspector(surface, projection, viewKey, cohortOrder, cohorts, selected);
  paintLegend(surface, cohortOrder, cohorts, aggregates, selected);

  const chartElement = surface.querySelector('#ec-chart');
  const chart = window.echarts.init(chartElement, null, { renderer: 'canvas' });
  chart.setOption(chartOption(surface, coordinates, copy, cohortOrder, cohorts, aggregates, selected));
  chart.on('updateAxisPointer', (event) => {
    const minute = event.axesInfo?.[0]?.value;
    paintReadout(surface, minute, aggregates, cohortOrder, copy);
  });
  chart.getZr().on('globalout', () => paintReadout(surface, null, aggregates, cohortOrder, copy));

  let keyboardMinute = 0;
  chartElement.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') {
      paintReadout(surface, null, aggregates, cohortOrder, copy);
      return;
    }
    if (event.key === 'Home') keyboardMinute = coordinates.alignment_window_min[0];
    else if (event.key === 'End') keyboardMinute = coordinates.alignment_window_min[1];
    else keyboardMinute = Math.max(coordinates.alignment_window_min[0], Math.min(coordinates.alignment_window_min[1], keyboardMinute + (event.key === 'ArrowRight' ? 5 : -5)));
    chart.dispatchAction({ type: 'showTip', seriesIndex: 2, dataIndex: Math.round((keyboardMinute - coordinates.alignment_window_min[0]) / 5) });
    paintReadout(surface, keyboardMinute, aggregates, cohortOrder, copy);
    chartElement.setAttribute('aria-label', `${copy.title}. ${axisLabel(keyboardMinute, copy.axisAnchor)}. ${cohortOrder.map((cohort) => {
      const row = aggregates[cohort].find((item) => item.minute === keyboardMinute);
      return `${COHORTS[cohort].label} median ${rounded(row?.median)} milligrams per deciliter`;
    }).join('. ')}.`);
  });

  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(chartElement);
  const rendered = { chart, observer, projection, view: viewKey,
    factor: coordinates.factor, selected, cohorts, aggregates };
  window.__diagnoseEventComparison = rendered;
  return rendered;
}

/** Port of the locked comparison mock mounted around the shipped Glucose view. */
export function createDiagnoseEventComparison({ root, callbacks = {} }) {
  let payload = null;
  let projection = null;
  let current = null;
  let requestedGeneration = 0;
  const onPopState = () => {
    params = new URLSearchParams(location.search);
    requestProjection();
  };
  window.addEventListener('popstate', onPopState);

  const dispose = () => {
    current?.observer?.disconnect();
    current?.chart?.dispose();
    current = null;
  };

  const requestedCoordinates = () => {
    const view = params.get('view');
    if (view !== 'meals' && view !== 'lows') return null;
    return {
      view,
      factor: params.get('factor') || undefined,
      block: params.get('block') || undefined,
      another: params.get('another') === '1',
      occurrenceId: params.get('occ') || undefined,
    };
  };

  const render = () => {
    if (!payload) return;
    dispose();
    root.replaceChildren();
    const requested = params.get('view');
    const viewKey = VIEWS.includes(requested) ? requested : 'glucose';
    root.dataset.eventView = viewKey;

    if (viewKey === 'glucose') {
      const glucoseRoot = document.createElement('div');
      glucoseRoot.className = 'ec-glucose';
      root.append(glucoseRoot);
      const glucose = createDiagnoseWorkstation({ root: glucoseRoot, callbacks,
        railLead: { markup: createViewInstrumentMarkup(viewKey), install: installViewControls } });
      glucose.setData(payload);
      current = {
        refresh: () => glucose.refresh(),
        // #666: forward the narrow day-completion repaint so a resolved trace
        // does not remount the whole workstation and throw the reader back to
        // the opening depth. Full `refresh()` stays for theme/payload remounts.
        repaintDay: () => glucose.repaintDay(),
      };
      return;
    }

    if (!validProjection(projection, viewKey)) {
      throw new Error('Diagnose event comparison data is unavailable.');
    }
    const surface = document.createElement('section');
    surface.className = 'dw ec-surface';
    root.append(surface);
    current = renderEventSurface(surface, projection);

    surface.querySelector('.ec-glucose-link')?.addEventListener('click', (event) => {
      event.preventDefault();
      setUrl({ view: 'glucose', factor: null, occ: null });
    });
    surface.querySelector('#ec-day-link')?.addEventListener('click', (event) => {
      if (!current?.selected) return;
      event.preventDefault();
      callbacks.day?.({
        t: current.selected.anchor.t,
        text: current.selected.anchor.label || '',
        cause_lever: current.factor,
      });
    });
  };

  const requestProjection = () => {
    const generation = ++requestedGeneration;
    const coordinates = requestedCoordinates();
    if (!coordinates) {
      projection = null;
      try { render(); }
      catch (error) { instance.setError(error.message); }
      return;
    }
    if (typeof callbacks.loadProjection !== 'function') {
      instance.setError('Diagnose event comparison data is unavailable.');
      return;
    }
    callbacks.loadProjection(coordinates).then((next) => {
      if (generation !== requestedGeneration) return;
      projection = next;
      root.classList.remove('ec-error');
      try { render(); }
      catch (error) { instance.setError(error.message); }
    }).catch((error) => {
      if (generation === requestedGeneration) instance.setError(error.message);
    });
  };

  const instance = {
    setData(next) {
      payload = next;
      params = new URLSearchParams(location.search);
      root.classList.remove('ec-error');
      requestProjection();
    },
    setError(message) {
      dispose();
      root.className = 'dw dw-error ec-error';
      root.textContent = message;
    },
    refresh() {
      if (current?.refresh) current.refresh();
      else if (projection) render();
    },
    // #666: only the glucose (workstation) view nests a repaintable surface; on
    // any other view a resolved day-load has nothing to repaint.
    repaintDay() { current?.repaintDay?.(); },
    applyChanges(changes) {
      for (const [key, value] of Object.entries(changes)) {
        if (value == null || value === '') params.delete(key);
        else params.set(key, value);
      }
      history.pushState(null, '', `${location.pathname}?${params.toString()}${location.hash}`);
      requestProjection();
    },
    destroy() {
      window.removeEventListener('popstate', onPopState);
      dispose();
    },
  };
  activeInstance = instance;
  return instance;
}
