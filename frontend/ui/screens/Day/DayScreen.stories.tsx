import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { formatValue } from '../../provenance.js';
import { dayDate, loggedGrams } from '../../day-model';
import { swipe } from '../../gesture';
import { failsOnce } from '../../flaky';
import { WithoutReadings, monthReader } from '../../served-variants';
import { DayScreen, type DayScreenProps } from './DayScreen';

// The Day screen in each state §1.3 lists for Day, Day · Prompts and Day · Log
// carbs, at phone (390) and desktop (1440), every value the simulated wearer's
// served answer:
// - Default: the latest day with readings, its insulin bar and its one
//   unanswered low as the Prompts row; its chart draws basal against the Pump
//   profile with its suspends, and two meals the engine counted as Carb
//   undercount, named in their event rows; Logged carbs: the day with the most
//   logged carbs; No prompts: once the person has answered them all, no row
//   and no badge.
// - Empty: the first day after the history ends ("No data"); Loading;
//   Unavailable.
// - Findings: the logged-carbs day, which carries several kinds of finding,
//   each named on its event row and marked on the chart.
// - Month open: the header's day dropped down to the month's weeks.
// - Prompts: the wearer's two lows before any answer, "1 / 2"; Yes recorded;
//   phone mid-swipe over Not sure, the shortcut for the Not sure text action
//   beneath the answers (desktop's fourth answer is in every desktop Prompts
//   story); Not saved, the bar with Retry.
// - Log carbs: open, filled, saving, not saved, Time edited.
// Plays per size: picking another day from the dropped-down month, and on
// desktop from the week in view;
// Log carbs saved, closed with Escape, and retried after a failed save; the
// Prompts walked through (Yes, Recorded, Next, the second, ‹ Day); a Yes not
// saved, then retried; Not sure on the phone. Desktop fits its panes without scrolling.
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
/** A day's accessible name, as the header's control and a ribbon's day carry it: "Sat 17 May". */
const named = (iso: string) => `${dayDate(iso).weekday} ${printed(iso)}`;
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
// A site change: the pump logs one event per fill (cartridge, tubing and
// cannula, seconds apart), and the day shows one site change.
const siteChangePlay: Story['play'] = async ({ canvasElement }) => {
  const listed = within(canvasElement).getAllByText('Site change')
    .filter((element) => !element.closest('.ui-daychart__legend'));
  await expect(listed).toHaveLength(1);
};
export const SiteChangePhone: Story = { ...story('phone', { store: 'wearer', day: siteDay }), play: siteChangePlay };
export const SiteChangeDesktop: Story = { ...story('desktop', { store: 'wearer', day: siteDay }), play: siteChangePlay };

// A day carrying several kinds of finding (§2.5, 2026-10-14 every finding
// marked): the logged-carbs day, whose served findings name three habits.
// Every habit the engine served names an event row, and each named row has
// its Pattern glyph on the chart.
const findingsPlay: Story['play'] = async ({ canvasElement }) => {
  const served = (fixtures.day.days as Record<string, { model_view: { findings: { levers: { title: string }[] }[] } }>)[withCarbs]
    .model_view.findings;
  const habits = [...new Set(served.flatMap((finding) => finding.levers.map((lever) => lever.title)))];
  await expect(habits.length).toBeGreaterThanOrEqual(3);
  const rows = [...canvasElement.querySelectorAll('.ui-daychart__event')]
    .map((row) => row.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  for (const habit of habits) await expect(rows.some((row) => row.includes(habit))).toBe(true);
  const named = rows.filter((row) => habits.some((habit) => row.includes(habit)));
  await expect(canvasElement.querySelectorAll('.ui-daychart__chart .ui-daychart__mark--pattern')).toHaveLength(named.length);
};
export const FindingsPhone: Story = { ...story('phone', LOGGED_CARBS), play: findingsPlay };
export const FindingsDesktop: Story = { ...story('desktop', LOGGED_CARBS), play: findingsPlay };
export const MonthOpenPhone = story('phone', { ...DEFAULT, monthOpen: true });
export const MonthOpenDesktop = story('desktop', { ...DEFAULT, monthOpen: true });

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

// Picking another day from the month: the header's day drops the month down,
// a day there closes it, and the header and the chart are that day's.
const pickPlay = (iso: string): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(headerDay(canvas)).toHaveTextContent(printed(latest));
  await userEvent.click(canvas.getByRole('button', { name: named(latest), expanded: false }));
  const month = within(canvas.getByRole('dialog', { name: 'May' }));
  await userEvent.click(month.getByRole('button', { name: named(iso) }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(headerDay(canvas)).toHaveTextContent(printed(iso));
  await expect(canvasElement.querySelector(`[data-source^="day.days.${iso}."]`)).not.toBeNull();
};
export const PickDayPhone: Story = { ...story('phone', DEFAULT), play: pickPlay(withCarbs) };
export const PickDayDesktop: Story = { ...story('desktop', DEFAULT), play: pickPlay(withCarbs) };

// Escape closes the month as it was.
const closeMonthPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: named(latest), expanded: false }));
  await expect(canvas.getByRole('dialog', { name: 'May' })).toBeInTheDocument();
  await userEvent.keyboard('{Escape}');
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(headerDay(canvas)).toHaveTextContent(printed(latest));
};
export const CloseMonthPhone: Story = { ...story('phone', DEFAULT), play: closeMonthPlay };
export const CloseMonthDesktop: Story = { ...story('desktop', DEFAULT), play: closeMonthPlay };

// Desktop: the week in view picks a day too.
export const PickInWeekDesktop: Story = {
  ...story('desktop', DEFAULT),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: named(siteDay) }));
    await expect(canvas.getByRole('button', { name: named(siteDay), pressed: true })).toBeInTheDocument();
    await expect(headerDay(canvas)).toHaveTextContent(printed(siteDay));
  },
};

// Stepping months: ‹ reads April once and shows its weeks, a day in it opens
// that day (on desktop the week in view follows it), and › steps back; March is
// the first month with readings, so ‹ is disabled there. A month the engine
// cannot serve says Unavailable, with Retry, in the drop-down.
const steppable = (layout: 'phone' | 'desktop', failing: string[] = []): Story => {
  const months = monthReader(failing);
  return { ...story(layout, { ...DEFAULT, readMonth: months.readMonth }), beforeEach: () => months.cleanup };
};
const openMonth = async (canvas: ReturnType<typeof within>) => {
  await userEvent.click(canvas.getByRole('button', { name: named(latest), expanded: false }));
  return within(canvas.getByRole('dialog', { name: 'May' }));
};
const stepPlay = (layout: 'phone' | 'desktop'): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const may = await openMonth(canvas);
  await expect(may.getByRole('button', { name: 'Next' })).toBeDisabled();
  await userEvent.click(may.getByRole('button', { name: 'Previous' }));
  const april = within(await canvas.findByRole('dialog', { name: 'Apr' }));
  await expect(april.getByRole('button', { name: 'Next' })).toBeEnabled();
  await userEvent.click(april.getByRole('button', { name: 'Previous' }));
  const march = within(await canvas.findByRole('dialog', { name: 'Mar' }));
  await expect(march.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await userEvent.click(march.getByRole('button', { name: 'Next' }));
  const back = within(await canvas.findByRole('dialog', { name: 'Apr' }));
  await userEvent.click(back.getByRole('button', { name: named('2025-04-10') }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(headerDay(canvas)).toHaveTextContent(printed('2025-04-10'));
  if (layout === 'desktop') {
    await expect(canvas.getByRole('button', { name: named('2025-04-10'), pressed: true })).toBeInTheDocument();
  }
};
const unavailablePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const may = await openMonth(canvas);
  await userEvent.click(may.getByRole('button', { name: 'Previous' }));
  const april = within(await canvas.findByRole('dialog', { name: 'Apr' }));
  await waitFor(() => expect(april.getByText('Unavailable')).toBeInTheDocument());
  await expect(april.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  await userEvent.click(april.getByRole('button', { name: 'Next' }));
  await expect(within(await canvas.findByRole('dialog', { name: 'May' })).queryByText('Unavailable')).toBeNull();
};
export const StepMonthPhone: Story = { ...steppable('phone'), play: stepPlay('phone') };
export const StepMonthDesktop: Story = { ...steppable('desktop'), play: stepPlay('desktop') };
export const MonthUnavailablePhone: Story = { ...steppable('phone', ['2025-04']), play: unavailablePlay };
export const MonthUnavailableDesktop: Story = { ...steppable('desktop', ['2025-04']), play: unavailablePlay };

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

// The Prompts row drills in to "1 / 2"; Yes records it (Recorded, the grams
// field, Next); Next shows "2 / 2"; ‹ Day returns, the row counting one.
const promptsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await expect(place(canvas)).toHaveTextContent('1 / 2');
  await userEvent.click(canvas.getByRole('button', { name: /Yes/ }));
  const yes = canvas.getByRole('button', { name: /Yes/ });
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await expect(within(yes).getByText('Recorded')).toBeInTheDocument();
  await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(within(canvasElement.querySelector<HTMLElement>('.ui-prompt')!).getByRole('button', { name: 'Next' }));
  await expect(place(canvas)).toHaveTextContent('2 / 2');
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(within(canvas.getByRole('heading', { level: 1, name: 'Lows' }).closest('header') as HTMLElement)
    .getByRole('button', { name: 'Day' }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Day' })).toBeInTheDocument();
  await expect(canvas.getByRole('button', { name: /Lows/ })).toHaveTextContent('1');
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
// Phone: Not sure, the text action beneath the answers, records it and moves
// to the next prompt.
export const PromptNotSurePhone: Story = {
  ...story('phone', PROMPTS),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Not sure' }));
    await expect(place(canvas)).toHaveTextContent('2 / 2');
  },
};
// Phone: a full swipe is Not sure's shortcut, and moves to the next prompt.
export const PromptSwipePhone: Story = {
  ...story('phone', PROMPTS),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await swipe(canvasElement.querySelector<HTMLElement>('.ui-prompt')!, -72);
    await expect(place(canvas)).toHaveTextContent('2 / 2');
  },
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

// Live (#495): a Yes the engine does not save takes its check back, with
// "Not saved", and Retry records it; then Next.
const liveAnswerPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(canvas.getByRole('button', { name: 'Yes', pressed: false })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
  await expect(canvas.getByRole('button', { name: /Yes/, pressed: true })).toBeInTheDocument();
};
const liveDay = (): DayScreenProps['writes'] => ({
  answer: failsOnce({ carbEntryId: null }), grams: failsOnce(undefined), logCarbs: failsOnce(undefined),
});
export const LiveAnswerNotSavedPhone: Story = { ...story('phone', { store: 'wearer', writes: liveDay() }), play: liveAnswerPlay };
export const LiveAnswerNotSavedDesktop: Story = { ...story('desktop', { store: 'wearer', writes: liveDay() }), play: liveAnswerPlay };

// Live (#495): Log carbs' Time row opens the system picker, and Save logs the
// carbs at the time picked.
const PICKED = '07:45';
const logged: [number, string | undefined][] = [];
const liveLog = (): DayScreenProps['writes'] => ({
  answer: async () => ({ carbEntryId: null }), grams: async () => undefined,
  logCarbs: async (grams, time) => { logged.push([grams, time]); },
});
const timeEditedPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  logged.length = 0;
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), '30');
  await expect(entry.getByRole('button', { name: /Time/ })).toHaveTextContent('Now');
  fireEvent.change(entry.getByLabelText('Time', { selector: 'input' }), { target: { value: PICKED } });
  await expect(entry.getByRole('button', { name: /Time/ })).toHaveTextContent(PICKED);
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(canvas.queryByRole('dialog', { name: 'Log carbs' })).toBeNull());
  await expect(logged).toEqual([[30, PICKED]]);
};
export const LiveTimeEditedPhone: Story = { ...story('phone', { store: 'wearer', writes: liveLog() }), play: timeEditedPlay };
export const LiveTimeEditedDesktop: Story = { ...story('desktop', { store: 'wearer', writes: liveLog() }), play: timeEditedPlay };

// Before the first sync the navigator serves no day with readings: Day opens
// on the served month's last day up to today (its timeline, not served here,
// shows as the chart's skeleton; the live app reads it as "No data").
const noReadings: Story['decorators'] = [(Story) => <WithoutReadings><Story /></WithoutReadings>];
const noReadingsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole('heading', { level: 1, name: 'Day' })).toBeInTheDocument();
  await expect(canvas.getByRole('button', { expanded: false, name: /31 May/ })).toBeInTheDocument();
};
export const NoReadingsPhone: Story = { ...story('phone', { store: 'wearer-answered' }), decorators: noReadings, play: noReadingsPlay };
export const NoReadingsDesktop: Story = { ...story('desktop', { store: 'wearer-answered' }), decorators: noReadings, play: noReadingsPlay };
