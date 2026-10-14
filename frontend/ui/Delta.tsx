// A change between two served values (§2.3 ban 4): ▲ or ▼ and the amount,
// coloured favourable or adverse, so the arrow and the colour say the same
// thing twice. A change with no tone stays in neutral ink; one that prints as
// zero has no arrow. MetricFigure and ChangeCard both draw it, so a change
// reads the same on every screen.
import type { Sourced } from './fixtures';
import { Num } from './Num';
import './shared.css';

export type Change = {
  direction: 'up' | 'down' | null;
  tone: 'favorable' | 'adverse' | null;
  /** Never negative: the formula is ordered larger − smaller. */
  amount: Sourced<number>;
};

export function Delta({ change, unit }: { change: Change; unit?: string }) {
  return (
    <span className={`ui-delta${change.tone ? ` ui-delta--${change.tone}` : ''}`}>
      {change.direction && <span aria-hidden="true">{change.direction === 'up' ? '▲' : '▼'} </span>}
      <Num value={change.amount} />
      {unit && <span className="ui-delta__unit">{unit === '%' ? unit : ` ${unit}`}</span>}
    </span>
  );
}
