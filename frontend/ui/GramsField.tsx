// The grams field (§2.2 numeric input), shared by PromptCard and
// LogCarbsEntry: sized to three digits, the unit inline, the system numeric
// keyboard, the number the visual focus. A focused field carries the accent
// underline; the value, when shown, is a served amount.
import type { Sourced } from './answers';
import { formatValue } from './provenance.js';
import './GramsField.css';

export type GramsFieldProps = {
  value?: Sourced<number> | null; focused?: boolean;
  /** The typed digits, on each change. */
  onChange?: (text: string) => void;
};

export function GramsField({ value = null, focused = false, onChange }: GramsFieldProps) {
  return (
    <label className={focused ? 'ui-grams ui-grams--focused' : 'ui-grams'}>
      <input
        className="ui-grams__input"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        aria-label="Carbs"
        defaultValue={value ? formatValue(value.value, value.format) : ''}
        data-source={value?.source}
        data-format={value?.format}
        onChange={onChange && ((event) => onChange(event.currentTarget.value))}
      />
      <span className="ui-grams__unit">g</span>
    </label>
  );
}
