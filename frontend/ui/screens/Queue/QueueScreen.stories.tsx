import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { swipe } from '../../gesture';
import { ranking } from '../../queue-model';
import { failsOnce } from '../../flaky';
import { QUEUE_UNDRAWABLE } from '../../served-variants';
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
// - Loading, and Unavailable (the unsynced store serves guidance unavailable);
//   Stale, the last answers under Unavailable.
// - Phone mid-swipe: a row held over its Snooze reveal, the QueueRow's own
//   still state.
// - Done (#518): a fresh wearer's basal card Done and undone, and the same card
//   back Not on pump after an unchanged sync.
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
  store: fixtures.states.traces_episodes.store, open: `pattern:${fixtures.states.traces_episodes.pattern}`,
} as QueueScreenProps;
const SETTING_DETAIL = { store: fixtures.states.setting.store, open: 'setting:basal_rate' } as QueueScreenProps;
const JUST_SNOOZED = { store: 'wearer-pinned', snooze, justSnoozed: true } as const;
const SNOOZED_LIST = { store: 'wearer-first-days-snoozed', view: 'snoozed' } as const;
const EMPTY = { store: 'wearer-first-days-snoozed' } as const;
const LOADING = { store: 'wearer', state: 'loading' } as const;
const UNAVAILABLE = { store: 'wearer', state: unavailable ? 'unavailable' : 'ready' } as const;

// A row is the same height with or without its trailing impact (§2.5,
// 2026-10-14), and its chevron stays centred on its title line.
const rowsLevel: Story['play'] = async ({ canvasElement }) => {
  const rows = [...canvasElement.querySelectorAll<HTMLElement>('.ui-qrow[data-role="row"]')];
  const trailing = rows.filter((row) => row.querySelector('.ui-qrow__impact'));
  await expect(trailing.length).toBeGreaterThan(0);
  await expect(trailing.length).toBeLessThan(rows.length);
  const heights = new Set(rows.map((row) => row.getBoundingClientRect().height));
  await expect([...heights]).toHaveLength(1);
  for (const row of rows) {
    const chevron = row.querySelector('.ui-qrow__chevron');
    if (!chevron) continue;
    const title = row.querySelector('.ui-qrow__title')!.getBoundingClientRect();
    const box = chevron.getBoundingClientRect();
    await expect(Math.abs((box.top + box.bottom) / 2 - (title.top + title.bottom) / 2)).toBeLessThanOrEqual(1);
  }
};

export const DefaultPhone: Story = { ...story('phone', DEFAULT), play: rowsLevel };
export const DefaultDesktop: Story = { ...story('desktop', DEFAULT), play: rowsLevel };
export const PatternOpenPhone = story('phone', PATTERN_OPEN);
export const PatternOpenDesktop = story('desktop', PATTERN_OPEN);
export const SettingDetailPhone = story('phone', SETTING_DETAIL);
export const SettingDetailDesktop = story('desktop', SETTING_DETAIL);

// The Basal block open inside the matured Trial's block (#506): the card names
// the Trial and links to Changes, though the block starts after the Trial's start.
const SETTING_TRIAL = { store: fixtures.states.setting_trial.store, open: 'setting:basal_rate' } as QueueScreenProps;
const trialPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement.querySelector('.ui-scard__trial') as HTMLElement);
  await expect(canvas.getByText('Trial')).toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: 'Changes' })).toBeInTheDocument();
};
export const SettingTrialPhone: Story = { ...story('phone', SETTING_TRIAL), play: trialPlay };
export const SettingTrialDesktop: Story = { ...story('desktop', SETTING_TRIAL), play: trialPlay };
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
// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
export const StalePhone = story('phone', { store: 'wearer', state: 'stale' });
export const StaleDesktop = story('desktop', { store: 'wearer', state: 'stale' });
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
  done: failsOnce(undefined), undoDone: failsOnce(undefined),
});
export const LiveSnoozeNotSavedPhone: Story = { ...story('phone', { store: 'wearer', writes: liveWrites() }), play: liveSnoozePlay };
export const LiveSnoozeNotSavedDesktop: Story = { ...story('desktop', { store: 'wearer', writes: liveWrites() }), play: liveSnoozePlay };

// Done (#518), a Setting card's primary: a fresh wearer presses Done on the
// basal card. The screen shows the Queue the engine served after it (the card
// is gone), the bar reads "Waiting for pump", and Undo (the bar's, or ⌘Z on
// desktop) puts the card back. Snooze stays the text action beneath Done.
const done: QueueScreenProps['done'] = { subject: 'setting:basal_rate', after: 'wearer-done' };
const DONE = { store: 'wearer-before-done', open: 'setting:basal_rate', done } as QueueScreenProps;
const basalCard = (canvas: ReturnType<typeof within>) => canvas.queryByRole('heading', { level: 2, name: /^Basal/ });
const doneUndoPlay = (undo: 'click' | 'shortcut'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(ranking('wearer-done').some((item) => item.subject === 'setting:basal_rate')).toBe(false);
  const card = within(canvasElement.querySelector('.ui-scard') as HTMLElement);
  const [doneButton, snoozeButton] = [card.getByRole('button', { name: 'Done' }), card.getByRole('button', { name: 'Snooze' })];
  await expect(doneButton.getBoundingClientRect().bottom).toBeLessThan(snoozeButton.getBoundingClientRect().top);
  // Desktop lists the basal row beside its open card; the phone opens the card in the row's place.
  const basalRow = () => canvas.queryByRole('button', { name: /^Setting Basal/ });
  await expect(basalRow() !== null).toBe(undo === 'shortcut');
  await userEvent.click(doneButton);
  await expect(canvas.getByRole('status')).toHaveTextContent('Waiting for pump');
  await expect(basalCard(canvas)).toBeNull();
  await expect(basalRow()).toBeNull();
  if (undo === 'click') await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
  else await userEvent.keyboard('{Meta>}z{/Meta}');
  await expect(canvas.queryByRole('status')).toBeNull();
  await expect(basalCard(canvas)).toBeInTheDocument();
  await expect(basalRow() !== null).toBe(undo === 'shortcut');
};
export const DoneUndoPhone: Story = { ...story('phone', DONE), play: doneUndoPlay('click') };
export const DoneUndoDesktop: Story = { ...story('desktop', DONE), play: doneUndoPlay('shortcut') };

// The same wearer after a later sync whose read found the basal unchanged: the
// engine serves the card back Not on pump, on its row (desktop) and its card,
// which offers Done again.
const NOT_ON_PUMP = { store: 'wearer-not-on-pump', open: 'setting:basal_rate' } as QueueScreenProps;
const notOnPumpPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const card = within(canvasElement.querySelector('.ui-scard') as HTMLElement);
  await expect(card.getByText('Not on pump')).toBeInTheDocument();
  await expect(card.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  if (layout === 'desktop') {
    const row = within(canvasElement).getByRole('button', { name: /^Setting Basal/ });
    await expect(within(row).getByText('Not on pump')).toBeInTheDocument();
  }
  await expect(canvasElement.querySelectorAll('.ui-pill--not_on_pump').length).toBe(layout === 'desktop' ? 2 : 1);
};
export const NotOnPumpPhone: Story = { ...story('phone', NOT_ON_PUMP), play: notOnPumpPlay('phone') };
export const NotOnPumpDesktop: Story = { ...story('desktop', NOT_ON_PUMP), play: notOnPumpPlay('desktop') };

// Live: a Done the engine does not save puts the card back with "Not saved",
// and Retry saves it; then the bar reads "Waiting for pump".
const liveDonePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(basalCard(canvas)).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Waiting for pump'));
};
const LIVE_DONE = { store: 'wearer-before-done', open: 'setting:basal_rate' } as QueueScreenProps;
export const LiveDoneNotSavedPhone: Story = { ...story('phone', { ...LIVE_DONE, writes: liveWrites() }), play: liveDonePlay };
export const LiveDoneNotSavedDesktop: Story = { ...story('desktop', { ...LIVE_DONE, writes: liveWrites() }), play: liveDonePlay };

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

// A queued ISF (§2.5, 2026-10-14): the store whose ISF the engine supports a
// change for. Its row prints current → recommended with no time block; open,
// it is the Overview's ISF card in the Queue's frame: titled "ISF" alone,
// current → recommended above the fasting nights' chart (one dot per night),
// Estimate, Range and Fasting nights beneath, and Snooze at its foot.
const ISF_STORE = 'isf-supported' as const;
const isfPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const isf = ranking(ISF_STORE).find((i) => i.subject === 'setting:isf')!;
  if (isf.kind !== 'isf') throw new Error('the queued ISF is not drawn as the ISF card');
  await expect(canvas.getByRole('heading', { level: 2, name: 'ISF' })).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-isf [data-source$=".analyze.isf.0.recommended"]')).not.toBeNull();
  // Every fasting night is a dot, or counted at the end of the axis it lies beyond.
  const beyond = [...canvasElement.querySelectorAll('.ui-isf [data-edge]')]
    .reduce((sum, edge) => sum + Number(edge.textContent!.replace(/\D/g, '')), 0);
  await expect(canvasElement.querySelectorAll('.ui-isf .ui-chart__dot').length + beyond).toBe(isf.data.fits.length);
  const captions = [...canvasElement.querySelectorAll('.ui-isf .ui-scard__facts dt')].map((dt) => dt.textContent);
  await expect(captions).toEqual(['Estimate', 'Range', 'Fasting nights']);
  await expect(within(canvasElement.querySelector('.ui-isf') as HTMLElement).getByRole('button', { name: 'Snooze' }))
    .toBeInTheDocument();
};
export const IsfSettingPhone: Story = { ...story('phone', { store: ISF_STORE, open: 'setting:isf' }), play: isfPlay };
export const IsfSettingDesktop: Story = { ...story('desktop', { store: ISF_STORE, open: 'setting:isf' }), play: isfPlay };

// An admitted I:C Setting: the SettingCard with its block, current →
// suggested, printed as the pump profile prints it, its counted meal runs as
// the chart's dots, and the stat row: Estimate, Range, Meal runs (ADR 523).
// The generated wearer's I:C holds, so its store is a QA case whose meals
// support lowering it.
const IC_STORE = 'carb-ratio-supported' as const;
const settingPlay = (title: string, units: string): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(`^${title}`) })).toBeInTheDocument();
  await expect(canvas.getAllByText(units).length).toBeGreaterThan(0);
  const captions = [...canvasElement.querySelectorAll('.ui-scard__facts dt')].map((dt) => dt.textContent);
  await expect(captions).toEqual(['Estimate', 'Range', 'Meal runs']);
  await expect(canvasElement.querySelectorAll('.ui-chart__dot').length).toBeGreaterThan(0);
};
export const IcSettingPhone: Story = { ...story('phone', { store: IC_STORE, open: 'setting:carb_ratio' }), play: settingPlay('I:C', 'g/U') };
export const IcSettingDesktop: Story = { ...story('desktop', { store: IC_STORE, open: 'setting:carb_ratio' }), play: settingPlay('I:C', 'g/U') };
