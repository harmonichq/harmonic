// BasalCard (§4.2, ADR 523): the basal estimate for the Overview's selected
// window, beside the ISF estimate on desktop and under it on the phone, the
// same card size. The title is "Basal" in strong ink with "estimate" in meta
// ink on its baseline. The chart is the day in the engine's 48 half-hour
// slots: the programmed rate (Current) a dashed step; each slot's median clean
// delivered rate (Estimate) a solid tick over its Range, a bar; a slot the
// engine stages a move for marked ▲ (raise) or ▼ (lower) above it. A slot the
// engine serves no estimate for has no bar. Beneath, the legend: Current,
// Estimate, Range. A window the engine serves no slot estimate for says
// "No data"; one not read yet is the card's skeleton. Nothing to act on.
import { useWidth } from '../../measure';
import type { BasalDayData } from '../../overview-model';
import { ChartLegend } from '../Chart/ChartLegend';
import { linePath, niceTicks } from '../Chart/scale';
import '../../shared.css';
import '../Chart/Chart.css';
import '../SettingCard/SettingCard.css';
import '../IsfCard/IsfCard.css';
import './BasalCard.css';

const LEFT = 30;   // the rate ticks' gutter
const TOP = 18;    // room for the unit, and for a ▲ over the tallest bar
const PLOT = 132;
const AXIS = TOP + PLOT;
const HEIGHT = AXIS + 20;
const HOURS = [0, 360, 720, 1080, 1440];
const clock = (minute: number) => `${String(minute / 60).padStart(2, '0')}:00`;

function BasalDayChart({ data }: { data: BasalDayData }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const { slots } = data;
  const max = Math.max(...slots.flatMap((s) => [s.current, s.estimate?.hi ?? 0, s.estimate?.value ?? 0]));
  const scale = niceTicks(0, max, 5, 2);
  const top = scale.values[scale.values.length - 1];
  const right = width - 2;
  const x = (minute: number) => LEFT + (right - LEFT) * (minute / 1440);
  const y = (rate: number) => AXIS - PLOT * (rate / top);
  const programmed = linePath(slots.flatMap((s) => [[x(s.start), y(s.current)], [x(s.end), y(s.current)]] as [number, number][]));
  return (
    <div ref={box} className="ui-chart">
      {width > 0 && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-chart__svg">
          <g data-axis="">
            {scale.values.map((v, i) => (
              <g key={v}>
                <line x1={LEFT} x2={right} y1={y(v)} y2={y(v)} className={i === 0 ? 'ui-chart__axis' : 'ui-chart__grid'} />
                <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="ui-chart__tick">{v.toFixed(scale.decimals)}</text>
              </g>
            ))}
            <text x={LEFT - 6} y={TOP - 8} textAnchor="end" className="ui-chart__caption">{data.units}</text>
            {HOURS.map((m, i) => (
              <g key={m}>
                <line x1={x(m)} x2={x(m)} y1={AXIS} y2={AXIS + 4} className="ui-chart__axis" />
                <text x={x(m)} y={AXIS + 16} textAnchor={i === 0 ? 'start' : i === HOURS.length - 1 ? 'end' : 'middle'}
                  className="ui-chart__tick">{clock(m)}</text>
              </g>
            ))}
          </g>
          {slots.map((s) => s.estimate && (
            <g key={s.start}>
              <rect x={x(s.start) + 0.5} width={Math.max(1, x(s.end) - x(s.start) - 1)} y={y(s.estimate.hi)}
                height={Math.max(1, y(s.estimate.lo) - y(s.estimate.hi))} className="ui-chart__band" />
              <line x1={x(s.start) + 1} x2={x(s.end) - 1} y1={y(s.estimate.value)} y2={y(s.estimate.value)}
                className="ui-chart__estimate" />
            </g>
          ))}
          <path d={programmed} className="ui-chart__current" />
          {slots.filter((s) => s.move).map((s) => (
            <text key={s.start} x={(x(s.start) + x(s.end)) / 2} textAnchor="middle" className="ui-chart__move"
              y={Math.min(y(s.estimate?.hi ?? s.current), y(s.current)) - 4} data-move={s.move}>
              {s.move === 'raise' ? '▲' : '▼'}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

export function BasalCard({ data }: { data: BasalDayData | 'none' | null }) {
  const title = <h2 className="ui-scard__title ui-isf__title">Basal <span className="ui-scard__slot">estimate</span></h2>;
  if (data === null) {
    return (
      <section className="ui-scard ui-isf" aria-busy="true">
        {title}
        <span className="ui-skeleton ui-isf__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (data === 'none') return <section className="ui-scard ui-isf">{title}<p className="ui-isf__none">No data</p></section>;
  return (
    <section className="ui-scard ui-isf">
      {title}
      <div className="ui-scard__chart"><BasalDayChart data={data} /></div>
      <div className="ui-basal__legend">
        <ChartLegend keys={[
          { label: 'Current', swatch: 'dashed' },
          { label: 'Estimate', swatch: 'estimate' },
          { label: 'Range', swatch: 'band' },
        ]} />
      </div>
    </section>
  );
}
