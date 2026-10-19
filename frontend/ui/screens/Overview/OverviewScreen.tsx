// The Overview screen (§1.1, §1.3), composed only from the library's
// components: standard metrics over the selected window against the period of
// the same length before it, its time-in-ranges bar, its glucose profile, and
// the ISF and basal estimates, and the Meal size card (#501). Nothing to act on.
//
// The window control picks 14, 30 or 90 d (a window the served coverage falls
// short of is disabled). The line under it is the window's date span and,
// when the period before it has data, the comparison every change is against,
// named once ("30 Sep – 13 Oct · vs previous 14 d", §1.2, §2.5 2026-10-14).
// Time in range leads, with its change, then its five-band bar, then the other
// metrics, each with its change; then the window's glucose profile. A store
// with no readings shows dashes for the metrics and "No data" for the bar and
// the profile.
//
// One scrolling page (§2.2 Scrolling, §2.5 2026-10-14): the summary — the
// window switch and its date line, In range, the metrics and the profile — is
// the first screenful, and the ISF and basal estimates follow it, two cards of
// one size (ADR 523), then the Meal size card, the same size (ADR 501). Phone:
// one column under the fixed header, above the tab bar, with a shorter profile
// plot so the summary fits, each card under the one before. Desktop: the rail
// and one pane, the metrics beside the profile, the cards two to a row beneath
// both.
//
// The profile and the estimates are read per window: choosing a window
// reports it (`onWindow`), and until its answers land each shows its skeleton.
// The Meal size card reads its one 90-day window whatever window is chosen.
import { useEffect, useState } from 'react';
import { answers, sourced } from '../../answers';
import {
  basalEstimate, isfEstimate, mealSize, metric, period, profile, tirBands, type MetricKey, type Window,
} from '../../overview-model';
import { BasalCard } from '../../components/BasalCard/BasalCard';
import { GlucoseProfile } from '../../components/GlucoseProfile/GlucoseProfile';
import { IsfCard } from '../../components/IsfCard/IsfCard';
import { MealSizeCard } from '../../components/MealSizeCard/MealSizeCard';
import { MetricFigure } from '../../components/MetricFigure/MetricFigure';
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
import { Num } from '../../Num';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { lacksCoverage, SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { TimeInRangeBar } from '../../components/TimeInRangeBar/TimeInRangeBar';
import '../../shared.css';
import './OverviewScreen.css';

type Layout = 'phone' | 'desktop';
type Store = 'wearer' | 'wearer-unsynced';

export type OverviewScreenProps = {
  layout: Layout;
  store: Store;
  /** `stale`: its answers are an earlier read's, since reading them again failed (§2.5, 2026-10-14). */
  state?: 'ready' | 'loading' | 'unavailable' | 'stale';
  /** The window selected first. */
  window?: Window;
  /** The selected window, each time it is chosen (and the first), so its
   *  profile and ISF estimate can be read. */
  onWindow?: (window: Window) => void;
  nav?: NavHooks;
  /** Unavailable's Retry. */
  onRetry?: () => void;
};

const WINDOWS: Window[] = ['14', '30', '90'];
const OTHER_METRICS: MetricKey[] = ['mean_glucose', 'gmi', 'cv', 'tbr_lvl1', 'tar_lvl1'];
/** Phone: the profile's plot height that keeps the summary on the first screen. */
const PHONE_PLOT = 160;
const dayCount = () => sourced<number>('prompts[answer=null].length');

const outcomes = (store: Store) => (store === 'wearer'
  ? answers.outcomes : answers.overview['wearer-unsynced'].outcomes) as Record<Window, {
    window_days: number; coverage: { days: number }; metrics: { tir: number | null };
  }>;
const outcomesRoot = (store: Store) => (store === 'wearer' ? 'outcomes' : 'overview.wearer-unsynced.outcomes');

/** Loading (the screen's skeleton) or Unavailable (its title, the label and
 *  Retry): the frame, with nothing read from the answers. */
function Frame({ layout, state, nav, onRetry }: {
  layout: Layout; state: 'loading' | 'unavailable'; nav?: NavHooks; onRetry?: () => void;
}) {
  const header = state === 'unavailable'
    ? <ScreenHeader title="Overview" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : <ScreenHeader title="Overview" layout={layout} />;
  const loading = state === 'loading' && (
    <>
      <span className="ui-skeleton" style={{ height: 32 }} aria-hidden="true" />
      <span className="ui-skeleton" style={{ height: 160, marginTop: 24 }} aria-hidden="true" />
      <span className="ui-skeleton" style={{ height: 220, marginTop: 24 }} aria-hidden="true" />
    </>
  );
  if (layout === 'phone') {
    return (
      <div className="ui-overview ui-overview--phone">
        <div className="ui-overview__head">{header}</div>
        <main className="ui-overview__main" data-scroll="page">
          <div className="ui-overview__body">{loading}</div>
        </main>
        <NavBar layout="tabbar" selected="overview" dayCount={dayCount()} {...nav} />
      </div>
    );
  }
  return (
    <div className="ui-overview ui-overview--desktop">
      <NavBar layout="rail" selected="overview" dayCount={dayCount()} {...nav} />
      <section className="ui-overview__pane" data-scroll="page">
        <div className="ui-overview__width">{header}</div>
        <div className="ui-overview__body">{loading}</div>
      </section>
    </div>
  );
}

export function OverviewScreen({
  layout, store, state = 'ready', window: initial = '14', onWindow, nav, onRetry,
}: OverviewScreenProps) {
  const [window, setWindow] = useState<Window>(initial);
  useEffect(() => { onWindow?.(window); }, [window]);
  if (state === 'loading' || state === 'unavailable') {
    return <Frame layout={layout} state={state} nav={nav} onRetry={onRetry} />;
  }
  const served = outcomes(store);
  const hasData = served[window].metrics.tir !== null;
  const header = state === 'stale'
    ? <ScreenHeader title="Overview" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : <ScreenHeader title="Overview" layout={layout} />;
  const span = period(store, window);

  const control = (
    <div className="ui-overview__control">
      <SegmentedControl
        options={WINDOWS.map((w) => ({
          days: sourced<number>(`${outcomesRoot(store)}.${w}.window_days`),
          disabled: hasData && lacksCoverage(served[w]),
        }))}
        selected={served[window].window_days}
        onChange={(days) => setWindow(String(days) as Window)} />
      {span && (
        <p className="ui-overview__period">
          <Num value={span.start} /> – <Num value={span.end} />
          {span.previous && <> · vs previous <Num value={span.previous} /> d</>}
        </p>
      )}
    </div>
  );

  const metrics = (
    <section className="ui-overview__metrics">
      <MetricFigure data={metric(store, window, 'tir')} />
      {hasData && store === 'wearer'
        ? <div className="ui-overview__bar"><TimeInRangeBar bands={tirBands(window)} /></div>
        : <p className="ui-overview__none">No data</p>}
      <div className="ui-overview__grid">
        {OTHER_METRICS.map((key) => <MetricFigure key={key} data={metric(store, window, key)} />)}
      </div>
    </section>
  );

  const servedProfile = store === 'wearer' ? profile('wearer', window) : undefined;
  const glucoseProfile = (
    <section className="ui-overview__profile">
      {servedProfile === undefined ? <p className="ui-overview__none">No data</p>
        : servedProfile === null ? <span className="ui-skeleton ui-overview__skeleton" aria-hidden="true" />
          : <GlucoseProfile data={servedProfile} plotHeight={layout === 'phone' ? PHONE_PLOT : undefined} />}
    </section>
  );

  const estimates = (
    <div className="ui-overview__estimates">
      <IsfCard data={store === 'wearer' ? isfEstimate('wearer', window) : 'none'} />
      <BasalCard data={store === 'wearer' ? basalEstimate('wearer', window) : 'none'} />
      <MealSizeCard data={mealSize(store)} />
    </div>
  );

  if (layout === 'phone') {
    return (
      <div className="ui-overview ui-overview--phone">
        <div className="ui-overview__head">{header}</div>
        <main className="ui-overview__main" data-scroll="page">
          <div className="ui-overview__body">
            {control}{metrics}{glucoseProfile}{estimates}
          </div>
        </main>
        <NavBar layout="tabbar" selected="overview" dayCount={dayCount()} {...nav} />
      </div>
    );
  }
  return (
    <div className="ui-overview ui-overview--desktop">
      <NavBar layout="rail" selected="overview" dayCount={dayCount()} {...nav} />
      <section className="ui-overview__pane" data-scroll="page">
        <div className="ui-overview__width">{header}</div>
        <div className="ui-overview__body">
          {control}
          <div className="ui-overview__columns">{metrics}{glucoseProfile}</div>
          {estimates}
        </div>
      </section>
    </div>
  );
}
