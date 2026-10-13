import type { Meta, StoryObj } from '@storybook/react-vite';
import { dayState } from '../../overview-model';
import { DayTile } from './DayTile';

// §4.2 DayTile, from the simulated wearer's day navigator for its last month:
// the latest day with lows or highs (default, and selected), the latest day
// with neither (clean), and the first day after the history ends (no data).
const meta = {
  title: 'DayTile',
  component: DayTile,
  parameters: { frame: { width: 193 } },
} satisfies Meta<typeof DayTile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { day: dayState('default') } };
export const Selected: Story = { args: { day: dayState('default'), selected: true } };
export const Clean: Story = { args: { day: dayState('clean') } };
export const NoData: Story = { args: { day: dayState('no_data') } };
