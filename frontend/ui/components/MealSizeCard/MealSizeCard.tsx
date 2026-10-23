// MealSizeCard (§4.2, §2.5 2026-10-19, ADR 501, #559, #565): how far glucose
// climbs after meals of each size, on the Overview below the basal estimate,
// its height on desktop. It reads the window the Overview's switch
// shows, as they do, and like them never repeats it: the title is "Climb by
// meal size" (#611) in their strong title style.
//
// Each size (under 25 g, 25–39, 40–59, 60 g+) is a thin strip on one shared
// Climb axis, drawn from its served percentiles alone (#570): its 10–90% a
// thin capped whisker, its 25–75% (Range) a thick line over it, and its median
// a short ink tick on top. No meal is drawn on its own. The sizes take a
// sequential ramp of the estimate blue, the smallest lightest, and each size's
// label carries its swatch. Values print signed ("+24", "−6").
//
// Wide (the desktop card spans the Overview's second row), each size is one
// row aligned like a table: its swatch and label over its meal count, its
// strip, then Climb, Peak at and At 3 h, At 3 h over its own meal count (only
// meals no later meal followed within three hours). Narrow (the phone), the
// strips stand together and the same rows follow beneath them, as the mock.
// Beneath the strips the axis, then "Climb · mg/dL" and the legend, glyph and
// word: Median, Range, 10–90%. A size with no meal shows "–". Every number is
// served; the card computes nothing. A window the engine counts no meal in
// says "No data"; one not read yet is the card's skeleton. Nothing to act on.
import { Num } from '../../Num';
import { useWidth } from '../../measure';
import type { MealSizeData, MealSizeRow } from '../../overview-model';
import { ChartLegend } from '../Chart/ChartLegend';
import { labelledTicks, niceTicks } from '../Chart/scale';
import '../../shared.css';
import '../Chart/Chart.css';
import '../SettingCard/SettingCard.css';
import './MealSizeCard.css';

/** The card's width from which each size's numbers sit on its strip's row. */
const WIDE = 520;
/** A strip's height: the median tick, a little taller than the Range line. */
const STRIP = 14;
/** The room either side of the axis, so a cap or a tick at an end never clips. */
const PAD = 3;
const TICK_CHAR = 6.6;  // an 11 px Inter tick character, generously

type Scale = { values: number[]; first: number; last: number };

/** A tick or a served value with its sign: "+50", "−50", "0". */
const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');

/** "<25 g", "25–39 g" or "60 g+", each bound the served field it is: one
 *  span, so a flex label never spaces its pieces apart. */
function SizeLabel({ row }: { row: MealSizeRow }) {
  if (!row.from) return <span>&lt;<Num value={row.to!} /> g</span>;
  if (!row.to) return <span><Num value={row.from} /> g+</span>;
  return <span><Num value={row.from} />–<Num value={row.last!} /> g</span>;
}

/** How many meals a number is read from: "1 meal", "70 meals". */
const Count = ({ value }: { value: MealSizeRow['meals'] }) => (
  <span className="ui-meal-size__count"><Num value={value} /> {value.value === 1 ? 'meal' : 'meals'}</span>
);

/** A served median, or "–" for a size with no meal. */
const Median = ({ value }: { value: MealSizeRow['median'] }) => (value ? <Num value={value} /> : <>–</>);

/** One size's strip, over the axis's grid lines: its 10–90% a thin capped
 *  whisker in its colour, its Range a thick line over it, and its median a
 *  short ink tick on top (#570). No meal is drawn on its own. */
function Strip({ row, scale, index }: { row: MealSizeRow; scale: Scale; index: number }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const x = (value: number) => PAD + (width - 2 * PAD) * ((value - scale.first) / (scale.last - scale.first));
  const mid = STRIP / 2;
  const cap = 3;
  return (
    <div ref={box} className="ui-meal-size__strip" data-size={index}>
      {width > 0 && (
        <svg width={width} height={STRIP} viewBox={`0 0 ${width} ${STRIP}`} className="ui-chart__svg">
          {scale.values.map((value) => (
            <line key={value} x1={x(value)} x2={x(value)} y1={0} y2={STRIP}
              className={value === 0 ? 'ui-chart__zero' : 'ui-chart__grid'} />
          ))}
          {row.p10 !== null && row.p90 !== null && row.p90 > row.p10 && (
            <path data-whisker="" className="ui-meal-size__whisker"
              d={`M${x(row.p10)},${mid - cap} V${mid + cap} M${x(row.p10)},${mid} H${x(row.p90)} M${x(row.p90)},${mid - cap} V${mid + cap}`} />
          )}
          {row.p25 !== null && row.p75 !== null && row.p75 > row.p25 && (
            <line data-range="" x1={x(row.p25)} x2={x(row.p75)} y1={mid} y2={mid} className="ui-meal-size__range" />
          )}
          {row.median && (
            <line data-median="" x1={x(row.median.value)} x2={x(row.median.value)} y1={1} y2={STRIP - 1}
              className="ui-chart__median" />
          )}
        </svg>
      )}
    </div>
  );
}

/** The shared axis beneath the strips: its signed ticks, a label left out
 *  where it would touch its neighbour. */
function Axis({ scale }: { scale: Scale }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const x = (value: number) => PAD + (width - 2 * PAD) * ((value - scale.first) / (scale.last - scale.first));
  const lastIndex = scale.values.length - 1;
  const labelled = labelledTicks(scale.values.map((value, i) => {
    const at = x(value);
    const span = signed(value).length * TICK_CHAR;
    return i === 0 ? [at, at + span] : i === lastIndex ? [at - span, at] : [at - span / 2, at + span / 2];
  }));
  return (
    <div ref={box} className="ui-meal-size__axis">
      {width > 0 && (
        <svg width={width} height={18} viewBox={`0 0 ${width} 18`} className="ui-chart__svg">
          <g data-axis="">
            {scale.values.map((value, i) => labelled.has(i) && (
              <text key={value} x={x(value)} y={13} className="ui-chart__tick"
                textAnchor={i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'}>{signed(value)}</text>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

/** A size's label cell: its swatch and bounds over its meal count. */
const SizeCell = ({ row, index }: { row: MealSizeRow; index: number }) => (
  <div role="rowheader" className={`ui-meal-size__size ui-meal-size__s${index}`}>
    <span className="ui-meal-size__label"><span className="ui-meal-size__swatch" aria-hidden="true" /><SizeLabel row={row} /></span>
    <Count value={row.meals} />
  </div>
);

/** A size's three medians: Climb, Peak at (min) and At 3 h over its own count. */
const Values = ({ row }: { row: MealSizeRow }) => (
  <>
    <div role="cell" className="ui-meal-size__value ui-meal-size__climb"><Median value={row.median} /></div>
    <div role="cell" className="ui-meal-size__value">
      {row.toPeak ? <><Num value={row.toPeak} /> <span className="ui-meal-size__unit">min</span></> : '–'}
    </div>
    <div role="cell" className="ui-meal-size__value"><Median value={row.at3h} /><Count value={row.at3hMeals} /></div>
  </>
);

const Head = ({ hours, strip }: { hours: MealSizeData['hours']; strip: boolean }) => (
  <div role="row" className="ui-meal-size__row ui-meal-size__head">
    <span role="columnheader" />
    {strip && <span role="columnheader" />}
    <span role="columnheader" className="ui-caption">Climb</span>
    <span role="columnheader" className="ui-caption">Peak at</span>
    <span role="columnheader" className="ui-caption">At <Num value={hours} /> h</span>
  </div>
);

const Legend = () => (
  <div className="ui-meal-size__foot">
    <span className="ui-chart__caption">Climb · mg/dL</span>
    <ChartLegend keys={[
      { label: 'Median', swatch: 'tick' },
      { label: 'Range', swatch: 'range' },
      { label: '10–90%', swatch: 'whisker', scale: true },
    ]} />
  </div>
);

function MealSizeBody({ data }: { data: MealSizeData }) {
  const [box, width] = useWidth<HTMLDivElement>();
  // The axis covers 0 and every size's 10–90%, the widest mark drawn.
  const ends = data.rows.flatMap((row) => (row.p10 === null || row.p90 === null ? [] : [row.p10, row.p90]));
  const ticks = niceTicks(Math.min(0, ...ends), Math.max(0, ...ends), 8);
  const scale = { values: ticks.values, first: ticks.values[0], last: ticks.values[ticks.values.length - 1] };
  const wide = width >= WIDE;
  return (
    <div ref={box} className={`ui-meal-size__body ui-meal-size__body--${wide ? 'wide' : 'narrow'}`}>
      {wide ? (
        <div role="table" className="ui-meal-size__grid ui-meal-size__grid--wide">
          <Head hours={data.hours} strip />
          {data.rows.map((row, i) => (
            <div role="row" key={i} className="ui-meal-size__row">
              <SizeCell row={row} index={i} />
              <div role="cell" className={`ui-meal-size__s${i}`}><Strip row={row} scale={scale} index={i} /></div>
              <Values row={row} />
            </div>
          ))}
          <div className="ui-meal-size__row"><span /><Axis scale={scale} /></div>
        </div>
      ) : (
        <>
          <div className="ui-meal-size__grid ui-meal-size__grid--strips">
            {data.rows.map((row, i) => (
              <div key={i} className="ui-meal-size__row">
                <span className="ui-meal-size__label"><SizeLabel row={row} /></span>
                <div className={`ui-meal-size__s${i}`}><Strip row={row} scale={scale} index={i} /></div>
              </div>
            ))}
            <div className="ui-meal-size__row"><span /><Axis scale={scale} /></div>
          </div>
        </>
      )}
      <Legend />
      {!wide && (
        <div role="table" className="ui-meal-size__grid ui-meal-size__grid--table">
          <Head hours={data.hours} strip={false} />
          {data.rows.map((row, i) => (
            <div role="row" key={i} className="ui-meal-size__row">
              <SizeCell row={row} index={i} />
              <Values row={row} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function MealSizeCard({ data }: { data: MealSizeData | 'none' | null }) {
  const title = (
    <h2 className="ui-scard__title ui-scard__heading">
      Climb by meal size
    </h2>
  );
  if (data === null) {
    return (
      <section className="ui-scard ui-meal-size" aria-busy="true">
        {title}
        <span className="ui-skeleton ui-scard__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (data === 'none') {
    return <section className="ui-scard ui-meal-size">{title}<p className="ui-scard__none">No data</p></section>;
  }
  return (
    <section className="ui-scard ui-meal-size">
      {title}
      <MealSizeBody data={data} />
    </section>
  );
}
