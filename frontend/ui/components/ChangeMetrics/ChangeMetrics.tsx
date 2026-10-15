// ChangeMetrics (§4.2, §2.5 2026-10-14): one module of a Trial's metrics,
// before → after with the Δ, beneath its ChangeCard. Each row is its metric's
// name, the before value receded, →, the after value strong, its unit, and the
// shared Delta (▲/▼ and the amount, green or red only where the engine judged
// that row better or worse; neutral where unclear, and on every row the engine
// does not judge). The Trial's own target metric is strong.
//
// The values align like a table without drawing one (the operator: "we don't
// need to make it look like a table, but the data should align like a
// table"): every module shares one set of fixed columns in tabular numerals,
// so a number, its arrow, its unit and its Δ sit in the same column in every
// module on the screen, and in the Previous list beside them.
//
// Three modules use it: In range / Below 70 / Above 180; Mean / GMI / CV; and,
// for a basal Trial, how active Control-IQ was against the Pump profile: the
// delivered rate and the share of the time above and below it. An optional
// title names a module that needs one ("Basal vs Pump profile").
import type { ReactNode } from 'react';
import type { OutcomeRow } from '../../changes-model';
import { Delta } from '../../Delta';
import { Num } from '../../Num';
import '../../shared.css';
import './ChangeMetrics.css';

/** Each metric's name: the glossary's words, a threshold as a scale label. */
export const METRIC_LABELS: Record<OutcomeRow['key'], { words: string; threshold?: string }> = {
  peak: { words: 'Peak' },
  nadir: { words: 'Nadir' },
  tir: { words: 'In range' },
  tbr: { words: 'Below', threshold: '70' },
  tar: { words: 'Above', threshold: '180' },
  mean: { words: 'Mean' },
  gmi: { words: 'GMI' },
  cv: { words: 'CV' },
  delivered: { words: 'Delivered' },
  above: { words: 'Above' },
  below: { words: 'Below' },
};

export function MetricLabel({ row }: { row: OutcomeRow }) {
  const label = METRIC_LABELS[row.key];
  return <>{label.words}{label.threshold && <> <span data-axis="">{label.threshold}</span></>}</>;
}

export type ChangeMetricsProps = { rows: OutcomeRow[]; title?: ReactNode };

export function ChangeMetrics({ rows, title }: ChangeMetricsProps) {
  if (rows.length === 0) return null;
  return (
    <section className="ui-metrics">
      {title && <h3 className="ui-metrics__title">{title}</h3>}
      <dl className="ui-metrics__rows">
        {rows.map((row) => (
          <div key={row.key} className={row.target ? 'ui-metrics__row ui-metrics__row--target' : 'ui-metrics__row'}>
            <dt className="ui-caption ui-metrics__label"><MetricLabel row={row} /></dt>
            <dd className="ui-metrics__before"><Num value={row.before} /></dd>
            <dd className="ui-metrics__arrow" aria-hidden="true">→</dd>
            <dd className="ui-metrics__after"><Num value={row.after} /></dd>
            <dd className="ui-metrics__unit">{row.unit}</dd>
            <dd className="ui-metrics__delta"><Delta change={row.delta} /></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
