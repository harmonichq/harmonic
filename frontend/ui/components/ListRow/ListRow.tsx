// ListRow (§4.2): a label on the left and its inline value or state on the
// right, 48 px at least. A row that opens a screen is a button with a › and
// the whole row as its target; a read-only row has no ›. A row may carry an
// alert ("⚠ Failed", glyph and word, never colour alone) or one compact
// secondary action ("Update"). The dense variant lays a row out in columns
// for the Pump profile's segment table. A Glossary row adds its one-line
// definition beneath the term; a detail row adds a served detail beneath its
// label (a failed sync's raw error), wrapped at any width so it never runs
// past the row.
//
// A field row is a form's row: the label on the left and its text input on
// the right, named by the label, underlined as the grams field is (the accent
// while focused), the system keyboard for its kind (an email address, or a
// password the screen never shows back).
//
// A disclosure row expands what it names in place, beneath it: its chevron
// points down when closed and up when open, and it says which to assistive
// tech (aria-expanded). It never navigates.
//
// ListGroup gathers rows into a full-bleed section under an optional caption,
// with hairline rules between rows and no box around them; two groups in a row
// are set apart by space alone. The Glossary's group is marked `.glossary`,
// the one place a sentence may appear (§2.3).
import type { ReactNode } from 'react';
import { Icon } from '../../icons';
import { Button } from '../Button/Button';
import '../../shared.css';
import './ListRow.css';

export type ListRowProps = {
  label: ReactNode;
  value?: ReactNode;
  /** The value is an alert: shown with ⚠ in the danger tone. */
  alert?: boolean;
  /** Opens a screen: the row is a button with a ›. */
  onOpen?: () => void;
  /** One compact secondary action at the row's end. */
  action?: { label: string; onAction?: () => void };
  /** Glossary: the term's definition, beneath it. */
  definition?: string;
  /** A served detail beneath the label, wrapped at any width: a failed sync's raw error. */
  detail?: ReactNode;
  /** A disclosure row: open or closed, toggled in place. */
  disclosure?: { expanded: boolean; onToggle?: () => void };
  /** A form row: a text input of this kind, named by the label. */
  field?: { kind: 'email' | 'password'; onChange?: (text: string) => void; disabled?: boolean; focused?: boolean };
};

function Value({ value, alert }: Pick<ListRowProps, 'value' | 'alert'>) {
  if (value === undefined) return null;
  return (
    <span className={alert ? 'ui-row__value ui-row__value--alert' : 'ui-row__value'}>
      {alert && <span aria-hidden="true">⚠ </span>}
      {value}
    </span>
  );
}

export function ListRow({ label, value, alert = false, onOpen, action, definition, detail, disclosure, field }: ListRowProps) {
  if (field) {
    return (
      <label className="ui-row ui-row--field">
        <span className="ui-row__label">{label}</span>
        <input className="ui-row__input" type={field.kind} aria-label={typeof label === 'string' ? label : undefined}
          autoComplete={field.kind === 'email' ? 'username' : 'current-password'} spellCheck={false}
          disabled={field.disabled} autoFocus={field.focused} onChange={field.onChange && ((event) => field.onChange!(event.currentTarget.value))} />
      </label>
    );
  }
  if (disclosure) {
    return (
      <button type="button" className="ui-row ui-row--open" data-role="row" aria-expanded={disclosure.expanded}
        onClick={disclosure.onToggle}>
        <span className="ui-row__label">{label}</span>
        <Value value={value} alert={alert} />
        <span className="ui-row__disclosure"><Icon name={disclosure.expanded ? 'collapse' : 'expand'} /></span>
      </button>
    );
  }
  if (onOpen) {
    return (
      <button type="button" className="ui-row ui-row--open" data-role="row" onClick={onOpen}>
        <span className="ui-row__label">{label}</span>
        <Value value={value} alert={alert} />
        <span className="ui-row__chevron" aria-hidden="true">›</span>
      </button>
    );
  }
  return (
    <div className={definition ? 'ui-row ui-row--term' : detail ? 'ui-row ui-row--detail' : 'ui-row'}>
      <span className="ui-row__label">
        {label}
        {definition && <span className="ui-row__definition">{definition}</span>}
        {detail && <span className="ui-row__detail">{detail}</span>}
      </span>
      <Value value={value} alert={alert} />
      {action && <Button kind="secondary" label={action.label} onClick={action.onAction} />}
    </div>
  );
}

/** The dense variant: one row of a table, its cells in the group's columns. */
export function ListRowDense({ cells, header = false }: { cells: ReactNode[]; header?: boolean }) {
  return (
    <div className={header ? 'ui-row ui-row--dense ui-row--head' : 'ui-row ui-row--dense'} role="row">
      {cells.map((cell, i) => (
        <span key={i} className="ui-row__cell" role={header ? 'columnheader' : 'cell'}>{cell}</span>
      ))}
    </div>
  );
}

export function ListGroup({ caption, children, columns, glossary = false }: {
  caption?: string; children: ReactNode;
  /** For dense rows: the CSS grid columns every row shares. */
  columns?: string;
  /** The Glossary list, whose definitions are sentences. */
  glossary?: boolean;
}) {
  return (
    <section className={glossary ? 'ui-list glossary' : 'ui-list'} role={columns ? 'table' : undefined}
      style={columns ? ({ '--ui-row-columns': columns } as React.CSSProperties) : undefined}>
      {caption && <h2 className="ui-caption ui-list__caption">{caption}</h2>}
      <div className="ui-list__rows">{children}</div>
    </section>
  );
}
