// The grams field (§2.2 numeric input), shared by PromptCard and
// LogCarbsEntry: sized to three digits, the unit inline, the system numeric
// keyboard, the number the visual focus. A focused field takes the focus as it
// is shown, with the accent underline; it takes digits only, so what it hands on
// is digits or nothing. The value, when shown, is a served amount.
import type { Sourced } from './answers';
import { formatValue } from './provenance.js';
import './GramsField.css';

export type GramsFieldProps = {
  value?: Sourced<number> | null; focused?: boolean;
  /** The typed digits, on each change; anything else typed is dropped. */
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
        autoFocus={focused}
        defaultValue={value ? formatValue(value.value, value.format) : ''}
        data-source={value?.source}
        data-format={value?.format}
        onChange={(event) => {
          const field = event.currentTarget;
          const digits = field.value.replace(/\D/g, '');
          if (digits !== field.value) field.value = digits;
          onChange?.(digits);
        }}
      />
      <span className="ui-grams__unit">g</span>
    </label>
  );
}
