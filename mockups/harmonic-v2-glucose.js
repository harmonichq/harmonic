// Design exploration only. Reads the two shared synthetic captures.
// All choices and new ending snapshots below are in-memory mock interactions.
import { renderShell, renderMockBar, loadCapture, resolveColors, renderEpisodeChart, escapeText } from './_shell.js';

const main = renderShell();
const surface = document.createElement('div');
surface.className = 'gf';
const colors = resolveColors();
surface.style.setProperty('--gf-observed', colors.observed);
surface.style.setProperty('--gf-inferred', colors.inferred);
let state = renderMockBar(main, 'Glucose first', changeScenario);
main.append(surface);
let destination = state === 'history' ? 'changes' : 'overview';
let capture, verify, chart;
let selectedEpisode, selectedStep = 0;
let dayReturn = null, setAside = null, showAsideForm = false;
let evidenceMode = 'summary', evidencePeriod = 'trial_period', evidenceDay = 0;
let conclusion = '', conclusionNote = '', finished = null;
const activeId = 'profile-all-20260623233000';
const readyId = 'carb_ratio-all-20260607081500';
const e = escapeText;
const clock = value => value.slice(11, 16);
const date = value => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
const stamp = value => `${date(value)} · ${clock(value)}`;
const shortDate = value => new Date(value.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const period = value => `${stamp(value.start)} to ${stamp(value.end)}`;
const pct = value => `${value.toFixed(1)}%`;
const episode = () => capture.scenarios.episodes[selectedEpisode];
const concern = () => capture.scenarios.low_confidence[0];
const currentTrial = () => verify.details[state === 'active' ? activeId : readyId].selected;

for (const button of document.querySelectorAll('[data-destination]')) {
  button.addEventListener('click', () => {
    if (button.dataset.destination === 'day') dayReturn = null;
    navigate(button.dataset.destination);
  });
}

function navigate(next) {
  if (['active', 'ready'].includes(state) && next === 'explore') evidenceMode = 'daily';
  if (next === 'overview') evidenceMode = 'summary';
  destination = next;
  render();
  main.scrollTop = 0;
}

function changeScenario(next) {
  state = next;
  destination = next === 'history' ? 'changes' : 'overview';
  evidenceMode = 'summary';
  dayReturn = null;
  showAsideForm = false;
  render();
  main.scrollTop = 0;
}

function syncScenario(next) {
  state = next;
  const select = main.querySelector('.mockbar select');
  select.value = next;
  const url = new URL(location.href);
  url.searchParams.set('state', next);
  history.replaceState(null, '', url);
}

function dispose() {
  chart?.dispose();
  chart = null;
}

function loading() {
  dispose();
  surface.innerHTML = '<div role="status" aria-label="Loading synthetic evidence"><div class="gf-skeleton"></div><div class="gf-skeleton canvas"></div></div>';
}

async function load(retry = false) {
  loading();
  try {
    [capture, verify] = await Promise.all([loadCapture('harmonic-v2'), loadCapture('verify')]);
    selectedEpisode ||= concern().hero_episode;
    if (retry) syncScenario('investigate');
    render();
  } catch {
    dispose();
    surface.innerHTML = errorView();
    bind();
  }
}

function render() {
  dispose();
  for (const button of document.querySelectorAll('[data-destination]')) {
    if (button.dataset.destination === destination) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  if (!capture || !verify) return;
  if (state === 'error') surface.innerHTML = errorView();
  else if (destination === 'day') surface.innerHTML = investigation(true);
  else if (destination === 'changes' && state === 'investigate') surface.innerHTML = noChangeView();
  else if (state === 'history') surface.innerHTML = destination === 'overview' ? quietView(Boolean(finished)) : destination === 'explore' ? historicalEvidenceView() : historyView();
  else if (state === 'quiet') surface.innerHTML = destination === 'changes' ? historyView() : destination === 'explore' ? investigation() : quietView();
  else if (state === 'active' || state === 'ready') surface.innerHTML = trialView();
  else if (setAside && destination === 'overview') surface.innerHTML = quietView();
  else surface.innerHTML = investigation();
  bind();
  const chartNode = surface.querySelector('[data-episode-chart]');
  if (chartNode) {
    try { chart = renderEpisodeChart(chartNode, episode(), selectedStep); }
    catch { chartNode.innerHTML = '<div class="gf-empty"><h2>The glucose chart could not load</h2><p>The selected episode is unchanged.</p><button data-action="retry-chart">Retry chart</button></div>'; bind(); }
  }
}

function episodeButtons() {
  return concern().occurrences.map(id => {
    const item = capture.scenarios.episodes[id];
    return `<button data-episode="${e(id)}" aria-pressed="${selectedEpisode === id}">${e(shortDate(item.start))}${id === concern().hero_episode ? ' · representative' : ''}</button>`;
  }).join('');
}

function momentCopy() {
  const item = episode();
  const step = item.steps[selectedStep];
  const reading = item.window.cgm.find(row => row.t === step.t);
  if (selectedStep === 0) return `<h3><span class="gf-tier inferred">Inferred</span>Rising at the bolus</h3><p>A bolus is recorded at ${e(clock(step.t))}. Glucose was already rising. Eating time is not recorded here, so the timing of the meal remains uncertain.</p>`;
  if (selectedStep === 1) return `<h3><span class="gf-tier">Observed</span>Glucose peak</h3><p>The recorded glucose peak was ${e(reading.bg)} mg/dL at ${e(clock(step.t))}. This observation does not tell us what caused the rise.</p>`;
  return `<h3><span class="gf-tier">Observed</span>Later reading</h3><p>Glucose was ${e(reading.bg)} mg/dL at ${e(clock(step.t))}. Compare the other occurrence before drawing a conclusion about a habit.</p>`;
}

function investigation(isDay = false) {
  const item = episode();
  const window = capture.scenarios.window;
  const c = concern().confidence;
  const isIndependentDay = isDay && ['active','ready','history'].includes(state);
  // Mock-only note: the two fixture families do not form one causal journey.
  const sourceNote = isIndependentDay ? '<p class="gf-demo-note">Separate synthetic day example. These meal episodes are unrelated to the Trial example.</p>' : '';
  const asideNote = setAside ? `<div class="gf-notice">Set aside for this preview.${setAside.reason ? ` Reason: ${e(setAside.reason)}` : ''} <button class="gf-link" data-action="bring-back">Bring back to Overview</button></div>` : '';
  const lead = isDay
    ? `${dayReturn ? '<button class="gf-link gf-return" data-action="return">← Return to the same concern</button>' : ''}<div class="gf-lead"><div><span class="gf-state neutral">Day · episode window</span><h1>${e(date(item.start))}</h1><div class="gf-meta">${e(clock(item.window.start))}–${e(clock(item.window.end))} · pump-local time</div></div></div>`
    : `<div class="gf-lead"><div><span class="gf-state">Guided investigation · thin evidence</span><h1>Glucose was rising when the bolus arrived</h1><div class="gf-meta">${e(c.k)} of ${e(c.n)} meals flagged · ${e(shortDate(window.start))}–${e(date(window.end))} · a specific change is not supported</div></div>${!setAside ? '<button data-action="aside-form">Set aside</button>' : ''}</div>`;
  return `${sourceNote}${asideNote}${lead}${showAsideForm ? asideForm() : ''}
    <section class="gf-canvas" aria-label="Selected episode">
      <div class="gf-canvas-top"><h2>${e(date(item.start))} · ${e(clock(item.start))}</h2><div class="gf-occurrences" aria-label="Occurrences">${episodeButtons()}</div></div>
      <div class="gf-legend" aria-label="Chart legend"><span><i class="gf-dot"></i>Glucose · mg/dL</span><span><i class="gf-dot bolus"></i>Bolus · U</span><span><i class="gf-dot carbs"></i>Carbs · g</span><span><i class="gf-dash"></i>70 / 180</span><span>Pump-local time</span></div>
      <div class="gf-chart" data-episode-chart role="img" aria-label="Glucose and bolus trace for ${e(date(item.start))}. Select a numbered moment below for its evidence."></div>
      <div class="gf-steps" aria-label="Episode moments">${item.steps.map((step, i) => `<button data-step="${i}" aria-pressed="${selectedStep === i}"><span class="gf-step-number">${i+1}</span><span><span class="gf-step-label">${['Rising at bolus','Glucose peak','Later reading'][i]}</span><span class="gf-step-time">${e(clock(step.t))} · ${step.evidence_tier === 'inferred' ? 'Inferred' : 'Observed'}</span></span></button>`).join('')}</div>
    </section>
    <div class="gf-moment"><div data-moment-copy aria-live="polite">${momentCopy()}</div><button class="primary" data-action="next-moment">${selectedStep < item.steps.length - 1 ? 'Next moment →' : 'Compare occurrence →'}</button></div>
    <div class="gf-stopping"><p>Useful next step: compare these two occurrences.<br><span class="gf-meta">Thin evidence supports a closer look, not a setting or habit recommendation.</span></p>${!isDay ? '<button data-action="open-day">Open this moment in Day →</button>' : ''}</div>${destination === 'explore' ? investigationDetail() : ''}`;
}

function investigationDetail() {
  const bolus = episode().window.boluses[0];
  return `<section class="gf-snapshot"><h2>What is known and missing</h2><dl><dt>Observed at ${e(clock(bolus.t))}</dt><dd>${e(bolus.insulin)} U bolus. ${e(bolus.carbs)} g recorded with the bolus.</dd><dt>Not recorded</dt><dd>When eating began. The dose record does not establish meal timing.</dd><dt>Available support</dt><dd>${e(concern().confidence.k)} of ${e(concern().confidence.n)} meals flagged. This concern remains thin evidence.</dd></dl></section>`;
}

function asideForm() {
  return `<form class="gf-inline-form" data-form="aside"><label for="aside-reason">Reason (optional)</label><textarea id="aside-reason" placeholder="What makes this less useful to work on?"></textarea><div class="gf-actions"><button type="submit" class="primary">Set aside</button><button type="button" data-action="cancel-aside">Cancel</button></div><p class="gf-meta">This preview keeps your choice in memory. The evidence remains in Explore.</p></form>`;
}

function periodHeader(trial) {
  return `<div class="gf-periods"><div><strong>Before</strong><div class="gf-meta">${e(period(trial.before_period))}</div></div><div><strong>Trial</strong><div class="gf-meta">${e(period(trial.trial_period))}</div></div></div><p class="gf-meta">Pump-local time. Observations are limited to these periods.</p>`;
}

function evidenceTable(trial) {
  const arc = trial.evidence.find(item => item.key === 'arc');
  const tir = trial.evidence.find(item => item.key === 'tir');
  const tbr = trial.evidence.find(item => item.key === 'tbr');
  const row = (title, a, b, aNote, bNote, target = false) => `<tr class="${target ? 'gf-target' : ''}"><td>${title}</td><td>${a}<small>${aNote}</small></td><td>${b}<small>${bNote}</small></td></tr>`;
  return `<table class="gf-table"><thead><tr><th scope="col">Glucose observations</th><th scope="col">Before</th><th scope="col">Trial</th></tr></thead><tbody>
    ${row('Meal glucose peak', `${e(arc.before.peak)} mg/dL`, `${e(arc.trial.peak)} mg/dL`, `${e(arc.before.n_peak)} meals`, `${e(arc.trial.n_peak)} meals`, true)}
    ${row('Meal glucose low point', `${e(arc.before.nadir)} mg/dL`, `${e(arc.trial.nadir)} mg/dL`, `${e(arc.before.n_nadir)} meals`, `${e(arc.trial.n_nadir)} meals`, true)}
    ${row('Time in range', pct(tir.before.value), pct(tir.trial.value), `${e(tir.before.n_readings)} readings`, `${e(tir.trial.n_readings)} readings`)}
    ${row('Time below range', pct(tbr.before.value), pct(tbr.trial.value), `${e(tbr.before.n_readings)} readings`, `${e(tbr.trial.n_readings)} readings`)}
    ${row('Logged rescue carbs', `${e(trial.rescue.before_period.n)} entries`, `${e(trial.rescue.trial_period.n)} entries`, `${e(trial.rescue.before_period.grams)} g · ${e(trial.rescue.before_period.n_unknown)} unknown amounts`, `${e(trial.rescue.trial_period.grams)} g · ${e(trial.rescue.trial_period.n_unknown)} unknown amounts`)}
    </tbody></table>`;
}

function dailyEvidence(trial) {
  const rows = trial.day_rows[evidencePeriod];
  const index = Math.min(evidenceDay, rows.length - 1);
  const row = rows[index];
  return `<div class="gf-day-select"><label>Period <select data-select="evidence-period"><option value="before_period" ${evidencePeriod === 'before_period' ? 'selected' : ''}>Before</option><option value="trial_period" ${evidencePeriod === 'trial_period' ? 'selected' : ''}>Trial</option></select></label><label>Available day <select data-select="evidence-day">${rows.map((item,i)=>`<option value="${i}" ${index === i ? 'selected' : ''}>${e(date(item.date))}</option>`).join('')}</select></label></div><div class="gf-day-read" aria-live="polite"><strong>${e(date(row.date))} · ${e(row.n_readings)} glucose readings</strong>${e(pct(row.tir))} in range · ${e(pct(row.tbr))} below range · ${e(row.meals)} meals<p class="gf-meta">A day with readings is not necessarily a complete day of data. The Trial’s maturity stays unchanged.</p></div>`;
}

function trialView() {
  const trial = currentTrial();
  const active = state === 'active';
  const progress = trial.maturing;
  const title = active ? 'Your profile change is gathering evidence' : 'Your carb ratio Trial is ready to judge';
  // Mock-only context, outside the proposed product content.
  return `<p class="gf-demo-note">Separate synthetic Trial example. This change is unrelated to the meal investigation.</p>
    <div class="gf-lead"><div><span class="gf-state ${active ? '' : 'neutral'}">${e(trial.readiness.label)}</span><h1>${title}</h1><div class="gf-meta">Detected ${e(stamp(trial.changed_at))} · ${active ? 'basal, correction factor and carb ratio changed' : `${e(trial.before)} → ${e(trial.after)} g/U`}</div></div>${destination !== 'changes' ? '<button data-action="open-changes">Open change →</button>' : ''}</div>
    <div class="gf-progress"><div class="gf-progress-line"><strong>${active ? `${e(progress.days_elapsed)} of ${e(progress.days_required)} days` : `${e(progress.days_elapsed)} days elapsed`} · ${e(trial.readiness.label)}</strong><span class="gf-meta">${e(progress.gap_count)} data ${progress.gap_count === 1 ? 'gap' : 'gaps'}</span></div><progress value="${progress.days_elapsed}" max="${progress.days_required}" aria-label="${e(progress.days_elapsed)} of ${e(progress.days_required)} days of Trial progress"></progress><p>${e(trial.readiness.message)}</p>${active ? '<p class="gf-meta">A change is already being watched, so nothing new starts until it finishes.</p>' : ''}</div>
    ${destination === 'changes' ? detectedSettings(trial) : ''}
    <div class="gf-evidence-head"><h2>${active ? 'Glucose while you wait' : 'Review the glucose observations'}</h2><div class="gf-switch" aria-label="Evidence view"><button data-mode="summary" aria-pressed="${evidenceMode === 'summary'}">Comparison</button><button data-mode="daily" aria-pressed="${evidenceMode === 'daily'}">Available days</button></div></div>
    ${periodHeader(trial)}${evidenceMode === 'summary' ? evidenceTable(trial) : dailyEvidence(trial)}
    <div class="gf-limits">${trial.limits.map(text => `<p>${e(text)}</p>`).join('')}</div>
    ${!active ? reviewForm() : `<div class="gf-stopping"><p>Continue following the detected change.<br><span class="gf-meta">Evidence through ${e(stamp(trial.trial_period.end))}. No verdict is ready.</span></p><button data-action="inspect-days">Inspect available days →</button></div>`}`;
}

function detectedSettings(trial) {
  const names = { basal_rate:'Basal', isf:'Correction factor', carb_ratio:'Carb ratio' };
  const value = (parameter,n) => parameter === 'basal_rate' ? `${n} U/h` : parameter === 'isf' ? `1 U : ${n} mg/dL` : `${n} g/U`;
  return `<details class="gf-snapshot"><summary>Detected settings change</summary><p class="gf-meta">Observed on the pump. An earlier Plan decision is not available in this capture.</p><table class="gf-table"><thead><tr><th scope="col">Setting</th><th scope="col">Before</th><th scope="col">Detected</th></tr></thead><tbody>${trial.changes.map(change => `<tr><td>${names[change.parameter]}${change.slots_changed ? `<small>${e(change.slots_changed)} time slots changed${change.uniform ? ' · uniform' : ` · values shown at ${e(change.slot)}`}</small>` : ''}</td><td>${e(value(change.parameter,change.before))}</td><td>${e(value(change.parameter,change.after))}</td></tr>`).join('')}</tbody></table></details>`;
}

function reviewForm() {
  return `<form class="gf-review" data-form="finish"><h2>Record your conclusion</h2><p>Finishing ends this watch. It does not change the pump setting or show that the setting caused an outcome.</p><label for="conclusion">Your conclusion</label><select id="conclusion" required><option value="">Choose a conclusion</option>${['No clear difference in these observations','Worth discussing with my clinician','I cannot judge from this evidence'].map(text => `<option ${conclusion === text ? 'selected' : ''}>${e(text)}</option>`).join('')}</select><label for="conclusion-note">Note (optional)</label><textarea id="conclusion-note" placeholder="What do you want to remember?">${e(conclusionNote)}</textarea><div class="gf-actions"><button type="submit" class="primary" ${conclusion ? '' : 'disabled'}>Record conclusion &amp; finish</button></div><p class="gf-meta">Illustrative action. The ending is kept in memory for this preview.</p></form>`;
}

function historyView() {
  const trial = finished?.trial || verify.details[readyId].selected;
  return `<p class="gf-demo-note">Historical record preview. The comparison is generated evidence; a new ending is illustrative and held only in memory.</p><div class="gf-lead"><div><span class="gf-state neutral">${finished ? 'Finished in this preview' : 'Historical snapshot example'}</span><h1>Carb ratio · ${e(trial.before)} → ${e(trial.after)} g/U</h1><div class="gf-meta">Detected ${e(stamp(trial.changed_at))} · pump-local time</div></div><button data-action="overview">Back to Overview</button></div>
    <section class="gf-snapshot"><h2>Original context</h2><dl><dt>Observed change</dt><dd>${e(trial.before)} → ${e(trial.after)} g/U on ${e(date(trial.changed_at))}</dd><dt>Earlier decision</dt><dd>Not recorded in the available source.</dd><dt>Original explanation</dt><dd>Not recorded. This comparison cannot reconstruct what was known before the change.</dd></dl></section>
    <section class="gf-snapshot"><h2>Ending</h2><dl><dt>Conclusion</dt><dd>${finished ? e(finished.conclusion) : 'No stored conclusion is available.'}</dd><dt>Finished</dt><dd>${finished ? e(finished.endedAt) + ' · browser-local time · preview interaction' : 'No stored ending time is available.'}</dd>${finished?.note ? `<dt>Your note</dt><dd>${e(finished.note)}</dd>` : ''}<dt>Evidence</dt><dd>${finished ? 'Snapshot retained at this preview’s finish action.' : 'Available comparison shown separately below.'} Observational differences do not establish causation.</dd></dl></section>
    <section class="gf-snapshot"><h2>${finished ? 'Ending snapshot' : 'Available comparison'}</h2>${periodHeader(trial)}${evidenceTable(trial)}</section>`;
}

function historicalEvidenceView() {
  const trial = finished?.trial || verify.details[readyId].selected;
  return `<p class="gf-demo-note">Historical evidence preview. No new assessment is calculated.</p><div class="gf-lead"><div><span class="gf-state neutral">Explore · historical comparison</span><h1>Glucose during the carb ratio Trial</h1><div class="gf-meta">${e(trial.before)} → ${e(trial.after)} g/U · detected ${e(stamp(trial.changed_at))}</div></div><button data-action="open-changes">Return to the change record</button></div>${periodHeader(trial)}${evidenceTable(trial)}<div class="gf-limits">${trial.limits.map(text => `<p>${e(text)}</p>`).join('')}</div>`;
}

function quietView(afterFinish = false) {
  const isAside = Boolean(setAside) && !afterFinish;
  return `<div class="gf-empty"><span class="gf-state neutral">${afterFinish ? 'Follow-up finished' : isAside ? 'Set aside' : 'Quiet'}</span><h1>${afterFinish ? 'Your conclusion is in the preview record' : isAside ? 'This concern is set aside' : 'No supported priority needs action'}</h1><p>${afterFinish ? 'The active slot is free in this illustration. Return to the record to see the ending and its evidence.' : isAside ? 'No other supported action remains in this example. You can still inspect the same episodes in Explore.' : 'There is no active change or supported next action in this quiet-state example. Day and previous changes remain available.'}</p>${isAside && setAside.reason ? `<p>Reason: ${e(setAside.reason)}</p>` : ''}<div class="gf-actions">${isAside ? '<button class="primary" data-action="explore">Revisit this concern</button><button data-action="bring-back">Bring back to Overview</button>' : '<button class="primary" data-action="open-changes">View change record</button><button data-action="direct-day">Open Day</button>'}</div><p class="gf-meta">${afterFinish || isAside ? 'Choices in this preview are held in memory.' : 'Illustrative quiet state. This is separate from thin evidence and a failed read.'}</p></div>`;
}

function noChangeView() {
  return `<div class="gf-empty"><span class="gf-state neutral">Changes</span><h1>No change is underway in this example</h1><p>The meal episodes have thin evidence. They support investigation, without an eligible setting or habit change to start.</p><button class="primary" data-action="explore">Return to the glucose evidence →</button></div>`;
}

function errorView() {
  return '<div class="gf-empty" role="alert"><span class="gf-state">Evidence unavailable</span><h1>The glucose evidence could not be loaded</h1><p>A failed read does not mean there is nothing to investigate. Retry to load the evidence again.</p><div class="gf-actions"><button class="primary" data-action="retry">Retry evidence</button></div><p class="gf-meta">No new result is shown.</p></div>';
}

function bind() {
  for (const button of surface.querySelectorAll('[data-episode]')) button.onclick = () => {
    selectedEpisode = button.dataset.episode;
    render();
  };
  for (const button of surface.querySelectorAll('[data-step]')) button.onclick = () => selectMoment(Number(button.dataset.step));
  for (const button of surface.querySelectorAll('[data-mode]')) button.onclick = () => {
    evidenceMode = button.dataset.mode;
    render();
  };
  for (const button of surface.querySelectorAll('[data-action]')) button.onclick = () => {
    const action = button.dataset.action;
    if (action === 'retry') { destination = 'overview'; load(true); }
    else if (action === 'retry-chart') render();
    else if (action === 'aside-form') { showAsideForm = true; render(); surface.querySelector('#aside-reason').focus(); }
    else if (action === 'cancel-aside') { showAsideForm = false; render(); }
    else if (action === 'bring-back') { setAside = null; navigate('overview'); }
    else if (action === 'open-changes') navigate('changes');
    else if (action === 'explore') navigate('explore');
    else if (action === 'overview') navigate('overview');
    else if (action === 'direct-day') { dayReturn = null; navigate('day'); }
    else if (action === 'open-day') { dayReturn = destination; navigate('day'); }
    else if (action === 'return') { const back = dayReturn; dayReturn = null; navigate(back); }
    else if (action === 'inspect-days') { evidenceMode = 'daily'; render(); surface.querySelector('[data-select="evidence-day"]').focus(); }
    else if (action === 'next-moment') {
      if (selectedStep < episode().steps.length - 1) selectMoment(selectedStep + 1);
      else {
        const ids = concern().occurrences;
        selectedEpisode = ids[(ids.indexOf(selectedEpisode) + 1) % ids.length];
        selectedStep = 0;
        render();
      }
    }
  };
  const asideForm = surface.querySelector('[data-form="aside"]');
  if (asideForm) asideForm.onsubmit = event => {
    event.preventDefault();
    setAside = { reason:surface.querySelector('#aside-reason').value.trim() };
    showAsideForm = false;
    navigate('overview');
  };
  const selectedConclusion = surface.querySelector('#conclusion');
  if (selectedConclusion) selectedConclusion.onchange = event => {
    conclusion = event.target.value;
    surface.querySelector('[data-form="finish"] button[type="submit"]').disabled = !conclusion;
  };
  const note = surface.querySelector('#conclusion-note');
  if (note) note.oninput = event => { conclusionNote = event.target.value; };
  const finishForm = surface.querySelector('[data-form="finish"]');
  if (finishForm) finishForm.onsubmit = event => {
    event.preventDefault();
    // The ready case already carries the producer's readiness. This is no backend
    // finish/admission implementation, and no pump setting or real record changes.
    finished = { trial:structuredClone(currentTrial()), conclusion, note:conclusionNote.trim(), endedAt:new Date().toLocaleString() };
    syncScenario('history');
    navigate('changes');
  };
  const periodSelect = surface.querySelector('[data-select="evidence-period"]');
  if (periodSelect) periodSelect.onchange = event => { evidencePeriod = event.target.value; evidenceDay = 0; render(); };
  const daySelect = surface.querySelector('[data-select="evidence-day"]');
  if (daySelect) daySelect.onchange = event => { evidenceDay = Number(event.target.value); render(); };
}

function selectMoment(index) {
  selectedStep = index;
  chart?.selectStep(index);
  for (const button of surface.querySelectorAll('[data-step]')) button.setAttribute('aria-pressed', String(Number(button.dataset.step) === index));
  surface.querySelector('[data-moment-copy]').innerHTML = momentCopy();
  surface.querySelector('[data-action="next-moment"]').textContent = index < episode().steps.length - 1 ? 'Next moment →' : 'Compare occurrence →';
}

window.addEventListener('pagehide', dispose);
load();
