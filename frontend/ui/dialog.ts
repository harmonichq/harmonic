// A sheet's or popover's keyboard contract (#582, ADR 582): opened, it takes
// focus (unless something in it already has it), and while it is open Tab and
// Shift+Tab go round inside it, whatever it is drawn over; closed (or closing,
// while usePresence holds it on screen), focus goes back to what had it when it
// opened, its trigger, or, when closing takes the trigger away (an End that
// ends what it was drawn on), to the nearest heading that is still there.
// Containment is the keyboard's; `modal` is what a screen reader is told: a
// sheet over a scrim, which covers everything else, is marked modal, and an
// anchored popover beside a page that still takes taps is not. `part` is drawn
// apart from it but belongs to its cycle: the Not saved bar a failed save shows
// over the open form. Escape stays with each screen, which owns what closing
// means.
import { useEffect, useRef, type RefObject } from 'react';

const STOPS = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';

/** Where focus goes when the trigger is gone: the first heading shown in the
 *  nearest of the trigger's ancestors still on the page that holds one (on
 *  Changes, ending a Trial takes its card, and the pane's "Changes" is next),
 *  or that nearest ancestor itself. */
function fallback(ancestors: Element[]): HTMLElement | null {
  const left = ancestors.filter((el) => el.isConnected && el !== document.documentElement);
  const heading = left.map((el) => [...el.querySelectorAll<HTMLElement>('h1, h2, h3')].find((h) => h.checkVisibility()))
    .find(Boolean);
  const target = heading ?? (left[0] instanceof HTMLElement && left[0] !== document.body ? left[0] : null);
  if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  return target ?? null;
}

/** Focus the trigger again; if the close then takes it away (it is removed
 *  once the write it confirmed lands), focus its fallback rather than leave
 *  focus on the page. The watch ends once focus moves anywhere else. */
function giveBack(trigger: HTMLElement, ancestors: Element[]) {
  if (!trigger.isConnected) {
    fallback(ancestors)?.focus({ preventScroll: true });
    return;
  }
  trigger.focus();
  const lost = () => !document.activeElement || document.activeElement === document.body;
  const watch = new MutationObserver(() => {
    if (trigger.isConnected) return;
    stop();
    if (lost()) fallback(ancestors)?.focus({ preventScroll: true });
  });
  const moved = (event: FocusEvent) => { if (event.target !== trigger) stop(); };
  function stop() {
    watch.disconnect();
    document.removeEventListener('focusin', moved, true);
  }
  watch.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('focusin', moved, true);
}

export function useDialogFocus<T extends HTMLElement>(open: boolean,
  { modal = true, part }: { modal?: boolean; part?: RefObject<HTMLElement | null> } = {}) {
  const ref = useRef<T>(null);
  // Read as it opens, before a field inside it takes focus on mount.
  const opener = useRef<Element | null>(null);
  if (!open) opener.current = null;
  else if (opener.current === null) opener.current = document.activeElement;
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return undefined;
    const trigger = opener.current instanceof HTMLElement && !dialog.contains(opener.current) ? opener.current : null;
    const ancestors: Element[] = [];
    for (let up = trigger?.parentElement; up; up = up.parentElement) ancestors.push(up);
    const regions = () => [dialog, part?.current].filter((el): el is HTMLElement => Boolean(el?.isConnected));
    const inCycle = (el: Element | null) => Boolean(el && regions().some((region) => region.contains(el)));
    // Every stop in the dialog and its part, in the order they are drawn.
    const stops = () => [...new Set(regions().flatMap((region) => [...region.querySelectorAll<HTMLElement>(STOPS)]))]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.checkVisibility())
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    if (modal) dialog.setAttribute('aria-modal', 'true');
    // With nothing in it to press (a month with no data), the dialog itself
    // holds focus.
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    if (!dialog.contains(document.activeElement)) (stops()[0] ?? dialog).focus();
    // Tab steps from stop to stop itself: the part is drawn elsewhere in the
    // page, and what lies between is not in the cycle.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const all = stops();
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      const next = at < 0 ? (event.shiftKey ? all.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + all.length) % all.length;
      all[next].focus();
    };
    document.addEventListener('keydown', onKey);
    // What had focus in it can go while it is open (a step disabled as the
    // month's read fails); focus stays in the dialog, never on the page.
    const keep = new MutationObserver(() => {
      if (!document.activeElement || document.activeElement === document.body) (stops()[0] ?? dialog).focus();
    });
    keep.observe(dialog, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] });
    return () => {
      keep.disconnect();
      document.removeEventListener('keydown', onKey);
      dialog.removeAttribute('aria-modal');
      const active = document.activeElement;
      if (active && active !== document.body && !inCycle(active) && !dialog.contains(active)) return;
      if (trigger) giveBack(trigger, ancestors);
    };
  }, [open, modal, part]);
  // The part comes and goes while the dialog is open (the bar shows when a save
  // fails); whenever it is drawn with the dialog open, it says it belongs.
  useEffect(() => {
    const el = part?.current;
    if (!open || !el) return undefined;
    el.setAttribute('data-dialog-part', '');
    return () => el.removeAttribute('data-dialog-part');
  });
  return ref;
}
