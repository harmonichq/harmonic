import type { Meta, StoryObj } from '@storybook/react-vite';
import { lowPrompt } from '../../day-model';
import { PromptCard } from './PromptCard';

// One story per state (§4.2 PromptCard), each the simulated wearer's first
// unanswered low prompt: unanswered; Yes recorded, with the optional grams
// field focused and Next; mid-swipe over Not sure on the phone; and desktop,
// where Not sure is a fourth answer instead of the swipe.
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
  args: { data: lowPrompt(), layout: 'desktop', width: 656 },
  parameters: { frame: { width: 720 } },
};
