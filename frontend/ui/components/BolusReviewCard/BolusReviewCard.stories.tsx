import type { Meta, StoryObj } from '@storybook/react-vite';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect } from 'storybook/test';
import { answers, type Sourced } from '../../answers';
import { bolusReview, type OverviewStore } from '../../overview-model';
import { formatValue } from '../../provenance.js';
import { BolusReviewCard } from './BolusReviewCard';

// §4.2 BolusReviewCard (§2.5 2026-10-25, ADR 633), each state a store the
// generator serves (gen_ui_fixtures._require_insulin fails if one stops):
// - Populated: the simulated wearer at 30 d, every type and method served.
// - No boluses: wearer-no-bolus at 30 d, the same history with its boluses
//   left out: every row 0.0 U with no share.
// - No delivery: wearer-no-delivery at 14 d, a window of readings with no
//   day of delivery, which says "No data" as the unsynced store does.
// - No data (the unsynced store) and not yet read (the skeleton in the
//   card's own rows, as tall as the populated card).
// Phone at 390; desktop at half the Overview's 1120 row, beside the
// InsulinSummaryCard: (1120 − the cards' 24 px gap) ÷ 2 = 548 px of card in
// the desktop frame's 32 px margins.
const meta = {
  title: 'BolusReviewCard',
  component: BolusReviewCard,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof BolusReviewCard>;
export default meta;

type Story = StoryObj<typeof meta>;
const HALF = { frame: { width: 548 + 64, padding: 32 } };
const WINDOW = '30';

const TYPES = ['food', 'correction', 'override', 'control_iq'] as const;
const METHODS = ['standard', 'extended', 'quick', 'control_iq'] as const;
type Served = Record<'by_type' | 'by_method', Record<string, { share: number | null }>>;

/** Every row in the card's order: its group, key, and the share the engine
 *  serves for it. */
const served = (store: OverviewStore) => {
  const answer = (answers.overview[store] as unknown as { insulin: Record<string, Served> }).insulin[WINDOW];
  return [
    ...TYPES.map((key) => ['by_type', key, answer.by_type[key].share] as const),
    ...METHODS.map((key) => ['by_method', key, answer.by_method[key].share] as const),
  ];
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
 *  no other number; each row prints its served share, or "–" and no share
 *  where the engine served none; nothing on it is a control or coloured. */
const printed = (store: OverviewStore): Story['play'] => async ({ canvasElement }) => {
  const data = bolusReview(store, WINDOW);
  if (!data || data === 'none') throw new Error(`${store} serves no insulin at ${WINDOW} d`);
  const card = canvasElement.querySelector('.ui-bolus-review')!;
  await expect(card.querySelector('h2')?.textContent).toBe('Bolus review (daily average)');
  await expect([...card.querySelectorAll('[role="columnheader"]')].map((heading) => heading.textContent))
    .toEqual(['Type', 'Delivery method']);
  const figures = [...data.byType, ...data.byMethod].flatMap((row) => [row.value, row.share])
    .filter((value): value is Sourced<number> => value !== null);
  for (const value of figures) {
    await expect(card.querySelector(`[data-source="${value.source}"]`)?.textContent)
      .toBe(formatValue(value.value, value.format));
  }
  await expect(card.querySelectorAll('[data-source]').length).toBe(figures.length);
  const rows = [...card.querySelectorAll('[role="row"]')].filter((row) => row.querySelector('[role="rowheader"]'));
  await expect(rows.map((row) => row.querySelector('[role="rowheader"]')?.textContent)).toEqual([
    'Food', 'Correction', 'Override', 'Control-IQ', 'Standard', 'Extended', 'Quick', 'Control-IQ',
  ]);
  for (const [i, [group, key, share]] of served(store).entries()) {
    const cell = rows[i].querySelector('.ui-insulin-rows__share')!;
    if (share === null) {
      await expect(cell.textContent).toBe('–');
      await expect(cell.querySelector('[data-source]')).toBeNull();
    } else {
      await expect(cell.querySelector('[data-source]')?.getAttribute('data-source'))
        .toBe(`overview.${store}.insulin.${WINDOW}.${group}.${key}.share`);
    }
    await expect(rows[i].querySelector('.ui-insulin-rows__value [data-source]')?.getAttribute('data-source'))
      .toBe(`overview.${store}.insulin.${WINDOW}.${group}.${key}.units`);
  }
  await expect(card.querySelectorAll('button, a, input, select, [role="button"], [tabindex]').length).toBe(0);
  await neutralInk(card);
};

/** No boluses: every row 0.0 U and "–" for its share. */
const zero: Story['play'] = async (context) => {
  await printed('wearer-no-bolus')!(context);
  const rows = [...context.canvasElement.querySelectorAll('[role="row"]')]
    .filter((row) => row.querySelector('[role="rowheader"]'));
  await expect(rows.map((row) => row.querySelector('.ui-insulin-rows__value')?.textContent))
    .toEqual(rows.map(() => '0.0 U'));
  await expect(rows.map((row) => row.querySelector('.ui-insulin-rows__share')?.textContent))
    .toEqual(rows.map(() => '–'));
};

/** "No data" under the title, and no number. */
const none: Story['play'] = async ({ canvasElement }) => {
  await expect(canvasElement.querySelector('.ui-scard__none')?.textContent).toBe('No data');
  await expect(canvasElement.querySelectorAll('[data-source]').length).toBe(0);
};

/** The card's height populated, at the width `card` has: the populated card
 *  rendered beside it, out of sight, measured and removed. */
async function populatedHeight(card: Element) {
  const box = card.parentElement!.appendChild(document.createElement('div'));
  box.style.cssText = `position: absolute; visibility: hidden; width: ${card.getBoundingClientRect().width}px`;
  const root = createRoot(box);
  flushSync(() => root.render(<BolusReviewCard data={populated} />));
  await document.fonts.ready;
  const height = box.firstElementChild!.getBoundingClientRect().height;
  root.unmount();
  box.remove();
  return height;
}

/** The skeleton in the card's own rows, as tall as the populated card within a
 *  few px, so nothing moves when the answer lands; no number. */
const loading: Story['play'] = async ({ canvasElement }) => {
  const card = canvasElement.querySelector('.ui-bolus-review')!;
  await expect(card.getAttribute('aria-busy')).toBe('true');
  await expect(card.querySelectorAll('.ui-skeleton').length).toBeGreaterThan(1);
  await expect(canvasElement.querySelectorAll('[data-source]').length).toBe(0);
  const skeleton = card.getBoundingClientRect().height;
  await expect(Math.abs(skeleton - await populatedHeight(card))).toBeLessThanOrEqual(4);
};

const populated = bolusReview('wearer', WINDOW);
const noBoluses = bolusReview('wearer-no-bolus', WINDOW);
const noData = bolusReview('wearer-unsynced', WINDOW);
// Readings but no day of delivery (no bolus and no basal row): a window, and no data.
const noDelivery = bolusReview('wearer-no-delivery', '14');

export const Populated: Story = { args: { data: populated }, play: printed('wearer') };
export const PopulatedDesktop: Story = { args: { data: populated }, parameters: HALF, play: printed('wearer') };
export const NoBoluses: Story = { args: { data: noBoluses }, play: zero };
export const NoBolusesDesktop: Story = { args: { data: noBoluses }, parameters: HALF, play: zero };
export const NoData: Story = { args: { data: noData }, play: none };
export const NoDataDesktop: Story = { args: { data: noData }, parameters: HALF, play: none };
export const NoDelivery: Story = { args: { data: noDelivery }, play: none };
export const NoDeliveryDesktop: Story = { args: { data: noDelivery }, parameters: HALF, play: none };
export const Loading: Story = { args: { data: null }, play: loading };
export const LoadingDesktop: Story = { args: { data: null }, parameters: HALF, play: loading };
