import type { Meta, StoryObj } from '@storybook/react-vite';
import { pattern, type QueueStore } from '../../queue-model';
import { PatternCard } from './PatternCard';

// One story per state (§4.2 PatternCard), each a real engine answer:
// - MultiCause: behavioral-carb-undercount. The engine also serves this
//   pattern Wide, so the card shows it; every multi-cause case does.
// - SingleCause: behavioral-split-meal (not Wide).
// - NoCause: basal-recurring-low-spread, overnight lows no cause claims.
// - Wide: behavioral-correction-stacking.
// - Pinned: c3-focus, an active Focus on the pattern's habit. That store serves
//   no count for the pattern, so the card shows no magnitude.
const meta = {
  title: 'PatternCard',
  component: PatternCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PatternCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const story = (store: QueueStore, key: string): Story => ({ args: { data: pattern(store, key) } });

export const MultiCause = story('behavioral-carb-undercount', 'highs_after_meals');
export const SingleCause = story('behavioral-split-meal', 'highs_after_meals');
export const NoCause = story('basal-recurring-low-spread', 'overnight_lows_no_iob');
export const Wide = story('behavioral-correction-stacking', 'lows_after_correcting_highs');
export const Pinned = story('c3-focus', 'highs_after_meals');
export const Loading: Story = { args: { loading: true } };
