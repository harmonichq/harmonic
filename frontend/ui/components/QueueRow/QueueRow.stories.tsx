import type { Meta, StoryObj } from '@storybook/react-vite';
import { basalSetting, pattern, type QueueStore } from '../../queue-model';
import { QueueRow, type QueueRowProps } from './QueueRow';

// One story per state (§4.2 QueueRow), each a real engine answer:
// - Default and SelectedDesktop: behavioral-carb-undercount, highs after meals.
// - MidSwipe: behavioral-split-meal.
// - NoCause: basal-recurring-low-spread, overnight lows no cause claims.
// - Setting: the showcase's admitted Basal block.
const meta = {
  title: 'QueueRow',
  component: QueueRow,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof QueueRow>;
export default meta;

type Story = StoryObj<typeof meta>;

function patternRow(store: QueueStore, key: string): Extract<QueueRowProps, { kind: 'pattern' }> {
  const data = pattern(store, key);
  return { kind: 'pattern', title: data.title, magnitude: data.magnitude!, cause: data.causes[0]?.title };
}

export const Default: Story = { args: patternRow('behavioral-carb-undercount', 'highs_after_meals') };
export const SelectedDesktop: Story = {
  args: { ...patternRow('behavioral-carb-undercount', 'highs_after_meals'), layout: 'desktop', selected: true },
  parameters: { frame: { width: 400, padding: 24 } },
};
export const MidSwipe: Story = {
  args: { ...patternRow('behavioral-split-meal', 'highs_after_meals'), swiping: true },
};
export const NoCause: Story = { args: patternRow('basal-recurring-low-spread', 'overnight_lows_no_iob') };
export const Setting: Story = {
  args: (() => {
    const setting = basalSetting('showcase', 180);
    return { kind: 'setting', title: setting.title, setting } satisfies QueueRowProps;
  })(),
};
export const Loading: Story = { args: { loading: true } };
