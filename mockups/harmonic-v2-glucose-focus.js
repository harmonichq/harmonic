// RE-SETTLED TERM — 2026-09-10 — ADR 397 — HV2-09, HV2-10, HV2-11; HV2-14 evidence label and dependent copy
//
// Sanction: Connor Griffin, 2026-09-08, the September 8 direction change recorded in openspec/changes/harmonic-v2/design.md: "v2 ships three destinations: Diagnose, Changes and Day. Overview and Explore collapse into Diagnose carrying the shipped v1 rail as-is".
//
// Old (superseded): "Back to Overview"
// New: "Back to Diagnose"
//
// Old (superseded): "Return to Overview"
// New: "Return to Diagnose"
//
// Old (superseded): "The lows remain available in Explore."
// New: "The lows remain available in Diagnose."
//
// Old (superseded): "Overview (leading-change, set-aside and ending summaries)"
// New: "Changes (leading-change, set-aside and ending summaries)"
//
// Scope: selected v2 desktop only; supersedes prior destination/copy authority.
// Historical prototype executable bytes, implementation comments, captures and
// unselected variants remain unchanged. They do not depict the amended navigation.
// Changes' leading-change ownership is the coordinator's explicit placement
// instruction in #397's order, separate from the quoted September 8 sanction.
// #389 owes executable substitutions and adaptation evidence. Contextual Day
// return still follows HV2-14's source and precise target, including Changes.
// The v2 behavior/fidelity ledgers and replay live on stopped #389 and are absent
// here. #389 must amend affected frozen behavior entries, permanent retirement
// records, LOCK assertions and fidelity rows before dependent implementation
// resumes. No local executable LOCK assertion exists: HV2-nn is illustrative.
// #389 must prove each amended assertion fails for the intended reason before
// restoring green, and change fidelity rows from re-settle requested to met only
// with new evidence. No ledger, executable proof or release acceptance is claimed.
//
// Glucose first, round 4 (#348). Unlocked design exploration: the habit
// journey, on the same desk as the meals investigation and the setting journey.
// The shipped pattern, comparison, Focus and trend producers supply every count,
// rate, window and status (focus.json, or journey.json's focus_branch); the
// shipped Trial producer supplies the alternative ending. Pinning, the decision
// snapshot, the conclusion and the ending live only in this page's memory: the
// source stores a Focus row's pin time and status, never a conclusion or an end
// time (focus.json `_note`). Review controls in the mock bar move a manufactured
// clock; nothing here fetches or writes. The shared journey
// (harmonic-v2-glucose-journey.js) owns this module's clock when it is a branch.
import { TIER } from '../frontend/diagnose-findings-queue.js';
import { scnRateLine } from '../frontend/scenario-chart.js';
import { GRID } from '../frontend/diagnose-workstation-chart.js';

// The served Focus statuses, as the kicker words.
const STATUS = { active: 'Active', resolved: 'Resolved', dropped: 'Dropped' };
// The progress figure's three tracks: the observed behavior over the fixed
// windows, then the target metric, then time in range. Heights seat three
// short boxes and one date axis in the stage's figure row.
const FIG = { top: 22, track: 50, gap: 22, bottom: 24 };

export function createFocusJourney(kit, options = {}) {
  const { surface, mockbar, narrow, view, e, date, shortDate, stamp, pct } = kit;
  const { controls: ownsControls = true, gate = () => null, onSaveFailed = () => {} } = options;
  let data = null;
  // review controls: the manufactured clock and the next save's fate
  let station = 'before', saveFails = false;
  let seat = 'progress';       // narrow: the one figure seat of the Focus stage
  let charts = [], observers = [], figureSource = null;
  // page memory: what the wearer did on this desk, in this page
  const memory = { focus: null, record: null, aside: null, error: null, showDropped: false };

  /* ---- served material ------------------------------------------------------ */
  const initial = () => data.initial;
  const finding = () => initial().finding_row;
  const lever = () => data.focus.lever;
  // The action is the read's own served pattern; the source's action row stands
  // in for a bundle without one.
  const actionOf = bundle => bundle.scenarios?.patterns?.find(row => row.lever === lever()) || data.action;
  const stationOf = () => STATIONS()[station];
  // Review clocks are the generator's own: the two times summarize_trend ran, and
  // the review that found the manufactured pump change.
  const STATIONS = () => ({
    before: { now: data.reviewed_at.before, trend: 'before', label: `${stamp(data.reviewed_at.before)} · deciding` },
    following: { now: data.reviewed_at.following, trend: 'following', label: `${shortDate(data.reviewed_at.following)} · follow-up, 30 days later` },
    preempted: { now: data.preempted.reviewed_at, trend: 'following', label: `${shortDate(data.preempted.reviewed_at)} · correction factor changed on the pump` },
  });
  const trend = () => data[stationOf().trend];
  const trendReadAt = () => data.reviewed_at[stationOf().trend];
  const trial = () => (station === 'preempted' ? data.preempted.review.selected : null);
  // The source's Focus row is active at the later clocks; at the first clock the
  // wearer pins it here, at the same served time.
  const pinned = () => station !== 'before' || !!memory.focus;
  const pinnedAt = () => data.focus.pinned_at;
  const resolved = () => !!memory.record && station !== 'preempted' && stationOf().now >= memory.record.endedAt;
  const active = () => pinned() && !resolved() && !trial();
  const behaviorOf = source => source.behaviors.find(row => row.lever === lever());
  const targetOf = source => source.metrics.find(row => row.key === source.watched_change.target_metric);
  const tirOf = source => source.metrics.find(row => row.key === 'tir');
  // The latest fixed window of a given trend read, never of the live one: a
  // record reads its own snapshot everywhere.
  const latestOf = source => {
    const series = behaviorOf(source).series, i = series.length - 1;
    return { point: series[i], window: source.windows[i], i };
  };
  const lows = point => (point.exposure_n ? `${point.attributed} of ${point.exposure_n} lows` : 'no lows');
  const metricValue = (n, unit) => (n == null ? 'no readings' : unit === '%' ? `${n}%` : `${n} ${unit}`);
  const windowSpan = window => `${shortDate(window.start)} to ${shortDate(window.end)}`;

  /* ---- review controls, outside product chrome ------------------------------ */
  function controls() {
    if (!ownsControls || mockbar.querySelector('.gf-review[data-source="focus"]')) return;
    const params = new URLSearchParams(location.search);
    if (STATIONS()[params.get('clock')]) station = params.get('clock');
    mockbar.querySelector('.gf-review-notes-body').insertAdjacentHTML('beforeend', `<p class="gf-review-memo" data-source="focus">Pin time and status are the source's; the decision snapshot, conclusion and ending are this page's memory.</p>`);
    mockbar.querySelector('p').insertAdjacentHTML('beforebegin', `<span class="gf-review" data-source="focus" role="group" aria-label="Focus review controls">
      <label>Clock <select aria-label="Focus clock">${Object.entries(STATIONS()).map(([key, item]) => `<option value="${key}" ${key === station ? 'selected' : ''}>${e(item.label)}</option>`).join('')}</select></label>
      <label><input type="checkbox" aria-label="Next Focus save fails"> Next save fails</label></span>`);
    mockbar.querySelector('[aria-label="Focus clock"]').onchange = event => {
      setStation(event.target.value);
      const url = new URL(location.href); url.searchParams.set('clock', station); history.replaceState(null, '', url);
      view.sheetOpen = false; kit.render();
    };
    mockbar.querySelector('[aria-label="Next Focus save fails"]').onchange = event => { saveFails = event.target.checked; };
  }
  function setStation(key) {
    if (!STATIONS()[key]) return;
    station = key; memory.showDropped = false; memory.error = null; seat = 'progress';
  }

  /* ---- frames ----------------------------------------------------------------- */
  // null hands the destination to the shared investigation: the served case file,
  // its cohorts, members, episodes and Day, with this journey's action beside them.
  function frame(destination) {
    if (destination === 'day' || destination === 'explore') return null;
    if (trial()) return memory.showDropped && destination === 'changes' ? droppedFrame() : trialFrame();
    if (resolved()) return destination === 'changes' ? recordFrame() : kit.emptyFrame('Overview', 'Focus resolved', e(memory.record.conclusion), '<button class="gf-btn primary" data-action="history">View Focus record</button><button class="gf-btn" data-action="explore">Inspect lows</button>');
    if (pinned()) return focusFrame();
    // the served tier and headline say what this pattern is; neither certifies it
    if (destination === 'changes') return kit.emptyFrame('Changes', 'No change underway', `${e(finding().title)} · ${e(TIER[finding().tier] || finding().tier)}. ${e(finding().headline)}`, '<button class="gf-btn" data-action="explore">Inspect lows</button><button class="gf-btn primary" data-focus="pin">Start Focus</button>');
    if (memory.aside) return kit.emptyFrame('Overview', 'Set aside', e(memory.aside.reason || 'The lows remain available in Explore.'), '<button class="gf-btn primary" data-action="explore">Revisit lows</button><button class="gf-btn" data-action="restore">Return to Overview</button>',
      'Review control: the meals and setting cases are separate synthetic patients. Choose one under Source to open that journey; neither is this patient\'s next priority.');
    return null;
  }

  // What the shared investigation frame reads from this journey: the nameplate's
  // status and end controls, the reading pane's name, and its leading section.
  // A caller's gate (the shared journey's one-watch rule) replaces the pre-pin
  // controls; the served action is still read.
  function priority(bundle = initial()) {
    const held = !pinned() && gate();
    const status = trial() ? `<span>${e(trial().readiness.label)} Trial continues</span>` : resolved() ? '<span>Focus resolved</span>' : pinned() ? '<span>Focus continues</span>' : held ? held.status : '';
    const end = trial() ? '<button class="gf-btn" data-action="watch">Return to Trial</button>'
      : resolved() ? '<button class="gf-btn" data-action="history">View Focus record</button>'
        : pinned() ? '<button class="gf-btn" data-action="watch">Return to Focus</button>'
          : held ? held.end
            : memory.aside ? '' : '<button class="gf-btn" data-action="aside">Set aside</button><button class="gf-btn primary" data-focus="pin">Start Focus</button>';
    return { title: 'Lows', status, end, lead: actionSection(bundle, held) };
  }
  // The served action leads with what to do (the pattern's own recommendation,
  // verbatim), then how often it showed up and how sure the source is. The
  // source's internal numbers are one disclosure away, never the reading.
  function actionSection(bundle, held) {
    const item = actionOf(bundle), row = bundle.finding_row || finding(), rate = scnRateLine(item), c = item.confidence, window = bundle.scenarios.window;
    return `<section class="gf-section"><h3>Action <span class="meta">${e(TIER[row.tier] || row.tier)}</span></h3>
      <p>${e(item.recommendation)}</p>
      <div class="gf-figure">${rate.k} of ${rate.n} ${e(rate.noun)}<small>${e(shortDate(window.start))} to ${e(date(window.end))}${c.wide ? ' · wide interval' : ''}</small></div>
      <p class="gf-meta">${e(row.headline)}</p>
      ${sourceDetail(item, rate, c)}
      ${memory.error === 'pin' ? saveError('pin') : ''}
      ${pinned() ? `<p class="gf-meta">Focus pinned ${e(stamp(pinnedAt()))}</p>` : held?.note ? `<p class="gf-note">${e(held.note)}</p>` : ''}</section>`;
  }
  // The shipped scenario panel's confidence rows (index.html), on demand.
  const sourceDetail = (item, rate, c) => `<details class="gf-detail"><summary>Source detail</summary><dl>
      <dt>Priority</dt><dd>${e(item.priority)}</dd>
      <dt>Recurrence</dt><dd>~${rate.pct}% of ${e(rate.noun)} · ${(c.rate * 100).toFixed(1)}% [${(c.lo * 100).toFixed(1)}–${(c.hi * 100).toFixed(1)}%]${c.wide ? ' · Wide CI' : ''}</dd>
      <dt>Severity (effect)</dt><dd>${c.effect.toFixed(2)}</dd>
      <dt>Confidence</dt><dd>${e(c.confidence)}</dd></dl></details>`;
  // The failed resolve's Retry submits the same form as the primary control, so an
  // empty conclusion is refused the same way; the pin has no form to admit.
  const saveError = kind => `<div class="gf-status" role="alert"><p class="gf-error">Focus save failed: no response from the store.</p><div class="gf-actions">${kind === 'resolve'
    ? `<button class="gf-btn primary" type="submit" form="finish-form" data-focus="retry-resolve" ${view.conclusion.trim() ? '' : 'disabled'}>Retry</button>`
    : '<button class="gf-btn primary" data-focus="retry-pin">Retry</button>'}</div></div>`;

  // The Focus stage: the progress figure over the fixed windows, then the two
  // tables (observed behavior, glucose outcomes) beneath it. Every part reads one
  // trend source: the live read, or a record's own snapshot.
  function focusStage({ kicker, end, rail, source, readAt }) {
    figureSource = source;
    const { point, window } = latestOf(source);
    const head = kit.nameplate({ kicker, title: e(finding().title), sub: `Pinned ${e(stamp(pinnedAt()))} · <b>${e(lows(point))}</b> ${e(shortDate(window.start))} to ${e(date(window.end))}`, end });
    const figure = `<div class="gf-fig gf-fig-focus" data-focus-chart><div class="gf-chart-seat"><div class="gf-chart"></div></div>${progressKey(source)}</div>`;
    const meta = `${rail}${source.window_days}-day windows, fixed · ${source.windows.length} available · read ${e(stamp(readAt))}`;
    return narrow()
      ? `<section class="pane gf-stage gf-stage-focus" aria-label="Focus evidence">${head}
        <div class="instruments"><div class="instrument"><div class="seg gf-narrow-seat" role="group" aria-label="View"><button data-focus="seat-progress" aria-pressed="${seat === 'progress'}">Progress</button><button data-focus="seat-windows" aria-pressed="${seat === 'windows'}">Windows</button></div></div><div class="instrument gf-tools">${kit.sheetToggle('This Focus')}</div></div>
        ${seat === 'progress' ? figure : `<div class="gf-scroll">${windowsTable(source)}</div>`}</section>`
      : `<section class="pane gf-stage gf-stage-focus" aria-label="Focus evidence">${head}
        <div class="instruments"><div class="instrument"><span class="cap">Progress</span><span class="meta">${meta}</span></div><div class="instrument gf-tools"><span class="meta">Pump-local time</span>${kit.sheetToggle('This Focus')}</div></div>
        ${figure}
        <div class="gf-scroll">${behaviorTable(source)}${glucoseTable(source)}</div></section>`;
  }
  const windowHead = source => source.windows.map(window => `<th scope="col">${e(windowSpan(window))}<small>CGM ${Math.round(window.cgm_active * 100)}%</small></th>`).join('');
  // A window with no lows has nothing to compare: it prints that, never a rate.
  function behaviorTable(source) {
    const row = behaviorOf(source);
    const cell = point => (point.exposure_n
      ? `<td class="v">${point.attributed} of ${point.exposure_n}<small>${e(pct(point.problem_rate * 100))} attributed</small></td>`
      : '<td class="v">no lows<small>unavailable</small></td>');
    return `<table class="gf-table gf-trend"><thead><tr><th scope="col">Observed behavior</th>${windowHead(source)}</tr></thead><tbody>
      <tr class="gf-target"><td>${e(row.title)}<small>attributed of ${e(row.exposure)} · Inferred</small></td>${row.series.map(cell).join('')}</tr></tbody></table>`;
  }
  function glucoseTable(source) {
    const target = source.watched_change.target_metric;
    const metric = item => `<tr class="${item.key === target ? 'gf-target' : ''}"><td>${e(item.title)}<small>${item.range ? `${e(item.range)} mg/dL` : e(item.unit)}${item.key === target ? ' · target' : ''}</small></td>${item.series.map(n => `<td class="v">${e(metricValue(n, item.unit))}</td>`).join('')}</tr>`;
    const nights = source.overnight_lows;
    const nightRow = `<tr><td>${e(nights.title)}<small>below ${e(nights.threshold)} mg/dL</small></td>${nights.n.map((n, i) => `<td class="v">${n ? `${nights.low_n[i]} of ${n}` : 'no nights'}<small>${n ? e(pct(nights.series[i])) : 'unavailable'}</small></td>`).join('')}</tr>`;
    return `<table class="gf-table gf-trend"><thead><tr><th scope="col">Glucose outcomes</th>${windowHead(source)}</tr></thead><tbody>${source.metrics.map(metric).join('')}${nightRow}</tbody></table>`;
  }
  // Narrow: the windows are rows, latest first, so the current window is the
  // first thing read; the full metric set stays on the desktop tables.
  function windowsTable(source) {
    const row = behaviorOf(source), target = targetOf(source), tir = tirOf(source);
    const lines = source.windows.map((window, i) => `<tr class="${i === source.windows.length - 1 ? 'gf-target' : ''}"><th scope="row">${e(windowSpan(window))}<small>CGM ${Math.round(window.cgm_active * 100)}%</small></th>
      <td class="v">${row.series[i].exposure_n ? `${row.series[i].attributed} of ${row.series[i].exposure_n}` : 'no lows'}</td><td class="v">${e(metricValue(target.series[i], target.unit))}</td><td class="v">${e(metricValue(tir.series[i], tir.unit))}</td></tr>`).reverse();
    return `<table class="gf-table gf-windows"><thead><tr><th scope="col">Window</th><th scope="col">${e(row.title)}<small>attributed of lows</small></th><th scope="col">${e(target.title)}<small>${e(target.range)} · target</small></th><th scope="col">${e(tir.title)}<small>${e(tir.range)}</small></th></tr></thead><tbody>${lines.join('')}</tbody></table>`;
  }
  // The figure's key: the shipped Day legend shape (chart-key.css), naming each
  // mark the figure draws.
  function progressKey(source) {
    const c = kit.trialColors();
    const dot = (color, label) => `<span><i style="background:${color}"></i>${label}</span>`;
    return `<div class="ds-chart-legend">${dot(c.accent, `${e(behaviorOf(source).title.toLowerCase())}, attributed`)}${dot(c.mutedSoft, 'lows in window')}${dot(kit.colors.low, e(targetOf(source).title.toLowerCase()))}${dot(kit.colors.inRange, e(tirOf(source).title.toLowerCase()))}<span style="color:${c.muted}">┆ pinned</span><span style="color:${c.muted}">▭ unavailable</span></div>`;
  }

  function focusFrame() {
    const source = trend(), { point, window } = latestOf(source), target = targetOf(source), tir = tirOf(source), item = actionOf(initial());
    const stage = focusStage({ kicker: `Focus · <b>${STATUS[data.focus.status]}</b>`, end: '<button class="gf-btn" data-action="explore">Inspect lows</button>', rail: '', source, readAt: trendReadAt() });
    const reading = `<aside class="pane gf-reading" aria-label="This Focus">${kit.readingHeader('This Focus', STATUS[data.focus.status])}<div class="gf-pane-body">
      <section class="gf-section"><h3>Focus <span class="meta">pinned ${e(shortDate(pinnedAt()))}</span></h3>
        <p>${e(item.recommendation)}</p>
        <div class="gf-figure">${e(lows(point))}<small>${e(windowSpan(window))} · latest window</small></div>
        <div class="gf-figure">${e(metricValue(target.series.at(-1), target.unit))} ${e(target.title.toLowerCase())}<small>target · ${e(metricValue(tir.series.at(-1), tir.unit))} ${e(tir.title.toLowerCase())}</small></div>
        <dl><dt>Windows</dt><dd>${source.window_days} days, fixed · ${source.windows.length} available</dd><dt>Read</dt><dd>${e(stamp(trendReadAt()))}</dd></dl>
        <p class="gf-meta">A window with no lows has nothing to compare.</p></section>
      <section class="gf-section"><h3>Conclusion</h3>${memory.error === 'resolve' ? saveError('resolve') : ''}${kit.reviewForm('Record conclusion &amp; resolve', 'Resolving ends the Focus. Nothing here is sent to your pump.')}</section>
      ${knownSection()}
    </div></aside>`;
    return kit.desk(stage, reading);
  }
  // The decision snapshot: the served action as it stood at the pin, held in page
  // memory from the pin on; a Focus the source already holds reads its original
  // context, which no later read rewrites.
  const snapshot = () => ({ action: structuredClone(data.action), finding: structuredClone(finding()), window: structuredClone(initial().scenarios.window) });
  const known = () => memory.focus?.known || snapshot();
  function knownSection() {
    const { action: item, finding: row, window } = known(), rate = scnRateLine(item), c = item.confidence;
    return `<section class="gf-section"><h3>What was known <span class="meta">${e(stamp(pinnedAt()))}</span></h3>
      <div class="gf-figure">${rate.k} of ${rate.n} ${e(rate.noun)}<small>${e(shortDate(window.start))} to ${e(date(window.end))}${c.wide ? ' · wide interval' : ''}</small></div>
      <dl><dt>Priority</dt><dd>${e(row.title)} · ${e(TIER[row.tier] || row.tier)}</dd></dl>
      <p>${e(item.recommendation)}</p>
      ${sourceDetail(item, rate, c)}</section>`;
  }
  function recordFrame() {
    const record = memory.record;
    const stage = focusStage({ kicker: 'Focus · <b>Resolved</b>', end: '<button class="gf-btn" data-action="overview">Back to Overview</button>', rail: 'Ending snapshot · ', source: record.trend, readAt: record.readAt });
    const reading = `<aside class="pane gf-reading" aria-label="This Focus">${kit.readingHeader('This Focus', 'Resolved')}<div class="gf-pane-body">
      <section class="gf-section"><h3>Conclusion</h3><p>${e(record.conclusion)}</p><dl><dt>Resolved</dt><dd>${e(stamp(record.endedAt))} · by you</dd><dt>Pinned</dt><dd>${e(stamp(pinnedAt()))}</dd><dt>Status</dt><dd>${STATUS[data.resolved_record.status]}</dd></dl></section>
      ${knownSection()}
    </div></aside>`;
    return kit.desk(stage, reading);
  }

  // The alternative ending: the shipped Trial producer's detected change leads,
  // and the Focus record keeps its reason. Nothing resumes it.
  function trialFrame() {
    const item = trial();
    const stage = kit.trialStage(item, { kicker: `Trial · <b>${e(item.readiness.label)}</b>`, end: '<button class="gf-btn" data-action="explore">Inspect lows</button>' });
    const reading = `<aside class="pane gf-reading" aria-label="This trial">${kit.readingHeader('This trial', e(item.readiness.label))}<div class="gf-pane-body">
      ${kit.progressSection(item)}
      ${endedSection()}
      ${kit.detectedSettings(item, 'Observed on the pump. No earlier Plan decision was recorded; Harmonic first saw this change at detection.')}
      <section class="gf-section"><h3>Limits of this read</h3>${item.limits.map(text => `<p>${e(text)}</p>`).join('')}</section>
    </div></aside>`;
    return kit.desk(stage, reading);
  }
  const preemptedBy = () => `${kit.trialTitle(trial())}, detected ${stamp(trial().changed_at)}`;
  function endedSection() {
    return `<section class="gf-section"><h3>Focus ended</h3><dl><dt>${e(finding().title)}</dt><dd>${STATUS[data.preempted.focus_record.status]}</dd><dt>Pinned</dt><dd>${e(stamp(pinnedAt()))}</dd><dt>Reason</dt><dd>Preempted by this Trial</dd><dt>Seen</dt><dd>${e(stamp(stationOf().now))} review</dd></dl>
      <div class="gf-actions"><button class="gf-btn" data-focus="dropped">View Focus record</button></div></section>`;
  }
  function droppedFrame() {
    const stage = focusStage({ kicker: 'Focus · <b>Dropped</b>', end: '<button class="gf-btn" data-action="watch">Back to Trial</button>', rail: 'Last available read · ', source: trend(), readAt: trendReadAt() });
    const reading = `<aside class="pane gf-reading" aria-label="This Focus">${kit.readingHeader('This Focus', 'Dropped')}<div class="gf-pane-body">
      <section class="gf-section"><h3>Ending</h3><dl><dt>Status</dt><dd>${STATUS[data.preempted.focus_record.status]}</dd><dt>Reason</dt><dd>Preempted by ${e(preemptedBy())}</dd><dt>Seen</dt><dd>${e(stamp(stationOf().now))} review</dd><dt>Pinned</dt><dd>${e(stamp(pinnedAt()))}</dd><dt>Conclusion</dt><dd>Not recorded</dd></dl>
        <p class="gf-meta">${e(trial().focus.message)}</p></section>
      ${knownSection()}
    </div></aside>`;
    return kit.desk(stage, reading);
  }

  /* ---- the progress figure --------------------------------------------------- */
  // Three tracks on one date axis: each served fixed window is a box spanning its
  // own dates, its height the value, its text the reading. A window with no lows
  // or no readings is an outlined box saying so; nothing joins the boxes, so no
  // line implies an observation between them. The pin is a dashed line.
  function progressOption(source, colors) {
    const ms = value => new Date(`${String(value).slice(0, 10)}T12:00:00`).getTime();
    const mono = colors.mono || 'ui-monospace, monospace';
    const behavior = behaviorOf(source), target = targetOf(source), tir = tirOf(source);
    const windows = source.windows;
    const xMin = ms(windows[0].start), xMax = ms(windows.at(-1).end);
    const top = i => FIG.top + i * (FIG.track + FIG.gap);
    const tracks = [
      { name: `${behavior.title} · attributed of lows in window`, max: Math.max(1, ...behavior.series.map(p => p.exposure_n || 0)), fmt: n => String(n),
        rows: behavior.series.map((p, i) => (p.exposure_n ? [ms(windows[i].start), ms(windows[i].end), p.attributed, `${p.attributed} of ${p.exposure_n}`, p.exposure_n] : [ms(windows[i].start), ms(windows[i].end), null, 'no lows', 0])),
        fill: colors.accent, ghost: colors.mutedSoft },
      { name: `${target.title} · ${target.range} mg/dL · target`, max: Math.max(2, Math.ceil(Math.max(...target.series.filter(n => n != null), 0) * 1.5)), fmt: n => `${n}%`,
        rows: target.series.map((n, i) => [ms(windows[i].start), ms(windows[i].end), n, n == null ? 'no readings' : `${n}%`, null]), fill: kit.colors.low },
      { name: `${tir.title} · ${tir.range} mg/dL`, max: 100, fmt: n => `${n}%`,
        rows: tir.series.map((n, i) => [ms(windows[i].start), ms(windows[i].end), n, n == null ? 'no readings' : `${n}%`, null]), fill: kit.colors.inRange },
    ];
    const grid = tracks.map((track, i) => ({ left: GRID.left, right: 16, top: top(i), height: FIG.track }));
    const xAxis = tracks.map((track, i) => ({ gridIndex: i, type: 'time', min: xMin, max: xMax, axisLine: { lineStyle: { color: colors.line } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { show: i === tracks.length - 1, color: colors.muted, fontSize: 10, fontFamily: mono, hideOverlap: true, formatter: '{MMM} {d}' } }));
    const yAxis = tracks.map((track, i) => ({ gridIndex: i, type: 'value', min: 0, max: track.max, splitNumber: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: { color: colors.muted, fontSize: 10, fontFamily: mono, formatter: track.fmt, showMinLabel: true, showMaxLabel: true } }));
    const graphic = tracks.map((track, i) => ({ type: 'text', left: GRID.left, top: top(i) - 15, style: { text: track.name.toUpperCase(), fill: colors.muted, font: '700 10px Inter, system-ui, sans-serif' } }));
    const boxes = tracks.map((track, i) => ({
      type: 'custom', xAxisIndex: i, yAxisIndex: i, silent: true, data: track.rows,
      renderItem: (params, api) => {
        const x0 = api.coord([api.value(0), 0])[0] + 2, x1 = api.coord([api.value(1), 0])[0] - 2, w = x1 - x0;
        const y0 = api.coord([0, 0])[1], yTop = api.coord([0, track.max])[1];
        const value = api.value(2), text = track.rows[params.dataIndex][3], ghost = track.rows[params.dataIndex][4];
        const label = (y, fill, align) => ({ type: 'text', style: { text, x: x0 + w / 2, y, textAlign: 'center', textVerticalAlign: align, fill, font: `600 11px ${mono}` } });
        if (value == null || Number.isNaN(value)) return { type: 'group', children: [
          { type: 'rect', shape: { x: x0, y: yTop, width: w, height: y0 - yTop }, style: { fill: 'transparent', stroke: colors.muted, lineDash: [3, 3], lineWidth: 1 } },
          label((y0 + yTop) / 2, colors.muted, 'middle')] };
        const children = [];
        if (ghost) children.push({ type: 'rect', shape: { x: x0, y: api.coord([0, ghost])[1], width: w, height: y0 - api.coord([0, ghost])[1] }, style: { fill: track.ghost } });
        const y = api.coord([0, value])[1];
        children.push({ type: 'rect', shape: { x: x0, y, width: w, height: Math.max(1, y0 - y) }, style: { fill: track.fill } });
        // the reading rides inside a tall box and above a short one, in ink either way
        children.push(y0 - y > 18 ? label(y + 3, colors.rail, 'top') : label(y - 2, colors.text, 'bottom'));
        return { type: 'group', children };
      },
    }));
    const pin = tracks.map((track, i) => ({ type: 'line', xAxisIndex: i, yAxisIndex: i, data: [], silent: true,
      markLine: { symbol: 'none', silent: true, lineStyle: { color: colors.muted, type: 'dashed', width: 1 }, data: [{ xAxis: ms(pinnedAt()), label: { show: i === 0, formatter: `Pinned ${shortDate(pinnedAt())}`, position: 'insideEndTop', color: colors.muted, fontSize: 10, fontFamily: mono } }] } }));
    return { animation: false, grid, xAxis, yAxis, graphic, series: [...boxes, ...pin] };
  }
  function mountCharts() {
    if (!globalThis.echarts) return;
    for (const host of surface.querySelectorAll('[data-focus-chart]')) {
      const element = host.querySelector('.gf-chart');
      const chart = echarts.init(element); charts.push(chart);
      const source = figureSource;   // the trend the rendered stage read
      const update = () => { chart.setOption(progressOption(source, kit.trialColors()), true); chart.resize(); };
      update(); const observer = new ResizeObserver(update); observer.observe(element); observers.push(observer);
    }
  }
  function dispose() {
    for (const observer of observers) observer.disconnect();
    for (const chart of charts) chart.dispose();
    charts = []; observers = [];
  }

  /* ---- actions ---------------------------------------------------------------- */
  // A save either lands with the manufactured clock's stamp or fails as an
  // ordinary error; nothing is written anywhere.
  function save(kind, conclusion) {
    if (saveFails) { saveFails = false; if (ownsControls) mockbar.querySelector('[aria-label="Next Focus save fails"]').checked = false; else onSaveFailed(); memory.error = kind; return false; }
    memory.error = null;
    if (kind === 'pin') memory.focus = { at: pinnedAt(), known: snapshot() };
    if (kind === 'resolve') memory.record = { conclusion, endedAt: stationOf().now, trend: structuredClone(trend()), readAt: trendReadAt() };
    return true;
  }
  function bind() {
    for (const button of surface.querySelectorAll('[data-focus]')) button.onclick = () => {
      const what = button.dataset.focus;
      if (what === 'pin' || what === 'retry-pin') {
        if (save('pin')) { view.asideOpen = false; kit.navigate('overview'); }
        else { view.focusAfterRender = '[data-focus="retry-pin"]'; view.sheetOpen = narrow(); kit.render(); }
      } else if (what === 'dropped') { memory.showDropped = true; kit.navigate('changes'); }
      else if (what.startsWith('seat-')) { seat = what.slice(5); kit.render(); }
      // retry-resolve submits the conclusion form; the form's own handler admits it
    };
  }
  return {
    load(json) { data = json; controls(); },
    bundle: () => initial(),
    // The Day desk's set at this station: the case file's own days at the first
    // clock, the follow-up read's days up to the clock at the later two.
    dayset() {
      const day = stationOf().now.slice(0, 10);
      if (station === 'before') return { days: initial().days, recorded: Object.keys(initial().days).sort(), readAt: initial().scenarios.window.end, viewedAt: stationOf().now, evidence: initial() };
      return { days: data.following_days, recorded: data.following_recorded_dates.filter(iso => iso <= day), readAt: data.reviewed_at.following, viewedAt: stationOf().now, evidence: data.following_evidence };
    },
    // this case file serves no questions and no pump profile; the utilities open empty
    utilityContext: () => ({ key: 'focus', now: stationOf().now, utilities: null, profile: null, changes: [] }),
    frame, priority, bind, mountCharts, dispose,
    // the shared journey drives the clock and the save fate in place of the
    // review controls this module would otherwise own
    stations: () => STATIONS(), station: () => station, setStation, setSaveFails(value) { saveFails = value; },
    pinned, active, trial, resolved,
    // engaged: this branch holds the current change or its record
    engaged: () => pinned() || !!memory.record,
    onNavigate(next) { if (next !== 'changes') memory.showDropped = false; },
    setAside(reason) { memory.aside = { reason, at: stationOf().now }; },
    restore() { memory.aside = null; },
    // the resolution records the wearer's words with the manufactured clock and the
    // trend this page holds; a failed save keeps the form and its Retry
    finish(conclusion) { return save('resolve', conclusion); },
    finished: () => memory.record,
    escape() { if (narrow() && seat !== 'progress') { seat = 'progress'; return true; } return false; },
  };
}
