import type { Meta, StoryObj } from '@storybook/react-vite';
import { patternState } from '../../queue-model';
import { PatternCard } from './PatternCard';

// One story per state (§4.2 PatternCard), each the simulated wearer's own
// served answer, picked by the fixture generator:
// - MultiCause: a counted pattern with two or more attributed causes.
// - SingleCause: one attributed cause.
// - NoCause: a counted pattern no cause claims.
// - Pinned: the pattern a Focus was pinned on through the engine.
// - Uncertain: the pattern the engine serves `wide` (ADR 485), its tag at the
//   end of the magnitude line.
const meta = {
  title: 'PatternCard',
  component: PatternCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PatternCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const MultiCause: Story = { args: { data: patternState('multi_cause') } };
export const SingleCause: Story = { args: { data: patternState('single_cause') } };
export const NoCause: Story = { args: { data: patternState('no_cause') } };
export const Uncertain: Story = { args: { data: patternState('uncertain') } };
export const Pinned: Story = { args: { data: patternState('pinned') } };
export const Loading: Story = { args: { loading: true } };
