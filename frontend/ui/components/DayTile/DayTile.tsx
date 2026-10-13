// DayTile (§4.2): one day — its weekday and date, a sparkline of the day's
// glucose over the 70–180 band, its low and high counts, and its in-range %.
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
import '../../shared.css';
import './DayTile.css';

export type DayTileProps = { day: DayData; selected?: boolean; width?: number; onSelect?: () => void };

const HEIGHT = 72;
const FLOOR = 40;    // mg/dL at the sparkline's bottom
const CEILING = 400; // and at its top
const LOW = 70;
const HIGH = 180;

export function DayTile({ day, selected = false, width = 145, onSelect }: DayTileProps) {
  const y = (bg: number) => HEIGHT * (1 - (Math.min(Math.max(bg, FLOOR), CEILING) - FLOOR) / (CEILING - FLOOR));
  const points = day.curve.map((p) => `${(p.x * width).toFixed(1)},${y(p.bg).toFixed(1)}`).join(' ');
  const clean = isClean(day);
  return (
    <button type="button" className="ui-day" data-role="row" aria-pressed={selected} disabled={!day.hasData}
      onClick={onSelect}>
      <span className="ui-day__head">
        <span className="ui-caption">{day.weekday}</span>
        <span className="ui-day__date" data-source={day.date.source} data-format={day.date.format}>
          {formatValue(day.date.value, day.date.format)}
        </span>
      </span>
      <svg aria-hidden="true" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-day__spark">
        <rect x={0} y={y(HIGH)} width={width} height={y(LOW) - y(HIGH)} className="ui-day__band" />
        {day.hasData && <polyline points={points} className="ui-day__trace" />}
      </svg>
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
