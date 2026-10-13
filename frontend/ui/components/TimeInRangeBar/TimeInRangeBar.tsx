// TimeInRangeBar (§4.2): one window's five AGP bands, low to high, as one bar
// with each band labelled below it by its range and its share of readings.
//
// 70–180 is labelled "In range" without a number: the figure beside the bar
// prints it. The two outer bands, <54 and >250, are hatched in their side's
// colour, so they read as the severe end of that side by pattern as well as by
// position (§2.3 ban 4). A band too small to see keeps a 3 px sliver.
import type { Sourced } from '../../fixtures';
import type { TirBands } from '../../overview-model';
import { Num } from '../../Num';
import './TimeInRangeBar.css';

export type TimeInRangeBarProps = { bands: TirBands };

type Band = { range: string; tone: 'low' | 'in-range' | 'high'; hatched: boolean; share: Sourced<number>; inRange?: boolean };

export function TimeInRangeBar({ bands }: TimeInRangeBarProps) {
  const rows: Band[] = [
    { range: '<54', tone: 'low', hatched: true, share: bands.below54 },
    { range: '54–69', tone: 'low', hatched: false, share: bands.below70 },
    { range: '70–180', tone: 'in-range', hatched: false, share: bands.inRange, inRange: true },
    { range: '181–250', tone: 'high', hatched: false, share: bands.above180 },
    { range: '>250', tone: 'high', hatched: true, share: bands.above250 },
  ];
  const swatch = (band: Band) =>
    `ui-tir__swatch ui-tir__swatch--${band.tone}${band.hatched ? ' ui-tir__swatch--hatched' : ''}`;
  return (
    <div className="ui-tir">
      <div className="ui-tir__bar" aria-hidden="true">
        {rows.map((band) => (
          <span key={band.range} className={swatch(band)} style={{ flexGrow: band.share.value }} />
        ))}
      </div>
      <div className="ui-tir__labels">
        {rows.map((band) => (
          <div key={band.range} className="ui-tir__label">
            <span className="ui-tir__range">
              <span className={`${swatch(band)} ui-tir__key`} aria-hidden="true" />
              <span data-axis="">{band.range}</span>
            </span>
            {band.inRange
              ? <span className="ui-tir__word">In range</span>
              : <span className="ui-tir__share"><Num value={band.share} /><span className="ui-tir__unit">%</span></span>}
          </div>
        ))}
      </div>
    </div>
  );
}
