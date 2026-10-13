// MetricFigure (§4.2): one CGM metric over the selected window — its label,
// value and unit — and below it the change against 90 d.
//
// The change carries ▲ or ▼ and the amount in the metric's own unit, coloured
// favourable or adverse by the metric's good direction, so the arrow and the
// colour say the same thing twice (§2.3 ban 4). A change that prints as zero
// has no arrow and stays in neutral ink. A metric the engine does not serve
// shows a dash and no change.
import { change, type MetricData, type MetricKey } from '../../overview-model';
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
        {data.metric === 'tir' && <span className="ui-metric__key" aria-hidden="true" />}
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
      {shown && (
        <span className={`ui-metric__change${shown.tone ? ` ui-metric__change--${shown.tone}` : ''}`}>
          {shown.direction && <span aria-hidden="true">{shown.direction === 'up' ? '▲' : '▼'} </span>}
          <Num value={shown.amount} />
          <span className="ui-metric__unit"> {unit}</span>
        </span>
      )}
    </div>
  );
}
