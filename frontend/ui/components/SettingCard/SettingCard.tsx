// SettingCard (§4.2): the open setting. The time block is its title; current
// → suggested in figure type; the EvidenceChart; the evidence count and one
// Range. No button: a setting is changed on the pump, not here. A range the
// engine serves as one value (lo = hi) shows that value once. Once the slot's
// change has matured into a Trial, the card names it and links to Changes.
import { Num } from '../../Num';
import type { SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import '../../shared.css';
import './SettingCard.css';

export type SettingCardProps = { data: SettingData; onChanges?: () => void };

export function SettingCard({ data, onChanges }: SettingCardProps) {
  const collapsed = data.lo.value === data.hi.value;
  return (
    <section className="ui-scard">
      <span className="ui-caption">{data.title}</span>
      <h2 className="ui-scard__title">
        <Num value={data.start} />–<Num value={data.end} />
      </h2>
      <div className="ui-scard__figure">
        <span className="ui-scard__current"><Num value={data.current} /></span>
        <span className="ui-scard__arrow" aria-hidden="true">→</span>
        <span><Num value={data.suggested} /></span>
        <span className="ui-scard__units">{data.units}</span>
      </div>
      <div className="ui-scard__chart">
        <EvidenceChart nights={data.nights} roster={data.roster} current={data.current} estimate={data.estimate}
          lo={data.lo} hi={data.hi} units={data.units} />
      </div>
      <div className="ui-scard__facts">
        <span className="ui-scard__count"><Num value={data.days} /> nights</span>
        <span className="ui-scard__range">
          <span className="ui-caption">Range</span>
          <span>
            {collapsed ? <Num value={data.lo} /> : <><Num value={data.lo} />–<Num value={data.hi} /></>} {data.units}
          </span>
        </span>
      </div>
      {data.trial && (
        <div className="ui-scard__trial">
          <span className="ui-caption">Trial</span>
          <Button kind="text" label="Changes" onClick={onChanges} />
        </div>
      )}
    </section>
  );
}
