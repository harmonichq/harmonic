// The v2 desk's one router and its render loop, ported from the ★ LOCKED
// desktop prototype under the harmonic-v2-desktop lock manifest.
//
// WHAT THIS MODULE OWNS. The three destinations and their default (Diagnose),
// which one is current, the address that names it, the contextual entry's own
// context, the focus a frame lands on, the reading pane's scroll, the layered
// Escape, and the teardown every render performs before the next one builds
// (HV2-34). It owns no destination's content: Diagnose and Changes are
// registered by their owners, and Day registers itself through the same seam.
//
// WHAT IT PUBLISHES, for chunks 2 and 3 (#389 desktop build contracts):
//
//   registerDestination({ id, title, mount })  content for one destination
//   navigate(id, context)                      move the desk, contextually or not
//   render()                                   re-draw after a destination's own state moved
//   hold(cleanup)                              a teardown the NEXT render runs
//   registerEscape(layer, handler)             one step of the settled Escape chain
//
// A destination's `mount(host, deps)` renders synchronously into `host` and
// binds its own controls. It is called on every render, so a destination that
// needs served data fetches it itself and calls render() when it arrives —
// which is also what keeps the loading frame honest rather than a blank pane.
//
// THE ADDRESS IS frontend/tab-routing.js's. There is no second router: this
// module holds the desk's state and asks that owner to parse and serialize.
import {
  parseV2Route, serializeV2Route, subscribeRoute, writeRoute, resolveDestination,
} from '../frontend/tab-routing.js';
import { emptyFrame } from './frame.js';

/* ------------------------------------------------------------ desk state */

let surface = null;
const destinations = new Map();
let destination = 'diagnose';
let context = {};
let navigation = 0;
let cleanups = [];
let seatLayer = null;

// The narrow sheet, and the target a frame hands focus to once it has rendered.
// Both are read by every layer, so they live in one object rather than in a
// setter each.
export const view = { sheetOpen: false, focusAfterRender: null };

// The one focus this desk last placed, and the element it landed on. Read only
// by render(), to carry the reader's hand across a re-render that destroys what
// it is on; see the focus step there for the two guards that bound it.
let placed = null;

let narrowQuery = null;
export const narrow = () => Boolean(narrowQuery && narrowQuery.matches);

export const currentDestination = () => destination;
export const deskSurface = () => surface;

/* ---------------------------------------------------------- registration */

/**
 * Register one destination's content.
 * @param {{id: string, title: string, mount: (host: Element, deps: object) => void, retainFrame?: (host: Element) => boolean}} entry
 */
export function registerDestination({ id, title, mount, retainFrame }) {
  if (resolveDestination(id) !== id) throw new Error(`unknown v2 destination ${JSON.stringify(id)}`);
  if (typeof mount !== 'function') throw new Error(`destination ${id} registered without a mount`);
  destinations.set(id, { id, title, mount, retainFrame });
}

/** Register a teardown the NEXT render runs — a chart, an observer, a listener. */
export function hold(cleanup) {
  cleanups.push(cleanup);
}

/* --------------------------------------------------------------- fetching */

// Every served read this desk makes goes through here, so the desk knows when
// it is still arriving. Two things depend on that and nothing else can supply
// it: a frame renders its loading state while a read is open, and the caller's
// focus target survives until the content it named exists (see render()).
//
// Keyed so a second render during an open read does not fire the same request
// again. `onFailure` belongs to the caller because a failed read reads
// differently in each pane — a Day that could not load, a utility that could
// not read — and neither is a failed WRITE.
const inFlight = new Set();

export function load(key, run, onFailure) {
  if (inFlight.has(key)) return;
  inFlight.add(key);
  run().then(() => {
    inFlight.delete(key);
    render();
  }).catch((error) => {
    inFlight.delete(key);
    onFailure(error);
    render();
  });
}

/** Whether any served read is still open. */
export const loading = () => inFlight.size > 0;

/** Dispose everything the last render built. Also the pagehide path (S84). */
function disposeDesk(pagehide = false) {
  const held = cleanups;
  cleanups = [];
  for (const cleanup of held) cleanup(pagehide);
}

// The utility layer takes the reading pane's seat over whichever frame
// rendered, so it runs after the destination and before the focus hand-off.
// Registered rather than imported: utilities.js already depends on this module,
// and a cycle between them would make either one's load order matter.
export function registerSeatLayer(seat) {
  seatLayer = seat;
}

// The settled Escape hierarchy, in one place, one level per press (S78). Owners
// plug into their own layer; a layer with no owner is simply skipped, which is
// how this chunk lands before the layers chunks 2 and 3 own exist.
export const ESCAPE_ORDER = ['utility', 'sheet', 'aside', 'day', 'journey', 'figure'];
const escapes = new Map();

export function registerEscape(layer, handler) {
  if (!ESCAPE_ORDER.includes(layer)) throw new Error(`unknown Escape layer ${JSON.stringify(layer)}`);
  escapes.set(layer, handler);
}

/* -------------------------------------------------------------- navigate */

/**
 * Move the desk. A contextual entry carries `{date, subject, occurrence,
 * window, lever, from, focus}`; a direct one carries nothing, and invents
 * neither a prior subject nor a return (HV2-13).
 *
 * A caller that already named its focus target set it before navigating, and
 * that always wins over the arrival default (HV2-32).
 */
export function navigate(next, entryContext = {}) {
  navigation += 1;
  destination = resolveDestination(next);
  context = { ...entryContext };
  writeRoute({ destination, context }, { serialize: (route) => serializeV2Route(route) });
  // Arriving at a destination puts the hand on its subject: the reading pane's
  // head, else the stage's title.
  if (!view.focusAfterRender) view.focusAfterRender = ['.gf-reading > header h2', '#crumb-trail', '.gf-stage .gf-title'];
  view.sheetOpen = false;
  render();
}

/* ---------------------------------------------------------------- render */

// The reading pane keeps its scroll only while it stays on the same subject; a
// pane that changes subject arrives at its head, so what leads it is what shows.
function paneKey() {
  const pane = surface.querySelector('.gf-desk > .gf-reading');
  return `${destination}|${pane?.getAttribute('aria-label') || pane?.querySelector('header h2')?.textContent || ''}`;
}

// A destination nobody has registered content for is not an error: it is the
// desk standing with nothing to say on it yet. HV2-05 keeps that state full
// width and manufactures no reading pane.
function unclaimedFrame(id) {
  const title = destinations.get(id)?.title || id;
  return emptyFrame(title, 'Nothing to show here yet',
    'This destination has no content on this desk yet.',
    '<button class="gf-btn primary" data-destination-action="day">Open Day</button>');
}

export function render() {
  if (!surface) return;
  const was = paneKey();
  const scrolled = surface.querySelector('.gf-pane-body')?.scrollTop || 0;
  // What this render is about to destroy, if the reader's hand is still on the
  // thing the desk last put it on. See the focus step at the end.
  const carried = placed && placed.element === document.activeElement ? placed.selector : null;
  disposeDesk();
  // Utilities sit beside the current desk rather than inside its frame. Clear
  // the prior surface-owned strip before its seat owner paints the one current
  // strip, so a return or reload cannot accumulate stale launchers.
  for (const strip of surface.querySelectorAll('.gf-utility-strip')) strip.remove();

  for (const button of document.querySelectorAll('[data-destination]')) {
    if (button.dataset.destination === destination) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  surface.dataset.sheet = view.sheetOpen ? 'open' : 'closed';

  const entry = destinations.get(destination);
  // Day is a reader rather than a loading screen: when it already owns a
  // populated desk, a selected-day read must leave that desk in place.  The
  // destination opts into this explicitly; every other destination keeps the
  // normal replace-on-render lifecycle.
  const retainFrame = Boolean(entry?.retainFrame?.(surface));
  if (entry) entry.mount(surface, { context: { ...context }, navigation, render, hold, retainFrame });
  else surface.innerHTML = unclaimedFrame(destination);

  // An open utility takes the reading pane's seat on whichever frame rendered.
  if (seatLayer) seatLayer(destination);

  // The narrow reading pane covers the stage; hidden controls cannot take focus.
  surface.querySelector('.gf-stage')?.toggleAttribute('inert', narrow() && view.sheetOpen);
  bindDesk();

  const body = surface.querySelector('.gf-pane-body');
  if (body) body.scrollTop = paneKey() === was ? scrolled : 0;

  // One selector, or candidates in order of preference: the first present takes
  // focus. A caller-supplied precise target is a single selector and always wins.
  //
  // A RENDER MUST NOT TAKE THE READER'S HAND OFF WHAT IT IS ON. Every render
  // replaces the markup wholesale, so the focused element is destroyed and focus
  // falls to the document body. Where the desk itself placed that focus and the
  // reader has not since moved it, the same target is re-applied to the markup
  // that replaced it — which is what carries focus through a pane that renders
  // once while its content is still being read and again when it arrives. The
  // Guide's article is the case that measured it: the heading took focus while
  // the article still said it was loading, and the render that replaced it with
  // the served text dropped focus to the body.
  //
  // Two guards keep this from becoming recovery machinery. It only ever re-uses
  // the selector the desk last placed — nothing is remembered about the reader —
  // and it does nothing at all unless that exact element is still the one in
  // hand, so a later focus choice of the reader's own is never overridden.
  //
  // A request also outlives a render that cannot satisfy it, while a read is
  // still open: the target a caller named may not exist until its content does.
  const wanted = view.focusAfterRender || carried;
  if (wanted) {
    let landed = null;
    for (const target of [].concat(wanted)) {
      const found = surface.querySelector(target);
      if (found) { found.focus(); landed = { selector: target, element: found }; break; }
    }
    if (landed) placed = landed;
    if (landed || !loading()) view.focusAfterRender = null;
  }
}

// The desk's own controls, rebound after every render because every render
// replaces the markup that carries them.
function bindDesk() {
  for (const button of surface.querySelectorAll('[data-destination-action]')) {
    button.onclick = () => navigate(button.dataset.destinationAction);
  }
  for (const button of surface.querySelectorAll('[data-action="open-sheet"]')) {
    button.onclick = () => { view.sheetOpen = true; view.focusAfterRender = '.gf-sheet-close'; render(); };
  }
  for (const button of surface.querySelectorAll('[data-action="close-sheet"]')) {
    button.onclick = () => { view.sheetOpen = false; view.focusAfterRender = '.gf-sheet-toggle'; render(); };
  }
}

/* ------------------------------------------------------- keyboard, boot */

function onEscape(event) {
  if (event.key !== 'Escape') return;
  // A seated utility steps back and closes on its own before the desk's chain,
  // and it does so from inside its own fields too: one Escape always leaves the
  // utility and hands focus back to what opened it. What was typed and not saved
  // stays in the page, as it does when Close is pressed (S79's one exception).
  const utility = escapes.get('utility');
  if (utility && utility()) return;
  // Elsewhere a field owns the key, so a stray Escape cannot drop a draft.
  if (['TEXTAREA', 'INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
  for (const layer of ESCAPE_ORDER) {
    if (layer === 'utility') continue;
    const handler = escapes.get(layer);
    if (handler && handler()) return;
  }
}

/** The topbar is the global way in. Pressing the destination already in hand is
    the way back up, so it re-enters that destination with no context — a
    contextual return never comes through here and keeps its own subject. */
function bindTopbar() {
  for (const button of document.querySelectorAll('[data-destination]')) {
    button.onclick = () => navigate(button.dataset.destination);
  }
}

/**
 * Seat the desk on `element`, adopt the address it was opened at, and start
 * answering the reader. Called once, by the entry module.
 */
export function startDesk(element, { browser = window } = {}) {
  surface = element;
  narrowQuery = browser.matchMedia('(max-width:700px)');
  narrowQuery.addEventListener('change', () => { view.sheetOpen = false; render(); });
  bindTopbar();
  browser.addEventListener('keydown', onEscape);
  browser.addEventListener('pagehide', () => disposeDesk(true));
  // The sheet is desktop-invisible chrome, so nothing about it belongs in the
  // address; the destination and the contextual entry's context do.
  registerEscape('sheet', () => {
    if (!view.sheetOpen) return false;
    view.sheetOpen = false;
    view.focusAfterRender = '.gf-sheet-toggle';
    render();
    return true;
  });
  subscribeRoute((route) => {
    navigation += 1;
    destination = route.destination;
    context = route.context;
    render();
  }, browser, parseV2Route);
  const opened = parseV2Route(browser.location);
  destination = opened.destination;
  context = opened.context;
  render();
}
