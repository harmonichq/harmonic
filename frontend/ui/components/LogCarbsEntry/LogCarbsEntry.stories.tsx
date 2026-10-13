import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { formatValue } from '../../provenance.js';
import { loggedGrams } from '../../day-model';
import { LogCarbsEntry, type LogCarbsState } from './LogCarbsEntry';

// One story per state (§4.2 LogCarbsEntry) on the phone's bottom sheet: empty,
// filled, saving and not saved; and the desktop popover under its trigger,
// filled. A filled amount is one the simulated wearer logged. Two flows run
// as play functions: typing that amount and saving (Save goes busy), and
// retrying a save that failed.
const meta = {
  title: 'LogCarbsEntry',
  component: LogCarbsEntry,
  parameters: { frame: { width: 390, padding: 0 } },
} satisfies Meta<typeof LogCarbsEntry>;
export default meta;

type Story = StoryObj<typeof meta>;

const sheet = (state: LogCarbsState): Story => ({ args: { state, grams: loggedGrams() } });

export const Empty = sheet('empty');
export const Filled = sheet('filled');
export const Saving = sheet('saving');
export const NotSaved = sheet('not_saved');
export const Desktop: Story = {
  args: { state: 'filled', grams: loggedGrams(), layout: 'desktop' },
  parameters: { frame: { width: 420, padding: 32 } },
};

const typed = formatValue(loggedGrams().value, loggedGrams().format);

/** The sheet as a screen drives it: typing fills it, Save or Retry saves. */
function Flow({ initial, onSave }: { initial: LogCarbsState; onSave: () => void }) {
  const [state, setState] = useState<LogCarbsState>(initial);
  return (
    <LogCarbsEntry state={state} grams={loggedGrams()}
      onGramsChange={(text) => setState(text ? 'filled' : 'empty')}
      onSave={() => { onSave(); setState('saving'); }} />
  );
}

export const TypeAndSave: Story = {
  args: { state: 'empty', onSave: fn() },
  render: (args) => <Flow initial="empty" onSave={args.onSave!} />,
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole('button', { name: 'Save' });
    await expect(save).toBeDisabled();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), typed);
    await expect(save).toBeEnabled();
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(save).toHaveAttribute('aria-busy', 'true');
  },
};

export const RetryAfterNotSaved: Story = {
  args: { state: 'not_saved', onSave: fn() },
  render: (args) => <Flow initial="not_saved" onSave={args.onSave!} />,
  play: async ({ args, canvasElement }) => {
    const retry = within(canvasElement).getByRole('button', { name: 'Retry' });
    await userEvent.click(retry);
    await expect(args.onSave).toHaveBeenCalledOnce();
    await expect(retry).toHaveAttribute('aria-busy', 'true');
  },
};
