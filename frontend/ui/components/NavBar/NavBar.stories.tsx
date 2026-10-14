import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtures, sourced } from '../../fixtures';
import { NavBar, type NavBarProps, type NavItem } from './NavBar';

// Each layout × each item selected, then the count badge and the alert badge
// (§4.2 NavBar). The count is the fixture's unanswered Prompts; the alert reads
// the fixture's failed sync status.
const meta = {
  title: 'NavBar',
  component: NavBar,
} satisfies Meta<typeof NavBar>;
export default meta;

type Story = StoryObj<typeof meta>;

const FRAMES = {
  tabbar: { width: 390, padding: 0 },
  rail: { width: 88, height: 440, padding: 0 },
} as const;

const dayCount = sourced<number>('prompts[answer=null].length');
const syncFailed = fixtures.status.failed.last_error !== null;

function story(layout: NavBarProps['layout'], selected: NavItem, extra: Partial<NavBarProps> = {}): Story {
  return {
    args: { layout, selected, ...extra },
    parameters: { frame: FRAMES[layout] },
  };
}

export const TabBarQueue = story('tabbar', 'queue');
export const TabBarChanges = story('tabbar', 'changes');
export const TabBarOverview = story('tabbar', 'overview');
export const TabBarDay = story('tabbar', 'day');
export const TabBarSettings = story('tabbar', 'settings');
export const TabBarCountBadge = story('tabbar', 'queue', { dayCount });
export const TabBarAlertBadge = story('tabbar', 'queue', { syncFailed });

export const RailQueue = story('rail', 'queue');
export const RailChanges = story('rail', 'changes');
export const RailOverview = story('rail', 'overview');
export const RailDay = story('rail', 'day');
export const RailSettings = story('rail', 'settings');
export const RailCountBadge = story('rail', 'queue', { dayCount });
export const RailAlertBadge = story('rail', 'queue', { syncFailed });
