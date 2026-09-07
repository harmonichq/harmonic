// Glucose first, round 4 (#348). Unlocked design exploration: one synthetic May
// 2024 history read as a complete workflow — Overview, Explore, Changes and the
// context Day — over the setting and habit journeys this desk already carries.
//
// The generator serves the history as one shared original context and two
// alternative first choices from it: a setting branch (stage the basal change,
// Trial it) and a habit branch (pin the Focus, follow it). Both start from the
// same Jun 2 decision point; neither is a successor of the other. The review
// clock chooses which branch's later reads are served, and what this page
// remembers — set-asides, a staged change, a pin, a conclusion — stays put while
// the clock moves: a changing review clock never rewrites saved history.
//
// The roster is the shipped findings queue's own rows (diagnose-findings-queue.js
// queueRows): rank numerals, tier captions, the seam before the unranked tail and
// each row's one detail line are the projection's, never recomposed here. The
// guided concern in the tail carries no action; it is never a Focus.
import { TIER, TAIL_NOTE, queueRows } from '../frontend/diagnose-findings-queue.js';
import { createBasalExploration } from './harmonic-v2-glucose-basal.js';

export function createSharedJourney(kit, { createSettingJourney, createFocusJourney }) {
  const { surface, mockbar, view, e, clock, date, shortDate, stamp } = kit;
  let data = null, destination = 'overview', clockKey = 'original', readFails = false;
  // page memory: what the wearer did on this desk, in this page. The branches hold
  // their own (staged change, pin, record); the shared desk holds the set-asides
  // and the last read that answered.
  const memory = { aside: [], error: null, lastRead: null };
  const explore = { id: null };
  const gate = () => gateFor(shown());
  const onSaveFailed = () => { settingB.setSaveFails(false); focusB.setSaveFails(false); const box = mockbar.querySelector('[aria-label="Next journey save fails"]'); if (box) box.checked = false; };
  const settingB = createSettingJourney(kit, { controls: false, gate, onSaveFailed });
  const focusB = createFocusJourney(kit, { controls: false, gate, onSaveFailed });
  // The slot lane stages the setting branch's change, so it reads that change's
  // gate whether or not the current read still ranks the concern.
  const settingGate = () => gateFor(rowById(data.setting_branch.finding.id) || { id: data.setting_branch.finding.id, raw: { kind: 'setting' } });
  const basalB = createBasalExploration(kit, { setting: settingB, gate: settingGate, viewedAt: () => now() });
  const laneShown = () => destination === 'explore' && explore.id === 'basal';

  /* ---- clocks: the generator's own review times ------------------------------ */
  // The shared clock is the decision point both branches leave from; each branch
  // clock is one of that branch's served reviews. Choosing a branch clock sets the
  // other branch back to the decision point: the two are alternatives, so a Focus
  // never inherits a Trial's ending or the other way round.
  const CLOCKS = () => ({
    original: { branch: null, station: 'before', read: 'initial', now: data.focus_branch.reviewed_at.before, label: focusB.stations().before.label },
    captured: { branch: 'setting', station: 'captured', read: 'initial', now: settingB.stations().captured.now, label: settingB.stations().captured.label },
    trial: { branch: 'setting', station: 'trial', read: 'initial', now: settingB.stations().trial.now, label: settingB.stations().trial.label },
    ready: { branch: 'setting', station: 'ready', read: 'current', now: settingB.stations().ready.now, label: settingB.stations().ready.label },
    following: { branch: 'focus', station: 'following', read: 'following', now: focusB.stations().following.now, label: focusB.stations().following.label },
    preempted: { branch: 'focus', station: 'preempted', read: 'following', now: focusB.stations().preempted.now, label: focusB.stations().preempted.label },
  });
  const GROUPS = [['Shared context', ['original']], ['Setting branch', ['captured', 'trial', 'ready']], ['Focus branch', ['following', 'preempted']]];
  const clockOf = () => CLOCKS()[clockKey];
  const now = () => clockOf().now;
  function setClock(key) {
    if (!CLOCKS()[key]) return;
    clockKey = key;
    const { branch, station } = clockOf();
    settingB.setStation(branch === 'setting' ? station : 'before');
    focusB.setStation(branch === 'focus' ? station : 'before');
    // a later clock on the setting branch reads as the decision that branch records
    if (branch === 'setting') settingB.assume();
    explore.id = null;
    refresh();
  }

  /* ---- reads: what the source served at each clock ---------------------------- */
  // Three reads exist in the capture. The original read (Jun 1) serves every clock
  // up to the Trial's midpoint; the setting branch's ready review serves its own
  // current read; the Focus branch's follow-up serves its following read. Each
  // maps a row to the evidence bundle the investigation opens — the setting
  // concern's nights are the setting journey's own, and only at the original read.
  function current() {
    const kind = clockOf().read;
    if (kind === 'initial') {
      const initial = data.initial;
      return { kind, at: initial.provenance.selected_clock, findings: initial.source_findings, evidence: { [initial.behavioral_evidence.finding_row.id]: initial.behavioral_evidence, [data.setting_branch.finding.id]: 'setting' }, note: '' };
    }
    if (kind === 'current') {
      const evidence = data.setting_branch.current_evidence;
      return { kind, at: evidence.read_at, findings: evidence.source_findings, evidence: { [evidence.finding_row.id]: evidence, ...evidence.finding_evidence }, note: '' };
    }
    const evidence = data.focus_branch.following_evidence;
    return { kind, at: data.focus_branch.reviewed_at.following, findings: evidence.source_findings, evidence: { [evidence.finding_row.id]: evidence, ...evidence.finding_evidence }, note: '' };
  }
  // An ordinary read either answers or fails; a failure keeps the last read that
  // answered, labelled as such, and never touches page memory.
  function refresh() {
    memory.error = null;
    if (readFails) {
      readFails = false; const box = mockbar.querySelector('[aria-label="Next read fails"]'); if (box) box.checked = false;
      memory.error = 'read'; return;
    }
    memory.lastRead = current();
  }
  const read = () => memory.lastRead;
  // The Day desk's set at this clock: the branch's served days up to the clock,
  // and the episodes of the read that last answered, stamped with its time.
  function dayset() {
    const { branch: lead } = clockOf(), day = now().slice(0, 10), last = read();
    const evidence = last.kind === 'initial' ? data.initial.behavioral_evidence : last.kind === 'current' ? data.setting_branch.current_evidence : data.focus_branch.following_evidence;
    const source = lead === 'setting' ? { days: data.setting_branch.days, recorded: data.setting_branch.recorded_dates }
      : lead === 'focus' ? { days: data.focus_branch.following_days, recorded: data.focus_branch.following_recorded_dates }
      : { days: data.initial.days, recorded: data.initial.day_navigator.recorded_dates };
    return { days: source.days, recorded: source.recorded.filter(iso => iso <= day), readAt: last.at, viewedAt: now(), evidence };
  }

  /* ---- roster: the queue's rows over this read --------------------------------- */
  const rows = () => queueRows({ rows: read().findings }).filter(row => !row.hidden);
  const asideOf = row => memory.aside.find(item => item.id === row?.id) || null;
  const kindOf = row => (row.raw.kind === 'setting' ? 'setting' : 'habit');
  const isSetting = row => row && kindOf(row) === 'setting';
  // the next concern: the first ranked row not set aside. The unranked tail is a
  // guided look, not a priority, so it never leads Overview.
  const next = () => rows().find(row => row.rank != null && !asideOf(row)) || null;
  const rowById = id => rows().find(row => row.id === id) || null;
  // Which branch leads: the clock's own, else whichever this page engaged. A
  // branch stays engaged through its record, so Changes keeps the history.
  const branch = () => clockOf().branch || (focusB.engaged() ? 'focus' : settingB.engaged() ? 'setting' : null);
  const branchRow = () => (branch() === 'setting' ? rowById(data.setting_branch.finding.id) : branch() === 'focus' ? rowById(data.focus_branch.initial.finding_row.id) : null);
  const leadRow = () => ((settingB.active() || focusB.active()) && branchRow()) || next();
  const exploreRow = () => rowById(explore.id) || leadRow() || rows()[0] || null;
  const shown = () => (destination === 'explore' ? exploreRow() : destination === 'day' ? leadRow() || rows()[0] || null : leadRow());
  // the evidence this read serves for a row: a case-file bundle, the setting
  // journey's nights, or nothing
  const evidenceOf = row => (row ? read().evidence[row.id] || null : null);
  const bundleOf = row => { const item = evidenceOf(row); return item && item !== 'setting' ? item : null; };
  const detailLine = row => {
    const d = row.detail; if (!d) return '';
    if (d.kind === 'nums') return `${d.now}${d.then}`;
    if (d.kind === 'reason') return d.text;
    if (d.kind === 'history') return `${d.past} · ${d.support}`;
    if (d.kind === 'support') { const [{ count, noun }, run] = d.parts; return `${count} ${noun}${run ? ` · ${run}` : ''}`; }
    return d.parts.map(part => `${part.count} ${part.noun}`).join(' · ');
  };
  const tierWord = row => TIER[row.tier] || (row.tier === 'noted' ? 'Noted' : row.tier);
  // The setting branch's own phase word (Plan until a Trial exists), as the
  // other rows' gate reads it: what is underway, never a Trial before one runs.
  const GATE_WORD = { Staged: 'Change staged', 'Draft saved': 'Draft saved', Pending: 'Decision pending', 'On pump': 'On pump', Mismatch: 'Pump mismatch', 'Save failed': 'Save failed', Trial: 'Trial continues', 'Trial ready': 'Trial ready' };

  /* ---- gates: one watch, then a current read ----------------------------------- */
  // Copy here is the product rule the brief sets — one change at a time — in the
  // established words; the Trial's own message is the served one.
  function gateFor(row) {
    if (!row || asideOf(row)) return null;
    const kind = isSetting(row) ? 'setting' : 'focus';
    const lead = settingB.active() ? 'setting' : focusB.active() ? 'focus' : null;
    if (lead && lead !== kind) {
      const note = lead === 'setting'
        ? (settingB.trial()?.focus?.message || 'One change at a time. The basal change is staged; a Focus cannot start beside it.')
        : 'One change at a time. The Focus continues; a setting change cannot stage beside it.';
      return { status: `<span>${lead === 'setting' ? GATE_WORD[settingB.phase()] || settingB.phase() : 'Focus continues'}</span>`, end: '<button class="gf-btn" data-action="aside">Set aside</button>', note };
    }
    if (settingB.finished() || focusB.finished()) {
      return { status: '', end: '<button class="gf-btn" data-action="aside">Set aside</button>', note: `A next change starts from a current read. This read is from ${stamp(read().at)}.` };
    }
    return null;
  }

  /* ---- frames ------------------------------------------------------------------ */
  // null hands the destination to the shared investigation: a habit concern's case
  // file, cohorts, members, episodes and Day, with the habit journey's action beside.
  function frame(where) {
    destination = where;
    if (destination === 'changes') return changesFrame();
    if (destination === 'overview') return overviewFrame();
    if (laneShown()) return basalB.frame(pane());
    return subjectFrame(shown());
  }
  function overviewFrame() {
    if (settingB.active()) return settingB.frame('overview');
    if (focusB.active()) return focusB.frame('overview');
    if (memory.error) return failedFrame();
    const row = next();
    if (!row) return quietFrame();
    return subjectFrame(row);
  }
  function changesFrame() {
    if (branch() === 'setting' && settingB.engaged()) return settingB.frame('changes');
    if (branch() === 'focus' && focusB.engaged()) return focusB.frame('changes');
    const row = next();
    if (!row) return kit.emptyFrame('Changes', 'No change underway', memory.error ? 'The current read failed; nothing is ranked for action from the last read.' : 'Nothing is ranked for action in this read.', '<button class="gf-btn primary" data-action="explore">Open Explore</button>');
    if (isSetting(row) && evidenceOf(row) === 'setting' && !gateFor(row)) return settingB.frame('changes');
    if (!isSetting(row) && bundleOf(row) && !gateFor(row)) return focusB.frame('changes');
    return kit.emptyFrame('Changes', 'No change underway', `${e(row.title)} · ${e(tierWord(row))}. ${e(row.raw.headline)}`, `<button class="gf-btn primary" data-action="explore">Inspect ${isSetting(row) ? 'slots' : 'lows'}</button>${isSetting(row) ? '<button class="gf-btn" data-journey="lane">All basal slots</button>' : ''}`, gateFor(row)?.note || (isSetting(row) ? nightsNote() : ''));
  }
  function subjectFrame(row) {
    if (!row) return memory.error ? failedFrame() : quietFrame();
    if (isSetting(row)) return evidenceOf(row) === 'setting' ? settingB.priorityFrame(pane()) : rosterOnlyFrame(row);
    return bundleOf(row) ? null : rosterOnlyFrame(row);
  }
  function quietFrame() {
    const aside = memory.aside.length, tail = rows().filter(row => row.rank == null && !asideOf(row)).length;
    const copy = [aside ? `${aside} set aside` : '', tail ? `${tail} noted, not ranked` : '', `read ${stamp(read().at)}`].filter(Boolean).join(' · ');
    return kit.emptyFrame('Overview', 'No priority needs action', e(copy), '<button class="gf-btn primary" data-action="explore">Open Explore</button><button class="gf-btn" data-action="day">Open Day</button>');
  }
  function failedFrame() {
    const last = read();
    return kit.emptyFrame('Overview', 'Current read failed', `The last read that answered is from ${e(stamp(last.at))} · ${last.findings.length} findings. Nothing here changed.`, '<button class="gf-btn primary" data-journey="retry-read">Retry</button><button class="gf-btn" data-action="explore">Open Explore</button>');
  }

  // A concern this read ranks but serves no evidence bundle for: the row's own
  // facts — its detail line, its appearances or slots — and nothing drawn.
  function rosterOnlyFrame(row) {
    const hook = priorityFor(row), r = row.raw, family = isSetting(row) ? 'Basal' : (r.appearances?.[0]?.family === 'lows' ? 'Lows' : 'Findings');
    const head = kit.nameplate({
      kicker: `${e(family)} · read ${e(shortDate(read().at))}`,
      title: e(row.title),
      sub: `<b>${e(detailLine(row))}</b> · ${e(tierWord(row))}${hook.status ? ` · ${hook.status}` : ''}`,
      end: hook.end,
    });
    const table = isSetting(row)
      ? `<table class="gf-table gf-windows"><thead><tr><th>Slot</th><th>Now</th><th>Recommended</th><th>Nights</th></tr></thead><tbody>${(r.members || []).map(m => `<tr><td>${e(slotLabel(m.start_min))}</td><td>${e(m.current)} U/h</td><td>${e(m.recommended)} U/h</td><td>${e(m.estimate?.n ?? m.days)}</td></tr>`).join('')}</tbody></table>`
      : `<table class="gf-table gf-windows"><thead><tr><th>Low</th><th>Time</th><th>Verdict</th></tr></thead><tbody>${(r.evidence || []).map(item => `<tr><td>${e(shortDate(item.date))}</td><td>${e(clock(item.t))}</td><td>${e(String(item.verdict).replace('_', ' '))}</td></tr>`).join('')}</tbody></table>`;
    const stage = `<section class="pane gf-stage gf-stage-table" aria-label="Evidence">${head}
      <div class="instruments"><div class="instrument"><span class="cap">${isSetting(row) ? 'Slots in this read' : 'Appearances in this read'}</span><span class="meta">${e(r.headline)}</span></div><div class="instrument gf-tools">${kit.sheetToggle(isSetting(row) ? 'Nights' : 'Lows')}</div></div>
      <div class="gf-scroll">${table}<p class="gf-note">${isSetting(row) ? `${e(nightsNote())} <button class="linkbtn" data-journey="lane">Open all basal slots</button>` : 'This read serves no case file for this finding; its lows are listed as the read names them.'}</p></div></section>`;
    const reading = `<aside class="pane gf-reading" aria-label="${view.asideOpen ? 'Set aside' : e(pane()?.title || hook.title)}">${view.asideOpen ? kit.asideForm() : `${pane() ? kit.readingHeader(e(pane().title), pane().meta) : kit.readingHeader(e(hook.title), e(detailLine(row)))}<div class="gf-pane-body">${pane()?.lead || ''}${hook.lead}</div>`}</aside>`;
    return kit.desk(stage, reading);
  }
  const slotLabel = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  // What the investigation frame reads from this desk for the shown concern: the
  // habit journey's own hook for its concern, a guided look for the tail, and the
  // set-aside state over either.
  function priorityFor(row) {
    let hook;
    if (!isSetting(row) && row.id === data.focus_branch.initial.finding_row.id && bundleOf(row)) hook = focusB.priority(bundleOf(row));
    else if (isSetting(row)) hook = { title: 'Nights', status: gateFor(row)?.status || '', end: gateFor(row)?.end ?? '<button class="gf-btn" data-action="aside">Set aside</button>', lead: settingLead(row) };
    else hook = { title: 'Lows', status: '', end: row.rank == null ? '' : '<button class="gf-btn" data-action="aside">Set aside</button>', lead: guidedLead(row) };
    const aside = asideOf(row);
    if (aside) { hook.status = '<span>Set aside</span>'; hook.end = `<button class="gf-btn" data-restore="${e(row.id)}">Restore</button>`; }
    return hook;
  }
  const priority = () => priorityFor(shown());
  function settingLead(row) {
    const s = row.raw.support || {};
    return `<section class="gf-section"><h3>Action <span class="meta">${e(tierWord(row))}</span></h3>
      <p>${e(row.raw.headline)}</p>
      <div class="gf-figure">${e(s.n ?? '—')} ${e(s.noun || '')}<small>${s.run_days != null ? `${e(s.run_days)} d basal run` : ''}</small></div>
      ${gateFor(row)?.note ? `<p class="gf-note">${e(gateFor(row).note)}</p>` : `<p class="gf-note">${e(nightsNote())} <button class="linkbtn" data-journey="lane">Open all basal slots</button></p>`}</section>`;
  }
  // A read that serves no nights for the setting concern cannot stage it; the
  // dated original read's nights stay open under every slot.
  const nightsNote = () => `This read serves no nights for these slots, so nothing stages from it. The ${shortDate(basalB.readAt())} read's nights are under All basal slots.`;
  // The guided look: the source's tier and headline, verbatim, and the queue's own
  // tail note. No action is offered; a noted finding is not a Focus.
  function guidedLead(row) {
    return `<section class="gf-section"><h3>Guided look <span class="meta">${e(tierWord(row))}</span></h3>
      <p>${e(row.raw.headline)}</p>
      <p class="gf-meta">${e(TAIL_NOTE)}</p>
      <p class="gf-meta">A guided look opens the lows this showed up in. It does not start a Focus.</p></section>`;
  }

  // The roster pane leads Explore's reading pane: the queue's rows in the
  // server's order, the set-asides beneath with their reasons and a restore.
  function pane() {
    if (destination !== 'explore') return null;
    const selected = laneShown() ? null : exploreRow(), list = rows(), current = read();
    const row = item => {
      const aside = asideOf(item), lead = branchRow()?.id === item.id && (settingB.active() || focusB.active());
      const status = aside ? 'Set aside' : lead ? (branch() === 'setting' ? settingB.phase() : 'Focus') : settingB.finished() && branchRow()?.id === item.id ? 'Trial finished' : focusB.finished() && branchRow()?.id === item.id ? 'Focus resolved' : tierWord(item);
      return `<button class="gf-row gf-roster-row" data-row="${e(item.id)}" aria-pressed="${item.id === selected?.id}"><span class="rank">${item.rank ?? '·'}</span><span class="text"><strong>${e(item.title)}</strong><small>${e(detailLine(item))}${aside?.reason ? ` · ${e(aside.reason)}` : ''}</small></span><span class="tier">${e(status)}</span></button>`;
    };
    const ranked = list.filter(item => !asideOf(item)).map(item => `${item.caption ? `<div class="gf-roster-cap">${e(item.caption)}</div>` : ''}${item.seam ? `<div class="gf-roster-cap">${e(TAIL_NOTE)}</div>` : ''}${row(item)}`).join('');
    // a set-aside this read no longer carries stays listed, saying so, with its restore
    const aside = memory.aside.map(item => {
      const live = list.find(entry => entry.id === item.id);
      const line = live ? row(live) : `<div class="gf-row gf-roster-row" data-absent><span class="rank">·</span><span class="text"><strong>${e(item.title)}</strong><small>not in this read${item.reason ? ` · ${e(item.reason)}` : ''}</small></span><span class="tier">Set aside</span></div>`;
      return `<div class="gf-roster-aside">${line}<button class="gf-btn" data-restore="${e(item.id)}">Restore</button></div>`;
    }).join('');
    const failed = memory.error ? `<p class="gf-note">The current read failed. This is the last read that answered. <button class="gf-btn" data-journey="retry-read">Retry</button></p>` : '';
    const note = current.note ? `<p class="gf-meta">${e(current.note)}</p>` : '';
    // every basal slot of the original read, whichever concern leads; the row
    // carries the staged change's phase, as the concern's row does
    const lane = `<div class="gf-roster-cap">Every slot</div><button class="gf-row gf-roster-row" data-row="basal" aria-pressed="${laneShown()}"><span class="rank">·</span><span class="text"><strong>All basal slots</strong><small>${e(basalB.summary())}</small></span><span class="tier">${settingB.active() && branch() === 'setting' ? e(settingB.phase()) : 'Slots'}</span></button>`;
    return {
      title: 'Findings',
      meta: `${list.length} · read ${e(shortDate(current.at))} · ${e(clock(current.at))}`,
      lead: `<section class="gf-section gf-roster" role="group" aria-label="Findings">${failed}${ranked}${aside ? `<div class="gf-roster-cap">Set aside · ${memory.aside.length}</div>${aside}` : ''}${note}${lane}</section>`,
    };
  }

  /* ---- review controls, outside product chrome --------------------------------- */
  function controls() {
    if (mockbar.querySelector('.gf-review[data-source="journey"]')) return;
    const options = GROUPS.map(([label, keys]) => `<optgroup label="${e(label)}">${keys.map(key => `<option value="${key}" ${key === clockKey ? 'selected' : ''}>${e(CLOCKS()[key].label)}</option>`).join('')}</optgroup>`).join('');
    mockbar.querySelector('.gf-review-notes-body').insertAdjacentHTML('beforeend', `<p class="gf-review-memo" data-source="journey">One synthetic history. A branch clock serves that branch's later reads and sets the other branch back to the decision point; set-asides, a staged change, a pin and a conclusion are this page's memory and survive the clock.</p>
      <p class="gf-review-memo" data-source="journey">Fixture limits: the following read shows the follow-up review time as its read time (the capture serves none), and the capture holds no decision after the first, so a second change cannot stage in this history.</p>`);
    mockbar.querySelector('p').insertAdjacentHTML('beforebegin', `<span class="gf-review" data-source="journey" role="group" aria-label="Journey review controls">
      <label>Clock <select aria-label="Journey clock">${options}</select></label>
      <label><input type="checkbox" aria-label="Next journey save fails"> Next save fails</label>
      <label><input type="checkbox" aria-label="Next read fails"> Next read fails</label></span>`);
    mockbar.querySelector('[aria-label="Journey clock"]').onchange = event => {
      setClock(event.target.value);
      const url = new URL(location.href); url.searchParams.set('clock', clockKey); history.replaceState(null, '', url);
      view.sheetOpen = false; view.asideOpen = false; kit.render();
    };
    mockbar.querySelector('[aria-label="Next journey save fails"]').onchange = event => { settingB.setSaveFails(event.target.checked); focusB.setSaveFails(event.target.checked); };
    mockbar.querySelector('[aria-label="Next read fails"]').onchange = event => { readFails = event.target.checked; };
  }
  // the source select brought the desk here: the clock in the address applies
  function arrive() {
    const params = new URLSearchParams(location.search);
    setClock(CLOCKS()[params.get('clock')] ? params.get('clock') : clockKey);
    const select = mockbar.querySelector('[aria-label="Journey clock"]'); if (select) select.value = clockKey;
    destination = 'overview';
  }

  /* ---- wiring ------------------------------------------------------------------ */
  function bind() {
    // A row that opens a new subject sends focus to that subject's pane head, so
    // focus and the pane's scroll reset land in the same place; re-pressing the
    // open row keeps focus where the hand is.
    for (const button of surface.querySelectorAll('[data-row]')) button.onclick = () => { const opened = explore.id !== button.dataset.row; explore.id = button.dataset.row; view.sheetOpen = false; view.focusAfterRender = kit.narrow() ? '.gf-sheet-toggle' : opened ? '.gf-reading > header h2' : '.gf-roster-row[aria-pressed="true"]'; kit.render(); };
    for (const button of surface.querySelectorAll('[data-restore]')) button.onclick = () => { restore(button.dataset.restore); kit.navigate(destination === 'explore' ? 'explore' : 'overview'); };
    for (const button of surface.querySelectorAll('[data-journey]')) button.onclick = () => {
      if (button.dataset.journey === 'retry-read') { refresh(); view.focusAfterRender = memory.error ? '[data-journey="retry-read"]' : null; kit.render(); }
      if (button.dataset.journey === 'lane') { explore.id = 'basal'; view.focusAfterRender = '.lane-cell[aria-pressed="true"]'; kit.navigate('explore'); }
    };
    // the lane binds first: its foot's way into Changes takes the setting journey's handler
    basalB.bind(); settingB.bind(); focusB.bind();
  }
  function mountCharts() {
    if (owner() === 'basal') basalB.mountCharts(); else if (owner() === 'setting') settingB.mountCharts(); else kit.mountCharts();
    focusB.mountCharts();
  }
  // Whether the setting journey owns the rendered frame: its concern is shown with
  // its own nights, or its branch leads Overview or Changes. The slot lane owns
  // Explore while it is the row in hand.
  function owner() {
    if (laneShown()) return 'basal';
    if (destination === 'changes') return branch() === 'setting' && settingB.engaged() ? 'setting' : 'shared';
    if (destination === 'overview' && (settingB.active() || focusB.active())) return settingB.active() ? 'setting' : 'focus';
    const row = shown();
    return isSetting(row) && evidenceOf(row) === 'setting' ? 'setting' : 'shared';
  }
  function restore(id = memory.aside.at(-1)?.id) { memory.aside = memory.aside.filter(item => item.id !== id); }

  return {
    load(json) {
      data = json; settingB.load(data.setting_branch); focusB.load(data.focus_branch);
      basalB.load(data.initial.basal_exploration, data.initial.days);
      const params = new URLSearchParams(location.search);
      if (mockbar.dataset.source === 'journey' && CLOCKS()[params.get('clock')]) clockKey = params.get('clock');
      setClock(clockKey); controls();
    },
    arrive,
    frame, pane, priority, bind, mountCharts, owner, dayset,
    // The utilities at this clock: the branch's served questions for it (the
    // original read's up to the decision point), the pump profile as last
    // detected, and the change the Focus branch's later review recorded.
    utilityContext() {
      const { branch, station } = clockOf();
      const utilities = branch === 'setting' ? data.setting_branch.utilities_by_clock[{ captured: 'captured', trial: 'active_trial', ready: 'ready_trial' }[station]]
        : branch === 'focus' ? data.focus_branch.utilities_by_clock[station] : data.initial.utilities;
      const profile = settingB.detectedProfile() || { profile: data.initial.profile, at: data.initial.provenance.selected_clock, caption: 'Read' };
      const changes = branch === 'focus' && station === 'preempted' ? data.focus_branch.preempted.review.selected.changes.map(change => ({ ...change, at: data.focus_branch.preempted.changed_at })) : [];
      return { key: 'journey', now: now(), utilities, profile, changes };
    },
    // the investigation's case file: the shown concern's bundle at this read; the
    // shared original context stands behind a frame that draws nothing
    bundle: () => bundleOf(shown()) || bundleOf(next()) || data.initial.behavioral_evidence,
    dispose() { settingB.dispose(); focusB.dispose(); basalB.dispose(); },
    onNavigate(where) { destination = where; settingB.onNavigate(where); focusB.onNavigate(where); },
    onExplore() { explore.id = (destination === 'explore' ? exploreRow() : leadRow())?.id ?? null; },
    // set aside is the shared desk's: the concern stays in the roster with its
    // reason, an ordinary new read keeps it there, and only a restore returns it
    setAside(reason) { const row = shown(); if (!row || asideOf(row)) return; memory.aside.push({ id: row.id, title: row.title, reason, at: now() }); },
    restore,
    finish(conclusion) {
      const lead = settingB.active() ? settingB : focusB.active() ? focusB : null;
      if (!lead) return false;
      const result = lead.finish(conclusion);
      if (result === false) return false;
      // the conclusion is saved; the desk reads again for the next concern
      view.conclusion = ''; refresh();
      return true;
    },
    finished: () => settingB.finished() || focusB.finished(),
    escape() {
      if (owner() === 'basal') return basalB.escape();
      if (owner() === 'setting') return settingB.escape();
      if (owner() === 'focus') return focusB.escape();
      return false;
    },
  };
}
