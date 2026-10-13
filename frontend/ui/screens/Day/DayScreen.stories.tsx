import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { formatValue } from '../../provenance.js';
import { dayDate, loggedGrams } from '../../day-model';
import { DayScreen, type DayScreenProps } from './DayScreen';

// The Day screen in each state §1.3 lists for Day, Day · Prompts and Day · Log
// carbs, at phone (390) and desktop (1440), every value the simulated wearer's
// served answer:
// - Default: the latest day with readings, its one unanswered low as the
//   Prompts row; Logged carbs: the day with the most logged carbs; No prompts:
//   once the person has answered them all, no row and no badge.
// - Empty: the first day after the history ends ("No data"); Loading;
//   Unavailable.
// - Month sheet (phone; desktop always shows the month).
// - Prompts: the wearer's two lows before any answer, "1 / 2"; Yes recorded;
//   phone mid-swipe over Not sure (desktop's fourth answer is in every desktop
//   Prompts story); Not saved, the bar with Retry.
// - Log carbs: open, filled, saving, not saved, Time edited.
// Plays per size: picking another day; the Month sheet picking one (phone);
// Log carbs saved, closed with Escape, and retried after a failed save; the
// Prompts walked through (Yes, Recorded, Next, the second, ‹ Day), the badge,
// the row and N reading one store throughout; a Yes not
// saved, then retried. Desktop fits its panes without scrolling.
const meta: Meta<typeof DayScreen> = {
  title: 'Screens/Day',
  component: DayScreen,
};
export default meta;

type Story = StoryObj<typeof DayScreen>;

const FRAMES = {
  phone: { width: 390, height: 844, padding: 0 },
  desktop: { width: 1440, height: 900, padding: 0 },
} as const;

const story = (layout: 'phone' | 'desktop', args: Omit<DayScreenProps, 'layout'>): Story => ({
  args: { ...args, layout },
  parameters: { frame: FRAMES[layout] },
});

const { latest, with_carbs: withCarbs, default: siteDay, no_data: noData } = fixtures.day.states;
/** The header's printed day: "25 May". */
const printed = (iso: string) => formatValue(dayDate(iso).date.value, 'date');
/** The DayTile for a day, found by the navigator day its date is served from. */
const tile = (root: HTMLElement, iso: string) =>
  root.querySelector(`button.ui-day [data-source*="[iso=${iso}]"]`)?.closest('button') ?? null;
const headerDay = (canvas: ReturnType<typeof within>) =>
  canvas.getByRole('heading', { level: 1, name: 'Day' }).parentElement as HTMLElement;

const DEFAULT = { store: 'wearer' } as const;
const LOGGED_CARBS = { store: 'wearer', day: withCarbs } as const;
const NO_PROMPTS = { store: 'wearer-answered' } as const;
const EMPTY = { store: 'wearer', day: noData } as const;
const LOADING = { store: 'wearer', state: 'loading' } as const;
const UNAVAILABLE = { store: 'wearer', state: 'unavailable' } as const;
const PROMPTS = { store: 'wearer-pending', view: 'prompts' } as const;

export const DefaultPhone = story('phone', DEFAULT);
export const DefaultDesktop = story('desktop', DEFAULT);
export const LoggedCarbsPhone = story('phone', LOGGED_CARBS);
export const LoggedCarbsDesktop = story('desktop', LOGGED_CARBS);
export const NoPromptsPhone = story('phone', NO_PROMPTS);
export const NoPromptsDesktop = story('desktop', NO_PROMPTS);
export const EmptyPhone = story('phone', EMPTY);
export const EmptyDesktop = story('desktop', EMPTY);
export const LoadingPhone = story('phone', LOADING);
export const LoadingDesktop = story('desktop', LOADING);
export const UnavailablePhone = story('phone', UNAVAILABLE);
export const UnavailableDesktop = story('desktop', UNAVAILABLE);
export const MonthSheetPhone = story('phone', { ...DEFAULT, monthOpen: true });

export const PromptsPhone = story('phone', PROMPTS);
export const PromptsDesktop = story('desktop', PROMPTS);
export const PromptRecordedPhone = story('phone', { ...PROMPTS, recorded: true });
export const PromptRecordedDesktop = story('desktop', { ...PROMPTS, recorded: true });
export const PromptMidSwipePhone = story('phone', { ...PROMPTS, swiping: true });
export const PromptNotSavedPhone = story('phone', { ...PROMPTS, notSaved: true });
export const PromptNotSavedDesktop = story('desktop', { ...PROMPTS, notSaved: true });

export const LogCarbsPhone = story('phone', { ...DEFAULT, logCarbs: 'empty' });
export const LogCarbsDesktop = story('desktop', { ...DEFAULT, logCarbs: 'empty' });
export const LogCarbsFilledPhone = story('phone', { ...DEFAULT, logCarbs: 'filled' });
export const LogCarbsFilledDesktop = story('desktop', { ...DEFAULT, logCarbs: 'filled' });
export const LogCarbsSavingPhone = story('phone', { ...DEFAULT, logCarbs: 'saving' });
export const LogCarbsSavingDesktop = story('desktop', { ...DEFAULT, logCarbs: 'saving' });
export const LogCarbsNotSavedPhone = story('phone', { ...DEFAULT, logCarbs: 'not_saved' });
export const LogCarbsNotSavedDesktop = story('desktop', { ...DEFAULT, logCarbs: 'not_saved' });
export const LogCarbsTimeEditedPhone = story('phone', { ...DEFAULT, logCarbs: 'filled', timeEdited: true });
export const LogCarbsTimeEditedDesktop = story('desktop', { ...DEFAULT, logCarbs: 'filled', timeEdited: true });

// Picking another day: the header names it and the chart is that day's.
const pickPlay = (iso: string): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(headerDay(canvas)).toHaveTextContent(printed(latest));
  await userEvent.click(tile(canvasElement, iso)!);
  await expect(tile(canvasElement, iso)).toHaveAttribute('aria-pressed', 'true');
  await expect(headerDay(canvas)).toHaveTextContent(printed(iso));
  await expect(canvasElement.querySelector(`[data-source^="day.days.${iso}."]`)).not.toBeNull();
};
export const PickDayPhone: Story = { ...story('phone', DEFAULT), play: pickPlay(siteDay) };
export const PickDayDesktop: Story = { ...story('desktop', DEFAULT), play: pickPlay(withCarbs) };

// Phone: ‹ steps the strip a week back; the month label opens the Month sheet,
// and a day picked there closes it, selected, with its week in the strip.
export const MonthSheetPickPhone: Story = {
  ...story('phone', DEFAULT),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Previous' }));
    await expect(tile(canvasElement, latest)).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(tile(canvasElement, latest)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(canvas.getByRole('button', { name: 'May' }));
    await userEvent.click(tile(canvas.getByRole('dialog', { name: 'May' }), withCarbs)!);
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(headerDay(canvas)).toHaveTextContent(printed(withCarbs));
    await expect(tile(canvasElement, withCarbs)).toHaveAttribute('aria-pressed', 'true');
  },
};

const typed = formatValue(loggedGrams().value, loggedGrams().format);
const openCarbs = async (canvas: ReturnType<typeof within>) => {
  await userEvent.click(canvas.getByRole('button', { name: '+ Log carbs' }));
  return within(canvas.getByRole('dialog', { name: 'Log carbs' }));
};

// Log carbs: type an amount the wearer logged, Save (busy), and it closes.
const savePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  const save = entry.getByRole('button', { name: 'Save' });
  await expect(save).toBeDisabled();
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(save);
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
};
export const LogCarbsSavePhone: Story = { ...story('phone', DEFAULT), play: savePlay };
export const LogCarbsSaveDesktop: Story = { ...story('desktop', DEFAULT), play: savePlay };

// Escape closes it unsaved.
const escapePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.keyboard('{Escape}');
  await expect(canvas.queryByRole('dialog')).toBeNull();
};
export const LogCarbsEscapePhone: Story = { ...story('phone', DEFAULT), play: escapePlay };
export const LogCarbsEscapeDesktop: Story = { ...story('desktop', DEFAULT), play: escapePlay };

// A save that fails keeps the entry, Not saved, with Retry; Retry saves it.
const retryCarbsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(entry.getByRole('button', { name: 'Retry' })).toBeInTheDocument());
  await expect(entry.getByText('Not saved')).toBeInTheDocument();
  await userEvent.click(entry.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByRole('dialog')).toBeNull());
};
export const LogCarbsRetryPhone: Story = { ...story('phone', { ...DEFAULT, failing: true }), play: retryCarbsPlay };
export const LogCarbsRetryDesktop: Story = { ...story('desktop', { ...DEFAULT, failing: true }), play: retryCarbsPlay };

const place = (canvas: ReturnType<typeof within>) =>
  canvas.getByRole('heading', { level: 1, name: 'Lows' }).parentElement as HTMLElement;

/** The NavBar's Day badge. */
const badge = (root: HTMLElement) => root.querySelector('.ui-badge--count');

// The Prompts row drills in to "1 / 2", the badge 2; Yes records it (Recorded,
// the grams field, Next) on the same store; Next reads the store after it,
// "1 / 1" and the badge 1; ‹ Day returns, the row counting one.
const promptsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('button', { name: /Lows/ })).toHaveTextContent('2');
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await expect(place(canvas)).toHaveTextContent('1 / 2');
  await expect(badge(canvasElement)).toHaveTextContent('2');
  await userEvent.click(canvas.getByRole('button', { name: /Yes/ }));
  const yes = canvas.getByRole('button', { name: /Yes/ });
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await expect(within(yes).getByText('Recorded')).toBeInTheDocument();
  await expect(place(canvas)).toHaveTextContent('1 / 2');
  await expect(badge(canvasElement)).toHaveTextContent('2');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(within(canvasElement.querySelector<HTMLElement>('.ui-prompt')!).getByRole('button', { name: 'Next' }));
  await expect(place(canvas)).toHaveTextContent('1 / 1');
  await expect(badge(canvasElement)).toHaveTextContent('1');
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(within(canvas.getByRole('heading', { level: 1, name: 'Lows' }).closest('header') as HTMLElement)
    .getByRole('button', { name: 'Day' }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Day' })).toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: /Lows/ })).toHaveTextContent('1');
  await expect(badge(canvasElement)).toHaveTextContent('1');
};
export const PromptsFlowPhone: Story = { ...story('phone', { store: 'wearer-pending' }), play: promptsPlay };
export const PromptsFlowDesktop: Story = { ...story('desktop', { store: 'wearer-pending' }), play: promptsPlay };

// A Yes that is not saved: the answer returns unselected, the bar says Not
// saved; Retry records it.
const notSavedPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Yes/ }));
  await expect(canvas.getByRole('status')).toHaveTextContent('Not saved');
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Retry' }));
  await expect(canvas.queryByRole('status')).toBeNull();
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'true');
};
export const PromptRetryPhone: Story = { ...story('phone', { ...PROMPTS, failing: true }), play: notSavedPlay };
export const PromptRetryDesktop: Story = { ...story('desktop', { ...PROMPTS, failing: true }), play: notSavedPlay };

// Desktop: the month pane and the day pane each hold all of their content.
export const FitsDesktop: Story = {
  ...story('desktop', DEFAULT),
  play: async ({ canvasElement }) => {
    for (const pane of canvasElement.querySelectorAll<HTMLElement>('[data-scroll="page"]')) {
      await expect(pane.scrollHeight).toBeLessThanOrEqual(pane.clientHeight);
    }
  },
};
