import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { mealSize, type MealSizeData } from '../../overview-model';
import { MealSizeCard } from './MealSizeCard';

// §4.2 MealSizeCard (ADR 501, #559, #570), each state a store the generator
// serves (gen_ui_fixtures._require_meal_sizes fails if one stops):
// - Populated: the simulated wearer's 84 days at 90 d, a meal in every size and
//   a few at 60 g+; phone at 390 (the strips, then the rows beneath), desktop
//   at the Overview's full row (each size one row, its numbers beside its
//   strip), and a 320 px phone.
// - Sparse: the same wearer's first five days, one meal at 60 g+.
// - Empty sizes: the QA showcase, whose meals are all 40 g or more.
// - No data (the unsynced store) and not yet read (the skeleton).
// The Overview's own stories show it on the screen beside the estimates.
const meta = {
  title: 'MealSizeCard',
  component: MealSizeCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof MealSizeCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 1120 } };

const served = (store: Parameters<typeof mealSize>[0]): MealSizeData => {
  const data = mealSize(store, '90');
  if (!data || data === 'none') throw new Error(`${store} serves no meal sizes`);
  return data;
};
const populated = served('wearer');
const sparse = served('wearer-first-days');
const emptySizes = served('showcase');

/** The least rendered space between two axis labels, so two never read as one. */
const LABEL_SPACE = 12;
/** A served median: signed, with a true minus, or "0". */
const SIGNED = /^([+−]\d+|0)$/;

/** A computed colour (rgb, color(srgb …), oklab …) as 0–255 sRGB, read back
 *  from a one-pixel canvas so every colour syntax resolves the same way. */
function rgb(colour: string): number[] {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  context.fillStyle = colour;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
}

/** The WCAG contrast of two computed colours. */
function contrast(a: string, b: string) {
  const luminance = (colour: string) => {
    const [r, g, b2] = rgb(colour).map((c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** #565, #570: a strip's Range paints over its whisker and its median over
 *  both (later in the SVG); the Range is at least 4 px and stands out from
 *  the card by at least 3:1, and so does the whisker. */
async function marksInOrder(strip: Element, card: Element) {
  const [whisker, range, median] = ['[data-whisker]', '[data-range]', '[data-median]']
    .map((selector) => strip.querySelector(selector));
  const order = [whisker, range, median].filter((mark): mark is Element => mark !== null);
  for (let i = 1; i < order.length; i += 1) {
    await expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
  const surface = getComputedStyle(card).backgroundColor;
  if (range) {
    const line = getComputedStyle(range);
    await expect(contrast(line.stroke, surface)).toBeGreaterThanOrEqual(3);
    await expect(parseFloat(line.strokeWidth)).toBeGreaterThanOrEqual(4);
  }
  if (whisker) await expect(contrast(getComputedStyle(whisker).stroke, surface)).toBeGreaterThanOrEqual(3);
}

/** Each strip draws no meal of its own (#570): its whisker when its 10–90%
 *  spans, its Range line when its 25–75% does, its median tick when it has a
 *  meal; no two axis labels touch; one table row per size, each median signed. */
const drawn = (data: MealSizeData, layout: 'wide' | 'narrow'): Story['play'] => async ({ canvasElement }) => {
  await expect(canvasElement.querySelector(`.ui-meal-size__body--${layout}`)).not.toBeNull();
  await expect(canvasElement.querySelectorAll('.ui-meal-size circle').length).toBe(0);
  for (const [i, row] of data.rows.entries()) {
    const strip = canvasElement.querySelector(`[data-size="${i}"]`)!;
    await expect(strip.querySelectorAll('[data-whisker]').length)
      .toBe(row.p10 !== null && row.p90 !== null && row.p90 > row.p10 ? 1 : 0);
    await expect(strip.querySelectorAll('[data-range]').length)
      .toBe(row.p25 !== null && row.p75 !== null && row.p75 > row.p25 ? 1 : 0);
    await expect(strip.querySelectorAll('[data-median]').length).toBe(row.median ? 1 : 0);
    await marksInOrder(strip, canvasElement.querySelector('.ui-meal-size')!);
  }
  const labels = [...canvasElement.querySelectorAll<SVGTextElement>('.ui-chart__tick')]
    .map((label) => label.getBoundingClientRect());
  for (let i = 1; i < labels.length; i += 1) {
    await expect(labels[i].left - labels[i - 1].right).toBeGreaterThanOrEqual(LABEL_SPACE);
  }
  const rows = [...canvasElement.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="rowheader"]'));
  await expect(rows.length).toBe(data.rows.length);
  for (const climb of canvasElement.querySelectorAll('.ui-meal-size__climb')) {
    const text = climb.textContent!;
    if (text !== '–') await expect(text).toMatch(SIGNED);
  }
};

export const Populated: Story = { args: { data: populated }, play: drawn(populated, 'narrow') };
export const PopulatedDesktop: Story = { args: { data: populated }, parameters: DESKTOP, play: drawn(populated, 'wide') };
export const Narrow: Story = {
  args: { data: populated }, parameters: { frame: { width: 320 } }, play: drawn(populated, 'narrow'),
};

/** One meal at 60 g+: its median tick alone, no whisker or Range line, and a count of "1 meal". */
export const Sparse: Story = {
  args: { data: sparse },
  play: async (context) => {
    await drawn(sparse, 'narrow')!(context);
    const last = sparse.rows.length - 1;
    await expect(sparse.rows[last].meals.value).toBe(1);
    const count = context.canvasElement.querySelector(`[data-source="${sparse.rows[last].meals.source}"]`);
    await expect(count?.parentElement?.textContent).toBe('1 meal');
  },
};
export const SparseDesktop: Story = { args: { data: sparse }, parameters: DESKTOP, play: drawn(sparse, 'wide') };

/** A size with no meal keeps its row: its label, no mark, and "–" for each median. */
export const EmptySizes: Story = {
  args: { data: emptySizes },
  parameters: DESKTOP,
  play: async (context) => {
    await drawn(emptySizes, 'wide')!(context);
    const empty = emptySizes.rows.findIndex((row) => row.meals.value === 0);
    await expect(empty).toBeGreaterThanOrEqual(0);
    const rows = [...context.canvasElement.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="rowheader"]'));
    const cells = [...rows[empty].querySelectorAll('.ui-meal-size__value')];
    await expect(cells.map((cell) => cell.textContent!.charAt(0))).toEqual(['–', '–', '–']);
  },
};
export const NoData: Story = { args: { data: mealSize('wearer-unsynced', '90') } };
export const Loading: Story = { args: { data: null } };
