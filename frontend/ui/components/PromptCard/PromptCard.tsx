// PromptCard (§4.2): one low prompt. One line names it — Low, its date and
// time, its reading in its glucose zone's tone — then the readings around it as
// a full-width sparkline over the 70 line, the low ringed at its time. Under
// the caption "Carbs" the answers are one joined group, one question with its
// choices at equal widths on a sunken track, as the segmented control draws a
// choice: Yes · No · False low, and on desktop a fourth, Not sure, where the
// phone swipes instead. The engine's question and context sentences are never
// shown.
//
// Yes records at once: it becomes the selected segment, raised with a ✓ in the
// accent (and "Recorded" for a screen reader), and the optional grams field
// opens focused beside Next. Mid-swipe,
// the card slides aside over the Not sure reveal. The "n / N" count belongs to
// the Prompts screen's header, not to this card.
import type { PromptData } from '../../day-model';
import { Num, NumSvg } from '../../Num';
import { GramsField } from '../../GramsField';
import { formatValue } from '../../provenance.js';
import { SEVERE_LOW, glucoseDomain, glucoseFraction, zones } from '../../glucose-zones';
import { Button } from '../Button/Button';
import '../../shared.css';
import './PromptCard.css';

export type PromptCardProps = {
  data: PromptData;
  recorded?: boolean;
  /** Phone only: the card held mid-swipe over its Not sure reveal. */
  swiping?: boolean;
  layout?: 'phone' | 'desktop';
  width?: number;
};

const ANSWERS = ['Yes', 'No', 'False low', 'Not sure'] as const;
const HEIGHT = 96;
const AXIS = 16;

function Sparkline({ data, width }: { data: PromptData; width: number }) {
  const span = Math.max(...data.cgm.map((r) => r.minute));
  const domain = glucoseDomain(data.cgm.map((r) => r.bg));
  const x = (minute: number) => width * (minute / span);
  const y = (bg: number) => (HEIGHT - 4) * (1 - glucoseFraction(bg, domain)) + 2;
  const points = data.cgm.map((r) => `${x(r.minute).toFixed(1)},${y(r.bg).toFixed(1)}`).join(' ');
  const yLow = y(data.low.value);
  const id = `ui-prompt-${data.date.source}`.replace(/[^\w-]/g, '-');
  const clock = (minute: number) => formatValue((data.start + minute) % 1440, 'clock');
  const tone = data.bg.value < SEVERE_LOW ? 'very-low' : 'low';
  return (
    <svg width={width} height={HEIGHT + AXIS} viewBox={`0 0 ${width} ${HEIGHT + AXIS}`} className="ui-prompt__spark">
      <defs>
        {zones(data.low.value, 180).map((zone) => (
          <clipPath key={zone.tone} id={`${id}-${zone.tone}`}>
            <rect x={-4} width={width + 8} y={zone.to === Infinity ? -4 : y(zone.to)}
              height={(zone.from === -Infinity ? HEIGHT + 4 : y(zone.from)) - (zone.to === Infinity ? -4 : y(zone.to))} />
          </clipPath>
        ))}
      </defs>
      <line x1={0} x2={width} y1={yLow} y2={yLow} className="ui-prompt__target" />
      <text x={0} y={yLow - 5} className="ui-prompt__scale"><NumSvg value={data.low} /></text>
      <line x1={x(data.anchor)} x2={x(data.anchor)} y1={0} y2={HEIGHT} className="ui-prompt__anchor" />
      <g aria-hidden="true">
        {zones(data.low.value, 180).map((zone) => (
          <polyline key={zone.tone} points={points} clipPath={`url(#${id}-${zone.tone})`}
            className={zone.tone === 'in-range' ? 'ui-prompt__trace ui-prompt__trace--in-range'
              : `ui-prompt__trace ui-zone-stroke ui-zone--${zone.tone}`} />
        ))}
        <circle cx={x(data.anchor)} cy={y(data.bg.value)} r={5} className={`ui-prompt__low ui-zone-stroke ui-zone--${tone}`} />
      </g>
      <g data-axis="">
        <text x={0} y={HEIGHT + AXIS - 2} className="ui-prompt__scale">{clock(0)}</text>
        <text x={width} y={HEIGHT + AXIS - 2} textAnchor="end" className="ui-prompt__scale">{clock(span)}</text>
      </g>
    </svg>
  );
}

export function PromptCard({ data, recorded = false, swiping = false, layout = 'phone', width = 326 }: PromptCardProps) {
  const tone = data.bg.value < SEVERE_LOW ? 'very-low' : 'low';
  const card = (
    <section className={`ui-prompt ui-prompt--${layout}`}>
      <p className="ui-prompt__head">
        <span className={`ui-prompt__glyph ui-zone--${tone}`} aria-hidden="true">▼</span>
        <span className="ui-prompt__kind">Low</span>
        <span className="ui-prompt__meta"> · <Num value={data.date} /> <Num value={data.time} /> · </span>
        <span className={`ui-prompt__bg ui-zone--${tone}`}><Num value={data.bg} /></span>
        <span className="ui-prompt__meta"> mg/dL</span>
      </p>
      <Sparkline data={data} width={width} />
      <span className="ui-caption ui-prompt__caption">Carbs</span>
      <div className="ui-prompt__answers" role="group" aria-label="Carbs">
        {(layout === 'desktop' ? ANSWERS : ANSWERS.slice(0, 3)).map((answer) => {
          const selected = recorded && answer === 'Yes';
          return (
            <button key={answer} type="button" className="ui-prompt__answer" data-role="answer"
              aria-pressed={selected}>
              {selected && <span className="ui-prompt__check" aria-hidden="true">✓</span>}
              {answer}
              {selected && <span className="ui-sr">Recorded</span>}
            </button>
          );
        })}
      </div>
      {recorded && (
        <div className="ui-prompt__grams">
          <GramsField focused />
          <Button kind="text" label="Next" />
        </div>
      )}
    </section>
  );
  if (!swiping || layout !== 'phone') return card;
  return (
    <div className="ui-prompt-swipe">
      <span className="ui-prompt-swipe__reveal" aria-hidden="true">Not sure</span>
      {card}
    </div>
  );
}
