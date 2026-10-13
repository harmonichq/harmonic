import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtures, sourced } from '../../fixtures';
import { dayDate, promptPlace } from '../../day-model';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { ScreenHeader } from './ScreenHeader';

// One story per state (§4.2 ScreenHeader): a title alone; with the date its
// data runs to (the 14-day window's served span end); with the labelled action
// "+ Log carbs"; with a control (the window choice); and unavailable (§1.2).
// Desktop is the same header at the top of a wide pane. A drill-down
// sub-screen adds "‹ Parent" above its title (§2.2 Drill-down). Day names the
// day it shows beside its title, with "+ Log carbs"; its Prompts drill-down
// counts its place, the first of the two lows the wearer had not yet answered.
const meta = {
  title: 'ScreenHeader',
  component: ScreenHeader,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ScreenHeader>;
export default meta;

type Story = StoryObj<typeof meta>;

const spanEnd = sourced<string>('outcomes.14.span_end', 'date');
const windows = (['14', '30', '90'] as const).map((key) => ({ days: sourced<number>(`outcomes.${key}.window_days`) }));

export const Default: Story = { args: { title: 'Queue' } };
export const WithDate: Story = { args: { title: 'Overview', trailing: 'date', date: spanEnd } };
export const WithAction: Story = { args: { title: 'Day', trailing: 'action', label: '+ Log carbs' } };
export const WithControl: Story = {
  args: {
    title: 'Overview', trailing: 'control',
    control: <SegmentedControl options={windows} selected={fixtures.outcomes['14'].window_days} />,
  },
};
export const Unavailable: Story = { args: { title: 'Changes', trailing: 'unavailable' } };
export const Desktop: Story = {
  args: { title: 'Overview', trailing: 'date', date: spanEnd, layout: 'desktop' },
  parameters: { frame: { width: 1440 } },
};
export const DrillDown: Story = { args: { title: 'Snoozed', back: { label: 'Queue' } } };
export const WithDay: Story = {
  args: { title: 'Day', day: dayDate(fixtures.day.states.latest), trailing: 'action', label: '+ Log carbs' },
};
export const WithCount: Story = {
  args: { title: 'Lows', back: { label: 'Day' }, trailing: 'count', ...promptPlace('wearer-pending') },
};
