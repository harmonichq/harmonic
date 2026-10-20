import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { change, type TrialData } from '../../changes-model';
import { ChangeTrace } from './ChangeTrace';

// §4.2 ChangeTrace, one story per state, each a simulated wearer's active
// Trial as the engine binned it: a basal Trial by clock time across its
// 02:00–05:00 block, both arms banded; a carb ratio Trial a few days in,
// aligned at each in-block meal bolus, its after arm too few meals for a band
// and drawn meal by meal, and one lunch before it left off, its legend "Before
// n of N" (#575); and a whole-profile switch across the whole day.
const meta = {
  title: 'ChangeTrace',
  component: ChangeTrace,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof ChangeTrace>;
export default meta;

type Story = StoryObj<typeof meta>;

const trial = (store: Parameters<typeof change>[0]) => {
  const data = change(store) as TrialData;
  return { data: data.trace!, block: data.block };
};

export const Basal: Story = {
  args: trial('wearer'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Glucose 02:00–05:00' })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('.ui-trace__band').length).toBeGreaterThanOrEqual(2);
    await expect(canvasElement.querySelector('.ui-trace__episode')).toBeNull();
    // A night is never left off: each arm prints its episodes alone.
    await expect(canvasElement.querySelector('.ui-trace__of')).toBeNull();
  },
};
export const CarbRatioFewMeals: Story = {
  args: trial('wearer-ic-maturing'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Meal' })).toBeInTheDocument();
    await expect(canvas.getByText('Minutes')).toBeInTheDocument();
    // Before is a band; after, under three meals, each meal on its own.
    await expect(canvasElement.querySelector('.ui-trace__arm--before .ui-trace__band')).not.toBeNull();
    await expect(canvasElement.querySelector('.ui-trace__arm--after .ui-trace__band')).toBeNull();
    await expect(canvasElement.querySelector('.ui-trace__arm--after .ui-trace__episode')).not.toBeNull();
    // One lunch before the change had no reading before its bolus (#575): the
    // before arm prints what it drew of its meals; the after arm drew every one.
    await expect(canvasElement.querySelector('.ui-trace__key--before .ui-trace__of [data-source$=".denominators.before.contributing_meals"]'))
      .not.toBeNull();
    await expect(canvasElement.querySelector('.ui-trace__key--after .ui-trace__of')).toBeNull();
  },
};
export const WholeDay: Story = { args: trial('wearer-profile') };
