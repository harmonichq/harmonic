import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { focusable, pattern, patternState, patternStore } from '../../queue-model';
import { QUEUE_TRACES_EMPTY } from '../../served-variants';
import { PatternCard } from './PatternCard';

// One story per state (§4.2 PatternCard), each the simulated wearer's own
// served answer, picked by the fixture generator:
// - Episodes: the Pattern's episodes each drawn (eight or fewer, ADR 523),
//   whose readings also break across a gap.
// - Band: more than eight, drawn as the Pattern's median and band.
// - Focus: a Pattern of one cause in a store whose served admission lets a
//   Focus start: Focus is the card's one primary (ADR 594).
// - Pinned: the pattern a Focus was pinned on through the engine; it serves
//   several causes, so "Focus" sits over the watched cause's title.
// - Multi-cause: no Focus; the chart is a drill-down row marked "›", named by
//   the card's title, which opens the drill-down; and pinned on its Late bolus
//   cause.
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

/** The served admission decides whether Focus is drawn: never a story's flag. */
const served = (state: 'focusable' | 'pinned' | 'drill_down' | 'drill_down_pinned') => ({
  data: patternState(state), focusable: focusable(patternStore(state).store),
});
export const Focus: Story = {
  args: { ...served('focusable'), onPin: fn(), onSnooze: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Focus' }));
    await expect((args as unknown as { onPin: ReturnType<typeof fn> }).onPin).toHaveBeenCalledOnce();
  },
};

/** Pinned on a multi-cause Pattern: "Focus" over its watched cause's served
 *  title in the button's place (§2.2 Caption + value pair), and no Focus. */
const pair = (cause: string): Story['play'] => async ({ canvasElement }) => {
  const focus = canvasElement.querySelector('.ui-pcard__action .ui-pcard__focus') as HTMLElement;
  await expect([focus.querySelector('dt')!.textContent, focus.querySelector('dd')!.textContent]).toEqual(['Focus', cause]);
  await expect(within(canvasElement).queryByRole('button', { name: 'Focus' })).toBeNull();
};
export const Pinned: Story = {
  args: served('pinned'), play: pair(patternState('pinned').focusedCause!),
};

/** Multi-cause: no Focus, though one could start; the chart opens the drill-down. */
export const MultiCause: Story = {
  args: { ...served('drill_down'), onOpen: fn(), onSnooze: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(focusable(patternStore('drill_down').store)).toBe(true);
    await expect(canvas.queryByRole('button', { name: 'Focus' })).toBeNull();
    const chart = canvas.getByRole('button', { name: patternState('drill_down').title });
    await expect(chart.textContent!.endsWith('›')).toBe(true);
    await userEvent.click(chart);
    await expect((args as unknown as { onOpen: ReturnType<typeof fn> }).onOpen).toHaveBeenCalledOnce();
  },
};
export const MultiCauseDesktop: Story = {
  args: { ...served('drill_down'), onOpen: fn(), onSnooze: fn(), collapsible: false }, parameters: DESKTOP,
};
export const MultiCausePinned: Story = {
  args: { ...served('drill_down_pinned'), onSnooze: fn() }, play: pair('Late bolus'),
};
export const Empty: Story = {
  args: { data: pattern(QUEUE_TRACES_EMPTY, fixtures.states.traces_episodes.pattern) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.ui-chart__none')!.textContent).toBe('No data');
    await expect(canvasElement.querySelector('svg.ui-chart__svg')).toBeNull();
  },
};
export const Loading: Story = { args: { loading: true } };
