// InsulinSummaryCard (§4.2, §2.5 2026-10-25, ADR 633): the selected window's
// insulin as daily averages, read from `/api/explore/insulin?days=N` (#632).
// Three blocks, each a headline row and its parts: Average daily insulin with
// Basal and Bolus, Average daily boluses with Manual and Control-IQ, and
// Average daily carbs. Every row is label, share, value in three columns, the
// headline value at the metric size and the parts at body size, all in neutral
// ink: none of these figures is judged better or worse. A share or value the
// engine serves as null prints "–"; the card computes nothing. Like the other
// Overview cards it never prints its window. A window with no day of delivery
// says "No data"; one not read yet is the card's skeleton. Nothing to act on.
//
// `InsulinCard`, the frame and its rows, is the BolusReviewCard's too.
import { Fragment } from 'react';
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import type { InsulinRow, InsulinSummaryData } from '../../overview-model';
import '../../shared.css';
import '../SettingCard/SettingCard.css';
import './InsulinSummaryCard.css';

/** A served value and its unit, or "–" where the engine serves none. */
const Value = ({ value, unit }: { value: Sourced<number> | null; unit?: string }) => (
  value ? <><Num value={value} />{unit && <span className="ui-insulin-rows__unit"> {unit}</span>}</> : <>–</>
);

/** One table row: a block's headline, a heading over a block, or a part. */
export type InsulinLine =
  | { kind: 'headline'; label: string; value: Sourced<number> | null; unit?: string }
  | { kind: 'heading'; label: string }
  | { kind: 'part'; label: string; row: InsulinRow; unit?: string };

/** The card's rows in one grid, label, share and value aligned across every
 *  block, a headline's label across the share column it has no value for; a
 *  rule across the card opens each block after the first. */
function InsulinRows({ lines }: { lines: InsulinLine[] }) {
  return (
    <div role="table" className="ui-insulin-rows">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && line.kind !== 'part' && <div className="ui-insulin-rows__rule" aria-hidden="true" />}
          {line.kind === 'heading' ? (
            <div role="row" className="ui-insulin-rows__row">
              <span role="columnheader" className="ui-insulin-rows__heading">{line.label}</span>
            </div>
          ) : line.kind === 'headline' ? (
            <div role="row" className="ui-insulin-rows__row ui-insulin-rows__row--headline">
              <span role="rowheader" className="ui-insulin-rows__label">{line.label}</span>
              <span role="cell" className="ui-insulin-rows__value"><Value value={line.value} unit={line.unit} /></span>
            </div>
          ) : (
            <div role="row" className="ui-insulin-rows__row">
              <span role="rowheader" className="ui-insulin-rows__label">{line.label}</span>
              <span role="cell" className="ui-insulin-rows__share">
                {line.row.share ? <><Num value={line.row.share} />%</> : '–'}
              </span>
              <span role="cell" className="ui-insulin-rows__value"><Value value={line.row.value} unit={line.unit} /></span>
            </div>
          )}
        </Fragment>
      ))}
    </div>
  );
}

/** The card's frame: its title, then its skeleton, "No data" or its rows. */
export function InsulinCard<T extends object>({ title, className, data, lines }: {
  title: string; className: string; data: T | 'none' | null; lines: (data: T) => InsulinLine[];
}) {
  const heading = <h2 className="ui-scard__title">{title}</h2>;
  if (data === null) {
    return (
      <section className={`ui-scard ${className}`} aria-busy="true">
        {heading}
        <span className="ui-skeleton ui-scard__skeleton" aria-hidden="true" />
      </section>
    );
  }
  if (data === 'none') {
    return <section className={`ui-scard ${className}`}>{heading}<p className="ui-scard__none">No data</p></section>;
  }
  return <section className={`ui-scard ${className}`}>{heading}<InsulinRows lines={lines(data)} /></section>;
}

export function InsulinSummaryCard({ data }: { data: InsulinSummaryData | 'none' | null }) {
  return (
    <InsulinCard title="Insulin summary" className="ui-insulin-summary" data={data} lines={(d) => [
      { kind: 'headline', label: 'Average daily insulin', value: d.insulin, unit: 'U' },
      { kind: 'part', label: 'Basal', row: d.basal, unit: 'U' },
      { kind: 'part', label: 'Bolus', row: d.bolus, unit: 'U' },
      { kind: 'headline', label: 'Average daily boluses', value: d.boluses },
      { kind: 'part', label: 'Manual', row: d.manual },
      { kind: 'part', label: 'Control-IQ', row: d.controlIq },
      { kind: 'headline', label: 'Average daily carbs', value: d.carbs, unit: 'g' },
    ]} />
  );
}
