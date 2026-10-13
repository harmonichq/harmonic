// PatternCard (§4.2): the open pattern. Its magnitude in figure type, the
// CauseWaffle, and Pin — or, once pinned, the Focus pill in Pin's place. A
// pattern has no Range (only a Setting does); a pattern the engine flags as
// too broad to rely on carries the Uncertain pill on its magnitude line (ADR
// 485). When the engine serves no count for the pattern, the card shows no
// magnitude or waffle rather than inventing one.
// Under the magnitude, the impact line: the peak (a high pattern) or nadir (a
// low one) of the pattern's own episodes against the typical episode the
// engine compares them with, as two caption + value pairs on one baseline.
// A pattern the engine serves no comparison for has no impact line.
// Snooze is the lesser action, a centred text action beneath Pin (Apple's
// primary-plus-"Not Now" stack). The header holds the title and the collapse
// chevron, which a screen drops where the card does not collapse (desktop).
import { Icon } from '../../icons';
import { Num } from '../../Num';
import type { PatternData } from '../../queue-model';
import { Button } from '../Button/Button';
import { CauseWaffle } from '../CauseWaffle/CauseWaffle';
import { StatePill } from '../StatePill/StatePill';
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
    };

export function PatternCard(props: PatternCardProps) {
  if (props.loading) {
    return (
      <section className="ui-pcard ui-pcard--loading" aria-busy="true">
        <span className="ui-skeleton" style={{ width: '62%', height: 22 }} />
        <span className="ui-skeleton" style={{ width: '40%', height: 34, marginTop: 12 }} />
        <span className="ui-skeleton" style={{ width: '100%', height: 84, marginTop: 16 }} />
        <span className="ui-skeleton" style={{ width: '70%', height: 13, marginTop: 16 }} />
        <span className="ui-skeleton" style={{ width: '100%', height: 50, marginTop: 24 }} />
      </section>
    );
  }
  const { data, onPin, onSnooze, collapsible = true } = props;
  const { magnitude } = data;
  return (
    <section className="ui-pcard">
      <div className="ui-pcard__head">
        <h2 className="ui-pcard__title">{data.title}</h2>
        {collapsible && <span className="ui-pcard__chevron"><Icon name="collapse" /></span>}
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
          <div className="ui-pcard__waffle">
            <CauseWaffle n={magnitude.denominator.value} k={magnitude.count.value}
              causes={data.causes} noun={magnitude.noun} tone={data.tone} />
          </div>
        </>
      )}
      <div className="ui-pcard__action">
        {data.pinned ? <StatePill state="focus" /> : <Button kind="primary" label="Pin" onClick={onPin} />}
      </div>
      {onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
