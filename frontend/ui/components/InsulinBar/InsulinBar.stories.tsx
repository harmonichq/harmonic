import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtures } from '../../fixtures';
import { insulinBar } from '../../day-model';
import { InsulinBar } from './InsulinBar';

// One story per state (§4.2 InsulinBar), from the simulated wearer's served
// timeline: the latest day with readings, its basal against the pump profile
// beside Basal; the same across a desktop pane; the first day after the
// history ends, which serves no insulin and shows no bar; and loading.
const meta = {
  title: 'InsulinBar',
  component: InsulinBar,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof InsulinBar>;
export default meta;

type Story = StoryObj<typeof meta>;

const { latest, no_data: noData } = fixtures.day.states;

export const Default: Story = { args: { data: insulinBar(latest) } };
export const Desktop: Story = { args: { data: insulinBar(latest) }, parameters: { frame: { width: 1440 } } };
export const NoData: Story = { args: { data: insulinBar(noData) } };
export const Loading: Story = { args: { data: null, loading: true } };
