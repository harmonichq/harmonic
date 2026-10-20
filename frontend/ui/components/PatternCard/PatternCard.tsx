// PatternCard (§4.2): the open pattern. Its magnitude in figure type, the
// TraceChart (ADR 523), and Focus — or, once it is the Focus, the Focus pill in
// the button's place. A pattern has no Range (only a Setting does); a pattern
// the engine flags as too broad to rely on carries the Uncertain pill on its
// magnitude line (ADR 485). When the engine serves no count for the pattern,
// the card shows no magnitude rather than inventing one; when it serves no case
// file, no chart. Under the magnitude, the impact line: the peak (a high
// pattern) or nadir (a low one) of the pattern's own episodes against the
// typical episode the engine compares them with, as two caption + value pairs
// on one baseline. A pattern the engine serves no comparison for has no impact
// line. Snooze is the lesser action, a centred text action beneath Focus
// (Apple's primary-plus-"Not Now" stack). The header holds the title and the
// collapse chevron, which a screen drops where the card does not collapse
// (desktop).
//
// Focus is drawn only where the card is `focusable`: the served admission lets
// a Focus start (and, on a cause card, the engine serves its cause as one it
// will focus). Nothing says why it is absent (ADR 594).
//
// A multi-cause Pattern (its counter serves more than one cause) has no Focus
// button: its chart is a drill-down row, marked only with a trailing "›",
// named by the card's title, that opens one card per cause (drill-down.md).
// Once one of its causes is the Focus, the button's place holds the caption
// "Focus" over that cause's served title (§2.2 Caption + value pair), or the
// Focus pill when no served cause names it.
//
// The same card draws a standalone habit (§4.2 HabitCard, ADR 528): its count,
// its trace chart with its episodes named Habit, and Focus or the Focus pill
// with Snooze beneath, as a Pattern's. The engine serves no Uncertain verdict
// and no impact line for a habit, so it shows neither.
//
// The drill-down's cause card is the same card again (drill-down.md): a
// Pattern's cause drawn as a habit with no Snooze, its Focus an outlined
// secondary in the head beside the title (one per cause card, so none is the
// screen's primary), with a 44 px hit area around it; pinned, the Focus pill
// sits there instead. The head keeps that height in every state, the button
// absent included, so a card never shifts.
import { useId } from 'react';
import { Icon } from '../../icons';
import { Num } from '../../Num';
import type { PatternData } from '../../queue-model';
import { Button } from '../Button/Button';
import { StatePill } from '../StatePill/StatePill';
import { TraceChart } from '../TraceChart/TraceChart';
import '../../shared.css';
import './PatternCard.css';

export type PatternCardProps =
  | { loading: true }
  | {
      loading?: false; data: PatternData; onPin?: () => void;
      /** Snooze, the text action beneath Focus. */
      onSnooze?: () => void;
      /** Shows the collapse chevron; false where the card does not collapse. */
      collapsible?: boolean;
      /** Where Focus sits: the Queue card's foot, as its primary, or a cause card's
       *  head, as an outlined secondary (one per cause card, so none is the
       *  drill-down's primary). */
      pin?: 'primary' | 'secondary';
      /** A Focus can start here: the served admission, and a cause card's served
       *  cause (ADR 594). Without it the card draws no Focus button. */
      focusable?: boolean;
      /** A multi-cause card's chart opens its drill-down. */
      onOpen?: () => void;
    };

export function PatternCard(props: PatternCardProps) {
  const titleId = useId();
  if (props.loading) {
    return (
      <section className="ui-pcard ui-pcard--loading" aria-busy="true">
        <span className="ui-skeleton" style={{ width: '62%', height: 22 }} />
        <span className="ui-skeleton" style={{ width: '40%', height: 34, marginTop: 12 }} />
        <span className="ui-skeleton" style={{ width: '100%', height: 228, marginTop: 16 }} />
        <span className="ui-skeleton" style={{ width: '50%', height: 13, marginTop: 12 }} />
        <span className="ui-skeleton" style={{ width: '100%', height: 50, marginTop: 24 }} />
      </section>
    );
  }
  const { data, onPin, onSnooze, onOpen, collapsible = true, pin = 'primary', focusable = false } = props;
  const { magnitude } = data;
  const focus = (kind: 'primary' | 'secondary') => (data.pinned
    ? (data.multiCause && data.focusedCause
      ? (
        <dl className="ui-pcard__focus">
          <dt className="ui-caption">Focus</dt>
          <dd>{data.focusedCause}</dd>
        </dl>
      )
      : <StatePill state="focus" />)
    : focusable && !data.multiCause && <Button kind={kind} label="Focus" onClick={onPin} />);
  const chart = data.traces && <TraceChart data={data.traces} own={data.kind === 'habit' ? 'Habit' : 'Pattern'} />;
  const foot = pin === 'primary' && focus('primary');
  return (
    <section className={pin === 'secondary' ? 'ui-pcard ui-pcard--cause' : 'ui-pcard'}>
      <div className="ui-pcard__head">
        <h2 className="ui-pcard__title" id={titleId}>{data.title}</h2>
        {collapsible && <span className="ui-pcard__chevron"><Icon name="collapse" /></span>}
        {pin === 'secondary' && <span className="ui-pcard__slot">{focus('secondary')}</span>}
      </div>
      {magnitude && (
        <>
          <div className="ui-pcard__magnitude">
            <span className="ui-pcard__figure"><Num value={magnitude.count} /></span>
            <span className="ui-pcard__of">of <Num value={magnitude.denominator} /> {magnitude.noun}</span>
            {data.uncertain && <StatePill state="uncertain" />}
          </div>
          {data.impact && (
            <p className="ui-pcard__impact">
              <span className="ui-caption">{data.impact.kind === 'peak' ? 'Peak' : 'Nadir'}</span>
              <span className="ui-pcard__own"><Num value={data.impact.own} /></span>
              <span className="ui-pcard__dot" aria-hidden="true">·</span>
              <span className="ui-caption">Typical</span>
              <span className="ui-pcard__typical"><Num value={data.impact.typical} /></span>
              <span className="ui-pcard__unit">mg/dL</span>
            </p>
          )}
        </>
      )}
      {chart && (data.multiCause
        ? (
          <button type="button" className="ui-pcard__chart ui-pcard__open" data-role="row"
            aria-labelledby={titleId} onClick={onOpen}>
            {chart}
            <span className="ui-pcard__more" aria-hidden="true">›</span>
          </button>
        )
        : <div className="ui-pcard__chart">{chart}</div>)}
      {foot && <div className="ui-pcard__action">{foot}</div>}
      {onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
