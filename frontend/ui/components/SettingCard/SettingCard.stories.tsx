import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { basalSetting, maturedTrial, ranking, settingState, type QueueStore } from '../../queue-model';
import { SettingCard } from './SettingCard';

/** The basal block a store's Queue opens its basal card on. */
const blockStart = (store: QueueStore) => {
  const item = ranking(store).find((i) => i.subject === 'setting:basal_rate');
  if (item?.kind !== 'setting') throw new Error(`${store} queues no basal card`);
  return item.data.start.value;
};

// One story per state (§4.2 SettingCard) the simulated wearer serves: an
// admitted Basal block, and the block whose earlier change matured into a
// Trial. A collapsed range (lo = hi) does not arise in the wearer's nights,
// so that state has no story; the card still prints such a range once.
const meta = {
  title: 'SettingCard',
  component: SettingCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SettingCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { data: settingState('setting') } };

/** Done (#518), the card's primary, and Snooze the text action beneath it. */
export const WithDone: Story = {
  args: { data: settingState('setting'), onDone: fn(), onSnooze: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Done' }));
    await expect(args.onDone).toHaveBeenCalledOnce();
  },
};

/** The basal card back after a sync found it unchanged on the pump (#518). */
export const NotOnPump: Story = {
  args: { data: basalSetting('wearer-not-on-pump', blockStart('wearer-not-on-pump')), onDone: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 2 })).toHaveTextContent(/Not on pump$/);
  },
};

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
