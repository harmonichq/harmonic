import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { mealSize, type MealSizeData } from '../../overview-model';
import { MealSizeCard } from './MealSizeCard';

// §4.2 MealSizeCard (ADR 501, #559), each state a store the generator serves
// (gen_ui_fixtures._require_meal_sizes fails if one stops):
// - Populated: the simulated wearer's 84 days, a meal in every size and a few
//   at 60 g+; phone at 390 (the strips, then the rows beneath), desktop at the
//   Overview's full row (each size one row, its numbers beside its strip), and
//   a 320 px phone.
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
  const data = mealSize(store);
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

/** Each strip draws one dot per served meal, its median tick when it has a
 *  meal, and its Range line when that spans; no two axis labels touch; one
 *  table row per size, each median signed. */
const drawn = (data: MealSizeData, layout: 'wide' | 'narrow'): Story['play'] => async ({ canvasElement }) => {
  await expect(canvasElement.querySelector(`.ui-meal-size__body--${layout}`)).not.toBeNull();
  for (const [i, row] of data.rows.entries()) {
    const strip = canvasElement.querySelector(`[data-size="${i}"]`)!;
    await expect(strip.querySelectorAll('.ui-meal-size__dot').length).toBe(row.climbs.length);
    await expect(strip.querySelectorAll('.ui-chart__median').length).toBe(row.median ? 1 : 0);
    await expect(strip.querySelectorAll('.ui-meal-size__range').length)
      .toBe(row.p25 !== null && row.p75 !== null && row.p75 > row.p25 ? 1 : 0);
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

/** One meal at 60 g+: one dot, its median tick, no Range line, and a count of "1 meal". */
export const Sparse: Story = {
  args: { data: sparse },
  play: async (context) => {
    await drawn(sparse, 'narrow')!(context);
    const last = sparse.rows.length - 1;
    await expect(sparse.rows[last].climbs.length).toBe(1);
    const count = context.canvasElement.querySelector(`[data-source="${sparse.rows[last].meals.source}"]`);
    await expect(count?.parentElement?.textContent).toBe('1 meal');
  },
};
export const SparseDesktop: Story = { args: { data: sparse }, parameters: DESKTOP, play: drawn(sparse, 'wide') };

/** A size with no meal keeps its row: its label, no dot, and "–" for each median. */
export const EmptySizes: Story = {
  args: { data: emptySizes },
  parameters: DESKTOP,
  play: async (context) => {
    await drawn(emptySizes, 'wide')!(context);
    const empty = emptySizes.rows.findIndex((row) => row.climbs.length === 0);
    await expect(empty).toBeGreaterThanOrEqual(0);
    const rows = [...context.canvasElement.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="rowheader"]'));
    const cells = [...rows[empty].querySelectorAll('.ui-meal-size__value')];
    await expect(cells.map((cell) => cell.textContent!.charAt(0))).toEqual(['–', '–', '–']);
  },
};
export const NoData: Story = { args: { data: mealSize('wearer-unsynced') } };
export const Loading: Story = { args: { data: null } };
