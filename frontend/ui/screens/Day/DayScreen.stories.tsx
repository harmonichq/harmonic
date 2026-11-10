import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, userEvent, waitFor, within } from 'storybook/test';
import { fixtures } from '../../fixtures';
import { formatValue } from '../../provenance.js';
import { dayDate, loggedGrams, type PromptData, type PromptStore } from '../../day-model';
import { hold, scrollThenSwipe, swipe } from '../../gesture';
import { failsOnce } from '../../flaky';
import { historyRouter } from '../../history-router';
import { expectTabBarEnds } from '../../tabbar-check';
import { PHONES, expectClearsInset, expectTappable, homeIndicator, motionEnded, tapCentre } from '../../tap-check';
import { expectTitlePrinted, expectTitleUnprinted } from '../../title-check';
import { BeforeFirstLog, WithoutReadings, monthReader } from '../../served-variants';
import type { Answer } from '../../components/PromptCard/PromptCard';
import { DayScreen, type DayDrillDown, type DayScreenProps, type DayWrites } from './DayScreen';

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
// - Log carbs: open, filled, Time edited.
// - Rises (#529): the wearer with two lunches never bolused for, its Rises row
//   under its Lows row; its Rises, "1 / 2", a Rise's Yes recorded, and on the
//   phone mid-swipe over Not sure; No rises, once both are answered, its Lows
//   row alone.
// Plays per size: picking another day from the dropped-down month, and on
// desktop from the week in view;
// Log carbs saved, closed with Escape, and retried from the bar after a failed
// save, and live, drawn on its day before the engine answers or refused; the
// Prompts walked through (Yes, Recorded, Next, the second, ‹ Day); a Yes not
// saved, then retried; Not sure on the phone; the Rises walked through (No,
// "2 / 2", Yes, Next, back to Day with its Lows row alone), and live, a Rise's
// No posted as a rise's. Desktop fits its panes without scrolling. On the
// phone, the Day swipe (ADR 619): a step each way, across a month inside the
// served weeks and through a month read, the latest day resisted, a short drag
// and a flick, an edge press, a scroll, a pointer cancel, reduced motion, and
// none on desktop.
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

/** The stories' clock, on no day they draw, unless a story sets its own; live, the store's (ADR 658). */
const STORY_CLOCK = () => '2000-01-01 12:00';
const story = (layout: 'phone' | 'desktop', args: Omit<DayScreenProps, 'layout'>): Story => ({
  args: { now: STORY_CLOCK, ...args, layout },
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
const RISES = { store: 'rises-pending' } as const;
const RISE_PROMPTS = { store: 'rises-pending', view: 'prompts', kind: 'rise' } as const;
const NO_RISES = { store: 'rises-answered' } as const;

// The tab bar ends the screen: 64 px above the device's inset (§2.5, 2026-10-19).
// The nav's selected Day names the screen, so the header's line is the day it
// shows and "+ Log carbs" (§2.5, 2026-10-20).
const dayLeads: Story['play'] = async ({ canvasElement }) => {
  const header = await expectTitleUnprinted(canvasElement, 'Day');
  const day = within(header).getByRole('button', { name: named(latest) });
  const words = document.createRange();
  words.selectNodeContents(day.firstChild!);
  await expect(Math.round(words.getBoundingClientRect().left)).toBe(Math.round(header.getBoundingClientRect().left));
};
export const DefaultPhone: Story = {
  ...story('phone', DEFAULT),
  play: async (context) => {
    await expectTabBarEnds(context.canvasElement);
    await dayLeads(context);
  },
};
export const DefaultDesktop: Story = { ...story('desktop', DEFAULT), play: dayLeads };
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
// marked): the logged-carbs day whose served findings name the most habits.
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

// A day whose read fails (#654): Unavailable with Retry in the chart's place,
// and no insulin bar. Retry reads the day again, and so does picking it again
// from the month.
const UNREAD = fixtures.overview.wearer.day_navigator.days
  .filter((d) => d.has_data && d.iso.startsWith(latest.slice(0, 7)) && !(d.iso in fixtures.day.days)).at(-1)!.iso;
const dayReads: string[] = [];
const refusedDay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(canvas.getByText('Unavailable')).toBeInTheDocument());
  await expect(dayReads).toEqual([UNREAD]);
  await expect(canvasElement.querySelector('.ui-skeleton')).toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(dayReads).toEqual([UNREAD, UNREAD]));
  await waitFor(() => expect(canvas.getByText('Unavailable')).toBeInTheDocument());
  await userEvent.click(canvas.getByRole('button', { name: named(UNREAD), expanded: false }));
  await userEvent.click(within(canvas.getByRole('dialog', { name: 'May' })).getByRole('button', { name: named(UNREAD) }));
  await waitFor(() => expect(dayReads).toEqual([UNREAD, UNREAD, UNREAD]));
};
const dayUnavailable = (layout: 'phone' | 'desktop'): Story => ({
  ...story(layout, { ...DEFAULT, day: UNREAD, onDay: async (iso) => { dayReads.push(iso); throw new Error('unavailable'); } }),
  beforeEach: () => { dayReads.length = 0; },
  play: refusedDay,
});
export const DayUnavailablePhone = dayUnavailable('phone');
export const DayUnavailableDesktop = dayUnavailable('desktop');

// A day whose read fails after the person has moved to another day is read
// once when picked again, not twice.
const lateRefusal: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: named(UNREAD), expanded: false }));
  await userEvent.click(within(canvas.getByRole('dialog', { name: 'May' })).getByRole('button', { name: named(latest) }));
  await waitFor(() => expect(dayReads.filter((iso) => iso === UNREAD)).toHaveLength(1));
  await new Promise((done) => { setTimeout(done, REFUSED_AFTER + 100); });
  await userEvent.click(canvas.getByRole('button', { name: named(latest), expanded: false }));
  await userEvent.click(within(canvas.getByRole('dialog', { name: 'May' })).getByRole('button', { name: named(UNREAD) }));
  await waitFor(() => expect(canvas.getByText('Unavailable')).toBeInTheDocument());
  await expect(dayReads.filter((iso) => iso === UNREAD)).toHaveLength(2);
};
const REFUSED_AFTER = 600;
const repickedDay = (layout: 'phone' | 'desktop'): Story => ({
  ...story(layout, { ...DEFAULT, day: UNREAD, onDay: async (iso) => {
    dayReads.push(iso);
    if (iso !== UNREAD) return;
    await new Promise((done) => { setTimeout(done, REFUSED_AFTER); });
    throw new Error('unavailable');
  } }),
  beforeEach: () => { dayReads.length = 0; },
  play: lateRefusal,
});
export const DayRepickedPhone = repickedDay('phone');
export const DayRepickedDesktop = repickedDay('desktop');

// Stale (§2.5, 2026-10-14): the last answers, kept on screen under Unavailable
// and Retry, when reading them again failed.
export const StalePhone = story('phone', { ...DEFAULT, state: 'stale' });
export const StaleDesktop = story('desktop', { ...DEFAULT, state: 'stale' });
export const MonthOpenPhone = story('phone', { ...DEFAULT, monthOpen: true });
export const MonthOpenDesktop = story('desktop', { ...DEFAULT, monthOpen: true });

export const PromptsPhone = story('phone', PROMPTS);
export const PromptsDesktop = story('desktop', PROMPTS);
export const PromptRecordedPhone = story('phone', { ...PROMPTS, recorded: true });
export const PromptRecordedDesktop = story('desktop', { ...PROMPTS, recorded: true });
export const PromptMidSwipePhone = story('phone', { ...PROMPTS, swiping: true });
export const PromptNotSavedPhone = story('phone', { ...PROMPTS, notSaved: true });
export const PromptNotSavedDesktop = story('desktop', { ...PROMPTS, notSaved: true });

/** Day's Prompts rows, in order: each row's label and count, as "Lows 1". */
const promptRows = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll<HTMLElement>('button')]
  .map((button) => /^(Lows|Rises)(\d+)$/.exec(button.textContent?.replace(/[▼▲›\s]+/g, '') ?? ''))
  .flatMap((row) => (row ? [`${row[1]} ${row[2]}`] : []));

// Rises (#529): the Rises row sits under the Lows row, each with its own
// count; the Day badge counts both.
const risesPlay: Story['play'] = async ({ canvasElement }) => {
  await expect(promptRows(canvasElement)).toEqual(['Lows 1', 'Rises 2']);
  await expect(canvasElement.querySelector('[aria-current="page"] .ui-badge')).toHaveTextContent('3');
};
export const RisesPhone: Story = { ...story('phone', RISES), play: risesPlay };
export const RisesDesktop: Story = { ...story('desktop', RISES), play: risesPlay };
export const RisesPromptsPhone = story('phone', RISE_PROMPTS);
export const RisesPromptsDesktop = story('desktop', RISE_PROMPTS);
export const RiseRecordedPhone = story('phone', { ...RISE_PROMPTS, recorded: true });
export const RiseRecordedDesktop = story('desktop', { ...RISE_PROMPTS, recorded: true });
export const RiseMidSwipePhone = story('phone', { ...RISE_PROMPTS, swiping: true });
// No rises: once both are answered the Rises row is gone, the Lows row stays.
const noRisesPlay: Story['play'] = async ({ canvasElement }) => {
  await expect(promptRows(canvasElement)).toEqual(['Lows 1']);
};
export const NoRisesPhone: Story = { ...story('phone', NO_RISES), play: noRisesPlay };
export const NoRisesDesktop: Story = { ...story('desktop', NO_RISES), play: noRisesPlay };

export const LogCarbsPhone = story('phone', { ...DEFAULT, logCarbs: 'empty' });
export const LogCarbsDesktop = story('desktop', { ...DEFAULT, logCarbs: 'empty' });
export const LogCarbsFilledPhone = story('phone', { ...DEFAULT, logCarbs: 'filled' });
export const LogCarbsFilledDesktop = story('desktop', { ...DEFAULT, logCarbs: 'filled' });
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

// The open month is never under the tab bar's badge: at the Day badge's
// centre is the month, where the month reaches it, or the scrim (#648).
const monthOverBarPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: named(latest), expanded: false }));
  const month = canvas.getByRole('dialog', { name: 'May' });
  await motionEnded();
  const box = canvasElement.querySelector<HTMLElement>('.ui-nav .ui-badge')!.getBoundingClientRect();
  const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  await expect(month.contains(hit) || hit!.matches('.ui-dayscreen__scrim')).toBe(true);
};
export const MonthOverTabBarPhone375x667: Story = {
  ...story('phone', DEFAULT), parameters: { frame: PHONES.se }, play: monthOverBarPlay,
};

// The Log carbs sheet covers the tab bar: a tap at Save's centre saves, at each
// phone size, and Save clears the home indicator (#648).
const tapCarbsSavePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), typed);
  const save = entry.getByRole('button', { name: 'Save' });
  await expectTappable(save);
  await expectClearsInset(save);
  await tapCentre(save);
  await expect(canvas.queryByRole('dialog')).toBeNull();
};
const tapCarbsSave = (frame: (typeof PHONES)[keyof typeof PHONES]): Story => ({
  ...story('phone', DEFAULT), parameters: { frame }, play: tapCarbsSavePlay,
});
export const TapLogCarbsSavePhone375x667: Story = tapCarbsSave(PHONES.se);
export const TapLogCarbsSavePhone375x812: Story = { ...tapCarbsSave(PHONES.x), decorators: [homeIndicator] };
export const TapLogCarbsSavePhone412x915: Story = tapCarbsSave(PHONES.pixel);

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

// On a short phone, or for a six-week month, the month ends above the tab bar
// with a strip of scrim a tap can find, and its weeks scroll inside it under
// its name and ‹ ›, which stay put (§2.3 ban 6's one exception, 2026-11-10,
// #649). It opens with the selected day's week in view; the strip closes it
// unchanged; every week scrolls into view, and a day in the last week of
// March, six weeks long, opens that day.
const STRIP = 44;
const monthEndsAbove = async (canvasElement: HTMLElement, month: HTMLElement) => {
  await motionEnded();
  // A frame taller than the browser's window is scrolled to its end, as a whole (expectTappable).
  const nav = canvasElement.querySelector<HTMLElement>('.ui-nav')!;
  window.scrollBy(0, Math.max(0, nav.getBoundingClientRect().bottom - window.innerHeight));
  const bar = nav.getBoundingClientRect();
  const panel = month.getBoundingClientRect();
  await expect(bar.top - panel.bottom).toBeGreaterThanOrEqual(STRIP);
  return { bar, panel };
};
const scrollsUnderItsName = async (month: HTMLElement) => {
  const weeks = month.querySelector<HTMLElement>('.ui-dayscreen__weeks')!;
  const name = within(month).getByRole('heading', { level: 2 });
  const at = name.getBoundingClientRect().top;
  weeks.scrollTop = weeks.scrollHeight;
  await new Promise(requestAnimationFrame);
  await expect(name.getBoundingClientRect().top).toBe(at);
  const [box, last] = [weeks.getBoundingClientRect(), weeks.lastElementChild!.getBoundingClientRect()];
  await expect(last.top).toBeGreaterThanOrEqual(box.top);
  await expect(last.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
};
const monthScrollsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await openMonth(canvas);
  const may = canvas.getByRole('dialog', { name: 'May' });
  const { bar, panel } = await monthEndsAbove(canvasElement, may);
  const weeks = may.querySelector('.ui-dayscreen__weeks')!.getBoundingClientRect();
  const selected = within(may).getByRole('button', { name: named(latest), pressed: true }).getBoundingClientRect();
  await expect(selected.top).toBeGreaterThanOrEqual(weeks.top);
  await expect(selected.bottom).toBeLessThanOrEqual(weeks.bottom + 0.5);
  await scrollsUnderItsName(may);
  const strip = document.elementFromPoint(panel.left + panel.width / 2, (panel.bottom + bar.top) / 2)!;
  await expect(strip.matches('.ui-dayscreen__scrim')).toBe(true);
  await userEvent.click(strip);
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(headerDay(canvas)).toHaveTextContent(printed(latest));
  await userEvent.click((await openMonth(canvas)).getByRole('button', { name: 'Previous' }));
  await userEvent.click(within(await canvas.findByRole('dialog', { name: 'Apr' })).getByRole('button', { name: 'Previous' }));
  const march = await canvas.findByRole('dialog', { name: 'Mar' });
  const last = await within(march).findByRole('button', { name: named('2025-03-31') });
  await monthEndsAbove(canvasElement, march);
  await expect(march.querySelectorAll('.ui-dayscreen__weeks > *')).toHaveLength(6);
  await scrollsUnderItsName(march);
  await tapCentre(last);
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(headerDay(canvas)).toHaveTextContent(printed('2025-03-31'));
};
const monthScrolls = (frame: (typeof PHONES)[keyof typeof PHONES]): Story => ({
  ...steppable('phone'), parameters: { frame }, play: monthScrollsPlay,
});
export const MonthScrollsPhone375x667: Story = monthScrolls(PHONES.se);
export const MonthScrollsPhone375x812: Story = { ...monthScrolls(PHONES.x), decorators: [homeIndicator] };
export const MonthScrollsPhone412x915: Story = monthScrolls(PHONES.pixel);

// By keys, the scrolling weeks are no stop of their own: Tab goes from ‹ › to
// the days, each scrolled into view as it takes focus, and Escape closes the
// month and gives focus back to the header's day.
export const MonthKeysPhone375x667: Story = {
  ...story('phone', DEFAULT), parameters: { frame: PHONES.se },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const may = await openMonth(canvas);
    const weeks = canvasElement.querySelector<HTMLElement>('.ui-dayscreen__weeks')!;
    await motionEnded();
    weeks.scrollTop = 0;
    const day = may.getByRole('button', { name: named(latest) });
    for (let tab = 0; tab < 40 && document.activeElement !== day; tab += 1) {
      await userEvent.tab();
      await expect(document.activeElement).not.toBe(weeks);
    }
    await expect(day).toHaveFocus();
    const [box, at] = [weeks.getBoundingClientRect(), day.getBoundingClientRect()];
    await expect(at.top).toBeGreaterThanOrEqual(box.top);
    await expect(at.bottom).toBeLessThanOrEqual(box.bottom + 0.5);
    await userEvent.keyboard('{Escape}');
    await expect(canvas.queryByRole('dialog')).toBeNull();
    await expect(canvas.getByRole('button', { name: named(latest), expanded: false })).toHaveFocus();
  },
};

const typed = formatValue(loggedGrams().value, loggedGrams().format);
const openCarbs = async (canvas: ReturnType<typeof within>) => {
  await userEvent.click(canvas.getByRole('button', { name: '+ Log carbs' }));
  return within(canvas.getByRole('dialog', { name: 'Log carbs' }));
};

// Log carbs: the grams field has the focus as it opens and takes digits only,
// and Save waits for an amount above zero; type an amount the wearer logged,
// Save, and it closes at once.
const savePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  const save = entry.getByRole('button', { name: 'Save' });
  const field = entry.getByRole('textbox', { name: 'Carbs' });
  await expect(save).toBeDisabled();
  await expect(field).toHaveFocus();
  await userEvent.keyboard('ab');
  await expect(field).toHaveValue('');
  await userEvent.keyboard('0');
  await expect(field).toHaveValue('0');
  await expect(save).toBeDisabled();
  await userEvent.clear(field);
  await userEvent.type(field, typed);
  await userEvent.click(save);
  await expect(canvas.queryByRole('dialog')).toBeNull();
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

// A save that fails closes the entry all the same, and the bar reads Not
// saved, with Retry; Retry saves it.
const retryCarbsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
  await expect(canvas.queryByRole('dialog')).toBeNull();
  await expect(canvas.getByRole('status')).toHaveTextContent('Not saved');
  await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
};
export const LogCarbsRetryPhone: Story = { ...story('phone', { ...DEFAULT, failing: true }), play: retryCarbsPlay };
export const LogCarbsRetryDesktop: Story = { ...story('desktop', { ...DEFAULT, failing: true }), play: retryCarbsPlay };

const place = (canvas: ReturnType<typeof within>, title = 'Lows') =>
  canvas.getByRole('heading', { level: 1, name: title }).parentElement as HTMLElement;

// The Prompts row drills in to "1 / 2"; Yes records it (Recorded, the grams
// field, Next); Next shows "2 / 2"; ‹ Day returns, the row counting one.
const promptsPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await expect(place(canvas)).toHaveTextContent('1 / 2');
  await userEvent.click(canvas.getByRole('button', { name: /Yes/ }));
  const yes = canvas.getByRole('button', { name: /Yes/ });
  await expect(yes).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas.getByRole('status')).toHaveTextContent('Recorded');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(within(canvasElement.querySelector<HTMLElement>('.ui-prompt')!).getByRole('button', { name: 'Next' }));
  await expect(place(canvas)).toHaveTextContent('2 / 2');
  await expectTitlePrinted(canvasElement, 'Lows');
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
  // The bar's status, beside the Prompt's own (its Recorded, #582).
  const bar = () => canvas.queryAllByRole('status').find((region) => region.closest('.ui-dayscreen__bar')) ?? null;
  await expect(bar()).toHaveTextContent('Not saved');
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(within(bar()!).getByRole('button', { name: 'Retry' }));
  await expect(bar()).toBeNull();
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
// Phone: the swipe is Not sure's shortcut, by the row's rule (ADR 613). A
// press that moves down first, and a slow drag short of half the card's
// width, record nothing, and the drag never fills the reveal; a slow drag
// past half fills it before the finger lifts, records Not sure and moves to
// the next prompt, and so does a flick short of half.
/** The card's reveal filled: marked so, and drawn in the accent. */
const promptFilled = (card: HTMLElement) => {
  const reveal = card.parentElement!.querySelector<HTMLElement>('.ui-prompt-swipe__reveal');
  if (!card.parentElement!.classList.contains('ui-prompt-swipe--filled') || !reveal) return false;
  const probe = document.createElement('i');
  probe.style.color = 'var(--primary)';
  reveal.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  return getComputedStyle(reveal).color === accent;
};
/** Whether the card's reveal is ever filled from now until the returned read. */
const promptEverFilled = (card: HTMLElement) => {
  let seen = false;
  const watch = new MutationObserver((changes) => {
    seen ||= card.parentElement!.classList.contains('ui-prompt-swipe--filled')
      || changes.some((change) => change.oldValue?.includes('ui-prompt-swipe--filled'));
  });
  watch.observe(card.parentElement!, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  return () => { watch.disconnect(); return seen; };
};
export const PromptSwipePhone: Story = {
  ...story('phone', PROMPTS),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const card = () => canvasElement.querySelector<HTMLElement>('.ui-prompt')!;
    await scrollThenSwipe(card(), -240);
    await expect(place(canvas)).toHaveTextContent('1 / 2');
    const filledEver = promptEverFilled(card());
    await swipe(card(), -120, 16, 'slow');
    await expect(place(canvas)).toHaveTextContent('1 / 2');
    await expect(filledEver()).toBe(false);
    await expect(120).toBeLessThan(card().getBoundingClientRect().width / 2);
    let filledAtRelease: boolean | null = null;
    card().addEventListener('pointerup', (event) => {
      filledAtRelease = promptFilled(event.currentTarget as HTMLElement);
    }, { once: true });
    await swipe(card(), -240, 16, 'slow');
    await expect(filledAtRelease).toBe(true);
    await expect(place(canvas)).toHaveTextContent('2 / 2');
    await waitFor(() => expect(canvasElement.querySelector('.ui-prompt-swipe__reveal')).toBeNull());
    await swipe(card(), -120, 4, 'flick');
    await expect(canvas.getByRole('heading', { level: 1, name: 'Day' })).toBeInTheDocument();
    // The Prompts' swipe is the card's: the day is the one Day showed.
    await expect(headerDay(canvas)).toHaveTextContent(printed(latest));
  },
};
// Phone: a drag past half held there, the finger still down: the reveal filled
// with the accent's tint (§2.5, 2026-10-23), nothing recorded yet.
export const PromptSwipeFilledPhone: Story = {
  ...story('phone', PROMPTS),
  play: async ({ canvasElement }) => {
    const card = canvasElement.querySelector<HTMLElement>('.ui-prompt')!;
    await hold(card, -240, 16);
    await expect(promptFilled(card)).toBe(true);
    await expect(place(within(canvasElement))).toHaveTextContent('1 / 2');
  },
};
// The Rises row drills in to "1 / 2", answered Yes · No and Not sure with no
// False low; No shows "2 / 2"; Yes records it; Next returns to Day, where the
// Rises row is gone and the Lows row still counts one.
const risesFlowPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Rises/ }));
  await expect(place(canvas, 'Rises')).toHaveTextContent('1 / 2');
  await expect(canvas.queryByRole('button', { name: 'False low' })).toBeNull();
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await expect(place(canvas, 'Rises')).toHaveTextContent('2 / 2');
  await userEvent.click(canvas.getByRole('button', { name: /Yes/ }));
  await expect(canvas.getByRole('button', { name: /Yes/ })).toHaveAttribute('aria-pressed', 'true');
  await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), typed);
  await userEvent.click(within(canvasElement.querySelector<HTMLElement>('.ui-prompt')!).getByRole('button', { name: 'Next' }));
  await expect(canvas.getByRole('heading', { level: 1, name: 'Day' })).toBeInTheDocument();
  await expect(promptRows(canvasElement)).toEqual(['Lows 1']);
};
export const RisesFlowPhone: Story = { ...story('phone', RISES), play: risesFlowPlay };
export const RisesFlowDesktop: Story = { ...story('desktop', RISES), play: risesFlowPlay };

// Phone: swiping the Day body steps to the adjacent day with data (§2.5,
// 2026-10-23, Day swipe; ADR 619). The body follows the finger with that day
// beside it; past half its width, or a flick of 48 px, it steps, and the
// header, the chart and the insulin bar are that day's (its skeleton where its
// timeline is not served); otherwise it eases back. The latest day is
// resisted. An edge press, a press that scrolls first, a pointer cancel and
// the desktop never move it.
const body = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('.ui-dayscreen__body')!;
const track = (canvasElement: HTMLElement) => canvasElement.querySelector<HTMLElement>('.ui-dayscreen__track');
/** How far the track sits from rest, px (left is negative). */
const offset = (canvasElement: HTMLElement) =>
  track(canvasElement)!.getBoundingClientRect().left - body(canvasElement).getBoundingClientRect().left
    - (parseFloat(getComputedStyle(track(canvasElement)!).marginLeft) || 0);
/** Every translate the body's elements are given from now until the returned read. */
const translated = (canvasElement: HTMLElement) => {
  const seen: string[] = [];
  const watch = new MutationObserver((changes) => {
    for (const change of changes) {
      const moved = (change.target as HTMLElement).style.translate;
      if (moved) seen.push(moved);
    }
  });
  watch.observe(body(canvasElement), { attributes: true, attributeFilter: ['style'], subtree: true });
  return () => { watch.disconnect(); return seen; };
};
/** The finger lifted where `hold` left it. */
const lift = (target: HTMLElement, dx: number) => {
  const box = target.getBoundingClientRect();
  target.dispatchEvent(new PointerEvent('pointerup', {
    bubbles: true, pointerId: 1, pointerType: 'touch', isPrimary: true,
    clientX: box.left + box.width * 0.7 + dx, clientY: box.top + box.height / 2,
  }));
};
/** The header, the chart and the insulin bar all name `iso`: the chart and bar
 *  draw its served timeline, or, where none is served, the chart's skeleton and no bar. */
const showsDay = async (canvasElement: HTMLElement, iso: string) => {
  const canvas = within(canvasElement);
  await waitFor(() => expect(headerDay(canvas)).toHaveTextContent(printed(iso)));
  const sources = [...track(canvasElement)!.querySelectorAll('[data-source^="day.days."]')]
    .map((element) => element.getAttribute('data-source')!);
  await expect(sources.every((source) => source.startsWith(`day.days.${iso}.`))).toBe(true);
  if ((fixtures.day.days as Record<string, unknown>)[iso]) {
    await expect(sources.some((source) => source.startsWith(`day.days.${iso}.timeline.insulin_totals`))).toBe(true);
    await expect(track(canvasElement)!.querySelector('.ui-daychart')).not.toBeNull();
  } else {
    await expect(sources).toEqual([]);
    await expect(track(canvasElement)!.querySelector('.ui-skeleton')).not.toBeNull();
  }
};
/** The track's offset on every frame from the one the header first names `iso`
 *  until 600 ms on: after a step the day is already where it rests, so none is off rest. */
const afterStep = (canvasElement: HTMLElement, iso: string) => new Promise<number[]>((done) => {
  const frames: number[] = [];
  let since: number | null = null;
  const sample = (now: number) => {
    if (since === null && headerDay(within(canvasElement)).textContent?.includes(printed(iso))) since = now;
    if (since !== null) frames.push(offset(canvasElement));
    if (since !== null && now - since > 600) done(frames);
    else requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
/** Until the last gesture has come to rest: the neighbour is drawn until its
 *  slide or ease-back has ended, and presses are ignored until then. */
const settled = (canvasElement: HTMLElement) =>
  waitFor(() => expect(canvasElement.querySelector('.ui-dayscreen__neighbour')).toBeNull());
const atRest = (canvasElement: HTMLElement) => waitFor(() => expect(Math.abs(offset(canvasElement))).toBeLessThan(0.5));
/** Nothing moves and the header still names `iso`. */
const unmoved = async (canvasElement: HTMLElement, iso: string, gesture: () => Promise<void>) => {
  const seen = translated(canvasElement);
  await gesture();
  await expect(seen()).toEqual([]);
  await expect(headerDay(within(canvasElement))).toHaveTextContent(printed(iso));
};

// Left past half: the next day comes in from the right while the finger is
// down, and it is the day the header then names, its chart and bar drawn.
export const SwipeNextPhone: Story = {
  ...story('phone', { ...DEFAULT, day: '2025-05-24' }),
  play: async ({ canvasElement }) => {
    await hold(body(canvasElement), -240, 16);
    await expect(offset(canvasElement)).toBeCloseTo(-240, 0);
    const coming = canvasElement.querySelector('.ui-dayscreen__neighbour');
    await expect(coming?.querySelector(`[data-source^="day.days.${latest}.timeline.insulin_totals"]`)).not.toBeNull();
    const stepped = afterStep(canvasElement, latest);
    lift(body(canvasElement), -240);
    await showsDay(canvasElement, latest);
    await expect((await stepped).filter((at) => Math.abs(at) >= 0.5)).toEqual([]);
    await atRest(canvasElement);
    await expect(canvasElement.querySelector('.ui-dayscreen__neighbour')).toBeNull();
  },
};
// Right past half: the previous day, whose timeline is not served, so its
// chart is the skeleton and it has no insulin bar.
export const SwipePreviousPhone: Story = {
  ...story('phone', DEFAULT),
  play: async ({ canvasElement }) => {
    const stepped = afterStep(canvasElement, '2025-05-24');
    await swipe(body(canvasElement), 240, 16);
    await showsDay(canvasElement, '2025-05-24');
    await expect((await stepped).filter((at) => Math.abs(at) >= 0.5)).toEqual([]);
  },
};
// Across a month inside the served weeks: 1 May steps back to 30 April.
export const SwipeMonthPhone: Story = {
  ...story('phone', { ...DEFAULT, day: '2025-05-01' }),
  play: async ({ canvasElement }) => {
    await swipe(body(canvasElement), 240, 16);
    await showsDay(canvasElement, '2025-04-30');
  },
};
// 24 April is the served weeks' first day: opening it reads April through the
// month reader, and the swipe steps to 23 April.
const readAhead: string[] = [];
const readingApril = (() => {
  const months = monthReader();
  return {
    ...story('phone', { ...DEFAULT, day: '2025-04-24',
      readMonth: (month: string) => { readAhead.push(month); return months.readMonth(month); } }),
    beforeEach: () => { readAhead.length = 0; return months.cleanup; },
  };
})();
export const SwipeReadMonthPhone: Story = {
  ...readingApril,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(readAhead).toEqual(['2025-04']));
    await swipe(body(canvasElement), 240, 16);
    await showsDay(canvasElement, '2025-04-23');
    await expect(readAhead).toEqual(['2025-04']);
  },
};
// The latest day: left is resisted, the body moving less than the finger, and
// it eases back to the same day.
export const SwipeLastDayPhone: Story = {
  ...story('phone', DEFAULT),
  play: async ({ canvasElement }) => {
    await hold(body(canvasElement), -240, 16);
    await expect(offset(canvasElement)).toBeLessThan(-1);
    await expect(offset(canvasElement)).toBeGreaterThan(-120);
    lift(body(canvasElement), -240);
    await atRest(canvasElement);
    await expect(headerDay(within(canvasElement))).toHaveTextContent(printed(latest));
  },
};
// A slow drag short of half eases back on the same day.
export const SwipeShortPhone: Story = {
  ...story('phone', { ...DEFAULT, day: siteDay }),
  play: async ({ canvasElement }) => {
    const seen = translated(canvasElement);
    await swipe(body(canvasElement), -120, 16, 'slow');
    await expect(seen().length).toBeGreaterThan(0);
    await atRest(canvasElement);
    await expect(headerDay(within(canvasElement))).toHaveTextContent(printed(siteDay));
  },
};
// A flick of 40 px is short of the flick's minimum and eases back; one of 80 px
// steps to the previous day.
export const SwipeFlickPhone: Story = {
  ...story('phone', DEFAULT),
  play: async ({ canvasElement }) => {
    await swipe(body(canvasElement), 40, 4, 'flick');
    await atRest(canvasElement);
    await settled(canvasElement);
    await expect(headerDay(within(canvasElement))).toHaveTextContent(printed(latest));
    await swipe(body(canvasElement), 80, 4, 'flick');
    await showsDay(canvasElement, '2025-05-24');
  },
};
// A press within 24 px of either screen edge is the platform's back gesture.
export const SwipeEdgePhone: Story = {
  ...story('phone', { ...DEFAULT, day: siteDay }),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.ui-dayscreen')!.getBoundingClientRect();
    const box = body(canvasElement).getBoundingClientRect();
    const left = 0.02;
    const right = 0.98;
    await expect(box.left + box.width * left - root.left).toBeLessThan(24);
    await expect(root.right - (box.left + box.width * right)).toBeLessThan(24);
    await unmoved(canvasElement, siteDay, () => swipe(body(canvasElement), 240, 16, 'slow', left));
    await unmoved(canvasElement, siteDay, () => swipe(body(canvasElement), -240, 16, 'slow', right));
    // Just inside the band, the same swipe steps.
    await expect(box.left + box.width * 0.1 - root.left).toBeGreaterThan(24);
    await swipe(body(canvasElement), 240, 16, 'slow', 0.1);
    await showsDay(canvasElement, '2025-05-22');
  },
};
// A press that moves down first is the page's scroll.
export const SwipeScrollPhone: Story = {
  ...story('phone', { ...DEFAULT, day: siteDay }),
  play: async ({ canvasElement }) => {
    await unmoved(canvasElement, siteDay, () => scrollThenSwipe(body(canvasElement), -240));
  },
};
// The system taking the gesture eases back and never steps.
export const SwipeCancelPhone: Story = {
  ...story('phone', { ...DEFAULT, day: siteDay }),
  play: async ({ canvasElement }) => {
    await swipe(body(canvasElement), -240, 16, 'cancel');
    await atRest(canvasElement);
    await expect(headerDay(within(canvasElement))).toHaveTextContent(printed(siteDay));
  },
};
// Reduced motion: the body follows the finger, and from the first frame after
// it lifts the track is at rest and stays there while the day changes in place.
const reduced: Story['decorators'] = [(Story) => <div data-motion-reduce="" style={{ height: '100%' }}><Story /></div>];
export const SwipeReducedPhone: Story = {
  ...story('phone', { ...DEFAULT, day: '2025-05-24' }),
  decorators: reduced,
  play: async ({ canvasElement }) => {
    const frames: number[] = [];
    body(canvasElement).addEventListener('pointerup', () => {
      const started = performance.now();
      const sample = () => {
        frames.push(offset(canvasElement));
        if (performance.now() - started < 400) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }, { once: true });
    await swipe(body(canvasElement), -240, 16);
    await showsDay(canvasElement, latest);
    await waitFor(() => expect(frames.length).toBeGreaterThan(10), { timeout: 2000 });
    await expect(frames.filter((at) => Math.abs(at) >= 0.5)).toEqual([]);
  },
};
// Desktop has no swipe: the same drag moves nothing.
export const SwipeDesktop: Story = {
  ...story('desktop', { ...DEFAULT, day: siteDay }),
  play: async ({ canvasElement }) => {
    await unmoved(canvasElement, siteDay, () => swipe(body(canvasElement), -240, 16));
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

/** The live adapter's held answers (#677) over `send`: each held from when it is made until the engine
 *  answers it, and a refused one, with its prompt, until it is sent again. */
const heldAnswers = (send: DayWrites['answer']): Pick<DayWrites, 'answer' | 'held'> => {
  const answering = new Set<string>();
  let refused: ReturnType<DayWrites['held']>['refused'] = [];
  return {
    answer: async (prompt, given) => {
      refused = refused.filter((r) => r.prompt.anchorT !== prompt.anchorT);
      answering.add(prompt.anchorT);
      try {
        return await send(prompt, given);
      } catch (error) {
        refused = [...refused, { prompt, answer: given }];
        throw error;
      } finally {
        answering.delete(prompt.anchorT);
      }
    },
    held: () => ({ answering: new Set(answering), refused }),
  };
};

// Live (#495): a Yes the engine does not save takes its check back, with
// "Not saved", and Retry records it; then Next.
const liveAnswerPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'Yes' }));
  await waitFor(() => expect(canvas.getByText(/Not saved/).closest('[role="status"]')).toBeInTheDocument());
  await expect(canvas.getByRole('button', { name: 'Yes', pressed: false })).toBeInTheDocument();
  await userEvent.click(canvas.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(canvas.queryByText(/Not saved/)).toBeNull());
  await expect(canvas.getByRole('button', { name: /Yes/, pressed: true })).toBeInTheDocument();
};
const liveDay = (): DayScreenProps['writes'] => ({
  ...heldAnswers(failsOnce({ carbEntryId: null })), grams: failsOnce(undefined), logCarbs: failsOnce(undefined),
});
export const LiveAnswerNotSavedPhone: Story = { ...story('phone', { store: 'wearer', writes: liveDay() }), play: liveAnswerPlay };
export const LiveAnswerNotSavedDesktop: Story = { ...story('desktop', { store: 'wearer', writes: liveDay() }), play: liveAnswerPlay };

// Live (#529): a Rise's No is posted as that rise's answer, the first of the
// Rises in served order, and the card moves on at once.
const answered: [string, string, string][] = [];
const liveRises = (): DayScreenProps['writes'] => ({
  ...heldAnswers(async (prompt, given) => { answered.push([prompt.detector, prompt.anchorT, given]); return { carbEntryId: null }; }),
  grams: async () => undefined, logCarbs: async () => undefined,
});
const liveRisePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  answered.length = 0;
  await userEvent.click(canvas.getByRole('button', { name: /Rises/ }));
  await expect(place(canvas, 'Rises')).toHaveTextContent('1 / 2');
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  const first = (fixtures.day.prompts['rises-pending'] as { detector: string; anchor_t: string; answer: string | null }[])
    .find((p) => p.detector === 'missed-meal' && p.answer === null)!;
  await expect(answered).toEqual([['missed-meal', first.anchor_t, 'no']]);
};
export const LiveRiseAnswerPhone: Story = { ...story('phone', { ...RISES, writes: liveRises() }), play: liveRisePlay };
export const LiveRiseAnswerDesktop: Story = { ...story('desktop', { ...RISES, writes: liveRises() }), play: liveRisePlay };

// A write draws its written state the moment it is made, before the engine
// answers (ADR 630). Each fake answers only when the play releases it, and every
// play releases it before it ends, so the story check reads served fields.
/** An engine that answers each call only once the play releases it, in turn: saved, or refused.
 *  It records what each call was sent. Released, it resolves once every answer has run. */
const answersLate = <A extends unknown[], R>(saved: R) => {
  const sent: A[] = [];
  const waiting: ((saved: boolean) => void)[] = [];
  return {
    sent,
    send: async (...args: A): Promise<R> => {
      sent.push(args);
      if (!(await new Promise<boolean>((answer) => { waiting.push(answer); }))) throw new Error('not saved');
      return saved;
    },
    release: async (saves = true) => {
      waiting.shift()!(saves);
      await new Promise((done) => { setTimeout(done); });
    },
    reset: () => { sent.length = 0; waiting.length = 0; },
  };
};
type Late = { sent: readonly unknown[]; release: (saves?: boolean) => Promise<void> };

/** The Day screen over the engine's late answers: once a Prompt answer saves,
 *  the Prompts store served after it (`after`, or the next of them for each
 *  answer saved), as the live adapter reads the engine again before a write
 *  resolves; and, with `unlogged`, the logged-carbs day served without its
 *  entry until a Log carbs save saves, then as generated. */
function LiveDay({ after, unlogged = false, ...props }: DayScreenProps & {
  after?: PromptStore | readonly PromptStore[]; unlogged?: boolean;
}) {
  const [store, setStore] = useState(props.store);
  const [logged, setLogged] = useState(!unlogged);
  const saves = useRef(0);
  const served = after === undefined ? [] : ([] as PromptStore[]).concat(after);
  const writes: DayWrites = {
    ...props.writes!,
    answer: async (prompt, given) => {
      const saved = await props.writes!.answer(prompt, given);
      const next = served[Math.min(saves.current, served.length - 1)];
      saves.current += 1;
      if (next) setStore(next);
      return saved;
    },
    logCarbs: async (grams, at) => {
      await props.writes!.logCarbs(grams, at);
      setLogged(true);
    },
  };
  return <BeforeFirstLog unlogged={!logged}><DayScreen {...props} store={store} writes={writes} /></BeforeFirstLog>;
}
const liveStory = (layout: 'phone' | 'desktop', args: Omit<DayScreenProps, 'layout'>,
  extra: { after?: PromptStore | readonly PromptStore[]; unlogged?: boolean }, lates: { reset: () => void }[], play: Story['play']): Story => ({
  ...story(layout, args),
  render: (props) => <LiveDay {...props} {...extra} />,
  beforeEach: () => { for (const late of lates) late.reset(); },
  play,
});
/** The Day badge's count, as the selected tab prints it. */
const badgeCount = (canvasElement: HTMLElement) =>
  Number(canvasElement.querySelector('[aria-current="page"] .ui-badge')?.textContent ?? 0);
const lowsCount = (canvasElement: HTMLElement) => {
  const row = promptRows(canvasElement).find((r) => r.startsWith('Lows'));
  return row ? Number(row.slice(5)) : 0;
};
const backToDay = (canvas: ReturnType<typeof within>, title = 'Lows') =>
  userEvent.click(within(canvas.getByRole('heading', { level: 1, name: title }).closest('header') as HTMLElement)
    .getByRole('button', { name: 'Day' }));

/** Live writes whose answers are `answer`'s, every other write saved at once. */
const answering = (answer: DayWrites['answer']): DayWrites => ({
  ...heldAnswers(answer), grams: async () => undefined, logCarbs: async () => undefined,
});

// A Prompt answer: the Day badge and the Lows count are one less at once, the
// card moves on, and once the engine saves it (the Prompts read after it) both
// read the same.
const lateAnswerPlay = (late: Late): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const before = { badge: badgeCount(canvasElement), lows: lowsCount(canvasElement) };
  await expect(before).toEqual({ badge: 2, lows: 2 });
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await expect(place(canvas)).toHaveTextContent('2 / 2');
  await expect(badgeCount(canvasElement)).toBe(1);
  await backToDay(canvas);
  await expect({ badge: badgeCount(canvasElement), lows: lowsCount(canvasElement) }).toEqual({ badge: 1, lows: 1 });
  await late.release();
  await expect({ badge: badgeCount(canvasElement), lows: lowsCount(canvasElement) }).toEqual({ badge: 1, lows: 1 });
  await expect(late.sent).toHaveLength(1);
};
const lateAnswer = (layout: 'phone' | 'desktop'): Story => {
  const late = answersLate<[PromptData, Answer], { carbEntryId: number | null }>({ carbEntryId: null });
  return liveStory(layout, { store: 'wearer-pending', writes: answering(late.send) }, { after: 'wearer' }, [late],
    lateAnswerPlay(late));
};
export const LateAnswerPhone = lateAnswer('phone');
export const LateAnswerDesktop = lateAnswer('desktop');

// A Yes: the badge is one less while its write is in flight, and stays one
// less, not two, once it saves with the card still open for its grams.
const lateYesPlay = (late: Late): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'Yes' }));
  await expect(canvas.getByRole('button', { name: /Yes/, pressed: true })).toBeInTheDocument();
  await expect(badgeCount(canvasElement)).toBe(1);
  await late.release();
  await expect(canvas.getByRole('button', { name: /Yes/, pressed: true })).toBeInTheDocument();
  await expect(badgeCount(canvasElement)).toBe(1);
};
const lateYes = (layout: 'phone' | 'desktop'): Story => {
  const late = answersLate<[PromptData, Answer], { carbEntryId: number | null }>({ carbEntryId: null });
  return liveStory(layout, { store: 'wearer-pending', writes: answering(late.send) }, { after: 'wearer' }, [late],
    lateYesPlay(late));
};
export const LateYesPhone = lateYes('phone');
export const LateYesDesktop = lateYes('desktop');

// Answered row after row while the engine has answered none (#677): Back out of
// the Lows with the first in flight, and the Lows open on the other low, never
// the one being saved; its answer, the last, returns to Day at once, with no
// Lows row and no badge. Both were sent, one each. The engine saves the first
// and refuses the second: its low is back in the count, and the bar on Day reads
// "Not saved"; Retry sends it again, and once it saves the bar leaves.
const answersOf = (late: Late) => late.sent.map((args) => (args as [PromptData, Answer])[0].anchorT);
const counted = (canvasElement: HTMLElement) => ({ badge: badgeCount(canvasElement), lows: lowsCount(canvasElement) });
const burstPlay = (late: Late): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await expect(place(canvas)).toHaveTextContent('2 / 2');
  await backToDay(canvas);
  await expect(counted(canvasElement)).toEqual({ badge: 1, lows: 1 });
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await waitFor(() => expect(canvas.queryByRole('heading', { level: 1, name: 'Lows' })).toBeNull());
  await expect(counted(canvasElement)).toEqual({ badge: 0, lows: 0 });
  await expect(new Set(answersOf(late)).size).toBe(2);
  await late.release();
  await expect(counted(canvasElement)).toEqual({ badge: 0, lows: 0 });
  await late.release(false);
  await waitFor(() => expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/));
  await expect(counted(canvasElement)).toEqual({ badge: 1, lows: 1 });
  await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Retry' }));
  await expect(answersOf(late)).toEqual([...answersOf(late).slice(0, 2), answersOf(late)[1]]);
  await expect(counted(canvasElement)).toEqual({ badge: 0, lows: 0 });
  await late.release();
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
  await expect(counted(canvasElement)).toEqual({ badge: 0, lows: 0 });
};
const burst = (layout: 'phone' | 'desktop'): Story => {
  const late = answersLate<[PromptData, Answer], { carbEntryId: number | null }>({ carbEntryId: null });
  return liveStory(layout, { store: 'wearer-pending', writes: answering(late.send) },
    { after: ['wearer', 'wearer-answered'] }, [late], burstPlay(late));
};
export const AnswerBurstPhone = burst('phone');
export const AnswerBurstDesktop = burst('desktop');

// The Lows through the router's history entry (ADR 594): the platform's Back
// returns to Day and Forward reopens them (#669); answering the last low leaves
// them through the router (#677), as a Forward onto them with none left does.
const routed = (at?: DayDrillDown, next?: DayDrillDown) => ({ drillDown: historyRouter<DayDrillDown>(at, next) });
const routerOf = (args: DayScreenProps) => args.nav!.drillDown as ReturnType<typeof historyRouter<DayDrillDown>>;
const routedLowsPlay: Story['play'] = async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  const router = routerOf(args);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await expect(router.open).toHaveBeenCalledWith({ view: 'prompts', kind: 'low' });
  router.close();
  await waitFor(() => expect(canvas.queryByRole('heading', { level: 1, name: 'Lows' })).toBeNull());
  router.forward();
  await canvas.findByRole('heading', { level: 1, name: 'Lows' });
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  await waitFor(() => expect(router.close).toHaveBeenCalledTimes(2));
  await expect(canvas.queryByRole('heading', { level: 1, name: 'Lows' })).toBeNull();
  await expect(counted(canvasElement)).toEqual({ badge: 0, lows: 0 });
};
const routedLows = (layout: 'phone' | 'desktop'): Story => liveStory(layout, {
  store: 'wearer-pending', writes: answering(async () => ({ carbEntryId: null })), nav: routed(),
}, { after: ['wearer', 'wearer-answered'] }, [], routedLowsPlay);
export const RoutedLowsPhone = routedLows('phone');
export const RoutedLowsDesktop = routedLows('desktop');
export const ForwardLowsEmpty: Story = {
  ...story('phone', { store: 'wearer-answered', writes: answering(async () => ({ carbEntryId: null })),
    nav: routed(undefined, { view: 'prompts', kind: 'low' }) }),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    routerOf(args).forward();
    await waitFor(() => expect(routerOf(args).close).toHaveBeenCalledOnce());
    await expect(canvas.queryByRole('heading', { level: 1, name: 'Lows' })).toBeNull();
  },
};

// Log carbs, on the logged-carbs day as served before its entry was logged,
// the story's clock at that entry's time: Save of its grams closes the entry
// and draws its mark at once; once the engine saves it (the day served with
// the entry), the mark reads the same.
const LOGGED = (fixtures.day.days as Record<string, { carbs: { carb_entries: { t: string; grams: number }[] } }>)[withCarbs]
  .carbs.carb_entries[0];
const LOG_CLOCK = LOGGED.t.slice(0, 16);
const LOG_TIME = LOGGED.t.slice(11, 16);
const LOG_GRAMS = formatValue(LOGGED.grams, 'round');
/** The day's logged-carbs rows, each its time, its grams and whether they are a held entry's. */
const loggedRows = (canvasElement: HTMLElement) => [...canvasElement.querySelectorAll('.ui-daychart__event')]
  .flatMap((row) => {
    const grams = row.querySelector<HTMLElement>('.ui-daychart__grams [data-source]');
    const source = grams?.dataset.source ?? '';
    return source.includes('carb_entries') || source.startsWith('held.')
      ? [{ time: row.querySelector('.ui-daychart__time')!.textContent, grams: grams!.textContent, held: source.startsWith('held.') }]
      : [];
  });
/** The most logged-carbs rows drawn at once, from now until the returned read. */
const mostMarks = (canvasElement: HTMLElement) => {
  let most = loggedRows(canvasElement).length;
  const watch = new MutationObserver(() => { most = Math.max(most, loggedRows(canvasElement).length); });
  watch.observe(canvasElement, { childList: true, subtree: true, characterData: true, attributes: true });
  return () => { watch.disconnect(); return most; };
};
const saveCarbs = async (canvas: ReturnType<typeof within>) => {
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), LOG_GRAMS);
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
};
const lateLogPlay = (late: Late): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(loggedRows(canvasElement)).toEqual([]);
  await saveCarbs(canvas);
  await expect(canvas.queryByRole('dialog', { name: 'Log carbs' })).toBeNull();
  await expect(loggedRows(canvasElement)).toEqual([{ time: LOG_TIME, grams: LOG_GRAMS, held: true }]);
  await expect(late.sent).toEqual([[LOGGED.grams, LOG_CLOCK]]);
  // The served mark replaces the held one in one draw: never both.
  const most = mostMarks(canvasElement);
  await late.release();
  await expect(loggedRows(canvasElement)).toEqual([{ time: LOG_TIME, grams: LOG_GRAMS, held: false }]);
  await expect(most()).toBe(1);
};
type LateLog = Late & { send: DayWrites['logCarbs']; reset: () => void };
const logStory = (layout: 'phone' | 'desktop', late: LateLog, play: Story['play']) => liveStory(layout, {
  store: 'wearer', day: withCarbs, now: () => LOG_CLOCK,
  writes: { ...answering(async () => ({ carbEntryId: null })), logCarbs: late.send },
}, { unlogged: true }, [late], play);
const lateLog = (layout: 'phone' | 'desktop') => {
  const late = answersLate<[number, string | undefined], void>(undefined);
  return logStory(layout, late, lateLogPlay(late));
};
export const LateLogCarbsPhone = lateLog('phone');
export const LateLogCarbsDesktop = lateLog('desktop');

// A save the engine refuses: the mark leaves and the bar on Day reads "Not
// saved"; a Prompt answer made meanwhile leaves the bar up; Retry sends the same
// grams and time, draws the mark again, and saves.
const refusedLogPlay = (late: Late): Story['play'] => async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await saveCarbs(canvas);
  await expect(loggedRows(canvasElement)).toEqual([{ time: LOG_TIME, grams: LOG_GRAMS, held: true }]);
  await late.release(false);
  await expect(loggedRows(canvasElement)).toEqual([]);
  await expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/);
  await userEvent.click(canvas.getByRole('button', { name: /Lows/ }));
  await userEvent.click(canvas.getByRole('button', { name: 'No' }));
  // Its one low answered, the Lows return to Day by themselves (#677).
  await waitFor(() => expect(canvas.queryByRole('heading', { level: 1, name: 'Lows' })).toBeNull());
  await expect(canvas.getByRole('status')).toHaveTextContent(/Not saved/);
  await userEvent.click(within(canvas.getByRole('status')).getByRole('button', { name: 'Retry' }));
  await expect(late.sent).toEqual([[LOGGED.grams, LOG_CLOCK], [LOGGED.grams, LOG_CLOCK]]);
  await expect(loggedRows(canvasElement)).toEqual([{ time: LOG_TIME, grams: LOG_GRAMS, held: true }]);
  await late.release();
  await waitFor(() => expect(canvas.queryByRole('status')).toBeNull());
  await expect(loggedRows(canvasElement)).toEqual([{ time: LOG_TIME, grams: LOG_GRAMS, held: false }]);
};
const refusedLog = (layout: 'phone' | 'desktop') => {
  const late = answersLate<[number, string | undefined], void>(undefined);
  return logStory(layout, late, refusedLogPlay(late));
};
export const LateLogCarbsRefusedPhone = refusedLog('phone');
export const LateLogCarbsRefusedDesktop = refusedLog('desktop');

// Live (#495): Log carbs' Time row opens the system picker, and Save logs the
// carbs at the time picked, on the clock's day.
const PICKED = '07:45';
const logged: [number, string][] = [];
const liveLog = (): DayScreenProps['writes'] => ({
  ...answering(async () => ({ carbEntryId: null })),
  logCarbs: async (grams, at) => { logged.push([grams, at]); },
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
  await expect(logged).toEqual([[30, `${LOG_CLOCK.slice(0, 10)} ${PICKED}`]]);
};
const TIME_EDITED = { store: 'wearer', writes: liveLog(), now: () => LOG_CLOCK } as const;
export const LiveTimeEditedPhone: Story = { ...story('phone', TIME_EDITED), play: timeEditedPlay };
export const LiveTimeEditedDesktop: Story = { ...story('desktop', TIME_EDITED), play: timeEditedPlay };

// Live, Log carbs stamps on the store's clock, read as the entry opens (#658,
// ADR 658): Save waits while it is read, then logs at the served time, never
// the browser's; a clock that cannot be read shows Unavailable and Retry in the
// Time row's place, with Save held, and Retry reads it again. The clock is read
// afresh on every opening.
const STORE_CLOCK = `${LOG_CLOCK.slice(0, 10)} 09:30`;
const clockReads: ((served: boolean) => void)[] = [];
const clockOpened = { count: 0 };
const readStoreClock = () => new Promise<() => string>((resolve, reject) => {
  clockOpened.count += 1;
  clockReads.push((served) => (served ? resolve(() => STORE_CLOCK) : reject(new Error('unavailable'))));
});
const clockStory = (layout: 'phone' | 'desktop', play: Story['play']): Story => ({
  ...story(layout, { store: 'wearer', writes: liveLog(), readClock: readStoreClock }),
  beforeEach: () => { clockReads.length = 0; clockOpened.count = 0; logged.length = 0; },
  play,
});
const answerClock = async (served: boolean) => {
  await waitFor(() => expect(clockReads.length).toBeGreaterThan(0));
  clockReads.shift()!(served);
};
const clockPlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), '30');
  await expect(entry.getByRole('button', { name: 'Save' })).toBeDisabled();
  await answerClock(true);
  await waitFor(() => expect(entry.getByRole('button', { name: 'Save' })).toBeEnabled());
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
  await expect(logged).toEqual([[30, STORE_CLOCK]]);
  await openCarbs(canvas);
  await expect(clockOpened.count).toBe(2);
  await answerClock(true);
};
const clockUnavailablePlay: Story['play'] = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const entry = await openCarbs(canvas);
  await userEvent.type(entry.getByRole('textbox', { name: 'Carbs' }), '30');
  await answerClock(false);
  await waitFor(() => expect(entry.getByText('Unavailable')).toBeInTheDocument());
  await expect(entry.getByRole('button', { name: 'Save' })).toBeDisabled();
  await userEvent.click(entry.getByRole('button', { name: 'Retry' }));
  await answerClock(true);
  await waitFor(() => expect(entry.getByRole('button', { name: 'Save' })).toBeEnabled());
  await userEvent.click(entry.getByRole('button', { name: 'Save' }));
  await expect(logged).toEqual([[30, STORE_CLOCK]]);
};
export const LogCarbsClockPhone = clockStory('phone', clockPlay);
export const LogCarbsClockDesktop = clockStory('desktop', clockPlay);
export const LogCarbsClockUnavailablePhone = clockStory('phone', clockUnavailablePlay);
export const LogCarbsClockUnavailableDesktop = clockStory('desktop', clockUnavailablePlay);

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
