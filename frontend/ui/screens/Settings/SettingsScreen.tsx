// The Settings screen (§1.1, §1.2, §1.3), composed only from the library's
// components: Tandem Source (sync and account), the Pump profile and the
// Glossary. No preferences the engine doesn't have.
//
// The root is one grouped list: Tandem Source with its sync state inline
// ("⚠ Failed" when the last sync failed, else OK), the Pump profile with its
// served name, and the Glossary, each a row that drills down (§2.2) under
// "‹ Settings". A failed sync also puts the "!" on the NavBar's Settings item
// (§1.1); sync state shows nowhere else (§1.2).
//
// Tandem Source: the sync rows (state, last success, last attempt, the
// engine's error, the data's span), then the account rows: the email as the
// generator masks it, the region, and Password as "Set" or "Not set" with a
// compact Update, never the secret itself. Update opens the account form the
// engine accepts (POST /api/credentials: email and password, the region kept):
// on phone a bottom sheet, on desktop a popover under Update, with Save its
// one primary; it saves, then closes, the account then set. Escape, or the
// scrim on phone, closes it unsaved.
//
// Pump profile: the active profile's name and when it was read, DIA, Max bolus
// and Target, then its segments as a dense table (start, basal, ISF, I:C) that
// never scrolls on its own; "No profile" when none is served. Glossary: §1.5's
// terms, alphabetical, each with its one-line definition, the one place a
// sentence appears (§2.3).
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar. Desktop: the rail and one pane, the drill-down inside it; the pane
// scrolls as a whole.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fixtures, sourced } from '../../fixtures';
import { Num } from '../../Num';
import {
  glossary, pumpProfile, tandemSource, type AccountState, type SyncState, type When,
} from '../../settings-model';
import { Button } from '../../components/Button/Button';
import { ListGroup, ListRow, ListRowDense } from '../../components/ListRow/ListRow';
import { NavBar } from '../../components/NavBar/NavBar';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import '../../shared.css';
import './SettingsScreen.css';

type Layout = 'phone' | 'desktop';
export type SettingsView = 'root' | 'tandem' | 'profile' | 'glossary';
type PumpStore = 'wearer' | 'wearer-unsynced';

export type SettingsScreenProps = {
  layout: Layout;
  /** The served sync state; null before any sync was attempted. */
  sync: SyncState | null;
  account: AccountState;
  /** Whose pump profile is served: the wearer's, or none. */
  pump?: PumpStore;
  /** The screen open first. */
  view?: SettingsView;
  /** Start with the account form open. */
  updating?: boolean;
};

/** How long a save is shown busy before it settles. */
const SAVE_MS = 600;
const TITLES: Record<SettingsView, string> = {
  root: 'Settings', tandem: 'Tandem Source', profile: 'Pump profile', glossary: 'Glossary',
};
const dayCount = sourced<number>('prompts[answer=null].length');

const DateTime = ({ at }: { at: When }) => <><Num value={at.date} /> <Num value={at.time} /></>;

// Column headers are the glossary's short forms (Basal, ISF, I:C) over the
// served units, so a header holds two short lines on a phone.
const units = (parameter: string) =>
  fixtures.queue.wearer.guidance.candidates.find((c) => c.subject === `setting:${parameter}`)!.units;
const Head = ({ parameter, label }: { parameter: string; label: string }) => (
  <span className="ui-caption">{label}<br /><span className="ui-settings__unit">{units(parameter)}</span></span>
);

function Root({ sync, pump, onOpen }: { sync: SyncState | null; pump: PumpStore; onOpen: (view: SettingsView) => void }) {
  const source = tandemSource(sync, 'set');
  const profile = pumpProfile(pump);
  return (
    <ListGroup>
      <ListRow label="Tandem Source" value={source.failed === null ? undefined : source.failed ? 'Failed' : 'OK'}
        alert={Boolean(source.failed)} onOpen={() => onOpen('tandem')} />
      <ListRow label="Pump profile" value={profile?.name ?? 'No profile'} onOpen={() => onOpen('profile')} />
      <ListRow label="Glossary" onOpen={() => onOpen('glossary')} />
    </ListGroup>
  );
}

function TandemSource({ sync, account, form, onUpdate }: {
  sync: SyncState | null; account: AccountState; form: ReactNode; onUpdate: () => void;
}) {
  const source = tandemSource(sync, account);
  return (
    <>
      {(source.failed !== null || source.data) && (
        <ListGroup>
          {source.failed !== null && <ListRow label="State" value={source.failed ? 'Failed' : 'OK'} alert={source.failed} />}
          {source.lastSuccess && <ListRow label="Last success" value={<DateTime at={source.lastSuccess} />} />}
          {source.lastAttempt && <ListRow label="Last attempt" value={<DateTime at={source.lastAttempt} />} />}
          {source.error && <ListRow label="Error" value={source.error} />}
          {source.data && (
            <ListRow label="Data" value={<><Num value={source.data.from} /> – <Num value={source.data.to} /> · <Num value={source.data.days} /> d</>} />
          )}
        </ListGroup>
      )}
      <ListGroup>
        <ListRow label="Email" value={source.account.email ?? 'Not set'} />
        {source.account.region && <ListRow label="Region" value={source.account.region} />}
        <div className="ui-settings__anchor">
          <ListRow label="Password" value={source.account.configured ? 'Set' : 'Not set'}
            action={{ label: 'Update', onAction: onUpdate }} />
          {form}
        </div>
      </ListGroup>
    </>
  );
}

function PumpProfile({ pump }: { pump: PumpStore }) {
  const data = pumpProfile(pump);
  if (!data) return <p className="ui-settings__none">No profile</p>;
  return (
    <>
      <ListGroup>
        <ListRow label={data.name} value={<DateTime at={data.fetched} />} />
        <ListRow label="DIA" value={<><Num value={data.dia} /> h</>} />
        <ListRow label="Max bolus" value={<><Num value={data.maxBolus} /> U</>} />
        <ListRow label="Target" value={<><Num value={data.target} /> mg/dL</>} />
      </ListGroup>
      <ListGroup columns="56px 1fr 1fr 1fr">
        <ListRowDense header cells={[<span className="ui-caption">Start</span>, <Head parameter="basal_rate" label="Basal" />,
          <Head parameter="isf" label="ISF" />, <Head parameter="carb_ratio" label="I:C" />]} />
        {data.segments.map((segment) => (
          <ListRowDense key={segment.start.source} cells={[<Num value={segment.start} />, <Num value={segment.basal} />,
            <Num value={segment.isf} />, <Num value={segment.carbRatio} />]} />
        ))}
      </ListGroup>
    </>
  );
}

function Glossary() {
  return (
    <ListGroup glossary>
      {glossary().map((entry) => <ListRow key={entry.term} label={entry.term} definition={entry.meaning} />)}
    </ListGroup>
  );
}

/** The account form: the email and password the engine takes, and Save. */
function AccountForm({ saving, onSave }: { saving: boolean; onSave: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <>
      <h2 className="ui-settings__form-title">Tandem Source</h2>
      <ListGroup>
        <ListRow label="Email" field={{ kind: 'email', onChange: setEmail, disabled: saving, focused: true }} />
        <ListRow label="Password" field={{ kind: 'password', onChange: setPassword, disabled: saving }} />
      </ListGroup>
      <div className="ui-settings__form-foot">
        <Button kind="primary" label="Save" disabled={!email || !password} busy={saving} onClick={onSave} />
      </div>
    </>
  );
}

export function SettingsScreen({
  layout, sync, account, pump = 'wearer', view: initialView = 'root', updating = false,
}: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView>(initialView);
  const [form, setForm] = useState<'open' | 'saving' | null>(updating ? 'open' : null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shownAccount: AccountState = saved ? 'set' : account;
  const failed = tandemSource(sync, shownAccount).failed === true;

  const save = () => {
    setForm('saving');
    timer.current = window.setTimeout(() => { setForm(null); setSaved(true); }, SAVE_MS);
  };
  const close = () => setForm((now) => (now === 'saving' ? now : null));

  useEffect(() => {
    if (form === null) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const header = view === 'root'
    ? <ScreenHeader title="Settings" layout={layout} />
    : <ScreenHeader title={TITLES[view]} layout={layout} back={{ label: 'Settings', onBack: () => { setForm(null); setView('root'); } }} />;

  const popover = layout === 'desktop' && form !== null && (
    <section className="ui-popover ui-popover--end ui-settings__form ui-settings__form--desktop" role="dialog"
      aria-label="Tandem Source">
      <AccountForm saving={form === 'saving'} onSave={save} />
    </section>
  );

  const content = {
    root: <Root sync={sync} pump={pump} onOpen={setView} />,
    tandem: <TandemSource sync={sync} account={shownAccount} form={popover} onUpdate={() => setForm('open')} />,
    profile: <PumpProfile pump={pump} />,
    glossary: <Glossary />,
  }[view];

  if (layout === 'phone') {
    return (
      <div className="ui-settings ui-settings--phone">
        <div className="ui-settings__head">{header}</div>
        <main className="ui-settings__main" data-scroll="page">
          <div className="ui-settings__body">{content}</div>
        </main>
        <NavBar layout="tabbar" selected="settings" dayCount={dayCount} syncFailed={failed} />
        {form !== null && view === 'tandem' && (
          <div className="ui-settings__scrim" onClick={close}>
            <section className="ui-sheet ui-settings__form" role="dialog" aria-label="Tandem Source"
              onClick={(event) => event.stopPropagation()}>
              <span className="ui-sheet__grabber" aria-hidden="true" />
              <AccountForm saving={form === 'saving'} onSave={save} />
            </section>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="ui-settings ui-settings--desktop">
      <NavBar layout="rail" selected="settings" dayCount={dayCount} syncFailed={failed} />
      <section className="ui-settings__pane" data-scroll="page">
        {header}
        <div className="ui-settings__body">{content}</div>
      </section>
    </div>
  );
}
