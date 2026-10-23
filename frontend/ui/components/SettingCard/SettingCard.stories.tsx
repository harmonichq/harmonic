import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { basalSetting, carbRatioSetting, maturedTrial, ranking, settingState, type QueueStore } from '../../queue-model';
import { SettingCard } from './SettingCard';

/** The basal block a store's Queue opens its basal card on. */
const blockStart = (store: QueueStore) => {
  const item = ranking(store).find((i) => i.subject === 'setting:basal_rate');
  if (item?.kind !== 'setting') throw new Error(`${store} queues no basal card`);
  return item.data.start.value;
};

// One story per state (§4.2 SettingCard) the engine serves: an admitted Basal
// block, and the block whose earlier change matured into a Trial, from the
// simulated wearer; and a queued I:C block, its dots the meal runs its
// estimate counts, from the QA case whose meals support lowering the carb
// ratio, where the engine serves its range as one value (lo = hi), printed
// once. Every card ends in the one stat row: Estimate, Range, then its count
// (ADR 523). Done (#518) and Not on pump are their own stories. Phone at 390,
// desktop at the detail pane's 720. The Queue decides which Snooze a layout gets
// (ADR 614): a phone story passes no Snooze (the screen swipes the card) and
// presses the chevron at the end of the title line, which closes the card to its
// row; a desktop story passes Snooze and draws no chevron.
const meta = {
  title: 'SettingCard',
  component: SettingCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof SettingCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const DESKTOP = { frame: { width: 720 } };

/** Phone: no Snooze text action, and the chevron, an icon button named by the
 *  card's title and expanded, closes the card (`then` runs first). */
const phone = (then?: Story['play']): Story['play'] => async (context) => {
  await then?.(context);
  const { args, canvasElement } = context;
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole('button', { name: 'Snooze' })).toBeNull();
  const chevron = canvas.getByRole('button', { expanded: true });
  await expect(chevron.dataset.role).toBe('icon');
  const title = canvas.getByRole('heading', { level: 2 });
  await expect(chevron.getAttribute('aria-labelledby')).toBe(title.id);
  // At the end of the title line, which keeps its one line's height.
  const [line, box] = [title.getBoundingClientRect(), chevron.getBoundingClientRect()];
  await expect(Math.abs((box.top + box.bottom) / 2 - (line.top + line.bottom) / 2)).toBeLessThanOrEqual(1);
  await expect(box.left).toBeGreaterThanOrEqual(line.right);
  await userEvent.click(chevron);
  await expect(args.onCollapse).toHaveBeenCalledOnce();
};
/** Desktop: the Snooze text action, and no chevron. */
const desktop = (then?: Story['play']): Story['play'] => async (context) => {
  await then?.(context);
  const canvas = within(context.canvasElement);
  await expect(canvas.getByRole('button', { name: 'Snooze' })).toBeInTheDocument();
  await expect(canvas.queryByRole('button', { expanded: true })).toBeNull();
};

/** The stat row, in its one order: Estimate, Range, then the count. */
const statRow = (count: string) => async ({ canvasElement }: { canvasElement: HTMLElement }) => {
  const captions = [...canvasElement.querySelectorAll('.ui-scard__facts dt')].map((dt) => dt.textContent);
  await expect(captions).toEqual(['Estimate', 'Range', count]);
};

export const Default: Story = { args: { data: settingState('setting'), onCollapse: fn() }, play: phone(statRow('Nights')) };
export const Desktop: Story = {
  args: { data: settingState('setting'), onSnooze: fn() }, parameters: DESKTOP, play: desktop(statRow('Nights')),
};

const carbRatio = carbRatioSetting('carb-ratio-supported')!;
export const CarbRatio: Story = {
  args: { data: carbRatio, onCollapse: fn() },
  play: phone(async ({ canvasElement }) => {
    await statRow('Meal runs')({ canvasElement });
    // One dot per counted meal run, on the axis or counted at its edge, and the
    // count is that one list's length.
    const edges = [...canvasElement.querySelectorAll('[data-edge] tspan')]
      .reduce((sum, edge) => sum + Number(edge.textContent), 0);
    await expect(canvasElement.querySelectorAll('.ui-chart__dot').length + edges).toBe(carbRatio.count.value.value);
  }),
};
export const CarbRatioDesktop: Story = { args: { data: carbRatio, onSnooze: fn() }, parameters: DESKTOP, play: desktop() };

/** Done (#518), the card's primary; on desktop Snooze is the text action beneath it. */
const presses: Story['play'] = async ({ args, canvasElement }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Done' }));
  await expect(args.onDone).toHaveBeenCalledOnce();
};
export const WithDone: Story = {
  args: { data: settingState('setting'), onDone: fn(), onCollapse: fn() }, play: phone(presses),
};
export const WithDoneDesktop: Story = {
  args: { data: settingState('setting'), onDone: fn(), onSnooze: fn() }, parameters: DESKTOP,
  play: desktop(async (context) => {
    await presses!(context);
    const canvas = within(context.canvasElement);
    await expect(canvas.getByRole('button', { name: 'Done' }).getBoundingClientRect().bottom)
      .toBeLessThan(canvas.getByRole('button', { name: 'Snooze' }).getBoundingClientRect().top);
  }),
};

/** The basal card back after a sync found it unchanged on the pump (#518). */
export const NotOnPump: Story = {
  args: { data: basalSetting('wearer-not-on-pump', blockStart('wearer-not-on-pump')), onDone: fn(), onCollapse: fn() },
  play: phone(async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 2 })).toHaveTextContent(/Not on pump$/);
  }),
};

/** The served block and the matured Trial whose block it lies in (#506): the
 *  block starts after the Trial's own start, so a start-for-start match would
 *  miss it. */
export const MaturedTrial: Story = {
  args: { data: settingState('setting_trial'), onCollapse: fn() },
  play: phone(async ({ canvasElement }) => {
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
  }),
};
