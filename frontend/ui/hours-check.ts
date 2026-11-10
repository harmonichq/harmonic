// The stories' check that the Glucose profile's hours each read on their own
// (#650): no two labels along its bottom touch, and the day's two ends are
// always among them.
import { expect } from 'storybook/test';

/** The least drawn space between two hours: below the profile's own 8 px, as
 *  a platform's font draws an hour a fraction wider than the one it was
 *  measured on, yet still clearly two labels. */
const APART = 6;

/** The hours drawn, left to right, once each is checked clear of the last. */
export async function expectHoursApart(root: HTMLElement): Promise<string[]> {
  const labels = [...root.querySelectorAll<SVGTextElement>('.ui-profile__chart > g[data-axis]:last-of-type text')];
  const boxes = labels.map((label) => label.getBoundingClientRect());
  for (let i = 1; i < boxes.length; i += 1) {
    await expect(boxes[i].left - boxes[i - 1].right).toBeGreaterThanOrEqual(APART);
  }
  const hours = labels.map((label) => label.textContent!);
  await expect([hours[0], hours[hours.length - 1]]).toEqual(['00:00', '24:00']);
  return hours;
}
