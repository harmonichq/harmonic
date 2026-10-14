// The served answers every model reads (#495): the one seam between the
// models and where their answers come from. Two adapters fill it — the
// stories' generated answers (fixtures.ts, from ui-fixtures.json) and the live
// engine's (app/live.js, through the app's one client) — and the models read
// the same shape from either: one person's answers under the store names the
// generator writes, the live adapter serving the person as `wearer`.
//
// A number reaches a component as a Sourced value, carrying the field path it
// was read from, so the story check can prove the rendered text equals that
// field.
import type data from './__fixtures__/ui-fixtures.json';
import { resolveSource } from './provenance.js';

export type Answers = typeof data;
export type Format =
  | 'round' | 'fixed1' | 'fixed2' | 'pct1' | 'share' | 'clock' | 'day' | 'date' | 'time' | 'until';
export type Sourced<T> = { readonly value: T; readonly source: string; readonly format?: Format };

/** The answers the models read now. Read on every render, never held. */
export let answers: Answers;

/** Make `next` the answers every model reads. */
export function serve(next: Answers): void {
  answers = next;
}

/** One served field, or several joined by " − " for a derived value. */
export function sourced<T>(source: string, format?: Format): Sourced<T> {
  return { value: resolveSource(answers, source, format) as T, source, format };
}
