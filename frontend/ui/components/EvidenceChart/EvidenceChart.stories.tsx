import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { carbRatioSetting, settingState, type SettingData } from '../../queue-model';
import { EvidenceChart } from './EvidenceChart';

// §4.2 EvidenceChart, one row of dots (ADR 523): the simulated wearer's
// Basal block whose change matured into a Trial, its nights by delivered
// rate; and a queued I:C block's counted meal runs by their ratio, from the QA
// case whose meals support lowering the carb ratio. Nights at one identical
// rate do not arise in the wearer's history, so the zero-variance state has no
// story; the chart draws it as one pile spread either side of the row.
const meta = {
  title: 'EvidenceChart',
  component: EvidenceChart,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof EvidenceChart>;
export default meta;

type Story = StoryObj<typeof meta>;

const argsOf = ({ dots, roster, field, current, estimate, lo, hi, units, axis }: SettingData) =>
  ({ dots, roster, field, current, estimate, lo, hi, units, axis });

/** No two dots overlap, however many share a value. */
const dotsClear: Story['play'] = async ({ canvasElement }) => {
  const dots = [...canvasElement.querySelectorAll<SVGCircleElement>('.ui-chart__dot')]
    .map((dot) => [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))]);
  const touching = dots.filter(([x, y], i) => dots.some(([u, v], j) => j > i && Math.hypot(u - x, v - y) < 5.5));
  await expect(touching.length).toBe(0);
  await expect(canvasElement.querySelector('.ui-chart__caption')).not.toBeNull();
};

export const Default: Story = { args: argsOf(settingState('setting_trial')), play: dotsClear };
export const CarbRatio: Story = { args: argsOf(carbRatioSetting('carb-ratio-supported')!), play: dotsClear };
export const Desktop: Story = { args: argsOf(settingState('setting_trial')), parameters: { frame: { width: 720 } } };
