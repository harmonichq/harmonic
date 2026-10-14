import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, type ButtonProps } from './Button';

// One story per role × state (§4.2 Button). The labels are glossary verbs;
// the primary sits at phone width because it is full width by role.
const meta = {
  title: 'Button',
  component: Button,
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;
type State = 'default' | 'pressed' | 'focused' | 'disabled' | 'busy';

const ROLES = {
  primary: { kind: 'primary', label: 'Pin' },
  secondary: { kind: 'secondary', label: 'End' },
  text: { kind: 'text', label: 'Undo' },
  icon: { kind: 'icon', label: 'Snooze', icon: 'snooze' },
} satisfies Record<string, ButtonProps>;

function story(role: keyof typeof ROLES, state: State): Story {
  return {
    args: {
      ...ROLES[role],
      disabled: state === 'disabled',
      busy: state === 'busy',
    },
    parameters: {
      frame: { width: role === 'primary' ? 390 : 160 },
      pseudo: state === 'pressed' || state === 'focused' ? state : undefined,
    },
  };
}

export const PrimaryDefault = story('primary', 'default');
export const PrimaryPressed = story('primary', 'pressed');
export const PrimaryFocused = story('primary', 'focused');
export const PrimaryDisabled = story('primary', 'disabled');
export const PrimaryBusy = story('primary', 'busy');

export const SecondaryDefault = story('secondary', 'default');
export const SecondaryPressed = story('secondary', 'pressed');
export const SecondaryFocused = story('secondary', 'focused');
export const SecondaryDisabled = story('secondary', 'disabled');
export const SecondaryBusy = story('secondary', 'busy');

export const TextDefault = story('text', 'default');
export const TextPressed = story('text', 'pressed');
export const TextFocused = story('text', 'focused');
export const TextDisabled = story('text', 'disabled');
export const TextBusy = story('text', 'busy');

export const IconDefault = story('icon', 'default');
export const IconPressed = story('icon', 'pressed');
export const IconFocused = story('icon', 'focused');
export const IconDisabled = story('icon', 'disabled');
export const IconBusy = story('icon', 'busy');
