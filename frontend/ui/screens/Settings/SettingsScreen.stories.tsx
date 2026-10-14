import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { TOKEN_KEY } from '../../../data.js';
import { failsOnce } from '../../flaky';
import { SettingsScreen, type SettingsScreenProps } from './SettingsScreen';

// The Settings screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Root: the last sync OK (no badge), and failed (the Settings "!" and the
//   row's inline "⚠ Failed").
// - Tandem Source: synced, failed, and with no account set ("Not set" and
//   Update); Updating: the account form open.
// - Pump profile: the wearer's profile and its segments; "No profile" for the
//   store that has none.
// - Glossary: §1.5's terms with their definitions.
// - Token: the field and Save under the root list, and in Unavailable, the
//   screen a browser without the token gets when every read is refused (401).
// Plays per size: each root row drills down under "‹ Settings" and back;
// Update → email and password → Save sets the account; Escape closes the form
// unsaved; Token → Save keeps the token where the client reads it. The
// account typed is the generator's invented address on a reserved domain, the
// token an invented word; nothing is sent.
const meta: Meta<typeof SettingsScreen> = {
  title: 'Screens/Settings',
  component: SettingsScreen,
};
export default meta;

type Story = StoryObj<typeof SettingsScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

const story = (layout: 'phone' | 'desktop', args: Omit<SettingsScreenProps, 'layout'>): Story => ({
  args: { ...args, layout },
  parameters: { frame: FRAMES[layout] },
});

const SYNCED = { sync: 'synced', account: 'set' } as const;
const FAILED = { sync: 'failed', account: 'set' } as const;
const NOT_SET = { sync: null, account: 'unset' } as const;

export const RootSyncedPhone = story('phone', SYNCED);
export const RootSyncedDesktop = story('desktop', SYNCED);
export const RootFailedPhone = story('phone', FAILED);
export const RootFailedDesktop = story('desktop', FAILED);
export const TandemSourceSyncedPhone = story('phone', { ...SYNCED, view: 'tandem' });
export const TandemSourceSyncedDesktop = story('desktop', { ...SYNCED, view: 'tandem' });
export const TandemSourceFailedPhone = story('phone', { ...FAILED, view: 'tandem' });
export const TandemSourceFailedDesktop = story('desktop', { ...FAILED, view: 'tandem' });
export const TandemSourceNotSetPhone = story('phone', { ...NOT_SET, view: 'tandem' });
export const TandemSourceNotSetDesktop = story('desktop', { ...NOT_SET, view: 'tandem' });
export const UpdatingPhone = story('phone', { ...NOT_SET, view: 'tandem', updating: true });
export const UpdatingDesktop = story('desktop', { ...NOT_SET, view: 'tandem', updating: true });
export const PumpProfilePhone = story('phone', { ...SYNCED, view: 'profile' });
export const PumpProfileDesktop = story('desktop', { ...SYNCED, view: 'profile' });
export const NoProfilePhone = story('phone', { ...SYNCED, view: 'profile', pump: 'wearer-unsynced' });
export const NoProfileDesktop = story('desktop', { ...SYNCED, view: 'profile', pump: 'wearer-unsynced' });
export const GlossaryPhone = story('phone', { ...SYNCED, view: 'glossary' });
export const GlossaryDesktop = story('desktop', { ...SYNCED, view: 'glossary' });

/** The drill-down's own header, which holds its "‹ Settings" (the tab bar has a Settings too). */
const back = (canvas: ReturnType<typeof within>, title: string) =>
  within(canvas.getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement)
    .getByRole('button', { name: 'Settings' });

// Each root row drills down under "‹ Settings", and back returns to the root.
const drillPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  for (const [row, title] of [['Tandem Source', 'Tandem Source'], ['Pump profile', 'Pump profile'], ['Glossary', 'Glossary']]) {
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(`^${row}`) }));
    await expect(canvas.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    await userEvent.click(back(canvas, title));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  }
};
export const DrillDownPhone: Story = { ...story('phone', FAILED), play: drillPlay };
export const DrillDownDesktop: Story = { ...story('desktop', FAILED), play: drillPlay };

// Update → the account form; Save waits for both fields, saves, then closes
// with the account set.
const updatePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getAllByText('Not set').length).toBeGreaterThan(0);
  await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
  const form = within(canvas.getByRole('dialog', { name: 'Tandem Source' }));
  const save = form.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await userEvent.type(form.getByLabelText('Email'), 'wearer@example.invalid');
  await userEvent.type(form.getByLabelText('Password'), 'synthetic');
  await userEvent.click(save);
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
  await expect(canvas.queryByText('Not set')).toBeNull();
  await expect(canvas.getByText('Set')).toBeInTheDocument();
};
export const UpdateAccountPhone: Story = { ...story('phone', { ...NOT_SET, view: 'tandem' }), play: updatePlay };
export const UpdateAccountDesktop: Story = { ...story('desktop', { ...NOT_SET, view: 'tandem' }), play: updatePlay };

// Escape closes the form unsaved.
const escapePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
  await expect(canvas.getByRole('dialog', { name: 'Tandem Source' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(canvas.getByText('Set')).toBeInTheDocument();
};
export const CloseFormPhone: Story = { ...story('phone', { ...SYNCED, view: 'tandem' }), play: escapePlay };
export const CloseFormDesktop: Story = { ...story('desktop', { ...SYNCED, view: 'tandem' }), play: escapePlay };

// Live (#495): a Save the engine does not save keeps the form open with what
// was typed, with "Not saved", and Retry saves it.
const liveSavePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
  const form = within(canvas.getByRole('dialog', { name: 'Tandem Source' }));
  await userEvent.type(form.getByLabelText('Email'), 'wearer@example.invalid');
  await userEvent.type(form.getByLabelText('Password'), 'synthetic');
  await userEvent.click(form.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.getByRole('dialog', { name: 'Tandem Source' })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
};
export const LiveSaveNotSavedPhone: Story = {
  ...story('phone', { ...NOT_SET, view: 'tandem', writes: { saveCredentials: failsOnce(undefined) } }), play: liveSavePlay };
export const LiveSaveNotSavedDesktop: Story = {
  ...story('desktop', { ...NOT_SET, view: 'tandem', writes: { saveCredentials: failsOnce(undefined) } }), play: liveSavePlay };

// Loading and Unavailable (§2.5, 2026-10-13), as every other screen has them.
export const LoadingPhone = story('phone', { ...SYNCED, state: 'loading' });
export const LoadingDesktop = story('desktop', { ...SYNCED, state: 'loading' });
export const UnavailablePhone = story('phone', { ...SYNCED, state: 'unavailable' });
export const UnavailableDesktop = story('desktop', { ...SYNCED, state: 'unavailable' });

// Progressive loading: the sync status has landed, so the root's three rows
// show; the pump profile and the account are still being read. Only those parts
// are skeletons, and the rows that wait on nothing else work meanwhile.
const READING = { account: 'loading', pump: 'loading', onRetry: () => undefined } as const;
const progressivePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  // The root is drawn: the Tandem Source row's state is the status, the Pump profile row has no name yet.
  await expect(canvas.getByRole('button', { name: /^Tandem Source/ })).toHaveTextContent('OK');
  const pumpRow = canvas.getByRole('button', { name: /^Pump profile/ });
  await expect(pumpRow).not.toHaveTextContent('No profile');
  await expect(pumpRow.querySelector('.ui-skeleton')).not.toBeNull();
  // Each drill-down waits only for its own data: the sync rows show, the account is a skeleton.
  await userEvent.click(canvas.getByRole('button', { name: /^Tandem Source/ }));
  await expect(canvas.getByText('Last success')).toBeInTheDocument();
  await expect(canvas.queryByText('Password')).toBeNull();
  await userEvent.click(back(canvas, 'Tandem Source'));
  // The Pump profile is a skeleton, not the "No profile" answer.
  await userEvent.click(canvas.getByRole('button', { name: /^Pump profile/ }));
  await expect(canvas.queryByText('No profile')).toBeNull();
  await expect(canvasElement.querySelector('.ui-settings__body .ui-skeleton')).not.toBeNull();
  await userEvent.click(back(canvas, 'Pump profile'));
  // The Glossary waits on nothing.
  await userEvent.click(canvas.getByRole('button', { name: /^Glossary/ }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Glossary' })).toBeInTheDocument();
};
export const ProgressiveLoadingPhone: Story = { ...story('phone', { ...SYNCED, parts: READING }), play: progressivePlay };
export const ProgressiveLoadingDesktop: Story = { ...story('desktop', { ...SYNCED, parts: READING }), play: progressivePlay };

// One part that cannot be read is Unavailable with Retry in its own drill-down; the rest still work.
const PUMP_DOWN = { account: 'ready', pump: 'unavailable', onRetry: () => undefined } as const;
const partUnavailablePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /^Tandem Source/ })).toHaveTextContent('OK');
  await userEvent.click(canvas.getByRole('button', { name: /^Pump profile/ }));
  await expect(canvas.getByText('Unavailable')).toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
};
export const PumpProfileUnavailablePhone: Story = {
  ...story('phone', { ...SYNCED, parts: PUMP_DOWN }), play: partUnavailablePlay };
export const PumpProfileUnavailableDesktop: Story = {
  ...story('desktop', { ...SYNCED, parts: PUMP_DOWN }), play: partUnavailablePlay };

// Token (§2.5, 2026-10-14): Save waits for a token, keeps it where the one
// client reads it, and reads the app again. In Unavailable, every read
// refused, the field is there as on the root.
const tokenPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  localStorage.removeItem(TOKEN_KEY);
  const save = canvas.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await userEvent.type(canvas.getByLabelText('Token'), 'synthetic-token');
  await userEvent.click(save);
  await expect(localStorage.getItem(TOKEN_KEY)).toBe('synthetic-token');
  await expect(args.onToken).toHaveBeenCalledOnce();
  localStorage.removeItem(TOKEN_KEY);
};
export const TokenPhone: Story = { ...story('phone', { ...SYNCED, onToken: fn() }), play: tokenPlay };
export const TokenDesktop: Story = { ...story('desktop', { ...SYNCED, onToken: fn() }), play: tokenPlay };
export const TokenUnavailablePhone: Story = {
  ...story('phone', { ...SYNCED, state: 'unavailable', onToken: fn() }), play: tokenPlay };
export const TokenUnavailableDesktop: Story = {
  ...story('desktop', { ...SYNCED, state: 'unavailable', onToken: fn() }), play: tokenPlay };
