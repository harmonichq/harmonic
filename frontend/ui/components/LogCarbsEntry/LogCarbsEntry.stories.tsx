import type { Meta, StoryObj } from '@storybook/react-vite';
import { loggedGrams } from '../../day-model';
import { LogCarbsEntry, type LogCarbsState } from './LogCarbsEntry';

// One story per state (§4.2 LogCarbsEntry) on the phone's bottom sheet: empty,
// filled, saving and not saved; and the desktop popover under its trigger,
// filled. A filled amount is one the simulated wearer logged.
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
