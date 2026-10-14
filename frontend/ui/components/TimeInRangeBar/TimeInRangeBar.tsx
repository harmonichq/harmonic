// TimeInRangeBar (§4.2): one window's five AGP bands, low to high, as one bar
// with each band labelled below it by its range and its share of readings.
//
// 70–180 is labelled "In range" without a number: the figure beside the bar
// prints it. Each band is its glucose zone's swatch (glucose-zones.tsx), the
// two severe ends hatched. A band too small to see keeps a 3 px sliver.
import type { Sourced } from '../../answers';
import type { TirBands } from '../../overview-model';
import { Num } from '../../Num';
import { ZoneSwatch, type Tone } from '../../glucose-zones';
import './TimeInRangeBar.css';

export type TimeInRangeBarProps = { bands: TirBands };

type Band = { range: string; tone: Tone; share: Sourced<number>; inRange?: boolean };

export function TimeInRangeBar({ bands }: TimeInRangeBarProps) {
  const rows: Band[] = [
    { range: '<54', tone: 'very-low', share: bands.below54 },
    { range: '54–69', tone: 'low', share: bands.below70 },
    { range: '70–180', tone: 'in-range', share: bands.inRange, inRange: true },
    { range: '181–250', tone: 'high', share: bands.above180 },
    { range: '>250', tone: 'very-high', share: bands.above250 },
  ];
  return (
    <div className="ui-tir">
      <div className="ui-tir__bar" aria-hidden="true">
        {rows.map((band) => (
          <ZoneSwatch key={band.range} tone={band.tone} className="ui-tir__segment" style={{ flexGrow: band.share.value }} />
        ))}
      </div>
      <div className="ui-tir__labels">
        {rows.map((band) => (
          <div key={band.range} className="ui-tir__label">
            <span className="ui-tir__range">
              <ZoneSwatch tone={band.tone} className="ui-tir__key" />
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
