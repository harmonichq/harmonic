// MealSizeCard (§4.2, §2.5 2026-10-19, ADR 501): how far glucose climbs after
// meals of each size, on the Overview below the summary, the ISF and basal
// cards' size. It always reads the engine's one 90-day window, whatever window
// the Overview shows, and its title says so: "Meal size" in strong ink with
// "90 d" in meta ink on its baseline.
//
// The chart is the setting cards' dot row, one row per size (under 25 g, 25–39,
// 40–59, 60 g+), on one shared axis: each counted meal a dot at its climb,
// spread either side of its row where dots would touch (the chart family's one
// beeswarm); the size's 25–75% a band behind them; its median a tick across
// them. Dots inside the band draw bright, the rest recede. Beneath the ticks
// the axis names itself ("Climb · mg/dL"), and the legend is glyph and word:
// Meal, Median, 25–75%. Left to right is mg/dL, never time.
//
// Beneath, aligned like a table with no rules or cells: per size its label
// over how many meals it counts, then the median Climb, To peak and At 3 h,
// each column's caption over its unit, At 3 h over how many meals it was read
// from (only those no later meal followed within three hours). A size with no
// meal shows "–". Every number is served; the card computes nothing. A window
// the engine counts no meal in says "No data"; one not read yet is the card's
// skeleton. Nothing to act on.
import { Num, NumSvg } from '../../Num';
import { useWidth } from '../../measure';
import type { MealSizeData, MealSizeRow } from '../../overview-model';
import { ChartLegend } from '../Chart/ChartLegend';
import { DOT_PITCH, DOT_R, labelledTicks, niceTicks, swarm } from '../Chart/scale';
import '../../shared.css';
import '../Chart/Chart.css';
import '../SettingCard/SettingCard.css';
import '../IsfCard/IsfCard.css';
import './MealSizeCard.css';

const LEFT = 64;        // the size labels' gutter, "25–39 g" at 13 px and its clearance
const MAX_LEVELS = 4;   // either side of a row
const ROW_GAP = 6;
const TICK_CHAR = 6.6;  // an 11 px Inter tick character, generously

/** "<25 g", "25–39 g" or "60 g+", each bound the served field it is. */
function SizeLabel({ row, svg = false }: { row: MealSizeRow; svg?: boolean }) {
  const N = svg ? NumSvg : Num;
  if (!row.from) return <>&lt;<N value={row.to!} /> g</>;
  if (!row.to) return <><N value={row.from} /> g+</>;
  return <><N value={row.from} />–<N value={row.last!} /> g</>;
}

function MealSizeChart({ rows }: { rows: MealSizeRow[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const values = rows.flatMap((row) => row.climbs);
  const scale = niceTicks(Math.min(0, ...values), Math.max(0, ...values), 8);
  const first = scale.values[0];
  const last = scale.values[scale.values.length - 1];
  const right = width - DOT_R;
  const x = (value: number) => LEFT + (right - LEFT) * ((value - first) / (last - first));

  const levels = rows.map((row) => swarm(row.climbs.map(x), MAX_LEVELS));
  const reach = Math.max(1, ...levels.flatMap((row) => row.map(Math.abs)));
  const half = reach * DOT_PITCH + DOT_R + 2;
  const centre = (i: number) => half + i * (2 * half + ROW_GAP);
  const axisY = centre(rows.length - 1) + half + 2;
  const height = axisY + 36;

  const lastIndex = scale.values.length - 1;
  const labelled = labelledTicks(scale.values.map((value, i) => {
    const at = x(value);
    const span = value.toFixed(scale.decimals).length * TICK_CHAR;
    return i === lastIndex ? [at - span, at] : [at - span / 2, at + span / 2];
  }));

  return (
    <div ref={box} className="ui-chart">
      {width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ui-chart__svg">
          <line x1={x(0)} x2={x(0)} y1={0} y2={axisY} className="ui-chart__zero" />
          {rows.map((row, i) => (
            <g key={i} data-size={i}>
              <text x={0} y={centre(i) + 4} className="ui-meal-size__size"><SizeLabel row={row} svg /></text>
              {row.p25 !== null && row.p75 !== null && row.p75 > row.p25 && (
                <rect x={x(row.p25)} width={x(row.p75) - x(row.p25)} y={centre(i) - half} height={2 * half}
                  className="ui-chart__spread" />
              )}
              <g aria-hidden="true">
                {row.climbs.map((climb, k) => (
                  <circle key={k} cx={x(climb)} cy={centre(i) + levels[i][k] * DOT_PITCH} r={DOT_R}
                    className={row.p25 !== null && row.p75 !== null && climb >= row.p25 && climb <= row.p75
                      ? 'ui-chart__dot ui-chart__dot--in' : 'ui-chart__dot'} />
                ))}
              </g>
              {row.median && (
                <line x1={x(row.median.value)} x2={x(row.median.value)} y1={centre(i) - half} y2={centre(i) + half}
                  className="ui-chart__median" />
              )}
            </g>
          ))}
          <g data-axis="">
            <line x1={LEFT} x2={right} y1={axisY} y2={axisY} className="ui-chart__axis" />
            {scale.values.map((value, i) => (
              <g key={value}>
                <line x1={x(value)} x2={x(value)} y1={axisY} y2={axisY + 4} className="ui-chart__axis" />
                {labelled.has(i) && (
                  <text x={x(value)} y={axisY + 17} textAnchor={i === lastIndex ? 'end' : 'middle'}
                    className="ui-chart__tick">
                    {value.toFixed(scale.decimals).replace('-', '−')}
                  </text>
                )}
              </g>
            ))}
            <text x={0} y={axisY + 34} className="ui-chart__caption">Climb · mg/dL</text>
          </g>
        </svg>
      )}
    </div>
  );
}

/** How many meals a number is read from: "1 meal", "70 meals". */
const Count = ({ value }: { value: MealSizeRow['meals'] }) => (
  <span className="ui-meal-size__count"><Num value={value} /> {value.value === 1 ? 'meal' : 'meals'}</span>
);

/** A served median, or "–" for a size with no meal. */
const Median = ({ value }: { value: MealSizeRow['median'] }) => (value ? <Num value={value} /> : <>–</>);

function MealSizeTable({ rows, hours }: { rows: MealSizeRow[]; hours: MealSizeData['hours'] }) {
  return (
    <table className="ui-meal-size__table">
      <thead>
        <tr>
          <td />
          <th scope="col"><span className="ui-caption">Climb</span><span className="ui-meal-size__unit">mg/dL</span></th>
          <th scope="col"><span className="ui-caption">To peak</span><span className="ui-meal-size__unit">min</span></th>
          <th scope="col"><span className="ui-caption">At <Num value={hours} /> h</span><span className="ui-meal-size__unit">mg/dL</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <th scope="row">
              <span className="ui-meal-size__value"><SizeLabel row={row} /></span>
              <Count value={row.meals} />
            </th>
            <td><span className="ui-meal-size__value"><Median value={row.median} /></span></td>
            <td><span className="ui-meal-size__value"><Median value={row.toPeak} /></span></td>
            <td>
              <span className="ui-meal-size__value"><Median value={row.at3h} /></span>
              <Count value={row.at3hMeals} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MealSizeCard({ data }: { data: MealSizeData | 'none' | null }) {
  const title = (
    <h2 className="ui-scard__title ui-isf__title">
      Meal size{data && data !== 'none' && <> <span className="ui-scard__slot"><Num value={data.days} /> d</span></>}
    </h2>
  );
  if (data === null) {
    return (
      <section className="ui-scard ui-isf ui-meal-size" aria-busy="true">
        {title}
        <span className="ui-skeleton ui-meal-size__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (data === 'none') {
    return <section className="ui-scard ui-isf ui-meal-size">{title}<p className="ui-isf__none">No data</p></section>;
  }
  return (
    <section className="ui-scard ui-isf ui-meal-size">
      {title}
      <div className="ui-scard__chart"><MealSizeChart rows={data.rows} /></div>
      <ChartLegend keys={[
        { label: 'Meal', swatch: 'dot' },
        { label: 'Median', swatch: 'tick' },
        { label: '25–75%', swatch: 'spread', scale: true },
      ]} />
      <MealSizeTable rows={data.rows} hours={data.hours} />
    </section>
  );
}
