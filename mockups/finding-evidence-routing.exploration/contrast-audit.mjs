/* THE STANDING FLOOR GUARD for this exploration — contrast and internal scroll,
 * at BOTH locked sizes.
 *
 * WHY IT EXISTS. The round-10 lock audit found the same defect three rounds
 * running: a value was tuned against a measurement in ONE theme, the fix was
 * scoped to that theme's half of the cascade, and the other half was never
 * measured — and in each case the unmeasured half ended up the worse of the
 * two. It also found five separate marks and inks that had each been "stepped
 * back" for quiet in some recent round and each landed under a WCAG minimum. A
 * one-time repair does not hold against that; a floor that runs on every build
 * does. ADR 304 retired the light theme, which removes the unmeasured half
 * rather than the guard: every pair below is still measured on the one shipped
 * surface, at both sizes, in every state.
 *
 * WHAT IT ASSERTS.
 *   TEXT   4.5:1 — DESIGN.md line 188 states 4.5:1 as this system's own bar,
 *          and nothing on this surface qualifies as large text.
 *   MARKS  3.0:1 — WCAG 1.4.11, for non-text marks and control boundaries: the
 *          verdict band (which IS the split figure and is also a control), the
 *          legend swatches, the occurrence dot token, the basal strip's cell
 *          boundaries, and the near-rule cohort ink at its shipped alpha.
 *   TARGET 24x24 — WCAG 2.2 AA 2.5.8, on every control class this surface owns
 *          except the 48 basal cells, which the operator ruled stay as they are
 *          and which the manifest states as a constraint rather than a defect.
 *   SCROLL 0px of internal overflow on `#level`, at 1280x800 and 1440x900, in
 *          EVERY state the surface can stand in — which is manifest term 9's
 *          own claim, and which this guard did not used to check. It visited
 *          five hand-listed states, none of them an expanded case file, and
 *          reported green over a 7px and a 12px overflow. The state list is
 *          DERIVED from the fixture now rather than remembered; see THE STATES
 *          below for what that covers and why a list cannot be trusted here.
 *
 * Every ratio is composited the way a reader sees it: a translucent ink or fill
 * is resolved against the actual painted stack beneath it, walked up the tree
 * until an opaque layer is found, rather than against the token it was mixed
 * from. That is the difference between measuring the declaration and measuring
 * the pixel, and it is where a `color-mix(… , transparent)` hides.
 *
 * THE COCKPIT CHROME IS DELIBERATELY NOT LISTED. `.cockpit-log-carbs .plus`,
 * `.cockpit-flow-separator` and `.cockpit-step-number` each fail their floor,
 * and all three are the SHIPPED app's own topbar and footer, lifted into this
 * page by harness.mjs. They are a production issue, reported as one; asserting
 * them here would make this mock's gate fail on the app's authorship.
 *
 * FAILS CLOSED, like every browser leg in this repo: a missing Playwright,
 * vendored asset or built data.json exits nonzero naming what is absent, and a
 * pair whose element never appears in any state is a failure, not a skip — a
 * guard that silently measures nothing is the exact thing it is guarding
 * against.
 *
 * Run:
 *   PLAYWRIGHT_MODULE=$PW/node_modules/playwright VENDOR_DIR=$VENDOR \
 *   node mockups/finding-evidence-routing.exploration/contrast-audit.mjs
 * Add `AUDIT_REPORT=1` to print every measured pair rather than only failures.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/* The SHIPPED painter's own cap and its own tier predicate, so the question
   "does this roster have an expander to press?" is asked exactly the way the
   table asks it. Importing the extraction rather than re-deriving the rule is
   the same discipline surface.js follows: no fork of the production table, not
   even a one-line one inside a guard. */
import { EVIDENCE_CAP, tierOf } from './evidence-table.extracted.js';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' };
const MOCK_URL = 'http://mock.local/mockups/finding-evidence-routing.exploration/index.html';
const SHOTS = process.env.SHOT_DIR || join(HERE, 'screenshots');
const SIZES = [{ width: 1280, height: 800 }, { width: 1440, height: 900 }];
const TEXT_FLOOR = 4.5;
const MARK_FLOOR = 3.0;

const missing = [];
let chromium = null;
if (!process.env.PLAYWRIGHT_MODULE) missing.push('PLAYWRIGHT_MODULE is unset');
else {
  try { chromium = require(process.env.PLAYWRIGHT_MODULE).chromium; }
  catch (e) { missing.push(`PLAYWRIGHT_MODULE could not be required (${e.message})`); }
}
if (chromium && !process.env.PLAYWRIGHT_EXECUTABLE_PATH && !existsSync(chromium.executablePath())) {
  missing.push(`Chromium is missing (${chromium.executablePath()})`);
}
const VENDOR = process.env.VENDOR_DIR;
if (!VENDOR) missing.push('VENDOR_DIR is unset (vendored echarts.min.js)');
else if (!existsSync(join(VENDOR, 'echarts.min.js'))) missing.push('VENDOR_DIR is missing echarts.min.js');
if (!existsSync(join(HERE, 'data.json'))) missing.push('data.json is absent — run build.mjs first');
if (missing.length) {
  process.stderr.write(`contrast-audit.mjs cannot run — missing prerequisites:\n  - ${missing.join('\n  - ')}\n`);
  process.exit(1);
}

/* ===========================================================================
   THE STATES.

   THE OVERFLOW LEG VISITS EVERY ONE OF THEM. The contrast and target legs visit
   the five their pairs are written against, and that asymmetry is deliberate: a
   colour pair is tuned in one state and reads the same in the rest, while term 9
   — "the inspector column does not scroll internally in ANY state, at either
   locked size" — is a claim about all of them at once.

   WHY THE LIST IS DERIVED AND NOT WRITTEN OUT. Until this round it was five
   hand-listed states, and none of them was an EXPANDED case file. The guard
   therefore reported green over a real violation of the term it exists to hold:
   7px in the finding case file and 12px in the population case file, at
   1280x800. A guard whose green means "the states I happened to
   list" is the exact failure it is supposed to prevent, and the fix is not a
   longer list — a longer list goes stale against the next fixture. The list
   below is the PRODUCT of the surface's own controls, read off the fixture:

     level        the queue root, the finding case file, the population case
                  file. `__ferGo`, the call a row click makes, and the call that
                  resets frame, roster, expansion and selection to their rest.
     frame        every factor the population case file can be framed at, read
                  off `data.scenes[...].frames`. `__ferFrame`.
     verdict      every band position each frame can be drilled to, read off
                  that frame's own occurrence groups. `__ferVerdict`.
     projection   `By clock` and `By event`, at every drilled level.
     the table    collapsed AND expanded, wherever the shipped painter emits an
                  expander at all — decided by the shipped `tierOf` against the
                  shipped `EVIDENCE_CAP`, because only tiered occurrences are
                  capped and the counter rows below them are always drawn whole.
     selection    no row, and a row. Selecting one appends the `Open ... in Day >`
                  route BELOW the table, so EXPANDED + SELECTED is the tallest
                  the column can ever be — and it is the combination both halves
                  of the five-state list missed.
     the dropdown open over the population case file, where it overlays.

   Nothing is excluded and nothing is sampled. What that costs is stated in the
   run line: the read count is the coverage, and a round that shrinks it has
   narrowed the term.
   =========================================================================== */
const FINDING = 'finding:over_treated_low';
const POPULATION = 'population:lows';

/* One entering call for every state, driven through the surface's own routing —
   the same calls a click makes — so nothing is measured in a state a reader
   could not walk to. THE ORDER IS LOAD-BEARING: `__ferGo` and `__ferFrame` both
   reset the roster, the expansion and the selection, so a descriptor applied out
   of this order measures a state other than the one it names. The two clicks are
   deliberately not optional-chained — a descriptor that says "expanded" where no
   expander exists must throw and be reported, not quietly measure the rest
   state under an expanded name. */
const ENTER = (s) => {
  window.__ferGo(s.level);
  if (s.frame) window.__ferFrame(s.frame);
  if (s.verdict) window.__ferVerdict(s.verdict);
  if (s.level) window.__ferProject(s.projection);
  if (s.dropdown) window.__ferFactorOpen(true);
  if (s.expanded) document.querySelector('#level .more').click();
  if (s.selected) document.querySelector('#level .ev-row').click();
};

const DATA = JSON.parse(await readFile(join(HERE, 'data.json'), 'utf8'));

/* The four ways one roster can be standing, times the two projections. The two
   expanded ones exist only where the shipped painter draws an expander. */
const rosterStates = (label, base, group) => {
  const out = [];
  for (const projection of ['clock', 'event']) {
    const stands = [{}, { selected: true }];
    if (group.occurrences.filter(tierOf).length > EVIDENCE_CAP) {
      stands.push({ expanded: true }, { expanded: true, selected: true });
    }
    for (const stand of stands) {
      out.push({
        id: `${label} · ${group.key} · ${projection}`
          + `${stand.expanded ? ' · expanded' : ''}${stand.selected ? ' · selected' : ''}`,
        ...base, projection, ...stand,
      });
    }
  }
  return out;
};

const population = DATA.scenes[POPULATION];
const STATES = [
  { id: 'queue', level: null },
  /* The finding case file carries no verdict band — one group, no segments — so
     its roster is whatever `go` rested it on. */
  ...DATA.scenes[FINDING].occurrences.groups
    .flatMap((g) => rosterStates('finding', { level: FINDING }, g)),
  ...Object.entries(population.frames).flatMap(([frame, f]) => f.occurrences.groups
    .flatMap((g) => rosterStates(`population · ${frame}`, { level: POPULATION, frame, verdict: g.key }, g))),
  /* The dropdown overlays rather than pushing, which is term 16 — so it is a
     state of the column even though it is meant to change nothing about it. */
  { id: 'dropdown', level: POPULATION, projection: 'clock', dropdown: true },
  { id: 'dropdown · event', level: POPULATION, projection: 'event', dropdown: true },
];

/* THE FIVE IDS THE PAIRS ARE WRITTEN AGAINST, mapped onto the derived states
   they name so a colour keeps being measured where it was tuned. The rename is
   asserted rather than assumed: if the fixture ever stops producing one of these
   states the guard dies here, at the naming, instead of silently dropping every
   pair that lives in it. (The "never resolved" sweep at the foot of `main` is
   the second net under the same hole.) */
const PAIR_STATE_IDS = {
  'finding · fired · clock': 'finding',
  'finding · fired · event': 'lens',
  'population · over_treated_low · fired · clock': 'population',
};
for (const [derived, pairId] of Object.entries(PAIR_STATE_IDS)) {
  const hit = STATES.filter((s) => s.id === derived);
  if (hit.length !== 1) {
    process.stderr.write(`contrast-audit.mjs cannot run — the pair state "${pairId}" maps to `
      + `"${derived}", which the fixture produced ${hit.length} times (expected exactly 1)\n`);
    process.exit(1);
  }
  hit[0].id = pairId;
}

/* EVERY PAIR THIS ROUND FIXED, plus the ones it had to leave alone, each named
   with the audit finding it comes from. `kind` decides the floor and how the
   ratio is composited:
     text   the element's own `color`, over the painted stack beneath it
     mark   the element's own `background-color`, over the stack beneath IT
     border the element's own `border-top-color`, over the stack beneath it —
            for a mark whose FILL is deliberately soft and whose boundary is what
            has to carry 1.4.11
     token  a custom property read off a host element, optionally at the alpha
            the chart draws it with, over a named ground element — the only form
            that can measure ink handed to a `<canvas>`, which no DOM read sees.
   `min` / `max` override the floor where the pair is a RELATIONSHIP rather than
   a legibility minimum — see the basal strip.
*/
const PAIRS = [
  /* ---- F7 root A: the accent, as text ---- */
  { id: 'F7 .fer-open route', kind: 'text', state: 'population', selector: '.fer-open' },
  { id: 'F7 .fer-coincide .linkbtn', kind: 'text', state: 'finding', selector: '.fer-coincide .linkbtn' },
  { id: 'F7 .more expander', kind: 'text', state: 'finding', selector: '.level .more' },
  { id: 'F7 .qrow .go chevron', kind: 'text', state: 'queue', selector: '.qrow .go' },
  { id: 'F7 .fer-sel-opt .tick', kind: 'text', state: 'dropdown', selector: '.fer-sel-opt .tick' },
  /* ---- F7 root B: the dim-meta greys ---- */
  { id: 'F7 .fer-dock-line', kind: 'text', state: 'queue', selector: '.fer-dock-line' },
  { id: 'F7 .fer-residue', kind: 'text', state: 'population', selector: '.fer-residue' },
  { id: 'F7 .fer-band .cap .meta', kind: 'text', state: 'population', selector: '.fer-band .cap .meta' },
  { id: 'F7 .fer-count crumb count', kind: 'text', state: 'population', selector: '.fer-count' },
  { id: 'F7 .fer-sel .ct factor count', kind: 'text', state: 'population', selector: '.fer-sel .ct' },
  { id: 'F7 crumb root button', kind: 'text', state: 'population', selector: '.crumb .trail button' },
  /* ---- F7 root C: glyphs and shipped-table cells ---- */
  { id: 'F7 .crumb .chev', kind: 'text', state: 'population', selector: '.crumb .trail .chev' },
  { id: 'F7 .ev-row .arrow', kind: 'text', state: 'finding', selector: '.ev-row .arrow' },
  { id: 'F7 .ev-row .when', kind: 'text', state: 'finding', selector: '.ev-row .when' },
  { id: 'F7 .ev-row .entry', kind: 'text', state: 'finding', selector: '.ev-row .entry' },
  { id: 'F7 .ev-row .delta', kind: 'text', state: 'finding', selector: '.ev-row .delta' },
  { id: 'F7 .qrow .tag habit', kind: 'text', state: 'queue', selector: '.qrow .tag' },
  { id: 'F7 .fer-tier eyebrow', kind: 'text', state: 'queue', selector: '.fer-tier:not([data-tier="noted"])' },
  { id: 'F7 .fer-tier noted', kind: 'text', state: 'queue', selector: '.fer-tier[data-tier="noted"]' },
  { id: 'F7 .fer-sel .chev', kind: 'text', state: 'population', selector: '.fer-sel .chev' },
  { id: 'F7 .fer-sel-opt .ct', kind: 'text', state: 'dropdown', selector: '.fer-sel-opt .ct' },
  { id: 'F7 .ec-key-item small', kind: 'text', state: 'lens', selector: '.ec-key-item small' },
  { id: 'F7 .fer-head-key legend text', kind: 'text', state: 'population', selector: '.fer-head-key .k' },
  { id: 'F7 .lvl-cap section spine', kind: 'text', state: 'finding', selector: '.lvl-cap' },

  /* ---- F2: the verdict band's inactive segments ---- */
  { id: 'F2 band inactive segment', kind: 'mark', state: 'population', selector: '.fer-band .seg[aria-pressed="false"]' },
  { id: 'F2 band active segment', kind: 'mark', state: 'population', selector: '.fer-band .seg[aria-pressed="true"]' },

  /* ---- F3: the canvas-head legend swatches ----
     MEASURED AT THE BOUNDARY, not at the fill, and that is the finding rather
     than a softened test. The percentile swatches inherit the PLOT's own fill
     alphas, and on the head rail even a solid `--primary` reached only 3.61:1 in
     the since-retired light theme — so no alpha carries a percentile swatch to
     3:1, and forcing one would have meant a legend that lies about how soft the
     band it names is. A
     legend mark is not the plot: its 1px stroke is what identifies it, and that
     is what is asserted. */
  { id: 'F3 legend swatch 10-90th', kind: 'border', state: 'population', selector: '.fer-head-key .k[data-series="10–90th"] i' },
  { id: 'F3 legend swatch 25-75th', kind: 'border', state: 'population', selector: '.fer-head-key .k[data-series="25–75th"] i' },
  { id: 'F3 legend swatch Meal boluses', kind: 'border', state: 'population', selector: '.fer-head-key .k[data-series="Meal boluses"] i' },
  { id: 'F3 legend swatch Occurrences', kind: 'border', state: 'population', selector: '.fer-head-key .k[data-series="Occurrences"] i' },
  { id: 'F3 legend swatch Median', kind: 'border', state: 'population', selector: '.fer-head-key .k[data-series="Median"] i' },

  /* ---- F4: the occurrence dot, which is painted to a canvas ---- */
  { id: 'F4 --fer-dot on the pane ground', kind: 'token', state: 'population',
    token: '--fer-dot', host: '.fer-surface', ground: '.dw-canvas > .body' },

  /* ---- F5: the basal strip, cell against strip and strip against pane ---- */
  { id: 'F5 .lane button vs the strip', kind: 'mark', state: 'queue', selector: '.lane button', ground: '.lane' },
  /* The strip against the pane is a RELATIONSHIP, not a legibility minimum: the
     strip is a recessive track under the axis and 1.4.11 has nothing to say
     about it. What round 9 left behind was one declaration reading as two
     opposite things — 14.51:1 in the since-retired light theme, a black slab on
     bone, and 1.03:1 in dark, invisible against the desk. So the assertion is a
     BAND: present, competing with nothing, which is the term the design actually
     holds. The band survives ADR 304 unchanged — it was never a light bound. */
  { id: 'F5 .lane strip vs the pane', kind: 'mark', state: 'queue', selector: '.lane', ground: '.lane-wrap',
    min: 1.05, max: 2.0 },

  /* ---- F6: the near-rule cohort ink, at the alpha `limited` support draws it ---- */
  { id: 'F6 --ec-near at limited alpha', kind: 'token', state: 'lens',
    token: '--ec-near', alpha: 0.58, host: '.fer-surface', ground: '.ec-chart' },
];

/* F8 — EVERY CONTROL CLASS ON THIS SURFACE THAT HAS TO CLEAR 24x24 (WCAG 2.2 AA
   2.5.8). Seven of these were under it, the worst a 10px band segment. Where the
   painted control had to stay byte-identical to a shipped sibling the target was
   grown with a `::before` overlay instead of padding, so the measurement below
   takes the LARGER of the element's own box and its overlay's — measuring the
   element alone would report the fix as absent, and measuring the overlay alone
   would miss a control that never got one.

   `#lane button` — the 48 basal cells — is DELIBERATELY ABSENT. They are 14.6px
   wide at 1280 and 17.9px at 1440, and 48 of them cannot reach 24px across a
   430px column at either size. The operator ruled they stay as they are; the
   manifest states that as a known constraint at these sizes, with the strip's
   roving-tabindex group as the keyboard equivalent. Listing them here would turn
   a stated constraint into a permanently red gate. */
const TARGETS = [
  { id: 'F8 .fer-band .seg', state: 'population', selector: '.fer-band .seg' },
  { id: 'F8 .fer-band .key', state: 'population', selector: '.fer-band .key' },
  { id: 'F8 toolbar .seg button', state: 'queue', selector: '.instruments .seg button' },
  { id: 'F8 .fer-open route', state: 'population', selector: '.fer-open' },
  { id: 'F8 .fer-coincide .linkbtn', state: 'finding', selector: '.fer-coincide .linkbtn' },
  { id: 'F8 crumb root button', state: 'population', selector: '.crumb .trail button' },
  { id: 'F8 .more expander', state: 'finding', selector: '.level .more' },
  { id: 'F8 .fer-sel rest line', state: 'population', selector: '.fer-sel' },
  { id: 'F8 .fer-sel-opt', state: 'dropdown', selector: '.fer-sel-opt' },
  { id: 'F8 .ev-row', state: 'finding', selector: '.ev-row' },
];
const TARGET_MIN = 24;

/* The smallest box in each class, overlay included. Reported as the worst case
   rather than the first, because one short row in a list of ten is the failure. */
const TARGET_SIZES = (targets) => {
  const out = {};
  for (const t of targets) {
    const nodes = [...document.querySelectorAll(t.selector)];
    if (!nodes.length) continue;
    let worst = null;
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      const before = getComputedStyle(node, '::before');
      const overlayH = before.content === 'none' ? 0 : parseFloat(before.height) || 0;
      const overlayW = before.content === 'none' ? 0 : parseFloat(before.width) || 0;
      const box = {
        w: Math.round(Math.max(rect.width, overlayW) * 10) / 10,
        h: Math.round(Math.max(rect.height, overlayH) * 10) / 10,
      };
      if (!worst || Math.min(box.w, box.h) < Math.min(worst.w, worst.h)) worst = box;
    }
    if (worst) out[t.id] = worst;
  }
  return out;
};

/* The in-page measurement. Everything below runs in the page, because a
   composited colour cannot be computed from source: it is a function of what is
   actually painted underneath, which only the live tree knows. */
const MEASURE = (pairs) => {
  /* Chrome computes a `color-mix()` to `color(srgb r g b / a)` in 0-1 FLOATS,
     not to `rgba()` in 0-255 integers. Reading both forms with one number grab
     is how the first cut of this guard reported the dock line at 1.33:1 in dark
     with an ink DARKER than its ground: three fractions were being treated as
     channel bytes, so every mixed colour measured as near-black and the guard
     was failing on its own arithmetic rather than on the surface. */
  const parse = (s) => {
    const text = String(s);
    const n = text.match(/[\d.]+/g);
    if (!n) return null;
    const scale = text.startsWith('color(') ? 255 : 1;
    return [Number(n[0]) * scale, Number(n[1]) * scale, Number(n[2]) * scale,
      n[3] === undefined ? 1 : Number(n[3])];
  };
  const over = (fg, bg) => {
    const a = fg[3];
    return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)).concat(1);
  };
  /* The painted stack beneath a node: every background up the tree until one is
     opaque, composited bottom-up. White is the floor only if nothing opaque was
     found, which on this surface never happens — `body` carries a ground. */
  const stack = (node, includeSelf) => {
    const layers = [];
    let n = includeSelf ? node : node.parentElement;
    while (n) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] === 1) break; }
      n = n.parentElement;
    }
    let base = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base);
    return base;
  };
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

  const out = {};
  for (const pair of pairs) {
    if (pair.kind === 'token') {
      const host = document.querySelector(pair.host);
      const groundNode = document.querySelector(pair.ground);
      if (!host || !groundNode) continue;
      const raw = getComputedStyle(host).getPropertyValue(pair.token).trim();
      const ink = parse(raw.startsWith('#')
        ? `rgb(${[1, 3, 5].map((i) => parseInt(raw.slice(i, i + 2), 16)).join(',')})`
        : raw);
      if (!ink) continue;
      if (pair.alpha !== undefined) ink[3] = pair.alpha;
      const ground = stack(groundNode, true);
      out[pair.id] = { ratio: ratio(over(ink, ground), ground), ink: hex(over(ink, ground)), ground: hex(ground) };
      continue;
    }
    const node = document.querySelector(pair.selector);
    if (!node) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const groundNode = pair.ground ? document.querySelector(pair.ground) : null;
    if (pair.ground && !groundNode) continue;
    const style = getComputedStyle(node);
    if (pair.kind === 'text') {
      const ground = groundNode ? stack(groundNode, true) : stack(node, true);
      const ink = over(parse(style.color), ground);
      out[pair.id] = { ratio: ratio(ink, ground), ink: hex(ink), ground: hex(ground) };
    } else if (pair.kind === 'border') {
      const ground = groundNode ? stack(groundNode, true) : stack(node, false);
      if (parseFloat(style.borderTopWidth) === 0) continue;
      const edge = over(parse(style.borderTopColor), ground);
      out[pair.id] = { ratio: ratio(edge, ground), ink: hex(edge), ground: hex(ground) };
    } else {
      const ground = groundNode ? stack(groundNode, true) : stack(node, false);
      const fill = over(parse(style.backgroundColor), ground);
      out[pair.id] = { ratio: ratio(fill, ground), ink: hex(fill), ground: hex(ground) };
    }
  }
  return out;
};

/* Term: the inspector column does not scroll. Read as the deficit in pixels so a
   failure says HOW MUCH over budget the state is, which is what a fix is tuned
   against — F1 was 20px, and "true" would not have said that. */
const OVERFLOW = () => ({
  level: document.querySelector('#level').scrollHeight - document.querySelector('#level').clientHeight,
  pageY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
  pageX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
});

async function openMock(browser, size, problems) {
  const page = await browser.newPage({ viewport: size });
  const where = `${size.width}x${size.height}`;
  page.on('pageerror', (e) => problems.push(`pageerror(${where}): ${e.stack || e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console(${where}): ${m.text()}`);
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.startsWith('fonts.')) return route.fulfill({ status: 204 });
    if (url.href.includes('echarts')) {
      return route.fulfill({ body: await readFile(join(VENDOR, 'echarts.min.js')), contentType: 'text/javascript' });
    }
    if (url.hostname !== 'mock.local') {
      problems.push(`unrouted ${url.href} (${where})`);
      return route.fulfill({ status: 404, body: 'not routed' });
    }
    try {
      return route.fulfill({
        body: await readFile(join(ROOT, url.pathname.slice(1))),
        contentType: MIME[extname(url.pathname)] || 'text/plain',
      });
    } catch {
      problems.push(`missing asset ${url.pathname} (${where})`);
      return route.fulfill({ status: 404, body: 'missing' });
    }
  });
  await page.goto(MOCK_URL);
  await page.waitForFunction(() => window.__ferReady === true);
  await page.waitForTimeout(600);
  return page;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const problems = [];
  const failures = [];
  const record = {};
  /* One pass per size per state. The pair list is filtered to the state it
     belongs in, and a pair that never resolves anywhere is a failure below
     rather than a silent skip. */
  const seen = new Set();
  const seenTargets = new Set();
  const targets = {};
  const overflow = {};

  for (const size of SIZES) {
    const key = `${size.width}x${size.height}`;
    const page = await openMock(browser, size, problems);
    for (const stand of STATES) {
      const state = stand.id;
      /* FAILS CLOSED at the door: a state that cannot be entered — a missing
         expander, a frame the fixture stopped emitting — is a failure named
         here, never a state quietly measured in some other configuration. */
      try {
        await page.evaluate(ENTER, stand);
      } catch (e) {
        failures.push(`${key} · ${state}: could not be entered — ${e.message}`);
        continue;
      }
      await page.waitForTimeout(450);
      const of = await page.evaluate(OVERFLOW);
      overflow[`${key} · ${state}`] = of;
      /* F1's own frame, at the size and in the state the defect lived in. The
         harness shoots 1440x900, where the arrival state fit exactly and the
         clipped row was invisible — which is how a P0 survived nine rounds of
         captures. Shot here because this is the run that measures it. */
      if (state === 'queue' && size.width === 1280) {
        /* `-dark` IS A FILENAME TOKEN AND NOTHING ELSE, for the same reason
           harness.mjs's `t` is: it selects no theme and is read by no
           assertion, but the committed capture is `r11-queue-1280x800-dark.png`
           and dropping the suffix would overwrite nothing and orphan it while
           writing an unrelated new file. */
        await page.screenshot({ path: join(SHOTS, 'r11-queue-1280x800-dark.png') });
      }
      if (of.level > 0) failures.push(`${key} · ${state}: #level overflows by ${of.level}px — the inspector column must not scroll`);
      if (of.pageX > 0 || of.pageY > 0) failures.push(`${key} · ${state}: the page scrolls (${of.pageX}px x / ${of.pageY}px y)`);
      const wantedTargets = TARGETS.filter((t) => t.state === state);
      const sizes = await page.evaluate(TARGET_SIZES, wantedTargets);
      for (const t of wantedTargets) {
        const box = sizes[t.id];
        if (!box) continue;
        seenTargets.add(t.id);
        targets[`${t.id} · ${key}`] = box;
        if (box.w + 1e-9 < TARGET_MIN || box.h + 1e-9 < TARGET_MIN) {
          failures.push(`${key} · ${state}: ${t.id} — smallest target ${box.w}x${box.h}, `
            + `minimum ${TARGET_MIN}x${TARGET_MIN}`);
        }
      }
      const wanted = PAIRS.filter((p) => p.state === state);
      const got = await page.evaluate(MEASURE, wanted);
      for (const pair of wanted) {
        const hit = got[pair.id];
        if (!hit) continue;
        seen.add(pair.id);
        const floor = pair.min ?? (pair.kind === 'text' ? TEXT_FLOOR : MARK_FLOOR);
        record[pair.id] = {
          ...hit, ratio: Math.round(hit.ratio * 100) / 100, floor, ceiling: pair.max ?? null,
        };
        if (hit.ratio + 1e-9 < floor) {
          failures.push(`${key} · ${state}: ${pair.id} — ${hit.ratio.toFixed(2)}:1 `
            + `(${hit.ink} on ${hit.ground}), floor ${floor}:1`);
        }
        if (pair.max !== undefined && hit.ratio - 1e-9 > pair.max) {
          failures.push(`${key} · ${state}: ${pair.id} — ${hit.ratio.toFixed(2)}:1 `
            + `(${hit.ink} on ${hit.ground}), ceiling ${pair.max}:1 — it is meant to recede, not compete`);
        }
      }
    }
    await page.close();
  }
  await browser.close();

  for (const pair of PAIRS) {
    if (!seen.has(pair.id)) failures.push(`${pair.id} — never resolved in state "${pair.state}": the guard measured nothing`);
  }
  for (const t of TARGETS) {
    if (!seenTargets.has(t.id)) failures.push(`${t.id} — never resolved in state "${t.state}": the guard measured nothing`);
  }
  for (const p of problems) failures.push(p);

  await writeFile(join(HERE, 'contrast-report.json'),
    `${JSON.stringify({ pairs: record, targets, overflow }, null, 1)}\n`);

  if (process.env.AUDIT_REPORT) {
    process.stdout.write(`\n${'pair'.padEnd(38)}${'ratio'.padStart(8)}  floor\n`);
    for (const [id, hit] of Object.entries(record)) {
      process.stdout.write(`${id.padEnd(38)}${hit.ratio.toFixed(2).padStart(8)}  ${hit.floor}\n`);
    }
    process.stdout.write(`\nsmallest target per control class (minimum ${TARGET_MIN}x${TARGET_MIN}):\n`);
    for (const [k, v] of Object.entries(targets)) {
      process.stdout.write(`  ${k.padEnd(52)} ${v.w} x ${v.h}\n`);
    }
    process.stdout.write('\ninternal scroll / page scroll, per state:\n');
    for (const [k, v] of Object.entries(overflow)) {
      process.stdout.write(`  ${k.padEnd(34)} #level ${String(v.level).padStart(4)}px  page ${v.pageX}/${v.pageY}\n`);
    }
  }

  process.stdout.write(`\ncontrast + target + overflow guard — ${Object.keys(record).length} contrast `
    + `measurements (${PAIRS.length} pairs), ${Object.keys(targets).length} target-size reads `
    + `(${TARGETS.length} control classes x 2 sizes), ${Object.keys(overflow).length} `
    + `state/size overflow reads (${STATES.length} states x 2 sizes — term 9's "any `
    + `state", derived from the fixture), ${failures.length} failure(s)\n`);
  for (const f of failures) process.stdout.write(`  x ${f}\n`);
  if (failures.length) process.exit(1);
}

await main();
