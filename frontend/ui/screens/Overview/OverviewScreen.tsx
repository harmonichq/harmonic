// The Overview screen (§1.1, §1.3), composed only from the library's
// components: standard metrics over the selected window, its time-in-ranges
// bar and the 30-day glucose profile. No recommendations.
//
// The window control picks 14, 30 or 90 d (a window the served coverage falls
// short of is disabled); time in range leads, with its change against 90 d,
// then its five-band bar, then the other metrics, each with its change. The
// header dates the window's end ("To 30 Sep", §1.2). The glucose profile is the
// engine's fixed 30 days whatever the window. A store with no readings shows
// dashes for the metrics and "No data" for the bar and the profile.
//
// The Overview never scrolls (operator, 2026-10-13: "No scrolling for the
// overview page"): phone fits one 390 × 844 screen, three metrics to a row and
// a shorter profile plot. Phone: one column under the fixed header, above the tab bar. Desktop: the
// rail and one pane, the metrics beside the profile, and the recent days as
// tiles beneath (§4.2 DayTile).
import { useState } from 'react';
import { fixtures, sourced } from '../../fixtures';
import {
  day, metric, profile, tirBands, type MetricKey, type Window,
} from '../../overview-model';
import { DayTile } from '../../components/DayTile/DayTile';
import { GlucoseProfile } from '../../components/GlucoseProfile/GlucoseProfile';
import { MetricFigure } from '../../components/MetricFigure/MetricFigure';
import { NavBar } from '../../components/NavBar/NavBar';
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
  state?: 'ready' | 'loading' | 'unavailable';
  /** The window selected first. */
  window?: Window;
};

const WINDOWS: Window[] = ['14', '30', '90'];
const OTHER_METRICS: MetricKey[] = ['mean_glucose', 'gmi', 'cv', 'tbr_lvl1', 'tar_lvl1'];
/** Desktop: the recent days the navigator serves, as tiles. */
const RECENT_DAYS = 14;
/** Phone: the profile's plot height that lets the screen fit without scrolling. */
const PHONE_PLOT = 170;
const dayCount = sourced<number>('prompts[answer=null].length');

const outcomes = (store: Store) => (store === 'wearer'
  ? fixtures.outcomes : fixtures.overview['wearer-unsynced'].outcomes) as Record<Window, {
    window_days: number; coverage: { days: number }; metrics: { tir: number | null };
  }>;
const outcomesRoot = (store: Store) => (store === 'wearer' ? 'outcomes' : 'overview.wearer-unsynced.outcomes');

function recentDays() {
  const days = fixtures.overview.wearer.day_navigator.days;
  const last = days.map((d) => d.has_data).lastIndexOf(true);
  return days.slice(Math.max(0, last + 1 - RECENT_DAYS), last + 1).map((d) => day(d.iso));
}

export function OverviewScreen({ layout, store, state = 'ready', window: initial = '14' }: OverviewScreenProps) {
  const [window, setWindow] = useState<Window>(initial);
  const served = outcomes(store);
  const hasData = served[window].metrics.tir !== null;

  const header = state === 'unavailable'
    ? <ScreenHeader title="Overview" trailing="unavailable" layout={layout} />
    : state === 'ready' && hasData
      ? <ScreenHeader title="Overview" trailing="date" layout={layout}
          date={sourced(`${outcomesRoot(store)}.${window}.span_end`, 'date')} />
      : <ScreenHeader title="Overview" layout={layout} />;

  const control = (
    <SegmentedControl
      options={WINDOWS.map((w) => ({
        days: sourced<number>(`${outcomesRoot(store)}.${w}.window_days`),
        disabled: hasData && lacksCoverage(served[w]),
      }))}
      selected={served[window].window_days}
      onChange={(days) => setWindow(String(days) as Window)} />
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

  const glucoseProfile = (
    <section className="ui-overview__profile">
      {store === 'wearer' ? <GlucoseProfile data={profile('wearer')} plotHeight={layout === 'phone' ? PHONE_PLOT : undefined} /> : <p className="ui-overview__none">No data</p>}
    </section>
  );

  const loading = (
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
          <div className="ui-overview__body">
            {state === 'loading' ? loading : state === 'ready' && (
              <>{control}{metrics}{glucoseProfile}</>
            )}
          </div>
        </main>
        <NavBar layout="tabbar" selected="overview" dayCount={dayCount} />
      </div>
    );
  }
  return (
    <div className="ui-overview ui-overview--desktop">
      <NavBar layout="rail" selected="overview" dayCount={dayCount} />
      <section className="ui-overview__pane" data-scroll="page">
        <div className="ui-overview__width">{header}</div>
        <div className="ui-overview__body">
          {state === 'loading' ? loading : state === 'ready' && (
            <>
              <div className="ui-overview__control">{control}</div>
              <div className="ui-overview__columns">{metrics}{glucoseProfile}</div>
              {store === 'wearer' && (
                <section className="ui-overview__days">
                  {recentDays().map((d) => <DayTile key={d.date.value} day={d} />)}
                </section>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
