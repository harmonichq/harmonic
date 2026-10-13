// The stories' only data: the served answers in ui-fixtures.json, generated
// from the synthetic QA store and stamped as such. A number reaches a component as a Sourced value,
// carrying the field path it was read from, so the story check can prove the
// rendered text equals that field.
import data from './__fixtures__/ui-fixtures.json';
import { resolveSource } from './provenance.js';

export type Format = 'round' | 'fixed1' | 'fixed2' | 'clock' | 'day';
export type Sourced<T> = { readonly value: T; readonly source: string; readonly format?: Format };

export const fixtures = data;

/** One served field, or several joined by " × " or " − " for a derived value. */
export function sourced<T>(source: string, format?: Format): Sourced<T> {
  return { value: resolveSource(data, source) as T, source, format };
}
