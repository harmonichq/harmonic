import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { day } from '../../overview-model';
import { dayDate, weekOf } from '../../day-model';
import { formatValue } from '../../provenance.js';
import { DayRibbon } from './DayRibbon';

// One story per state (§4.2 DayRibbon), from the simulated wearer's day
// navigator: the week of its latest day with readings, that day selected, at
// the phone's width and across a desktop pane; and the week after the history
// ends, with no readings. A play picks another day.
const meta = {
  title: 'DayRibbon',
  component: DayRibbon,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof DayRibbon>;
export default meta;

type Story = StoryObj<typeof meta>;

const { latest, default: other, no_data: noData } = fixtures.day.states;
const week = (iso: string) => weekOf(iso)!.map(day);

export const Default: Story = { args: { days: week(latest) } };
export const Selected: Story = { args: { days: week(latest), selected: latest } };
export const NoData: Story = { args: { days: week(noData) } };
export const Desktop: Story = {
  args: { days: week(latest), selected: latest },
  parameters: { frame: { width: 1440 } },
};

export const PickDay: Story = {
  args: { days: week(latest), selected: latest, onSelect: fn() },
  play: async ({ args, canvasElement }) => {
    const { weekday, date } = dayDate(other);
    await userEvent.click(within(canvasElement).getByRole('button', { name: `${weekday} ${formatValue(date.value, 'date')}` }));
    await expect(args.onSelect).toHaveBeenCalledWith(other);
  },
};
