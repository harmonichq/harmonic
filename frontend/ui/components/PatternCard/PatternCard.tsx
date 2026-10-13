// PatternCard (§4.2): the open pattern. Its magnitude in figure type, the
// CauseWaffle, the Range in the magnitude's own units (round(wilson × n) of
// n), and Pin — or, once pinned, the Focus pill in Pin's place. A range the
// engine flags as too broad to rely on carries the Uncertain pill. When the engine serves no count for the pattern,
// the card shows no magnitude, waffle or range rather than inventing one.
// Its header row holds the screen's action on the item (the Snooze icon
// button) beside the collapse chevron, which a screen drops where the card does
// not collapse (desktop).
import type { ReactNode } from 'react';
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
      /** An action on the item, in the header row (Snooze). */
      action?: ReactNode;
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
  const { data, onPin, action, collapsible = true } = props;
  const { magnitude, range } = data;
  return (
    <section className="ui-pcard">
      <div className="ui-pcard__head">
        <h2 className="ui-pcard__title">{data.title}</h2>
        {action}
        {collapsible && <span className="ui-pcard__chevron"><Icon name="collapse" /></span>}
      </div>
      {magnitude && (
        <>
          <div className="ui-pcard__magnitude">
            <span className="ui-pcard__figure"><Num value={magnitude.count} /></span>
            <span className="ui-pcard__of">of <Num value={magnitude.denominator} /> {magnitude.noun}</span>
          </div>
          <div className="ui-pcard__waffle">
            <CauseWaffle n={magnitude.denominator.value} k={magnitude.count.value}
              causes={data.causes} noun={magnitude.noun} tone={data.tone} />
          </div>
        </>
      )}
      {range && (
        <div className="ui-pcard__range">
          <span className="ui-caption">Range</span>
          <span className="ui-pcard__range-value">
            <Num value={range.lo} />–<Num value={range.hi} /> of <Num value={range.n} />
          </span>
          {data.uncertain && <StatePill state="uncertain" />}
        </div>
      )}
      <div className="ui-pcard__action">
        {data.pinned ? <StatePill state="focus" /> : <Button kind="primary" label="Pin" onClick={onPin} />}
      </div>
    </section>
  );
}
