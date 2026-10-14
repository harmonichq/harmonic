import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { OverviewScreen, type OverviewScreenProps } from './OverviewScreen';

// The Overview screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Default: 14 d selected; 30 d and 90 d selected.
// - No data: the unsynced store, which serves every metric as null.
// - Loading, and Unavailable.
// Plays per size: choosing 30 d shows that window's metrics, and the page
// fits without scrolling.
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

export const DefaultPhone = story('phone', { store: 'wearer' });
export const DefaultDesktop = story('desktop', { store: 'wearer' });
export const Window30Phone = story('phone', { store: 'wearer', window: '30' });
export const Window30Desktop = story('desktop', { store: 'wearer', window: '30' });
export const Window90Phone = story('phone', { store: 'wearer', window: '90' });
export const Window90Desktop = story('desktop', { store: 'wearer', window: '90' });
export const NoDataPhone = story('phone', { store: 'wearer-unsynced' });
export const NoDataDesktop = story('desktop', { store: 'wearer-unsynced' });
export const LoadingPhone = story('phone', { store: 'wearer', state: 'loading' });
export const LoadingDesktop = story('desktop', { store: 'wearer', state: 'loading' });
export const UnavailablePhone = story('phone', { store: 'wearer', state: 'unavailable' });
export const UnavailableDesktop = story('desktop', { store: 'wearer', state: 'unavailable' });

// The Overview never scrolls: its page holds all of its content at both sizes.
const fits: Story['play'] = async ({ canvasElement }) => {
  const page = canvasElement.querySelector<HTMLElement>('[data-scroll="page"]')!;
  await expect(page.scrollHeight).toBeLessThanOrEqual(page.clientHeight);
};

export const FitsPhone: Story = { ...story('phone', { store: 'wearer' }), play: fits };
export const FitsDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: fits };

const choose30: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: '30 d' }));
  await expect(canvas.getByRole('button', { name: '30 d' })).toHaveAttribute('aria-pressed', 'true');
  await expect(canvasElement.querySelector('[data-source="outcomes.30.metrics.tir"]')).not.toBeNull();
};

export const ChooseWindowPhone: Story = { ...story('phone', { store: 'wearer' }), play: choose30 };
export const ChooseWindowDesktop: Story = { ...story('desktop', { store: 'wearer' }), play: choose30 };
