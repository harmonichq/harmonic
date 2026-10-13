// A served number as text, carrying the field (or formula) it came from so
// the story check can prove the text equals it. See provenance.js.
import type { Sourced } from './fixtures';
import { formatValue } from './provenance.js';

export function Num({ value }: { value: Sourced<number> }) {
  return (
    <span data-source={value.source} data-format={value.format}>
      {formatValue(value.value, value.format)}
    </span>
  );
}

/** The same, inside an SVG <text>. */
export function NumSvg({ value }: { value: Sourced<number> }) {
  return (
    <tspan data-source={value.source} data-format={value.format}>
      {formatValue(value.value, value.format)}
    </tspan>
  );
}
