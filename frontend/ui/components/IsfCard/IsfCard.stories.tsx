import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { isfState } from '../../overview-model';
import { IsfCard } from './IsfCard';

// §4.2 IsfCard, one story per state, each the served ISF the generator picked
// by rule (gen_ui_fixtures.isf_states): the engine supports a change (the
// manufactured fasting nights' store); it holds; it flags the estimate wide
// (Uncertain); and the window with the most nights far beyond its marks, on
// both sides, for the edge counts. The Overview's own stories show its
// loading and no-data cards.
const meta = {
  title: 'IsfCard',
  component: IsfCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof IsfCard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A supported change shows current → recommended; any other shows no figure. */
const figure = (shown: boolean): Story['play'] => async ({ canvasElement }) => {
  const recommended = canvasElement.querySelector('[data-source$=".isf.0.recommended"]');
  await expect(recommended !== null).toBe(shown);
};

export const Supported: Story = { args: { data: isfState('supported') }, play: figure(true) };
export const Held: Story = { args: { data: isfState('held') }, play: figure(false) };
export const Uncertain: Story = {
  args: { data: isfState('uncertain') },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-state="uncertain"]')).not.toBeNull();
  },
};

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Both ends carry a count, and neither touches a dot, the band or a line. */
export const EdgeCounts: Story = {
  args: { data: isfState('edges') },
  play: async ({ canvasElement }) => {
    const edges = [...canvasElement.querySelectorAll<SVGTextElement>('[data-edge]')];
    await expect(edges.map((edge) => edge.dataset.edge).sort()).toEqual(['above', 'below']);
    const marks = [...canvasElement.querySelectorAll<SVGGraphicsElement>(
      '.ui-evidence__night, .ui-evidence__band, .ui-evidence__current, .ui-evidence__estimate')];
    for (const edge of edges) {
      const box = edge.getBoundingClientRect();
      await expect(marks.filter((mark) => overlaps(box, mark.getBoundingClientRect())).length).toBe(0);
    }
  },
};

export const Desktop: Story = {
  args: { data: isfState('supported') },
  parameters: { frame: { width: 1100 } },
};
