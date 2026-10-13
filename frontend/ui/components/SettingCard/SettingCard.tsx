// SettingCard (§4.2): the open setting. Its title is one line: the kind word
// ("Basal") in strong ink, then its time block in regular meta ink on the same
// baseline; current → suggested in figure type, only the suggestion in strong
// ink; the EvidenceChart; then Nights and Range as two captioned values. No button: a setting is changed on the pump, not here. A range the
// engine serves as one value (lo = hi) shows that value once. Once the slot's
// change has matured into a Trial, the card names it and links to Changes.
import type { ReactNode } from 'react';
import { Num } from '../../Num';
import type { SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import '../../shared.css';
import './SettingCard.css';

export type SettingCardProps = {
  data: SettingData; onChanges?: () => void;
  /** An action on the item, in the title row (Snooze). */
  action?: ReactNode;
};

export function SettingCard({ data, onChanges, action }: SettingCardProps) {
  const collapsed = data.lo.value === data.hi.value;
  return (
    <section className="ui-scard">
      <div className="ui-scard__head">
        <h2 className="ui-scard__title">
          {data.title}{' '}
          <span className="ui-scard__slot"><Num value={data.start} />–<Num value={data.end} /></span>
        </h2>
        {action}
      </div>
      <div className="ui-scard__figure">
        <span className="ui-scard__current"><Num value={data.current} /></span>
        <span className="ui-scard__arrow" aria-hidden="true">→</span>
        <span className="ui-scard__suggested"><Num value={data.suggested} /></span>
        <span className="ui-scard__units">{data.units}</span>
      </div>
      <div className="ui-scard__chart">
        <EvidenceChart nights={data.nights} roster={data.roster} current={data.current} estimate={data.estimate}
          lo={data.lo} hi={data.hi} units={data.units} />
      </div>
      <dl className="ui-scard__facts">
        <div>
          <dt className="ui-caption">Nights</dt>
          <dd><Num value={data.days} /></dd>
        </div>
        <div>
          <dt className="ui-caption">Range</dt>
          <dd>
            {collapsed ? <Num value={data.lo} /> : <><Num value={data.lo} />–<Num value={data.hi} /></>}
            <span className="ui-scard__unit">{data.units}</span>
          </dd>
        </div>
      </dl>
      {data.trial && (
        <div className="ui-scard__trial">
          <span className="ui-caption">Trial</span>
          <Button kind="text" label="Changes" onClick={onChanges} />
        </div>
      )}
    </section>
  );
}
