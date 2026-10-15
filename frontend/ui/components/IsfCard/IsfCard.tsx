// IsfCard (§4.2): the ISF estimate for the Overview's selected window, below
// its summary (§2.5, 2026-10-14). The title is "ISF" in strong ink with
// "estimate" in meta ink on its baseline, and the Uncertain pill when the
// engine flags the estimate wide. Only when the engine supports a change (its
// one ISF staging verdict) does "current → recommended" stand above the chart,
// in the Setting card's figure type; otherwise there is no figure. The chart is
// the shared EvidenceChart, one dot per fasting night's fitted ISF; beneath it
// the setting cards' one stat row: Estimate, Range and Fasting nights (ADR 523). A window the engine
// serves no estimate for says "No data"; one not read yet is the card's
// skeleton.
//
// In the Queue (§2.5, 2026-10-14), an ISF the engine stages is the same card
// in the Queue's frame: titled "ISF" alone, as its Queue row is, since there it
// is a change rather than an estimate, and with the Setting card's Snooze text
// action at its foot. A setting is changed on the pump, so there is no other
// action.
import type { IsfData } from '../../overview-model';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import { SettingFacts } from '../SettingCard/SettingCard';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import '../SettingCard/SettingCard.css';
import './IsfCard.css';

export type IsfCardProps = {
  data: IsfData | 'none' | null;
  /** The Queue's frame: no "estimate", and Snooze when the screen offers it. */
  queue?: boolean;
  onSnooze?: () => void;
};

export function IsfCard({ data, queue = false, onSnooze }: IsfCardProps) {
  const title = (
    <h2 className="ui-scard__title ui-isf__title">
      ISF{!queue && <> <span className="ui-scard__slot">estimate</span></>}
      {data && data !== 'none' && data.uncertain && <StatePill state="uncertain" />}
    </h2>
  );
  if (data === null) {
    return (
      <section className="ui-scard ui-isf" aria-busy="true">
        {title}
        <span className="ui-skeleton ui-isf__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (data === 'none') {
    return <section className="ui-scard ui-isf">{title}<p className="ui-isf__none">No data</p></section>;
  }
  return (
    <section className="ui-scard ui-isf">
      {title}
      {data.recommended && (
        <div className="ui-scard__figure">
          <span className="ui-scard__current"><Num value={data.current} /></span>
          <span className="ui-scard__arrow" aria-hidden="true">→</span>
          <span className="ui-scard__suggested"><Num value={data.recommended} /></span>
          <span className="ui-scard__units">{data.units}</span>
        </div>
      )}
      <div className="ui-scard__chart">
        <EvidenceChart dots={data.fits} roster={data.roster} field="isf" current={data.current}
          estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units} axis="ISF" />
      </div>
      <SettingFacts estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units}
        count={{ label: 'Fasting nights', value: data.nights }} />
      {queue && onSnooze && <div className="ui-card-snooze"><Button kind="text" label="Snooze" onClick={onSnooze} /></div>}
    </section>
  );
}
