import type { Meta, StoryObj } from '@storybook/react-vite';
import { tirBands } from '../../overview-model';
import { TimeInRangeBar } from './TimeInRangeBar';

// §4.2 TimeInRangeBar: one story per window, each the simulated wearer's
// served outcome metrics for that window.
const meta = {
  title: 'TimeInRangeBar',
  component: TimeInRangeBar,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof TimeInRangeBar>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Window14: Story = { args: { bands: tirBands('14') } };
export const Window30: Story = { args: { bands: tirBands('30') } };
export const Window90: Story = { args: { bands: tirBands('90') } };
