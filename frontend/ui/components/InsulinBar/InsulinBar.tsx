// InsulinBar (§4.2): the selected day's insulin. "Insulin" and the day's
// total above one stacked bar of it, measured to its box; beneath, each part
// labelled with its units and its share of the total: Basal (delivered, grey
// as the Day chart's basal), Meal (the meal teal), Correction (neutral ink)
// and Control-IQ (its automatic boluses, hatched, so no part is told apart by
// colour alone). The parts sit two to a row in a narrow box, and in one row,
// each its own width, in a wide one.
//
// Every number is a served field printed to one decimal, and each share is its
// part ÷ the total as printed (day-model.ts). A day with no insulin served
// shows no bar; loading is the bar's own shape, in blocks.
import { useId } from 'react';
import type { InsulinData, InsulinKey } from '../../day-model';
import { Num } from '../../Num';
import { useWidth } from '../../measure';
import '../../shared.css';
import './InsulinBar.css';

export type InsulinBarProps = { data: InsulinData | null; loading?: boolean };

const NAMES: Record<InsulinKey, string> = {
  basal: 'Basal', meal: 'Meal', correction: 'Correction', control_iq_bolus: 'Control-IQ',
};
const BAR = 14;
const GAP = 2;
/** From this measured width the parts sit in one row, each its own width. */
const WIDE = 600;

export function InsulinBar({ data, loading = false }: InsulinBarProps) {
  const [box, width] = useWidth<HTMLDivElement>();
  const hatch = `ui-insulin-hatch-${useId().replace(/:/g, '')}`;
  if (loading) {
    return (
      <section className="ui-insulin" aria-hidden="true">
        <span className="ui-skeleton" style={{ width: 120, height: 22 }} />
        <span className="ui-skeleton" style={{ height: BAR }} />
        <span className="ui-skeleton" style={{ height: 44 }} />
      </section>
    );
  }
  if (!data) return null;
  let x = 0;
  return (
    <section className={width >= WIDE ? 'ui-insulin ui-insulin--wide' : 'ui-insulin'}>
      <p className="ui-insulin__total">
        <span className="ui-caption">Insulin</span>
        <span className="ui-insulin__value"><Num value={data.total} /><span className="ui-insulin__unit"> U</span></span>
      </p>
      <div ref={box} className="ui-chart">
        {width > 0 && (
          <svg aria-hidden="true" width={width} height={BAR} viewBox={`0 0 ${width} ${BAR}`} className="ui-insulin__bar">
            <defs>
              <pattern id={hatch} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="4" height="4" className="ui-insulin__hatch-ground" />
                <line x1="0" y1="0" x2="0" y2="4" className="ui-insulin__hatch-line" />
              </pattern>
            </defs>
            {data.parts.map((part) => {
              const w = (part.units.value / data.total.value) * width;
              const rect = w > 0 && (
                <rect key={part.key} x={x + (x > 0 ? GAP / 2 : 0)} y={0} rx={2} height={BAR}
                  width={Math.max(w - GAP, 1)} className={`ui-insulin__part ui-insulin__part--${part.key}`}
                  fill={part.key === 'control_iq_bolus' ? `url(#${hatch})` : undefined} />
              );
              x += w;
              return rect;
            })}
          </svg>
        )}
      </div>
      <div className="ui-insulin__parts">
        {data.parts.map((part) => (
          <div key={part.key} className="ui-insulin__part-label">
            <span className="ui-insulin__name">
              <span className={`ui-insulin__swatch ui-insulin__swatch--${part.key}`} aria-hidden="true" />
              <span className="ui-caption">{NAMES[part.key]}</span>
            </span>
            <span className="ui-insulin__value">
              <Num value={part.units} /><span className="ui-insulin__unit"> U</span>
              <span className="ui-insulin__share"><Num value={part.share} />%</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
