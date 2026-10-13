import type { Meta, StoryObj } from '@storybook/react-vite';

// The five glucose band tokens (tokens.css), alone, so the clinical AGP
// palette can be reviewed apart from any chart: one swatch per band, low to
// high, each labelled by its range. The two outer bands also show the hatching
// the charts give them, beside their solid fill.
const BANDS = [
  { range: '<54', token: '--glucose-very-low', hatched: true },
  { range: '54–69', token: '--glucose-low', hatched: false },
  { range: '70–180', token: '--glucose-in-range', hatched: false },
  { range: '181–250', token: '--glucose-high', hatched: false },
  { range: '>250', token: '--glucose-very-high', hatched: true },
];

function GlucoseColors() {
  return (
    <div style={{ display: 'flex', gap: 6, fontFamily: 'var(--ui-font)', fontVariantNumeric: 'tabular-nums' }}>
      {BANDS.map(({ range, token, hatched }) => (
        <div key={range} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, padding: 6,
          borderRadius: 'var(--wk-radius)', background: 'var(--wk-surface)' }}>
          <span aria-hidden="true" style={{ height: 40, borderRadius: 2, background: `var(${token})` }} />
          <span aria-hidden="true" style={{ height: 12, borderRadius: 1, visibility: hatched ? 'visible' : 'hidden',
            background: `repeating-linear-gradient(-45deg, var(${token}) 0 1.4px, transparent 1.4px 2.83px)` }} />
          <span data-axis="" style={{ color: 'var(--wk-ink-body)', fontSize: 'var(--ui-type-label)', whiteSpace: 'nowrap' }}>{range}</span>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Tokens/GlucoseColors',
  component: GlucoseColors,
  parameters: { frame: { width: 390 } },
} satisfies Meta<typeof GlucoseColors>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};
