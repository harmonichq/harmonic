// LogCarbsEntry (§4.2): carbs eaten without a bolus. The grams field, three
// digits with "g" inline, is the one dominant element; Time is a tappable row,
// now by default; Save is the one primary, set apart below the row so it is
// not hit by accident. No certainty control and no presets: a typed amount
// posts with certainty "exact".
//
// Empty: Save waits for an amount. Saving: Save is busy and the field holds.
// Not saved: the amount stays, the failure is a ⚠ label, and the primary
// becomes Retry (§1.2).
//
// Time edited: the row shows the time chosen instead of Now. Pressing the row
// opens the system's own time picker (a native time input beside it), on phone
// and in the desktop popover alike.
//
// Phone: a bottom sheet (12 px top radius, grabber) on the system keyboard,
// which the story does not draw. Desktop: a popover anchored under its
// "+ Log carbs" trigger, its arrow on the trigger; the trigger opens and closes
// it, and at a header's trailing edge both align to that edge.
import { useRef, type RefObject } from 'react';
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import { GramsField } from '../../GramsField';
import { Button } from '../Button/Button';
import '../../shared.css';
import { usePresence } from '../../motion';
import './LogCarbsEntry.css';

export type LogCarbsState = 'empty' | 'filled' | 'saving' | 'not_saved';

export type LogCarbsEntryProps = {
  state: LogCarbsState;
  /** The typed amount; absent while empty. */
  grams?: Sourced<number>;
  /** A served time shown in the Time row (the stories' Time edited); Now when unset. */
  time?: Sourced<string>;
  /** The time the person picked, `HH:MM`; shown in the Time row instead of Now. */
  chosen?: string;
  /** The person picked a time in the system picker, `HH:MM`. */
  onTimeChange?: (time: string) => void;
  layout?: 'phone' | 'desktop';
  /** Desktop: the popover is open (its trigger always shows). */
  open?: boolean;
  /** Desktop: the trigger was pressed. */
  onToggle?: () => void;
  /** Desktop: the trigger and popover align to the start or the end edge. */
  align?: 'start' | 'end';
  /** The typed digits, on each change. */
  onGramsChange?: (text: string) => void;
  /** Save, or Retry after a failed save. */
  onSave?: () => void;
};

type EntryProps = Pick<LogCarbsEntryProps,
  'state' | 'grams' | 'time' | 'chosen' | 'onTimeChange' | 'onGramsChange' | 'onSave'>;

/** Open the system time picker; where showPicker is missing, focus the input. */
function pick(input: RefObject<HTMLInputElement | null>) {
  const field = input.current;
  if (!field) return;
  try {
    field.showPicker();
  } catch {
    field.focus();
  }
}

function Entry({ state, grams, time, chosen, onTimeChange, onGramsChange, onSave }: EntryProps) {
  const failed = state === 'not_saved';
  const picker = useRef<HTMLInputElement>(null);
  return (
    <>
      <h2 className="ui-logcarbs__title">Log carbs</h2>
      <div className="ui-logcarbs__field">
        <GramsField value={state === 'empty' ? null : grams} focused={state !== 'saving'} disabled={state === 'saving'}
          onChange={onGramsChange} />
      </div>
      <div className="ui-logcarbs__time-row">
        <button type="button" className="ui-logcarbs__time" data-role="row" disabled={state === 'saving'}
          onClick={() => pick(picker)}>
          <span>Time</span>
          <span className="ui-logcarbs__value">
            {chosen ?? (time ? <Num value={time} /> : 'Now')}
            <span className="ui-logcarbs__chevron" aria-hidden="true">›</span>
          </span>
        </button>
        <input ref={picker} className="ui-logcarbs__picker" type="time" aria-label="Time" tabIndex={-1}
          value={chosen ?? ''} disabled={state === 'saving'}
          onChange={(event) => { if (event.currentTarget.value) onTimeChange?.(event.currentTarget.value); }} />
      </div>
      <div className="ui-logcarbs__foot">
        {failed && <p className="ui-logcarbs__failed"><span aria-hidden="true">⚠</span> Not saved</p>}
        <Button kind="primary" label={failed ? 'Retry' : 'Save'} disabled={state === 'empty'} busy={state === 'saving'}
          onClick={onSave} />
      </div>
    </>
  );
}

export function LogCarbsEntry({ layout = 'phone', open = true, onToggle, align = 'start', ...entry }: LogCarbsEntryProps) {
  // Desktop: the popover stays while it closes, holding what it showed.
  const shown = usePresence(open);
  const held = useRef(entry);
  if (open) held.current = entry;
  if (layout === 'phone') {
    return (
      <section className="ui-sheet ui-logcarbs" role="dialog" aria-label="Log carbs">
        <span className="ui-sheet__grabber" aria-hidden="true" />
        <Entry {...entry} />
      </section>
    );
  }
  return (
    <div className={`ui-logcarbs-anchor ui-logcarbs-anchor--${align}`}>
      <Button kind="secondary" label="+ Log carbs" onClick={onToggle} />
      {shown.value && (
        <section className={`ui-popover ui-logcarbs${align === 'end' ? ' ui-popover--end' : ''}`} role="dialog"
          aria-label="Log carbs" {...shown.exit}>
          <Entry {...held.current} />
        </section>
      )}
    </div>
  );
}
