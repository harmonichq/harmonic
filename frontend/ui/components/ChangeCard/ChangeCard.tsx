// ChangeCard (§4.2): the active Trial or Focus.
//
// A Trial (§2.5, 2026-10-14, the Changes redesign): the setting's name and its
// block as the title ("I:C 11:00–14:00") with the state pill on the same line
// (Maturing, or the result once matured), the change date beneath in meta ink;
// then what changed, before → after per block, in fixed columns: one setting
// is the card's figure (its slot, before → after, its units), each setting a profile switch
// moved its own named line at body size. Then the data collected, as captioned
// values: Days, "n of N" (a matured Trial has every required day, "14 of 14",
// however long it has run since), and for a carb ratio Trial its in-block
// meals, Meals before and Meals after. End (§1.3a) is a compact secondary
// action at the card's foot, offered only when the engine accepts it: a
// matured active Trial. What the change did to glucose is not on this card:
// the screen sets its modules beneath it (ChangeTrace, ChangeMetrics).
//
// A Focus keeps the card it was locked with: its state pill (Maturing, or the result once
// matured); the habit as the title with the pattern it was pinned from and the
// date in meta ink; how often the habit happened before → after, as a share of
// the counted meals, as the one figure once matured (a few meals in, the
// after share is noise the engine has not judged); the meals counted since the pin as
// ticks against the engine's gate ("2 / 12"); once matured, Before and After
// for the outcomes its Pattern maps to (Peak, Nadir) and the glossary
// metrics. Its result is the engine's verdict on the habit, so the figure is
// the row it reads. End at any time. Before any data arrives after the pin,
// the Focus shows Maturing and its title only. No active change is a label.
//
// `confirm` is what the screen anchors under End once it is pressed: on
// desktop, the confirmation popover (§1.3a), its arrow on End.
import type { ReactNode } from 'react';
import type { Block, ChangeData, FocusData, Move, OutcomeRow, TrialData } from '../../changes-model';
import type { Sourced } from '../../answers';
import { Delta } from '../../Delta';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import { MetricLabel } from '../ChangeMetrics/ChangeMetrics';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './ChangeCard.css';

type Ends = { onEnd?: () => void; confirm?: ReactNode };

export type ChangeCardProps = { data: ChangeData } & Ends;

function Ticks({ elapsed, required }: { elapsed: number; required: number }) {
  return (
    <span className="ui-change__ticks" aria-hidden="true">
      {Array.from({ length: required }, (_, i) => (
        <span key={i} className={i < elapsed ? 'ui-change__tick ui-change__tick--on' : 'ui-change__tick'} />
      ))}
    </span>
  );
}

// "%" sits on its number; a word unit (mg/dL) takes a space.
function Unit({ unit }: { unit: string }) {
  return <span className="ui-change__unit">{unit === '%' ? unit : ` ${unit}`}</span>;
}

function Outcomes({ rows }: { rows: OutcomeRow[] }) {
  if (rows.length === 0) return null;
  return (
    <table className="ui-change__table">
      <thead>
        <tr>
          <td />
          <th scope="col" className="ui-caption">Before</th>
          <th scope="col" className="ui-caption">After</th>
          <th scope="col" className="ui-caption">Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          return (
            <tr key={row.key} className={row.target ? 'ui-change__row ui-change__row--target' : 'ui-change__row'}>
              <th scope="row"><MetricLabel row={row} /></th>
              <td><Num value={row.before} /><Unit unit={row.unit} /></td>
              <td><Num value={row.after} /><Unit unit={row.unit} /></td>
              <td><Delta change={row.delta} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Days({ caption, elapsed, required, done }: {
  caption: string; elapsed: Sourced<number>; required: Sourced<number>; done: boolean;
}) {
  return (
    <div className="ui-change__days">
      <span className="ui-caption">{caption}</span>
      <span className="ui-change__count">
        <Num value={done ? required : elapsed} />
        <span className="ui-change__of"> / <Num value={required} /></span>
      </span>
      <Ticks elapsed={Math.min(elapsed.value, required.value)} required={required.value} />
    </div>
  );
}

/** A block, "11:00–14:00". */
export function BlockSpan({ block }: { block: Block }) {
  return <span className="ui-change__block"><Num value={block.start} />–<Num value={block.end} /></span>;
}

/** What a Trial moved, one line a setting: where it starts, before → after,
 *  its units, in fixed columns so the lines align. One setting is the card's
 *  figure; a profile switch's settings are each named, at body size. */
export function Moves({ moves, figure = false }: { moves: Move[]; figure?: boolean }) {
  if (moves.length === 0) return null;
  const named = !figure;
  return (
    <div className={`ui-moves${figure ? ' ui-moves--figure' : ''}`}>
      {moves.map((move, i) => (
        <div key={i} className="ui-moves__row">
          {named && <span className="ui-moves__name">{move.name}</span>}
          <span className="ui-moves__slot">{move.slot && <Num value={move.slot} />}</span>
          <span className="ui-moves__before"><Num value={move.before} /></span>
          <span className="ui-moves__arrow" aria-hidden="true">→</span>
          <span className="ui-moves__after"><Num value={move.after} /></span>
          <span className="ui-moves__units">{move.units}</span>
        </div>
      ))}
    </div>
  );
}

function Trial({ data, onEnd, confirm }: { data: TrialData } & Ends) {
  const figure = data.moves.length === 1;
  return (
    <section className="ui-change">
      <div className="ui-change__head">
        <h2 className="ui-change__title">
          {data.title}{data.block && <> <BlockSpan block={data.block} /></>}
        </h2>
        {data.maturing ? <StatePill state="maturing" /> : data.result && <StatePill state={data.result} />}
      </div>
      <span className="ui-change__date"><Num value={data.changedAt} /></span>
      <Moves moves={data.moves} figure={figure} />
      <dl className="ui-change__collected">
        <div className="ui-change__pair">
          <dt className="ui-caption">Days</dt>
          <dd><Num value={data.maturing ? data.daysElapsed : data.daysRequired} /><span className="ui-change__of"> of <Num value={data.daysRequired} /></span></dd>
        </div>
        {data.meals && (
          <>
            <div className="ui-change__pair">
              <dt className="ui-caption">Meals before</dt>
              <dd><Num value={data.meals.before} /></dd>
            </div>
            <div className="ui-change__pair">
              <dt className="ui-caption">Meals after</dt>
              <dd><Num value={data.meals.after} /></dd>
            </div>
          </>
        )}
      </dl>
      {data.canEnd && (
        <div className="ui-change__end"><Button kind="secondary" label="End" onClick={onEnd} />{confirm}</div>
      )}
    </section>
  );
}

function Focus({ data, onEnd, confirm }: { data: FocusData } & Ends) {
  return (
    <section className="ui-change">
      <div className="ui-change__head">
        <span className="ui-caption">Focus</span>
        {data.maturing ? <StatePill state="maturing" /> : data.result && <StatePill state={data.result} />}
      </div>
      <h2 className="ui-change__title">
        {data.habit}{' '}
        <span className="ui-change__meta">{data.pattern} · <span className="ui-change__date"><Num value={data.pinnedAt} /></span></span>
      </h2>
      {data.adherence && !data.maturing && (
        <div className="ui-change__figure">
          <span className="ui-change__before"><Num value={data.adherence.before} /></span>
          <span className="ui-change__arrow" aria-hidden="true">→</span>
          <span className="ui-change__after"><Num value={data.adherence.after} /></span>
          <span className="ui-change__units">% of {data.adherence.unit}</span>
          <Delta change={data.adherence.delta} unit="%" />
        </div>
      )}
      {data.counted && (
        <Days caption={data.counted.unit} elapsed={data.counted.count} required={data.counted.required}
          done={!data.maturing} />
      )}
      {!data.maturing && <Outcomes rows={data.outcomes} />}
      <div className="ui-change__foot"><Button kind="secondary" label="End" onClick={onEnd} />{confirm}</div>
    </section>
  );
}

export function ChangeCard({ data, onEnd, confirm }: ChangeCardProps) {
  if (data.kind === 'trial') return <Trial data={data} onEnd={onEnd} confirm={confirm} />;
  if (data.kind === 'focus') return <Focus data={data} onEnd={onEnd} confirm={confirm} />;
  return <section className="ui-change ui-change--none"><span className="ui-change__none">No active change</span></section>;
}
