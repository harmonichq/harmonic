import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { failsOnce } from '../../flaky';
import { CHANGES_UNNAMED } from '../../served-variants';
import { ChangesScreen, type ChangesScreenProps } from './ChangesScreen';

// The Changes screen in each state §1.3 lists (§2.5 2026-10-14, the Changes
// redesign), at phone (390) and desktop (1440), every value the simulated
// wearer's served answer:
// - Default: a Focus pinned after the person ended a basal Trial, the ended
//   Trial the one previous change.
// - The basal Trial six days in (maturing), matured Better with End offered,
//   and the second wearer's Trial matured Worse: each with its trace by clock
//   time across the 02:00–05:00 block, its ranges, Mean / GMI / CV, and
//   Control-IQ against the Pump profile.
// - A carb ratio Trial a few days in: Meals before and after, its trace at
//   each in-block meal bolus, the after arm meal by meal, and every module as
//   its data forms, each glucose module closed by its Readings, no Δ toned
//   while it matures (§2.5, 2026-10-19).
// - The same Trial in its first hours: the before arm in full, and an empty
//   after arm (no meals, no line, each after empty and without a Δ).
// - A whole-profile switch: each setting it moved, the trace across the day.
// - Focus maturing (a day after its pin) and matured (four weeks after).
// - Ended: the matured Trial once the person ends it: no active change, the
//   Trial a previous change.
// - Empty: the first days, with no change at all.
// - Waiting for pump: a Done on the basal card that no sync has resolved.
// - Previous: three changes in turn and a Focus, all ended: "Previous · 4",
//   and the list it opens, newest first, one with its result.
// - Confirm: End pressed on the matured Trial, the confirmation open.
// - Loading, and Unavailable (the unsynced store serves guidance unavailable);
//   Stale, the last answers under Unavailable, on the screen and on Previous.
// Plays: End → End ends the Trial and shows what the engine served after it;
// End → Cancel leaves the Focus as it was; Previous opens its list and ‹
// Changes comes back.
const meta: Meta<typeof ChangesScreen> = {
  title: 'Screens/Changes',
  component: ChangesScreen,
};
export default meta;

type Story = StoryObj<typeof ChangesScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

const unavailable = fixtures.overview['wearer-unsynced'].guidance.disposition === 'unavailable';

const story = (layout: 'phone' | 'desktop', args: Omit<ChangesScreenProps, 'layout'>): Story => ({
  args: { ...args, layout },
  parameters: { frame: FRAMES[layout] },
});

const DEFAULT = { store: 'wearer-ended-pinned' } as const;
const MATURING = { store: 'wearer-trial-maturing' } as const;
const MATURED = { store: 'wearer', end: { after: 'wearer-ended' } } as const;
const WORSE = { store: 'wearer-worse' } as const;
const CARB_RATIO = { store: 'wearer-ic-maturing' } as const;
const FIRST_HOURS = { store: 'wearer-ic-first-hours' } as const;
const PROFILE = { store: 'wearer-profile' } as const;
const PREVIOUS = { store: 'wearer-previous' } as const;
const FOCUS_MATURING = { store: 'wearer-focus-maturing' } as const;
const FOCUS_MATURED = { store: 'wearer-focus' } as const;
const ENDED = { store: 'wearer-ended' } as const;
const EMPTY = { store: 'wearer-first-days' } as const;
const CONFIRM = { store: 'wearer', end: { after: 'wearer-ended' }, confirming: true } as const;
const LOADING = { store: 'wearer', state: 'loading' } as const;
const UNAVAILABLE = { store: 'wearer', state: unavailable ? 'unavailable' : 'ready' } as const;

export const DefaultPhone = story('phone', DEFAULT);
export const DefaultDesktop = story('desktop', DEFAULT);
export const TrialMaturingPhone = story('phone', MATURING);
export const TrialMaturingDesktop = story('desktop', MATURING);
export const TrialMaturedPhone = story('phone', MATURED);
export const TrialMaturedDesktop = story('desktop', MATURED);
export const TrialWorsePhone = story('phone', WORSE);
export const TrialWorseDesktop = story('desktop', WORSE);
// A maturing Trial shows its data as it forms (§2.5, 2026-10-19): the meals,
// the trace and every metric module over what the after arm has read so far,
// each glucose module with its Readings; the pill stays Maturing, no Δ is
// toned and End is not offered.
const metricsOf = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll('.ui-metrics')] as HTMLElement[];
const formingPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText('Maturing')).toBeInTheDocument();
  await expect(canvas.queryByRole('button', { name: 'End' })).toBeNull();
  await expect(canvas.getByText('Meals after')).toBeInTheDocument();
  await expect(canvasElement.querySelector('[data-source$=".views.after.trace.episodes"]')).not.toBeNull();
  const modules = metricsOf(canvasElement);
  await expect(modules.length).toBe(2);
  for (const module of modules) {
    await expect(within(module).getByText('Readings')).toBeInTheDocument();
    for (const after of module.querySelectorAll('.ui-metrics__after')) await expect(after.textContent).not.toBe('');
  }
  await expect(canvasElement.querySelector('.ui-delta--favorable, .ui-delta--adverse')).toBeNull();
};
export const CarbRatioMaturingPhone: Story = { ...story('phone', CARB_RATIO), play: formingPlay };
export const CarbRatioMaturingDesktop: Story = { ...story('desktop', CARB_RATIO), play: formingPlay };

// Hours after the change, before its block has a reading: the before arm, and
// the after arm empty rather than the modules missing.
const firstHoursPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText('Maturing')).toBeInTheDocument();
  await expect(canvasElement.querySelector('[data-source$=".denominators.after.contributing_meals"]')?.textContent)
    .toBe('0');
  await expect(canvasElement.querySelector('[data-source$=".views.after.trace.episodes"]')?.textContent).toBe('0');
  const modules = metricsOf(canvasElement);
  await expect(modules.length).toBe(2);
  for (const module of modules) {
    const rows = [...module.querySelectorAll('.ui-metrics__row:not(.ui-metrics__row--count)')];
    await expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      await expect(row.querySelector('.ui-metrics__before')?.textContent).not.toBe('');
      await expect(row.querySelector('.ui-metrics__after')?.textContent).toBe('');
      await expect(row.querySelector('.ui-delta')).toBeNull();
    }
    await expect(module.querySelector('[data-source$=".denominators.after"]')?.textContent).toBe('0');
  }
};
export const CarbRatioFirstHoursPhone: Story = { ...story('phone', FIRST_HOURS), play: firstHoursPlay };
export const CarbRatioFirstHoursDesktop: Story = { ...story('desktop', FIRST_HOURS), play: firstHoursPlay };
export const ProfileTrialPhone = story('phone', PROFILE);
export const ProfileTrialDesktop = story('desktop', PROFILE);
export const PreviousRowPhone = story('phone', PREVIOUS);
export const PreviousRowDesktop = story('desktop', PREVIOUS);
export const PreviousListPhone = story('phone', { ...PREVIOUS, view: 'previous' });
export const PreviousListDesktop = story('desktop', { ...PREVIOUS, view: 'previous' });
export const FocusMaturingPhone = story('phone', FOCUS_MATURING);
export const FocusMaturingDesktop = story('desktop', FOCUS_MATURING);
export const FocusMaturedPhone = story('phone', FOCUS_MATURED);
export const FocusMaturedDesktop = story('desktop', FOCUS_MATURED);
export const EndedPhone = story('phone', ENDED);
export const EndedDesktop = story('desktop', ENDED);
export const EmptyPhone = story('phone', EMPTY);
export const EmptyDesktop = story('desktop', EMPTY);
export const ConfirmPhone = story('phone', CONFIRM);
export const ConfirmDesktop = story('desktop', CONFIRM);
export const LoadingPhone = story('phone', LOADING);
export const LoadingDesktop = story('desktop', LOADING);
export const UnavailablePhone = story('phone', UNAVAILABLE);
export const UnavailableDesktop = story('desktop', UNAVAILABLE);
// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
export const StalePhone = story('phone', { store: 'wearer', state: 'stale' });
export const StaleDesktop = story('desktop', { store: 'wearer', state: 'stale' });
export const StalePreviousPhone = story('phone', { ...PREVIOUS, view: 'previous', state: 'stale' });

const endPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole('button', { name: /Previous/ })).toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: 'End' }));
  const dialog = within(canvas.getByRole('dialog', { name: 'End' }));
  await userEvent.click(dialog.getByRole('button', { name: 'End' }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(canvas.getByText('No active change')).toBeInTheDocument();
  // The ended Trial is now a previous change.
  await expect(canvas.getByRole('button', { name: /Previous\s*1/ })).toBeInTheDocument();
};

const cancelPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'End' }));
  await userEvent.click(within(canvas.getByRole('dialog', { name: 'End' })).getByRole('button', { name: 'Cancel' }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(canvas.getByRole('button', { name: 'End' })).toBeInTheDocument();
};

export const EndTrialPhone: Story = { ...story('phone', MATURED), play: endPlay };
export const EndTrialDesktop: Story = { ...story('desktop', MATURED), play: endPlay };
export const CancelEndPhone: Story = { ...story('phone', DEFAULT), play: cancelPlay };
export const CancelEndDesktop: Story = { ...story('desktop', DEFAULT), play: cancelPlay };

// Waiting for pump (#518): the person pressed Done on the basal card and no
// sync has shown the pump since. One row under the caption, its name and block
// over current → suggested, with no active change.
const WAITING = { store: 'wearer-done' } as const;
const waitingPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const group = canvas.getByRole('heading', { level: 2, name: 'Waiting for pump' }).closest('section') as HTMLElement;
  await expect(within(group).getByText(/^Basal/)).toBeInTheDocument();
  await expect(group.querySelector('[data-source$=".acknowledgment.blocks.0.recommended"]')).not.toBeNull();
  await expect(canvas.getByText('No active change')).toBeInTheDocument();
};
export const WaitingForPumpPhone: Story = { ...story('phone', WAITING), play: waitingPlay };
export const WaitingForPumpDesktop: Story = { ...story('desktop', WAITING), play: waitingPlay };

// Previous drills down to its list (§2.2) and back, as it was.
const previousPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Previous\s*4/ }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Previous' })).toBeInTheDocument();
  await expect(canvas.getAllByText('Basal').length).toBeGreaterThan(0);
  await expect(canvas.getByText('Unclear')).toBeInTheDocument();
  // The drill-down's own "‹ Changes" (the tab bar has a Changes too).
  const header = canvas.getByRole('heading', { level: 1, name: 'Previous' }).closest('header') as HTMLElement;
  await userEvent.click(within(header).getByRole('button', { name: 'Changes' }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Changes' })).toBeInTheDocument();
  await expect(canvas.getByText('No active change')).toBeInTheDocument();
};
export const OpenPreviousPhone: Story = { ...story('phone', PREVIOUS), play: previousPlay };
export const OpenPreviousDesktop: Story = { ...story('desktop', PREVIOUS), play: previousPlay };

// Live (#495): an End the engine does not save leaves the change as it was,
// with "Not saved", and Retry ends it.
const liveEndPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'End' }));
  await userEvent.click(within(canvas.getByRole('dialog', { name: 'End' })).getByRole('button', { name: 'End' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.getByRole('button', { name: 'End' })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
};
export const LiveEndNotSavedPhone: Story = { ...story('phone', { ...MATURED, writes: { end: failsOnce(undefined) } }), play: liveEndPlay };
export const LiveEndNotSavedDesktop: Story = { ...story('desktop', { ...MATURED, writes: { end: failsOnce(undefined) } }), play: liveEndPlay };

// A Trial whose parameter the app has no name for, as a newer engine might
// serve: the card draws without a name or a before → after, never fails.
const unnamedPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: 'End' })).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-moves')).toBeNull();
};
export const UnnamedTrialPhone: Story = { ...story('phone', { store: CHANGES_UNNAMED }), play: unnamedPlay };
export const UnnamedTrialDesktop: Story = { ...story('desktop', { store: CHANGES_UNNAMED }), play: unnamedPlay };
