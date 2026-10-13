// Button, in the four roles of §4.1. One size per role: primary 50 px full
// width with the --primary fill (one per screen), secondary 32 px outlined
// neutral, text 32 px hit area with no fill, icon 44 px target with a 20 px
// glyph. The label is a glossary verb; an icon button carries it as its
// accessible name.
import { Icon, type IconName } from '../../icons';
import './Button.css';

export type ButtonKind = 'primary' | 'secondary' | 'text' | 'icon';

type Common = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
};

export type ButtonProps =
  | (Common & { kind: 'primary' | 'secondary' | 'text' })
  | (Common & { kind: 'icon'; icon: IconName });

export function Button(props: ButtonProps) {
  const { kind, label, disabled = false, busy = false, onClick } = props;
  return (
    <button
      type="button"
      className={`ui-button ui-button--${kind}`}
      data-role={kind}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      aria-label={kind === 'icon' ? label : undefined}
      onClick={busy ? undefined : onClick}
    >
      <span className="ui-button__face">
        {kind === 'icon' ? <Icon name={props.icon} /> : label}
      </span>
      {busy && <span className="ui-button__spinner" aria-hidden="true" />}
    </button>
  );
}
