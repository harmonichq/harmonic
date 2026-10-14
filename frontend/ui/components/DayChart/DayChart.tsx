// DayChart (§4.2): one day, full width, on one time axis: a strip of the
// day's context, the glucose lane, a lane of event marks, and basal.
//
// Each kind of event has one glyph from the library's icons, drawn in its data
// family's colour wherever it appears (the chart, the legend, the list):
// insulin violet for a meal bolus (a drop over a plate line) and a correction
// (a plain drop), so the two differ by shape as well; carbs teal for a logged
// entry (wheat); device and context neutral ink for a site change (an infusion
// set) and sleep (a moon); and the engine's own marks, a moment it counted
// toward a habit, as the Pattern glyph in the brightest ink. No family reuses
// a glucose zone hue or the blue accent.
//
// The strip: the pump's sleep schedule as a quiet neutral bar with its moon,
// its hours washed faintly through the lanes beneath, and each site change at
// its time. Glucose: the trace over the 70–180 band, a quiet green in range and
// in its glucose zone's tone and hatch outside it (glucose-zones.tsx), clipped
// per zone as the DayRibbon draws it, and broken where readings stop; the band's
// two edges carry their served values, the unit after the upper one, so the
// zone colours need no legend. The marks lane holds, on its top row, a Pattern
// glyph at each moment the engine counted (the model-view's anchors), and
// beneath it boluses and logged carbs at one size, off the trace; marks close
// in time stack into a second row.
//
// Basal, as the desk drew it (2026-10-14): not the rate but its difference
// from the pump profile, on a scale centred on the profile's dashed line.
// Where Control-IQ delivered more than programmed, a bar rises above the line
// in body ink; where it delivered less, a lighter bar hangs below; where
// nothing was delivered (a suspend), the bar reaches down by the whole
// programmed rate, hatched. Consecutive slots of one difference merge into one
// bar, so each bar is one held command, and a gap in the rows is left empty.
// The scale is linear, never narrower than BASAL_FLOOR each side, with
// headroom, and its two signed ticks are labelled. The axis runs flush with
// the text column, its end labels anchored inward.
//
// Below, the day's events in time order: the time, the glyph, the kind (with
// the served titles of the habits a bolus was counted toward), then grams (in
// the carbs colour) and units in aligned columns; a Pattern row names its
// habits and the reading. On desktop in as many columns, up to three, as the
// measured width holds. A day without readings keeps its band and axis, says
// "No data", and lists nothing.
import type { DayChartData, DayEvent } from '../../day-model';
import { Num, NumSvg } from '../../Num';
import { formatValue } from '../../provenance.js';
import { useWidth } from '../../measure';
import { glucoseDomain, glucoseFraction, zones } from '../../glucose-zones';
import { Icon } from '../../icons';
import '../../shared.css';
import './DayChart.css';

export type DayChartProps = { data: DayChartData; layout?: 'phone' | 'desktop' };

const DAY = 1440;
const GAP = 10; // minutes without a reading that break the trace
const LANE_GAP = 10;
const AXIS_HEIGHT = 18;
const BASAL_FLOOR = 0.3; // U/h: the least each side of the basal scale reaches
const BASAL_HEADROOM = 1.15;
const STRIP = 18; // the sleep bar and site-change marks above the glucose lane

const GLYPH = 14;
const ROW = 17; // a stacked row in the marks lane
const ROWS = 2;
const MARKS_HEIGHT = ROW * (ROWS + 1) + 2; // the Pattern row, then the bolus and carbs rows
const EVENT_COLUMN = 300; // desktop: the width one column of the event list needs, with its gap

const markClass = (kind: DayEvent['kind'] | 'sleep') => `ui-daychart__mark${
  kind === 'meal' || kind === 'carbs' ? ' ui-daychart__mark--meal' : kind === 'pattern' ? ' ui-daychart__mark--pattern' : ''}`;

/** A day-event glyph from the library's icons, centred on (x, y): food (a meal bolus, logged carbs) in its colour, the rest neutral. */
function Glyph({ name, x, y, size = GLYPH }: { name: DayEvent['kind'] | 'sleep'; x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x - size / 2},${y - size / 2})`} className={markClass(name)}>
      <rect width={size} height={size} rx={3} className="ui-daychart__halo" />
      <Icon name={name} size={size} stroke={1.8} />
    </g>
  );
}

function Key({ kind, label }: { kind: DayEvent['kind'] | 'sleep' | 'basal' | 'profile' | 'suspend'; label: string }) {
  return (
    <span className="ui-daychart__key">
      {kind === 'basal' || kind === 'profile' ? (
        <svg aria-hidden="true" width="14" height="12">
          {kind === 'basal' ? <>
            <rect x="1" y="0" width="5" height="6" className="ui-daychart__basal-up" />
            <rect x="8" y="6" width="5" height="6" className="ui-daychart__basal-down" />
          </> : <line x1="0" x2="14" y1="6" y2="6" className="ui-daychart__profile" />}
        </svg>
      ) : kind === 'suspend' ? (
        <span aria-hidden="true" className="ui-daychart__key-suspend" />
      ) : (
        <span className={`ui-daychart__key-glyph ${markClass(kind)}`}><Icon name={kind} size={14} stroke={1.8} /></span>
      )}
      {label}
    </span>
  );
}

type Plateau = { from: number; to: number; diff: number; suspended: boolean };

/** The basal rows as held commands: consecutive slots with one difference from
 *  the profile (and the same delivered-or-not) merge, but only where the next
 *  slot starts where the last ended, so a gap in the rows stays a gap. */
function plateaus(basal: DayChartData['basal']): Plateau[] {
  const out: Plateau[] = [];
  for (const row of basal) {
    const diff = Math.round((row.delivered - row.programmed) * 1000) / 1000;
    const suspended = row.delivered === 0;
    const last = out[out.length - 1];
    if (last && last.diff === diff && last.suspended === suspended && Math.abs(last.to - row.minute) < 1) {
      last.to = row.minute + row.duration;
    } else {
      out.push({ from: row.minute, to: row.minute + row.duration, diff, suspended });
    }
  }
  return out;
}

const signed = (rate: number) => `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${Math.abs(rate).toFixed(1)}`;

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

const LABELS: Record<Exclude<DayEvent['kind'], 'pattern'>, string> = {
  meal: 'Meal', correction: 'Correction', carbs: 'Carbs', site: 'Site change',
};

/** An event's kind as the list prints it: a Pattern by its habits; a bolus the
 *  engine counted, followed by them. */
const kindLabel = (e: DayEvent) => e.kind === 'pattern' ? e.habits.join(' · ')
  : [LABELS[e.kind], ...('habits' in e ? e.habits : [])].join(' · ');

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

export function DayChart({ data, layout = 'phone' }: DayChartProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  // Desktop's glucose lane gave 55 px to the basal lane and the Pattern row
  // (2026-10-14), so the Day pane still fits its 1440 × 900 frame: about the
  // desk's three to one of glucose to basal.
  const glucoseHeight = layout === 'desktop' ? 205 : 176;
  const basalHeight = layout === 'desktop' ? 72 : 56;
  const glucoseTop = STRIP + 4;
  const glucoseBottom = glucoseTop + glucoseHeight;
  const marksTop = glucoseBottom + LANE_GAP / 2;
  const marksBottom = marksTop + MARKS_HEIGHT;
  const basalTop = marksBottom + LANE_GAP;
  const basalBottom = basalTop + basalHeight;
  const height = basalBottom + AXIS_HEIGHT;
  const empty = data.cgm.length === 0;

  const x = (minute: number) => width * (minute / DAY);
  const domain = glucoseDomain(data.cgm.map((r) => r.bg));
  const y = (bg: number) => glucoseBottom - glucoseHeight * glucoseFraction(bg, domain);
  const traces = runs(data.cgm).map((run) => run.map((r) => `${x(r.minute).toFixed(1)},${y(r.bg).toFixed(1)}`).join(' '));
  const id = `ui-daychart-${layout}`;

  const marks = stack(data.events.filter((e) => e.kind !== 'site' && e.kind !== 'pattern'), x, width);
  // One Pattern glyph per counted moment, on the lane's top row: a Pattern
  // event, or a bolus the engine counted.
  const counted = data.events.filter((e) => 'habits' in e && e.habits.length > 0)
    .map((e) => Math.min(Math.max(x(e.minute), GLYPH / 2), width - GLYPH / 2));
  const sites = data.events.filter((e) => e.kind === 'site');
  const sleep = empty ? [] : data.sleep;

  // The basal lane: each held command's difference from the profile, on a
  // linear scale never narrower than BASAL_FLOOR each side, ticked at the
  // day's largest rise and fall (rounded out to a tenth) and given headroom
  // beyond them.
  const held = plateaus(data.basal);
  const diffs = held.map((p) => p.diff);
  const upper = Math.max(BASAL_FLOOR, Math.ceil(Math.max(0, ...diffs) * 10) / 10);
  const lower = Math.min(-BASAL_FLOOR, Math.floor(Math.min(0, ...diffs) * 10) / 10);
  const pad = (upper - lower) * (BASAL_HEADROOM - 1) / 2;
  const by = (diff: number) => basalTop + basalHeight * ((upper + pad - diff) / (upper - lower + 2 * pad));
  const zero = by(0);
  const bars = held.filter((p) => p.diff !== 0).map((p) => {
    const x0 = x(p.from);
    const x1 = x(p.to);
    const inset = x1 - x0 > 8 ? 0.5 : 0; // a hairline between held commands wider than a slot or so
    return { ...p, x: x0 + inset, width: Math.max(1, x1 - x0 - 2 * inset),
      y: Math.min(zero, by(p.diff)), height: Math.max(1, Math.abs(by(p.diff) - zero)) };
  });
  const suspends = bars.some((bar) => bar.suspended);

  const hours = [0, 360, 720, 1080, DAY];
  const columns = layout === 'desktop' ? Math.max(1, Math.min(3, Math.floor((width + 32) / EVENT_COLUMN))) : 1;
  const yLow = y(data.low.value);
  const yHigh = y(data.high.value);

  return (
    <section className={`ui-daychart ui-daychart--${layout}`}>
      {!empty && (
        <div className="ui-daychart__legend">
          {data.events.some((e) => e.kind === 'meal') && <Key kind="meal" label="Meal" />}
          {data.events.some((e) => e.kind === 'correction') && <Key kind="correction" label="Correction" />}
          {data.events.some((e) => e.kind === 'carbs') && <Key kind="carbs" label="Carbs" />}
          {counted.length > 0 && <Key kind="pattern" label="Pattern" />}
          <Key kind="basal" label="Basal" />
          <Key kind="profile" label="Pump profile" />
          {suspends && <Key kind="suspend" label="Suspend" />}
          {sleep.length > 0 && <Key kind="sleep" label="Sleep" />}
          {sites.length > 0 && <Key kind="site" label="Site change" />}
        </div>
      )}
      <div ref={box} className="ui-chart">
      {width > 0 && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ui-daychart__chart">
        <defs>
          <pattern id={`${id}-suspend`} width={4} height={4} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={1.6} height={4} className="ui-daychart__suspend-stripe" />
          </pattern>
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
          {!empty && <>
            <line x1={0} x2={width} y1={by(upper)} y2={by(upper)} className="ui-daychart__grid" />
            <line x1={0} x2={width} y1={by(lower)} y2={by(lower)} className="ui-daychart__grid" />
          </>}
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
          {counted.map((at, i) => <Glyph key={`p${i}`} name="pattern" x={at} y={marksTop + ROW / 2} />)}
          {marks.map(({ mark, row, at }, i) => (
            <Glyph key={i} name={mark.kind} x={at} y={marksTop + ROW / 2 + (row + 1) * ROW} />
          ))}
          {bars.map((bar) => (
            <rect key={bar.from} x={bar.x} y={bar.y} width={bar.width} height={bar.height}
              fill={bar.suspended ? `url(#${id}-suspend)` : undefined}
              className={bar.suspended ? 'ui-daychart__suspend' : bar.diff > 0 ? 'ui-daychart__basal-up' : 'ui-daychart__basal-down'} />
          ))}
          {!empty && <line x1={0} x2={width} y1={zero} y2={zero} className="ui-daychart__profile" />}
        </g>
        {empty && (
          <text x={width / 2} y={(yLow + yHigh) / 2 + 5} textAnchor="middle" className="ui-daychart__empty">No data</text>
        )}
        {!empty && (
          <g data-axis="">
            <text x={0} y={by(upper) - 3} className="ui-daychart__scale">
              {signed(upper)}<tspan className="ui-daychart__unit"> U/h</tspan>
            </text>
            <text x={0} y={by(lower) - 3} className="ui-daychart__scale">{signed(lower)}</text>
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
      </svg>}
      </div>
      {data.events.length > 0 && (
        <ol className="ui-daychart__events" style={{ '--rows': Math.ceil(data.events.length / columns), '--columns': columns } as React.CSSProperties}>
          {data.events.map((e, i) => (
            <li key={i} className="ui-daychart__event">
              <span className="ui-daychart__time"><Num value={e.time} /></span>
              <span className={`ui-daychart__glyph ${markClass(e.kind)}`} aria-hidden="true"><Icon name={e.kind} size={14} stroke={1.8} /></span>
              <span className="ui-daychart__kind">{kindLabel(e)}</span>
              <span className={`ui-daychart__grams${e.kind === 'meal' || e.kind === 'carbs' ? ' ui-daychart__grams--meal' : ''}`}>
                {e.kind === 'carbs' ? <><Num value={e.grams} /> g</> : 'carbs' in e && e.carbs && <><Num value={e.carbs} /> g</>}
              </span>
              <span className="ui-daychart__units">
                {'insulin' in e ? <><Num value={e.insulin} /> U</> : e.kind === 'pattern' && e.bg && <><Num value={e.bg} /> mg/dL</>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
