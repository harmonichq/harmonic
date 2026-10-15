// SettingCard (§4.2): the open setting. Its title is one line: the kind word
// ("Basal") in strong ink, then its time block in regular meta ink on the same
// baseline; current → suggested in figure type, only the suggestion in strong
// ink; the EvidenceChart; then Nights and Range as two captioned values. An
// ISF or I:C setting, whose evidence is not nights, has Range alone. A setting
// is changed on the pump, not here: the card's one primary is Done (#518), which
// says the person programmed it, where Pin sits on a Pattern card. A range the
// engine serves as one value (lo = hi) shows that value once. Once the slot's
// change has matured into a Trial, the card names it and links to Changes. A
// card back from a Done the next sync did not show carries the Not on pump pill
// on its title line. Snooze, when the screen offers it, is a centred text action
// beneath Done.
import { Num } from '../../Num';
import type { SettingData } from '../../queue-model';
import { Button } from '../Button/Button';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './SettingCard.css';

export type SettingCardProps = {
  data: SettingData; onChanges?: () => void;
  /** Done, the card's primary action. */
  onDone?: () => void;
  /** Snooze, the text action beneath Done. */
  onSnooze?: () => void;
};

export function SettingCard({ data, onChanges, onDone, onSnooze }: SettingCardProps) {
  const collapsed = data.lo.value === data.hi.value;
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
      {data.nights && data.roster && (
        <div className="ui-scard__chart">
          <EvidenceChart nights={data.nights} roster={data.roster} field="delivered_rate" current={data.current}
            estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units} />
        </div>
      )}
      <dl className="ui-scard__facts">
        {data.days && (
          <div>
            <dt className="ui-caption">Nights</dt>
            <dd><Num value={data.days} /></dd>
          </div>
        )}
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
      {onDone && <div className="ui-card-done"><Button kind="primary" label="Done" onClick={onDone} /></div>}
      {onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
