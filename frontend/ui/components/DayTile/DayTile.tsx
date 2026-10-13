// DayTile (§4.2): one day — its weekday and date, a sparkline of the day's
// glucose over the 70–180 band, the trace a quiet green in range and in its glucose
// zone's tone outside it (glucose-zones.tsx), its low and high counts, and its in-range %.
//
// ▽N counts the day's lows and △N its highs; a zero count is left out, and a
// day with neither shows ✓. The tile picks its day, so it is a button at the
// list-row minimum. Selected adds the surface and a mark above, as the NavBar
// does, so selection carries a position as well as a colour. A day with no
// data keeps its weekday, date and band, draws no trace, and cannot be picked.
import type { DayData } from '../../overview-model';
import { isClean } from '../../overview-model';
import { Num } from '../../Num';
import { formatValue } from '../../provenance.js';
import { useWidth } from '../../measure';
import { glucoseDomain, glucoseFraction, zones } from '../../glucose-zones';
import '../../shared.css';
import './DayTile.css';

export type DayTileProps = { day: DayData; selected?: boolean; onSelect?: () => void };

const HEIGHT = 72;
const LOW = 70;
const HIGH = 180;

export function DayTile({ day, selected = false, onSelect }: DayTileProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const domain = glucoseDomain(day.curve.map((p) => p.bg));
  const y = (bg: number) => HEIGHT * (1 - glucoseFraction(bg, domain));
  const points = day.curve.map((p) => `${(p.x * width).toFixed(1)},${y(p.bg).toFixed(1)}`).join(' ');
  const clean = isClean(day);
  const id = `ui-day-${day.date.value}`;
  return (
    <button type="button" className="ui-day" data-role="row" aria-pressed={selected} disabled={!day.hasData}
      onClick={onSelect}>
      <span className="ui-day__head">
        <span className="ui-caption">{day.weekday}</span>
        <span className="ui-day__date" data-source={day.date.source} data-format={day.date.format}>
          {formatValue(day.date.value, day.date.format)}
        </span>
      </span>
      <div ref={box} className="ui-chart">
      {width > 0 && <svg aria-hidden="true" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-day__spark">
        <defs>
          {zones(LOW, HIGH).map((zone) => (
            <clipPath key={zone.tone} id={`${id}-${zone.tone}`}>
              <rect x={-2} width={width + 4} y={y(zone.to) - (zone.to === Infinity ? 2 : 0)}
                height={y(zone.from) - y(zone.to) + (zone.from === -Infinity || zone.to === Infinity ? 2 : 0)} />
            </clipPath>
          ))}
        </defs>
        <rect x={0} y={y(HIGH)} width={width} height={y(LOW) - y(HIGH)} className="ui-day__band ui-zone-area ui-zone--in-range" />
        {day.hasData && zones(LOW, HIGH).map((zone) => (
          <polyline key={zone.tone} points={points} clipPath={`url(#${id}-${zone.tone})`}
            className={zone.tone === 'in-range' ? 'ui-day__trace ui-day__trace--in-range' : `ui-day__trace ui-zone-stroke ui-zone--${zone.tone}`} />
        ))}
      </svg>}
      </div>
      <span className="ui-day__foot">
        {day.hasData && (<>
          <span className="ui-day__counts">
            {clean && <span className="ui-day__clean">✓</span>}
            {day.lows.value > 0 && (
              <span className="ui-day__count"><span className="ui-day__low">▽</span><Num value={day.lows} /></span>
            )}
            {day.highs.value > 0 && (
              <span className="ui-day__count"><span className="ui-day__high">△</span><Num value={day.highs} /></span>
            )}
          </span>
          <span className="ui-day__tir"><Num value={day.tir} /><span className="ui-day__unit">%</span></span>
        </>)}
      </span>
    </button>
  );
}
