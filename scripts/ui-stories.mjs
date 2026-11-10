// Render every component story from the built Storybook in Chromium (#483).
//
//   node scripts/ui-stories.mjs check   the story prechecks, one test per story
//   node scripts/ui-stories.mjs shots   one PNG per story into frontend/ui/__shots__/
//   UI_STORY=<id part> narrows either to the matching story ids
//   UI_BROWSER=firefox renders them in Playwright's Firefox instead (#567);
//   the gate runs Chromium, the one browser it provisions
//
// Both read frontend/ui/storybook-static (`npm run build-storybook`) and serve
// it from this process on a loopback port. Playwright comes from
// PLAYWRIGHT_MODULE, as the desk's browser legs take it; when that is unset the
// repo's own provisioner (scripts/ensure_browser_gate_env.py) supplies it.
// Either way a missing driver or build fails closed, naming what is missing.
//
// The prechecks, per story:
//   (a) no sentence or question in any visible text
//   (b) every visible word, and every accessible name, is in the allowlist that
//       frontend/ui/__fixtures__/ui-allowlist.json holds, built from the glossary
//   (c) every button declares its role and is that role's §4.1 height
//   (d) at most one primary-filled control
//   (e) every visible number sits in a [data-source] whose fixture field it equals
//   (f) nothing scrolls but a screen's page or pane ([data-scroll="page"]), and
//       the one exception its allowlist names (SCROLL_EXEMPT)
// and then, walked with the keyboard (#582):
//   (g) reachable  (h) visible focus  (i) named  (j) order
//   (k) Escape and return  (l) target size on phone  (m) announced
// and once, over the colour tokens, (n) contrast.
// The rules themselves are frontend/ui/prechecks.js; this file gathers what
// they read from each rendered story.
//
// A gate probe (a story under Gate/, frontend/ui/gate/) draws a defect on
// purpose: its `gate` parameter names the rules it probes and the problems the
// walk must find, and its test passes when the walk finds exactly those. A
// probe is how a rule is shown to fail, through the walk itself.
//
// A story with a play function (Storybook tags it "play-fn") is checked after
// its play has run: the page traps the preview's channel before Storybook
// starts, so a play or story exception is caught however early it fires, and
// the render must settle as "finished". Storybook 10 settles a render as
// finished even when its play threw, so the channel's exceptions are what
// fail it. A play that throws, or a render that
// errors or never settles, fails that story's test.
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRAST_PAIRS, INTERACTION_EXEMPT, SCROLL_EXEMPT, STATUS_SELECTOR, STATUS_TEXTS, TARGET, contrastProblems,
  interactionProblems, precheckProblems,
} from '../frontend/ui/prechecks.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const STATIC = join(ROOT, 'frontend/ui/storybook-static');
const SHOTS = join(ROOT, 'frontend/ui/__shots__');
const FIXTURES = JSON.parse(readFileSync(join(ROOT, 'frontend/ui/__fixtures__/ui-fixtures.json'), 'utf8'));
const ALLOWED = new Set(JSON.parse(readFileSync(join(ROOT, 'frontend/ui/__fixtures__/ui-allowlist.json'), 'utf8')).words);

// Every gate probe the run must find built (frontend/ui/gate), so a probe
// deleted, or the probes dropped from the Storybook build, fails the run
// rather than leave a rule that can no longer be shown to fail; and the rules
// each must show failing. (n) is read once, over the colour tokens, not per
// story; its own test and the unit tests show it.
const GATE_PROBES = ['sentence', 'word-not-allowed', 'wrong-height', 'two-primaries', 'number-unsourced',
  'nested-scroll', 'tap-with-no-role', 'invisible-tab-stop', 'same-focused', 'pane-same-focused',
  'time-field-same-focused', 'no-name', 'word-run-into-number', 'word-run-into-word', 'badge-in-name',
  'image-hides-its-text', 'group-keeps-its-text', 'focusable-hidden', 'toggle-with-no-state', 'covered-still-named',
  'positive-tabindex', 'reversed-row', 'under-target', 'hit-area-over-bar', 'buttons-under-bar', 'status-not-live',
  'bar-label-not-live', 'dialog-keeps-no-focus', 'dialog-undeclared', 'reads-open-draws-nothing',
  'modal-beside-a-control', 'popover-lets-tab-out', 'modal-lets-tab-out', 'covers-but-not-modal',
  'trigger-gone-at-close', 'nested-scroll-beside-month'].map((name) => `gate-probes--${name}`);
const PROBED_RULES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];

const mode = process.argv[2];
if (mode !== 'check' && mode !== 'shots') {
  console.error('usage: node scripts/ui-stories.mjs check|shots');
  process.exit(2);
}

function browserType() {
  let module = process.env.PLAYWRIGHT_MODULE;
  if (!module) {
    const exports = execFileSync('python3', [join(ROOT, 'scripts/ensure_browser_gate_env.py')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    module = /PLAYWRIGHT_MODULE=['"]?([^'"\n]+)/.exec(exports)?.[1];
    if (!module) throw new Error('PLAYWRIGHT_MODULE is unset and ensure_browser_gate_env.py did not export it');
  }
  const name = process.env.UI_BROWSER ?? 'chromium';
  if (name !== 'chromium' && name !== 'firefox') throw new Error(`UI_BROWSER is chromium or firefox, not ${name}`);
  return createRequire(import.meta.url)(module)[name];
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function serve() {
  const server = createServer((request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname));
    const file = join(STATIC, path.endsWith('/') ? `${path}index.html` : path);
    if (!file.startsWith(STATIC) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((ready) => server.listen(0, '127.0.0.1', () => ready(server)));
}

// What the prechecks read, gathered in the page. They read the render as it
// rests: anything still moving in (a popover a play has just opened, growing
// out of its arrow) is first finished where it will settle. The skeleton's
// endless shimmer has no end to finish at, and moves nothing it is measured by.
function inspect(scrollExempt) {
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
  const primary = (() => {
    const probe = document.createElement('i');
    probe.style.background = 'var(--primary)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  })();
  const shot = document.querySelector('[data-shot]');
  const texts = [];
  const walker = document.createTreeWalker(shot, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent.trim();
    const element = node.parentElement;
    if (!text || !element.checkVisibility({ visibilityProperty: true })) continue;
    const sourced = element.closest('[data-source]');
    texts.push({ text, source: sourced?.dataset.source ?? null, format: sourced?.dataset.format ?? null,
      axis: Boolean(element.closest('[data-axis]')), glossary: Boolean(element.closest('.glossary')) });
  }
  const names = [...shot.querySelectorAll('[aria-label]')].map((element) => element.getAttribute('aria-label'));
  const buttons = [...shot.querySelectorAll('button')].map((button) => ({
    role: button.dataset.role ?? null,
    height: button.getBoundingClientRect().height,
    label: button.textContent.trim() || button.getAttribute('aria-label'),
  }));
  const controls = [...shot.querySelectorAll('button, a, input, select, [role="button"]')];
  const primaries = controls.filter((control) => control.dataset.role === 'primary'
    || getComputedStyle(control).backgroundColor === primary).length;
  // §2.3 ban 6: only a screen's page or a desktop pane may scroll, and the one
  // exception (f)'s allowlist names.
  const scrolls = [...shot.querySelectorAll('*')]
    .filter((element) => !element.matches('[data-scroll="page"]') && !scrollExempt.some((selector) => element.matches(selector)))
    .filter((element) => {
      const style = getComputedStyle(element);
      return /auto|scroll/.test(style.overflowX) || /auto|scroll/.test(style.overflowY);
    })
    .map((element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.trim().split(/\s+/).join('.')}` : ''}`);
  return { texts, names, buttons, primaries, scrolls };
}

// The keyboard walk (#582). First, in the page, what (g)–(m) read at rest:
// every control, marked data-a11y="<index>", with how it looks unfocused, and
// every exposed graphic, marked data-a11y-graphic. A control is a native one,
// anything with a role or a tabindex, or anything React gives a tap handler.
// A story's held pseudo state (.sb-focused) is its picture, not the control's
// own rest, so it is dropped first. While a dialog is open Tab goes round
// inside it (and the part drawn apart from it, [data-dialog-part]), so (g)
// reads only what is in that cycle, and what is outside it is reached once it
// closes, in the screen's other stories; a status's control is the exception,
// since what a failure shows over an open dialog is for that dialog. A control
// the dialog or its scrim covers is not tapped while it is open, so (l) skips
// it; one beside the dialog, which still takes a tap, is checked as any other.
function a11yRest({ exempt, statuses, statusSelector }) {
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
  const shot = document.querySelector('[data-shot]');
  for (const name of [...shot.classList]) if (name.startsWith('sb-')) shot.classList.remove(name);
  const shown = (el) => el.checkVisibility({ visibilityProperty: true, opacityProperty: true });
  const dialog = [...shot.querySelectorAll('[role="dialog"]')].find(shown) ?? null;
  const dialogFocus = Boolean(dialog?.contains(document.activeElement));
  document.activeElement?.blur?.();
  const PROPS = ['outline-style', 'outline-width', 'outline-color', 'outline-offset', 'box-shadow', 'background-color',
    'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'color',
    'text-decoration-line', 'opacity'];
  const read = (el, pseudo) => {
    const style = getComputedStyle(el, pseudo);
    return PROPS.map((prop) => style.getPropertyValue(prop)).join('|') + (pseudo ? style.content : '');
  };
  window.__a11yStyle = (el) => [read(el), read(el, '::before'), read(el, '::after'),
    el.parentElement ? read(el.parentElement) : ''].join('#');
  // A page the browser lets Tab scroll is a stop, and is judged for (h) as one.
  for (const pane of shot.querySelectorAll('[data-scroll="page"]')) pane.__a11yRest = window.__a11yStyle(pane);
  const NATIVE = 'button, a[href], input:not([type="hidden"]), select, textarea, summary';
  const ROLES = new Set(['button', 'link', 'tab', 'checkbox', 'radio', 'switch', 'menuitem', 'menuitemcheckbox',
    'menuitemradio', 'option', 'slider', 'spinbutton', 'textbox', 'combobox', 'searchbox', 'treeitem']);
  const TAPS = ['onClick', 'onDoubleClick', 'onMouseDown', 'onMouseUp'];
  const handler = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
    return Boolean(key && TAPS.some((tap) => typeof el[key][tap] === 'function'));
  };
  const implicit = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      return { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton' }[el.type] ?? 'textbox';
    }
    return null;
  };
  const roleOf = (el) => {
    const role = el.getAttribute('role');
    if (role === 'none' || role === 'presentation') return null;
    return ROLES.has(role) ? role : implicit(el);
  };
  const found = [...shot.querySelectorAll('*')].filter((el) => {
    const tabindex = el.getAttribute('tabindex');
    const control = el.matches(NATIVE) || ROLES.has(el.getAttribute('role')) || handler(el);
    return (control || (tabindex !== null && Number(tabindex) >= 0))
      && shown(el) && !el.matches(':disabled') && !el.closest('[inert]');
  });
  const label = (el) => (el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ')
    || `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? `.${el.className.split(' ')[0]}` : ''}`).slice(0, 48);
  const panes = [...shot.querySelectorAll('[data-scroll="page"]')];
  // Under the dialog's layer: its centre's tap lands in the dialog or a scrim,
  // or, off the screen, a scrim covers the screen.
  const scrims = [...shot.querySelectorAll('.ui-scrim')].filter(shown);
  const covered = (el) => {
    const box = el.getBoundingClientRect();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    const hit = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
    if (!hit) return scrims.length > 0;
    return !el.contains(hit) && Boolean(dialog.contains(hit) || hit.closest('.ui-scrim'));
  };
  // The text a name is read from, piece by piece, when the control's contents
  // name it: two pieces read with nothing between them run together.
  const pieces = (el) => {
    if (el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby')) return [];
    const out = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest('[aria-hidden="true"]') || !node.parentElement.checkVisibility()) continue;
      const text = node.textContent.replace(/\s+/g, ' ');
      if (text) out.push(text);
    }
    return out;
  };
  const controls = found.map((el, index) => {
    el.dataset.a11y = String(index);
    el.__a11yRest = window.__a11yStyle(el);
    const rect = el.getBoundingClientRect();
    let fixed = false;
    for (let up = el; up && up !== shot; up = up.parentElement) {
      if (/fixed|sticky/.test(getComputedStyle(up).position)) fixed = true;
    }
    const role = roleOf(el);
    const group = el.parentElement?.closest('[role="group"], [role="radiogroup"], [role="tablist"]');
    const members = group ? found.filter((other) => group.contains(other) && roleOf(other) === role).length : 0;
    const skip = exempt.filter(({ selector }) => el.matches(selector)).flatMap(({ rules }) => rules);
    if (dialog && !dialog.contains(el) && !el.closest('[data-dialog-part]')) {
      if (!el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"]')) skip.push('g');
      if (covered(el)) skip.push('l');
    }
    const tabindex = el.getAttribute('tabindex');
    return {
      label: label(el), role, handler: handler(el), focusable: el.tabIndex >= 0,
      tabindex: tabindex === null ? null : Number(tabindex),
      hidden: Boolean(el.closest('[aria-hidden="true"]')), exempt: skip, name: null, pieces: pieces(el),
      state: ['aria-pressed', 'aria-selected', 'aria-checked', 'aria-current'].some((a) => el.hasAttribute(a))
        || role === 'checkbox' || role === 'radio',
      needsState: role === 'tab' || (role === 'button' && members >= 2),
      badges: [...el.querySelectorAll('.ui-badge')].map((badge) => badge.textContent.trim()).filter(Boolean),
      rect: { x: rect.x + scrollX, y: rect.y + scrollY, w: rect.width, h: rect.height }, fixed,
      pane: panes.indexOf(el.closest('[data-scroll="page"]')),
    };
  });
  const graphics = [...shot.querySelectorAll('svg, canvas, img, [role="img"]')]
    .filter((el) => shown(el) && !el.closest('[aria-hidden="true"]') && !el.parentElement.closest('svg, [role="img"]')
      && !el.parentElement.closest('[data-a11y]'))
    .map((el, index) => {
      el.dataset.a11yGraphic = String(index);
      // A graphic drawn as an image reads as its name alone: any text drawn in
      // it is hidden from a screen reader.
      const hides = el.getAttribute('role') === 'img'
        ? [...el.querySelectorAll('text, span, div, p')].filter((t) => t.children.length === 0 && shown(t)
          && !t.closest('[aria-hidden="true"]')).map((t) => t.textContent.trim()).find(Boolean) ?? ''
        : '';
      return { label: `${el.tagName.toLowerCase()}${el.getAttribute('class') ? `.${el.getAttribute('class').split(' ')[0]}` : ''}`,
        name: '', hides };
    });
  const patterns = statuses.map((source) => new RegExp(source));
  const said = (el) => el.textContent.trim().replace(/\s+/g, ' ').replace(/^[^A-Za-z]+/, '');
  const matches = (el) => el.matches(statusSelector) || patterns.some((pattern) => pattern.test(said(el)));
  const statusFound = [...shot.querySelectorAll('*')]
    // A heading with a status's words names a section ("Waiting for pump"); it is not a status.
    .filter((el) => shown(el) && matches(el) && ![...el.children].some(matches)
      && !el.closest('[aria-hidden="true"], h1, h2, h3, h4, h5, h6'))
    .map((el) => ({ text: said(el),
      live: Boolean(el.closest('[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]')) }));
  const trigger = dialog && shot.querySelector('[aria-haspopup="dialog"][aria-expanded="true"]');
  return {
    controls, graphics, statuses: statusFound,
    open: dialog && { name: dialog.getAttribute('aria-label'), trigger: trigger?.dataset.a11y ?? null, focus: dialogFocus },
    triggers: controls.map((_, index) => index).filter((index) => {
      const el = shot.querySelector(`[data-a11y="${index}"]`);
      return el.getAttribute('aria-haspopup') === 'dialog' && el.getAttribute('aria-expanded') !== 'true'
        && !(dialog && !dialog.contains(el));
    }),
  };
}

// Where focus is after a key: the marked control, and whether it looks other
// than at rest, once anything its focus set moving has finished.
function a11yFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !el.closest('[data-shot]')) return null;
  for (const animation of document.getAnimations()) {
    if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
  }
  // A stop the rest pass did not collect has index -1: a pane the browser lets
  // Tab scroll, or one drawn invisible, which is no visible control. A field
  // that draws a caret shows its focus by it; a time or a date field does not.
  const index = el.dataset.a11y === undefined ? -1 : Number(el.dataset.a11y);
  // Focus on a control an open dialog (or its scrim) is drawn over: a key
  // would press what cannot be seen.
  const dialog = [...document.querySelectorAll('[data-shot] [role="dialog"]')]
    .find((d) => d.checkVisibility({ visibilityProperty: true, opacityProperty: true }));
  const centre = el.getBoundingClientRect();
  const [cx, cy] = [centre.x + centre.width / 2, centre.y + centre.height / 2];
  const hit = dialog && !dialog.contains(el) && !el.closest('[data-dialog-part]')
    && cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight ? document.elementFromPoint(cx, cy) : null;
  const covered = Boolean(hit && !el.contains(hit) && (dialog.contains(hit) || hit.closest('.ui-scrim')));
  const typed = el.tagName === 'TEXTAREA'
    || (el.tagName === 'INPUT' && ['text', 'number', 'password', 'email', 'search', 'tel', 'url'].includes(el.type));
  const caret = typed && !el.readOnly && getComputedStyle(el).caretColor !== 'rgba(0, 0, 0, 0)';
  const box = el.getBoundingClientRect();
  const visible = box.width > 0 && box.height > 0 && el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  return { index, visible, covered, label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 48) || el.tagName.toLowerCase(),
    changed: caret || window.__a11yStyle(el) !== el.__a11yRest };
}

// (l), at any width: a control pinned over a page (a bar, the tab bar) takes
// its own taps whatever scrolls beneath it. Each page that scrolls is stepped
// through its whole height, and each pinned control hit-tested at its centre
// and around it; a tap landing on another control that is not pinned with it
// is stolen. The page is put back where it was.
function a11yPinned() {
  const shot = document.querySelector('[data-shot]');
  const layer = (el) => {
    for (let up = el; up && up !== shot; up = up.parentElement) {
      if (/fixed|sticky/.test(getComputedStyle(up).position)) return up;
    }
    return null;
  };
  const marked = [...shot.querySelectorAll('[data-a11y]')];
  const pinned = marked.filter(layer);
  const stolen = {};
  if (!pinned.length) return stolen;
  const pages = [...shot.querySelectorAll('[data-scroll="page"]'), document.scrollingElement]
    .filter((page) => page.scrollHeight > page.clientHeight + 1);
  for (const page of pages) {
    const was = page.scrollTop;
    for (let top = 0; top <= page.scrollHeight - page.clientHeight + 12; top += 12) {
      page.scrollTop = top;
      for (const el of pinned) {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        for (const [fx, fy] of [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]]) {
          const [x, y] = [box.x + box.width * fx, box.y + box.height * fy];
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (!hit || el.contains(hit) || layer(el).contains(hit)) continue;
          const thief = hit.closest('[data-a11y]');
          if (!thief || layer(thief)?.contains(el)) continue;
          (stolen[el.dataset.a11y] ??= new Set()).add(thief.getAttribute('aria-label') || thief.textContent.trim().slice(0, 48));
        }
      }
    }
    page.scrollTop = was;
  }
  return Object.fromEntries(Object.entries(stolen).map(([index, thieves]) => [index, [...thieves]]));
}

// (l), on phone: scroll each control into view and hit-test the points 22 px
// out from its centre, and the centre. A point off the screen is the screen's
// edge, which a thumb cannot overshoot, so it counts. A field takes a tap on
// the label that wraps it.
function a11yTargets(target) {
  const half = target / 2 - 0.5;
  const points = { centre: [0, 0], left: [-half, 0], right: [half, 0], above: [0, -half], below: [0, half] };
  return [...document.querySelectorAll('[data-shot] [data-a11y]')].map((el) => {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const box = el.getBoundingClientRect();
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    return Object.entries(points).filter(([, [dx, dy]]) => {
      const [x, y] = [cx + dx, cy + dy];
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      if (!hit) return true;
      const label = el.closest('label');
      return !(el.contains(hit) || (label && label.contains(hit)));
    }).map(([where]) => where);
  });
}

const DIALOG_SHOWN = () => [...document.querySelectorAll('[data-shot] [role="dialog"]')]
  .some((d) => d.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !d.closest('[data-closing]'));
const DIALOG_GONE = () => ![...document.querySelectorAll('[data-shot] [role="dialog"]')]
  .some((d) => d.checkVisibility({ visibilityProperty: true })) && !document.querySelector('[data-closing]');

const waitFor = (page, predicate, timeout) => page.waitForFunction(predicate, null, { timeout })
  .then(() => true, () => false);

// (k) on the dialog now open: focus is in it, and Tab and Shift+Tab, one more
// time each than its cycle has stops, never take focus out of it (nor onto a
// control it covers), modal or not. Then Escape, and (with a trigger) focus is
// back on the trigger. Whether it is marked modal is what the screen shows:
// `beside` counts the controls outside it a tap at their centre still lands on
// (no scrim, nor the dialog, over them).
async function walkDialog(page, trigger, escape) {
  const inDialog = () => {
    const dialog = [...document.querySelectorAll('[data-shot] [role="dialog"]')]
      .find((d) => d.checkVisibility({ visibilityProperty: true }));
    const active = document.activeElement;
    return Boolean(dialog?.contains(active) || (dialog && active?.closest('[data-dialog-part]')));
  };
  const stops = await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish();
    }
    const dialog = [...document.querySelectorAll('[data-shot] [role="dialog"]')]
      .find((d) => d.checkVisibility({ visibilityProperty: true }));
    const beside = [...document.querySelectorAll('[data-shot] :is(button, a[href], input, select, textarea, '
      + '[role="button"], [role="tab"], [role="link"])')]
      .filter((el) => !dialog.contains(el) && !el.matches(':disabled, .ui-scrim') && el.checkVisibility({ opacityProperty: true }))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
        if (!box.width || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        const hit = document.elementFromPoint(x, y);
        return Boolean(hit && el.contains(hit));
      }).length;
    return { name: dialog.getAttribute('aria-label'), modal: dialog.getAttribute('aria-modal') === 'true', beside,
      count: [...document.querySelectorAll('[data-shot] [data-dialog-part]'), dialog]
        .flatMap((region) => [...region.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')])
        .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.checkVisibility()).length };
  });
  const inside = await page.evaluate(inDialog);
  let trapped = true;
  const obscured = new Set();
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let i = 0; i <= stops.count; i += 1) {
      await page.keyboard.press(key);
      if (!await page.evaluate(inDialog)) trapped = false;
      const step = await page.evaluate(a11yFocus);
      if (step?.covered) obscured.add(step.label);
    }
  }
  const { name, modal, beside } = stops;
  const walked = { name, modal, beside, inside, trapped, obscured: [...obscured] };
  if (!escape) return { ...walked, closed: null, returned: null };
  // Escape from inside it, where a keyboard user is when they press it.
  if (!await page.evaluate(inDialog)) {
    await page.evaluate(() => [...document.querySelectorAll('[data-shot] [role="dialog"]')]
      .find((d) => d.checkVisibility({ visibilityProperty: true }))
      ?.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus());
  }
  await page.keyboard.press('Escape');
  const closed = await waitFor(page, DIALOG_GONE, 3000);
  const returned = trigger === null ? null
    : await page.evaluate((index) => document.activeElement?.dataset.a11y === String(index), trigger);
  return { ...walked, closed, returned };
}

// The walk, after the visual prechecks have read the story at rest. A
// component story draws a trigger whose dialog its screen owns (the screen
// holds the open state), so a trigger that opens nothing fails only on a
// screen's own story, and the run proves its label opens a dialog on some
// screen's story (`run.declared`, `run.opened`); `run.seen` and `run.walked`
// prove every dialog drawn anywhere is opened from its trigger and closed by
// Escape somewhere.
async function walkStory(page, story, run, owner) {
  // Room for the widest and tallest frame, so the walk never scrolls the page
  // under a tap; a frame's layout is its own, never the viewport's.
  await page.setViewportSize({ width: 1600, height: 1000 });
  const rest = await page.evaluate(a11yRest, {
    exempt: INTERACTION_EXEMPT, statuses: STATUS_TEXTS.map((pattern) => pattern.source), statusSelector: STATUS_SELECTOR,
  });
  const named = async (selector) => {
    const snapshot = await page.locator(selector).ariaSnapshot({ timeout: 2000 }).catch(() => '');
    let line = snapshot.split('\n')[0].replace(/^- /, '').replace(/:$/, '');
    if (line.startsWith("'") && line.endsWith("'")) line = line.slice(1, -1).replace(/''/g, "'");
    const quoted = /^[\w-]+ "((?:[^"\\]|\\.)*)"/.exec(line);
    return quoted ? JSON.parse(`"${quoted[1]}"`).trim() : '';
  };
  // A modal dialog takes what lies behind it out of the accessibility tree;
  // the names behind it are read as they will be once it closes.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-shot] [aria-modal="true"]')) {
      el.removeAttribute('aria-modal');
      el.dataset.a11yModal = '';
    }
  });
  for (const [index, control] of rest.controls.entries()) {
    if (control.role) control.name = await named(`[data-a11y="${index}"]`);
  }
  for (const [index, graphic] of rest.graphics.entries()) graphic.name = await named(`[data-a11y-graphic="${index}"]`);
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[data-shot] [data-a11y-modal]')) {
      el.setAttribute('aria-modal', 'true');
      delete el.dataset.a11yModal;
    }
  });

  // Tab starts where focus last was (a play's last tap), so the walk starts it
  // from a sentinel at the top of the document, gone after the first key.
  await page.evaluate(() => {
    const start = document.createElement('i');
    start.tabIndex = -1;
    start.dataset.a11yStart = '';
    document.body.prepend(start);
    start.focus();
  });
  const sequence = [];
  const stops = rest.controls.filter((control) => control.focusable).length + 2;
  for (let i = 0; i < stops; i += 1) {
    await page.keyboard.press('Tab');
    if (i === 0) await page.evaluate(() => document.querySelector('[data-a11y-start]')?.remove());
    const step = await page.evaluate(a11yFocus);
    if (!step || sequence.some((seen) => seen.index === step.index && seen.label === step.label)) break;
    sequence.push(step);
  }
  // A focusable element Tab reaches that is not a control (a pane, say) is
  // still a stop, for (h) and (j); it is not one of the controls (g) reads.
  const width = await page.evaluate(() => document.querySelector('[data-shot]').getBoundingClientRect().width);
  if (width < 1024) {
    const misses = await page.evaluate(a11yTargets, TARGET);
    rest.controls.forEach((control, index) => { control.misses = misses[index]; });
  }
  const stolen = await page.evaluate(a11yPinned);
  for (const [index, thieves] of Object.entries(stolen)) rest.controls[Number(index)].stolen = thieves;

  const dialogs = [];
  const probe = story.title.startsWith('Gate/');
  const note = (set, name) => { if (!probe) set.add(name); };
  let triggers = rest.triggers;
  if (rest.open) {
    // Open with the story, by no key: what it is walked for is the focus the
    // story left in it, its trap and its Escape. Once Escape has closed it, its
    // trigger opens it again, and that walk proves focus comes back.
    note(run.seen, rest.open.name);
    await page.evaluate(() => {
      const dialog = [...document.querySelectorAll('[data-shot] [role="dialog"]')]
        .find((d) => d.checkVisibility({ visibilityProperty: true }));
      if (!dialog.contains(document.activeElement)) {
        dialog.querySelector('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')?.focus();
      }
    });
    const result = await walkDialog(page, null, owner);
    const trigger = rest.open.trigger === null ? null : rest.controls[rest.open.trigger].label;
    dialogs.push({ ...result, trigger, opened: true, inside: rest.open.focus });
    triggers = !result.closed ? [] : await page.evaluate(() => [...document.querySelectorAll('[data-shot] [data-a11y]')]
      .filter((el) => el.getAttribute('aria-haspopup') === 'dialog' && el.getAttribute('aria-expanded') !== 'true'
        && !el.matches(':disabled') && el.checkVisibility())
      .map((el) => Number(el.dataset.a11y)));
  }
  for (const index of triggers) {
    const label = rest.controls[index].label;
    if (rest.controls[index].exempt.includes('k')) continue;
    await page.evaluate((i) => document.querySelector(`[data-a11y="${i}"]`)?.focus(), index);
    await page.keyboard.press('Enter');
    if (!await waitFor(page, DIALOG_SHOWN, 2000)) {
      // A trigger that reads open while it draws nothing tells a screen reader
      // a dialog is there that is not; one that opens nothing at all, on a
      // component's story, is proved over the run to open on a screen's.
      const pending = await page.evaluate((i) => document.querySelector(`[data-a11y="${i}"]`)
        ?.getAttribute('aria-expanded') === 'true', index);
      if (owner || pending) dialogs.push({ name: '', trigger: label, opened: false, pending });
      else note(run.declared, label);
      if (pending) await page.keyboard.press('Escape');
      continue;
    }
    const result = await walkDialog(page, index, owner);
    note(run.seen, result.name);
    note(run.opened, label);
    if (result.closed && result.returned) note(run.walked, result.name);
    dialogs.push({ ...result, trigger: label, opened: true });
    if (!result.closed) break;
  }
  // Every dialog the story or its play opened from a control: that control
  // must declare it, so the walk (and a screen reader) knows it opens one.
  const opened = await page.evaluate(() => window.__a11yOpened ?? []);
  for (const { name } of opened) note(run.seen, name);
  const undeclared = opened.filter(({ opener }) => opener && !opener.declared)
    .map(({ name, opener }) => ({ name, opener: opener.label }))
    .filter((item, i, all) => all.findIndex((other) => other.name === item.name && other.opener === item.opener) === i);
  return { controls: rest.controls, sequence, graphics: rest.graphics, statuses: rest.statuses, dialogs, undeclared };
}

// (n), once: each token pair painted as the page paints it, the foreground
// composited over its ground on a one-pixel canvas, so a token mixed with
// transparency (the focus ring) is read as it lands.
function paintPairs(pairs) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const probe = document.createElement('i');
  document.body.append(probe);
  const colour = (token) => {
    probe.style.color = `var(${token})`;
    return getComputedStyle(probe).color;
  };
  const paint = (...layers) => {
    context.clearRect(0, 0, 1, 1);
    for (const layer of layers) {
      context.fillStyle = layer;
      context.fillRect(0, 0, 1, 1);
    }
    return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const painted = pairs.map(({ fg, bg, min }) => {
    const [front, ground] = [colour(fg), colour(bg)];
    return { fg, bg, min, rgb: { fg: paint('#000', ground, front), bg: paint('#000', ground) } };
  });
  probe.remove();
  return painted;
}

for (const [what, path] of [['the built Storybook (npm run build-storybook)', join(STATIC, 'index.json')]]) {
  if (!existsSync(path)) {
    console.error(`missing ${what}: ${path}`);
    process.exit(1);
  }
}
// UI_STORY narrows a run to the story ids containing it, for iterating on one
// component; the full run leaves it unset.
const only = process.env.UI_STORY;
const indexed = Object.values(JSON.parse(readFileSync(join(STATIC, 'index.json'), 'utf8')).entries)
  .filter((entry) => entry.type === 'story');
const stories = indexed.filter((entry) => !only || entry.id.includes(only));
if (stories.length === 0) {
  console.error('the built Storybook indexes no stories');
  process.exit(1);
}

const plays = stories.filter((entry) => entry.tags?.includes('play-fn')).length;
console.log(`${stories.length} stories, ${plays} with a play function`);

const server = await serve();
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await browserType().launch();

// Before Storybook loads: catch the channel as it is assigned and record every
// exception a story or its play function reports on it. And, for (k), every
// dialog that appears while the story renders and plays, with the control last
// pressed before it: what opened it, and whether it declares it.
function trapChannel() {
  window.__uiStoryErrors = [];
  window.__a11yOpened = [];
  let pressed = null;
  const press = (event) => {
    if (event.type !== 'keydown' || event.key === 'Enter' || event.key === ' ') pressed = event.target;
  };
  for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) addEventListener(type, press, true);
  const opener = () => {
    const el = pressed instanceof Element ? pressed.closest('button, a[href], summary, input, select, [role="button"], '
      + '[role="link"], [role="tab"], [role="menuitem"], [tabindex]') : null;
    // One dialog giving way to the next is not an opening.
    if (!el || el.closest('[role="dialog"]')) return null;
    return { label: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 48), declared: el.getAttribute('aria-haspopup') === 'dialog' };
  };
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        for (const dialog of [node, ...node.querySelectorAll('[role="dialog"]')].filter((el) => el.matches('[role="dialog"]'))) {
          window.__a11yOpened.push({ name: dialog.getAttribute('aria-label') ?? '', opener: opener() });
        }
      }
    }
  }).observe(document, { childList: true, subtree: true });
  let channel;
  Object.defineProperty(window, '__STORYBOOK_ADDONS_CHANNEL__', {
    configurable: true,
    get: () => channel,
    set: (value) => {
      channel = value;
      for (const event of ['playFunctionThrewException', 'storyThrewException', 'storyErrored']) {
        value.on(event, (error) => window.__uiStoryErrors.push(`${event}: ${error?.message ?? error?.title ?? JSON.stringify(error)}`));
      }
    },
  });
}

async function render(page, id) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(trapChannel);
  await page.goto(`${origin}/iframe.html?id=${id}&viewMode=story`);
  await page.waitForSelector('[data-shot]');
  const phase = await page.waitForFunction(() => {
    const done = ['finished', 'completed', 'errored', 'aborted'];
    const current = window.__STORYBOOK_PREVIEW__?.currentRender?.phase;
    return done.includes(current) ? current : null;
  }, null, { timeout: 15000 }).then((handle) => handle.jsonValue());
  if (phase !== 'finished' && phase !== 'completed') errors.push(`the story's render ended ${phase}`);
  errors.push(...await page.evaluate(() => window.__uiStoryErrors));
  await page.evaluate(() => document.fonts.ready);
  // What a play closed has left once its closing motion ends (usePresence); the
  // prechecks and the shots read the screen after it has gone.
  await page.waitForFunction(() => !document.querySelector('[data-closing]'), null, { timeout: 5000 });
  return errors;
}

if (mode === 'check') {
  const run = { seen: new Set(), walked: new Set(), declared: new Set(), opened: new Set(), probed: new Set() };
  test.after(async () => {
    await browser.close();
    server.close();
  });
  for (const story of stories) {
    test(`${story.title} / ${story.name}`, async () => {
      const page = await browser.newPage();
      try {
        const errors = await render(page, story.id);
        assert.deepEqual(errors, [], 'the story threw');
        // A story may read a served-shape variant (frontend/ui/served-variants.ts);
        // its stores join the generated answers at their own keys, never replacing one.
        const variants = await page.evaluate(() => globalThis.__uiVariants ?? null);
        const months = await page.evaluate(() => globalThis.__uiMonths ?? {});
        const fixtures = variants ? {
          ...FIXTURES,
          changes: { ...variants.changes, ...FIXTURES.changes },
          queue: { ...variants.queue, ...FIXTURES.queue },
          day: { ...FIXTURES.day, days: { ...variants.days, ...FIXTURES.day.days }, months },
        } : FIXTURES;
        const problems = precheckProblems(await page.evaluate(inspect, SCROLL_EXEMPT.map(({ selector }) => selector)), { fixtures, allowed: ALLOWED });
        // A gate probe names the rules it probes and what the walk must find there.
        const gate = await page.evaluate(() => window.__STORYBOOK_PREVIEW__?.currentRender?.story?.parameters?.gate ?? null);
        // A screen owns what Escape means; a component story has no Escape to walk.
        const owner = story.title.startsWith('Screens/') || Boolean(gate?.owner);
        problems.push(...interactionProblems(await walkStory(page, story, run, owner)));
        if (gate) {
          assert.ok(story.title.startsWith('Gate/'), 'only a gate probe declares what the walk must find');
          for (const line of gate.expect) run.probed.add(/^\((\w)\)/.exec(line)?.[1]);
          assert.deepEqual(problems.filter((line) => gate.rules.some((rule) => line.startsWith(`(${rule})`))), gate.expect);
        } else {
          assert.ok(!story.title.startsWith('Gate/'), 'a gate probe declares what the walk must find');
          assert.deepEqual(problems, []);
        }
      } finally {
        await page.close();
      }
    });
  }
  test('(n) every colour token pair holds its contrast', async () => {
    const page = await browser.newPage();
    try {
      await render(page, stories[0].id);
      assert.deepEqual(contrastProblems(await page.evaluate(paintPairs, CONTRAST_PAIRS)), []);
    } finally {
      await page.close();
    }
  });
  // The probes are all built and none is unlisted, read from the whole
  // index, so a narrowed run checks it too; and between them every rule is
  // shown failing (a probe whose expected lines name it), once they have all run.
  test('every gate probe is built, and none is unlisted', () => {
    const built = indexed.filter((entry) => entry.title.startsWith('Gate/')).map((entry) => entry.id);
    assert.deepEqual({ missing: GATE_PROBES.filter((id) => !built.includes(id)), unlisted: built.filter((id) => !GATE_PROBES.includes(id)) },
      { missing: [], unlisted: [] });
  });
  test('every rule has a probe that fails', { skip: !GATE_PROBES.every((id) => stories.some((entry) => entry.id === id)) }, () => {
    assert.deepEqual(PROBED_RULES.filter((rule) => !run.probed.has(rule)), []);
  });
  // A dialog drawn only in a story with no trigger (a component's own
  // picture) is walked from its trigger on a screen's story; a whole run
  // proves each one is. A narrowed run sees only part of the library.
  test('(k) every dialog any story draws is opened from its trigger and closed by Escape', { skip: Boolean(only) }, () => {
    assert.deepEqual([...run.seen].filter((name) => !run.walked.has(name)), []);
  });
  // A trigger a component's story draws, whose dialog its screen owns, opens
  // one on some screen's story; one that opens nothing anywhere fails here.
  test('(k) every trigger any story draws opens its dialog somewhere', { skip: Boolean(only) }, () => {
    assert.deepEqual([...run.declared].filter((label) => !run.opened.has(label)), []);
  });
} else {
  rmSync(SHOTS, { recursive: true, force: true });
  mkdirSync(SHOTS, { recursive: true });
  try {
    for (const story of stories.filter((entry) => !entry.title.startsWith('Gate/'))) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
      const errors = await render(page, story.id);
      if (errors.length) throw new Error(`${story.id} threw: ${errors.join('; ')}`);
      await page.locator('[data-shot]').screenshot({ path: join(SHOTS, `${story.id}.png`), animations: 'disabled' });
      await page.close();
    }
    console.log(`${stories.length} screenshots in ${SHOTS}`);
  } finally {
    await browser.close();
    server.close();
  }
}
