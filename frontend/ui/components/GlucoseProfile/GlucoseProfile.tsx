// GlucoseProfile (§4.2): glucose by time of day over the served 30 days.
//
// The median is a line; around it two nested bands, the 25–75% spread strong
// and the 10–90% spread faint, as an AGP draws them; both a quiet green in range.
// Where the band leaves range it is clipped and drawn in that glucose zone's
// tone and hatching (glucose-zones.tsx) — below 54, below the low target, above
// the high target, above 250 — so colour marks time out of range. The zones
// take no legend entry: the target range's two edges are lines labelled with
// their served values and 250 is a labelled tick, so each colour sits against
// its number. "mg/dL" sits once on the y-axis. Meals are small bars along the
// bottom, one per served 30-minute bucket, as tall as its count.
//
// Only supported bins are drawn; a run of unsupported bins breaks the line and
// the band. When no bin is supported the card says "No data" over an empty
// plot, and no meal bars. The day wraps: midnight closes the trace with the
// 00:00 bin.
import type { ProfileBin, ProfileData } from '../../overview-model';
import { Num, NumSvg } from '../../Num';
import { formatValue } from '../../provenance.js';
import { SEVERE_HIGH, ZoneHatches, glucoseDomain, glucoseFraction, zoneArea, zones as glucoseZones } from '../../glucose-zones';
import '../../shared.css';
import './GlucoseProfile.css';

export type GlucoseProfileProps = { data: ProfileData; width?: number };

const HEIGHT = 274;
const LEFT = 34;
const RIGHT_PAD = 8;
const PLOT_TOP = 12;
const PLOT_BOTTOM = 224;
const RULE_Y = 230;
const MEAL_BASE = 254;
const MEAL_MAX = 18;
const TIME_Y = 270;
const TICK = SEVERE_HIGH;
const DAY = 1440;

/** Consecutive supported bins, each run closed at midnight when it reaches it. */
function runs(bins: ProfileBin[]): ProfileBin[][] {
  const out: ProfileBin[][] = [];
  let run: ProfileBin[] = [];
  for (const bin of bins) {
    if (bin.supported) run.push(bin);
    else if (run.length) { out.push(run); run = []; }
  }
  if (run.length) out.push(run);
  const last = out[out.length - 1];
  if (last && bins[0]?.supported && last[last.length - 1] === bins[bins.length - 1]) {
    last.push({ ...bins[0], minute: DAY });
  }
  return out;
}

export function GlucoseProfile({ data, width = 334 }: GlucoseProfileProps) {
  const right = width - RIGHT_PAD;
  const supported = data.bins.filter((bin) => bin.supported);
  const domain = glucoseDomain(supported.flatMap((bin) => [bin.p10, bin.p90]));
  const x = (minute: number) => LEFT + (right - LEFT) * (minute / DAY);
  const y = (bg: number) => PLOT_BOTTOM - (PLOT_BOTTOM - PLOT_TOP) * glucoseFraction(bg, domain);
  // The 250 tick only where the axis reaches it.
  const tick = domain.high > TICK;
  const point = (minute: number, bg: number) => `${x(minute).toFixed(1)},${y(bg).toFixed(1)}`;
  const traces = runs(data.bins);
  const band = (run: ProfileBin[], lo: 'p10' | 'p25', hi: 'p75' | 'p90') =>
    `M${run.map((bin) => point(bin.minute, bin[hi])).join('L')}L${[...run].reverse().map((bin) => point(bin.minute, bin[lo])).join('L')}Z`;
  const spreads = [
    { key: 'outer', lo: 'p10', hi: 'p90' },
    { key: 'inner', lo: 'p25', hi: 'p75' },
  ] as const;
  const most = Math.max(1, ...data.meals.map((meal) => meal.count));
  const slot = (right - LEFT) * (30 / DAY);
  const yLow = y(data.low.value);
  const yHigh = y(data.high.value);
  const empty = supported.length === 0;
  const id = `ui-profile-${width}`;
  // The five zones, top down; the band is drawn in each zone it reaches.
  const zones = glucoseZones(data.low.value, data.high.value).reverse().map((zone) => ({
    ...zone,
    y0: zone.to === Infinity ? 0 : y(zone.to),
    y1: zone.from === -Infinity ? HEIGHT : y(zone.from),
    reached: supported.some((bin) => bin.p90 > zone.from && bin.p10 < zone.to),
  }));

  return (
    <section className="ui-profile">
      <div className="ui-profile__head">
        <span className="ui-caption ui-profile__title">Glucose profile</span>
        {data.days && <span className="ui-profile__days"><Num value={data.days} /> d</span>}
      </div>
      {!empty && (
        <div className="ui-profile__legend">
          <span className="ui-profile__key">
            <svg aria-hidden="true" width="18" height="10"><line x1="0" x2="18" y1="5" y2="5" className="ui-profile__median" /></svg>
            Median
          </span>
          <span className="ui-profile__key">
            <svg aria-hidden="true" width="14" height="10" className="ui-profile__spread--inner">
              <rect width="14" height="10" className="ui-profile__neutral" />
            </svg>
            <span data-axis="">25–75%</span>
          </span>
          <span className="ui-profile__key">
            <svg aria-hidden="true" width="14" height="10" className="ui-profile__spread--outer">
              <rect width="14" height="10" className="ui-profile__neutral" />
            </svg>
            <span data-axis="">10–90%</span>
          </span>
          <span className="ui-profile__key">
            <svg aria-hidden="true" width="14" height="10">
              <rect x="1" y="2" width="3" height="8" className="ui-profile__meal" />
              <rect x="6" y="5" width="3" height="5" className="ui-profile__meal" />
              <rect x="11" y="0" width="3" height="10" className="ui-profile__meal" />
            </svg>
            Meals
          </span>
        </div>
      )}
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="ui-profile__chart">
        <defs>
          {zones.map((zone) => (
            <clipPath key={zone.tone} id={`${id}-clip-${zone.tone}`}>
              <rect x={LEFT} y={zone.y0} width={right - LEFT} height={Math.max(0, zone.y1 - zone.y0)} />
            </clipPath>
          ))}
          <ZoneHatches id={id} />
        </defs>
        {spreads.map((spread) => (
          <g key={spread.key} aria-hidden="true" className={`ui-profile__band ui-profile__spread--${spread.key}`}>
            {zones.filter((zone) => zone.reached).map((zone) => (
              <g key={zone.tone} clipPath={`url(#${id}-clip-${zone.tone})`}>
                {traces.map((run, i) => (
                  <path key={i} d={band(run, spread.lo, spread.hi)}
                    {...(zone.tone === 'in-range' ? { className: 'ui-profile__neutral' } : zoneArea(id, zone))} />
                ))}
              </g>
            ))}
          </g>
        ))}
        <line x1={LEFT} x2={right} y1={yLow} y2={yLow} className="ui-profile__target" />
        <line x1={LEFT} x2={right} y1={yHigh} y2={yHigh} className="ui-profile__target" />
        {tick && <line x1={LEFT} x2={right} y1={y(TICK)} y2={y(TICK)} className="ui-profile__tick-line" />}
        <text x={LEFT - 8} y={yLow + 4} textAnchor="end" className="ui-profile__scale"><NumSvg value={data.low} /></text>
        <text x={LEFT - 8} y={yHigh + 4} textAnchor="end" className="ui-profile__scale"><NumSvg value={data.high} /></text>
        <g data-axis="">
          {tick && <text x={LEFT - 8} y={y(TICK) + 4} textAnchor="end" className="ui-profile__scale">{TICK}</text>}
          <text x={0} y={PLOT_TOP - 2} className="ui-profile__scale">mg/dL</text>
        </g>
        <g aria-hidden="true">
          {traces.map((run, i) => (
            <polyline key={`h${i}`} points={run.map((bin) => point(bin.minute, bin.median)).join(' ')} className="ui-profile__halo" />
          ))}
          {traces.map((run, i) => (
            <polyline key={`m${i}`} points={run.map((bin) => point(bin.minute, bin.median)).join(' ')} className="ui-profile__median" />
          ))}
        </g>
        {empty && (
          <text x={(LEFT + right) / 2} y={(yLow + yHigh) / 2 + 4} textAnchor="middle" className="ui-profile__empty">No data</text>
        )}
        <line x1={LEFT} x2={right} y1={RULE_Y} y2={RULE_Y} className="ui-profile__rule" />
        <g aria-hidden="true">
          {!empty && data.meals.map((meal) => {
            const h = Math.max(2, Math.round((meal.count / most) * MEAL_MAX));
            return <rect key={meal.minute} x={x(meal.minute) + 1} y={MEAL_BASE - h} width={slot - 2} height={h} className="ui-profile__meal" />;
          })}
        </g>
        <g data-axis="">
          {[0, 360, 720, 1080, DAY].map((minute, i, all) => (
            <text key={minute} x={x(minute)} y={TIME_Y} className="ui-profile__scale"
              textAnchor={i === 0 ? 'start' : i === all.length - 1 ? 'end' : 'middle'}>
              {formatValue(minute, 'clock')}
            </text>
          ))}
        </g>
      </svg>
    </section>
  );
}
