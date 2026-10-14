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
import { useEffect, useState } from 'react';
import type { Sourced } from '../../fixtures';
import { sourced } from '../../fixtures';
import { useMotionGate } from '../../motion';
import { Num } from '../../Num';
import {
  queuedCount, ranking, snoozed, snoozedCount, type QueueItem, type QueueStore,
} from '../../queue-model';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { NavBar } from '../../components/NavBar/NavBar';
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
};

const dayCount = sourced<number>('prompts[answer=null].length');

function Row({ item, layout, selected, swiping, onSelect, until }: {
  item: QueueItem; layout: Layout; selected?: boolean; swiping?: boolean; onSelect?: () => void;
  /** A Snoozed list row: its served Until, with Restore. */
  until?: Sourced<string>;
}) {
  const snoozed = until && { until };
  if (item.kind === 'setting') {
    return <QueueRow kind="setting" title={item.data.title} setting={item.data} layout={layout}
      selected={selected} swiping={swiping} onSelect={onSelect} snoozed={snoozed} />;
  }
  return <QueueRow kind="pattern" title={item.data.title} magnitude={item.data.magnitude!}
    cause={item.data.causes[0]?.title} layout={layout} selected={selected} swiping={swiping} onSelect={onSelect}
    snoozed={snoozed} />;
}

function Card({ item, layout, onSnooze }: { item: QueueItem; layout: Layout; onSnooze: () => void }) {
  return item.kind === 'setting'
    ? <SettingCard data={item.data} onSnooze={onSnooze} />
    : <PatternCard data={item.data} onSnooze={onSnooze} collapsible={layout === 'phone'} />;
}

export function QueueScreen({
  layout, store, state = 'ready', open, view: initialView = 'queue', swiping, snooze, justSnoozed = false,
}: QueueScreenProps) {
  const [snoozedNow, setSnoozedNow] = useState(justSnoozed);
  const [view, setView] = useState(initialView);
  // The row the person opened on the phone, which grows into its card.
  const [expanded, setExpanded] = useState<string>();
  const root = useMotionGate<HTMLDivElement>();
  const go = (to: typeof view) => { setExpanded(undefined); setView(to); };
  const push = view === 'snoozed' ? 'forward' : 'back';
  const shown = snoozedNow && snooze ? snooze.after : store;
  const items = state === 'ready' ? ranking(shown) : [];
  // The item a story opens must be in the Queue it opens on.
  if (open && state === 'ready' && !justSnoozed && !ranking(store).some((i) => i.subject === open)) {
    throw new Error(`${store} serves no ${open} in its Queue`);
  }
  const [selected, setSelected] = useState<string | undefined>(open ?? items[0]?.subject);
  const current = items.find((i) => i.subject === selected) ?? items[0];
  const snoozedTotal = snoozedCount(shown);

  const doSnooze = () => {
    if (!snooze || current?.subject !== snooze.subject) return;
    setSnoozedNow(true);
    setSelected(ranking(snooze.after)[0]?.subject);
  };
  const undo = () => { setSnoozedNow(false); setSelected(snooze?.subject); };

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
    ? <ScreenHeader key={view} title="Queue" trailing="unavailable" layout={layout} />
    : view === 'snoozed'
      ? <ScreenHeader key={view} title="Snoozed" layout={layout} back={{ label: 'Queue', onBack: () => go('queue') }} />
      : <ScreenHeader key={view} title="Queue" layout={layout} />;

  const footer = snoozedTotal.value > 0 && (
    <ListGroup>
      <ListRow label="Snoozed" value={<Num value={snoozedTotal} />} onOpen={() => go('snoozed')} />
    </ListGroup>
  );

  const list = state === 'loading'
    ? [0, 1, 2, 3].map((i) => <QueueRow key={i} loading layout={layout} />)
    : view === 'snoozed'
      ? snoozed(shown).map((s) => <Row key={s.subject} item={s} layout={layout} until={s.until} />)
      : items.length === 0 && state === 'ready'
        ? <p className="ui-queue__empty"><Num value={queuedCount(shown)} /> patterns</p>
        : items.map((item) => (layout === 'phone' && item.subject === current?.subject
          ? <div key={item.subject} className={item.subject === expanded ? 'ui-queue__open ui-expand' : 'ui-queue__open'}>
              <Card item={item} layout={layout} onSnooze={doSnooze} />
            </div>
          : <Row key={item.subject} item={item} layout={layout} selected={item.subject === current?.subject}
              swiping={item.subject === swiping} onSelect={() => { setSelected(item.subject); setExpanded(item.subject); }} />));

  const bar = snoozedNow && snooze && (
    <TransientBar kind="snoozed" until={snooze.until} onUndo={undo} layout={layout} />
  );

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-queue ui-queue--phone">
        <div className="ui-queue__head" data-push={push}>{header}</div>
        <main className="ui-queue__main" data-scroll="page" data-push={push}>
          <div key={`${view}-list`} className="ui-queue__list ui-push">
            {state === 'loading' && <PatternCard loading />}
            {list}
            {view === 'queue' && state === 'ready' && footer}
          </div>
        </main>
        {bar && <div className="ui-queue__bar">{bar}</div>}
        <NavBar layout="tabbar" selected="queue" dayCount={dayCount} />
      </div>
    );
  }
  return (
    <div ref={root} className="ui-queue ui-queue--desktop">
      <NavBar layout="rail" selected="queue" dayCount={dayCount} />
      <section className="ui-queue__pane ui-queue__pane--list" data-scroll="page" data-push={push}>
        {header}
        <div key={`${view}-list`} className="ui-queue__list ui-push">
          {list}
          {view === 'queue' && state === 'ready' && footer}
        </div>
      </section>
      <section className="ui-queue__pane ui-queue__pane--detail" data-scroll="page">
        {state === 'loading' && <div className="ui-queue__detail"><PatternCard loading /></div>}
        {state === 'ready' && current && (
          <div className="ui-queue__detail"><Card item={current} layout={layout} onSnooze={doSnooze} /></div>
        )}
        {bar && <div className="ui-queue__bar">{bar}</div>}
      </section>
    </div>
  );
}
