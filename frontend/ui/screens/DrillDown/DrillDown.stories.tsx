import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { failsOnce } from '../../flaky';
import { causes, focusable, pattern, patternStore } from '../../queue-model';
import { ServedAfter } from '../../served-variants';
import { expectTitlePrinted } from '../../title-check';
import { QueueScreen, type QueueScreenProps } from '../Queue/QueueScreen';

// The drill-down (drill-down.md, ADR 594): the shipped Queue screen opened on a
// multi-cause Pattern's causes, from the stores the fixture generator
// materializes from the QA cases. "‹ Queue" over the Pattern's served title,
// then one open card per served cause in the engine's order: the cause's served
// title, its count over the Pattern's own ("3 of 7 meals"), its own served
// trace against the Pattern's Typical, and Focus as an outlined secondary in the
// card's head; the screen has no primary and no Snooze.
// - Open: the two causes of Highs after meals, each focusable.
// - Pinned: Late bolus is the Focus: its pill in its button's place, and no
//   Focus on any card while it is watched.
// - Desktop: the detail pane, its cards in a grid, the list beside it.
// - Loading: a card skeleton per cause it opened with.
// - Stale: its answers an earlier read's, the header's Unavailable and Retry,
//   the causes still drawn (§2.5, 2026-10-14: stale beats falsely current).
// - Unavailable: Unavailable and Retry in the pane, no cause drawn.
// - Not saved: a cause's Focus the engine does not save; then Retry saves it.
// - Focus started: the bar, whose Changes opens that tab, over what the engine
//   serves after the write: the cause's Focus pill, and no Focus on any card.
// - Unpinnable: a cause the engine will not focus has no button, and nothing
//   says why; its head keeps the button's height.
// - Back: "‹ Queue" and, on desktop, Escape return with the Pattern open.
// - Returned to: a Back from another tab opens the drill-down as it was, and
//   "‹ Queue" then leaves it through the router; returned to while its answers
//   load, its title and a skeleton per cause it opened with; returned to after
//   its Pattern left the Queue, it leaves at once, so no Back is a dead step.
const meta: Meta<typeof QueueScreen> = {
  title: 'Screens/DrillDown',
  component: QueueScreen,
};
export default meta;
type Story = StoryObj<typeof QueueScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

type State = 'drill_down' | 'drill_down_pinned' | 'drill_down_unpinnable';
const opened = (state: State, layout: 'phone' | 'desktop', more: Partial<QueueScreenProps> = {}): Story => {
  const { store, pattern: key } = patternStore(state);
  return {
    args: { layout, store, open: `pattern:${key}`, view: 'causes', ...more },
    parameters: { frame: FRAMES[layout] },
  };
};
const served = (args: QueueScreenProps) => {
  const key = args.open!.replace(/^pattern:/, '');
  return { title: pattern(args.store, key).title, causes: causes(args.store, key) };
};
const cards = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll<HTMLElement>('.ui-queue__causes .ui-pcard')];

/** "‹ Queue" over the Pattern's title, each cause's title, count and trace in the
 *  served order, no primary and no Snooze, and one page scrolling to the last card. */
const drawn: Story['play'] = async ({ canvasElement, args }) => {
  const { title, causes: expected } = served(args);
  await expectTitlePrinted(canvasElement, title);
  const header = within(canvasElement).getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement;
  await expect(within(header).getByRole('button', { name: 'Queue' })).toBeInTheDocument();
  const shown = cards(canvasElement);
  await expect(shown.map((card) => card.querySelector('h2')!.textContent)).toEqual(expected.map((c) => c.title));
  await expect(shown.map((card) => card.querySelector('.ui-pcard__magnitude')!.textContent))
    .toEqual(expected.map(({ magnitude: m }) => `${m!.count.value}of ${m!.denominator.value} ${m!.noun}`));
  // Each cause's own trace: as many episodes drawn as its served trace holds.
  await expect(shown.map((card) => card.querySelectorAll('.ui-chart__series-trace').length > 0))
    .toEqual(expected.map((c) => (c.traces?.episodes?.length ?? 0) > 0));
  await expect(canvasElement.querySelector('[data-role="primary"]')).toBeNull();
  await expect(within(canvasElement).queryByRole('button', { name: 'Snooze' })).toBeNull();
  // Each Focus sits in its card's head, beside the title, in a slot as tall as
  // its 44 px hit area whatever it holds: the button, the pill, or nothing.
  for (const card of shown) {
    const slot = card.querySelector('.ui-pcard__head .ui-pcard__slot') as HTMLElement;
    await expect(slot.getBoundingClientRect().height).toBe(44);
    const button = within(card).queryByRole('button', { name: 'Focus' });
    if (button) await expect(slot.contains(button)).toBe(true);
  }
  const page = shown[0].closest<HTMLElement>('[data-scroll="page"]')!;
  const top = header.getBoundingClientRect().top;
  page.scrollTop = page.scrollHeight;
  await new Promise(requestAnimationFrame);
  await expect(header.getBoundingClientRect().top).toBe(top);
  await expect(shown.at(-1)!.getBoundingClientRect().bottom).toBeLessThanOrEqual(page.getBoundingClientRect().bottom);
  page.scrollTop = 0;
};

const openPlay: Story['play'] = async (context) => {
  await drawn(context);
  await expect(focusable(context.args.store)).toBe(true);
  await expect(within(context.canvasElement).getAllByRole('button', { name: 'Focus' }))
    .toHaveLength(served(context.args).causes.length);
};
export const Open: Story = { ...opened('drill_down', 'phone'), play: openPlay };

/** Pinned: the watched cause's Focus pill in its button's place, and no Focus on any card. */
export const Pinned: Story = {
  ...opened('drill_down_pinned', 'phone'),
  play: async (context) => {
    await drawn(context);
    const { canvasElement, args } = context;
    await expect(focusable(args.store)).toBe(false);
    await expect(within(canvasElement).queryByRole('button', { name: 'Focus' })).toBeNull();
    const pills = cards(canvasElement).map((card) => card.querySelector('.ui-pcard__head [data-state="focus"]') !== null);
    await expect(pills).toEqual(served(args).causes.map((c) => c.pinned));
    await expect(pills.filter(Boolean)).toHaveLength(1);
  },
};

/** Desktop: the detail pane holds the drill-down, its cards in a grid no narrower
 *  than the phone's card, and the Queue's list stays beside it. */
export const Desktop: Story = {
  ...opened('drill_down', 'desktop'),
  play: async (context) => {
    await openPlay(context);
    const pane = context.canvasElement.querySelector('.ui-queue__pane--detail') as HTMLElement;
    for (const card of cards(context.canvasElement)) {
      await expect(pane.contains(card)).toBe(true);
      await expect(card.getBoundingClientRect().width).toBeGreaterThanOrEqual(358);
    }
    const list = context.canvasElement.querySelector('.ui-queue__pane--list') as HTMLElement;
    await expect(within(list).getByRole('button', { name: new RegExp(served(context.args).title) })).toBeInTheDocument();
  },
};

/** Loading: opened, then waiting for its answers, a card skeleton per cause it
 *  opened with under its title. */
export const Loading: Story = {
  ...opened('drill_down', 'phone'),
  render: (args) => <ServedAfter {...args} then="loading" />,
  play: async ({ canvasElement, args }) => {
    await waitFor(() => expect(canvasElement.querySelectorAll('.ui-queue__causes .ui-pcard--loading'))
      .toHaveLength(served(args).causes.length));
    await expectTitlePrinted(canvasElement, served(args).title);
  },
};

/** Stale: the last answers kept, under the header's Unavailable and Retry, as
 *  the Queue marks them. */
export const Stale: Story = {
  ...opened('drill_down', 'phone', { state: 'stale', onRetry: fn() }),
  play: async ({ canvasElement, args }) => {
    const { title, causes: expected } = served(args);
    const header = within(canvasElement).getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement;
    await expect(header).toHaveTextContent('Unavailable');
    await expect(within(header).getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    await expect(cards(canvasElement)).toHaveLength(expected.length);
    await userEvent.click(within(header).getByRole('button', { name: 'Retry' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};

/** Unavailable: opened, then its answers cannot be read: Unavailable and Retry in
 *  the pane under "‹ Queue" and the title, and no cause drawn. */
const unavailable = (layout: 'phone' | 'desktop'): Story => ({
  ...opened('drill_down', layout, { onRetry: fn() }),
  render: (args) => <ServedAfter {...args} then="unavailable" />,
  play: async ({ canvasElement, args }) => {
    const { title } = served(args);
    await waitFor(() => expect(cards(canvasElement)).toHaveLength(0));
    const header = within(canvasElement).getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement;
    await expect(header).toHaveTextContent('Unavailable');
    await expect(within(header).getByRole('button', { name: 'Queue' })).toBeInTheDocument();
    await userEvent.click(within(header).getByRole('button', { name: 'Retry' }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
});
export const Unavailable: Story = unavailable('phone');
export const UnavailableDesktop: Story = unavailable('desktop');

/** A cause's Focus shows its pill at once; not saved, the card is back with
 *  Focus, and the bar reads Not saved with Retry. Retry then saves it. */
const failOnce = () => opened('drill_down', 'phone', { writes: {
  snooze: failsOnce(undefined), restore: failsOnce(undefined), pin: failsOnce(undefined),
  done: failsOnce(undefined), undoDone: failsOnce(undefined) } });
const notSaved: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const first = cards(canvasElement)[0];
  await userEvent.click(within(first).getByRole('button', { name: 'Focus' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Not saved'));
  await expect(within(first).getByRole('button', { name: 'Focus' })).toBeInTheDocument();
};
export const NotSaved: Story = { ...failOnce(), play: notSaved };
export const NotSavedRetry: Story = {
  ...failOnce(),
  play: async (context) => {
    await notSaved(context);
    const canvas = within(context.canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Focus started'));
  },
};

/** A cause's Focus, saved: its pill at once, then the bar "Focus started", whose
 *  Changes opens that tab, over what the engine serves after the write (the
 *  store with that Focus): the cause's pill, and no Focus on any card. */
const started = (layout: 'phone' | 'desktop'): Story => ({
  ...opened('drill_down', layout, {
    writes: {
      snooze: async () => undefined, restore: async () => undefined, done: async () => undefined,
      undoDone: async () => undefined, pin: fn(async () => undefined),
    },
    nav: { onSelect: fn() },
  }),
  render: (args) => <ServedAfter {...args} focused={patternStore('drill_down_pinned').store} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const { causes: expected } = served(args);
    const pinned = causes(patternStore('drill_down_pinned').store, patternStore('drill_down_pinned').pattern);
    await expect(pinned.find((c) => c.pinned)!.lever).toBe(expected[0].lever);
    await userEvent.click(within(cards(canvasElement)[0]).getByRole('button', { name: 'Focus' }));
    await expect(args.writes!.pin).toHaveBeenCalledWith(args.open, expected[0].lever);
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent('Focus started'));
    const pills = cards(canvasElement).map((card) => card.querySelector('.ui-pcard__head [data-state="focus"]') !== null);
    await expect(pills).toEqual(pinned.map((c) => c.pinned));
    await expect(canvas.queryByRole('button', { name: 'Focus' })).toBeNull();
    await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Changes' }));
    await expect(args.nav!.onSelect).toHaveBeenCalledWith('changes');
  },
});
export const FocusStarted: Story = started('phone');
export const FocusStartedDesktop: Story = started('desktop');

/** A cause the engine serves as not focusable keeps its title, count and trace,
 *  with no button and nothing saying why, its head as tall as the others'. */
export const Unpinnable: Story = {
  ...opened('drill_down_unpinnable', 'phone'),
  play: async (context) => {
    await drawn(context);
    const { canvasElement, args } = context;
    const offered = cards(canvasElement).map((card) => within(card).queryByRole('button', { name: 'Focus' }) !== null);
    await expect(offered).toEqual(served(args).causes.map((c) => c.pinnable));
    await expect(offered).toContain(false);
    await expect(offered).toContain(true);
  },
};

/** Back: "‹ Queue" returns to the Queue with the Pattern's card open; its chart
 *  opens the drill-down again, and on desktop Escape returns too. */
const backPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const { title } = served(args);
  const queueCard = () => canvasElement.querySelector('.ui-pcard h2')?.textContent;
  const header = canvas.getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement;
  await userEvent.click(within(header).getByRole('button', { name: 'Queue' }));
  await waitFor(() => expect(cards(canvasElement)).toHaveLength(0));
  await expect(queueCard()).toBe(title);
  if (layout === 'phone') return;
  await userEvent.click(canvas.getByRole('button', { name: title }));
  await expectTitlePrinted(canvasElement, title);
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(cards(canvasElement)).toHaveLength(0));
  await expect(queueCard()).toBe(title);
};
export const Back: Story = { ...opened('drill_down', 'phone'), play: backPlay('phone') };
export const BackDesktop: Story = { ...opened('drill_down', 'desktop'), play: backPlay('desktop') };

/** A router whose Back reports the return, as the app's does (tab-routing.js). */
const router = () => {
  const listeners: (() => void)[] = [];
  return {
    open: fn(),
    close: fn(() => listeners.forEach((listener) => listener())),
    onReturn: (listener: () => void) => {
      listeners.push(listener);
      return () => { listeners.splice(listeners.indexOf(listener), 1); };
    },
  };
};
const RETURN = patternStore('drill_down');

/** Returned to: a Back from Changes onto the drill-down's history entry opens
 *  it as it was; "‹ Queue" then goes Back through the router, whose return
 *  shows the Queue with the Pattern open. */
export const ReturnedTo: Story = {
  args: {
    layout: 'phone', store: RETURN.store,
    returnTo: { view: 'causes', subject: `pattern:${RETURN.pattern}` },
    nav: { drillDown: router() },
  },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement, args }) => {
    const { title, causes: expected } = served({ ...args, open: args.returnTo!.subject });
    await expect(cards(canvasElement)).toHaveLength(expected.length);
    const header = within(canvasElement).getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement;
    await userEvent.click(within(header).getByRole('button', { name: 'Queue' }));
    await expect(args.nav!.drillDown!.close).toHaveBeenCalledOnce();
    await expect(args.nav!.drillDown!.open).not.toHaveBeenCalled();
    await waitFor(() => expect(cards(canvasElement)).toHaveLength(0));
    await expect(canvasElement.querySelector('.ui-pcard h2')!.textContent).toBe(title);
  },
};

/** Returned to while its answers load: the title and a skeleton per cause it
 *  opened with, which its history entry carries. */
export const ReturnedToLoading: Story = {
  args: {
    layout: 'phone', store: RETURN.store, state: 'loading',
    returnTo: { view: 'causes', subject: `pattern:${RETURN.pattern}`,
      title: pattern(RETURN.store, RETURN.pattern).title, causes: causes(RETURN.store, RETURN.pattern).length },
    nav: { drillDown: router() },
  },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement, args }) => {
    await expectTitlePrinted(canvasElement, args.returnTo!.title!);
    await expect(canvasElement.querySelectorAll('.ui-queue__causes .ui-pcard--loading')).toHaveLength(args.returnTo!.causes!);
  },
};

/** Returned to after its Pattern left the Queue: it leaves through the router at
 *  once, and the Queue shows, so the next Back is not a dead step. */
export const ReturnedToGone: Story = {
  args: {
    layout: 'phone', store: RETURN.store,
    returnTo: { view: 'causes', subject: 'pattern:not_ranked', title: 'Gone', causes: 2 },
    nav: { drillDown: router() },
  },
  parameters: { frame: FRAMES.phone },
  play: async ({ canvasElement, args }) => {
    await waitFor(() => expect(args.nav!.drillDown!.close).toHaveBeenCalledOnce());
    await expect(cards(canvasElement)).toHaveLength(0);
    await expect(canvasElement.querySelector('.ui-pcard h2')!.textContent).toBe(served({ ...args, open: `pattern:${RETURN.pattern}` }).title);
  },
};
