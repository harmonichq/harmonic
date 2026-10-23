import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState, type CSSProperties } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { scrollThenSwipe, swipe } from '../../gesture';
import { expectTabBarEnds } from '../../tabbar-check';
import { expectAtPaneTop, expectHeaderEmpty, expectTitlePrinted } from '../../title-check';
import { focusable, patternStore, ranking, snoozed, type QueueStore } from '../../queue-model';
import { failsOnce } from '../../flaky';
import { QUEUE_UNDRAWABLE, ServedAfter } from '../../served-variants';
import { QueueScreen, type QueueScreenProps, type QueueWrites, type Refused } from './QueueScreen';

// The Queue screen in each state §1.3 lists, at phone (390) and desktop (1440),
// every value the simulated wearer's served answer:
// - Default: the wearer's ranking, its top item open.
// - Pattern open (one with no attributed cause), and the Setting detail (the
//   basal block), each from the store that serves it.
// - Just snoozed: the pinned store's person snoozed a pattern; the screen shows
//   the Queue the engine served after it, the bar's Until, and the Snoozed row.
// - Snoozed list: the first days with everything snoozed, each with Restore.
// - Empty: the same store's Queue, "0 patterns", with its Snoozed row.
//   The store also serves a correction factor set aside before #564, which no
//   Queue row draws: the list leaves it out and the row's count leaves it
//   uncounted (§2.5, 2026-10-20).
// - Loading, and Unavailable (the unsynced store serves guidance unavailable);
//   Stale, the last answers under Unavailable.
// - Phone mid-swipe: a row held over its Snooze reveal, the QueueRow's own
//   still state; and its swipe played through (ADR 613): a short drag, a slow
//   drag past half, a flick, a scroll, a cancel, a row the snooze does not
//   take, a write that fails, and reduced motion.
// - The phone's open card (§2.5, 2026-10-23; ADR 614): it swipes to Snooze as
//   a row does and draws no Snooze text action; held mid-swipe; a short drag
//   that eases back; a drag begun on Done that presses nothing; its chevron
//   closing it to its row, and the screen opening with nothing open.
// - Done (#518): a fresh wearer's basal card Done and undone, and the same card
//   back Not on pump after an unchanged sync.
// - A standalone habit (ADR 528): open in the wearer's Queue beside its
//   Patterns, its row's glyph named Habit; pinned, the Focus pill in Focus's
//   place; a live Focus, which shows the Focus pill at once, then the bar
//   "Focus started", whose Changes opens that tab.
// - A multi-cause Pattern (ADR 594): no Focus, the "›" on its chart, which opens
//   its drill-down; and pinned on a cause, "Focus" over that cause's title.
// - Every store that serves a watched change offers no Focus on any card.
// Two desktop plays: selecting a row opens it; Snooze, the text action, shows
// the bar, and Undo puts the item back.
// - Live writes (#495, #610): one the engine refuses holds "Not saved" until
//   Retry saves it, and of two snoozes, the second refused, the first stays
//   snoozed while the second is back.
const meta: Meta<typeof QueueScreen> = {
  title: 'Screens/Queue',
  component: QueueScreen,
  // The live writes' fake and its Queue, which the drill-down's stories share.
  excludeStories: ['heldWrites', 'LiveQueue'],
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

/** While a change is watched the engine admits no Focus: no card offers one (ADR 594). */
const expectNoFocus = async (canvasElement: HTMLElement, store: QueueStore) => {
  await expect(focusable(store)).toBe(false);
  await expect(within(canvasElement).queryByRole('button', { name: 'Focus' })).toBeNull();
};
const snoozedBar = /^Snoozed until \d/;

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

// The tab bar ends the screen: 64 px above the device's inset (§2.5, 2026-10-19).
// The tab bar's selected Queue names the screen, so its header draws nothing
// and the ranking starts at the top (§2.5, 2026-10-20).
export const DefaultPhone: Story = {
  ...story('phone', DEFAULT),
  play: async (context) => {
    await expectNoFocus(context.canvasElement, 'wearer');
    await rowsLevel!(context);
    await expectTabBarEnds(context.canvasElement);
    await expectHeaderEmpty(context.canvasElement, 'Queue');
  },
};
// An iPhone's 34 px home indicator: the bar grows by it, the page shrinks by it.
export const HomeIndicatorPhone: Story = {
  ...story('phone', DEFAULT),
  decorators: [(Story) => <div style={{ height: '100%', '--ui-inset-bottom': '34px' } as CSSProperties}><Story /></div>],
  play: async ({ canvasElement }) => expectTabBarEnds(canvasElement),
};
// Desktop: the ranking's first row and the open item start level, at the top
// of their panes (§2.5, 2026-10-20).
export const DefaultDesktop: Story = {
  ...story('desktop', DEFAULT),
  play: async (context) => {
    await rowsLevel!(context);
    await expectHeaderEmpty(context.canvasElement, 'Queue');
    const row = context.canvasElement.querySelector<HTMLElement>('.ui-queue__list .ui-qrow')!;
    const open = context.canvasElement.querySelector<HTMLElement>('.ui-queue__detail')!;
    await expectAtPaneTop(row);
    await expectAtPaneTop(open);
    await expect(row.getBoundingClientRect().top).toBe(open.getBoundingClientRect().top);
  },
};
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
// Just snoozed: the bar names its date in one phrase (§2.5, 2026-10-20), and the
// store's watched Focus leaves no card offering another.
const justSnoozedPlay: Story['play'] = async ({ canvasElement }) => {
  await expect(within(canvasElement).getByRole('status')).toHaveTextContent(snoozedBar);
  await expectNoFocus(canvasElement, 'wearer-pinned');
};
export const JustSnoozedPhone: Story = { ...story('phone', JUST_SNOOZED), play: justSnoozedPlay };
export const JustSnoozedDesktop: Story = { ...story('desktop', JUST_SNOOZED), play: justSnoozedPlay };
// The first days' Snoozed list and its count, without the correction factor.
// A correction factor set aside before #564 is served set aside and drawn by
// no Queue row (§2.5, 2026-10-20), so it is neither listed nor counted.
const FIRST_DAYS_SNOOZED = 'wearer-first-days-snoozed' as const;
const drawnSnoozed = async () => {
  const served = fixtures.queue[FIRST_DAYS_SNOOZED].guidance.candidates;
  await expect(served.some((c) => c.subject === 'setting:isf' && c.set_aside)).toBe(true);
  const drawn = snoozed(FIRST_DAYS_SNOOZED);
  await expect(drawn.some((s) => s.subject === 'setting:isf')).toBe(false);
  await expect(drawn.length).toBeGreaterThan(0);
  return drawn.length;
};
const snoozedListPlay: Story['play'] = async ({ canvasElement }) => {
  const drawn = await drawnSnoozed();
  await expect(within(canvasElement).getAllByRole('button', { name: 'Restore' })).toHaveLength(drawn);
};
const emptyPlay: Story['play'] = async ({ canvasElement }) => {
  const drawn = await drawnSnoozed();
  const footer = within(canvasElement).getByRole('button', { name: /Snoozed/ });
  await expect(footer.textContent!.replace(/\D/g, '')).toBe(String(drawn));
};
export const SnoozedListPhone: Story = { ...story('phone', SNOOZED_LIST), play: snoozedListPlay };
export const SnoozedListDesktop: Story = { ...story('desktop', SNOOZED_LIST), play: snoozedListPlay };
export const EmptyPhone: Story = { ...story('phone', EMPTY), play: emptyPlay };
export const EmptyDesktop: Story = { ...story('desktop', EMPTY), play: emptyPlay };
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

// Desktop: the same Snooze text action beneath Focus (S is its shortcut).
export const SnoozeUndoDesktop: Story = {
  args: { layout: 'desktop', store: 'wearer-pinned', open: fixtures.snooze.subject, snooze },
  parameters: { frame: FRAMES.desktop },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = fixtures.snooze.title;
    await expectNoFocus(canvasElement, 'wearer-pinned');
    await expect(canvas.getAllByText(title).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Snooze' }));
    await expect(canvas.getByRole('status')).toHaveTextContent(snoozedBar);
    await expect(canvas.queryByRole('button', { name: new RegExp(title) })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(canvas.getAllByText(title).length).toBeGreaterThan(0);
  },
};

// The swipe is Snooze's shortcut on a phone row (ADR 613). A slow drag short
// of half the row's width never fills the reveal and eases back; a slow drag
// past half fills it before the finger lifts, and the row slides off and
// closes up before the bar rises. Undo puts the row back.
const SWIPE = {
  layout: 'phone', store: 'wearer-pinned', snooze,
  open: ranking('wearer-pinned').find((item) => item.subject !== fixtures.snooze.subject)!.subject,
} as QueueScreenProps;
/** A phone row by its title, drawn or leaving (a leaving row is aria-hidden). */
const rowTitled = (canvasElement: HTMLElement, title: string) =>
  [...canvasElement.querySelectorAll<HTMLElement>('.ui-queue__list .ui-qrow')]
    .find((each) => each.textContent?.includes(title)) ?? null;
const swipedRow = (canvasElement: HTMLElement) => rowTitled(canvasElement, fixtures.snooze.title);
/** The phone's open card (a Pattern's, a habit's or a Setting's), drawn or leaving. */
const openCard = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('.ui-queue__open :is(.ui-pcard, .ui-scard)');
/** The swipe a row or an open card moves in (SnoozeSwipe). */
const swipeOf = (moving: HTMLElement) => moving.closest<HTMLElement>('.ui-qrow-swipe')!;
/** The reveal filled: marked so, and drawn in the accent. */
const filled = (row: HTMLElement) => {
  const reveal = swipeOf(row).querySelector<HTMLElement>('.ui-qrow-swipe__reveal');
  if (!swipeOf(row).classList.contains('ui-qrow-swipe--filled') || !reveal) return false;
  const probe = document.createElement('i');
  probe.style.color = 'var(--primary)';
  reveal.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  return getComputedStyle(reveal).color === accent;
};
/** Whether the reveal is filled as the finger lifts, read before the row's own handler. */
const filledAtRelease = (row: HTMLElement) => {
  let seen: boolean | null = null;
  row.addEventListener('pointerup', () => { seen = filled(row); }, { once: true });
  return () => seen;
};
/** Whether the reveal is ever filled from now until the returned read, as each
 *  class change of the row's swipe lands. */
const everFilled = (row: HTMLElement) => {
  let seen = false;
  const swipe = swipeOf(row);
  const watch = new MutationObserver((changes) => {
    seen ||= swipe.classList.contains('ui-qrow-swipe--filled')
      || changes.some((change) => change.oldValue?.includes('ui-qrow-swipe--filled'));
  });
  watch.observe(swipe, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  return () => { watch.disconnect(); return seen; };
};
/** Whether a row of the list is ever marked leaving ([data-closing]) from now until the returned read. */
const everLeft = (canvasElement: HTMLElement) => {
  let seen = false;
  const list = canvasElement.querySelector('.ui-queue__list')!;
  const watch = new MutationObserver(() => {
    seen ||= list.querySelector('.ui-qrow-swipe[data-closing]') !== null;
  });
  watch.observe(list, { attributes: true, attributeFilter: ['data-closing'], subtree: true });
  return () => { watch.disconnect(); return seen; };
};
const nextFrame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
/** What `read` sees each frame until `until` holds of it (or 3 s pass). */
const eachFrame = async <T,>(read: () => T, until: (seen: T) => boolean) => {
  const seen: T[] = [];
  for (const end = performance.now() + 3000; performance.now() < end;) {
    seen.push(read());
    if (until(seen[seen.length - 1])) break;
    await nextFrame();
  }
  return seen;
};
/** The list's leading edge, where a row at rest starts. */
const restLeft = (canvasElement: HTMLElement) =>
  canvasElement.querySelector<HTMLElement>('.ui-queue__list')!.getBoundingClientRect().left;
const atRest = (canvasElement: HTMLElement, row: () => HTMLElement | null) => waitFor(() => {
  expect(row()!.getBoundingClientRect().left).toBe(restLeft(canvasElement));
  expect(row()!.closest('[data-closing]')).toBeNull();
}, { timeout: 2000 });

/** A swipe that snoozes: the row (or the open card) leaves, and the bar rises
 *  only once it has gone. */
const snoozedBySwipe = async (canvasElement: HTMLElement, pace: 'slow' | 'flick',
  moving: () => HTMLElement | null = () => swipedRow(canvasElement)) => {
  const canvas = within(canvasElement);
  const row = moving()!;
  const atRelease = filledAtRelease(row);
  await (pace === 'slow' ? swipe(row, -240, 16, 'slow') : swipe(row, -120, 4, 'flick'));
  if (pace === 'slow') await expect(atRelease()).toBe(true);
  const frames = await eachFrame(() => ({
    bar: canvas.queryByRole('status') !== null,
    drawn: moving() !== null,
    leaving: canvasElement.querySelector('.ui-qrow-swipe[data-closing]') !== null,
  }), (seen) => seen.bar);
  await expect(frames.some((each) => each.leaving)).toBe(true);
  await expect(frames.filter((each) => each.bar).every((each) => !each.drawn)).toBe(true);
  await expect(canvas.getByRole('status')).toHaveTextContent(snoozedBar);
};

export const SwipeSnoozeUndoPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = () => swipedRow(canvasElement);
    const filledEver = everFilled(row()!);
    await swipe(row()!, -120, 16, 'slow');
    await atRest(canvasElement, row);
    await expect(filledEver()).toBe(false);
    await expect(canvas.queryByRole('status')).toBeNull();
    await snoozedBySwipe(canvasElement, 'slow');
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
    await atRest(canvasElement, row);
  },
};

// A flick: short of half the row's width, faster than 500 px/s, it snoozes as
// a slow drag past half does.
export const SwipeFlickPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    await expect(120).toBeLessThan(swipedRow(canvasElement)!.getBoundingClientRect().width / 2);
    await snoozedBySwipe(canvasElement, 'flick');
  },
};

// A press that moves down first is the page's scroll: no row moves and no
// reveal is drawn, however far it then goes across.
export const SwipeScrollPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const row = swipedRow(canvasElement)!;
    const left = row.getBoundingClientRect().left;
    const seen: number[] = [];
    const watch = () => seen.push(row.getBoundingClientRect().left);
    row.addEventListener('pointermove', watch);
    await scrollThenSwipe(row, -240);
    row.removeEventListener('pointermove', watch);
    await expect(seen.every((each) => each === left)).toBe(true);
    await expect(canvasElement.querySelector('.ui-qrow-swipe__reveal')).toBeNull();
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};

// The system takes the gesture (pointercancel) past half: the row eases back
// and nothing is snoozed.
export const SwipeCancelPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const row = () => swipedRow(canvasElement);
    await swipe(row()!, -240, 16, 'cancel');
    await atRest(canvasElement, row);
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};

// A row the story's snooze does not take: it leaves, its action removes
// nothing, so the row is drawn at rest again, with nothing left closing.
export const SwipeNoopPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const other = ranking('wearer-pinned')
      .find((item) => item.subject !== fixtures.snooze.subject && item.subject !== SWIPE.open)!.data.title;
    const row = () => rowTitled(canvasElement, other);
    const left = everLeft(canvasElement);
    await swipe(row()!, -240, 16, 'slow');
    await atRest(canvasElement, row);
    await expect(left()).toBe(true);
    await expect(canvasElement.querySelector('[data-closing]')).toBeNull();
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};

// Reduced motion: once the finger lifts the row never travels; it fades out
// where the finger left it, and then the bar rises.
export const SwipeReducedPhone: Story = {
  args: SWIPE,
  parameters: { frame: FRAMES.phone },
  decorators: [(Story) => <div data-motion-reduce="" style={{ height: '100%' }}><Story /></div>],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = swipedRow(canvasElement)!;
    let left: number | null = null;
    row.addEventListener('pointerup', () => { left = row.getBoundingClientRect().left; }, { once: true });
    await swipe(row, -240, 16, 'slow');
    const frames = await eachFrame(() => ({
      bar: canvas.queryByRole('status') !== null,
      left: row.isConnected ? row.getBoundingClientRect().left : null,
      opacity: row.isConnected ? Number(getComputedStyle(row.closest('.ui-swipe-settle')!).opacity) : null,
    }), (seen) => seen.bar);
    await expect(left).not.toBeNull();
    await expect(frames.every((each) => each.left === null || each.left === left)).toBe(true);
    await expect(frames.some((each) => each.opacity !== null && each.opacity < 1)).toBe(true);
    await expect(canvas.getByRole('status')).toHaveTextContent(snoozedBar);
  },
};

// The phone's open card swipes to Snooze as a row does, and draws no Snooze
// text action (§2.5, 2026-10-23; ADR 614). A slow drag past half fills its
// reveal before the finger lifts; the card slides off and closes up before the
// bar rises; Undo puts it back, open.
const snoozedCard = (canvasElement: HTMLElement) => {
  const card = openCard(canvasElement);
  return card?.querySelector('h2')?.textContent === fixtures.snooze.title ? card : null;
};
export const SnoozeUndoPhone: Story = {
  args: { layout: 'phone', store: 'wearer-pinned', open: fixtures.snooze.subject, snooze },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expectNoFocus(canvasElement, 'wearer-pinned');
    await expect(canvas.queryByRole('button', { name: 'Snooze' })).toBeNull();
    await expect(snoozedCard(canvasElement)).not.toBeNull();
    await snoozedBySwipe(canvasElement, 'slow', () => snoozedCard(canvasElement));
    await userEvent.click(canvas.getByRole('button', { name: 'Undo' }));
    await expect(canvas.queryByRole('status')).toBeNull();
    await atRest(canvasElement, () => snoozedCard(canvasElement));
  },
};

// The open card held mid-swipe over its reveal, which runs the card's height.
export const CardMidSwipePhone: Story = {
  args: { layout: 'phone', store: 'wearer', swiping: ranking('wearer')[0].subject },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const card = openCard(canvasElement)!;
    const reveal = swipeOf(card).querySelector<HTMLElement>('.ui-qrow-swipe__reveal')!;
    await waitFor(() => expect(card.getBoundingClientRect().left).toBe(restLeft(canvasElement) - 88));
    await expect(reveal.getBoundingClientRect().height).toBe(card.getBoundingClientRect().height);
    await expect(reveal.textContent).toBe('Snooze');
  },
};

// A short drag on the open card eases back: the reveal never fills, and
// nothing is snoozed.
export const CardSwipeCancelPhone: Story = {
  args: { layout: 'phone', store: 'wearer-pinned', open: fixtures.snooze.subject, snooze },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const card = () => snoozedCard(canvasElement);
    const filledEver = everFilled(card()!);
    await swipe(card()!, -120, 16, 'slow');
    await atRest(canvasElement, card);
    await expect(filledEver()).toBe(false);
    await expect(within(canvasElement).queryByRole('status')).toBeNull();
  },
};

// A drag begun on Done, short of the rule, presses nothing and snoozes
// nothing: the click the finger's lift makes is the swipe's. A tap on Done then
// presses it.
export const CardSwipeOverDonePhone: Story = {
  args: {
    layout: 'phone', store: 'wearer-before-done', open: 'setting:basal_rate',
    done: { subject: 'setting:basal_rate', after: 'wearer-done' },
  },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = () => openCard(canvasElement);
    const done = within(card()!).getByRole('button', { name: 'Done' });
    await swipe(done, -120, 16, 'slow');
    done.click();
    await atRest(canvasElement, card);
    await expect(canvas.queryByRole('status')).toBeNull();
    await expect(within(card()!).getByRole('heading', { level: 2 })).toHaveTextContent(/^Basal/);
    await userEvent.click(within(card()!).getByRole('button', { name: 'Done' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('Waiting for pump');
  },
};

// The open card's chevron, named by its title, closes it to its row: no card is
// open and every row is collapsed. A row's tap opens its card.
export const CollapsePhone: Story = {
  args: { layout: 'phone', store: 'wearer' },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [top, next] = ranking('wearer');
    const card = openCard(canvasElement)!;
    const chevron = within(card).getByRole('button', { expanded: true });
    await expect(chevron.getAttribute('aria-labelledby')).toBe(within(card).getByRole('heading', { level: 2 }).id);
    await userEvent.click(chevron);
    await waitFor(() => expect(canvasElement.querySelector('.ui-queue__open')).toBeNull());
    await expect(canvas.queryByRole('heading', { level: 2 })).toBeNull();
    const rows = canvas.getAllByRole('button', { expanded: false });
    await expect(rows).toHaveLength(ranking('wearer').length);
    await expect(canvas.queryByRole('button', { expanded: true })).toBeNull();
    await expect(rows.some((row) => row.textContent!.includes(top.data.title))).toBe(true);
    await userEvent.click(rows.find((row) => row.textContent!.includes(next.data.title))!);
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(next.data.title) })).toBeInTheDocument();
  },
};

// Closed: the screen opens with nothing open, every item a row.
export const ClosedPhone: Story = {
  args: { layout: 'phone', store: 'wearer', closed: true },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('.ui-queue__open')).toBeNull();
    await expect(canvas.getAllByRole('button', { expanded: false })).toHaveLength(ranking('wearer').length);
  },
};

// The drill-down (§2.2): the Snoozed row opens the Snoozed list under
// "‹ Queue", its title drawn (the tab bar does not name it), and back returns
// to the Queue with the same item open, its header drawing nothing again.
// Desktop the same in its list pane.
export const SnoozedDrillDownPhone: Story = {
  args: { layout: 'phone', store: 'wearer-pinned-snoozed', open: 'setting:basal_rate' },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const open = ranking('wearer-pinned-snoozed').find((i) => i.subject === 'setting:basal_rate')!;
    await expectNoFocus(canvasElement, 'wearer-pinned-snoozed');
    await userEvent.click(canvas.getByRole('button', { name: /Snoozed/ }));
    await expectTitlePrinted(canvasElement, 'Snoozed');
    await expect(canvas.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    await userEvent.click(within(back(canvas)).getByRole('button', { name: 'Queue' }));
    await expectHeaderEmpty(canvasElement, 'Queue');
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
    await expectTitlePrinted(canvasElement, 'Snoozed');
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(open.data.title) })).toBeInTheDocument();
    await userEvent.click(within(back(canvas)).getByRole('button', { name: 'Queue' }));
    await expectHeaderEmpty(canvasElement, 'Queue');
    await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(open.data.title) })).toBeInTheDocument();
  },
};

// The live adapter's Queue writes as the stories play them (#610): one at a
// time in the order made, the subjects in flight and the refused writes held as
// the adapter holds them. Each kind fails on its first call unless `sends`
// gives it another; `saved` hears each write that saves, before it resolves, as
// the adapter reads the engine again first; `redraw` hears each start and
// settle, as App redraws. It neither drops a refusal answered 404 nor ignores
// a Retry pressed while one is in flight; the adapter's own tests cover both.
type Sends = Partial<Record<Refused['kind'], (subject: string, lever?: string) => Promise<unknown>>>;
const TAKES_OUT: readonly Refused['kind'][] = ['snooze', 'restore', 'done'];
export function heldWrites(sends: Sends = {}, redraw = () => {}, saved = (_write: Refused) => {}): QueueWrites {
  const send = { snooze: failsOnce(undefined), restore: failsOnce(undefined), pin: failsOnce(undefined),
    done: failsOnce(undefined), undoDone: failsOnce(undefined), ...sends };
  const inFlight = new Set<string>();
  let refused: Refused[] = [];
  let tail = Promise.resolve();
  const same = (a: Refused) => (b: Refused) => a.kind === b.kind && a.subject === b.subject && a.lever === b.lever;
  const write = (made: Refused) => {
    if (TAKES_OUT.includes(made.kind)) inFlight.add(made.subject);
    redraw();
    const run = tail.then(async () => {
      try {
        await send[made.kind](made.subject, made.lever);
        refused = refused.filter((r) => !same(made)(r));
        saved(made);
      } catch (error) {
        if (!refused.some(same(made))) refused = [...refused, made];
        throw error;
      } finally {
        inFlight.delete(made.subject);
        redraw();
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };
  return {
    snooze: (subject) => write({ kind: 'snooze', subject }),
    restore: (subject) => write({ kind: 'restore', subject }),
    pin: (subject, lever) => write({ kind: 'pin', subject, ...(lever ? { lever } : {}) }),
    done: (subject) => write({ kind: 'done', subject }),
    undoDone: (subject) => write({ kind: 'undoDone', subject }),
    held: () => ({ inFlight: new Set(inFlight), refused }),
    retry: () => Promise.all(refused.map((r) => write(r).then(() => r, () => null)))
      .then((sent) => sent.filter((r): r is Refused => r !== null)),
  };
}
/** The Queue over `heldWrites`, redrawn as each write starts and settles, and
 *  switched to `after.store` once a snooze of `after.subject` saves. */
export function LiveQueue({ sends, after, ...props }: QueueScreenProps & {
  sends?: Sends; after?: { subject: string; store: QueueStore };
}) {
  const [, setVersion] = useState(0);
  const [store, setStore] = useState(props.store);
  const [writes] = useState(() => heldWrites(sends, () => setVersion((n) => n + 1), (write) => {
    if (after && write.kind === 'snooze' && write.subject === after.subject) setStore(after.store);
  }));
  // The item opened first is the first store's; the store served after the snooze no longer ranks it.
  return <QueueScreen {...props} store={store} open={store === props.store ? props.open : undefined} writes={writes} />;
}

/** Snooze the open item: on desktop its text action; on the phone, which has
 *  none, a swipe of its card past half, once the card has left (ADR 614). */
const snoozeOpen = async (canvasElement: HTMLElement, layout: 'phone' | 'desktop') => {
  const canvas = within(canvasElement);
  if (layout === 'desktop') {
    await userEvent.click(canvas.getByRole('button', { name: 'Snooze' }));
    return;
  }
  await expect(canvas.queryByRole('button', { name: 'Snooze' })).toBeNull();
  const left = everLeft(canvasElement);
  await swipe(openCard(canvasElement)!, -240, 16, 'slow');
  await waitFor(() => expect(canvasElement.querySelector('.ui-qrow-swipe[data-closing]')).toBeNull(), { timeout: 2000 });
  await expect(left()).toBe(true);
};

// Live (#495): a Snooze the engine does not save puts the item back with
// "Not saved", and Retry saves it. On the phone the card is swiped: once the
// refused write is held it is back, open at rest.
const liveSnoozePlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const title = ranking('wearer')[0].data.title;
  await snoozeOpen(canvasElement, layout);
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.getByRole('heading', { level: 2, name: new RegExp(title) })).toBeInTheDocument();
  if (layout === 'phone') await atRest(canvasElement, () => openCard(canvasElement));
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
};
const live = (layout: 'phone' | 'desktop', args: Omit<QueueScreenProps, 'layout'>, play: Story['play']): Story => ({
  ...story(layout, args), render: (props) => <LiveQueue {...props} />, play,
});
export const LiveSnoozeNotSavedPhone = live('phone', { store: 'wearer' }, liveSnoozePlay('phone'));
export const LiveSnoozeNotSavedDesktop = live('desktop', { store: 'wearer' }, liveSnoozePlay('desktop'));
// The same through a row's swipe: the row has left when the write fails, and
// comes back at rest with Not saved; Retry saves it.
export const SwipeNotSavedPhone = live('phone', { store: 'wearer' }, async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const row = () => rowTitled(canvasElement, ranking('wearer')[1].data.title);
  await swipe(row()!, -240, 16, 'slow');
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/), { timeout: 2000 });
  await atRest(canvasElement, row);
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
});

// Two snoozes, the second refused (#610): the pinned store's person snoozes the
// open item, which saves, so the screen shows the store served after it; then
// the next item, which the engine refuses the first time. The first stays
// snoozed, the second is back under "Not saved", and Retry saves it.
const firstSnoozed = fixtures.snooze.subject;
/** A snooze the engine refuses the first time it is sent for `refused`, and saves otherwise. */
const refusesOnce = (refused: string) => {
  const refuse = failsOnce(undefined);
  return async (subject: string) => { if (subject === refused) await refuse(); };
};
const refusedSnooze = ranking('wearer-pinned-snoozed')[0];
const titled = (canvas: ReturnType<typeof within>, title: string) =>
  canvas.queryAllByRole('heading', { level: 2, name: new RegExp(title) });
const twoSnoozesPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await snoozeOpen(canvasElement, layout);
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(snoozedBar));
  await expect(titled(canvas, refusedSnooze.data.title)).toHaveLength(1);
  await snoozeOpen(canvasElement, layout);
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.queryByRole('button', { name: new RegExp(fixtures.snooze.title) })).toBeNull();
  await expect(titled(canvas, fixtures.snooze.title)).toHaveLength(0);
  await expect(titled(canvas, refusedSnooze.data.title)).toHaveLength(1);
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
};
const twoSnoozes = (layout: 'phone' | 'desktop'): Story => ({
  ...story(layout, { store: 'wearer-pinned', open: firstSnoozed }),
  render: (props) => <LiveQueue {...props} after={{ subject: firstSnoozed, store: 'wearer-pinned-snoozed' }}
    sends={{ snooze: refusesOnce(refusedSnooze.subject) }} />,
  play: twoSnoozesPlay(layout),
});
export const TwoSnoozesSecondRefusedPhone = twoSnoozes('phone');
export const TwoSnoozesSecondRefusedDesktop = twoSnoozes('desktop');

// Done (#518), a Setting card's primary: a fresh wearer presses Done on the
// basal card. The screen shows the Queue the engine served after it (the card
// is gone), the bar reads "Waiting for pump", and Undo (the bar's, or ⌘Z on
// desktop) puts the card back. On desktop Snooze stays the text action beneath
// Done; the phone's card has none (its Snooze is the swipe, ADR 614).
const done: QueueScreenProps['done'] = { subject: 'setting:basal_rate', after: 'wearer-done' };
const DONE = { store: 'wearer-before-done', open: 'setting:basal_rate', done } as QueueScreenProps;
const basalCard = (canvas: ReturnType<typeof within>) => canvas.queryByRole('heading', { level: 2, name: /^Basal/ });
const doneUndoPlay = (undo: 'click' | 'shortcut'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(ranking('wearer-done').some((item) => item.subject === 'setting:basal_rate')).toBe(false);
  const card = within(canvasElement.querySelector('.ui-scard') as HTMLElement);
  const doneButton = card.getByRole('button', { name: 'Done' });
  if (undo === 'click') await expect(card.queryByRole('button', { name: 'Snooze' })).toBeNull();
  else {
    await expect(doneButton.getBoundingClientRect().bottom)
      .toBeLessThan(card.getByRole('button', { name: 'Snooze' }).getBoundingClientRect().top);
  }
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
export const LiveDoneNotSavedPhone = live('phone', LIVE_DONE, liveDonePlay);
export const LiveDoneNotSavedDesktop = live('desktop', LIVE_DONE, liveDonePlay);

// Retry's bar is its own (#610): a snooze refused, then a Done that saves under
// "Not saved", then Retry saves the snooze: the bar leaves, since Retry saved no
// Done or Focus, and the earlier Done's bar is not drawn.
const RETRIED = 'pattern:lows_after_meals';
const retryOwnBarPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await snoozeOpen(canvasElement, layout);
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  // Phone: the Basal card, opened while the snooze was in flight, closes back into its row first.
  await userEvent.click(await canvas.findByRole('button', { name: /^Setting Basal/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(basalCard(canvas)).toBeInTheDocument());
  await expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/);
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
  await expect(canvas.queryByText('Waiting for pump')).toBeNull();
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
};
const retryOwnBar = (layout: 'phone' | 'desktop'): Story => ({
  ...story(layout, { store: 'wearer-before-done', open: RETRIED }),
  render: (props) => <LiveQueue {...props} sends={{ snooze: refusesOnce(RETRIED), done: async () => undefined }} />,
  play: retryOwnBarPlay(layout),
});
export const RetryOwnBarPhone = retryOwnBar('phone');
export const RetryOwnBarDesktop = retryOwnBar('desktop');

// A ranking holding candidates the Queue cannot draw (a correction factor,
// which no Queue row draws, an I:C Setting with no admitted row, a Pattern the
// findings serve no row for, and a kind the app does not know): they are left
// out, and the Queue draws the rest.
const undrawablePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 1, name: 'Queue' })).toBeInTheDocument();
  await expect(canvas.queryByText('Unserved')).toBeNull();
  await expect(canvas.queryByText('Unknown')).toBeNull();
  await expect(canvas.getAllByRole('img', { name: 'Pattern' }).length).toBeGreaterThan(0);
};
export const UndrawablePhone: Story = { ...story('phone', { store: QUEUE_UNDRAWABLE }), play: undrawablePlay };
export const UndrawableDesktop: Story = { ...story('desktop', { store: QUEUE_UNDRAWABLE }), play: undrawablePlay };

// A standalone habit (ADR 528), open: its row is a Pattern's with the Habit
// glyph, and its card the PatternCard, the chart's episodes named Habit, with
// Focus and, on desktop, Snooze beneath (the phone's Snooze is the card's swipe).
// Pinned, the Focus pill takes Focus's place, and the watched Focus leaves no
// card offering another.
const HABIT_OPEN = { store: fixtures.states.habit_band.store, open: fixtures.states.habit_band.subject } as QueueScreenProps;
const HABIT_PINNED = {
  store: fixtures.states.habit_pinned.store, open: fixtures.states.habit_pinned.subject,
} as QueueScreenProps;
const habitPlay = (layout: 'phone' | 'desktop', pinned: boolean): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const card = canvasElement.querySelector('.ui-pcard') as HTMLElement;
  await expect(within(card).getByRole('heading', { level: 2, name: 'Missed / unannounced meal' })).toBeInTheDocument();
  await expect(card.querySelector('.ui-chart__legend')!.textContent).toContain('Habit');
  await expect(within(card).queryByRole('button', { name: 'Focus' }) === null).toBe(pinned);
  await expect(card.querySelector('.ui-pcard__action [data-state="focus"]') !== null).toBe(pinned);
  if (pinned) await expectNoFocus(canvasElement, HABIT_PINNED.store);
  await expect(within(card).queryByRole('button', { name: 'Snooze' }) !== null).toBe(layout === 'desktop');
  // Desktop lists the habit's row beside the open card, its glyph named Habit.
  if (layout === 'desktop') await expect(canvas.getByRole('img', { name: 'Habit' })).toBeInTheDocument();
};
export const HabitOpenPhone: Story = { ...story('phone', HABIT_OPEN), play: habitPlay('phone', false) };
export const HabitOpenDesktop: Story = { ...story('desktop', HABIT_OPEN), play: habitPlay('desktop', false) };
export const HabitPinnedPhone: Story = { ...story('phone', HABIT_PINNED), play: habitPlay('phone', true) };
export const HabitPinnedDesktop: Story = { ...story('desktop', HABIT_PINNED), play: habitPlay('desktop', true) };
// Live: Focus on the habit's card shows the Focus pill at once, while the write
// is in flight.
const livePinPlay: Story['play'] = async ({ canvasElement }) => {
  const card = canvasElement.querySelector('.ui-pcard') as HTMLElement;
  await userEvent.click(within(card).getByRole('button', { name: 'Focus' }));
  await waitFor(() => expect(card.querySelector('.ui-pcard__action [data-state="focus"]')).not.toBeNull());
  await expect(within(card).queryByRole('button', { name: 'Focus' })).toBeNull();
};
const pinInFlight = (): QueueScreenProps['writes'] => heldWrites({ pin: () => new Promise<void>(() => {}) });
export const LiveHabitPinPhone: Story = {
  ...story('phone', { ...HABIT_OPEN, writes: pinInFlight() }), play: livePinPlay,
};
export const LiveHabitPinDesktop: Story = {
  ...story('desktop', { ...HABIT_OPEN, writes: pinInFlight() }), play: livePinPlay,
};
// A Focus started (§2.5, 2026-10-20): once the write is saved the screen draws
// what the engine serves after it, the habit's Focus pill and no Focus on any
// card, under the bar "Focus started", whose Changes opens that tab. It has no
// Undo. The habit is the QA case's, whose store after the Focus is served too.
const HABIT_FOCUS = {
  store: fixtures.states.habit_episodes.store, open: fixtures.states.habit_episodes.subject,
} as QueueScreenProps;
const focusSaved = (): QueueScreenProps['writes'] => heldWrites({ pin: async () => undefined });
const focusStartedPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const card = () => canvasElement.querySelector('.ui-pcard') as HTMLElement;
  await expect(fixtures.states.habit_pinned.subject).toBe(fixtures.states.habit_episodes.subject);
  await userEvent.click(within(card()).getByRole('button', { name: 'Focus' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Focus started'));
  await expect(card().querySelector('.ui-pcard__action [data-state="focus"]')).not.toBeNull();
  await expectNoFocus(canvasElement, HABIT_PINNED.store);
  await expect(within(canvas.getByRole('status')).queryByRole('button', { name: 'Undo' })).toBeNull();
  await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Changes' }));
  await expect(args.nav!.onSelect).toHaveBeenCalledWith('changes');
};
const focusStarted = (layout: 'phone' | 'desktop'): Story => ({
  ...story(layout, { ...HABIT_FOCUS, writes: focusSaved(), nav: { onSelect: fn() } }),
  render: (args) => <ServedAfter {...args} focused={HABIT_PINNED.store} />,
  play: focusStartedPlay,
});
export const FocusStartedPhone: Story = focusStarted('phone');
export const FocusStartedDesktop: Story = focusStarted('desktop');

// A multi-cause Pattern (drill-down.md, ADR 594): its open card has no Focus;
// its chart is a drill-down row marked only with "›", named by the card's
// title (as the phone's chevron is, so it is reached by its element), and opens
// the drill-down, "‹ Queue" over the Pattern's title.
const MULTI = patternStore('drill_down');
const MULTI_PINNED = patternStore('drill_down_pinned');
/** The card as the Queue draws it: no Focus though one could start, the chart a
 *  drill-down row marked "›", and Snooze beneath on desktop only. */
const multiCauseCard = async (canvasElement: HTMLElement, layout: 'phone' | 'desktop') => {
  const card = canvasElement.querySelector('.ui-pcard') as HTMLElement;
  const title = card.querySelector('h2')!.textContent!;
  await expect(focusable(MULTI.store)).toBe(true);
  await expect(within(card).queryByRole('button', { name: 'Focus' })).toBeNull();
  const chart = card.querySelector<HTMLElement>('.ui-pcard__chart')!;
  await expect(within(card).getAllByRole('button', { name: title })).toContain(chart);
  await expect(chart.dataset.role).toBe('row');
  await expect(chart.querySelector('.ui-pcard__more')!.textContent).toBe('›');
  await expect(within(card).queryByRole('button', { name: 'Snooze' }) !== null).toBe(layout === 'desktop');
  return { title, chart };
};
const MULTI_OPEN = { store: MULTI.store, open: `pattern:${MULTI.pattern}` } as QueueScreenProps;
export const MultiCauseOpenPhone: Story = {
  ...story('phone', MULTI_OPEN), play: async ({ canvasElement }) => { await multiCauseCard(canvasElement, 'phone'); },
};
export const MultiCauseOpenDesktop: Story = {
  ...story('desktop', MULTI_OPEN), play: async ({ canvasElement }) => { await multiCauseCard(canvasElement, 'desktop'); },
};
// Its chart opens the drill-down, each cause with its own Focus.
const multiCauseOpensPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const { title, chart } = await multiCauseCard(canvasElement, layout);
  await userEvent.click(chart);
  await expectTitlePrinted(canvasElement, title);
  await expect(within(canvasElement).getAllByRole('button', { name: 'Focus' }).length).toBeGreaterThan(1);
};
export const MultiCauseOpensPhone: Story = { ...story('phone', MULTI_OPEN), play: multiCauseOpensPlay('phone') };
export const MultiCauseOpensDesktop: Story = { ...story('desktop', MULTI_OPEN), play: multiCauseOpensPlay('desktop') };
// Pinned on its Late bolus cause: the button's place holds "Focus" over the
// cause's served title, and no card offers Focus.
const multiCausePinnedPlay: Story['play'] = async ({ canvasElement }) => {
  const card = canvasElement.querySelector('.ui-pcard') as HTMLElement;
  const pair = card.querySelector('.ui-pcard__action .ui-pcard__focus') as HTMLElement;
  await expect(pair.querySelector('dt')!.textContent).toBe('Focus');
  await expect(pair.querySelector('dd')!.textContent).toBe('Late bolus');
  const [caption, value] = [pair.querySelector('dt')!.getBoundingClientRect(), pair.querySelector('dd')!.getBoundingClientRect()];
  await expect(caption.bottom).toBeLessThanOrEqual(value.top);
  await expect(caption.left).toBe(value.left);
  await expectNoFocus(canvasElement, MULTI_PINNED.store);
};
const MULTI_PINNED_OPEN = { store: MULTI_PINNED.store, open: `pattern:${MULTI_PINNED.pattern}` } as QueueScreenProps;
export const MultiCausePinnedPhone: Story = { ...story('phone', MULTI_PINNED_OPEN), play: multiCausePinnedPlay };
export const MultiCausePinnedDesktop: Story = { ...story('desktop', MULTI_PINNED_OPEN), play: multiCausePinnedPlay };

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
