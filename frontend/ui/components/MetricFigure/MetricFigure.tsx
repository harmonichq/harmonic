// MetricFigure (§4.2): one CGM metric over the selected window — its label,
// value and unit — and below it the change against the period of the same
// length before it, which the Overview names once on its date line.
//
// The change is a Delta (the one change element, shared with ChangeCard): ▲ or
// ▼ and the amount in the metric's own unit, the difference of the values as
// printed. Only Below 70 and Above 180 are coloured favourable or adverse; the
// others keep a neutral arrow. A change that prints as zero has no arrow and
// stays in neutral ink. A metric the engine does not serve, or a previous
// period without data, shows no change.
import { ZoneSwatch } from '../../glucose-zones';
import { change, type MetricData, type MetricKey } from '../../overview-model';
import { Delta } from '../../Delta';
import { Num } from '../../Num';
import '../../shared.css';
import './MetricFigure.css';

export type MetricFigureProps = { data: MetricData };

/** The glossary's metric names. A threshold inside a name is scale, not a value. */
const LABELS: Record<MetricKey, { words: string; threshold?: string; unit: string }> = {
  tir: { words: 'In range', unit: '%' },
  mean_glucose: { words: 'Mean', unit: 'mg/dL' },
  gmi: { words: 'GMI', unit: '%' },
  cv: { words: 'CV', unit: '%' },
  tbr_lvl1: { words: 'Below', threshold: '70', unit: '%' },
  tar_lvl1: { words: 'Above', threshold: '180', unit: '%' },
};

export function MetricFigure({ data }: MetricFigureProps) {
  const { words, threshold, unit } = LABELS[data.metric];
  const value = data.value.value;
  const shown = change(data);
  return (
    <div className="ui-metric">
      <span className="ui-caption ui-metric__label">
        {data.metric === 'tir' && <ZoneSwatch tone="in-range" className="ui-metric__key" />}
        {words}
        {threshold && <> <span data-axis="">{threshold}</span></>}
      </span>
      {value === null ? (
        <span className="ui-metric__value">—</span>
      ) : (
        <span className="ui-metric__figure">
          <span className="ui-metric__value"><Num value={{ ...data.value, value }} /></span>
          <span className="ui-metric__unit">{unit}</span>
        </span>
      )}
      {shown && <Delta change={shown} unit={unit} />}
    </div>
  );
}
