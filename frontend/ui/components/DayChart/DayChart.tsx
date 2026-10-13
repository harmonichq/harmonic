// DayChart (§4.2): one day, full width, on one time axis: a strip of the
// day's context, the glucose lane, a lane of event marks, and basal.
//
// Each kind of event has one glyph from the library's icons, drawn in its data
// family's colour wherever it appears (the chart, the legend, the list):
// insulin violet for a meal bolus (a drop over a plate line) and a correction
// (a plain drop), so the two differ by shape as well; carbs teal for a logged
// entry (wheat); device and context neutral ink for a site change (an infusion
// set) and sleep (a moon). No family reuses a glucose zone hue or the blue
// accent.
//
// The strip: the pump's sleep schedule as a quiet neutral bar with its moon,
// its hours washed faintly through the lanes beneath, and each site change at
// its time. Glucose: the trace over the 70–180 band, a quiet green in range and
// in its glucose zone's tone and hatch outside it (glucose-zones.tsx), clipped
// per zone as the DayTile draws it, and broken where readings stop; the band's
// two edges carry their served values, the unit after the upper one, so the
// zone colours need no legend. The marks lane holds boluses and logged carbs at
// one size, off the trace; marks close in time stack into a second row. Basal:
// what was delivered as a violet area, against the pump profile's programmed
// rate as a neutral dashed step, on a scale labelled at its top. The axis runs
// flush with the text column, its end labels anchored inward.
//
// Below, the day's events in time order: the time, the glyph, the kind, then
// grams (in the carbs colour) and units in aligned columns. A day without
// readings keeps its band and axis, says "No data", and lists nothing.
import type { DayChartData, DayEvent } from '../../day-model';
import { Num, NumSvg } from '../../Num';
import { formatValue } from '../../provenance.js';
import { glucoseDomain, glucoseFraction, zones } from '../../glucose-zones';
import { Icon } from '../../icons';
import '../../shared.css';
import './DayChart.css';

export type DayChartProps = { data: DayChartData; width?: number; layout?: 'phone' | 'desktop' };

const DAY = 1440;
const GAP = 10; // minutes without a reading that break the trace
const LANE_GAP = 10;
const BASAL_HEIGHT = 30;
const AXIS_HEIGHT = 18;
const STRIP = 18; // the sleep bar and site-change marks above the glucose lane

const GLYPH = 14;
const ROW = 17; // a stacked row in the marks lane
const ROWS = 2;
const MARKS_HEIGHT = ROW * ROWS + 2;

type Family = 'insulin' | 'carbs' | 'device';
const FAMILY: Record<DayEvent['kind'] | 'sleep', Family> = {
  meal: 'insulin', correction: 'insulin', carbs: 'carbs', site: 'device', sleep: 'device',
};

/** A day-event glyph from the library's icons, centred on (x, y), in its family's colour. */
function Glyph({ name, x, y, size = GLYPH }: { name: DayEvent['kind'] | 'sleep'; x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2})`} className={`ui-daychart__mark ui-daychart__mark--${FAMILY[name]}`}>
      <rect width={size} height={size} rx={3} className="ui-daychart__halo" />
      <Icon name={name} size={size} stroke={1.8} />
    </g>
  );
}

function Key({ kind, label }: { kind: DayEvent['kind'] | 'sleep' | 'basal' | 'profile'; label: string }) {
  return (
    <span className="ui-daychart__key">
      {kind === 'basal' || kind === 'profile' ? (
        <svg aria-hidden="true" width="14" height="10">
          {kind === 'basal' ? <rect y="2" width="14" height="8" className="ui-daychart__basal" />
            : <line x1="0" x2="14" y1="5" y2="5" className="ui-daychart__profile" />}
        </svg>
      ) : (
        <span className={`ui-daychart__key-glyph ui-daychart__mark--${FAMILY[kind]}`}><Icon name={kind} size={14} stroke={1.8} /></span>
      )}
      {label}
    </span>
  );
}

/** Places for the marks lane: each mark takes the first row where it clears the
 *  one before it, so marks close in time stack; when every row is taken it goes
 *  in the row that frees soonest, nudged just clear of its neighbour. */
function stack<T extends { minute: number }>(marks: T[], x: (minute: number) => number, width: number) {
  const ends: number[] = [];
  const clear = GLYPH + 2;
  return marks.map((mark) => {
    let at = Math.min(Math.max(x(mark.minute), GLYPH / 2), width - GLYPH / 2);
    let row = ends.findIndex((end) => at - end >= clear);
    if (row === -1 && ends.length < ROWS) row = ends.length;
    if (row === -1) {
      row = ends.indexOf(Math.min(...ends));
      at = Math.min(ends[row] + clear, width - GLYPH / 2);
    }
    ends[row] = at;
    return { mark, row, at };
  });
}

const LABELS: Record<DayEvent['kind'], string> = {
  meal: 'Meal', correction: 'Correction', carbs: 'Carbs', site: 'Site change',
};

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
  const glucoseTop = STRIP + 4;
  const glucoseBottom = glucoseTop + glucoseHeight;
  const marksTop = glucoseBottom + LANE_GAP / 2;
  const marksBottom = marksTop + MARKS_HEIGHT;
  const basalTop = marksBottom + LANE_GAP;
  const basalBottom = basalTop + BASAL_HEIGHT;
  const height = basalBottom + AXIS_HEIGHT;
  const empty = data.cgm.length === 0;

  const x = (minute: number) => width * (minute / DAY);
  const domain = glucoseDomain(data.cgm.map((r) => r.bg));
  const y = (bg: number) => glucoseBottom - glucoseHeight * glucoseFraction(bg, domain);
  const traces = runs(data.cgm).map((run) => run.map((r) => `${x(r.minute).toFixed(1)},${y(r.bg).toFixed(1)}`).join(' '));
  const id = `ui-daychart-${layout}`;

  const marks = stack(data.events.filter((e) => e.kind !== 'site'), x, width);
  const sites = data.events.filter((e) => e.kind === 'site');
  const sleep = empty ? [] : data.sleep;

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
          {data.events.some((e) => e.kind === 'meal') && <Key kind="meal" label="Meal" />}
          {data.events.some((e) => e.kind === 'correction') && <Key kind="correction" label="Correction" />}
          {data.events.some((e) => e.kind === 'carbs') && <Key kind="carbs" label="Carbs" />}
          <Key kind="basal" label="Basal" />
          <Key kind="profile" label="Pump profile" />
          {sleep.length > 0 && <Key kind="sleep" label="Sleep" />}
          {sites.length > 0 && <Key kind="site" label="Site change" />}
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
          {sleep.map((w) => (
            <g key={w.from}>
              <rect x={x(w.from)} y={glucoseTop} width={x(w.to) - x(w.from)} height={basalBottom - glucoseTop}
                className="ui-daychart__sleep-wash" />
              <rect x={x(w.from)} y={7} width={x(w.to) - x(w.from)} height={4} rx={2} className="ui-daychart__sleep" />
              {x(w.to) - x(w.from) > 3 * GLYPH && (
                <Glyph name="sleep" x={x(w.from) + GLYPH / 2} y={9} size={12} />
              )}
            </g>
          ))}
          {sites.map((e) => <Glyph key={`s${e.minute}`} name="site" x={Math.min(Math.max(x(e.minute), GLYPH / 2), width - GLYPH / 2)} y={9} />)}
          {hours.slice(1, -1).map((minute) => (
            <line key={minute} x1={x(minute)} x2={x(minute)} y1={glucoseTop} y2={basalBottom} className="ui-daychart__grid" />
          ))}
          <rect x={0} y={yHigh} width={width} height={yLow - yHigh} className="ui-daychart__band ui-zone-area ui-zone--in-range" />
          <line x1={0} x2={width} y1={yLow} y2={yLow} className="ui-daychart__target" />
          <line x1={0} x2={width} y1={yHigh} y2={yHigh} className="ui-daychart__target" />
          <line x1={0} x2={width} y1={glucoseBottom} y2={glucoseBottom} className="ui-daychart__rule" />
          <line x1={0} x2={width} y1={marksBottom} y2={marksBottom} className="ui-daychart__rule" />
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
          {marks.map(({ mark, row, at }, i) => (
            <Glyph key={i} name={mark.kind} x={at} y={marksTop + ROW / 2 + row * ROW} />
          ))}
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
              <span className={`ui-daychart__glyph ui-daychart__mark--${FAMILY[e.kind]}`} aria-hidden="true"><Icon name={e.kind} size={14} stroke={1.8} /></span>
              <span className="ui-daychart__kind">{LABELS[e.kind]}</span>
              <span className="ui-daychart__grams ui-daychart__mark--carbs">
                {e.kind === 'carbs' ? <><Num value={e.grams} /> g</> : 'carbs' in e && e.carbs && <><Num value={e.carbs} /> g</>}
              </span>
              <span className="ui-daychart__units">{'insulin' in e && <><Num value={e.insulin} /> U</>}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
