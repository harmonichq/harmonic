// The Day desk: the five-track chronology, the week ribbon, its month, the
// day's statistics and the Episode Log (HV2-13), plus the contextual entry that
// carries a subject and returns to the exact target it left (HV2-14).
//
// Ported from the ★ LOCKED desktop prototype under the harmonic-v2-desktop lock
// manifest, with one substitution: the prototype read a captured day set, and
// this reads the served API through the one client.
// Every figure is still drawn by the shipped builders — buildLanesOption for the
// five strips, the Episode Log ledger for the rows, the navigator's own geometry
// for the ribbon and the month — so the desk seats them and derives nothing.
//
// PUBLISHED FOR CHUNKS 2 AND 3:
//
//   openDay(context)     a contextual Day entry; the caller supplies the context
//   dayReturnTarget()    where the current entry returns to, and to what focus
//
// A supporting night, an occurrence, a follow-up or a utility calls openDay (or
// navigate('day', context), which is the same door); none of them re-implements
// this desk.
import { buildLanesOption, LANE_SPAN } from '../frontend/chart-builders.js';
import {
  buildEpisodeLedger, buildRows, dayStats, focusUpdate, preemptedTimes,
  KIND_GLYPH, KIND_LABEL,
} from '../frontend/day-chart.js';
import { buildHeroOption, HERO } from '../frontend/day-hero-chart.js';
import {
  fmtISO, monthCells, monthOf, navDaySummary, navSeverity, sparkGeom, washOpacity, weekOf, weekRibbonGeom,
} from '../frontend/nav-chart.js';
import { canStepNext, canStepPrev, clampDay, coldArrivalDay, dayBounds, weekdayLabel } from '../frontend/daily-nav.js';
import {
  fetchCarbs, fetchDayNavigator, fetchModelView, fetchStatus, fetchTimeline,
} from './client.js';
import { deskColors } from './colors.js';
import {
  clock, date, desk, e, emptyFrame, errorFrame, loadingFrame, nameplate, readingHeader, sheetToggle, stamp,
} from './frame.js';
import {
  currentDestination, hold, load, narrow, navigate, registerDestination, registerEscape, render, view,
} from './routes.js';
import { UTILITY_TITLE, reopenUtility } from './utilities.js';

// The shipped navigator's drawing boxes (index.html DN_RB / DN_CELL): the ribbon
// and the month cell sparklines scale to their columns, strokes stay one pixel.
const RIBBON = { w: 980, h: 58 };
const CELL = { w: 100, h: 30 };
// The five-strip layout's fractions are written for the shipped 524px host
// (index.html .ds-chart), whose bottom 3% holds the time labels. This desk's
// chart row is whatever height the viewport leaves, so the strips are re-seated
// into the height above a label reserve, and the hairline span follows the seat.
const AXIS_RESERVE = 24;
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// The Episode Log's band words and the verdict words the ledger sorts rows by.
const STATE_WORD = { fired: 'finding', outranked: 'outranked', near_miss: 'also checked', clean: 'clean', no_data: 'no data' };
const LEVER_WORD = { over_treated_low: 'over-treated low', correction_on_iob: 'correction on IOB', correction_stacking: 'stacked corrections', carb_undercount: 'carbs undercounted', late_bolus: 'late bolus', meal_over_delivery: 'meal over-delivery' };

// The destination labels a return names. A utility origin names the utility
// itself, because that is what the reader closed to get here (S76) — and it
// names it out of the utility layer's own title table, so the label on the
// Open Day control and the label on the return can never disagree.
const DESTINATION_LABEL = { diagnose: 'Diagnose', changes: 'Changes', day: 'Day' };

/* ------------------------------------------------------- the desk's memory */

// The held date, the open month, the subject a contextual entry came from, the
// focused log moment — and the served material each of them reads.
const memory = {
  date: null, month: null, focusT: null, moved: null, entry: null,
  bounds: null, months: new Map(), day: null, error: null,
};

const monthKey = (iso) => String(iso).slice(0, 7);
const loadedDays = () => [...memory.months.values()].flat();
const recorded = () => loadedDays().filter((row) => row.has_data).map((row) => row.iso).sort();
const earliest = () => memory.bounds?.earliest || null;
const latest = () => memory.bounds?.latest || null;

/* ------------------------------------------------------------ served reads */

// Every read goes through the desk's one loader, which is also what keeps an
// arriving frame's focus target alive across the loading render.
const read = (key, run) => load(key, run, (error) => { memory.error = error; });

async function loadBounds() {
  const status = await fetchStatus();
  memory.bounds = {
    earliest: status.earliest_data_day || null,
    latest: status.latest_data_day || null,
    // The read this desk shows: when the store last took data. A store that was
    // never fetched — the offline synthetic one, for instance — has none, and
    // the desk says what it is viewed at instead of inventing a read.
    readAt: status.last_success_at || status.last_written || null,
  };
}

async function loadMonth(key) {
  const payload = await fetchDayNavigator(key);
  // The navigator pads a week either side of the month, which is exactly the
  // reach a week ribbon on a month edge needs.
  memory.months.set(key, payload.days || []);
}

async function loadDay(iso) {
  const range = dayBounds(iso);
  const [model, timeline, carbs] = await Promise.all([
    fetchModelView(iso),
    fetchTimeline(range),
    fetchCarbs(range).catch(() => ({ carb_entries: [] })),
  ]);
  memory.day = { iso, model, timeline, carbs: carbs?.carb_entries || [] };
}

/* ------------------------------------------------------------- the arrival */

// The held date follows the read: a date this store has not recorded moves to
// the nearest recorded day, and the desk says so rather than showing an empty
// one as though it were the answer.
function settle() {
  if (!memory.date) memory.date = coldArrivalDay(latest(), null);
  if (!memory.date) return;
  const clamped = clampDay(memory.date, earliest(), latest());
  if (clamped !== memory.date) { memory.moved = memory.date; memory.date = clamped; }
}

// A contextual entry takes its subject's date and remembers where it came from;
// a direct entry keeps the last day looked at and drops any subject (HV2-13).
function adopt(context) {
  const key = JSON.stringify(context);
  if (memory.entry?.key === key) return;
  memory.moved = null;
  if (context.date) {
    memory.entry = { key, ...context };
    memory.date = context.date;
    memory.focusT = context.moment || null;
  } else {
    memory.entry = { key };
  }
  memory.month = null;
}

/**
 * Where this entry returns to, and to what.
 *
 * `from` is the return target, written `<destination>` for an ordinary
 * contextual entry and `<destination>.<utility>` when a utility opened Day: a
 * utility's Day entry returns into that utility, over the destination it was
 * opened on, and is NAMED for the utility (S76, `Return to Carb questions`).
 * Null on a direct entry, which offers no return at all (HV2-13).
 */
export function dayReturnTarget(entry = memory.entry) {
  if (!entry?.date || !entry.from) return null;
  const [destination, utility = null] = String(entry.from).split('.');
  return {
    utility,
    destination: DESTINATION_LABEL[destination] ? destination : 'diagnose',
    label: utility ? (UTILITY_TITLE[utility] || utility) : (DESTINATION_LABEL[destination] || 'Diagnose'),
    focus: entry.focus || null,
    subject: entry.subject || '',
  };
}

/** Keep the evidence address, including the opaque occurrence, on return. */
export function dayReturnContext(entry = memory.entry) {
  const { key, ...context } = entry || {};
  return context;
}

/** A contextual Day entry. The caller supplies the context; Day owns the rest. */
export function openDay(context = {}) {
  navigate('day', context);
}

/* -------------------------------------------------------------- the frame */

const decorate = (iso, rows) => {
  const row = rows.find((item) => item.iso === iso) || { iso, has_data: false, lows: 0, highs: 0, tir: 0, curve: [] };
  const [y, m, d] = iso.split('-').map(Number);
  const sev = navSeverity(row);
  return { ...row, iso, dom: d, dow: new Date(y, m - 1, d).getDay(), real: Boolean(row.has_data), sev, summary: navDaySummary(row, sev) };
};

const curveOf = (day) => (day.curve || []).map((point) => ({ x: point.x, bg: point.bg }));

// The week: seven columns edge to edge, the trace continuous across recorded
// days and broken at a gap, each column a button naming its day and severity.
function ribbon(week, rows, held) {
  const days = week.map((iso) => decorate(iso, rows));
  const g = weekRibbonGeom(days, days.map(curveOf), RIBBON.w, RIBBON.h);
  const washes = days.map((day) => `<i style="--sev:var(${day.sev.varName});opacity:${day.real ? washOpacity(day.sev) : 0}"></i>`).join('');
  const svg = `<svg viewBox="0 0 ${RIBBON.w} ${RIBBON.h}" preserveAspectRatio="none" aria-hidden="true"><rect class="band" x="0" y="${g.bandY}" width="${RIBBON.w}" height="${g.bandH}"/><line class="guide" x1="0" x2="${RIBBON.w}" y1="${g.y70}" y2="${g.y70}"/><line class="guide" x1="0" x2="${RIBBON.w}" y1="${g.y180}" y2="${g.y180}"/>${g.subpaths.map((d) => `<path class="trace" d="${d}"/>`).join('')}${g.highDots.map((p) => `<circle class="high" cx="${p.cx}" cy="${p.cy}" r="1.5"/>`).join('')}${g.lowDots.map((p) => `<circle class="low" cx="${p.cx}" cy="${p.cy}" r="1.5"/>`).join('')}</svg>`;
  const cols = days.map((day) => `<button class="gf-nav-col" data-pick="${day.iso}" aria-pressed="${day.iso === held}" ${day.real ? '' : 'disabled'} aria-label="${e(weekdayLabel(day.iso))} — ${day.real ? e(day.summary) : 'no data'}" style="--sev:var(${day.sev.varName})"><span class="dow">${DOW[day.dow]}</span><span class="dom">${day.dom}</span><span class="sev">${day.real ? `<span class="g">${e(day.sev.glyph)}</span> ${day.tir}%` : '—'}</span></button>`).join('');
  return `<div class="gf-nav-ribbon"><div class="gf-nav-washes">${washes}</div>${svg}<div class="gf-nav-cols" role="group" aria-label="Week">${cols}</div></div>`;
}

// The month, in the ribbon's place: the same columns, one row per week, a
// sparkline in each recorded cell; the chart beneath gives up the height.
function monthGrid({ y, m }, rows, held, bounds, arrived = true) {
  const first = fmtISO(y, m, 1);
  const last = fmtISO(y, m, new Date(y, m, 0).getDate());
  const step = `<div class="seg" role="group" aria-label="Month"><button data-day="prev-month" aria-label="Previous month" ${bounds.earliest && bounds.earliest < first ? '' : 'disabled'}>‹</button><button data-day="next-month" aria-label="Next month" ${bounds.latest && bounds.latest > last ? '' : 'disabled'}>›</button></div>`;
  const frame = (count, cells) => `<div class="gf-nav-month" role="group" aria-label="${MONTHS[m - 1]} ${y}"><div class="gf-nav-month-head">${step}<span class="meta">${count}</span></div><div class="gf-nav-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div><div class="gf-nav-cells">${cells}</div></div>`;

  // Stepping to another month is a served read, and the desk does not go blank
  // for it: the stage, the rail and this grid's own head stay put while the
  // month lands. It says it is loading rather than drawing every cell as "no
  // data" — that would be a claim about the wearer's record, not about a read.
  if (!arrived) return frame('', '<p class="gf-meta gf-nav-loading" role="status">Loading…</p>');

  const cells = monthCells(y, m).map((cell) => {
    if (cell.blank) return '<span class="gf-nav-cell blank"></span>';
    const day = decorate(cell.iso, rows);
    if (!day.real) return `<button class="gf-nav-cell" data-pick="${cell.iso}" disabled aria-label="${e(weekdayLabel(cell.iso))} — no data"><span class="dom">${cell.dom}</span></button>`;
    const g = sparkGeom(curveOf(day), CELL.w, CELL.h);
    return `<button class="gf-nav-cell" data-pick="${cell.iso}" aria-pressed="${cell.iso === held}" aria-label="${e(weekdayLabel(cell.iso))} — ${e(day.summary)}" style="--sev:var(${day.sev.varName})"><span class="dom">${cell.dom}</span><span class="sev"><span class="g">${e(day.sev.glyph)}</span> ${day.tir}</span><svg viewBox="0 0 ${CELL.w} ${CELL.h}" preserveAspectRatio="none" aria-hidden="true"><rect class="band" x="${g.band.x}" y="${g.band.y}" width="${g.band.w}" height="${g.band.h}"/><path class="area" d="${g.area}"/><path class="trace" d="${g.line}"/></svg></button>`;
  }).join('');
  const inMonth = rows.filter((row) => row.has_data && row.iso >= first && row.iso <= last).length;
  return frame(`${inMonth} recorded days`, cells);
}

// The reading pane: the subject this entry came from, the day's own figures,
// and the Episode Log.
function reading({ stats, ledger, entry, moved, focusT, readAt, viewedAt }) {
  const nudge = moved ? `<p class="gf-note">${e(date(moved))} is not among this read's recorded days. The nearest recorded day is shown.</p>` : '';
  const back = dayReturnTarget(entry);
  const subject = back
    ? `<section class="gf-section"><h3>Opened from</h3><p>${e(back.subject)}</p>${nudge}<div class="gf-actions"><button class="gf-btn" data-day="return">Return to ${e(back.label)}</button></div></section>`
    : nudge;
  const figures = `<section class="gf-section"><h3>This day</h3>${stats && stats.n
    ? `<dl><dt>Time in range</dt><dd>${stats.tir}%</dd><dt>Lows</dt><dd>${stats.low}</dd><dt>Highs</dt><dd>${stats.high}</dd><dt>Readings</dt><dd>${stats.n}</dd><dt>Range</dt><dd>${e(stats.min)}–${e(stats.max)} mg/dL</dd></dl>`
    : '<p class="gf-meta">No glucose recorded.</p>'}</section>`;
  const row = (entryRow) => {
    const r = entryRow.row;
    return `<button class="gf-row gf-log-row" data-day-row="${e(r.t)}" aria-pressed="${focusT === r.t}"><span class="when">${e(clock(r.t))}</span><span class="tier" data-state="${e(r.state)}">${STATE_WORD[r.state] || e(r.state)}</span><span class="text"><span class="g" aria-hidden="true">${KIND_GLYPH[r.kind] || '·'}</span> ${e(KIND_LABEL[r.kind] || r.kind)}${r.bg != null ? ` · ${e(Math.round(r.bg))} mg/dL` : ''}${r.lever ? ` · ${e(LEVER_WORD[r.lever] || r.lever)}` : ''}</span></button>`;
  };
  const band = (title, entries) => (entries.length ? `<div class="gf-log-cap">${title} · ${entries.length}</div>${entries.map(row).join('')}` : '');
  const quiet = ledger && ledger.quiet.rows.length
    ? `<div class="gf-log-cap">Quiet · ${ledger.quiet.rows.length}</div><p class="gf-meta">${e(clock(ledger.quiet.start))}–${e(clock(ledger.quiet.end))} · ${ledger.quiet.clean} clean · ${ledger.quiet.explained} explained · ${ledger.quiet.noData} no data</p>`
    : '';
  const log = ledger && ledger.total
    ? `${band('Findings', ledger.findings)}${band('Also checked', ledger.alsoChecked)}${quiet}`
    : `<p class="gf-meta">No episode ${readAt ? `in the ${e(stamp(readAt))} read ` : ''}falls on this day.</p>`;
  return `${readingHeader('Episode Log', readAt ? `read ${e(stamp(readAt))}` : `viewed ${e(stamp(viewedAt))}`)}<div class="gf-pane-body">${subject}${figures}<section class="gf-section" role="group" aria-label="Episode Log">${log}</section></div>`;
}

/**
 * The Day desk's complete markup for one settled state. Pure: everything it
 * renders is in `state`, which is what lets `node --test` read the selectors and
 * the copy back without a browser.
 */
export function dayFrame(state) {
  const {
    iso, rows, bounds, month, monthArrived = true, stats, ledger, entry, moved, focusT,
    readAt, viewedAt, isNarrow,
  } = state;
  if (!iso) {
    return emptyFrame('Day', 'No days recorded', 'This store has no recorded day yet.',
      '<button class="gf-btn primary" data-destination-action="diagnose">Return to Diagnose</button>');
  }
  const held = decorate(iso, rows);
  const recordedCount = rows.filter((row) => row.has_data).length;
  const sub = stats && stats.n
    ? `<b>${stats.tir}% in range</b> · ${stats.low} ${stats.low === 1 ? 'low' : 'lows'} · ${stats.high} ${stats.high === 1 ? 'high' : 'highs'} · ${stats.n} readings · ${e(stats.min)}–${e(stats.max)} mg/dL`
    : 'No glucose recorded this day.';
  // The read that serves this desk, and the clock it is viewed at when later.
  const same = readAt && String(readAt).slice(0, 16) === String(viewedAt).slice(0, 16);
  const kicker = readAt
    ? `Day · read <b>${e(stamp(readAt))}</b>${same ? '' : ` · viewed ${e(stamp(viewedAt))}`}`
    : `Day · viewed <b>${e(stamp(viewedAt))}</b>`;
  const head = nameplate({ kicker, title: `${e(weekdayLabel(iso))}, ${iso.slice(0, 4)}`, sub });
  const step = `<div class="seg" role="group" aria-label="Recorded day"><button data-day="prev" aria-label="Previous recorded day" ${canStepPrev(iso, bounds.earliest) ? '' : 'disabled'}>‹</button><button data-day="next" aria-label="Next recorded day" ${canStepNext(iso, bounds.latest) ? '' : 'disabled'}>›</button><button data-day="latest" ${iso === bounds.latest ? 'disabled' : ''}>Latest</button></div>`;
  const week = weekOf(iso);
  const monthOpen = Boolean(month);
  const monthToggle = `<button class="gf-btn gf-month-toggle" data-day="month" aria-expanded="${monthOpen}" aria-controls="gf-nav">${monthOpen ? 'Week' : 'Month'} <span aria-hidden="true">${monthOpen ? '▴' : '▾'}</span></button>`;
  const bound = bounds.earliest && bounds.latest ? `${recordedCount} recorded ${recordedCount === 1 ? 'day' : 'days'} · ${e(date(bounds.earliest))} to ${e(date(bounds.latest))}` : '';
  const rail = `<div class="instruments"><div class="instrument"><span class="cap">Recorded days</span>${step}<span class="meta gf-desk-only">${bound}</span></div><div class="instrument gf-tools"><span class="meta">${monthOpen ? `${MONTHS[month.m - 1]} ${month.y}` : `Week of ${e(date(week[0]))}`}</span>${monthToggle}${isNarrow ? sheetToggle('Episode Log', view.sheetOpen) : ''}</div></div>`;
  const nav = `<div id="gf-nav" class="gf-nav" data-open="${monthOpen ? 'month' : 'week'}">${monthOpen ? monthGrid(month, rows, iso, bounds, monthArrived) : ribbon(week, rows, iso)}</div>`;
  const colors = state.colors;
  const key = `<div class="ds-chart-legend"><span><i style="background:${colors.inRange}"></i>in range</span><span><i style="background:${colors.high}"></i>high</span><span><i style="background:${colors.low}"></i>low</span><span><i style="background:${colors.accent}"></i>bolus</span><span><i style="background:${colors.secondary}"></i>carbs (bolus)</span><span style="color:${colors.manualCarb}">◗ carbs (logged)</span>${isNarrow ? '' : `<span><i style="background:${colors.basal}"></i>basal Δ · adding above, cutting below</span><span><i style="background:${colors.line}"></i>context · sleep, fasting, suspend</span>`}</div>`;
  const stage = `<section class="pane gf-stage gf-stage-day" aria-label="Day">${head}${rail}${nav}
      <div class="gf-fig gf-fig-day" data-day-chart="${isNarrow ? 'hero' : 'lanes'}"><div class="gf-chart-seat"><div class="gf-chart" role="img" aria-label="${e(held.summary)}"></div></div>${key}</div></section>`;
  return desk(stage, `<aside class="pane gf-reading" aria-label="Episode Log">${reading({ stats, ledger, entry, moved, focusT, readAt, viewedAt })}</aside>`);
}

/* ------------------------------------------------------------------ charts */

// The strip stack's height once the time labels have their reserve, and the
// hairline's span of the full element expressed over that seat.
const seatedHeight = (element) => Math.max(0, element.clientHeight - AXIS_RESERVE);
function seatedSpan(element) {
  const seat = element.clientHeight ? seatedHeight(element) / element.clientHeight : 1;
  return { top: LANE_SPAN.top * seat, bottom: LANE_SPAN.bottom * seat };
}

function mountCharts(host) {
  const chartHost = host.querySelector('[data-day-chart]');
  if (!chartHost || !globalThis.echarts || !memory.day) return;
  const element = chartHost.querySelector('.gf-chart');
  const { iso, model, timeline, carbs } = memory.day;
  const colors = deskColors();
  const chart = globalThis.echarts.init(element);
  hold(() => chart.dispose());
  const logged = carbs.filter((entry) => String(entry.t).slice(0, 10) === iso);
  const update = () => {
    let option;
    if (chartHost.dataset.dayChart === 'hero') {
      option = buildHeroOption(timeline, iso, { colors, xMin: timeline.start.replace(' ', 'T'), xMax: timeline.end.replace(' ', 'T') });
      const scale = Math.max(0.42, element.clientHeight / HERO.H);
      for (const grid of option.grid) { grid.top *= scale; grid.height *= scale; }
    } else {
      option = buildLanesOption(timeline, iso, { colors, carbEntries: logged, restWindows: timeline.rest_windows || [] });
      const usable = seatedHeight(element);
      for (const grid of option.grid) {
        grid.top = (parseFloat(grid.top) / 100) * usable;
        grid.height = (parseFloat(grid.height) / 100) * usable;
      }
      const focus = focusUpdate(chart, {
        day: model, rows: buildRows(model), colors, focusT: null,
        preempted: preemptedTimes(model), selectedLever: null, laneSpan: seatedSpan(element),
      });
      option.series.push(...focus.series);
    }
    chart.setOption(option, true);
    chart.resize();
    if (memory.focusT && chartHost.dataset.dayChart === 'lanes') {
      // The one cross-track hairline, merged into the live chart, never a rebuild.
      const { series, graphic } = focusUpdate(chart, {
        day: model, rows: buildRows(model), colors, focusT: memory.focusT,
        preempted: preemptedTimes(model), selectedLever: null, laneSpan: seatedSpan(element),
      });
      chart.setOption({ series, graphic }, { replaceMerge: ['graphic'] });
    }
  };
  update();
  const observer = new ResizeObserver(update);
  observer.observe(element);
  hold(() => observer.disconnect());
  // A marker on the evidence strip picks its log row.
  chart.on('click', (params) => {
    if (!params.data?._t) return;
    memory.focusT = params.data._t;
    view.focusAfterRender = `[data-day-row="${memory.focusT}"]`;
    render();
  });
}

/* ------------------------------------------------------------------ wiring */

const pick = (iso) => { memory.date = iso; memory.month = null; memory.focusT = null; memory.moved = null; };

// The nearest recorded day in `direction` within what is loaded; a step that
// leaves the loaded months pulls the neighbouring one in and settles there.
function step(direction) {
  const set = recorded();
  const next = direction < 0
    ? set.filter((iso) => iso < memory.date).at(-1)
    : set.find((iso) => iso > memory.date);
  if (next) { pick(next); return; }
  const edge = new Date(`${memory.date}T00:00:00`);
  edge.setMonth(edge.getMonth() + direction);
  const key = `${edge.getFullYear()}-${String(edge.getMonth() + 1).padStart(2, '0')}`;
  if (!memory.months.has(key)) read(`month:${key}`, () => loadMonth(key));
}

function bind(host) {
  for (const button of host.querySelectorAll('[data-pick]')) {
    button.onclick = () => { pick(button.dataset.pick); view.focusAfterRender = `[data-pick="${button.dataset.pick}"]`; render(); };
  }
  for (const button of host.querySelectorAll('[data-day-row]')) {
    button.onclick = () => {
      memory.focusT = memory.focusT === button.dataset.dayRow ? null : button.dataset.dayRow;
      view.focusAfterRender = `[data-day-row="${button.dataset.dayRow}"]`;
      render();
    };
  }
  for (const button of host.querySelectorAll('[data-day]')) {
    button.onclick = () => {
      const action = button.dataset.day;
      if (action === 'prev') step(-1);
      else if (action === 'next') step(1);
      else if (action === 'latest') pick(latest());
      else if (action === 'month') memory.month = memory.month ? null : monthOf(memory.date);
      else if (action === 'prev-month' || action === 'next-month') {
        let { y, m } = memory.month;
        m += action === 'next-month' ? 1 : -1;
        if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
        memory.month = { y, m };
      } else if (action === 'return') {
        // Back to the subject's own row; narrow keeps the sheet closed and
        // focuses its toggle. A utility origin reopens that utility over the
        // destination it was opened on.
        const back = dayReturnTarget();
        const context = dayReturnContext();
        memory.entry = null;
        if (back.utility) reopenUtility(back.utility);
        view.focusAfterRender = narrow() ? '.gf-sheet-toggle' : [back.focus, '.gf-reading > header h2'].filter(Boolean);
        navigate(back.destination, context);
        return;
      }
      view.focusAfterRender = action === 'month' ? '.gf-month-toggle' : `[data-day="${action}"]:not(:disabled), .gf-month-toggle`;
      render();
    };
  }
  const retry = host.querySelector('[data-retry]');
  if (retry) retry.onclick = () => { memory.error = null; render(); };
}

function dayState() {
  return {
    iso: memory.date,
    rows: loadedDays(),
    bounds: memory.bounds,
    month: memory.month,
    monthArrived: memory.months.has(memory.month ? `${memory.month.y}-${String(memory.month.m).padStart(2, '0')}` : monthKey(memory.date)),
    stats: dayStats(memory.day.model),
    ledger: buildEpisodeLedger(memory.day.model),
    entry: memory.entry,
    moved: memory.moved,
    focusT: memory.focusT,
    readAt: memory.bounds.readAt,
    viewedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    isNarrow: narrow(),
    colors: deskColors(),
  };
}

function copyAttributes(from, to) {
  for (const attribute of [...to.attributes]) to.removeAttribute(attribute.name);
  for (const attribute of [...from.attributes]) to.setAttribute(attribute.name, attribute.value);
}

// Keep the Day frame's three structural owners mounted.  A served day can
// replace its material, but it must not detach the standing stage, reader, or
// navigator while the reader follows a selected date.
function patchDayFrame(host, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup;
  const nextStage = template.content.querySelector('.gf-stage-day');
  const nextReading = template.content.querySelector('.gf-reading');
  const nextNav = template.content.querySelector('#gf-nav');
  const stage = host.querySelector('.gf-stage-day');
  const reading = host.querySelector('.gf-reading');
  const nav = host.querySelector('#gf-nav');
  if (!nextStage || !nextReading || !nextNav || !stage || !reading || !nav) return false;

  copyAttributes(nextNav, nav);
  nav.replaceChildren(...nextNav.childNodes);
  nextNav.replaceWith(nav);
  copyAttributes(nextStage, stage);
  stage.replaceChildren(...nextStage.childNodes);
  copyAttributes(nextReading, reading);
  reading.replaceChildren(...nextReading.childNodes);
  return true;
}

function mount(host, { context, retainFrame = false }) {
  adopt(context);
  // A read that failed is shown, not re-issued. This check leads because every
  // read below is started from inside a render: re-issuing one here on the
  // render its own failure triggered is an unbounded loop, and a refused read —
  // an unauthenticated one, for instance — is exactly when that happens. The
  // Retry clears this and the next render starts the read again.
  if (memory.error) { host.innerHTML = errorFrame('Day', 'This day'); bind(host); return; }
  if (!memory.bounds) { read('bounds', loadBounds); host.innerHTML = loadingFrame('Day'); return; }
  settle();
  if (!memory.date) {
    host.innerHTML = dayFrame({ iso: null });
    bind(host);
    return;
  }
  // The month the GRID shows is read when the reader steps to it; the desk keeps
  // standing while that lands. Only the held day's OWN month is required to draw
  // anything at all, because the week ribbon is made of it.
  const shown = memory.month ? `${memory.month.y}-${String(memory.month.m).padStart(2, '0')}` : monthKey(memory.date);
  if (!memory.months.has(shown)) read(`month:${shown}`, () => loadMonth(shown));
  const held = monthKey(memory.date);
  if (!memory.months.has(held)) {
    read(`month:${held}`, () => loadMonth(held));
    if (retainFrame) { markRetainedFrameLoading(host); return; }
    host.innerHTML = loadingFrame('Day'); return;
  }
  if (memory.day?.iso !== memory.date) {
    read(`day:${memory.date}`, () => loadDay(memory.date));
    if (retainFrame) { markRetainedFrameLoading(host); return; }
    host.innerHTML = loadingFrame('Day'); return;
  }

  const markup = dayFrame(dayState());
  if (!(retainFrame && patchDayFrame(host, markup))) host.innerHTML = markup;
  bind(host);
  mountCharts(host);
}

function markRetainedFrameLoading(host) {
  const stage = host.querySelector('.gf-stage-day');
  if (!stage) return;
  stage.setAttribute('aria-busy', 'true');
  if (stage.querySelector('.gf-day-loading')) return;
  const loading = stage.ownerDocument.createElement('div');
  loading.className = 'gf-loading gf-day-loading';
  loading.setAttribute('role', 'status');
  loading.setAttribute('aria-label', 'Loading Day');
  stage.append(loading);
}

/** Seat the Day desk on the shell. Called once, by the entry module. */
export function installDay() {
  registerDestination({
    id: 'day', title: 'Day', mount,
    retainFrame: (host) => Boolean(host.querySelector('.gf-stage-day') && host.querySelector('.gf-reading') && host.querySelector('#gf-nav')),
  });
  // Day steps its month back to the week, then drops its focused log moment.
  registerEscape('day', () => {
    if (currentDestination() !== 'day') return false;
    if (memory.month) { memory.month = null; view.focusAfterRender = '.gf-month-toggle'; render(); return true; }
    if (memory.focusT) { memory.focusT = null; render(); return true; }
    return false;
  });
}
