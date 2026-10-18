import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { pattern, patternState } from '../../queue-model';
import { QUEUE_TRACES_EMPTY } from '../../served-variants';
import { PatternCard } from './PatternCard';

// One story per state (§4.2 PatternCard), each the simulated wearer's own
// served answer, picked by the fixture generator:
// - Episodes: the Pattern's episodes each drawn (eight or fewer, ADR 523),
//   whose readings also break across a gap.
// - Band: more than eight, drawn as the Pattern's median and band.
// - Pinned: the pattern a Focus was pinned on through the engine.
// - Uncertain: the pattern the engine serves `wide` (ADR 485), its tag at the
//   end of the magnitude line.
// - Empty: a trace chart with nothing to draw says "No data" (a served-shape
//   variant: the history the generator builds always has readings).
// Phone at 390, desktop at the detail pane's 720 reading width.
const meta = {
  title: 'PatternCard',
  component: PatternCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PatternCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 720 } };

/** The chart draws what the engine served: one trace per episode, or one band. */
const drawn = (traces: number, bands: number): Story['play'] => async ({ canvasElement }) => {
  await expect(canvasElement.querySelectorAll('.ui-chart__high .ui-chart__series-trace, .ui-chart__low .ui-chart__series-trace').length)
    .toBeGreaterThanOrEqual(traces);
  await expect(canvasElement.querySelectorAll('.ui-chart__high .ui-chart__series-band, .ui-chart__low .ui-chart__series-band').length > 0)
    .toBe(bands > 0);
  await expect(canvasElement.querySelector('.ui-chart__typical .ui-chart__series-median')).not.toBeNull();
};

const episodes = patternState('traces_episodes');
const band = patternState('traces_band');

export const Episodes: Story = {
  args: { data: episodes },
  play: drawn(episodes.traces!.episodes!.length, 0),
};
export const EpisodesDesktop: Story = { args: { data: episodes, collapsible: false }, parameters: DESKTOP };
export const Band: Story = { args: { data: band }, play: drawn(0, 1) };
export const BandDesktop: Story = { args: { data: band, collapsible: false }, parameters: DESKTOP };
export const Uncertain: Story = { args: { data: patternState('uncertain') } };
export const Pinned: Story = { args: { data: patternState('pinned') } };
export const Empty: Story = {
  args: { data: pattern(QUEUE_TRACES_EMPTY, fixtures.states.traces_episodes.pattern) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-chart__none')!.textContent).toBe('No data');
    await expect(canvasElement.querySelector('svg.ui-chart__svg')).toBeNull();
  },
};
export const Loading: Story = { args: { loading: true } };
