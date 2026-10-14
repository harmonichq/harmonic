// The five clinical glucose zones, as every glucose chart draws them: one tone
// each from the glucose tokens, and the two severe ends (<54, >250) hatched so
// they read by pattern as well as colour (§2.3 ban 4). The TimeInRangeBar's
// swatches, the GlucoseProfile's band and the DayTile's trace all come from
// here, so a zone looks the same wherever it appears.
import './glucose-zones.css';

export type Tone = 'very-low' | 'low' | 'in-range' | 'high' | 'very-high';

export const SEVERE_LOW = 54;
export const SEVERE_HIGH = 250;

const HATCHED: Record<Tone, boolean> = {
  'very-low': true, low: false, 'in-range': false, high: false, 'very-high': true,
};

export type Zone = { tone: Tone; hatched: boolean; from: number; to: number };

/** The least a glucose axis shows, mg/dL: every chart spans at least 50–220. */
export const DOMAIN_FLOOR = 50;
export const DOMAIN_CEILING = 220;

/** The one glucose axis rule every chart uses: at least 50–220 mg/dL, widened
 *  to the data with a 10 mg/dL margin, on round tens. */
export function glucoseDomain(values: readonly number[]): { low: number; high: number } {
  if (values.length === 0) return { low: DOMAIN_FLOOR, high: DOMAIN_CEILING };
  return {
    low: Math.min(DOMAIN_FLOOR, Math.floor((Math.min(...values) - 10) / 10) * 10),
    high: Math.max(DOMAIN_CEILING, Math.ceil((Math.max(...values) + 10) / 10) * 10),
  };
}

/** A glucose value's place along [0, 1] of its domain, clamped to it. */
export function glucoseFraction(bg: number, { low, high }: { low: number; high: number }): number {
  return (Math.min(Math.max(bg, low), high) - low) / (high - low);
}

/** The five zones, low to high, around a target range of [low, high] mg/dL. */
export function zones(low: number, high: number): Zone[] {
  const edges: [Tone, number, number][] = [
    ['very-low', -Infinity, SEVERE_LOW],
    ['low', SEVERE_LOW, low],
    ['in-range', low, high],
    ['high', high, SEVERE_HIGH],
    ['very-high', SEVERE_HIGH, Infinity],
  ];
  return edges.map(([tone, from, to]) => ({ tone, hatched: HATCHED[tone], from, to }));
}

/** A zone's swatch: a solid or hatched block in its tone, for bars and legend keys. */
export function ZoneSwatch({ tone, className = '', style }: {
  tone: Tone; className?: string; style?: React.CSSProperties;
}) {
  const hatched = HATCHED[tone] ? ' ui-zone--hatched' : '';
  return <span aria-hidden="true" className={`ui-zone ui-zone--${tone}${hatched} ${className}`} style={style} />;
}

/** The SVG hatch patterns for the severe zones, named `${id}-${tone}`. */
export function ZoneHatches({ id }: { id: string }) {
  return (
    <>
      {(Object.keys(HATCHED) as Tone[]).filter((tone) => HATCHED[tone]).map((tone) => (
        <pattern key={tone} id={`${id}-${tone}`} width="4" height="4" patternUnits="userSpaceOnUse"
          patternTransform="rotate(-45)">
          <rect width="1.4" height="4" className={`ui-zone--${tone} ui-zone-hatch`} />
        </pattern>
      ))}
    </>
  );
}

/** An SVG area's fill for a zone: its tone, or its hatch pattern at the severe ends. */
export function zoneArea(id: string, zone: Zone): { className?: string; fill?: string } {
  return zone.hatched
    ? { fill: `url(#${id}-${zone.tone})` }
    : { className: `ui-zone-area ui-zone--${zone.tone}` };
}
