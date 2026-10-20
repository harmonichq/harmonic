// ChangeTrace (§4.2, §2.5 2026-10-14): a Trial's glucose before and after the
// change, for the block it changed, as the engine binned it.
//
// A basal (or whole-day) Trial is aligned by clock time across its block, its
// ticks the block's clock; a carb ratio Trial at each in-block meal bolus, from
// half an hour before it to four hours after, its ticks in minutes from the
// bolus (a rule marks the bolus). Before is grey, After the accent: each a
// median line over its 25th–75th percentile band, or, when an arm has fewer
// than three episodes, each episode as its own thin line, since a band of one
// or two is not a spread. An episode missing its early readings is left off
// by the engine. Bins the engine serves no value for break the line.
//
// The 70 and 180 lines are the glossary's Below 70 and Above 180, dashed. The
// legend names what an episode is once ("Nights", "Meals"), then each arm and
// how many episodes drew it, in the engine's own count ("Before 55"). A meal
// left off still counts among the Trial card's Meals before and after, so an
// arm that left any off prints its episodes against those meals ("Before 71
// of 74", §2.5 2026-10-19, #575): every meal count on the screen is one
// population. The chart measures its box (§2.2 Charts).
import type { Block, Trace, TraceArm } from '../../changes-model';
import { Num } from '../../Num';
import { formatValue } from '../../provenance.js';
import { glucoseDomain, glucoseFraction } from '../../glucose-zones';
import { useWidth } from '../../measure';
import { BlockSpan } from '../ChangeCard/ChangeCard';
import { bandPath, linePath, runs } from '../Chart/scale';
import '../../shared.css';
import './ChangeTrace.css';

export type ChangeTraceProps = { data: Trace; block: Block | null };

const LEFT = 34;
const RIGHT_PAD = 8;
const TOP = 12;
const PLOT = 180;
const FOOT = 26;
const HEIGHT = TOP + PLOT + FOOT;
const LOW = 70;
const HIGH = 180;


/** What an episode is, named once at the legend's start. */
const EPISODES = { nights: 'Nights', days: 'Days', meals: 'Meals' } as const;

/** The clock or minute ticks: at most five, on whole hours. */
function ticks(start: number, end: number): number[] {
  const span = end - start;
  const step = [60, 120, 180, 240, 360].find((s) => span / s <= 4) ?? 360;
  const first = Math.ceil(start / step) * step;
  const out = [];
  for (let t = first; t <= end; t += step) out.push(t);
  return out;
}

export function ChangeTrace({ data, block }: ChangeTraceProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const right = width - RIGHT_PAD;
  const arms = [['before', data.before], ['after', data.after]] as const;
  const values = arms.flatMap(([, arm]) => [
    ...arm.bins.flatMap((bin) => [bin.p25, bin.p75]),
    ...(arm.traces ?? []).flatMap((episode) => episode.map((point) => point.bg)),
  ]);
  const domain = glucoseDomain(values);
  const x = (t: number) => LEFT + (right - LEFT) * ((t - data.start) / (data.end - data.start));
  const y = (bg: number) => TOP + PLOT - PLOT * glucoseFraction(bg, domain);
  const step = data.alignment === 'meal' ? 5 : 10;
  // A missing bin breaks the line and the band (the chart family's runs, ADR 523).
  const binRuns = (bins: TraceArm['bins']) => runs(bins, (bin) => bin.t, step);
  const scale = [100, 200, 300].filter((bg) => bg > domain.low && bg < domain.high);
  const label = (t: number) => (data.alignment === 'clock' ? formatValue((data.startMin + t) % 1440, 'clock') : String(t));
  const meal = data.alignment === 'meal';

  return (
    <section className="ui-trace">
      <h3 className="ui-trace__title">
        {meal ? 'Meal' : <>Glucose{block && <> <BlockSpan block={block} /></>}</>}
      </h3>
      <div ref={box} className="ui-chart">
        {width > 0 && (
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-trace__chart">
            <g data-axis="">
              <text x={0} y={TOP - 2} className="ui-trace__scale">mg/dL</text>
              {scale.map((bg) => (
                <g key={bg}>
                  <line x1={LEFT} x2={right} y1={y(bg)} y2={y(bg)} className="ui-trace__grid" />
                  <text x={LEFT - 6} y={y(bg) + 4} textAnchor="end" className="ui-trace__scale">{bg}</text>
                </g>
              ))}
              {[LOW, HIGH].map((bg) => (
                <g key={bg}>
                  <line x1={LEFT} x2={right} y1={y(bg)} y2={y(bg)} className="ui-trace__threshold" />
                  <text x={right} y={y(bg) - 4} textAnchor="end" className="ui-trace__scale">{bg}</text>
                </g>
              ))}
            </g>
            {meal && <line x1={x(0)} x2={x(0)} y1={TOP} y2={TOP + PLOT} className="ui-trace__bolus" />}
            {arms.map(([key, arm]) => (
              <g key={key} aria-hidden="true" className={`ui-trace__arm ui-trace__arm--${key}`}>
                {binRuns(arm.bins).map((run, i) => (
                  <path key={`b${i}`} className="ui-trace__band"
                    d={bandPath(run.map((b) => [x(b.t), y(b.p75), y(b.p25)]))} />
                ))}
                {binRuns(arm.bins).map((run, i) => (
                  <path key={`m${i}`} className="ui-trace__median"
                    d={linePath(run.map((b) => [x(b.t), y(b.median)]))} />
                ))}
                {(arm.traces ?? []).map((episode, i) => (
                  <path key={`e${i}`} className="ui-trace__episode" d={linePath(episode.map((p) => [x(p.t), y(p.bg)]))} />
                ))}
              </g>
            ))}
            <line x1={LEFT} x2={right} y1={TOP + PLOT} y2={TOP + PLOT} className="ui-trace__axis" />
            <g data-axis="">
              {ticks(data.start, data.end).map((t, i, all) => (
                <text key={t} x={x(t)} y={TOP + PLOT + 18} className="ui-trace__scale"
                  textAnchor={!meal && i === 0 && t === data.start ? 'start' : i === all.length - 1 && t === data.end ? 'end' : 'middle'}>
                  {label(t)}
                </text>
              ))}
            </g>
          </svg>
        )}
      </div>
      <div className="ui-trace__legend">
        {meal && <span className="ui-trace__axis-name">Minutes</span>}
        <span className="ui-caption">{EPISODES[data.episode]}</span>
        {arms.map(([key, arm]) => (
          <span key={key} className={`ui-trace__key ui-trace__key--${key}`}>
            <svg aria-hidden="true" width="18" height="10"><line x1="0" x2="18" y1="5" y2="5" /></svg>
            {key === 'before' ? 'Before' : 'After'} <Num value={arm.episodes} />
            {arm.of && <> <span className="ui-trace__of">of <Num value={arm.of} /></span></>}
          </span>
        ))}
      </div>
    </section>
  );
}
