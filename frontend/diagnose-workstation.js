/* Diagnose workstation — PORTED from the locked mock, not authored here.
 *
 * Source: the archived ★ LOCKED cockpit mock, the module in its
 * <script type="module"> block, lines 1105-2717. Everything from the readout
 * painter to renderOccurrenceLevel is transferred VERBATIM.
 *
 * What is NOT verbatim, and why:
 *   - the chart module is imported from its ported path;
 *   - `_shell.js` is mock-harness chrome. `resolveColors` and `queryState` are
 *     copied from it below because the ported code calls them; `applyTheme` and
 *     `renderMockBar` are dropped (the app owns its theme, and the mock bar is
 *     excluded from the contract by the behaviour ledger, story S22's note);
 *   - `loadCapture()` is replaced by injected data. The mock fetches four
 *     capture files; the app's adapter (./diagnose-workstation-data.js) builds
 *     the same four shapes from the API payload;
 *   - the envelope and meal markers arrive prebuilt from that adapter, because
 *     the server pools server-side and there is no per-day raw CGM on the wire;
 *   - `CFG` is indexed per mount rather than once at module load, so a state
 *     change can re-derive it without a page reload.
 *
 * Edit this file only to re-sync it with the mock. A change that is not in the
 * mock is a deviation and needs a re-settle against the surface's lock manifest.
 */
import {
  buildEnvelope, buildMealMarkers, renderCanvas, clockBuckets, observeResize,
  buildSlotLane, cellAtMinute, windowStats, hhmm, BIN_MINUTES, MIN_SUPPORTED_NIGHTS,
  snapWindow, minuteAtX, xAtMinute, plotBox, buildDayTrace,
} from './diagnose-workstation-chart.js';
import { toCaptures, isfVerdict } from './diagnose-workstation-data.js';
// #735: level 1 is the server-owned findings queue, and the pane has a floor.
import { renderFindingsQueue, queueMeta } from './diagnose-findings-queue.js';
import { watchDockView, paintWatchDock } from './watched-change-dock.js';
/* ADR 31 part 3 (issue #41) — ALIGN's "By event" mode reuses the lens's own
   canvas-only render rather than a second implementation of the projection's
   draw. `diagnose-event-comparison.js` imports `createDiagnoseWorkstation`
   from this module too; the cycle is safe because neither side calls the
   other's import at module-evaluation time, only from inside functions run
   later, after both modules have finished loading. */
import { renderEventSurface } from './diagnose-event-comparison.js';

/* VERBATIM from the mock's shared harness chrome. The ported chartColors() calls it, and
   it must read the live stylesheet rather than any restated token (R3). */
export function resolveColors() {
  const styles = getComputedStyle(document.documentElement);
  const names = ['primary', 'primary-600', 'primary-soft', 'surface', 'surface-2',
    'text', 'muted', 'line', 'ok', 'ok-soft', 'warn', 'warn-soft', 'danger', 'danger-soft'];
  return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(`--mk-${name}`).trim()]));
}

/* VERBATIM from the mock's shared harness chrome. `?mode=` is the mock's state parameter;
   `?state=` is silently ignored there, and the port keeps the same name so one
   URL drives both sides. */
export function queryState(fallback, param = 'mode') {
  return new URLSearchParams(window.location.search).get(param) || fallback;
}

/* The surface's markup — VERBATIM from the mock's body, lines 1025-1094 (the
   instrument row and the pane grid). The mock's topbar and status rows are the
   app shell's, already built to this same lock by #634, so they are not
   restated here. */
const MARKUP = `
  <div class="instruments">
    <div class="instrument">
      <span class="cap">Window</span>
      <div class="seg" id="seg-window" role="group" aria-label="Clock window"></div>
    </div>
    <!-- ADR 31 part 3 (issue #41) — ALIGN, present only where the canvas is
         showing a factor's events. A switch over already-selected data: it
         never pushes, and WINDOW keeps filtering by clock under either
         projection. Absorbs VIEW's function; VIEW itself is deleted. -->
    <div class="instrument" id="align-group" hidden>
      <span class="cap">Align</span>
      <div class="seg" id="seg-align" role="group" aria-label="Alignment"></div>
    </div>
  </div>

  <main class="panes">
    <section class="pane canvas-pane" aria-label="Diagnose canvas">
      <header class="canvas-head" id="canvas-head" data-hover="0">
        <div class="head-swap">
          <div class="head-line head-rest">
            <h2>Glucose by time of day</h2>
            <span class="meta" id="canvas-scope">—</span>
          </div>
          <div class="head-line head-live" id="canvas-readout" aria-hidden="true">
            <span class="rd-time" id="rd-time">--:--</span>
            <span class="rd-pair" id="rd-p-med"><span class="k">median</span><span class="v" id="rd-med">--</span></span>
            <span class="rd-pair" id="rd-p-iqr"><span class="k">25–75</span><span class="v" id="rd-iqr">--</span></span>
            <span class="rd-pair" id="rd-p-band"><span class="k">10–90</span><span class="v" id="rd-band">--</span></span>
            <span class="rd-pair" id="rd-p-n"><span class="k">n</span><span class="v" id="rd-n">--</span></span>
            <span class="rd-note" id="rd-note"></span>
          </div>
        </div>
        <span class="meta persist" id="canvas-pool">—</span>
      </header>
      <div class="body">
        <div id="chart"></div>
        <div class="brace" id="brace" hidden>
          <div class="edge" id="brace-a"></div>
          <div class="edge" id="brace-b"></div>
          <div class="grip" id="grip-a" title="Drag to resize"></div>
          <div class="grip" id="grip-b" title="Drag to resize"></div>
          <div class="readout" id="brace-readout" hidden></div>
        </div>
        <div class="lane-wrap" id="lane-wrap">
          <div class="lane" id="lane" role="group" aria-label="Basal slot verdicts"></div>
          <div class="lane-key" id="lane-key"></div>
        </div>
        <!-- ALIGN's "By event" pane (ADR 31 part 3): the event-comparison
             lens's own canvas-only render, mounted here rather than
             re-implemented — the same projection, drawn the same way,
             whether reached through the lens's own read path or through
             this switch. Hidden and empty under "By clock". -->
        <div class="ec-surface" id="align-canvas" hidden></div>
      </div>
    </section>

    <section class="pane inspector" aria-label="Inspector">
      <!-- TERM 47 — the header's staged status is DELETED, not restyled. It named
           only the Plan branch of a four-branch object, so it could read "nothing
           staged" while a Trial was being watched; the dock below is now the single
           reporter of that state. Supersedes term 13's inspector-meta clause and
           behaviour-ledger story S16's header assertion. -->
      <header><h2>Inspector</h2></header>
      <div class="body">
        <div class="crumb">
          <div class="trail" id="crumb-trail"></div>
          <span class="meta" id="crumb-meta"></span>
        </div>
        <div class="level" id="level" tabindex="-1"></div>
      </div>
      <!-- TERM 46 — the inspector's FLOOR. Pane furniture, mounted once with the
           pane and repainted in place, so it survives every drill level and is
           never level-1 content, never scrolled away, and never conditional on the
           queue's length or scope. -->
      <div class="watch" id="watch-dock"></div>
    </section>
  </main>
`;

/* The mock reads its state once, at module load, straight off the URL. The app
   re-derives both on every mount so `?mode=` can change without a reload. */
let state = 'typical';
let CFG = null;

/* ---- mock 1139-1221 — VERBATIM ---- */
const el = (id) => document.getElementById(id);

/* DOCKED READOUT. The chart reports the hovered bin — or a hovered occurrence
   dot / meal glyph — here instead of drawing a floating box, and the header's
   left region swaps to these values. Vocabulary is the legend's own: median,
   25–75, 10–90. Nothing is invented and nothing new is computed. */
const rdNum = (v) => (v == null ? '--' : String(Math.round(v)));
/* The target band the canvas already draws. The median's ink says which side of
   it the hovered bin sits on — the ONLY coloured value in the row. */
const RD_TARGET = [70, 180];
const rdVerdict = (v) => {
  if (v == null) return 'none';
  if (v > RD_TARGET[1]) return 'above';
  if (v < RD_TARGET[0]) return 'below';
  return 'in';
};
function paintReadout(r) {
  const head = el('canvas-head');
  if (!head) return;
  if (!r) { head.dataset.hover = '0'; return; }
  const stats = r.kind === 'bin';
  for (const id of ['rd-p-med', 'rd-p-iqr', 'rd-p-band', 'rd-p-n']) {
    el(id).style.display = stats ? '' : 'none';
  }
  el('rd-time').textContent = r.label;
  if (stats) {
    el('rd-med').textContent = rdNum(r.p50);
    el('rd-med').dataset.verdict = rdVerdict(r.p50);
    el('rd-iqr').textContent = `${rdNum(r.p25)}–${rdNum(r.p75)}`;
    el('rd-band').textContent = `${rdNum(r.p10)}–${rdNum(r.p90)}`;
    el('rd-n').textContent = r.n == null ? '--' : String(r.n);
    el('rd-note').textContent = '';
  } else {
    // a dot or a glyph: its own reading, in the same row, never a floating box
    el('rd-note').textContent = r.note || '';
  }
  head.dataset.hover = '1';
}

/** Occurrence rows shown before the "N more" toggle. */
const EVIDENCE_CAP = 5;

/* The chart module's grid[0] insets, in px — the brace is clipped to them so it
   never runs into the chart header above or past the basal lane below. Must
   track `grid` in the mock's own chart module. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 56;

// the long form, for the level-2 stat line where there is room for it
const FAMILY_LABEL = {
  lows: 'low episodes', meals: 'meal responses',
  highs: 'high episodes', correction_clusters: 'correction clusters',
};
/* The compact form, for the level-1 row: it serves BOTH the denominator phrase
   ("of 68 lows") and the disambiguating qualifier ("· clusters"). Spending width
   on "correction clusters" twice per row is what squeezed the names. */
const FAMILY_SHORT = {
  lows: 'lows', meals: 'meals', highs: 'highs', correction_clusters: 'clusters',
};

const VERDICT_KEY = {
  up: 'suggests a raise', down: 'suggests a lower', hold: 'holds at current',
  insufficient: 'insufficient evidence', nodata: 'no clean data',
};
// short forms for the single-line lane key
const VERDICT_SHORT = {
  up: 'raise', down: 'lower', hold: 'hold',
  insufficient: 'insufficient', nodata: 'no data',
};

const WINDOWS = {
  overnight: { label: 'Overnight', range: [0, 360] },
  morning: { label: 'Morning', range: [360, 720] },
  afternoon: { label: 'Afternoon', range: [720, 1080] },
  evening: { label: 'Evening', range: [1080, 1440] },
  all: { label: '24 h', range: [0, 1440] },
};
const winEdge = (m) => (m === 1440 ? '24:00' : hhmm(m));
const winText = (w) => `${hhmm(w.range[0])}–${winEdge(w.range[1])}`;

/* ADR 31 part 3 (issue #41) — which finding case files ALIGN can re-project.
   The event-comparison lens's closed factor set (`diagnose-event-comparison.js`,
   `factorKey`) is six of the seven levers title() names
   (`ciq_autotune/analyzers/scenario/levers.py`); MISSED_MEAL is the one lever
   outside it (an Exposure.HIGHS case file, which the lens has no view for).
   Keyed on the lever's TITLE, because that is the string a factor frame
   already carries as `factor.cause` (`buildFactors`/`cause_title`) — not a
   second copy of the lever enum, just the same closed set's own titles read
   back. A factor frame whose cause is not in this map has no event alignment;
   ALIGN stays hidden and the canvas stays clock-only. */
const ALIGN_FACTOR_BY_CAUSE = {
  'Carb undercount': { view: 'meals', factor: 'carb_undercount' },
  'Late bolus': { view: 'meals', factor: 'late_bolus' },
  'Meal over-delivery': { view: 'meals', factor: 'meal_over_delivery' },
  'Over-treated low': { view: 'lows', factor: 'over_treated_low' },
  'Correction stacking': { view: 'lows', factor: 'correction_stacking' },
  'Correction on active insulin': { view: 'lows', factor: 'correction_on_iob' },
};
const alignCoordinatesFor = (cause) => ALIGN_FACTOR_BY_CAUSE[cause] || null;

/* ---- mock 1222-1242 — VERBATIM except the trailing `[state]` index:
       the app re-derives CFG per mount instead of once at load. ---- */
/* `level` is the stack depth this state opens at: 1 factors, 2 one factor,
   3 one occurrence, 'slot' the slot branch pushed off level 1. */
const CFG_BY_STATE = {
  typical: { win: 'overnight', pool: 45, factorCap: 6, occCap: 40, level: 1 },
  drill: { win: 'overnight', pool: 45, factorCap: 6, occCap: 40, level: 2 },
  occurrence: { win: 'overnight', pool: 45, factorCap: 6, occCap: 40, level: 3 },
  // a custom window already drawn, so the whole re-scope is judgeable from a URL
  drawn: { win: 'overnight', pool: 45, factorCap: 6, occCap: 40, level: 1, drawn: [135, 285] },
  slot: { win: 'morning', pool: 45, factorCap: 6, occCap: 40, level: 'slot' },
  dense: { win: 'all', pool: 60, factorCap: 12, occCap: 120, level: 1 },
  // the I:C block branch, on the capture that ships today: both blocks held
  block: { win: 'morning', pool: 45, factorCap: 6, occCap: 40, level: 'block' },
  // the same branch on a capture holding a block that ASSERTS a move, opened
  // with it already staged so the button's staged state, the lane underline and
  // the Plan badge are all visible at rest
  icassert: {
    win: 'morning', pool: 45, factorCap: 6, occCap: 40, level: 'block',
    ic: 'ic-blocks-asserting', stageOpen: true,
  },
  isf: { win: 'overnight', pool: 45, factorCap: 6, occCap: 40, level: 'isf' },
};

/* ---- mock 1243-1961 — VERBATIM ---- */

const chartColors = (root) => {
  const c = resolveColors();
  /* PORT DEVIATION (#654): the mock's :root is its workstation root. The
     faithful translation is to read each workstation token from .dw, the
     element that declares it, rather than the app document root. */
  const css = (n) => getComputedStyle(root).getPropertyValue(n).trim();
  /* THEME DEVIATION (#736) — the one mix ratio that cannot be one number.
     The 10–90 envelope is ceiling-bound in DARK: at 13% of the measured signal
     it composites to rgb(36,39,30) on the dark field and measures 1.22:1, and
     no token can lift it, because the ceiling is the ratio and not the source —
     even a pure-white source at 13% over that field stops at 1.52:1
     (the Harmonic theme lock's "owed obligations"). Parchment does not
     have the problem: the same 13% lands at 1.21:1 there too, but a subtractive
     tint on a light ground reads at a contrast an additive one does not.
     So the ratio is theme-specific. It is read off `color-scheme`, which both
     themes declare, rather than off a class name — this builder samples the
     live stylesheet for every other value it returns and must not start
     restating theme facts from memory (R3, and the wrong ink in #644). The
     25–75 band is deliberately NOT widened with it: the envelope has to stay
     nested, and 26/38 keeps a clear step (1.59:1 vs 2.09:1) where a matched
     rise would flatten the two into one shape. */
  const bandOuterMix = getComputedStyle(root).colorScheme === 'dark' ? '26%' : '13%';
  return {
    ...c,
    surface2: c['surface-2'],
    rail: css('--ck-rail'),      // the panel ground under the plot

    grid: `color-mix(in srgb, ${c.line} 80%, transparent)`,
    gridStrong: c.line,
    bandOuter: `color-mix(in srgb, ${c.primary} ${bandOuterMix}, transparent)`,
    bandInner: `color-mix(in srgb, ${c.primary} 38%, transparent)`,
    bandEdge: `color-mix(in srgb, ${c.primary} 55%, transparent)`,
    median: c['primary-600'] || c.primary,
    /* The ink for text sitting ON the median fill — the axis-riding value tag
       (term 25). It was read as `colors.onAccent` and never defined anywhere:
       not by resolveColors(), not here. ECharts fell back to the option's
       textStyle colour, so the tag drew MUTED GREY on the primary plate in
       both themes (#651). The token exists; it just was not passed. */
    onAccent: css('--mk-on-primary'),
    meal: css('--ck-meal'),
    mealEdge: c.surface,
    occurrence: c['primary-600'] || c.primary,
    targetFill: `color-mix(in srgb, ${c.ok} 8%, transparent)`,
    targetEdge: `color-mix(in srgb, ${c.ok} 55%, transparent)`,
    targetText: `color-mix(in srgb, ${c.ok} 85%, ${c.text})`,
    windowFill: `color-mix(in srgb, ${c.primary} 8%, transparent)`,
    windowEdge: `color-mix(in srgb, ${c.primary} 72%, transparent)`,
  };
};

const fmtDate = (iso) => new Date(`${iso}T00:00:00`)
  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000) + 1;
const u = (v) => (v == null ? '--' : v.toFixed(2));

/* ------------------------------ evidence tiers ------------------------ */

function tierOf(occ) {
  const matched = (occ.verdicts || []).find((v) => v.matched);
  return matched ? matched.evidence_tier : null;
}

/* ------------------------------ chrome -------------------------------- */

function renderInstruments(winKey, capture, onPreset) {
  const seg = el('seg-window');
  seg.innerHTML = '';
  for (const [key, spec] of Object.entries(WINDOWS)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = spec.label;
    b.setAttribute('aria-pressed', String(key === winKey));
    // picking a preset is how you get rid of a drawn window
    b.addEventListener('click', () => onPreset(key));
    seg.append(b);
  }
  /* PORT DEVIATION (#654): the mock owns its whole top bar and writes the scope
     readout itself. In the app that readout belongs to the shell, is bound to
     `cockpitScope`, and is shared by every tab — the ported surface must not
     reach up and overwrite it. Guarded rather than deleted, so the same code
     still fills them in wherever the ids do exist. */
  const range = el('scope-range');
  if (range) range.textContent = `${fmtDate(capture.window.start)} – ${fmtDate(capture.window.end)}`;
  const days = el('scope-days');
  if (days) days.textContent = `${daysBetween(capture.window.start, capture.window.end)} d`;
}

/** ALIGN (ADR 31 part 3): a switch over already-selected data, never a
    navigation — it does not push, and nothing else in the instrument row is a
    function of it. Rebuilt every paint from the standing frame's own align
    state, same as `renderInstruments` rebuilds WINDOW from `winKey`. */
function renderAlign(alignKey, onAlign) {
  const seg = el('seg-align');
  seg.innerHTML = '';
  for (const [key, label] of [['clock', 'By clock'], ['event', 'By event']]) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(key === alignKey));
    b.addEventListener('click', () => onAlign(key));
    seg.append(b);
  }
}

/**
 * The follow chip: ONE slot in the control row that reports whatever non-preset
 * window is in force — "Factor peak 02:00–04:00" or "Window 02:15–04:45". It is
 * never a sixth preset (it replaces the pressed state, it does not add a pill)
 * and it is the single readout for a custom range, so nothing floats over the
 * plot. `onClear` adds the clear affordance INSIDE the chip.
 */
function markWindowSegment(text, onClear) {
  const seg = el('seg-window');
  for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', 'false');
  let follow = seg.querySelector('[data-follow]');
  if (!follow) {
    follow = document.createElement('button');
    follow.type = 'button';
    follow.dataset.follow = 'true';
    seg.append(follow);
  }
  follow.textContent = text;
  if (onClear) {
    const x = document.createElement('i');
    x.className = 'x';
    x.textContent = '×';
    x.title = 'Clear the drawn window (Esc)';
    x.addEventListener('click', (e) => { e.stopPropagation(); onClear(); });
    follow.append(x);
  }
  follow.setAttribute('aria-pressed', 'true');
}

/** Clear the follow chip and restore a preset's pressed state. */
function pressPreset(winKey) {
  const seg = el('seg-window');
  const follow = seg.querySelector('[data-follow]');
  if (follow) follow.remove();
  const keys = Object.keys(WINDOWS);
  seg.querySelectorAll('button').forEach((b, i) => {
    b.setAttribute('aria-pressed', String(keys[i] === winKey));
  });
}

/** Minute-of-day of an occurrence, for window filtering. */
const occMinute = (o) => Number(o.t.slice(11, 13)) * 60 + Number(o.t.slice(14, 16));
const inWindow = (o, [a, b]) => { const m = occMinute(o); return m >= a && m < b; };

/* ------------------------------ verdict lane -------------------------- */

/**
 * I:C blocks — maximal contiguous runs of one programmed ratio on the CIRCULAR
 * day, straight off the capture's `ic_blocks`. A block whose end precedes its
 * start wraps midnight and carries two spans for its detail and coincidence
 * routes.
 *
 * The verdict is READ, not derived (term 14): `asserts_move` is the backend's
 * single I:C predicate, and which of the two held presentations a block gets
 * comes from the backend's own `state`.
 */
function buildIcBlocks(blocks) {
  const cells = blocks.map((b) => {
    const wraps = b.end_min <= b.start_min;
    const current = b.current_values[0];
    let verdict;
    /* PORT NOTE (#654): the basal lane now reads the backend's published
       `direction` instead of comparing doses. I:C publishes no direction —
       not on the live feed, not on the asserting fixture — so this keeps the
       mock's read of the backend's own two numbers, preferring `direction` if
       it ever starts arriving. It decides no eligibility: `ic_asserts_move`
       already did that (term 14); this only picks which way an already
       asserted change points. */
    if (b.asserts_move) {
      if (b.direction === 'raise' || b.direction === 'lower') {
        verdict = b.direction === 'raise' ? 'up' : 'down';
      } else verdict = b.recommended > current ? 'up' : 'down';
    } else verdict = b.state === 'numeric' ? 'hold' : 'insufficient';
    return {
      block: b,
      id: b.block_id,
      label: b.label,
      verdict,
      wraps,
      asserts: Boolean(b.asserts_move),
      current,
      startMin: b.start_min,
      endMin: b.end_min,
      span: `${hhmm(b.start_min)}–${hhmm(b.end_min)}`,
      spans: wraps ? [[b.start_min, 1440], [0, b.end_min]] : [[b.start_min, b.end_min]],
    };
  });
  return cells;
}

/** The I:C block whose span contains `minute` — wraps included. */
function icBlockAtMinute(icBlocks, minute) {
  return icBlocks.find((c) => c.spans.some(([a, b]) => minute >= a && minute < b))
    || icBlocks[0];
}

/** One swatch for the single-line key — same tokens as the cells themselves. */
function keySwatch(k) {
  return k === 'insufficient'
    ? 'box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ck-insuff) 75%,transparent)'
    : k === 'nodata'
      ? 'box-shadow:inset 0 0 0 1px var(--ck-hair)'
      : k === 'hold'
        ? 'background:color-mix(in srgb,var(--ck-hold) 34%,transparent)'
        : k === 'down'
          ? 'background:color-mix(in srgb,var(--mk-danger) 72%,transparent)'
          : 'background:color-mix(in srgb,var(--ck-up) 72%,transparent)';
}

function renderLane(lane, selectedCell, staged, onPick) {
  const host = el('lane');
  host.style.gridTemplateColumns = `repeat(${lane.cells.length}, 1fr)`;
  host.innerHTML = '';
  for (const cell of lane.cells) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.verdict = cell.verdict;
    b.dataset.staged = String(staged.has(cell.i));
    b.setAttribute('aria-pressed', String(selectedCell != null && cell.i === selectedCell.i));
    b.title = `${cell.label} · ${VERDICT_KEY[cell.verdict]}`;
    b.setAttribute('aria-label', `${cell.label} basal slot, ${VERDICT_KEY[cell.verdict]}`);
    b.addEventListener('click', () => onPick(cell));
    host.append(b);
  }
}

/**
 * The basal verdict key reconciles the 48 slots on the canvas lane.
 */
function renderLaneKey(lane) {
  const order = ['up', 'down', 'hold', 'insufficient', 'nodata'];
  const group = (leadWord, counts) => `<span class="lead">${leadWord}</span>`
    + order.filter((k) => counts[k]).map((k) => `<span title="${VERDICT_KEY[k]}">`
      + `<i style="${keySwatch(k)}"></i>${VERDICT_SHORT[k]} <b class="t">${counts[k]}</b></span>`).join('');
  el('lane-key').innerHTML = group('Basal slots', lane.counts);
}

/* ------------------------------ inspector ----------------------------- */

function renderClockInto(host, occurrences, clock) {
  const max = Math.max(...clock.buckets.map((b) => b.n), 1);
  const box = document.createElement('div');
  box.className = 'clock';
  box.innerHTML = `
    <div class="cap">When it lands
      <em>peak ${hhmm(clock.peak.startMin)}–${hhmm(clock.peak.endMin)} · ${clock.peak.n} of ${clock.total}</em></div>
    <div class="bars">${clock.buckets.map((b) => `
      <div data-n="${b.n}" data-peak="${b === clock.peak && b.n > 0}"
           title="${hhmm(b.startMin)}–${hhmm(b.endMin)} — ${b.n} of ${clock.total}">
        ${b.n ? `<span class="n">${b.n}</span>` : ''}
        <i style="height:${b.n ? Math.max(8, (b.n / max) * 100) : 2}%"></i>
      </div>`).join('')}</div>
    <div class="axis">${clock.buckets.map((b) => `<span>${hhmm(b.startMin).slice(0, 2)}</span>`).join('')}</div>`;
  host.append(box);
}

/** Level 2 head: the stat line, the histogram, the slot coincidence link. */
function renderFactorHead(host, factor, occurrences, familyN, scopeText, clock, lane, onViewSlot,
  icBlocks, onViewSegment) {
  const box = document.createElement('div');
  box.className = 'inner';
  // stat lines, not prose — and the not-attributed remainder survives as a number
  box.innerHTML = `
    <div class="who">${factor.cause}${factor.needsQual ? ` <span class="qual">· ${FAMILY_SHORT[factor.family]}</span>` : ''}</div>
    <div class="statline"><b>${occurrences.length}</b> of <b>${familyN}</b>
      ${FAMILY_LABEL[factor.family]} in ${scopeText}
      · <b>${familyN - occurrences.length}</b> not attributed</div>`;
  if (clock) {
    renderClockInto(box, occurrences, clock);
    /* The factor's peak hour falls inside a real basal slot AND inside a real
       I:C block — a clock coincidence the operator can follow, not an
       engine-asserted attribution. BOTH print, on one line, basal first, each
       with its own verdict and its own route (term 33). Collapsing to whichever
       "looks stronger" would hide exactly the overlap the merged register
       exists to show. */
    const cell = cellAtMinute(lane, clock.peak.startMin);
    const blk = icBlockAtMinute(icBlocks, clock.peak.startMin);
    const link = document.createElement('div');
    link.className = 'slotlink';
    link.innerHTML = `<span>Peak hour falls in the ${cell.label} basal slot
      (${VERDICT_KEY[cell.verdict]})</span>`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'linkbtn';
    btn.textContent = 'View slot';
    btn.addEventListener('click', () => onViewSlot(cell));
    link.append(btn);
    link.insertAdjacentHTML('beforeend',
      `<span>and in the ${blk.label} I:C block, ${blk.span}
        (${VERDICT_KEY[blk.verdict]})</span>`);
    const segBtn = document.createElement('button');
    segBtn.type = 'button';
    segBtn.className = 'linkbtn';
    segBtn.textContent = 'View segment';
    segBtn.addEventListener('click', () => onViewSegment(blk));
    link.append(segBtn);
    box.append(link);
  }
  host.append(box);
}

/**
 * ONE item panel, for every parameter — a basal slot, an I:C block, or the ISF
 * value. Same component, same order, same reserved geometry; only the words are
 * substituted. Keeping them in one function is the point: three panels drift
 * apart, and a reader who has learned where the CI sits on a slot must find it
 * in the same place on a block.
 *
 * spec: { head, headQual, verdict, unit, current, estimate, recommended,
 *         recommendedQual, scopeSay, currentNoun, moveWord, support, sentence,
 *         canStage, isStaged, footNote, onStage }
 */
function renderParamLevel(host, spec) {
  const e = spec.estimate;
  /* Does the interval reach the figure already in the pump? Then the data is
     compatible with changing nothing, and that has to be said in words — two
     numbers side by side leave the reader to notice it. */
  const spansCurrent = e.lo != null && e.hi != null
    && e.lo <= spec.current && spec.current <= e.hi;
  /* A recommendation normally sits between the figure you run and the figure the
     data estimates — it is a step from one toward the other. When it does not,
     something outside the estimate moved it (a cap, a harm gate), and that is a
     fact the reader must be told rather than left to spot by comparing three
     numbers. DORMANT on both captures: today's asserting block recommends 5.30
     between current 5.60 and estimate 4.94. */
  const between = spec.recommended == null
    || (spec.recommended >= Math.min(spec.current, e.value)
      && spec.recommended <= Math.max(spec.current, e.value));
  const box = document.createElement('div');
  box.className = 'inner';
  box.innerHTML = `
    <div class="slot-head">
      <span class="time">${spec.head}</span>
      <span class="verdict">${spec.headQual ? `${spec.headQual} · ` : ''}${spec.verdict}</span>
    </div>
    ${spec.scopeSay ? `<div class="slot-say">${spec.scopeSay}</div>` : ''}
    <div class="numrow"><span class="k">Current</span><b>${u(spec.current)}</b>
      <span class="qual">${spec.unit}, programmed now</span></div>
    <div class="numrow"><span class="k">Estimate</span><b>${u(e.value)}</b>
      <span class="qual">${spec.unit} — the interval below brackets THIS number</span></div>
    <div class="numrow"><span class="k">Recommended</span><b>${u(spec.recommended)}</b>
      <span class="qual">${spec.recommendedQual}</span></div>
    <div class="slot-stats">CI ${u(e.lo)}–${u(e.hi)} ${spec.unit} on the estimate
      <span>${e.wide ? '(wide)' : ''}</span></div>
    ${spansCurrent ? `<div class="hedge">That interval reaches the ${spec.currentNoun} you
      already run (${u(e.lo)}–${u(e.hi)} includes ${u(spec.current)}), so <b>it includes no
      change at all</b> — a ${spec.moveWord} is consistent with this data, not established
      by it.</div>` : ''}
    ${between ? '' : `<div class="hedge">The recommended ${u(spec.recommended)} does not sit
      between the ${u(spec.current)} you run now and the ${u(e.value)} the data estimates, so
      <b>something outside the estimate set it</b> — ${spec.sentence}</div>`}
    <div class="slot-stats">${spec.support}</div>
    <div class="slot-say">${spec.sentence}</div>`;
  const foot = document.createElement('div');
  foot.className = 'slot-foot';
  if (spec.canStage) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stagebtn';
    btn.dataset.staged = String(spec.isStaged);
    btn.innerHTML = spec.isStaged
      ? 'Staged · <span class="undo">Undo</span><span class="sub">staged for Plan</span>'
      : 'Stage change<span class="sub">staged for Plan</span>';
    btn.addEventListener('click', spec.onStage);
    foot.append(btn);
  } else {
    foot.innerHTML = `<span class="foot-note">${spec.footNote}</span>`;
  }
  box.append(foot);
  host.append(box);
}

/** The slot branch: one pushed level, same back gesture as everything else. */
function renderSlotLevel(host, cell, staged, windowDays, onStage) {
  const s = cell.slot;
  const e = s.estimate;
  const canStage = cell.asserts;
  const capped = /capped/i.test(s.annotation || '');
  // the floor, stated in the slot's own numbers
  const thin = e.n < MIN_SUPPORTED_NIGHTS || e.wide;
  renderParamLevel(host, {
    head: `${hhmm(cell.startMin)}–${hhmm(cell.endMin)}`,
    verdict: canStage ? s.safety_status : 'insufficient evidence',
    unit: 'U/hr',
    current: s.current,
    estimate: e,
    recommended: canStage ? s.recommended : null,
    recommendedQual: canStage
      ? `U/hr${capped ? ', one ≤20% step from current' : ', one conservative step'}`
      : 'no direction asserted, so nothing is recommended',
    currentNoun: 'rate',
    moveWord: /raise/i.test(s.safety_status || '') ? 'raise' : 'move',
    support: `${e.n} clean night${e.n === 1 ? '' : 's'} <span>·</span> ${windowDays} d basal run`,
    sentence: canStage
      ? (s.annotation || '').replace(/,?\s*capped to one ≤?20% step from current/i, '')
      : s.annotation,
    canStage,
    isStaged: staged.has(cell.i),
    footNote: thin
      ? `${e.n} clean night${e.n === 1 ? '' : 's'} — below the ${MIN_SUPPORTED_NIGHTS}-night `
        + `support floor${e.wide ? ' and the interval is wide' : ''}; no direction asserted, `
        + 'nothing to stage.'
      : 'No direction asserted here, so there is nothing to stage; the number and its interval '
        + 'are shown as measured.',
    onStage: () => onStage(cell),
  });
}

/**
 * One I:C BLOCK, through the same panel. `asserts_move` is the backend's single
 * I:C predicate (term 14) — it is read, never re-derived — so a block that
 * asserts carries the identical stage button a slot does, and a held one prints
 * its number and interval at full contrast with nothing to stage.
 */
function renderIcBlockLevel(host, cell, icStaged, onStage, demoNote) {
  const b = cell.block;
  const e = b.estimate;
  const canStage = cell.asserts;
  const held = (b.held_reason || '').trim();
  /* A block that runs through midnight cannot be one span on a linear clock
     axis. It takes the same treatment ISF does — its scope stated in the panel's
     reserved scope line, and nothing drawn — rather than shading a region that
     is not the block. */
  const wrapSay = cell.wraps
    ? `These hours run through midnight — ${cell.span} — so the canvas cannot bracket them `
      + 'as one span. The block is stated here rather than shaded.'
    : '';
  renderParamLevel(host, {
    head: cell.span,
    headQual: cell.label,
    // a made-up block says so on the panel its numbers print on, not only at
    // level 1 — this state can be opened straight into
    scopeSay: [demoNote, wrapSay].filter(Boolean).join(' '),
    /* PORT NOTE (#654), same reasoning as buildIcBlocks's direction read above:
       the backend publishes no `direction` for I:C segments, so "tighter" vs
       "looser" here is a dose-comparison fallback, same as the lane's. It
       decides no eligibility — `canStage` (cell.asserts, i.e. ic_asserts_move)
       already gated that — this only picks the wording for an already-asserted
       change. */
    verdict: canStage
      ? `suggests a ${b.recommended < cell.current ? 'tighter' : 'looser'} ratio`
      : 'no direction asserted',
    unit: 'g/U',
    current: cell.current,
    estimate: e,
    recommended: canStage ? b.recommended : null,
    recommendedQual: canStage
      ? 'g/U, one conservative step'
      : 'no direction asserted, so nothing is recommended',
    currentNoun: 'ratio',
    moveWord: 'move',
    // I:C names its OWN denominator and its own run — never "clean nights"
    support: `${b.n_runs} meal run${b.n_runs === 1 ? '' : 's'} <span>·</span> ${b.n_meals} meals`,
    // the held reason is the block's own sentence; the foot never repeats it
    sentence: b.annotation || held,
    canStage,
    isStaged: icStaged.has(cell.id),
    footNote: held
      ? 'The move is held for the reason above, so there is nothing to stage; the number and '
        + 'its interval are shown as measured.'
      : `${b.n_runs} meal run${b.n_runs === 1 ? '' : 's'}`
        + `${e.wide ? ' and a wide interval' : ''} — no direction asserted, nothing to stage; `
        + 'the number and its interval are shown as measured.',
    onStage: () => onStage(cell),
  });
}

/**
 * ISF — ONE value for the whole day, evidenced only overnight. No lane, no
 * canvas window, no geometry of its own: the same item panel, plus a permanent
 * scope sentence that says where the number comes from and what it cannot
 * separate. Term 31: say the scope in words, draw nothing.
 */
const ISF_SCOPE = 'Measured in the overnight fasting window. Daytime ISF is not separately '
  + 'identifiable, so this one value stands for the whole day.';

function renderIsfLevel(host, isf, isfStaged, onStage) {
  const e = isf.estimate;
  /* Reading the verdict off `recommended` printed "no direction asserted" over
     this level's own weaken sentence, and disagreed with the queue row that
     drilled into it. Both facts come from `isfVerdict` now. */
  const { direction, canStage, nights } = isfVerdict(isf);
  renderParamLevel(host, {
    head: 'ISF',
    verdict: canStage ? 'suggests a change'
      : direction ? 'corrections look stronger than needed'
        : 'no direction asserted',
    scopeSay: ISF_SCOPE,
    unit: 'mg/dL/U',
    current: isf.current,
    estimate: e,
    recommended: canStage ? isf.recommended : null,
    recommendedQual: canStage
      ? 'mg/dL/U, one conservative step'
      : direction ? 'no new number is suggested'
        : 'no direction asserted, so nothing is recommended',
    currentNoun: 'correction factor',
    moveWord: 'move',
    // ISF's own noun and its own run — the nights its estimate is clustered on,
    // the same count and noun the queue row carries. Not the detected windows:
    // a window that produced no fit supports nothing.
    support: `${e.n.toLocaleString()} correction steps <span>·</span> `
      + `${nights} fasting nights`,
    sentence: isf.annotation,
    canStage,
    isStaged: isfStaged,
    footNote: direction
      ? 'Corrections look stronger than needed, but recent lows make a new number unsafe to suggest.'
      : `${e.wide ? 'The interval is wide and no' : 'No'} direction is asserted here, so `
        + 'there is nothing to stage; the number and its interval are shown as measured.',
    onStage,
  });
}

/* Level 1 is the findings queue (terms 34–45), rendered by
   `diagnose-findings-queue.js` straight off the server's projection. The factor
   grid, the settings/patterns tiers and the three per-parameter staging entry rows
   that used to live here are RETIRED by the #662 re-settle: one ranked list in which
   settings and habits interleave by the backend's own priority, no headings, no
   bars, no score numerals. Staging stays where term 13 puts it — at each item's own
   detail level, which every queue row drills into. */

/** Plain-English name for a classifier id — no snake_case reaches the surface. */
function classifierName(id) {
  return id.replace(/_/g, ' ').replace(/\bic\b/i, 'I:C').replace(/\biob\b/i, 'insulin on board');
}

/**
 * Evidence as a table on a shared numeric spine (finding 1). The roster is
 * exactly ONE verdict's occurrences — the drilled band segment, or `fired`
 * (Meets criteria) at rest, per the mock's roster form — so `verdictLabel`
 * names that ONE published category once, as the group header, instead of
 * the row's own evidence-tier quality. Rows carry date/time, the glucose
 * figures, the swing and the (separate) evidence tier.
 *
 * RETIRED, 2026-08-19: the "Attributed here, but no classifier fired" counter
 * sub-group. It split the OLD cause-filtered population (every member of
 * which was, by construction, this row's own driver) from a leftover that
 * could never be populated at rest — dead at rest and, once select-in-place
 * (P35, ADR 31 part 5, Connor 2026-08-19) made the roster homogeneous by
 * verdict, no longer even a coherent split: near_miss/clean occurrences can
 * still carry a DIFFERENT classifier's match on the same anchor, which would
 * have silently routed a near-miss/clean row into a group labelled for
 * fired-but-uncredited leftovers. One flat list, captioned by the roster's own
 * verdict, replaces it; `tierOf` still labels each row's own evidence tier.
 */
function renderEvidence(host, factor, occurrences, verdictLabel, onOpen, onMore, shownCount,
  selected) {
  if (!occurrences.length) {
    // appended, never assigned: the factor head is already in this level
    host.insertAdjacentHTML('beforeend',
      '<div class="empty">No occurrences in this verdict.</div>');
    return;
  }
  const groupPhrase = (factor.cause || '').trim();

  /* Aligned numeric columns: entry → worst → Δ where the fixture holds BOTH
     readings, and a stated "extreme only" cell where it holds one. Nothing is
     inferred to fill a column — a missing reading stays missing. */
  const rows = (list, limit) => list.slice(0, limit).map((o) => {
    const worst = o.worst_bg != null ? Math.round(o.worst_bg) : null;
    const entry = o.bg != null ? Math.round(o.bg) : null;
    const both = entry != null && worst != null && entry !== worst;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ev-row';
    // select-in-place (P35 retired): the emphasised row is a state of this
    // same row, never a separate level
    b.setAttribute('aria-pressed', String(o === selected));
    b.title = o.text || '';
    const nums = both
      ? `<span class="entry">${entry}</span><span class="arrow" aria-hidden="true">→</span>
         <span class="worst">${worst}</span>
         <span class="delta">${worst - entry > 0 ? '+' : '−'}${Math.abs(worst - entry)}</span>`
      : `<span class="only">${worst ?? entry ?? '—'} <span>· extreme only</span></span>`;
    b.innerHTML = `<span class="when">${fmtDate(o.date)} · ${o.t.slice(11, 16)}</span>
      ${nums}
      <span class="tier">${tierOf(o) || 'unclassified'}</span>`;
    b.addEventListener('click', () => onOpen(o));
    return { node: b, occ: o };
  });

  // The hedge prints ONCE, as this group's header, whether five rows or fifty
  // are showing — it is a property of the group, not of a row, so expanding
  // must never restate it.
  host.insertAdjacentHTML('beforeend',
    `<div class="ev-group">${groupPhrase ? `<b>${groupPhrase}</b> — ` : ''}${verdictLabel}`
    + ` <span class="n">· ${occurrences.length} episode${occurrences.length === 1 ? '' : 's'}</span></div>`);
  for (const { node } of rows(occurrences, shownCount)) host.append(node);
  // the cap is a real toggle: five rows, then "N more", then back to five
  if (occurrences.length > EVIDENCE_CAP) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'more';
    more.textContent = shownCount > EVIDENCE_CAP
      ? `Show first ${EVIDENCE_CAP}`
      : `${occurrences.length - EVIDENCE_CAP} more`;
    more.addEventListener('click', onMore);
    host.append(more);
  }
}

/**
 * The band's five anchor states, labelled the way ADR 41 maps them — the
 * frontend reads `verdict_counts` and names categories; it counts nothing.
 * `Meets criteria` / `Borderline` / `Does not meet` are the band's own three
 * drillable segments; `outranked` / `no_data` are residue that never gets a
 * segment and instead prints on the roster's own footer line.
 */
const VERDICT_BAND_KEY = { fired: 'Meets criteria', near_miss: 'Borderline', clean: 'Does not meet' };
const VERDICT_RESIDUE_KEY = { outranked: 'claimed by another factor', no_data: 'not comparable' };

/**
 * The verdict band (ADR 31 part 4, ADR 41). Drilling a segment scopes the
 * roster only — the caller re-derives `scoped` and the canvas keeps drawing
 * every occurrence regardless (ADR 31 part 5). No row means no published
 * `verdict_counts`, so the band draws nothing rather than a false split.
 *
 * Counts come from `verdict_counts_by_family[family]` (finding 1): a lever
 * spanning multiple families publishes one total, but the band sits on a
 * single-family frame, so reading the total would count occurrences the
 * roster below it can never show. Falls back to the row total only when the
 * per-family breakdown is absent (an older payload shape).
 */
function renderVerdictBand(host, row, family, activeVerdict, onPick) {
  if (!row || !row.verdict_counts) return;
  const vc = row.verdict_counts_by_family?.[family] || row.verdict_counts;
  const groups = Object.entries(VERDICT_BAND_KEY).map(([key, lead]) => ({ key, lead, count: vc[key] || 0 }));
  const band = document.createElement('div');
  band.className = 'vband';
  const seg = (g) => `data-verdict="${g.key}" aria-pressed="${g.key === activeVerdict}"`;
  band.innerHTML = `
    <div class="bar" role="group" aria-label="Verdict split"
         style="grid-template-columns:${groups.map((g) => Math.max(g.count, 0.001)).join('fr ')}fr">
      ${groups.map((g) => `<button type="button" class="seg" ${seg(g)}
          aria-label="${g.lead} · ${g.count}"></button>`).join('')}
    </div>
    <div class="keys">
      ${groups.map((g) => `<button type="button" class="key" ${seg(g)}>
          <span class="lead">${g.lead}</span><span class="n">${g.count}</span></button>`).join('')}
    </div>`;
  for (const b of band.querySelectorAll('button[data-verdict]')) {
    b.addEventListener('click', () => onPick(b.dataset.verdict));
  }
  host.append(band);
  const residue = Object.entries(VERDICT_RESIDUE_KEY)
    .map(([key, noun]) => [vc[key] || 0, noun])
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n} ${noun}`)
    .join(' · ');
  if (residue) host.insertAdjacentHTML('beforeend', `<div class="vband-foot">${residue}</div>`);
}

/**
 * Select-in-place (P35 retired): the emphasised roster row's own detail —
 * the full sentence, every classifier's read (matched and not), and the link
 * out to that day's context — mutating the standing screen under the roster
 * rather than owning a level of its own.
 */
function renderOccurrenceDetail(host, occ, factor, hasTrace, at, total, onDay) {
  const tier = tierOf(occ);
  /* The matched classifier's detail is often the very sentence already printed
     as the headline. Printing it again under "Classifier reads" told the reader
     nothing and made the panel look padded, so an identical read collapses to
     its name and tier — the fact that it matched is the information, the words
     are already above. Non-matching reads always print in full: they are the
     counter-evidence and are never a duplicate of anything. */
  const headline = (occ.text || '').trim();
  const nadir = occ.worst_bg != null ? Math.round(occ.worst_bg) : null;
  const entry = occ.bg != null ? Math.round(occ.bg) : null;
  const head = document.createElement('div');
  head.className = 'inner occ-detail';
  head.innerHTML = `
    <div class="occ-head">
      <span class="when">${fmtDate(occ.date)} · ${occ.t.slice(11, 16)}</span>
      <span class="tag">${tier || 'unclassified'}</span>
      ${at >= 0 && total > 1
        ? `<span class="pos">${at + 1} of ${total}<i class="keyhint">← →</i></span>` : ''}
    </div>
    <div class="occ-nums">${entry != null ? `${entry}` : '—'}
      <span>at entry</span> ${nadir != null && nadir !== entry ? `→ ${nadir} <span>nadir</span>` : ''}
      ${entry != null && nadir != null && entry !== nadir
        ? `<span>·</span> ${nadir - entry > 0 ? '+' : ''}${nadir - entry} <span>mg/dL</span>` : ''}</div>
    <div class="statline">${hasTrace
      ? 'The canvas shows this day\'s own CGM trace over the pooled envelope.'
      : 'No trace captured for this day — the canvas shows the pooled envelope with '
        + 'this entry point marked.'}</div>
    <div class="occ-say">${occ.text || `No sentence recorded — this ${factor.cause.toLowerCase()} occurrence carries only its classifier reads.`}</div>`;
  host.append(head);
  const box = document.createElement('div');
  box.className = 'ev-detail';
  box.innerHTML = '<div class="lab" style="font-size:10.5px;color:var(--mk-muted)">Classifier reads</div>'
    + (occ.verdicts || []).map((v) => {
      const dupe = v.matched && headline && (v.detail || '').trim() === headline;
      return `
      <div class="vd" data-matched="${v.matched}">
        <span class="pip" aria-hidden="true"></span>
        <div><div class="lab">${classifierName(v.classifier)} — ${v.matched ? 'matched' : 'not matched'}${v.evidence_tier ? `, ${v.evidence_tier}` : ''}</div>
          ${dupe ? '' : `<div>${v.detail}</div>`}</div>
      </div>`;
    }).join('');
  host.append(box);
  const foot = document.createElement('div');
  foot.className = 'inner occ-foot';
  const dayBtn = document.createElement('button');
  dayBtn.type = 'button';
  dayBtn.className = 'linkbtn';
  dayBtn.textContent = `Open ${fmtDate(occ.date)} in Day`;
  dayBtn.addEventListener('click', onDay);
  foot.append(dayBtn);
  host.append(foot);
}

/* -------------------------------- mount -------------------------------- */

/* The mock's `main()` — same body, minus its four `loadCapture()` awaits. It
   receives the already-adapted captures instead, and returns a teardown so the
   surface can be re-mounted (the mock never re-mounts; it reloads the page).
   `signal` aborts the document/window listeners the ported code registers. */
function boot(root, data, callbacks, signal) {
  const { day, exposureCapture, audit, params, icMissing } = data;
  const { envelope: envelopeIn, markers: markersIn } = data;
  /* #735 — the queue's rows and the dock's object, both server-owned. `findings`
     opens on the GLOBAL projection; `callbacks.loadFindings(window)` fetches the
     projection for a pressed preset or a drawn brace (term 37: both re-scope the
     queue in place, identically). Nothing about membership, order or a denominator
     is worked out here. */
  let findings = data.findings;
  const watched = data.watched;

  /* ---- mock 1982-2011 — VERBATIM ---- */
  /* A capture can declare itself SYNTHETIC. No window of this operator's real
     history produces an I:C block that asserts a move, so the asserting path can
     only be demonstrated on a made-up block — and a demonstration that does not
     say so is a claim about his data. The sentence rides the same one-line
     caveat the inference hedge uses: no box, no tint, no new colour, and it
     prints wherever this capture's numbers do. */
  const synth = params.synthetic;
  /* The capture's own `why` is an engineering note — a paragraph of field names
     and sweep counts. It is the right record for the fixture and the wrong
     sentence for a person, so the surface says the same thing in the words a
     reader needs: which figures are real and which one is not. What is claimed
     here is read off the capture's `lifted` / `real_and_untouched` lists, not
     assumed. */
  const lifted = new Set(synth ? (synth.lifted || []) : []);
  const demoNote = synth
    ? 'Demonstration, not your data — the hold on this block was lifted so the change path '
      + `can be seen.${lifted.has('recommended')
        ? ' Its measured numbers are the real ones; the recommendation is not.' : ''}`
    : '';
  const icBlocks = buildIcBlocks(params.ic_blocks);
  const isf = params.isf[0];
  const exposures = exposureCapture.exposures;
  // The capture's `dense` state asserts moves on four slots with n=1..7 and wide
  // intervals — it predates the support floor. Applying the floor there leaves
  // NOTHING stageable, so the lane binds to `trial`, the one state holding a slot
  // that genuinely clears it (07:00, n=20, CI 0.86–1.20, not wide).
  const auditState = audit.states.trial;
  const lane = buildSlotLane(auditState.analysis.basal);

  /* Replaces mock 2012-2013: the app is served an already-pooled envelope and
     meal track, so the adapter hands over exactly what buildEnvelope() and
     buildMealMarkers() return. Same structures, computed once server-side. */
  const envelope = envelopeIn;
  const markers = markersIn;
  /* ---- mock 2014-2716 — VERBATIM except the edits marked `PORT:` below ---- */
  const colors = chartColors(root);

  renderInstruments(CFG.win, exposureCapture, (key) => {
    // a preset always clears the brace AND pins itself over any frame window
    presetKey = key; drawn = null; explicitPreset = true; paint();
  });
  /* PORT DEVIATION (#654), same reason as the scope readout above: the status
     strip is the app shell's footer, shared by every tab and already carrying
     these identity figures via `cockpitProfileFacts` (lock term 3). The ported
     writes are guarded so this surface never reaches into chrome it does not
     own, and still fill them in wherever the ids exist. */
  const src = el('status-src');
  if (src) {
    src.textContent =
      `CGM + pump history · ISF ${day.isf.toFixed(1)} mg/dL/U · I:C ${day.programmed_ic} g/U`;
  }
  // kept short so the status row can never wrap: it is a fixed-height chrome row
  const clock = el('status-clock');
  if (clock) {
    clock.textContent =
      `exposures ${fmtDate(exposureCapture.window.start)}–${fmtDate(exposureCapture.window.end)} · `
      + `basal ${auditState.analysis.window_days} d to ${fmtDate(auditState.as_of)}`;
  }
  /* The pooling methodology used to ride the level-1 caveat line's hover. Term 43
     retires that banner (the hedge belongs to the habit detail panel, where it has
     one subject), so the string goes with it rather than being re-homed on a
     tooltip nobody would find. */

  /* CAN the inspector re-scope to an arbitrary clock window? Only if every
     family's `occurrences` array is COMPLETE — i.e. it holds all `n` exposures,
     not just the attributed ones — because the denominator of "n of m" is the
     count of that family's exposures inside the window. This capture is
     complete on all four families, so it re-scopes. If a future capture ships
     truncated occurrence lists the inspector does NOT half-scope: it holds full
     range and says so on one line. */
  const RESCOPABLE = Object.values(exposures).every((b) => b.occurrences.length === b.n);

  /**
   * Factors, ranked, for a scope window (null = full range). Both the numerator
   * and the denominator come from the same filtered set, so a row always reads
   * in-window n of in-window m.
   */
  function buildFactors(win, cap = CFG.factorCap) {
    const rows = [];
    for (const [family, block] of Object.entries(exposures)) {
      const inFamily = win ? block.occurrences.filter((o) => inWindow(o, win)) : block.occurrences;
      const familyN = win ? inFamily.length : block.n;
      let byCause;
      if (win) {
        byCause = {};
        for (const o of inFamily) {
          if (o.cause_title) byCause[o.cause_title] = (byCause[o.cause_title] || 0) + 1;
        }
      } else {
        byCause = block.by_cause || {};   // full range: the capture's own tally
      }
      for (const [cause, count] of Object.entries(byCause)) {
        if (count) rows.push({ family, cause, count, familyN });
      }
    }
    rows.sort((a, b) => b.count - a.count);
    const picked = rows.slice(0, cap);
    // the family qualifier earns its place only where a title is ambiguous
    const seen = {};
    for (const r of picked) seen[r.cause] = (seen[r.cause] || 0) + 1;
    for (const r of picked) r.needsQual = seen[r.cause] > 1;
    return picked;
  }

  /** One factor's occurrences and denominator, under the current scope.
      `occurrences` stays this factor's OWN attributed subset — the head
      caption's "not attributed" remainder and the canvas plot both read off
      it unchanged. `familyOccurrences` is new (finding 1 follow-up): the
      frame family's FULL occurrence set, unfiltered by cause, which is what
      the roster must draw from — every published verdict this lever's
      classifier could have read, not only the ones it drove. */
  function scopedFor(f) {
    const win = scopeWindow();
    const all = exposures[f.family].occurrences;
    const inFamily = win ? all.filter((o) => inWindow(o, win)) : all;
    return {
      occurrences: inFamily.filter((o) => o.cause_title === f.cause).slice(0, CFG.occCap),
      familyOccurrences: inFamily.slice(0, CFG.occCap),
      familyN: win ? inFamily.length : f.familyN,
    };
  }
  const occurrencesFor = (f) => scopedFor(f).occurrences;

  const staged = new Set();        // basal slots staged for Plan
  const icStaged = new Set();      // I:C blocks staged for Plan
  let isfStaged = false;           // the ISF value, staged for Plan
  /* A block selection marks a window SEGMENT, never a two-handle brace (term
     32): the dashed edges and their grips are suppressed and the edges stop
     being hit-testable, so a data boundary can never be dragged into a user
     window by accident. */
  let braceless = false;
  let chart = null;
  let shownRows = EVIDENCE_CAP;
  let dir = 'push';
  /* ALIGN's mounted event-comparison canvas (ADR 31 part 3), and the request
     generation that guards it against a stale response landing after the
     reader has moved to a different frame or flipped back to `By clock`. */
  let alignMount = null;
  let alignGeneration = 0;
  let presetKey = CFG.win;                          // what Esc restores
  let shownRange = null;                            // the window the canvas resolved to
  let braceGripTop = 48;                            // y of the grip band, set by paintBrace
  /* An EXPLICIT window choice — a preset press, or a drag — outranks the window
     a frame would derive (factor peak, occurrence, slot span). It stands until
     a NEW navigation: drilling a different factor or occurrence hands the window
     back to the frame. Presets and drawn windows are the same kind of act, so
     they clear together and reassert together. */
  let explicitPreset = false;
  let drawn = CFG.drawn ? CFG.drawn.slice() : null; // the custom window, or none
  /* ONE scope, for the canvas and the inspector alike: whatever window is in
     force — a drawn one, else the pressed preset. A preset and a drawn window
     are the same kind of act, so they re-scope the same things; 24 h is the
     full-range case, reachable from the control row. Null only when the capture
     cannot supply an in-window denominator, and then nothing re-scopes at all —
     never half-scope. */
  const scopeWindow = () => (RESCOPABLE ? (drawn || WINDOWS[presetKey].range) : null);
  /* Counts and the canvas can be looking at different windows — the canvas
     narrows to a factor's peak while the denominators stay on the scope that
     peak was found in. That is legitimate, but it must never be silent, so
     every count prints the window it was counted over. */
  const scopeLabel = () => {
    const w = scopeWindow();
    return w ? `${hhmm(w[0])}–${winEdge(w[1])}` : 'full range';
  };
  // the opening list is built under the opening scope, like every repaint after it
  let factors = buildFactors(scopeWindow());

  /* ---- the findings window (terms 37 · 39 · 40) --------------------------
     The whole day is NOT a window: it is the unscoped global queue, which is
     asserting-only. Anything narrower — a pressed preset or a drawn brace, the same
     act — is an explicit window, and the SERVER decides what it holds. The key is
     the request, so a repaint that does not change the window costs no fetch and a
     response that arrives after the reader has moved on is dropped. */
  const findingsWindow = () => {
    const w = scopeWindow();
    if (!w || (w[0] === 0 && w[1] >= 1440)) return null;
    return w;
  };
  const windowKey = (w) => (w ? `${w[0]}-${w[1]}` : 'global');
  let loadedKey = windowKey(findings?.window?.scoped
    ? [findings.window.start_min, findings.window.end_min] : null);
  let pendingKey = null;
  function ensureFindings() {
    const key = windowKey(findingsWindow());
    if (key === loadedKey || key === pendingKey) return;
    pendingKey = key;
    const w = findingsWindow();
    Promise.resolve(callbacks.loadFindings?.(w ? { start_min: w[0], end_min: w[1] } : null))
      .then((next) => {
        if (pendingKey !== key) return;      // the reader moved on; this is stale
        pendingKey = null;
        if (!next) return;
        findings = next;
        loadedKey = key;
        paint();
      })
      .catch(() => { if (pendingKey === key) pendingKey = null; });
  }

  /** A queue row's drill target — keyed on the projection's own row id, never
      guessed from a title. A row whose parameter this payload cannot show keeps its
      chevron and simply does not move (the app always carries all three). */
  function drillFinding(row) {
    if (row.register === 'finding') {
      /* Level 2 is an evidence TABLE over one family's occurrences, keyed on the
         occurrence's own `cause_title` — so the drill goes to the (family, cause)
         pair the exposures feed actually holds, read through `buildFactors`, the one
         place that already answers that question. The row's `appearances` are
         counted per LEVER, and a lever and a title are not the same key: routing on
         the largest appearance sent a row to a family holding none of its
         occurrences and opened an empty table. Uncapped, because the queue's order
         is the server's and has nothing to do with this list's display cap. */
      const factor = buildFactors(scopeWindow(), Infinity).find((f) => f.cause === row.title);
      // rowId, not the row object itself: findings reload per window, so the
      // verdict band re-resolves the live row on every paint (see findingRowFor)
      if (factor) push({ k: 'factor', factor, rowId: row.id });
      return;
    }
    if (row.parameter === 'isf') { push({ k: 'isf' }); return; }
    if (row.parameter === 'carb_ratio') {
      const cell = icBlocks.find((c) => `ic:${c.id}` === row.id);
      if (cell) pickBlock(cell);
      return;
    }
    if (row.parameter === 'basal_rate') {
      const cell = lane.cells.find((c) => c.startMin === row.span?.start_min);
      if (cell) pickCell(cell);
    }
  }

  /* THE STACK. One frame per level; only `top()` ever renders. Frames:
     {k:'factors'} · {k:'factor', factor} · {k:'occ', occ} · {k:'slot', cell}. */
  const stack = [{ k: 'factors' }];
  const top = () => stack[stack.length - 1];
  const push = (frame) => { dir = 'push'; stack.push(frame); shownRows = EVIDENCE_CAP; paint(); };
  const popTo = (i) => { dir = 'pop'; stack.length = i + 1; paint(); };
  /* The lane is a shortcut INTO the slot branch: from level 1 it pushes, from a
     slot frame it swaps in place, so clicking cells never deepens the stack. */
  function pickCell(cell) {
    /* Selecting a slot is a NAVIGATION that carries its own window, so it
       releases whatever explicit choice was standing and lets the slot frame
       supply the window. Minting a `drawn` window here was wrong twice over: it
       ran the slot's real 30-min bounds through the drawn-window path (which
       re-scoped the whole inspector to 30 minutes and labelled the chip
       "Window 07:00–07:30" instead of "Slot 07:00"), and a 30-min span is under
       the 90-min floor a DRAWN window must respect — a slot boundary is data,
       not a drawn sample, and only the frame path renders it unsnapped. */
    releaseWindow();
    if (top().k === 'slot') { top().cell = cell; paint(); return; }
    push({ k: 'slot', cell });
  }

  /** The I:C findings-queue route: push from level 1, swap in place. */
  function pickBlock(cell) {
    releaseWindow();
    if (top().k === 'block') { top().cell = cell; paint(); return; }
    push({ k: 'block', cell });
  }

  /* SELECT-IN-PLACE (P35 retired, ADR 31 part 5). An evidence-row click used to
     push a third level, the occurrence's own crumb leaf. It now emphasises the
     row in place, on the factor frame that is already standing: no push, no
     crumb change, and — per P21's retirement — no window move either. The
     canvas overlay (day trace + mark) and the arrow-stepping/`n of N` pair
     (P24/P25, kept and re-homed) all read `f.selectedOcc` off the standing
     frame instead of a frame of their own. */
  function selectOcc(occ) {
    const f = top();
    if (f.k !== 'factor') return;
    f.selectedOcc = occ;
    paint();
  }

  /** The published finding row behind a factor frame, re-resolved from the
      LIVE projection every paint (findings reload per window — a captured
      reference would go stale). Keyed on the row's own id, carried onto the
      frame by `drillFinding`, never guessed from a title. `verdict_counts`
      and `evidence` are READ off it (ADR 31 part 6): nothing here counts,
      classifies or re-derives membership. A frame opened without a queue
      drill (the boot presets) carries no rowId, and draws no band. */
  function findingRowFor(f) {
    if (!f.rowId) return null;
    return (findings?.rows || []).find((r) => r.id === f.rowId) || null;
  }

  /** One occurrence's published verdict, looked up by the id the projection
      already carries (`ep_id` + family + `t`) — a lookup, never a
      classification. `ep_id` alone is not unique: two same-kind anchors in one
      episode (e.g. a low and its rebound high, both split_low_rebounds) share
      an `ep_id`, so `.find()` on that alone silently takes the first and
      misreports the second. `t` IS unique per occurrence and the projection
      already publishes it, so joining on both closes the collision. */
  function verdictForOcc(row, factor, occ) {
    if (!row || !row.evidence) return null;
    const hit = row.evidence.find((e) => (
      e.family === factor.family && e.ep_id === occ.ep_id && e.t === occ.t
    ));
    return hit ? hit.verdict : null;
  }

  /** The roster the band's current drill scopes to (ADR 31 part 5 — the band
      drills the ROSTER only; the canvas keeps plotting every occurrence).
      Draws from the frame family's FULL occurrence set (finding 1 follow-up)
      so a drill into Borderline/Does not meet has real members to find —
      the old cause-filtered pool held only this lever's OWN attributed hits,
      which read `fired` by construction, so every other segment was
      structurally empty. Exactly one published verdict shows at a time: the
      drilled segment, or `fired` at rest (the mock's roster form) — never
      `outranked`/`no_data`, which have no band segment and print on the
      band's own footer line instead. A frame opened without a queue drill
      carries no row (and draws no band); it falls back to the legacy
      attributed-only pool so it still shows something sensible. */
  function rosterFor(f) {
    const scoped = scopedFor(f.factor);
    const row = findingRowFor(f);
    if (!row) return scoped.occurrences;
    const wanted = f.bandVerdict || 'fired';
    return scoped.familyOccurrences.filter((o) => verdictForOcc(row, f.factor, o) === wanted);
  }

  // opening depth per mock state
  const firstFactor = factors[0];
  if (CFG.level === 2 || CFG.level === 3) stack.push({ k: 'factor', factor: firstFactor });
  if (CFG.level === 3) {
    // select-in-place (P35 retired): the occurrence lives on the factor frame,
    // never on a level of its own
    const pool = occurrencesFor(firstFactor);
    const occ = pool.find((o) => day.days[o.date] && tierOf(o))
      || pool.find((o) => tierOf(o)) || pool[0];
    if (occ) stack[stack.length - 1].selectedOcc = occ;
  }
  if (CFG.level === 'slot') {
    // opens with a cell selected AND one staged, so the badge, the underline and
    // the Undo affordance are all visible at rest
    const cell = lane.cells.find((c) => c.verdict === 'up') || lane.cells[0];
    if (cell.asserts) staged.add(cell.i);
    stack.push({ k: 'slot', cell });
  }
  /* If the asserting capture is missing, this state opens at LEVEL 1 instead of
     on a block — that is where the missing-capture line prints, and a state
     that silently showed a held block would misreport what it is. */
  if (CFG.level === 'block' && !icMissing) {
    // prefer a block that asserts, so the asserting state opens on it; the held
    // capture has none and opens on its first block instead
    const cell = icBlocks.find((c) => c.asserts) || icBlocks[0];
    if (CFG.stageOpen && cell.asserts) icStaged.add(cell.id);
    stack.push({ k: 'block', cell });
  }
  if (CFG.level === 'isf') stack.push({ k: 'isf' });

  function paintChart() {
    const f = top();
    const preset = WINDOWS[presetKey];
    let win = preset;
    let label = `${preset.label.toUpperCase()} ${winText(preset)}`;
    let note = '';   // the droppable count tail — shed first when space is tight
    braceless = false;
    if (drawn) {
      /* USER SCOPE BEATS DERIVED SCOPE, ALWAYS. A drawn window is a persistent
         workspace: drilling a factor or opening an occurrence scopes WITHIN it
         and never moves the brace. Reported in the chip slot the peak chip
         already occupies. */
      win = { label: 'Window', range: drawn };
      label = `WINDOW ${winText(win)}`;
      markWindowSegment(`Window ${hhmm(drawn[0])}–${hhmm(drawn[1])}`, clearDrawn);
    } else if (explicitPreset) {
      /* A pressed preset is a workspace too, and it outranks the frame for the
         same reason — pressing one at any level is a scope CHANGE by the user,
         never a release back to derived scope. */
      pressPreset(presetKey);
    } else if (f.k === 'factor') {
      const occ = occurrencesFor(f.factor);
      const clock = occ.length ? clockBuckets(occ) : null;
      if (clock) {
        win = { label: 'Factor peak', range: [clock.peak.startMin, clock.peak.endMin] };
        label = `PEAK ${winText(win)}`;
        note = `${clock.peak.n} of ${clock.total}`;
        markWindowSegment(`Factor peak ${winText(win)}`);
      }
    } else if (f.k === 'slot') {
      win = { label: 'Slot', range: [f.cell.startMin, f.cell.endMin] };
      label = `SLOT ${f.cell.label}`;
      markWindowSegment(`Slot ${f.cell.label}`);
    } else if (f.k === 'block') {
      /* A block marks a window SEGMENT — the chip names it, the plot shades it,
         and the brace's grab handles are suppressed (term 32).
         A block that WRAPS midnight is not one span on a linear clock axis, and
         a shaded region that is not the block would be a lie about it — so it
         takes the manifest's own ISF rule instead: say the scope in words, draw
         nothing. The standing window is left exactly as it was and the panel
         states the block's hours. */
      if (f.cell.wraps) {
        pressPreset(presetKey);
      } else {
        win = { label: 'Block', range: [f.cell.startMin, f.cell.endMin] };
        label = `BLOCK ${f.cell.span}`;
        braceless = true;
        markWindowSegment(`Block ${f.cell.span}`);
      }
    } else if (f.k === 'isf') {
      // ISF derives NO canvas window (term 31): the brace does not move, no lane
      // cell re-tints. Whatever window stands, stands.
      pressPreset(presetKey);
    } else {
      pressPreset(presetKey);
    }
    /* Occurrence marks follow the FRAME, whatever set the window — so a factor
       drilled inside an explicit workspace still shows its own dots, on the
       user's window rather than on a peak the canvas no longer jumps to. */
    let occurrences = [];
    if (f.k === 'factor') occurrences = occurrencesFor(f.factor);

    /* Selection puts that day's REAL trace over the pooled envelope when the
       CGM capture holds the date. It is never synthesised: an uncaptured date
       gets the envelope plus the marked entry point, and the panel says so.
       This is select-in-place (P35 retired): the selected occurrence never
       narrows the window (P21 retired) — it only adds the trace and the mark
       on top of whatever window the factor frame already resolved above. */
    const selectedOcc = f.k === 'factor' ? f.selectedOcc : null;
    const traceDay = selectedOcc ? day.days[selectedOcc.date] : null;
    const trace = traceDay ? buildDayTrace(traceDay) : null;
    /* Whatever window the canvas landed on — preset, drawn, or frame-derived —
       is the one the brace draws and the one a handle grabs. One grammar. */
    shownRange = win.range.slice();
    // every canvas number is re-derived for the window in view
    const stats = windowStats(envelope, win.range);
    paintReadout(null);          // a redraw ends the old hover
    chart = renderCanvas(el('chart'), window.echarts, {
      envelope, markers, colors, occurrences, stats, window: win.range,
      windowLabel: label, windowNote: note, trace, onHover: paintReadout,
      selectedOcc,
    });
    /* The count is the WINDOW's, and the days are the CGM capture's own — not a
       coverage claim for the app. The basal run is a different, longer run and
       names itself separately in the slot panel and the status bar. */
    el('canvas-scope').textContent =
      `window ${stats.readings.toLocaleString()} of ${envelope.readings.toLocaleString()} readings`;
    el('canvas-pool').textContent =
      `pooled from ${envelope.days} captured CGM days · ±${envelope.pool} min`;
  }

  /** Tear down whatever ALIGN mounted, and restore the clock canvas. */
  function disposeAlign() {
    alignMount?.observer?.disconnect();
    alignMount?.chart?.dispose();
    alignMount = null;
    el('align-canvas').innerHTML = '';
    el('align-canvas').hidden = true;
    el('chart').hidden = false;
    el('brace').hidden = braceless || !shownRange;
    el('lane-wrap').hidden = false;
  }

  /**
   * ALIGN (ADR 31 part 3). Present only on a finding case file whose factor
   * the lens can re-project (`alignCoordinatesFor`); a switch over
   * already-selected data, so picking `By event` never moves the crumb, the
   * roster or the standing WINDOW — it re-projects the SAME occurrences the
   * factor frame is already scoped to. WINDOW keeps filtering by clock under
   * either projection: the block coordinate the request carries is this
   * canvas's own standing preset (`presetKey`), the one taxonomy WINDOW and
   * the lens's block share.
   *
   * The event-aligned canvas is the lens's own canvas-only render
   * (`renderEventSurface`, `diagnose-event-comparison.js`) — reused, not
   * reimplemented (charter reuse rule). A drawn/custom window has no block
   * equivalent in that taxonomy, so `By event` always requests the standing
   * PRESET regardless of a drawn brace; that is a scope narrowing, recorded
   * in the PR report, not a silent approximation.
   */
  function paintAlign() {
    const f = top();
    const mapped = f.k === 'factor' ? alignCoordinatesFor(f.factor.cause) : null;
    el('align-group').hidden = !mapped;
    if (!mapped) {
      if (alignMount) disposeAlign();
      return;
    }
    const alignKey = f.align === 'event' ? 'event' : 'clock';
    renderAlign(alignKey, (key) => {
      if (f.align === key) return;
      f.align = key;
      paint();
    });
    if (alignKey === 'clock') {
      if (alignMount) disposeAlign();
      return;
    }
    // already showing the right projection for this frame: nothing to refetch
    if (alignMount && alignMount.frame === f && alignMount.presetKey === presetKey) return;
    el('chart').hidden = true;
    el('brace').hidden = true;
    el('lane-wrap').hidden = true;
    const host = el('align-canvas');
    host.hidden = false;
    const generation = ++alignGeneration;
    Promise.resolve(callbacks.loadProjection?.({
      view: mapped.view, factor: mapped.factor, block: presetKey, another: false,
    })).then((projection) => {
      if (generation !== alignGeneration || top() !== f) return;
      alignMount?.observer?.disconnect();
      alignMount?.chart?.dispose();
      alignMount = { ...renderEventSurface(host, projection), frame: f, presetKey };
    }).catch(() => {
      // ALIGN is a re-projection, not a navigation: a failed fetch leaves the
      // reader on whatever the canvas already showed rather than erroring the
      // whole workstation out from under an unrelated finding.
      if (generation === alignGeneration) host.hidden = true;
    });
  }

  /* The badge counts STAGED PARAMETER ITEMS — a basal slot, an I:C block, the
     ISF value are one each (term 13). Plan's count is the whole basket, not
     basal's alone. */
  const stagedTotal = () => staged.size + icStaged.size + (isfStaged ? 1 : 0);

  /* PORT DEVIATION (#654), same reason as the scope/status guards above: the
     Plan step and its badge are the shell's `<nav class="cockpit-flow">`
     (`frontend/index.html`), Vue-bound to the real Plan draft via
     `step.count` — not this surface's chrome to paint. The mock's
     `#step-plan`/`#plan-badge` ids don't exist in the app (this null
     dereference on `el('step-plan')` was the exact boot crash the replay hit),
     so the writes are guarded away rather than given ids to write to. The badge
     itself reads through the real path: `callbacks.stage` → `diagnoseStage` →
     `planItems`, which Vue renders as `step.count`, hidden at zero by
     `.cockpit-badge[data-count="0"]` in shell.css. */

  /** What this surface has staged, named the way the dock prints it (term 49). */
  function stagedDescriptor() {
    const cells = lane.cells.filter((c) => staged.has(c.i));
    if (cells.length) {
      const span = cells.length === 1 ? cells[0].label
        : `${cells[0].label} to ${hhmm(cells[cells.length - 1].endMin)}`;
      const head = cells[0].slot;
      // the SAME rounded numbers the item's own detail panel prints — a dock that
      // spells 1.131 beside a panel reading 1.13 is two numbers for one fact
      const numbers = head.recommended == null ? ''
        : ` · ${u(head.current)} → ${u(head.recommended)} U/hr`;
      return { count: stagedTotal(), title: `Basal ${span}${numbers}` };
    }
    const block = icBlocks.find((c) => icStaged.has(c.id));
    if (block) {
      return { count: stagedTotal(),
        title: `I:C ${block.span} · ${u(block.current)} → ${u(block.block.recommended)} g/U` };
    }
    if (isfStaged) {
      return { count: stagedTotal(),
        title: `ISF · ${u(isf.current)} → ${u(isf.recommended)} mg/dL/U` };
    }
    return { count: 0, title: '' };
  }

  /* TERM 46/47 — the dock is repainted in place on every paint, at every level:
     it is the pane's floor, not the level's content. The watched object's
     precedence is the server's (Trial XOR Focus, pump wins); the Plan branch is
     this surface's own staged draft, which is what the deleted header used to
     report. */
  function paintWatch() {
    paintWatchDock(el('watch-dock'),
      watchDockView({ watched, staged: stagedDescriptor() }),
      (to) => callbacks.go?.(to));
  }

  /** Breadcrumb: every ancestor is a click, the leaf is plain text. */
  function crumbLabel(frame) {
    // D7/term 34 — the crumb root is the queue's own noun, at every depth
    if (frame.k === 'factors') return 'Findings';
    if (frame.k === 'factor') return frame.factor.cause;
    if (frame.k === 'slot') return `${frame.cell.label} slot`;
    if (frame.k === 'block') return `${frame.cell.label} block`;
    // 'isf' is the last frame kind: select-in-place (P35 retired) never adds a
    // crumb level, so no frame ever reaches an `occ` branch here.
    return 'ISF';
  }

  /** Draw one path. Ancestors pop; the current item is inert; separators are decor. */
  function drawTrail(items) {
    const trail = el('crumb-trail');
    trail.innerHTML = '';
    items.forEach((it, i) => {
      if (i) trail.insertAdjacentHTML('beforeend', '<span class="chev" aria-hidden="true">›</span>');
      if (it.ellipsis) {
        trail.insertAdjacentHTML('beforeend', '<span class="chev" aria-hidden="true">…</span>');
        return;
      }
      if (it.last) {
        const here = document.createElement('span');
        here.className = 'here';
        here.setAttribute('aria-current', 'page');
        here.textContent = it.label;
        trail.append(here);
        return;
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = it.label;
      b.addEventListener('click', () => popTo(it.index));
      trail.append(b);
    });
  }

  function paintCrumb() {
    const trail = el('crumb-trail');
    const items = stack.map((frame, i) => ({
      label: crumbLabel(frame), index: i, last: i === stack.length - 1,
    }));
    drawTrail(items);
    /* If the path would run into the meta's reserve the MIDDLE gives way —
       never the root, never the current item. Measured rather than estimated:
       the trail clips its own overflow, so scrollWidth tells the truth about
       whether it fit. Depth never exceeds 3 here, so one elided ancestor is the
       whole story and the … needs no popover behind it. */
    /* Ladder, in order: whole path -> middle elided to … -> middle gone
       entirely. Root and current are never abbreviated at any rung. */
    const last = items[items.length - 1];
    if (items.length > 2 && trail.scrollWidth > trail.clientWidth) {
      drawTrail([items[0], { ellipsis: true }, last]);
      if (trail.scrollWidth > trail.clientWidth) drawTrail([items[0], last]);
    }
    const f = top();
    /* TERM 45 — at level 1 the meta is the queue's own copy and nothing else:
       `N findings · 30 days` global, `N in this window` scoped, `30 days` empty.
       No sort language (the order already shows the mechanism) and no window range
       (the follow chip and the chart's own window label both print the hours, and a
       third copy one line apart is noise). */
    el('crumb-meta').toggleAttribute('data-queue', f.k === 'factors');
    el('crumb-meta').textContent = f.k === 'factors'
      ? queueMeta(findings)
      : f.k === 'factor'
        ? (() => { const sc = scopedFor(f.factor); return `${sc.occurrences.length} of ${sc.familyN} · ${scopeLabel()}`; })()
        /* #735 — this used to read `N staged`, which put the deleted header's exact
           words back on screen beside the dock's `Plan · staged` (term 47: two
           claims about one object). Every sibling level's meta names its OWN
           denominator and run (term 16); this one now does too. */
        : f.k === 'slot' ? `${f.cell.slot.days} clean nights · ${auditState.analysis.window_days} d basal run`
          // every parameter's meta names its OWN denominator and run
          : f.k === 'block' ? `${f.cell.block.n_runs} meal runs · ${f.cell.block.n_meals} meals`
            : f.k === 'isf' ? `${isf.estimate.n.toLocaleString()} correction steps`
              : (tierOf(f.occ) || 'unclassified');
  }

  /** Exactly one level renders into #level; the previous one is discarded. */
  function paintLevel() {
    const host = el('level');
    host.innerHTML = '';
    host.dataset.dir = dir;
    // restart the swap animation on every transition
    host.style.animation = 'none';
    void host.offsetWidth;
    host.style.animation = '';
    const f = top();
    if (f.k === 'factors') {
      /* TERM 43 — no `Inferred patterns, not settled causes` banner here. A banner
         over a ranked list cannot say WHICH rows it hedges, and rank interleaves
         habits and settings, so no position scopes it honestly. The hedge belongs to
         the habit DETAIL panel, where it has exactly one subject. */
      host.dataset.loading = String(pendingKey !== null);
      renderFindingsQueue(host, findings, drillFinding);
      return;
    }
    if (f.k === 'slot') {
      renderSlotLevel(host, f.cell, staged, auditState.analysis.window_days, (cell) => {
        if (staged.has(cell.i)) staged.delete(cell.i); else staged.add(cell.i);
        // PORT: reach the app's Plan draft as well as the local tally
        callbacks.stage?.({ family: 'basal', key: cell.slot.__planKey }, staged.has(cell.i));
        paint();
      });
      return;
    }
    if (f.k === 'block') {
      renderIcBlockLevel(host, f.cell, icStaged, (cell) => {
        if (icStaged.has(cell.id)) icStaged.delete(cell.id); else icStaged.add(cell.id);
        // PORT: reach the app's Plan draft as well as the local tally
        callbacks.stage?.({ family: 'ic', key: cell.block.__planKey }, icStaged.has(cell.id));
        paint();
      }, demoNote);
      return;
    }
    if (f.k === 'isf') {
      renderIsfLevel(host, isf, isfStaged, () => {
        isfStaged = !isfStaged;
        // PORT: reach the app's Plan draft as well as the local tally
        callbacks.stage?.({ family: 'isf', raw: isf }, isfStaged);
        paint();
      });
      return;
    }
    // 'factor' is the only remaining frame kind: the finding case file.
    const { occurrences, familyN } = scopedFor(f.factor);
    const clock = occurrences.length ? clockBuckets(occurrences) : null;
    renderFactorHead(host, f.factor, occurrences, familyN, scopeLabel(), clock, lane, pickCell,
      icBlocks, pickBlock);

    /* THE VERDICT BAND (ADR 31 part 4, ADR 41). Its counts come straight off
       the published finding row's `verdict_counts` — the frontend labels the
       five anchor states, it never counts or classifies into them (ADR 31
       part 6). Drilling a segment scopes the ROSTER only (ADR 31 part 5): the
       canvas above keeps plotting every occurrence regardless of `bandVerdict`. */
    const row = findingRowFor(f);
    renderVerdictBand(host, row, f.factor.family, f.bandVerdict, (v) => {
      f.bandVerdict = f.bandVerdict === v ? null : v;
      // a selection that falls outside the newly scoped roster cannot stand
      if (f.selectedOcc && f.bandVerdict
        && verdictForOcc(row, f.factor, f.selectedOcc) !== f.bandVerdict) {
        f.selectedOcc = null;
      }
      paint();
    });

    const scoped = rosterFor(f);
    // the roster's own verdict — the drilled segment, or `fired` at rest — is
    // ONE published category, named once as the group header (never derived,
    // just looked up in the same band vocabulary renderVerdictBand uses).
    const rosterVerdict = f.bandVerdict || 'fired';
    const verdictLabel = VERDICT_BAND_KEY[rosterVerdict] || rosterVerdict;
    // the numeric columns are captioned once, at the level — not per group
    host.insertAdjacentHTML('beforeend',
      `<div class="lvl-cap">Occurrences
        <span class="meta">entry → worst · Δ &nbsp;·&nbsp; ${scoped.length} of ${familyN} in ${scopeLabel()}</span></div>`);
    renderEvidence(host, f.factor, scoped, verdictLabel, selectOcc,
      () => { shownRows = shownRows > EVIDENCE_CAP ? EVIDENCE_CAP : Infinity; paint(); },
      shownRows, f.selectedOcc);

    /* SELECT-IN-PLACE (P35 retired): the selected row's detail mutates the
       standing screen right here, under the roster it belongs to — never a
       pushed level. P24/P25 (kept, re-homed) step it through `scoped`, the
       roster the band's current drill actually shows. */
    if (f.selectedOcc && scoped.includes(f.selectedOcc)) {
      const at = scoped.indexOf(f.selectedOcc);
      renderOccurrenceDetail(host, f.selectedOcc, f.factor, Boolean(day.days[f.selectedOcc.date]),
        at, scoped.length, () => callbacks.day?.(f.selectedOcc));
    }
  }

  // Esc and the chip's × both mean "restore the last preset" — which is an
  // explicit choice in its own right, so it outranks the frame's window too
  function clearDrawn() { drawn = null; explicitPreset = true; paint(); }

  /** A lane click is a physical scope choice, so it REPLACES the workspace.
      This is the only navigation that clears one — drilling never does. */
  function releaseWindow() { drawn = null; explicitPreset = false; }

  /**
   * Position the brace and dim the lane. The edges span the whole canvas body,
   * so they project down through the basal lane on the plot's own spine; the
   * lane carries no drag listener of its own, so it stays click-only.
   */
  function paintBrace() {
    const brace = el('brace');
    const chartEl = el('chart');
    const cells = el('lane').querySelectorAll('button');
    if (!shownRange) {
      brace.hidden = true;
      for (const b of cells) b.removeAttribute('data-outside');
      return;
    }
    // a block selection marks its segment WITHOUT a resizable brace (term 32);
    // the dimming below still runs, so the register stays readable
    brace.hidden = braceless;
    const [from, to] = shownRange;
    const xa = xAtMinute(chartEl, from);
    const xb = xAtMinute(chartEl, to);
    /* PLOT_TOP/PLOT_BOTTOM track the chart module's grid[0] insets. The edges
       run from the plot's top edge down to the bottom of the basal lane — the
       "project through the lane" spine, clipped at both ends. */
    const laneEl = el('lane');
    const laneBottom = laneEl.offsetTop + laneEl.offsetHeight;
    const plotTop = PLOT_TOP;
    const plotBottom = chartEl.clientHeight - PLOT_BOTTOM;
    for (const [id, x] of [['brace-a', xa], ['brace-b', xb]]) {
      const edge = el(id);
      edge.style.left = `${x}px`;
      edge.style.top = `${plotTop}px`;
      edge.style.height = `${Math.max(0, laneBottom - plotTop)}px`;
    }
    // grips sit BELOW the window label's line, so they can never cover its text
    const gripTop = Math.min(plotTop + 22, Math.max(plotTop, plotBottom - 22));
    braceGripTop = gripTop;
    for (const [id, x] of [['grip-a', xa], ['grip-b', xb]]) {
      el(id).style.left = `${x}px`;
      el(id).style.top = `${gripTop}px`;
    }
    // a slot outside the window is dimmed, never removed
    lane.cells.forEach((cell, i) => {
      if (!cells[i]) return;
      cells[i].dataset.outside = String(cell.endMin <= from || cell.startMin >= to);
    });
  }

  /**
   * Drag to draw. Originates in the PLOT BODY only — the lane has no drag
   * listener, so it stays click-only. While dragging, only the two dashed edges
   * and the chip text move: the chart is not re-rendered, so there is no
   * rubber-band fill and no animation. The commit happens on mouseup.
   */
  function installDrag() {
    const chartEl = el('chart');
    let mode = null; let anchor = 0; let width = 0; let grabOffset = 0;
    let moved = false; let pressMinute = 0;
    let rafId = 0;

    /* LIVE SHADING. Two moving dashed edges with nothing between them gave no
       read on the window being created. Rather than invent a rubber-band style,
       the COMMITTED treatment tracks the gesture: paintChart re-resolves the
       window and re-renders, so the region carries the same markArea tint, the
       same dashed border and the same label it will have on mouseup — they are
       the same code path, so they cannot diverge.

       A DOM overlay was the other candidate and is rejected: the chart's own
       markArea would still be shading the OLD window underneath, so the plot
       would show two tinted regions for the length of the drag.

       Throttled to one repaint per frame; the inspector is deliberately NOT
       repainted here (only paintChart), so the drag costs one canvas redraw and
       no DOM rebuild. */
    const liveRepaint = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => { rafId = 0; paintChart(); paintBrace(); });
    };
    const minuteAt = (ev) => minuteAtX(chartEl, ev.clientX - chartEl.getBoundingClientRect().left);

    function move(ev) {
      if (!mode) return;
      const m = minuteAt(ev);
      if (!moved) {
        /* First real movement: NOW the gesture takes hold of the window. Every
           mutation lives here, so a press that never moves cannot leave one. */
        moved = true;
        if (mode === 'draw') {
          anchor = pressMinute;
        } else if (mode === 'a') { takeHold(); anchor = drawn[1]; }
        else if (mode === 'b') { takeHold(); anchor = drawn[0]; }
        else { takeHold(); width = drawn[1] - drawn[0]; grabOffset = pressMinute - drawn[0]; }
      }
      if (mode === 'draw') {
        drawn = snapWindow([anchor, m], envelope.pool, m < anchor ? 'end' : 'start');
      } else if (mode === 'a') {
        drawn = snapWindow([m, anchor], envelope.pool, 'end');
      } else if (mode === 'b') {
        drawn = snapWindow([anchor, m], envelope.pool, 'start');
      } else {
        const raw = Math.min(1440 - width, Math.max(0, m - grabOffset));
        const start = Math.round(raw / BIN_MINUTES) * BIN_MINUTES;
        drawn = [start, start + width];
      }
      paintBrace();
      liveRepaint();   // the window fills in as it is drawn, in its final skin
      // which edge is under the hand? for a fresh draw it is whichever side of
      // the anchor the pointer is on; a slide moves both
      paintLive(mode === 'slide' ? 'both'
        : mode === 'draw' ? (m >= anchor ? 'b' : 'a')
          : mode);
      markWindowSegment(`Window ${hhmm(drawn[0])}–${winEdge(drawn[1])}`, clearDrawn);
    }

    /** Mid-drag feedback: the moving edge goes solid, and reads its snapped time. */
    function paintLive(which) {
      const readout = el('brace-readout');
      el('brace-a').classList.toggle('live', which === 'a' || which === 'both');
      el('brace-b').classList.toggle('live', which === 'b' || which === 'both');
      if (!which || !drawn) { readout.hidden = true; return; }
      readout.hidden = false;
      readout.textContent = which === 'both'
        ? `${hhmm(drawn[0])}–${winEdge(drawn[1])}`
        : winEdge(which === 'a' ? drawn[0] : drawn[1]);
      const x = which === 'both'
        ? (xAtMinute(chartEl, drawn[0]) + xAtMinute(chartEl, drawn[1])) / 2
        : xAtMinute(chartEl, which === 'a' ? drawn[0] : drawn[1]);
      readout.style.left = `${x}px`;
      readout.style.top = `${braceGripTop + 26}px`;
    }

    function end() {
      if (!mode) return;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      const dragged = moved;
      mode = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      // a press that never moved changed nothing, so there is nothing to commit
      // and nothing to undo — leave the panel exactly as the press found it
      if (!dragged) return;
      paintLive(null);
      paint();   // commit: the window now renders in the full brace treatment
    }
    /* Is this press inside the shown window's interior? Hit-tested rather than
       overlaid: an interior <div> would swallow the chart's own hover tooltip
       inside the very window being studied. */
    const EDGE_GRAB = 5;   // px either side of a dashed edge

    /* The dashed edge is drawn the full height of the plot, so the WHOLE length
       of it has to be grabbable — a hit zone that only covered the little top
       grip meant a press on the edge at mid-plot started a new window instead of
       resizing. Returns which edge is under x, or null. */
    const edgeAt = (x) => {
      // a block's segment has no handles at all — nothing to grab, by term 32
      if (!shownRange || braceless) return null;
      if (Math.abs(x - xAtMinute(chartEl, shownRange[0])) <= EDGE_GRAB) return 'a';
      if (Math.abs(x - xAtMinute(chartEl, shownRange[1])) <= EDGE_GRAB) return 'b';
      return null;
    };
    const overInterior = (x) => shownRange && !braceless
      && x > xAtMinute(chartEl, shownRange[0]) + EDGE_GRAB
      && x < xAtMinute(chartEl, shownRange[1]) - EDGE_GRAB;

    /* A preset is just a starting brace. The moment a handle or the interior is
       grabbed the window becomes the user's own: the preset unpresses and the
       chip takes over, under the same snap rules. Esc puts the preset back. */
    function takeHold() {
      if (!drawn) drawn = shownRange.slice();
    }

    /* A press ARMS a gesture; it does not perform one. Nothing is converted,
       created or repainted until the pointer actually moves — so a click and
       release anywhere in the plot is a no-op by construction rather than by a
       restore-what-we-broke path. This is what leaked: the edge and interior
       branches ran takeHold() on mousedown and never set `moved`, so clicking
       (not dragging) a preset's edge silently turned it into a drawn window,
       unpressed the preset and left a chip behind. */
    function begin(kind, ev) {
      if (ev.button !== 0) return;
      const x = ev.clientX - chartEl.getBoundingClientRect().left;
      if (kind === 'draw') {
        const box = plotBox(chartEl);
        if (x < box.left || x > box.right) return;   // margins are not the plot
        const edge = edgeAt(x);
        if (edge) return begin(edge, ev);            // an edge outranks draw-new
        if (overInterior(x)) return begin('slide', ev);
      }
      ev.preventDefault();
      mode = kind;
      moved = false;
      pressMinute = minuteAt(ev);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', end);
    }

    chartEl.addEventListener('mousedown', (ev) => begin('draw', ev));
    // the only hover feedback: the cursor says which gesture this press will be
    chartEl.addEventListener('mousemove', (ev) => {
      if (mode) return;
      const x = ev.clientX - chartEl.getBoundingClientRect().left;
      chartEl.style.cursor = edgeAt(x) ? 'col-resize'
        : overInterior(x) ? 'grab' : 'crosshair';
    });
    el('grip-a').addEventListener('mousedown', (ev) => { ev.stopPropagation(); begin('a', ev); });
    el('grip-b').addEventListener('mousedown', (ev) => { ev.stopPropagation(); begin('b', ev); });
    // Esc restores the last preset
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && drawn) { ev.preventDefault(); clearDrawn(); }
    }, { signal });   // PORT: abortable
    window.addEventListener('resize', paintBrace, { signal });   // PORT: abortable
  }

  function paint() {
    // levels 2 and 3 still re-scope with the window, denominators included; level 1
    // asks the SERVER for its rows instead (term 40)
    factors = buildFactors(scopeWindow());
    ensureFindings();
    paintCrumb();
    paintLevel();
    renderLane(lane, top().k === 'slot' ? top().cell : null, staged, pickCell);
    renderLaneKey(lane);
    paintWatch();
    paintChart();
    paintBrace();
    paintAlign();
  }


  /* KEYBOARD. Esc is NOT bound here — it keeps its window semantics (see the
     design note's KEYBOARD block). Backspace pops a level at any depth; ← and →
     are dedicated to stepping the SELECTED occurrence (P24/P25, kept and
     re-homed onto select-in-place — there is no occurrence level any more).
     Stepping STOPS at the ends rather than wrapping: an instrument should not
     silently return you to the first reading. */
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const f = top();
    if (ev.key === 'Backspace' && stack.length > 1) {
      ev.preventDefault();
      dir = 'pop';
      stack.pop();
      paint();
      return;
    }
    if (f.k !== 'factor' || !f.selectedOcc
      || (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight')) return;
    const siblings = rosterFor(f);   // the band's current drill, same list the roster shows
    const at = siblings.indexOf(f.selectedOcc);
    const next = at + (ev.key === 'ArrowRight' ? 1 : -1);
    if (at < 0 || next < 0 || next >= siblings.length) return;
    ev.preventDefault();
    f.selectedOcc = siblings[next];   // same frame, next reading — the panel and
    paint();                          // the day trace both follow from the frame
  }, { signal });   // PORT: abortable

  observeResize(el('chart'), () => chart);
  installDrag();
  paint();
  // the brace can only be placed once the chart has its first measured width
  requestAnimationFrame(paintBrace);
  /* The mock reaches Day through a dead button; the app has a real Day surface,
     so the occurrence level's link calls back into it. */
  root.__dwOpenDay = (occ) => callbacks.day?.(occ);
  /* `destroy` tears down the boot instance; `repaintDay` is the ONE narrow
     in-place operation the app seam is allowed to reach in with — a day's real
     trace resolved (dayMap filled `day.days[date]`), so repaint the current
     level and chart off the SAME frame stack, drawn window and staged sets.
     It reuses `paint()`, so the reader's depth and workspace survive; it does
     NOT re-run boot() or reassign the root MARKUP (#666). */
  return { destroy() { chart = null; }, repaintDay: paint };
}

/* ---------------------------------------------------------------------------
   The app seam. Everything above this line is the mock's; everything below is
   the mounting and state addressability Phase 3 owes.
--------------------------------------------------------------------------- */

/**
 * Mount the ported workstation into `root`.
 *
 * Interface: `setData` re-renders from a fresh API payload, `refresh` re-renders
 * in place (the theme watcher uses it, because the ported chartColors() samples
 * the live stylesheet), `setError` replaces the surface with a message. The
 * behaviour behind it is the locked mock's, unedited.
 */
/* `railLead` (#677 re-settle, term 3): optional markup for one leading
   instrument in the rail, plus a hook to wire it after each render. The event
   comparison passes the View selector through it so Glucose carries the same
   lens control Meals and Lows do, in the same optical row. `render()` rewrites
   the whole root, and the surface calls it on its own state changes, so the
   lead has to be re-injected here rather than once by the caller. */
export function createDiagnoseWorkstation({ root, callbacks = {}, railLead = null }) {
  let payload = null;
  let captures = null;
  let teardown = null;
  let repaintDay = null;
  let aborter = null;

  /* PORT DEVIATION (#654): shared by the public `setError` below and the
     payload guard just past it. Not mock code — the mock never receives a
     malformed capture, since it is driven by static files, not an HTTP
     response crossing a process boundary. */
  function showError(message) {
    if (aborter) { aborter.abort(); aborter = null; }
    teardown = null;
    repaintDay = null;
    root.className = 'dw dw-error';
    root.textContent = message;
  }

  function render() {
    if (teardown) { teardown(); teardown = null; }
    repaintDay = null;
    if (aborter) { aborter.abort(); aborter = null; }
    if (!payload) return;
    state = queryState('typical');
    if (!Object.prototype.hasOwnProperty.call(CFG_BY_STATE, state)) state = 'typical';
    CFG = CFG_BY_STATE[state];
    captures = toCaptures(payload, { ...callbacks, state });
    /* PORT DEVIATION (#654): a real /analyze response always carries exactly
       one ISF row, so an empty one here means this payload never had real
       analyze data — a caller across the app's own HTTP boundary fed
       `setData` something malformed or absent (the reachable case: the
       #654 hotfix above, before it was fixed, mounted on an all-null
       payload). `boot()` below dereferences `params.isf[0].evidence`
       unconditionally (mock 1982-2011, VERBATIM) — it has no reason to
       guard input the mock's own static captures never fail to provide.
       Failing closed here, into the surface's own failure path, is a trust
       boundary the mock does not have and does not need. */
    if (!captures.params.isf.length) {
      showError('Diagnose is unavailable.');
      return;
    }
    /* #735, the same trust boundary: level 1 IS the findings queue, so a payload
       that carries no projection has no inspector to render. Failing closed here
       beats painting an empty queue that would read as "nothing to report". */
    if (!captures.findings || !Array.isArray(captures.findings.rows)) {
      showError('Diagnose is unavailable.');
      return;
    }
    /* The opener reads the rendered state off the DOM and fails the run when it
       does not equal the requested one, so this attribute is the contract, not
       a debug aid (mock side: `document.body.dataset.state`). */
    root.dataset.state = state;
    root.className = 'dw';
    root.innerHTML = MARKUP;
    if (railLead) {
      root.querySelector('.instruments').insertAdjacentHTML('afterbegin', railLead.markup);
      railLead.install(root.querySelector('.instruments'));
    }
    aborter = new AbortController();
    const booted = boot(root, captures, callbacks, aborter.signal);
    teardown = booted.destroy;
    repaintDay = booted.repaintDay;
  }

  /* State addressability. The mock is driven by `?mode=`; so is the build, and
     the parameter is written into the URL so a reload keeps the state (behaviour
     stories S22 and S23 both reload). */
  function gotoState(next) {
    const url = new URL(window.location.href);
    url.searchParams.set('mode', next);
    window.history.replaceState({}, '', url);
    render();
    return root.dataset.state;
  }
  window.__dwGotoState = gotoState;

  return {
    setData(nextPayload) { payload = nextPayload; render(); },
    setError(message) { showError(message); },
    refresh() { render(); },
    /* A day's real trace resolved: repaint in place off the live boot instance,
       preserving navigation state. No-op if the surface is unmounted or in its
       error state (#666). */
    repaintDay() { repaintDay?.(); },
    gotoState,
  };
}
