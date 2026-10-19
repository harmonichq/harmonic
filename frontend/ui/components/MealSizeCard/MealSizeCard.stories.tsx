import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { mealSize, type MealSizeData } from '../../overview-model';
import { MealSizeCard } from './MealSizeCard';

// §4.2 MealSizeCard (ADR 501), each state a store the generator serves
// (gen_ui_fixtures._require_meal_sizes fails if one stops):
// - Populated: the simulated wearer's 84 days, a meal in every size and a few
//   at 60 g+; phone at 390, desktop at the half pane it shares, and a 320 px phone.
// - Sparse: the same wearer's first five days, one meal at 60 g+.
// - Empty sizes: the QA showcase, whose meals are all 40 g or more.
// - No data (the unsynced store) and not yet read (the skeleton).
// The Overview's own stories show it on the screen, Stale among them.
const meta = {
  title: 'MealSizeCard',
  component: MealSizeCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof MealSizeCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 560 } };

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

/** Each row draws one dot per served meal, its median tick when it has a
 *  meal, and its 25–75% band when that spans; no two axis labels touch. */
const drawn = (data: MealSizeData): Story['play'] => async ({ canvasElement }) => {
  for (const [i, row] of data.rows.entries()) {
    const g = canvasElement.querySelector(`[data-size="${i}"]`)!;
    await expect(g.querySelectorAll('.ui-chart__dot').length).toBe(row.climbs.length);
    await expect(g.querySelectorAll('.ui-chart__median').length).toBe(row.median ? 1 : 0);
    await expect(g.querySelectorAll('.ui-chart__spread').length)
      .toBe(row.p25 !== null && row.p75 !== null && row.p75 > row.p25 ? 1 : 0);
  }
  const labels = [...canvasElement.querySelectorAll<SVGTextElement>('.ui-chart__tick')]
    .map((label) => label.getBoundingClientRect());
  for (let i = 1; i < labels.length; i += 1) {
    await expect(labels[i].left - labels[i - 1].right).toBeGreaterThanOrEqual(LABEL_SPACE);
  }
  // Every dot and mark stays inside the card's chart.
  const chart = canvasElement.querySelector('.ui-chart')!.getBoundingClientRect();
  for (const mark of canvasElement.querySelectorAll('.ui-chart__dot, .ui-chart__median, .ui-chart__spread')) {
    const box = mark.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(chart.left - 0.5);
    await expect(box.right).toBeLessThanOrEqual(chart.right + 0.5);
  }
  // The table: one row per size, its count, and three medians.
  await expect(canvasElement.querySelectorAll('tbody tr').length).toBe(data.rows.length);
};

export const Populated: Story = { args: { data: populated }, play: drawn(populated) };
export const PopulatedDesktop: Story = { args: { data: populated }, parameters: DESKTOP, play: drawn(populated) };
export const Narrow: Story = { args: { data: populated }, parameters: { frame: { width: 320 } }, play: drawn(populated) };

/** One meal at 60 g+: one dot, its median tick, no band, and a count of 1. */
export const Sparse: Story = {
  args: { data: sparse },
  play: async (context) => {
    await drawn(sparse)!(context);
    const last = sparse.rows.length - 1;
    await expect(sparse.rows[last].climbs.length).toBe(1);
    const count = context.canvasElement.querySelector(`[data-source="${sparse.rows[last].meals.source}"]`);
    await expect(count?.textContent).toBe('1');
  },
};
export const SparseDesktop: Story = { args: { data: sparse }, parameters: DESKTOP, play: drawn(sparse) };

/** A size with no meal keeps its row: its label, no dot, and "–" for each median. */
export const EmptySizes: Story = {
  args: { data: emptySizes },
  play: async (context) => {
    await drawn(emptySizes)!(context);
    const empty = emptySizes.rows.findIndex((row) => row.climbs.length === 0);
    await expect(empty).toBeGreaterThanOrEqual(0);
    const cells = [...context.canvasElement.querySelectorAll('tbody tr')[empty].querySelectorAll('td')];
    await expect(cells.map((cell) => cell.querySelector('.ui-meal-size__value')!.textContent)).toEqual(['–', '–', '–']);
  },
};
export const NoData: Story = { args: { data: mealSize('wearer-unsynced') } };
export const Loading: Story = { args: { data: null } };
