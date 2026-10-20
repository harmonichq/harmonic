// TransientBar (§4.2): a label and one text action, above the tab bar (on
// desktop, at the bottom of the detail pane). Four uses: after a snooze,
// "Snoozed until <date>" with Undo, the date fourteen days on from the
// engine's served decision time (§2.5, 2026-10-20); after a Done (#518),
// "Waiting for pump" with Undo; after a Focus starts, "Focus started" with
// Changes, which opens that tab (§2.5, 2026-10-20); after a write that failed
// (§1.2), "⚠ Not saved" with Retry. On desktop Undo also answers ⌘Z (§1.4).
import { useEffect } from 'react';
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import './TransientBar.css';

export type TransientBarProps = { layout?: 'phone' | 'desktop' } & (
  | { kind: 'snoozed'; until: Sourced<string>; onUndo?: () => void }
  | { kind: 'waiting'; onUndo?: () => void }
  | { kind: 'focused'; onChanges?: () => void }
  | { kind: 'not_saved'; onRetry?: () => void }
);

export function TransientBar(props: TransientBarProps) {
  const layout = props.layout ?? 'phone';
  const undo = props.kind === 'snoozed' || props.kind === 'waiting' ? props.onUndo : undefined;
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
          <span className="ui-bar__label">Snoozed until <Num value={props.until} /></span>
          <Button kind="text" label="Undo" onClick={props.onUndo} />
        </>
      ) : props.kind === 'waiting' ? (
        <>
          <span className="ui-bar__label">Waiting for pump</span>
          <Button kind="text" label="Undo" onClick={props.onUndo} />
        </>
      ) : props.kind === 'focused' ? (
        <>
          <span className="ui-bar__label">Focus started</span>
          <Button kind="text" label="Changes" onClick={props.onChanges} />
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
