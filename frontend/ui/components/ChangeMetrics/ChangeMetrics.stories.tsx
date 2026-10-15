import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { change, type TrialData } from '../../changes-model';
import { ChangeMetrics } from './ChangeMetrics';

// §4.2 ChangeMetrics, one story per module, each the simulated wearer's
// matured basal Trial as its comparison serves it: In range / Below 70 / Above
// 180, with Below 70 its target metric and the engine's verdict on it toned;
// Mean / GMI / CV, which the engine does not judge; and how active Control-IQ
// was against the Pump profile. A last story stacks the three, as the screen
// does, to show their columns align.
const meta = {
  title: 'ChangeMetrics',
  component: ChangeMetrics,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ChangeMetrics>;
export default meta;

type Story = StoryObj<typeof meta>;

const basal = () => change('wearer') as TrialData;

export const Ranges: Story = { args: { rows: basal().ranges } };
export const Glucose: Story = { args: { rows: basal().glucose } };
export const ControlIq: Story = {
  args: { rows: basal().basal, title: <>Basal <span className="ui-metrics__meta">vs Pump profile</span></> },
};

// Every module's values in the same columns: the arrows sit at one x.
export const Aligned: Story = {
  args: { rows: basal().ranges },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ChangeMetrics rows={basal().ranges} />
      <ChangeMetrics rows={basal().glucose} />
      <ChangeMetrics rows={basal().basal} title={<>Basal <span className="ui-metrics__meta">vs Pump profile</span></>} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const arrows = [...canvasElement.querySelectorAll('.ui-metrics__arrow')]
      .map((arrow) => Math.round(arrow.getBoundingClientRect().left));
    await expect(arrows.length).toBe(9);
    await expect(new Set(arrows).size).toBe(1);
  },
};
