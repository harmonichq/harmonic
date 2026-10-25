import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { answers, type Sourced } from '../../answers';
import { insulinSummary, type OverviewStore } from '../../overview-model';
import { formatValue } from '../../provenance.js';
import { InsulinSummaryCard } from './InsulinSummaryCard';

// §4.2 InsulinSummaryCard (§2.5 2026-10-25, ADR 633), each state a store the
// generator serves (gen_ui_fixtures._require_insulin fails if one stops):
// - Populated: the simulated wearer at 30 d, every part served.
// - No boluses: wearer-no-bolus at 30 d, the same history with its boluses
//   left out: Bolus 0.0 U at 0%, the boluses 0.0 with no share.
// - No data (the unsynced store) and not yet read (the skeleton).
// Phone at 390; desktop at half the Overview's 1120 row, beside the
// BolusReviewCard: (1120 − the cards' 24 px gap) ÷ 2 = 548 px of card in the
// desktop frame's 32 px margins.
const meta = {
  title: 'InsulinSummaryCard',
  component: InsulinSummaryCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof InsulinSummaryCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const HALF = { frame: { width: 548 + 64, padding: 32 } };
const WINDOW = '30';

type Share = { share: number | null };
type Served = {
  basal: Share; bolus: Share; boluses: { manual: Share; control_iq: Share };
};
const servedAnswer = (store: OverviewStore) =>
  (answers.overview[store] as unknown as { insulin: Record<string, Served> }).insulin[WINDOW];

/** The parts in the card's order: each label, the served share's field, and
 *  the share the engine serves for it. */
const parts = (store: OverviewStore) => {
  const served = servedAnswer(store);
  const root = `overview.${store}.insulin.${WINDOW}`;
  return [
    ['Basal', `${root}.basal.share`, served.basal.share],
    ['Bolus', `${root}.bolus.share`, served.bolus.share],
    ['Manual', `${root}.boluses.manual.share`, served.boluses.manual.share],
    ['Control-IQ', `${root}.boluses.control_iq.share`, served.boluses.control_iq.share],
  ] as const;
};

/** Every element of the card is in neutral ink: the ink, body or meta token. */
async function neutralInk(card: Element) {
  const inks = ['--wk-ink', '--wk-ink-body', '--wk-ink-meta'].map((token) => {
    const probe = card.appendChild(document.createElement('span'));
    probe.style.color = `var(${token})`;
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  for (const element of [card, ...card.querySelectorAll('*')]) {
    await expect(inks).toContain(getComputedStyle(element).color);
  }
}

/** The card prints every served figure the selector names, in its format, and
 *  no other number; each part prints the served share, or "–" and no share
 *  where the engine served none; nothing on it is a control or coloured. */
const printed = (store: OverviewStore): Story['play'] => async ({ canvasElement }) => {
  const data = insulinSummary(store, WINDOW);
  if (!data || data === 'none') throw new Error(`${store} serves no insulin at ${WINDOW} d`);
  const card = canvasElement.querySelector('.ui-insulin-summary')!;
  await expect(card.querySelector('h2')?.textContent).toBe('Insulin summary');
  const figures = [data.insulin, data.boluses, data.carbs,
    ...[data.basal, data.bolus, data.manual, data.controlIq].flatMap((row) => [row.value, row.share])]
    .filter((value): value is Sourced<number> => value !== null);
  for (const value of figures) {
    await expect(card.querySelector(`[data-source="${value.source}"]`)?.textContent)
      .toBe(formatValue(value.value, value.format));
  }
  await expect(card.querySelectorAll('[data-source]').length).toBe(figures.length);
  const rows = [...card.querySelectorAll('[role="row"]')];
  await expect(rows.map((row) => row.querySelector('[role="rowheader"]')?.textContent)).toEqual([
    'Average daily insulin', 'Basal', 'Bolus', 'Average daily boluses', 'Manual', 'Control-IQ', 'Average daily carbs',
  ]);
  for (const [label, source, share] of parts(store)) {
    const cell = rows.find((row) => row.querySelector('[role="rowheader"]')?.textContent === label)!
      .querySelector('.ui-insulin-rows__share')!;
    if (share === null) {
      await expect(cell.textContent).toBe('–');
      await expect(cell.querySelector('[data-source]')).toBeNull();
    } else {
      await expect(cell.querySelector('[data-source]')?.getAttribute('data-source')).toBe(source);
    }
  }
  await expect(card.querySelectorAll('button, a, input, select, [role="button"], [tabindex]').length).toBe(0);
  await neutralInk(card);
};

/** "No data" under the title, and no number. */
const none: Story['play'] = async ({ canvasElement }) => {
  await expect(canvasElement.querySelector('.ui-scard__none')?.textContent).toBe('No data');
  await expect(canvasElement.querySelectorAll('[data-source]').length).toBe(0);
};

/** The skeleton under the title, and no number. */
const loading: Story['play'] = async ({ canvasElement }) => {
  await expect(canvasElement.querySelector('.ui-insulin-summary')?.getAttribute('aria-busy')).toBe('true');
  await expect(canvasElement.querySelectorAll('.ui-skeleton').length).toBe(1);
  await expect(canvasElement.querySelectorAll('[data-source]').length).toBe(0);
};

const populated = insulinSummary('wearer', WINDOW);
const noBoluses = insulinSummary('wearer-no-bolus', WINDOW);
const noData = insulinSummary('wearer-unsynced', WINDOW);

export const Populated: Story = { args: { data: populated }, play: printed('wearer') };
export const PopulatedDesktop: Story = { args: { data: populated }, parameters: HALF, play: printed('wearer') };
export const NoBoluses: Story = { args: { data: noBoluses }, play: printed('wearer-no-bolus') };
export const NoBolusesDesktop: Story = {
  args: { data: noBoluses }, parameters: HALF, play: printed('wearer-no-bolus'),
};
export const NoData: Story = { args: { data: noData }, play: none };
export const NoDataDesktop: Story = { args: { data: noData }, parameters: HALF, play: none };
export const Loading: Story = { args: { data: null }, play: loading };
export const LoadingDesktop: Story = { args: { data: null }, parameters: HALF, play: loading };
