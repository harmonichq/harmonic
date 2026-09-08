// The desk's markup vocabulary: the panes, the nameplate, the reading pane's
// head and the empty frame, ported verbatim from the ★ LOCKED desktop prototype
// under the harmonic-v2-desktop lock manifest.
//
// Every class and data attribute here is a selector the frozen behaviour ledger
// replays against, so a rename is a port defect rather than a tidy-up. The
// prototype kept these as closures over its own module state; they take their
// arguments here so `node --test` can read the markup with no DOM.
//
// Chunks 2 and 3 build their destinations out of these helpers, which is why
// they are a module rather than a private detail of routes.js.

/** HTML-escape a value for interpolation into a template string. */
export function escapeText(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const e = escapeText;

/** `HH:MM` from a served `YYYY-MM-DD HH:MM:SS` wall-clock stamp. */
export const clock = (value) => String(value).slice(11, 16);

// Parsed at midday so a UTC offset can never bump the calendar day, the same
// rule frontend/daily-nav.js states for every other date label in the app.
const atNoon = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00`);

export const date = (value) => atNoon(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
export const shortDate = (value) => atNoon(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
export const stamp = (value) => `${date(value)} · ${clock(value)}`;

/** One stage pane beside one reading pane, divided by the shipped hairline. */
export function desk(stage, reading) {
  return `<div class="panes gf-desk">${stage}${reading}</div>`;
}

/** The stage's header rail. Its title takes programmatic focus when a frame has
    no reading pane to land in (HV2-32, and the S80b obligation). */
export function nameplate({ kicker, title, sub, end = '' }) {
  return `<header class="gf-head"><div class="gf-id"><div class="gf-kicker">${kicker}</div><h2 class="gf-title" tabindex="-1">${title}</h2><div class="gf-sub">${sub}</div></div>${end ? `<div class="gf-end">${end}</div>` : ''}</header>`;
}

/** The reading pane's head. It takes programmatic focus when navigation opens a
    new subject, and carries the narrow sheet's Close. */
export function readingHeader(title, meta = '') {
  return `<header><h2 tabindex="-1">${title}</h2>${meta ? `<span class="meta">${meta}</span>` : ''}<div class="gf-end"><button class="gf-btn gf-sheet-close" data-action="close-sheet">Close</button></div></header>`;
}

/** The narrow sheet's own toggle. Presented only below 700px (S10b). */
export function sheetToggle(label, sheetOpen) {
  return `<button class="gf-btn gf-sheet-toggle" data-action="open-sheet" aria-expanded="${sheetOpen}">${label} <span aria-hidden="true">▾</span></button>`;
}

/** The full-width empty stage. HV2-05 keeps it full width: it manufactures no
    reading pane, and its title is focusable so arrival still lands on the
    heading rather than on the pressed navigation button (S80b). */
export function emptyFrame(cap, title, copy, actions, note = '') {
  return `<section class="pane gf-stage gf-stage-table" aria-label="${e(cap)}"><header><h2>${e(cap)}</h2></header><div class="gf-empty"><div class="gf-title" tabindex="-1">${title}</div><p>${copy}</p><div class="gf-actions">${actions}</div></div>${note ? `<p class="gf-note">${e(note)}</p>` : ''}</section>`;
}

/** The one loading frame, so a destination waiting on the API says so rather
    than standing empty. It carries no count and no former row (HV2-31). */
export function loadingFrame(title) {
  return desk(
    `<section class="pane gf-stage" aria-label="${e(title)}"><div class="gf-loading" role="status" aria-label="Loading ${e(title)}"></div></section>`,
    `<aside class="pane gf-reading" aria-label="${e(title)}">${readingHeader(e(title))}<div class="gf-pane-body"></div></aside>`,
  );
}

/** The one failure frame: it names what could not load and offers the retry. */
export function errorFrame(cap, what) {
  return emptyFrame(cap, 'Evidence unavailable', `${e(what)} could not load.`,
    '<button class="gf-btn primary" data-retry>Retry</button>');
}
