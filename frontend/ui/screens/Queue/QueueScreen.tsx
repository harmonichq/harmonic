// The Queue screen (§1.1, §1.3, §1.4 and the brief's Queue section), composed
// only from the library's components.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar; the open item shows its card in the row's place (accordion; the others
// stay rows), with Snooze as a text action centred beneath Pin, or at a
// Setting card's foot (the swipe is its shortcut). A quiet "Snoozed · N" row ends the list when anything is
// snoozed, and drills down to the Snoozed list (§2.2 Drill-down: "‹ Queue",
// each its Queue row with Until and Restore); back returns with the same
// item open.
// After a snooze the TransientBar sits above the tab bar with Undo. Desktop:
// the rail, the ranked list on the left (the selected row marked; the Snoozed
// list drills down inside this pane and the open item stays), and the open
// item on the right, up to a
// reading width, with the same Snooze text action and no collapse chevron
// (shortcut S; ↑/↓ move the selection), the bar at the foot of that pane.
// Each pane scrolls as a whole; nothing scrolls inside a card (§2.3).
//
// Motion: the drill-down pushes in from the right and back from the left; a
// row the person opens on the phone grows into its card; the bar rises.
//
// A snooze shows what the engine served after that snooze: the `after` store's
// Queue, its Snoozed count, and the bar's date (the decision time plus the
// fourteen days of a snooze). Undo shows the store as it was.
//
// Live (`writes`, #495): Snooze — the text action, S, or a row's full swipe on
// the phone — and Restore take the item out of their list at once; Pin shows
// the Focus pill at once. Each write resolves once the engine's answers are
// read again, so what the screen then shows is what the engine served: the
// snooze bar dates from the served decision time, and Undo restores the item.
// A write that fails puts the item back as it was, with "Not saved" and Retry
// in the bar.
import { useEffect, useState } from 'react';
import type { Sourced } from '../../answers';
import { sourced } from '../../answers';
import { useMotionGate, usePresence } from '../../motion';
import { Num } from '../../Num';
import {
  queuedCount, ranking, snoozed, snoozedCount, type QueueItem, type QueueStore,
} from '../../queue-model';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
import { PatternCard } from '../../components/PatternCard/PatternCard';
import { QueueRow } from '../../components/QueueRow/QueueRow';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { SettingCard } from '../../components/SettingCard/SettingCard';
import { TransientBar } from '../../components/TransientBar/TransientBar';
import './QueueScreen.css';

type Layout = 'phone' | 'desktop';

export type QueueScreenProps = {
  layout: Layout;
  store: QueueStore;
  state?: 'ready' | 'loading' | 'unavailable';
  /** The item open first; the top of the ranking when unset. */
  open?: string;
  view?: 'queue' | 'snoozed';
  /** Phone: the row held mid-swipe over its Snooze reveal. */
  swiping?: string;
  /** What snoozing `subject` serves: the store read after it, and the bar's date. */
  snooze?: { subject: string; after: QueueStore; until: Sourced<string> };
  /** Start just after that snooze, with the bar showing. */
  justSnoozed?: boolean;
  /** The live engine's writes; without them a snooze shows `snooze.after`. */
  writes?: QueueWrites;
  nav?: NavHooks;
  /** Unavailable's Retry. */
  onRetry?: () => void;
};

/** Each resolves once the engine's answers are read again, and rejects when the write was not saved. */
export type QueueWrites = {
  snooze: (subject: string) => Promise<void>;
  restore: (subject: string) => Promise<void>;
  pin: (subject: string) => Promise<void>;
};

const dayCount = () => sourced<number>('prompts[answer=null].length');

function Row({ item, layout, selected, swiping, onSelect, onSnooze, until, onRestore }: {
  item: QueueItem; layout: Layout; selected?: boolean; swiping?: boolean; onSelect?: () => void;
  /** Phone: a full swipe snoozes the row. */
  onSnooze?: () => void;
  /** A Snoozed list row: its served Until, with Restore. */
  until?: Sourced<string>;
  onRestore?: () => void;
}) {
  const snoozed = until && { until, onRestore };
  if (item.kind === 'setting') {
    return <QueueRow kind="setting" title={item.data.title} setting={item.data} layout={layout}
      selected={selected} swiping={swiping} onSelect={onSelect} onSnooze={onSnooze} snoozed={snoozed} />;
  }
  return <QueueRow kind="pattern" title={item.data.title} magnitude={item.data.magnitude!}
    cause={item.data.causes[0]?.title} layout={layout} selected={selected} swiping={swiping} onSelect={onSelect}
    onSnooze={onSnooze} snoozed={snoozed} />;
}

/** The open item's card. `actions` are what the live app adds: Pin, the
 *  Focus pill while a Pin is in flight, and a matured Trial's link to Changes. */
type CardActions = { onPin?: () => void; pinned?: boolean; onChanges?: () => void };

function Card({ item, layout, onSnooze, actions = {} }: {
  item: QueueItem; layout: Layout; onSnooze: () => void; actions?: CardActions;
}) {
  return item.kind === 'setting'
    ? <SettingCard data={item.data} onSnooze={onSnooze} onChanges={actions.onChanges} />
    : <PatternCard data={actions.pinned ? { ...item.data, pinned: true } : item.data} onSnooze={onSnooze}
        onPin={actions.onPin} collapsible={layout === 'phone'} />;
}

/** Phone: an item is its row, or its card in the row's place while open. A card
 *  the person opens grows out of its row, and a card that closes shrinks back
 *  into it before the row returns. */
function PhoneItem({ item, open, grows, swiping, onSelect, onSnooze, actions }: {
  item: QueueItem; open: boolean; grows: boolean; swiping: boolean; onSelect: () => void; onSnooze: () => void;
  actions?: CardActions;
}) {
  const card = usePresence(open);
  if (!card.value) {
    return <Row item={item} layout="phone" swiping={swiping} onSelect={onSelect} onSnooze={onSnooze} />;
  }
  return (
    <div className={grows || card.closing ? 'ui-queue__open ui-expand' : 'ui-queue__open'} {...card.exit}>
      <Card item={item} layout="phone" onSnooze={onSnooze} actions={actions} />
    </div>
  );
}

/** The bar: the stories' simulated snooze, a live snooze with its subject, or a failed write. */
type Bar = { kind: 'story' } | { kind: 'snoozed'; subject: string } | { kind: 'not_saved'; retry: () => void };
const STORY_BAR: Bar = { kind: 'story' };

export function QueueScreen({
  layout, store, state = 'ready', open, view: initialView = 'queue', swiping, snooze, justSnoozed = false,
  writes, nav, onRetry,
}: QueueScreenProps) {
  const [snoozedNow, setSnoozedNow] = useState(justSnoozed);
  const [view, setView] = useState(initialView);
  // The row the person opened on the phone, which grows into its card.
  const [expanded, setExpanded] = useState<string>();
  const root = useMotionGate<HTMLDivElement>();
  const go = (to: typeof view) => { setExpanded(undefined); setView(to); };
  const push = view === 'snoozed' ? 'forward' : 'back';
  const shown = snoozedNow && snooze ? snooze.after : store;
  const ready = state === 'ready';
  // Live: the items a snooze or restore in flight has taken out, the Pin in
  // flight, and the live bar.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [pinning, setPinning] = useState<string>();
  const [liveBar, setLiveBar] = useState<Bar | null>(null);
  const items = ready ? ranking(shown).filter((i) => !hidden.has(i.subject)) : [];
  // The item a story opens must be in the Queue it opens on.
  if (open && ready && !justSnoozed && !ranking(store).some((i) => i.subject === open)) {
    throw new Error(`${store} serves no ${open} in its Queue`);
  }
  const [selected, setSelected] = useState<string | undefined>(open ?? items[0]?.subject);
  const current = items.find((i) => i.subject === selected) ?? items[0];
  const snoozedTotal = ready ? snoozedCount(shown) : null;

  const hide = (subject: string, out: boolean) => setHidden((now) => {
    const next = new Set(now);
    if (out) next.add(subject); else next.delete(subject);
    return next;
  });
  const notSaved = (retry: () => void) => () => setLiveBar({ kind: 'not_saved', retry });
  const liveSnooze = (subject: string) => {
    hide(subject, true);
    setLiveBar(null);
    writes!.snooze(subject).then(() => setLiveBar({ kind: 'snoozed', subject }), notSaved(() => liveSnooze(subject)))
      .finally(() => hide(subject, false));
  };
  const liveRestore = (subject: string) => {
    hide(subject, true);
    setLiveBar(null);
    writes!.restore(subject).catch(notSaved(() => liveRestore(subject))).finally(() => hide(subject, false));
  };
  const liveUndo = (subject: string) => {
    writes!.restore(subject).then(() => { setLiveBar(null); setSelected(subject); }, notSaved(() => liveUndo(subject)));
  };
  const livePin = (subject: string) => {
    setPinning(subject);
    setLiveBar(null);
    writes!.pin(subject).catch(notSaved(() => livePin(subject))).finally(() => setPinning(undefined));
  };
  const actions = (item: QueueItem): CardActions | undefined => writes && {
    onPin: () => livePin(item.subject),
    pinned: pinning === item.subject,
    onChanges: nav?.onSelect && (() => nav.onSelect!('changes')),
  };

  // What was open before a snooze, which Undo opens again.
  const [before, setBefore] = useState<string>();
  /** Snooze an item: the open one (its Snooze, or S), or a row swiped on the phone. */
  const doSnooze = (subject = current?.subject) => {
    if (writes) {
      if (subject) liveSnooze(subject);
      return;
    }
    if (!snooze || subject !== snooze.subject) return;
    setBefore(current?.subject);
    setSnoozedNow(true);
    if (subject === current?.subject) setSelected(ranking(snooze.after)[0]?.subject);
  };
  const undo = () => { setSnoozedNow(false); setSelected(before ?? snooze?.subject); };
  const barShown = usePresence(liveBar ?? (snoozedNow && snooze ? STORY_BAR : null));

  useEffect(() => {
    if (layout !== 'desktop' || view !== 'queue') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 's' || event.key === 'S') doSnooze();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const at = items.findIndex((i) => i.subject === current?.subject);
        const next = items[Math.min(Math.max(at + (event.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1)];
        if (next) { event.preventDefault(); setSelected(next.subject); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = state === 'unavailable'
    ? <ScreenHeader key={view} title="Queue" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : view === 'snoozed'
      ? <ScreenHeader key={view} title="Snoozed" layout={layout} back={{ label: 'Queue', onBack: () => go('queue') }} />
      : <ScreenHeader key={view} title="Queue" layout={layout} />;

  const footer = snoozedTotal && snoozedTotal.value > 0 && (
    <ListGroup>
      <ListRow label="Snoozed" value={<Num value={snoozedTotal} />} onOpen={() => go('snoozed')} />
    </ListGroup>
  );

  const list = state === 'loading'
    ? [0, 1, 2, 3].map((i) => <QueueRow key={i} loading layout={layout} />)
    : view === 'snoozed'
      ? (ready ? snoozed(shown) : []).filter((s) => !hidden.has(s.subject)).map((s) => (
          <Row key={s.subject} item={s} layout={layout} until={s.until}
            onRestore={writes && (() => liveRestore(s.subject))} />))
      : items.length === 0 && ready
        ? <p className="ui-queue__empty"><Num value={queuedCount(shown)} /> patterns</p>
        : items.map((item) => (layout === 'phone'
          ? <PhoneItem key={item.subject} item={item} open={item.subject === current?.subject}
              grows={item.subject === expanded} swiping={item.subject === swiping}
              onSelect={() => { setSelected(item.subject); setExpanded(item.subject); }}
              onSnooze={() => doSnooze(item.subject)} actions={actions(item)} />
          : <Row key={item.subject} item={item} layout={layout} selected={item.subject === current?.subject}
              onSelect={() => setSelected(item.subject)} />));

  const shownBar = barShown.value;
  const liveUntil = shownBar?.kind === 'snoozed' && ready
    ? snoozed(shown).find((s) => s.subject === shownBar.subject)?.until : undefined;
  const barContent = shownBar?.kind === 'not_saved'
    ? <TransientBar kind="not_saved" onRetry={shownBar.retry} layout={layout} />
    : shownBar?.kind === 'snoozed'
      ? liveUntil && <TransientBar kind="snoozed" until={liveUntil} onUndo={() => liveUndo(shownBar.subject)} layout={layout} />
      : shownBar?.kind === 'story' && <TransientBar kind="snoozed" until={snooze!.until} onUndo={undo} layout={layout} />;
  const bar = barContent && <div className="ui-queue__bar" {...barShown.exit}>{barContent}</div>;

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-queue ui-queue--phone">
        <div className="ui-queue__head" data-push={push}>{header}</div>
        <main className="ui-queue__main" data-scroll="page" data-push={push}>
          <div key={`${view}-list`} className="ui-queue__list ui-push">
            {state === 'loading' && <PatternCard loading />}
            {list}
            {view === 'queue' && ready && footer}
          </div>
        </main>
        {bar}
        <NavBar layout="tabbar" selected="queue" dayCount={dayCount()} {...nav} />
      </div>
    );
  }
  return (
    <div ref={root} className="ui-queue ui-queue--desktop">
      <NavBar layout="rail" selected="queue" dayCount={dayCount()} {...nav} />
      <section className="ui-queue__pane ui-queue__pane--list" data-scroll="page" data-push={push}>
        {header}
        <div key={`${view}-list`} className="ui-queue__list ui-push">
          {list}
          {view === 'queue' && ready && footer}
        </div>
      </section>
      <section className="ui-queue__pane ui-queue__pane--detail" data-scroll="page">
        {state === 'loading' && <div className="ui-queue__detail"><PatternCard loading /></div>}
        {ready && current && (
          <div className="ui-queue__detail">
            <Card item={current} layout={layout} onSnooze={() => doSnooze()} actions={actions(current)} />
          </div>
        )}
        {bar}
      </section>
    </div>
  );
}
