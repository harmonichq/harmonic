// EvidenceChart (§4.2): how a setting's nights are distributed — a basal
// slot's nights by delivered rate, or the ISF's fasting nights by their fitted
// ISF — the nights the engine's own evidence rules count, no more.
//
// The axis spans the band that matters: the current value, the estimate and
// the engine's range, padded generously and snapped to round ticks; it goes
// below 0 only when the range does. One dot per night at its value; nights at
// one value stack, wrapping into further columns rather than outgrowing the
// chart. A night beyond the axis is not dropped: the edge it lies past carries
// their count ("‹ 1"), and it still counts in the card's total. The count sits
// in a gutter reserved at that end of the axis, level with the dots' first row,
// and the axis and every mark stop short of it, so a count never touches a dot,
// the band or a line (§2.5, 2026-10-14); an end with no count reserves nothing.
// The axis otherwise runs the full width, flush with the card's text column:
// the end tick labels anchor inward and the unit follows the last one.
// Current (dashed, top row) and Estimate (solid,
// second row) are full-height marks labelled with their word and value; the
// engine's range is a band behind them in the estimate colour, and the nights
// inside it draw bright while the rest recede. Left to right is rate, never
// time.
import type { Sourced } from '../../answers';
import { formatValue } from '../../provenance.js';
import { useWidth } from '../../measure';
import '../../shared.css';
import './EvidenceChart.css';

export type EvidenceChartProps = {
  nights: readonly { rate: Sourced<number> }[];
  /** The served roster's path and the field each night's value is, so an edge
   *  count can name its nights. */
  roster: string;
  field: string;
  current: Sourced<number>;
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  units: string;
};

const DOT = 6;
const PITCH = 8; // a 6 px dot and a 2 px gap
const MAX_ROWS = 10;
const LABEL_ROW = 18;
const PLOT_TOP = 2 * LABEL_ROW + 8;
const PLOT_HEIGHT = MAX_ROWS * PITCH + 4;
const AXIS_Y = PLOT_TOP + PLOT_HEIGHT;
const HEIGHT = AXIS_Y + 22;
const EDGE_LABEL = 26;  // an edge count's width, "‹ 12" at 13 px
const EDGE_GUTTER = EDGE_LABEL + 8; // the count and its clearance from the plot
const LABEL_CHAR = 7.4; // a 13 px Inter character, generously
const STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500];

/** Round ticks covering [min, max]: the finest step that needs at most five. */
function ticks(min: number, max: number): { values: number[]; decimals: number } {
  for (const step of STEPS) {
    const first = Math.floor(min / step + 1e-9) * step;
    const last = Math.ceil(max / step - 1e-9) * step;
    const count = Math.round((last - first) / step) + 1;
    if (count <= 5) {
      const decimals = step >= 1 ? 0 : step >= 0.1 && step !== 0.25 ? 1 : 2;
      const values = Array.from({ length: Math.max(count, 3) },
        (_, i) => Number((first + i * step).toFixed(6)));
      return { values, decimals };
    }
  }
  return { values: [min, max], decimals: 2 };
}

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
      <tspan className="ui-evidence__word">{word} </tspan>
      <tspan data-source={value.source} data-format={value.format}>{text}</tspan>
    </text>
  );
}

export function EvidenceChart({ nights, roster, field, current, estimate, lo, hi, units }: EvidenceChartProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  // The band that matters, padded generously, snapped outward to round ticks;
  // below 0 only when the range is.
  const marks = [current.value, estimate.value, lo.value, hi.value];
  const low = Math.min(...marks);
  const high = Math.max(...marks);
  const pad = Math.max((high - low) * 0.75, 0.05);
  const scale = ticks(lo.value < 0 ? low - pad : Math.max(0, low - pad), high + pad);
  const first = scale.values[0];
  const last = scale.values[scale.values.length - 1];

  const inside = nights.map((night) => night.rate.value).filter((rate) => rate >= first && rate <= last);
  const below = nights.filter((night) => night.rate.value < first).length;
  const above = nights.filter((night) => night.rate.value > last).length;
  // The plot stops short of each end's gutter, when that end has a count.
  const left = below > 0 ? EDGE_GUTTER : 0;
  const right = above > 0 ? width - EDGE_GUTTER : width;
  const x = (rate: number) => left + (right - left) * ((rate - first) / (last - first));

  // Histogram stacks: nights whose dots would touch share a bin; a stack taller
  // than the chart wraps into balanced columns.
  const bins = new Map<number, number>();
  for (const rate of inside) {
    const bin = Math.round(x(rate) / PITCH);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const dots: { cx: number; cy: number; inRange: boolean }[] = [];
  const binRange = new Map<number, boolean>();
  for (const rate of inside) {
    const bin = Math.round(x(rate) / PITCH);
    binRange.set(bin, (binRange.get(bin) ?? false) || (rate >= lo.value && rate <= hi.value));
  }
  for (const [bin, count] of bins) {
    const columns = Math.ceil(count / MAX_ROWS);
    // A wrapped stack at an end of the axis shifts inward, never past the plot.
    const half = ((columns - 1) / 2) * PITCH;
    const centre = Math.min(Math.max(bin * PITCH, left + half), right - half);
    for (let i = 0; i < count; i += 1) {
      const column = i % columns;
      dots.push({
        cx: centre + (column - (columns - 1) / 2) * PITCH,
        cy: AXIS_Y - 2 - DOT / 2 - Math.floor(i / columns) * PITCH,
        inRange: binRange.get(bin)!,
      });
    }
  }

  // An edge count's baseline: level with the dots' first row, in its gutter.
  const edgeY = AXIS_Y - 2;
  const lastIndex = scale.values.length - 1;

  return (
    <div ref={box} className="ui-chart">
    {width > 0 && <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-evidence">
      {lo.value !== hi.value && (
        <rect x={x(lo.value)} y={PLOT_TOP} width={x(hi.value) - x(lo.value)} height={PLOT_HEIGHT}
          className="ui-evidence__band" />
      )}
      <line x1={x(current.value)} x2={x(current.value)} y1={LABEL_ROW} y2={AXIS_Y} className="ui-evidence__current" />
      <line x1={x(estimate.value)} x2={x(estimate.value)} y1={2 * LABEL_ROW} y2={AXIS_Y} className="ui-evidence__estimate" />
      <MarkLabel word="Current" value={current} x={x(current.value)} other={x(estimate.value)} row={0} width={width}
        className="ui-evidence__current-label" />
      <MarkLabel word="Estimate" value={estimate} x={x(estimate.value)} other={x(current.value)} row={1} width={width}
        className="ui-evidence__estimate-label" />
      <g aria-hidden="true">
        {dots.map((dot, i) => <circle key={i} cx={dot.cx} cy={dot.cy} r={DOT / 2}
          className={dot.inRange ? 'ui-evidence__night ui-evidence__night--in' : 'ui-evidence__night'} />)}
      </g>
      {below > 0 && (
        <text x={0} y={edgeY} className="ui-evidence__edge" data-edge="below">
          ‹ <tspan data-source={`${roster}[${field}<${first}].length`}>{below}</tspan>
        </text>
      )}
      {above > 0 && (
        <text x={width} y={edgeY} textAnchor="end" className="ui-evidence__edge" data-edge="above">
          <tspan data-source={`${roster}[${field}>${last}].length`}>{above}</tspan> ›
        </text>
      )}
      <g data-axis="">
        <line x1={left} x2={right} y1={AXIS_Y} y2={AXIS_Y} className="ui-evidence__axis" />
        {scale.values.map((value, i) => (
          <g key={value}>
            <line x1={x(value)} x2={x(value)} y1={AXIS_Y} y2={AXIS_Y + 4} className="ui-evidence__axis" />
            <text x={x(value)} y={AXIS_Y + 17} textAnchor={i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'}
              className="ui-evidence__tick">
              {value.toFixed(scale.decimals)}
              {i === lastIndex && <tspan className="ui-evidence__unit"> {units}</tspan>}
            </text>
          </g>
        ))}
      </g>
    </svg>}
    </div>
  );
}
