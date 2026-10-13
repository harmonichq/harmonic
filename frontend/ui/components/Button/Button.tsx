// Button, in the five roles of §4.1. One size per role: primary 50 px full
// width with the --primary fill (one per screen), secondary 32 px outlined
// neutral, text 32 px hit area with no fill, icon 44 px target with a 20 px
// glyph, and a Prompt's answer, 44 px outlined neutral at equal widths. The
// label is a glossary verb or answer; an icon button carries it as its
// accessible name. A recorded answer carries a ✓ and the selected border, and
// says "Recorded" to a screen reader only.
import { Icon, type IconName } from '../../icons';
import '../../shared.css';
import './Button.css';

export type ButtonKind = 'primary' | 'secondary' | 'text' | 'icon' | 'answer';

type Common = {
  label: string;
  disabled?: boolean;
  busy?: boolean;
  onClick?: () => void;
};

export type ButtonProps =
  | (Common & { kind: 'primary' | 'secondary' | 'text' })
  | (Common & { kind: 'answer'; recorded?: boolean })
  | (Common & { kind: 'icon'; icon: IconName });

export function Button(props: ButtonProps) {
  const { kind, label, disabled = false, busy = false, onClick } = props;
  const recorded = kind === 'answer' && Boolean(props.recorded);
  return (
    <button
      type="button"
      className={`ui-button ui-button--${kind}`}
      data-role={kind}
      disabled={disabled}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      aria-label={kind === 'icon' ? label : undefined}
      aria-pressed={kind === 'answer' ? recorded : undefined}
      onClick={busy ? undefined : onClick}
    >
      <span className="ui-button__face">
        {kind === 'icon' ? <Icon name={props.icon} /> : recorded ? (
          <><span className="ui-button__check" aria-hidden="true">✓</span>{label}<span className="ui-sr">Recorded</span></>
        ) : label}
      </span>
      {busy && <span className="ui-button__spinner" aria-hidden="true" />}
    </button>
  );
}
