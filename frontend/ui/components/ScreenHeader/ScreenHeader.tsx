// ScreenHeader (§4.2): the screen's title and one trailing slot. The slot holds
// a date ("To 25 May", the data's last day, as content, §1.2), a control, or a
// labelled action ("+ Log carbs"). An unavailable engine (§1.2) keeps the title
// and puts the label "Unavailable" and a compact Retry in the slot. The title is
// the one dominant line; the slot is quieter, on the same line.
//
// A drill-down sub-screen (§2.2 Drill-down) adds a back control on its own row
// above the title: "‹" and the parent screen's name, a 44 px target in the
// text-action blue. The title below it keeps the same size and place on every
// sub-screen.
import type { ReactNode } from 'react';
import type { Sourced } from '../../fixtures';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import './ScreenHeader.css';

export type ScreenHeaderProps = {
  title: string;
  layout?: 'phone' | 'desktop';
  /** A drill-down sub-screen: back to the parent screen, named. */
  back?: { label: string; onBack?: () => void };
} & (
  | { trailing?: undefined }
  | { trailing: 'date'; date: Sourced<string> }
  | { trailing: 'action'; label: string; onAction?: () => void }
  | { trailing: 'control'; control: ReactNode }
  | { trailing: 'unavailable'; onRetry?: () => void }
);

function Slot(props: ScreenHeaderProps) {
  switch (props.trailing) {
    case 'date':
      return <span className="ui-header__date">To <Num value={props.date} /></span>;
    case 'action':
      return <Button kind="secondary" label={props.label} onClick={props.onAction} />;
    case 'control':
      return <div className="ui-header__control">{props.control}</div>;
    case 'unavailable':
      return (
        <span className="ui-header__unavailable">
          <span className="ui-header__label">Unavailable</span>
          <Button kind="text" label="Retry" onClick={props.onRetry} />
        </span>
      );
    default:
      return null;
  }
}

export function ScreenHeader(props: ScreenHeaderProps) {
  return (
    <header className={`ui-header ui-header--${props.layout ?? 'phone'}${props.back ? ' ui-header--child' : ''}`}>
      {props.back && (
        <button type="button" className="ui-header__back" data-role="nav" onClick={props.back.onBack}>
          <span className="ui-header__chevron" aria-hidden="true">‹</span>{props.back.label}
        </button>
      )}
      <div className="ui-header__bar">
        <h1 className="ui-header__title">{props.title}</h1>
        <Slot {...props} />
      </div>
    </header>
  );
}
