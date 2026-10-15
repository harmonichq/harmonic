import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { dayChart } from '../../day-model';
import { DayChart } from './DayChart';

// One story per state (§4.2 DayChart), each a day of the simulated wearer
// picked by rule: the latest day with readings, a site change and no logged
// carbs, the latest of the days with the most logged carbs, and the first day
// after the history ends. Every day with readings shows the sleep schedule,
// basal against the Pump profile with its suspends, and the moments the
// engine counted toward a habit, as the model-view serves them (§2.5,
// 2026-10-14): on the site-change day three meals counted as Carb undercount;
// on the logged-carbs day a Carb undercount, two Meal over-deliveries, and an
// Over-treated low, a low with no bolus, so its own Pattern row. Desktop draws
// the logged-carbs day across the wide pane.
const meta = {
  title: 'DayChart',
  component: DayChart,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof DayChart>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The event list's rows, as their text reads. */
const rows = (canvasElement: HTMLElement) =>
  [...canvasElement.querySelectorAll('li')].map((li) => li.textContent?.replace(/\s+/g, ' ').trim() ?? '');

export const Default: Story = {
  args: { data: dayChart('default') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const key of ['Pattern', 'Basal', 'Pump profile', 'Suspend']) await expect(canvas.getByText(key)).toBeVisible();
    await expect(rows(canvasElement).filter((row) => row.includes('Meal · Carb undercount'))).toHaveLength(3);
  },
};
export const WithLoggedCarbs: Story = {
  args: { data: dayChart('with_carbs') },
  play: async ({ canvasElement }) => {
    const list = rows(canvasElement);
    await expect(list.some((row) => row.includes('Meal · Carb undercount'))).toBe(true);
    await expect(list.some((row) => row.includes('Meal · Meal over-delivery'))).toBe(true);
    // A low the engine counted has no bolus to ride on: its own row, with its reading.
    await expect(list.some((row) => /Over-treated low\s*\d+ mg\/dL$/.test(row))).toBe(true);
    // Each finding's row has its Pattern glyph on the chart.
    const named = list.filter((row) => /Carb undercount|Meal over-delivery|Over-treated low/.test(row));
    await expect(canvasElement.querySelectorAll('.ui-daychart__chart .ui-daychart__mark--pattern')).toHaveLength(named.length);
  },
};
export const NoData: Story = {
  args: { data: dayChart('no_data') },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText('Pattern')).toBeNull();
  },
};
export const Desktop: Story = {
  args: { data: dayChart('with_carbs'), layout: 'desktop' },
  parameters: { frame: { width: 1440 } },
};
