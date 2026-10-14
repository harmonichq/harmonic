import type { Meta, StoryObj } from '@storybook/react-vite';
import { settingState } from '../../queue-model';
import { SettingCard } from './SettingCard';

// One story per state (§4.2 SettingCard) the simulated wearer serves: an
// admitted Basal block, and the block whose earlier change matured into a
// Trial. A collapsed range (lo = hi) does not arise in the wearer's nights,
// so that state has no story; the card still prints such a range once.
const meta = {
  title: 'SettingCard',
  component: SettingCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SettingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: settingState('setting') } };
export const MaturedTrial: Story = { args: { data: settingState('setting_trial') } };
