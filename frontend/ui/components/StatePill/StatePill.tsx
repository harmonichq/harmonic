// StatePill: one state word (§4.2), a borderless tinted tag, 18 px with an
// uppercase 11 px label, so it never reads as a button. The word is the
// signal; its tint only repeats it (§2.3 ban 4). An item's kind (Pattern,
// Setting) is its glyph, not a pill.
import './StatePill.css';

const LABELS = {
  uncertain: 'Uncertain',
  maturing: 'Maturing',
  better: 'Better',
  worse: 'Worse',
  unclear: 'Unclear',
  focus: 'Focus',
} as const;

export type PillState = keyof typeof LABELS;

export function StatePill({ state }: { state: PillState }) {
  return (
    <span className={`ui-pill ui-pill--${state}`} data-state={state}>
      {LABELS[state]}
    </span>
  );
}
