import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { expectDirections, type Tone } from '../../direction-check';
import { metricState } from '../../overview-model';
import { MetricFigure } from './MetricFigure';

// §4.2 MetricFigure, one story per state, each the first served metric in that
// state against the period before its window (overview-model.ts metricState):
// better (moved the good way, green); worse (the bad way, red); a window whose
// previous period holds no readings (no change); and a store before its first
// sync, which serves no metric (not available). No served metric prints the
// same as its previous period, so the unchanged state (no arrow, neutral ink)
// is the Delta's story.
const meta = {
  title: 'MetricFigure',
  component: MetricFigure,
  parameters: { frame: { width: 160 } },
} satisfies Meta<typeof MetricFigure>;
export default meta;

type Story = StoryObj<typeof meta>;

const toned = (tone: Tone): Story['play'] => async ({ canvasElement }) => {
  await expect(await expectDirections(canvasElement, '.ui-metric', '.ui-metric__label')).toEqual([tone]);
};

export const Better: Story = { args: { data: metricState('better') }, play: toned('favorable') };
export const Worse: Story = { args: { data: metricState('worse') }, play: toned('adverse') };
export const NoPrevious: Story = { args: { data: metricState('no_previous') } };
export const NotAvailable: Story = { args: { data: metricState('unavailable') } };
