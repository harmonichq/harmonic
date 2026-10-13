import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { ranking } from '../../queue-model';
import { QueueScreen, type QueueScreenProps } from './QueueScreen';

// The Queue screen in each state §1.3 lists, at phone (390) and desktop (1440),
// every value the simulated wearer's served answer:
// - Default: the wearer's ranking, its top item open.
// - Pattern open, and the Setting detail (the basal block).
// - Just snoozed: the pinned store's person snoozed a pattern; the screen shows
//   the Queue the engine served after it, the bar's Until, and the Snoozed row.
// - Snoozed list: the first days with everything snoozed, each with Restore.
// - Empty: the same store's Queue, "0 patterns", with its Snoozed row.
// - Loading, and Unavailable (the unsynced store serves guidance unavailable).
// - Phone mid-swipe: a row held over its Snooze reveal, the QueueRow's own
//   still state.
// Two desktop plays: selecting a row opens it; Snooze shows the bar, and Undo
// puts the item back.
const meta: Meta<typeof QueueScreen> = {
  title: 'Screens/Queue',
  component: QueueScreen,
};
export default meta;

type Story = StoryObj<typeof QueueScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

const snooze: QueueScreenProps['snooze'] = {
  subject: fixtures.snooze.subject,
  after: 'wearer-pinned-snoozed',
  until: sourced<string>('snooze.decided_at', 'until'),
};
const unavailable = fixtures.overview['wearer-unsynced'].guidance.disposition === 'unavailable';

const story = (layout: 'phone' | 'desktop', args: Omit<QueueScreenProps, 'layout'>): Story => ({
  args: { ...args, layout },
  parameters: { frame: FRAMES[layout] },
});

const second = (store: 'wearer') => ranking(store)[1].subject;

const DEFAULT = { store: 'wearer' } as const;
const PATTERN_OPEN = { store: 'wearer', open: 'pattern:overnight_lows_no_iob' } as const;
const SETTING_DETAIL = { store: 'wearer', open: 'setting:basal_rate' } as const;
const JUST_SNOOZED = { store: 'wearer-pinned', snooze, justSnoozed: true } as const;
const SNOOZED_LIST = { store: 'wearer-first-days-snoozed', view: 'snoozed' } as const;
const EMPTY = { store: 'wearer-first-days-snoozed' } as const;
const LOADING = { store: 'wearer', state: 'loading' } as const;
const UNAVAILABLE = { store: 'wearer', state: unavailable ? 'unavailable' : 'ready' } as const;

export const DefaultPhone = story('phone', DEFAULT);
export const DefaultDesktop = story('desktop', DEFAULT);
export const PatternOpenPhone = story('phone', PATTERN_OPEN);
export const PatternOpenDesktop = story('desktop', PATTERN_OPEN);
export const SettingDetailPhone = story('phone', SETTING_DETAIL);
export const SettingDetailDesktop = story('desktop', SETTING_DETAIL);
export const JustSnoozedPhone = story('phone', JUST_SNOOZED);
export const JustSnoozedDesktop = story('desktop', JUST_SNOOZED);
export const SnoozedListPhone = story('phone', SNOOZED_LIST);
export const SnoozedListDesktop = story('desktop', SNOOZED_LIST);
export const EmptyPhone = story('phone', EMPTY);
export const EmptyDesktop = story('desktop', EMPTY);
export const LoadingPhone = story('phone', LOADING);
export const LoadingDesktop = story('desktop', LOADING);
export const UnavailablePhone = story('phone', UNAVAILABLE);
export const UnavailableDesktop = story('desktop', UNAVAILABLE);
export const MidSwipePhone: Story = {
  args: { layout: 'phone', store: 'wearer', swiping: second('wearer') },
  parameters: { frame: FRAMES.phone },
};

export const SelectRowDesktop: Story = {
  args: { layout: 'desktop', store: 'wearer' },
  parameters: { frame: FRAMES.desktop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const target = ranking('wearer')[1];
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(target.data.title) }));
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(target.data.title) })).toBeInTheDocument();
  },
};

export const SnoozeUndoDesktop: Story = {
  args: { layout: 'desktop', store: 'wearer-pinned', open: fixtures.snooze.subject, snooze },
  parameters: { frame: FRAMES.desktop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = fixtures.snooze.title;
    await expect(canvas.getAllByText(title).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Snooze' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(/Snoozed · Until/);
    await expect(canvas.queryByRole('button', { name: new RegExp(title) })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(canvas.getAllByText(title).length).toBeGreaterThan(0);
  },
};
