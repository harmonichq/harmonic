// SegmentedControl: the 14 / 30 / 90 d window choice (§4.2). The track is
// 32 px and each segment the §4.1 28 px. A window that lacks coverage is
// disabled; its label is struck through as well as dimmed, so the state never
// rests on colour alone (§2.3 ban 4).
import type { Sourced } from '../../answers';
import { Num } from '../../Num';
import './SegmentedControl.css';

export type WindowOption = {
  /** `outcomes_*.window_days` */
  days: Sourced<number>;
  disabled?: boolean;
};

export type SegmentedControlProps = {
  options: readonly WindowOption[];
  selected: number;
  onChange?: (days: number) => void;
};

/** §4.2: a window lacks coverage when its served `coverage.days` falls short
 *  of the window it was asked for. */
export function lacksCoverage(outcome: { window_days: number; coverage: { days: number } }): boolean {
  return outcome.coverage.days < outcome.window_days;
}

export function SegmentedControl({ options, selected, onChange }: SegmentedControlProps) {
  return (
    <div className="ui-segmented" role="group">
      {options.map(({ days, disabled = false }) => (
        <button
          key={days.value}
          type="button"
          className="ui-segmented__segment"
          data-role="segment"
          aria-pressed={days.value === selected}
          disabled={disabled}
          onClick={() => onChange?.(days.value)}
        >
          <Num value={days} />
          {' d'}
        </button>
      ))}
    </div>
  );
}
