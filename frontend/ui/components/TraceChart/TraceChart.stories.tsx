import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { pattern, patternState } from '../../queue-model';
import { QUEUE_TRACES_EMPTY } from '../../served-variants';
import { TraceChart } from './TraceChart';

// §4.2 TraceChart (ADR 523), each the trace chart the engine served for the
// simulated wearer, picked by the fixture generator:
// - Episodes: eight or fewer episodes, each its own trace, against Typical.
// - Gaps: an episode whose readings stop and resume is drawn in pieces, never
//   bridged across the gap.
// - Band: more than eight, drawn as the Pattern's median over its band; a meal
//   Pattern's window opens before its bolus, so minute 0 has its hairline.
// - Empty: nothing to draw, "No data" (a served-shape variant).
// Phone at 390 (the card's 358 px column), desktop at 720.
const meta = {
  title: 'TraceChart',
  component: TraceChart,
  parameters: { frame: { width: 390 } },
  decorators: [(Story) => <div style={{ background: 'var(--wk-surface)', padding: 16, borderRadius: 4 }}><Story /></div>],
} satisfies Meta<typeof TraceChart>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 720 } };

const episodes = patternState('traces_episodes').traces!;
const band = patternState('traces_band').traces!;
const gaps = patternState('traces_gap').traces!;

/** Every label on each axis stands clear of the next. */
const axesClear: Story['play'] = async ({ canvasElement }) => {
  const ticks = [...canvasElement.querySelectorAll<SVGTextElement>('[data-axis] .ui-chart__tick')]
    .map((tick) => tick.getBoundingClientRect());
  for (let i = 0; i < ticks.length; i += 1) {
    for (let j = i + 1; j < ticks.length; j += 1) {
      const [a, b] = [ticks[i], ticks[j]];
      await expect(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).toBe(false);
    }
  }
};

export const Episodes: Story = {
  args: { data: episodes },
  play: async (context) => {
    const traces = context.canvasElement.querySelectorAll('.ui-chart__series-trace');
    await expect(traces.length).toBeGreaterThanOrEqual(episodes.episodes!.length);
    await axesClear(context);
  },
};
export const EpisodesDesktop: Story = { args: { data: episodes }, parameters: DESKTOP };

/** More pieces than episodes: at least one episode breaks at a gap. */
export const Gaps: Story = {
  args: { data: gaps },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.ui-chart__series-trace').length).toBeGreaterThan(gaps.episodes!.length);
  },
};
export const Band: Story = {
  args: { data: band },
  play: async (context) => {
    await expect(context.canvasElement.querySelector('.ui-chart__zero')).not.toBeNull();
    await expect(context.canvasElement.querySelectorAll('.ui-chart__series-trace').length).toBe(0);
    await axesClear(context);
  },
};
export const BandDesktop: Story = { args: { data: band }, parameters: DESKTOP };
export const Empty: Story = {
  args: { data: pattern(QUEUE_TRACES_EMPTY, fixtures.states.traces_episodes.pattern).traces! },
};
