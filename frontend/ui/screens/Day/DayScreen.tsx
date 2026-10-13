// The Day screen (§1.1, §1.3, §1.4), composed only from the library's
// components: one day's glucose, insulin and carbs, the day navigator, carb
// logging and Prompts. No aggregate beyond that day.
//
// The latest day with readings opens first. The header names the day beside
// its title and carries "+ Log carbs". The navigator picks the day: on phone a
// week strip of DayTiles, Monday first, that swipes a week at a time with ‹ ›
// as its visible equivalent, and whose month label opens the Month sheet, the
// whole month as a grid; on desktop that month grid stands in its own pane
// beside the day, with ‹ › for the month either side, which the navigator
// does not serve here. The day is its DayChart, which carries its own event
// list; a day without readings is the chart's "No data"; a day whose timeline
// is not served yet is the chart's skeleton, as it shows while loading.
//
// Unanswered Prompts show as one row, "▼ Lows" and their count (the NavBar's
// Day badge is the same count), hidden at none. It drills down (§2.2) to the
// Prompts under "‹ Day": one PromptCard at a time, its place "n / N" in the
// header, nothing else to act on (on desktop the month pane goes inert).
// An answer moves the Prompts one served store on: Yes stays on the card,
// recorded, with the optional grams field and Next; any other answer goes to
// the next prompt, and past the last, back to Day. A write that fails puts the
// card back as it was and shows "Not saved" with Retry in the TransientBar.
//
// Log carbs: on phone a bottom sheet over the screen (on the system keyboard,
// which the story does not draw), on desktop a popover under "+ Log carbs".
// Save is its one primary; it saves, then closes; a failed save keeps the
// entry with Retry. Escape, or the scrim on phone, closes it unsaved.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar. Desktop: the rail, the month pane and the day pane, each scrolling as a
// whole (§2.3).
import { useEffect, useRef, useState } from 'react';
import {
  PROMPT_STEPS, adjacentWeek, dayChartOf, dayDate, latestDay, loggedGrams, loggedTime, lowPrompt, monthName,
  monthWeeks, promptPlace, unanswered, weekOf, type PromptStore,
} from '../../day-model';
import { day as navigatorDay } from '../../overview-model';
import { Num } from '../../Num';
import { Button } from '../../components/Button/Button';
import { DayChart } from '../../components/DayChart/DayChart';
import { DayTile } from '../../components/DayTile/DayTile';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { LogCarbsEntry, type LogCarbsState } from '../../components/LogCarbsEntry/LogCarbsEntry';
import { NavBar } from '../../components/NavBar/NavBar';
import { PromptCard, type Answer } from '../../components/PromptCard/PromptCard';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { TransientBar } from '../../components/TransientBar/TransientBar';
import '../../shared.css';
import './DayScreen.css';

type Layout = 'phone' | 'desktop';

export type DayScreenProps = {
  layout: Layout;
  /** The served Prompts: before any answer, the wearer's own (one answered), or all answered. */
  store: PromptStore;
  state?: 'ready' | 'loading' | 'unavailable';
  /** The day selected first; the latest day with readings when unset. */
  day?: string;
  view?: 'day' | 'prompts';
  /** Phone: start with the Month sheet open. */
  monthOpen?: boolean;
  /** Start with Log carbs open, in this state. */
  logCarbs?: LogCarbsState;
  /** Log carbs with its Time row edited. */
  timeEdited?: boolean;
  /** Start on the Prompts with the first one answered Yes. */
  recorded?: boolean;
  /** Phone: the prompt held mid-swipe over its Not sure reveal. */
  swiping?: boolean;
  /** The next write fails, once; Retry saves it. */
  failing?: boolean;
  /** Start just after a Yes that was not saved, with the bar showing. */
  notSaved?: boolean;
};

/** How long a save is shown busy before it settles. */
const SAVE_MS = 600;
/** The horizontal travel that turns a drag on the week strip into a swipe. */
const SWIPE_PX = 40;

/** The month grid: the served month, seven tiles to a week. */
function MonthGrid({ selected, onSelect }: { selected: string; onSelect: (iso: string) => void }) {
  return (
    <div className="ui-dayscreen__grid">
      {monthWeeks().weeks.flat().map((iso) => (
        <DayTile key={iso} day={navigatorDay(iso)} compact selected={iso === selected} onSelect={() => onSelect(iso)} />
      ))}
    </div>
  );
}

export function DayScreen({
  layout, store, state = 'ready', day, view: initialView = 'day', monthOpen = false, logCarbs, timeEdited = false,
  recorded = false, swiping = false, failing = false, notSaved = false,
}: DayScreenProps) {
  const [selected, setSelected] = useState(day ?? latestDay());
  const [week, setWeek] = useState(() => weekOf(selected)!);
  const [sheet, setSheet] = useState(monthOpen);
  const [view, setView] = useState(initialView);
  // The Prompts, one served store per answer given.
  const entry = PROMPT_STEPS.indexOf(store);
  const [step, setStep] = useState(entry + (recorded ? 1 : 0));
  const [recordedNow, setRecordedNow] = useState(recorded);
  const [failed, setFailed] = useState<Answer | null>(notSaved ? 'carbs' : null);
  const [attempt, setAttempt] = useState(0);
  const [carbs, setCarbs] = useState<LogCarbsState | null>(logCarbs ?? null);
  const fails = useRef(failing);
  const timer = useRef<number>();
  const swipeFrom = useRef<number | null>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const current = PROMPT_STEPS[step];
  const count = unanswered(current);
  const shown = PROMPT_STEPS[recordedNow ? step - 1 : step];

  const select = (iso: string) => { setSelected(iso); setWeek(weekOf(iso)!); setSheet(false); };
  const go = (direction: 1 | -1) => { const next = adjacentWeek(week, direction); if (next) setWeek(next); };

  const advance = (at: number) => {
    setRecordedNow(false);
    if (unanswered(PROMPT_STEPS[at]).value === 0) setView('day');
  };
  const answer = (given: Answer) => {
    if (fails.current) {
      // Not saved: the card returns to its prior state.
      fails.current = false;
      setFailed(given);
      setAttempt((n) => n + 1);
      return;
    }
    setFailed(null);
    setStep(step + 1);
    if (given === 'carbs') {
      setRecordedNow(true);
      setAttempt((n) => n + 1);
    } else {
      advance(step + 1);
    }
  };

  const save = () => {
    setCarbs('saving');
    timer.current = window.setTimeout(() => {
      if (fails.current) {
        fails.current = false;
        setCarbs('not_saved');
      } else {
        setCarbs(null);
      }
    }, SAVE_MS);
  };
  const closeCarbs = () => setCarbs((now) => (now === 'saving' ? now : null));

  useEffect(() => {
    if (carbs === null && !sheet) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (carbs !== null) closeCarbs();
      else setSheet(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const entryProps = {
    state: carbs ?? 'empty',
    grams: logCarbs && logCarbs !== 'empty' ? loggedGrams() : undefined,
    time: timeEdited ? loggedTime() : undefined,
    onGramsChange: (text: string) => setCarbs(text ? 'filled' : 'empty'),
    onSave: save,
  };

  const header = state === 'unavailable'
    ? <ScreenHeader title="Day" trailing="unavailable" layout={layout} />
    : view === 'prompts'
      ? <ScreenHeader title="Lows" layout={layout} back={{ label: 'Day', onBack: () => setView('day') }}
          trailing="count" {...promptPlace(store, shown)} />
      : layout === 'phone'
        ? <ScreenHeader title="Day" day={dayDate(selected)} layout={layout} trailing="action" label="+ Log carbs"
            onAction={() => setCarbs('empty')} />
        : <ScreenHeader title="Day" day={dayDate(selected)} layout={layout} trailing="control" control={
            <LogCarbsEntry layout="desktop" align="end" open={carbs !== null} {...entryProps}
              onToggle={() => (carbs === null ? setCarbs('empty') : closeCarbs())} />} />;

  const chart = dayChartOf(selected);
  const dayContent = (
    <>
      {count.value > 0 && (
        <ListGroup>
          <ListRow label={<><span className="ui-dayscreen__low" aria-hidden="true">▼</span>Lows</>}
            value={<Num value={count} />} onOpen={() => setView('prompts')} />
        </ListGroup>
      )}
      {state === 'loading' || !chart
        ? <span className="ui-skeleton ui-dayscreen__skeleton" aria-hidden="true" />
        : <DayChart data={chart} layout={layout} />}
    </>
  );

  const prompt = () => (
    <PromptCard key={`${shown}-${attempt}`} data={lowPrompt(0, shown)} layout={layout} recorded={recordedNow}
      swiping={swiping && !recordedNow} onAnswer={answer} onNext={() => advance(step)} />
  );
  const bar = view === 'prompts' && failed && (
    <TransientBar kind="not_saved" layout={layout} onRetry={() => { fails.current = false; answer(failed); }} />
  );

  const monthHead = (
    <div className="ui-dayscreen__month">
      <h2 className="ui-dayscreen__month-name">{monthName()}</h2>
      <span className="ui-dayscreen__steps">
        <Button kind="icon" icon="previous" label="Previous" disabled />
        <Button kind="icon" icon="next" label="Next" disabled />
      </span>
    </div>
  );

  if (layout === 'phone') {
    const strip = (
      <section className="ui-dayscreen__navigator">
        <div className="ui-dayscreen__week-head">
          <Button kind="text" label={monthName()} onClick={() => setSheet(true)} />
          <span className="ui-dayscreen__steps">
            <Button kind="icon" icon="previous" label="Previous" disabled={!adjacentWeek(week, -1)} onClick={() => go(-1)} />
            <Button kind="icon" icon="next" label="Next" disabled={!adjacentWeek(week, 1)} onClick={() => go(1)} />
          </span>
        </div>
        <div className="ui-dayscreen__week"
          onPointerDown={(event) => { swipeFrom.current = event.clientX; }}
          onPointerUp={(event) => {
            const travel = event.clientX - (swipeFrom.current ?? event.clientX);
            swipeFrom.current = null;
            if (Math.abs(travel) > SWIPE_PX) go(travel < 0 ? 1 : -1);
          }}>
          {week.map((iso) => (
            <DayTile key={iso} day={navigatorDay(iso)} compact selected={iso === selected} onSelect={() => select(iso)} />
          ))}
        </div>
      </section>
    );
    return (
      <div className="ui-dayscreen ui-dayscreen--phone">
        <div className="ui-dayscreen__head">{header}</div>
        <main className="ui-dayscreen__main" data-scroll="page">
          <div className="ui-dayscreen__body">
            {state !== 'unavailable' && (view === 'prompts' ? prompt() : <>{strip}{dayContent}</>)}
          </div>
        </main>
        {bar && <div className="ui-dayscreen__bar">{bar}</div>}
        <NavBar layout="tabbar" selected="day" dayCount={count} />
        {(sheet || carbs !== null) && state === 'ready' && view === 'day' && (
          <div className="ui-dayscreen__scrim" onClick={() => (carbs !== null ? closeCarbs() : setSheet(false))}>
            <div className="ui-dayscreen__sheet" onClick={(event) => event.stopPropagation()}>
              {carbs !== null ? <LogCarbsEntry layout="phone" {...entryProps} /> : (
                <section className="ui-sheet" role="dialog" aria-label={monthName()}>
                  <span className="ui-sheet__grabber" aria-hidden="true" />
                  <h2 className="ui-dayscreen__month-name ui-dayscreen__sheet-title">{monthName()}</h2>
                  <MonthGrid selected={selected} onSelect={select} />
                </section>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (state === 'unavailable') {
    return (
      <div className="ui-dayscreen ui-dayscreen--desktop ui-dayscreen--single">
        <NavBar layout="rail" selected="day" dayCount={count} />
        <section className="ui-dayscreen__pane" data-scroll="page">{header}</section>
      </div>
    );
  }
  const inert = view === 'prompts' ? { inert: '' } : {};
  return (
    <div className="ui-dayscreen ui-dayscreen--desktop">
      <NavBar layout="rail" selected="day" dayCount={count} />
      <section className="ui-dayscreen__pane ui-dayscreen__pane--month" data-scroll="page"
        {...(inert as Record<string, string>)}>
        {monthHead}
        <MonthGrid selected={selected} onSelect={select} />
      </section>
      <section className="ui-dayscreen__pane ui-dayscreen__pane--day" data-scroll="page">
        {header}
        <div className="ui-dayscreen__body">
          {view === 'prompts' ? <div className="ui-dayscreen__prompt">{prompt()}</div> : dayContent}
        </div>
        {bar && <div className="ui-dayscreen__bar">{bar}</div>}
      </section>
    </div>
  );
}
