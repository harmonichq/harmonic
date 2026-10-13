import type { Meta, StoryObj } from '@storybook/react-vite';
import { dayChart } from '../../day-model';
import { DayChart } from './DayChart';

// One story per state (§4.2 DayChart), each a day of the simulated wearer
// picked by rule: the latest day with readings, a site change and no logged
// carbs, the latest of the days with the most logged carbs, and the first day
// after the history ends. Every day with readings shows the sleep schedule.
// Desktop draws the logged-carbs day across the wide pane.
const meta = {
  title: 'DayChart',
  component: DayChart,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof DayChart>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: dayChart('default') } };
export const WithLoggedCarbs: Story = { args: { data: dayChart('with_carbs') } };
export const NoData: Story = { args: { data: dayChart('no_data') } };
export const Desktop: Story = {
  args: { data: dayChart('with_carbs'), layout: 'desktop', width: 1376 },
  parameters: { frame: { width: 1440 } },
};
