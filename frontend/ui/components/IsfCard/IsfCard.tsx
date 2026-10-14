// IsfCard (§4.2): the ISF estimate for the Overview's selected window, below
// its summary (§2.5, 2026-10-14). The title is "ISF" in strong ink with
// "estimate" in meta ink on its baseline, and the Uncertain pill when the
// engine flags the estimate wide. Only when the engine supports a change (its
// one ISF staging verdict) does "current → recommended" stand above the chart,
// in the Setting card's figure type; otherwise there is no figure. The chart is
// the shared EvidenceChart, one dot per fasting night's fitted ISF; beneath it
// Estimate, Range and Fasting nights as captioned values. A window the engine
// serves no estimate for says "No data"; one not read yet is the card's
// skeleton.
import type { IsfData } from '../../overview-model';
import { Num } from '../../Num';
import { EvidenceChart } from '../EvidenceChart/EvidenceChart';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import '../SettingCard/SettingCard.css';
import './IsfCard.css';

export type IsfCardProps = { data: IsfData | 'none' | null };

export function IsfCard({ data }: IsfCardProps) {
  const title = (
    <h2 className="ui-scard__title ui-isf__title">
      ISF <span className="ui-scard__slot">estimate</span>
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
  const collapsed = data.lo.value === data.hi.value;
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
        <EvidenceChart nights={data.fits} roster={data.roster} field="isf" current={data.current}
          estimate={data.estimate} lo={data.lo} hi={data.hi} units={data.units} />
      </div>
      <dl className="ui-scard__facts ui-isf__facts">
        <div>
          <dt className="ui-caption">Estimate</dt>
          <dd>
            <span className="ui-isf__estimate"><Num value={data.estimate} /></span>
            <span className="ui-scard__unit">{data.units}</span>
          </dd>
        </div>
        <div>
          <dt className="ui-caption">Range</dt>
          <dd>
            {collapsed ? <Num value={data.lo} /> : <><Num value={data.lo} />–<Num value={data.hi} /></>}
            <span className="ui-scard__unit">{data.units}</span>
          </dd>
        </div>
        <div>
          <dt className="ui-caption">Fasting nights</dt>
          <dd><Num value={data.nights} /></dd>
        </div>
      </dl>
    </section>
  );
}
