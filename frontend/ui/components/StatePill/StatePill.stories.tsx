import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatePill, type PillState } from './StatePill';

// One story per state listed in §4.2 StatePill.
const meta = {
  title: 'StatePill',
  component: StatePill,
  parameters: { frame: { width: 160 } },
} satisfies Meta<typeof StatePill>;
export default meta;

type Story = StoryObj<typeof meta>;
const story = (state: PillState): Story => ({ args: { state } });

export const Pattern = story('pattern');
export const Setting = story('setting');
export const Wide = story('wide');
export const Maturing = story('maturing');
export const Better = story('better');
export const Worse = story('worse');
export const Unclear = story('unclear');
export const Focus = story('focus');
