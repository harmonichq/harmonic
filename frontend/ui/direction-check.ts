// The stories' check that a drawn change is coloured by its direction (§2.5,
// 2026-10-19): green where it moved the good way for its metric, red the bad
// way, neutral where it printed unchanged or neither way is better. It reads
// the lock's list of good ways (§4.2 Delta), not the table the models build
// from, so a wrong entry there fails a play.
import { expect } from 'storybook/test';

/** The good way for each metric, by the label it is printed under. */
const GOOD_WAY: Record<string, '▲' | '▼' | null> = {
  'In range': '▲',
  'Below 70': '▼',
  'Above 180': '▼',
  Mean: '▼',
  GMI: '▼',
  CV: '▼',
  Peak: '▼',
  Nadir: '▲',
  Habit: '▼',
  Delivered: null,
  Above: null,
  Below: null,
};

export type Tone = 'favorable' | 'adverse' | null;

/** Asserts the change drawn for `label` carries its direction's colour, and
 *  returns that colour. */
export async function expectToned(label: string, delta: Element): Promise<Tone> {
  await expect(Object.keys(GOOD_WAY)).toContain(label);
  const arrow = delta.textContent?.match(/^[▲▼]/)?.[0] ?? null;
  const good = GOOD_WAY[label];
  const tone: Tone = arrow === null || good === null ? null : arrow === good ? 'favorable' : 'adverse';
  await expect(delta.className).toBe(tone ? `ui-delta ui-delta--${tone}` : 'ui-delta');
  return tone;
}

/** The same for every row under `root` that draws a change: each row its
 *  label and its change. Returns the rows' colours in order. */
export async function expectDirections(root: HTMLElement, row: string, label: string): Promise<Tone[]> {
  const tones: Tone[] = [];
  for (const element of root.querySelectorAll(row)) {
    const delta = element.querySelector('.ui-delta');
    if (!delta) continue;
    tones.push(await expectToned(element.querySelector(label)!.textContent!.trim(), delta));
  }
  return tones;
}
