// QueueRow (§4.2): a collapsed recommendation. A 44 px column holds the
// kind's glyph (decorative); the kind's StatePill carries its word. Then the
// title, then one quiet line: the magnitude and the top cause joined by a
// middle dot ("9 of 71 lows · Carb undercount"), or the magnitude alone when no
// cause claims it. A setting row's title is its kind word with its time block
// beside it in meta ink, and current → suggested takes the magnitude's place.
//
// Phone: a full-width row under a rule, with a ▾ to expand; mid-swipe slides
// it aside over the Snooze reveal. Desktop: a list row that selects into the
// detail pane, marked by the surface and a bar at its leading edge.
//
// Snoozed (the Snoozed list): the same row, read-only — no chevron, no swipe,
// no selection — with a last line holding "Until <date>" and Restore.
import type { Sourced } from '../../fixtures';
import { Icon } from '../../icons';
import { Num } from '../../Num';
import type { Magnitude, SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
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
      /** A snoozed row: its served Until date, and Restore. */
      snoozed?: { until: Sourced<string>; onRestore?: () => void };
    } & (
      | { kind: 'pattern'; magnitude: Magnitude; cause?: string }
      | { kind: 'setting'; setting: SettingData }
    );

function Meta(props: Extract<QueueRowProps, { kind: string }>) {
  if (props.kind === 'setting') {
    const { setting } = props;
    return (
      <span className="ui-qrow__magnitude">
        <Num value={setting.current} /> → <Num value={setting.suggested} /> {setting.units}
      </span>
    );
  }
  const { magnitude, cause } = props;
  return (
    <span className="ui-qrow__magnitude">
      <Num value={magnitude.count} /> of <Num value={magnitude.denominator} /> {magnitude.noun}
      {cause && <> · {cause}</>}
    </span>
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
  const { title, kind, selected = false, swiping = false, onSelect, snoozed } = props;
  const body = (
    <>
      <span className="ui-qrow__glyph"><Icon name={kind} /></span>
      <span className="ui-qrow__body">
        <span className="ui-qrow__head">
          <span className="ui-qrow__title">
            {title}
            {kind === 'setting' && <>{' '}<span className="ui-qrow__slot">
              <Num value={props.setting.start} />–<Num value={props.setting.end} />
            </span></>}
          </span>
          <StatePill state={kind} />
          {layout === 'phone' && !snoozed && <span className="ui-qrow__chevron"><Icon name="expand" /></span>}
        </span>
        <span className="ui-qrow__meta"><Meta {...props} /></span>
        {snoozed && (
          <span className="ui-qrow__foot">
            <span className="ui-qrow__until">Until <Num value={snoozed.until} /></span>
            <Button kind="secondary" label="Restore" onClick={snoozed.onRestore} />
          </span>
        )}
      </span>
    </>
  );
  if (snoozed) return <div className={`ui-qrow ui-qrow--${layout} ui-qrow--snoozed`}>{body}</div>;
  const row = (
    <button
      type="button"
      className={`ui-qrow ui-qrow--${layout}`}
      data-role="row"
      aria-current={layout === 'desktop' && selected ? 'true' : undefined}
      aria-expanded={layout === 'phone' ? false : undefined}
      onClick={onSelect}
    >
      {body}
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
