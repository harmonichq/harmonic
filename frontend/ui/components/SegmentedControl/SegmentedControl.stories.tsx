import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { SegmentedControl, lacksCoverage, type WindowOption } from './SegmentedControl';

// One story per selected window, plus the disabled state (§4.2). The window
// sizes are the served `window_days`; the disabled story disables whichever
// window the fixture's own coverage says is short (the 90-day window, which
// the synthetic store covers for fewer days).
const WINDOWS = ['14', '30', '90'] as const;

function options(withCoverage: boolean): WindowOption[] {
  return WINDOWS.map((key) => ({
    days: sourced<number>(`outcomes.${key}.window_days`),
    disabled: withCoverage && lacksCoverage(fixtures.outcomes[key]),
  }));
}

const meta = {
  title: 'SegmentedControl',
  component: SegmentedControl,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SegmentedControl>;
export default meta;

type Story = StoryObj<typeof meta>;
const story = (key: (typeof WINDOWS)[number], withCoverage = false): Story => ({
  args: { options: options(withCoverage), selected: fixtures.outcomes[key].window_days },
});

export const Selected14 = story('14');
export const Selected30 = story('30');
export const Selected90 = story('90');
export const Disabled = story('14', true);

// Choosing a window: the play selects 30 d, and the selection moves to it.
export const Select30: Story = {
  args: { options: options(false), selected: fixtures.outcomes['14'].window_days, onChange: fn() },
  render: function Render(args) {
    const [selected, setSelected] = useState(args.selected);
    return <SegmentedControl options={args.options} selected={selected}
      onChange={(days) => { args.onChange?.(days); setSelected(days); }} />;
  },
  play: async ({ args, canvasElement }) => {
    const thirty = within(canvasElement).getByRole('button', { name: /30/ });
    await userEvent.click(thirty);
    await expect(args.onChange).toHaveBeenCalledWith(fixtures.outcomes['30'].window_days);
    await expect(thirty).toHaveAttribute('aria-pressed', 'true');
  },
};
