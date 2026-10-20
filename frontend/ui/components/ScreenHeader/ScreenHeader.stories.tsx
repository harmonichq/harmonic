import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { dayDate, promptPlace } from '../../day-model';
import { expectHeaderEmpty, expectTitlePrinted, expectTitleUnprinted } from '../../title-check';
import { SegmentedControl } from '../SegmentedControl/SegmentedControl';
import { ScreenHeader } from './ScreenHeader';

// One story per state (§4.2 ScreenHeader). A tab screen's name is the tab the
// nav shows selected, so it is the h1 a screen reader reads and draws nothing
// (§2.5, 2026-10-20): alone, the header takes no height; with the labelled
// action "+ Log carbs", a control (the window choice), or unavailable (§1.2),
// only the slot draws, at the line's end. Desktop is the same header at the top
// of a wide pane. A drill-down sub-screen draws "‹ Parent" and its title below
// it (§2.2 Drill-down). Day's day leads its line as the control that drops the
// month down, closed and open, with "+ Log carbs"; its Prompts drill-down
// counts its place, the first of the two lows the wearer had not yet answered.
const meta = {
  title: 'ScreenHeader',
  component: ScreenHeader,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ScreenHeader>;
export default meta;

type Story = StoryObj<typeof meta>;

const windows = (['14', '30', '90'] as const).map((key) => ({ days: sourced<number>(`outcomes.${key}.window_days`) }));

/** The slot sits at the end of its line, the line the header draws. */
const slotEnds = (title: string, selector: string): Story['play'] => async ({ canvasElement }) => {
  const header = await expectTitleUnprinted(canvasElement, title);
  const slot = header.querySelector<HTMLElement>(selector)!.getBoundingClientRect();
  const box = header.getBoundingClientRect();
  await expect(Math.round(slot.right)).toBe(Math.round(box.right));
  await expect(box.height).toBe(44);
};

export const Default: Story = {
  args: { title: 'Queue' },
  play: async ({ canvasElement }) => expectHeaderEmpty(canvasElement, 'Queue'),
};
export const WithAction: Story = {
  args: { title: 'Day', trailing: 'action', label: '+ Log carbs' }, play: slotEnds('Day', '.ui-button'),
};
export const WithControl: Story = {
  args: {
    title: 'Overview', trailing: 'control',
    control: <SegmentedControl options={windows} selected={fixtures.outcomes['14'].window_days} />,
  },
  play: slotEnds('Overview', '.ui-header__control'),
};
export const Unavailable: Story = {
  args: { title: 'Changes', trailing: 'unavailable' }, play: slotEnds('Changes', '.ui-header__unavailable'),
};
export const Desktop: Story = {
  args: { title: 'Day', trailing: 'action', label: '+ Log carbs', layout: 'desktop' },
  parameters: { frame: { width: 1440 } },
};
export const DrillDown: Story = {
  args: { title: 'Snoozed', back: { label: 'Queue' } },
  play: async ({ canvasElement }) => expectTitlePrinted(canvasElement, 'Snoozed'),
};
export const WithDay: Story = {
  args: { title: 'Day', day: dayDate(fixtures.day.states.latest), trailing: 'action', label: '+ Log carbs' },
  // The day leads the line: its first word starts where the header does.
  play: async ({ canvasElement }) => {
    const header = await expectTitleUnprinted(canvasElement, 'Day');
    const day = within(header).getByRole('button', { name: /^\w{3} / });
    const words = document.createRange();
    words.selectNodeContents(day.firstChild!);
    await expect(Math.round(words.getBoundingClientRect().left)).toBe(Math.round(header.getBoundingClientRect().left));
  },
};
export const WithDayOpen: Story = {
  args: {
    title: 'Day', day: { ...dayDate(fixtures.day.states.latest), open: true }, trailing: 'action', label: '+ Log carbs',
  },
};
export const WithCount: Story = {
  args: { title: 'Lows', back: { label: 'Day' }, trailing: 'count', ...promptPlace('low', 'wearer-pending') },
  play: async ({ canvasElement }) => expectTitlePrinted(canvasElement, 'Lows'),
};
