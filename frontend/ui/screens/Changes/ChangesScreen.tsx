// The Changes screen (§1.1, §1.3, §1.3a; §2.5 2026-10-14, the Changes
// redesign, #524), composed only from the library's components.
//
// The current change leads: its Trial or Focus as the ChangeCard, or the "No
// active change" label. Beneath an active Trial, what it did to glucose in the
// block it changed, each as its own module: the before-vs-after trace
// (ChangeTrace), In range / Below 70 / Above 180, Mean / GMI / CV, and for a
// basal Trial how active Control-IQ was against the Pump profile
// (ChangeMetrics, every module's numbers in the same columns). Every value is
// the engine's served comparison; the screen computes nothing. A maturing
// Trial draws every module as its data forms, each glucose module closed by
// the readings it is read from (§2.5, 2026-10-19).
//
// Then "Previous" with how many there are, which drills down (§2.2, as Day's
// Lows and Settings' rows do) to the list of every previous change, newest
// first, no cutoff: each its setting and block, before → after in aligned
// columns, its date, and its result where the engine saved one.
//
// Between them, "Waiting for pump" (#518): each Setting the person marked Done
// in the Queue that no sync has shown on the pump yet, one row each (its name
// and block, current → suggested), until the engine resolves it.
//
// End (§1.3a) is the card's compact secondary action, offered when the engine
// accepts it (a Focus at any time; a Trial once matured). Pressing it asks once:
// on phone a sheet over the screen, on desktop a popover anchored under End.
// Either holds the change's name, End as the screen's one primary and Cancel
// as a text action beneath it. Ending shows what the engine served after the
// end: the `after` store, where the ended change is now a previous one.
//
// Live (`writes`, #495): End asks the engine to end the active change once
// confirmed, and the screen draws at once what the engine will serve after it
// (ADR 630): no active change, and the change just ended a previous one, with
// no result until the engine's answer carries the one End saved. An End that
// fails puts the change back as it was, with "Not saved" and Retry in the bar,
// and leaves Previous for Changes when no previous change is served.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar. Desktop: the rail and one pane up to a reading width; the pane scrolls
// as a whole (§2.3).
//
// Motion: the sheet rises over a darkening scrim, the popover opens out of
// its arrow, and the Previous list pushes in from the right and back.
import { useEffect, useRef, useState } from 'react';
import {
  change, previousChanges, previousCount, waiting, type ChangeData, type ChangesStore, type PreviousRow,
  type TrialData, type WaitingRow,
} from '../../changes-model';
import { sourced } from '../../answers';
import { useMotionGate, usePresence } from '../../motion';
import { Num } from '../../Num';
import { Button } from '../../components/Button/Button';
import { BlockSpan, ChangeCard, Moves } from '../../components/ChangeCard/ChangeCard';
import { ChangeMetrics } from '../../components/ChangeMetrics/ChangeMetrics';
import { ChangeTrace } from '../../components/ChangeTrace/ChangeTrace';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { StatePill } from '../../components/StatePill/StatePill';
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { TransientBar } from '../../components/TransientBar/TransientBar';
import '../../shared.css';
import './ChangesScreen.css';

type Layout = 'phone' | 'desktop';
type View = 'changes' | 'previous';

export type ChangesScreenProps = {
  layout: Layout;
  store: ChangesStore;
  /** `stale`: its answers are an earlier read's, since reading them again failed (§2.5, 2026-10-14). */
  state?: 'ready' | 'loading' | 'unavailable' | 'stale';
  /** What ending the active change serves: the store read after it. */
  end?: { after: ChangesStore };
  /** Start with the End confirmation open. */
  confirming?: boolean;
  /** Start on the Previous list. */
  view?: View;
  /** The live engine's End: resolves once the answers are read again, rejects when not saved. */
  writes?: { end: () => Promise<void> };
  nav?: NavHooks;
  /** Unavailable's Retry. */
  onRetry?: () => void;
};

const dayCount = () => sourced<number>('prompts[answer=null].length');

/** The change's name, as its card titles it. */
function Name({ data }: { data: ChangeData }) {
  if (data.kind === 'trial') return <>{data.title}{data.block && <> <BlockSpan block={data.block} /></>}</>;
  if (data.kind === 'focus') return <>{data.habit}</>;
  return null;
}

function Confirm({ data, onEnd, onCancel }: { data: ChangeData; onEnd: () => void; onCancel: () => void }) {
  return (
    <>
      <h2 className="ui-changes__confirm-title"><Name data={data} /></h2>
      <div className="ui-changes__confirm-actions">
        <Button kind="primary" label="End" onClick={onEnd} />
        <div className="ui-changes__cancel"><Button kind="text" label="Cancel" onClick={onCancel} /></div>
      </div>
    </>
  );
}

/** What an active Trial did to glucose, module by module. */
function Modules({ data }: { data: TrialData }) {
  return (
    <>
      {data.trace && <ChangeTrace data={data.trace} block={data.block} />}
      <ChangeMetrics rows={data.ranges} count={data.readings} />
      <ChangeMetrics rows={data.glucose} count={data.readings} />
      <ChangeMetrics rows={data.basal}
        title={<>Basal <span className="ui-metrics__meta">vs Pump profile</span></>} />
    </>
  );
}

/** One previous change: its name and block, the date and its result, then
 *  what moved, in the list's shared columns. */
function Previous({ row }: { row: PreviousRow }) {
  return (
    <ListRow
      label={<span className="ui-changes__previous">
        <span className="ui-changes__previous-title">
          {row.title}{row.block && <> <BlockSpan block={row.block} /></>}
        </span>
        <span className="ui-changes__previous-date"><Num value={row.date} /></span>
        <Moves moves={row.moves} />
      </span>}
      value={row.result ? <StatePill state={row.result} /> : undefined} />
  );
}

/** One Setting waiting for the pump after a Done (#518), in the Previous rows'
 *  columns: its name and block, then current → suggested. No date, no result. */
function Waiting({ row }: { row: WaitingRow }) {
  return (
    <ListRow
      label={<span className="ui-changes__previous">
        <span className="ui-changes__previous-title">
          {row.title}{row.block && <> <BlockSpan block={row.block} /></>}
        </span>
        <Moves moves={row.moves} />
      </span>} />
  );
}

export function ChangesScreen({
  layout, store, state = 'ready', end, confirming = false, view: initialView = 'changes', writes, nav, onRetry,
}: ChangesScreenProps) {
  const [ended, setEnded] = useState(false);
  const [asking, setAsking] = useState(confirming);
  const [view, setView] = useState<View>(initialView);
  const [notSaved, setNotSaved] = useState(false);
  // Live: End confirmed, until its write resolves or is refused.
  const [ending, setEnding] = useState(false);
  const root = useMotionGate<HTMLDivElement>();
  const shown = ended && end ? end.after : store;
  const ready = state === 'ready' || state === 'stale';
  const active: ChangeData = ready ? change(shown, ending) : { kind: 'none' };
  const count = ready ? previousCount(shown, ending) : null;
  const pending = ready ? waiting(shown) : [];
  // The confirmation stays while it closes, and keeps the change it asked about.
  const asked = usePresence(asking && ready);
  const askedAbout = useRef(active);
  if (asking) askedAbout.current = active;
  const previous = view === 'previous' && ready;

  const liveEnd = () => {
    setNotSaved(false);
    if (!writes) return;
    setEnding(true);
    writes.end().then(() => setEnding(false), () => {
      setEnding(false);
      setNotSaved(true);
      // Previous is never empty (§1.3): with no previous change served, back to Changes.
      if (previousCount(shown).value === 0) setView('changes');
    });
  };
  const doEnd = () => {
    setAsking(false);
    if (writes) liveEnd();
    else if (end) setEnded(true);
  };
  const cancel = () => setAsking(false);

  useEffect(() => {
    if (!asking) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Stale keeps the screen it shows, with Unavailable and Retry in its title row.
  const unavailable = { trailing: 'unavailable', onRetry } as const;
  const header = state === 'unavailable'
    ? <ScreenHeader title="Changes" layout={layout} {...unavailable} />
    : previous
      ? <ScreenHeader key={view} title="Previous" layout={layout} back={{ label: 'Changes', onBack: () => setView('changes') }}
          {...(state === 'stale' ? unavailable : {})} />
      : <ScreenHeader key={view} title="Changes" layout={layout} {...(state === 'stale' ? unavailable : {})} />;
  const push = previous ? 'forward' : 'back';

  const popover = layout === 'desktop' && asked.value && (
    <section className="ui-popover ui-popover--end ui-changes__confirm" role="dialog" aria-label="End" {...asked.exit}>
      <Confirm data={askedAbout.current} onEnd={doEnd} onCancel={cancel} />
    </section>
  );

  const content = state === 'loading'
    ? (
      <>
        <span className="ui-skeleton ui-changes__skeleton" aria-hidden="true" />
        <span className="ui-skeleton ui-changes__skeleton ui-changes__skeleton--trace" aria-hidden="true" />
      </>
    )
    : ready && (previous
      ? (
        <ListGroup>
          {previousChanges(shown, ending).map((row) => <Previous key={row.id} row={row} />)}
        </ListGroup>
      )
      : (
        <>
          <ChangeCard data={active} onEnd={() => setAsking(true)} confirm={popover} />
          {active.kind === 'trial' && <Modules data={active} />}
          {pending.length > 0 && (
            <ListGroup caption="Waiting for pump">
              {pending.map((row) => <Waiting key={row.subject} row={row} />)}
            </ListGroup>
          )}
          {count && count.value > 0 && (
            <ListGroup>
              <ListRow label="Previous" value={<Num value={count} />} onOpen={() => setView('previous')} />
            </ListGroup>
          )}
        </>
      ));

  const barShown = usePresence(notSaved);
  const bar = barShown.value && (
    <div className="ui-changes__bar" {...barShown.exit}>
      <TransientBar kind="not_saved" onRetry={liveEnd} layout={layout} />
    </div>
  );

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-changes ui-changes--phone">
        <div className="ui-changes__head" data-push={push}>{header}</div>
        <main className="ui-changes__main" data-scroll="page" data-push={push}>
          <div key={`${view}-body`} className="ui-changes__body ui-push">{content}</div>
        </main>
        {bar}
        <NavBar layout="tabbar" selected="changes" dayCount={dayCount()} {...nav} />
        {asked.value && (
          <div className="ui-scrim ui-changes__scrim" onClick={cancel} {...asked.exit}>
            <section className="ui-sheet ui-changes__confirm" role="dialog" aria-label="End"
              onClick={(event) => event.stopPropagation()}>
              <span className="ui-sheet__grabber" aria-hidden="true" />
              <Confirm data={askedAbout.current} onEnd={doEnd} onCancel={cancel} />
            </section>
          </div>
        )}
      </div>
    );
  }
  return (
    <div ref={root} className="ui-changes ui-changes--desktop">
      <NavBar layout="rail" selected="changes" dayCount={dayCount()} {...nav} />
      <section className="ui-changes__pane" data-scroll="page" data-push={push}>
        {header}
        <div key={`${view}-body`} className="ui-changes__body ui-push">{content}</div>
        {bar}
      </section>
    </div>
  );
}
