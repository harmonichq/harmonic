import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { swipe } from '../../gesture';
import { ranking } from '../../queue-model';
import { failsOnce } from '../../flaky';
import { QUEUE_IC, QUEUE_ISF, QUEUE_UNDRAWABLE } from '../../served-variants';
import { QueueScreen, type QueueScreenProps } from './QueueScreen';

// The Queue screen in each state §1.3 lists, at phone (390) and desktop (1440),
// every value the simulated wearer's served answer:
// - Default: the wearer's ranking, its top item open.
// - Pattern open (one with no attributed cause), and the Setting detail (the
//   basal block), each from the store that serves it.
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
/** The drill-down's own header, which holds its "‹ Queue" (the tab bar has a Queue too). */
const back = (canvas: ReturnType<typeof within>) =>
  canvas.getByRole('heading', { level: 1, name: 'Snoozed' }).closest('header') as HTMLElement;

const DEFAULT = { store: 'wearer' } as const;
const PATTERN_OPEN = {
  store: fixtures.states.no_cause.store, open: `pattern:${fixtures.states.no_cause.pattern}`,
} as QueueScreenProps;
const SETTING_DETAIL = { store: fixtures.states.setting.store, open: 'setting:basal_rate' } as QueueScreenProps;
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

// Desktop: the same Snooze text action beneath Pin (S is its shortcut).
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

// Phone snooze has a visible control as well as the swipe: the play presses
// the open card's Snooze text action beneath Pin, sees the bar, and undoes it.
export const SnoozeUndoPhone: Story = {
  args: { layout: 'phone', store: 'wearer-pinned', open: fixtures.snooze.subject, snooze },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Snooze' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(/Snoozed · Until/);
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
  },
};

// The swipe is Snooze's shortcut on a phone row: short of half its reveal it
// settles back; past half it snoozes the row as Snooze does, the bar with
// Undo, and Undo puts the row back.
export const SwipeSnoozeUndoPhone: Story = {
  args: {
    layout: 'phone', store: 'wearer-pinned', snooze,
    open: ranking('wearer-pinned').find((item) => item.subject !== fixtures.snooze.subject)!.subject,
  },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = () => canvas.getByRole('button', { name: new RegExp(fixtures.snooze.title) });
    await swipe(row(), -30, 6);
    await expect(canvas.queryByRole('status')).toBeNull();
    await swipe(row(), -64);
    await expect(canvas.getByRole('status')).toHaveTextContent(/Snoozed · Until/);
    await expect(canvas.queryByRole('button', { name: new RegExp(fixtures.snooze.title) })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(row()).toBeInTheDocument();
  },
};

// The drill-down (§2.2): the Snoozed row opens the Snoozed list under
// "‹ Queue", and back returns to the Queue with the same item open.
export const SnoozedDrillDownPhone: Story = {
  args: { layout: 'phone', store: 'wearer-pinned-snoozed', open: 'setting:basal_rate' },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = ranking('wearer-pinned-snoozed').find((i) => i.subject === 'setting:basal_rate')!;
    await userEvent.click(canvas.getByRole('button', { name: /Snoozed/ }));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Snoozed' })).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    await userEvent.click(within(back(canvas)).getByRole('button', { name: 'Queue' }));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Queue' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(open.data.title) })).toBeInTheDocument();
  },
};

// Desktop: the drill-down stays in the list pane, under the same "‹ Queue",
// while the open item stays in the detail pane.
export const SnoozedDrillDownDesktop: Story = {
  args: { layout: 'desktop', store: 'wearer-pinned-snoozed', open: 'setting:basal_rate' },
  parameters: { frame: FRAMES.desktop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = ranking('wearer-pinned-snoozed').find((i) => i.subject === 'setting:basal_rate')!;
    await userEvent.click(canvas.getByRole('button', { name: /Snoozed/ }));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Snoozed' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(open.data.title) })).toBeInTheDocument();
    await userEvent.click(within(back(canvas)).getByRole('button', { name: 'Queue' }));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Queue' })).toBeInTheDocument();
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(open.data.title) })).toBeInTheDocument();
  },
};

// Live (#495): a Snooze the engine does not save puts the item back with
// "Not saved", and Retry saves it.
const liveSnoozePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const title = ranking('wearer')[0].data.title;
  await userEvent.click(canvas.getByRole('button', { name: 'Snooze' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(title) })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
};
const liveWrites = (): QueueScreenProps['writes'] => ({
  snooze: failsOnce(undefined), restore: failsOnce(undefined), pin: failsOnce(undefined),
});
export const LiveSnoozeNotSavedPhone: Story = { ...story('phone', { store: 'wearer', writes: liveWrites() }), play: liveSnoozePlay };
export const LiveSnoozeNotSavedDesktop: Story = { ...story('desktop', { store: 'wearer', writes: liveWrites() }), play: liveSnoozePlay };

// A ranking holding candidates the Queue cannot draw (an ISF and an I:C
// Setting with no admitted row, a Pattern the findings serve no row for, and a
// kind the app does not know): they are left out, and the Queue draws the rest.
const undrawablePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 1, name: 'Queue' })).toBeInTheDocument();
  await expect(canvas.queryByText('Unserved')).toBeNull();
  await expect(canvas.queryByText('Unknown')).toBeNull();
  await expect(canvas.getAllByRole('img', { name: 'Pattern' }).length).toBeGreaterThan(0);
};
export const UndrawablePhone: Story = { ...story('phone', { store: QUEUE_UNDRAWABLE }), play: undrawablePlay };
export const UndrawableDesktop: Story = { ...story('desktop', { store: QUEUE_UNDRAWABLE }), play: undrawablePlay };

// An admitted ISF, and an admitted I:C, Setting: the SettingCard with its
// block, current → suggested and Range, printed as the pump profile prints
// each, and no night chart or count, since its evidence is not nights.
const settingPlay = (title: string, units: string): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(`^${title}`) })).toBeInTheDocument();
  await expect(canvas.getAllByText(units).length).toBeGreaterThan(0);
  await expect(canvas.queryByText('Nights')).toBeNull();
  await expect(canvas.getByText('Range')).toBeInTheDocument();
};
export const IsfSettingPhone: Story = { ...story('phone', { store: QUEUE_ISF, open: 'setting:isf' }), play: settingPlay('ISF', 'mg/dL/U') };
export const IsfSettingDesktop: Story = { ...story('desktop', { store: QUEUE_ISF, open: 'setting:isf' }), play: settingPlay('ISF', 'mg/dL/U') };
export const IcSettingPhone: Story = { ...story('phone', { store: QUEUE_IC, open: 'setting:carb_ratio' }), play: settingPlay('I:C', 'g/U') };
export const IcSettingDesktop: Story = { ...story('desktop', { store: QUEUE_IC, open: 'setting:carb_ratio' }), play: settingPlay('I:C', 'g/U') };
