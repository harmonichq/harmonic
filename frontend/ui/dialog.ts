// A sheet's or popover's keyboard contract (#582): opened, it takes focus
// (unless something in it already has it); closed (or closing, while
// usePresence holds it on screen), focus goes back to what had it when it
// opened, its trigger, or, when closing took the trigger away (an End that
// ends what it was drawn on), to the nearest heading that is still there. A
// modal one (a sheet over a scrim, which covers everything else) is marked
// modal and keeps Tab and Shift+Tab going round inside it; an anchored popover
// beside a page that still takes taps is not modal, and Tab may leave it.
// Escape stays with each screen, which owns what closing means.
import { useEffect, useRef } from 'react';

const STOPS = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]';

/** Where focus goes when the trigger is gone: the first heading of the
 *  trigger's nearest ancestor still on the page, or the screen's heading. */
function fallback(ancestors: Element[]): HTMLElement | null {
  const region = ancestors.find((el) => el.isConnected && el !== document.body && el !== document.documentElement);
  const heading = region?.querySelector<HTMLElement>('h1, h2, h3') ?? document.querySelector<HTMLElement>('h1');
  const target = heading ?? (region instanceof HTMLElement ? region : null);
  if (target && !target.hasAttribute('tabindex')) target.tabIndex = -1;
  return target;
}

export function useDialogFocus<T extends HTMLElement>(open: boolean, { modal = true }: { modal?: boolean } = {}) {
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
    const stops = () => [...dialog.querySelectorAll<HTMLElement>(STOPS)]
      .filter((el) => el.tabIndex >= 0 && !el.matches(':disabled') && el.checkVisibility());
    // With nothing in it to press (a month with no data), the dialog itself
    // holds focus.
    if (modal) dialog.setAttribute('aria-modal', 'true');
    if (!dialog.hasAttribute('tabindex')) dialog.tabIndex = -1;
    if (!dialog.contains(document.activeElement)) (stops()[0] ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const all = stops();
      const active = document.activeElement;
      const [first, last] = [all[0], all[all.length - 1]];
      if (!first) event.preventDefault();
      else if (!dialog.contains(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    if (modal) document.addEventListener('keydown', onKey);
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
      if (active && active !== document.body && !dialog.contains(active)) return;
      if (trigger?.isConnected) trigger.focus();
      else if (trigger) fallback(ancestors)?.focus({ preventScroll: true });
    };
  }, [open, modal]);
  return ref;
}
