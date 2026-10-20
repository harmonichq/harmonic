// ChangeMetrics (§4.2, §2.5 2026-10-14): one module of a Trial's metrics,
// before → after with the Δ, beneath its ChangeCard. Each row is its metric's
// name, the before value receded, →, the after value strong, its unit, and the
// shared Delta (▲/▼ and the amount, green where it moved the good way for its
// metric and red the bad way, maturing or matured; neutral on Control-IQ's
// rows, where neither way is better, §2.5 2026-10-19). Whether the change is
// kept is the result pill's, never the colour's. The Trial's own target
// metric is strong.
//
// The values align like a table without drawing one (the operator: "we don't
// need to make it look like a table, but the data should align like a
// table"): every module shares one set of fixed columns in tabular numerals,
// so a number, its arrow, its unit and its Δ sit in the same column in every
// module on the screen, and in the Previous list beside them. The label
// column is never narrower than the longest label, so on a phone no label
// runs into its value (§2.5, 2026-10-19, #575): a row is one line from a
// 360 px phone, and on a narrower module each label stands on its own line
// above its values, which keep their columns.
//
// Three modules use it: In range / Below 70 / Above 180; Mean / GMI / CV; and,
// for a basal Trial, how active Control-IQ was against the Pump profile: the
// delivered rate and the share of the time above and below it. An optional
// title names a module that needs one ("Basal vs Pump profile").
//
// While a Trial matures every module shows its data as it forms (§2.5,
// 2026-10-19): a row's after value is what the after arm has read so far, and
// empty, with no Δ, before it has read any; an optional count closes the module
// with the readings its rows are read from, before → after, in the same columns.
import type { ReactNode } from 'react';
import type { Count, MetricRow, OutcomeRow } from '../../changes-model';
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

export function MetricLabel({ row }: { row: Pick<OutcomeRow, 'key'> }) {
  const label = METRIC_LABELS[row.key];
  return <>{label.words}{label.threshold && <> <span data-axis="">{label.threshold}</span></>}</>;
}

export type ChangeMetricsProps = { rows: MetricRow[]; title?: ReactNode; count?: Count | null };

export function ChangeMetrics({ rows, title, count }: ChangeMetricsProps) {
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
            <dd className="ui-metrics__after">{row.after && <Num value={row.after} />}</dd>
            <dd className="ui-metrics__unit">{row.unit}</dd>
            <dd className="ui-metrics__delta">{row.delta && <Delta change={row.delta} />}</dd>
          </div>
        ))}
        {count && (
          <div className="ui-metrics__row ui-metrics__row--count">
            <dt className="ui-caption ui-metrics__label">Readings</dt>
            <dd className="ui-metrics__before"><Num value={count.before} /></dd>
            <dd className="ui-metrics__arrow" aria-hidden="true">→</dd>
            <dd className="ui-metrics__after"><Num value={count.after} /></dd>
            <dd className="ui-metrics__unit" />
            <dd className="ui-metrics__delta" />
          </div>
        )}
      </dl>
    </section>
  );
}
