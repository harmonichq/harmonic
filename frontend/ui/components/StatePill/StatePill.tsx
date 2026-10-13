// StatePill: one state word (§4.2), 20 px with an uppercase 11 px label. The
// word is the signal; its tint only repeats it (§2.3 ban 4).
import './StatePill.css';
import { Icon } from '../../icons';

const LABELS = {
  pattern: 'Pattern',
  setting: 'Setting',
  wide: 'Wide',
  maturing: 'Maturing',
  better: 'Better',
  worse: 'Worse',
  unclear: 'Unclear',
} as const;

export type PillState = keyof typeof LABELS;

export function StatePill({ state }: { state: PillState }) {
  return (
    <span className={`ui-pill ui-pill--${state}`} data-state={state}>
      {(state === 'pattern' || state === 'setting') && <Icon name={state} size={16} stroke={1.8} />}
      {LABELS[state]}
    </span>
  );
}
