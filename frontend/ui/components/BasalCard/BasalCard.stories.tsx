import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { basalEstimate } from '../../overview-model';
import { BasalCard } from './BasalCard';

// §4.2 BasalCard (ADR 523), the simulated wearer's served basal slots:
// - Moves: the 90-day window, where the engine stages moves, each slot marked
//   ▲ or ▼ by its served direction.
// - Holds: the 14-day window, where it stages none.
// - No data, and not yet read (the skeleton).
// Phone at 390; desktop at the half pane it shares with the ISF card.
const meta = {
  title: 'BasalCard',
  component: BasalCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof BasalCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 560 } };

const moves = basalEstimate('wearer', '90');
const holds = basalEstimate('wearer', '14');

/** One mark per slot the engine stages a move for, in its direction, and a bar
 *  per slot it serves an estimate for. */
const marked: Story['play'] = async ({ canvasElement }) => {
  if (!moves || moves === 'none') throw new Error('the wearer serves no 90-day basal');
  const served = moves.slots.filter((slot) => slot.move);
  const shown = [...canvasElement.querySelectorAll<SVGTextElement>('[data-move]')];
  await expect(shown.map((mark) => mark.dataset.move)).toEqual(served.map((slot) => slot.move));
  await expect(shown.length).toBeGreaterThan(0);
  await expect(canvasElement.querySelectorAll('.ui-chart__band').length)
    // and the legend's Estimate and Range swatches
    .toBe(moves.slots.filter((slot) => slot.estimate).length + 2);
};

export const Moves: Story = { args: { data: moves }, play: marked };
export const MovesDesktop: Story = { args: { data: moves }, parameters: DESKTOP };
export const Holds: Story = {
  args: { data: holds },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-move]').length).toBe(0);
  },
};
export const NoData: Story = { args: { data: 'none' } };
export const Loading: Story = { args: { data: null } };
