// ScreenHeader (§4.2): the screen's title and one trailing slot. The slot holds
// a control or a labelled action ("+ Log carbs"). An unavailable engine (§1.2) keeps the title
// and puts the label "Unavailable" and a compact Retry in the slot. The title is
// the one dominant line; the slot is quieter, on the same line. Day names the
// day it shows beside its title, on the title's baseline ("Day Sun 25 May ⌄"),
// as the text-action control that drops the month down (its chevron turns up
// while open), and keeps its slot for "+ Log carbs". A sub-screen that steps through items
// one at a time counts its place in the slot ("1 / 2").
//
// A drill-down sub-screen (§2.2 Drill-down) adds a back control on its own row
// above the title: "‹" and the parent screen's name, a 44 px target in the
// text-action blue. The title below it keeps the same size and place on every
// sub-screen.
import type { ReactNode } from 'react';
import type { Sourced } from '../../answers';
import { Icon } from '../../icons';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import './ScreenHeader.css';

export type ScreenHeaderProps = {
  title: string;
  layout?: 'phone' | 'desktop';
  /** A drill-down sub-screen: back to the parent screen, named. */
  back?: { label: string; onBack?: () => void };
  /** The day the screen shows, beside the title: its weekday and served date,
   *  as the control that opens and closes the month. */
  day?: { weekday: string; date: Sourced<string>; open?: boolean; onToggle?: () => void };
} & (
  | { trailing?: undefined }
  | { trailing: 'action'; label: string; onAction?: () => void }
  | { trailing: 'control'; control: ReactNode }
  | { trailing: 'unavailable'; onRetry?: () => void }
  | { trailing: 'count'; count: Sourced<number>; total: Sourced<number> }
);

function Slot(props: ScreenHeaderProps) {
  switch (props.trailing) {
    case 'action':
      return <Button kind="secondary" label={props.label} onClick={props.onAction} />;
    case 'control':
      return <div className="ui-header__control">{props.control}</div>;
    case 'count':
      return <span className="ui-header__date"><Num value={props.count} /> / <Num value={props.total} /></span>;
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
        {props.day ? (
          <span className="ui-header__titles">
            <h1 className="ui-header__title">{props.title}</h1>
            <button type="button" className="ui-header__day" data-role="text" aria-expanded={props.day.open ?? false}
              onClick={props.day.onToggle}>
              {props.day.weekday} <Num value={props.day.date} />
              <Icon name={props.day.open ? 'collapse' : 'expand'} />
            </button>
          </span>
        ) : <h1 className="ui-header__title">{props.title}</h1>}
        <Slot {...props} />
      </div>
    </header>
  );
}
