import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { expectHoursApart } from '../../hours-check';
import { profile } from '../../overview-model';
import { GlucoseProfile } from './GlucoseProfile';

// §4.2 GlucoseProfile: the simulated wearer's last 30 days, and the same
// wearer's first five days, which fall short of the profile's supported floor
// (the engine's eight days) in every bin, so the card says "No data". Narrow:
// a card too narrow for all five hours keeps those that clear each other, the
// day's two ends among them (#650).
const meta = {
  title: 'GlucoseProfile',
  component: GlucoseProfile,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof GlucoseProfile>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: profile('wearer', '14')! } };
export const Window90: Story = { args: { data: profile('wearer', '90')! } };
export const NoData: Story = { args: { data: profile('wearer-first-days', '14')! } };
export const Narrow: Story = {
  args: { data: profile('wearer', '14')! },
  parameters: { frame: { width: 240 } },
  play: async ({ canvasElement }) => {
    await expect((await expectHoursApart(canvasElement)).length).toBeLessThan(5);
  },
};
