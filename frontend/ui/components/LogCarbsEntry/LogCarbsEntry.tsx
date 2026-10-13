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
// Phone: a bottom sheet (12 px top radius, grabber) on the system keyboard,
// which the story does not draw. Desktop: a popover anchored under its
// "+ Log carbs" trigger, its arrow on the trigger.
import type { Sourced } from '../../fixtures';
import { GramsField } from '../../GramsField';
import { Button } from '../Button/Button';
import '../../shared.css';
import './LogCarbsEntry.css';

export type LogCarbsState = 'empty' | 'filled' | 'saving' | 'not_saved';

export type LogCarbsEntryProps = {
  state: LogCarbsState;
  /** The typed amount; absent while empty. */
  grams?: Sourced<number>;
  layout?: 'phone' | 'desktop';
  /** The typed digits, on each change. */
  onGramsChange?: (text: string) => void;
  /** Save, or Retry after a failed save. */
  onSave?: () => void;
};

function Entry({ state, grams, onGramsChange, onSave }: Omit<LogCarbsEntryProps, 'layout'>) {
  const failed = state === 'not_saved';
  return (
    <>
      <h2 className="ui-logcarbs__title">Log carbs</h2>
      <div className="ui-logcarbs__field">
        <GramsField value={state === 'empty' ? null : grams} focused={state !== 'saving'} disabled={state === 'saving'}
          onChange={onGramsChange} />
      </div>
      <button type="button" className="ui-logcarbs__time" data-role="row" disabled={state === 'saving'}>
        <span>Time</span>
        <span className="ui-logcarbs__value">Now<span className="ui-logcarbs__chevron" aria-hidden="true">›</span></span>
      </button>
      <div className="ui-logcarbs__foot">
        {failed && <p className="ui-logcarbs__failed"><span aria-hidden="true">⚠</span> Not saved</p>}
        <Button kind="primary" label={failed ? 'Retry' : 'Save'} disabled={state === 'empty'} busy={state === 'saving'}
          onClick={onSave} />
      </div>
    </>
  );
}

export function LogCarbsEntry({ layout = 'phone', ...entry }: LogCarbsEntryProps) {
  if (layout === 'phone') {
    return (
      <section className="ui-logcarbs ui-logcarbs--sheet" role="dialog" aria-label="Log carbs">
        <span className="ui-logcarbs__grabber" aria-hidden="true" />
        <Entry {...entry} />
      </section>
    );
  }
  return (
    <div className="ui-logcarbs-anchor">
      <Button kind="secondary" label="+ Log carbs" />
      <section className="ui-logcarbs ui-logcarbs--popover" role="dialog" aria-label="Log carbs">
        <Entry {...entry} />
      </section>
    </div>
  );
}
