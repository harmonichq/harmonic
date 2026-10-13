import type { Meta, StoryObj } from '@storybook/react-vite';
import { basalSetting } from '../../queue-model';
import { SettingCard } from './SettingCard';

// One story per state (§4.2 SettingCard), each a real basal block:
// - Default: basal-recurring-low-spread 03:00, a range from 0.45 to 0.66.
// - RangeCollapsed: the showcase's admitted 03:00 to 04:00 block, lo = hi.
// - MaturedTrial: c3-trial 03:00, whose earlier change matured into a Trial.
const meta = {
  title: 'SettingCard',
  component: SettingCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SettingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: basalSetting('basal-recurring-low-spread', 180) } };
export const RangeCollapsed: Story = { args: { data: basalSetting('showcase', 180) } };
export const MaturedTrial: Story = { args: { data: basalSetting('c3-trial', 180) } };
