import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { change, type TrialData } from '../../changes-model';
import { expectDirections, type Tone } from '../../direction-check';
import { expectMetricsAligned } from '../../metrics-check';
import { ChangeMetrics, type ChangeMetricsProps } from './ChangeMetrics';

// §4.2 ChangeMetrics, one story per module at phone (390) and desktop (720,
// the Changes pane), each the simulated wearer's matured basal Trial as its
// comparison serves it: In range / Below 70 / Above 180, with Below 70 its
// target metric, every row moving the good way (green); Mean / GMI / CV, Mean
// and GMI up the bad way (red) and CV down the good way; and how active
// Control-IQ was against the Pump profile, where neither way is better
// (neutral). The same Trial six days in colours its modules by direction as a
// matured one does (§2.5, 2026-10-19). The last stories stack the three, as
// the screen does, at 390, 360 and 320 to show their columns align and no
// label touches a value (#575). Every other play checks each Δ's colour
// against its direction.
const meta = {
  title: 'ChangeMetrics',
  component: ChangeMetrics,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ChangeMetrics>;
export default meta;

type Story = StoryObj<typeof meta>;

const DESKTOP = { frame: { width: 720 } };
const basal = () => change('wearer') as TrialData;
const maturing = () => change('wearer-trial-maturing') as TrialData;
const controlIq = <>Basal <span className="ui-metrics__meta">vs Pump profile</span></>;

const directions = (expected: Tone[]): Story['play'] => async ({ canvasElement }) => {
  await expect(await expectDirections(canvasElement, '.ui-metrics__row', '.ui-metrics__label')).toEqual(expected);
};
const story = (args: ChangeMetricsProps, expected: Tone[], desktop = false): Story => ({
  args, play: directions(expected), ...(desktop ? { parameters: DESKTOP } : {}),
});

const RANGES: Tone[] = ['favorable', 'favorable', 'favorable'];
const GLUCOSE: Tone[] = ['adverse', 'adverse', 'favorable'];
const NEUTRAL: Tone[] = [null, null, null];

export const Ranges = story({ rows: basal().ranges }, RANGES);
export const RangesDesktop = story({ rows: basal().ranges }, RANGES, true);
export const Glucose = story({ rows: basal().glucose }, GLUCOSE);
export const GlucoseDesktop = story({ rows: basal().glucose }, GLUCOSE, true);
export const ControlIq = story({ rows: basal().basal, title: controlIq }, NEUTRAL);
export const ControlIqDesktop = story({ rows: basal().basal, title: controlIq }, NEUTRAL, true);
export const MaturingGlucose = story({ rows: maturing().glucose, count: maturing().readings }, GLUCOSE);
export const MaturingGlucoseDesktop = story({ rows: maturing().glucose, count: maturing().readings }, GLUCOSE, true);

// Every module's values in the same columns, stacked as the screen stacks
// them, at a phone's widths (§2.5, 2026-10-19, #575): the longest labels
// (Above 180, Readings, Delivered) beside the widest values the stores serve
// (the whole-profile switch's five-digit Readings, "mg/dL", Control-IQ's
// "▲ 23.3"). At 390 and 360 each row is one line; at 320 each label stands on
// its own line above its values. At every width no label touches a value, and
// each column (before, →, after, unit, Δ) sits at one x in every module.
const profile = () => change('wearer-profile') as TrialData;
const stack = (width: number): Story => ({
  args: { rows: profile().ranges },
  parameters: { frame: { width } },
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ChangeMetrics rows={profile().ranges} count={profile().readings} />
      <ChangeMetrics rows={maturing().glucose} count={maturing().readings} />
      <ChangeMetrics rows={maturing().basal} title={controlIq} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.ui-metrics__arrow').length).toBe(11);
    await expectMetricsAligned(canvasElement);
  },
});
export const Aligned = stack(390);
export const Aligned360 = stack(360);
export const Aligned320 = stack(320);
