import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { dayChart, minuteOf } from '../../day-model';
import { fixtures } from '../../fixtures';
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
    // The basal scale's two labels each sit on the canvas, so no bar, hatch or profile line crosses them.
    const canvasFill = getComputedStyle(canvasElement.querySelector('.ui-daychart__halo')!).fill;
    const labels = [...canvasElement.querySelectorAll('[data-axis] .ui-daychart__scale')].filter((label) => /^[+−]/.test(label.textContent ?? ''));
    await expect(labels).toHaveLength(2);
    for (const label of labels) {
      const plate = canvasElement.querySelector(`${label.getAttribute('filter')?.slice(4, -1)} feFlood`);
      await expect(plate && getComputedStyle(plate).floodColor).toBe(canvasFill);
    }
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
    const named = list.filter((row) => /Carb undercount|Late bolus|Meal over-delivery|Over-treated low/.test(row));
    await expect(canvasElement.querySelectorAll('.ui-daychart__chart .ui-daychart__mark--pattern')).toHaveLength(named.length);
  },
};
// A day an hour of whose readings the store withholds, their records
// disagreeing (ADR 519): the trace breaks there, as where readings stop, and
// draws no withheld reading at all.
export const Withheld: Story = {
  args: { data: dayChart('withheld') },
  play: async ({ canvasElement }) => {
    const served = fixtures.day.days[fixtures.day.states.withheld as keyof typeof fixtures.day.days].timeline.cgm;
    const withheld = served.filter((reading) => reading.bg === null).map((reading) => minuteOf(reading.t));
    await expect(withheld.length).toBeGreaterThan(0);
    const svg = canvasElement.querySelector<SVGSVGElement>('.ui-daychart__chart')!;
    const x = (minute: number) => svg.width.baseVal.value * (minute / 1440);
    const [from, to] = [x(Math.min(...withheld)), x(Math.max(...withheld))];
    const vertices = [...svg.querySelectorAll('.ui-daychart__trace--in-range')]
      .flatMap((line) => (line.getAttribute('points') ?? '').split(' ').map((point) => Number(point.split(',')[0])));
    await expect(vertices.filter((at) => at >= from - 0.1 && at <= to + 0.1)).toEqual([]);
    await expect(vertices.some((at) => at < from) && vertices.some((at) => at > to)).toBe(true);
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
