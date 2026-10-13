import type { Meta, StoryObj } from '@storybook/react-vite';
import { basalSetting, type QueueStore } from '../../queue-model';
import { EvidenceChart } from './EvidenceChart';

// One story per state (§4.2 EvidenceChart), each a real basal slot:
// - Default: basal-recurring-low-spread 03:00, nights spread 0.45 to 0.66.
// - ZeroVariance: the showcase's 03:00, every night at one rate.
const meta = {
  title: 'EvidenceChart',
  component: EvidenceChart,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof EvidenceChart>;
export default meta;

type Story = StoryObj<typeof meta>;
function story(store: QueueStore, start: number): Story {
  const { nights, current, suggested } = basalSetting(store, start);
  return { args: { nights, current, suggested } };
}

export const Default = story('basal-recurring-low-spread', 180);
export const ZeroVariance = story('showcase', 180);
