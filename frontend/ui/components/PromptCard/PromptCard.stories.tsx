import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { formatValue } from '../../provenance.js';
import { loggedGrams, lowPrompt } from '../../day-model';
import { PromptCard } from './PromptCard';

// One story per state (§4.2 PromptCard), each the simulated wearer's first
// unanswered low prompt: unanswered, with Not sure as the text action beneath
// the answers; Yes recorded, with the optional grams field focused and Next;
// mid-swipe over Not sure on the phone, the swipe being the text action's
// shortcut; and desktop, where Not sure is a fourth answer. Two plays: the Yes
// flow (tap Yes, see it recorded and the grams field open, type an amount the
// wearer logged, and press Next), and the phone's Not sure text action.
const meta = {
  title: 'PromptCard',
  component: PromptCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof PromptCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Unanswered: Story = { args: { data: lowPrompt() } };
export const YesRecorded: Story = { args: { data: lowPrompt(), recorded: true } };
export const MidSwipe: Story = { args: { data: lowPrompt(), swiping: true } };
export const Desktop: Story = {
  args: { data: lowPrompt(), layout: 'desktop' },
  parameters: { frame: { width: 720 } },
};

export const YesFlow: Story = {
  args: { data: lowPrompt(), onAnswer: fn(), onNext: fn() },
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
  args: { data: lowPrompt(), onAnswer: fn() },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Not sure' }));
    await expect(args.onAnswer).toHaveBeenCalledWith('not-sure');
  },
};
