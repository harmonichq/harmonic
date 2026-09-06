/* Diagnose workstation — based on the shipped workstation port.
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
 * Issue #341 revises the canvas composition below: the evidence spotlight
 * leads, followed by the real clock overview and basal lane.
 */
import {
  buildEnvelope, renderCanvas, observeResize, stripGlucoseRange,
  buildSlotLane, cellAtMinute, windowStats, hhmm, windowSpanText,
  BIN_MINUTES,
  snapMinute, snapWindow, commitWindow, commitSlide, minuteAtX, xAtMinute, plotBox, windowSpans,
  buildDayTrace,
  validateHistoryEvents, queuePreviewOption,
} from './diagnose-workstation-chart.js';
import { toCaptures, isfVerdict } from './diagnose-workstation-data.js';
import { DIAGNOSE_EVIDENCE_CHARTS, glucoseRange } from './diagnose-evidence-charts.js';
import {
  createCanvasLayout, descriptorsFromFindings, fieldRange,
  optionForDescriptor, pinChart, placeSeats,
  tileStatePresentation, unpinChart,
} from './diagnose-canvas-layout.js';
import {
  chartClickRoute, chartFrameFindingIsLive, dismissFullscreen, drilledChartIdForFrame,
  enterFullscreen, fallbackFocalId, isDrilledSpotlight,
  popInspector, reconcileTileDescriptors as reconcileCanvasDescriptors,
  rosterChartIds, seatableChartIds, untraceDrill,
} from './diagnose-canvas-state.js';
import {
  assertMatchingFindingCasePreparation,
  inconsistentFindingProjection,
  sameFindingCaseWindow,
  validFindingCaseFile,
} from './finding-case-file-validation.js';
// #735: level 1 is the server-owned findings queue, and the pane has a floor.
import {
  eventChartCoordinate, MIN_ROW_MINI_WIDTH, renderFindingsQueue, queueMeta, queueRows,
} from './diagnose-findings-queue.js';
import { EVIDENCE_CAP, renderOccurrenceRoster } from './occurrence-roster.js';
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

/* PORT: the mock reads `?mode=` from the route query. */
export function queryState(fallback, param = 'mode') {
  return new URLSearchParams(window.location.search).get(param) || fallback;
}

/* The shipped pane shell. The app shell still owns the topbar and status. */
const MARKUP = `
  <div class="instruments">
    <div class="instrument">
      <span class="cap">Window</span>
      <div class="seg" id="seg-window" role="group" aria-label="Clock window"></div>
    </div>
    <!-- ADR 215 — the mode control and the pin-cap schematic are BOTH gone from
         this row. The mode had one other position and that position is retired;
         the schematic mirrored an arrangement that no longer varies, and counted
         against a cap that no longer exists. What is left in the rail is what
         actually re-scopes the surface: the window. -->
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
          <!-- FULLSCREEN TAKES THE WHOLE LEFT AREA, GLUCOSE STRIP INCLUDED, so
               the row the strip's caption occupied becomes the fullscreen
               chart's own header. Same swap cell as the readout: the header
               height is identical in every state and nothing reflows. -->
          <div class="head-line head-full" id="canvas-fullhead" aria-hidden="true">
            <h2 id="full-title"></h2>
          </div>
        </div>
        <span class="meta persist" id="canvas-pool">—</span>
        <div class="chart-headacts" id="chart-headacts" hidden></div>
      </header>
      <div class="body">
        <div id="chart" tabindex="-1"></div>
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
      </div>
      <!-- The spotlight is the resting evidence surface. All charts temporarily
           reuses the row host as its full catalog; no intermediate strip exists. -->
      <div class="tile-field" id="tile-field" aria-label="Evidence charts">
        <div class="tile-focal" id="tile-focal"></div>
        <div class="tile-row" id="tile-row" role="group"
          aria-label="Evidence charts — scrolls vertically"></div>
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
        <!-- RETIRED — the drill-provenance readout. It restated the drilled
             chart's name beside a crumb that already names the drilled level,
             while the spotlight nameplate names the chart. Sanction:
             ConnorGriffin · 2026-08-27 · "Stop repeating ourselfes. Respect
             the sanctitity of the breadcrumb." -->
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

/* The chart module's grid[0] insets, in px — the brace is clipped to them so it
   never runs into the chart header above or past the basal lane below. Must
   track `grid` in the mock's own chart module. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 26;

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
  /* Additive tint on the dark field (#736): the explicit percentile rails carry
     the graphical-object boundary; these fills retain the two nested measured
     regions without competing with those rails or the median. The mixes were
     selected by the live color-scheme until #304 retired the light theme; the
     Dark arm is inlined so no branch survives. */
  const bandOuterMix = '22%';
  const bandInnerMix = '26%';
  return {
    ...c,
    surface2: c['surface-2'],
    rail: css('--ck-rail'),      // the panel ground under the plot
    axisText: c.secondary || c.text,

    grid: `color-mix(in srgb, ${c.line} 80%, transparent)`,
    gridStrong: c.line,
    bandOuter: `color-mix(in srgb, ${c.primary} ${bandOuterMix}, transparent)`,
    bandInner: `color-mix(in srgb, ${c.primary} ${bandInnerMix}, transparent)`,
    /* The median is the primary reading, so it must be the clearest continuous
       data mark (#258). primary-600 resolves into the warm-grey text family —
       outside the forest data family the bands draw in — and bare primary
       composits to ~2.7:1 against the inner band fill, under the 3:1 non-text
       floor. Lightened primary stays in the family and clears the floor over
       both the fill and the scrimmed fill. */
    median: `color-mix(in srgb, ${c.primary} 62%, #fff)`,
    /* The ink for text sitting ON the median fill — the axis-riding value tag
       (term 25). It was read as `colors.onAccent` and never defined anywhere:
       not by resolveColors(), not here. ECharts fell back to the option's
       textStyle colour, so the tag drew MUTED GREY on the primary plate
       (#651). The token exists; it just was not passed. */
    onAccent: css('--mk-on-primary'),
    meal: css('--ck-meal'),
    mealEdge: c.surface,
    targetFill: `color-mix(in srgb, ${c.ok} 8%, transparent)`,
    targetEdge: c.ok,
    targetText: c.text,
    /* Slice 4 — the drawn window is the BRIGHT region; the remainder of the
       band takes this ground-colour scrim (the panel ground at part strength),
       so the data outside the gates washes toward the panel rather than being
       tinted a second hue. It follows the panel through the rail token. */
    /* A PLAIN rgba(), NEVER color-mix(): ECharts' markArea fill goes through
       zrender's own color parser, which silently drops a color-mix() string —
       the scrim was in the option and painted nothing, proven live by swapping
       in an rgba() and watching the same markArea appear. The band fills only
       get away with color-mix because their path hands the string straight to
       canvas. The rail token is a hex, so the mix is done here in numbers. The
       browser suite's composite audit holds the rails and the median above the
       non-text floor under whatever alpha stands here. */
    windowDim: (() => {
      const hex = css('--ck-rail').replace('#', '');
      const wide = hex.length === 3 ? [...hex].map((h) => h + h).join('') : hex;
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(wide.slice(i, i + 2), 16));
      /* #258 recompose: at 0.06 the scrim measured only a ~5% composite
         shift — the plot stayed legible but the selected window did not read
         at all. 0.28 dims the remainder decisively while the rails and fills
         beneath stay above the non-text floor (the browser suite's composite
         audit measures both). */
      return `rgba(${r},${g},${b},0.28)`;
    })(),
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

function renderLane(lane, selectedCell, staged, onPick) {
  const host = el('lane');
  host.style.gridTemplateColumns = `repeat(${lane.cells.length}, 1fr)`;
  host.innerHTML = '';
  for (const cell of lane.cells) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lane-cell';
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
      + `<i class="lane-cell" data-verdict="${k}"></i>${VERDICT_SHORT[k]} <b class="t">${counts[k]}</b></span>`).join('');
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
  renderOccurrenceRoster(host, [{
    header: `<div class="ev-group"><b>${caseFile.finding.title}</b> — ${label}
      <span class="n">· ${publishedCount} episode${publishedCount === 1 ? '' : 's'}</span></div>`,
    servedCount: publishedCount,
    rows: rows.map((row) => ({
      id: row.id,
      html: `<span class="when">${fmtDate(row.date)} · ${row.anchor.t.slice(11, 16)}</span>
        <span class="only">${row.anchor.bg == null ? '—' : Math.round(row.anchor.bg)}
          <span>· ${row.anchor.label}</span></span><span class="tier">${label}</span>`,
    })),
    empty: '<div class="empty">No occurrences in this verdict.</div>',
    emptyBeforeHeader: true,
  }], { selectedId, shownCount, onSelect, onMore });
}

/* Event comparison is its own served population. Members remain opaque until
   selection requests their server-owned detail and trace. */
function renderEventComparisonRoster(host, caseFile, selectedId, onSelect, onMore, shownCount) {
  const { cohorts = [], counts = {} } = caseFile.projection;
  const roster = new Map(caseFile.occurrences.map((row) => [row.id, row]));
  host.insertAdjacentHTML('beforeend', `<div class="lvl-cap">Response comparison
    <span class="meta">${counts.matched} matched · ${counts.nearly_matched} nearly matched
      · ${counts.comparison} comparison · ${counts.not_comparable} not comparable</span></div>`);
  const groups = cohorts.map((cohort) => {
    const rows = cohort.occurrence_ids.map((id, index) => roster.get(id) || { id, index });
    return {
      header: `<div class="ev-group"><b>${cohort.name}</b>
        <span class="n">· ${cohort.routed_count} occurrence${cohort.routed_count === 1 ? '' : 's'}</span></div>`,
      servedCount: cohort.routed_count,
      rows: rows.map((row) => {
      const when = row.anchor ? `${fmtDate(row.date)} · ${row.anchor.t.slice(11, 16)}`
        : `${cohort.name} ${row.index + 1}`;
      const detail = row.anchor
        ? `${row.anchor.bg == null ? '—' : Math.round(row.anchor.bg)} · ${row.anchor.label}`
        : 'Select to see this occurrence’s glucose trace';
        return {
          id: row.id,
          dataset: { comparisonCohort: cohort.key },
          html: `<span class="when">${when}</span><span class="only">${detail}</span>
            <span class="tier">${cohort.name}</span>`,
        };
      }),
      empty: '<div class="empty">No occurrences in this population.</div>',
    };
  });
  renderOccurrenceRoster(host, groups, { selectedId, shownCount, onSelect, onMore });
}

/* The two reader controls a selected occurrence owns, wherever it was selected:
   release the trace, or hand the day off to Day. The Finding case file and the
   basal night roster are both real callers, and the pair's wording is
   user-visible copy that must not drift between them. */
function renderOccurrenceFoot(host, date, onClearTrace, onOpenDay) {
  const foot = document.createElement('div'); foot.className = 'inner occ-foot';
  const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'linkbtn clear-trace';
  clear.textContent = 'Clear trace'; clear.addEventListener('click', onClearTrace);
  const day = document.createElement('button'); day.type = 'button'; day.className = 'linkbtn';
  day.textContent = `Open ${fmtDate(date)} in Day`; day.addEventListener('click', onOpenDay);
  foot.append(clear, day); host.append(foot);
}

function renderCaseSelection(host, caseFile, onDay, onClearTrace) {
  const { selection } = caseFile;
  if (selection.state === 'unavailable') {
    host.insertAdjacentHTML('beforeend',
      '<div class="case-selection-state" role="status">That Occurrence is unavailable in this case file.</div>');
    return;
  }
  if (selection.state !== 'selected') return;
  const detail = selection.detail;
  const comparison = caseFile.projection.alignment === 'event';
  const rows = comparison
    ? (caseFile.projection.cohorts.find((cohort) => cohort.key === detail.comparison_cohort)
      ?.occurrence_ids.map((id) => ({ id })) || [])
    : caseFile.occurrences.filter((row) => row.verdict === detail.verdict);
  const at = rows.findIndex((row) => row.id === detail.id);
  const verdictLabel = comparison
    ? caseFile.projection.cohorts.find((cohort) => cohort.key === detail.comparison_cohort)?.name
    : VERDICT_BAND_KEY[detail.verdict] || VERDICT_RESIDUE_KEY[detail.verdict] || detail.verdict;
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
  renderOccurrenceFoot(host, detail.date, onClearTrace, () => onDay(detail));
}

function renderBehavioralFullscreen(host, f) {
  /* The workstation supplied the bounded `.tile-chart.ec-surface` host. The
     adapter contributes content only and returns the chart element whose box
     the workstation observes. */
  /* AND CONTENT MEANS THE CHART, NOT A SECOND HEADER. Fullscreen's own row
     already carries this chart's name (`full-title` above), so the adapter's
     header would stack a second title under the first — the exact doubling the
     shared-header ruling (#72) settled at the By-event mount that fullscreen
     replaced. */
  const previous = window.__diagnoseEventComparison;
  const mounted = renderEventSurface(host, f.caseFile, { headline: el('canvas-fullhead') });
  mounted.restoreGlobal = () => {
    if (window.__diagnoseEventComparison === mounted) {
      window.__diagnoseEventComparison = previous;
    }
  };
  return mounted;
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
function nightGroup(night) {
  if (night.programmed_rate == null) return 'unprogrammed';
  if (night.sign === 1) return 'above';
  if (night.sign === -1) return 'below';
  return 'set';
}

const NIGHT_GROUP_LABEL = {
  above: 'Ran above', below: 'Ran below', set: 'Ran as set', unprogrammed: 'No programmed rate',
};

/* Every null in this block is one em dash, the Finding block's own null and the
   roster row's own null. `u()` renders a missing rate as `--`, which is the
   parameter panel's convention two blocks up and reads as a second mark beside
   the em dashes on the lines below it. */
const nightRate = (rate) => (rate == null ? '—' : u(rate));

function renderSlotNightSelection(host, night, span, groupRows, rosterGlucoseMean, onClear, onDay) {
  if (!night) return;
  const at = groupRows.findIndex((row) => row.date === night.date);
  const box = document.createElement('div'); box.className = 'inner occ-detail';
  /* The slot span joins the date inside `.when`, which is exactly how the
     Finding block composes its own stamp — date · clock time. It needs no class
     of its own, and it keeps the head to the sibling's three parts.
     The tag is the Finding block's own too: a selected row's detail sits under
     whichever group the roster scrolled to, so the block states which group
     this night was served into rather than leaving the reader to find its
     header again. It restates the served grouping, never a second reading. */
  box.innerHTML = `<div class="occ-head"><span class="when">${fmtDate(night.date)} · ${span}</span>
    <span class="tag">${NIGHT_GROUP_LABEL[nightGroup(night)]}</span>
    ${at >= 0 && groupRows.length > 1 ? `<span class="pos">${at + 1} of ${groupRows.length}<i class="keyhint">↑ ↓</i></span>` : ''}</div>
    <div class="occ-nums">${nightRate(night.delivered_rate)} <span>U/h delivered</span> · ${nightRate(night.programmed_rate)} <span>U/h programmed</span></div>
    <div class="occ-nums">${night.glucose_mean == null ? '—' : Math.round(night.glucose_mean)}
      <span>mg/dL this night</span> · ${rosterGlucoseMean == null ? '—' : Math.round(rosterGlucoseMean)} <span>mg/dL roster mean</span></div>
    <div class="occ-nums">${night.glucose_entry == null ? '—' : Math.round(night.glucose_entry)}
      <span>entry</span> · ${night.glucose_exit == null ? '—' : Math.round(night.glucose_exit)}
      <span>exit</span></div>
    <div class="statline">The canvas shows this night's glucose trace over the envelope.</div>`;
  host.append(box);
  renderOccurrenceFoot(host, night.date, onClear, () => onDay(night));
}

export function renderSlotLevel(host, cell, staged, windowDays, supportFloor, onStage, options = {}) {
  const s = cell.slot;
  const e = s.estimate;
  const canStage = cell.asserts;
  const capped = /capped/i.test(s.annotation || '');
  const thin = (supportFloor != null && e.n < supportFloor) || e.wide;
  const span = `${hhmm(cell.startMin)}–${hhmm(cell.endMin)}`;
  renderParamLevel(host, {
    head: span,
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
      ? `${e.n} night${e.n === 1 ? '' : 's'} of steady data — ${supportFloor == null
        ? 'the support floor is unavailable'
        : `below the ${supportFloor}-night support floor`}${e.wide ? ' and the interval is wide' : ''}; no direction asserted, `
        + 'nothing to stage.'
      : 'No direction asserted here, so there is nothing to stage; the number and its interval '
        + 'are shown as measured.',
    onStage: () => onStage(cell),
  });
  const evidence = options.nightEvidence;
  if (evidence?.pending) {
    host.insertAdjacentHTML('beforeend', '<div class="empty">Loading nights…</div>');
    return;
  }
  if (!evidence || evidence.stale || evidence.failed) {
    host.insertAdjacentHTML('beforeend', '<div class="empty">Night evidence unavailable.</div>');
    return;
  }
  const groups = ['above', 'below', 'set', 'unprogrammed'].map((key) => {
    const rows = (evidence.nights || []).filter((night) => nightGroup(night) === key);
    return {
      header: `<div class="ev-group"><b>${NIGHT_GROUP_LABEL[key]}</b><span class="n"> · ${rows.length} night${rows.length === 1 ? '' : 's'}</span></div>`,
      servedCount: rows.length,
      /* The row is the comparison the roster exists for: what ran against what
         was programmed, and where the night's glucose landed. Entering and
         leaving glucose belong to the selected night's detail block, not to
         every row — on the shared five-column spine they crowded out the
         programmed rate and the mean, leaving a reader unable to compare any
         night against its own setting without selecting nights one at a time.
         The separator is the same `·` the detail block sets between the pair. */
      rows: rows.map((night) => ({
        id: night.date,
        html: `<span class="when">${fmtDate(night.date)}</span>
          <span class="entry">${nightRate(night.delivered_rate)}</span>
          <span class="arrow">·</span><span class="worst">${nightRate(night.programmed_rate)}</span>
          <span class="delta">${night.glucose_mean == null ? '—' : Math.round(night.glucose_mean)}</span>`,
      })),
    };
  }).filter((group) => group.servedCount > 0);
  host.insertAdjacentHTML('beforeend', `<div class="lvl-cap">Nights of steady data
    <span class="meta">${evidence.roster_glucose_mean == null ? '—' : Math.round(evidence.roster_glucose_mean)} mg/dL mean</span></div>`);
  renderOccurrenceRoster(host, groups, {
    selectedId: options.selectedId, shownCount: options.shownCount ?? EVIDENCE_CAP,
    onSelect: options.onSelect || (() => {}), onMore: options.onMore || (() => {}),
  });
  if (evidence.excluded_night_count) {
    host.insertAdjacentHTML('beforeend', `<div class="empty">${evidence.excluded_night_count} excluded night${evidence.excluded_night_count === 1 ? '' : 's'}</div>`);
  }
  const selected = (evidence.nights || []).find((night) => night.date === options.selectedId);
  renderSlotNightSelection(host, selected, span,
    selected ? (evidence.nights || []).filter((night) => nightGroup(night) === nightGroup(selected)) : [],
    evidence.roster_glucose_mean,
    options.onClear || (() => {}), options.onDay || (() => {}));
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

export function renderIsfLevel(host, isf, isfStaged, onStage) {
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
        ? 'No new number is available, so there is nothing to stage.'
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
  const { envelope: envelopeIn } = data;
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
  let fullscreen = null;
  /* All charts is a temporary full-canvas catalog, independent of the selected
     chart's own fullscreen state. */
  let explorerOpen = false;
  let drilledChartId = null;
  let filterOpen = false;
  let filterFocus = 0;
  let queueScrollTop = 0;
  let collapsedFindingsExpanded = false;
  const watched = data.watched;

  const phoneReadingScroller = () => window.matchMedia('(max-width: 480px)').matches
    ? root.closest('.main-content') : null;
  const queueScrollOwner = () => phoneReadingScroller() || el('level');
  const rememberQueuePosition = () => {
    queueScrollTop = queueScrollOwner()?.scrollTop || 0;
  };
  const restorePhoneQueuePosition = ({ first = false } = {}) => {
    const scroller = phoneReadingScroller();
    if (!scroller) return;
    const restore = () => {
      if (first) {
        el('level')?.querySelector('.qrow.priced, .qrow')?.scrollIntoView({ block: 'start' });
      } else {
        scroller.scrollTop = queueScrollTop;
      }
    };
    /* Queue minis acquire their final chart boxes on the frame after the DOM
       repaint. Restore once immediately and once after that sizing frame so a
       deep reading position is not clamped to the shorter interim document. */
    requestAnimationFrame(() => {
      restore();
      requestAnimationFrame(restore);
    });
  };

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
  const supportFloor = auditState.analysis.basal_support_floor;
  const lane = buildSlotLane(auditState.analysis.basal);

  /* The app is served an already-pooled glucose envelope. */
  const envelope = envelopeIn;
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
     32): the gate edges and their grips are suppressed and the edges stop
     being hit-testable, so a data boundary can never be dragged into a user
     window by accident. */
  let braceless = false;
  let chart = null;
  let shownRows = EVIDENCE_CAP;
  let dir = 'push';
  let canvasLayout = createCanvasLayout();
  let tileDescriptors = [];
  let tileRuntime = new Map();
  let tileMounts = [];
  let rowMiniMounts = [];
  let tileAnalysisGeneration = findings?.analysis_generation || null;
  let seatingPolicyKey = null;
  let tileRequestGeneration = 0;
  const tileRecoveryGenerations = new Map();
  let findingsRefreshTail = Promise.resolve();
  let sharedGlucoseRange = glucoseRange([]);
  let presetKey = CFG.win;                          // what Esc restores
  let shownRange = null;                            // the window the canvas resolved to
  let braceGripTop = 48;                            // y of the grip band, set by paintBrace
  let dragDisplayWindow = null;                     // monotonic minutes while a drag is live
  let clockPanOffset = 0;                           // left edge of the unrolled clock display
  /* An EXPLICIT window choice — a preset press or a drag — outranks the window
     a frame would derive. An explicit preset or drawn window survives factor and
     occurrence drilling; it is released only by a navigation that carries its
     own span to substitute (ADR 294) — a lane click, or a basal or I:C drill
     through the picker, by queue row or by chart. ISF and a behavioral finding
     drill derive no span of their own, so neither releases it. Presets and
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
  let preparationInFlight = null;
  let dragPreparationWait = null;
  let dragPreparationWantedKey = null;
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

  const validFindingsGeneration = (next) => {
    if (next?.schema !== 'diagnose-findings-v2'
      || typeof next.analysis_generation !== 'string' || !next.analysis_generation
      || !Array.isArray(next.rows)) {
      throw new Error('Server did not return one coherent findings generation.');
    }
    return next;
  };

  /* ONE GENERATION AUTHORITY. Adopting a fresh findings generation is the same
     act for a history pair and for a tile whose evidence request came back
     `analysis_generation_mismatch`: ask the server, drop the answer if the
     reader has moved on, and otherwise make it the surface's findings. Both
     callers go through this pair; a second generation check would be one fact
     with two implementations. What each caller re-derives afterwards — a
     history frame, or the tile field via `reconcileTileDescriptors` — is its
     own, and nothing here restores a layout captured before the refresh. */
  const adoptFindings = (next, key) => {
    if (key !== currentFindingsKey()) return null;
    findings = next;
    loadedKey = key;
    pendingKey = null;
    failedKey = null;
    return next;
  };

  async function requestFindingsGeneration({ selectedHistoryId = null, still }) {
    const key = currentFindingsKey();
    const next = await refreshFindingsGeneration(selectedHistoryId);
    // `still` is the CALLER's currency: a history frame is current while it is
    // still on top of its own request, a tile recovery while the reader has not
    // moved the window out from under it.
    if (key !== currentFindingsKey() || !still(key)) return null;
    return { next, key };
  }

  async function refreshFindingsGeneration(selectedHistoryId = null) {
    const window = requestWindow();
    const refresh = findingsRefreshTail.then(() => callbacks.loadFindings?.(
      window, selectedHistoryId,
    ));
    findingsRefreshTail = refresh.catch(() => null);
    return validFindingsGeneration(await refresh);
  }

  const descriptorCoordinatesKey = (descriptor) => JSON.stringify(descriptor.coordinates);
  const descriptorHasData = (descriptor) => {
    const data = descriptor.data;
    if (!data || data.stale) return false;
    if (descriptor.kind === 'basal') return (data.nights || []).length > 0;
    if (descriptor.kind === 'isf') {
      return (data.windows || []).length > 0 || (data.steps || []).length > 0;
    }
    if (descriptor.kind === 'carb-ratio') {
      return (data.runs || []).length > 0 || (data.series || []).length > 0;
    }
    return (data.projection?.cohorts || []).some((cohort) => (cohort.points || []).length > 0);
  };

  function descriptorLoader(descriptor) {
    if (descriptor.kind === 'basal') return callbacks.loadBasalEvidence;
    if (descriptor.kind === 'isf') return callbacks.loadIsfEvidence;
    if (descriptor.kind === 'carb-ratio') return callbacks.loadCarbRatioEvidence;
    /* #181 retired the standalone comparison endpoint: the meals/lows tile asks
       for the same Finding case file the inspector's own drill asks for. */
    return callbacks.loadCase;
  }

  function disposeTiles() {
    for (const mount of tileMounts) {
      mount.observer?.disconnect();
      mount.chart?.dispose();
      mount.cleanup?.();
      mount.restoreHeader?.();
      mount.restoreGlobal?.();
    }
    tileMounts = [];
  }

  function installTileMount(host, mount) {
    return { ...mount,
      observer: observeResize(mount.resizeHost || host, () => mount.chart) };
  }

  function disposeRowMinis() {
    for (const mount of rowMiniMounts) {
      mount.observer?.disconnect();
      mount.chart?.dispose();
    }
    rowMiniMounts = [];
  }

  function mountDescriptorChart(host, descriptor, mini, { catalog = false } = {}) {
    const option = optionForDescriptor(
      descriptor, DIAGNOSE_EVIDENCE_CHARTS, sharedGlucoseRange, {
        mini, window: scopeWindow(), caseFile: catalog ? descriptor.data : tileCaseFile(descriptor), surface: host,
      },
    );
    if (!mini && host.clientWidth <= 480) {
      const axes = Array.isArray(option.xAxis) ? option.xAxis : [option.xAxis];
      for (const axis of axes) {
        if (!axis?.name) continue;
        axis.nameLocation = 'end';
        axis.nameTextStyle = { ...axis.nameTextStyle, align: 'right' };
      }
    }
    const chart = window.echarts.init(host, null, { renderer: 'canvas' });
    return { chart, option };
  }

  function mountRowMinis(miniSlots) {
    for (const { host, row } of miniSlots) {
      const queueRow = host.closest('.qrow');
      if (host.clientWidth < MIN_ROW_MINI_WIDTH) {
        host.remove();
        queueRow.dataset.mini = 'omitted';
        continue;
      }
      const descriptor = chartDescriptor(row.id);
      if (!descriptor) {
        /* Some ranked history rows have no chart contract. Do not leave an
           empty chart well that implies missing evidence; every queue chart
           that does have a descriptor remains mounted. */
        host.remove();
        queueRow.dataset.mini = 'unavailable';
        continue;
      }
      const runtime = tileRuntime.get(descriptor.chartId);
      if (runtime?.pending || descriptor.state !== 'ok') {
        const presentation = tileStatePresentation(descriptor);
        host.classList.add('tile-state');
        host.textContent = runtime?.pending ? 'Loading evidence…' : presentation.name;
        continue;
      }
      try {
        host.classList.remove('tile-state');
        host.textContent = '';
        const styles = getComputedStyle(host);
        const token = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
        const option = queuePreviewOption(descriptor, sharedGlucoseRange, {
          text: token('--mk-text', '#f2ede2'), muted: token('--mk-muted', '#a49c90'),
          line: token('--wk-rule', '#3f3833'), signal: token('--in-range', '#86ad78'),
          high: token('--high', '#e2be4c'), basal: token('--basal', '#a89a85'),
          excluded: token('--notindata', '#8d8579'),
          cohorts: {
            matched: token('--ec-matched', '#86ad78'),
            nearly_matched: token('--ec-nearly-matched', '#e2be4c'),
            comparison: token('--ec-comparison', '#d08150'),
          },
        });
        const mounted = { chart: window.echarts.init(host, null, { renderer: 'canvas' }), option };
        host.dataset.previewKind = descriptor.kind;
        rowMiniMounts.push(installTileMount(host, mounted));
        mounted.chart.setOption(mounted.option, true);
      } catch {
        host.classList.add('tile-state');
        host.textContent = 'Evidence unavailable';
      }
    }
  }

  function currentTileDescriptors() {
    return tileDescriptors.filter((descriptor) => tileRuntime.get(descriptor.chartId)?.current);
  }

  /* THE ROW ORDER IS DERIVED, NEVER CARRIED. It is the published findings rank
     followed by still-live retained stars, recomputed on every paint, so there is no reader
     ordering to preserve across a reconcile and nothing to drop when the policy
     changes. #135 kept a candidate list here precisely because a focus swap
     shuffled the field; the field no longer shuffles. */
  function currentTileCandidates() {
    return seatableChartIds(findings, currentTileDescriptors(), canvasLayout.pins);
  }

  /* FOCUS IS ONE FIELD NOW. The demoted chart falls back to its own ordered
     position in the row rather than into the seat the promoted one vacated, so
     there is no second half of this operation to keep in step. */
  function focusChart(chartId) {
    canvasLayout = createCanvasLayout({ focalId: chartId, pins: canvasLayout.pins });
  }

  function reconcileTileDescriptors({ skipLoadIds = new Set() } = {}) {
    const generation = findings?.analysis_generation || null;
    /* The comparison tile's request quotes the same opaque projection id the
       inspector's own case-file drill quotes, and the preparation is where that
       id lives — the findings queue carries rows, not the served generation. */
    const generated = descriptorsFromFindings(
      findings && { ...findings, projection_id: preparation?.projection_id },
      DIAGNOSE_EVIDENCE_CHARTS,
    );
    const generationChanged = tileAnalysisGeneration !== null
      && tileAnalysisGeneration !== generation;
    const old = new Map(tileDescriptors.map((descriptor) => [descriptor.chartId, descriptor]));
    const oldRuntime = tileRuntime;
    const nextPolicyKey = settled() ? `${loadedKey}:${generation}` : seatingPolicyKey;
    const policyChanged = nextPolicyKey !== null && nextPolicyKey !== seatingPolicyKey;
    const reconciled = reconcileCanvasDescriptors(
      generated, tileDescriptors, canvasLayout, { policyChanged },
    );
    const vanishedPinnedIds = new Set(reconciled.vanishedPinnedIds);
    canvasLayout = reconciled.layout;
    const nextRuntime = new Map();
    const next = reconciled.descriptors.map((seed) => {
      const prior = old.get(seed.chartId);
      if (vanishedPinnedIds.has(seed.chartId)) {
        const retained = oldRuntime.get(seed.chartId)
          || { current: true, pending: false, message: null, request: 0 };
        retained.current = true;
        retained.pending = false;
        retained.message = 'Kept chart is not in the current findings.';
        retained.retained = true;
        nextRuntime.set(seed.chartId, retained);
        return seed;
      }
      const sameRequest = prior && !generationChanged && prior.kind === seed.kind
        && descriptorCoordinatesKey(prior) === descriptorCoordinatesKey(seed);
      /* The runtime object is KEPT, not copied. A fetch in flight holds the
         tile's runtime and writes its answer there; reconciling to a copy left
         the answer on an orphan and the tile read "Loading evidence…" forever
         while its state said ok. */
      const carried = oldRuntime.get(seed.chartId);
      if (sameRequest) {
        carried.current = true;
        carried.retained = false;
      }
      nextRuntime.set(seed.chartId, sameRequest
        ? carried
        : { current: true, pending: false, message: null, request: 0, retained: false });
      return sameRequest ? prior : seed;
    });
    tileDescriptors = next;
    tileRuntime = nextRuntime;
    tileAnalysisGeneration = generation;
    const available = new Set(tileDescriptors.map(({ chartId }) => chartId));
    canvasLayout = createCanvasLayout({
      focalId: available.has(canvasLayout.focalId)
        ? canvasLayout.focalId
        : fallbackFocalId(findings, currentTileDescriptors(),
          currentTileCandidates(), canvasLayout.pins),
      pins: canvasLayout.pins,
    });
    seatingPolicyKey = nextPolicyKey;
    for (const descriptor of tileDescriptors) {
      const runtime = tileRuntime.get(descriptor.chartId);
      if (!runtime.retained && !skipLoadIds.has(descriptor.chartId) && !runtime.pending
          && descriptor.data === null && descriptor.state === 'empty') {
        void fetchTile(descriptor);
      }
    }
  }

  /* STALE GENERATION — the recovery IS the shared generation refresh. The
     server answered this tile's evidence request with
     `analysis_generation_mismatch`, so the tile names that state with the
     server's own wording, the surface adopts the current findings generation
     through the one primitive above, and `reconcileTileDescriptors` — the sole
     authority on what the canvas holds — re-derives the tile field from the new
     rows. Nothing restores a layout captured before the refresh.

     A PINNED CHART WHOSE ROW THE NEW GENERATION NO LONGER PUBLISHES keeps its
     seat as a named empty tile. The retained descriptor has no data and cannot
     issue an evidence request until a later findings generation publishes its
     coordinates again. */
  function markTileStale(chartId, message, { pending = false } = {}) {
    const descriptor = tileDescriptors.find((item) => item.chartId === chartId);
    if (!descriptor) return null;
    descriptor.state = 'stale-generation';
    descriptor.data = null;
    const runtime = tileRuntime.get(chartId);
    runtime.message = message;
    runtime.pending = pending;
    paint();
    return descriptor;
  }

  async function recoverStaleTile(chartId, staleResult) {
    if (staleResult?.stale !== true || typeof staleResult.message !== 'string') {
      throw new TypeError('stale recovery needs the typed generation-mismatch result');
    }
    const recovery = (tileRecoveryGenerations.get(chartId) || 0) + 1;
    tileRecoveryGenerations.set(chartId, recovery);
    const currentRecovery = () => tileRecoveryGenerations.get(chartId) === recovery;
    if (!markTileStale(chartId, staleResult.message, { pending: true })) return;
    try {
      const adopted = await requestFindingsGeneration({
        still: (key) => currentRecovery() && key === currentFindingsKey(),
      });
      if (!adopted) {
        markTileStale(chartId, staleResult.message);
        return;
      }
      adoptFindings(adopted.next, adopted.key);
      reconcileTileDescriptors({ skipLoadIds: new Set([chartId]) });
      const descriptor = tileDescriptors.find((item) => item.chartId === chartId);
      if (!descriptor || tileRuntime.get(chartId)?.retained) {
        // the row is gone from the new generation: retain the named pin state
        paint();
        return;
      }
      markTileStale(chartId, staleResult.message, { pending: true });
      await fetchTile(descriptor, { recover: false });
    } catch {
      if (!currentRecovery()) return;
      markTileStale(chartId, staleResult.message);
    }
  }

  async function fetchTile(descriptor, { recover = true } = {}) {
    const load = descriptorLoader(descriptor);
    /* The tile's runtime is read back by chart id on every hop, never captured:
       reconciliation can replace the entry under an in-flight fetch, and an
       answer written to a runtime the field no longer reads is a tile that
       never stops loading. */
    const runtimeNow = () => tileRuntime.get(descriptor.chartId);
    if (!load) {
      const runtime = runtimeNow();
      runtime.pending = false;
      descriptor.state = 'error';
      runtime.message = 'Evidence request is unavailable.';
      paint();
      return;
    }
    const request = ++tileRequestGeneration;
    runtimeNow().request = request;
    runtimeNow().pending = true;
    paint();
    const superseded = () => runtimeNow()?.request !== request
      || !tileDescriptors.includes(descriptor);
    try {
      const data = await load(descriptor.coordinates);
      if (superseded()) return;
      runtimeNow().pending = false;
      if (data?.stale === true) {
        if (recover) await recoverStaleTile(descriptor.chartId, data);
        else markTileStale(descriptor.chartId, data.message);
        return;
      }
      descriptor.data = data;
      descriptor.state = descriptorHasData(descriptor) ? 'ok' : 'empty';
      runtimeNow().message = descriptor.state === 'empty' ? 'No evidence in this request.' : null;
      paint();
    } catch (error) {
      if (superseded()) return;
      runtimeNow().pending = false;
      descriptor.state = 'error';
      runtimeNow().message = error?.message || 'Evidence request failed.';
      paint();
    }
  }

  function historyRetired(frame, message, nextFindings, key) {
    if (!adoptFindings(nextFindings, key)) return false;
    ++historyRequestGeneration;
    retirementNotice = message;
    stack.length = 1;
    dir = 'pop';
    paint();
    return true;
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
      const adopted = await requestFindingsGeneration({ selectedHistoryId: frame.id,
        still: () => request === historyRequestGeneration && top() === frame });
      if (!adopted) {
        if (request === historyRequestGeneration && top() === frame) {
          pendingKey = null;
          frame.pending = false;
          paint();
        }
        return;
      }
      const next = adopted.next;
      const selection = validateHistorySelection(next, frame);
      if (!['aged_out', 'unavailable'].includes(selection.disposition)) {
        throw new Error('Retired history did not have a matching findings disposition.');
      }
      if (!historyRetired(frame, selection.message, next, adopted.key)) {
        pendingKey = null;
        frame.pending = false;
        paint();
      }
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
    pendingKey = currentFindingsKey();
    frame.pending = true;
    frame.stale = false;
    paint();
    try {
      const adopted = await requestFindingsGeneration({ selectedHistoryId: frame.id,
        still: () => request === historyRequestGeneration && top() === frame });
      if (!adopted) {
        if (request === historyRequestGeneration && top() === frame) {
          pendingKey = null;
          frame.pending = false;
          paint();
        }
        return;
      }
      const next = adopted.next;
      const selection = validateHistorySelection(next, frame);
      if (['aged_out', 'unavailable'].includes(selection.disposition)) {
        if (!historyRetired(frame, selection.message, next, adopted.key)) {
          pendingKey = null;
          frame.pending = false;
          paint();
        }
        return;
      }
      if (selection.disposition === 'out_of_scope') {
        if (!adoptFindings(next, adopted.key)) return;
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
      if (!adoptFindings(next, adopted.key)) {
        pendingKey = null;
        frame.pending = false;
        paint();
        return;
      }
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
    const key = windowKey(w);
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
        if (!adoptFindings(findingsFromPreparation(shadow.shadowPreparation), key)) return;
        preparation = shadow.shadowPreparation;
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

  /* Dragging can cross several 15-minute positions before one evidence
     preparation returns. Keep one request in flight and one replaceable slot
     for the newest position; intermediate positions have no tile to paint. */
  function ensurePinnedDragPreparation() {
    if (canvasLayout.pins.length === 0) {
      dragPreparationWantedKey = null;
      return;
    }
    dragPreparationWantedKey = currentPreparationKey();
    if (dragPreparationWait) return;

    const waitFor = (request, requestedKey) => {
      dragPreparationWait = request;
      request.then(() => {
        if (dragPreparationWait !== request) return;
        dragPreparationWait = null;
        const wantedKey = dragPreparationWantedKey;
        dragPreparationWantedKey = null;
        if (wantedKey !== null && wantedKey !== requestedKey) {
          dragPreparationWantedKey = wantedKey;
          issueLatest();
        }
      });
    };

    const issueLatest = () => {
      if (canvasLayout.pins.length === 0 || dragPreparationWantedKey === null) {
        dragPreparationWantedKey = null;
        return;
      }
      if (preparationInFlight) {
        waitFor(preparationInFlight, pendingKey);
        return;
      }
      const requestedKey = dragPreparationWantedKey;
      dragPreparationWantedKey = null;
      const request = ensurePreparation();
      if (!request) return;
      waitFor(request, requestedKey);
    };
    issueLatest();
  }

  function refreshQueueAfterUnavailable(frame, generation, originalError) {
    const w = findingsWindow();
    const key = windowKey(w);
    const requested = w ? { start_min: w[0], end_min: w[1] } : null;
    Promise.resolve(callbacks.loadPreparation?.(requested))
      .then((response) => {
        if (!isCurrentCaseRequest(generation, frame)) return;
        const next = matchingPreparation(response, requested);
        if (!adoptFindings(findingsFromPreparation(next), key)) return;
        preparation = next;
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
    const request = Promise.resolve(callbacks.loadPreparation?.(requested))
      .then((response) => {
        if (generation !== preparationGeneration || currentPreparationKey() !== key) return null;
        const next = matchingPreparation(response, requested);
        if (!frame) {
          if (!adoptFindings(findingsFromPreparation(next), key)) return null;
          preparation = next;
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
        if (!adoptFindings(findingsFromPreparation(shadow.next), key)) return;
        preparation = shadow.next;
        frame.caseFile = shadow.shadowCase;
        frame.pendingCaseRequest = null;
        frame.loading = false;
        frame.selectedId = shadow.shadowCase.selection.state === 'selected'
          ? shadow.shadowCase.selection.requested_id : null;
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
    preparationInFlight = request;
    request.then(() => {
      if (preparationInFlight === request) preparationInFlight = null;
    });
    return request;
  }

  /** A queue row's drill target — keyed on the projection's own row id, never
      guessed from a title. A row whose parameter this payload cannot show keeps its
      chevron and simply does not move (the app always carries all three). */
  function drillFinding(row, { queueOrigin = false } = {}) {
    if (row.register === 'history') {
      retirementNotice = null;
      push({
        k: 'history', id: row.id, row, generation: findings.analysis_generation,
        align: 'clock', events: null, selectedRunId: null,
        canvasScope: historyCanvasScope(),
        pending: false, stale: false, notice: null, queueOrigin,
      });
      return;
    }
    if (row.register === 'finding') {
      const entryAlignment = eventChartCoordinate(row) ? 'event' : 'clock';
      const frame = { k: 'factor', rowId: row.id, title: row.title,
        caseFile: null, requestedAlignment: entryAlignment, selectedId: null,
        bandVerdict: null, loading: false,
        eventDiscovery: entryAlignment === 'event', queueOrigin };
      push(frame);
      requestCase(frame, entryAlignment);
      return;
    }
    if (row.parameter === 'isf') { push({ k: 'isf', rowId: row.id, queueOrigin }); return; }
    if (row.parameter === 'carb_ratio') {
      const cell = icBlocks.find((c) => `ic:${c.id}` === row.id);
      if (cell) pickBlock(cell, row.id, { queueOrigin });
      return;
    }
    if (row.parameter === 'basal_rate') {
      const cell = lane.cells.find((c) => c.startMin === row.span?.start_min);
      if (cell) pickCell(cell, row.id, { queueOrigin });
    }
  }

  /* THE STACK. One frame per level; only `top()` ever renders. Frames:
     {k:'factors'} · {k:'factor', factor} · {k:'occ', occ} · {k:'slot', cell}. */
  const stack = [{ k: 'factors' }];
  let pendingFocus = null;
  let occurrenceFocusId = null;
  const top = () => stack[stack.length - 1];
  const push = (frame) => {
    if (top().k === 'factors') rememberQueuePosition();
    filterOpen = false;
    pendingFocus = 'level';
    dir = 'push'; stack.push(frame);
    seatDrill(drilledChartIdForFrame(frame, currentTileDescriptors()));
    shownRows = EVIDENCE_CAP; paint();
  };
  /* A DRILL SEATS ITS OWN EVIDENCE. Ruled by the operator after the fix round's
     live repro: drilling the top-ranked behavioural finding left three
     look-alike comparison tiles up and the drilled finding's own response
     comparison unseated, so the inspector was reading one factor while the
     field showed another. The drilled chart takes the focal seat and wears the
     drill mark; pinning is still the only other thing that moves the field, and
     it still never moves focus. */
  const seatDrill = (chartId) => {
    drilledChartId = chartId;
    if (chartId && !fullscreen) focusChart(chartId);
  };
  const popTo = (i) => {
    ++caseGeneration;
    ++historyRequestGeneration;
    pendingKey = null;
    filterOpen = false;
    const resetQueueRoot = i === 0 && stack.slice(1).some((frame) => frame.queueOrigin);
    pendingFocus = pendingRowFocus(stack[1]);
    /* A queue-row drill changes the shared stage to that row's evidence. On
       return the stage deliberately re-seats rank one, so restore the queue's
       matching root anchor as well. Keep focus on the originating row without
       scrolling it back over rank one; direct All charts entry is not tagged
       queueOrigin and retains its saved queue position. */
    if (resetQueueRoot) queueScrollTop = 0;
    const popped = popInspector(stack, i, currentTileDescriptors());
    stack.splice(0, stack.length, ...popped.stack);
    seatDrill(popped.drilledChartId);
    /* LEAVING A DRILL RE-SEATS THE ACTIVE FINDING'S CHART, NEVER THE CHART
       JUST LEFT (ADR 306). `popped.drilledChartId` is null once the stack is
       back at the queue — `seatDrill(null)` marks nothing drilled but also
       moves nothing, which used to strand the stage on whatever chart the
       drill had focused. The same fallback the reconcile falls back to
       re-seats it here. */
    if (!popped.drilledChartId && !fullscreen) {
      focusChart(fallbackFocalId(findings, currentTileDescriptors(),
        currentTileCandidates(), canvasLayout.pins));
    }
    dir = 'pop'; paint();
    if (i === 0) restorePhoneQueuePosition({ first: resetQueueRoot });
  };

  function findingRowFor(frame) {
    if (frame.k !== 'factor') return null;
    return (findings?.rows || []).find((row) => row.id === frame.rowId) || null;
  }

  function parameterRowFor(frame) {
    if (frame.k === 'chart') return true;
    if (!frame.rowId) return true;
    return (findings?.rows || []).find((row) => row.id === frame.rowId) || null;
  }

  const chartDescriptor = (chartId) => tileDescriptors.find((item) => item.chartId === chartId);
  const slotDescriptor = (cell) => tileDescriptors.find((descriptor) => descriptor.kind === 'basal'
    && descriptor.coordinates.slot === cell.i);
  const slotNightEvidence = (frame) => {
    const descriptor = slotDescriptor(frame.cell);
    if (descriptor?.data) return descriptor.data;
    if (frame.nightEvidence) return frame.nightEvidence;
    if (frame.nightEvidencePending || tileRuntime.get(descriptor?.chartId)?.pending) return { pending: true };
    if (frame.nightEvidenceFailed || descriptor?.state === 'error' || descriptor?.state === 'stale-generation') {
      return { failed: true };
    }
    return null;
  };
  const requestSlotNightEvidence = (frame) => {
    if (slotDescriptor(frame.cell) || frame.nightEvidence || frame.nightEvidencePending) return;
    const load = callbacks.loadBasalEvidence;
    if (!load) { frame.nightEvidenceFailed = true; return; }
    const request = frame.nightEvidenceRequest;
    frame.nightEvidencePending = true;
    void load({ slot: frame.cell.i }).then((evidence) => {
      if (top() !== frame || frame.nightEvidenceRequest !== request) return;
      frame.nightEvidencePending = false;
      frame.nightEvidence = evidence;
      paint();
    }).catch(() => {
      if (top() !== frame || frame.nightEvidenceRequest !== request) return;
      frame.nightEvidencePending = false;
      frame.nightEvidenceFailed = true;
      paint();
    });
  };
  const prepareSlotFrame = (frame) => {
    Object.assign(frame, { selectedId: null, nightShownRows: EVIDENCE_CAP,
      nightEvidence: null, nightEvidencePending: false, nightEvidenceFailed: false,
      nightEvidenceRequest: (frame.nightEvidenceRequest || 0) + 1 });
    requestSlotNightEvidence(frame);
    return frame;
  };
  const chartEntry = (descriptor) => DIAGNOSE_EVIDENCE_CHARTS
    .find((entry) => entry.kind === descriptor?.kind);
  /* Selection belongs to the standing case file, while descriptor data belongs
     to the tile's selection-free request. Present the active case without
     mutating fetch-owned state that an in-flight tile response can replace. */
  const tileCaseFile = (descriptor) => {
    const frame = top();
    return descriptor.kind === 'event-comparison'
      && frame.k === 'factor' && frame.rowId === descriptor.chartId
      && frame.caseFile?.projection?.alignment === 'event'
      ? frame.caseFile : descriptor.data;
  };

  /* A CHART CLICK IS ONE LEVEL, ALWAYS THE SAME ONE (ADR 294). `chartClickRoute`
     holds the pure decision — every settings kind now resolves to the same
     findings row its queue row would, and takes the row route, exactly as the
     behavioural branch already did. A chart the inspector is already standing
     on is a no-op; any other chart replaces the standing level-2 frame rather
     than sitting on top of it. */
  function showChartInspector(descriptor) {
    if (!descriptor) return;
    seatDrill(descriptor.chartId);
    const route = chartClickRoute(descriptor, top(), findings?.rows || []);
    if (route.action === 'noop') {
      paint();
      return;
    }
    if (route.popToRoot) popTo(0);
    if (route.action === 'placeholder') {
      push({ k: 'chart', chartId: descriptor.chartId, rowId: descriptor.chartId,
        placeholder: route.message });
      return;
    }
    drillFinding(route.row);
  }

  function dismissChartFullscreen() {
    if (!fullscreen) return;
    canvasLayout = dismissFullscreen(fullscreen);
    fullscreen = null;
    paint();
    if (!explorerOpen) restorePhoneQueuePosition();
  }
  /* The lane is a shortcut INTO the slot branch: from level 1 it pushes, from a
     slot frame it swaps in place, so clicking cells never deepens the stack. */
  function pickCell(cell, rowId = null, { queueOrigin = false } = {}) {
    /* Selecting a slot is a NAVIGATION that carries its own window, so it
       releases whatever explicit choice was standing and lets the slot frame
       supply the window. Minting a `drawn` window here was wrong twice over: it
       ran the slot's real 30-min bounds through the drawn-window path (which
       re-scoped the whole inspector to 30 minutes and labelled the chip
       "Window 07:00–07:30" instead of "Slot 07:00"), and a 30-min span is under
       the 90-min floor a DRAWN window must respect — a slot boundary is data,
       not a drawn sample, and only the frame path renders it unsnapped. */
    releaseWindow();
    if (top().k === 'slot') {
      prepareSlotFrame(Object.assign(top(), { cell, rowId })); paint(); return;
    }
    push(prepareSlotFrame({ k: 'slot', cell, rowId, queueOrigin }));
  }

  /** The I:C findings-queue route: push from level 1, swap in place. */
  function pickBlock(cell, rowId = null, { queueOrigin = false } = {}) {
    releaseWindow();
    if (top().k === 'block') { Object.assign(top(), { cell, rowId }); paint(); return; }
    push({ k: 'block', cell, rowId, queueOrigin });
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
    stack.push(prepareSlotFrame({ k: 'slot', cell }));
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
    /* Selection puts the case file's exact trace over the pooled envelope.
       This is select-in-place (P35 retired): the selected Occurrence never
       narrows the window (P21 retired) — it only adds the server-owned trace
       on top of whatever window the factor frame resolved above. */
    const detail = f.k === 'factor' && f.caseFile?.selection?.state === 'selected'
      ? f.caseFile.selection.detail : null;
    const selectedNight = f.k === 'slot' && f.selectedId
      ? slotNightEvidence(f)?.nights?.find((night) => night.date === f.selectedId) : null;
    const tracePoints = detail?.glucose || selectedNight?.glucose_trace || null;
    const trace = tracePoints ? envelope.labels.map((label) => {
      const point = tracePoints.find((row) => row.t.slice(11, 16) === label);
      return point?.bg ?? null;
    }) : null;
    /* Whatever window the canvas landed on — preset, drawn, or frame-derived —
       is the one the brace draws and the one a handle grabs. One grammar. */
    shownRange = win.range.slice();
    // every canvas number is re-derived for the window in view
    const stats = windowStats(envelope, win.range);
    paintReadout(null);          // a redraw ends the old hover
    chart = renderCanvas(el('chart'), window.echarts, {
      envelope, colors, stats, range: stripGlucoseRange(envelope),
      window: win.range,
      windowLabel: label, trace, onHover: paintReadout,
      supportFloor,
      displayWindow: dragDisplayWindow, displayOffset: clockPanOffset,
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
    /* THE READING COUNT IS GONE (#135 fix round, operator ruling). "window 216
       of 864 readings" priced the overview in a unit no decision on this surface is
       made in, at data weight, right beside the title — and the pooled-days
       chip below already says how much history the overview drew from. The one
       thing the overview header still has to say is when the drilled finding has
       no population in the window (ADR 62 part 9), so that stays. */
    el('canvas-scope').textContent =
      f.k === 'factor' && settled() && !f.caseFile
        ? 'No findings in the selected window' : '';
    el('canvas-pool').textContent =
      `pooled from ${envelope.days} captured CGM days · ±${envelope.pool} min`;
  }

  /* THE RAIL'S GLYPHS, INLINE. Deliberately not a `<use>` sprite: a `use` clone
     is a shadow tree, so no rule in the stylesheet can reach inside one to fill
     a face — and fill is this rail's entire vocabulary for "held". The solid
     clock knocks its hands out with `fill-rule=evenodd` rather than painting
     them a ground colour, because the ground under a rail glyph changes when
     the band comes up. */
  const RAIL_FACES = {
    full: '<path d="M6 2.6H2.6V6"/><path d="M10 2.6h3.4V6"/>'
      + '<path d="M6 13.4H2.6V10"/><path d="M10 13.4h3.4V10"/>',
    dismiss: '<path d="M2.6 6H6V2.6"/><path d="M13.4 6H10V2.6"/>'
      + '<path d="M2.6 10H6v3.4"/><path d="M13.4 10H10v3.4"/>',
    /* A STAR, NOT A PUSHPIN (ADR 215 amendment). A pushpin says "fix this in
       place", which is not what the control does — it says "keep this one to
       hand" in the complete catalog. Operator, on the pushpin: "the pin
       function is very... confusing to a user at this point."

       Drawn on the same 16 box and the same centre as the other faces: five
       points from a 6.1 outer radius and a 2.55 inner one, so at 13px it reads
       as a star rather than as a blob. */
    pin: '<path d="M8 1.9 9.72 6.02 14.1 6.36 10.76 9.24 11.79 13.6 8 11.28'
      + ' 4.21 13.6 5.24 9.24 1.9 6.36 6.28 6.02z"/>',
    'pin-on': '<path fill-rule="evenodd" d="M8 1.9 9.72 6.02 14.1 6.36 10.76 9.24'
      + ' 11.79 13.6 8 11.28 4.21 13.6 5.24 9.24 1.9 6.36 6.28 6.02z"/>',
    clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.6V8l2.4 1.6"/>',
    'clock-on': '<path fill-rule="evenodd" d="M8 1.6a6.4 6.4 0 1 0 0 12.8 6.4 6.4 0 0 0 0-12.8z'
      + 'M7.3 4.2h1.4v4.1l2.2 1.5-.8 1.2-2.8-1.9z"/>',
    /* The flag's ink is centred on the box, not its pole: drawn from the pole it
       sat .6 of a unit right of the clock it stacks under, which at 13px is half
       a pixel of visible drift between two glyphs one above the other. */
    event: '<path d="M4.2 13.6V2.6"/><path d="M4.2 3.1 11.8 5.6 4.2 8.1z"/>',
    'event-on': '<rect x="3.5" y="2.2" width="1.5" height="11.6" rx=".6"/>'
      + '<path d="M5 2.9 12.6 5.6 5 8.3z"/>',
  };

  function railFace(glyph, face) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', face);
    svg.innerHTML = RAIL_FACES[glyph];
    return svg;
  }

  /* One rail control. A toggle gets both faces and `aria-pressed`, so the fill
     can cross-fade between them; an action gets the hollow face only and can
     never fill. The name rides along in a span the stylesheet takes out of the
     picture — a screen reader still reads it, and the browser suites still
     locate these buttons by their text. */
  function railButton({ className, label, glyph, title, held }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    /* THE LABEL IS THE BUTTON'S TEXT ALTERNATIVE, never a caption. It was
       hidden only by accident — clipped by the rail's 24px column and the
       tile's own `overflow: hidden` — so the first seat that gave it room drew
       the word under the glyph in a default-styled box. It is named now, and
       hidden by one rule wherever the button lands. */
    const name = document.createElement('span');
    name.className = 'rail-label';
    name.textContent = label;
    button.append(railFace(glyph, 'face-off'), name);
    if (held !== undefined) {
      button.append(railFace(`${glyph}-on`, 'face-on'));
      button.setAttribute('aria-pressed', String(held));
    }
    button.title = title || label;
    return button;
  }

  const CHART_ACTION_FACES = {
    close: RAIL_FACES.dismiss,
    browse: RAIL_FACES.full,
  };
  const CHART_ACTIONS = {
    close: { label: 'Close' },
    browse: { label: 'All charts' },
  };

  function chartActionFace(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'face-off');
    svg.innerHTML = CHART_ACTION_FACES[name];
    return svg;
  }

  function chartActionButton(act) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.act = act;
    if (act === 'browse') button.id = 'explorer-trigger';
    button.title = CHART_ACTIONS[act].label;
    button.setAttribute('aria-label', CHART_ACTIONS[act].label);
    button.append(chartActionFace(act));
    const label = document.createElement('span');
    label.textContent = CHART_ACTIONS[act].label;
    button.append(label);
    button.onclick = (ev) => {
      ev.stopPropagation();
      if (fullscreen) {
        dismissChartFullscreen();
        return;
      }
      if (explorerOpen) {
        explorerOpen = false;
        paint();
        el('explorer-trigger')?.focus({ preventScroll: true });
        restorePhoneQueuePosition();
        return;
      }
      if (act === 'browse') {
        /* The catalog is a temporary layer over Diagnose. Preserve the real
           reading position before its repaint so Close and Escape restore the
           exact context, even when it is well below the opening viewport. */
        rememberQueuePosition();
        explorerOpen = true;
        paint();
        return;
      }
      return;
    };
    return button;
  }

  /* The header owns one visible action for the current state: All charts at
     rest, and Close while the catalog or one-chart fullscreen is open. */
  function paintChartActions(view) {
    const headActs = el('chart-headacts');
    if (!headActs) return;
    const preserveExplorerFocus = document.activeElement?.id === 'explorer-trigger';
    headActs.innerHTML = '';
    headActs.hidden = false;
    for (const act of view.acts) headActs.append(chartActionButton(act));
    if (preserveExplorerFocus) el('explorer-trigger')?.focus({ preventScroll: true });
  }

  function paintTiles() {
    const host = el('tile-field');
    const focalHost = el('tile-focal');
    const rowHost = el('tile-row');
    if (!host || !focalHost || !rowHost) return;
    disposeTiles();
    const byId = new Map(tileDescriptors.map((descriptor) => [descriptor.chartId, descriptor]));
    /* A SEAT WITHOUT A DESCRIPTOR IS NOT A TILE. Reconciliation gives a star
       whose row vanished a named empty descriptor; this last filter only keeps
       the mechanical placement seam from ever painting an unknown chart id. */
    const placed = (fullscreen
      ? [{ chartId: fullscreen.chartId, seat: 'focal',
        pinned: canvasLayout.pins.includes(fullscreen.chartId) }]
      /* AN EXPLICIT FOCUS OUTRANKS RANK-ONLY SEATING. The candidates are the
         ranked charts, so a Watching-tail chart the reader clicked could never
         reach the stage: focusChart set the layout and placeSeats dropped it.
         The focused id joins the candidate pool for seating; the catalog's
         order still comes from rank alone. */
      : placeSeats([...new Set([...currentTileCandidates(),
        ...(canvasLayout.focalId ? [canvasLayout.focalId] : [])])], canvasLayout))
      .filter(({ chartId }) => byId.has(chartId));
    /* CHART FULLSCREEN OUTRANKS THE EXPLORER: it is opened FROM it, and two big
       states cannot both hold the pane. */
    const explorer = explorerOpen && !fullscreen;
    const currentDescriptors = currentTileDescriptors();
    const rankedChartIds = new Set(seatableChartIds(findings, currentDescriptors));
    const seats = explorer
      ? rosterChartIds(findings, currentDescriptors, canvasLayout.pins)
        .filter((chartId) => byId.has(chartId))
        .map((chartId) => ({
          chartId,
          seat: 'grid',
          pinned: canvasLayout.pins.includes(chartId),
          tail: !rankedChartIds.has(chartId) && !canvasLayout.pins.includes(chartId),
        }))
      : placed.filter(({ seat }) => seat === 'focal');
    /* Every chart shares a range derived from the complete candidate set, not
       from whichever catalog cells are currently visible. */
    sharedGlucoseRange = fieldRange(placed.map(({ chartId }) => ({
      ...byId.get(chartId), data: tileCaseFile(byId.get(chartId)),
    })), DIAGNOSE_EVIDENCE_CHARTS, glucoseRange);
    host.toggleAttribute('data-fullscreen-tile', Boolean(fullscreen));
    host.toggleAttribute('data-explorer', explorer);
    /* FULLSCREEN TAKES THE GLUCOSE OVERVIEW'S ROW TOO, and names the chart it is
       showing there rather than growing a parallel header beside the one the
       reader already learned. This composition was mounted's; mounted is gone
       and fullscreen is now its only occupant, so the row carries a chart name
       and never a standing title. */
    const big = Boolean(fullscreen) || explorer;
    el('canvas-head').toggleAttribute('data-full', big);
    applyCanvasFullState(big);
    /* AND IT IS CLEARED WHEN IT IS NOT SHOWN. The row is hidden at rest, but a
       stale name left in it is what the next fullscreen paints over for a frame
       — and what a reader of the DOM sees claimed about a pane showing nothing
       of the sort. */
    el('full-title').textContent = !big ? ''
      : fullscreen ? byId.get(fullscreen.chartId).title : 'All charts';
    /* RETIRED — the mounted header's chart count.
       sanction: live-judging ruling · 2026-08-27 · "retire the mount count"
       It sat unlabelled inside the mounted header's control cluster, beside
       shrink and close, and read as a control rather than as a fact: a bare
       numeral among glyphs is a button until proven otherwise. The number it
       carried is also derivable by the only means that matters here — the
       charts are on screen and scrollable — so nothing is lost but the
       misread. `liveCount` goes with it. */
    /* The big views state their own Close action; the resting view exposes the
       direct catalog entry. */
    paintChartActions(big ? { acts: ['close'] } : { acts: ['browse'] });
    focalHost.innerHTML = '';
    rowHost.innerHTML = '';
    if (!seats.length) {
      focalHost.innerHTML = '<div class="tile-field-empty">No evidence charts in this window.</div>';
      return;
    }
    const entries = new Map(DIAGNOSE_EVIDENCE_CHARTS.map((entry) => [entry.kind, entry]));
    /* Every chart's mount, run once the whole field is in the DOM — see the
       note where they are collected. */
    const mounts = [];
    for (const seat of seats) {
      const descriptor = byId.get(seat.chartId);
      const entry = entries.get(descriptor.kind);
      const tile = document.createElement('article');
      tile.className = 'evidence-tile';
      /* A mini is an evidence article, not a button: it contains its own pin
         control. The article gets the keyboard path for its existing promotion
         action without creating nested interactive controls. */
      tile.tabIndex = seat.seat === 'mini' || seat.seat === 'grid' ? 0 : -1;
      tile.dataset.chartId = descriptor.chartId;
      /* Only an All charts cell can be the current frame; the spotlight is the stage
         itself and marking it would say the stage is one of its own frames. */
      tile.toggleAttribute('data-selected', descriptor.chartId === canvasLayout.focalId
        && (seat.seat === 'mini' || seat.seat === 'grid'));
      tile.dataset.seat = seat.seat;
      tile.dataset.state = descriptor.state;
      tile.toggleAttribute('data-pinned', seat.pinned);
      tile.toggleAttribute('data-drilled', isDrilledSpotlight(
        seat, descriptor.chartId, drilledChartId,
      ));
      /* NO `order` PROPERTY. `placeSeats` already emits candidate order and the
         tiles are appended in that order, so a second ordering here can only
         disagree with the first. Stars mark retention; they never supply a
         competing CSS order. */
      const runtime = tileRuntime.get(descriptor.chartId);
      const presentation = tileStatePresentation(
        descriptor, runtime.pending, runtime.message,
      );

      const head = document.createElement('header');
      head.className = 'tile-head';
      /* THE HEADER IS A NAMEPLATE AND THE RAIL IS THE CONTROLS. Flat in one row
         the title was priced the same as the state word and four labelled
         buttons, and on a quad tile the state word won: the title truncated to a
         single letter. The state name is gone from here entirely — the body
         still carries `tileStatePresentation()`'s loud copy for every state that
         has one, and beside a drawn chart "Evidence shown" was only ever a
         caption on the obvious. */
      const id = document.createElement('span');
      id.className = 'tile-id';
      const title = document.createElement('h3');
      /* THE STAGE CARD'S TITLE IS THE HEADLINE'S ONLY HOME (ADR 306). Every
         other seat — queue minis, the catalog grid, fullscreen's own
         header below — keeps `descriptor.title`, `nameFor`'s short name; only
         the focal seat renders the served headline verbatim. */
      const editorial = seat.seat === 'focal' && Boolean(descriptor.headline);
      if (editorial) {
        /* THE SLOT NAME IS FURNITURE, AND THE HEADLINE'S OWN FIRST SENTENCE IS
           THE TITLE (nameplate ruling, Connor Griffin · 2026-09-03: "the user
           has picked that slot … it needs to not be the star of the show …
           flip the order of the sentences to have the second sentence lead").
           The short nameplate stays at the top-left as a label, the headline's
           first sentence takes Title rank, and the remainder follows at Body
           rank. The chart's own subtitle (`tile-meta`) is not drawn here,
           because the plot's axis labels and legend already carry it.

           THE SPLIT IS PRESENTATION OVER A VERBATIM SERVED STRING (ADR 306):
           the frontend composes no sentence, reorders nothing and rewords
           nothing — it cuts the served headline at its first sentence end and
           sets the two halves at two ranks. Which half is the verdict is the
           server's business; when a headline is one sentence there is no
           subtitle at all. */
        const cut = descriptor.headline.indexOf('. ');
        const lead = cut === -1 ? descriptor.headline : descriptor.headline.slice(0, cut + 1);
        const rest = cut === -1 ? '' : descriptor.headline.slice(cut + 2).trim();
        title.textContent = lead;
        const kicker = document.createElement('span');
        kicker.className = 'tile-kicker';
        kicker.textContent = descriptor.title;
        id.append(kicker, title);
        if (rest) {
          const sub = document.createElement('span');
          sub.className = 'tile-sub';
          sub.textContent = rest;
          id.append(sub);
        }
      } else {
        title.textContent = descriptor.title;
        const meta = document.createElement('span');
        meta.className = 'tile-meta';
        meta.textContent = descriptor.meta || entry.meta(descriptor.mode);
        id.append(title, meta);
      }
      head.append(id);
      tile.append(head);

      /* A CELL CARRIES ONLY THE CATALOG'S OWN VERB (ADR 215 amendment). Four
         marks were drawn in every cell's margin, and three of them — fullscreen
         and the two alignments — are "read this properly" verbs, which is what
         the stage is for: you promote the cell and act there. On a 148px cell
         those three were a quarter of its height spent on controls, repeated
         across the row, and the plot paid for all of it. Operator, on the built
         catalog: "the filmstrip still looks like shit."

         The star stays, because it is the one verb that is about the CATALOG
         rather than about reading a chart — it says "keep this chart available"
         and there is nowhere else for it to mean that. Nothing is hidden to
         achieve this: a mini simply has one control, which is the rule the rail
         has always followed — a control is absent where it does not act. */
      /* THE EXPLORER'S CELLS ARE READ AT FULL SIZE, so they carry the stage's
         own rail: a reader who opened every chart to compare them is reading
         there, not promoting first. */
      const staged = seat.seat !== 'mini';
      const rail = document.createElement('span');
      rail.className = 'tile-rail';
      if (!fullscreen && staged) {
        const full = railButton({
          className: 'tile-fullscreen',
          label: 'Full',
          glyph: 'full',
          title: 'Maximize',
        });
        full.setAttribute('aria-label', `Show ${descriptor.title} fullscreen`);
        full.onclick = (event) => {
          event.stopPropagation();
          if (!explorerOpen) rememberQueuePosition();
          fullscreen = enterFullscreen(canvasLayout, descriptor.chartId);
          showChartInspector(descriptor);
          paint();
        };
        /* THE SPOTLIGHT'S FULLSCREEN RIDES ITS RAIL, where the glucose chart's
           does. The spotlight's nameplate IS a pane header rail now, and the
           chart above it puts the same verb at the right end of the same kind
           of band — so leaving this one in the tile's control column made two
           identical charts wear one control in two different places. Operator:
           "full screen on the spotlight chart should be in its header, same as
           the blood sugar one."

           The cell seats keep it in the rail: a cell has no header rail to put
           it on, and in the explorer the cells are the content of one surface
           rather than panes of their own. */
        if (seat.seat === 'focal') head.append(full);
        else rail.append(full);
      }

      /* A STAR RETAINS THE CHART (ADR 226), so it means one thing on every tile:
         keep this chart available if findings rank stops carrying it. There
         is no cap, so there is no refusal or disabled state. */
      const pin = railButton({
        className: 'tile-pin',
        label: seat.pinned ? 'Stop keeping' : 'Keep',
        glyph: 'pin',
        held: seat.pinned,
      });
      pin.title = seat.pinned ? 'Stop keeping this chart'
        : 'Keep this chart available';
      pin.setAttribute('aria-label', seat.pinned
        ? `Stop keeping ${descriptor.title}` : `Keep ${descriptor.title}`);
      pin.onclick = (event) => {
        event.stopPropagation();
        canvasLayout = seat.pinned
          ? unpinChart(canvasLayout, descriptor.chartId)
          : pinChart(canvasLayout, descriptor.chartId);
        if (seat.pinned) reconcileTileDescriptors();
        paintTiles();
        paintChart();
        paintBrace();
      };
      rail.append(pin);

      if (entry.modes && staged) {
        rail.append(document.createElement('hr'));
        const modes = document.createElement('span');
        modes.className = 'tile-modes';
        modes.setAttribute('role', 'group');
        modes.setAttribute('aria-label', `${descriptor.title} alignment`);
        for (const mode of entry.modes) {
          const button = railButton({
            className: `tile-mode-${mode}`,
            label: mode === 'clock' ? 'Clock' : 'Event',
            glyph: mode === 'clock' ? 'clock' : 'event',
            held: mode === descriptor.mode,
            title: mode === 'clock' ? 'Align by clock' : 'Align by event',
          });
          button.setAttribute('aria-label', `Align ${descriptor.title} by ${mode}`);
          button.onclick = (event) => {
            event.stopPropagation();
            descriptor.mode = mode;
            paintTiles();
          };
          modes.append(button);
        }
        rail.append(modes);
      }
      /* IN FULLSCREEN THE TILE'S VERBS RIDE THE HEADER, beside the way back.
         Left on the tile they were a 24px column glued down the whole height of
         the pane, filling with well ground on hover and floating a chip under
         the pointer — operator: "the full screen has this like, I don't know,
         pop-up looking ugliness to it." A chart that is the pane has no margin
         of its own to keep controls in; the pane's header is where its controls
         belong, which is the same rule that moved its name there. */
      if (fullscreen) el('chart-headacts').prepend(rail);
      else tile.append(rail);

      const body = document.createElement('div');
      body.className = 'tile-body';
      if (runtime.pending) {
        body.innerHTML = `<div class="tile-state"><strong>${presentation.name}</strong><span>${presentation.message}</span></div>`;
      } else if (descriptor.state !== 'ok') {
        const named = document.createElement('div');
        named.className = 'tile-state';
        const strong = document.createElement('strong');
        strong.textContent = presentation.name;
        const message = document.createElement('span');
        message.textContent = presentation.message;
        named.append(strong, message);
        body.append(named);
      } else {
        const chartHost = document.createElement('div');
        /* Comparison charts resolve their cohort palette from the module's scoped
           aliases. Every tile rank — mini, focal, catalog, fullscreen — shares
           this host, so the aliases re-resolve from the live theme on repaint. */
        chartHost.className = 'tile-chart ec-surface';
        body.append(chartHost);
        /* MOUNTED AFTER THE TILE IS IN THE DOM. `echarts.init`
           reads the host's box, and the host was still detached here — every
           chart on this surface was created at 0 x 0 and only ever rescued by
           the resize observer firing once the tile landed. In the catalog grid
           that rescue did not always come, and three
           charts came up as empty frames with nameplates. Deferring the mount to
           after the append makes the first measurement the real one, and leaves
           the observer doing what it is for — later resizes. */
        mounts.push(() => {
          try {
            const caseFile = tileCaseFile(descriptor);
            /* A SLOT TILE IS A MINIATURE INSTRUMENT. At slot size the full axis
               furniture cannot be read — its labels run together into a single
               smear — so every seat but the focal one draws in the registry's
               `mini` treatment: the tight grid and the small label rank. Only the
               focal chart is read at full size, and only it gets full furniture. */
            if (fullscreen && descriptor.kind === 'event-comparison') {
              const mounted = renderBehavioralFullscreen(chartHost, { caseFile });
              tileMounts.push(installTileMount(chartHost, mounted));
            } else {
              const mounted = mountDescriptorChart(chartHost, descriptor, seat.seat === 'mini', {
                catalog: seat.seat === 'grid',
              });
              /* RECORDED BEFORE IT IS DRAWN. `setOption` is the throwing call in
                 this block, and an instance created but not yet pushed is one
                 `disposeTiles` can never reach — the catch below re-renders the
                 tile over a live canvas that nothing owns. */
              tileMounts.push(installTileMount(chartHost, mounted));
              mounted.chart.setOption(mounted.option, true);
            }
          } catch (error) {
            descriptor.state = 'error';
            runtime.message = error?.message || 'Evidence chart could not be drawn.';
            tile.dataset.state = descriptor.state;
            state.textContent = tileStatePresentation(descriptor).name;
            body.innerHTML = '';
            const named = document.createElement('div');
            named.className = 'tile-state';
            const strong = document.createElement('strong');
            strong.textContent = tileStatePresentation(descriptor).name;
            const message = document.createElement('span');
            message.textContent = runtime.message;
            named.append(strong, message);
            body.append(named);
          }
        });
      }
      tile.append(body);
      const activateTile = () => {
        /* PICKING FROM THE EXPLORER IS WHAT CLOSES IT, landing the reader on
           the chart they picked. It makes open → find it → read it one gesture,
           and it is a second way out for a reader who never finds shrink.
           `showChartInspector` already seats and drills the picked chart, so
           there is no second focus call to make here.

           ALL CHARTS IS A PICKER: a cell click, Enter, Watching tail cell, or
           catalog pick seats and drills that chart, then closes the catalog.
           Clicking the spotlight is not a catalog pick — it is already seated. */
        if (explorer) explorerOpen = false;
        showChartInspector(descriptor);
        paintTiles();
        paintChart();
        paintBrace();
      };
      tile.onclick = activateTile;
      tile.onkeydown = (event) => {
        if (event.target !== tile || seat.seat !== 'grid'
          || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        activateTile();
      };
      /* ONE DIVIDER, ON THE FIRST TAIL TILE. It says the charts past it are a
         different kind of thing — reads the server did not rank — without
         needing a second container, a second painter or a heading.

         IT IS A MARK, NOT AN ELEMENT. Drawn as its own `<span>` it was a child
         of the row, and the grid sizes every child it flows to one cell's width:
         a 1px hairline was handed a full column and the catalog grew a
         blank cell between the ranked charts and the Watching reads. Operator,
         on the built surface: an empty frame with no name and no plot. The mark
         now rides the tile it introduces, in the gutter that was already
         there. */
      tile.toggleAttribute('data-tail-head', Boolean(seat.tail)
        && !rowHost.querySelector('[data-tail-head]'));
      (seat.seat === 'focal' ? focalHost : rowHost).append(tile);
    }
    for (const mount of mounts) mount();
  }

  function applyCanvasFullState(big) {
    root.toggleAttribute('data-canvas-full', big);
    root.querySelector(':scope > .instruments')?.toggleAttribute('inert', big);
    root.querySelector(':scope > .panes > .inspector')?.toggleAttribute('inert', big);
  }

  function paintCanvasChrome() {
    root.toggleAttribute('data-fullscreen', Boolean(fullscreen));
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

  /* #358 — ONE treatment for the three stage handlers below (basal slot, I:C
     block, ISF value). The order of operations is deliberate: toggle the local
     staged state, tell the app, paint, and only THEN look at what the app said.
     Frozen story S16 reads the button straight after the click, so the staged
     rendering must not wait on a round trip. `callbacks.stage` answers `false`
     only when the shell's draft save was refused by the server; an absent callback
     and one that answers anything else both count as success and undo nothing
     (ADR 358), which is what keeps the component harness's `stage: () => {}` mount
     staging. `toggle` is its own inverse, so the refusal path simply replays it.
     ONE save at a time, because the shell restores the draft as it stood when the
     save was issued: a second stage entered inside the first save's round trip
     would take that first one's optimistic draft as its restore point, so two
     refusals would hand back a draft the server had refused twice while this
     surface painted itself unstaged. Dropping the re-entrant click is what keeps
     every restore point a settled one. The optimistic paint is untouched — the
     guard is released on the answer, not on the paint. */
  let saveInFlight = false;
  async function stageAndSettle(toggle, item, isStaged) {
    if (saveInFlight) return;
    toggle();
    // PORT: reach the app's Plan draft as well as the local tally
    const answer = callbacks.stage?.(item, isStaged());
    paint();
    saveInFlight = true;
    try {
      if (await answer === false) { toggle(); paint(); }
    } finally { saveInFlight = false; }
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

  const filterActiveGroups = () => Number(selectedChips !== null);

  function toggleChip(key) {
    const next = new Set(selectedChips || CHIP_LABELS.map(([name]) => name));
    if (next.has(key)) next.delete(key); else next.add(key);
    selectedChips = next.size === CHIP_LABELS.length ? null : next;
    collapsedFindingsExpanded = false;
    /* THE FIRST PRICED ROW AND THE STAGE ARE ONE ACTIVE FINDING. Sift changes
       which of the server-ordered rows is first without changing the descriptor
       set, so the ordinary canvas reconcile quite correctly preserves the
       still-live old focal id. Ask the rail's one weight authority which visible
       row became first and seat that same id; do not re-rank the projection here. */
    const firstPriced = queueRows(findings, selectedChips)
      .find((row) => row.weight === 'priced' && !row.hidden && !row.collapsed);
    if (firstPriced && currentTileDescriptors().some(({ chartId }) => chartId === firstPriced.id)) {
      focusChart(firstPriced.id);
    }
  }

  function closeFilter({ restoreFocus = false } = {}) {
    filterOpen = false;
    paintFilter();
    if (restoreFocus) el('filter-trigger')?.focus();
  }

  /** Root-only ARIA menu. Sift composes browser-owned selection over fields the
      findings projection already published; it requests no new population. */
  function placeFilterMenu(trigger, menu) {
    delete menu.dataset.side;
    menu.style.removeProperty('--filter-menu-max-height');
    if (!window.matchMedia('(max-width: 480px)').matches || menu.hidden) return;
    const margin = 12;
    const gap = 6;
    const triggerBox = trigger.getBoundingClientRect();
    const menuHeight = menu.getBoundingClientRect().height;
    const above = Math.max(0, triggerBox.top - margin - gap);
    const below = Math.max(0, window.innerHeight - margin - triggerBox.bottom - gap);
    const side = below >= menuHeight || below >= above ? 'below' : 'above';
    menu.dataset.side = side;
    menu.style.setProperty('--filter-menu-max-height', `${Math.max(44, side === 'below' ? below : above)}px`);
  }

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
    filterFocus = Math.max(0, Math.min(filterFocus, items.length - 1));
    items.forEach((item, index) => item.tabIndex = index === filterFocus ? 0 : -1);
    placeFilterMenu(trigger, menu);
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
    if (frame.k === 'chart') return chartDescriptor(frame.chartId)?.title || 'Chart';
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
      ? queueMeta(findings, selectedChips)
      : f.k === 'history' ? `${f.row.support} meal run${f.row.support === 1 ? '' : 's'}`
      : f.k === 'chart' ? ({
        'event-comparison': 'Response comparison',
      }[chartDescriptor(f.chartId)?.kind] || 'Measured evidence')
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

  /* Selecting a roster row rebuilds the level, so the row the reader pressed is
     a new element and focus would otherwise land on the document. The case file
     has always put it back; the basal nights are the second roster to need it.
     `preventScroll` is the point of the gesture: selection is evidence, not
     navigation, so it never moves the reader's viewport. */
  function focusOccurrenceRow(id) {
    [...el('level').querySelectorAll('.case-occurrence')]
      .find((button) => button.dataset.occurrenceId === id)
      ?.focus({ preventScroll: true });
  }

  /* Selecting a night, from a click or from an arrow step. The intent is
     declared before the repaint so `paint`'s passive restore stands down, and
     applied once after it — the slot level renders its roster synchronously
     from the frame, so there is no loading paint to defer across the way the
     factor roster has. */
  function selectNight(frame, id) {
    frame.selectedId = id;
    occurrenceFocusId = id;
    paint();
    focusOccurrenceRow(id);
    occurrenceFocusId = null;
  }

  /** Exactly one level renders into #level; the previous one is discarded. */
  function paintLevel() {
    const host = el('level');
    disposeRowMinis();
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
    if (f.k === 'chart') {
      // The generic chart level now renders only the behavioral placeholder
      // (ADR 294): every settings kind routes to its own parameter panel, so
      // this is the sole `chart` frame the workstation still creates. The
      // placeholder's "withheld" claim is only true while the FINDING it
      // names is still live — checking the descriptor instead is not enough,
      // because a pinned chart's descriptor deliberately survives its row
      // (reconcileTileDescriptors retains it as empty rather than dropping
      // it), so a pin would let a vanished finding keep asserting a case
      // file is withheld for it.
      if (!chartFrameFindingIsLive(f.chartId, findings?.rows)) {
        host.insertAdjacentHTML('beforeend',
          '<div class="empty">This chart is no longer in the live findings.</div>');
        return;
      }
      const entry = chartEntry(chartDescriptor(f.chartId));
      host.insertAdjacentHTML('beforeend', `<div class="inner chart-evidence-detail">
          <div class="slot-head"><span class="time">${entry?.name || 'Behavioral chart'}</span>
          <span class="verdict">Case file withheld</span></div><p>${f.placeholder}</p></div>`);
      return;
    }
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
      const queue = renderFindingsQueue(host, findings,
        (row) => drillFinding(row, { queueOrigin: true }), {
        selected: selectedChips,
        collapsedExpanded: collapsedFindingsExpanded,
        onToggleCollapsed: () => { collapsedFindingsExpanded = !collapsedFindingsExpanded; paint(); },
      });
      mountRowMinis(queue.miniSlots);
      if (retirementNotice) {
        const notice = document.createElement('p');
        notice.className = 'history-retirement';
        notice.setAttribute('role', 'status');
        notice.textContent = retirementNotice;
        host.prepend(notice);
      }
      appendCaseError(host);
      if (phoneReadingScroller()) host.scrollTop = 0;
      else host.scrollTop = queueScrollTop;
      return;
    }
    if (f.k === 'slot') {
      renderSlotLevel(host, f.cell, staged, auditState.analysis.window_days, supportFloor, (cell) =>
        stageAndSettle(
          () => { if (staged.has(cell.i)) staged.delete(cell.i); else staged.add(cell.i); },
          { family: 'basal', key: cell.slot.__planKey },
          () => staged.has(cell.i)), {
        nightEvidence: slotNightEvidence(f), selectedId: f.selectedId,
        shownCount: f.nightShownRows,
        onSelect: (id) => selectNight(f, id),
        onMore: () => { f.nightShownRows = f.nightShownRows > EVIDENCE_CAP ? EVIDENCE_CAP : Infinity; paint(); },
        onClear: () => { f.selectedId = null; paint(); },
        onDay: (night) => callbacks.day?.({ t: night.t, text: `Basal · ${f.cell.label}` }),
      });
      return;
    }
    if (f.k === 'block') {
      renderIcBlockLevel(host, f.cell, icStaged, (cell) => stageAndSettle(
        () => { if (icStaged.has(cell.id)) icStaged.delete(cell.id); else icStaged.add(cell.id); },
        { family: 'ic', key: cell.block.__planKey },
        () => icStaged.has(cell.id)), demoNote);
      return;
    }
    if (f.k === 'isf') {
      renderIsfLevel(host, isf, isfStaged, () => stageAndSettle(
        () => { isfStaged = !isfStaged; },
        { family: 'isf', raw: isf },
        () => isfStaged));
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
    const eventComparison = caseFile.projection.alignment === 'event';
    if (eventComparison) {
      /* The attribution header's verdict accounting and the meal comparison
         describe different server-owned populations. Keep both visible, but
         do not turn this comparison into a verdict-filtered roster. */
      renderVerdictBand(host, caseFile, caseFile.family, null);
      renderEventComparisonRoster(host, caseFile, f.selectedId, selectOcc,
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
    renderCaseSelection(host, caseFile, (detail) => callbacks.day?.(detail), () => {
      const cleared = untraceDrill(f);
      Object.assign(f, cleared);
      occurrenceFocusId = null;
      requestCase(f, f.requestedAlignment, null);
    });
    appendCaseError(host);
    if (occurrenceFocusId && !f.loading && f.selectedId === occurrenceFocusId) {
      focusOccurrenceRow(occurrenceFocusId);
      occurrenceFocusId = null;
    }
  }

  // Esc and the chip's × both mean "restore the last preset" — which is an
  // explicit choice in its own right, so it outranks the frame's window too
  function clearDrawn() { drawn = null; explicitPreset = true; paint(); }

  /** A lane click is a physical scope choice, so it REPLACES the workspace —
      and so does a basal or I:C drill reaching this picker, by queue row or
      by chart (ADR 294): each carries its own span to substitute. A
      behavioral finding drill and ISF derive no span of their own and never
      call this. */
  function releaseWindow() { drawn = null; explicitPreset = false; }

  /** Position the plot-only clock brace. The basal lane carries no drag listener
   * and no window-selection paint, so it stays click-only and verdict-authored. */
  function paintBrace() {
    const brace = el('brace');
    const chartEl = el('chart');
    const laneEl = el('lane');
    let cells = [...laneEl.querySelectorAll('button:not([data-clock-copy])')];
    if (!shownRange) {
      brace.hidden = true;
      return;
    }
    // a block selection marks its segment WITHOUT a resizable brace (term 32)
    brace.hidden = braceless;
    const [from, to] = dragDisplayWindow || shownRange;
    const xa = xAtMinute(chartEl, from, clockPanOffset);
    const xb = xAtMinute(chartEl, to, clockPanOffset);
    /* PLOT_TOP/PLOT_BOTTOM track the chart module's grid[0] insets. The clock
       gates stop at the glucose x-axis, above the separate basal verdict lane. */
    const plotTop = PLOT_TOP;
    const plotBottom = chartEl.clientHeight - PLOT_BOTTOM;
    for (const [id, x] of [['brace-a', xa], ['brace-b', xb]]) {
      const edge = el(id);
      edge.style.left = `${x}px`;
      edge.style.top = `${plotTop}px`;
      edge.style.height = `${Math.max(0, plotBottom - plotTop)}px`;
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

    const allCells = panning ? [...laneEl.querySelectorAll('button')] : cells;
    allCells.forEach((button) => {
      const day = Number(button.dataset.clockCopy || 0);
      button.toggleAttribute('data-neighbour', day !== 0);
    });
  }

  /**
   * Drag to draw. Originates in the PLOT BODY only — the lane has no drag
   * listener, so it stays click-only. The existing frame-throttled chart repaint
   * carries the committed window treatment throughout the gesture; at a clock
   * boundary it also translates the repeated day beneath the held edge. The
   * circular window commits only when its primary pointer ends.
   */
  function installDrag() {
    const chartEl = el('chart');
    let mode = null; let anchor = 0; let width = 0; let grabOffset = 0;
    let moved = false; let pressMinute = 0;
    let pressX = 0; let pressY = 0; let pointerId = null; let pointerType = null;
    let committedBeforeDrag = null;
    let lastX = 0; let panMin = 0; let panMax = 0;
    let rafId = 0;
    const DISPLAY_SPAN = 95 * BIN_MINUTES;
    const PAN_EDGE = 26;
    const PAN_PX_PER_FRAME = 13;

    /* LIVE SHADING. Two moving edges with nothing between them gave no read on
       the window being created. Rather than invent a rubber-band style, the
       COMMITTED treatment tracks the gesture: paintChart re-resolves the window
       and re-renders, so the region carries the same outside-the-gates scrim
       (slice 4) and the same label it will have on pointer completion — they are the same
       code path, so they cannot diverge.

       A DOM overlay was the other candidate and is rejected: the chart's own
       markArea would still be shading the OLD window underneath, so the plot
       would show two tinted regions for the length of the drag.

       Throttled to one repaint per frame; the inspector is deliberately NOT
       repainted here (only paintChart), so the drag costs one canvas redraw and
       no DOM rebuild. */
    const localX = (ev) => ev.clientX - chartEl.getBoundingClientRect().left;
    const inPlotY = (ev) => {
      const y = ev.clientY - chartEl.getBoundingClientRect().top;
      return y >= PLOT_TOP && y <= chartEl.clientHeight - PLOT_BOTTOM;
    };
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
      /* A pin holds chart identity, not stale evidence. The drag coordinator
         keeps one request live and one latest position queued behind it. */
      ensurePinnedDragPreparation();
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
      if (!mode || ev.pointerId !== pointerId) return;
      if (!moved && ev.clientX === pressX && ev.clientY === pressY) return;
      /* `touch-action: pan-y` reserves a vertical touch for its scrollable
         ancestor. Do not let its first sampled move alter the window before
         Chromium takes that gesture over. */
      if (!moved && pointerType === 'touch'
        && Math.abs(ev.clientY - pressY) > Math.abs(ev.clientX - pressX)) {
        finish(ev);
        return;
      }
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

    function finish(ev) {
      if (!mode || ev.pointerId !== pointerId) return;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      const dragged = moved;
      const cancelled = ev.type !== 'pointerup';
      const wholeDay = dragged && mode !== 'slide' && dragDisplayWindow
        && commitWindow(dragDisplayWindow) === null;
      mode = null;
      const captured = pointerId;
      pointerId = null;
      pointerType = null;
      if (ev.type !== 'lostpointercapture' && chartEl.hasPointerCapture(captured)) {
        chartEl.releasePointerCapture(captured);
      }
      // a press that never moved changed nothing, so there is nothing to commit
      // and nothing to undo — leave the panel exactly as the press found it
      if (!dragged) { committedBeforeDrag = null; return; }
      if (cancelled) {
        drawn = committedBeforeDrag.drawn;
        presetKey = committedBeforeDrag.presetKey;
        explicitPreset = committedBeforeDrag.explicitPreset;
      } else if (wholeDay) {
        drawn = null;
        presetKey = 'all';
        explicitPreset = true;
      }
      committedBeforeDrag = null;
      dragDisplayWindow = null;
      clockPanOffset = 0;
      delete chartEl.parentElement.dataset.clockPan;
      paintLive(null);
      paint();   // commit: the window now renders in the full brace treatment
    }
    /* Is this press inside the shown window's interior? Hit-tested rather than
       overlaid: an interior <div> would swallow the chart's own hover tooltip
       inside the very window being studied. */
    const EDGE_GRAB = 5;   // px either side of a gate edge

    /* The gate edge is drawn the full height of the plot, so the WHOLE length
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
       branches ran takeHold() on press and never set `moved`, so clicking
       (not dragging) a preset's edge silently turned it into a drawn window,
       unpressed the preset and left a chip behind. */
    function begin(kind, ev) {
      if (pointerId !== null || !ev.isPrimary || ev.button !== 0) return;
      const x = ev.clientX - chartEl.getBoundingClientRect().left;
      if (kind === 'draw') {
        const box = plotBox(chartEl);
        if (x < box.left || x > box.right) return;   // margins are not the plot
        if (!inPlotY(ev)) return;                    // the x-axis is the clock gate floor
        const edge = edgeAt(x);
        if (edge) return begin(edge, ev);            // an edge outranks draw-new
        if (overInterior(x)) return begin('slide', ev);
      }
      if (ev.pointerType === 'mouse') ev.preventDefault();
      mode = kind;
      moved = false;
      pointerId = ev.pointerId;
      pointerType = ev.pointerType;
      pressX = ev.clientX;
      pressY = ev.clientY;
      committedBeforeDrag = {
        drawn: drawn ? drawn.slice() : null,
        presetKey,
        explicitPreset,
      };
      lastX = localX(ev);
      pressMinute = minuteAt(lastX);
      chartEl.setPointerCapture(pointerId);
    }

    chartEl.addEventListener('pointerdown', (ev) => begin('draw', ev), { signal });
    chartEl.addEventListener('pointermove', move, { signal });
    chartEl.addEventListener('pointerup', finish, { signal });
    chartEl.addEventListener('pointercancel', finish, { signal });
    chartEl.addEventListener('lostpointercapture', finish, { signal });
    // the only hover feedback: the cursor says which gesture this press will be
    chartEl.addEventListener('pointermove', (ev) => {
      if (mode || ev.pointerType !== 'mouse') return;
      if (!inPlotY(ev)) { chartEl.style.cursor = 'crosshair'; return; }
      const x = ev.clientX - chartEl.getBoundingClientRect().left;
      chartEl.style.cursor = edgeAt(x) ? 'col-resize'
        : overInterior(x) ? 'grab' : 'crosshair';
    }, { signal });
    el('grip-a').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); begin('a', ev); }, { signal });
    el('grip-b').addEventListener('pointerdown', (ev) => { ev.stopPropagation(); begin('b', ev); }, { signal });
    // Esc restores the last preset
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && drawn) { ev.preventDefault(); clearDrawn(); }
    }, { signal });   // PORT: abortable
    window.addEventListener('resize', paintBrace, { signal });   // PORT: abortable
  }

  function paint() {
    /* The queue measures mini hosts while it paints. Clear a dismissed
       full-canvas state before that measurement or its inert/hidden inspector
       has zero width and every useful preview is removed for the return. */
    applyCanvasFullState(Boolean(fullscreen) || (explorerOpen && !fullscreen));
    paintCanvasChrome();
    ensurePreparation();
    reconcileTileDescriptors();
    paintFilter();
    paintCrumb();
    /* PRECEDENCE, enforced here rather than left to run order. An explicit focus
       intent — `occurrenceFocusId`, set by navigation before it paints — wins
       unconditionally: while one is pending, the passive restore below stands
       down and captures nothing, so it can never move focus off the row
       navigation just asked for. That is a standing rule, not a timing
       accident. The two rosters apply their intent in different places and both
       are protected by it: the factor roster's restore runs inside `paintLevel`
       and may defer itself across a loading paint (ADR 101), and the night
       roster's runs as `selectNight` returns.
       The passive restore is only for a repaint nobody asked for — a settling
       tile, a background findings refresh — where `paintLevel` emptying #level
       would otherwise strand the reader on a row it just destroyed.
       `applyPendingFocus` arbitrates none of this: it only ever focuses #level
       itself or a `.qrow`, never a `.case-occurrence`. */
    const heldRow = occurrenceFocusId ? null
      : document.activeElement?.closest?.('#level .case-occurrence')?.dataset.occurrenceId;
    paintLevel();
    if (heldRow) focusOccurrenceRow(heldRow);
    renderLane(lane, top().k === 'slot' ? top().cell : null, staged, pickCell);
    renderLaneKey(lane);
    paintWatch();
    paintTiles();
    paintChart();
    paintBrace();
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
      popTo(stack.length - 2);
      return;
    }
    if (!['factor', 'slot'].includes(f.k) || !f.selectedId
      || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
    if (ev.target instanceof Element && ev.target.closest('#ec-chart')) return;
    if (f.k === 'slot') {
      const evidence = slotNightEvidence(f);
      const selected = evidence?.nights?.find((night) => night.date === f.selectedId);
      const siblings = selected
        ? evidence.nights.filter((night) => nightGroup(night) === nightGroup(selected)) : [];
      const at = siblings.findIndex((night) => night.date === f.selectedId);
      const next = at + (ev.key === 'ArrowDown' ? 1 : -1);
      if (at < 0 || next < 0 || next >= siblings.length) return;
      ev.preventDefault();
      /* The repaint destroys the row the key press was standing on, so the
         stepped row is focused explicitly — the same restoration the factor
         roster makes through `occurrenceFocusId` (ADR 101). Without it a screen
         reader lands on the document and Tab restarts at the top of the page. */
      selectNight(f, siblings[next].date);
      return;
    }
    const eventComparison = f.caseFile.projection.alignment === 'event';
    const siblings = eventComparison
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
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && fullscreen) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      dismissChartFullscreen();
      return;
    }
    if (ev.key === 'Escape' && explorerOpen) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      explorerOpen = false;
      paint();
      el('explorer-trigger')?.focus({ preventScroll: true });
      restorePhoneQueuePosition();
      return;
    }
  }, { capture: true, signal });
  document.addEventListener('pointerdown', (ev) => {
    if (filterOpen && !el('filter-wrap')?.contains(ev.target)) closeFilter();
  }, { signal });
  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || !filterOpen) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    closeFilter({ restoreFocus: true });
  }, { capture: true, signal });
  /* PINS DO NOT SURVIVE THE SESSION. Leaving Diagnose drops the pins and the
     focus, and nothing about them is persisted. The surface is told it
     is being left through the app's own navigation seam rather than inferring
     it from geometry: a poll that watched the root for visibility missed a
     fast leave-and-return entirely, and the reader came back to a canvas
     holding the previous visit's pins. */
  const initialFrame = top();
  if (initialFrame.k === 'factor') requestCase(initialFrame, 'clock');
  else paint();
  // the brace can only be placed once the chart has its first measured width
  requestAnimationFrame(paintBrace);
  /* The mock reaches Day through a dead button; the app has a real Day surface,
     so the occurrence level's link calls back into it. */
  root.__dwOpenDay = (occ) => callbacks.day?.(occ);
  /* `destroy` tears down the boot instance; `repaint` is the narrow in-place
     operation the app seam can reach in with. It redraws the current level and
     charts off the SAME frame stack, drawn window, layout and staged sets, so a
     resolved Day trace or theme repaint preserves the reader's workspace. It
     does NOT re-run boot() or reassign the root MARKUP (#666, #230). */
  function leaveSurface() {
    canvasLayout = createCanvasLayout();
    fullscreen = null;
    drilledChartId = null;
    seatingPolicyKey = null;
    stack.splice(0, stack.length, { k: 'factors' });
    reconcileTileDescriptors();
    paintTiles();
  }

  return { destroy() { chart = null; disposeTiles(); }, repaint: paint, leaveSurface };
}

/* ---------------------------------------------------------------------------
   The app seam. Everything above this line is the mock's; everything below is
   the mounting and state addressability Phase 3 owes.
--------------------------------------------------------------------------- */

/**
 * Mount the ported workstation into `root`.
 *
 * Interface: `setData` re-renders from a fresh API payload, `refresh` repaints
 * the mounted workspace in place (the theme watcher uses it, because the ported
 * chartColors() samples the live stylesheet), `setError` replaces the surface
 * with a message. The behaviour behind it is the locked mock's, unedited.
 */
export function createDiagnoseWorkstation({ root, callbacks = {} }) {
  let payload = null;
  let captures = null;
  let teardown = null;
  let repaint = null;
  let leaveSurface = null;
  let aborter = null;

  /* PORT DEVIATION (#654): shared by the public `setError` below and the
     payload guard just past it. Not mock code — the mock never receives a
     malformed capture, since it is driven by static files, not an HTTP
     response crossing a process boundary. */
  function showError(message) {
    if (aborter) { aborter.abort(); aborter = null; }
    teardown = null;
    repaint = null;
    leaveSurface = null;
    root.className = 'dw dw-error';
    root.textContent = message;
  }

  function render() {
    if (teardown) { teardown(); teardown = null; }
    repaint = null;
    leaveSurface = null;
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
    aborter = new AbortController();
    const booted = boot(root, captures, callbacks, aborter.signal);
    teardown = booted.destroy;
    repaint = booted.repaint;
    leaveSurface = booted.leaveSurface;
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
    refresh() { repaint?.(); },
    /* A day's real trace resolved: repaint in place off the live boot instance,
       preserving navigation state. No-op if the surface is unmounted or in its
       error state (#666). */
    repaintDay() { repaint?.(); },
    /* The reader navigated away from Diagnose. Pins and focus are session
       state, so they are dropped here rather than on a timer. */
    leaveSurface() { leaveSurface?.(); },
    gotoState,
  };
}
