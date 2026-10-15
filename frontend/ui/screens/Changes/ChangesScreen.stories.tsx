import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { failsOnce } from '../../flaky';
import { CHANGES_PROFILE, CHANGES_PROFILE_ENDED, CHANGES_UNNAMED } from '../../served-variants';
import { ChangesScreen, type ChangesScreenProps } from './ChangesScreen';

// The Changes screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Default: a Focus pinned after the person ended a basal Trial, so the
//   ended Trial is the last change, one row; Last open: that row expanded.
// - Trial maturing (six days in), Trial matured Better with End offered, and
//   the second wearer's Trial matured Worse.
// - Focus maturing (a day after its pin) and matured (four weeks after),
//   with how often the habit happened and the outcomes it maps to.
// - Ended: the matured Trial once the person ends it: no active change, the
//   Trial as the last change.
// - Empty: the first days, with no change at all.
// - Waiting for pump: a Done on the basal card that no sync has resolved.
// - Confirm: End pressed on the matured Trial, the confirmation open.
// - Loading, and Unavailable (the unsynced store serves guidance unavailable);
//   Stale, the last answers under Unavailable.
// Two plays per size: End → End ends the Trial and shows what the engine
// served after it; End → Cancel leaves the Focus as it was.
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

const endPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByText('Last change')).toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: 'End' }));
  const dialog = within(canvas.getByRole('dialog', { name: 'End' }));
  await userEvent.click(dialog.getByRole('button', { name: 'End' }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(canvas.getByText('No active change')).toBeInTheDocument();
  await expect(canvas.getByRole('heading', { name: 'Last change' })).toBeInTheDocument();
  await expect(canvas.getByRole('button', { expanded: false })).toBeInTheDocument();
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

export const LastOpenPhone = story('phone', { ...DEFAULT, lastOpen: true });
export const LastOpenDesktop = story('desktop', { ...DEFAULT, lastOpen: true });

// The last change is one row; it expands in place into its card and back.
export const ExpandLastPhone: Story = {
  ...story('phone', DEFAULT),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole('button', { expanded: false });
    await expect(canvas.queryByText('Before')).toBeNull();
    await userEvent.click(row);
    await expect(row).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Before')).toBeInTheDocument();
    await userEvent.click(row);
    // It closes in place, then is gone.
    await waitFor(() => expect(canvas.queryByText('Before')).toBeNull());
  },
};

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

// A whole-profile Trial (the engine's `profile` parameter): named "Pump
// profile", with no time block and no before → after, since the engine serves
// none; its result, its outcomes and End as for any Trial; and as the last change.
const profilePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 2, name: /Pump profile/ })).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-change__figure')).toBeNull();
  await expect(canvas.getByRole('button', { name: 'End' })).toBeInTheDocument();
};
export const ProfileTrialPhone: Story = { ...story('phone', { store: CHANGES_PROFILE }), play: profilePlay };
export const ProfileTrialDesktop: Story = { ...story('desktop', { store: CHANGES_PROFILE }), play: profilePlay };
const profileEndedPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText('No active change')).toBeInTheDocument();
  await expect(canvas.getByText('Pump profile')).toBeInTheDocument();
};
export const ProfileLastChangePhone: Story = { ...story('phone', { store: CHANGES_PROFILE_ENDED }), play: profileEndedPlay };
export const ProfileLastChangeDesktop: Story = { ...story('desktop', { store: CHANGES_PROFILE_ENDED }), play: profileEndedPlay };

// A Trial whose parameter the app has no name for, as a newer engine might
// serve: the card draws without a name or a before → after, never fails.
const unnamedPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByText('Trial')).toBeInTheDocument();
  await expect(canvasElement.querySelector('.ui-change__figure')).toBeNull();
};
export const UnnamedTrialPhone: Story = { ...story('phone', { store: CHANGES_UNNAMED }), play: unnamedPlay };
export const UnnamedTrialDesktop: Story = { ...story('desktop', { store: CHANGES_UNNAMED }), play: unnamedPlay };
