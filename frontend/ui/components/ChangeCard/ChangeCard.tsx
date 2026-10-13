// ChangeCard (§4.2): the active Trial or Focus.
//
// A Trial: its kind as a caption with its state pill beside it (Maturing, or
// the result once matured); the setting and its slot as the body-size title,
// the change date beside them in meta ink; what changed, before → after, as
// the one figure; its days of evidence as ticks, one per required day, filled
// as they accrue, counted against the days required ("6 / 14"). A matured
// Trial has every required day, "14 / 14", however long it has run since.
// Once matured, the engine's Before and After for the glossary metrics, the
// Trial's own target metric in strong ink, since that is the row the result
// reads. End (§1.3a) is a compact secondary action, offered only
// when the engine accepts it: a matured active Trial. An ended Trial keeps its
// result and values, names the date it ended and has no End.
//
// A Focus is drawn the same way: its state pill (Maturing, or the result once
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
import type { ChangeData, FocusData, OutcomeRow, TrialData } from '../../changes-model';
import type { Sourced } from '../../fixtures';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './ChangeCard.css';

type Ends = { onEnd?: () => void; confirm?: ReactNode };

export type ChangeCardProps = { data: ChangeData } & Ends;

const METRIC_LABELS = {
  peak: { words: 'Peak' },
  nadir: { words: 'Nadir' },
  tir: { words: 'In range' },
  tbr: { words: 'Below', threshold: '70' },
  tar: { words: 'Above', threshold: '180' },
} as const;

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
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const label = METRIC_LABELS[row.key];
          return (
            <tr key={row.key} className={row.target ? 'ui-change__row ui-change__row--target' : 'ui-change__row'}>
              <th scope="row">
                {label.words}
                {'threshold' in label && <> <span data-axis="">{label.threshold}</span></>}
              </th>
              <td><Num value={row.before} /><Unit unit={row.unit} /></td>
              <td><Num value={row.after} /><Unit unit={row.unit} /></td>
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

function Trial({ data, onEnd, confirm }: { data: TrialData } & Ends) {
  const matured = !data.maturing;
  return (
    <section className="ui-change">
      <div className="ui-change__head">
        <span className="ui-caption">Trial</span>
        {data.maturing ? <StatePill state="maturing" /> : data.result && <StatePill state={data.result} />}
      </div>
      <h2 className="ui-change__title">
        {data.title}{' '}
        <span className="ui-change__meta">
          <Num value={data.slot} /> · <Num value={data.changedAt} />
          {data.endedAt && <> – <Num value={data.endedAt} /></>}
        </span>
      </h2>
      <div className="ui-change__figure">
        <span className="ui-change__before"><Num value={data.before} /></span>
        <span className="ui-change__arrow" aria-hidden="true">→</span>
        <span className="ui-change__after"><Num value={data.after} /></span>
        <span className="ui-change__units">{data.units}</span>
      </div>
      <Days caption="Days" elapsed={data.daysElapsed} required={data.daysRequired} done={!data.maturing} />
      {matured && <Outcomes rows={data.outcomes} />}
      {data.canEnd && (
        <div className="ui-change__foot"><Button kind="secondary" label="End" onClick={onEnd} />{confirm}</div>
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
