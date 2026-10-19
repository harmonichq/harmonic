import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { formatValue } from '../../provenance.js';
import {
  habitState, pattern, patternState, settingState, snoozed, type PatternData, type QueueStore,
} from '../../queue-model';
import { QueueRow, type QueueRowProps } from './QueueRow';

// One story per state (§4.2 QueueRow), each the simulated wearer's own
// served answer: a pattern by default (no row names a cause) and selected on
// desktop, another mid-swipe, and the admitted Basal block; and a snoozed row,
// with its Until and Restore. (The no-cause state is retired, ADR 499.)
// The trailing impact (§2.5, 2026-10-14): a high row with its Peak delta, a
// low row with its Nadir delta, and a row whose Pattern serves too few episodes for a median, with
// no trailing value. A standalone habit's row (ADR 528): the Pattern row with
// the Habit glyph, its count the habit's case file's, and no trailing value.
const meta = {
  title: 'QueueRow',
  component: QueueRow,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof QueueRow>;
export default meta;

type Story = StoryObj<typeof meta>;

type PatternRow = Extract<QueueRowProps, { kind: 'pattern' | 'habit' }>;

const rowOf = (data: PatternData): PatternRow =>
  ({ kind: data.kind, title: data.title, magnitude: data.magnitude!, impact: data.impact });

function patternRow(name: 'traces_band' | 'traces_episodes'): PatternRow {
  return rowOf(patternState(name));
}

const served = (store: QueueStore, key: string) => rowOf(pattern(store, key));

/** The delta reads the Pattern's own value minus Typical, each as the open
 *  card prints it: ▲ or ▼ and the difference, in mg/dL, in neutral ink. */
async function expectDelta(canvasElement: HTMLElement, args: PatternRow, caption: 'Peak' | 'Nadir') {
  const { own, typical } = args.impact!;
  const difference = Number(formatValue(own.value, own.format)) - Number(formatValue(typical.value, typical.format));
  const canvas = within(canvasElement);
  await expect(canvas.getByText(caption)).toBeInTheDocument();
  const delta = canvasElement.querySelector('.ui-delta') as HTMLElement;
  await expect(delta.textContent).toBe(`${difference >= 0 ? '▲' : '▼'} ${Math.abs(difference)} mg/dL`);
  await expect(delta.className).toBe('ui-delta');
}

export const Default: Story = {
  args: patternRow('traces_band'),
  play: async ({ canvasElement }) => {
    // The row names no cause: the second line is the magnitude.
    await expect(canvasElement.textContent).not.toContain('·');
  },
};
export const SelectedDesktop: Story = {
  args: { ...patternRow('traces_band'), layout: 'desktop', selected: true },
  parameters: { frame: { width: 400, padding: 24 } },
};
export const MidSwipe: Story = { args: { ...patternRow('traces_episodes'), swiping: true } };
export const HighWithDelta: Story = {
  args: served('wearer', 'highs_after_meals'),
  play: async ({ args, canvasElement }) => {
    await expectDelta(canvasElement, args as PatternRow, 'Peak');
    await expect(canvasElement.textContent).not.toContain('·');
  },
};
export const LowWithDelta: Story = {
  args: served('wearer', 'lows_after_meals'),
  play: async ({ args, canvasElement }) => expectDelta(canvasElement, args as PatternRow, 'Nadir'),
};
export const NoImpact: Story = {
  args: served('wearer', 'lows_after_correcting_highs'),
  play: async ({ args, canvasElement }) => {
    await expect((args as PatternRow).impact).toBeNull();
    await expect(canvasElement.querySelector('.ui-qrow__impact, .ui-qrow__caption')).toBeNull();
  },
};
export const Setting: Story = {
  args: (() => {
    const setting = settingState('setting');
    return { kind: 'setting', title: setting.title, setting } satisfies QueueRowProps;
  })(),
};
export const Snoozed: Story = {
  args: (() => {
    const s = snoozed('wearer-pinned-snoozed')[0];
    if (s.kind !== 'pattern') throw new Error('the snoozed fixture serves a pattern first');
    return { ...rowOf(s.data), snoozed: { until: s.until } } satisfies QueueRowProps;
  })(),
};
export const SnoozedDesktop: Story = {
  args: { ...Snoozed.args, layout: 'desktop' } as QueueRowProps,
  parameters: { frame: { width: 400, padding: 24 } },
};
/** A habit's row names its glyph Habit, prints the count its case file serves
 *  ("2 of 6 highs"), and ends in no trailing value. */
const habitRow: Story['play'] = async ({ args, canvasElement }) => {
  const row = args as PatternRow;
  await expect(within(canvasElement).getByRole('img', { name: 'Habit' })).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-qrow__magnitude')!.textContent)
    .toBe(`${row.magnitude.count.value} of ${row.magnitude.denominator.value} ${row.magnitude.noun}`);
  await expect(canvasElement.querySelector('.ui-qrow__impact, .ui-qrow__caption')).toBeNull();
};
export const Habit: Story = { args: rowOf(habitState('habit_episodes').data), play: habitRow };
export const HabitSelectedDesktop: Story = {
  args: { ...rowOf(habitState('habit_band').data), layout: 'desktop', selected: true },
  parameters: { frame: { width: 400, padding: 24 } },
  play: habitRow,
};
export const Loading: Story = { args: { loading: true } };
