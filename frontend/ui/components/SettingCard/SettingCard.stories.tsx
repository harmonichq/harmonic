import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { carbRatioSetting, maturedTrial, settingState } from '../../queue-model';
import { SettingCard } from './SettingCard';

// One story per state (§4.2 SettingCard) the engine serves: an admitted Basal
// block, and the block whose earlier change matured into a Trial, from the
// simulated wearer; and a queued I:C block, its dots the meal runs its
// estimate counts, from the QA case whose meals support lowering the carb
// ratio, where the engine serves its range as one value (lo = hi), printed
// once. Every card ends in the one stat row: Estimate, Range, then its count
// (ADR 523). Phone at 390, desktop at the detail pane's 720.
const meta = {
  title: 'SettingCard',
  component: SettingCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SettingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The stat row, in its one order: Estimate, Range, then the count. */
const statRow = (count: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const captions = [...canvasElement.querySelectorAll('.ui-scard__facts dt')].map((dt) => dt.textContent);
  await expect(captions).toEqual(['Estimate', 'Range', count]);
};

export const Default: Story = { args: { data: settingState('setting') }, play: statRow('Nights') };
export const Desktop: Story = { args: { data: settingState('setting') }, parameters: { frame: { width: 720 } } };

const carbRatio = carbRatioSetting('carb-ratio-supported')!;
export const CarbRatio: Story = {
  args: { data: carbRatio },
  play: async ({ canvasElement }) => {
    await statRow('Meal runs')({ canvasElement });
    // One dot per counted meal run, on the axis or counted at its edge, and the
    // count is that one list's length.
    const edges = [...canvasElement.querySelectorAll('[data-edge] tspan')]
      .reduce((sum, edge) => sum + Number(edge.textContent), 0);
    await expect(canvasElement.querySelectorAll('.ui-evidence__dot').length + edges).toBe(carbRatio.count.value.value);
  },
};
export const CarbRatioDesktop: Story = { args: { data: carbRatio }, parameters: { frame: { width: 720 } } };

/** The served block and the matured Trial whose block it lies in (#506): the
 *  block starts after the Trial's own start, so a start-for-start match would
 *  miss it. */
export const MaturedTrial: Story = {
  args: { data: settingState('setting_trial') },
  play: async ({ canvasElement }) => {
    const { store, start_min: start } = fixtures.states.setting_trial;
    const served = fixtures.queue[store as keyof typeof fixtures.queue];
    const span = served.findings.rows.find((r) => r.kind === 'setting' && r.span?.start_min === start)!.span!;
    const trial = served.trials.trials.find((t) => t.parameter === 'basal_rate' && t.state === 'complete'
      && maturedTrial(span, t))!;
    const trialStart = trial.block![0];
    await expect(span.start_min).toBeGreaterThan(trialStart);
    await expect(maturedTrial(span, { slot: trial.slot, block: null })).toBe(false);
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Trial')).toBeInTheDocument();
    await expect(canvas.getByRole('button', { name: 'Changes' })).toBeInTheDocument();
  },
};
