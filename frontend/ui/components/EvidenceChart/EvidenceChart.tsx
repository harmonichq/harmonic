// EvidenceChart (§4.2): a setting slot's nights, each night's delivered rate
// as a dot in date order, against the current value (dashed) and the
// suggested value (solid). Each line carries its number, so neither rests on
// its stroke alone. When every night delivered the same rate there is nothing
// to spread, and the chart folds to a compact strip: one tick per night and
// the one rate they share.
import type { Sourced } from '../../fixtures';
import { formatValue } from '../../provenance.js';
import './EvidenceChart.css';

export type EvidenceChartProps = {
  nights: readonly { rate: Sourced<number> }[];
  current: Sourced<number>;
  suggested: Sourced<number>;
  width?: number;
};

const GUTTER = 36;
const HEIGHT = 96;
const PAD = 10;

function Label({ value, x, y, className }: { value: Sourced<number>; x: number; y: number; className: string }) {
  return (
    <text x={x} y={y} dy="0.35em" textAnchor="end" className={className}
      data-source={value.source} data-format={value.format}>
      {formatValue(value.value, value.format)}
    </text>
  );
}

export function EvidenceChart({ nights, current, suggested, width = 326 }: EvidenceChartProps) {
  const rates = nights.map((night) => night.rate.value);
  const plot = width - GUTTER;
  const step = nights.length > 1 ? (plot - 8) / (nights.length - 1) : 0;
  if (Math.min(...rates) === Math.max(...rates)) {
    return (
      <svg width={width} height={24} viewBox={`0 0 ${width} 24`} className="ui-evidence ui-evidence--strip">
        <Label value={nights[0].rate} x={GUTTER - 8} y={12} className="ui-evidence__value" />
        <g aria-hidden="true">
          {nights.map((_, i) => (
            <rect key={i} x={GUTTER + 4 + i * step - 1} y={6} width={2} height={12} rx={1} className="ui-evidence__tick" />
          ))}
        </g>
      </svg>
    );
  }
  const all = [...rates, current.value, suggested.value];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const y = (rate: number) => PAD + (HEIGHT - 2 * PAD) * (1 - (rate - lo) / (hi - lo));
  return (
    <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-evidence">
      <line x1={GUTTER} x2={width} y1={y(current.value)} y2={y(current.value)} className="ui-evidence__current" />
      <line x1={GUTTER} x2={width} y1={y(suggested.value)} y2={y(suggested.value)} className="ui-evidence__suggested" />
      <Label value={current} x={GUTTER - 8} y={y(current.value)} className="ui-evidence__current-label" />
      <Label value={suggested} x={GUTTER - 8} y={y(suggested.value)} className="ui-evidence__suggested-label" />
      <g aria-hidden="true">
        {rates.map((rate, i) => (
          <circle key={i} cx={GUTTER + 4 + i * step} cy={y(rate)} r={2.5} className="ui-evidence__night" />
        ))}
      </g>
    </svg>
  );
}
