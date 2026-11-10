import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { TOKEN_KEY } from '../../../data.js';
import { failsOnce } from '../../flaky';
import { historyRouter } from '../../history-router';
import { pumpProfile } from '../../settings-model';
import { expectTabBarEnds } from '../../tabbar-check';
import { PHONES, expectClearsInset, expectTappable, homeIndicator, tapCentre } from '../../tap-check';
import { expectAtPaneTop, expectHeaderEmpty, expectTitlePrinted } from '../../title-check';
import { SettingsScreen, type SettingsDrillDown, type SettingsScreenProps } from './SettingsScreen';

// The Settings screen in each state §1.3 lists, at phone (390) and desktop
// (1440), every value the simulated wearer's served answer:
// - Root: the last sync OK (no badge), and failed (the Settings "!" and the
//   row's inline "⚠ Failed").
// - Tandem Source: synced, failed (a long raw error under its short label),
//   and with no account set ("Not set" and Update); Updating: the account
//   form open.
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

// The tab bar ends the screen: 64 px above the device's inset (§2.5, 2026-10-19).
// The tab bar's selected Settings names the screen, so its header draws nothing
// (§2.5, 2026-10-20).
export const RootSyncedPhone: Story = {
  ...story('phone', SYNCED),
  play: async ({ canvasElement }) => {
    await expectTabBarEnds(canvasElement);
    await expectHeaderEmpty(canvasElement, 'Settings');
  },
};
export const RootSyncedDesktop: Story = {
  ...story('desktop', SYNCED),
  play: async ({ canvasElement }) => {
    await expectHeaderEmpty(canvasElement, 'Settings');
    await expectAtPaneTop(canvasElement.querySelector<HTMLElement>('.ui-settings__body')!);
  },
};
export const RootFailedPhone = story('phone', FAILED);
export const RootFailedDesktop = story('desktop', FAILED);
export const TandemSourceSyncedPhone = story('phone', { ...SYNCED, view: 'tandem' });
export const TandemSourceSyncedDesktop = story('desktop', { ...SYNCED, view: 'tandem' });
// The failed sync's long error (§2.5 2026-10-14): the Error row shows the
// served label, and the raw text wraps beneath it, never past the row's edge
// nor under the label on its right.
const longErrorPlay: Story['play'] = async ({ canvasElement }) => {
  const label = within(canvasElement).getByText('No connection');
  const row = label.closest('.ui-row') as HTMLElement;
  const detail = row.querySelector('.ui-row__detail') as HTMLElement;
  await expect(detail.textContent).toMatch(/^HTTPSConnectionPool.*Network is unreachable/);
  // The text's own extent: a box does not grow with text that overflows it.
  const text = document.createRange();
  text.selectNodeContents(detail);
  const edge = row.getBoundingClientRect().right;
  for (const part of row.querySelectorAll('*')) {
    await expect(part.getBoundingClientRect().right).toBeLessThanOrEqual(edge + 0.5);
  }
  await expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth);
  await expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(label.getBoundingClientRect().left);
  for (const box of canvasElement.querySelectorAll<HTMLElement>('.ui-settings, .ui-settings__main, .ui-settings__pane')) {
    await expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  }
};
export const TandemSourceLongErrorPhone: Story = { ...story('phone', { ...FAILED, view: 'tandem' }), play: longErrorPlay };
export const TandemSourceLongErrorDesktop: Story = { ...story('desktop', { ...FAILED, view: 'tandem' }), play: longErrorPlay };
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
    await expectTitlePrinted(canvasElement, title);
    await userEvent.click(back(canvas, title));
    await expect(canvas.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  }
};
export const DrillDownPhone: Story = { ...story('phone', FAILED), play: drillPlay };
export const DrillDownDesktop: Story = { ...story('desktop', FAILED), play: drillPlay };

// Through the app's router (ADR 594, #656, #669): each drill-down pushes its
// history entry, "‹ Settings" goes Back through it, the platform's own Back
// returns to the root as it does, and Forward opens the drill-down again.
const routedPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const router = args.nav!.drillDown as ReturnType<typeof historyRouter<SettingsDrillDown>>;
  const root = () => canvas.findByRole('heading', { level: 1, name: 'Settings' });
  for (const [view, title] of [['tandem', 'Tandem Source'], ['profile', 'Pump profile'], ['glossary', 'Glossary']] as const) {
    await userEvent.click(canvas.getByRole('button', { name: new RegExp(`^${title}`) }));
    await expect(router.open).toHaveBeenLastCalledWith({ view });
    await userEvent.click(back(canvas, title));
    await expect(router.close).toHaveBeenCalled();
    await root();
    router.forward();
    await canvas.findByRole('heading', { level: 1, name: title });
    await expectTitlePrinted(canvasElement, title);
    router.close();
    await root();
  }
};
export const RoutedDrillDownPhone: Story = {
  ...story('phone', { ...SYNCED, nav: { drillDown: historyRouter<SettingsDrillDown>() } }), play: routedPlay };
export const RoutedDrillDownDesktop: Story = {
  ...story('desktop', { ...SYNCED, nav: { drillDown: historyRouter<SettingsDrillDown>() } }), play: routedPlay };
// A Back from another tab onto a drill-down's entry opens it as it was.
export const ReturnedToGlossary: Story = {
  ...story('phone', { ...SYNCED, returnTo: { view: 'glossary' }, nav: { drillDown: historyRouter<SettingsDrillDown>({ view: 'glossary' }) } }),
  play: async ({ canvasElement }) => { await expectTitlePrinted(canvasElement, 'Glossary'); },
};

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

// The account sheet covers the tab bar: a tap at Save's centre saves what was
// typed, at each phone size, and Save clears the home indicator (#648).
const tapSavePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
  const form = within(canvas.getByRole('dialog', { name: 'Tandem Source' }));
  await userEvent.type(form.getByLabelText('Email'), 'wearer@example.invalid');
  await userEvent.type(form.getByLabelText('Password'), 'synthetic');
  const save = form.getByRole('button', { name: 'Save' });
  await expectTappable(save);
  await expectClearsInset(save);
  await tapCentre(save);
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
  await expect(canvas.getByText('Set')).toBeInTheDocument();
};
const tapSave = (frame: (typeof PHONES)[keyof typeof PHONES]): Story => ({
  ...story('phone', { ...NOT_SET, view: 'tandem' }), parameters: { frame }, play: tapSavePlay,
});
export const TapSavePhone375x667: Story = tapSave(PHONES.se);
export const TapSavePhone375x812: Story = { ...tapSave(PHONES.x), decorators: [homeIndicator] };
export const TapSavePhone412x915: Story = tapSave(PHONES.pixel);

// Enter in a field saves the account once Save is enabled, and does nothing before (#664).
const enterPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
  const form = within(canvas.getByRole('dialog', { name: 'Tandem Source' }));
  const save = form.getByRole('button', { name: 'Save' });
  await userEvent.type(form.getByLabelText('Email'), 'wearer@example.invalid{Enter}');
  await expect(save).not.toHaveAttribute('aria-busy', 'true');
  await userEvent.type(form.getByLabelText('Password'), 'synthetic{Enter}');
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
  await expect(canvas.getByText('Set')).toBeInTheDocument();
};
export const EnterSavesAccountPhone: Story = { ...story('phone', { ...NOT_SET, view: 'tandem' }), play: enterPlay };
export const EnterSavesAccountDesktop: Story = { ...story('desktop', { ...NOT_SET, view: 'tandem' }), play: enterPlay };

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

/** Nothing draws over `element` at its centre: it is the topmost thing there. */
const expectOnTop = async (element: HTMLElement) => {
  const box = element.getBoundingClientRect();
  const hit = element.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  await expect(element.contains(hit)).toBe(true);
};

// A failed save's "Not saved" and Retry are drawn over the open form (#661),
// and go with it: Escape closes the form and the bar, and on desktop "‹ Settings"
// leaves the page without it.
const notSavedOnTopPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const fail = async () => {
    await userEvent.click(canvas.getByRole('button', { name: 'Update' }));
    const form = within(canvas.getByRole('dialog', { name: 'Tandem Source' }));
    await userEvent.type(form.getByLabelText('Email'), 'wearer@example.invalid');
    await userEvent.type(form.getByLabelText('Password'), 'synthetic');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
    await expect(canvas.getByRole('dialog', { name: 'Tandem Source' })).toBeInTheDocument();
    await expectOnTop(canvas.getByRole('button', { name: 'Retry' }));
  };
  await fail();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
  if (layout === 'phone') return;
  await fail();
  await userEvent.click(back(canvas, 'Tandem Source'));
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
  await userEvent.click(canvas.getByRole('button', { name: /^Glossary/ }));
  await expect(canvas.queryByRole('status')).toBeNull();
};
const failing = () => ({ saveCredentials: async () => { throw new Error('not saved'); } });
export const NotSavedOverFormPhone: Story = {
  ...story('phone', { ...NOT_SET, view: 'tandem', writes: failing() }), play: notSavedOnTopPlay('phone') };
export const NotSavedOverFormDesktop: Story = {
  ...story('desktop', { ...NOT_SET, view: 'tandem', writes: failing() }), play: notSavedOnTopPlay('desktop') };

// Loading and Unavailable (§2.5, 2026-10-13), as every other screen has them.
export const LoadingPhone = story('phone', { ...SYNCED, state: 'loading' });
export const LoadingDesktop = story('desktop', { ...SYNCED, state: 'loading' });
export const UnavailablePhone = story('phone', { ...SYNCED, state: 'unavailable' });
export const UnavailableDesktop = story('desktop', { ...SYNCED, state: 'unavailable' });
// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
export const StalePhone = story('phone', { ...SYNCED, state: 'stale' });
export const StaleDesktop = story('desktop', { ...SYNCED, state: 'stale' });
// Stale parts keep their answers (#662): the Pump profile row its name, and
// Tandem Source its account rows with Update, under Unavailable and Retry.
const STALE_PARTS = { account: 'stale', pump: 'stale', onRetry: () => undefined } as const;
const staleRowsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /^Pump profile/ })).toHaveTextContent(pumpProfile('wearer')!.name);
  await userEvent.click(canvas.getByRole('button', { name: /^Tandem Source/ }));
  await expect(canvas.getByText('Email')).toBeInTheDocument();
  await expect(canvas.getByText('Password')).toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  await expect(canvas.getByText('Unavailable')).toBeInTheDocument();
};
export const StalePartsPhone: Story = { ...story('phone', { ...SYNCED, parts: STALE_PARTS }), play: staleRowsPlay };
export const StalePartsDesktop: Story = { ...story('desktop', { ...SYNCED, parts: STALE_PARTS }), play: staleRowsPlay };

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
// Enter in the Token field saves it once it holds a token (#664).
const tokenEnterPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  localStorage.removeItem(TOKEN_KEY);
  await userEvent.type(canvas.getByLabelText('Token'), '{Enter}');
  await expect(args.onToken).not.toHaveBeenCalled();
  await userEvent.type(canvas.getByLabelText('Token'), 'synthetic-token{Enter}');
  await expect(localStorage.getItem(TOKEN_KEY)).toBe('synthetic-token');
  await expect(args.onToken).toHaveBeenCalledOnce();
  localStorage.removeItem(TOKEN_KEY);
};
export const TokenEnterPhone: Story = { ...story('phone', { ...SYNCED, onToken: fn() }), play: tokenEnterPlay };
export const TokenEnterDesktop: Story = { ...story('desktop', { ...SYNCED, onToken: fn() }), play: tokenEnterPlay };
