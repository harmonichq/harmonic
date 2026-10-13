import type { Meta, StoryObj } from '@storybook/react-vite';
import { change } from '../../changes-model';
import { ChangeCard } from './ChangeCard';

// One story per state (§4.2 ChangeCard), each a store of the simulated
// wearer: its basal Trial six days in (maturing), the same Trial matured with
// End offered and its retained comparison, that Trial once ended, a second
// wearer's matured Trial, a pinned Focus, and the wearer's first days, with no
// active change.
//
// The matured result is the engine's verdict on the Trial's own target metric
// (below 70 for basal). The wearer's 02:00 basal ran its small hours low, and
// lowering it ends those lows, so the engine serves Better. The second wearer
// had that block right and raised it in the wrong direction, so the small
// hours start running low and the engine serves Worse; the generator fails if
// either result stops being served.
const meta = {
  title: 'ChangeCard',
  component: ChangeCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ChangeCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const TrialMaturing: Story = { args: { data: change('wearer-trial-maturing') } };
export const TrialMatured: Story = { args: { data: change('wearer') } };
export const TrialWorse: Story = { args: { data: change('wearer-worse') } };
export const TrialEnded: Story = { args: { data: change('wearer-ended') } };
export const FocusActive: Story = { args: { data: change('wearer-pinned') } };
export const NoActiveChange: Story = { args: { data: change('wearer-first-days') } };
