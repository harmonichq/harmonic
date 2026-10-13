// DayChart (§4.2): one day, full width, three lanes on one time axis.
//
// Glucose: the trace over the 70–180 band, a quiet green in range and in its
// glucose zone's tone and hatch outside it (glucose-zones.tsx), clipped per
// zone as the DayTile draws it, and broken where readings stop. The band's two
// edges are labelled with their served values, the unit after the upper one, so
// the zone colours need no legend. Logged carbs are rings on the trace at their
// time. Insulin: one bar per bolus, as tall as its units against the day's
// largest; a meal bolus is filled, a correction outlined. Basal: what was
// delivered as an area, against the pump profile's programmed rate as a dashed
// step, on a scale labelled at its top. The axis runs flush with the text
// column, its end labels anchored inward.
//
// Below, the day's events in time order: the time, the mark, the kind, then
// grams and units in aligned columns. A day without readings keeps its band
// and axis, says "No data", and lists nothing.
import type { DayChartData, DayEvent } from '../../day-model';
import { Num, NumSvg } from '../../Num';
import { formatValue } from '../../provenance.js';
import { zones } from '../../glucose-zones';
import '../../shared.css';
import './DayChart.css';

export type DayChartProps = { data: DayChartData; width?: number; layout?: 'phone' | 'desktop' };

const DAY = 1440;
const FLOOR = 40;
const CEILING = 300;
const GAP = 10; // minutes without a reading that break the trace
const LANE_GAP = 10;
const INSULIN_HEIGHT = 30;
const BASAL_HEIGHT = 30;
const AXIS_HEIGHT = 18;

function Mark({ kind, x, y, size = 8 }: { kind: DayEvent['kind']; x: number; y: number; size?: number }) {
  if (kind === 'carbs') return <circle cx={x} cy={y} r={size / 2} className="ui-daychart__carbs" />;
  return <rect x={x - size / 4} y={y - size / 2} width={size / 2} height={size}
    className={kind === 'meal' ? 'ui-daychart__meal' : 'ui-daychart__correction'} />;
}

function Key({ kind, label }: { kind: DayEvent['kind'] | 'basal' | 'profile'; label: string }) {
  return (
    <span className="ui-daychart__key">
      <svg aria-hidden="true" width="14" height="10">
        {kind === 'basal' ? <rect y="2" width="14" height="8" className="ui-daychart__basal" />
          : kind === 'profile' ? <line x1="0" x2="14" y1="5" y2="5" className="ui-daychart__profile" />
            : <Mark kind={kind} x={7} y={5} />}
      </svg>
      {label}
    </span>
  );
}

const LABELS: Record<DayEvent['kind'], string> = { meal: 'Meal', correction: 'Correction', carbs: 'Carbs' };

/** Unbroken runs of readings. */
function runs(cgm: DayChartData['cgm']) {
  const out: DayChartData['cgm'][] = [];
  for (const reading of cgm) {
    const run = out[out.length - 1];
    if (run && reading.minute - run[run.length - 1].minute <= GAP) run.push(reading);
    else out.push([reading]);
  }
  return out;
}

export function DayChart({ data, width = 358, layout = 'phone' }: DayChartProps) {
  const glucoseHeight = layout === 'desktop' ? 260 : 176;
  const glucoseTop = 4;
  const glucoseBottom = glucoseTop + glucoseHeight;
  const insulinTop = glucoseBottom + LANE_GAP;
  const insulinBottom = insulinTop + INSULIN_HEIGHT;
  const basalTop = insulinBottom + LANE_GAP;
  const basalBottom = basalTop + BASAL_HEIGHT;
  const height = basalBottom + AXIS_HEIGHT;
  const empty = data.cgm.length === 0;

  const x = (minute: number) => width * (minute / DAY);
  const top = Math.max(CEILING, ...data.cgm.map((r) => r.bg + 10));
  const y = (bg: number) => glucoseBottom - glucoseHeight * ((Math.min(Math.max(bg, FLOOR), top) - FLOOR) / (top - FLOOR));
  const traces = runs(data.cgm).map((run) => run.map((r) => `${x(r.minute).toFixed(1)},${y(r.bg).toFixed(1)}`).join(' '));
  const bgAt = (minute: number) => data.cgm.reduce((best, r) =>
    Math.abs(r.minute - minute) < Math.abs(best.minute - minute) ? r : best, data.cgm[0]);
  const id = `ui-daychart-${layout}`;

  const doses = data.events.filter((e): e is Extract<DayEvent, { insulin: unknown }> => e.kind !== 'carbs');
  const most = Math.max(0, ...doses.map((e) => e.insulin.value));
  const bar = layout === 'desktop' ? 6 : 4;

  const rates = data.basal.flatMap((row) => [row.delivered, row.programmed]);
  const basalMax = Math.max(0.5, Math.ceil(Math.max(0, ...rates) * 2) / 2);
  const by = (rate: number) => basalBottom - (BASAL_HEIGHT - 4) * (rate / basalMax);
  const step = (key: 'delivered' | 'programmed') => data.basal
    .map((row) => `L${x(row.minute).toFixed(1)},${by(row[key]).toFixed(1)}L${x(row.minute + row.duration).toFixed(1)},${by(row[key]).toFixed(1)}`)
    .join('').replace(/^L/, 'M');
  const delivered = data.basal.length
    ? `${step('delivered')}L${x(data.basal[data.basal.length - 1].minute + data.basal[data.basal.length - 1].duration).toFixed(1)},${basalBottom}L${x(data.basal[0].minute).toFixed(1)},${basalBottom}Z`
    : '';

  const hours = [0, 360, 720, 1080, DAY];
  const yLow = y(data.low.value);
  const yHigh = y(data.high.value);

  return (
    <section className={`ui-daychart ui-daychart--${layout}`}>
      {!empty && (
        <div className="ui-daychart__legend">
          <Key kind="meal" label="Meal" />
          <Key kind="correction" label="Correction" />
          {data.events.some((e) => e.kind === 'carbs') && <Key kind="carbs" label="Carbs" />}
          <Key kind="basal" label="Basal" />
          <Key kind="profile" label="Pump profile" />
        </div>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ui-daychart__chart">
        <defs>
          {zones(data.low.value, data.high.value).map((zone) => (
            <clipPath key={zone.tone} id={`${id}-${zone.tone}`}>
              <rect x={-4} width={width + 8}
                y={zone.to === Infinity ? 0 : y(zone.to)}
                height={(zone.from === -Infinity ? height : y(zone.from)) - (zone.to === Infinity ? 0 : y(zone.to))} />
            </clipPath>
          ))}
        </defs>
        <g aria-hidden="true">
          {hours.slice(1, -1).map((minute) => (
            <line key={minute} x1={x(minute)} x2={x(minute)} y1={glucoseTop} y2={basalBottom} className="ui-daychart__grid" />
          ))}
          <rect x={0} y={yHigh} width={width} height={yLow - yHigh} className="ui-daychart__band ui-zone-area ui-zone--in-range" />
          <line x1={0} x2={width} y1={yLow} y2={yLow} className="ui-daychart__target" />
          <line x1={0} x2={width} y1={yHigh} y2={yHigh} className="ui-daychart__target" />
          <line x1={0} x2={width} y1={glucoseBottom} y2={glucoseBottom} className="ui-daychart__rule" />
          <line x1={0} x2={width} y1={insulinBottom} y2={insulinBottom} className="ui-daychart__rule" />
          <line x1={0} x2={width} y1={basalBottom} y2={basalBottom} className="ui-daychart__rule" />
        </g>
        <text x={0} y={yHigh - 5} className="ui-daychart__scale">
          <NumSvg value={data.high} /><tspan className="ui-daychart__unit"> mg/dL</tspan>
        </text>
        <text x={0} y={yLow - 5} className="ui-daychart__scale"><NumSvg value={data.low} /></text>
        <g aria-hidden="true">
          {zones(data.low.value, data.high.value).map((zone) => traces.map((points, i) => (
            <polyline key={`${zone.tone}-${i}`} points={points} clipPath={`url(#${id}-${zone.tone})`}
              className={zone.tone === 'in-range' ? 'ui-daychart__trace ui-daychart__trace--in-range'
                : `ui-daychart__trace ui-zone-stroke ui-zone--${zone.tone}`} />
          )))}
          {!empty && data.events.filter((e) => e.kind === 'carbs').map((e) => (
            <Mark key={`c${e.minute}`} kind="carbs" x={x(e.minute)} y={y(bgAt(e.minute).bg)} size={10} />
          ))}
          {doses.map((e, i) => {
            const h = Math.max(3, (INSULIN_HEIGHT - 2) * (e.insulin.value / most));
            return <rect key={i} x={x(e.minute) - bar / 2} y={insulinBottom - h} width={bar} height={h}
              className={e.kind === 'meal' ? 'ui-daychart__meal' : 'ui-daychart__correction'} />;
          })}
          {delivered && <path d={delivered} className="ui-daychart__basal" />}
          {delivered && <path d={step('programmed')} className="ui-daychart__profile" />}
        </g>
        {empty && (
          <text x={width / 2} y={(yLow + yHigh) / 2 + 5} textAnchor="middle" className="ui-daychart__empty">No data</text>
        )}
        {!empty && (
          <g data-axis="">
            <text x={0} y={basalTop + 9} className="ui-daychart__scale">
              {basalMax.toFixed(1)}<tspan className="ui-daychart__unit"> U/h</tspan>
            </text>
          </g>
        )}
        <g data-axis="">
          {hours.map((minute, i) => (
            <text key={minute} x={x(minute)} y={height - 3} className="ui-daychart__scale"
              textAnchor={i === 0 ? 'start' : i === hours.length - 1 ? 'end' : 'middle'}>
              {formatValue(minute, 'clock')}
            </text>
          ))}
        </g>
      </svg>
      {data.events.length > 0 && (
        <ol className="ui-daychart__events" style={{ '--rows': Math.ceil(data.events.length / 3) } as React.CSSProperties}>
          {data.events.map((e, i) => (
            <li key={i} className="ui-daychart__event">
              <span className="ui-daychart__time"><Num value={e.time} /></span>
              <svg aria-hidden="true" width="12" height="12" className="ui-daychart__glyph"><Mark kind={e.kind} x={6} y={6} size={10} /></svg>
              <span className="ui-daychart__kind">{LABELS[e.kind]}</span>
              <span className="ui-daychart__grams">
                {e.kind === 'carbs' ? <><Num value={e.grams} /> g</> : e.carbs && <><Num value={e.carbs} /> g</>}
              </span>
              <span className="ui-daychart__units">{e.kind !== 'carbs' && <><Num value={e.insulin} /> U</>}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
