import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { NavBar } from '../NavBar/NavBar';
import { TransientBar } from './TransientBar';

// One story per state (§4.2 TransientBar), each above the phone's tab bar as
// it sits on screen: after the pinned store's person snoozed a pattern (the
// date is the engine's decision time plus the 14 days of a snooze, in one
// phrase, §2.5 2026-10-20), after a Done, after a Focus starts (Changes opens
// that tab), and after a write that failed. Desktop shows the bar at the bottom of the detail pane,
// where ⌘Z also undoes. Each play presses the bar's one action.
const meta: Meta<typeof TransientBar> = {
  title: 'TransientBar',
  component: TransientBar,
  parameters: { frame: { width: 390, padding: 0 } },
  decorators: [(Story, context) => context.args.layout === 'desktop' ? <Story /> : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 16 }}>
      <div style={{ padding: '0 16px' }}><Story /></div>
      <NavBar layout="tabbar" selected="queue" />
    </div>
  )],
};
export default meta;

type Story = StoryObj<typeof TransientBar>;

const until = sourced<string>('snooze.decided_at', 'until');
const snoozed = fixtures.snooze.set_aside;

export const Snoozed: Story = {
  args: { kind: 'snoozed', until, onUndo: fn() },
  play: async ({ args, canvasElement }) => {
    await expect(snoozed).toBe(true);
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(/^Snoozed until \d/);
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Undo' }));
    await expect('onUndo' in args && args.onUndo).toHaveBeenCalledOnce();
  },
};
// After a Done (#518): the setting waits for the pump, and Undo takes it back.
export const Waiting: Story = {
  args: { kind: 'waiting', onUndo: fn() },
  play: async ({ args, canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Waiting for pump');
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Undo' }));
    await expect('onUndo' in args && args.onUndo).toHaveBeenCalledOnce();
  },
};
// After a Focus starts (§2.5, 2026-10-20): its action opens Changes, and it has
// no Undo, so ⌘Z does nothing.
export const FocusStarted: Story = {
  args: { kind: 'focused', onChanges: fn() },
  play: async ({ args, canvasElement }) => {
    const bar = within(canvasElement).getByRole('status');
    await expect(bar).toHaveTextContent('Focus started');
    await expect(within(bar).queryByRole('button', { name: 'Undo' })).toBeNull();
    await userEvent.click(within(bar).getByRole('button', { name: 'Changes' }));
    await expect('onChanges' in args && args.onChanges).toHaveBeenCalledOnce();
  },
};
export const NotSaved: Story = {
  args: { kind: 'not_saved', onRetry: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Retry' }));
    await expect('onRetry' in args && args.onRetry).toHaveBeenCalledOnce();
  },
};
export const DesktopUndoShortcut: Story = {
  args: { kind: 'snoozed', until, onUndo: fn(), layout: 'desktop' },
  parameters: { frame: { width: 560, padding: 32 } },
  play: async ({ args }) => {
    await userEvent.keyboard('{Meta>}z{/Meta}');
    await expect('onUndo' in args && args.onUndo).toHaveBeenCalledOnce();
  },
};
