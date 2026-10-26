// BolusReviewCard (§4.2, §2.5 2026-10-25, ADR 633): the selected window's bolus
// units as daily averages, read from `/api/explore/insulin?days=N` (#632),
// titled "Bolus review (daily average)" on one line, the parenthesis the
// title's (§2.3 ban 1). Two blocks under their headings: Type (Food,
// Correction, Override, Control-IQ) and Delivery method (Standard, Extended,
// Quick, Control-IQ), every row label, share, value in U, in the Insulin
// summary's rows and neutral ink. A window with no boluses prints each row at
// 0.0 U and "–" for its share, which the engine serves as null; the card
// computes nothing. "No data" and the skeleton as the Insulin summary's.
// Nothing to act on.
import type { BolusMethod, BolusReviewData, BolusType } from '../../overview-model';
import { InsulinCard } from '../InsulinSummaryCard/InsulinSummaryCard';
import './BolusReviewCard.css';

const TYPES: Record<BolusType, string> = {
  food: 'Food', correction: 'Correction', override: 'Override', control_iq: 'Control-IQ',
};
const METHODS: Record<BolusMethod, string> = {
  standard: 'Standard', extended: 'Extended', quick: 'Quick', control_iq: 'Control-IQ',
};

export function BolusReviewCard({ data }: { data: BolusReviewData | 'none' | null }) {
  return (
    <InsulinCard title="Bolus review (daily average)" className="ui-bolus-review" data={data} shape={[
      'heading', 'part', 'part', 'part', 'part', 'heading', 'part', 'part', 'part', 'part',
    ]} lines={(d) => [
      { kind: 'heading', label: 'Type' },
      ...d.byType.map((row) => ({ kind: 'part' as const, label: TYPES[row.key], row, unit: 'U' })),
      { kind: 'heading', label: 'Delivery method' },
      ...d.byMethod.map((row) => ({ kind: 'part' as const, label: METHODS[row.key], row, unit: 'U' })),
    ]} />
  );
}
