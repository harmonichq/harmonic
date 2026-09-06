// #348 design exploration. All choices, set-aside state, and endings below are
// proposed interactions held only in memory. They do not call application APIs.
import {
  renderShell, loadCapture, renderMockBar, resolveColors,
  renderEpisodeChart, escapeText,
} from './_shell.js';

const main = renderShell();
const e = escapeText;
const colors = resolveColors();
const trialIds = {
  active: 'profile-all-20260623233000',
  ready: 'carb_ratio-all-20260607081500',
};
let captures = null;
let chart = null;
let scenario = 'investigate';
let destination = 'overview';
let selectedEpisode = null;
let selectedStep = 0;
let investigationOpen = false;
let setAsideOpen = false;
let setAside = null;
let asideDraft = '';
let conclusionDraft = '';
let ending = null;
let daySelection = null;
let dayReturn = 'overview';
let retrying = false;

scenario = renderMockBar(main, 'Change journal', state => {
  scenario = state;
  destination = 'overview';
  daySelection = null;
  update();
});
const scenarioNote = document.createElement('span');
main.querySelector('.mockbar p').append(' ', scenarioNote);
const page = document.createElement('div');
page.className = 'journal';
main.append(page);
const live = document.createElement('div');
live.className = 'journal-live';
live.setAttribute('role', 'status');
live.setAttribute('aria-live', 'polite');
main.append(live);

const dateFormat = new Intl.DateTimeFormat('en-US', { month:'short', day:'numeric', year:'numeric' });
function dateText(value) {
  if (!value) return 'Date unavailable';
  return dateFormat.format(new Date(value.length === 10 ? `${value}T12:00:00` : value.replace(' ', 'T')));
}
function timeText(value) { return value ? value.slice(11, 16) : ''; }
function dateTime(value) { return `${dateText(value)} · ${timeText(value)}`; }
function rangeText(period) { return `${dateTime(period.start)} to ${dateTime(period.end)}`; }
function number(value, digits = 1) { return value == null ? 'Unavailable' : Number(value).toFixed(digits); }
function action(label, name, primary = false, attrs = '') {
  return `<button type="button" data-action="${name}"${primary ? ' class="primary"' : ''} ${attrs}>${label}</button>`;
}
function link(label, name, attrs = '') {
  return `<button type="button" class="journal-link" data-action="${name}" ${attrs}>${label}</button>`;
}
function entry(when, date, content, { current = false, id = '' } = {}) {
  return `<section class="journal-entry${current ? ' current' : ''}"${id ? ` id="${id}"` : ''}>
    <div class="journal-date"><strong>${when}</strong><span>${date}</span></div>
    <div class="journal-copy">${content}</div>
  </section>`;
}
function masthead(title, context, status, detail = '') {
  return `<div class="journal-masthead"><div><div class="journal-caption">${context}</div><h1>${title}</h1></div>
    <div class="journal-status"><strong>${status}</strong>${detail}</div></div>`;
}
function concern() { return captures.investigation.scenarios.low_confidence[0]; }
function episode() { return captures.investigation.scenarios.episodes[selectedEpisode || concern().hero_episode]; }
function trial() {
  return captures.verify.details[scenario === 'active' ? trialIds.active : trialIds.ready].selected;
}
function isTrialView() { return ['active', 'ready', 'history'].includes(scenario); }
function notify(message) { live.textContent = message; }
function go(next, announce = '') {
  if (next === 'day' && destination !== 'day') dayReturn = destination;
  destination = next;
  update();
  main.scrollTop = 0;
  if (announce) notify(announce);
}
function setScenario(next) {
  scenario = next;
  destination = 'overview';
  const url = new URL(location.href);
  url.searchParams.set('state', next);
  history.replaceState(null, '', url);
  main.querySelector('.mockbar select').value = next;
  update();
  main.scrollTop = 0;
}
function updateNavigation() {
  document.querySelectorAll('[data-destination]').forEach(button => {
    if (button.dataset.destination === destination) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
}

function tierLabel(tier) {
  const name = tier === 'observed' ? 'Observed' : tier === 'inferred' ? 'Inferred' : 'Not in data';
  const color = tier === 'observed' ? colors.observed : tier === 'inferred' ? colors.inferred : colors.notindata;
  return `<span class="journal-tier"><i style="color:${e(color)}" aria-hidden="true"></i>${name}</span>`;
}
function stepCopy(step) {
  // The source's thin late-bolus step includes a treatment suggestion after an
  // em dash. This investigation quotes only its evidential clause. The full
  // original episode is still passed unchanged to the shipped chart builder.
  const fact = step.text.split(' — ')[0];
  return fact.charAt(0).toUpperCase() + fact.slice(1);
}
function stepRead() {
  const step = episode().steps[selectedStep];
  return `${tierLabel(step.evidence_tier)}<p>${e(stepCopy(step))}.</p>`;
}
function episodePanel({ day = false } = {}) {
  const ep = episode();
  return `<div class="journal-occurrences" aria-label="Occurrences">
    ${concern().occurrences.map(id => {
      const item = captures.investigation.scenarios.episodes[id];
      return `<button data-episode="${e(id)}" aria-pressed="${id === ep.id}">${e(dateText(item.start))} · ${e(timeText(item.start))}</button>`;
    }).join('')}
  </div>
  <div class="journal-chart-heading"><div><h3>${e(dateText(ep.start))}</h3><span class="journal-caption">${e(timeText(ep.window.start))}–${e(timeText(ep.window.end))} · Pump local time</span></div>
    ${day ? '' : link('Open this episode in Day', 'episode-day')}
  </div>
  <div class="journal-chart" id="journal-episode-chart" role="img" aria-label="Glucose and treatment evidence for the selected episode"></div>
  <div class="journal-step-nav" aria-label="Episode steps">
    ${ep.steps.map((step, index) => `<button data-step="${index}" aria-pressed="${index === selectedStep}">${e(timeText(step.t))} · ${['Before the dose', 'Peak', 'Later'][index] || 'Evidence'}</button>`).join('')}
  </div>
  <div class="journal-step-read" id="journal-step-read" aria-live="polite">${stepRead()}</div>
  <div class="journal-step-footer"><span class="journal-caption">${selectedStep + 1} of ${ep.steps.length} moments</span>
    ${action(selectedStep === ep.steps.length - 1 ? 'Review the other occurrence' : 'Next moment', 'next-step')}
  </div>`;
}
function asideForm() {
  return `<form class="journal-form" id="journal-aside-form">
    <label for="journal-aside-reason">Why set this aside? <span>Optional</span></label>
    <textarea id="journal-aside-reason" name="reason" placeholder="Add a reason if it will help you later.">${e(asideDraft)}</textarea>
    <p class="journal-notice">Illustrative choice. Kept only in this page session.</p>
    <div class="journal-actions"><button type="submit" class="primary">Set aside</button>${action('Cancel', 'cancel-aside')}</div>
  </form>`;
}
function concernContext() {
  const c = concern();
  return `<details${destination === 'changes' ? ' open' : ''}><summary>What started this investigation</summary>
    <p>Glucose was rising before a recorded meal bolus in ${c.occurrences.length} episodes.</p>
    <p class="journal-qualifier"><strong>Thin evidence.</strong> ${c.confidence.k} occurrences among ${c.confidence.n} assessed opportunities. No setting or habit change is supported by this account.</p>
    <p>The bolus and glucose readings are recorded. The explanation of the timing is an inference.</p>
    <div class="journal-actions">${link('Inspect the episodes', 'inspect-episodes')}</div>
  </details>`;
}
function investigation() {
  const c = concern();
  const expanded = destination === 'explore' || investigationOpen;
  const heading = masthead('Glucose rising around meals', 'Your journal · Episode investigation', setAside ? 'Set aside' : 'Thin evidence', `${c.occurrences.length} occurrences`);
  let current;
  if (setAside) {
    current = `<h2>You set this concern aside</h2><p>No other supported action is available in this evidence.</p>
      ${setAside.reason ? `<div class="journal-quote">${e(setAside.reason)}</div>` : '<p class="journal-caption">No reason added.</p>'}
      <p class="journal-notice">Illustrative choice from this page session.</p>
      <div class="journal-actions">${action('Reopen the investigation', 'reopen', true)}${link('Inspect its evidence', 'inspect-episodes')}</div>`;
    if (expanded) current += episodePanel();
  } else {
    current = `<h2>${expanded ? 'Read the sequence, then compare the other occurrence' : 'Take a closer look at the two episodes'}</h2>
      <p>The useful next step is to inspect when glucose began rising around the meal bolus.</p>
      <p class="journal-qualifier"><strong>A specific change is not yet supported.</strong> These episodes are a starting point for investigation.</p>
      ${expanded ? episodePanel() : `<div class="journal-actions">${action('Read the first episode', 'inspect-episodes', true)}${link('Set this aside', 'show-aside')}</div>`}
      ${expanded ? `<div class="journal-actions">${link('Set this aside', 'show-aside')}</div>` : ''}
      ${setAsideOpen ? asideForm() : ''}`;
  }
  return `${heading}<nav class="journal-links" aria-label="This account">${link('Current step', 'jump-current')}${link('Original concern', 'jump-original')}${link('Your choice', 'jump-choice')}</nav>
    ${entry('Current step', 'Under review', current, {current:true, id:'journal-current'})}
    ${entry('May 24–25', '2024', concernContext(), {id:'journal-original'})}
    ${entry('Your choice', setAside ? 'Set aside' : 'Still open', setAside ? `<h2>The concern remains available</h2><p>Setting it aside records your preference. It does not dismiss the evidence.</p>${link('Return to the episodes', 'inspect-episodes')}` : `<h2>Leave with a clearer question</h2><p>Inspect both occurrences before deciding what to work on. This investigation does not start a watched change.</p><div class="journal-actions">${link('Continue investigating', 'inspect-episodes')}${link('Set aside, with an optional reason', 'show-aside')}</div>`, {id:'journal-choice'})}`;
}

function changedSettings(t) {
  return `<ul class="journal-setting-list">${t.changes.map(change => {
    if (change.parameter === 'basal_rate') return `<li><strong>Basal</strong> · ${number(change.before)} → ${number(change.after)} U/h<small>${change.uniform ? 'All changed times share this value.' : `At ${e(change.slot)}.`}</small></li>`;
    if (change.parameter === 'isf') return `<li><strong>Correction factor</strong> · 1 U : ${number(change.before, 0)} → ${number(change.after, 0)} mg/dL<small>${change.uniform ? 'All changed times share this value.' : `At ${e(change.slot)}.`}</small></li>`;
    return `<li><strong>Carb ratio</strong> · 1 U : ${number(change.before)} → ${number(change.after)} g${change.slot ? `<small>At ${e(change.slot)}. ${change.uniform === false ? 'Other changed times differ.' : 'All changed times share this value.'}</small>` : '<small>Whole profile.</small>'}</li>`;
  }).join('')}</ul>`;
}
function periods(t) {
  return `<div class="journal-periods"><p><strong>Before</strong>${e(rangeText(t.before_period))}<br><span class="journal-caption">${t.days.before_period} dates with readings</span></p>
    <p><strong>Trial</strong>${e(rangeText(t.trial_period))}<br><span class="journal-caption">${t.days.trial_period} dates with readings · ${t.maturing.gap_count} ${t.maturing.gap_count === 1 ? 'gap' : 'gaps'}</span></p></div>`;
}
function metricRows(t, safetyOnly = false) {
  return t.evidence.filter(item => !safetyOnly || item.key === 'tbr').map(item => {
    if (item.key === 'arc') return `<tr><th scope="row">Meal peak</th><td>${number(item.before.peak, 0)} mg/dL<small>${item.before.n_peak} meals</small></td><td>${number(item.trial.peak, 0)} mg/dL<small>${item.trial.n_peak} meals</small></td></tr>
      <tr><th scope="row">Meal nadir</th><td>${number(item.before.nadir, 0)} mg/dL<small>${item.before.n_nadir} meals</small></td><td>${number(item.trial.nadir, 0)} mg/dL<small>${item.trial.n_nadir} meals</small></td></tr>`;
    return `<tr><th scope="row">${item.key === 'tir' ? 'Time in range' : 'Time below range'}</th><td>${number(item.before.value)}%<small>${item.before.n_readings} readings</small></td><td>${number(item.trial.value)}%<small>${item.trial.n_readings} readings</small></td></tr>`;
  }).join('');
}
function rescueRows(t) {
  const a = t.rescue.before_period;
  const b = t.rescue.trial_period;
  return `<tr><th scope="row">Rescue entries<small>Across each full period</small></th><td>${a.n} entries<small>${number(a.grams, 0)} g · ${a.n_unknown} unknown amounts</small></td><td>${b.n} entries<small>${number(b.grams, 0)} g · ${b.n_unknown} unknown amounts</small></td></tr>`;
}
function safetyRead(t) {
  const arc = t.evidence.find(item => item.key === 'arc');
  const label = t.state === 'maturing'
    ? `Lower meal nadir in available data: ${number(arc.before.nadir, 0)} → ${number(arc.trial.nadir, 0)} mg/dL`
    : `Also review: ${t.rescue.trial_period.n} rescue entries during Trial, ${t.rescue.before_period.n} before`;
  return `<details class="journal-safety"><summary>${label}</summary>
    <p>Lows and rescue entries belong in the review, alongside the target outcome.</p>
    <table class="journal-table"><thead><tr><th>Observation</th><th>Before</th><th>Trial</th></tr></thead><tbody>${metricRows(t, true)}${rescueRows(t)}</tbody></table>
    <p class="journal-caption">${e(t.limits[0])} ${e(t.limits[1])}</p>
  </details>`;
}
function originalTrial(t) {
  return `<h2>${t.parameter === 'profile' ? 'Profile change detected' : 'Carb ratio change detected'}</h2>
    ${changedSettings(t)}
    <details><summary>Original decision and context</summary><p>The earlier reason for this change and a linked Plan are unavailable.</p>
      <p>The detected pump setting is the known starting point. A later reading cannot fill in the missing decision.</p>
    </details>`;
}
function trialEvidence(t, snapshot = false) {
  return `<h2>${snapshot ? 'Evidence at the ending' : 'What the available observations show'}</h2>
    ${periods(t)}
    <table class="journal-table"><thead><tr><th>Observation</th><th>Before</th><th>Trial</th></tr></thead><tbody>${metricRows(t)}${rescueRows(t)}</tbody></table>
    <ul class="journal-limits">${t.limits.map(limit => `<li>${e(limit)}</li>`).join('')}</ul>
    <details><summary>Read the days in these periods</summary>${dailyRows(t)}</details>`;
}
function dailyRows(t) {
  return `<table class="journal-table"><thead><tr><th>Date</th><th>Readings</th><th>Time below range</th></tr></thead><tbody>${['before_period', 'trial_period'].flatMap(period => t.day_rows[period].map(row => `<tr><th scope="row">${link(e(dateText(row.date)), 'trial-day', `data-period="${period}" data-date="${e(row.date)}"`)}<small>${period === 'before_period' ? 'Before' : 'Trial'}</small></th><td>${row.n_readings}</td><td>${number(row.tbr)}%</td></tr>`)).join('')}</tbody></table>`;
}
function conclusionForm() {
  return `<form class="journal-form" id="journal-finish-form">
    <label for="journal-conclusion">Your conclusion</label>
    <textarea id="journal-conclusion" name="conclusion" required placeholder="What did you learn or decide?">${e(conclusionDraft)}</textarea>
    <p class="journal-notice">Illustrative ending. Kept only in this page session.</p>
    <div class="journal-actions"><button id="journal-finish" type="submit" class="primary"${conclusionDraft.trim() ? '' : ' disabled'}>Finish and keep this account</button></div>
    <p class="journal-caption">Finishing ends follow-up. It does not change a setting on your pump.</p>
  </form>`;
}
function trialAccount() {
  const t = trial();
  const ready = t.state === 'complete';
  const expanded = destination === 'explore';
  const name = t.parameter === 'profile' ? 'Following a profile change' : 'Following a Carb ratio change';
  const first = ready
    ? `<h2>Review what happened, then record your conclusion</h2><p>${e(t.readiness.message)}</p><p class="journal-fact">Carb ratio · 1 U : ${number(t.before)} → ${number(t.after)} g</p>${safetyRead(t)}<div class="journal-actions">${expanded ? link('Return to the account', 'changes') : action('Read Before and Trial', 'trial-evidence', true)}${link('Record a conclusion', 'jump-conclusion')}</div>`
    : `<h2>This change is still maturing</h2><p>Following the Basal, Correction factor and Carb ratio changes detected on ${e(dateText(t.changed_at))}.</p>
       <div class="journal-progress"><label for="journal-progress"><span><strong>${t.maturing.days_elapsed}</strong> of ${t.maturing.days_required} days elapsed</span><span>${t.maturing.gap_count} data gap</span></label><progress id="journal-progress" value="${t.maturing.days_elapsed}" max="${t.maturing.days_required}">${t.maturing.days_elapsed} of ${t.maturing.days_required}</progress></div>
       <p>${e(t.readiness.message)}</p><p class="journal-caption">${t.days.trial_period} dates with readings. Trial evidence through ${e(dateTime(t.trial_period.end))}.</p>
       ${safetyRead(t)}<div class="journal-actions">${expanded ? link('Return to the account', 'changes') : action('Review available evidence', 'trial-evidence', true)}</div>`;
  const evidence = expanded ? entry('Available read', e(dateText(t.trial_period.end)), trialEvidence(t), {id:'journal-evidence'}) : '';
  const last = ready
    ? `<h2>Give this account an ending</h2><p>Keep the observation and your decision distinct. This comparison does not show that the setting caused what happened.</p>${conclusionForm()}`
    : `<h2>A conclusion is not ready</h2><p>Keep following the actual change while the evidence gathers. The earlier context remains available above.</p><p class="journal-qualifier">A change is already being watched, so nothing new starts until it finishes.</p>`;
  return `${masthead(name, 'Your journal · Detected setting change', e(t.readiness.label), `Detected ${e(dateText(t.changed_at))}`)}
    <nav class="journal-links" aria-label="This account">${link('Current progress', 'jump-current')}${link('Detected change', 'jump-original')}${link(ready ? 'Conclusion' : 'What remains', 'jump-conclusion')}</nav>
    ${entry(ready ? 'Current step' : 'Current progress', e(dateText(t.trial_period.end)), first, {current:true,id:'journal-current'})}
    ${evidence}
    ${entry('Detected', e(dateTime(t.changed_at)), originalTrial(t), {id:'journal-original'})}
    ${entry(ready ? 'Your conclusion' : 'Still open', ready ? 'Ready to record' : 'Maturing', last, {id:'journal-conclusion-section'})}`;
}
function historyAccount() {
  const t = ending ? ending.snapshot : trial();
  const note = ending ? ending.conclusion : 'I want to discuss the added rescue entries before deciding what to change.';
  const context = ending ? 'Your conclusion from this page session' : 'Illustrative conclusion';
  return `${masthead('Carb ratio change', 'Your journal · Historical account', 'Finished', 'Illustrative retained record')}
    <nav class="journal-links" aria-label="This account">${link('Ending', 'jump-current')}${link('Original context', 'jump-original')}${link('Ending evidence', 'jump-evidence')}</nav>
    ${entry('Ending', ending ? 'This page session' : 'Time unavailable', `<h2>The account is finished</h2><div class="journal-quote">${e(note)}</div><p class="journal-notice">${context}. This is not a saved Harmonic record.</p><p>The observed change, its uncertainty and your conclusion stay together.</p><div class="journal-actions">${action('Return to Overview', 'quiet', true)}${link('Read the ending evidence', 'jump-evidence')}</div>`, {current:true,id:'journal-current'})}
    ${entry('Detected', e(dateTime(t.changed_at)), originalTrial(t), {id:'journal-original'})}
    ${entry('Ending snapshot', e(dateText(t.trial_period.end)), `<details${destination === 'explore' ? ' open' : ''} id="journal-history-evidence"><summary>Before and Trial at the ending</summary>${trialEvidence(t, true)}<p class="journal-notice">Illustrative retained snapshot from the supplied comparison. A later assessment would be shown separately.</p></details>`, {id:'journal-evidence'})}`;
}
function quietAccount() {
  return `${masthead('Nothing needs a new decision here', 'Your journal · Overview', 'Quiet', 'No active change')}
    ${entry('Now', 'No supported priority', `<h2>No supported action is waiting</h2><p>There is no active follow-up in this example. Your earlier accounts and Day remain available.</p><div class="journal-actions">${action('Read a previous account', 'history', true)}${link('Open Day', 'day')}</div>`, {current:true})}
    ${entry('Earlier work', 'Available to revisit', `<h2>Keep the decision and its ending</h2><p>Open the prior Carb ratio account to see the detected change, available comparison and illustrative conclusion.</p>${link('Open Changes', 'history')}`)}`;
}
function errorAccount() {
  return `${masthead('The journal could not be updated', 'Your journal · Overview', 'Unavailable', 'No current result')}
    ${entry('Stopped here', 'Read failed', `<div class="journal-message"><h2>Current evidence is unavailable</h2><p>This does not mean there is no supported action. Retry to read the current account.</p><div class="journal-actions">${action(retrying ? 'Retrying…' : 'Retry', 'retry', true, retrying ? 'disabled' : '')}</div></div>`, {current:true})}`;
}
function dayView() {
  if (!isTrialView()) {
    return `${masthead(dateText(episode().start), 'Day · Selected episode', 'Episode evidence', 'Pump local time')}
      <div class="journal-links">${link('Back to the same investigation', 'back-day')}</div>
      ${entry('Selected episode', e(timeText(episode().start)), `<h2>Glucose around the recorded meal bolus</h2>${episodePanel({day:true})}<p class="journal-qualifier"><strong>Thin evidence.</strong> The timing explanation remains an inference.</p>`, {current:true})}`;
  }
  const t = ending && scenario === 'history' ? ending.snapshot : trial();
  if (!daySelection) daySelection = {period:'trial_period', date:t.day_rows.trial_period[0].date};
  const row = t.day_rows[daySelection.period].find(item => item.date === daySelection.date);
  return `${masthead(dateText(row.date), 'Day · Trial evidence', daySelection.period === 'before_period' ? 'Before' : 'Trial', 'Same comparison periods')}
    <div class="journal-links">${link('Back to the same account', 'back-day')}</div>
    ${entry('Selected day', e(dateText(row.date)), `<h2>Available readings for this date</h2>
      <label class="journal-day-select">Date <select id="journal-day-date">${['before_period','trial_period'].flatMap(period => t.day_rows[period].map(item => `<option value="${period}|${item.date}"${period === daySelection.period && item.date === row.date ? ' selected' : ''}>${period === 'before_period' ? 'Before' : 'Trial'} · ${e(dateText(item.date))}</option>`)).join('')}</select></label>
      <table class="journal-table"><tbody><tr><th scope="row">Readings</th><td>${row.n_readings}</td></tr><tr><th scope="row">Time in range</th><td>${number(row.tir)}%</td></tr><tr><th scope="row">Time below range</th><td>${number(row.tbr)}%</td></tr><tr><th scope="row">Meals</th><td>${row.meals}</td></tr></tbody></table>
      <p class="journal-notice">This concept has daily summaries for Trial days. A full Day trace is not supplied for this example.</p>`, {current:true})}`;
}

function update() {
  chart?.dispose();
  chart = null;
  updateNavigation();
  scenarioNote.textContent = isTrialView()
    ? 'Trial scenarios are separate from the meal investigation. New snapshots and endings are illustrative.'
    : scenario === 'quiet'
      ? 'Quiet is an illustrative arrival state, not a conclusion drawn from the thin meal evidence.'
      : scenario === 'error'
        ? 'Illustrative failed read. Retry reloads the supplied synthetic captures.'
        : 'This meal capture is thin evidence. Investigation and Trial scenarios are independent examples.';
  if (!captures && scenario !== 'error') {
    page.innerHTML = '<div class="journal-loading" role="status">Loading the synthetic account…</div>';
    return;
  }
  if (scenario === 'error') page.innerHTML = errorAccount();
  else if (destination === 'day') page.innerHTML = dayView();
  else if (scenario === 'quiet') page.innerHTML = quietAccount();
  else if (scenario === 'history') page.innerHTML = historyAccount();
  else if (isTrialView()) page.innerHTML = trialAccount();
  else page.innerHTML = investigation();
  const chartElement = page.querySelector('#journal-episode-chart');
  if (chartElement) chart = renderEpisodeChart(chartElement, episode(), selectedStep);
}
function jump(id) {
  const target = page.querySelector(`#${id}`);
  if (!target) return;
  const details = target.querySelector('details');
  if (details) details.open = true;
  target.scrollIntoView({block:'start'});
}
function changeStep(index) {
  selectedStep = index;
  chart?.selectStep(index);
  page.querySelectorAll('[data-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === index)));
  const read = page.querySelector('#journal-step-read');
  if (read) read.innerHTML = stepRead();
  const footer = page.querySelector('.journal-step-footer');
  if (footer) footer.innerHTML = `<span class="journal-caption">${index + 1} of ${episode().steps.length} moments</span>${action(index === episode().steps.length - 1 ? 'Review the other occurrence' : 'Next moment', 'next-step')}`;
}

// Proposed app navigation is wired. Utility controls in the shared shell are
// context-only in this round, as declared by the common scaffold.
document.querySelectorAll('[data-destination]').forEach(button => {
  button.addEventListener('click', () => {
    const next = button.dataset.destination;
    if (scenario === 'quiet' && next === 'changes') {
      scenario = 'history';
      main.querySelector('.mockbar select').value = 'history';
    }
    go(next);
  });
});
page.addEventListener('input', event => {
  if (event.target.id === 'journal-aside-reason') asideDraft = event.target.value;
  if (event.target.id === 'journal-conclusion') {
    conclusionDraft = event.target.value;
    page.querySelector('#journal-finish').disabled = !conclusionDraft.trim();
  }
});
page.addEventListener('change', event => {
  if (event.target.id === 'journal-day-date') {
    const [period,date] = event.target.value.split('|');
    daySelection = {period,date};
    update();
  }
});
page.addEventListener('submit', event => {
  event.preventDefault();
  if (event.target.id === 'journal-aside-form') {
    // In-memory prototype choice, never a persistence or eligibility claim.
    setAside = {reason:asideDraft.trim()};
    setAsideOpen = false;
    investigationOpen = false;
    go('changes', 'The concern is set aside in this page session.');
  }
  if (event.target.id === 'journal-finish-form' && conclusionDraft.trim()) {
    // Admission uses the captured readiness state only. Production finish and
    // active-slot release require the shared backend authority from ADR 348.
    const selected = trial();
    if (selected.state !== 'complete') return;
    ending = {conclusion:conclusionDraft.trim(), snapshot:structuredClone(selected)};
    setScenario('history');
    destination = 'changes';
    update();
    notify('The illustrative ending is retained in this page session.');
  }
});
page.addEventListener('click', async event => {
  const control = event.target.closest('button');
  if (!control) return;
  if (control.dataset.episode) {
    selectedEpisode = control.dataset.episode;
    selectedStep = 0;
    update();
    notify(`Selected ${dateText(episode().start)}.`);
    return;
  }
  if (control.dataset.step !== undefined) {
    changeStep(Number(control.dataset.step));
    return;
  }
  switch (control.dataset.action) {
    case 'inspect-episodes': investigationOpen = true; go('explore'); break;
    case 'show-aside':
      setAsideOpen = true;
      if (destination === 'day') destination = 'overview';
      update();
      page.querySelector('#journal-aside-reason')?.focus();
      break;
    case 'cancel-aside': setAsideOpen = false; update(); break;
    case 'reopen': setAside = null; investigationOpen = true; go('explore'); break;
    case 'next-step':
      if (selectedStep < episode().steps.length - 1) changeStep(selectedStep + 1);
      else {
        const ids = concern().occurrences;
        selectedEpisode = ids[(ids.indexOf(episode().id) + 1) % ids.length];
        selectedStep = 0;
        update();
        notify(`Selected the occurrence on ${dateText(episode().start)}.`);
      }
      break;
    case 'episode-day': go('day'); break;
    case 'day': go('day'); break;
    case 'back-day': go(dayReturn); break;
    case 'trial-day': daySelection = {period:control.dataset.period,date:control.dataset.date}; go('day'); break;
    case 'trial-evidence': go('explore'); break;
    case 'changes': go('changes'); break;
    case 'jump-current': jump('journal-current'); break;
    case 'jump-original': jump('journal-original'); break;
    case 'jump-choice': jump('journal-choice'); break;
    case 'jump-evidence': jump('journal-evidence'); break;
    case 'jump-conclusion': jump('journal-conclusion-section'); page.querySelector('#journal-conclusion')?.focus(); break;
    case 'quiet': setScenario('quiet'); break;
    case 'history': setScenario('history'); destination = 'changes'; update(); break;
    case 'retry':
      retrying = true;
      update();
      try {
        const [investigation,verify] = await Promise.all([loadCapture('harmonic-v2'),loadCapture('verify')]);
        captures = {investigation,verify};
        retrying = false;
        setScenario('investigate');
        notify('The synthetic account loaded.');
      } catch {
        retrying = false;
        update();
        notify('The evidence is still unavailable. Retry remains available.');
      }
      break;
  }
});

update();
try {
  const [investigation,verify] = await Promise.all([loadCapture('harmonic-v2'),loadCapture('verify')]);
  captures = {investigation,verify};
  selectedEpisode = concern().hero_episode;
  update();
} catch {
  scenario = 'error';
  main.querySelector('.mockbar select').value = 'error';
  update();
}
window.addEventListener('pagehide', () => chart?.dispose());
