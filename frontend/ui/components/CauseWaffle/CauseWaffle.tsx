// CauseWaffle (§4.2): one cell per occurrence of the pattern's denominator,
// filled column by column. The first cause is solid, each further cause takes
// its own texture, so causes differ by pattern and not by colour alone
// (§2.3 ban 4). A pattern with no attributed cause fills its occurrences
// with the same solid tone a single cause takes (amendment 2026-10-13);
// where causes exist, occurrences none of them claims take a neutral fill.
// The rest are
// the base cells, labelled with the served noun ("Meals"). The legend names
// every fill it draws.
import { useId } from 'react';
import type { Cause, Tone } from '../../queue-model';
import './CauseWaffle.css';

export type CauseWaffleProps = {
  /** The denominator: one cell each. */
  n: number;
  /** The pattern's count. */
  k: number;
  causes: readonly Cause[];
  /** The served noun, shown as the base cells' label. */
  noun: string;
  tone: Tone;
};

const CELL = 15;
const STEP = 17.2;
const MAX_ROWS = 8;
const MAX_COLUMNS = 19;
const TEXTURES = ['solid', 'hatch', 'dots', 'cross'] as const;
type Texture = (typeof TEXTURES)[number];

function Fill({ id, texture, tone }: { id: string; texture: Texture; tone: Tone }) {
  const ink = `var(--glucose-${tone})`;
  if (texture === 'hatch' || texture === 'cross') {
    return (
      <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse"
        patternTransform={`rotate(${texture === 'hatch' ? 45 : 0})`}>
        <rect width="4" height="4" fill="var(--wk-surface)" />
        <line x1="0" y1="0" x2="0" y2="4" stroke={ink} strokeWidth="2" />
        {texture === 'cross' && <line x1="0" y1="0" x2="4" y2="0" stroke={ink} strokeWidth="2" />}
      </pattern>
    );
  }
  return (
    <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="var(--wk-surface)" />
      <circle cx="2" cy="2" r="1.35" fill={ink} />
    </pattern>
  );
}

function paint(texture: Texture, tone: Tone, id: string) {
  return texture === 'solid' ? `var(--glucose-${tone})` : `url(#${id})`;
}

function Swatch({ fill, defs }: { fill: string; defs?: React.ReactNode }) {
  return (
    <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" className="ui-waffle__swatch">
      {defs && <defs>{defs}</defs>}
      <rect width="12" height="12" rx="1.5" fill={fill} />
    </svg>
  );
}

export function CauseWaffle({ n, k, causes, noun, tone }: CauseWaffleProps) {
  const base = useId().replace(/:/g, '');
  const textures = causes.map((_, i) => TEXTURES[Math.min(i, TEXTURES.length - 1)]);
  const claimed = causes.reduce((sum, cause) => sum + cause.count, 0);
  const fills: string[] = [
    ...causes.flatMap((cause, i) => Array(cause.count).fill(paint(textures[i], tone, `${base}-${i}`))),
    ...Array(Math.max(0, k - claimed)).fill(causes.length === 0 ? paint('solid', tone, base) : 'var(--wk-ink-meta)'),
  ];
  const rows = Math.min(MAX_ROWS, Math.max(1, Math.ceil(n / MAX_COLUMNS)));
  const columns = Math.ceil(n / rows);
  const width = columns * STEP - (STEP - CELL);
  const height = rows * STEP - (STEP - CELL);
  return (
    <div className="ui-waffle">
      <svg aria-hidden="true" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="ui-waffle__grid">
        <defs>
          {textures.map((texture, i) => texture !== 'solid'
            && <Fill key={i} id={`${base}-${i}`} texture={texture} tone={tone} />)}
        </defs>
        {Array.from({ length: n }, (_, i) => (
          <rect key={i} x={Math.floor(i / rows) * STEP} y={(i % rows) * STEP}
            width={CELL} height={CELL} rx="1.5" fill={fills[i] ?? 'var(--wk-rule)'} />
        ))}
      </svg>
      <div className="ui-waffle__legend">
        {causes.map((cause, i) => (
          <span key={cause.title} className={`ui-waffle__key${i === 0 ? ' ui-waffle__key--lead' : ''}`}>
            <Swatch fill={paint(textures[i], tone, `${base}-s${i}`)}
              defs={textures[i] !== 'solid' && <Fill id={`${base}-s${i}`} texture={textures[i]} tone={tone} />} />
            {cause.title}
          </span>
        ))}
        <span className="ui-waffle__key ui-waffle__key--base">
          <Swatch fill="var(--wk-rule)" />
          {noun.charAt(0).toUpperCase() + noun.slice(1)}
        </span>
      </div>
    </div>
  );
}
