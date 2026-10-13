import type { Meta, StoryObj } from '@storybook/react-vite';
import { change } from '../../changes-model';
import { ChangeCard } from './ChangeCard';

// One story per state (§4.2 ChangeCard), each a store of the simulated
// wearer: its basal Trial six days in (maturing), the same Trial matured with
// End offered and its retained comparison, that Trial once ended, a pinned
// Focus, and the wearer's first days, with no active change.
//
// The matured result is the engine's verdict on the Trial's own target metric
// (below 70 for basal). The wearer's changed slot stays in range before and
// after, so the engine serves Unclear; Better and Worse do not arise from this
// wearer and have no ChangeCard story. The card prints them on the same
// StatePill, whose own stories show both.
const meta = {
  title: 'ChangeCard',
  component: ChangeCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ChangeCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const TrialMaturing: Story = { args: { data: change('wearer-trial-maturing') } };
export const TrialMatured: Story = { args: { data: change('wearer') } };
export const TrialEnded: Story = { args: { data: change('wearer-ended') } };
export const FocusActive: Story = { args: { data: change('wearer-pinned') } };
export const NoActiveChange: Story = { args: { data: change('wearer-first-days') } };
