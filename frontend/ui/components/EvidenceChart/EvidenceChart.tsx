// EvidenceChart (§4.2): how a setting slot's nights are distributed by
// delivered rate. A horizontal rate axis with round ticks, one dot per night
// at its rate, nights at the same rate stacked like a histogram. Two vertical
// marks run the chart's height: the current value (dashed) and the engine's
// estimate (solid), each labelled with its word and value. The engine's range
// is a faint band behind them. No time order is drawn: left to right is rate.
import type { Sourced } from '../../fixtures';
import { formatValue } from '../../provenance.js';
import './EvidenceChart.css';

export type EvidenceChartProps = {
  nights: readonly { rate: Sourced<number> }[];
  current: Sourced<number>;
  estimate: Sourced<number>;
  lo: Sourced<number>;
  hi: Sourced<number>;
  units: string;
  width?: number;
};

const DOT = 5;
const PITCH = 7; // dot plus a 2 px gap
const MAX_ROWS = 12;
const LABEL_ROW = 16;
const LABEL_CHAR = 6.6; // an 11 px Inter character, generously
const PLOT_TOP = 2 * LABEL_ROW + 6;
const PLOT_HEIGHT = MAX_ROWS * PITCH + 4;
const AXIS_Y = PLOT_TOP + PLOT_HEIGHT;
const HEIGHT = AXIS_Y + 22;
const UNIT_GUTTER = 36;
const STEPS = [0.01, 0.02, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10];

/** Round ticks covering [min, max]: the finest step that needs at most five. */
function ticks(min: number, max: number): { values: number[]; decimals: number } {
  for (const step of STEPS) {
    const first = Math.floor(min / step + 1e-9) * step;
    const last = Math.ceil(max / step - 1e-9) * step;
    const count = Math.round((last - first) / step) + 1;
    if (count <= 5) {
      const values = Array.from({ length: Math.max(count, 3) }, (_, i) => first + i * step);
      const decimals = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9) + (String(step).includes('5') && step < 1 ? 1 : 0));
      return { values, decimals: Math.min(decimals, 2) };
    }
  }
  return { values: [min, max], decimals: 2 };
}

type Placement = { x: number; anchor: 'start' | 'end'; row: number };

/** Each label beside its mark on the side away from the other mark, flipped
 *  inward where the chart edge leaves no room, and dropped to a second row if
 *  the two labels would then overlap. */
function place(marks: { x: number; width: number }[], chartWidth: number): Placement[] {
  const [a, b] = marks;
  const outward = (mark: { x: number; width: number }, other: number): Placement => {
    const right = mark.x >= other;
    const fits = right ? mark.x + 4 + mark.width <= chartWidth : mark.x - 4 - mark.width >= 0;
    const side = fits === right; // true: label to the right of the mark
    return { x: mark.x + (side ? 4 : -4), anchor: side ? 'start' : 'end', row: 0 };
  };
  const pa = outward(a, b.x);
  const pb = outward(b, a.x);
  const span = (p: Placement, width: number) => (p.anchor === 'start' ? [p.x, p.x + width] : [p.x - width, p.x]);
  const [a0, a1] = span(pa, a.width);
  const [b0, b1] = span(pb, b.width);
  if (a0 < b1 + 8 && b0 < a1 + 8) pb.row = 1;
  return [pa, pb];
}

function MarkLabel({ word, value, placement, className }: {
  word: string; value: Sourced<number>; placement: Placement; className: string;
}) {
  return (
    <text x={placement.x} y={(placement.row + 1) * LABEL_ROW - 4} textAnchor={placement.anchor} className={className}>
      <tspan className="ui-evidence__word">{word} </tspan>
      <tspan data-source={value.source} data-format={value.format}>{formatValue(value.value, value.format)}</tspan>
    </text>
  );
}

export function EvidenceChart({ nights, current, estimate, lo, hi, units, width = 326 }: EvidenceChartProps) {
  const rates = nights.map((night) => night.rate.value);
  const all = [...rates, current.value, estimate.value, lo.value, hi.value];
  const scale = ticks(Math.min(...all), Math.max(...all));
  const first = scale.values[0];
  const last = scale.values[scale.values.length - 1];
  const pad = (last - first) * 0.04;
  const left = 8;
  const right = width - UNIT_GUTTER;
  const x = (rate: number) => left + (right - left) * ((rate - (first - pad)) / (last - first + 2 * pad));

  // Histogram stacks: nights whose dots would overlap share a bin; a tall
  // stack splits into balanced columns so the chart keeps one height.
  const bins = new Map<number, number>();
  for (const rate of rates) {
    const bin = Math.round(x(rate) / PITCH);
    bins.set(bin, (bins.get(bin) ?? 0) + 1);
  }
  const dots: { cx: number; cy: number }[] = [];
  for (const [bin, count] of bins) {
    const columns = Math.ceil(count / MAX_ROWS);
    const centre = bin * PITCH;
    for (let i = 0; i < count; i += 1) {
      const column = i % columns;
      const row = Math.floor(i / columns);
      dots.push({
        cx: centre + (column - (columns - 1) / 2) * PITCH,
        cy: AXIS_Y - 2 - DOT / 2 - row * PITCH,
      });
    }
  }

  const labelWidth = (word: string, value: Sourced<number>) =>
    (word.length + 1 + formatValue(value.value, value.format).length) * LABEL_CHAR;
  const [currentAt, estimateAt] = place([
    { x: x(current.value), width: labelWidth('Current', current) },
    { x: x(estimate.value), width: labelWidth('Estimate', estimate) },
  ], width);
  return (
    <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-evidence">
      {lo.value !== hi.value && (
        <rect x={x(lo.value)} y={PLOT_TOP} width={x(hi.value) - x(lo.value)} height={PLOT_HEIGHT}
          className="ui-evidence__band" />
      )}
      <line x1={x(current.value)} x2={x(current.value)} y1={(currentAt.row + 1) * LABEL_ROW} y2={AXIS_Y} className="ui-evidence__current" />
      <line x1={x(estimate.value)} x2={x(estimate.value)} y1={(estimateAt.row + 1) * LABEL_ROW} y2={AXIS_Y} className="ui-evidence__estimate" />
      <MarkLabel word="Current" value={current} placement={currentAt} className="ui-evidence__current-label" />
      <MarkLabel word="Estimate" value={estimate} placement={estimateAt} className="ui-evidence__estimate-label" />
      <g aria-hidden="true">
        {dots.map((dot, i) => <circle key={i} cx={dot.cx} cy={dot.cy} r={DOT / 2} className="ui-evidence__night" />)}
      </g>
      <g data-axis="">
        <line x1={left} x2={right} y1={AXIS_Y} y2={AXIS_Y} className="ui-evidence__axis" />
        {scale.values.map((value) => (
          <g key={value}>
            <line x1={x(value)} x2={x(value)} y1={AXIS_Y} y2={AXIS_Y + 4} className="ui-evidence__axis" />
            <text x={x(value)} y={AXIS_Y + 16} textAnchor="middle" className="ui-evidence__tick">
              {value.toFixed(scale.decimals)}
            </text>
          </g>
        ))}
        <text x={width} y={AXIS_Y + 16} textAnchor="end" className="ui-evidence__unit">{units}</text>
      </g>
    </svg>
  );
}
