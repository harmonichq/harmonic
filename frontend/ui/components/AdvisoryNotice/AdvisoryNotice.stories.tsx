import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { glossary } from '../../settings-model';
import { AdvisoryNotice } from './AdvisoryNotice';

// The notice as it opens the app, at each frame (§2.4). Its one state; the play
// presses its one action.
const entry = glossary().find((e) => e.term === 'Advisory')!;

const meta: Meta<typeof AdvisoryNotice> = {
  title: 'AdvisoryNotice',
  component: AdvisoryNotice,
  args: { term: entry.term, meaning: entry.meaning, onUnderstood: fn() },
  parameters: { frame: { width: 390, padding: 0 } },
};
export default meta;

type Story = StoryObj<typeof AdvisoryNotice>;

export const Phone: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Understood' }));
    await expect(args.onUnderstood).toHaveBeenCalledOnce();
  },
};

export const Desktop: Story = {
  parameters: { frame: { width: 1440, padding: 0 } },
};
