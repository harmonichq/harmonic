// The Day screen (§1.1, §1.3, §1.4), composed only from the library's
// components: one day's glucose, insulin and carbs, the day navigator, carb
// logging and Prompts. No aggregate beyond that day.
//
// The latest day with readings opens first. The header names the day beside
// its title as the control that drops the month down, and carries "+ Log
// carbs". The month opens as its weeks, each a gapless DayRibbon with every
// day's counts and in-range %, under the month's name and ‹ ›, which step a month
// at a time between the first and last months with readings (live, each month
// is read once as it is first shown: loading while it reads, Unavailable and
// Retry inside the drop-down when it cannot be); picking a day, in any month,
// closes it and opens that day, as do Escape and, on
// phone, the scrim. On desktop the selected day's week also stays in view as
// one ribbon under the header, following the selected day across months. The day is its DayChart, which carries its own
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
// entry with Retry. Its Time row opens the system time picker, and the time
// picked is the time the carbs are logged at, today. Escape, or the scrim on phone, closes it unsaved.
//
// Phone: only the header stays put; everything under it scrolls as one page,
// above the tab bar. Desktop: the rail and one pane, which scrolls as a whole
// (§2.3).
//
// Motion: the month drops down over a darkening scrim (on desktop, a popover
// opening out of its arrow); Log carbs' sheet rises; the Prompts push in from
// the right and back from the left, and each next prompt comes in from the
// right.
//
// Live (`writes`, #495): each answer is optimistic. Yes keeps its card,
// recorded, while the answer saves, and Next adds the grams typed to the
// entry Yes created; any other answer, the Not sure text action or the full
// swipe moves on to the next prompt at once. Log carbs waits on its save, busy.
// A write that fails puts the card back with "Not saved" and Retry; a failed
// Log carbs keeps its entry with Retry. Every write resolves once the engine's
// answers are read again. The day the person picks is read as it is picked.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Sourced } from '../../answers';
import {
  PROMPT_STEPS, dayChartOf, dayDate, insulinBar, latestDay, livePromptPlace, loggedGrams, loggedTime, lowPrompt,
  lowPrompts, monthBy, monthName, monthServed, monthSpan, monthWeeks, promptPlace, unanswered, weekOf, type PromptData, type PromptStore,
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
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
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
  /** The live engine's writes; without them the Prompts step through the served stores. */
  writes?: DayWrites;
  /** The day the screen shows, each time it changes: the live app reads it. */
  onDay?: (iso: string) => void;
  /** Read another month's weeks (`YYYY-MM`) into the answers; without it only the served month steps. */
  readMonth?: (month: string) => Promise<void>;
  nav?: NavHooks;
  /** Unavailable's Retry. */
  onRetry?: () => void;
};

/** Each resolves once the engine's answers are read again, and rejects when the write was not saved. */
export type DayWrites = {
  /** Answer one prompt; Yes resolves with the carb entry it created. */
  answer: (prompt: PromptData, answer: Answer) => Promise<{ carbEntryId: number | null }>;
  /** The grams typed after a Yes, onto the entry it created. */
  grams: (carbEntryId: number, grams: number) => Promise<void>;
  /** Carbs eaten without a bolus, today at `time` (`HH:MM`), or now. */
  logCarbs: (grams: number, time?: string) => Promise<void>;
};

/** How long a save is shown busy before it settles. */
const SAVE_MS = 600;

/** The week holding a day, when the navigator serves all of it. */
const week = (iso: string) => weekOf(iso)?.map(navigatorDay) ?? null;

/** The month, dropped down from the header's day: its name, ‹ ›, and its weeks. */
function Month({ layout, month, selected, onSelect, onStep, canStep, read, onRetry, left, exit }: {
  layout: Layout; month: string; selected: string; onSelect: (iso: string) => void;
  onStep: (step: -1 | 1) => void; canStep: (step: -1 | 1) => boolean;
  /** The month's weeks until they are served. */
  read: 'loading' | 'unavailable' | null; onRetry: () => void; left?: number;
  /** Closing: what usePresence marks it with. */
  exit: object;
}) {
  return (
    <section className={layout === 'phone' ? 'ui-dayscreen__month ui-dayscreen__month--phone'
      : 'ui-popover ui-dayscreen__month ui-dayscreen__month--desktop'} style={{ left }}
      role="dialog" aria-label={monthName(month)} {...exit}>
      <div className="ui-dayscreen__month-head">
        <h2 className="ui-dayscreen__month-name">{monthName(month)}</h2>
        <span className="ui-dayscreen__steps">
          <Button kind="icon" icon="previous" label="Previous" disabled={!canStep(-1)} onClick={() => onStep(-1)} />
          <Button kind="icon" icon="next" label="Next" disabled={!canStep(1)} onClick={() => onStep(1)} />
        </span>
      </div>
      {read === 'unavailable' ? (
        <div className="ui-dayscreen__weeks ui-dayscreen__unavailable">
          <span>Unavailable</span>
          <Button kind="text" label="Retry" onClick={onRetry} />
        </div>
      ) : read === 'loading' ? (
        <div className="ui-dayscreen__weeks"><span className="ui-skeleton ui-dayscreen__skeleton" aria-hidden="true" /></div>
      ) : (
        <div className="ui-dayscreen__weeks">
          {monthWeeks(month).map((days) => (
            <DayRibbon key={days[0]} days={days.map(navigatorDay)} selected={selected} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}

/** The screen before the live answers arrive (its skeleton) or when they
 *  cannot be read (Unavailable and Retry): nothing read from the answers. */
function Frame({ layout, state, nav, onRetry }: {
  layout: Layout; state: 'loading' | 'unavailable'; nav?: NavHooks; onRetry?: () => void;
}) {
  const header = state === 'unavailable'
    ? <ScreenHeader title="Day" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : <ScreenHeader title="Day" layout={layout} />;
  const body = state === 'loading' && <span className="ui-skeleton ui-dayscreen__skeleton" aria-hidden="true" />;
  if (layout === 'phone') {
    return (
      <div className="ui-dayscreen ui-dayscreen--phone">
        <div className="ui-dayscreen__head">{header}</div>
        <main className="ui-dayscreen__main" data-scroll="page"><div className="ui-dayscreen__body">{body}</div></main>
        <NavBar layout="tabbar" selected="day" {...nav} />
      </div>
    );
  }
  return (
    <div className="ui-dayscreen ui-dayscreen--desktop">
      <NavBar layout="rail" selected="day" {...nav} />
      <section className="ui-dayscreen__pane" data-scroll="page">
        <div className="ui-dayscreen__pane-head">{header}</div>
        <div className="ui-dayscreen__body">{body}</div>
      </section>
    </div>
  );
}

export function DayScreen(props: DayScreenProps) {
  // The live app has no answers to read until they arrive.
  if (props.writes && props.state !== undefined && props.state !== 'ready') {
    return <Frame layout={props.layout} state={props.state} nav={props.nav} onRetry={props.onRetry} />;
  }
  return <Day {...props} />;
}

function Day({
  layout, store, state = 'ready', day, view: initialView = 'day', monthOpen = false, logCarbs, timeEdited = false,
  recorded = false, swiping = false, failing = false, notSaved = false, writes, onDay, readMonth, nav, onRetry,
}: DayScreenProps) {
  const [selected, setSelected] = useState(day ?? latestDay());
  const [month, setMonth] = useState(monthOpen);
  // The month the drop-down shows, and how reading it went, until it is served.
  const [monthShown, setShown] = useState(selected.slice(0, 7));
  const shownRef = useRef(monthShown);
  const [monthRead, setMonthRead] = useState<'loading' | 'unavailable' | null>(null);
  const [, redraw] = useState(0);
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
  useEffect(() => { onDay?.(selected); }, [selected]);

  // Live: the prompts answered while their write is in flight, the Yes card
  // held until Next with the entry its answer creates, the count the Prompts
  // opened with, the grams typed into Log carbs, and a failed write's Retry.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [held, setHeld] = useState<PromptData | null>(null);
  const heldEntry = useRef<Promise<number | null>>();
  const [opened, setOpened] = useState<Sourced<number>>();
  const typed = useRef('');
  // The time picked in Log carbs' Time row, until the entry closes.
  const [chosen, setChosen] = useState<string>();
  const [retry, setRetry] = useState<{ again: () => void } | null>(null);

  const current = PROMPT_STEPS[step];
  const count = unanswered(current);
  const shown = PROMPT_STEPS[recordedNow ? step - 1 : step];
  const visible = writes ? lowPrompts().filter((p) => !pending.has(p.anchorT) && p.anchorT !== held?.anchorT) : [];
  const liveCard = held ?? visible[0] ?? null;
  // The prompt the Prompts opened on; each one after it comes in as the next.
  const [entered, setEntered] = useState<string>(shown);
  const cardKey = writes ? liveCard?.anchorT ?? '' : shown;
  const push = view === 'prompts' ? 'forward' : 'back';

  const select = (iso: string) => { setSelected(iso); setMonth(false); };
  const toggleMonth = () => {
    if (!month) {
      setShown(selected.slice(0, 7));
      shownRef.current = selected.slice(0, 7);
      setMonthRead(null);
    }
    setMonth(!month);
  };
  // A month is read once, as it is first shown; what has landed is not read again.
  const loadMonth = (target: string) => {
    if (monthServed(target) || !readMonth) { setMonthRead(null); return; }
    setMonthRead('loading');
    readMonth(target).then(
      () => { if (target === shownRef.current) setMonthRead(null); redraw((n) => n + 1); },
      () => { if (target === shownRef.current) setMonthRead('unavailable'); },
    );
  };
  const stepMonth = (by: -1 | 1) => {
    const target = monthBy(monthShown, by);
    setShown(target);
    shownRef.current = target;
    loadMonth(target);
  };
  const canStep = (by: -1 | 1) => {
    const target = monthBy(monthShown, by);
    const { first, last } = monthSpan();
    return target >= first && target <= last && (monthServed(target) || readMonth !== undefined);
  };
  const monthProps = {
    month: monthShown, selected, onSelect: select, onStep: stepMonth, canStep,
    read: monthServed(monthShown) ? null : monthRead ?? 'loading', onRetry: () => loadMonth(monthShown),
  } as const;
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
    if (writes) {
      if (liveCard && !held) liveAnswer(liveCard, given);
      return;
    }
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

  const notSavedLive = (again: () => void) => () => {
    setAttempt((n) => n + 1);
    setRetry({ again });
  };
  const leaveWhenDone = () => { if (unanswered('wearer').value === 0) setView('day'); };
  const mark = (prompt: PromptData, on: boolean) => setPending((now) => {
    const next = new Set(now);
    if (on) next.add(prompt.anchorT); else next.delete(prompt.anchorT);
    return next;
  });
  const liveAnswer = (prompt: PromptData, given: Answer) => {
    setRetry(null);
    if (given === 'carbs') {
      setHeld(prompt);
      // The card draws recorded from its first render.
      setAttempt((n) => n + 1);
      heldEntry.current = writes!.answer(prompt, 'carbs').then((saved) => saved.carbEntryId);
      heldEntry.current.catch(() => {
        setHeld((now) => (now === prompt ? null : now));
        notSavedLive(() => liveAnswer(prompt, given))();
      });
      return;
    }
    mark(prompt, true);
    writes!.answer(prompt, given).then(leaveWhenDone, notSavedLive(() => liveAnswer(prompt, given)))
      .finally(() => mark(prompt, false));
  };
  const liveGrams = (made: Promise<number | null>, grams: number) => {
    setRetry(null);
    made.then((id) => (id === null ? undefined : writes!.grams(id, grams)))
      .catch(notSavedLive(() => liveGrams(made, grams)));
  };
  const next = (grams: string) => {
    if (!writes) {
      advance(step);
      return;
    }
    const made = heldEntry.current;
    setHeld(null);
    if (made && /^\d+$/.test(grams)) liveGrams(made, Number(grams));
    // The Yes already left the unanswered count once its write was read back.
    if (visible.length === 0) setView('day');
  };

  const save = () => {
    setCarbs('saving');
    if (writes) {
      writes.logCarbs(Number(typed.current), chosen).then(() => setCarbs(null), () => setCarbs('not_saved'));
      return;
    }
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
  useEffect(() => { if (carbs === null) setChosen(undefined); }, [carbs]);

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
    chosen,
    onTimeChange: setChosen,
    onGramsChange: (text: string) => {
      typed.current = text;
      setCarbs(text ? 'filled' : 'empty');
    },
    onSave: save,
  };

  const openPrompts = () => {
    setEntered(writes ? visible[0]?.anchorT ?? '' : shown);
    setOpened(count);
    setView('prompts');
  };
  // "n / N": the served stores' difference, or live, the place among those the Prompts opened with.
  const place = view !== 'prompts' ? undefined : writes
    ? opened && livePromptPlace(opened, opened.value - visible.length + (held ? 0 : 1))
    : promptPlace(store, shown);
  const dayControl = { ...dayDate(selected), open: month, onToggle: toggleMonth };
  const header = state === 'unavailable'
    ? <ScreenHeader title="Day" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : view === 'prompts'
      ? place
        ? <ScreenHeader key={view} title="Lows" layout={layout} back={{ label: 'Day', onBack: () => setView('day') }}
            trailing="count" {...place} />
        : <ScreenHeader key={view} title="Lows" layout={layout} back={{ label: 'Day', onBack: () => setView('day') }} />
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
              value={<Num value={count} />} onOpen={openPrompts} />
          </ListGroup>
        )}
      </div>
      {state === 'loading' || !chart
        ? <span className="ui-skeleton ui-dayscreen__skeleton" aria-hidden="true" />
        : <DayChart data={chart} layout={layout} />}
    </>
  );

  const prompt = () => {
    const card = writes ? liveCard : lowPrompt(0, shown);
    return card && (
    <div key={cardKey} className={cardKey === entered ? 'ui-dayscreen__prompt' : 'ui-dayscreen__prompt ui-advance'}>
      <PromptCard key={attempt} data={card} layout={layout} recorded={writes ? held !== null : recordedNow}
        swiping={swiping && !recordedNow} onAnswer={answer} onNext={next} />
    </div>
    );
  };
  // What is open stays while it closes: the bar, the month, the sheet.
  const barShown = usePresence(view === 'prompts' && (writes ? retry : failed));
  const bar = barShown.value && (
    <div className="ui-dayscreen__bar" {...barShown.exit}>
      <TransientBar kind="not_saved" layout={layout}
        onRetry={() => {
          const shownRetry = barShown.value;
          if (shownRetry && typeof shownRetry === 'object') { shownRetry.again(); return; }
          fails.current = false;
          answer(barShown.value as Answer);
        }} />
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
          {dropped.value && <Month layout="phone" {...monthProps} exit={dropped.exit} />}
        </div>
        <main className="ui-dayscreen__main" data-scroll="page" data-push={push}>
          <div key={`${view}-body`} className="ui-dayscreen__body ui-push">
            {state !== 'unavailable' && (view === 'prompts' ? prompt() : dayContent)}
          </div>
        </main>
        {bar}
        <NavBar layout="tabbar" selected="day" dayCount={count} {...nav} />
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
      <NavBar layout="rail" selected="day" dayCount={count} {...nav} />
      <section className="ui-dayscreen__pane" data-scroll="page" data-push={push}>
        <div ref={headRef} className="ui-dayscreen__pane-head" data-push={push}>
          {header}
          {dropped.value && <Month layout="desktop" {...monthProps} left={anchor} exit={dropped.exit} />}
        </div>
        {state !== 'unavailable' && (
          <div key={`${view}-body`} className="ui-dayscreen__body ui-push">
            {view === 'prompts' ? prompt() : (
              <>
                {week(selected) && <DayRibbon days={week(selected)!} selected={selected} onSelect={select} />}
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
