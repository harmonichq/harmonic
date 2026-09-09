// ★ LOCKED — harmonic-v2-desktop · 2026-09-08
//
// Direction selected by Connor Griffin on 2026-09-07 and recorded in "ADR 348 —
// Adopt the reviewed desktop direction" (openspec/changes/harmonic-v2/design.md).
// This header was written by Claude Opus 5 (high) as the #348 planning author.
// The contract is mockups/harmonic-v2-desktop.lock.md, which governs; this
// header narrates. The locked surface is harmonic-v2-glucose.html?source=journey,
// of which this module is the primary companion. Its 34 terms are HV2-01 through
// HV2-34, and a replay function cites one as LOCK:harmonic-v2-desktop:HV2-nn.
//
// WHAT THIS MODULE OWNS UNDER THE LOCK. The desk itself: the four destinations
// and their default (Overview), the stage-plus-reading-pane frame, the empty and
// set-aside states, the shared Trial figure, the contextual Day entry and its
// exact return, and the dispatch into the setting, habit, shared-history, Day and
// utility journeys. The stage is deliberately the same object on Overview and
// Explore; what differs is the pane beside it — the decision on Overview, the
// roster and detail on Explore.
//
// THE HIERARCHY THE REPAIR PASS SETTLED, AND THIS FILE ENFORCES. An outcome is
// acknowledged on its own subject, and the subject does not change under the
// wearer. Pressing the current destination is the way back up; a contextual
// return never comes through the topbar, so it keeps its subject. Arriving at a
// destination focuses the reading pane's head unless the caller named a precise
// target. The reading pane keeps its scroll only while it stays on the same
// subject. A Trial's Inspect nights opens the evidence that Trial was decided
// from, never the current read's first-ranked concern.
//
// WHAT MAY NOT BE RE-DERIVED HERE. Identity, eligibility, readiness, admission,
// permissions, evidence populations, periods, comparison results, persistence and
// endings are served. Watch maturity copy is lifecycle metadata and supplies no
// evidence readiness; type-specific readiness comes from the selected record's
// retained comparison. The progress bar is clamped to its maximum and never
// overfilled. There is no overall favorable verdict — favorable exists per
// outcome row only.
//
// PROTOTYPE-ONLY, AND IT NEVER SHIPS. The mock bar, the source/scenario/input and
// failure selects, the Review notes disclosure and every page-memory decision are
// instrumentation, not product chrome. A build ports the product frames and drops
// all of it (HV2-34).
//
// Glucose first, round 4 (#348). Selected design direction, locked as above.
// Current Python producers supply every trace, count and support word; the shipped
// chart builders draw them. Four synthetic sources share one desk: the May meals
// investigation (this module), the June setting journey
// (harmonic-v2-glucose-setting.js) and the May habit journey
// (harmonic-v2-glucose-focus.js) are three separate patients, never one history;
// the shared journey (harmonic-v2-glucose-journey.js) is one stable May 2024
// history read through both branches. Navigation, set-aside and new endings live
// only in this preview's memory.
import { renderShell, renderMockBar, loadCapture, resolveColors, escapeText } from './_shell.js';
import { createSettingJourney } from './harmonic-v2-glucose-setting.js';
import { createFocusJourney } from './harmonic-v2-glucose-focus.js';
import { createSharedJourney } from './harmonic-v2-glucose-journey.js';
import { createDayDesk } from './harmonic-v2-glucose-day.js';
import { createUtilities } from './harmonic-v2-glucose-utilities.js';
import { renderEventSurface, eventComparisonChartOption, eventComparisonGlucoseValues, glucoseRange } from '../frontend/diagnose-event-comparison.js';
import { DIAGNOSE_EVIDENCE_CHARTS } from '../frontend/diagnose-evidence-charts.js';
import { GRID } from '../frontend/diagnose-workstation-chart.js';
import { TIER } from '../frontend/diagnose-findings-queue.js';
import { scnBuildEpisodeOption } from '../frontend/scenario-chart.js';
import { buildHeroOption, HERO } from '../frontend/day-hero-chart.js';
import { heroOption } from '../frontend/verify-workstation-chart.js';

const main = renderShell();
main.classList.add('gf-main');
const surface = document.createElement('div');
surface.className = 'gf dw';
let state = renderMockBar(main, 'Glucose first · round 4', changeScenario);
main.append(surface);
const mockbar = main.querySelector('.mockbar');
// The bar is one compact row: provenance, the source and its clock, the failure
// controls. Every longer review note — what a source's fixture can and cannot
// show, what is page memory — folds into one disclosure at the row's end, so the
// desk below keeps its height and no caveat sits in product copy.
mockbar.querySelector('p').textContent = 'Manufactured evidence.';
mockbar.querySelector('p').insertAdjacentHTML('afterend', '<details class="gf-review-notes"><summary>Review notes</summary><div class="gf-review-notes-body"><p class="gf-review-memo">Priority selection and new decisions are illustrative.</p></div></details>');const params = new URLSearchParams(location.search);
let variant = params.get('input') === 'thin' ? 'thin' : 'repeated';
// Review controls, outside product chrome: three separate synthetic patients, never
// pooled into one ranked queue, and one shared history read as a complete workflow.
// The scenario and input selects belong to the meals source; the setting, habit and
// shared sources add their own clock controls.
const SOURCES = ['meals', 'setting', 'focus', 'journey'];
let source = SOURCES.includes(params.get('source')) ? params.get('source') : 'meals';
mockbar.querySelector('label').classList.add('gf-meals-control');
mockbar.querySelector('label').insertAdjacentHTML('beforebegin', `<label>Source <select aria-label="Evidence source"><option value="meals">Late bolus · May meals case</option><option value="setting" ${source === 'setting' ? 'selected' : ''}>Basal 03:00 · June setting case</option><option value="focus" ${source === 'focus' ? 'selected' : ''}>Over-treated low · May habit case</option><option value="journey" ${source === 'journey' ? 'selected' : ''}>Shared May 2024 history · complete workflow</option></select></label>`);
mockbar.querySelector('p').insertAdjacentHTML('beforebegin', `<label class="gf-meals-control">Input <select aria-label="Evidence input"><option value="repeated">Repeated meals</option><option value="thin">Thin evidence</option></select></label>`);
mockbar.dataset.source = source;
mockbar.querySelector('[aria-label="Evidence input"]').value = variant;
mockbar.querySelector('[aria-label="Evidence input"]').onchange = event => {
  variant = event.target.value; selectedOcc = null; cohortKey = null; selectedStep = 0; figure = 'episode'; seat = 'comparison'; render();
};
mockbar.querySelector('[aria-label="Evidence source"]').onchange = event => {
  source = event.target.value; mockbar.dataset.source = source;
  const url = new URL(location.href); url.searchParams.set('source', source); history.replaceState(null, '', url);
  // the held member belongs to the previous source's case file
  selectedOcc = null; cohortKey = null; selectedStep = 0; figure = 'episode'; seat = 'comparison';
  view.sheetOpen = false; view.asideOpen = false; view.utility = null; destination = 'overview'; day.open();
  if (source === 'journey') shared.arrive(); render();
};

const e = escapeText;
const clock = value => String(value).slice(11, 16);
const date = value => new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
const shortDate = value => new Date(String(value).slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const stamp = value => `${date(value)} · ${clock(value)}`;
const period = value => `${stamp(value.start)} to ${stamp(value.end)}`;
const pct = value => `${value.toFixed(1)}%`;
const ms = value => new Date(String(value).replace(' ', 'T')).getTime();
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
// warn is the Day anchor's outranked colour (day-chart.anchorStateColor)
const colors = { ...resolveColors(), warn:css('--warn'), manualCarb:css('--manual-carb'), manualCarbSoft:css('--manual-carb-soft') };
// The shipped Verify hero's colour binding (verify-workstation.js chartColors),
// read from the workstation tokens this desk carries, for the Before → Trial
// comparison and the Focus progress figure.
function trialColors() {
  const v = name => getComputedStyle(surface).getPropertyValue(name).trim();
  const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
  return {
    text: v('--mk-text'), muted: v('--mk-muted'), line: v('--mk-line'), accent: v('--mk-primary'),
    manual: v('--ck-manual') || '#93701B',
    accentSoft: mix(v('--mk-primary'), 20), mutedSoft: mix(v('--mk-muted'), 20),
    targetFill: mix(v('--mk-ok'), 8), targetEdge: mix(v('--mk-ok'), 55),
    targetText: `color-mix(in srgb, ${v('--mk-ok')} 85%, ${v('--mk-text')})`,
    rail: v('--ck-rail'), mono: v('--ck-mono'),
  };
}
const narrowQuery = matchMedia('(max-width:700px)');
const narrow = () => narrowQuery.matches;
const STEP_TIER = { observed:'Observed', inferred:'Inferred', not_in_data:'Not in data' };
const SETTING_NAME = { basal_rate:'Basal', isf:'Correction factor', carb_ratio:'Carb ratio' };
// Display projection for this fixture-bound investigation only: one served step
// carries an evidence clause and, after an em dash, a treatment recommendation the
// lever's own priority (zero, low confidence) does not license. The factual clause
// is shown verbatim; the recommendation clause is not shown. The backend owes a
// structural split of evidence from eligible action text; this is not that policy.
const stepText = step => step.text.split(' — ')[0];
// UI state both sources share: the narrow sheet, focus hand-off, the trial
// evidence view, the set-aside form, the conclusion being written and the
// utility seated in the reading pane.
const view = { sheetOpen:false, asideOpen:false, asideReason:'', focusAfterRender:null, evidenceMode:'summary', evidencePeriod:'trial_period', evidenceDay:0, conclusion:'', utility:null };

let capture, verify;
let charts = [], observers = [], cleanups = [];
let destination = state === 'history' ? 'changes' : 'overview';
let selectedOcc = null, cohortKey = null, selectedStep = 0;
let figure = 'episode';          // desktop Figure 2: the occurrence as Episode, or its Day
let seat = 'comparison';         // narrow: the one figure seat
let windowMode = 'near';         // comparison x extent: near = −1 h to +2 h, full = the served capture
let setAside = null, finished = null;
const activeId = 'profile-all-20260623233000', readyId = 'carb_ratio-all-20260607081500';

// The investigation's case file: the meals variant, the habit source's own, or
// the shared journey's current read of its shown concern.
const bundle = () => (source === 'focus' ? focus.bundle() : source === 'journey' ? shared.bundle() : capture.variants[variant]);
const baseCase = () => bundle().case_file;
const cohorts = () => baseCase().projection.cohorts;
const cohortOf = id => cohorts().find(row => row.occurrence_ids.includes(id));
const detail = () => bundle().selections[selectedOcc]?.detail || null;
// The generator serves each member's episode link (the unique same-lever
// episode containing its anchor); a member with no link has no episode.
const episodeOf = id => {
  const item = bundle().scenarios.episodes[bundle().episode_ids[id]];
  return item?.lever === baseCase().finding.lever ? item : null;
};
const episode = () => episodeOf(selectedOcc);
const currentTrial = () => finished && state === 'history' ? finished.trial : verify.details[state === 'active' ? activeId : readyId].selected;
const watched = () => state === 'active' || state === 'ready';
// The comparison's visible extent. Membership, medians and the y range are the
// adapter's; only the x window moves, and the served capture stays one click away.
const comparisonWindow = () => {
  const [start, end] = baseCase().projection.window_min;
  return windowMode === 'full' ? [start, end] : [Math.max(start, -60), Math.min(end, 120)];
};
const windowLabel = ([start, end]) => `${start < 0 ? '−' : '+'}${Math.abs(start) / 60} h to +${end / 60} h`;

function dispose() {
  for (const observer of observers) observer.disconnect();
  for (const cleanup of cleanups) cleanup();
  for (const chart of charts) chart.dispose();
  charts = []; observers = []; cleanups = [];
  setting.dispose(); focus.dispose(); shared.dispose(); day.dispose(); utilities.dispose();
}
function changeScenario(next) {
  state = next; destination = next === 'history' ? 'changes' : 'overview';
  view.sheetOpen = false; view.asideOpen = false; render();
}
// Day opens on its own desk. A subject's Open Day carries the date and the way
// back; the topbar's Day carries neither, and holds the last day looked at.
function navigate(next, { date = null, from = null, utility = null } = {}) {
  destination = next;
  if (source === 'setting') setting.onNavigate(next);
  if (source === 'focus') focus.onNavigate(next);
  if (source === 'journey') shared.onNavigate(next);
  utilities.onNavigate();
  if (utility) utilities.reopen(utility);
  if (next === 'day') day.open({ date, from });
  // Arriving at a destination puts the hand on its subject: the reading pane's
  // head, else the stage's title. A caller that already named its target — the
  // Day return's originating row, a roster row — set it before navigating, and
  // that always wins.
  if (!view.focusAfterRender) view.focusAfterRender = ['.gf-reading > header h2', '.gf-stage .gf-title'];
  view.sheetOpen = false; render();
}
// where a subject's Open Day returns to: the destination that showed it, with
// focus back on the selected occurrence's row
// A utility's Open Day is the same contextual entry, and its way back is that
// utility: the destination underneath is the one it was opened over, and the
// utility reopens on the moment it was read from.
const fromHere = (label, { utility = null, utilityLabel = '', focus = '' } = {}) => ({
  label,
  destination: utility ? destination : destination === 'overview' || destination === 'changes' ? destination : 'explore',
  destinationLabel: utility ? utilityLabel : { overview: 'Overview', changes: 'Changes' }[destination] || 'Explore',
  utility,
  focus: focus || '.gf-member-row[aria-pressed="true"]',
});
// Whether a setting journey owns the rendered frame: its own source, or the
// shared journey while its setting branch leads.
const settingOwned = () => source === 'setting' || (source === 'journey' && shared.owner() === 'setting');
function syncScenario(next) {
  state = next; main.querySelector('[aria-label="Prototype scenario"]').value = next;
  const url = new URL(location.href); url.searchParams.set('state', next); history.replaceState(null, '', url);
}
// A member is always held: the last matched occurrence, as the shipped inspector
// seats its selection, so the stage never opens on an empty reading.
function ensureSelection() {
  if (selectedOcc && cohortOf(selectedOcc)) return;
  const matched = cohorts().find(row => row.key === 'matched');
  selectedOcc = matched?.occurrence_ids.at(-1) || cohorts().flatMap(row => row.occurrence_ids)[0] || null;
  cohortKey = cohortOf(selectedOcc)?.key || cohorts()[0].key;
  selectedStep = 0;
}
function select(id) {
  selectedOcc = id; cohortKey = cohortOf(id)?.key || cohortKey; selectedStep = 0;
  if (!episode() && figure === 'episode') figure = 'day';
  if (!episode() && seat === 'episode') seat = 'comparison';
}
function moveMeal(direction) {
  ensureSelection();
  const ids = cohorts().find(row => row.key === cohortKey)?.occurrence_ids || [];
  if (!ids.length) return;
  const at = ids.indexOf(selectedOcc);
  select(ids[(at + direction + ids.length) % ids.length]);
  render(); surface.querySelector('.gf-member-row[aria-pressed="true"]')?.scrollIntoView({ block:'nearest' });
}
// The topbar is the global way in. Pressing the current destination again is the
// way back up: Explore returns to its findings index rather than sitting on
// whatever subject was drilled into. A contextual return never comes through
// here, so it keeps its own subject.
for (const button of document.querySelectorAll('[data-destination]')) button.onclick = () => {
  const next = button.dataset.destination;
  if (next === destination && next === 'explore' && source === 'journey') shared.toIndex();
  navigate(next);
};
narrowQuery.addEventListener('change', () => { view.sheetOpen = false; render(); });

async function load(retry = false) {
  dispose(); surface.innerHTML = '<div class="gf-loading" role="status" aria-label="Loading evidence"></div>';
  try {
    const json = async name => {
      const response = await fetch(new URL(`./harmonic-v2.exploration/${name}.json`, import.meta.url));
      if (!response.ok) throw new Error('Evidence unavailable');
      return response.json();
    };
    let settingJson, focusJson, journeyJson, utilitiesJson;
    [capture, verify, settingJson, focusJson, journeyJson, utilitiesJson] = await Promise.all([json('workstation'), loadCapture('verify'), json('setting'), json('focus'), json('journey'), json('utilities')]);
    setting.load(settingJson); focus.load(focusJson); shared.load(journeyJson); utilities.load(utilitiesJson);
    if (retry) syncScenario('investigate');
    render();
  } catch { surface.innerHTML = errorFrame(); bind(); }
}

function render() {
  if (!capture || !verify) return;
  // the reading pane keeps its scroll only while it stays on the same subject:
  // a pane that changes subject (a roster row opening a slot, a utility opening)
  // arrives at its head, so what leads it is what shows
  const paneKey = () => { const pane = surface.querySelector('.gf-desk > .gf-reading'); return `${destination}|${pane?.getAttribute('aria-label') || pane?.querySelector('header h2')?.textContent || ''}`; };
  const was = paneKey(), scrolled = surface.querySelector('.gf-pane-body')?.scrollTop || 0;
  dispose();
  for (const button of document.querySelectorAll('[data-destination]')) {
    if (button.dataset.destination === destination) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  surface.dataset.sheet = view.sheetOpen ? 'open' : 'closed';
  // Day is one desk over every source's own recorded days
  if (destination === 'day' && state !== 'error') surface.innerHTML = day.frame();
  else if (source === 'setting') surface.innerHTML = setting.frame(destination);
  // the habit journey hands Explore and Day to the shared investigation
  else if (source === 'focus') surface.innerHTML = focus.frame(destination) ?? investigationFrame();
  // the shared journey hands a habit concern's Explore and Day to it likewise
  else if (source === 'journey') surface.innerHTML = shared.frame(destination) ?? investigationFrame(shared.pane());
  else if (state === 'error') surface.innerHTML = errorFrame();
  else if (destination === 'explore') surface.innerHTML = investigationFrame();
  else if (state === 'history' && destination === 'changes') surface.innerHTML = historyFrame();
  else if (watched()) surface.innerHTML = trialFrame();
  else if (destination === 'changes') surface.innerHTML = emptyFrame('Changes', 'No change underway', 'This example supports a closer look at meals.', '<button class="gf-btn primary" data-action="explore">Inspect meals</button>');
  else if (setAside) surface.innerHTML = emptyFrame('Overview', 'Set aside', setAside.reason || 'The meals remain available in Explore.', '<button class="gf-btn primary" data-action="explore">Revisit meals</button><button class="gf-btn" data-action="restore">Return to Overview</button>');
  else if (state === 'quiet') surface.innerHTML = emptyFrame('Overview', 'No priority needs action', 'Day remains available.', '<button class="gf-btn primary" data-action="day">Open Day</button>');
  else if (state === 'history') surface.innerHTML = emptyFrame('Overview', finished ? 'Trial finished' : 'No priority needs action', finished ? e(finished.conclusion) : 'Day and the change record remain available.', '<button class="gf-btn primary" data-action="history">View change record</button><button class="gf-btn" data-action="day">Open Day</button>');
  else surface.innerHTML = investigationFrame();
  // an open utility takes the reading pane's seat on whichever frame rendered
  utilities.seat(destination);
  // The narrow reading pane covers the stage; hidden controls cannot take focus.
  surface.querySelector('.gf-stage')?.toggleAttribute('inert', narrow() && view.sheetOpen);
  bind();
  if (destination === 'day') { day.bind(); day.mountCharts(); }
  else {
    // a journey's own handlers bind after the desk's, so a setting-owned frame's
    // figure and seat controls take that journey's
    if (source === 'setting') setting.bind(); else if (source === 'focus') focus.bind(); else if (source === 'journey') shared.bind();
    if (source === 'setting') setting.mountCharts(); else if (source === 'journey') shared.mountCharts(); else mountCharts();
    if (source === 'focus') focus.mountCharts();
    mountTrialCharts();
  }
  utilities.bind(); utilities.mountCharts();
  const body = surface.querySelector('.gf-pane-body'); if (body) body.scrollTop = paneKey() === was ? scrolled : 0;
  // one selector, or candidates in order of preference: the first present takes focus
  if (view.focusAfterRender) { for (const target of [].concat(view.focusAfterRender)) { const found = surface.querySelector(target); if (found) { found.focus(); break; } } view.focusAfterRender = null; }
}

/* ---- the frame: one stage pane beside one reading pane ------------------- */
function desk(stage, reading) {
  return `<div class="panes gf-desk">${stage}${reading}</div>`;
}
function nameplate({ kicker, title, sub, end = '' }) {
  // the title takes programmatic focus when a frame has no reading pane to land in
  return `<header class="gf-head"><div class="gf-id"><div class="gf-kicker">${kicker}</div><h2 class="gf-title" tabindex="-1">${title}</h2><div class="gf-sub">${sub}</div></div>${end ? `<div class="gf-end">${end}</div>` : ''}</header>`;
}
// The two destinations' jobs, in one predicate and one control. Overview carries
// the decision — what leads, how it is going, and the way to its evidence — and
// only where the source actually serves that lead; a concern with no served
// action keeps its evidence pane. Explore carries the roster and the detail.
const briefing = () => destination === 'overview';
// The route out of the brief, named for the concern's own evidence, in the words
// Changes already uses for the same step.
const inspectRoute = noun => `<div class="gf-actions"><button class="gf-btn primary" data-action="explore">Inspect ${e(String(noun).toLowerCase())}</button></div>`;
function readingHeader(title, meta = '') {
  // the head takes programmatic focus when navigation opens a new subject
  return `<header><h2 tabindex="-1">${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}<div class="gf-end"><button class="gf-btn gf-sheet-close" data-action="close-sheet">Close</button></div></header>`;
}
function sheetToggle(label) {
  return `<button class="gf-btn gf-sheet-toggle" data-action="open-sheet" aria-expanded="${view.sheetOpen}">${label} <span aria-hidden="true">▾</span></button>`;
}

/* ---- investigation: the concern, its comparison, the held occurrence ------ */
// A caller's pane (the shared journey's roster) replaces the reading pane's
// header and leads its body.
function investigationFrame(pane = null) {
  ensureSelection();
  const base = baseCase(), selected = detail(), cohort = cohortOf(selectedOcc), item = episode();
  const window = bundle().scenarios.window;
  const position = `${cohort.occurrence_ids.indexOf(selectedOcc) + 1} of ${cohort.routed_count}`;
  // the served queue tier is the ranking word; it is not a permission to act
  const tier = bundle().finding_row?.tier;
  const hook = priority();
  const head = nameplate({
    kicker: `${e(base.family)} · ${e(shortDate(window.start))} to ${e(date(window.end))}`,
    title: e(base.finding.title),
    sub: `<b>${base.summary.claimed} of ${base.summary.denominator} ${e(base.summary.noun)}</b>${tier ? ` · ${e(TIER[tier] || (tier === 'noted' ? 'Noted' : tier))}` : ''}${hook.status ? ` · ${hook.status}` : ''}`,
    end: hook.end,
  });
  const memberLabel = `${e(shortDate(selected.date))} · ${e(clock(selected.anchor.t))}`;
  const figureSeg = `<div class="seg" role="group" aria-label="Figure"><button data-figure="episode" aria-pressed="${figure === 'episode'}" ${item ? '' : 'disabled'}>Episode</button><button data-figure="day" aria-pressed="${figure === 'day'}">Day</button></div>`;
  const stepSeg = `<div class="seg" role="group" aria-label="Occurrence"><button data-action="previous-meal" aria-label="Previous occurrence">↑</button><button data-action="next-meal" aria-label="Next occurrence">↓</button></div>`;
  const seatFigure = kind => `<div class="gf-fig gf-fig2" data-chart="${kind}"><div class="gf-chart-seat"><div class="gf-chart"></div></div>${figureKey(kind, selected)}</div>`;
  const stage = narrow()
    ? `<section class="pane gf-stage" aria-label="Evidence">${head}
        <div class="instruments"><div class="instrument"><div class="seg gf-narrow-seat" role="group" aria-label="Figure">${[['comparison','Comparison'],['episode','Episode'],['day','Day']].map(([key,label]) => `<button data-seat="${key}" aria-pressed="${seat === key}" ${key === 'episode' && !item ? 'disabled' : ''}>${label}</button>`).join('')}</div></div><div class="instrument gf-tools">${sheetToggle(memberLabel)}</div></div>
        ${seat === 'comparison' ? '<div class="gf-fig ec-surface" data-chart="comparison"></div>' : seatFigure(seat)}
        <div class="canvas-head" id="gf-fig1-head" data-hover="0" hidden></div></section>`
    : `<section class="pane gf-stage" aria-label="Evidence">${head}
        <div class="instruments"><div class="instrument canvas-head" id="gf-fig1-head" data-hover="0"><div class="gf-rest"><span class="cap">Response comparison</span><span class="meta">${e(base.summary.noun)} aligned to each event · ${e(base.projection.anchor.label)}</span></div></div>
          <div class="instrument gf-tools"><span class="cap">Window</span>${windowSeg()}</div></div>
        <div class="gf-fig ec-surface" data-chart="comparison"></div>
        <div class="instruments"><div class="instrument"><span class="cap">Occurrence</span><span class="when">${e(stamp(selected.anchor.t))}</span><span class="meta">${e(cohort.name)} · ${position}</span></div><div class="instrument gf-tools">${stepSeg}${figureSeg}</div></div>
        ${seatFigure(figure === 'episode' && item ? 'episode' : 'day')}</section>`;
  const paneTitle = pane?.title || (briefing() && hook.lead ? 'Action' : hook.title);
  return desk(stage, `<aside class="pane gf-reading" aria-label="${view.asideOpen ? 'Set aside' : e(paneTitle)}">${view.asideOpen ? asideForm() : readingPane(selected, cohort, item, hook, pane)}</aside>`);
}
// What the investigation reads from the source's journey: the nameplate's status
// and end controls, the reading pane's name and its leading section.
function priority() {
  if (source === 'focus') return focus.priority();
  if (source === 'journey') return shared.priority();
  return {
    title: 'Meals', lead: '',
    status: watched() ? `<span>${e(currentTrial().readiness.label)} Trial continues</span>` : '',
    end: watched() ? '<button class="gf-btn" data-action="watch">Return to Trial</button>' : setAside ? '' : '<button class="gf-btn" data-action="aside">Set aside</button>',
  };
}

function windowSeg() {
  const [start, end] = baseCase().projection.window_min;
  return `<div class="seg" role="group" aria-label="Window">${[['near', windowLabel([Math.max(start, -60), Math.min(end, 120)])], ['full', 'Full capture']].map(([key,label]) => `<button data-window="${key}" aria-pressed="${windowMode === key}">${label}</button>`).join('')}</div>`;
}
// The shipped Day legend (chart-key.css, generator-extracted), with the marks each
// builder actually draws: glucose by range, the bolus and its carbs, and for the
// Episode the numbered model steps in their evidence-tier colour.
function figureKey(kind, selected) {
  const dot = (color, label) => `<span><i style="background:${color}"></i>${label}</span>`;
  const glucose = dot(colors.inRange, 'in range') + dot(colors.high, 'high') + dot(colors.low, 'low');
  const doses = dot(colors.accent, 'bolus') + dot(colors.secondary, 'carbs (bolus)');
  return kind === 'episode'
    ? `<div class="ds-chart-legend">${glucose}${doses}<span class="ds-leg-k">Model steps:</span><span style="color:${colors.observed}">│ observed</span><span style="color:${colors.inferred}">│ inferred</span></div>`
    : `<div class="ds-chart-legend">${glucose}${doses}<span style="color:${colors.manualCarb}">◗ carbs (logged)</span><span style="color:${colors.muted}">┆ ${e(selected.anchor.label)}</span></div>`;
}

function readingPane(selected, cohort, item, hook, pane = null) {
  const base = baseCase();
  // Overview reads the decision, Explore reads the evidence. On Overview the
  // concern's own action and its progress lead, with one named route into the
  // detail; the cohorts, their members and the model steps are Explore's job.
  // The stage keeps its comparison and its figure either way.
  if (briefing() && hook.lead) return `${readingHeader('Action',`${base.summary.claimed} of ${base.summary.denominator} ${e(base.summary.noun)}`)}<div class="gf-pane-body">
    ${hook.lead}
    ${inspectRoute(hook.title)}
  </div>`;
  const supportLine = row => {
    const count = `${row.routed_count} ${row.routed_count === 1 ? 'occurrence' : 'occurrences'}`;
    return row.support === 'supported' ? count : row.support === 'limited' ? `${count} · limited support`
      : row.usable_count === 0 ? `${count} · unavailable` : `${count} · unavailable for an average`;
  };
  const members = row => `<div class="gf-members" role="group" aria-label="${e(row.name)} occurrences">${row.occurrence_ids.map(id => {
    const occurrence = bundle().selections[id].detail;
    return `<button class="gf-row gf-member-row" data-occ="${e(id)}" aria-pressed="${selectedOcc === id}"><span class="when">${e(shortDate(occurrence.date))} · ${e(clock(occurrence.anchor.t))}</span><span class="n">${episodeOf(id) ? 'episode' : ''}</span></button>`;
  }).join('')}</div>`;
  // the row's mark is the comparison key's own item, so cohort and legend share one shape
  const groups = cohorts().map(row => `<button class="gf-row gf-cohort-row" data-cohort="${row.key}" data-support="${row.support}" aria-pressed="${cohortKey === row.key}"><span class="ec-key-item" data-cohort="${row.key}" data-support="${row.support}"><i class="ec-key-mark" aria-hidden="true"></i></span><strong>${e(row.name)}</strong><span class="n">${row.routed_count}</span><small>${supportLine(row)}</small></button>${cohortKey === row.key ? members(row) : ''}`).join('');
  const bolus = selected.markers.find(mark => mark.kind === 'bolus');
  const occurrence = item
    ? `<div role="group" aria-label="Model steps">${item.steps.map((step, i) => `<button class="gf-row gf-step-row" data-step="${i}" aria-pressed="${selectedStep === i}"><span class="when">${e(clock(step.t))}</span><span class="tier" data-tier="${e(step.evidence_tier)}">${STEP_TIER[step.evidence_tier] || e(step.evidence_tier)}</span><span class="text">${e(stepText(step))}</span></button>`).join('')}</div>`
    : `<dl><dt>${e(selected.anchor.label)}</dt><dd>${e(clock(selected.anchor.t))}</dd>${bolus ? `<dt>Bolus</dt><dd>${e(bolus.insulin)} U${bolus.carbs ? ` · ${e(bolus.carbs)} g` : ''}</dd>` : ''}<dt>Glucose at anchor</dt><dd>${e(selected.glucose.find(row => row.minute === 0)?.bg ?? '—')} mg/dL</dd></dl>`;
  return `${pane ? readingHeader(e(pane.title), pane.meta) : readingHeader(e(hook.title), `${base.summary.claimed} of ${base.summary.denominator} ${e(base.summary.noun)}`)}<div class="gf-pane-body">
    ${pane?.lead || ''}
    ${hook.lead}
    <section class="gf-section" role="group" aria-label="Comparison groups">${groups}</section>
    <section class="gf-section"><h3>${item ? 'Model steps' : 'Occurrence'} <span class="meta">${e(stamp(selected.anchor.t))}</span></h3>${occurrence}
      <div class="gf-actions"><button class="gf-btn" data-action="day" data-date="${e(selected.date)}" data-subject="${e(pane?.title || hook.title)} · ${e(shortDate(selected.date))} ${e(clock(selected.anchor.t))}">Open Day</button></div></section>
  </div>`;
}

function asideForm() {
  return `${readingHeader('Set aside')}<div class="gf-pane-body"><form data-form="aside"><label for="aside-reason">Reason (optional)</label><textarea id="aside-reason">${e(view.asideReason)}</textarea><div class="gf-actions" style="padding:0"><button class="gf-btn primary" type="submit">Set aside</button><button class="gf-btn" type="button" data-action="cancel-aside">Cancel</button></div></form></div>`;
}

/* ---- charts: shipped builders, composed on one spine --------------------- */
function mountCharts() {
  for (const host of surface.querySelectorAll('[data-chart]')) {
    if (!globalThis.echarts) return;
    if (host.dataset.chart === 'comparison') mountComparison(host); else mountFigure(host);
  }
}
function mountComparison(host) {
  // The held occurrence is drawn as the adapter's selected trace; its cohort is not
  // passed, so no cohort is dimmed: the aggregate stays whole while one member is read.
  // The reading pane's pressed row names the held cohort.
  const caseFile = { ...baseCase(), selection: structuredClone(bundle().selections[selectedOcc]) };
  const rendered = renderEventSurface(host, caseFile, { headline: surface.querySelector('#gf-fig1-head') });
  const range = glucoseRange(eventComparisonGlucoseValues(caseFile));
  const option = eventComparisonChartOption(caseFile, range, host);
  // Proposed comparison furniture: the current carb-ratio chart's target rails
  // replace the adapter's unsupported color-mix band. Every trace stays served.
  option.series[0] = DIAGNOSE_EVIDENCE_CHARTS.find(entry => entry.kind === 'carb-ratio')
    .option('event', { range }).series.find(series => series.name === 'Target range');
  // A thin focus line over the 2px medians: where the trace and a median coincide
  // the median's colour still shows at both edges, so neither hides the other.
  const trace = option.series.find(series => series.id === 'selected:trace');
  if (trace) trace.lineStyle = { ...trace.lineStyle, width: 1.25, opacity: .95 };
  [option.xAxis.min, option.xAxis.max] = comparisonWindow();
  option.xAxis.axisLabel.hideOverlap = true;
  option.grid.right = GRID.left;
  rendered.chart.setOption(option, true);
  charts.push(rendered.chart);
  cleanups.push(() => { rendered.cleanup(); rendered.restoreHeader(); });
  const observer = new ResizeObserver(() => rendered.chart.resize()); observer.observe(rendered.resizeHost); observers.push(observer);
  if (narrow()) {
    // Narrow has no instrument rail to spare: the window control sits at the end of
    // the comparison's own key row, the one place it applies.
    const key = host.querySelector('.ec-chart-key');
    key.insertAdjacentHTML('beforeend', `<span class="gf-tools">${windowSeg()}</span>`);
    for (const button of key.querySelectorAll('[data-window]')) button.onclick = () => { windowMode = button.dataset.window; view.focusAfterRender = `[data-window="${windowMode}"]`; render(); };
  }
}
function mountFigure(host) {
  const element = host.querySelector('.gf-chart');
  const chart = echarts.init(element); charts.push(chart);
  const update = () => {
    const selected = detail(); let option;
    if (host.dataset.chart === 'episode') {
      const item = episode(); if (!item) return;
      option = scnBuildEpisodeOption(item, selectedStep, colors);
      // Figure 2 sits under Figure 1 on the same relative extent, derived from
      // the served anchor; a step outside that extent opens the episode's own window.
      const anchor = ms(selected.anchor.t), [start, end] = comparisonWindow();
      let min = anchor + start * 60000, max = anchor + end * 60000;
      const at = ms(item.steps[selectedStep]?.t);
      if (Number.isFinite(at) && (at < min || at > max)) { min = ms(item.window.start); max = ms(item.window.end); }
      // 30px of head room seats the mg/dL axis name and the numbered step labels
      option.grid = { left: GRID.left, right: GRID.left, top: 30, bottom: 26 };
      option.xAxis.min = min; option.xAxis.max = max;
      option.xAxis.axisLabel.formatter = '{HH}:{mm}'; option.xAxis.axisLabel.hideOverlap = true;
      option.yAxis[2].axisLabel.show = false; option.yAxis[2].name = '';
    } else {
      const day = bundle().days[selected.day_target.date];
      option = buildHeroOption(day, selected.date, { colors, xMin: day.start.replace(' ', 'T'), xMax: day.end.replace(' ', 'T') });
      // The shipped two-track Day, scaled to this seat; data and y ranges stay the builder's.
      const scale = Math.max(.42, element.clientHeight / HERO.H);
      for (const grid of option.grid) { grid.top *= scale; grid.height *= scale; }
      // the anchor line; the key beneath names it, so no label rides the line
      option.series[0].markLine.data.push({ xAxis: selected.anchor.t.replace(' ', 'T'), label: { show: false } });
    }
    chart.setOption(option, true); chart.resize();
  };
  update(); const observer = new ResizeObserver(update); observer.observe(element); observers.push(observer);
}

/* ---- trial: the watched change leads ------------------------------------- */
// The shipped Plan heads' units (index.html), per served parameter.
const UNIT = { basal_rate: 'U/h', carb_ratio: 'g/U', target_bg: 'mg/dL' };
const settingValue = (parameter, n) => (n == null ? 'not recorded' : parameter === 'isf' ? `1 U : ${n} mg/dL` : `${n} ${UNIT[parameter] || ''}`.trim());
// The title reads the served changes: one setting names itself with its slot and
// values; several changes at once name their count.
function trialTitle(trial) {
  const changes = trial.changes || [];
  if (changes.length !== 1) return `Profile change · ${changes.length} settings`;
  const [change] = changes;
  const name = `${e(SETTING_NAME[change.parameter] || change.parameter)}${change.slot && !change.uniform ? ` ${e(change.slot)}` : ''}`;
  // a correction factor reads insulin first on both sides; a rate carries its unit once
  const before = change.parameter === 'isf' ? settingValue('isf', change.before) : change.before;
  return change.before == null ? `${name} · ${e(settingValue(change.parameter, change.after))}` : `${name} · ${e(before)} → ${e(settingValue(change.parameter, change.after))}`;
}
function trialSub(trial) {
  const progress = trial.maturing;
  return `Detected ${e(stamp(trial.changed_at))} · ${trial.state === 'maturing' ? `<b>${progress.days_elapsed} of ${progress.days_required} days</b>` : `<b>${progress.days_elapsed} days</b> elapsed`} · ${progress.gap_count} data ${progress.gap_count === 1 ? 'gap' : 'gaps'}`;
}
// The Trial stage: the shipped Verify hero (Before → Trial glucose by clock) over
// the measured rows. Narrow seats one of the three: the chart, the Before / Trial
// table, or the available days.
function trialStage(trial, { kicker, end, rail, body }) {
  stagedTrial = trial;
  const pairs = trialPairs(trial);
  const desk = rail ?? `<div class="seg" role="group" aria-label="View"><button data-mode="summary" aria-pressed="${view.evidenceMode === 'summary'}">Before / Trial</button><button data-mode="daily" aria-pressed="${view.evidenceMode === 'daily'}">Available days</button></div>`;
  const seats = `<div class="seg gf-narrow-seat" role="group" aria-label="View">${[['chart', 'Glucose'], ['summary', 'Before / Trial'], ['daily', 'Days']].map(([key, label]) => `<button data-mode="${key}" aria-pressed="${view.evidenceMode === key}" ${key === 'daily' && body ? 'disabled' : ''}>${label}</button>`).join('')}</div>`;
  // the hero's own in-chart legend names the two lines; this key names the ribbon
  const palette = trialColors();
  const chart = `<div class="gf-fig gf-fig-trial" data-trial-chart><div class="gf-chart-seat"><div class="gf-chart"></div></div><div class="ds-chart-legend">${pairs.pairs.length ? `<span><i style="background:${palette.accentSoft}"></i>Trial above Before</span><span><i style="background:${palette.mutedSoft}"></i>Trial below Before</span>` : '<span>no Trial readings to compare yet</span>'}<span>median glucose by clock · ${e(pairs.days)}</span></div></div>`;
  const table = body ?? (view.evidenceMode === 'daily' ? dailyEvidence(trial) : evidenceTable(trial));
  return narrow()
    ? `<section class="pane gf-stage gf-stage-trial" aria-label="Trial evidence">${nameplate({ kicker, title: trialTitle(trial), sub: trialSub(trial), end })}
      <div class="instruments"><div class="instrument">${seats}</div><div class="instrument gf-tools">${sheetToggle('This trial')}</div></div>
      ${view.evidenceMode === 'chart' ? chart : `<div class="gf-scroll">${table}</div>`}</section>`
    : `<section class="pane gf-stage gf-stage-trial" aria-label="Trial evidence">${nameplate({ kicker, title: trialTitle(trial), sub: trialSub(trial), end })}
      <div class="instruments"><div class="instrument"><span class="cap">${pairs.trial.length ? 'Before → Trial' : 'Before only'}</span><span class="meta">${pairs.trial.length ? 'median glucose by clock' : 'Trial has no readings yet'}</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span></div></div>
      ${chart}
      <div class="instruments"><div class="instrument"><span class="cap">View</span>${desk}</div><div class="instrument gf-tools">${sheetToggle('This trial')}</div></div>
      <div class="gf-scroll">${table}</div></section>`;
}
// The shipped Verify binding (verify-workstation.js renderHero): each period's
// clock envelope, its empty slots dropped, paired where both sides have one. A
// Trial side with no readings pairs nothing, and stays a Before only figure.
function trialPairs(trial) {
  const rows = key => (trial.envelopes?.[key] || []).filter(row => row.n > 0);
  const before = rows('before_period'), tri = rows('trial_period');
  const tmin = row => parseInt(row.t) * 60 + parseInt(String(row.t).slice(3));
  const byT = new Map(before.map(row => [String(row.t), row]));
  const pairs = tri.filter(row => byT.has(String(row.t))).map(row => ({ t: tmin(row), b: byT.get(String(row.t)).med, v: row.med, d: row.med - byT.get(String(row.t)).med }));
  const span = item => `${shortDate(item.start)}–${shortDate(item.end)}`;
  return {
    pairs, before: before.map(row => [tmin(row), row.med]), trial: tri,
    beforeLabel: `Before · ${span(trial.before_period)}`, trialLabel: `Trial · ${span(trial.trial_period)}`,
    days: `days ${trial.days.before_period} → ${trial.days.trial_period}`,
  };
}
function mountTrialCharts() {
  if (!globalThis.echarts) return;
  for (const host of surface.querySelectorAll('[data-trial-chart]')) {
    const element = host.querySelector('.gf-chart');
    const chart = echarts.init(element); charts.push(chart);
    const trial = stagedTrial;   // the Trial the rendered stage drew
    const update = () => {
      const bound = trialPairs(trial), palette = trialColors();
      const option = heroOption(palette, { pairs: bound.pairs, arc: false, beforeLabel: bound.beforeLabel, trialLabel: bound.trialLabel });
      if (!bound.pairs.length) {
        // Before only: the Before line reads its own envelope; the Trial line has
        // no data and its legend entry says so
        const before = option.series.find(series => series.name === bound.beforeLabel);
        const tri = option.series.find(series => series.name === bound.trialLabel);
        if (before) before.data = bound.before;
        if (tri) tri.name = 'Trial · no readings yet';
        option.legend.data = [bound.beforeLabel, 'Trial · no readings yet'];
      }
      chart.setOption(option, true); chart.resize();
    };
    update(); const observer = new ResizeObserver(update); observer.observe(element); observers.push(observer);
  }
}
let stagedTrial = null;
function progressSection(trial) {
  const progress = trial.maturing;
  // Both figures are served. While the Trial is still maturing the days read
  // against what it still needs; once the source's own readiness says it is past
  // that, elapsed days are the fact and the requirement is what was met, so the
  // bar reads full instead of overfilled.
  const met = trial.state !== 'maturing';
  const figure = met ? `${progress.days_elapsed} days<small>${progress.days_required} required · ${progress.gap_count} data ${progress.gap_count === 1 ? 'gap' : 'gaps'}</small>`
    : `${progress.days_elapsed} of ${progress.days_required} days<small>${progress.gap_count} data ${progress.gap_count === 1 ? 'gap' : 'gaps'}</small>`;
  return `<section class="gf-section"><h3>Evidence accrued</h3><div class="gf-figure">${figure}</div><progress value="${Math.min(progress.days_elapsed, progress.days_required)}" max="${progress.days_required}" aria-label="Trial progress"></progress><p class="gf-meta">${e(trial.readiness.message)}</p>${trial.focus?.message ? `<p class="gf-meta">${e(trial.focus.message)}</p>` : ''}</section>`;
}
function trialFrame() {
  const trial = currentTrial(), active = state === 'active';
  const stage = trialStage(trial, {
    kicker: `Trial · <b>${e(trial.readiness.label)}</b>`,
    end: '<button class="gf-btn" data-action="explore">Inspect meals</button>',
  });
  const reading = `<aside class="pane gf-reading" aria-label="This trial">${readingHeader('This trial', e(trial.readiness.label))}<div class="gf-pane-body">
    ${progressSection(trial)}
    ${active ? '' : `<section class="gf-section"><h3>Conclusion</h3>${reviewForm()}</section>`}
    ${detectedSettings(trial, 'Observed on the pump. An earlier Plan decision is not available in this capture.')}
    <section class="gf-section"><h3>Limits of this read</h3>${trial.limits.map(text => `<p>${e(text)}</p>`).join('')}</section>
  </div></aside>`;
  return desk(stage, reading);
}
// One required, user-written conclusion. The app puts no words in the wearer's mouth.
function reviewForm(label = 'Record conclusion &amp; finish', note = 'Observed on the pump. Changes are entered manually.') {
  return `<form id="finish-form" data-form="finish"><label for="conclusion">Conclusion</label><textarea id="conclusion" required aria-required="true">${e(view.conclusion)}</textarea><div class="gf-actions" style="padding:0 0 6px"><button class="gf-btn primary" type="submit" ${view.conclusion.trim() ? '' : 'disabled'}>${label}</button></div></form><p class="gf-note">${e(note)}</p>`;
}
function historyFrame() {
  const trial = currentTrial();
  const stage = trialStage(trial, {
    kicker: `Trial · <b>${finished ? 'Finished' : 'History'}</b>`,
    end: '<button class="gf-btn" data-action="overview">Back to Overview</button>',
    rail: `<span class="meta">${finished ? 'Ending snapshot' : 'Available observations'}</span>`,
    body: evidenceTable(trial),
  });
  const reading = `<aside class="pane gf-reading" aria-label="This trial">${readingHeader('This trial', finished ? 'Finished' : 'History')}<div class="gf-pane-body">
    <section class="gf-section"><h3>Decision</h3><dl><dt>Earlier decision</dt><dd>Not recorded</dd><dt>Original explanation</dt><dd>Not recorded</dd><dt>Conclusion</dt><dd>${finished ? e(finished.conclusion) : 'Not recorded'}</dd><dt>Finished</dt><dd>${finished ? e(finished.endedAt) : 'Not recorded'}</dd></dl></section>
    <section class="gf-section"><h3>Evidence periods</h3><dl><dt>Before</dt><dd>${e(period(trial.before_period))}</dd><dt>Trial</dt><dd>${e(period(trial.trial_period))}</dd></dl><p class="gf-meta">Pump-local time. Observations are limited to these periods.</p></section>
    ${detectedSettings(trial, 'Observed on the pump. An earlier Plan decision is not available in this capture.')}
  </div></aside>`;
  return desk(stage, reading);
}

/* ---- the empty stage ------------------------------------------------------ */
// A trailing note is a review control's explanation, outside the product copy.
function emptyFrame(cap, title, copy, actions, note = '') {
  return `<section class="pane gf-stage gf-stage-table" aria-label="${e(cap)}"><header><h2>${e(cap)}</h2></header><div class="gf-empty"><div class="gf-title">${title}</div><p>${copy}</p><div class="gf-actions">${actions}</div></div>${note ? `<p class="gf-note gf-review-note">${e(note)}</p>` : ''}</section>`;
}
function errorFrame() {
  return emptyFrame('Overview', 'Evidence unavailable', 'The glucose evidence could not load.', '<button class="gf-btn primary" data-action="retry">Retry</button>');
}

/* ---- trial tables ---------------------------------------------------------- */
// Rows follow the served evidence list and its roles: targets first, then
// guardrails. A missing value is read against its own population: no meals or
// no readings in the period says so; a population with no served value is
// unavailable, never a null and never "no meals".
function evidenceTable(trial) {
  const row = (title, role, a, b, aNote, bNote) => `<tr class="${role === 'target' ? 'gf-target' : ''}"><td>${title}<small>${e(role)}</small></td><td class="v">${a}<small>${aNote}</small></td><td class="v">${b}<small>${bNote}</small></td></tr>`;
  const mg = (value, count) => (value != null ? `${e(value)} mg/dL` : count ? 'unavailable' : 'no meals');
  const meals = count => (count ? `${e(count)} ${count === 1 ? 'meal' : 'meals'}` : 'no meals in period');
  const readings = side => `${e(side.n_readings)} readings`;
  const rate = side => (side.value != null ? pct(side.value) : side.n_readings ? 'unavailable' : 'no readings');
  const ordered = [...trial.evidence].sort((a, b) => (a.role === 'target' ? 0 : 1) - (b.role === 'target' ? 0 : 1));
  const rows = ordered.flatMap(item => {
    if (item.key === 'tir') return [row('Time in range', item.role, rate(item.before), rate(item.trial), readings(item.before), readings(item.trial))];
    if (item.key === 'tbr') return [row('Time below range', item.role, rate(item.before), rate(item.trial), readings(item.before), readings(item.trial))];
    if (item.key === 'arc') return [
      row('Meal glucose peak', item.role, mg(item.before.peak, item.before.n_peak), mg(item.trial.peak, item.trial.n_peak), meals(item.before.n_peak), meals(item.trial.n_peak)),
      row('Meal glucose low point', item.role, mg(item.before.nadir, item.before.n_nadir), mg(item.trial.nadir, item.trial.n_nadir), meals(item.before.n_nadir), meals(item.trial.n_nadir)),
    ];
    return [];
  });
  const rescue = trial.rescue;
  return `<table class="gf-table"><thead><tr><th scope="col">Glucose observations</th><th scope="col">Before</th><th scope="col">Trial</th></tr></thead><tbody>
    ${rows.join('')}
    ${row('Logged rescue carbs', 'context', `${e(rescue.before_period.n)} entries`, `${e(rescue.trial_period.n)} entries`, `${e(rescue.before_period.grams)} g · ${e(rescue.before_period.n_unknown)} unknown amounts`, `${e(rescue.trial_period.grams)} g · ${e(rescue.trial_period.n_unknown)} unknown amounts`)}
    </tbody></table>`;
}
function dailyEvidence(trial) {
  const rows = trial.day_rows[view.evidencePeriod];
  const index = Math.min(view.evidenceDay, rows.length - 1);
  const row = rows[index];
  const value = n => (n == null ? 'no readings' : e(pct(n)));
  return `<div class="gf-select"><label>Period <select data-select="evidence-period"><option value="before_period" ${view.evidencePeriod === 'before_period' ? 'selected' : ''}>Before</option><option value="trial_period" ${view.evidencePeriod === 'trial_period' ? 'selected' : ''}>Trial</option></select></label><label>Available day <select data-select="evidence-day">${rows.map((item, i) => `<option value="${i}" ${index === i ? 'selected' : ''}>${e(date(item.date))}</option>`).join('')}</select></label></div>
    <div class="gf-day-read" aria-live="polite"><div class="gf-figure">${e(date(row.date))}<small>${e(row.n_readings)} glucose readings</small></div><table class="gf-table"><tbody><tr><td>Time in range</td><td class="v">${value(row.tir)}</td></tr><tr><td>Time below range</td><td class="v">${value(row.tbr)}</td></tr><tr><td>Meals</td><td class="v">${e(row.meals)}</td></tr></tbody></table><p>A day with readings is not necessarily a complete day of data. The Trial’s maturity stays unchanged.</p></div>`;
}
function detectedSettings(trial, note) {
  return `<section class="gf-section"><h3>What changed</h3><table class="gf-table"><thead><tr><th scope="col">Setting</th><th scope="col">Before</th><th scope="col">Detected</th></tr></thead><tbody>${trial.changes.map(change => `<tr><td>${SETTING_NAME[change.parameter] || e(change.parameter)}${change.slots_changed ? `<small>${e(change.slots_changed)} time slots changed${change.uniform ? ' · uniform' : ` · values shown at ${e(change.slot)}`}</small>` : change.slot ? `<small>${e(change.slot)}</small>` : ''}</td><td class="v">${e(settingValue(change.parameter, change.before))}</td><td class="v">${e(settingValue(change.parameter, change.after))}</td></tr>`).join('')}</tbody></table><p class="gf-meta">${e(note)}</p></section>`;
}

/* ---- the three sources on one desk ----------------------------------------- */
const kit = {
  surface, mockbar, colors, trialColors, narrow, view, e, clock, date, shortDate, stamp, period, pct,
  desk, nameplate, readingHeader, sheetToggle, emptyFrame, asideForm, trialStage, trialTitle, progressSection, evidenceTable, detectedSettings, reviewForm,
  investigationFrame, mountCharts, navigate, render, briefing, inspectRoute,
};
const setting = createSettingJourney(kit);
const focus = createFocusJourney(kit);
const shared = createSharedJourney(kit, { createSettingJourney, createFocusJourney });
// The Day desk reads each source's own recorded days: a journey's at its clock,
// the meals case file's at the window it was read over.
const mealsDayset = () => { const item = capture.variants[variant]; return { days: item.days, recorded: Object.keys(item.days).sort(), readAt: item.scenarios.window.end, viewedAt: item.scenarios.window.end, evidence: item }; };
const dayset = () => (source === 'setting' ? setting.dayset() : source === 'focus' ? focus.dayset() : source === 'journey' ? shared.dayset() : mealsDayset());
// The retained utilities read the current source's clock, served questions and
// detected profile; their page-memory carb entries mark the Day desk.
const utilityContext = () => (source === 'journey' ? shared.utilityContext() : source === 'setting' ? setting.utilityContext() : source === 'focus' ? focus.utilityContext()
  : { key: 'meals', now: capture.variants[variant].scenarios.window.end, utilities: null, profile: null, changes: [] });
const utilities = createUtilities(kit, { context: utilityContext });
const day = createDayDesk(kit, { dayset, carbEntries: () => utilities.entries() });
const meals = {
  setAside(reason) { setAside = { reason }; },
  restore() { setAside = null; },
  onExplore() { figure = 'episode'; seat = 'comparison'; },
  finish(conclusion) { finished = { trial: structuredClone(currentTrial()), conclusion, endedAt: new Date().toLocaleString() }; syncScenario('history'); },
};
const journey = () => (source === 'setting' ? setting : source === 'focus' ? focus : source === 'journey' ? shared : meals);

/* ---- wiring ---------------------------------------------------------------- */
function bind() {
  for (const button of surface.querySelectorAll('[data-occ]')) button.onclick = () => { select(button.dataset.occ); view.sheetOpen = false; view.focusAfterRender = narrow() ? '.gf-sheet-toggle' : '.gf-member-row[aria-pressed="true"]'; render(); };
  for (const button of surface.querySelectorAll('[data-cohort]')) button.onclick = () => {
    cohortKey = button.dataset.cohort;
    const ids = cohorts().find(row => row.key === cohortKey).occurrence_ids;
    if (ids.length && !ids.includes(selectedOcc)) select(ids.at(-1));
    render();
  };
  for (const button of surface.querySelectorAll('[data-step]')) button.onclick = () => { selectedStep = Number(button.dataset.step); figure = 'episode'; seat = 'episode'; view.sheetOpen = false; view.focusAfterRender = narrow() ? '.gf-sheet-toggle' : '.gf-step-row[aria-pressed="true"]'; render(); };
  // the episode/Day figure and the narrow seats belong to the meals desk; the
  // setting journey names its own
  if (!settingOwned()) {
    for (const button of surface.querySelectorAll('[data-figure]')) button.onclick = () => { figure = button.dataset.figure; render(); };
    for (const button of surface.querySelectorAll('[data-seat]')) button.onclick = () => { seat = button.dataset.seat; render(); };
  }
  for (const button of surface.querySelectorAll('[data-window]')) button.onclick = () => { windowMode = button.dataset.window; render(); };
  for (const button of surface.querySelectorAll('[data-mode]')) button.onclick = () => { view.evidenceMode = button.dataset.mode; render(); };
  for (const button of surface.querySelectorAll('[data-action]')) button.onclick = () => {
    const action = button.dataset.action;
    if (action === 'retry') load(true);
    else if (action === 'next-meal') moveMeal(1);
    else if (action === 'previous-meal') moveMeal(-1);
    // the sheet hands focus to its Close control and returns it to the toggle
    else if (action === 'open-sheet') { view.sheetOpen = true; view.focusAfterRender = '.gf-sheet-close'; render(); }
    else if (action === 'close-sheet') { view.sheetOpen = false; view.focusAfterRender = '.gf-sheet-toggle'; render(); }
    else if (action === 'aside') { view.asideOpen = true; view.sheetOpen = true; view.focusAfterRender = '#aside-reason'; render(); }
    else if (action === 'cancel-aside') { view.asideOpen = false; view.sheetOpen = false; view.focusAfterRender = '[data-action="aside"]'; render(); }
    else if (action === 'restore') { journey().restore(); navigate('overview'); }
    else if (action === 'explore') { if (!settingOwned()) meals.onExplore(); if (source === 'journey') shared.onExplore(); navigate('explore'); }
    // a subject's Open Day carries its date and the way back; a frame's plain
    // Open Day is direct entry
    else if (action === 'day') navigate('day', button.dataset.date
      ? { date: button.dataset.date, from: fromHere(button.dataset.subject, { utility: button.dataset.utilityFrom, utilityLabel: button.dataset.utilityLabel, focus: button.dataset.returnFocus }) }
      : {});
    else if (action === 'history') navigate('changes');
    else if (action === 'overview' || action === 'watch') navigate('overview');
  };
  const reason = surface.querySelector('#aside-reason'); if (reason) reason.oninput = event => { view.asideReason = event.target.value; };
  // Setting aside keeps the wearer on the concern they just set aside, where the
  // acknowledgment is: its own Restore, its reason, and the roster's set-aside
  // group with the next ranked concern one press above it. A source with no
  // roster says so on Overview, as it already did.
  const aside = surface.querySelector('[data-form="aside"]'); if (aside) aside.onsubmit = event => {
    event.preventDefault(); journey().setAside(view.asideReason.trim()); view.asideOpen = false; view.asideReason = '';
    if (source === 'journey') { view.focusAfterRender = '[data-restore]'; navigate('explore'); } else navigate('overview');
  };
  // every control that submits the conclusion — the form's own button and a
  // Retry after a failed save — waits on the same nonblank text
  const text = surface.querySelector('#conclusion'); if (text) text.oninput = event => {
    view.conclusion = event.target.value;
    for (const button of surface.querySelectorAll('[data-form="finish"] [type="submit"], [type="submit"][form="finish-form"]')) button.disabled = !view.conclusion.trim();
  };
  const finish = surface.querySelector('[data-form="finish"]'); if (finish) finish.onsubmit = event => {
    event.preventDefault(); if (!view.conclusion.trim()) return;
    // a failed save keeps the form in place with its Retry
    if (journey().finish(view.conclusion.trim()) === false) { view.focusAfterRender = '[data-focus="retry-resolve"]'; render(); return; }
    // a finished change opens on its own saved record, so the conclusion is
    // acknowledged before any other concern is offered: the meals and the
    // journey's setting branch in Changes, the habit's on its resolved Overview
    navigate(journey().finishRoute?.() || (source === 'meals' ? 'changes' : 'overview'));
  };
  const periodSelect = surface.querySelector('[data-select="evidence-period"]'); if (periodSelect) periodSelect.onchange = event => { view.evidencePeriod = event.target.value; view.evidenceDay = 0; render(); };
  const daySelect = surface.querySelector('[data-select="evidence-day"]'); if (daySelect) daySelect.onchange = event => { view.evidenceDay = Number(event.target.value); render(); };
}
window.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  // A seated utility steps back and closes on its own before the desk's chain,
  // and it does so from inside its own fields too: one Escape always leaves the
  // utility and hands focus back to what opened it. What was typed and not saved
  // stays in the page, as it does when Close is pressed.
  if (view.utility) { utilities.escape(); return; }
  // elsewhere a field owns the key, so a stray Escape cannot drop a draft
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  if (view.sheetOpen) { view.sheetOpen = false; view.focusAfterRender = view.asideOpen ? '[data-action="aside"]' : '.gf-sheet-toggle'; view.asideOpen = false; }
  else if (view.asideOpen) { view.asideOpen = false; view.focusAfterRender = '[data-action="aside"]'; }
  // Day steps its month back to the week, then drops its focused log moment
  else if (destination === 'day') { if (!day.escape()) return; }
  else if (settingOwned()) { if (!journey().escape()) return; }
  // a Focus-owned frame steps its own seat back before the desk's figure does
  else if ((source === 'focus' || source === 'journey') && journey().escape()) { /* stepped */ }
  else if (seat !== 'comparison' && narrow()) seat = 'comparison';
  else if (figure !== 'episode' && episode()) figure = 'episode';
  else return;
  render();
});
window.addEventListener('pagehide', dispose);
load();
