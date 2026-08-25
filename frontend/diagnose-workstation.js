/* Diagnose workstation — PORTED from the locked mock, not authored here.
 *
 * Source: the archived ★ LOCKED cockpit mock, the module in its
 * <script type="module"> block, lines 1105-2717. Everything from the readout
 * painter to renderOccurrenceLevel is transferred VERBATIM.
 *
 * What is NOT verbatim, and why:
 *   - the chart module is imported from its ported path;
 *   - `_shell.js` is mock-harness chrome. `resolveColors` is copied from it and
 *     `queryState` is adapted to the app's route query because the ported code
 *     calls them; `applyTheme` and `renderMockBar` are dropped (the app owns its
 *     theme, and the mock bar is excluded from the contract by the behaviour
 *     ledger, story S22's note);
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
  buildEnvelope, buildMealMarkers, renderCanvas, observeResize,
  buildSlotLane, cellAtMinute, windowStats, hhmm, windowSpanText,
  BIN_MINUTES, MIN_SUPPORTED_NIGHTS,
  snapMinute, snapWindow, commitWindow, commitSlide, minuteAtX, xAtMinute, plotBox, windowSpans,
  buildDayTrace,
  renderHistoryEvents, validateHistoryEvents,
} from './diagnose-workstation-chart.js';
import { toCaptures, isfVerdict } from './diagnose-workstation-data.js';
import {
  assertMatchingFindingCasePreparation,
  inconsistentFindingProjection,
  sameFindingCaseWindow,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
// #735: level 1 is the server-owned findings queue, and the pane has a floor.
import {
  eventChartCoordinate, renderFindingsQueue, queueMeta,
} from './diagnose-findings-queue.js';
import { watchDockView, paintWatchDock } from './watched-change-dock.js';
/* ADR 31 part 3 (issue #41) — ALIGN's "By event" mode reuses the lens's own
   canvas-only render rather than a second implementation of the projection's
   draw. `diagnose-event-comparison.js` imports `createDiagnoseWorkstation`
   from this module too; the cycle is safe because neither side calls the
   other's import at module-evaluation time, only from inside functions run
   later, after both modules have finished loading. */
import { renderEventSurface, validEventProjection } from './diagnose-event-comparison.js';

/* VERBATIM from the mock's shared harness chrome. The ported chartColors() calls it, and
   it must read the live stylesheet rather than any restated token (R3). */
export function resolveColors() {
  const styles = getComputedStyle(document.documentElement);
  const names = ['primary', 'primary-600', 'primary-soft', 'surface', 'surface-2',
    'text', 'muted', 'line', 'ok', 'ok-soft', 'warn', 'warn-soft', 'danger', 'danger-soft'];
  return Object.fromEntries(names.map((name) => [name, styles.getPropertyValue(`--mk-${name}`).trim()]));
}

/* PORT: the mock reads `?mode=` from the route query. */
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

    <section class="pane inspector" aria-labelledby="crumb-trail">
      <!-- TERM 47 — the header's staged status is DELETED, not restyled. It named
           only the Plan branch of a four-branch object, so it could read "nothing
           staged" while a Trial was being watched; the dock below is now the single
           reporter of that state. Supersedes term 13's inspector-meta clause and
           behaviour-ledger story S16's header assertion. -->
      <header class="crumb">
        <h2 class="trail" id="crumb-trail"></h2>
        <span class="meta" id="crumb-meta"></span>
        <div class="filter-wrap" id="filter-wrap" hidden>
          <button class="filter-trigger" id="filter-trigger" type="button"
            aria-haspopup="menu" aria-expanded="false">Filter</button>
          <div class="filter-menu" id="filter-menu" role="menu" aria-label="Findings filters" hidden></div>
        </div>
      </header>
      <div class="body">
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
  if (!head || !head.querySelector('#rd-time')) return;
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
  insufficient: 'insufficient evidence', nodata: 'no nights of steady data',
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
const winText = (w) => windowSpanText(w.range);

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
  /* THEME DEVIATION (#736) — the mix ratios cannot be one number.
     The 10–90 envelope is ceiling-bound in DARK: at 13% of the measured signal
     it composites to rgb(36,39,30) on the dark field and measures 1.22:1, and
     no token can lift it, because the ceiling is the ratio and not the source —
     even a pure-white source at 13% over that field stops at 1.52:1
     (the Harmonic theme lock's "owed obligations"). Light does not have that
     ceiling: a subtractive tint on a light ground reads at a contrast an
     additive one does not, so its two bands can spend more chroma on the
     measured shape without competing with the median.
     So the ratio is theme-specific. It is read off `color-scheme`, which both
     themes declare, rather than off a class name — this builder samples the
     live stylesheet for every other value it returns and must not start
     restating theme facts from memory (R3, and the wrong ink in #644). The
     25–75 band stays at 38% in dark so 26/38 keeps a clear step (1.59:1 vs
     2.09:1); light can open the same visual step further. */
  const dark = getComputedStyle(root).colorScheme === 'dark';
  const bandOuterMix = dark ? '26%' : '18%';
  const bandInnerMix = dark ? '38%' : '46%';
  const bandEdgeMix = dark ? '55%' : '68%';
  return {
    ...c,
    surface2: c['surface-2'],
    rail: css('--ck-rail'),      // the panel ground under the plot

    grid: `color-mix(in srgb, ${c.line} 80%, transparent)`,
    gridStrong: c.line,
    bandOuter: `color-mix(in srgb, ${c.primary} ${bandOuterMix}, transparent)`,
    bandInner: `color-mix(in srgb, ${c.primary} ${bandInnerMix}, transparent)`,
    bandEdge: `color-mix(in srgb, ${c.primary} ${bandEdgeMix}, transparent)`,
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
    function of it. Its fixed choices reconcile from the standing frame's own
    align state, the same way `pressPreset` patches WINDOW from `winKey`. */
function renderAlign(alignKey, onAlign) {
  const seg = el('seg-align');
  const choices = [['clock', 'By clock'], ['event', 'By event']];
  if (!seg.querySelector('button')) {
    for (const [, label] of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      seg.append(b);
    }
  }
  seg.querySelectorAll('button').forEach((b, index) => {
    const [key] = choices[index];
    b.setAttribute('aria-pressed', String(key === alignKey));
    b.onclick = () => onAlign(key);
  });
}

const CHIP_LABELS = [['highs', 'Highs'], ['lows', 'Lows'], ['meals', 'Meals'], ['corrections', 'Corrections']];

/**
 * The follow chip: ONE slot in the control row that reports whatever non-preset
 * window is in force — "Window 02:15–04:45", a slot, or a block. It is
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

/** ADR 79's exact server-owned 12-bucket clock tree. */
function renderCaseClock(host, clock) {
  if (!clock) return;
  const peak = clock.buckets[clock.peak_bucket_index];
  const max = Math.max(...clock.buckets.map((bucket) => bucket.n), 1);
  const box = document.createElement('div');
  box.className = 'clock';
  box.innerHTML = `
    <div class="cap">When it lands
      <em>peak ${hhmm(peak.start_min)}–${hhmm(peak.end_min)} · ${peak.n} of ${clock.total}</em></div>
    <div class="bars">${clock.buckets.map((bucket, index) => `
      <div data-n="${bucket.n}" data-peak="${index === clock.peak_bucket_index && bucket.n > 0}"
           title="${hhmm(bucket.start_min)}–${hhmm(bucket.end_min)} — ${bucket.n} of ${clock.total}">
        ${bucket.n ? `<span class="n">${bucket.n}</span>` : ''}
        <i style="height:${bucket.n ? Math.max(8, (bucket.n / max) * 100) : 2}%"></i>
      </div>`).join('')}</div>
    <div class="axis">${clock.buckets.map((bucket) =>
      `<span>${hhmm(bucket.start_min).slice(0, 2)}</span>`).join('')}</div>`;
  host.append(box);
}

function renderCaseHead(host, caseFile, lane, onViewSlot, icBlocks, onViewSegment) {
  const { finding, family, summary, projection } = caseFile;
  const box = document.createElement('div');
  box.className = 'inner';
  box.innerHTML = `
    <div class="who">${finding.title} <span class="qual">· ${FAMILY_SHORT[family]}</span></div>
    <div class="statline"><b>${summary.claimed}</b> of <b>${summary.denominator}</b>
      ${FAMILY_LABEL[family]} in ${caseFile.window.label || '24 h'}
      · <b>${summary.denominator - summary.claimed}</b> not attributed</div>`;
  const clock = projection.alignment === 'clock' ? projection.clock : null;
  renderCaseClock(box, clock);
  if (clock) {
    const peak = clock.buckets[clock.peak_bucket_index];
    const cell = cellAtMinute(lane, peak.start_min);
    const block = icBlockAtMinute(icBlocks, peak.start_min);
    const link = document.createElement('div');
    link.className = 'slotlink';
    link.innerHTML = `<span>Peak hour falls in the ${cell.label} basal slot
      (${VERDICT_KEY[cell.verdict]})</span>`;
    const slot = document.createElement('button');
    slot.type = 'button'; slot.className = 'linkbtn'; slot.textContent = 'View slot';
    slot.addEventListener('click', () => onViewSlot(cell)); link.append(slot);
    link.insertAdjacentHTML('beforeend', `<span>and in the ${block.label} I:C block,
      ${block.span} (${VERDICT_KEY[block.verdict]})</span>`);
    const segment = document.createElement('button');
    segment.type = 'button'; segment.className = 'linkbtn'; segment.textContent = 'View segment';
    segment.addEventListener('click', () => onViewSegment(block)); link.append(segment);
    box.append(link);
  }
  host.append(box);
}

function renderCaseRoster(host, caseFile, verdict, selectedId, onSelect, onMore, shownCount) {
  const rows = caseFile.occurrences.filter((row) => row.verdict === verdict);
  const publishedCount = caseFile.verdict_counts[verdict];
  const label = VERDICT_BAND_KEY[verdict] || VERDICT_RESIDUE_KEY[verdict] || verdict;
  host.insertAdjacentHTML('beforeend',
    `<div class="lvl-cap">Occurrences<span class="meta">${publishedCount} of ${caseFile.summary.denominator}</span></div>`);
  if (publishedCount === 0) {
    host.insertAdjacentHTML('beforeend', '<div class="empty">No occurrences in this verdict.</div>');
    return;
  }
  host.insertAdjacentHTML('beforeend', `<div class="ev-group"><b>${caseFile.finding.title}</b> — ${label}
    <span class="n">· ${publishedCount} episode${publishedCount === 1 ? '' : 's'}</span></div>`);
  for (const row of rows.slice(0, shownCount)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'ev-row case-occurrence';
    button.dataset.occurrenceId = row.id;
    button.setAttribute('aria-pressed', String(row.id === selectedId));
    button.innerHTML = `<span class="when">${fmtDate(row.date)} · ${row.anchor.t.slice(11, 16)}</span>
      <span class="only">${row.anchor.bg == null ? '—' : Math.round(row.anchor.bg)}
        <span>· ${row.anchor.label}</span></span><span class="tier">${label}</span>`;
    button.addEventListener('click', () => onSelect(row.id));
    host.append(button);
  }
  if (publishedCount > EVIDENCE_CAP) {
    const more = document.createElement('button'); more.type = 'button'; more.className = 'more';
    more.textContent = shownCount > EVIDENCE_CAP ? `Show first ${EVIDENCE_CAP}`
      : `${publishedCount - EVIDENCE_CAP} more`;
    more.addEventListener('click', onMore); host.append(more);
  }
}

/* The missed-meal comparison is two server-published cohorts, not a High
   verdict roster. Announced members remain opaque until selection requests
   their server-owned detail and trace. */
function renderMissedMealComparisonRoster(host, caseFile, selectedId, onSelect, onMore, shownCount) {
  const { cohorts = [], counts = {} } = caseFile.projection;
  const missedRows = new Map(caseFile.occurrences.map((row) => [row.id, {
    ...row, anchor: row.comparison_anchor,
  }]));
  host.insertAdjacentHTML('beforeend', `<div class="lvl-cap">Meal comparison
    <span class="meta">${counts.missed} attributed missed · ${counts.announced} announced
      · ${counts.not_comparable} not comparable</span></div>`);
  for (const cohort of cohorts) {
    const label = cohort.key === 'missed' ? 'Attributed missed meals' : 'Announced meals';
    const rows = cohort.occurrence_ids.map((id, index) => cohort.key === 'missed'
      ? missedRows.get(id) : { id, index });
    host.insertAdjacentHTML('beforeend', `<div class="ev-group"><b>${label}</b>
      <span class="n">· ${cohort.routed_count} meal${cohort.routed_count === 1 ? '' : 's'}</span></div>`);
    if (cohort.routed_count === 0) {
      host.insertAdjacentHTML('beforeend', `<div class="empty">No ${cohort.key === 'missed'
        ? 'attributed missed meals' : 'announced meals'} in this window.</div>`);
      continue;
    }
    for (const row of rows.slice(0, shownCount)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'ev-row case-occurrence';
      button.dataset.occurrenceId = row.id;
      button.dataset.comparisonCohort = cohort.key;
      button.setAttribute('aria-pressed', String(row.id === selectedId));
      const when = row.anchor ? `${fmtDate(row.date)} · ${row.anchor.t.slice(11, 16)}`
        : `Announced meal ${row.index + 1}`;
      const detail = row.anchor
        ? `${row.anchor.bg == null ? '—' : Math.round(row.anchor.bg)} · ${row.anchor.label}`
        : "Select to see this meal's glucose trace";
      button.innerHTML = `<span class="when">${when}</span><span class="only">${detail}</span>
        <span class="tier">${cohort.key === 'missed' ? 'Attributed missed meal' : 'Announced meal'}</span>`;
      button.addEventListener('click', () => onSelect(row.id));
      host.append(button);
    }
    if (cohort.routed_count > EVIDENCE_CAP) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'more';
      more.textContent = shownCount > EVIDENCE_CAP ? `Show first ${EVIDENCE_CAP}`
        : `${cohort.routed_count - EVIDENCE_CAP} more`;
      more.addEventListener('click', onMore); host.append(more);
    }
  }
}

function renderCaseSelection(host, caseFile, onDay) {
  const { selection } = caseFile;
  if (selection.state === 'unavailable') {
    host.insertAdjacentHTML('beforeend',
      '<div class="case-selection-state" role="status">That Occurrence is unavailable in this case file.</div>');
    return;
  }
  if (selection.state !== 'selected') return;
  const detail = selection.detail;
  const comparison = caseFile.finding.lever === 'missed_meal'
    && caseFile.projection.alignment === 'event';
  const rows = comparison
    ? (caseFile.projection.cohorts.find((cohort) => cohort.key === detail.comparison_cohort)
      ?.occurrence_ids.map((id) => ({ id })) || [])
    : caseFile.occurrences.filter((row) => row.verdict === detail.verdict);
  const at = rows.findIndex((row) => row.id === detail.id);
  const verdictLabel = detail.comparison_cohort === 'announced' ? 'Announced meal'
    : detail.comparison_cohort === 'missed' ? 'Attributed missed meal' : VERDICT_BAND_KEY[detail.verdict]
    || VERDICT_RESIDUE_KEY[detail.verdict] || detail.verdict;
  const box = document.createElement('div'); box.className = 'inner occ-detail';
  box.innerHTML = `<div class="occ-head"><span class="when">${fmtDate(detail.date)} · ${detail.anchor.t.slice(11, 16)}</span>
    <span class="tag">${verdictLabel}</span>${at >= 0 && rows.length > 1
      ? `<span class="pos">${at + 1} of ${comparison
        ? caseFile.projection.counts[detail.comparison_cohort] : caseFile.verdict_counts[detail.verdict]}<i class="keyhint">↑ ↓</i></span>` : ''}</div>
    <div class="occ-nums">${detail.anchor.bg == null ? '—' : Math.round(detail.anchor.bg)}
      <span>at ${detail.anchor.label.toLowerCase()}</span></div>
    <div class="statline">The canvas shows the selected glucose trace and evidence markers.</div>`;
  host.append(box);
  const facts = document.createElement('div'); facts.className = 'ev-detail case-facts';
  facts.innerHTML = `<div class="lab">Evidence facts</div>
    <div class="vd"><span class="pip" aria-hidden="true"></span><div>${detail.glucose.length} glucose readings</div></div>
    <div class="vd"><span class="pip" aria-hidden="true"></span><div>${detail.markers.length} event markers</div></div>
    ${detail.source_corrections.map((dose) => `<div class="vd source-correction"><span class="pip" aria-hidden="true"></span>
      <div>${dose.t.slice(11, 16)} · ${dose.insulin} U correction</div></div>`).join('')}`;
  host.append(facts);
  const foot = document.createElement('div'); foot.className = 'inner occ-foot';
  const day = document.createElement('button'); day.type = 'button'; day.className = 'linkbtn';
  day.textContent = `Open ${fmtDate(detail.date)} in Day`; day.addEventListener('click', () => onDay(detail));
  foot.append(day); host.append(foot);
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
    verdict: canStage ? s.safety_status : VERDICT_KEY[cell.verdict],
    unit: 'U/hr',
    current: s.current,
    estimate: e,
    recommended: canStage ? s.recommended : null,
    recommendedQual: canStage
      ? `U/hr${capped ? ', one ≤20% step from current' : ', one conservative step'}`
      : 'no direction asserted, so nothing is recommended',
    currentNoun: 'rate',
    moveWord: /raise/i.test(s.safety_status || '') ? 'raise' : 'move',
    support: `${e.n} night${e.n === 1 ? '' : 's'} of steady data <span>·</span> ${windowDays} d basal run`,
    sentence: canStage
      ? (s.annotation || '').replace(/,?\s*capped to one ≤?20% step from current/i, '')
      : s.annotation,
    canStage,
    isStaged: staged.has(cell.i),
    footNote: thin
      ? `${e.n} night${e.n === 1 ? '' : 's'} of steady data — below the ${MIN_SUPPORTED_NIGHTS}-night `
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
  const roundedNoop = !canStage && direction === 'strengthen'
    && isf.current != null && isf.recommended === isf.current;
  renderParamLevel(host, {
    head: 'ISF',
    verdict: canStage ? 'suggests a change'
      : roundedNoop ? 'conservative step rounds to the current Correction factor'
        : direction === 'weaken' ? 'corrections look stronger than needed'
          : direction === 'strengthen' ? 'corrections look weaker than needed'
        : 'no direction asserted',
    scopeSay: ISF_SCOPE,
    unit: 'mg/dL/U',
    current: isf.current,
    estimate: e,
    recommended: canStage ? isf.recommended : null,
    recommendedQual: canStage
      ? 'mg/dL/U, one conservative step'
      : roundedNoop ? 'the conservative step rounds to the current Correction factor'
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
    footNote: roundedNoop
      ? 'The conservative step rounds to the current Correction factor, so there is no settings change to stage.'
      : direction === 'weaken'
        ? 'Corrections look stronger than needed, but recent lows make a new number unsafe to suggest.'
        : direction === 'strengthen'
          ? 'This result is held, so there is no settings change to stage; the estimate and interval remain visible.'
      : `${e.wide ? 'The interval is wide and no' : 'No'} direction is asserted here, so `
        + 'there is nothing to stage; the number and its interval are shown as measured.',
    onStage,
  });
}

const HISTORY_CONCLUSION = 'Past setting. No change suggested.';

/** ADR 22: a retired I:C measurement is an evidence read, never a change panel. */
function renderHistoryLevel(host, frame, onSelectRun, onRetry) {
  const row = frame.row;
  const estimate = row.estimate;
  host.dataset.historyId = frame.id;
  host.dataset.analysisGeneration = frame.generation;
  host.dataset.selectedRunId = frame.selectedRunId || '';
  const box = document.createElement('div');
  box.className = 'inner history-case';
  box.innerHTML = `
    <p class="history-conclusion">${HISTORY_CONCLUSION}</p>
    <div class="slot-head">
      <span class="time">${row.title}</span>
      <span class="verdict">${row.span.label}</span>
    </div>
    <div class="history-evidence" aria-label="Past-setting evidence">
      <div class="numrow"><span class="k">Past setting</span><b>${u(row.past_setting)}</b>
        <span class="qual">g/U</span></div>
      <div class="numrow"><span class="k">Measured</span><b>${u(estimate.value)}</b>
        <span class="qual">g/U</span></div>
      <div class="slot-stats">CI ${u(estimate.lo)}–${u(estimate.hi)} g/U${estimate.wide ? ' <span>(wide)</span>' : ''}</div>
      <div class="slot-stats">${row.support} meal run${row.support === 1 ? '' : 's'}</div>
    </div>
    <div class="history-current">Current program · <b>${u(row.programmed_now)} g/U</b></div>`;
  if (frame.notice) {
    const notice = document.createElement('p');
    notice.className = 'history-notice';
    notice.textContent = frame.notice;
    box.append(notice);
  }
  if (frame.pending) {
    const pending = document.createElement('p');
    pending.className = 'history-pending';
    pending.textContent = 'Checking for coherent evidence…';
    box.append(pending);
  }
  if (frame.stale) {
    const stale = document.createElement('div');
    stale.className = 'history-stale';
    stale.setAttribute('role', 'status');
    stale.innerHTML = '<span>Evidence may be stale. The last coherent view is still shown.</span>';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'linkbtn history-retry';
    retry.textContent = 'Retry';
    retry.addEventListener('click', onRetry);
    stale.append(retry);
    box.append(stale);
  }
  if (frame.align === 'event' && frame.events) {
    const cap = document.createElement('div');
    cap.className = 'lvl-cap history-runs-cap';
    cap.textContent = `${frame.events.run_ids.length} meal runs`;
    box.append(cap);
    const roster = document.createElement('div');
    roster.className = 'history-runs';
    roster.setAttribute('role', 'group');
    roster.setAttribute('aria-label', 'Meal runs');
    for (const run of frame.events.series) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'history-run';
      button.dataset.runId = run.run_id;
      button.setAttribute('aria-pressed', String(frame.events.selected_run_id === run.run_id));
      const day = new Date(run.first_member_at).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
      });
      const offsets = run.member_offsets_min.map((minute) => `${minute >= 0 ? '+' : ''}${Math.round(minute)}`);
      button.innerHTML = `<span>${day}</span><small>${offsets.length} meal${offsets.length === 1 ? '' : 's'} · ${offsets.join(', ')} min</small>`;
      button.addEventListener('click', () => onSelectRun(run.run_id));
      roster.append(button);
    }
    box.append(roster);
  }
  host.append(box);
}

/* Level 1 is the findings queue (terms 34–45), rendered by
   `diagnose-findings-queue.js` straight off the server's projection. The factor
   grid, the settings/patterns tiers and the three per-parameter staging entry rows
   that used to live here are RETIRED by the #662 re-settle: one ranked list in which
   settings and habits interleave by the backend's own priority, no headings, no
   bars, no score numerals. Staging stays where term 13 puts it — at each item's own
   detail level, which every queue row drills into. */

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
 * whole per-family breakdown is absent (an older payload shape) — NOT when it
 * is present and simply carries no entry for this family, which is a lever that
 * claimed no hit here. Then there is no published split for the frame's family
 * and the band draws nothing, exactly as it does with no row at all.
 */
function renderVerdictBand(host, row, family, activeVerdict, onPick = null) {
  if (!row || !row.verdict_counts) return;
  const vc = row.verdict_counts_by_family
    ? row.verdict_counts_by_family[family] : row.verdict_counts;
  if (!vc) return;
  const groups = Object.entries(VERDICT_BAND_KEY).map(([key, lead]) => ({ key, lead, count: vc[key] || 0 }));
  const interactive = typeof onPick === 'function';
  const part = (className, group, content) => interactive
    ? `<button type="button" class="${className}" data-verdict="${group.key}"
        aria-pressed="${group.key === activeVerdict}" aria-label="${group.lead} · ${group.count}">${content}</button>`
    : `<span class="${className}" data-verdict="${group.key}"
        aria-label="${group.lead} · ${group.count}">${content}</span>`;
  const band = document.createElement('div');
  band.className = 'vband';
  band.innerHTML = `
    <div class="bar" role="group" aria-label="Verdict split"
         style="grid-template-columns:${groups.map((g) => Math.max(g.count, 0.001)).join('fr ')}fr">
      ${groups.map((g) => part('seg', g, '')).join('')}
    </div>
    <div class="keys">
      ${groups.map((g) => part('key', g,
        `<span class="lead">${g.lead}</span><span class="n">${g.count}</span>`)).join('')}
    </div>`;
  for (const button of band.querySelectorAll('button[data-verdict]')) {
    button.addEventListener('click', () => onPick(button.dataset.verdict));
  }
  host.append(band);
  const residue = Object.entries(VERDICT_RESIDUE_KEY)
    .map(([key, noun]) => [vc[key] || 0, noun])
    .filter(([n]) => n > 0)
    .map(([n, noun]) => `${n} ${noun}`)
    .join(' · ');
  if (residue) host.insertAdjacentHTML('beforeend', `<div class="vband-foot">${residue}</div>`);
}

/* -------------------------------- mount -------------------------------- */

/* The mock's `main()` — same body, minus its four `loadCapture()` awaits. It
   receives the already-adapted captures instead, and returns a teardown so the
   surface can be re-mounted (the mock never re-mounts; it reloads the page).
   `signal` aborts the document/window listeners the ported code registers. */
function boot(root, data, callbacks, signal) {
  const { day, exposureCapture, audit, params, icMissing } = data;
  const { envelope: envelopeIn, markers: markersIn } = data;
  /* #735 / ADR 79 — the queue's rows and the dock's object are server-owned.
     `findings` opens on the preparation's GLOBAL projection; a pressed preset
     or drawn brace requests a replacement preparation. Nothing about membership,
     order or a denominator is worked out here. */
  let findings = data.findings;
  let preparation = data.casePreparation;
  let retirementNotice = null;
  let historyRequestGeneration = 0;
  // Null is the all-active resting state; a Set exists only while a chip is off.
  let selectedChips = null;
  let eventChartsOnly = false;
  let filterOpen = false;
  let filterFocus = 0;
  let queueScrollTop = 0;
  let collapsedFindingsExpanded = false;
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
    presetKey = key; drawn = null; explicitPreset = true; failedKey = null; paint();
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

  const findingsFromPreparation = (next) => ({
    ...next.findings,
    rows: next.rendered_rows,
  });

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
  /* ALIGN's mounted event-comparison canvas (ADR 31 part 3). */
  let alignMount = null;
  let presetKey = CFG.win;                          // what Esc restores
  let shownRange = null;                            // the window the canvas resolved to
  let braceGripTop = 48;                            // y of the grip band, set by paintBrace
  let dragDisplayWindow = null;                     // monotonic minutes while a drag is live
  let clockPanOffset = 0;                           // left edge of the unrolled clock display
  /* An EXPLICIT window choice — a preset press or a drag — outranks the window
     a frame would derive. An explicit preset or drawn window survives factor and
     occurrence drilling; only the lane scope choice releases it. Presets and
     drawn windows are the same kind of act, so they clear together and reassert
     together. */
  let explicitPreset = false;
  let drawn = CFG.drawn ? CFG.drawn.slice() : null; // the custom window, or none
  /* ONE scope, for the canvas and the inspector alike: whatever window is in
     force — a drawn one, else the pressed preset. A preset and a drawn window
     are the same kind of act, so they re-scope the same things; 24 h is the
     full-range case, reachable from the control row. Null only when the capture
     cannot supply an in-window denominator, and then nothing re-scopes at all —
     never half-scope. */
  const scopeWindow = () => drawn || WINDOWS[presetKey].range;
  const scopeLabel = () => {
    const w = scopeWindow();
    return w ? windowSpanText(w) : 'full range';
  };
  /* The opening depth of a mock state, as FRAMES. A factor frame is (factor,
     rowId) together — the row is where its population comes from — so the boot
     presets open on a published finding exactly as a queue drill does, rather
     than on a factor the browser assembled for itself. The cap is the state
     table's own. */
  const bootFrames = (findings?.rows || [])
    .filter((row) => row.register === 'finding' && row.case_header?.inspectability === 'ready')
    .map((row) => ({ k: 'factor', rowId: row.id, title: row.title,
      caseFile: null, requestedAlignment: 'clock', selectedId: null,
      bandVerdict: null, loading: false }))
    .slice(0, CFG.factorCap);

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
  /* IS THE WINDOW'S PUBLISHED POPULATION IN HAND? A window change ASKS the
     server for its rows, so between the press and the response every count on
     screen is the PREVIOUS window's while the instruments already print the new
     one. That pairing is a caption asserting a population nothing drew, so the
     counts are withheld until the answer lands rather than shown stale. */
  let loadedKey = windowKey(preparation?.coordinates?.window?.scoped
    ? [preparation.coordinates.window.start_min, preparation.coordinates.window.end_min] : null);
  let pendingKey = null;
  let failedKey = null;
  const currentFindingsKey = () => windowKey(findingsWindow());
  const currentPreparationKey = () => windowKey(findingsWindow());
  let preparationGeneration = 0;
  const settled = () => loadedKey === currentFindingsKey()
    && pendingKey === null && failedKey === null;
  const historyFrame = () => top()?.k === 'history' ? top() : null;
  const requestWindow = () => {
    const w = findingsWindow();
    return w ? { start_min: w[0], end_min: w[1] } : null;
  };
  const historyCanvasScope = () => ({
    presetKey,
    drawn: drawn ? drawn.slice() : null,
  });

  function historyRetired(frame, message, nextFindings = null) {
    ++historyRequestGeneration;
    if (nextFindings) findings = nextFindings;
    pendingKey = null;
    failedKey = null;
    loadedKey = currentFindingsKey();
    retirementNotice = message;
    stack.length = 1;
    dir = 'pop';
    paint();
  }

  const typedRetirement = (error) => error?.status === 410
    && (error.code === 'history_aged_out' || error.code === 'history_unavailable');

  function validateHistorySelection(next, frame) {
    if (next?.schema !== 'diagnose-findings-v2'
      || typeof next.analysis_generation !== 'string' || next.analysis_generation.length === 0
      || !Array.isArray(next.rows)
      || next.selection?.id !== frame.id) {
      throw new Error('Server did not return one coherent history selection.');
    }
    const selection = next.selection;
    const dispositions = ['present', 'out_of_scope', 'aged_out', 'unavailable'];
    const messageInvalid = selection.disposition === 'present'
      ? selection.message !== null
      : typeof selection.message !== 'string' || selection.message.length === 0;
    const rowContradictsDisposition = selection.disposition !== 'present'
      && next.rows.some((row) => row.id === frame.id);
    if (!dispositions.includes(selection.disposition) || messageInvalid || rowContradictsDisposition) {
      throw new Error('Server returned a contradictory history selection.');
    }
    return selection;
  }

  async function refreshHistoryRetirement(frame, request) {
    try {
      const next = await callbacks.loadFindings?.(requestWindow(), frame.id);
      if (request !== historyRequestGeneration || top() !== frame) return;
      const selection = validateHistorySelection(next, frame);
      if (!['aged_out', 'unavailable'].includes(selection.disposition)) {
        throw new Error('Retired history did not have a matching findings disposition.');
      }
      historyRetired(frame, selection.message, next);
    } catch {
      if (request !== historyRequestGeneration || top() !== frame) return;
      pendingKey = null;
      frame.pending = false;
      frame.stale = true;
      paint();
    }
  }

  async function refreshHistoryPair(frame, {
    wantEvent = frame.align === 'event', selectedRunId = frame.selectedRunId,
    attempt = 0, request = ++historyRequestGeneration,
  } = {}) {
    if (top() !== frame) return;
    const key = currentFindingsKey();
    pendingKey = key;
    frame.pending = true;
    frame.stale = false;
    paint();
    try {
      const next = await callbacks.loadFindings?.(requestWindow(), frame.id);
      if (request !== historyRequestGeneration || top() !== frame) return;
      const selection = validateHistorySelection(next, frame);
      if (['aged_out', 'unavailable'].includes(selection.disposition)) {
        historyRetired(frame, selection.message, next);
        return;
      }
      if (selection.disposition === 'out_of_scope') {
        findings = next;
        loadedKey = key;
        pendingKey = null;
        failedKey = null;
        Object.assign(frame, { pending: false, stale: false, notice: selection.message });
        paint();
        return;
      }
      if (selection.disposition !== 'present') {
        throw new Error('Server returned an unknown history selection disposition.');
      }
      const row = next.rows.find((candidate) => candidate.id === frame.id);
      if (!row || row.register !== 'history') {
        throw new Error('Server did not return the selected history row.');
      }
      let events = null;
      if (wantEvent) {
        events = await callbacks.loadHistoryEvents?.({
          historyId: frame.id,
          analysisGeneration: next.analysis_generation,
          selectedRunId,
        });
        if (request !== historyRequestGeneration || top() !== frame) return;
        validateHistoryEvents(events, {
          historyId: frame.id,
          analysisGeneration: next.analysis_generation,
          selectedRunId,
        });
      }
      if (request !== historyRequestGeneration || top() !== frame) return;
      findings = next;
      loadedKey = key;
      pendingKey = null;
      failedKey = null;
      Object.assign(frame, {
        row, generation: next.analysis_generation, events,
        selectedRunId: selectedRunId || null,
        align: wantEvent ? 'event' : 'clock',
        canvasScope: historyCanvasScope(), pending: false, stale: false, notice: null,
      });
      retirementNotice = null;
      paint();
    } catch (error) {
      if (request !== historyRequestGeneration || top() !== frame) return;
      if (typedRetirement(error)) {
        refreshHistoryRetirement(frame, request);
        return;
      }
      if (attempt === 0) {
        refreshHistoryPair(frame, { wantEvent, selectedRunId, attempt: 1, request });
        return;
      }
      pendingKey = null;
      frame.pending = false;
      frame.stale = true;
      paint();
    }
  }

  async function requestHistoryEvents(frame, selectedRunId = null) {
    const request = ++historyRequestGeneration;
    pendingKey = currentFindingsKey();
    frame.pending = true;
    frame.stale = false;
    paint();
    try {
      const events = await callbacks.loadHistoryEvents?.({
        historyId: frame.id,
        analysisGeneration: frame.generation,
        selectedRunId,
      });
      if (request !== historyRequestGeneration || top() !== frame) return;
      validateHistoryEvents(events, {
        historyId: frame.id,
        analysisGeneration: frame.generation,
        selectedRunId,
      });
      pendingKey = null;
      Object.assign(frame, {
        events, selectedRunId, align: 'event', pending: false, notice: null,
      });
      paint();
    } catch (error) {
      if (request !== historyRequestGeneration || top() !== frame) return;
      if (typedRetirement(error)) {
        refreshHistoryRetirement(frame, request);
        return;
      }
      refreshHistoryPair(frame, { wantEvent: true, selectedRunId, attempt: 1, request });
    }
  }

  let caseGeneration = 0;
  let activeCaseError = null;
  const caseErrorFrom = (error) => error?.detail && typeof error.detail === 'object'
    ? error.detail : { code: 'request_failed',
      message: error?.message || 'The Finding case file is unavailable.' };
  const appendCaseError = (host) => {
    if (!activeCaseError) return;
    const alert = document.createElement('div'); alert.className = 'case-file-error';
    alert.setAttribute('role', 'alert'); alert.dataset.code = activeCaseError.code;
    alert.textContent = activeCaseError.message; host.append(alert);
  };
  const isCurrentCaseRequest = (generation, frame) => generation === caseGeneration
    && top() === frame;
  const caseCoordinates = (source, frame, alignment, occ = null) => ({
    projection_id: source.projection_id,
    finding_id: frame.rowId,
    alignment,
    ...(occ ? { occ } : {}),
  });
  const matchingPreparation = assertMatchingFindingCasePreparation;
  const eventChartIn = (source, frame) => eventChartCoordinate(
    source?.rendered_rows?.find((row) => row.id === frame.rowId),
  );
  const caseAlignmentIn = (source, frame) => {
    const row = source?.rendered_rows?.find((row) => row.id === frame.rowId);
    return eventChartCoordinate(row);
  };
  const availableAlignment = (source, frame, requested) =>
    requested === 'event'
      && (frame.eventDiscovery ? eventChartIn(source, frame) : caseAlignmentIn(source, frame))
      ? 'event' : 'clock';
  const matchingCase = (caseFile, source, frame, alignment, occ) => {
    const selection = caseFile?.selection;
    const selectionMatches = occ
      ? ['selected', 'unavailable'].includes(selection?.state)
        && selection?.requested_id === occ
        && (selection.state !== 'selected' || selection.detail?.id === occ)
      : selection?.state === 'none' && selection?.requested_id === null;
    const sourceWindow = source?.coordinates?.window;
    const requestedWindow = sourceWindow?.scoped
      ? { start_min: sourceWindow.start_min, end_min: sourceWindow.end_min } : null;
    if (caseFile?.schema === 'diagnose-finding-case-file-v1' && validFindingCaseFile(caseFile)
      && caseFile?.projection_id === source.projection_id
      && caseFile?.finding?.id === frame.rowId
      && sameFindingCaseWindow(caseFile?.window, requestedWindow)
      && caseFile?.projection?.alignment === alignment
      && selectionMatches) return caseFile;
    inconsistentFindingProjection(
      'The Finding case file did not match the requested coordinates.',
    );
  };

  function recoverCase(frame, alignment, occ, generation) {
    const w = findingsWindow();
    const requested = w ? { start_min: w[0], end_min: w[1] } : null;
    Promise.resolve(callbacks.loadPreparation?.(requested))
      .then((response) => {
        if (!isCurrentCaseRequest(generation, frame)) return null;
        const shadowPreparation = matchingPreparation(response, requested);
        const shadowAlignment = availableAlignment(
          shadowPreparation, frame, alignment,
        );
        return Promise.resolve(callbacks.loadCase?.(
          caseCoordinates(shadowPreparation, frame, shadowAlignment, occ),
        )).then((shadowCase) => ({ shadowPreparation,
          shadowCase: matchingCase(
            shadowCase, shadowPreparation, frame, shadowAlignment, occ,
          ) }));
      })
      .then((shadow) => {
        if (!shadow || !isCurrentCaseRequest(generation, frame)) return;
        preparation = shadow.shadowPreparation;
        findings = findingsFromPreparation(preparation);
        loadedKey = windowKey(findingsWindow());
        pendingKey = null;
        frame.caseFile = shadow.shadowCase;
        frame.requestedAlignment = shadow.shadowCase.projection.alignment;
        frame.selectedId = shadow.shadowCase.selection.state === 'selected'
          ? shadow.shadowCase.selection.requested_id : null;
        frame.loading = false;
        activeCaseError = null;
        paint();
      })
      .catch((error) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        frame.loading = false;
        pendingKey = null;
        activeCaseError = caseErrorFrom(error);
        paint();
      });
  }

  function refreshQueueAfterUnavailable(frame, generation, originalError) {
    const w = findingsWindow();
    const requested = w ? { start_min: w[0], end_min: w[1] } : null;
    Promise.resolve(callbacks.loadPreparation?.(requested))
      .then((response) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        const next = matchingPreparation(response, requested);
        preparation = next;
        findings = findingsFromPreparation(next);
        loadedKey = windowKey(findingsWindow());
        frame.loading = false;
        activeCaseError = caseErrorFrom(originalError);
        paint();
      })
      .catch((error) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        frame.loading = false;
        activeCaseError = caseErrorFrom(error);
        paint();
      });
  }

  function requestCase(frame, alignment, occ = null, source = preparation) {
    if (pendingKey !== null) {
      frame.pendingCaseRequest = { alignment, occ };
      pendingKey = null;
      failedKey = null;
      ++caseGeneration;
      paint();
      return;
    }
    const generation = ++caseGeneration;
    frame.loading = true;
    activeCaseError = null;
    paint();
    Promise.resolve(callbacks.loadCase?.(caseCoordinates(source, frame, alignment, occ)))
      .then((response) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        const next = matchingCase(response, source, frame, alignment, occ);
        frame.loading = false;
        frame.caseFile = next;
        frame.requestedAlignment = next.projection.alignment;
        frame.selectedId = next.selection.state === 'selected' ? next.selection.requested_id : null;
        activeCaseError = null;
        paint();
      })
      .catch((error) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        if (error?.status === 409 && error?.detail?.code === 'stale_projection') {
          recoverCase(frame, alignment, occ, generation);
          return;
        }
        if (error?.status === 404 && error?.detail?.code === 'finding_unavailable') {
          refreshQueueAfterUnavailable(frame, generation, error);
          return;
        }
        frame.loading = false;
        activeCaseError = caseErrorFrom(error);
        paint();
      });
  }

  function ensurePreparation() {
    const key = currentPreparationKey();
    const history = historyFrame();
    if (history) {
      if (history.pending || history.stale || key === loadedKey) return;
      refreshHistoryPair(history);
      return;
    }
    if (failedKey !== null && failedKey !== key) failedKey = null;
    if (key === loadedKey) {
      pendingKey = null;
      failedKey = null;
      return;
    }
    if (key === pendingKey || key === failedKey) return;
    pendingKey = key;
    activeCaseError = null;
    const w = findingsWindow();
    const requested = w ? { start_min: w[0], end_min: w[1] } : null;
    ++caseGeneration;
    const generation = ++preparationGeneration;
    const frame = top().k === 'factor' ? top() : null;
    if (frame) frame.loading = true;
    Promise.resolve(callbacks.loadPreparation?.(requested))
      .then((response) => {
        if (generation !== preparationGeneration || currentPreparationKey() !== key) return null;
        const next = matchingPreparation(response, requested);
        if (!frame) {
          preparation = next;
          findings = findingsFromPreparation(next);
          pendingKey = null;
          loadedKey = key;
          failedKey = null;
          paint();
          return null;
        }
        const desired = frame.pendingCaseRequest;
        const alignment = availableAlignment(
          next, frame, desired?.alignment || frame.requestedAlignment || 'clock',
        );
        return Promise.resolve(callbacks.loadCase?.(caseCoordinates(
          next, frame, alignment,
          desired ? desired.occ : frame.selectedId,
        ))).then((shadowCase) => {
          const occ = desired ? desired.occ : frame.selectedId;
          return { next, shadowCase: matchingCase(shadowCase, next, frame, alignment, occ) };
        });
      })
      .then((shadow) => {
        if (!shadow || generation !== preparationGeneration
          || currentPreparationKey() !== key || top() !== frame) return;
        preparation = shadow.next;
        findings = findingsFromPreparation(shadow.next);
        frame.caseFile = shadow.shadowCase;
        frame.pendingCaseRequest = null;
        frame.loading = false;
        frame.selectedId = shadow.shadowCase.selection.state === 'selected'
          ? shadow.shadowCase.selection.requested_id : null;
        pendingKey = null;
        loadedKey = key;
        failedKey = null;
        activeCaseError = null;
        paint();
      })
      .catch((error) => {
        if (generation !== preparationGeneration || currentPreparationKey() !== key) return;
        pendingKey = null;
        failedKey = key;
        if (frame) frame.loading = false;
        if (frame) frame.pendingCaseRequest = null;
        activeCaseError = caseErrorFrom(error);
        paint();
      });
  }

  /** A queue row's drill target — keyed on the projection's own row id, never
      guessed from a title. A row whose parameter this payload cannot show keeps its
      chevron and simply does not move (the app always carries all three). */
  function drillFinding(row) {
    if (row.register === 'history') {
      retirementNotice = null;
      push({
        k: 'history', id: row.id, row, generation: findings.analysis_generation,
        align: 'clock', events: null, selectedRunId: null,
        canvasScope: historyCanvasScope(),
        pending: false, stale: false, notice: null,
      });
      return;
    }
    if (row.register === 'finding') {
      const entryAlignment = eventChartsOnly && eventChartCoordinate(row) ? 'event' : 'clock';
      const frame = { k: 'factor', rowId: row.id, title: row.title,
        caseFile: null, requestedAlignment: entryAlignment, selectedId: null,
        bandVerdict: null, loading: false,
        eventDiscovery: entryAlignment === 'event' };
      push(frame);
      requestCase(frame, entryAlignment);
      return;
    }
    if (row.parameter === 'isf') { push({ k: 'isf', rowId: row.id }); return; }
    if (row.parameter === 'carb_ratio') {
      const cell = icBlocks.find((c) => `ic:${c.id}` === row.id);
      if (cell) pickBlock(cell, row.id);
      return;
    }
    if (row.parameter === 'basal_rate') {
      const cell = lane.cells.find((c) => c.startMin === row.span?.start_min);
      if (cell) pickCell(cell, row.id);
    }
  }

  /* THE STACK. One frame per level; only `top()` ever renders. Frames:
     {k:'factors'} · {k:'factor', factor} · {k:'occ', occ} · {k:'slot', cell}. */
  const stack = [{ k: 'factors' }];
  let pendingFocus = null;
  let occurrenceFocusId = null;
  const top = () => stack[stack.length - 1];
  const push = (frame) => {
    if (top().k === 'factors') queueScrollTop = el('level').scrollTop;
    filterOpen = false;
    pendingFocus = 'level';
    dir = 'push'; stack.push(frame); shownRows = EVIDENCE_CAP; paint();
  };
  const popTo = (i) => {
    ++caseGeneration;
    ++historyRequestGeneration;
    pendingKey = null;
    filterOpen = false;
    pendingFocus = pendingRowFocus(stack[1]);
    dir = 'pop'; stack.length = i + 1; paint();
  };

  function findingRowFor(frame) {
    if (frame.k !== 'factor') return null;
    return (findings?.rows || []).find((row) => row.id === frame.rowId) || null;
  }

  function parameterRowFor(frame) {
    if (!frame.rowId) return true;
    return (findings?.rows || []).find((row) => row.id === frame.rowId) || null;
  }
  /* The lane is a shortcut INTO the slot branch: from level 1 it pushes, from a
     slot frame it swaps in place, so clicking cells never deepens the stack. */
  function pickCell(cell, rowId = null) {
    /* Selecting a slot is a NAVIGATION that carries its own window, so it
       releases whatever explicit choice was standing and lets the slot frame
       supply the window. Minting a `drawn` window here was wrong twice over: it
       ran the slot's real 30-min bounds through the drawn-window path (which
       re-scoped the whole inspector to 30 minutes and labelled the chip
       "Window 07:00–07:30" instead of "Slot 07:00"), and a 30-min span is under
       the 90-min floor a DRAWN window must respect — a slot boundary is data,
       not a drawn sample, and only the frame path renders it unsnapped. */
    releaseWindow();
    if (top().k === 'slot') { Object.assign(top(), { cell, rowId }); paint(); return; }
    push({ k: 'slot', cell, rowId });
  }

  /** The I:C findings-queue route: push from level 1, swap in place. */
  function pickBlock(cell, rowId = null) {
    releaseWindow();
    if (top().k === 'block') { Object.assign(top(), { cell, rowId }); paint(); return; }
    push({ k: 'block', cell, rowId });
  }

  /* SELECT-IN-PLACE (P35 retired, ADR 31 part 5). An evidence-row click used to
     push a third level, the occurrence's own crumb leaf. It now emphasises the
     row in place, on the factor frame that is already standing: no push, no
     crumb change, and — per P21's retirement — no window move either. The
     canvas overlay (day trace + mark) and the arrow-stepping/`n of N` pair
     (P24/P25, kept and re-homed) all read the standing frame's retained case
     selection instead of a frame of their own. */
  function selectOcc(occ) {
    const f = top();
    if (f.k !== 'factor') return;
    occurrenceFocusId = occ.id || occ;
    requestCase(f, f.requestedAlignment || 'clock', occurrenceFocusId);
  }

  // opening depth per mock state — a payload publishing no re-projectable
  // finding simply opens at the queue rather than on an empty case file
  if ((CFG.level === 2 || CFG.level === 3) && bootFrames[0]) stack.push({ ...bootFrames[0] });
  if (CFG.level === 3) {
    // The retained case response supplies the selection after the opening request.
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
    const retainedHistoryScope = f.k === 'history' && f.canvasScope
      && (f.pending || f.stale || f.notice);
    const canvasPresetKey = retainedHistoryScope ? f.canvasScope.presetKey : presetKey;
    const canvasDrawn = retainedHistoryScope ? f.canvasScope.drawn : drawn;
    const preset = WINDOWS[canvasPresetKey];
    let win = preset;
    let label = `${preset.label.toUpperCase()} ${winText(preset)}`;
    braceless = false;
    if (dragDisplayWindow) {
      const committed = commitWindow(dragDisplayWindow);
      win = { label: committed ? 'Window' : 'Whole day', range: committed || [0, 1440] };
      label = committed ? `WINDOW ${winText(win)}` : 'WHOLE DAY';
    } else if (canvasDrawn) {
      /* USER SCOPE BEATS DERIVED SCOPE, ALWAYS. A drawn window is a persistent
         workspace: drilling a factor or opening an occurrence scopes WITHIN it
         and never moves the brace. Reported in the control row's follow chip. */
      win = { label: 'Window', range: canvasDrawn };
      label = `WINDOW ${winText(win)}`;
      markWindowSegment(`Window ${windowSpanText(canvasDrawn)}`,
        retainedHistoryScope ? null : clearDrawn);
    } else if (explicitPreset || retainedHistoryScope) {
      /* A pressed preset is a workspace too, and it outranks the frame for the
         same reason — pressing one at any level is a scope CHANGE by the user,
         never a release back to derived scope. */
      pressPreset(canvasPresetKey);
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
      pressPreset(canvasPresetKey);
    } else {
      pressPreset(canvasPresetKey);
    }
    /* Occurrence marks follow the FRAME, whatever set the window — so a factor
       drilled inside an explicit workspace still shows its own dots, on the
       user's window rather than on a peak the canvas no longer jumps to. */
    let occurrences = [];
    if (f.k === 'factor' && f.caseFile) occurrences = f.caseFile.occurrences.map((row) => ({
      id: row.id, t: row.anchor.t, date: row.date, bg: row.anchor.bg,
      worst_bg: row.anchor.bg, verdict: row.verdict,
    }));

    /* Selection puts the case file's exact trace over the pooled envelope.
       This is select-in-place (P35 retired): the selected Occurrence never
       narrows the window (P21 retired) — it only adds the server-owned trace
       and mark on top of whatever window the factor frame resolved above. */
    const detail = f.k === 'factor' && f.caseFile?.selection?.state === 'selected'
      ? f.caseFile.selection.detail : null;
    const selectedOcc = detail ? { id: detail.id, t: detail.anchor.t,
      date: detail.date, bg: detail.anchor.bg, worst_bg: detail.anchor.bg } : null;
    const trace = detail ? envelope.labels.map((label) => {
      const point = detail.glucose.find((row) => row.t.slice(11, 16) === label);
      return point?.bg ?? null;
    }) : null;
    /* Whatever window the canvas landed on — preset, drawn, or frame-derived —
       is the one the brace draws and the one a handle grabs. One grammar. */
    shownRange = win.range.slice();
    // every canvas number is re-derived for the window in view
    const stats = windowStats(envelope, win.range);
    paintReadout(null);          // a redraw ends the old hover
    chart = renderCanvas(el('chart'), window.echarts, {
      envelope, markers, colors, occurrences, stats, window: win.range,
      windowLabel: label, trace, onHover: paintReadout,
      selectedOcc, displayWindow: dragDisplayWindow, displayOffset: clockPanOffset,
    });
    const chartNode = el('chart');
    const priorNotice = chartNode.parentElement.querySelector('.history-canvas-notice');
    priorNotice?.remove();
    if (f.k === 'history') {
      chartNode.dataset.historyId = f.id;
      chartNode.dataset.analysisGeneration = f.generation;
      chartNode.dataset.selectedRunId = f.selectedRunId || '';
      const noticeText = f.stale
        ? 'Evidence may be stale. The last coherent view is still shown.'
        : f.notice || (f.pending ? 'Checking for coherent evidence…' : null);
      if (noticeText) {
        const notice = document.createElement('p');
        notice.className = 'history-canvas-notice';
        notice.textContent = noticeText;
        chartNode.parentElement.append(notice);
      }
    } else {
      delete chartNode.dataset.historyId;
      delete chartNode.dataset.analysisGeneration;
      delete chartNode.dataset.selectedRunId;
    }
    /* The count is the WINDOW's, and the days are the CGM capture's own — not a
       coverage claim for the app. The basal run is a different, longer run and
       names itself separately in the slot panel and the status bar. */
    /* A finding the current window no longer holds has no population to count,
       so the canvas states that rather than printing a reading count under a
       panel that is listing nothing (ADR 62 part 9). */
    el('canvas-scope').textContent =
      f.k === 'factor' && settled() && !f.caseFile
        ? 'No findings in the selected window'
        : `window ${stats.readings.toLocaleString()} of ${envelope.readings.toLocaleString()} readings`;
    el('canvas-pool').textContent =
      `pooled from ${envelope.days} captured CGM days · ±${envelope.pool} min`;
  }

  /** Tear down whatever ALIGN mounted, and restore the clock canvas. */
  function disposeAlign() {
    alignMount?.observer?.disconnect();
    alignMount?.chart?.dispose();
    alignMount?.restoreHeader?.();
    alignMount = null;
    el('align-canvas').innerHTML = '';
    el('align-canvas').hidden = true;
    el('chart').hidden = false;
    el('brace').hidden = braceless || !shownRange;
    el('lane-wrap').hidden = false;
  }

  /** ALIGN owns two explicit projections: behavioral case files and I:C history. */
  function paintAlign() {
    const f = top();
    const isCase = f.k === 'factor';
    const isHistory = f.k === 'history';
    const liveRow = isCase && settled() ? findingRowFor(f) : null;
    const mappedCase = liveRow && (f.eventDiscovery
      ? eventChartCoordinate(liveRow)
      : caseAlignmentIn(preparation, f) ? { caseFile: true } : null);
    el('align-group').hidden = !mappedCase && !isHistory;
    if (!mappedCase && !isHistory) {
      disposeAlign();
      return;
    }
    const alignKey = isHistory
      ? f.align
      : f.caseFile?.projection?.alignment || f.requestedAlignment || 'clock';
    renderAlign(alignKey, (key) => {
      if (alignKey === key || f.loading || (isHistory && f.pending)) return;
      if (isHistory) {
        if (key === 'clock') {
          ++historyRequestGeneration;
          pendingKey = null;
          f.pending = false;
          f.align = 'clock';
          disposeAlign();
          paint();
        } else {
          requestHistoryEvents(f, f.selectedRunId);
        }
        return;
      }
      requestCase(f, key, f.selectedId);
    });
    if (alignKey === 'clock') {
      disposeAlign();
      return;
    }
    if (isHistory) {
      if (!f.events) return;
      const mounted = alignMount?.frame === f
        && alignMount.analysisGeneration === f.generation
        && alignMount.selectedRunId === (f.selectedRunId || null);
      if (mounted) return;
      el('chart').hidden = true;
      el('brace').hidden = true;
      el('lane-wrap').hidden = true;
      const host = el('align-canvas');
      host.hidden = false;
      alignMount?.observer?.disconnect();
      alignMount?.chart?.dispose();
      alignMount?.restoreHeader?.();
      const title = el('canvas-head').querySelector('h2');
      const old = {
        title: title.textContent,
        scope: el('canvas-scope').textContent,
        pool: el('canvas-pool').textContent,
      };
      title.textContent = 'Meal runs after the past setting';
      el('canvas-scope').textContent = `${f.events.run_ids.length} meal runs`;
      el('canvas-pool').textContent = '';
      const historyChart = renderHistoryEvents(host, window.echarts, f.events, colors);
      alignMount = {
        chart: historyChart,
        observer: observeResize(host, () => historyChart),
        restoreHeader: () => {
          title.textContent = old.title;
          el('canvas-scope').textContent = old.scope;
          el('canvas-pool').textContent = old.pool;
        },
        frame: f,
        analysisGeneration: f.generation,
        selectedRunId: f.selectedRunId || null,
      };
      return;
    }
    if (!f.caseFile || f.caseFile.projection.alignment !== 'event') return;
    if (alignMount?.caseFile === f.caseFile) return;
    el('chart').hidden = true;
    el('brace').hidden = true;
    el('lane-wrap').hidden = true;
    const host = el('align-canvas');
    host.hidden = false;
    alignMount?.observer?.disconnect();
    alignMount?.chart?.dispose();
    alignMount?.restoreHeader?.();
    alignMount = {
      ...renderEventSurface(host, f.caseFile, { headerHost: el('canvas-head') }),
      frame: f, caseFile: f.caseFile,
    };
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

  const filterActiveGroups = () => Number(selectedChips !== null) + Number(eventChartsOnly);

  function toggleChip(key) {
    const next = new Set(selectedChips || CHIP_LABELS.map(([name]) => name));
    if (next.has(key)) next.delete(key); else next.add(key);
    selectedChips = next.size === CHIP_LABELS.length ? null : next;
    collapsedFindingsExpanded = false;
  }

  function closeFilter({ restoreFocus = false } = {}) {
    filterOpen = false;
    paintFilter();
    if (restoreFocus) el('filter-trigger')?.focus();
  }

  /** Root-only ARIA menu. Sift and View compose browser-owned selection over
      fields the findings projection already published; neither group requests
      a new population or derives event eligibility. */
  function paintFilter() {
    const wrap = el('filter-wrap');
    const trigger = el('filter-trigger');
    const menu = el('filter-menu');
    const atRoot = top().k === 'factors';
    wrap.hidden = !atRoot;
    if (!atRoot) {
      filterOpen = false;
      menu.hidden = true;
      return;
    }

    const active = filterActiveGroups();
    trigger.textContent = active ? `Filter ${active}` : 'Filter';
    trigger.setAttribute('aria-label', active
      ? `Filter, ${active} active ${active === 1 ? 'group' : 'groups'}`
      : 'Filter, no active groups');
    trigger.setAttribute('aria-expanded', String(filterOpen));
    trigger.onclick = () => {
      filterOpen = !filterOpen;
      filterFocus = 0;
      paintFilter();
      if (filterOpen) requestAnimationFrame(() => menu.querySelector('[tabindex="0"]')?.focus());
    };

    menu.hidden = !filterOpen;
    menu.innerHTML = '';
    const items = [];
    const addGroup = (name, choices) => {
      const label = document.createElement('div');
      label.className = 'filter-group-label';
      label.id = `filter-${name.toLowerCase()}-label`;
      label.setAttribute('role', 'presentation');
      label.textContent = name;
      menu.append(label);
      const group = document.createElement('div');
      group.className = 'filter-group';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', label.id);
      menu.append(group);
      for (const choice of choices) {
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('role', choice.role);
        button.setAttribute('aria-checked', String(choice.checked));
        button.setAttribute('aria-label', choice.count == null
          ? choice.label : `${choice.label} ${choice.count}`);
        const text = document.createElement('span');
        text.textContent = choice.label;
        button.append(text);
        if (choice.count != null) {
          const count = document.createElement('span');
          count.className = 'filter-count';
          count.textContent = ` ${choice.count}`;
          button.append(count);
        }
        button.addEventListener('click', () => {
          choice.activate();
          filterFocus = items.indexOf(button);
          paint();
          requestAnimationFrame(() => el('filter-menu')?.querySelector('[tabindex="0"]')?.focus());
        });
        items.push(button);
        group.append(button);
      }
    };

    addGroup('Sift', CHIP_LABELS.map(([key, label]) => ({
      label,
      count: settled() ? findings?.chip_counts?.[key] ?? 0 : null,
      role: 'menuitemcheckbox',
      checked: selectedChips === null || selectedChips.has(key),
      activate: () => toggleChip(key),
    })));
    addGroup('View', [
      { label: 'All findings', role: 'menuitemradio', checked: !eventChartsOnly,
        activate: () => { eventChartsOnly = false; collapsedFindingsExpanded = false; } },
      { label: 'Event charts', role: 'menuitemradio', checked: eventChartsOnly,
        activate: () => { eventChartsOnly = true; collapsedFindingsExpanded = false; } },
    ]);
    filterFocus = Math.max(0, Math.min(filterFocus, items.length - 1));
    items.forEach((item, index) => item.tabIndex = index === filterFocus ? 0 : -1);
    menu.onkeydown = (ev) => {
      if (ev.key === 'Tab') {
        setTimeout(() => closeFilter(), 0);
        return;
      }
      let next = filterFocus;
      if (ev.key === 'ArrowDown') next = (filterFocus + 1) % items.length;
      else if (ev.key === 'ArrowUp') next = (filterFocus - 1 + items.length) % items.length;
      else if (ev.key === 'Home') next = 0;
      else if (ev.key === 'End') next = items.length - 1;
      else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        items[filterFocus].click();
        return;
      } else return;
      ev.preventDefault();
      filterFocus = next;
      items.forEach((item, index) => item.tabIndex = index === filterFocus ? 0 : -1);
      items[filterFocus].focus();
    };
  }

  /** Breadcrumb: every ancestor is a click, the leaf is plain text. */
  function crumbLabel(frame) {
    // D7/term 34 — the crumb root is the queue's own noun, at every depth
    if (frame.k === 'factors') return 'Findings';
    if (frame.k === 'factor') return frame.caseFile?.finding?.title || frame.title;
    if (frame.k === 'slot') return `${frame.cell.label} slot`;
    if (frame.k === 'block') return `${frame.cell.label} block`;
    if (frame.k === 'history') return frame.row.label;
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
    el('crumb-meta').textContent = !settled()
      || (f.k === 'factor' && !findingRowFor(f))
      || (f.k !== 'factors' && f.k !== 'factor' && !parameterRowFor(f))
      ? scopeLabel()
      : f.k === 'factors'
      ? queueMeta(findings, selectedChips, eventChartsOnly)
      : f.k === 'history' ? `${f.row.support} meal run${f.row.support === 1 ? '' : 's'}`
      : f.k === 'factor'
        ? (f.caseFile
          ? `${f.caseFile.summary.claimed} of ${f.caseFile.summary.denominator} · ${f.caseFile.window.label || '24 h'}`
          : 'Opening case file…')
        /* #735 — this used to read `N staged`, which put the deleted header's exact
           words back on screen beside the dock's `Plan · staged` (term 47: two
           claims about one object). Every sibling level's meta names its OWN
           denominator and run (term 16); this one now does too. */
        : f.k === 'slot' ? `${f.cell.slot.days} nights of steady data · ${auditState.analysis.window_days} d basal run`
          // every parameter's meta names its OWN denominator and run
          : f.k === 'block' ? `${f.cell.block.n_runs} meal runs · ${f.cell.block.n_meals} meals`
            : f.k === 'isf' ? `${isf.estimate.n.toLocaleString()} correction steps`
              : '';
  }

  /** Exactly one level renders into #level; the previous one is discarded. */
  function paintLevel() {
    const host = el('level');
    host.innerHTML = '';
    delete host.dataset.historyId;
    delete host.dataset.analysisGeneration;
    delete host.dataset.selectedRunId;
    host.dataset.dir = dir;
    // restart the swap animation on every transition
    host.style.animation = 'none';
    void host.offsetWidth;
    host.style.animation = '';
    const f = top();
    // One projection state governs every level before any old row can render.
    host.dataset.loading = String(pendingKey === currentFindingsKey());
    if (f.k === 'history') {
      renderHistoryLevel(host, f,
        (runId) => requestHistoryEvents(f, runId),
        () => refreshHistoryPair(f, { attempt: 1 }));
      return;
    }
    if (failedKey === currentFindingsKey()) {
      host.insertAdjacentHTML('beforeend',
        `<div class="empty">Findings unavailable for ${scopeLabel()}. Choose another window to try again.</div>`);
      return;
    }
    if (!settled()) {
      host.insertAdjacentHTML('beforeend',
        `<div class="empty">Loading findings for ${scopeLabel()}…</div>`);
      return;
    }
    if (f.k !== 'factors' && f.k !== 'factor' && !parameterRowFor(f)) {
      host.insertAdjacentHTML('beforeend',
        '<div class="empty">No findings in the selected window</div>');
      return;
    }
    if (f.k === 'factors') {
      /* TERM 43 — no `Inferred patterns, not settled causes` banner here. A banner
         over a ranked list cannot say WHICH rows it hedges, and rank interleaves
         habits and settings, so no position scopes it honestly. The hedge belongs to
         the habit DETAIL panel, where it has exactly one subject. */
      /* #62 hoisted the `data-loading` write above this branch so EVERY level
         declares whether it is waiting on the server, not only the queue. Same
         predicate — `settled()` is `pendingKey === null` — at a wider place, so
         the copy that used to sit here would now write it twice. */
      renderFindingsQueue(host, findings, drillFinding, {
        selected: selectedChips,
        eventChartsOnly,
        collapsedExpanded: collapsedFindingsExpanded,
        onToggleCollapsed: () => { collapsedFindingsExpanded = !collapsedFindingsExpanded; paint(); },
      });
      if (retirementNotice) {
        const notice = document.createElement('p');
        notice.className = 'history-retirement';
        notice.setAttribute('role', 'status');
        notice.textContent = retirementNotice;
        host.prepend(notice);
      }
      appendCaseError(host);
      host.scrollTop = queueScrollTop;
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
    // 'factor' is the only remaining frame kind: render only the retained
    // server-owned case. A pending replacement never clears the old one.
    if (!f.caseFile) {
      host.insertAdjacentHTML('beforeend', `<div class="empty">${f.loading
        ? 'Opening case file…' : 'Case file unavailable.'}</div>`);
      appendCaseError(host);
      return;
    }
    const caseFile = f.caseFile;
    renderCaseHead(host, caseFile, lane, pickCell, icBlocks, pickBlock);
    const missedMealComparison = caseFile.finding.lever === 'missed_meal'
      && caseFile.projection.alignment === 'event';
    if (missedMealComparison) {
      /* The attribution header's verdict accounting and the meal comparison
         describe different server-owned populations. Keep both visible, but
         do not turn this comparison into a verdict-filtered roster. */
      renderVerdictBand(host, caseFile, caseFile.family, null);
      renderMissedMealComparisonRoster(host, caseFile, f.selectedId, selectOcc,
        () => { shownRows = shownRows > EVIDENCE_CAP ? EVIDENCE_CAP : Infinity; paint(); },
        shownRows);
    } else {
      renderVerdictBand(host, { verdict_counts: caseFile.verdict_counts }, caseFile.family,
        f.bandVerdict, (verdict) => {
          f.bandVerdict = f.bandVerdict === verdict ? null : verdict;
          const selectedVerdict = caseFile.selection.state === 'selected'
            ? caseFile.selection.detail.verdict : null;
          if (f.bandVerdict && selectedVerdict && selectedVerdict !== f.bandVerdict) {
            requestCase(f, f.requestedAlignment, null);
            return;
          }
          paint();
        });
      renderCaseRoster(host, caseFile, f.bandVerdict || 'fired', f.selectedId, selectOcc,
        () => { shownRows = shownRows > EVIDENCE_CAP ? EVIDENCE_CAP : Infinity; paint(); },
        shownRows);
    }
    renderCaseSelection(host, caseFile, (detail) => callbacks.day?.(detail));
    appendCaseError(host);
    if (occurrenceFocusId && !f.loading && f.selectedId === occurrenceFocusId) {
      const row = [...host.querySelectorAll('.case-occurrence')]
        .find((button) => button.dataset.occurrenceId === occurrenceFocusId);
      row?.focus({ preventScroll: true });
      occurrenceFocusId = null;
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
    const laneEl = el('lane');
    let cells = [...laneEl.querySelectorAll('button:not([data-clock-copy])')];
    if (!shownRange) {
      brace.hidden = true;
      for (const b of cells) b.removeAttribute('data-outside');
      return;
    }
    // a block selection marks its segment WITHOUT a resizable brace (term 32);
    // the dimming below still runs, so the register stays readable
    brace.hidden = braceless;
    const [from, to] = dragDisplayWindow || shownRange;
    const xa = xAtMinute(chartEl, from, clockPanOffset);
    const xb = xAtMinute(chartEl, to, clockPanOffset);
    /* PLOT_TOP/PLOT_BOTTOM track the chart module's grid[0] insets. The edges
       run from the plot's top edge down to the bottom of the basal lane — the
       "project through the lane" spine, clipped at both ends. */
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
    /* During an unroll the basal day travels with the chart. The two copies are
       inert repeats of the shipped lane, dimmed as neighbouring days; at rest
       they are removed and the original 48 buttons regain their normal track. */
    const panning = clockPanOffset !== 0;
    if (panning && !laneEl.querySelector('[data-clock-copy]')) {
      const copy = (day) => cells.map((button) => {
        const clone = button.cloneNode(true);
        clone.dataset.clockCopy = String(day);
        clone.tabIndex = -1;
        clone.disabled = true;
        return clone;
      });
      laneEl.prepend(...copy(-1));
      laneEl.append(...copy(1));
    } else if (!panning) {
      laneEl.querySelectorAll('[data-clock-copy]').forEach((button) => button.remove());
    }
    cells = [...laneEl.querySelectorAll('button:not([data-clock-copy])')];
    laneEl.toggleAttribute('data-clock-panning', panning);
    laneEl.style.gridTemplateColumns = `repeat(${lane.cells.length * (panning ? 3 : 1)}, 1fr)`;
    laneEl.style.setProperty('--clock-pan-px', `${clockPanOffset / (95 * BIN_MINUTES)
      * plotBox(chartEl).width}px`);

    const spans = dragDisplayWindow ? [dragDisplayWindow] : windowSpans(shownRange);
    const allCells = panning ? [...laneEl.querySelectorAll('button')] : cells;
    allCells.forEach((button, index) => {
      const sourceIndex = index % lane.cells.length;
      const cell = lane.cells[sourceIndex];
      const day = Number(button.dataset.clockCopy || 0);
      const start = cell.startMin + day * 1440;
      const end = cell.endMin + day * 1440;
      button.dataset.outside = String(!spans.some(([spanStart, spanEnd]) =>
        end > spanStart && start < spanEnd));
      button.toggleAttribute('data-neighbour', day !== 0);
    });
  }

  /**
   * Drag to draw. Originates in the PLOT BODY only — the lane has no drag
   * listener, so it stays click-only. The existing frame-throttled chart repaint
   * carries the committed window treatment throughout the gesture; at a clock
   * boundary it also translates the repeated day beneath the held edge. The
   * circular window commits only on mouseup.
   */
  function installDrag() {
    const chartEl = el('chart');
    let mode = null; let anchor = 0; let width = 0; let grabOffset = 0;
    let moved = false; let pressMinute = 0;
    let lastX = 0; let panMin = 0; let panMax = 0;
    let rafId = 0;
    const DISPLAY_SPAN = 95 * BIN_MINUTES;
    const PAN_EDGE = 26;
    const PAN_PX_PER_FRAME = 13;

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
    const localX = (ev) => ev.clientX - chartEl.getBoundingClientRect().left;
    const minuteAt = (x) => minuteAtX(chartEl, x, clockPanOffset);
    const duration = ([start, end]) => end > start ? end - start : end + 1440 - start;

    function applyDrag() {
      const m = minuteAt(lastX);
      if (mode === 'draw') {
        dragDisplayWindow = snapWindow([anchor, m], envelope.pool, m < anchor ? 'end' : 'start');
        drawn = commitWindow(dragDisplayWindow);
      } else if (mode === 'a') {
        dragDisplayWindow = snapWindow([m, anchor], envelope.pool, 'end');
        drawn = commitWindow(dragDisplayWindow);
      } else if (mode === 'b') {
        dragDisplayWindow = snapWindow([anchor, m], envelope.pool, 'start');
        drawn = commitWindow(dragDisplayWindow);
      } else {
        const start = snapMinute(m - grabOffset);
        dragDisplayWindow = [start, start + width];
        drawn = commitSlide(start, width);
      }
      explicitPreset = true;
      paintChart();
      paintBrace();
      paintLive(mode === 'slide' ? 'both'
        : mode === 'draw' ? (m >= anchor ? 'b' : 'a')
          : mode);
      markWindowSegment(drawn
        ? `Window ${windowSpanText(drawn)}` : 'Whole day', clearDrawn);
    }

    function liveRepaint() {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (!mode || !moved) return;
        const box = plotBox(chartEl);
        const over = lastX - box.right;
        const back = box.left - lastX;
        const perPixel = DISPLAY_SPAN / (box.width || 1);
        /* The pan re-arms only while the pointer is PAST an edge. Bring it back
           inside the plot and the day stops where it stands, so the window is
           placed by the pointer alone — travel at the edge, aim in the plot. */
        if (over >= 0 && clockPanOffset < panMax) {
          const step = Math.min(PAN_PX_PER_FRAME, Math.max(1, over / PAN_EDGE * PAN_PX_PER_FRAME));
          clockPanOffset = Math.min(panMax, clockPanOffset + step * perPixel);
        } else if (back >= 0 && clockPanOffset > panMin) {
          const step = Math.min(PAN_PX_PER_FRAME, Math.max(1, back / PAN_EDGE * PAN_PX_PER_FRAME));
          clockPanOffset = Math.max(panMin, clockPanOffset - step * perPixel);
        }
        chartEl.parentElement.dataset.clockPan = String(clockPanOffset);
        applyDrag();
        if ((over >= 0 && clockPanOffset < panMax)
          || (back >= 0 && clockPanOffset > panMin)) liveRepaint();
      });
    }

    function move(ev) {
      if (!mode) return;
      lastX = localX(ev);
      if (!moved) {
        /* First real movement: NOW the gesture takes hold of the window. Every
           mutation lives here, so a press that never moves cannot leave one. */
        moved = true;
        if (mode === 'draw') {
          anchor = pressMinute;
        } else if (mode === 'a') {
          takeHold();
          anchor = drawn[0] + duration(drawn);
        } else if (mode === 'b') {
          takeHold();
          anchor = drawn[1] - duration(drawn);
        } else {
          takeHold();
          width = duration(drawn);
          let displayStart = drawn[0];
          if (displayStart > pressMinute) displayStart -= 1440;
          grabOffset = pressMinute - displayStart;
        }
        panMin = pressMinute - 1440;
        panMax = pressMinute + 1440 - DISPLAY_SPAN;
      }
      liveRepaint();   // the window fills and pans at most once per animation frame
    }

    /** Mid-drag feedback: the moving edge goes solid, and reads its snapped time. */
    function paintLive(which) {
      const readout = el('brace-readout');
      el('brace-a').classList.toggle('live', which === 'a' || which === 'both');
      el('brace-b').classList.toggle('live', which === 'b' || which === 'both');
      if (!which || (!dragDisplayWindow && !drawn)) { readout.hidden = true; return; }
      readout.hidden = false;
      const range = dragDisplayWindow || drawn;
      readout.textContent = which === 'both'
        ? `${hhmm(range[0])}–${hhmm(range[1])}`
        : hhmm(which === 'a' ? range[0] : range[1]);
      const x = which === 'both'
        ? (xAtMinute(chartEl, range[0], clockPanOffset)
          + xAtMinute(chartEl, range[1], clockPanOffset)) / 2
        : xAtMinute(chartEl, which === 'a' ? range[0] : range[1], clockPanOffset);
      readout.style.left = `${x}px`;
      readout.style.top = `${braceGripTop + 26}px`;
    }

    function end() {
      if (!mode) return;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      const dragged = moved;
      const wholeDay = dragged && mode !== 'slide' && dragDisplayWindow
        && commitWindow(dragDisplayWindow) === null;
      mode = null;
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', end);
      // a press that never moved changed nothing, so there is nothing to commit
      // and nothing to undo — leave the panel exactly as the press found it
      if (!dragged) return;
      if (wholeDay) {
        drawn = null;
        presetKey = 'all';
        explicitPreset = true;
      }
      dragDisplayWindow = null;
      clockPanOffset = 0;
      delete chartEl.parentElement.dataset.clockPan;
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
    const overInterior = (x) => shownRange && !braceless && duration(shownRange) < 1440
      && windowSpans(shownRange).some(([start, end]) =>
        x > xAtMinute(chartEl, start) + EDGE_GRAB
        && x < xAtMinute(chartEl, end) - EDGE_GRAB);

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
      lastX = localX(ev);
      pressMinute = minuteAt(lastX);
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
    ensurePreparation();
    const open = top();
    const ownsAlign = (open.k === 'factor'
      && open.caseFile?.projection?.alignment === 'event')
      || (open.k === 'history' && open.align === 'event');
    if (alignMount && !ownsAlign) disposeAlign();
    paintFilter();
    paintCrumb();
    paintLevel();
    renderLane(lane, top().k === 'slot' ? top().cell : null, staged, pickCell);
    renderLaneKey(lane);
    paintWatch();
    if (!alignMount) {
      paintChart();
      paintBrace();
    }
    paintAlign();
    const canvasBody = el('chart').parentElement;
    canvasBody.querySelector('.history-canvas-notice')?.remove();
    const history = top().k === 'history' ? top() : null;
    const canvasNotice = history?.stale
      ? 'Evidence may be stale. The last coherent view is still shown.'
      : history?.notice || (history?.pending ? 'Checking for coherent evidence…' : null);
    if (canvasNotice) {
      const note = document.createElement('p');
      note.className = 'history-canvas-notice';
      note.textContent = canvasNotice;
      canvasBody.append(note);
    }
    applyPendingFocus();
  }

  /* Focus consumes only a reader-driven navigation request after every painter
     has settled. A missing originating row means the level is the stable landing,
     not that no focus was requested. */
  function pendingRowFocus(frame) {
    const rowId = frame?.rowId ?? frame?.id;
    return rowId == null ? 'level' : { rowId };
  }

  function applyPendingFocus() {
    const focus = pendingFocus;
    pendingFocus = null;
    if (focus === null) return;
    const host = el('level');
    if (focus === 'level' || top().k !== 'factors') {
      host.focus();
      return;
    }
    const row = host.querySelector(`.qrow[data-id="${focus.rowId}"]`);
    if (row) row.focus({ preventScroll: true });
    else host.focus();
  }


  /* KEYBOARD. Esc is NOT bound here — it keeps its window semantics (see the
     design note's KEYBOARD block). Backspace pops a level at any depth; ↑ and ↓
     step the SELECTED Occurrence along the roster's vertical axis (P24/P25).
     The event chart owns its own cursor keys, so focus inside #ec-chart bails
     out. No filter guard is needed: opening a case file closes the root-only
     Filter before this factor frame can receive a roster key. Stepping STOPS at
     the ends rather than wrapping: an instrument should not silently return you
     to the first reading. */
  document.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const f = top();
    if (ev.key === 'Backspace' && stack.length > 1) {
      ev.preventDefault();
      ++caseGeneration;
      ++historyRequestGeneration;
      pendingKey = null;
      filterOpen = false;
      pendingFocus = pendingRowFocus(stack[1]);
      dir = 'pop';
      stack.pop();
      paint();
      return;
    }
    if (f.k !== 'factor' || !f.selectedId
      || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    if (ev.target instanceof Element && ev.target.closest('#ec-chart')) return;
    const missedMealComparison = f.caseFile.finding.lever === 'missed_meal'
      && f.caseFile.projection.alignment === 'event';
    const siblings = missedMealComparison
      ? (f.caseFile.projection.cohorts.find((cohort) => cohort.key
        === f.caseFile.selection.detail?.comparison_cohort)?.occurrence_ids.map((id) => ({ id })) || [])
      : f.caseFile.occurrences.filter((row) => row.verdict === (f.bandVerdict || 'fired'));
    const at = siblings.findIndex((row) => row.id === f.selectedId);
    const next = at + (ev.key === 'ArrowDown' ? 1 : -1);
    if (at < 0 || next < 0 || next >= siblings.length) return;
    ev.preventDefault();
    occurrenceFocusId = siblings[next].id;
    requestCase(f, f.requestedAlignment, occurrenceFocusId);
  }, { signal });   // PORT: abortable

  observeResize(el('chart'), () => chart);
  installDrag();
  document.addEventListener('pointerdown', (ev) => {
    if (filterOpen && !el('filter-wrap')?.contains(ev.target)) closeFilter();
  }, { signal });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !filterOpen) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    closeFilter({ restoreFocus: true });
  }, { capture: true, signal });
  const initialFrame = top();
  if (initialFrame.k === 'factor') requestCase(initialFrame, 'clock');
  else paint();
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
    /* PORT DEVIATION (#654): a real /api/analyze response always carries exactly
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
