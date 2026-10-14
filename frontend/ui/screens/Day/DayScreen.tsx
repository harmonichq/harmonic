// The Day screen (§1.1, §1.3, §1.4), composed only from the library's
// components: one day's glucose, insulin and carbs, the day navigator, carb
// logging and Prompts. No aggregate beyond that day.
//
// The latest day with readings opens first. The header names the day beside
// its title as the control that drops the month down, and carries "+ Log
// carbs". The month opens as its weeks, each a gapless DayRibbon with every
// day's counts and in-range %, under the month's name and ‹ › (the navigator
// serves no other month here); picking a day closes it, as do Escape and, on
// phone, the scrim. On desktop the selected day's week also stays in view as
// one ribbon under the header. The day is its DayChart, which carries its own
// event list; a day without readings is the chart's "No data"; a day whose
// timeline is not served yet is the chart's skeleton, as it shows while loading.
// Above the Prompts row (on desktop, beside it), the day's insulin as its
// InsulinBar; none on a day that serves none.
//
// Unanswered Prompts show as one row, "▼ Lows" and their count (the NavBar's
// Day badge is the same count), hidden at none. It drills down (§2.2) to the
// Prompts under "‹ Day": one PromptCard at a time, its place "n / N" in the
// header, nothing else to act on. An answer moves the Prompts one served store
// on: Yes stays on the card, recorded, with the optional grams field and Next;
// any other answer goes to the next prompt, and past the last, back to Day. A
// write that fails puts the card back as it was and shows "Not saved" with
// Retry in the TransientBar.
//
// Log carbs: on phone a bottom sheet over the screen (on the system keyboard,
// which the story does not draw), on desktop a popover under "+ Log carbs".
// Save is its one primary; it saves, then closes; a failed save keeps the
// entry with Retry. Escape, or the scrim on phone, closes it unsaved.
//
// Phone: only the header stays put; everything under it scrolls as one page,
// above the tab bar. Desktop: the rail and one pane, which scrolls as a whole
// (§2.3).
//
// Motion: the month drops down over a darkening scrim (on desktop, a popover
// opening out of its arrow); Log carbs' sheet rises; the Prompts push in from
// the right and back from the left, and each next prompt comes in from the
// right.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  PROMPT_STEPS, dayChartOf, dayDate, insulinBar, latestDay, loggedGrams, loggedTime, lowPrompt, monthName, monthWeeks,
  promptPlace, unanswered, weekOf, type PromptStore,
} from '../../day-model';
import { day as navigatorDay } from '../../overview-model';
import { useMotionGate, usePresence } from '../../motion';
import { Num } from '../../Num';
import { Button } from '../../components/Button/Button';
import { DayChart } from '../../components/DayChart/DayChart';
import { DayRibbon } from '../../components/DayRibbon/DayRibbon';
import { InsulinBar } from '../../components/InsulinBar/InsulinBar';
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
  /** Start with the month dropped down. */
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

const week = (iso: string) => weekOf(iso)!.map(navigatorDay);

/** The month, dropped down from the header's day: its name, ‹ ›, and its weeks. */
function Month({ layout, selected, onSelect, left, exit }: {
  layout: Layout; selected: string; onSelect: (iso: string) => void; left?: number;
  /** Closing: what usePresence marks it with. */
  exit: object;
}) {
  return (
    <section className={layout === 'phone' ? 'ui-dayscreen__month ui-dayscreen__month--phone'
      : 'ui-popover ui-dayscreen__month ui-dayscreen__month--desktop'} style={{ left }}
      role="dialog" aria-label={monthName()} {...exit}>
      <div className="ui-dayscreen__month-head">
        <h2 className="ui-dayscreen__month-name">{monthName()}</h2>
        <span className="ui-dayscreen__steps">
          <Button kind="icon" icon="previous" label="Previous" disabled />
          <Button kind="icon" icon="next" label="Next" disabled />
        </span>
      </div>
      <div className="ui-dayscreen__weeks">
        {monthWeeks().weeks.map((days) => (
          <DayRibbon key={days[0]} days={days.map(navigatorDay)} selected={selected} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

export function DayScreen({
  layout, store, state = 'ready', day, view: initialView = 'day', monthOpen = false, logCarbs, timeEdited = false,
  recorded = false, swiping = false, failing = false, notSaved = false,
}: DayScreenProps) {
  const [selected, setSelected] = useState(day ?? latestDay());
  const [month, setMonth] = useState(monthOpen);
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
  const headRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<number>();
  const root = useMotionGate<HTMLDivElement>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const current = PROMPT_STEPS[step];
  const count = unanswered(current);
  const shown = PROMPT_STEPS[recordedNow ? step - 1 : step];
  // The prompt the Prompts opened on; each one after it comes in as the next.
  const [entered, setEntered] = useState(shown);
  const push = view === 'prompts' ? 'forward' : 'back';

  const select = (iso: string) => { setSelected(iso); setMonth(false); };
  // Desktop: the month's popover sits under the header's day, its arrow on it.
  useLayoutEffect(() => {
    const control = headRef.current?.querySelector<HTMLElement>('.ui-header__day');
    if (control) setAnchor(control.offsetLeft - 12);
  }, [layout, selected, view]);

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
    if (carbs === null && !month) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (carbs !== null) closeCarbs();
      else setMonth(false);
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

  const dayControl = { ...dayDate(selected), open: month, onToggle: () => setMonth(!month) };
  const header = state === 'unavailable'
    ? <ScreenHeader title="Day" trailing="unavailable" layout={layout} />
    : view === 'prompts'
      ? <ScreenHeader key={view} title="Lows" layout={layout} back={{ label: 'Day', onBack: () => setView('day') }}
          trailing="count" {...promptPlace(store, shown)} />
      : layout === 'phone'
        ? <ScreenHeader key={view} title="Day" day={dayControl} layout={layout} trailing="action" label="+ Log carbs"
            onAction={() => setCarbs('empty')} />
        : <ScreenHeader key={view} title="Day" day={dayControl} layout={layout} trailing="control" control={
            <LogCarbsEntry layout="desktop" align="end" open={carbs !== null} {...entryProps}
              onToggle={() => (carbs === null ? setCarbs('empty') : closeCarbs())} />} />;

  const chart = dayChartOf(selected);
  const dayContent = (
    <>
      <div className={`ui-dayscreen__summary ui-dayscreen__summary--${layout}`}>
        <InsulinBar data={insulinBar(selected)} loading={state === 'loading' || !chart} />
        {count.value > 0 && (
          <ListGroup>
            <ListRow label={<><span className="ui-dayscreen__low" aria-hidden="true">▼</span>Lows</>}
              value={<Num value={count} />} onOpen={() => { setEntered(shown); setView('prompts'); }} />
          </ListGroup>
        )}
      </div>
      {state === 'loading' || !chart
        ? <span className="ui-skeleton ui-dayscreen__skeleton" aria-hidden="true" />
        : <DayChart data={chart} layout={layout} />}
    </>
  );

  const prompt = () => (
    <div key={shown} className={shown === entered ? 'ui-dayscreen__prompt' : 'ui-dayscreen__prompt ui-advance'}>
      <PromptCard key={attempt} data={lowPrompt(0, shown)} layout={layout} recorded={recordedNow}
        swiping={swiping && !recordedNow} onAnswer={answer} onNext={() => advance(step)} />
    </div>
  );
  // What is open stays while it closes: the bar, the month, the sheet.
  const barShown = usePresence(view === 'prompts' && failed);
  const bar = barShown.value && (
    <div className="ui-dayscreen__bar" {...barShown.exit}>
      <TransientBar kind="not_saved" layout={layout}
        onRetry={() => { fails.current = false; answer(barShown.value as Answer); }} />
    </div>
  );

  const dropped = usePresence(month && state !== 'unavailable' && view === 'day');
  const sheet = usePresence(carbs !== null && state === 'ready' && view === 'day' && carbs);

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-dayscreen ui-dayscreen--phone">
        {dropped.value && <div className="ui-scrim ui-dayscreen__scrim" onClick={() => setMonth(false)} {...dropped.exit} />}
        <div className="ui-dayscreen__head" data-push={push}>
          {header}
          {dropped.value && <Month layout="phone" selected={selected} onSelect={select} exit={dropped.exit} />}
        </div>
        <main className="ui-dayscreen__main" data-scroll="page" data-push={push}>
          <div key={`${view}-body`} className="ui-dayscreen__body ui-push">
            {state !== 'unavailable' && (view === 'prompts' ? prompt() : dayContent)}
          </div>
        </main>
        {bar}
        <NavBar layout="tabbar" selected="day" dayCount={count} />
        {sheet.value && (
          <div className="ui-scrim ui-dayscreen__scrim ui-dayscreen__scrim--sheet" onClick={closeCarbs} {...sheet.exit}>
            <div onClick={(event) => event.stopPropagation()}>
              <LogCarbsEntry layout="phone" {...entryProps} state={sheet.value} />
            </div>
          </div>
        )}
      </div>
    );
  }
  return (
    <div ref={root} className="ui-dayscreen ui-dayscreen--desktop">
      <NavBar layout="rail" selected="day" dayCount={count} />
      <section className="ui-dayscreen__pane" data-scroll="page" data-push={push}>
        <div ref={headRef} className="ui-dayscreen__pane-head" data-push={push}>
          {header}
          {dropped.value && <Month layout="desktop" selected={selected} onSelect={select} left={anchor} exit={dropped.exit} />}
        </div>
        {state !== 'unavailable' && (
          <div key={`${view}-body`} className="ui-dayscreen__body ui-push">
            {view === 'prompts' ? prompt() : (
              <>
                <DayRibbon days={week(selected)} selected={selected} onSelect={select} />
                {dayContent}
              </>
            )}
          </div>
        )}
        {bar}
      </section>
    </div>
  );
}
