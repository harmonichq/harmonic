import type { Meta, StoryObj } from '@storybook/react-vite';
import { metricState } from '../../overview-model';
import { MetricFigure } from './MetricFigure';

// §4.2 MetricFigure, one story per state, each the first served metric in that
// state against the period before its window (overview-model.ts metricState):
// better; worse; a window whose previous period holds no readings (no change);
// and a store before its first sync, which serves no metric (not available).
// No served metric prints the same as its previous period, so the unchanged
// state (no arrow, neutral ink) has no story.
const meta = {
  title: 'MetricFigure',
  component: MetricFigure,
  parameters: { frame: { width: 160 } },
} satisfies Meta<typeof MetricFigure>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Better: Story = { args: { data: metricState('better') } };
export const Worse: Story = { args: { data: metricState('worse') } };
export const NoPrevious: Story = { args: { data: metricState('no_previous') } };
export const NotAvailable: Story = { args: { data: metricState('unavailable') } };
