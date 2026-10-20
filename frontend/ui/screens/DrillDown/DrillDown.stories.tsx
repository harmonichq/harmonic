import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { fixtures, sourced } from '../../fixtures';
import { NavBar } from '../../components/NavBar/NavBar';
import { PatternCard } from '../../components/PatternCard/PatternCard';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { pattern, type Magnitude, type PatternData, type QueueStore } from '../../queue-model';
import { QUEUE_TWO_CAUSES, QUEUE_TWO_CAUSES_PINNED } from '../../served-variants';
import '../Queue/QueueScreen.css';

// The drill-down (drill-down.md), phone only: a multi-cause Pattern's pushed
// sub-screen, "‹ Queue" over the Pattern's served title, one card per served
// cause, every card open, the page scrolling as one above the tab bar. Each
// card is the Pattern card drawn as a habit's: the cause's served title, its
// claimed episodes over the Pattern's own count ("9 of 45 meals"), the trace
// chart, and Pin as an outlined secondary in the head beside the title, so it
// is in view without scrolling and the screen has no primary.
// - Open: the two causes, in the engine's served order.
// - Pinned: the pinned cause's Focus pill in its Pin's place, and no Pin on
//   the other card, as while any change is watched.
// The data is served-variants.ts's two-cause Pattern: no generated store serves
// one. The engine serves no per-cause traces yet (drill-down.md, Served
// vocabulary), so every cause card draws the Pattern's own served traces as a
// stand-in. Pin hides while the store serves an active Focus, the fixtures
// carrying no `focus_pin` admission.
const KEY = 'highs_after_meals';
const ROW = `findings.rows[id=pattern:${KEY}].0`;

type Options = { store: QueueStore };

/** Each served cause as a habit's card: its served title and count, out of the
 *  Pattern's own count, and the Pattern's traces in its place. */
function causes({ store }: Options): (PatternData & { magnitude: Magnitude })[] {
  const shown = pattern(store, KEY);
  const s = fixtures.queue[store];
  const row = s.findings.rows.find((r) => r.id === `pattern:${KEY}`)!;
  const cards = row.served_as!.cause_counts!.map((cause, i) => ({
    ...shown,
    kind: 'habit' as const,
    title: cause.title,
    magnitude: {
      count: sourced<number>(`queue.${store}.${ROW}.served_as.cause_counts.${i}.count`),
      denominator: sourced<number>(`queue.${store}.${ROW}.count_sentences.0.count`),
      noun: row.count_sentences![0].noun,
    },
    pinned: s.focus.focuses.some((f) => f.status === 'active' && f.pattern_key === KEY
      && `habit:${f.lever}` === cause.subject),
    impact: null,
  }));
  return cards;
}

function DrillDown(options: Options) {
  const { store } = options;
  const watched = fixtures.queue[store].focus.focuses.some((f) => f.status === 'active');
  return (
    <div className="ui-queue ui-queue--phone">
      <div className="ui-queue__head">
        <ScreenHeader title={pattern(store, KEY).title} back={{ label: 'Queue' }} />
      </div>
      <main className="ui-queue__main" data-scroll="page">
        <div className="ui-queue__list" style={{ gap: 16 }}>
          {causes(options).map((data) => (
            <PatternCard key={data.title} data={data} collapsible={false} pin={watched ? 'none' : 'secondary'} />
          ))}
        </div>
      </main>
      <NavBar layout="tabbar" selected="queue" />
    </div>
  );
}

const meta: Meta<typeof DrillDown> = {
  title: 'Screens/DrillDown',
  component: DrillDown,
  parameters: { frame: { width: 390, height: 844, padding: 0 } },
};
export default meta;
type Story = StoryObj<typeof DrillDown>;

/** The title and back control, each card's title and count in order, and one
 *  page that scrolls under the header to the last card. */
const drawn: Story['play'] = async ({ canvasElement, args: options }) => {
  const canvas = within(canvasElement);
  const header = canvas.getByRole('heading', { level: 1, name: pattern(options.store, KEY).title }).closest('header')!;
  await expect(within(header as HTMLElement).getByRole('button', { name: 'Queue' })).toBeInTheDocument();
  const expected = causes(options);
  const cards = [...canvasElement.querySelectorAll('.ui-pcard')];
  await expect(cards.map((card) => card.querySelector('h2')!.textContent)).toEqual(expected.map((c) => c.title));
  await expect(cards.map((card) => card.querySelector('.ui-pcard__magnitude')!.textContent))
    .toEqual(expected.map(({ magnitude: m }) => `${m.count.value}of ${m.denominator.value} ${m.noun}`));
  const page = canvasElement.querySelector<HTMLElement>('[data-scroll="page"]')!;
  await expect(page.scrollHeight).toBeGreaterThan(page.clientHeight);
  const top = header.getBoundingClientRect().top;
  page.scrollTop = page.scrollHeight;
  await new Promise(requestAnimationFrame);
  await expect(header.getBoundingClientRect().top).toBe(top);
  await expect(cards.at(-1)!.getBoundingClientRect().bottom).toBeLessThanOrEqual(page.getBoundingClientRect().bottom);
  // Back at the top, so the shot shows the screen as it opens.
  page.scrollTop = 0;
};

export const Open: Story = { args: { store: QUEUE_TWO_CAUSES }, play: drawn };

/** Pinned: the pinned cause's Focus pill, and no Pin on any card. */
export const Pinned: Story = {
  args: { store: QUEUE_TWO_CAUSES_PINNED },
  play: async (context) => {
    await drawn(context);
    const { canvasElement, args } = context;
    await expect(within(canvasElement).queryByRole('button', { name: 'Pin' })).toBeNull();
    const pills = [...canvasElement.querySelectorAll('.ui-pcard')]
      .map((card) => card.querySelector('.ui-pcard__head [data-state="focus"]') !== null);
    await expect(pills).toEqual(causes(args).map((c) => c.pinned));
    await expect(pills.filter(Boolean)).toHaveLength(1);
  },
};
