// A change between two served values (§2.3 ban 4): ▲ or ▼ and the amount,
// green where it moved the good way for its metric and red the bad way
// (direction.ts), so the arrow and the colour say the same thing twice. A
// change on a metric with no good way stays in neutral ink; one that prints as
// zero has no arrow. MetricFigure, ChangeMetrics, ChangeCard and QueueRow all
// draw it, so a change reads the same on every screen.
import type { Change } from './direction';
import { Num } from './Num';
import './shared.css';

export function Delta({ change, unit }: { change: Change; unit?: string }) {
  return (
    <span className={`ui-delta${change.tone ? ` ui-delta--${change.tone}` : ''}`}>
      {change.direction && <span aria-hidden="true">{change.direction === 'up' ? '▲' : '▼'} </span>}
      <Num value={change.amount} />
      {unit && <span className="ui-delta__unit">{unit === '%' ? unit : ` ${unit}`}</span>}
    </span>
  );
}
