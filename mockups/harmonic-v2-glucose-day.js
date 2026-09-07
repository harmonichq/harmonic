// Glucose first, desktop pass (#348). Unlocked design exploration: the Day
// destination. The shipped five-track day (frontend/chart-builders.js
// buildLanesOption) sits beside its Episode Log (frontend/day-chart.js
// buildEpisodeLedger) under a Sunday-to-Saturday week ribbon that expands in
// place to its month (frontend/nav-chart.js geometry, frontend/daily-nav.js
// bounds). Every offered date is a served Day payload of the current source at
// its clock; the latest recorded day opens first, never this machine's date.
// A direct entry holds no prior subject; a contextual entry (Open Day from an
// occurrence or a night) keeps its subject and returns to it. The narrow seat
// is the shipped two-track hero (frontend/day-hero-chart.js).
import { buildLanesOption, LANE_SPAN } from '../frontend/chart-builders.js';
import { buildEpisodeLedger, buildRows, dayStats, bgAt, preemptedTimes, focusUpdate, KIND_GLYPH, KIND_LABEL } from '../frontend/day-chart.js';
import { buildHeroOption, HERO } from '../frontend/day-hero-chart.js';
import { weekOf, monthOf, monthCells, fmtISO, sparkGeom, weekRibbonGeom, navSeverity, navDaySummary, washOpacity } from '../frontend/nav-chart.js';
import { coldArrivalDay, clampDay, weekdayLabel } from '../frontend/daily-nav.js';

// The shipped navigator's drawing boxes (index.html DN_RB / DN_CELL): the ribbon
// and the month cell sparklines scale to their columns, strokes stay one pixel.
const RIBBON = { w: 980, h: 58 };
const CELL = { w: 100, h: 30 };
// The five-strip layout's fractions are written for the shipped 524px host
// (index.html .ds-chart), whose bottom 3% holds the time labels. This desk's
// chart row is whatever height the viewport leaves, so the strips are re-seated
// into the height above a label reserve (the axis's 8px margin, 11px labels and
// a little air), and the hairline span follows the same seat.
const AXIS_RESERVE = 24;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The Episode Log's band words and the verdict words the ledger sorts rows by.
const STATE_WORD = { fired: 'finding', outranked: 'outranked', near_miss: 'also checked', clean: 'clean', no_data: 'no data' };
const LEVER_WORD = { over_treated_low: 'over-treated low', correction_on_iob: 'correction on IOB', correction_stacking: 'stacked corrections', carb_undercount: 'carbs undercounted', late_bolus: 'late bolus', meal_over_delivery: 'meal over-delivery' };

export function createDayDesk(kit, { dayset, carbEntries = () => [] }) {
  const { surface, colors, narrow, view, e, clock, date, stamp } = kit;
  // page memory: the held date, the open month, the subject a contextual entry
  // came from, the focused log moment
  const memory = { date: null, month: null, from: null, focusT: null, asked: null, moved: null };
  let charts = [], observers = [];

  /* ---- the served dates of this source at its clock -------------------------- */
  const set = () => dayset();
  const recorded = () => set().recorded.filter(iso => set().days[iso]).sort();
  const earliest = () => recorded()[0] || null;
  const latest = () => recorded().at(-1) || null;
  const payload = iso => set().days[iso] || null;
  // the shipped stats and severity words over the served payload (day-chart.dayStats
  // reads a {window, date} pair; the navigator reads lows/highs/tir)
  const stats = iso => (payload(iso) ? dayStats({ window: payload(iso), date: iso }) : { tir: null, low: 0, high: 0, n: 0 });
  const navDay = iso => { const s = stats(iso); return { iso, has_data: s.n > 0, lows: s.low, highs: s.high, tir: s.tir || 0 }; };
  // a sparkline curve from the served glucose: fractional hour-of-day, every third reading
  const curve = iso => (payload(iso)?.cgm || []).filter((p, i) => p.bg != null && i % 3 === 0).map(p => { const [h, m] = p.t.slice(11, 16).split(':').map(Number); return { x: (h * 60 + m) / 1440, bg: p.bg }; });
  const parts = iso => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, dow: new Date(y, m - 1, d).getDay() }; };
  const decorate = iso => { const row = navDay(iso), p = parts(iso), sev = navSeverity(row); return { ...row, iso, dom: p.d, dow: p.dow, real: row.has_data, sev, summary: navDaySummary(row, sev) }; };
  const prevDay = () => recorded().filter(iso => iso < memory.date).at(-1) || null;
  const nextDay = () => recorded().find(iso => iso > memory.date) || null;

  // The held date follows the source: a date the current clock has not recorded
  // yet, or that this source never served, moves to the nearest recorded day.
  function settle() {
    if (!recorded().length) { memory.date = null; return; }
    if (!memory.date) memory.date = coldArrivalDay(latest(), null);
    const clamped = clampDay(memory.date, earliest(), latest());
    if (!payload(clamped)) memory.date = recorded().filter(iso => iso <= clamped).at(-1) || recorded()[0]; else memory.date = clamped;
    if (memory.asked) { memory.moved = memory.asked !== memory.date ? memory.asked : null; memory.asked = null; }
  }

  /* ---- episodes for the Episode Log ------------------------------------------ */
  // The capture serves no per-date model view. The log's anchors are the read's
  // own evidence rows for the date, joined to their served episode through the
  // served occurrence → episode mapping; an anchor without a served episode
  // keeps the read's own episode id and the finding's lever, and no invented
  // start, end or steps. The glucose at an anchor is the served occurrence's,
  // else the nearest served reading.
  function episodes(iso) {
    const evidence = set().evidence; if (!evidence) return [];
    const rows = (evidence.finding_row?.evidence || []).filter(row => row.date === iso);
    const byId = new Map();
    for (const row of rows) {
      const occurrence = (evidence.case_file?.occurrences || []).find(o => o.anchor?.t === row.t);
      const served = occurrence && evidence.episode_ids?.[occurrence.id] ? evidence.scenarios?.episodes?.[evidence.episode_ids[occurrence.id]] : null;
      const id = served?.id || row.ep_id;
      if (!byId.has(id)) byId.set(id, { id, lever: served?.lever || evidence.finding_row.lever || null, start: served?.start || null, end: served?.end || null, spans_midnight: false, anchors: [] });
      byId.get(id).anchors.push({ t: row.t, kind: row.kind, bg: occurrence?.anchor?.bg ?? (payload(iso) ? bgAt({ window: payload(iso) }, row.t) : null), insulin: null, carbs: null, state: row.verdict, verdicts: [{ matched: row.verdict === 'fired' }] });
    }
    return [...byId.values()];
  }
  const modelDay = iso => ({ date: iso, window: payload(iso), episodes: episodes(iso) });

  /* ---- the frame --------------------------------------------------------------- */
  function frame() {
    settle();
    const iso = memory.date;
    if (!iso) return kit.emptyFrame('Day', 'No days recorded', `This source has no recorded day at ${e(stamp(set().viewedAt))}.`, '<button class="gf-btn primary" data-action="overview">Return to Overview</button>');
    const s = stats(iso), d = decorate(iso);
    const bounds = `${recorded().length} recorded ${recorded().length === 1 ? 'day' : 'days'} · ${e(date(earliest()))} to ${e(date(latest()))}`;
    const sub = s.n
      ? `<b>${s.tir}% in range</b> · ${s.low} ${s.low === 1 ? 'low' : 'lows'} · ${s.high} ${s.high === 1 ? 'high' : 'highs'} · ${s.n} readings · ${e(s.min)}–${e(s.max)} mg/dL`
      : 'No glucose recorded this day.';
    // the read that serves this set, and the clock it is viewed at when later
    const same = String(set().readAt).slice(0, 16) === String(set().viewedAt).slice(0, 16);
    const head = kit.nameplate({ kicker: `Day · read <b>${e(stamp(set().readAt))}</b>${same ? '' : ` · viewed ${e(stamp(set().viewedAt))}`}`, title: `${e(weekdayLabel(iso))}, ${parts(iso).y}`, sub });
    const step = `<div class="seg" role="group" aria-label="Recorded day"><button data-day="prev" aria-label="Previous recorded day" ${prevDay() ? '' : 'disabled'}>‹</button><button data-day="next" aria-label="Next recorded day" ${nextDay() ? '' : 'disabled'}>›</button><button data-day="latest" ${iso === latest() ? 'disabled' : ''}>Latest</button></div>`;
    const week = weekOf(iso);
    const monthOpen = !!memory.month;
    const monthToggle = `<button class="gf-btn gf-month-toggle" data-day="month" aria-expanded="${monthOpen}" aria-controls="gf-nav">${monthOpen ? 'Week' : 'Month'} <span aria-hidden="true">${monthOpen ? '▴' : '▾'}</span></button>`;
    const rail = `<div class="instruments"><div class="instrument"><span class="cap">Recorded days</span>${step}<span class="meta gf-desk-only">${bounds}</span></div><div class="instrument gf-tools"><span class="meta">${monthOpen ? `${MONTHS[memory.month.m - 1]} ${memory.month.y}` : `Week of ${e(date(week[0]))}`}</span>${monthToggle}${narrow() ? kit.sheetToggle('Episode Log') : ''}</div></div>`;
    const nav = `<div id="gf-nav" class="gf-nav" data-open="${monthOpen ? 'month' : 'week'}">${monthOpen ? monthGrid() : ribbon(week)}</div>`;
    const key = `<div class="ds-chart-legend"><span><i style="background:${colors.inRange}"></i>in range</span><span><i style="background:${colors.high}"></i>high</span><span><i style="background:${colors.low}"></i>low</span><span><i style="background:${colors.accent}"></i>bolus</span><span><i style="background:${colors.secondary}"></i>carbs (bolus)</span><span style="color:${colors.manualCarb}">◗ carbs (logged)</span>${narrow() ? '' : `<span><i style="background:${colors.basal}"></i>basal Δ · adding above, cutting below</span><span><i style="background:${colors.line}"></i>context · sleep, fasting, suspend</span>`}</div>`;
    const stage = `<section class="pane gf-stage gf-stage-day" aria-label="Day">${head}${rail}${nav}
      <div class="gf-fig gf-fig-day" data-day-chart="${narrow() ? 'hero' : 'lanes'}"><div class="gf-chart-seat"><div class="gf-chart" role="img" aria-label="${e(d.summary)}"></div></div>${key}</div></section>`;
    return kit.desk(stage, `<aside class="pane gf-reading" aria-label="Episode Log">${reading(iso)}</aside>`);
  }

  // The week: seven columns edge to edge, the trace continuous across recorded
  // days and broken at a gap, each column a button naming its day and severity.
  function ribbon(week) {
    const days = week.map(decorate), g = weekRibbonGeom(days, days.map(day => curve(day.iso)), RIBBON.w, RIBBON.h);
    const washes = days.map(day => `<i style="--sev:var(${day.sev.varName});opacity:${day.real ? washOpacity(day.sev) : 0}"></i>`).join('');
    const svg = `<svg viewBox="0 0 ${RIBBON.w} ${RIBBON.h}" preserveAspectRatio="none" aria-hidden="true"><rect class="band" x="0" y="${g.bandY}" width="${RIBBON.w}" height="${g.bandH}"/><line class="guide" x1="0" x2="${RIBBON.w}" y1="${g.y70}" y2="${g.y70}"/><line class="guide" x1="0" x2="${RIBBON.w}" y1="${g.y180}" y2="${g.y180}"/>${g.subpaths.map(d => `<path class="trace" d="${d}"/>`).join('')}${g.highDots.map(p => `<circle class="high" cx="${p.cx}" cy="${p.cy}" r="1.5"/>`).join('')}${g.lowDots.map(p => `<circle class="low" cx="${p.cx}" cy="${p.cy}" r="1.5"/>`).join('')}</svg>`;
    const cols = days.map(day => `<button class="gf-nav-col" data-pick="${day.iso}" aria-pressed="${day.iso === memory.date}" ${day.real ? '' : 'disabled'} aria-label="${e(weekdayLabel(day.iso))} — ${day.real ? e(day.summary) : 'no data'}" style="--sev:var(${day.sev.varName})"><span class="dow">${DOW[day.dow]}</span><span class="dom">${day.dom}</span><span class="sev">${day.real ? `<span class="g">${e(day.sev.glyph)}</span> ${day.tir}%` : '—'}</span></button>`).join('');
    return `<div class="gf-nav-ribbon"><div class="gf-nav-washes">${washes}</div>${svg}<div class="gf-nav-cols" role="group" aria-label="Week">${cols}</div></div>`;
  }
  // The month, in the ribbon's place: the same columns, one row per week, a
  // sparkline in each recorded cell; the chart beneath gives up the height.
  function monthGrid() {
    const { y, m } = memory.month;
    const cells = monthCells(y, m).map(cell => {
      if (cell.blank) return '<span class="gf-nav-cell blank"></span>';
      const day = decorate(cell.iso);
      if (!day.real) return `<button class="gf-nav-cell" data-pick="${cell.iso}" disabled aria-label="${e(weekdayLabel(cell.iso))} — no data"><span class="dom">${cell.dom}</span></button>`;
      const g = sparkGeom(curve(cell.iso), CELL.w, CELL.h);
      return `<button class="gf-nav-cell" data-pick="${cell.iso}" aria-pressed="${cell.iso === memory.date}" aria-label="${e(weekdayLabel(cell.iso))} — ${e(day.summary)}" style="--sev:var(${day.sev.varName})"><span class="dom">${cell.dom}</span><span class="sev"><span class="g">${e(day.sev.glyph)}</span> ${day.tir}</span><svg viewBox="0 0 ${CELL.w} ${CELL.h}" preserveAspectRatio="none" aria-hidden="true"><rect class="band" x="${g.band.x}" y="${g.band.y}" width="${g.band.w}" height="${g.band.h}"/><path class="area" d="${g.area}"/><path class="trace" d="${g.line}"/></svg></button>`;
    }).join('');
    const first = fmtISO(y, m, 1), last = fmtISO(y, m, new Date(y, m, 0).getDate());
    const stepMonth = `<div class="seg" role="group" aria-label="Month"><button data-day="prev-month" aria-label="Previous month" ${earliest() && earliest() < first ? '' : 'disabled'}>‹</button><button data-day="next-month" aria-label="Next month" ${latest() && latest() > last ? '' : 'disabled'}>›</button></div>`;
    return `<div class="gf-nav-month" role="group" aria-label="${MONTHS[m - 1]} ${y}"><div class="gf-nav-month-head">${stepMonth}<span class="meta">${recorded().filter(iso => iso >= first && iso <= last).length} recorded days</span></div><div class="gf-nav-dow">${DOW.map(d => `<span>${d}</span>`).join('')}</div><div class="gf-nav-cells">${cells}</div></div>`;
  }

  /* ---- the reading pane: the subject, the day's figures, the Episode Log ------ */
  function reading(iso) {
    const s = stats(iso), day = modelDay(iso), ledger = buildEpisodeLedger(day), read = set().readAt;
    // the asked-for date may sit outside this clock's recorded days; say so
    const moved = memory.moved ? `<p class="gf-note">${e(date(memory.moved))} is not among this read's recorded days. The nearest recorded day is shown.</p>` : '';
    const subject = memory.from ? `<section class="gf-section"><h3>Opened from</h3><p>${e(memory.from.label)}</p>${moved}<div class="gf-actions"><button class="gf-btn" data-day="return">Return to ${e(memory.from.destinationLabel)}</button></div></section>` : '';
    const figures = `<section class="gf-section"><h3>This day</h3>${s.n
      ? `<dl><dt>Time in range</dt><dd>${s.tir}%</dd><dt>Lows</dt><dd>${s.low}</dd><dt>Highs</dt><dd>${s.high}</dd><dt>Readings</dt><dd>${s.n}</dd><dt>Range</dt><dd>${e(s.min)}–${e(s.max)} mg/dL</dd></dl>`
      : '<p class="gf-meta">No glucose recorded.</p>'}</section>`;
    const row = entry => {
      const r = entry.row;
      return `<button class="gf-row gf-log-row" data-day-row="${e(r.t)}" aria-pressed="${memory.focusT === r.t}"><span class="when">${e(clock(r.t))}</span><span class="tier" data-state="${e(r.state)}">${STATE_WORD[r.state] || e(r.state)}</span><span class="text"><span class="g" aria-hidden="true">${KIND_GLYPH[r.kind] || '·'}</span> ${e(KIND_LABEL[r.kind] || r.kind)}${r.bg != null ? ` · ${e(Math.round(r.bg))} mg/dL` : ''}${r.lever ? ` · ${e(LEVER_WORD[r.lever] || r.lever)}` : ''}</span></button>`;
    };
    const band = (title, entries) => (entries.length ? `<div class="gf-log-cap">${title} · ${entries.length}</div>${entries.map(row).join('')}` : '');
    const quiet = ledger.quiet.rows.length ? `<div class="gf-log-cap">Quiet · ${ledger.quiet.rows.length}</div><p class="gf-meta">${e(clock(ledger.quiet.start))}–${e(clock(ledger.quiet.end))} · ${ledger.quiet.clean} clean · ${ledger.quiet.explained} explained · ${ledger.quiet.noData} no data</p>` : '';
    const log = ledger.total
      ? `${band('Findings', ledger.findings)}${band('Also checked', ledger.alsoChecked)}${quiet}`
      : `<p class="gf-meta">No episode in the ${e(stamp(read))} read falls on this day.</p>`;
    return `${kit.readingHeader('Episode Log', `read ${e(stamp(read))}`)}<div class="gf-pane-body">${subject}${figures}<section class="gf-section" role="group" aria-label="Episode Log">${log}</section></div>`;
  }

  /* ---- charts ------------------------------------------------------------------ */
  function mountCharts() {
    const host = surface.querySelector('[data-day-chart]'); if (!host || !globalThis.echarts) return;
    const element = host.querySelector('.gf-chart'), iso = memory.date, day = payload(iso);
    const chart = echarts.init(element); charts.push(chart);
    const logged = carbEntries().filter(entry => entry.t.slice(0, 10) === iso);
    const update = () => {
      let option;
      if (host.dataset.dayChart === 'hero') {
        option = buildHeroOption(day, iso, { colors, xMin: day.start.replace(' ', 'T'), xMax: day.end.replace(' ', 'T') });
        const scale = Math.max(.42, element.clientHeight / HERO.H);
        for (const grid of option.grid) { grid.top *= scale; grid.height *= scale; }
      } else {
        option = buildLanesOption(day, iso, { colors, carbEntries: logged, restWindows: day.rest_windows || [] });
        const usable = seatedHeight(element);
        for (const grid of option.grid) { grid.top = parseFloat(grid.top) / 100 * usable; grid.height = parseFloat(grid.height) / 100 * usable; }
        const model = modelDay(iso), rows = buildRows(model);
        const focus = focusUpdate(chart, { day: model, rows, colors, focusT: null, preempted: preemptedTimes(model), selectedLever: null, laneSpan: seatedSpan(element) });
        option.series.push(...focus.series);
      }
      chart.setOption(option, true); chart.resize();
      if (memory.focusT && host.dataset.dayChart === 'lanes') spotlight(chart, iso, element);
    };
    update(); const observer = new ResizeObserver(update); observer.observe(element); observers.push(observer);
    // a marker on the evidence strip picks its log row
    chart.on('click', params => { if (params.data?._t) { memory.focusT = params.data._t; view.focusAfterRender = `[data-day-row="${memory.focusT}"]`; kit.render(); } });
  }
  // the strip stack's height once the time labels have their reserve, and the
  // hairline's span of the full element expressed over that seat
  function seatedHeight(element) { return Math.max(0, element.clientHeight - AXIS_RESERVE); }
  function seatedSpan(element) {
    const seat = element.clientHeight ? seatedHeight(element) / element.clientHeight : 1;
    return { top: LANE_SPAN.top * seat, bottom: LANE_SPAN.bottom * seat };
  }
  // the one cross-track hairline, merged into the live chart, never a rebuild
  function spotlight(chart, iso, element) {
    const model = modelDay(iso), rows = buildRows(model);
    const { series, graphic } = focusUpdate(chart, { day: model, rows, colors, focusT: memory.focusT, preempted: preemptedTimes(model), selectedLever: null, laneSpan: seatedSpan(element) });
    chart.setOption({ series, graphic }, { replaceMerge: ['graphic'] });
  }

  /* ---- wiring ------------------------------------------------------------------ */
  function pick(iso) { memory.date = iso; memory.month = null; memory.focusT = null; memory.moved = null; }
  function bind() {
    for (const button of surface.querySelectorAll('[data-pick]')) button.onclick = () => { pick(button.dataset.pick); view.focusAfterRender = `[data-pick="${button.dataset.pick}"]`; kit.render(); };
    for (const button of surface.querySelectorAll('[data-day-row]')) button.onclick = () => { memory.focusT = memory.focusT === button.dataset.dayRow ? null : button.dataset.dayRow; view.focusAfterRender = `[data-day-row="${button.dataset.dayRow}"]`; kit.render(); };
    for (const button of surface.querySelectorAll('[data-day]')) button.onclick = () => {
      const action = button.dataset.day;
      if (action === 'prev' && prevDay()) pick(prevDay());
      else if (action === 'next' && nextDay()) pick(nextDay());
      else if (action === 'latest') pick(latest());
      else if (action === 'month') { memory.month = memory.month ? null : monthOf(memory.date); }
      else if (action === 'prev-month' || action === 'next-month') {
        let { y, m } = memory.month; m += action === 'next-month' ? 1 : -1;
        if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
        memory.month = { y, m };
      }
      else if (action === 'return') {
        // back to the subject's own row; narrow keeps the sheet closed and focuses its toggle
        const from = memory.from; memory.from = null;
        view.focusAfterRender = narrow() ? '.gf-sheet-toggle' : [from.focus, '.gf-reading > header h2'].filter(Boolean);
        // a utility's entry returns to that utility, over the destination it was opened on
        kit.navigate(from.destination, { utility: from.utility || null }); return;
      }
      view.focusAfterRender = action === 'month' ? '.gf-month-toggle' : `[data-day="${action}"]:not(:disabled), .gf-month-toggle`;
      kit.render();
    };
  }

  return {
    // direct entry keeps the held date and drops any subject; a contextual entry
    // takes its subject's date and remembers where it came from
    open({ date = null, from = null } = {}) { memory.from = date ? from : null; memory.moved = null; if (date) { memory.date = date; memory.asked = date; memory.focusT = null; } memory.month = null; },
    frame, bind, mountCharts,
    dispose() { for (const observer of observers) observer.disconnect(); for (const chart of charts) chart.dispose(); charts = []; observers = []; },
    escape() {
      if (memory.month) { memory.month = null; view.focusAfterRender = '.gf-month-toggle'; return true; }
      if (memory.focusT) { memory.focusT = null; return true; }
      return false;
    },
    date: () => memory.date,
  };
}
