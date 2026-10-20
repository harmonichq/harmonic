// QueueRow (§4.2): a collapsed recommendation. A 44 px column holds the
// kind's glyph, which is the kind's only mark: it is named "Pattern", "Habit"
// (a standalone habit, ADR 528) or "Setting" for assistive tech, and no kind
// pill repeats it. A habit's row is a Pattern's, with its own glyph. Then the
// title, then one quiet line: the magnitude alone ("9 of 71 lows"); the causes
// are the open card's to name. A setting row's title is its kind word with its time block beside it in meta
// ink, and current → suggested takes the magnitude's place.
//
// A Pattern with an impact ends both lines with a trailing value: Peak (highs)
// or Nadir (lows) as a caption on the title line, and beneath it the shared
// Delta of its own value against Typical, in mg/dL, green or red by the way
// it moved (a lower Peak and a higher Nadir are the good ways). The two
// lines are the row's own, so a row is the same height with or without it,
// and the chevron stays on the title line.
//
// Phone: a full-width row under a rule, with a ▾ to expand; mid-swipe slides
// it aside over the Snooze reveal, under the finger: released past half the
// reveal it snoozes the row (onSnooze), short of half it settles back. Desktop: a list row that selects into the
// detail pane, marked by the surface and a bar at its leading edge.
//
// Snoozed (the Snoozed list): the same row, read-only — no chevron, no swipe,
// no selection — with a last line holding "Until <date>" and Restore.
import type { Sourced } from '../../answers';
import { Icon } from '../../icons';
import { useSwipe } from '../../motion';
import { Num } from '../../Num';
import { Delta } from '../../Delta';
import { impactChange, type Impact, type Magnitude, type SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './QueueRow.css';

type Layout = 'phone' | 'desktop';

const KIND = { pattern: 'Pattern', habit: 'Habit', setting: 'Setting' } as const;
/** The Snooze reveal's width, which a swipe opens to. */
const REVEAL = 88;

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
      /** Phone: a swipe released past half the reveal snoozes the row. */
      onSnooze?: () => void;
      /** A snoozed row: its served Until date, and Restore. */
      snoozed?: { until: Sourced<string>; onRestore?: () => void };
    } & (
      | {
          kind: 'pattern' | 'habit'; magnitude: Magnitude;
          /** Null or absent: no trailing value. */
          impact?: Impact | null;
        }
      | { kind: 'setting'; setting: SettingRow }
    );

/** What a setting row prints. One back from a Done the next sync did not show
 *  carries the Not on pump pill on its title line (#518). */
export type SettingRow = Pick<SettingData, 'current' | 'suggested' | 'units'>
  & Partial<Pick<SettingData, 'start' | 'end' | 'notOnPump'>>;

function Meta(props: Extract<QueueRowProps, { kind: string }>) {
  if (props.kind === 'setting') {
    const { setting } = props;
    return (
      <span className="ui-qrow__magnitude">
        <Num value={setting.current} /> → <Num value={setting.suggested} /> {setting.units}
      </span>
    );
  }
  const { magnitude } = props;
  return (
    <span className="ui-qrow__magnitude">
      <Num value={magnitude.count} /> of <Num value={magnitude.denominator} /> {magnitude.noun}
    </span>
  );
}

export function QueueRow(props: QueueRowProps) {
  const layout = props.layout ?? 'phone';
  const swipe = useSwipe(REVEAL, !props.loading && Boolean(props.swiping), props.loading ? undefined : props.onSnooze);
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
  const { title, kind, selected = false, onSelect, snoozed } = props;
  const impact = kind === 'setting' ? null : props.impact;
  const body = (
    <>
      <span className="ui-qrow__glyph" role="img" aria-label={KIND[kind]}><Icon name={kind} /></span>
      <span className={`ui-qrow__body${impact ? ' ui-qrow__body--trailing' : ''}`}>
        <span className="ui-qrow__title">
          {title}
          {kind === 'setting' && props.setting.start && props.setting.end && <>{' '}<span className="ui-qrow__slot">
            <Num value={props.setting.start} />–<Num value={props.setting.end} />
          </span></>}
          {kind === 'setting' && props.setting.notOnPump && <StatePill state="not_on_pump" />}
        </span>
        {impact && <span className="ui-qrow__caption ui-caption">{impact.kind === 'peak' ? 'Peak' : 'Nadir'}</span>}
        {layout === 'phone' && !snoozed && <span className="ui-qrow__chevron"><Icon name="expand" /></span>}
        <span className="ui-qrow__meta"><Meta {...props} /></span>
        {impact && <span className="ui-qrow__impact"><Delta change={impactChange(impact)} unit="mg/dL" /></span>}
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
      className={`ui-qrow ui-qrow--${layout}${layout === 'phone' ? ' ui-swipe-settle' : ''}`}
      style={layout === 'phone' ? swipe.style : undefined}
      data-role="row"
      aria-current={layout === 'desktop' && selected ? 'true' : undefined}
      aria-expanded={layout === 'phone' ? false : undefined}
      onClick={onSelect}
    >
      {body}
    </button>
  );
  if (layout !== 'phone') return row;
  return (
    <div className={`ui-qrow-swipe${swipe.revealed ? ' ui-qrow-swipe--revealed' : ''}${swipe.open ? ' ui-qrow-swipe--open' : ''}${swipe.dragging ? ' ui-swipe--dragging' : ''}`}
      {...swipe.bind}>
      {swipe.revealed && (
        <span className="ui-qrow-swipe__reveal" aria-hidden="true">
          <Icon name="snooze" />
          <span>Snooze</span>
        </span>
      )}
      {row}
    </div>
  );
}
