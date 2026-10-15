// TraceChart (§4.2, ADR 523): a Pattern's episodes against Typical, the
// comparison episodes, each aligned at its start — a meal's bolus, the
// correction before a low, or a low's nadir — with glucose up and minutes
// after the start across. Typical is a grey median over its 25–75 band. The
// Pattern is each episode's own thin trace in the Pattern's colour when the
// engine serves eight or fewer, else its coloured median over its band. A
// stretch an episode has no readings for, or a bin the engine serves no band
// for, is left blank rather than bridged. Dotted lines mark 70 and 180 mg/dL;
// a meal's window opens before its bolus, so a hairline marks minute 0.
//
// Everything drawn is served: the episodes, and each cohort's bins with their
// median and band (the engine serves a bin only from three readings). The
// chart computes no band and chooses no episode. A Pattern with nothing to
// draw says "No data".
import { glucoseDomain, glucoseFraction } from '../../glucose-zones';
import { useWidth } from '../../measure';
import type { TraceData } from '../../queue-model';
import { ChartLegend } from '../Chart/ChartLegend';
import { bandPath, linePath, runs } from '../Chart/scale';
import '../Chart/Chart.css';

const LEFT = 30;      // the glucose ticks' gutter
const TOP = 22;       // room for the unit above the plot
const PLOT = 170;
const AXIS = TOP + PLOT;
const HEIGHT = AXIS + 36;
const BIN = 5;        // the engine's bins are 5 minutes apart
const READING_GAP = 10; // two readings further apart than this are a gap
const REFERENCES = [70, 180];

export function TraceChart({ data }: { data: TraceData }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const { window: [start, end], episodes, pattern, typical, tone } = data;
  const drawn = (episodes?.length ?? 0) > 0 || pattern.length > 0 || typical.length > 0;
  if (!drawn) return <p className="ui-chart__none">No data</p>;

  const values = [
    ...(episodes ? episodes.flatMap((episode) => episode.map((point) => point.bg))
      : pattern.flatMap((bin) => [bin.p25, bin.p75])),
    ...typical.flatMap((bin) => [bin.p25, bin.p75]),
  ];
  // The one glucose axis every chart uses (glucose-zones), labelled every 100.
  const domain = glucoseDomain(values);
  const yTicks = [100, 200, 300].filter((v) => v > domain.low && v < domain.high);
  const right = width - 4;
  const x = (minute: number) => LEFT + (right - LEFT) * ((minute - start) / (end - start));
  const y = (bg: number) => AXIS - PLOT * glucoseFraction(bg, domain);
  const xTicks: number[] = [];
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) xTicks.push(m);

  const cohort = (bins: TraceData['typical'], className: string) => (
    <g className={className}>
      {runs(bins, (bin) => bin.minute, BIN).map((run) => (
        <g key={run[0].minute}>
          <path d={bandPath(run.map((bin) => [x(bin.minute), y(bin.p75), y(bin.p25)]))} className="ui-chart__series-band" />
          <path d={linePath(run.map((bin) => [x(bin.minute), y(bin.median)]))} className="ui-chart__series-median" />
        </g>
      ))}
    </g>
  );
  const toneClass = `ui-chart__${tone}`;

  return (
    <div className="ui-chart">
      <div ref={box}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-chart__svg">
            <g data-axis="">
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={LEFT} x2={right} y1={y(v)} y2={y(v)} className="ui-chart__grid" />
                  <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" className="ui-chart__tick">{v}</text>
                </g>
              ))}
              <text x={0} y={10} className="ui-chart__caption">mg/dL</text>
              {REFERENCES.map((v) => (
                <g key={v}>
                  <line x1={LEFT} x2={right} y1={y(v)} y2={y(v)} className="ui-chart__ref" />
                  <text x={right} y={y(v) - 4} textAnchor="end" className="ui-chart__tick">{v}</text>
                </g>
              ))}
            </g>
            {start < 0 && <line x1={x(0)} x2={x(0)} y1={TOP} y2={AXIS} className="ui-chart__zero" />}
            {cohort(typical, 'ui-chart__typical')}
            {episodes
              ? <g className={toneClass}>
                  {episodes.flatMap((episode, i) => runs(episode, (point) => point.minute, READING_GAP).map((run, j) => (
                    <path key={`${i}-${j}`} d={linePath(run.map((point) => [x(point.minute), y(point.bg)]))}
                      className="ui-chart__series-trace" />
                  )))}
                </g>
              : cohort(pattern, toneClass)}
            <g data-axis="">
              <line x1={LEFT} x2={right} y1={AXIS} y2={AXIS} className="ui-chart__axis" />
              {xTicks.map((m, i) => (
                <g key={m}>
                  <line x1={x(m)} x2={x(m)} y1={AXIS} y2={AXIS + 4} className="ui-chart__axis" />
                  <text x={x(m)} y={AXIS + 16} className="ui-chart__tick"
                    textAnchor={i === xTicks.length - 1 ? 'end' : 'middle'}>{m}</text>
                </g>
              ))}
              <text x={0} y={AXIS + 34} className="ui-chart__caption">Minutes</text>
            </g>
          </svg>
        )}
      </div>
      <ChartLegend keys={[
        ...((episodes ?? pattern).length > 0
          ? [{ label: 'Pattern', swatch: episodes ? 'line' as const : 'band-line' as const, tone: toneClass }] : []),
        ...(typical.length > 0 ? [{ label: 'Typical', swatch: 'band-line' as const, tone: 'ui-chart__typical' }] : []),
      ]} />
    </div>
  );
}
