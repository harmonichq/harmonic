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
// A Focus: the watched habit as the title, the pattern it was pinned from and
// the date in meta ink, and End at any time. No active change is a label.
import type { ChangeData, FocusData, TrialData } from '../../changes-model';
import { Num } from '../../Num';
import { Button } from '../Button/Button';
import { StatePill } from '../StatePill/StatePill';
import '../../shared.css';
import './ChangeCard.css';

export type ChangeCardProps = { data: ChangeData; onEnd?: () => void };

const METRIC_LABELS = {
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

function Trial({ data, onEnd }: { data: TrialData; onEnd?: () => void }) {
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
      <div className="ui-change__days">
        <span className="ui-caption">Days</span>
        <span className="ui-change__count">
          <Num value={data.maturing ? data.daysElapsed : data.daysRequired} />
          <span className="ui-change__of"> / <Num value={data.daysRequired} /></span>
        </span>
        <Ticks elapsed={Math.min(data.daysElapsed.value, data.daysRequired.value)} required={data.daysRequired.value} />
      </div>
      {matured && data.outcomes.length > 0 && (
        <table className="ui-change__table">
          <thead>
            <tr>
              <td />
              <th scope="col" className="ui-caption">Before</th>
              <th scope="col" className="ui-caption">After</th>
            </tr>
          </thead>
          <tbody>
            {data.outcomes.map((row) => {
              const label = METRIC_LABELS[row.key];
              return (
                <tr key={row.key} className={row.target ? 'ui-change__row ui-change__row--target' : 'ui-change__row'}>
                  <th scope="row">
                    {label.words}
                    {'threshold' in label && <> <span data-axis="">{label.threshold}</span></>}
                  </th>
                  <td><Num value={row.before} /><span className="ui-change__unit">{row.unit}</span></td>
                  <td><Num value={row.after} /><span className="ui-change__unit">{row.unit}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {data.canEnd && (
        <div className="ui-change__foot"><Button kind="secondary" label="End" onClick={onEnd} /></div>
      )}
    </section>
  );
}

function Focus({ data, onEnd }: { data: FocusData; onEnd?: () => void }) {
  return (
    <section className="ui-change">
      <div className="ui-change__head">
        <span className="ui-caption">Focus</span>
      </div>
      <h2 className="ui-change__habit">{data.habit}</h2>
      <p className="ui-change__pattern">{data.pattern} · <Num value={data.pinnedAt} /></p>
      <div className="ui-change__foot"><Button kind="secondary" label="End" onClick={onEnd} /></div>
    </section>
  );
}

export function ChangeCard({ data, onEnd }: ChangeCardProps) {
  if (data.kind === 'trial') return <Trial data={data} onEnd={onEnd} />;
  if (data.kind === 'focus') return <Focus data={data} onEnd={onEnd} />;
  return <section className="ui-change ui-change--none"><span className="ui-change__none">No active change</span></section>;
}
