// DayRibbon (§4.2): one week of days as one gapless ribbon. The seven days
// share one 70–180 band and one glucose trace that runs on from each day into
// the next, broken only where a day has no readings, with hairline dividers
// between the days; the trace is a quiet green in range and in its glucose
// zone's tone outside it (glucose-zones.tsx). Each day names its weekday and
// date above the trace and its ▽ lows, △ highs (or ✓ for neither) and in-range
// % beneath it.
//
// Each day is a button over its whole column: it picks that day. Selected
// tints the whole column --primary behind the trace and sets its weekday and
// date in --primary, as the NavBar's selection pill does, so selection carries
// a position as well as a colour; the trace runs on across it unchanged. A day with no data keeps its weekday and date,
// dimmed, draws no trace, and cannot be picked. The ribbon measures its box.
import { useId } from 'react';
import type { DayData } from '../../overview-model';
import { isClean } from '../../overview-model';
import { NumSvg } from '../../Num';
import { formatValue } from '../../provenance.js';
import { useWidth } from '../../measure';
import { glucoseDomain, glucoseFraction, zones } from '../../glucose-zones';
import '../../shared.css';
import './DayRibbon.css';

export type DayRibbonProps = {
  /** Seven days, Monday first. */
  days: DayData[];
  /** The selected day's served date (YYYY-MM-DD), if it is in this week. */
  selected?: string;
  onSelect?: (iso: string) => void;
};

const HEAD = 34; // weekday and date
const TRACE = 40;
const FOOT = 40; // counts and in-range %
const HEIGHT = HEAD + TRACE + FOOT;
const LOW = 70;
const HIGH = 180;

export function DayRibbon({ days, selected, onSelect }: DayRibbonProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const id = `ui-ribbon-${useId().replace(/:/g, '')}`;
  const column = width / days.length;
  const domain = glucoseDomain(days.flatMap((d) => d.curve.map((p) => p.bg)));
  const y = (bg: number) => HEAD + TRACE * (1 - glucoseFraction(bg, domain));
  // One joined line across the week, broken where a day has no readings.
  const runs: string[] = [];
  let run: string[] = [];
  days.forEach((d, i) => {
    if (!d.hasData) {
      if (run.length) runs.push(run.join(' '));
      run = [];
      return;
    }
    for (const p of d.curve) run.push(`${((i + p.x) * column).toFixed(1)},${y(p.bg).toFixed(1)}`);
  });
  if (run.length) runs.push(run.join(' '));

  return (
    <div ref={box} className="ui-ribbon ui-chart">
      {width > 0 && (
        <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-ribbon__chart">
          <defs>
            {zones(LOW, HIGH).map((zone) => (
              <clipPath key={zone.tone} id={`${id}-${zone.tone}`}>
                <rect x={-2} width={width + 4} y={zone.to === Infinity ? 0 : y(zone.to)}
                  height={(zone.from === -Infinity ? HEIGHT : y(zone.from)) - (zone.to === Infinity ? 0 : y(zone.to))} />
              </clipPath>
            ))}
          </defs>
          <g aria-hidden="true">
            {days.map((d, i) => d.date.value === selected && (
              <rect key="selected" x={i * column + 1} y={1} width={column - 2} height={HEIGHT - 2} rx={7} ry={7}
                className="ui-ribbon__selected" />
            ))}
            <rect x={0} y={y(HIGH)} width={width} height={y(LOW) - y(HIGH)} className="ui-ribbon__band ui-zone-area ui-zone--in-range" />
            {days.slice(1).map((d, i) => (
              <line key={d.date.value} x1={(i + 1) * column} x2={(i + 1) * column} y1={0} y2={HEIGHT} className="ui-ribbon__divider" />
            ))}
            {zones(LOW, HIGH).map((zone) => runs.map((points, k) => (
              <polyline key={`${zone.tone}-${k}`} points={points} clipPath={`url(#${id}-${zone.tone})`}
                className={zone.tone === 'in-range' ? 'ui-ribbon__trace ui-ribbon__trace--in-range'
                  : `ui-ribbon__trace ui-zone-stroke ui-zone--${zone.tone}`} />
            )))}
          </g>
          {days.map((d, i) => (
            <g key={d.date.value} className={d.hasData ? undefined : 'ui-ribbon__none'}>
              <text x={i * column + 6} y={13} className="ui-ribbon__weekday" data-selected={d.date.value === selected || undefined}>{d.weekday}</text>
              <text x={i * column + 6} y={28} className="ui-ribbon__date" data-selected={d.date.value === selected || undefined}><NumSvg value={d.date} /></text>
              {d.hasData && (
                <>
                  <text x={i * column + 6} y={HEAD + TRACE + 17} className="ui-ribbon__counts">
                    {isClean(d) && <tspan className="ui-ribbon__clean">✓</tspan>}
                    {d.lows.value > 0 && <><tspan className="ui-ribbon__low">▽</tspan><NumSvg value={d.lows} /> </>}
                    {d.highs.value > 0 && <><tspan className="ui-ribbon__high">△</tspan><NumSvg value={d.highs} /></>}
                  </text>
                  <text x={i * column + 6} y={HEAD + TRACE + 34} className="ui-ribbon__tir">
                    <NumSvg value={d.tir} /><tspan className="ui-ribbon__unit">%</tspan>
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      )}
      <div className="ui-ribbon__days">
        {days.map((d) => (
          <button key={d.date.value} type="button" className="ui-ribbon__day" data-role="row"
            aria-label={`${d.weekday} ${formatValue(`${d.date.value}`, 'date')}`}
            aria-pressed={d.date.value === selected} disabled={!d.hasData} onClick={() => onSelect?.(d.date.value)} />
        ))}
      </div>
    </div>
  );
}
