import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { change, type TrialData } from './changes-model';
import { Delta } from './Delta';
import { delta } from './direction';

// §4.2 Delta, one story per way a change can read (§2.5, 2026-10-19), at
// phone (390) and desktop (1440), each a row of the simulated wearer's matured
// basal Trial: In range up, the good way (green ▲); Mean up, the bad way (red
// ▲); Control-IQ's delivered rate down, where neither way is better (neutral
// ▼); and unchanged, which no served pair prints, so In range's before against
// itself: 0, no arrow, neutral.
const meta = {
  title: 'Delta',
  component: Delta,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof Delta>;
export default meta;

type Story = StoryObj<typeof meta>;

const DESKTOP = { frame: { width: 1440 } };
const basal = () => change('wearer') as TrialData;
const row = (rows: TrialData['ranges'], key: string) => rows.find((r) => r.key === key)!;

// The arrow it leads with (none when unchanged) and its colour; the amount is
// the prechecks' to trace.
const reads = (arrow: '▲' | '▼' | null, className: string): Story['play'] => async ({ canvasElement }) => {
  const shown = canvasElement.querySelector('.ui-delta')!;
  await expect(shown.textContent!.match(/^[▲▼]/)?.[0] ?? null).toBe(arrow);
  await expect(shown.className).toBe(className);
};

const tir = row(basal().ranges, 'tir');
const mean = row(basal().glucose, 'mean');
const delivered = row(basal().basal, 'delivered');

const GOOD = { args: { change: tir.delta!, unit: '%' }, play: reads('▲', 'ui-delta ui-delta--favorable') };
const BAD = { args: { change: mean.delta!, unit: 'mg/dL' }, play: reads('▲', 'ui-delta ui-delta--adverse') };
const NO_DIRECTION = { args: { change: delivered.delta!, unit: 'U/h' }, play: reads('▼', 'ui-delta') };
const FLAT = { args: { change: delta(tir.before, tir.before, 'tir'), unit: '%' }, play: reads(null, 'ui-delta') };

export const Good: Story = GOOD;
export const GoodDesktop: Story = { ...GOOD, parameters: DESKTOP };
export const Bad: Story = BAD;
export const BadDesktop: Story = { ...BAD, parameters: DESKTOP };
export const NoDirection: Story = NO_DIRECTION;
export const NoDirectionDesktop: Story = { ...NO_DIRECTION, parameters: DESKTOP };
export const Unchanged: Story = FLAT;
export const UnchangedDesktop: Story = { ...FLAT, parameters: DESKTOP };
