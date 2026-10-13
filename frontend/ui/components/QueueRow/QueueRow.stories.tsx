import type { Meta, StoryObj } from '@storybook/react-vite';
import { patternState, settingState } from '../../queue-model';
import { QueueRow, type QueueRowProps } from './QueueRow';

// One story per state (§4.2 QueueRow), each the simulated wearer's own
// served answer: the multi-cause pattern by default and selected on desktop,
// the single-cause one mid-swipe, the pattern no cause claims, and the
// admitted Basal block.
const meta = {
  title: 'QueueRow',
  component: QueueRow,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof QueueRow>;
export default meta;

type Story = StoryObj<typeof meta>;

function patternRow(name: 'multi_cause' | 'single_cause' | 'no_cause'): Extract<QueueRowProps, { kind: 'pattern' }> {
  const data = patternState(name);
  return { kind: 'pattern', title: data.title, magnitude: data.magnitude!, cause: data.causes[0]?.title };
}

export const Default: Story = { args: patternRow('multi_cause') };
export const SelectedDesktop: Story = {
  args: { ...patternRow('multi_cause'), layout: 'desktop', selected: true },
  parameters: { frame: { width: 400, padding: 24 } },
};
export const MidSwipe: Story = { args: { ...patternRow('single_cause'), swiping: true } };
export const NoCause: Story = { args: patternRow('no_cause') };
export const Setting: Story = {
  args: (() => {
    const setting = settingState('setting');
    return { kind: 'setting', title: setting.title, setting } satisfies QueueRowProps;
  })(),
};
export const Loading: Story = { args: { loading: true } };
