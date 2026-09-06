// Glucose first, round 3c (#348). Unlocked design exploration: the supported
// setting journey, on the same desk as the meals investigation. The shipped Plan
// module builds the schedule and reconciles it against a captured pump profile;
// the shipped basal evidence chart draws the roster; the shipped Day builder draws
// a night. Staging, draft, decision, conclusion and set-aside live only in this
// page's memory: v2 persistence for them is proposed, not implemented
// (setting.json `_note`). Review controls in the mock bar move a manufactured
// clock and choose a captured pump profile; nothing here fetches or programs.
import { buildDeliverable, collapseDeliverable, reconcileDeliverable, formatStartMin, PLAN_PARAMS } from '../frontend/plan.js';
import { TIER } from '../frontend/diagnose-findings-queue.js';
import { DIAGNOSE_EVIDENCE_CHARTS } from '../frontend/diagnose-evidence-charts.js';
import { buildHeroOption, HERO } from '../frontend/day-hero-chart.js';

// The shipped night roster's group words (diagnose-workstation.js NIGHT_GROUP_LABEL)
// and its grouping by the analyzer's served sign.
const NIGHT_GROUP_LABEL = { above: 'Ran above', below: 'Ran below', set: 'Ran as set', unprogrammed: 'No programmed rate' };
const nightGroup = night => (night.sign === 1 ? 'above' : night.sign === -1 ? 'below' : Number.isFinite(night.programmed_rate) ? 'set' : 'unprogrammed');
const SETTING_NAME = { basal_rate: 'Basal', isf: 'Correction factor', carb_ratio: 'Carb ratio', target_bg: 'Target' };
// Deliverable heads in PLAN_PARAMS order, in the approved user copy (DESIGN.md:
// Correction factor, Carb ratio; the carb-ratio unit is the shipped chart's).
const PLAN_HEAD = { basal_rate: 'Basal (U/h)', isf: 'Correction factor', carb_ratio: 'Carb ratio (g/U)', target_bg: 'Target (mg/dL)' };
// A correction factor reads insulin first (CONTEXT.md); the number is the served one.
const userValue = (param, value) => (value == null || value === '' ? '' : param === 'isf' ? `1 U : ${value} mg/dL` : String(value));
const hhmm = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const PROFILE_SEGMENTS = 16;

export function createSettingJourney(kit) {
  const { surface, mockbar, colors, narrow, view, e, clock, date, shortDate, stamp, period } = kit;
  let data = null;
  // review controls: the manufactured clock, the Jun 13 capture, the next save's fate
  let station = 'before', capture = 'confirmed', saveFails = false;
  let night = null, slot = null, figure = 'night', seat = 'basal';
  let charts = [], observers = [];
  // page memory: what the wearer did on this desk, in this page
  const memory = { staged: false, draft: null, decision: null, rekeyed: null, record: null, aside: null, error: null, flash: null };

  /* ---- served material ------------------------------------------------------ */
  const finding = () => data.finding;
  // The finding spans two served analyzer rows (03:00 and 03:30); the reader
  // inspects one at a time, and the staged action keeps the whole approved hour.
  const analyzerRows = () => data.basal.filter(row => row.slot * 30 >= finding().span.start_min && row.slot * 30 < finding().span.end_min);
  const analyzerRow = () => analyzerRows().find(row => row.slot === slot) || analyzerRows()[0];
  const rowRange = row => ({ start_min: row.slot * 30, end_min: row.slot * 30 + 30, label: `${hhmm(row.slot * 30)}–${hhmm(row.slot * 30 + 30)}` });
  const roster = () => analyzerRow().evidence.night_roster;
  const selectedNight = () => roster().find(row => row.date === night) || roster()[0];
  const change = () => ({ current: analyzerRow().current, recommended: analyzerRow().recommended });
  const changeText = () => `${change().current} → ${change().recommended} U/h`;
  const stationOf = () => STATIONS()[station];
  // Review clocks are the generator's own: the draft and decision stamps, the
  // capture, and the two times review_trials was actually run (reviewed_at).
  const STATIONS = () => ({
    before: { now: data.draft.updated_at, label: `${stamp(data.draft.updated_at)} · before the decision` },
    captured: { now: data.detected.captured_at, label: `${stamp(data.detected.captured_at)} · pump captured` },
    trial: { now: data.reviewed_at.active, trial: 'active', label: `${shortDate(data.reviewed_at.active)} · Trial, ${data.trials.active.selected.maturing.days_elapsed} of ${data.trials.active.selected.maturing.days_required} days` },
    ready: { now: data.reviewed_at.ready, trial: 'ready', label: `${shortDate(data.reviewed_at.ready)} · Trial, ready to judge` },
  });
  const trial = () => (stationOf().trial ? data.trials[stationOf().trial].selected : null);
  // The Jun 13 capture is chosen by a review control; the Trial that follows is the
  // as-planned one, so the later stations read that capture.
  const capturedProfile = () => (station === 'before' ? null : data.detected[station === 'captured' ? capture : 'confirmed']);
  const rows = () => collapseDeliverable(buildDeliverable({ activeProfile: data.active_profile, acceptedItems: data.accepted_items }));
  const reconcile = () => reconcileDeliverable(rows(), capturedProfile()?.segments || null, capturedProfile() ? data.detected.captured_at : null, !!memory.decision);
  const onPumpAt = () => (memory.decision && station !== 'before' ? reconcileDeliverable(rows(), data.detected.confirmed.segments, data.detected.captured_at, true).matchedAt : null);
  // Mirror of the served basal night evidence (ciq_autotune/basal_night_evidence.py)
  // from the analyzer row, for the shipped editorial chart.
  const chartData = () => {
    const row = analyzerRow();
    return {
      slot: row.slot, asserts_move: row.asserts_move, safety_status: row.safety_status, current: row.current,
      recommended: row.recommended, estimate: row.estimate, roster_count: roster().length,
      roster_glucose_mean: row.evidence.roster_glucose_mean, directional_support_count: row.evidence.directional_support_count,
      excluded_night_count: row.evidence.excluded_night_count,
      nights: roster().map(({ date: day, delivered_rate, programmed_rate, sign }) => ({ date: day, delivered_rate, programmed_rate, sign })),
    };
  };
  const slotSpan = () => rowRange(analyzerRow()).label;
  const rowSeg = () => `<div class="seg" role="group" aria-label="Basal row">${analyzerRows().map(row => `<button data-slot="${row.slot}" aria-pressed="${row.slot === analyzerRow().slot}">${e(rowRange(row).label)}</button>`).join('')}</div>`;

  /* ---- review controls, outside product chrome ------------------------------ */
  function controls() {
    if (mockbar.querySelector('.gf-review')) return;
    const params = new URLSearchParams(location.search);
    if (STATIONS()[params.get('clock')]) station = params.get('clock');
    if (['confirmed', 'mismatch'].includes(params.get('capture'))) capture = params.get('capture');
    mockbar.querySelector('p').insertAdjacentHTML('beforebegin', `<span class="gf-review" role="group" aria-label="Review controls">
      <label>Clock <select aria-label="Manufactured clock">${Object.entries(STATIONS()).map(([key, item]) => `<option value="${key}" ${key === station ? 'selected' : ''}>${e(item.label)}</option>`).join('')}</select></label>
      <label>Pump capture <select aria-label="Pump capture"><option value="confirmed">As planned</option><option value="mismatch" ${capture === 'mismatch' ? 'selected' : ''}>Mis-keyed 0.5 U/h at 03:00</option></select></label>
      <label><input type="checkbox" aria-label="Next save fails"> Next save fails</label></span>`);
    const sync = (key, value) => { const url = new URL(location.href); url.searchParams.set(key, value); history.replaceState(null, '', url); };
    mockbar.querySelector('[aria-label="Manufactured clock"]').onchange = event => { station = event.target.value; sync('clock', station); view.sheetOpen = false; kit.render(); };
    mockbar.querySelector('[aria-label="Pump capture"]').onchange = event => { capture = event.target.value; sync('capture', capture); kit.render(); };
    mockbar.querySelector('[aria-label="Next save fails"]').onchange = event => { saveFails = event.target.checked; };
  }

  /* ---- frames ----------------------------------------------------------------- */
  function frame(destination) {
    if (destination === 'day' || destination === 'explore') return priorityFrame();
    if (memory.record) return recordFrame();
    if (trial()) return trialFrame();
    if (destination === 'changes') return memory.staged ? planFrame() : kit.emptyFrame('Changes', 'No change underway', `${e(finding().title)} is supported and can be staged.`, '<button class="gf-btn primary" data-set="stage">Stage change</button>');
    if (memory.aside) return kit.emptyFrame('Overview', 'Set aside', e(memory.aside.reason || 'The nights remain available in Explore.'), '<button class="gf-btn primary" data-action="explore">Revisit nights</button><button class="gf-btn" data-action="restore">Return to Overview</button>',
      'Review control: the late-bolus meals case is a separate synthetic patient. Choose it under Source to open that journey; it is not this patient\'s next priority.');
    // recorded intent: reconciliation is the next step, so the Plan leads
    if (memory.decision) return planFrame();
    return priorityFrame();
  }

  function priorityFrame() {
    const item = finding(), row = analyzerRow(), selected = selectedNight(), nights = roster();
    const position = `${nights.indexOf(selected) + 1} of ${nights.length}`;
    const group = NIGHT_GROUP_LABEL[nightGroup(selected)];
    const end = trial() || memory.record
      ? '<button class="gf-btn" data-action="watch">Return to Trial</button>'
      : memory.decision ? '<button class="gf-btn" data-set="changes">Open Changes</button>'
        : memory.staged ? `<button class="gf-btn" data-set="unstage">Staged · Undo</button><button class="gf-btn primary" data-set="changes">${memory.draft ? 'Resume draft' : 'Open Changes'}</button>`
          : memory.aside ? '' : '<button class="gf-btn" data-action="aside">Set aside</button><button class="gf-btn primary" data-set="stage">Stage change</button>';
    const head = kit.nameplate({
      kicker: `${SETTING_NAME[item.parameter]} · ${e(shortDate(nights[0].date))} to ${e(date(nights.at(-1).date))}`,
      title: e(item.title),
      sub: `<b>${item.support.n} ${e(item.support.noun)}</b> · ${item.support.run_days} d basal run · ${e(TIER[item.tier] || item.tier)}${trial() ? ` · <span>${e(trial().readiness.label)} Trial continues</span>` : ''}`,
      end,
    });
    const nightLabel = `${e(shortDate(selected.date))} · ${e(clock(selected.t))}`;
    const figureSeg = `<div class="seg" role="group" aria-label="Figure"><button data-figure="night" aria-pressed="${figure === 'night'}">Night</button><button data-figure="day" aria-pressed="${figure === 'day'}">Day</button></div>`;
    const stepSeg = '<div class="seg" role="group" aria-label="Night"><button data-set="previous-night" aria-label="Previous night">↑</button><button data-set="next-night" aria-label="Next night">↓</button></div>';
    const seatFigure = kind => `<div class="gf-fig gf-fig2" data-chart="${kind}"><div class="gf-chart-seat"><div class="gf-chart"></div></div>${nightKey()}</div>`;
    const basalFigure = '<div class="gf-fig gf-fig-basal" data-chart="basal"><div class="gf-chart"></div></div>';
    const stage = narrow()
      ? `<section class="pane gf-stage" aria-label="Evidence">${head}
        <div class="instruments"><div class="instrument"><div class="seg gf-narrow-seat" role="group" aria-label="Figure">${[['basal', 'Basal'], ['night', 'Night'], ['day', 'Day']].map(([key, label]) => `<button data-seat="${key}" aria-pressed="${seat === key}">${label}</button>`).join('')}</div></div><div class="instrument gf-tools">${kit.sheetToggle(nightLabel)}</div></div>
        ${seat === 'basal' ? basalFigure : seatFigure(seat)}</section>`
      : `<section class="pane gf-stage" aria-label="Evidence">${head}
        <div class="instruments"><div class="instrument"><span class="cap">Delivered vs programmed</span><span class="meta">nights at or above each rate · one step per night</span></div><div class="instrument gf-tools"><span class="meta">${row.evidence.excluded_night_count} excluded</span>${rowSeg()}</div></div>
        ${basalFigure}
        <div class="instruments"><div class="instrument"><span class="cap">Night</span><span class="when">${e(stamp(selected.t))}</span><span class="meta">${e(group)} · ${position}</span></div><div class="instrument gf-tools">${stepSeg}${figureSeg}</div></div>
        ${seatFigure(figure)}</section>`;
    return kit.desk(stage, `<aside class="pane gf-reading" aria-label="${view.asideOpen ? 'Set aside' : 'Nights'}">${view.asideOpen ? kit.asideForm() : nightsPane(selected, group, position)}</aside>`);
  }
  // The shipped Day legend shape (chart-key.css) with the marks the builder draws.
  function nightKey() {
    const dot = (color, label) => `<span><i style="background:${color}"></i>${label}</span>`;
    return `<div class="ds-chart-legend">${dot(colors.inRange, 'in range')}${dot(colors.high, 'high')}${dot(colors.low, 'low')}${dot(colors.accent, 'bolus')}${dot(colors.secondary, 'carbs (bolus)')}<span style="color:${colors.muted}">┆ ${e(slotSpan())}</span></div>`;
  }
  function nightsPane(selected, group, position) {
    const item = finding(), row = analyzerRow(), rows = analyzerRows();
    const groups = new Map();
    for (const entry of roster()) { const key = nightGroup(entry); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry); }
    const list = [...groups].map(([key, members]) => `<div class="gf-night-group"><b>${NIGHT_GROUP_LABEL[key]}</b> · ${members.length} ${members.length === 1 ? 'night' : 'nights'}</div>${members.map(entry => `<button class="gf-row gf-member-row" data-night="${e(entry.date)}" aria-pressed="${entry.date === selected.date}"><span class="when">${e(shortDate(entry.date))} · ${e(clock(entry.t))}</span><span class="n">${e(entry.delivered_rate)} U/h</span></button>`).join('')}`).join('');
    const mg = value => (value == null ? 'no reading' : `${Math.round(value)} mg/dL`);
    return `${kit.readingHeader('Nights', `${roster().length} of ${row.days} nights`)}<div class="gf-pane-body">
      <section class="gf-section"><h3>Basal · ${e(slotSpan())} <span class="meta">${rows.indexOf(row) + 1} of ${rows.length} in ${e(item.span.label)}</span></h3>
        ${narrow() ? rowSeg() : ''}
        <div class="gf-figure">${e(changeText())}<small>${row.asserts_move ? 'Supported · ' : ''}${e(row.direction)}</small></div>
        <p>${e(item.headline)}</p>
        <p class="gf-meta">Estimate ${e(row.estimate.value)} U/h, ${e(row.estimate.lo)} to ${e(row.estimate.hi)} · ${e(row.estimate.n)} nights · ${row.evidence.directional_support_count} in the asserted direction</p>
        ${memory.draft || memory.decision ? `<p class="gf-meta">${memory.decision ? `Decision recorded ${e(stamp(memory.decision.applied_at))}` : `Draft saved ${e(stamp(memory.draft.updated_at))}`}</p>` : ''}</section>
      <section class="gf-section" role="group" aria-label="Nights">${list}</section>
      <section class="gf-section"><h3>Selected night <span class="meta">${e(position)}</span></h3>
        <div class="gf-nums"><div><span class="when">${e(date(selected.date))} · ${e(slotSpan())}</span> <span class="tier">${e(group)}</span></div>
        <div>${e(selected.delivered_rate)} U/h delivered · ${e(selected.programmed_rate)} U/h programmed</div>
        <div>${mg(selected.glucose_mean)} this night · ${mg(row.evidence.roster_glucose_mean)} roster mean</div>
        <div>${e(Math.round(selected.glucose_entry))} entry · ${e(Math.round(selected.glucose_exit))} exit</div></div>
        <div class="gf-actions"><button class="gf-btn" data-action="day">Open Day</button></div></section>
    </div>`;
  }

  function planFrame() {
    const planned = rows(), result = reconcile(), item = finding();
    // a confirmed pump match ends the re-key instruction; its time stays in the record
    if (result.state === 'confirmed') memory.flash = null;
    const status = memory.error ? 'Save failed' : memory.decision
      ? (result.state === 'confirmed' ? 'On pump' : result.state === 'mismatch' ? 'Mismatch' : 'Pending')
      : memory.draft ? 'Draft saved' : 'Staged';
    const end = memory.decision ? '' : `<button class="gf-btn" data-set="save-draft">Save draft</button><button class="gf-btn primary" data-set="record">Record decision</button>`;
    const head = kit.nameplate({
      kicker: `Plan · <b>${e(status)}</b>`,
      title: `${e(SETTING_NAME[item.parameter])} ${e(item.span.label)} · ${e(changeText())}`,
      sub: `<b>${planned.length} / ${PROFILE_SEGMENTS} segments</b> · Nothing here is sent to your pump.`,
      end,
    });
    const cell = (row, param) => {
      const value = row[param];
      if (value.value === value.current) return `<td class="v">${e(userValue(param, value.value))}</td>`;
      return `<td class="v gf-changed"><s>${e(userValue(param, value.current))}</s> ${e(userValue(param, value.value))}</td>`;
    };
    const table = `<table class="gf-table gf-plan"><thead><tr><th scope="col">Start time</th>${PLAN_PARAMS.map(({ param }) => `<th scope="col">${PLAN_HEAD[param]}</th>`).join('')}</tr></thead><tbody>${planned.map(row => `<tr><td class="v">${e(row.label)}${row.isNewBreak ? ' <span class="gf-pill">new break</span>' : ''}</td>${PLAN_PARAMS.map(({ param }) => cell(row, param)).join('')}</tr>`).join('')}</tbody></table>`;
    const stage = `<section class="pane gf-stage gf-stage-table" aria-label="Plan">${head}
      <div class="instruments"><div class="instrument"><span class="cap">Deliverable</span><span class="meta">pump-ready schedule</span></div><div class="instrument gf-tools"><span class="meta gf-desk-only">Pump-local time</span>${kit.sheetToggle('This change')}</div></div>
      <div class="gf-scroll">${planStatus(result)}${table}</div></section>`;
    return kit.desk(stage, `<aside class="pane gf-reading" aria-label="This change">${changePane(result, status)}</aside>`);
  }
  // Shipped Plan reconciliation copy (index.html), verbatim, chosen by the shipped
  // reconcile function's state.
  function planStatus(result) {
    if (memory.error) return `<div class="gf-status" role="alert"><p class="gf-error">Plan save failed: no response from the store.</p><div class="gf-actions"><button class="gf-btn primary" data-set="retry-save">Retry</button></div></div>`;
    const flash = memory.flash ? `<p class="gf-meta gf-flash" role="status">${e(memory.flash)}</p>` : '';
    if (!memory.decision) return `<div class="gf-status"><p class="gf-meta">${memory.draft ? `Draft saved ${e(stamp(memory.draft.updated_at))}. Recording the decision preserves what was known then.` : 'Draft not saved. Saving the draft preserves consideration.'}</p></div>`;
    if (result.state === 'confirmed') return `<div class="gf-status" data-state="confirmed" tabindex="-1"><p>✓ On pump as of ${e(stamp(result.matchedAt))} — the pump matches your plan.</p>${flash}</div>`;
    if (result.state === 'mismatch') {
      const diff = `<table class="gf-table gf-diff"><thead><tr><th scope="col">Start time</th><th scope="col">Parameter</th><th scope="col">Planned</th><th scope="col">On pump</th></tr></thead><tbody>${result.groups.flatMap(group => group.cells.map(cellRow => `<tr><td class="v">${e(group.label)}</td><td>${e(SETTING_NAME[cellRow.param] || cellRow.label)}</td><td class="v">${e(userValue(cellRow.param, cellRow.planned))}</td><td class="v">${e(userValue(cellRow.param, cellRow.actual))}</td></tr>`)).join('')}</tbody></table>`;
      return `<div class="gf-status" data-state="mismatch" tabindex="-1"><p>The pump doesn't match your plan. Check these values — likely a keying error.</p>${diff}<div class="gf-actions"><button class="gf-btn primary" data-set="rekey">Re-key &amp; recheck</button></div>${flash}</div>`;
    }
    return `<div class="gf-status" data-state="pending" tabindex="-1"><p>Pending — program these into your pump. After the next fetch, this reconciles automatically: "✓ on pump" on a match, or a diff of the divergent values if a value was mis-keyed.</p>${flash}</div>`;
  }
  function changePane(result, status) {
    const profile = capturedProfile() || data.active_profile;
    const profileMeta = capturedProfile() ? `Captured ${e(stamp(data.detected.captured_at))}` : 'Current';
    const settings = `<table class="gf-table"><thead><tr><th scope="col">Start</th>${PLAN_PARAMS.map(({ param }) => `<th scope="col">${PLAN_HEAD[param]}</th>`).join('')}</tr></thead><tbody>${profile.segments.map(segment => `<tr><td class="v">${e(formatStartMin(segment.start_min))}</td>${PLAN_PARAMS.map(({ param }) => `<td class="v">${e(userValue(param, segment[param]))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    return `${kit.readingHeader('This change', e(status))}<div class="gf-pane-body">
      ${decisionSection(result)}
      ${knownSection()}
      <section class="gf-section"><h3>Detected pump settings <span class="meta">${profileMeta}</span></h3>${settings}<p class="gf-meta">Detected schedule. The proposed schedule is the Plan beside it.</p></section>
    </div>`;
  }
  function decisionSection(result) {
    return `<section class="gf-section"><h3>Decision</h3><dl>
      <dt>Draft saved</dt><dd>${memory.draft ? e(stamp(memory.draft.updated_at)) : 'Not saved'}</dd>
      <dt>Decision recorded</dt><dd>${memory.decision ? e(stamp(memory.decision.applied_at)) : 'Not recorded'}</dd>
      ${memory.decision ? `<dt>On pump</dt><dd>${result?.state === 'confirmed' ? e(stamp(result.matchedAt)) : 'Awaiting pump evidence'}</dd>` : ''}
      ${memory.rekeyed ? `<dt>Re-key asked</dt><dd>${e(stamp(memory.rekeyed))}</dd>` : ''}</dl></section>`;
  }
  function knownSection() {
    if (!memory.decision) return '';
    const known = memory.decision.snapshot;
    return `<section class="gf-section"><h3>What was known</h3><dl>
      <dt>Priority</dt><dd>${e(known.title)} · ${e(known.tier)}</dd>
      <dt>Change</dt><dd>${e(known.change)}</dd>
      <dt>Support</dt><dd>${e(known.support)}</dd></dl>
      <p>${e(known.headline)}</p></section>`;
  }

  function trialFrame() {
    const item = trial(), ready = item.state === 'complete';
    const stage = kit.trialStage(item, { kicker: `Trial · <b>${e(item.readiness.label)}</b>`, end: '<button class="gf-btn" data-action="explore">Inspect nights</button>' });
    const reading = `<aside class="pane gf-reading" aria-label="This trial">${kit.readingHeader('This trial', e(item.readiness.label))}<div class="gf-pane-body">
      ${kit.progressSection(item)}
      ${ready ? `<section class="gf-section"><h3>Conclusion</h3>${kit.reviewForm()}</section>` : ''}
      ${decisionSection({ state: onPumpAt() ? 'confirmed' : 'pending', matchedAt: onPumpAt() })}
      ${kit.detectedSettings(item, changedNote())}
      <section class="gf-section"><h3>Limits of this read</h3>${item.limits.map(text => `<p>${e(text)}</p>`).join('')}</section>
    </div></aside>`;
    return kit.desk(stage, reading);
  }
  const changedNote = () => (memory.decision
    ? `Observed on the pump. The decision was recorded ${stamp(memory.decision.applied_at)}.`
    : 'Observed on the pump. No earlier Plan decision was recorded; Harmonic first saw this change at detection.');
  function recordFrame() {
    const record = memory.record;
    const stage = kit.trialStage(record.trial, { kicker: 'Trial · <b>Finished</b>', end: '<button class="gf-btn" data-action="explore">Inspect nights</button>', rail: '<span class="meta">Ending snapshot</span>', body: kit.evidenceTable(record.trial) });
    const reading = `<aside class="pane gf-reading" aria-label="This trial">${kit.readingHeader('This trial', 'Finished')}<div class="gf-pane-body">
      <section class="gf-section"><h3>Conclusion</h3><p>${e(record.conclusion)}</p><dl><dt>Finished</dt><dd>${e(stamp(record.endedAt))}</dd><dt>Original priority</dt><dd>${e(finding().title)}</dd></dl></section>
      ${decisionSection({ state: record.onPumpAt ? 'confirmed' : 'pending', matchedAt: record.onPumpAt })}
      ${knownSection()}
      <section class="gf-section"><h3>Evidence periods</h3><dl><dt>Before</dt><dd>${e(period(record.trial.before_period))}</dd><dt>Trial</dt><dd>${e(period(record.trial.trial_period))}</dd></dl><p class="gf-meta">Pump-local time. Observations are limited to these periods.</p></section>
      ${kit.detectedSettings(record.trial, changedNote())}
    </div></aside>`;
    return kit.desk(stage, reading);
  }

  /* ---- charts ----------------------------------------------------------------- */
  function mountCharts() {
    if (!globalThis.echarts) return;
    for (const host of surface.querySelectorAll('[data-chart]')) {
      const element = host.querySelector('.gf-chart');
      const chart = echarts.init(element); charts.push(chart);
      const update = () => {
        let option;
        if (host.dataset.chart === 'basal') {
          option = DIAGNOSE_EVIDENCE_CHARTS.find(entry => entry.kind === 'basal').option(null, { data: chartData(), surface: element });
          const head = option.graphic[0];
          if (head.style.rich) {
            // The full-rank verdict slug's rich token names its colour with `color`,
            // which ECharts' graphic text ignores; the consumer sets `fill` so the
            // word reads in the rail's muted ink like the rows beneath it.
            head.style.rich.v.fill = colors.muted;
          } else {
            // The compact rank seats the axis caption at the height the crossing
            // count sits at; move the caption down and give the grid the room.
            option.xAxis.nameGap = 48; option.grid.bottom = 72;
          }
        } else {
          const selected = selectedNight(), day = data.days[selected.date];
          const at = minutes => `${selected.date}T${hhmm(minutes)}:00`;
          const { start_min: start, end_min: end } = rowRange(analyzerRow());
          const [xMin, xMax] = host.dataset.chart === 'night'
            ? [at(Math.max(0, start - 120)), at(Math.min(1439, end + 120))]
            : [day.start.replace(' ', 'T'), day.end.replace(' ', 'T')];
          option = buildHeroOption(day, selected.date, { colors, xMin, xMax });
          const scale = Math.max(.42, element.clientHeight / HERO.H);
          for (const grid of option.grid) { grid.top *= scale; grid.height *= scale; }
          // the slot's edges; the key beneath names them, so no label rides the lines
          option.series[0].markLine.data.push({ xAxis: at(start), label: { show: false } }, { xAxis: at(end), label: { show: false } });
        }
        chart.setOption(option, true); chart.resize();
      };
      update(); const observer = new ResizeObserver(update); observer.observe(element); observers.push(observer);
    }
  }
  function dispose() {
    for (const observer of observers) observer.disconnect();
    for (const chart of charts) chart.dispose();
    charts = []; observers = [];
  }

  /* ---- actions ---------------------------------------------------------------- */
  const snapshot = () => ({ title: finding().title, tier: TIER[finding().tier] || finding().tier, change: changeText(), headline: finding().headline, support: `${finding().support.n} ${finding().support.noun} · ${finding().support.run_days} d basal run` });
  // A save either lands with the manufactured clock's stamp or fails as an
  // ordinary error; nothing is written anywhere.
  function save(kind) {
    memory.flash = null;
    if (saveFails) { saveFails = false; mockbar.querySelector('[aria-label="Next save fails"]').checked = false; memory.error = kind; return; }
    memory.error = null;
    if (kind === 'draft' || !memory.draft) memory.draft = { updated_at: station === 'before' ? data.draft.updated_at : stationOf().now };
    if (kind === 'decision') memory.decision = { applied_at: station === 'before' ? data.decision.applied_at : stationOf().now, snapshot: snapshot() };
  }
  function moveNight(direction) {
    const list = roster(), at = list.indexOf(selectedNight());
    night = list[(at + direction + list.length) % list.length].date;
    kit.render(); surface.querySelector('.gf-member-row[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function bind() {
    for (const button of surface.querySelectorAll('[data-slot]')) button.onclick = () => { slot = Number(button.dataset.slot); view.focusAfterRender = `button[data-slot="${slot}"]`; kit.render(); };
    for (const button of surface.querySelectorAll('[data-night]')) button.onclick = () => { night = button.dataset.night; view.sheetOpen = false; view.focusAfterRender = narrow() ? '.gf-sheet-toggle' : '.gf-member-row[aria-pressed="true"]'; kit.render(); };
    for (const button of surface.querySelectorAll('[data-figure]')) button.onclick = () => { figure = button.dataset.figure; kit.render(); };
    for (const button of surface.querySelectorAll('[data-seat]')) button.onclick = () => { seat = button.dataset.seat; kit.render(); };
    for (const button of surface.querySelectorAll('[data-set]')) button.onclick = () => {
      const action = button.dataset.set;
      if (action === 'stage') { memory.staged = true; memory.flash = null; kit.navigate('changes'); }
      else if (action === 'unstage') { memory.staged = false; memory.draft = null; view.focusAfterRender = '[data-set="stage"]'; kit.render(); }
      else if (action === 'changes') kit.navigate('changes');
      else if (action === 'save-draft') { save('draft'); view.focusAfterRender = memory.error ? '[data-set="retry-save"]' : '[data-set="save-draft"]'; kit.render(); }
      else if (action === 'record') { save('decision'); view.focusAfterRender = memory.error ? '[data-set="retry-save"]' : '.gf-status'; kit.render(); }
      else if (action === 'retry-save') { save(memory.error); view.focusAfterRender = memory.error ? '[data-set="retry-save"]' : '.gf-status'; kit.render(); }
      else if (action === 'rekey') { memory.rekeyed = stationOf().now; memory.flash = 'Re-key the flagged values on your pump — this rechecks on the next fetch'; kit.render(); }
      else if (action === 'previous-night') moveNight(-1);
      else if (action === 'next-night') moveNight(1);
    };
  }
  return {
    load(json) { data = json; night = roster()[0].date; controls(); },
    frame, bind, mountCharts, dispose,
    onNavigate(next) { if (next === 'day') { figure = 'day'; seat = 'day'; } if (next === 'explore') { figure = 'night'; seat = 'basal'; } },
    setAside(reason) { memory.aside = { reason, at: stationOf().now }; },
    restore() { memory.aside = null; },
    // the finish records the wearer's words with the manufactured clock and the
    // decision context this page holds; then the original context leads again
    finish(conclusion) { memory.record = { trial: structuredClone(trial()), conclusion, endedAt: stationOf().now, onPumpAt: onPumpAt() }; },
    finished: () => memory.record,
    escape() {
      if (narrow() && seat !== 'basal') seat = 'basal';
      else if (figure !== 'night') figure = 'night';
      else return false;
      return true;
    },
  };
}
