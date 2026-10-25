import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { formatValue } from '../../provenance.js';
import { loggedGrams, loggedTime } from '../../day-model';
import { LogCarbsEntry, type LogCarbsState } from './LogCarbsEntry';

// One story per state (§4.2 LogCarbsEntry) on the phone's bottom sheet: empty,
// filled and Time edited; and the desktop popover under its trigger, filled. A
// filled amount, and an edited time, are one entry the simulated wearer logged.
// One flow runs as a play function: typing that amount and saving.
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
export const TimeEdited: Story = { args: { state: 'filled', grams: loggedGrams(), time: loggedTime() } };
export const Desktop: Story = {
  args: { state: 'filled', grams: loggedGrams(), layout: 'desktop' },
  parameters: { frame: { width: 420, padding: 32 } },
};

const typed = formatValue(loggedGrams().value, loggedGrams().format);

/** The sheet as a screen drives it: typing fills it, Save saves. */
function Flow({ initial, onSave }: { initial: LogCarbsState; onSave: () => void }) {
  const [state, setState] = useState<LogCarbsState>(initial);
  return (
    <LogCarbsEntry state={state} grams={loggedGrams()}
      onGramsChange={(text) => setState(text ? 'filled' : 'empty')} onSave={onSave} />
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
  },
};
