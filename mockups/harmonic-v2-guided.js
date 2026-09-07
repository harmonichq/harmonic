// Unlocked, synthetic concept for #348. Only this module's controls are wired.
// Shared Log carbs / Guide / Settings / Glossary controls are context only.
// The two captures are independent examples, never one causal journey.
// Set-aside reasons and review endings live in memory and reset on reload.
import {
  renderShell, renderMockBar, loadCapture, resolveColors,
  renderEpisodeChart, escapeText as esc,
} from './_shell.js';

const ACTIVE_ID = 'profile-all-20260623233000';
const READY_ID = 'carb_ratio-all-20260607081500';
const main = renderShell();
let scene = 'investigate';
let destination = 'overview';
let dayReturn = 'overview';
let episodeId;
let stepIndex = 0;
let evidenceOpen = false;
let occurrencesOpen = false;
let asideOpen = false;
let asideReason = null;
let checksOpen = false;
let conclusion = '';
let conclusionNote = '';
let finished = null;
let source;
let verify;
let chart;
let loadError;
let selectedTrialDay;

// This selector belongs to the mock, not to Harmonic's proposed navigation.
scene = renderMockBar(main, 'Guided brief', next => {
  scene = next;
  destination = next === 'history' ? 'changes' : 'overview';
  evidenceOpen = false;
  checksOpen = false;
  asideOpen = false;
  selectedTrialDay = null;
  render();
});
if (scene === 'history') destination = 'changes';
const page = document.createElement('div');
page.className = 'gb-page';
page.tabIndex = -1;
main.append(page);
const announcement = document.createElement('p');
announcement.className = 'gb-status-message';
announcement.setAttribute('role', 'status');
main.append(announcement);

function announce(message) { announcement.textContent = message; }
function date(t) {
  return new Date(t.replace(' ', 'T')).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function time(t) { return t.slice(11, 16); }
function when(t) { return `${date(t)} · ${time(t)}`; }
function period(p) { return `${when(p.start)} to ${when(p.end)}`; }
function number(n, digits = 0) { return Number(n).toFixed(digits); }
function button(label, action, primary = false, extra = '') {
  return `<button ${primary ? 'class="primary"' : ''} data-action="${action}" ${extra}>${label}</button>`;
}
function currentTrial() { return verify.details[scene === 'active' ? ACTIVE_ID : READY_ID].selected; }
function isTrialScene() { return ['active', 'ready', 'history'].includes(scene); }
function currentEpisode() { return source.scenarios.episodes[episodeId]; }
function sampleNote() {
  if (loadError) return 'Synthetic input failed to load. Utilities remain context only.';
  if (scene === 'error') return 'Illustrative failed-read state. Retry loads the synthetic investigation. Utilities are context only.';
  if (scene === 'quiet' && destination === 'overview') return 'Illustrative quiet arrival, not a verdict derived from the thin capture. Utilities are context only.';
  if (scene === 'history') return 'Illustrative history using a separate June 2026 Trial. New endings are in memory only. Utilities are context only.';
  if (isTrialScene()) return 'Separate June 2026 Verify capture; unrelated to the May 2024 investigation. New actions are illustrative. Utilities are context only.';
  return 'May 2024 synthetic investigation. Thin evidence; selection and set-aside are illustrative. Utilities are context only.';
}
function moveTo(next) {
  if (next === 'day' && destination !== 'day') dayReturn = destination;
  destination = next;
  render();
  page.focus({ preventScroll:true });
  main.scrollTop = 0;
}
function selectScenario(next) {
  scene = next;
  const selector = main.querySelector('.mockbar select');
  selector.value = next;
  const url = new URL(location.href);
  url.searchParams.set('state', next);
  history.replaceState(null, '', url);
}

function stepCopy(episode, index) {
  // Source step 0 includes advice. This thin case cannot promote it to an action.
  // The chart still receives the unmodified actual episode and evidence tier.
  if (index === 0) return 'Glucose was rising before the recorded meal bolus. The sequence suggests a timing question; the meal start itself is not recorded.';
  return episode.steps[index].text.replace(/^BG /, 'Glucose ');
}
function stepDetail(episode) {
  const step = episode.steps[stepIndex];
  const colors = resolveColors();
  const tierLabel = step.evidence_tier === 'observed' ? 'Observed' : 'Inferred';
  const color = step.evidence_tier === 'observed' ? colors.observed : colors.inferred;
  return `<span class="gb-tier" style="color:${color}">${tierLabel} · ${time(step.t)}</span>
    <p>${esc(stepCopy(episode, stepIndex))}</p>`;
}
function episodeEvidence(day = false) {
  const episode = currentEpisode();
  const concern = source.scenarios.low_confidence[0];
  const labels = ['Rise before bolus', 'Peak glucose', 'Later glucose'];
  return `<section class="gb-evidence" id="episode-evidence" aria-labelledby="episode-title">
    <header class="gb-evidence-head">
      <h2 id="episode-title">${day ? 'Selected episode' : `Start with the meal on ${date(episode.start)}`}</h2>
      <div class="v2-meta">${date(episode.window.start)} · ${time(episode.window.start)}–${time(episode.window.end)} · pump-local time</div>
      <div class="gb-episode-tools">
        <span class="v2-meta">${day ? 'Episode excerpt; other hours are not included.' : `Occurrence ${concern.occurrences.indexOf(episodeId) + 1} of ${concern.occurrences.length}`}</span>
        ${button(occurrencesOpen ? 'Hide other occurrences' : `Other occurrences (${concern.occurrences.length})`, 'occurrences', false, `aria-expanded="${occurrencesOpen}"`)}
      </div>
      ${occurrencesOpen ? `<div class="gb-occurrences" aria-label="Occurrences">${concern.occurrences.map(id => {
        const e = source.scenarios.episodes[id];
        return `<button data-episode="${id}" aria-pressed="${id === episodeId}">${date(e.start)} · ${time(e.start)}</button>`;
      }).join('')}</div>` : ''}
    </header>
    <div class="gb-steps" aria-label="Episode steps">${episode.steps.map((step, i) => `<button data-step="${i}" aria-pressed="${i === stepIndex}">
      <span class="gb-step-number">${i + 1}</span><span><span class="gb-step-title">${labels[i]}</span><small>${time(step.t)} · ${step.evidence_tier === 'observed' ? 'Observed' : 'Inferred'}</small></span>
    </button>`).join('')}</div>
    <div class="gb-chart-well">
      <div class="v2-chart" id="episode-chart" role="img" aria-label="Glucose and recorded treatment around the selected episode; the selected step is highlighted."></div>
      <div class="gb-chart-legend"><span><i class="gb-dot"></i>Glucose</span><span><i class="gb-dot bolus"></i>Meal bolus</span><span><i class="gb-line"></i>Observed step</span><span><i class="gb-line inferred"></i>Inferred step</span></div>
    </div>
    <div class="gb-step-detail" id="step-detail">${stepDetail(episode)}</div>
    <div class="gb-evidence-body">
      <h3>What remains unknown</h3>
      <p>The meal start is not in this record. This sequence cannot establish why glucose rose or support a specific change.</p>
      <div class="v2-actions">${button('Compare the next occurrence', 'next-episode', true)}${day ? button('Return to the investigation', 'return-day') : button('Open this moment in Day', 'open-day')}</div>
    </div>
  </section>`;
}
function asideForm() {
  if (!asideOpen) return '';
  return `<form class="gb-aside-form" id="aside-form">
    <label for="aside-reason">Reason, if you want to leave one</label>
    <textarea id="aside-reason" placeholder="What makes this a lower priority for you?">${esc(asideReason || '')}</textarea>
    <div class="v2-actions"><button type="submit" class="primary">Set this concern aside</button>${button('Cancel', 'cancel-aside', false, 'type="button"')}</div>
  </form>`;
}
function investigation() {
  const concern = source.scenarios.low_confidence[0];
  const episode = currentEpisode();
  const window = source.scenarios.window;
  if (asideReason !== null && destination === 'overview') return `<article class="gb-brief">
    <div class="gb-context"><strong>Set aside</strong><span>Evidence is still available</span></div>
    <h1>This concern is set aside</h1>
    <p>Glucose rose before the recorded meal bolus. A specific change is not yet supported.</p>
    ${asideReason ? `<p>Your reason: ${esc(asideReason)}</p>` : ''}
    <p>No other supported priority is available in this view.</p>
    <div class="v2-actions">${button('Reopen the evidence', 'inspect', true)}${button('Undo set aside', 'undo-aside')}</div>
  </article>`;
  const open = evidenceOpen || destination === 'explore';
  const bolus = episode.window.boluses[0];
  return `<article class="gb-brief">
    <div class="gb-context"><strong>Guided investigation</strong><span>Thin evidence</span></div>
    <h1>Understand the rise before the bolus</h1>
    <p class="gb-lead">Glucose was already rising when the meal bolus was recorded. Look at the sequence before deciding what to work on.</p>
    <p>${concern.confidence.k} of ${concern.confidence.n} meals share this signal. A specific setting or habit change is not yet supported.</p>
    <div class="v2-meta">Evidence · ${date(window.start)}–${date(window.end)}</div>
    <div class="gb-summary"><span><strong>${time(bolus.t)}</strong> · recorded meal bolus</span><span><strong>${number(episode.worst_bg)} mg/dL</strong> · episode peak</span></div>
  </article>
  ${open ? episodeEvidence() : `<section class="gb-next">
    <h2>Start with one episode</h2>
    <p>Inspect the rise, the recorded bolus, and what followed on ${date(episode.start)}.</p>
    <div class="v2-actions">${button(`Inspect ${date(episode.start)}`, 'inspect', true)}${button('Set aside', 'aside')}</div>
  </section>`}
  ${open ? `<section class="gb-next"><h2>A clearer question to carry forward</h2><p>When did eating begin relative to the recorded bolus? That missing context keeps this an investigation.</p><div class="v2-actions">${button('Done inspecting', 'done-inspecting', true)}${button('Set aside', 'aside')}</div></section>` : ''}
  ${asideForm()}`;
}

function changeRows(trial) {
  return trial.changes.map(change => {
    const label = {basal_rate:'Basal', isf:'Correction factor', carb_ratio:'Carb ratio'}[change.parameter];
    const value = n => change.parameter === 'basal_rate' ? `${number(n, 2)} U/h` : change.parameter === 'isf' ? `1 U : ${number(n)} mg/dL` : `${number(n, 1)} g/U`;
    const scope = change.slots_changed ? (change.uniform ? 'All changed times' : `${change.slot} shown · ${change.slots_changed} times changed`) : 'Across the profile';
    return `<tr><td>${label}<small>${scope}</small></td><td>${value(change.before)}</td><td>${value(change.after)}</td></tr>`;
  }).join('');
}
function settings(trial) {
  return `<table class="gb-compare"><caption>Detected pump settings</caption><thead><tr><th>Setting</th><th>Before</th><th>After</th></tr></thead><tbody>${changeRows(trial)}</tbody></table>`;
}
function comparison(trial) {
  const tir = trial.evidence.find(e => e.key === 'tir');
  const tbr = trial.evidence.find(e => e.key === 'tbr');
  const arc = trial.evidence.find(e => e.key === 'arc');
  const metric = (title, a, b, suffix, an, bn, noun) => `<tr><td>${title}</td><td>${number(a, suffix === '%' ? 1 : 0)}${suffix}<small>${an} ${noun}</small></td><td>${number(b, suffix === '%' ? 1 : 0)}${suffix}<small>${bn} ${noun}</small></td></tr>`;
  return `<section class="gb-evidence" id="trial-evidence">
    <header class="gb-evidence-head"><h2>What the comparison can tell you</h2><p>These are observed differences. They do not establish that the setting change caused them.</p>
      <div class="gb-periods"><span>Before · ${period(trial.before_period)}</span><span>Trial · ${period(trial.trial_period)}</span></div></header>
    <div class="gb-evidence-body">
      <table class="gb-compare"><thead><tr><th>Observation</th><th>Before</th><th>Trial</th></tr></thead><tbody>
      ${metric('Time in range', tir.before.value, tir.trial.value, '%', tir.before.n_readings, tir.trial.n_readings, 'readings')}
      ${metric('Time below range', tbr.before.value, tbr.trial.value, '%', tbr.before.n_readings, tbr.trial.n_readings, 'readings')}
      ${metric('Meal peak', arc.before.peak, arc.trial.peak, ' mg/dL', arc.before.n_peak, arc.trial.n_peak, 'meals')}
      ${metric('Meal nadir', arc.before.nadir, arc.trial.nadir, ' mg/dL', arc.before.n_nadir, arc.trial.n_nadir, 'meals')}
      </tbody></table>
      <div class="v2-actions">${button(checksOpen ? 'Hide treatment context' : 'Inspect treatment context', 'checks', false, `aria-expanded="${checksOpen}"`)}${button('Inspect a Trial day', 'open-day')}</div>
      ${checksOpen ? treatmentContext(trial) : ''}
      <ul class="gb-plain-list">${trial.limits.map(limit => `<li>${esc(limit)}</li>`).join('')}</ul>
    </div>
  </section>`;
}
function treatmentContext(trial) {
  const before = trial.rescue.before_period;
  const after = trial.rescue.trial_period;
  return `<div class="gb-unknown" id="treatment-context"><h3>Logged rescue carbs</h3>
    <table class="gb-compare"><thead><tr><th>Recorded context</th><th>Before</th><th>Trial</th></tr></thead><tbody>
    <tr><td>Entries</td><td>${before.n}</td><td>${after.n}</td></tr>
    <tr><td>Known grams</td><td>${before.grams} g</td><td>${after.grams} g</td></tr>
    <tr><td>Amount unknown</td><td>${before.n_unknown} entries</td><td>${after.n_unknown} entries</td></tr>
    <tr><td>After a low prompt</td><td>${before.n_low_prompt} entries</td><td>${after.n_low_prompt} entries</td></tr>
    </tbody></table><p>Entries provide context. They are not a count of glucose lows.</p></div>`;
}
function conclusionForm() {
  const choices = ['I see no clear difference', 'The result needs more context', 'I have a different conclusion'];
  return `<form class="gb-conclusion" id="conclusion-form"><fieldset><legend>Your conclusion</legend>
    ${choices.map(choice => `<label class="gb-choice"><input type="radio" name="conclusion" value="${choice}" ${conclusion === choice ? 'checked' : ''} required><span>${choice}</span></label>`).join('')}
    </fieldset><label for="conclusion-note">Anything you want to remember? <span class="v2-meta">Optional</span></label>
    <textarea id="conclusion-note">${esc(conclusionNote)}</textarea>
    <p>Finishing records your review and ends this watch. Pump settings stay as they are.</p>
    <div class="v2-actions"><button type="submit" class="primary" id="finish-review" ${conclusion ? '' : 'disabled'}>Finish review</button></div>
  </form>`;
}
function trialBrief() {
  const trial = currentTrial();
  const active = scene === 'active';
  const progress = trial.maturing;
  const arc = trial.evidence.find(e => e.key === 'arc');
  const open = evidenceOpen || destination === 'explore';
  return `<article class="gb-brief">
    <div class="gb-context"><strong>${esc(trial.readiness.label)}</strong><span>Changed ${when(trial.changed_at)}</span></div>
    <h1>${active ? 'Follow the pump-profile change' : 'Review the result of the carb-ratio change'}</h1>
    <p class="gb-lead">${active ? 'Let the current change gather its evidence. Review what has arrived and keep the remaining uncertainty in view.' : 'The comparison is ready for your conclusion. The observed meal peak and nadir are unchanged.'}</p>
    ${active ? `<div class="gb-progress"><div class="gb-progress-head"><strong>${progress.days_elapsed} of ${progress.days_required} days elapsed</strong><span>${progress.gap_count} data gap</span></div><progress max="${progress.days_required}" value="${progress.days_elapsed}" aria-label="Trial days elapsed"></progress><div class="v2-meta">${esc(trial.readiness.message)} · Through ${when(trial.trial_period.end)}</div></div>` : `<div class="gb-summary"><span><strong>${number(arc.before.peak)} → ${number(arc.trial.peak)} mg/dL</strong> · meal peak</span><span><strong>${number(arc.before.nadir)} → ${number(arc.trial.nadir)} mg/dL</strong> · meal nadir</span></div>`}
    <div style="margin-top:24px">${settings(trial)}</div>
    <p class="v2-meta">This is the detected change. Earlier Plan intent is unavailable.</p>
  </article>
  <div class="gb-notice">${active ? `<strong>Keep lows in view.</strong> Meal nadir is ${number(arc.trial.nadir)} mg/dL in ${arc.trial.n_nadir} Trial meals, compared with ${number(arc.before.nadir)} mg/dL in ${arc.before.n_nadir} Before meals.` : `<strong>Treatment context needs a look.</strong> Rescue-carb entries increased from ${trial.rescue.before_period.n} to ${trial.rescue.trial_period.n}, while time below range is unchanged.`}
    <div>${button('Inspect lows and treatment entries', 'inspect-checks', false, 'class="gb-text-button"')}</div>
  </div>
  ${open ? comparison(trial) : ''}
  <section class="gb-next"><h2>${active ? 'Next: review the observations so far' : 'Next: record your conclusion'}</h2>
    ${active ? `<p>${trial.evidence.find(e => e.key === 'tir').trial.n_readings} readings are available across ${trial.days.trial_period} calendar dates, including partial dates. The Trial is still maturing.</p><div class="v2-actions">${button(open ? 'Close comparison' : 'Review observations', 'toggle-evidence', true)}${button('Inspect a Trial day', 'open-day')}</div><p class="v2-meta">A change is already being watched, so nothing new starts until it finishes.</p>` : `<p>Observed movement does not establish that this change helped or harmed.</p><div>${button(open ? 'Close full comparison' : 'Inspect full comparison', 'toggle-evidence', false, 'class="gb-text-button"')}</div>${conclusionForm()}`}
  </section>`;
}
function historicalRecord() {
  const trial = verify.details[READY_ID].selected;
  const review = finished || { conclusion:'The result needs more context', note:'', example:true };
  return `<article class="gb-brief"><div class="gb-context"><strong>Finished review</strong><span>Carb ratio · ${date(trial.changed_at)}</span></div>
    <h1>The conclusion stays with the change</h1><p class="gb-lead">${esc(review.conclusion)}.</p><p>The record keeps the detected change and the available comparison together.</p></article>
    <section class="gb-record"><dl>
      <div><dt>Original decision</dt><dd>Unavailable. This capture has no earlier Plan or decision snapshot.</dd></div>
      <div><dt>Detected change</dt><dd>Carb ratio · ${number(trial.before,1)} → ${number(trial.after,1)} g/U<br>${when(trial.changed_at)}</dd></div>
      <div><dt>Comparison retained</dt><dd>Before · ${period(trial.before_period)}<br>Trial · ${period(trial.trial_period)}<br>Observed differences do not establish cause.</dd></div>
      <div><dt>Ending</dt><dd><blockquote>${esc(review.conclusion)}.</blockquote>${review.note ? `<p>${esc(review.note)}</p>` : ''}${review.example ? 'Illustrative conclusion; no stored ending is supplied.' : 'Finished during this preview visit. The conclusion is held in memory only.'}</dd></div>
    </dl><div class="v2-actions">${button(evidenceOpen ? 'Hide retained comparison' : 'Read retained comparison', 'toggle-evidence', true)}${button('Return to Overview', 'overview')}</div></section>
    ${evidenceOpen ? comparison(trial) : ''}`;
}
function changes() {
  if (scene === 'history') return historicalRecord();
  if (isTrialScene()) return trialBrief();
  return `<article class="gb-brief"><div class="gb-context"><strong>Changes</strong></div><h1>No change is being followed here</h1><p>The meal-timing concern remains an investigation. No Plan or Focus has been started.</p><div class="v2-actions">${button('Return to the investigation', 'explore', true)}</div></article>
    <div class="gb-history-link"><div><strong>Carb-ratio review</strong><br><span>${date(verify.details[READY_ID].selected.changed_at)} · separate historical example</span></div>${button('Open past record', 'history')}</div>`;
}
function quiet() {
  // Deliberately illustrative. The thin episode capture is not a quiet verdict.
  return `<article class="gb-brief"><div class="gb-context"><strong>Quiet</strong><span>Assessment complete</span></div><h1>No supported priority needs action</h1><p class="gb-lead">There is no new change to work on. You can still investigate a particular day or revisit how a past change ended.</p><div class="v2-actions">${button('Open Day', 'open-day', true)}${button('Revisit past changes', 'history')}</div></article>`;
}
function failure() {
  // This scenario represents initial read failure. It does not reuse old evidence.
  return `<article class="gb-brief"><div class="gb-context"><strong>Could not load</strong></div><h1>The overview is unavailable</h1><p class="gb-lead">The assessment could not be read. There is no new result to act on.</p><div class="v2-actions">${button('Try again', 'retry', true)}</div></article>`;
}
function day() {
  if (!isTrialScene()) return `<div class="gb-path">${button('← Return to the investigation', 'return-day')}</div><article class="gb-brief"><div class="gb-context"><strong>Day</strong></div><h1>${date(currentEpisode().start)}</h1><p>Glucose and recorded treatment around the selected meal.</p></article>${episodeEvidence(true)}`;
  const trial = currentTrial();
  const rows = trial.day_rows.trial_period;
  const row = rows.find(r => r.date === selectedTrialDay) || rows[rows.length - 1];
  selectedTrialDay = row.date;
  return `<div class="gb-path">${button('← Return to the Trial', 'return-day')}</div><article class="gb-brief"><div class="gb-context"><strong>Day</strong><span>Within the selected Trial period</span></div><h1>${date(`${row.date} 00:00:00`)}</h1><p>Available observations for this date. Partial dates stay in the comparison.</p><label class="gb-day-picker">Trial date <select id="trial-day">${rows.map(r => `<option value="${r.date}" ${r.date === row.date ? 'selected' : ''}>${date(`${r.date} 00:00:00`)}</option>`).join('')}</select></label></article>
    <section class="gb-next"><h2>Available observations</h2><table class="gb-compare"><tbody><tr><td>CGM readings</td><td>${row.n_readings}</td></tr><tr><td>Time in range</td><td>${number(row.tir,1)}%<small>${row.n_in_range} of ${row.n_readings} readings</small></td></tr><tr><td>Time below range</td><td>${number(row.tbr,1)}%<small>${row.n_below} of ${row.n_readings} readings</small></td></tr><tr><td>Meals</td><td>${row.meals}</td></tr></tbody></table><p class="v2-meta">This captured Trial supplies daily totals. A full glucose trace for this date is unavailable.</p></section>`;
}

function render() {
  // Dispose before replacing its DOM node; step selection alone uses selectStep.
  if (chart) { chart.dispose(); chart = null; }
  main.querySelector('.mockbar p').textContent = sampleNote();
  document.querySelectorAll('[data-destination]').forEach(nav => {
    if (nav.dataset.destination === destination) nav.setAttribute('aria-current', 'page');
    else nav.removeAttribute('aria-current');
  });
  if (!source || !verify || loadError) page.innerHTML = failure();
  else if (destination === 'day') page.innerHTML = day();
  else if (destination === 'changes') page.innerHTML = changes();
  else if (scene === 'error') page.innerHTML = failure();
  else if (scene === 'history') page.innerHTML = historicalRecord();
  else if (isTrialScene()) page.innerHTML = trialBrief();
  else if (scene === 'quiet' && destination === 'overview') page.innerHTML = quiet();
  else page.innerHTML = investigation();
  const canvas = page.querySelector('#episode-chart');
  if (canvas) chart = renderEpisodeChart(canvas, currentEpisode(), stepIndex);
  bindControls();
}
function bindControls() {
  page.querySelectorAll('[data-action]').forEach(control => { control.onclick = () => action(control.dataset.action); });
  page.querySelectorAll('[data-episode]').forEach(control => { control.onclick = () => {
    episodeId = control.dataset.episode; stepIndex = 0; render();
    announce(`Selected ${date(currentEpisode().start)}. The evidence remains thin.`);
  }; });
  page.querySelectorAll('[data-step]').forEach(control => { control.onclick = () => {
    stepIndex = Number(control.dataset.step);
    page.querySelectorAll('[data-step]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.step) === stepIndex)));
    page.querySelector('#step-detail').innerHTML = stepDetail(currentEpisode());
    chart.selectStep(stepIndex);
    announce(`Step ${stepIndex + 1}. ${currentEpisode().steps[stepIndex].evidence_tier === 'observed' ? 'Observed' : 'Inferred'}.`);
  }; });
  const asideForm = page.querySelector('#aside-form');
  if (asideForm) asideForm.onsubmit = event => {
    event.preventDefault();
    asideReason = page.querySelector('#aside-reason').value.trim();
    asideOpen = false; destination = 'overview'; render();
    announce('Concern set aside in this preview. Reloading resets the choice.');
  };
  const form = page.querySelector('#conclusion-form');
  if (form) {
    form.onchange = () => {
      conclusion = form.querySelector('input:checked')?.value || '';
      page.querySelector('#finish-review').disabled = !conclusion;
    };
    page.querySelector('#conclusion-note').oninput = event => { conclusionNote = event.target.value; };
    form.onsubmit = event => {
      event.preventDefault();
      if (!conclusion || currentTrial().state !== 'complete') return;
      finished = { trialId:READY_ID, conclusion, note:conclusionNote.trim() };
      selectScenario('history'); destination = 'changes'; evidenceOpen = false; render();
      main.scrollTop = 0;
      announce('Review finished in memory. The historical ending is illustrative and resets on reload.');
    };
  }
  const dayPicker = page.querySelector('#trial-day');
  if (dayPicker) dayPicker.onchange = event => { selectedTrialDay = event.target.value; render(); };
}
async function action(name) {
  if (name === 'overview' || name === 'explore') { moveTo(name); return; }
  if (name === 'open-day') { moveTo('day'); return; }
  if (name === 'return-day') { moveTo(dayReturn); return; }
  if (name === 'history') { selectScenario('history'); destination = 'changes'; evidenceOpen = false; render(); return; }
  if (name === 'inspect') { evidenceOpen = true; destination = 'explore'; render(); }
  if (name === 'done-inspecting') { evidenceOpen = false; destination = 'overview'; render(); announce('Episode inspected. The evidence remains thin.'); }
  if (name === 'occurrences') { occurrencesOpen = !occurrencesOpen; render(); }
  if (name === 'next-episode') {
    const occurrences = source.scenarios.low_confidence[0].occurrences;
    episodeId = occurrences[(occurrences.indexOf(episodeId) + 1) % occurrences.length];
    stepIndex = 0; occurrencesOpen = true; render();
  }
  if (name === 'aside') { asideOpen = true; render(); page.querySelector('#aside-reason').focus(); }
  if (name === 'cancel-aside') { asideOpen = false; render(); }
  if (name === 'undo-aside') { asideReason = null; render(); announce('Set-aside choice removed in this preview.'); }
  if (name === 'toggle-evidence') {
    if (destination === 'explore' && scene !== 'history') { destination = 'overview'; evidenceOpen = false; }
    else evidenceOpen = !evidenceOpen;
    render();
  }
  if (name === 'checks') { checksOpen = !checksOpen; render(); }
  if (name === 'inspect-checks') { evidenceOpen = true; checksOpen = true; render(); page.querySelector('#treatment-context').scrollIntoView({ block:'nearest' }); }
  if (name === 'retry') {
    page.innerHTML = '<article class="gb-brief"><h1>Loading the assessment…</h1></article>';
    try { await loadInputs(); selectScenario('investigate'); destination = 'overview'; render(); announce('Synthetic investigation loaded.'); }
    catch { render(); }
  }
}
async function loadInputs() {
  try {
    [source, verify] = await Promise.all([loadCapture('harmonic-v2'), loadCapture('verify')]);
    episodeId = episodeId || source.scenarios.low_confidence[0].hero_episode;
    loadError = null;
  } catch (error) { loadError = error; throw error; }
}
document.querySelectorAll('[data-destination]').forEach(nav => { nav.onclick = () => moveTo(nav.dataset.destination); });
page.innerHTML = '<article class="gb-brief"><h1>Loading the assessment…</h1></article>';
try { await loadInputs(); } catch { /* The failed-read state supplies retry. */ }
render();
