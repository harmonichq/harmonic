// The stories' check that the phone tab bar is 64 px above the device's bottom
// inset and nothing more (§2.5, 2026-10-14 and 2026-10-19): its items sit 10 px
// above the inset, and the bar is the last thing in its frame, so nothing draws
// below it. A story simulates the inset with --ui-inset-bottom; no browser here
// reports a real one.
import { expect } from 'storybook/test';

export async function expectTabBarEnds(canvasElement: HTMLElement): Promise<void> {
  const bar = canvasElement.querySelector<HTMLElement>('.ui-nav--tabbar')!;
  const inset = parseFloat(getComputedStyle(bar).getPropertyValue('--ui-inset-bottom')) || 0;
  const box = bar.getBoundingClientRect();
  await expect(box.height).toBe(64 + inset);
  const items = [...bar.querySelectorAll('.ui-nav__item')].map((item) => item.getBoundingClientRect().bottom);
  await expect(items).toEqual(items.map(() => box.bottom - 10 - inset));
  await expect(box.bottom).toBe(bar.closest('[data-shot]')!.getBoundingClientRect().bottom);
}
