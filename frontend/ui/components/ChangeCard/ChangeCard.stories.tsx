import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { change } from '../../changes-model';
import { ChangeCard } from './ChangeCard';

// One story per state (§4.2 ChangeCard), each a store of the simulated
// wearer: its basal Trial six days in (maturing), the same Trial matured with
// End offered, a second wearer's matured Trial, a carb ratio Trial a few days
// in (Meals before and after), a whole-profile switch naming each setting it
// moved, a Focus pinned at the end of the history (no data yet), one pinned on
// the Trial day a day in (maturing) and four weeks in (matured), and the
// wearer's first days, with no active change.
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
export const CarbRatioMaturing: Story = {
  args: { data: change('wearer-ic-maturing') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: /^I:C 11:00–14:00$/ })).toBeInTheDocument();
    await expect(canvas.getByText('Meals before')).toBeInTheDocument();
    await expect(canvas.getByText('Meals after')).toBeInTheDocument();
  },
};
export const ProfileSwitch: Story = {
  args: { data: change('wearer-profile') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Pump profile' })).toBeInTheDocument();
    // Each setting the switch moved, named on its own line.
    for (const name of ['Basal', 'I:C']) await expect(canvas.getByText(name)).toBeInTheDocument();
    await expect(canvas.queryByText('Meals before')).toBeNull();
  },
};
export const FocusNoDataYet: Story = { args: { data: change('wearer-pinned') } };
export const FocusMaturing: Story = { args: { data: change('wearer-focus-maturing') } };
export const FocusMatured: Story = { args: { data: change('wearer-focus') } };
// A Focus pinned on a standalone habit (ADR 528): no Pattern, so its title line
// is the habit and its date alone.
export const FocusOnHabit: Story = {
  args: { data: change('missed-meal-pinned') },
  play: async ({ canvasElement }) => {
    const data = change('missed-meal-pinned');
    if (data.kind !== 'focus') throw new Error('missed-meal-pinned serves no active Focus');
    await expect(data.pattern).toBeNull();
    const title = canvasElement.querySelector('.ui-change__title') as HTMLElement;
    await expect(title.textContent).toContain(data.habit);
    await expect(title.querySelector('.ui-change__meta')!.textContent).not.toContain('·');
  },
};
export const NoActiveChange: Story = { args: { data: change('wearer-first-days') } };

// End (§1.3a): on a matured Trial the play presses End, which the screen
// answers with its confirm sheet.
export const EndFlow: Story = {
  args: { data: change('wearer'), onEnd: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'End' }));
    await expect(args.onEnd).toHaveBeenCalledOnce();
  },
};
