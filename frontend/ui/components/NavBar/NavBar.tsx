// NavBar: the five tabs of §1.1, an icon above a label, as the phone tab bar
// or the tablet/desktop rail. One badge system, top-right of the icon (§1.1):
// Day's count of unanswered Prompts, and Settings' "!" when the last sync
// failed.
import { Icon, type IconName } from '../../icons';
import type { Sourced } from '../../fixtures';
import { Num } from '../../Num';
import './NavBar.css';

export type NavItem = 'queue' | 'changes' | 'overview' | 'day' | 'settings';

const ITEMS: readonly { id: NavItem; label: string }[] = [
  { id: 'queue', label: 'Queue' },
  { id: 'changes', label: 'Changes' },
  { id: 'overview', label: 'Overview' },
  { id: 'day', label: 'Day' },
  { id: 'settings', label: 'Settings' },
];

export type NavBarProps = {
  layout: 'tabbar' | 'rail';
  selected: NavItem;
  /** The unanswered Prompts, `prompts[answer=null].length`; no badge at 0. */
  dayCount?: Sourced<number>;
  /** `status.last_error` is set: the last sync failed. */
  syncFailed?: boolean;
  onSelect?: (item: NavItem) => void;
};

export function NavBar({ layout, selected, dayCount, syncFailed = false, onSelect }: NavBarProps) {
  return (
    <nav className={`ui-nav ui-nav--${layout}`}>
      {ITEMS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="ui-nav__item"
          data-role="nav"
          aria-current={id === selected ? 'page' : undefined}
          onClick={() => onSelect?.(id)}
        >
          <Icon name={id satisfies IconName} />
          <span>{label}</span>
          {id === 'day' && dayCount && dayCount.value > 0 && (
            <span className="ui-badge ui-badge--count">
              <Num value={dayCount} />
            </span>
          )}
          {id === 'settings' && syncFailed && (
            <span className="ui-badge ui-badge--alert">!</span>
          )}
        </button>
      ))}
    </nav>
  );
}
