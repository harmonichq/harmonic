// The legend beneath a chart (ADR 523): each key the swatch the chart draws it
// with, then its word. A line is the series' median or a trace; a band its
// 25–75 spread (or the engine's Range); dashed the programmed value; a dot one
// item of a dot row, a tick a row's median, and a thick line a row's Range
// (#501, #559). The words are the chart's own (Pattern, Typical; Current,
// Estimate, Range; Meal, Median, Range).
import './Chart.css';

export type LegendKey = {
  label: string;
  swatch: 'line' | 'band' | 'band-line' | 'dashed' | 'estimate' | 'dot' | 'tick' | 'range';
  /** The series' tone class (ui-chart__high, ui-chart__low, ui-chart__typical). */
  tone?: string;
};

function Swatch({ swatch, tone }: Omit<LegendKey, 'label'>) {
  return (
    <svg width="18" height="10" viewBox="0 0 18 10" aria-hidden="true" className={tone}>
      {(swatch === 'band' || swatch === 'band-line') && (
        <rect width="18" height="10" className={tone ? 'ui-chart__series-band' : 'ui-chart__band'} />
      )}
      {swatch === 'estimate' && <rect width="18" height="10" className="ui-chart__band" />}
      {(swatch === 'line' || swatch === 'band-line') && (
        <line x1="0" x2="18" y1="5" y2="5" className="ui-chart__series-median" />
      )}
      {swatch === 'estimate' && <line x1="1" x2="17" y1="5" y2="5" className="ui-chart__estimate" />}
      {swatch === 'dashed' && <line x1="0" x2="18" y1="5" y2="5" className="ui-chart__current" />}
      {swatch === 'dot' && <circle cx="9" cy="5" r="3" className="ui-chart__dot ui-chart__dot--in" />}
      {swatch === 'tick' && <line x1="9" x2="9" y1="0" y2="10" className="ui-chart__median" />}
      {swatch === 'range' && <line x1="2" x2="16" y1="5" y2="5" className="ui-chart__range" />}
    </svg>
  );
}

export function ChartLegend({ keys }: { keys: LegendKey[] }) {
  return (
    <div className="ui-chart__legend">
      {keys.map(({ label, swatch, tone }) => (
        <span key={label} className="ui-chart__key"><Swatch swatch={swatch} tone={tone} />{label}</span>
      ))}
    </div>
  );
}
