import type { Meta, StoryObj } from '@storybook/react-vite';
import { pattern, type QueueStore } from '../../queue-model';
import { CauseWaffle } from './CauseWaffle';

// One story per state (§4.2 CauseWaffle), each a real engine answer from a
// named QA store: two attributed causes, one cause, and a count no cause claims.
const meta = {
  title: 'CauseWaffle',
  component: CauseWaffle,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof CauseWaffle>;
export default meta;

type Story = StoryObj<typeof meta>;

function story(store: QueueStore, key: string): Story {
  const data = pattern(store, key);
  const magnitude = data.magnitude!;
  return {
    args: {
      n: magnitude.denominator.value, k: magnitude.count.value,
      causes: data.causes, noun: magnitude.noun, tone: data.tone,
    },
  };
}

export const MultiCause = story('behavioral-carb-undercount', 'highs_after_meals');
export const SingleCause = story('behavioral-split-meal', 'highs_after_meals');
export const NoCause = story('basal-recurring-low-spread', 'overnight_lows_no_iob');
