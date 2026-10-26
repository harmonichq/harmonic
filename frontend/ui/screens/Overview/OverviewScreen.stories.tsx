import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { expectDirections } from '../../direction-check';
import { expectTabBarEnds } from '../../tabbar-check';
import { expectAtPaneTop, expectHeaderEmpty } from '../../title-check';
import { OverviewScreen, type OverviewScreenProps } from './OverviewScreen';

// The Overview screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Default: 14 d selected, its changes against the 14 days before it; 30 d
//   selected against the 30 days before; 90 d selected, whose previous 90 days
//   the 84-day history does not reach: the span alone, no changes.
// - No data: the unsynced store, which serves every metric as null.
// - Loading, and Unavailable; Stale, the last answers under Unavailable.
// Plays per size: choosing 30 d shows that window's metrics, profile, basal
// estimate, Meal size and insulin cards; each window's date line and changes
// name the period before it, or none; and the page scrolls as one, the summary
// first, the basal estimate below (ADR 523), then the Meal size card (ADR 501),
// then the Insulin summary and the Bolus review (ADR 634). On desktop the basal
// estimate and Meal size each span a row of its own, both rows one height, and
// the two insulin cards share the row after them, one height with each other
// and as tall as the taller one's content; on the phone they keep their
// proportions, in that order (§2.5, 2026-10-20 #564; 2026-10-26 #634). At 90 d
// the basal card marks the slots the engine stages a move for.
const meta: Meta<typeof OverviewScreen> = {
  title: 'Screens/Overview',
  component: OverviewScreen,
};
export default meta;

type Story = StoryObj<typeof OverviewScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

const story = (layout: 'phone' | 'desktop', args: Omit<OverviewScreenProps, 'layout'>): Story => ({
  args: { ...args, layout },
  parameters: { frame: FRAMES[layout] },
});

/** The window's date line, and its changes, compare with the period before it
 *  when that period has data, and otherwise show the span alone. */
const comparesWith = (window: '14' | '30' | '90', previous: boolean): Story['play'] => async ({ canvasElement }) => {
  const line = canvasElement.querySelector('.ui-overview__period')!;
  await expect(line.querySelector(`[data-source="outcomes.${window}.span_start"]`)).not.toBeNull();
  await expect(line.textContent!.includes('vs previous')).toBe(previous);
  const changes = canvasElement.querySelectorAll(`[data-source*="outcomes.${window}.previous.metrics."]`);
  await expect(changes.length > 0).toBe(previous);
  // Every metric's change is green or red by the way it moved (§2.5, 2026-10-19).
  await expect((await expectDirections(canvasElement, '.ui-metric', '.ui-metric__label')).length)
    .toBe(previous ? 6 : 0);
};

// The tab bar ends the screen: 64 px above the device's inset (§2.5, 2026-10-19).
// The nav's selected Overview names the screen, so its header draws nothing and
// the window switch starts the page (§2.5, 2026-10-20).
export const DefaultPhone: Story = {
  ...story('phone', { store: 'wearer' }),
  play: async (context) => {
    await comparesWith('14', true)!(context);
    await expectTabBarEnds(context.canvasElement);
    await expectHeaderEmpty(context.canvasElement, 'Overview');
  },
};
export const DefaultDesktop: Story = {
  ...story('desktop', { store: 'wearer' }),
  play: async (context) => {
    await comparesWith('14', true)!(context);
    await expectHeaderEmpty(context.canvasElement, 'Overview');
    await expectAtPaneTop(context.canvasElement.querySelector<HTMLElement>('.ui-overview__body')!);
  },
};
export const Window30Phone: Story = { ...story('phone', { store: 'wearer', window: '30' }), play: comparesWith('30', true) };
export const Window30Desktop: Story = {
  ...story('desktop', { store: 'wearer', window: '30' }), play: comparesWith('30', true),
};
export const Window90Phone: Story = { ...story('phone', { store: 'wearer', window: '90' }), play: comparesWith('90', false) };
export const Window90Desktop: Story = {
  ...story('desktop', { store: 'wearer', window: '90' }), play: comparesWith('90', false),
};
/** No readings: every card says No data, the basal estimate, Meal size and the two insulin cards. */
const noData: Story['play'] = async ({ canvasElement }) => {
  const cards = [...canvasElement.querySelectorAll('.ui-overview__estimates > .ui-scard, .ui-overview__insulin > .ui-scard')];
  await expect(cards.map((card) => card.querySelector('.ui-scard__none')?.textContent))
    .toEqual(['No data', 'No data', 'No data', 'No data']);
};
export const NoDataPhone: Story = { ...story('phone', { store: 'wearer-unsynced' }), play: noData };
export const NoDataDesktop: Story = { ...story('desktop', { store: 'wearer-unsynced' }), play: noData };
export const LoadingPhone = story('phone', { store: 'wearer', state: 'loading' });
export const LoadingDesktop = story('desktop', { store: 'wearer', state: 'loading' });
export const UnavailablePhone = story('phone', { store: 'wearer', state: 'unavailable' });
export const UnavailableDesktop = story('desktop', { store: 'wearer', state: 'unavailable' });
// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
// The Meal size card keeps drawing its last answer, as every card does.
const stale: Story['play'] = async ({ canvasElement }) => {
  await expect(canvasElement.querySelector('[data-source^="overview.wearer.meal_size.14."]')).not.toBeNull();
  await expect(canvasElement.querySelectorAll('.ui-meal-size [data-range]').length).toBeGreaterThan(0);
};
export const StalePhone: Story = { ...story('phone', { store: 'wearer', state: 'stale' }), play: stale };
export const StaleDesktop: Story = { ...story('desktop', { store: 'wearer', state: 'stale' }), play: stale };

/** The page scrolls as one: the summary fills the first screen (the profile
 *  ends inside it), the basal estimate, Meal size and the insulin cards follow,
 *  and scrolled to the end the last of them, the Bolus review, is in view. */
const scrolled: Story['play'] = async ({ canvasElement }) => {
  const page = canvasElement.querySelector<HTMLElement>('[data-scroll="page"]')!;
  const top = page.getBoundingClientRect();
  const profile = canvasElement.querySelector('.ui-overview__profile')!.getBoundingClientRect();
  await expect(profile.bottom).toBeLessThanOrEqual(top.bottom);
  page.scrollTop = page.scrollHeight;
  await new Promise(requestAnimationFrame);
  const cards = canvasElement.querySelectorAll('.ui-scard');
  await expect(cards[cards.length - 1].classList.contains('ui-bolus-review')).toBe(true);
  const card = cards[cards.length - 1].getBoundingClientRect();
  await expect(card.top).toBeGreaterThanOrEqual(top.top);
  await expect(card.bottom).toBeLessThanOrEqual(top.bottom);
};

export const ScrolledPhone: Story = { ...story('phone', { store: 'wearer' }), play: scrolled };
export const ScrolledDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: scrolled };

/** How tall a card's own content is: its last child's foot and the card's
 *  bottom padding, whatever height the grid stretched it to. */
const contentHeight = (card: Element) =>
  [...card.children].at(-1)!.getBoundingClientRect().bottom - card.getBoundingClientRect().top + 16;

/** On desktop the basal estimate spans the first row of the cards and the Meal
 *  size card the second, so no row is half empty, and both are one height,
 *  which the basal estimate sets: the Meal size card's content fits inside it
 *  (#559; §2.5, 2026-10-20 #564). The insulin cards share the row after them,
 *  side by side, one height with each other and as tall as the taller one's
 *  content, so it stretches neither them nor the rows above (§2.5, 2026-10-26
 *  #634). */
const oneHeight: Story['play'] = async ({ canvasElement }) => {
  const grid = canvasElement.querySelector('.ui-overview__estimates')!;
  const cards = [...grid.querySelectorAll(':scope > .ui-scard')];
  await expect(cards.map((card) => card.classList.contains('ui-meal-size'))).toEqual([false, true]);
  const [basal, meals] = cards.map((card) => card.getBoundingClientRect());
  for (const card of [basal, meals]) {
    await expect(Math.abs(card.width - grid.getBoundingClientRect().width)).toBeLessThan(0.5);
  }
  await expect(meals.top).toBeGreaterThan(basal.bottom);
  await expect(Math.abs(basal.height - meals.height)).toBeLessThan(0.5);
  await expect(contentHeight(cards[1])).toBeLessThanOrEqual(contentHeight(cards[0]) + 0.5);
  const row = canvasElement.querySelector('.ui-overview__insulin')!;
  const insulin = [...row.querySelectorAll(':scope > .ui-scard')];
  await expect(insulin.map((card) => card.className)).toEqual([
    'ui-scard ui-insulin-summary', 'ui-scard ui-bolus-review']);
  const [summary, review] = insulin.map((card) => card.getBoundingClientRect());
  await expect(summary.top).toBeGreaterThan(meals.bottom);
  await expect(Math.abs(summary.top - review.top)).toBeLessThan(0.5);
  await expect(review.left).toBeGreaterThan(summary.right);
  await expect(Math.abs(summary.width - review.width)).toBeLessThan(0.5);
  await expect(Math.abs(summary.height - review.height)).toBeLessThan(0.5);
  await expect(summary.height).toBeLessThanOrEqual(Math.max(...insulin.map(contentHeight)) + 0.5);
};
/** #559: on the phone the Meal size card keeps the basal estimate's proportions;
 *  the Insulin summary and the Bolus review follow it, in that order, each card
 *  under the one before (#634). */
const inProportion: Story['play'] = async ({ canvasElement }) => {
  const [basal, meals] = [...canvasElement.querySelectorAll('.ui-overview__estimates > .ui-scard')];
  await expect(meals.getBoundingClientRect().height).toBeLessThanOrEqual(basal.getBoundingClientRect().height * 1.4);
  const cards = [...canvasElement.querySelectorAll('.ui-scard')];
  await expect(cards.slice(1).map((card) => card.className)).toEqual([
    'ui-scard ui-meal-size', 'ui-scard ui-insulin-summary', 'ui-scard ui-bolus-review']);
  const boxes = cards.map((card) => card.getBoundingClientRect());
  for (let i = 1; i < boxes.length; i += 1) {
    await expect(boxes[i].top).toBeGreaterThan(boxes[i - 1].bottom);
    await expect(Math.abs(boxes[i].width - boxes[0].width)).toBeLessThan(0.5);
  }
};
export const EstimatesDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: oneHeight };
export const EstimatesPhone: Story = { ...story('phone', { store: 'wearer' }), play: inProportion };

/** Choosing 30 d shows that window's metrics, glucose profile, basal estimate, Meal size and insulin cards. */
const choose30: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const at = (path: string) => canvasElement.querySelector(`[data-source^="${path}"]`);
  // The basal estimate prints no served value, so its drawing is compared:
  // the 14 and 30 d windows serve different estimates.
  const basal = () => canvasElement.querySelector('.ui-overview__estimates > .ui-scard:not(.ui-meal-size)')!.innerHTML;
  const basal14 = basal();
  await expect(at('overview.wearer.time_of_day.14.')).not.toBeNull();
  await expect(at('overview.wearer.meal_size.14.')).not.toBeNull();
  await expect(at('overview.wearer.insulin.14.')).not.toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: '30 d' }));
  await expect(canvas.getByRole('button', { name: '30 d' })).toHaveAttribute('aria-pressed', 'true');
  await expect(canvasElement.querySelector('[data-source="outcomes.30.metrics.tir"]')).not.toBeNull();
  await expect(at('overview.wearer.time_of_day.30.')).not.toBeNull();
  await expect(at('overview.wearer.time_of_day.14.')).toBeNull();
  const basalCard = canvasElement.querySelector('.ui-overview__estimates > .ui-scard:not(.ui-meal-size)')!;
  await expect(basalCard.getAttribute('aria-busy')).toBeNull();
  await expect(basal()).not.toBe(basal14);
  // The Meal size card follows the window, as the basal estimate does (#565).
  await expect(at('overview.wearer.meal_size.30.')).not.toBeNull();
  await expect(at('overview.wearer.meal_size.14.')).toBeNull();
  // The insulin cards follow it too (#634).
  await expect(at('overview.wearer.insulin.30.')).not.toBeNull();
  await expect(at('overview.wearer.insulin.14.')).toBeNull();
};

export const ChooseWindowPhone: Story = { ...story('phone', { store: 'wearer' }), play: choose30 };
export const ChooseWindowDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: choose30 };
