import type { Meta, StoryObj } from '@storybook/react-vite';
import { metricState } from '../../overview-model';
import { MetricFigure } from './MetricFigure';

// §4.2 MetricFigure, one story per state, each the first served metric in that
// state (overview-model.ts metricState): the wearer's 30 d In range rose
// against 90 d (better) and its 14 d In range fell (worse); the pinned store's
// 30 d Below 70 equals its 90 d value (unchanged); a store before its first
// sync serves no metric (not available).
const meta = {
  title: 'MetricFigure',
  component: MetricFigure,
  parameters: { frame: { width: 160 } },
} satisfies Meta<typeof MetricFigure>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Better: Story = { args: { data: metricState('better') } };
export const Worse: Story = { args: { data: metricState('worse') } };
export const Unchanged: Story = { args: { data: metricState('unchanged') } };
export const NotAvailable: Story = { args: { data: metricState('unavailable') } };
