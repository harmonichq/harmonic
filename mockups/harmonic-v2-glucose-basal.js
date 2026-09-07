// Glucose first, round 4 (#348). Unlocked design exploration: every basal slot
// of the original read, explorable from Explore whichever concern leads. The
// shipped lane (diagnose-workstation-chart.js buildSlotLane) seats one cell per
// analyzer slot with the backend's own verdict; the shipped slot inspector
// (diagnose-workstation.js renderSlotLevel) reads the served slot and its night
// evidence; the shipped basal evidence chart and Day builder draw the figures.
// Nothing here derives a floor, a direction or a number: a cell stages only where
// the source asserts a move, and it stages through the setting journey's one
// staging, so Explore, Changes and this lane read the same change.
//
// The read is the original one (journey.json initial.basal_exploration
// source_clock); at a later clock it is shown as that dated read, never as
// current. No served case carries a clock alignment, so no finding links into a
// slot from here (the roster's rows stay the way into a concern).
import { buildSlotLane, hhmm } from '../frontend/diagnose-workstation-chart.js';
import { renderSlotLevel } from '../frontend/diagnose-workstation.js';
import { EVIDENCE_CAP } from '../frontend/occurrence-roster.js';
import { basalEvidenceOption, nightFigureOption, nightKeyHtml } from './harmonic-v2-glucose-setting.js';

// The shipped lane's words (diagnose-workstation.js VERDICT_KEY / VERDICT_SHORT,
// which that module keeps private): what a verdict cell says, in full and in the key.
const VERDICT_KEY = { up: 'suggests a raise', down: 'suggests a lower', hold: 'holds at current', insufficient: 'insufficient evidence', nodata: 'no nights of steady data' };
const VERDICT_SHORT = { up: 'raise', down: 'lower', hold: 'hold', insufficient: 'insufficient', nodata: 'no data' };
const VERDICT_ORDER = ['up', 'down', 'hold', 'insufficient', 'nodata'];
// the same words counted over the lane, for the nameplate
const VERDICT_PLURAL = { up: 'suggest a raise', down: 'suggest a lower', hold: 'hold at current', insufficient: 'insufficient evidence', nodata: 'no nights of steady data' };

export function createBasalExploration(kit, { setting, gate, viewedAt }) {
  const { surface, colors, view, e, clock, date, shortDate, stamp } = kit;
  let data = null, days = null, lane = null;
  let charts = [], observers = [];
  // page memory: the slot in hand, one night per slot, the figure, the roster's fold
  const memory = { cell: null, night: {}, figure: 'basal', shown: EVIDENCE_CAP, notice: null };

  /* ---- served material ------------------------------------------------------ */
  const cells = () => lane.cells;
  const selected = () => cells()[memory.cell] || cells()[0];
  const evidenceOf = cell => data.slot_night_evidence[String(cell.i)] || null;
  const nightsOf = cell => evidenceOf(cell)?.nights || [];
  const nightOf = cell => nightsOf(cell).find(night => night.date === memory.night[cell.i]) || null;
  const span = cell => `${hhmm(cell.startMin)}–${hhmm(cell.endMin)}`;
  const range = cell => ({ start_min: cell.startMin, end_min: cell.endMin });
  const readAt = () => data.source_clock;
  const window_ = () => data.grouped_finding_projection.findings_window;
  // the cells a staging covers: the setting journey's approved hour, when staged
  const stagedSet = () => new Set(setting.staged() ? setting.slots() : []);
  // Whether the change is past staging on this desk: a draft undoes with the
  // staging, a recorded decision or a Trial does not.
  const past = () => setting.finished() || !['Staged', 'Draft saved', null].includes(setting.phase());

  /* ---- frame ------------------------------------------------------------------ */
  function frame(pane) {
    const cell = selected(), nights = nightsOf(cell), night = nightOf(cell), staged = stagedSet();
    const at = viewedAt(), later = String(at).slice(0, 16) !== String(readAt()).slice(0, 16);
    const counts = VERDICT_ORDER.filter(key => lane.counts[key]).map(key => `${lane.counts[key]} ${VERDICT_PLURAL[key]}`);
    const head = kit.nameplate({
      kicker: `Basal · ${e(shortDate(window_().start))} to ${e(date(window_().end))} · read <b>${e(stamp(readAt()))}</b>${later ? ` · viewed ${e(stamp(at))}` : ''}`,
      title: `All ${cells().length} basal slots`,
      sub: `<b>${e(counts[0] || '')}</b>${counts.slice(1).map(text => ` · ${e(text)}`).join('')} · ${e(window_().days)} d basal run`,
      end: setting.staged() ? '<button class="gf-btn" data-set="changes">Open Changes</button>' : '',
    });
    // the shipped lane and key, cell for cell (diagnose-workstation.js renderLane, renderLaneKey)
    const laneHtml = `<div class="dw gf-dw lane-wrap"><div class="lane" role="group" aria-label="Basal slot verdicts" style="grid-template-columns:repeat(${cells().length},1fr)">${cells().map(item => `<button type="button" class="lane-cell" data-cell="${item.i}" data-verdict="${item.verdict}" data-staged="${staged.has(item.i)}" aria-pressed="${item.i === cell.i}" title="${e(item.label)} · ${VERDICT_KEY[item.verdict]}" aria-label="${e(item.label)} basal slot, ${VERDICT_KEY[item.verdict]}"></button>`).join('')}</div>
      <div class="lane-key"><span class="lead">Basal slots</span>${VERDICT_ORDER.filter(key => lane.counts[key]).map(key => `<span title="${VERDICT_KEY[key]}"><i class="lane-cell" data-verdict="${key}"></i>${VERDICT_SHORT[key]} <b class="t">${lane.counts[key]}</b></span>`).join('')}</div></div>`;
    const slotSeg = '<div class="seg" role="group" aria-label="Slot"><button data-basal="previous-slot" aria-label="Previous slot">←</button><button data-basal="next-slot" aria-label="Next slot">→</button></div>';
    const nightSeg = `<div class="seg" role="group" aria-label="Night"><button data-basal="previous-night" aria-label="Previous night" ${nights.length ? '' : 'disabled'}>↑</button><button data-basal="next-night" aria-label="Next night" ${nights.length ? '' : 'disabled'}>↓</button></div>`;
    const figureSeg = `<div class="seg" role="group" aria-label="Figure">${[['basal', 'Basal'], ['night', 'Night'], ['day', 'Day']].map(([key, label]) => `<button data-figure="${key}" aria-pressed="${figureShown() === key}" ${key === 'basal' || night ? '' : 'disabled'}>${label}</button>`).join('')}</div>`;
    const position = night ? `${nights.indexOf(night) + 1} of ${nights.length}` : `${nights.length} ${nights.length === 1 ? 'night' : 'nights'}`;
    const figure = !nights.length
      ? `<div class="gf-fig gf-fig-empty"><div class="gf-empty-seat"><b>No nights of steady data in this slot at this read.</b><span>Pick another slot; the lane's coloured cells carry the nights this read served.</span></div></div>`
      : figureShown() === 'basal'
        ? '<div class="gf-fig gf-fig-basal" data-chart="basal" data-owner="basal"><div class="gf-chart"></div></div>'
        : `<div class="gf-fig gf-fig2" data-chart="${figureShown()}" data-owner="basal"><div class="gf-chart-seat"><div class="gf-chart"></div></div>${nightKeyHtml(colors, e(span(cell)))}</div>`;
    const stage = `<section class="pane gf-stage gf-stage-basal" aria-label="Basal slots" data-owner="basal">${head}
      <div class="instruments"><div class="instrument"><span class="cap">Basal slots</span><span class="meta">one cell per ${lane.slotMinutes} min · ← → moves</span></div><div class="instrument gf-tools">${slotSeg}${kit.sheetToggle(`Slot ${span(cell)}`)}</div></div>
      ${laneHtml}
      <div class="instruments"><div class="instrument"><span class="cap">Slot ${e(span(cell))}</span><span class="when">${e(VERDICT_KEY[cell.verdict])}</span><span class="meta">${night ? `${e(date(night.date))} · night ${position}` : e(position)}</span></div><div class="instrument gf-tools">${nightSeg}${figureSeg}</div></div>
      ${figure}</section>`;
    const reading = `<aside class="pane gf-reading" aria-label="Basal slot ${e(span(cell))}">${kit.readingHeader(`Basal ${e(span(cell))}`, `read ${e(shortDate(readAt()))} · ${e(clock(readAt()))}`)}<div class="gf-pane-body">
      ${memory.notice ? `<p class="gf-note" role="status">${e(memory.notice)}</p>` : ''}
      <div class="dw gf-dw level gf-slot-level" data-level></div>
      ${pane ? `<section class="gf-section"><div class="gf-roster-cap">${e(pane.title)} · ${pane.meta}</div></section>${pane.lead}` : ''}
    </div></aside>`;
    return kit.desk(stage, reading);
  }
  // a night figure needs a night; without one the basal chart stands
  const figureShown = () => (memory.figure !== 'basal' && !nightOf(selected()) ? 'basal' : memory.figure);

  /* ---- charts ----------------------------------------------------------------- */
  function mountCharts() {
    if (!globalThis.echarts) return;
    for (const host of surface.querySelectorAll('[data-owner="basal"][data-chart]')) {
      const element = host.querySelector('.gf-chart');
      const chart = echarts.init(element); charts.push(chart);
      const update = () => {
        const cell = selected(), night = nightOf(cell);
        const option = host.dataset.chart === 'basal'
          ? basalEvidenceOption(evidenceOf(cell), element, colors)
          : nightFigureOption(days[night.date], night.date, range(cell), host.dataset.chart === 'day', element, colors);
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
  function pick(i, focus = null) {
    memory.cell = (i + cells().length) % cells().length; memory.notice = null;
    view.focusAfterRender = focus; kit.render();
  }
  function moveNight(direction) {
    const cell = selected(), list = nightsOf(cell); if (!list.length) return;
    const at = list.indexOf(nightOf(cell));
    memory.night[cell.i] = list[(at + direction + list.length) % list.length].date;
    if (memory.figure === 'basal') memory.figure = 'night';
    view.focusAfterRender = '.case-occurrence[aria-pressed="true"]'; kit.render();
    surface.querySelector('.case-occurrence[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  // Staging is the setting journey's: its approved hour stages or unstages as
  // one, and Changes opens on it. A gate or a change past staging is said in
  // the foot instead (lockFoot), so this never runs there.
  function onStage(cell) {
    if (!cell.asserts || gate() || past()) return;
    if (setting.staged()) { setting.unstage(); view.focusAfterRender = '.stagebtn'; kit.render(); }
    else { setting.stage(); kit.navigate('changes'); }
  }
  // The shipped foot offers the stage button wherever the source asserts a move;
  // on this desk the one-change gate and a change past staging outrank it, so the
  // foot says which, with the way to Changes.
  function lockFoot(host) {
    const button = host.querySelector('.stagebtn'); if (!button) return;
    const held = gate();
    if (held) button.replaceWith(Object.assign(document.createElement('span'), { className: 'foot-note', textContent: held.note }));
    else if (past()) {
      const note = document.createElement('span'); note.className = 'foot-note';
      note.innerHTML = `${e(setting.phase())} · <button type="button" class="linkbtn" data-set="changes">Open Changes</button>`;
      button.replaceWith(note);
    }
  }
  function bind() {
    const host = surface.querySelector('[data-level]');
    if (host) {
      const cell = selected();
      renderSlotLevel(host, cell, stagedSet(), window_().days, null, onStage, {
        nightEvidence: evidenceOf(cell), selectedId: nightOf(cell)?.date ?? null, shownCount: memory.shown,
        onSelect: id => { memory.night[cell.i] = id; if (memory.figure === 'basal') memory.figure = 'night'; view.focusAfterRender = '.case-occurrence[aria-pressed="true"]'; kit.render(); },
        onMore: () => { memory.shown = memory.shown > EVIDENCE_CAP ? EVIDENCE_CAP : Infinity; view.focusAfterRender = '[data-level] .more'; kit.render(); },
        onClear: () => { delete memory.night[cell.i]; memory.figure = 'basal'; view.focusAfterRender = '.case-occurrence'; kit.render(); },
        onDay: night => kit.navigate('day', { date: night.date, from: { label: `Basal ${span(cell)} · night of ${date(night.date)}`, destination: 'explore', destinationLabel: 'Explore', focus: '.case-occurrence[aria-pressed="true"]' } }),
      });
      lockFoot(host);
      host.onkeydown = event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        if (!event.target.closest('.case-occurrence')) return;
        event.preventDefault(); moveNight(event.key === 'ArrowUp' ? -1 : 1);
      };
    }
    for (const button of surface.querySelectorAll('.lane-cell[data-cell]')) {
      button.onclick = () => pick(Number(button.dataset.cell), `.lane-cell[data-cell="${button.dataset.cell}"]`);
      button.onkeydown = event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const next = (Number(button.dataset.cell) + (event.key === 'ArrowLeft' ? -1 : 1) + cells().length) % cells().length;
        pick(next, `.lane-cell[data-cell="${next}"]`);
      };
    }
    for (const button of surface.querySelectorAll('[data-basal]')) button.onclick = () => {
      const action = button.dataset.basal;
      if (action === 'previous-slot') pick(selected().i - 1, '[data-basal="previous-slot"]');
      else if (action === 'next-slot') pick(selected().i + 1, '[data-basal="next-slot"]');
      else if (action === 'previous-night') moveNight(-1);
      else if (action === 'next-night') moveNight(1);
    };
    for (const button of surface.querySelectorAll('[data-owner="basal"] [data-figure]')) button.onclick = () => { memory.figure = button.dataset.figure; view.focusAfterRender = `[data-owner="basal"] [data-figure="${memory.figure}"]`; kit.render(); };
  }

  return {
    load(json, served) {
      data = json; days = served; lane = buildSlotLane(data.analysis_slots);
      // the first cell the read asserts a move for leads; every cell is reachable
      memory.cell = cells().find(cell => cell.asserts)?.i ?? 0;
    },
    frame, bind, mountCharts, dispose,
    // the slot lane's own summary line, for the roster row that opens it
    readAt,
    summary: () => `${cells().length} slots · ${VERDICT_ORDER.filter(key => lane.counts[key]).map(key => `${lane.counts[key]} ${VERDICT_SHORT[key]}`).join(' · ')} · read ${shortDate(readAt())} · ${clock(readAt())}`,
    escape() {
      if (nightOf(selected())) { delete memory.night[selected().i]; memory.figure = 'basal'; }
      else if (memory.figure !== 'basal') memory.figure = 'basal';
      else return false;
      return true;
    },
  };
}
