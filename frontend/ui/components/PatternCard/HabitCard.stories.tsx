import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { focusable, habitState } from '../../queue-model';
import { PatternCard } from './PatternCard';

// The HabitCard (§4.2, §2.5 2026-10-19, ADR 528): a standalone habit's open
// card, which the PatternCard draws from the habit's served data. One story per
// state, each a served answer the fixture generator picked:
// - Episodes: the missed-meal QA case, its two rises each drawn. Its two meals
//   bolused for are too few for a band of three readings, so no Typical.
// - Band: the wearer skipping the lunch bolus every weekday of four weeks,
//   more rises than the chart draws one by one, as the habit's median and band.
// - Pinned: the QA case once its person started a Focus on the habit, the
//   Focus pill in Focus's place; the engine then admits no other Focus.
// Whether Focus is drawn is the store's served admission (ADR 594).
// - Loading: the card's skeleton.
// Every state at the phone's 390 and the desktop detail pane's 720: on the phone
// no Snooze text action (the Queue swipes the card, ADR 614) and the chevron that
// closes the card, pressed; on desktop Snooze beneath, and no chevron.
const meta = {
  title: 'HabitCard',
  component: PatternCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PatternCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 720 } };

const episodes = habitState('habit_episodes').data;
const band = habitState('habit_band').data;
const pinned = habitState('habit_pinned').data;

/** What every habit card shows: its count, its chart with its episodes named
 *  Habit (and Typical where the engine serves its band), and neither an
 *  Uncertain tag nor an impact line, which the engine serves only for a
 *  Pattern. */
async function habitCard(canvasElement: HTMLElement, data: typeof episodes) {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 2, name: data.title })).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-pcard__magnitude')!.textContent)
    .toBe(`${data.magnitude!.count.value}of ${data.magnitude!.denominator.value} ${data.magnitude!.noun}`);
  const legend = [...canvasElement.querySelectorAll('.ui-chart__legend')].map((key) => key.textContent).join(' ');
  await expect(legend).toContain('Habit');
  await expect(legend.includes('Typical')).toBe(data.traces!.typical.length > 0);
  await expect(legend).not.toContain('Pattern');
  await expect(canvasElement.querySelector('[data-state="uncertain"], .ui-pcard__impact')).toBeNull();
}

type Called = { onCollapse: ReturnType<typeof fn> };
/** Phone: no Snooze text action, and the chevron, an icon button named by the
 *  card's title and expanded, closes the card (`then` runs first). */
const phone = (then: Story['play']): Story['play'] => async (context) => {
  await then!(context);
  const { args, canvasElement } = context;
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole('button', { name: 'Snooze' })).toBeNull();
  const chevron = canvas.getByRole('button', { expanded: true });
  await expect(chevron.dataset.role).toBe('icon');
  await expect(chevron.getAttribute('aria-labelledby')).toBe(canvas.getByRole('heading', { level: 2 }).id);
  await userEvent.click(chevron);
  await expect((args as unknown as Called).onCollapse).toHaveBeenCalledOnce();
};
/** Desktop: Snooze beneath Focus or its pill, and no chevron. */
const desktop = (then: Story['play']): Story['play'] => async (context) => {
  await then!(context);
  const canvas = within(context.canvasElement);
  const snooze = canvas.getByRole('button', { name: 'Snooze' });
  const above = snooze.closest('.ui-card-snooze')!.previousElementSibling!.getBoundingClientRect();
  await expect(snooze.getBoundingClientRect().top).toBeGreaterThan(above.bottom);
  await expect(canvas.queryByRole('button', { expanded: true })).toBeNull();
};

/** The chart draws what the engine served: one trace per episode, or one band. */
const drawn = (data: typeof episodes): Story['play'] => async ({ canvasElement }) => {
  await habitCard(canvasElement, data);
  const traces = canvasElement.querySelectorAll('.ui-chart__high .ui-chart__series-trace').length;
  const bands = canvasElement.querySelectorAll('.ui-chart__high .ui-chart__series-band').length;
  if (data.traces!.episodes) {
    await expect(traces).toBeGreaterThanOrEqual(data.traces!.episodes.length);
    await expect(bands).toBe(0);
  } else {
    await expect(traces).toBe(0);
    await expect(bands).toBeGreaterThan(0);
  }
};

/** Unpinned, Focus is the card's one primary, and pressing it asks for a Focus. */
const pins: Story['play'] = async (context) => {
  await drawn(episodes)!(context);
  const { args, canvasElement } = context;
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Focus' }));
  await expect((args as unknown as { onPin: ReturnType<typeof fn> }).onPin).toHaveBeenCalledOnce();
};

/** Pinned, the Focus pill takes Focus's place. */
const pinnedPlay: Story['play'] = async ({ canvasElement }) => {
  await habitCard(canvasElement, pinned);
  await expect(within(canvasElement).queryByRole('button', { name: 'Focus' })).toBeNull();
  const pill = canvasElement.querySelector('.ui-pcard__action [data-state="focus"]') as HTMLElement;
  await expect(pill.textContent).toBe('Focus');
};

const admitted = (state: 'habit_episodes' | 'habit_band' | 'habit_pinned') => focusable(habitState(state).store);
const unpinned = (data: typeof episodes, state: 'habit_episodes' | 'habit_band') =>
  ({ data, focusable: admitted(state), onPin: fn() });
/** The phone's card closes to its row; the desktop's offers Snooze. */
const PHONE = () => ({ onCollapse: fn() });
const SNOOZE = () => ({ onSnooze: fn() });

export const Episodes: Story = { args: { ...unpinned(episodes, 'habit_episodes'), ...PHONE() }, play: phone(pins) };
export const EpisodesDesktop: Story = {
  args: { ...unpinned(episodes, 'habit_episodes'), ...SNOOZE() }, parameters: DESKTOP, play: desktop(pins),
};
export const Band: Story = { args: { ...unpinned(band, 'habit_band'), ...PHONE() }, play: phone(drawn(band)) };
export const BandDesktop: Story = {
  args: { ...unpinned(band, 'habit_band'), ...SNOOZE() }, parameters: DESKTOP, play: desktop(drawn(band)),
};
export const Pinned: Story = {
  args: { data: pinned, focusable: admitted('habit_pinned'), ...PHONE() }, play: phone(pinnedPlay),
};
export const PinnedDesktop: Story = {
  args: { data: pinned, focusable: admitted('habit_pinned'), ...SNOOZE() }, parameters: DESKTOP, play: desktop(pinnedPlay),
};
export const Loading: Story = { args: { loading: true } };
export const LoadingDesktop: Story = { args: { loading: true }, parameters: DESKTOP };
