import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { isfState } from '../../overview-model';
import { IsfCard } from './IsfCard';

// §4.2 IsfCard, one story per state, each the served ISF the generator picked
// by rule (gen_ui_fixtures.isf_states): the engine supports a change (the
// manufactured fasting nights' store); it holds; it flags the estimate wide
// (Uncertain); and the window with the most nights far beyond its marks, on
// both sides, for the edge counts. The Overview's own stories show its
// loading and no-data cards. The frame is the phone's, so the chart is 326 px
// wide, as on the Overview; Narrow is a 320 px phone. Every story asserts that
// no two axis labels touch.
const meta = {
  title: 'IsfCard',
  component: IsfCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof IsfCard>;
export default meta;

type Story = StoryObj<typeof meta>;

const overlaps = (a: DOMRect, b: DOMRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** The least rendered space between two axis labels, so two never read as one. */
const LABEL_SPACE = 12;

/** Every two neighbouring axis labels stand at least LABEL_SPACE apart;
 *  returns how many labels and tick marks there are. */
async function ticksClear(canvasElement: HTMLElement) {
  const labels = [...canvasElement.querySelectorAll<SVGTextElement>('.ui-evidence__tick')]
    .map((label) => label.getBoundingClientRect());
  for (let i = 1; i < labels.length; i += 1) {
    await expect(labels[i].left - labels[i - 1].right).toBeGreaterThanOrEqual(LABEL_SPACE);
  }
  return { labels: labels.length, marks: canvasElement.querySelectorAll('[data-axis] g').length };
}

/** A supported change shows current → recommended; any other shows no figure. */
const figure = (shown: boolean): Story['play'] => async ({ canvasElement }) => {
  const recommended = canvasElement.querySelector('[data-source$=".isf.0.recommended"]');
  await expect(recommended !== null).toBe(shown);
  await ticksClear(canvasElement);
};

export const Supported: Story = { args: { data: isfState('supported') }, play: figure(true) };
export const Held: Story = { args: { data: isfState('held') }, play: figure(false) };
export const Uncertain: Story = {
  args: { data: isfState('uncertain') },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-state="uncertain"]')).not.toBeNull();
    await ticksClear(canvasElement);
  },
};

/** A 320 px phone: the axis is too short for every tick's label, so one is left
 *  out (its mark stays) rather than running into the unit-bearing last label. */
export const Narrow: Story = {
  args: { data: isfState('supported') },
  parameters: { frame: { width: 320 } },
  play: async ({ canvasElement }) => {
    const { labels, marks } = await ticksClear(canvasElement);
    await expect(labels).toBeLessThan(marks);
    await expect(canvasElement.querySelector('.ui-evidence__unit')).not.toBeNull();
  },
};

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
    await ticksClear(canvasElement);
  },
};

/** In the Queue (§2.5, 2026-10-14): the same card titled "ISF" alone, with
 *  Snooze at its foot. */
export const Queue: Story = {
  args: { data: isfState('supported'), queue: true, onSnooze: () => {} },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('h2')!.textContent).toBe('ISF');
    await expect(canvasElement.querySelector('.ui-card-snooze button')!.textContent).toBe('Snooze');
    await expect(canvasElement.querySelector('[data-source$=".isf.0.recommended"]')).not.toBeNull();
    await ticksClear(canvasElement);
  },
};

export const Desktop: Story = {
  args: { data: isfState('supported') },
  parameters: { frame: { width: 1100 } },
};
