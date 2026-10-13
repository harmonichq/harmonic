// PatternCard (§4.2): the open pattern. Its magnitude in figure type, the
// CauseWaffle, the Range in the magnitude's own units (round(wilson × n) of
// n), and Pin — or, once pinned, the Focus pill in Pin's place. A Wide range
// carries the Wide pill. When the engine serves no count for the pattern,
// the card shows no magnitude, waffle or range rather than inventing one.
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
  | { loading?: false; data: PatternData; onPin?: () => void };

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
  const { data, onPin } = props;
  const { magnitude, range } = data;
  return (
    <section className="ui-pcard">
      <div className="ui-pcard__head">
        <h2 className="ui-pcard__title">{data.title}</h2>
        <span className="ui-pcard__chevron"><Icon name="collapse" /></span>
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
          {data.wide && <StatePill state="wide" />}
        </div>
      )}
      <div className="ui-pcard__action">
        {data.pinned ? <StatePill state="focus" /> : <Button kind="primary" label="Pin" onClick={onPin} />}
      </div>
    </section>
  );
}
