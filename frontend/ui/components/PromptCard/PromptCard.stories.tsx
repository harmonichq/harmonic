import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { formatValue } from '../../provenance.js';
import { loggedGrams, promptOf } from '../../day-model';
import { PromptCard } from './PromptCard';

// One story per state (§4.2 PromptCard), each the simulated wearer's first
// unanswered low prompt: unanswered, with Not sure as the text action beneath
// the answers; Yes recorded, with the optional grams field focused and Next;
// mid-swipe over Not sure on the phone, the swipe being the text action's
// shortcut; and desktop, where Not sure is a fourth answer. A Rise (#529), the
// wearer's first unanswered rise once lunches go unbolused: unanswered, Yes
// recorded and desktop, its answers Yes · No and Not sure, with no False low.
// Plays: the Yes flow (tap Yes, see it recorded and the grams field open, type
// an amount the wearer logged, and press Next), the phone's Not sure text
// action, and a Rise's No.
const meta = {
  title: 'PromptCard',
  component: PromptCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PromptCard>;
export default meta;

type Story = StoryObj<typeof meta>;

const low = () => promptOf('low');
const rise = () => promptOf('rise', 0, 'rises-pending');

export const Unanswered: Story = { args: { data: low() } };
export const YesRecorded: Story = { args: { data: low(), recorded: true } };
export const MidSwipe: Story = { args: { data: low(), swiping: true } };
export const Desktop: Story = {
  args: { data: low(), layout: 'desktop' },
  parameters: { frame: { width: 720 } },
};
export const RiseUnanswered: Story = { args: { data: rise() } };
export const RiseRecorded: Story = { args: { data: rise(), recorded: true } };
export const RiseDesktop: Story = {
  args: { data: rise(), layout: 'desktop' },
  parameters: { frame: { width: 720 } },
};

export const YesFlow: Story = {
  args: { data: low(), onAnswer: fn(), onNext: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const yes = canvas.getByRole('button', { name: /Yes/ });
    await userEvent.click(yes);
    await expect(args.onAnswer).toHaveBeenCalledWith('carbs');
    await expect(yes).toHaveAttribute('aria-pressed', 'true');
    await expect(within(yes).getByText('Recorded')).toBeInTheDocument();
    const grams = formatValue(loggedGrams().value, loggedGrams().format);
    await userEvent.type(canvas.getByRole('textbox', { name: 'Carbs' }), grams);
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(args.onNext).toHaveBeenCalledWith(grams);
  },
};

export const NotSurePhone: Story = {
  args: { data: low(), onAnswer: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Not sure' }));
    await expect(args.onAnswer).toHaveBeenCalledWith('not-sure');
  },
};

// A Rise answers Yes · No, with Not sure beneath, and has no False low.
export const RiseNo: Story = {
  args: { data: rise(), onAnswer: fn() },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(within(canvas.getByRole('group', { name: 'Carbs' })).getAllByRole('button')
      .map((button) => button.textContent)).toEqual(['Yes', 'No']);
    await expect(canvas.queryByRole('button', { name: 'False low' })).toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'No' }));
    await expect(args.onAnswer).toHaveBeenCalledWith('no');
  },
};
