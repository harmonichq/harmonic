// ScreenHeader (§4.2): the screen's title and one trailing slot. The slot holds
// a control or a labelled action ("+ Log carbs"). An unavailable engine (§1.2)
// puts the label "Unavailable" and a compact Retry in the slot. A sub-screen
// that steps through items one at a time counts its place in the slot ("1 / 2").
//
// A tab screen does not print its name (§2.5, 2026-10-20): the nav already
// shows that tab selected, on the phone's tab bar and the desktop rail alike.
// The name stays the screen's h1, read by a screen reader and drawn as nothing.
// What the header carries besides the name keeps its line, the slot at its
// end; a header with nothing else takes no height, and leaves no gap under
// it, so what follows it in its pane starts at the pane's top, level with a
// pane beside it (the open item beside the Queue's ranking on desktop).
// Day's line leads with the day it shows ("Sun 25 May ⌄"), the text-action
// control that drops the month down (its chevron turns up while open), and
// keeps its slot for "+ Log carbs".
//
// A drill-down sub-screen (§2.2 Drill-down), which the nav does not name,
// prints its title: a back control on its own row, "‹" and the parent
// screen's name, a 44 px target in the text-action blue, and the title below
// it, the one dominant line, at the same size and place on every sub-screen,
// with the quieter slot on the same line.
import type { ReactNode } from 'react';
import type { Sourced } from '../../answers';
import { Icon } from '../../icons';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import '../../shared.css';
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
  // Only a sub-screen has a back row, and only a sub-screen's name is one the nav does not show.
  const tab = !props.back;
  const title = <h1 className={tab ? 'ui-sr' : 'ui-header__title'}>{props.title}</h1>;
  const className = `ui-header ui-header--${props.layout ?? 'phone'}${tab ? ' ui-header--tab' : ' ui-header--child'}`;
  if (tab && !props.day && !props.trailing) return <header className={`${className} ui-header--bare`}>{title}</header>;
  return (
    <header className={className}>
      {props.back && (
        <button type="button" className="ui-header__back" data-role="nav" onClick={props.back.onBack}>
          <span className="ui-header__chevron" aria-hidden="true">‹</span>{props.back.label}
        </button>
      )}
      <div className="ui-header__bar">
        {props.day || tab ? (
          <span className="ui-header__titles">
            {title}
            {props.day && (
              <button type="button" className="ui-header__day" data-role="text" aria-expanded={props.day.open ?? false}
                onClick={props.day.onToggle}>
                {props.day.weekday} <Num value={props.day.date} />
                <Icon name={props.day.open ? 'collapse' : 'expand'} />
              </button>
            )}
          </span>
        ) : title}
        <Slot {...props} />
      </div>
    </header>
  );
}
