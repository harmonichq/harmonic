import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OverviewScreen, type OverviewScreenProps } from './OverviewScreen';

// The Overview screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Default: 14 d selected, its changes against the 14 days before it; 30 d
//   selected against the 30 days before; 90 d selected, whose previous 90 days
//   the 84-day history does not reach: the span alone, no changes.
// - No data: the unsynced store, which serves every metric as null.
// - Loading, and Unavailable; Stale, the last answers under Unavailable.
// Plays per size: choosing 30 d shows that window's metrics, profile and ISF
// estimate; each window's date line and changes name the period before it, or
// none; and the page scrolls as one, the summary first, the ISF estimate below.
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
};

export const DefaultPhone: Story = { ...story('phone', { store: 'wearer' }), play: comparesWith('14', true) };
export const DefaultDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: comparesWith('14', true) };
export const Window30Phone: Story = { ...story('phone', { store: 'wearer', window: '30' }), play: comparesWith('30', true) };
export const Window30Desktop: Story = {
  ...story('desktop', { store: 'wearer', window: '30' }), play: comparesWith('30', true),
};
export const Window90Phone: Story = { ...story('phone', { store: 'wearer', window: '90' }), play: comparesWith('90', false) };
export const Window90Desktop: Story = {
  ...story('desktop', { store: 'wearer', window: '90' }), play: comparesWith('90', false),
};
export const NoDataPhone = story('phone', { store: 'wearer-unsynced' });
export const NoDataDesktop = story('desktop', { store: 'wearer-unsynced' });
export const LoadingPhone = story('phone', { store: 'wearer', state: 'loading' });
export const LoadingDesktop = story('desktop', { store: 'wearer', state: 'loading' });
export const UnavailablePhone = story('phone', { store: 'wearer', state: 'unavailable' });
export const UnavailableDesktop = story('desktop', { store: 'wearer', state: 'unavailable' });
// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
export const StalePhone = story('phone', { store: 'wearer', state: 'stale' });
export const StaleDesktop = story('desktop', { store: 'wearer', state: 'stale' });

/** The page scrolls as one: the summary fills the first screen (the profile
 *  ends inside it), the ISF estimate follows, and scrolled to the end the
 *  estimate is in view. */
const scrolled: Story['play'] = async ({ canvasElement }) => {
  const page = canvasElement.querySelector<HTMLElement>('[data-scroll="page"]')!;
  const top = page.getBoundingClientRect();
  const profile = canvasElement.querySelector('.ui-overview__profile')!.getBoundingClientRect();
  await expect(profile.bottom).toBeLessThanOrEqual(top.bottom);
  page.scrollTop = page.scrollHeight;
  await new Promise(requestAnimationFrame);
  const card = canvasElement.querySelector('.ui-isf')!.getBoundingClientRect();
  await expect(card.top).toBeGreaterThanOrEqual(top.top);
  await expect(card.bottom).toBeLessThanOrEqual(top.bottom);
};

export const ScrolledPhone: Story = { ...story('phone', { store: 'wearer' }), play: scrolled };
export const ScrolledDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: scrolled };

/** Choosing 30 d shows that window's metrics, glucose profile and ISF estimate. */
const choose30: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const at = (path: string) => canvasElement.querySelector(`[data-source^="${path}"]`);
  await expect(at('overview.wearer.time_of_day.14.')).not.toBeNull();
  await expect(at('overview.wearer.analyze.14.')).not.toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: '30 d' }));
  await expect(canvas.getByRole('button', { name: '30 d' })).toHaveAttribute('aria-pressed', 'true');
  await expect(canvasElement.querySelector('[data-source="outcomes.30.metrics.tir"]')).not.toBeNull();
  await expect(at('overview.wearer.time_of_day.30.')).not.toBeNull();
  await expect(at('overview.wearer.time_of_day.14.')).toBeNull();
  await expect(at('overview.wearer.analyze.30.')).not.toBeNull();
  await expect(at('overview.wearer.analyze.14.')).toBeNull();
};

export const ChooseWindowPhone: Story = { ...story('phone', { store: 'wearer' }), play: choose30 };
export const ChooseWindowDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: choose30 };
