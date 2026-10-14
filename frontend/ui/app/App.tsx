// The app (#495): the five locked screens, one at a time, at the address the
// one router (frontend/tab-routing.js) names, reading the live engine through
// the live adapter. Phone gets the tab bar, tablet and desktop the rail (§1.1),
// by the viewport's width.
//
// Each tab reads its answers when it first opens, and the adapter keeps them:
// switching back reads nothing again (live.js says when an answer is read
// again). Until they first land, the screen shows its loading state; when they
// cannot be read (a refused or failed read, the engine unavailable), it shows
// Unavailable with Retry, and the other tabs keep working (§1.2).
import { useCallback, useEffect, useState } from 'react';
import { parseRoute, subscribeRoute, writeRoute } from '../../tab-routing.js';
import type { NavItem } from '../components/NavBar/NavBar';
import { NavBar } from '../components/NavBar/NavBar';
import { ChangesScreen } from '../screens/Changes/ChangesScreen';
import { DayScreen } from '../screens/Day/DayScreen';
import { OverviewScreen } from '../screens/Overview/OverviewScreen';
import { QueueScreen } from '../screens/Queue/QueueScreen';
import { SettingsScreen } from '../screens/Settings/SettingsScreen';
import { client } from '../../data.js';
import { glossary } from '../__fixtures__/ui-fixtures.json';
import { serve, type Answers } from '../answers';
import { syncFailed } from '../settings-model';
import { createLive } from './live.js';

type Tab = 'queue' | 'changes' | 'overview' | 'day' | 'settings';

const live = createLive({ client, glossary });
const { changesWrites, dayWrites, queueWrites, settingsWrites } = live;
serve(live.answers as unknown as Answers);

type Read = 'loading' | 'ready' | 'unavailable';
/** §2.4: tablet follows desktop's structure; the phone layout is narrower than this. */
const WIDE = '(min-width: 768px)';

function useLayout() {
  const [query] = useState(() => window.matchMedia(WIDE));
  const [wide, setWide] = useState(query.matches);
  useEffect(() => {
    const change = () => setWide(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, [query]);
  return wide ? 'desktop' : 'phone';
}

export function App() {
  const layout = useLayout();
  const [tab, setTab] = useState<Tab>(() => parseRoute(window.location) as Tab);
  const [reads, setReads] = useState<Partial<Record<Tab, Read>>>({});
  // Bumped when answers land, so the screen draws what was read.
  const [, setVersion] = useState(0);
  const redraw = useCallback(() => setVersion((n) => n + 1), []);

  const read = useCallback((which: Tab, retry = false) => {
    setReads((now) => (now[which] === 'ready' ? now : { ...now, [which]: 'loading' }));
    (retry ? live.retryTab(which) : live.readTab(which)).then(
      () => setReads((now) => ({ ...now, [which]: 'ready' })),
      () => setReads((now) => ({ ...now, [which]: 'unavailable' })),
    ).finally(redraw);
  }, [redraw]);

  useEffect(() => subscribeRoute((next: string) => setTab(next as Tab)), []);
  useEffect(() => { read(tab); }, [tab, read]);

  const go = (item: NavItem) => {
    writeRoute(item);
    setTab(item);
  };
  /** A write the screen awaits, then the redraw of what it read again. */
  const drawn = <A extends unknown[], R>(run: (...args: A) => Promise<R>) =>
    (...args: A) => run(...args).finally(redraw);

  const state = reads[tab] ?? 'loading';
  const nav = { onSelect: go, syncFailed: syncFailed() };
  const retry = () => read(tab, true);

  switch (tab) {
    case 'queue':
      return <QueueScreen key={tab} layout={layout} store="wearer" state={state} nav={nav} onRetry={retry}
        writes={{ snooze: drawn(queueWrites.snooze), restore: drawn(queueWrites.restore), pin: drawn(queueWrites.pin) }} />;
    case 'changes':
      return <ChangesScreen key={tab} layout={layout} store="wearer" state={state} nav={nav} onRetry={retry}
        writes={{ end: drawn(changesWrites.end) }} />;
    case 'overview':
      return <OverviewScreen key={tab} layout={layout} store="wearer" state={state} nav={nav} onRetry={retry} />;
    case 'day':
      return <DayScreen key={tab} layout={layout} store="wearer" state={state} nav={nav} onRetry={retry}
        onDay={(iso) => { live.readDay(iso).then(redraw, redraw); }}
        writes={{ answer: drawn(dayWrites.answer), grams: drawn(dayWrites.grams), logCarbs: drawn(dayWrites.logCarbs) }} />;
    case 'settings':
      // §1.3: Settings has no loading or error state of its own; its rows show once read.
      return state === 'ready'
        ? <SettingsScreen key={tab} layout={layout} sync={null} account={live.accountState()} nav={nav}
            writes={{ saveCredentials: drawn(settingsWrites.saveCredentials) }} />
        : <div className={`ui-app__waiting ui-app__waiting--${layout}`}>
            <NavBar layout={layout === 'phone' ? 'tabbar' : 'rail'} selected="settings" {...nav} />
          </div>;
  }
}
