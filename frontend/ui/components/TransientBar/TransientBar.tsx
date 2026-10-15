// TransientBar (§4.2): a label and one text action, above the tab bar (on
// desktop, at the bottom of the detail pane). Three uses: after a snooze,
// "Snoozed · Until <date>" with Undo, the date fourteen days on from the
// engine's served decision time; after a Done (#518), "Waiting for pump" with
// Undo; after a write that failed (§1.2), "⚠ Not saved" with Retry. On desktop
// Undo also answers ⌘Z (§1.4).
import { useEffect } from 'react';
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import './TransientBar.css';

export type TransientBarProps = { layout?: 'phone' | 'desktop' } & (
  | { kind: 'snoozed'; until: Sourced<string>; onUndo?: () => void }
  | { kind: 'waiting'; onUndo?: () => void }
  | { kind: 'not_saved'; onRetry?: () => void }
);

export function TransientBar(props: TransientBarProps) {
  const layout = props.layout ?? 'phone';
  const undo = props.kind === 'not_saved' ? undefined : props.onUndo;
  useEffect(() => {
    if (layout !== 'desktop' || !undo) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'z' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layout, undo]);
  return (
    <div className={`ui-bar ui-bar--${layout}`} role="status">
      {props.kind === 'snoozed' ? (
        <>
          <span className="ui-bar__label">Snoozed · Until <Num value={props.until} /></span>
          <Button kind="text" label="Undo" onClick={props.onUndo} />
        </>
      ) : props.kind === 'waiting' ? (
        <>
          <span className="ui-bar__label">Waiting for pump</span>
          <Button kind="text" label="Undo" onClick={props.onUndo} />
        </>
      ) : (
        <>
          <span className="ui-bar__label"><span className="ui-bar__alert" aria-hidden="true">⚠</span> Not saved</span>
          <Button kind="text" label="Retry" onClick={props.onRetry} />
        </>
      )}
    </div>
  );
}
