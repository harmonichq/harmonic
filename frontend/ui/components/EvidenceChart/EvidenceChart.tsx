// EvidenceChart (§4.2): a setting's evidence as one row of dots — a basal
// slot's nights by delivered rate, or an I:C block's counted meal runs by their
// ratio — the evidence the engine's own rules count, no more (ADR 523).
//
// The axis spans the band that matters: the current value, the estimate and
// the engine's range, padded generously and snapped to round ticks; it goes
// below 0 only when the range does. One dot per item at its value, in one row:
// dots that would touch move up or down out of each other's way, nearest the
// row first (a beeswarm), so a pile at one value spreads either side of the row
// rather than towering. Dots inside the range draw bright; the rest recede.
// A dot beyond the axis is not dropped: the edge it lies past carries the
// count ("‹ 1") in a gutter reserved at that end, level with the row, which the
// axis and every mark stop short of, so a count never touches a dot, the band
// or a line (§2.5, 2026-10-14); an end with no count reserves nothing.
// The axis otherwise runs the full width, flush with the card's text column;
// its end tick labels anchor inward. Every tick keeps its mark, but a label
// that would run into its neighbour is left out, the last always kept. Beneath
// the ticks, the caption names what the axis measures and its unit
// ("Basal · U/h"). Current (dashed, top row) and Estimate (solid, second row)
// are full-height marks labelled with their word and value; the range is a
// band behind them in the estimate colour. Left to right is value, never time.
import type { Sourced } from '../../answers';
import { formatValue } from '../../provenance.js';
import { useWidth } from '../../measure';
import { DOT_PITCH as PITCH, DOT_R as R, labelledTicks, niceTicks, swarm } from '../Chart/scale';
import '../Chart/Chart.css';

export type EvidenceChartProps = {
  dots: readonly { rate: Sourced<number> }[];
  /** The served list's path and the field each dot's value is, so an edge
   *  count can name the items it counts. */
  roster: string;
  field: string;
  current: Sourced<number>;
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  units: string;
  /** What the axis measures: the setting's name ("Basal", "I:C"). */
  axis: string;
};

const LABEL_ROW = 18;
const PLOT_TOP = 2 * LABEL_ROW + 6;
const EDGE_LABEL = 26;  // an edge count's width, "‹ 12" at 13 px
const EDGE_GUTTER = EDGE_LABEL + 8; // the count and its clearance from the plot
const LABEL_CHAR = 7.4; // a 13 px Inter character, generously
const TICK_CHAR = 6.6;  // an 11 px Inter tick character, generously

/** A mark's label, on the side away from the other mark unless the chart's
 *  edge leaves no room there. */
function MarkLabel({ word, value, x, other, row, width, className }: {
  word: string; value: Sourced<number>; x: number; other: number; row: number; width: number;
  className: string;
}) {
  const text = formatValue(value.value, value.format);
  const span = (word.length + 1 + text.length) * LABEL_CHAR;
  const fitsRight = x + 4 + span <= width;
  const fitsLeft = x - 4 - span >= 0;
  const right = x >= other ? fitsRight || !fitsLeft : !fitsLeft && fitsRight;
  return (
    <text x={right ? x + 4 : x - 4} y={(row + 1) * LABEL_ROW - 4} textAnchor={right ? 'start' : 'end'}
      className={className}>
      <tspan className="ui-chart__word">{word} </tspan>
      <tspan data-source={value.source} data-format={value.format}>{text}</tspan>
    </text>
  );
}

export function EvidenceChart({ dots, roster, field, current, estimate, lo, hi, units, axis }: EvidenceChartProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  // The band that matters, padded generously, snapped outward to round ticks;
  // below 0 only when the range is.
  const marks = [current.value, estimate.value, lo.value, hi.value];
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = Math.max((high - low) * 0.75, 0.05);
  const scale = niceTicks(lo.value < 0 ? low - pad : Math.max(0, low - pad), high + pad);
  const first = scale.values[0];
  const last = scale.values[scale.values.length - 1];

  const inside = dots.map((dot) => dot.rate.value).filter((value) => value >= first && value <= last);
  const below = dots.filter((dot) => dot.rate.value < first).length;
  const above = dots.filter((dot) => dot.rate.value > last).length;
  // The plot stops short of each end's gutter, when that end has a count.
  const left = below > 0 ? EDGE_GUTTER : 0;
  const right = above > 0 ? width - EDGE_GUTTER : width;
  const x = (value: number) => left + (right - left) * ((value - first) / (last - first));

  const levels = swarm(inside.map(x));
  const reach = Math.max(1, ...levels.map(Math.abs));
  const half = reach * PITCH + R + 2;
  const row = PLOT_TOP + half;
  const axisY = row + half;
  const height = axisY + 36;

  const lastIndex = scale.values.length - 1;
  const labelled = labelledTicks(scale.values.map((value, i) => {
    const at = x(value);
    const span = value.toFixed(scale.decimals).length * TICK_CHAR;
    return i === 0 ? [at, at + span] : i === lastIndex ? [at - span, at] : [at - span / 2, at + span / 2];
  }));

  return (
    <div ref={box} className="ui-chart">
    {width > 0 && <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ui-chart__svg">
      {lo.value !== hi.value && (
        <rect x={x(lo.value)} y={PLOT_TOP} width={x(hi.value) - x(lo.value)} height={axisY - PLOT_TOP}
          className="ui-chart__band" />
      )}
      <line x1={x(current.value)} x2={x(current.value)} y1={LABEL_ROW} y2={axisY} className="ui-chart__current" />
      <line x1={x(estimate.value)} x2={x(estimate.value)} y1={2 * LABEL_ROW} y2={axisY} className="ui-chart__estimate" />
      <MarkLabel word="Current" value={current} x={x(current.value)} other={x(estimate.value)} row={0} width={width}
        className="ui-chart__current-label" />
      <MarkLabel word="Estimate" value={estimate} x={x(estimate.value)} other={x(current.value)} row={1} width={width}
        className="ui-chart__estimate-label" />
      <g aria-hidden="true">
        {inside.map((value, i) => (
          <circle key={i} cx={x(value)} cy={row + levels[i] * PITCH} r={R}
            className={value >= lo.value && value <= hi.value ? 'ui-chart__dot ui-chart__dot--in' : 'ui-chart__dot'} />
        ))}
      </g>
      {below > 0 && (
        <text x={0} y={row + 4} className="ui-chart__edge" data-edge="below">
          ‹ <tspan data-source={`${roster}[${field}<${first}].length`}>{below}</tspan>
        </text>
      )}
      {above > 0 && (
        <text x={width} y={row + 4} textAnchor="end" className="ui-chart__edge" data-edge="above">
          <tspan data-source={`${roster}[${field}>${last}].length`}>{above}</tspan> ›
        </text>
      )}
      <g data-axis="">
        <line x1={left} x2={right} y1={axisY} y2={axisY} className="ui-chart__axis" />
        {scale.values.map((value, i) => (
          <g key={value}>
            <line x1={x(value)} x2={x(value)} y1={axisY} y2={axisY + 4} className="ui-chart__axis" />
            {labelled.has(i) && (
              <text x={x(value)} y={axisY + 17} textAnchor={i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'}
                className="ui-chart__tick">
                {value.toFixed(scale.decimals)}
              </text>
            )}
          </g>
        ))}
        <text x={0} y={axisY + 34} className="ui-chart__caption">{axis} · {units}</text>
      </g>
    </svg>}
    </div>
  );
}
