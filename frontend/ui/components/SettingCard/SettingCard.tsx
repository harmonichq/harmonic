// SettingCard (§4.2): the open setting. Its title is one line: the kind word
// ("Basal", "I:C") in strong ink, then its time block in regular meta ink on
// the same baseline; current → suggested in figure type, only the suggestion
// in strong ink; the EvidenceChart of the evidence the estimate counts (a basal
// slot's nights, an I:C block's meal runs); then the stat row. A setting is
// changed on the pump, not here: the card's one primary is Done (#518), which
// says the person programmed it, where Focus sits on a Pattern card. Once the
// slot's change has matured into a Trial, the card names it and links to
// Changes. A card back from a Done the next sync did not show carries the Not
// on pump pill on its title line. Snooze, when the screen offers it, is a
// centred text action beneath Done.
//
// The stat row (ADR 523) is the same on every setting card, in the same order
// and place: Estimate, Range, then the count of what the estimate counts
// (Nights, Meal runs), each a caption above its
// served value. A range the engine serves as one value (lo = hi) shows that
// value once.
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import type { SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './SettingCard.css';

export type SettingFactsProps = {
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  units: string;
  count: { label: string; value: Sourced<number> };
};

/** The stat row every setting card ends its evidence with. */
export function SettingFacts({ estimate, lo, hi, units, count }: SettingFactsProps) {
  return (
    <dl className="ui-scard__facts">
      <div>
        <dt className="ui-caption">Estimate</dt>
        <dd>
          <span className="ui-scard__estimate"><Num value={estimate} /></span>
          <span className="ui-scard__unit">{units}</span>
        </dd>
      </div>
      <div>
        <dt className="ui-caption">Range</dt>
        <dd>
          {lo.value === hi.value ? <Num value={lo} /> : <><Num value={lo} />–<Num value={hi} /></>}
          <span className="ui-scard__unit">{units}</span>
        </dd>
      </div>
      <div>
        <dt className="ui-caption">{count.label}</dt>
        <dd><Num value={count.value} /></dd>
      </div>
    </dl>
  );
}

export type SettingCardProps = {
  data: SettingData; onChanges?: () => void;
  /** Done, the card's primary action. */
  onDone?: () => void;
  /** Snooze, the text action beneath Done. */
  onSnooze?: () => void;
};

export function SettingCard({ data, onChanges, onDone, onSnooze }: SettingCardProps) {
  return (
    <section className="ui-scard">
      <h2 className="ui-scard__title">
        {data.title}{' '}
        <span className="ui-scard__slot"><Num value={data.start} />–<Num value={data.end} /></span>
        {data.notOnPump && <StatePill state="not_on_pump" />}
      </h2>
      <div className="ui-scard__figure">
        <span className="ui-scard__current"><Num value={data.current} /></span>
        <span className="ui-scard__arrow" aria-hidden="true">→</span>
        <span className="ui-scard__suggested"><Num value={data.suggested} /></span>
        <span className="ui-scard__units">{data.units}</span>
      </div>
      <div className="ui-scard__chart">
        <EvidenceChart dots={data.dots} roster={data.roster} field={data.field} current={data.current}
          estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units} axis={data.axis} />
      </div>
      <SettingFacts estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units} count={data.count} />
      {data.trial && (
        <div className="ui-scard__trial">
          <span className="ui-caption">Trial</span>
          <Button kind="text" label="Changes" onClick={onChanges} />
        </div>
      )}
      {onDone && <div className="ui-card-done"><Button kind="primary" label="Done" onClick={onDone} /></div>}
      {onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
