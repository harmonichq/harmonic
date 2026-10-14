import type { Meta, StoryObj } from '@storybook/react-vite';
import { settingState } from '../../queue-model';
import { EvidenceChart } from './EvidenceChart';

// The simulated wearer's admitted Basal block (§4.2 EvidenceChart, default).
// Nights at one identical rate do not arise in the wearer's history, so the
// zero-variance state has no story; the chart draws it as a single stack.
const meta = {
  title: 'EvidenceChart',
  component: EvidenceChart,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof EvidenceChart>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: (() => {
    const { nights, roster, current, estimate, lo, hi, units } = settingState('setting_trial');
    return { nights: nights!, roster: roster!, current, estimate, lo, hi, units };
  })(),
};
