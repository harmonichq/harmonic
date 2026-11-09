// The stories' tap by coordinate (#648): a finger at a control's centre
// presses that control, not something drawn over it. userEvent.click
// dispatches to the element it is handed and so never sees a layer on top;
// this asks the page what is at the point first, then presses that. The phone
// frames are the three sizes the tap was found failing at, the iPhone's with
// its home indicator's inset, which a sheet's last control clears.
import type { CSSProperties } from 'react';
import type { Decorator } from '@storybook/react-vite';
import { expect, userEvent } from 'storybook/test';

export const PHONES = {
  se: { width: 375, height: 667, padding: 0 },
  x: { width: 375, height: 812, padding: 0 },
  pixel: { width: 412, height: 915, padding: 0 },
} as const;

/** The iPhone X frame's home-indicator inset, simulated as the tab bar's stories do. */
export const homeIndicator: Decorator = (Story) => (
  <div style={{ height: '100%', '--ui-inset-bottom': '34px' } as CSSProperties}><Story /></div>
);

/** A sheet rising, or a drop-down dropping, comes to rest where a finger finds it. */
export const motionEnded = () => Promise.all(document.getAnimations()
  .filter((animation) => Number.isFinite(animation.effect?.getComputedTiming().endTime))
  .map((animation) => animation.finished));

/** What is at the control's centre, checked to be the control. */
export async function expectTappable(control: HTMLElement): Promise<Element> {
  await motionEnded();
  // A frame taller than the browser's window is scrolled to the control, as a
  // whole: scrolling the control into view would move the screen inside it.
  window.scrollBy(0, Math.max(0, control.getBoundingClientRect().bottom - window.innerHeight));
  const box = control.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  await expect(hit !== null && control.contains(hit)).toBe(true);
  return hit!;
}

/** Press the point at the control's centre, after checking the control is what is there. */
export async function tapCentre(control: HTMLElement): Promise<void> {
  await userEvent.click(await expectTappable(control));
}

/** The control sits wholly above the device's inset, with room to spare. */
export async function expectClearsInset(control: HTMLElement): Promise<void> {
  await motionEnded();
  const frame = control.closest<HTMLElement>('[data-shot]')!;
  const inset = parseFloat(getComputedStyle(control).getPropertyValue('--ui-inset-bottom')) || 0;
  await expect(frame.getBoundingClientRect().bottom - control.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(inset + 16);
}
