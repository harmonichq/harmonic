// The grams field (§2.2 numeric input), shared by PromptCard and
// LogCarbsEntry: sized to three digits, the unit inline, the system numeric
// keyboard, the number the visual focus. A focused field carries the accent
// underline; the value, when shown, is a served amount.
import type { Sourced } from './fixtures';
import { formatValue } from './provenance.js';
import './GramsField.css';

export type GramsFieldProps = { value?: Sourced<number> | null; focused?: boolean; disabled?: boolean };

export function GramsField({ value = null, focused = false, disabled = false }: GramsFieldProps) {
  return (
    <label className={focused ? 'ui-grams ui-grams--focused' : 'ui-grams'}>
      <input
        className="ui-grams__input"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        aria-label="Carbs"
        disabled={disabled}
        defaultValue={value ? formatValue(value.value, value.format) : ''}
        data-source={value?.source}
        data-format={value?.format}
      />
      <span className="ui-grams__unit">g</span>
    </label>
  );
}
