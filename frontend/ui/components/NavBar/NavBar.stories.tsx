import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { NavBar, type NavBarProps, type NavItem } from './NavBar';

// Each layout × each item selected, then the count badge and the alert badge
// (§4.2 NavBar). Every rail story opens with the wordmark (§2.5, 2026-10-13);
// RailWordmark holds it alone with nothing selected but Queue. The count is the fixture's unanswered Prompts; the alert reads
// the fixture's failed sync status.
const meta = {
  title: 'NavBar',
  component: NavBar,
} satisfies Meta<typeof NavBar>;
export default meta;

type Story = StoryObj<typeof meta>;

const FRAMES = {
  tabbar: { width: 390, padding: 0 },
  rail: { width: 88, height: 500, padding: 0 },
} as const;

const dayCount = sourced<number>('prompts[answer=null].length');
const syncFailed = fixtures.status.failed.last_error !== null;

function story(layout: NavBarProps['layout'], selected: NavItem, extra: Partial<NavBarProps> = {}): Story {
  return {
    args: { layout, selected, ...extra },
    parameters: { frame: FRAMES[layout] },
    play: async ({ canvasElement }) => {
      const current = canvasElement.querySelectorAll('[aria-current="page"]');
      await expect(current).toHaveLength(1);
      // The active indicator (§2.5, 2026-10-14): a pill behind the icon, 32 px
      // tall and 64 wide on the tab bar, 56 on the rail, tinted not solid.
      const icon = current[0].querySelector('.ui-nav__icon')!;
      const box = icon.getBoundingClientRect();
      await expect([box.width, box.height]).toEqual([layout === 'rail' ? 56 : 64, 32]);
      const pill = getComputedStyle(icon, '::before');
      await expect(pill.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
      await expect(pill.borderTopLeftRadius).toBe('16px');
    },
  };
}

export const TabBarQueue = story('tabbar', 'queue');
export const TabBarChanges = story('tabbar', 'changes');
export const TabBarOverview = story('tabbar', 'overview');
export const TabBarDay = story('tabbar', 'day');
export const TabBarSettings = story('tabbar', 'settings');
export const TabBarCountBadge = story('tabbar', 'queue', { dayCount });
export const TabBarAlertBadge = story('tabbar', 'queue', { syncFailed });
export const TabBarDayBadgeSelected = story('tabbar', 'day', { dayCount });
export const TabBarSettingsAlertSelected = story('tabbar', 'settings', { syncFailed });

export const RailQueue = story('rail', 'queue');
export const RailChanges = story('rail', 'changes');
export const RailOverview = story('rail', 'overview');
export const RailDay = story('rail', 'day');
export const RailSettings = story('rail', 'settings');
export const RailCountBadge = story('rail', 'queue', { dayCount });
export const RailAlertBadge = story('rail', 'queue', { syncFailed });
export const RailDayBadgeSelected = story('rail', 'day', { dayCount });
export const RailSettingsAlertSelected = story('rail', 'settings', { syncFailed });

// The rail's wordmark (§2.5, 2026-10-13): above Queue, and not a control.
export const RailWordmark: Story = {
  ...story('rail', 'queue'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Harmonic')).toBeInTheDocument();
    await expect(canvas.queryByRole('button', { name: /Harmonic/ })).toBeNull();
    const [first] = canvas.getAllByRole('button');
    await expect(canvas.getByText('Harmonic').compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  },
};
