// The persistent chrome: one topbar and one footer that do not move as the
// destination changes (HV2-09). Ported verbatim from the ★ LOCKED desktop
// prototype's shared scaffold, plus the footer's Carb questions entry, which
// that prototype's utilities module injected at bind time and this shell simply
// renders.
//
// Every string here is in the lock's "Verbatim strings" list, including the
// fullwidth plus (U+FF0B) on Log carbs, so drift is a diff rather than a
// judgment call. frontend-v2/chrome.test.js reads them back.
import { e } from './frame.js';

export const DESTINATIONS = [
  ['overview', 'Overview'],
  ['explore', 'Explore'],
  ['changes', 'Changes'],
  ['day', 'Day'],
];

export const ADVISORY = 'Advisory only — review with your clinician before changing pump settings.';

// The footer utilities, in the locked order. Pump settings is deliberately
// absent: it is reached from Changes (HV2-12), never from this strip.
export const FOOTER_UTILITIES = [
  ['questions', 'Carb questions', 'cockpit-questions'],
  ['guide', 'Guide', ''],
  ['settings', 'Settings', ''],
  ['glossary', 'Glossary', 'cockpit-glossary'],
];

export function shellMarkup() {
  const nav = `<nav class="v2-nav" aria-label="Main">${DESTINATIONS
    .map(([id, label], i) => `<button data-destination="${id}" ${i === 0 ? 'aria-current="page"' : ''}>${label}</button>`)
    .join('')}</nav>`;
  const utilities = FOOTER_UTILITIES
    .map(([kind, label, className]) => `<button class="${className}" data-utility="${kind}">${label}${kind === 'questions' ? ' <span class="cockpit-count">0</span>' : ''}</button>`)
    .join('');
  return `<header class="cockpit-topbar"><div class="cockpit-identity"><span class="cockpit-mark" aria-hidden="true"></span>Harmonic <small>advisory</small></div>${nav}<span class="cockpit-gap"></span><div class="cockpit-scope"><span class="cockpit-scope-label">Scope</span><span class="cockpit-scope-dot"></span><span>30 d</span></div><button class="cockpit-log-carbs"><span class="plus">＋</span>Log carbs</button></header><main class="v2-content gf-main" id="v2-content"></main><footer class="cockpit-footer status"><span class="cockpit-advisory advisory">${e(ADVISORY)}</span><nav class="cockpit-utilities" aria-label="Utilities">${utilities}</nav></footer>`;
}

/**
 * Build the shell into `document.body` and return the desk surface inside it.
 * `.dw` is the workstation role scope frontend/theme.css themes by; `.gf` is
 * this desk's own.
 */
export function renderShell(document_ = document) {
  const root = document_.createElement('div');
  root.className = 'cockpit-shell cockpit v2-shell';
  root.innerHTML = shellMarkup();
  document_.body.append(root);
  const main = root.querySelector('main');
  const surface = document_.createElement('div');
  surface.className = 'gf dw';
  main.append(surface);
  return surface;
}
