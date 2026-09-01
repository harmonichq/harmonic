/* Verify workstation — PORTED from the locked mock, not authored here.
 *
 * Source: the archived mock (#722), its module script at lines 377-620.
 * Contract terms (18 + data-bindings table) and the frozen behaviour ledger
 * (8 stories) are frozen with the lock. Every render function below is a
 * verbatim slice of the mock's own; each departure is marked `PORT:` or
 * `PORT DEVIATION` inline.
 * Re-syncing means re-slicing the mock, not hand-editing this file.
 *
 * The data the mock read from ./verify-trials.capture.json now arrives from
 * /api/verify/trials through verify-workstation-data.js, which reshapes the API
 * payload into the exact object the slices below index. That adapter is the
 * only new logic the port allows.
 */
import { heroOption } from './verify-workstation-chart.js';
import { initialTrial } from './verify-workstation-data.js';

const PARAM = { basal_rate: 'Basal', carb_ratio: 'I:C', isf: 'ISF', target_bg: 'Target' };
const UNIT = { basal_rate: 'U/h', carb_ratio: 'g/U', isf: 'mg/dL/U', target_bg: 'mg/dL' };

/* PORT: the mock's `trialLabel` spelled "Carb ratio" for every non-profile
 * Trial, because its capture held only profile and carb-ratio ones. The roster
 * also derives basal, ISF and target Trials, so the label reads the parameter
 * map the rest of the surface already uses. */
const PARAM_LONG = { basal_rate: 'Basal', carb_ratio: 'Carb ratio', isf: 'ISF', target_bg: 'Target BG' };

/* PORT: the mock is a page and reads `?state=`; the app carries it in Verify's
 * route query, and the same parameter selects which Trial opens. Both
 * openers assert the rendered state equals the requested one (the port
 * process's state-addressability rule). */
export function queryState(fallback, param = 'state') {
  try {
    const value = new URLSearchParams(location.search).get(param);
    return value === 'complete' || value === 'maturing' ? value : fallback;
  } catch { return fallback; }
}

const fmtDay = s => new Date(s.slice(0, 10) + 'T12:00:00')
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const fmtClock = minutes =>
  String(Math.floor(minutes / 60) % 24).padStart(2, '0') + ':' +
  String(minutes % 60).padStart(2, '0');

const SURFACE = `
<div class="verify-strip">
  <span class="cap">Trial</span>
  <div class="strip-slot">
    <div class="trial-line" id="trial-line" role="group" aria-label="Detected Trials"></div>
    <span class="meta mono strip-note" id="trial-note"></span>
  </div>
</div>
<main class="panes" id="workspace">
  <section class="pane" aria-label="Trial comparison canvas">
    <header class="hero-head" id="hero-head" data-hover="0">
      <div class="head-swap">
        <div class="head-line head-rest">
          <h2 id="hero-title">—</h2>
          <span class="meta" id="hero-meta">—</span>
        </div>
        <div class="head-line head-live" id="hero-readout" aria-hidden="true">
          <span class="rd-time" id="rd-time">--:--</span>
          <span class="rd-pair"><span class="k">before</span><span class="v" id="rd-before">--</span></span>
          <span class="rd-pair"><span class="k">trial</span><span class="v" id="rd-trial">--</span></span>
          <span class="rd-pair"><span class="k">Δ</span><span class="v" id="rd-delta">--</span></span>
        </div>
      </div>
    </header>
    <div class="body story-body">
      <div class="hero-chart" id="hero-chart"></div>
    </div>
  </section>
  <section class="pane inspector" aria-label="Trial verdict">
    <header><h2>This Trial</h2><span class="meta" id="insp-meta">—</span></header>
    <div class="body insp-body">
      <div class="blk">
        <span class="cap">What changed</span>
        <div class="changes" id="changes"></div>
      </div>
      <div class="blk">
        <span class="cap">Evidence accrued</span>
        <div class="hh-progress" id="hero-progress"></div>
      </div>
      <div class="blk">
        <span class="cap">Outcomes · Before → Trial</span>
        <div class="movement" id="movement"></div>
      </div>
      <div class="blk">
        <span class="cap">Rescue carbs · Before → Trial</span>
        <div class="movement" id="rescue"></div>
      </div>
      <div class="blk">
        <span class="cap">Limits of this read</span>
        <ul class="limits" id="limits"></ul>
      </div>
      <div class="blk decide-blk">
        <span class="cap">Decision</span>
        <div class="decide" id="decide"></div>
      </div>
    </div>
  </section>
</main>`;

/**
 * Mount the Verify workstation into `root`.
 *
 * `callbacks.keep(detail)` acknowledges the change for this session only and
 * `callbacks.revert(detail)` opens Plan with the prior setting staged — lock
 * term 16's own copy, per the frozen ledger's Q1 answer. The
 * mock registered no handlers on either button; nothing here records a verdict.
 */
export function createVerifyWorkstation({ root, callbacks = {} }) {
  root.classList.add('vw', 'verify-surface');
  root.innerHTML = SURFACE;

  /* PORT DEVIATION: the mock's `$` reads document.getElementById. In the app the
   * Diagnose workstation is mounted in the same document and owns an `#rd-time`
   * of its own, so a document-wide lookup would paint Diagnose's readout. Every
   * lookup is scoped to this surface's root; the ids themselves are the mock's,
   * unchanged, so the behaviour replay's selectors still match. */
  const $ = id => root.querySelector('#' + id);
  const line = $('trial-line');

  let cap = null;         // the adapter's capture-shaped payload
  let sel = null;         // the selected Trial's detail
  let heroChart = null;

  function trialLabel(t) {
    if (t.parameter === 'profile') return 'Profile · all settings';
    const name = PARAM_LONG[t.parameter] || t.parameter;
    return `${name} · ${t.slot ?? 'all day'} · ${t.before} → ${t.after} ${UNIT[t.parameter] || ''}`.trim();
  }

  function chartColors() {
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    const mix = (c, pct) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
    // the dark ground eats a 20% tint — the trial-higher tint steps up so the
    // ribbon's two directions stay tellable apart
    return {
      muted: v('--mk-muted'), line: v('--mk-line'), accent: v('--mk-primary'),
      manual: v('--ck-manual') || '#93701B',
      accentSoft: mix(v('--mk-primary'), 32), mutedSoft: mix(v('--mk-muted'), 18),
      // the Diagnose workstation's target-band tokens, same mixes
      targetFill: mix(v('--mk-ok'), 8),
      targetEdge: mix(v('--mk-ok'), 55),
      targetText: `color-mix(in srgb, ${v('--mk-ok')} 85%, ${v('--mk-text')})`,
      rail: v('--ck-rail'),
    };
  }

  function renderHero() {
    // family: tir-target trials read the clock; arc-only targets read the meal
    const tm = sel.target_metrics || [];
    const arc = tm.includes('arc') && !tm.includes('tir') && cap._mealarcs[sel.id];
    const src = arc ? cap._mealarcs[sel.id] : cap._envelopes[sel.id];
    const rows = k => (arc ? src[k].bins : src[k]).filter(r => r.n > 0);
    const bef = rows('before_period'), tri = rows('trial_period');
    const tmin = r => arc ? r.t : parseInt(r.t) * 60 + parseInt(String(r.t).slice(3));
    const byT = new Map(bef.map(r => [String(r.t), r]));
    const pairs = tri.filter(r => byT.has(String(r.t)))
      .map(r => ({ t: tmin(r), b: byT.get(String(r.t)).med, v: r.med, d: r.med - byT.get(String(r.t)).med }));
    // arc bins are 15-min aggregates keyed by bin START; the last bin covers
    // through +4h, so the final segment extends to the bin's end — otherwise the
    // ribbon dies at +3h45 with a cliff and a dead right margin
    if (arc && pairs.length && pairs[pairs.length - 1].t === 225) {
      pairs.push({ ...pairs[pairs.length - 1], t: 240 });
    }
    if (!heroChart) {
      heroChart = echarts.init($('hero-chart'));
      new ResizeObserver(() => heroChart.resize()).observe($('hero-chart'));
    }
    heroChart.setOption(heroOption(chartColors(), {
      pairs, arc,
      beforeLabel: 'Before · ' + fmtDay(sel.before_period.start) + '–' + fmtDay(sel.before_period.end),
      trialLabel: 'Trial · ' + fmtDay(sel.trial_period.start) + '–' + fmtDay(sel.trial_period.end),
    }), { notMerge: true });
    // feed the docked header readout (app idiom): rebind, don't stack — the
    // chart instance survives every re-render
    const head = $('hero-head');
    const fmtT = t => arc
      ? (t === 0 ? 'meal' : (t > 0 ? '+' : '−') + Math.floor(Math.abs(t) / 60) + ':' + String(Math.abs(t) % 60).padStart(2, '0'))
      : fmtClock(t);
    heroChart.off('updateAxisPointer');
    heroChart.off('globalout');
    heroChart.on('updateAxisPointer', ev => {
      const axis = (ev.axesInfo || [])[0];
      if (!axis || axis.value == null || !pairs.length) { head.dataset.hover = '0'; return; }
      let best = pairs[0];
      for (const p of pairs) if (Math.abs(p.t - axis.value) < Math.abs(best.t - axis.value)) best = p;
      head.dataset.hover = '1';
      $('rd-time').textContent = fmtT(best.t);
      $('rd-before').textContent = Math.round(best.b);
      $('rd-trial').textContent = Math.round(best.v);
      const d = best.v - best.b;
      $('rd-delta').textContent = (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(0);
    });
    heroChart.on('globalout', () => { head.dataset.hover = '0'; });
    // one identity, one place: the strip owns the trial's name; the pane header
    // names the evidence family, and its meta speaks the surface's own
    // Before → Trial arrow grammar
    $('hero-title').textContent = arc ? 'Meal response' : 'Glucose by clock';
    /* PORT DEVIATION: the mock printed the literal "BLOCK 12:00–24:00" — the one
     * block its capture happened to carry. The bounds ride the payload
     * (`meal_arcs.block`, the Trial's own captured block identity per ADR 581 —
     * the durable arc bound to its applied-Plan provenance, not read live off the
     * pump's current I:C segments), so the meta names whichever block the Trial
     * actually scoped to. */
    $('hero-meta').textContent = (arc
      ? 'MEALS ' + src.before_period.n_meals + ' → ' + src.trial_period.n_meals +
        (src.block ? ' · BLOCK ' + fmtClock(src.block[0]) + '–' + fmtClock(src.block[1] % 1440 || 1440) : '')
      : 'DAYS ' + cap._daydata[sel.id].before_period.length + ' → ' +
        cap._daydata[sel.id].trial_period.length);
  }

  function render() {
    $('insp-meta').textContent = 'detected ' + fmtDay(sel.changed_at) + ' · derived live';
    renderHero();
    // what changed: one row per constituent, full, never ellipsized
    const entries = cap._changes[sel.id] || [];
    $('changes').innerHTML = entries.map(e => {
      const scope = e.slots_changed == null ? (e.slot ?? 'all day')
        : e.slots_changed >= 40 ? 'all day'
        : e.slots_changed > 1 ? e.slots_changed + ' slots' : e.slot;
      const vary = e.uniform === false ? ' · varies' : '';
      return `<div class="chg"><span class="p">${PARAM[e.parameter] || e.parameter}</span>
        ${e.before} → ${e.after} ${UNIT[e.parameter] || ''}
        <span class="scope-n">${scope}${vary}</span></div>`;
    }).join('');
    const m = sel.maturing;
    const pips = Array.from({ length: m.days_required }, (_, i) =>
      `<i ${i < m.days_elapsed ? '' : 'data-pending'}></i>`).join('');
    $('hero-progress').innerHTML = `<span class="pips">${pips}</span>
      <span>day ${Math.min(m.days_elapsed, m.days_required)} of ${m.days_required}</span>
      <span>· ${m.gap_count} gaps</span>`;
    // movement chip: the row's delta as glyph + magnitude — direction is the raw
    // move, colour is its valence for that metric (goodWhenDown flips it)
    const chip = (d, unit, goodWhenDown) => {
      if (Math.abs(d) < 0.05) return '<span class="delta flat">＝ 0' + unit + '</span>';
      const good = goodWhenDown ? d < 0 : d > 0;
      const mag = Math.round(Math.abs(d) * 10) / 10;
      return `<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '▲' : '▼'} ${mag}${unit}</span>`;
    };
    // rescue carbs: the per-period manual-carb read (the user's rescue stream);
    // fewer rescue entries is the good direction for both rows
    const rs = cap._rescue[sel.id];
    const rb = rs.before_period, rt = rs.trial_period;
    $('rescue').innerHTML = `
      <div class="m-item"><span class="cap">Manual carb entries</span>
        <span class="vals">${rb.n}<span class="arrow">→</span>${rt.n}${chip(rt.n - rb.n, '', true)}</span>
        <span class="word">${rb.grams} g → ${rt.grams} g logged · unknown ${rb.n_unknown} → ${rt.n_unknown}</span></div>
      <div class="m-item"><span class="cap">Logged after lows</span>
        <span class="vals">${rb.n_low_prompt}<span class="arrow">→</span>${rt.n_low_prompt}${chip(rt.n_low_prompt - rb.n_low_prompt, '', true)}</span></div>`;
    const ev = Object.fromEntries(sel.evidence.map(r => [r.key, r]));
    // the chip IS the movement read — no word line restating it
    $('movement').innerHTML = ['tir', 'tbr'].map(k => {
      const r = ev[k];
      const d = r.trial.value - r.before.value;
      // more time IN range is good; more time BELOW range is not
      return `<div class="m-item"><span class="cap">${k === 'tir' ? 'Time in range' : 'Time below range'} · ${r.role.toUpperCase()}</span>
        <span class="vals">${r.before.value}%<span class="arrow">→</span>${r.trial.value}%${chip(d, ' pt', k === 'tbr')}</span></div>`;
    }).join('');
    const lims = [...new Set((sel.limits || []).concat(sel.limitation ? [sel.limitation] : []))];
    $('limits').innerHTML = lims.map(l => `<li>${l}</li>`).join('');
    // readiness is the decision's gate, so its verdict word lives here — not a
    // scorecard chip beside the accrual pips
    const dec = $('decide');
    if (sel.state !== 'complete') {
      dec.innerHTML = `<span class="d-status waiting">${sel.readiness.label}</span>
        <span class="note">No verdict is ready while evidence accrues. Keep and Revert appear when the Trial reaches ${m.days_required} days.</span>`;
    } else {
      const route = sel.plan_route || {};
      dec.innerHTML = `<span class="d-status ready">${sel.readiness.label}</span>
        <div class="btns"><button type="button" data-act="keep">Keep change</button>
        <button type="button" class="secondary" data-act="revert">Revert → Plan</button></div>
        <span class="note">Keep is session feedback only — nothing is recorded. Revert opens Plan${route.label ? ' · ' + route.label : ''}.</span>`;
      /* PORT: the mock registered no handlers here (ledger Q1). The ledger's
       * Q1 answer is that the build wires term 16's own copy and nothing more —
       * Keep acknowledges for this session and records nothing; Revert opens
       * Plan with the prior setting staged. */
      dec.querySelector('[data-act="keep"]').addEventListener(
        'click', () => callbacks.keep && callbacks.keep(sel));
      dec.querySelector('[data-act="revert"]').addEventListener(
        'click', () => callbacks.revert && callbacks.revert(sel));
    }
  }

  const stWord = t => t.state === 'complete' ? 'complete' : 'maturing';

  function renderTrialLine() {
    const others = cap.roster.trials.filter(t => t.id !== sel.id);
    line.innerHTML = `<span class="subject">${trialLabel(sel)} <span class="st">· ${stWord(sel)}</span></span>
      <button type="button" class="trial-more" aria-expanded="false">${others.length} other Trial${others.length === 1 ? '' : 's'} ▾</button>
      <div class="trial-pop" hidden></div>`;
    const pop = line.querySelector('.trial-pop');
    for (const t of others) {
      const b = document.createElement('button');
      b.innerHTML = trialLabel(t) + ' <span class="st">· ' + stWord(t) + '</span>';
      b.addEventListener('click', () => { sel = cap.details[t.id].selected; renderTrialLine(); render(); });
      pop.append(b);
    }
    const more = line.querySelector('.trial-more');
    more.addEventListener('click', () => {
      const open = pop.hidden;
      pop.hidden = !open;
      more.setAttribute('aria-expanded', String(open));
    });
  }

  // light dismiss: any outside click or Escape closes the popover (renderTrialLine
  // rebuilds the line's DOM, so these act on the current nodes, attached once)
  function closeTrialPop() {
    const pop = line.querySelector('.trial-pop'), more = line.querySelector('.trial-more');
    if (pop && !pop.hidden) { pop.hidden = true; more.setAttribute('aria-expanded', 'false'); }
  }
  document.addEventListener('click', e => { if (!line.contains(e.target)) closeTrialPop(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeTrialPop(); });

  /** Replace the surface with one centred line — empty roster or failed load. */
  function showMessage(text) {
    root.innerHTML = '<div class="pane" style="place-items:center;display:grid;">'
      + `<p class="meta">${text}</p></div>`;
  }

  return {
    /** Paint the surface from the adapter's capture-shaped payload. */
    setData(payload) {
      cap = payload;
      const trials = (cap.roster && cap.roster.trials) || [];
      if (!trials.length) {
        showMessage('No Trial is in view. A setting change starts one.');
        return;
      }
      const opening = initialTrial(trials, queryState(null));
      const detail = cap.details[opening.id];
      if (!detail) {
        showMessage("Couldn't load Verify: the selected Trial has no evidence yet");
        return;
      }
      sel = detail.selected;
      $('trial-note').textContent =
        `${trials.length} live-derived Trial${trials.length === 1 ? '' : 's'} · never stored`;
      renderTrialLine();
      render();
    },
    /** Re-render in place, e.g. after data changes underneath the mount. */
    refresh() { if (cap && sel) { renderTrialLine(); render(); } },
    setError(message) { showMessage(`Couldn't load Verify: ${message}`); },
  };
}
