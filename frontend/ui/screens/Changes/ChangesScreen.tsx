// The Changes screen (§1.1, §1.3, §1.3a), composed only from the library's
// components.
//
// The active change first: its Trial or Focus as the ChangeCard, or the "No
// active change" label. Then "Last change": the one change the person ended
// most recently, as a single row (what changed, when, its result) that
// expands in place into its ended ChangeCard. One slot, never a list: no
// history archive (operator, 2026-10-13).
//
// End (§1.3a) is the card's compact secondary action, offered when the engine
// accepts it (a Focus at any time; a Trial once matured). Pressing it asks once:
// on phone a sheet over the screen, on desktop a popover anchored under End.
// Either holds the change's name, End as the screen's one primary and Cancel
// as a text action beneath it. Ending shows what the engine served after the
// end: the `after` store, where the ended change is now the last change.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar. Desktop: the rail and one pane up to a reading width; the pane scrolls
// as a whole (§2.3).
import { useEffect, useState } from 'react';
import { change, lastChange, type ChangeData, type ChangesStore } from '../../changes-model';
import { sourced } from '../../fixtures';
import { Num } from '../../Num';
import { Button } from '../../components/Button/Button';
import { ChangeCard } from '../../components/ChangeCard/ChangeCard';
import { ListGroup, ListRow } from '../../components/ListRow/ListRow';
import { StatePill } from '../../components/StatePill/StatePill';
import { NavBar } from '../../components/NavBar/NavBar';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import '../../shared.css';
import './ChangesScreen.css';

type Layout = 'phone' | 'desktop';

export type ChangesScreenProps = {
  layout: Layout;
  store: ChangesStore;
  state?: 'ready' | 'loading' | 'unavailable';
  /** What ending the active change serves: the store read after it. */
  end?: { after: ChangesStore };
  /** Start with the End confirmation open. */
  confirming?: boolean;
  /** Start with the last change's row expanded into its card. */
  lastOpen?: boolean;
};

const dayCount = sourced<number>('prompts[answer=null].length');

/** The change's name, as its card titles it. */
function Name({ data }: { data: ChangeData }) {
  if (data.kind === 'trial') return <>{data.title} <Num value={data.slot} /></>;
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

export function ChangesScreen({ layout, store, state = 'ready', end, confirming = false, lastOpen = false }: ChangesScreenProps) {
  const [ended, setEnded] = useState(false);
  const [asking, setAsking] = useState(confirming);
  const [lastExpanded, setLastExpanded] = useState(lastOpen);
  const shown = ended && end ? end.after : store;
  const active = change(shown);
  const last = lastChange(shown);

  const doEnd = () => { setAsking(false); if (end) setEnded(true); };
  const cancel = () => setAsking(false);

  useEffect(() => {
    if (!asking) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = state === 'unavailable'
    ? <ScreenHeader title="Changes" trailing="unavailable" layout={layout} />
    : <ScreenHeader title="Changes" layout={layout} />;

  const popover = layout === 'desktop' && asking && (
    <section className="ui-popover ui-popover--end ui-changes__confirm" role="dialog" aria-label="End">
      <Confirm data={active} onEnd={doEnd} onCancel={cancel} />
    </section>
  );

  const content = state === 'loading'
    ? <span className="ui-skeleton ui-changes__skeleton" aria-hidden="true" />
    : state === 'ready' && (
      <>
        <ChangeCard data={active} onEnd={() => setAsking(true)} confirm={popover} />
        {last && (
          <div className="ui-changes__last">
            <ListGroup caption="Last change">
              <ListRow
                label={<span className="ui-changes__last-row">
                  <span>{last.title} <Num value={last.slot} /></span>
                  <span className="ui-changes__last-meta">
                    <Num value={last.before} /> → <Num value={last.after} /> {last.units} · <Num value={last.changedAt} />
                    {last.endedAt && <> – <Num value={last.endedAt} /></>}
                  </span>
                </span>}
                value={last.result ? <StatePill state={last.result} /> : undefined}
                disclosure={{ expanded: lastExpanded, onToggle: () => setLastExpanded(!lastExpanded) }} />
            </ListGroup>
            {lastExpanded && <div className="ui-changes__last-card"><ChangeCard data={last} /></div>}
          </div>
        )}
      </>
    );

  if (layout === 'phone') {
    return (
      <div className="ui-changes ui-changes--phone">
        <div className="ui-changes__head">{header}</div>
        <main className="ui-changes__main" data-scroll="page">
          <div className="ui-changes__body">{content}</div>
        </main>
        <NavBar layout="tabbar" selected="changes" dayCount={dayCount} />
        {asking && state === 'ready' && (
          <div className="ui-changes__scrim" onClick={cancel}>
            <section className="ui-sheet ui-changes__confirm" role="dialog" aria-label="End"
              onClick={(event) => event.stopPropagation()}>
              <span className="ui-sheet__grabber" aria-hidden="true" />
              <Confirm data={active} onEnd={doEnd} onCancel={cancel} />
            </section>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="ui-changes ui-changes--desktop">
      <NavBar layout="rail" selected="changes" dayCount={dayCount} />
      <section className="ui-changes__pane" data-scroll="page">
        {header}
        <div className="ui-changes__body">{content}</div>
      </section>
    </div>
  );
}
