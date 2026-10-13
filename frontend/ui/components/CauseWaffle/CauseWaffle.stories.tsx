import type { Meta, StoryObj } from '@storybook/react-vite';
import { patternState } from '../../queue-model';
import { CauseWaffle } from './CauseWaffle';

// One story per state (§4.2 CauseWaffle), each the simulated wearer's own
// served pattern: two or more attributed causes, one cause, and a count no
// cause claims.
const meta = {
  title: 'CauseWaffle',
  component: CauseWaffle,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof CauseWaffle>;
export default meta;

type Story = StoryObj<typeof meta>;

function story(name: 'multi_cause' | 'single_cause' | 'no_cause'): Story {
  const data = patternState(name);
  const magnitude = data.magnitude!;
  return {
    args: {
      n: magnitude.denominator.value, k: magnitude.count.value,
      causes: data.causes, noun: magnitude.noun, tone: data.tone,
    },
  };
}

export const MultiCause = story('multi_cause');
export const SingleCause = story('single_cause');
export const NoCause = story('no_cause');
