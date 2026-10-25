// The Queue screen (§1.1, §1.3, §1.4 and the brief's Queue section), composed
// only from the library's components.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar; the open item shows its card in the row's place (accordion; the others
// stay rows). Snooze is a swipe on the phone (§2.5, 2026-10-23; ADR 614): the
// open card swipes as a row does (SnoozeSwipe), and draws no Snooze text
// action. The open card's chevron closes it to its row, leaving nothing open
// (`closed`, this screen's own state, which only the chevron sets and only a
// row's tap clears); a tab change mounts the screen again with the top card
// open. No correction factor is
// queued (§2.5, 2026-10-20). A standalone habit
// is a Pattern's row and card with its own glyph, its Focus one on the habit
// itself (ADR 528). A quiet "Snoozed · N" row ends the list when anything is
// snoozed, and drills down to the Snoozed list (§2.2 Drill-down: "‹ Queue",
// each its Queue row with Until and Restore); back returns with the same
// item open.
//
// A multi-cause Pattern's card has no Focus: its chart opens the drill-down
// (drill-down.md, ADR 594), "‹ Queue" over the Pattern's title and one open
// card per served cause in the served order, each with its count over the
// Pattern's, its own trace against Typical and its own Focus in its head; the
// screen has no primary and no Snooze. Phone: it replaces the Queue above the
// tab bar and scrolls as one page. Desktop: it fills the detail pane, its cards
// in a grid no narrower than the phone's card, the list beside it; selecting
// another row closes it. Every drill-down (this and Snoozed) pushes the one
// router's history entry, so "‹ Queue", the platform's Back and, on desktop,
// Escape return to the Queue with the same item open; the address never
// changes. While it waits for its answers it draws a skeleton per cause it
// opened with.
//
// Every Focus button follows the served admission (`focusable`), and a cause
// card's its cause's `pinnable`: nothing is drawn, and nothing says why, where
// the engine would refuse one (ADR 594).
// After a snooze the TransientBar sits above the tab bar with Undo. Desktop:
// the rail, the ranked list on the left (the selected row marked; the Snoozed
// list drills down inside this pane and the open item stays), and the open
// item on the right, up to a
// reading width, with the Snooze text action beneath its primary, no chevron
// and no swipe (shortcut S; ↑/↓ move the selection), the bar at the foot of
// that pane.
// Each pane scrolls as a whole; nothing scrolls inside a card (§2.3).
//
// Motion: the drill-down pushes in from the right and back from the left; a
// row the person opens on the phone grows into its card; the bar rises.
//
// A snooze shows what the engine served after that snooze: the `after` store's
// Queue, its Snoozed count, and the bar's date (the decision time plus the
// fourteen days of a snooze). Undo shows the store as it was.
//
// Live (`writes`, #495): each write draws the store as it will leave it the
// moment it is made (ADR 629). Snooze — the text action and S on desktop, or a
// row's or the open card's full swipe on the phone — puts the item in Snoozed,
// one more in its count, and raises "Snoozed until <date>" with Undo, the date
// fourteen days after the write was made; Restore, or that Undo, puts it back
// in the Queue at its served priority; Focus shows the Focus pill on the card
// pressed (a cause's Focus names its lever), offers no other Focus, and raises
// "Focus started" with Changes, which opens that tab. Each write resolves once
// the engine's answers are read again, and the screen then draws what the
// engine served, which is what it drew: the snooze bar then dates from the
// served decision time.
// A write that fails puts the item back as it was, with "Not saved" and Retry
// in the bar, which outranks every other bar until Retry saves it or the engine
// no longer serves its item. Once Retry leaves nothing refused, the bar is the
// own bar of the last Done or Focus that Retry saved, as on a first save, and
// otherwise none. The writes in flight and the refused ones are the
// live adapter's (`held`, #610), so a tab change keeps both; the screen keeps
// neither, and draws a write in flight through the Queue model.
//
// Done (#518) is a Setting card's primary, where Focus sits on a Pattern card:
// it takes the card out of the Queue at once and the bar reads "Waiting for
// pump" with Undo (⌘Z on desktop), which puts it back at once. Snooze stays the text
// action beneath it on desktop, and the card's swipe on the phone. A card the
// engine serves back after a sync found the setting unchanged carries the Not
// on pump pill, on its row and its card. In a story, Done shows the `done.after`
// store, as Snooze shows `snooze.after`.
import { useEffect, useRef, useState } from 'react';
import type { Sourced } from '../../answers';
import { sourced } from '../../answers';
import { useMotionGate, usePresence } from '../../motion';
import { Num } from '../../Num';
import {
  causes, focusable, pattern, queuedCount, ranking, snoozed, snoozedCount, type Held, type QueueItem, type QueueStore,
} from '../../queue-model';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
import { PatternCard } from '../../components/PatternCard/PatternCard';
import { QueueRow, SnoozeSwipe } from '../../components/QueueRow/QueueRow';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { SettingCard } from '../../components/SettingCard/SettingCard';
import { TransientBar } from '../../components/TransientBar/TransientBar';
import './QueueScreen.css';

type Layout = 'phone' | 'desktop';

export type QueueScreenProps = {
  layout: Layout;
  store: QueueStore;
  /** `stale`: its answers are an earlier read's, since reading them again failed (§2.5, 2026-10-14). */
  state?: 'ready' | 'loading' | 'unavailable' | 'stale';
  /** The item open first; the top of the ranking when unset. */
  open?: string;
  /** `causes`: the open multi-cause Pattern's drill-down. */
  view?: View;
  /** The drill-down a Back from another tab returned to (ADR 594): it opens as it was. */
  returnTo?: DrillDown;
  /** Phone: the row, or the open card, held mid-swipe over its Snooze reveal. */
  swiping?: string;
  /** Phone: start with the open card closed to its row, nothing open. */
  closed?: boolean;
  /** What snoozing `subject` serves: the store read after it, and the bar's date. */
  snooze?: { subject: string; after: QueueStore; until: Sourced<string> };
  /** Start just after that snooze, with the bar showing. */
  justSnoozed?: boolean;
  /** What a Done on `subject`'s Setting card serves: the store read after it (#518). */
  done?: { subject: string; after: QueueStore };
  /** The live engine's writes; without them a snooze shows `snooze.after`. */
  writes?: QueueWrites;
  nav?: NavHooks & { drillDown?: DrillDownHooks };
  /** Unavailable's Retry. */
  onRetry?: () => void;
};

type View = 'queue' | 'snoozed' | 'causes';

/** Which drill-down is open: Snoozed, or a Pattern's causes, with the title and
 *  the count of causes it opened with, which it draws while its answers load. */
export type DrillDown = { view: Exclude<View, 'queue'>; subject?: string; title?: string; causes?: number };

/** The app's one router, for a drill-down (ADR 594): `open` pushes its history
 *  entry, marked with which drill-down it is, `close` goes Back through it, and
 *  `onReturn` calls back on a Back that left it, returning the unsubscribe.
 *  Without them a drill-down closes itself. */
export type DrillDownHooks = {
  open: (drillDown: DrillDown) => void;
  close: () => void;
  onReturn: (listener: () => void) => () => void;
};

/** A refused Queue write, held until it saves (#610). */
export type Refused = { kind: 'snooze' | 'restore' | 'done' | 'undoDone' | 'pin'; subject: string; lever?: string };

/** Each resolves once the engine's answers are read again, and rejects when the write was not saved. */
export type QueueWrites = {
  snooze: (subject: string) => Promise<void>;
  restore: (subject: string) => Promise<void>;
  /** A Focus on the item, or on its cause `lever` (ADR 594). */
  pin: (subject: string, lever?: string) => Promise<void>;
  done: (subject: string) => Promise<void>;
  undoDone: (subject: string) => Promise<void>;
  /** The newest write in flight on each subject, the Focus in flight, the refused writes, and each restored
   *  Pattern's case file while it is read, settling once it lands (ADR 629). */
  held: () => Held & { refused: readonly Refused[]; reading: ReadonlyMap<string, Promise<void>> };
  /** Send every refused write again; it resolves with those that saved. */
  retry: () => Promise<readonly Refused[]>;
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
  return <QueueRow kind={item.kind} title={item.data.title} magnitude={item.data.magnitude!}
    impact={item.data.impact} layout={layout} selected={selected} swiping={swiping} onSelect={onSelect}
    onSnooze={onSnooze} snoozed={snoozed} />;
}

/** The open item's card. `focusable` is the served admission; `onOpen` opens a
 *  multi-cause Pattern's drill-down. `actions` are what the live app adds:
 *  Focus, a matured Trial's link to Changes, and, while a restored Pattern's
 *  case file is read, the card's skeleton in its place (ADR 629). */
type CardActions = { onPin?: () => void; onChanges?: () => void; reading?: boolean };

/** The screen decides which Snooze a layout gets (ADR 614): desktop passes
 *  `onSnooze`, its text action; the phone passes `onCollapse`, its chevron, and
 *  swipes the card instead. */
function Card({ item, focusable, onOpen, onSnooze, onCollapse, onDone, actions = {} }: {
  item: QueueItem; focusable: boolean; onOpen: () => void; onSnooze?: () => void; onCollapse?: () => void;
  onDone: () => void; actions?: CardActions;
}) {
  if (actions.reading) return <PatternCard loading />;
  return item.kind === 'setting'
    ? <SettingCard data={item.data} onDone={onDone} onSnooze={onSnooze} onCollapse={onCollapse}
        onChanges={actions.onChanges} />
    : <PatternCard data={item.data} onSnooze={onSnooze}
        onCollapse={onCollapse} onPin={actions.onPin} focusable={focusable} onOpen={onOpen} />;
}

/** Phone: an item is its row, or its card in the row's place while open. A card
 *  the person opens grows out of its row, and a card that closes (its chevron)
 *  shrinks back into it before the row returns. Row and card swipe to Snooze
 *  alike, by the one SnoozeSwipe. A card swiped to Snooze stays its card until
 *  it has left and is snoozed, whatever else opens meanwhile: taking it away
 *  first would drop the snooze its exit ends in. */
function PhoneItem({ item, open, grows, swiping, focusable, onOpen, onSelect, onSnooze, onCollapse, onDone, actions }: {
  item: QueueItem; open: boolean; grows: boolean; swiping: boolean; focusable: boolean; onOpen: () => void;
  onSelect: () => void; onSnooze: () => void; onCollapse: () => void; onDone: () => void; actions?: CardActions;
}) {
  const [leaving, setLeaving] = useState(false);
  const card = usePresence(open || leaving);
  if (!card.value) {
    return <Row item={item} layout="phone" swiping={swiping} onSelect={onSelect} onSnooze={onSnooze} />;
  }
  return (
    <div className={grows || card.closing ? 'ui-queue__open ui-expand' : 'ui-queue__open'} {...card.exit}>
      <SnoozeSwipe held={swiping} onCommit={onSnooze} onLeaving={setLeaving}>
        <Card item={item} focusable={focusable} onOpen={onOpen} onCollapse={onCollapse} onDone={onDone}
          actions={actions} />
      </SnoozeSwipe>
    </div>
  );
}

/** The bar: the stories' simulated snooze or Done, a live snooze or Done with its subject, a started
 *  Focus, or a refused write held. */
type Bar = { kind: 'story' } | { kind: 'story_done' } | { kind: 'snoozed'; subject: string }
  | { kind: 'waiting'; subject: string } | { kind: 'focused' } | { kind: 'not_saved' };
const STORY_BAR: Bar = { kind: 'story' };
const STORY_DONE_BAR: Bar = { kind: 'story_done' };
const NOT_SAVED_BAR: Bar = { kind: 'not_saved' };
const NONE_HELD: ReturnType<QueueWrites['held']> = { inFlight: new Map(), focus: null, refused: [], reading: new Map() };

export function QueueScreen({
  layout, store, state = 'ready', open, view: viewProp = 'queue', returnTo, swiping, closed: closedAtMount = false,
  snooze, justSnoozed = false, done, writes, nav, onRetry,
}: QueueScreenProps) {
  const [snoozedNow, setSnoozedNow] = useState(justSnoozed);
  const [doneNow, setDoneNow] = useState(false);
  const initialView = returnTo?.view ?? viewProp;
  const [view, setView] = useState<View>(initialView);
  // The row the person opened on the phone, which grows into its card.
  const [expanded, setExpanded] = useState<string>();
  // Phone: the open card closed to its row by its chevron, so nothing is open;
  // a row's tap clears it. Nothing else sets or clears it (ADR 614).
  const [closed, setClosed] = useState(closedAtMount);
  const root = useMotionGate<HTMLDivElement>();
  const shown = snoozedNow && snooze ? snooze.after : doneNow && done ? done.after : store;
  const ready = state === 'ready' || state === 'stale';
  // Live: the adapter's writes in flight and refused, and the Focus in flight (its
  // subject and any cause's lever), drawn by the Queue model.
  const held = writes?.held() ?? NONE_HELD;
  // The Pattern a drill-down was opened on, with its title and how many causes
  // it served then, which its skeleton draws while it waits. One the Queue no
  // longer ranks (a drill-down returned to from history, the answers moved under
  // it) keeps only its subject, and the Queue shows instead.
  const opening = (subject?: string) => {
    const ranked = ready && subject ? ranking(shown, held).some((i) => i.subject === subject) : false;
    const key = subject?.replace(/^pattern:/, '');
    return key ? { subject: subject!, title: ranked ? pattern(shown, key).title : '',
      causes: ranked ? causes(shown, key).length : 0 } : undefined;
  };
  // A drill-down returned to from history opens as it was, before its answers land.
  const [drill, setDrill] = useState(() => (initialView !== 'causes' ? undefined
    : returnTo ? { subject: returnTo.subject!, title: returnTo.title ?? '', causes: returnTo.causes ?? 0 }
      : opening(open)));
  const router = nav?.drillDown;
  const go = (to: View, subject?: string) => {
    setExpanded(undefined);
    const opened = to === 'causes' ? opening(subject) : undefined;
    if (opened) setDrill(opened);
    if (to !== 'queue') router?.open(opened ? { view: 'causes', ...opened } : { view: to as 'snoozed' });
    setView(to);
  };
  /** Back to the Queue: through the router's history entry, whose Back closes the drill-down. */
  const leave = () => (router ? router.close() : setView('queue'));
  const returned = useRef(() => setView('queue'));
  useEffect(() => router?.onReturn(() => returned.current()), [router]);
  const push = view === 'queue' ? 'back' : 'forward';
  const [liveBar, setLiveBar] = useState<Bar | null>(null);
  const items = ready ? ranking(shown, held) : [];
  // The item a story opens must be in the Queue it opens on.
  if (open && ready && !justSnoozed && !ranking(store).some((i) => i.subject === open)) {
    throw new Error(`${store} serves no ${open} in its Queue`);
  }
  const [selected, setSelected] = useState<string | undefined>(returnTo?.subject ?? open ?? items[0]?.subject);
  const current = items.find((i) => i.subject === selected) ?? items[0];
  /** Desktop: another row shows that item, and closes a drill-down. */
  const select = (subject: string) => {
    if (view === 'causes') leave();
    setSelected(subject);
  };
  const snoozedTotal = ready ? snoozedCount(shown, held) : null;

  // Each write's bar rises as it is made (ADR 629). A refused write is the adapter's to hold, and its bar
  // outranks this one; a refusal clears the write's own bar, and an Undo's refusal has none.
  const raise = (bar: Bar, written: Promise<void>) => {
    setLiveBar(bar);
    written.catch(() => setLiveBar((now) => (now === bar ? null : now)));
  };
  const ignored = () => undefined;
  const liveSnooze = (subject: string) => raise({ kind: 'snoozed', subject }, writes!.snooze(subject));
  const liveRestore = (subject: string) => {
    setLiveBar(null);
    writes!.restore(subject).catch(ignored);
  };
  /** Undo moves the item back and clears the bar at once. */
  const liveUndo = (subject: string) => {
    setLiveBar(null);
    setSelected(subject);
    writes!.restore(subject).catch(ignored);
  };
  const liveDone = (subject: string) => raise({ kind: 'waiting', subject }, writes!.done(subject));
  const liveUndoDone = (subject: string) => {
    setLiveBar(null);
    setSelected(subject);
    writes!.undoDone(subject).catch(ignored);
  };
  /** Retry: once nothing refused is held, the bar of the last Done or Focus it saved, else none (#610). */
  const liveRetry = () => {
    writes!.retry().then((saved) => {
      const last = writes!.held().refused.length > 0 ? undefined
        : saved.filter((write) => write.kind === 'done' || write.kind === 'pin').at(-1);
      setLiveBar(last?.kind === 'done' ? { kind: 'waiting', subject: last.subject } : last ? { kind: 'focused' } : null);
    });
  };
  const livePin = (subject: string, lever?: string) => raise({ kind: 'focused' }, writes!.pin(subject, lever));
  const changes = nav?.onSelect && (() => nav.onSelect!('changes'));
  const actions = (item: QueueItem): CardActions | undefined => writes && {
    onPin: () => livePin(item.subject),
    onChanges: changes,
    reading: held.reading.has(item.subject),
  };
  // A restored Pattern's case file, once it lands, draws its card in full.
  const [, caseFileLanded] = useState(0);
  const readingKeys = [...held.reading.keys()].join(' ');
  useEffect(() => {
    let mounted = true;
    held.reading.forEach((read) => read.then(() => { if (mounted) caseFileLanded((n) => n + 1); }));
    return () => { mounted = false; };
  }, [readingKeys]);

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
  /** Done on the open Setting card (#518). */
  const doDone = (subject: string) => {
    if (writes) {
      liveDone(subject);
      return;
    }
    if (!done || subject !== done.subject) return;
    setDoneNow(true);
    setSelected(ranking(done.after)[0]?.subject);
  };
  const undoDone = () => { setDoneNow(false); setSelected(done?.subject); };
  const barShown = usePresence(held.refused.length > 0 ? NOT_SAVED_BAR
    : liveBar ?? (snoozedNow && snooze ? STORY_BAR : doneNow && done ? STORY_DONE_BAR : null));

  useEffect(() => {
    if (layout !== 'desktop' || view === 'snoozed') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (view === 'causes' && event.key === 'Escape') leave();
      if (view === 'queue' && (event.key === 's' || event.key === 'S')) doSnooze();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const at = items.findIndex((i) => i.subject === current?.subject);
        const next = items[Math.min(Math.max(at + (event.key === 'ArrowDown' ? 1 : -1), 0), items.length - 1)];
        if (next) { event.preventDefault(); select(next.subject); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The drill-down's Pattern, while the Queue still ranks it, and its causes.
  const drilled = view === 'causes' ? items.find((i) => i.subject === drill?.subject) : undefined;
  const causeView = view === 'causes' && (drilled !== undefined || !ready);
  // A drill-down whose Pattern the Queue no longer ranks (returned to from
  // history, or the answers moved under it) leaves through the router, so the
  // screen and the history agree and the next Back is not a dead step.
  const orphaned = view === 'causes' && ready && drilled === undefined;
  useEffect(() => { if (orphaned) leave(); }, [orphaned]);
  const drillTitle = drilled?.data.title ?? drill?.title ?? '';
  const backTo = { label: 'Queue', onBack: leave };
  const queueHeader = state === 'unavailable' || (state === 'stale' && view !== 'snoozed')
    ? <ScreenHeader key="queue" title="Queue" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : <ScreenHeader key="queue" title="Queue" layout={layout} />;
  // Stale beats falsely current: the drill-down's header carries the mark the
  // Queue's does, on the phone where it is the only header.
  const causeHeader = state === 'unavailable' || (state === 'stale' && layout === 'phone')
    ? <ScreenHeader key="causes" title={drillTitle} trailing="unavailable" layout={layout} back={backTo} onRetry={onRetry} />
    : <ScreenHeader key="causes" title={drillTitle} layout={layout} back={backTo} />;
  const header = view === 'snoozed'
    ? (state === 'unavailable' ? queueHeader
      : <ScreenHeader key={view} title="Snoozed" layout={layout} back={backTo} />)
    : causeView && layout === 'phone' ? causeHeader : queueHeader;

  // The drill-down's cards: one per served cause, in the served order, or a
  // skeleton per cause it opened with while it waits (ADR 594).
  const causeCards = !causeView ? null : state === 'loading'
    ? Array.from({ length: drill?.causes ?? 0 }, (_, i) => <PatternCard key={i} loading />)
    : drilled && causes(shown, drilled.subject.replace(/^pattern:/, '')).map((cause) => (
      <PatternCard key={cause.subject} pin="secondary"
        data={held.focus?.subject === drilled.subject && held.focus.lever === cause.lever
          ? { ...cause, pinned: true } : cause}
        focusable={focusable(shown, held) && cause.pinnable}
        onPin={writes && (() => livePin(drilled.subject, cause.lever))} />
    ));

  const footer = snoozedTotal && snoozedTotal.value > 0 && (
    <ListGroup>
      <ListRow label="Snoozed" value={<Num value={snoozedTotal} />} onOpen={() => go('snoozed')} />
    </ListGroup>
  );

  const list = state === 'loading'
    ? [0, 1, 2, 3].map((i) => <QueueRow key={i} loading layout={layout} />)
    : view === 'snoozed'
      ? (ready ? snoozed(shown, held) : []).map((s) => (
          <Row key={s.subject} item={s} layout={layout} until={s.until}
            onRestore={writes && (() => liveRestore(s.subject))} />))
      : items.length === 0 && ready
        ? <p className="ui-queue__empty"><Num value={queuedCount(shown, held)} /> patterns</p>
        : items.map((item) => (layout === 'phone'
          ? <PhoneItem key={item.subject} item={item} open={!closed && item.subject === current?.subject}
              grows={item.subject === expanded} swiping={item.subject === swiping} focusable={focusable(shown, held)}
              onOpen={() => go('causes', item.subject)}
              onSelect={() => { setClosed(false); setSelected(item.subject); setExpanded(item.subject); }}
              onSnooze={() => doSnooze(item.subject)} onCollapse={() => setClosed(true)}
              onDone={() => doDone(item.subject)} actions={actions(item)} />
          : <Row key={item.subject} item={item} layout={layout} selected={item.subject === current?.subject}
              onSelect={() => select(item.subject)} />));

  const shownBar = barShown.value;
  const liveUntil = shownBar?.kind === 'snoozed' && ready
    ? snoozed(shown, held).find((s) => s.subject === shownBar.subject)?.until : undefined;
  const barContent = shownBar?.kind === 'not_saved'
    ? <TransientBar kind="not_saved" onRetry={liveRetry} layout={layout} />
    : shownBar?.kind === 'focused'
      ? <TransientBar kind="focused" onChanges={changes} layout={layout} />
    : shownBar?.kind === 'snoozed'
      ? liveUntil && <TransientBar kind="snoozed" until={liveUntil} onUndo={() => liveUndo(shownBar.subject)} layout={layout} />
      : shownBar?.kind === 'waiting'
        ? <TransientBar kind="waiting" onUndo={() => liveUndoDone(shownBar.subject)} layout={layout} />
        : shownBar?.kind === 'story_done'
          ? <TransientBar kind="waiting" onUndo={undoDone} layout={layout} />
          : shownBar?.kind === 'story' && <TransientBar kind="snoozed" until={snooze!.until} onUndo={undo} layout={layout} />;
  const bar = barContent && <div className="ui-queue__bar" {...barShown.exit}>{barContent}</div>;

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-queue ui-queue--phone">
        <div className="ui-queue__head" data-push={push}>{header}</div>
        <main className="ui-queue__main" data-scroll="page" data-push={push}>
          {causeView ? (
            <div key="causes-list" className="ui-queue__list ui-queue__causes ui-push">{causeCards}</div>
          ) : (
            <div key={`${view}-list`} className="ui-queue__list ui-push">
              {state === 'loading' && <PatternCard loading />}
              {list}
              {view === 'queue' && ready && footer}
            </div>
          )}
        </main>
        {bar}
        <NavBar layout="tabbar" selected="queue" dayCount={dayCount()} onSelect={nav?.onSelect}
          syncFailed={nav?.syncFailed} />
      </div>
    );
  }
  // Desktop: the list stays the Queue's while the detail pane drills down.
  const listView = view === 'causes' ? 'queue' : view;
  return (
    <div ref={root} className="ui-queue ui-queue--desktop">
      <NavBar layout="rail" selected="queue" dayCount={dayCount()} onSelect={nav?.onSelect} syncFailed={nav?.syncFailed} />
      <section className="ui-queue__pane ui-queue__pane--list" data-scroll="page" data-push={view === 'snoozed' ? 'forward' : 'back'}>
        {header}
        <div key={`${listView}-list`} className="ui-queue__list ui-push">
          {list}
          {listView === 'queue' && ready && footer}
        </div>
      </section>
      <section className="ui-queue__pane ui-queue__pane--detail" data-scroll="page" data-push={push}>
        {causeView ? (
          <>
            {causeHeader}
            <div key="causes-list" className="ui-queue__causes ui-push">{causeCards}</div>
          </>
        ) : (
          <>
            {state === 'loading' && <div className="ui-queue__detail"><PatternCard loading /></div>}
            {ready && current && (
              <div key="detail" className="ui-queue__detail ui-push">
                <Card item={current} focusable={focusable(shown, held)} onOpen={() => go('causes', current.subject)}
                  onSnooze={() => doSnooze()} onDone={() => doDone(current.subject)} actions={actions(current)} />
              </div>
            )}
          </>
        )}
        {bar}
      </section>
    </div>
  );
}
