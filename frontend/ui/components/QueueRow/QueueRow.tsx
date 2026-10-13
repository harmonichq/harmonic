// QueueRow (§4.2): a collapsed recommendation. A 44 px column holds the
// kind's glyph (decorative); the kind's StatePill carries its word. Then the
// title, one magnitude ("9 of 71 lows") and the top cause. A setting row shows
// current → suggested in the magnitude's place, and its time block.
//
// Phone: a full-width row under a rule, with a ▾ to expand; mid-swipe slides
// it aside over the Snooze reveal. Desktop: a list row that selects into the
// detail pane, marked by the surface and a bar at its leading edge.
import { Icon } from '../../icons';
import { Num } from '../../Num';
import type { Magnitude, SettingData } from '../../queue-model';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './QueueRow.css';

type Layout = 'phone' | 'desktop';

export type QueueRowProps =
  | { loading: true; layout?: Layout }
  | {
      loading?: false;
      layout?: Layout;
      title: string;
      selected?: boolean;
      /** Phone only: the row held mid-swipe over its Snooze reveal. */
      swiping?: boolean;
      onSelect?: () => void;
    } & (
      | { kind: 'pattern'; magnitude: Magnitude; cause?: string }
      | { kind: 'setting'; setting: SettingData }
    );

function Meta(props: Extract<QueueRowProps, { kind: string }>) {
  if (props.kind === 'setting') {
    const { setting } = props;
    return (
      <>
        <span className="ui-qrow__magnitude">
          <Num value={setting.current} /> → <Num value={setting.suggested} /> {setting.units}
        </span>
        <span className="ui-qrow__aside">
          <Num value={setting.start} />–<Num value={setting.end} />
        </span>
      </>
    );
  }
  const { magnitude, cause } = props;
  return (
    <>
      <span className="ui-qrow__magnitude">
        <Num value={magnitude.count} /> of <Num value={magnitude.denominator} /> {magnitude.noun}
      </span>
      {cause && (
        <span className="ui-qrow__aside">
          <span className="ui-caption">Cause</span>
          <span className="ui-qrow__cause">{cause}</span>
        </span>
      )}
    </>
  );
}

export function QueueRow(props: QueueRowProps) {
  const layout = props.layout ?? 'phone';
  if (props.loading) {
    return (
      <div className={`ui-qrow ui-qrow--${layout} ui-qrow--loading`} aria-busy="true">
        <span className="ui-qrow__glyph"><span className="ui-skeleton" style={{ width: 20, height: 20 }} /></span>
        <span className="ui-qrow__body">
          <span className="ui-skeleton" style={{ width: '58%', height: 17 }} />
          <span className="ui-skeleton" style={{ width: '82%', height: 13 }} />
        </span>
      </div>
    );
  }
  const { title, kind, selected = false, swiping = false, onSelect } = props;
  const row = (
    <button
      type="button"
      className={`ui-qrow ui-qrow--${layout}`}
      data-role="row"
      aria-current={layout === 'desktop' && selected ? 'true' : undefined}
      aria-expanded={layout === 'phone' ? false : undefined}
      onClick={onSelect}
    >
      <span className="ui-qrow__glyph"><Icon name={kind} /></span>
      <span className="ui-qrow__body">
        <span className="ui-qrow__head">
          <span className="ui-qrow__title">{title}</span>
          <StatePill state={kind} />
          {layout === 'phone' && <span className="ui-qrow__chevron"><Icon name="expand" /></span>}
        </span>
        <span className="ui-qrow__meta"><Meta {...props} /></span>
      </span>
    </button>
  );
  if (!swiping || layout !== 'phone') return row;
  return (
    <div className="ui-qrow-swipe ui-qrow-swipe--open">
      <span className="ui-qrow-swipe__reveal" aria-hidden="true">
        <Icon name="snooze" />
        <span>Snooze</span>
      </span>
      {row}
    </div>
  );
}
