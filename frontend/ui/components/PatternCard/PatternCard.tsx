// PatternCard (§4.2): the open pattern. Its magnitude in figure type, the
// TraceChart (ADR 523), and Pin — or, once pinned, the Focus pill in Pin's place. A
// pattern has no Range (only a Setting does); a pattern the engine flags as
// too broad to rely on carries the Uncertain pill on its magnitude line (ADR
// 485). When the engine serves no count for the pattern, the card shows no
// magnitude rather than inventing one; when it serves no case file, no chart.
// Under the magnitude, the impact line: the peak (a high pattern) or nadir (a
// low one) of the pattern's own episodes against the typical episode the
// engine compares them with, as two caption + value pairs on one baseline.
// A pattern the engine serves no comparison for has no impact line.
// Snooze is the lesser action, a centred text action beneath Pin (Apple's
// primary-plus-"Not Now" stack). The header holds the title and the collapse
// chevron, which a screen drops where the card does not collapse (desktop).
//
// The same card draws a standalone habit (§4.2 HabitCard, ADR 528): its count,
// its trace chart with its episodes named Habit, and Pin or the Focus pill with
// Snooze beneath, as a Pattern's. The engine serves no Uncertain verdict and no
// impact line for a habit, so it shows neither.
//
// The drill-down's cause card is the same card again (drill-down.md): a
// Pattern's cause drawn as a habit with no Snooze, its Pin an outlined
// secondary in the head beside the title, labelled Focus as every Pin will
// be once #591 renames it (one per cause card, so none is the screen's
// primary), or none while a change is watched; pinned, the Focus pill sits
// there instead.
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
      /** Snooze, the text action beneath Pin. */
      onSnooze?: () => void;
      /** Shows the collapse chevron; false where the card does not collapse. */
      collapsible?: boolean;
      /** Pin's weight: the Queue's primary, the drill-down's secondary (one
       *  per cause card, so none is the screen's primary), or none while a
       *  change is watched. */
      pin?: 'primary' | 'secondary' | 'none';
    };

export function PatternCard(props: PatternCardProps) {
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
  const { data, onPin, onSnooze, collapsible = true, pin = 'primary' } = props;
  const { magnitude } = data;
  return (
    <section className="ui-pcard">
      <div className="ui-pcard__head">
        <h2 className="ui-pcard__title">{data.title}</h2>
        {collapsible && <span className="ui-pcard__chevron"><Icon name="collapse" /></span>}
        {pin !== 'primary' && (data.pinned
          ? <StatePill state="focus" />
          : pin === 'secondary' && <Button kind="secondary" label="Focus" onClick={onPin} />)}
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
      {data.traces && (
        <div className="ui-pcard__chart">
          <TraceChart data={data.traces} own={data.kind === 'habit' ? 'Habit' : 'Pattern'} />
        </div>
      )}
      {pin === 'primary' && (
        <div className="ui-pcard__action">
          {data.pinned ? <StatePill state="focus" /> : <Button kind="primary" label="Pin" onClick={onPin} />}
        </div>
      )}
      {onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
