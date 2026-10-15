// NavBar: the five tabs of §1.1, an icon in Material 3's active-indicator pill above a label, as the phone tab bar
// or the tablet/desktop rail. The rail opens with the wordmark (§2.5,
// 2026-10-13): the H mark over the name, stacked like a rail item but not one,
// and nothing to press. The tab bar has none. One badge system, top-right of the icon (§1.1):
// Day's count of unanswered Prompts, and Settings' "!" when the last sync
// failed.
import { Icon, type IconName } from '../../icons';
import type { Sourced } from '../../answers';
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

/** Material 3's navigation glyph, on the tab bar and the rail (§4.1). */
const NAV_GLYPH = 24;

export type NavBarProps = {
  layout: 'tabbar' | 'rail';
  selected: NavItem;
  /** The unanswered Prompts, `prompts[answer=null].length`; no badge at 0. */
  dayCount?: Sourced<number>;
  /** `status.last_error` is set: the last sync failed. */
  syncFailed?: boolean;
  onSelect?: (item: NavItem) => void;
};

/** What a screen hands its NavBar from the app: where a tab goes, and the
 *  Settings alert, which shows on every screen's NavBar. */
export type NavHooks = Pick<NavBarProps, 'onSelect' | 'syncFailed'>;

export function NavBar({ layout, selected, dayCount, syncFailed = false, onSelect }: NavBarProps) {
  return (
    <nav className={`ui-nav ui-nav--${layout}`}>
      {layout === 'rail' && (
        <div className="ui-nav__brand">
          <span className="ui-nav__mark" aria-hidden="true">H</span>
          <span className="ui-nav__name">Harmonic</span>
        </div>
      )}
      {ITEMS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="ui-nav__item"
          data-role="nav"
          aria-current={id === selected ? 'page' : undefined}
          onClick={() => onSelect?.(id)}
        >
          <span className="ui-nav__icon">
            <Icon name={id satisfies IconName} size={NAV_GLYPH} />
            {id === 'day' && dayCount && dayCount.value > 0 && (
              <span className="ui-badge ui-badge--count">
                <Num value={dayCount} />
              </span>
            )}
            {id === 'settings' && syncFailed && (
              <span className="ui-badge ui-badge--alert">!</span>
            )}
          </span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
