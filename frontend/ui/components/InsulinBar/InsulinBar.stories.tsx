import { useEffect, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { insulinBar } from '../../day-model';
import { DAY_NO_CONTROL_IQ } from '../../served-variants';
import { InsulinBar } from './InsulinBar';

// One story per state (§4.2 InsulinBar), from the simulated wearer's served
// timeline: the latest day with readings; the same across a desktop pane; the
// first day after the history ends, which serves no insulin and shows no bar;
// and loading. One flow runs as a play function: the app's own order, loading
// first and the day's totals landing after, on a day with no Control-IQ
// boluses — the bar still draws to its box, its zero part drawing nothing, and
// across a desktop pane the parts sit in one row, each its own width.
const meta = {
  title: 'InsulinBar',
  component: InsulinBar,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof InsulinBar>;
export default meta;

type Story = StoryObj<typeof meta>;

const { latest, no_data: noData } = fixtures.day.states;

export const Default: Story = { args: { data: insulinBar(latest) } };
export const Desktop: Story = { args: { data: insulinBar(latest) }, parameters: { frame: { width: 1440 } } };
export const NoData: Story = { args: { data: insulinBar(noData) } };
export const Loading: Story = { args: { data: null, loading: true } };

/** The bar as the live Day draws it: loading until the day's totals land. */
function Late() {
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLanded(true), 50);
    return () => clearTimeout(timer);
  }, []);
  return <InsulinBar data={landed ? insulinBar(DAY_NO_CONTROL_IQ) : null} loading={!landed} />;
}

export const LateTotals: Story = {
  args: { data: null },
  parameters: { frame: { width: 1440 } },
  render: () => <Late />,
  play: async ({ canvasElement }) => {
    const bar = await waitFor(() => {
      const svg = canvasElement.querySelector<SVGSVGElement>('svg.ui-insulin__bar');
      if (!svg) throw new Error('no bar drawn');
      return svg;
    });
    const box = bar.parentElement!.getBoundingClientRect().width;
    await expect(Number(bar.getAttribute('width'))).toBe(Math.floor(box));
    // Basal, Meal and Correction draw; Control-IQ's zero part draws no segment.
    const parts = [...bar.querySelectorAll('rect.ui-insulin__part')].map((r) => r.getAttribute('class'));
    await expect(parts).toEqual(['basal', 'meal', 'correction'].map((k) => `ui-insulin__part ui-insulin__part--${k}`));
    const labels = [...canvasElement.querySelectorAll('.ui-insulin__part-label')].map((l) => l.getBoundingClientRect());
    await expect(labels).toHaveLength(4);
    await expect(new Set(labels.map((l) => Math.round(l.top))).size).toBe(1);
    const label = labels[0].width;
    await expect(labels.every((l) => l.width === label)).toBe(false);
  },
};
