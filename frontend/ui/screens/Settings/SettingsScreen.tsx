// The Settings screen (§1.1, §1.2, §1.3), composed only from the library's
// components: Tandem Source (sync and account), the Pump profile and the
// Glossary, and the Token field. No preferences the engine doesn't have.
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
// Live (`writes`, #495): Save posts the account and waits on it, busy; once
// saved, the form closes and the rows show what the engine then serves. A Save
// that fails leaves the form open with what was typed, and "Not saved" with
// Retry in the bar.
//
// Token (§2.5, 2026-10-14): under the root list, the API token the server was
// started with, as a password field, and Save, its one primary. Save keeps it
// through the one client (data.js) and reads the app again (`onToken`). It
// shows in Loading and Unavailable too: a browser without the token reads
// nothing, and this is where it is entered.
//
// Loading draws progressively. Until the sync status lands, the screen is its
// title over a skeleton of the root list; when it cannot be read, its title,
// Unavailable and Retry (§2.5, 2026-10-13), as on every other screen. Once it
// lands the root's three rows show, and the two reads that take longer fill in
// as they arrive (`parts`): the Pump profile row's name, and each drill-down's
// own data. Only a part not yet read is a skeleton; a part that cannot be read
// shows Unavailable and Retry in its own drill-down's header. The Glossary and
// the sync rows wait on nothing else.
//
// Phone: the header stays put while the page scrolls under it, above the tab
// bar. Desktop: the rail and one pane, the drill-down inside it; the pane
// scrolls as a whole.
//
// Motion: each drill-down pushes in from the right and back from the left;
// the account form's sheet rises, and its popover opens out of its arrow.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { answers, sourced } from '../../answers';
import { saveToken } from '../../../data.js';
import { useMotionGate, usePresence } from '../../motion';
import { Num } from '../../Num';
import {
  glossary, pumpProfile, tandemSource, PARAMETER_UNITS, type AccountState, type SyncState, type When,
} from '../../settings-model';
import { Button } from '../../components/Button/Button';
import { ListGroup, ListRow, ListRowDense } from '../../components/ListRow/ListRow';
import { NavBar, type NavHooks } from '../../components/NavBar/NavBar';
import { ScreenHeader } from '../../components/ScreenHeader/ScreenHeader';
import { TransientBar } from '../../components/TransientBar/TransientBar';
import '../../shared.css';
import './SettingsScreen.css';

type Layout = 'phone' | 'desktop';
export type SettingsView = 'root' | 'tandem' | 'profile' | 'glossary';
type PumpStore = 'wearer' | 'wearer-unsynced';
/** `stale`: an earlier read's answers, since reading them again failed (§2.5, 2026-10-14). */
type Read = 'ready' | 'loading' | 'unavailable' | 'stale';
/** The reads the root's rows wait on after the sync status: the account and the pump profile. */
export type SettingsParts = { account: Read; pump: Read; onRetry: (part: 'account' | 'pump') => void };

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
  /** The live engine's account write: resolves once the answers are read again, rejects when not saved. */
  writes?: { saveCredentials: (email: string, password: string) => Promise<void> };
  /** Where a tab goes; the Settings alert is this screen's own. */
  nav?: Pick<NavHooks, 'onSelect'>;
  /** The sync status, which the root's first row and the screen's frame wait on. */
  state?: Read;
  /** Where each part past the status is; every part is ready when absent. */
  parts?: SettingsParts;
  /** Unavailable's Retry. */
  onRetry?: () => void;
  /** After the Token field's Save has kept the token: read the app again. */
  onToken?: () => void;
};

/** The API token the server was started with, and Save. */
function TokenField({ onToken }: { onToken?: () => void }) {
  const [token, setToken] = useState('');
  return (
    <div className="ui-settings__token">
      <ListGroup>
        <ListRow label="Token" field={{ kind: 'password', onChange: setToken }} />
      </ListGroup>
      <div className="ui-settings__form-foot">
        <Button kind="primary" label="Save" disabled={!token}
          onClick={() => { saveToken(token); onToken?.(); }} />
      </div>
    </div>
  );
}

/** Loading (a skeleton of the root list) or Unavailable (the title, the label
 *  and Retry): nothing read from the answers. */
function Frame({ layout, state, nav, onRetry, onToken }: {
  layout: Layout; state: 'loading' | 'unavailable'; nav?: Pick<NavHooks, 'onSelect'>; onRetry?: () => void;
  onToken?: () => void;
}) {
  const header = state === 'unavailable'
    ? <ScreenHeader title="Settings" trailing="unavailable" layout={layout} onRetry={onRetry} />
    : <ScreenHeader title="Settings" layout={layout} />;
  const body = (
    <>
      {state === 'loading' && <span className="ui-skeleton ui-settings__skeleton" aria-hidden="true" />}
      <TokenField onToken={onToken} />
    </>
  );
  if (layout === 'phone') {
    return (
      <div className="ui-settings ui-settings--phone">
        <div className="ui-settings__head">{header}</div>
        <main className="ui-settings__main" data-scroll="page"><div className="ui-settings__body">{body}</div></main>
        <NavBar layout="tabbar" selected="settings" dayCount={dayCount()} {...nav} />
      </div>
    );
  }
  return (
    <div className="ui-settings ui-settings--desktop">
      <NavBar layout="rail" selected="settings" dayCount={dayCount()} {...nav} />
      <section className="ui-settings__pane" data-scroll="page">
        {header}
        <div className="ui-settings__body">{body}</div>
      </section>
    </div>
  );
}

export function SettingsScreen(props: SettingsScreenProps) {
  if (props.state === 'loading' || props.state === 'unavailable') {
    return <Frame layout={props.layout} state={props.state} nav={props.nav} onRetry={props.onRetry} onToken={props.onToken} />;
  }
  return <Settings {...props} />;
}

/** How long a save is shown busy before it settles. */
const SAVE_MS = 600;
const TITLES: Record<SettingsView, string> = {
  root: 'Settings', tandem: 'Tandem Source', profile: 'Pump profile', glossary: 'Glossary',
};
const dayCount = () => sourced<number>('prompts[answer=null].length');

const DateTime = ({ at }: { at: When }) => <><Num value={at.date} /> <Num value={at.time} /></>;

// Column headers are the glossary's short forms (Basal, ISF, I:C) over the
// served units, so a header holds two short lines on a phone.
const Head = ({ parameter, label }: { parameter: keyof typeof PARAMETER_UNITS; label: string }) => (
  <span className="ui-caption">{label}<br /><span className="ui-settings__unit">{PARAMETER_UNITS[parameter]}</span></span>
);

/** A part not yet read: a block in its place, as tall as what will fill it. */
const Pending = ({ rows }: { rows: number }) => (
  <span className="ui-skeleton" style={{ height: rows * 48 }} aria-hidden="true" />
);

function Root({ sync, pump, read, onOpen, onToken }: {
  sync: SyncState | null; pump: PumpStore; read: Read; onOpen: (view: SettingsView) => void; onToken?: () => void;
}) {
  const source = tandemSource(sync, 'set');
  const name = read === 'ready' ? pumpProfile(pump)?.name ?? 'No profile'
    : read === 'loading' ? <span className="ui-skeleton ui-settings__skeleton-value" aria-hidden="true" /> : undefined;
  return (
    <>
      <ListGroup>
        <ListRow label="Tandem Source" value={source.failed === null ? undefined : source.failed ? 'Failed' : 'OK'}
          alert={Boolean(source.failed)} onOpen={() => onOpen('tandem')} />
        <ListRow label="Pump profile" value={name} onOpen={() => onOpen('profile')} />
        <ListRow label="Glossary" onOpen={() => onOpen('glossary')} />
      </ListGroup>
      <TokenField onToken={onToken} />
    </>
  );
}

function TandemSource({ sync, account, read, form, onUpdate }: {
  sync: SyncState | null; account: AccountState; read: Read; form: ReactNode; onUpdate: () => void;
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
      {read === 'loading' && <Pending rows={3} />}
      {read === 'ready' && (
        <ListGroup>
          <ListRow label="Email" value={source.account.email ?? 'Not set'} />
          {source.account.region && <ListRow label="Region" value={source.account.region} />}
          <div className="ui-settings__anchor">
            <ListRow label="Password" value={source.account.configured ? 'Set' : 'Not set'}
              action={{ label: 'Update', onAction: onUpdate }} />
            {form}
          </div>
        </ListGroup>
      )}
    </>
  );
}

function PumpProfile({ pump, read }: { pump: PumpStore; read: Read }) {
  if (read === 'loading') return <Pending rows={9} />;
  if (read === 'unavailable') return null;
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
function AccountForm({ saving, onSave }: { saving: boolean; onSave: (email: string, password: string) => void }) {
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
        <Button kind="primary" label="Save" disabled={!email || !password} busy={saving}
          onClick={() => onSave(email, password)} />
      </div>
    </>
  );
}

function Settings({
  layout, sync, account, pump = 'wearer', view: initialView = 'root', updating = false, writes, nav, onToken,
  parts = { account: 'ready', pump: 'ready', onRetry: () => undefined }, state, onRetry,
}: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView>(initialView);
  const root = useMotionGate<HTMLDivElement>();
  const push = view === 'root' ? 'back' : 'forward';
  const [form, setForm] = useState<'open' | 'saving' | null>(updating ? 'open' : null);
  const [saved, setSaved] = useState(false);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const shownAccount: AccountState = saved ? 'set' : account;
  const failed = tandemSource(sync, shownAccount).failed === true;

  const [notSaved, setNotSaved] = useState<{ retry: () => void } | null>(null);
  const save = (email: string, password: string) => {
    setForm('saving');
    setNotSaved(null);
    if (writes) {
      writes.saveCredentials(email, password).then(() => setForm(null), () => {
        setForm('open');
        setNotSaved({ retry: () => save(email, password) });
      });
      return;
    }
    timer.current = window.setTimeout(() => { setForm(null); setSaved(true); }, SAVE_MS);
  };
  const close = () => setForm((now) => (now === 'saving' ? now : null));

  useEffect(() => {
    if (form === null) return undefined;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ownPart = view === 'tandem' ? 'account' : view === 'profile' ? 'pump' : null;
  const header = view === 'root'
    ? state === 'stale'
      ? <ScreenHeader key={view} title="Settings" trailing="unavailable" layout={layout} onRetry={onRetry} />
      : <ScreenHeader key={view} title="Settings" layout={layout} />
    : <ScreenHeader key={view} title={TITLES[view]} layout={layout}
      back={{ label: 'Settings', onBack: () => { setForm(null); setView('root'); } }}
      {...(ownPart && (parts[ownPart] === 'unavailable' || parts[ownPart] === 'stale')
        ? { trailing: 'unavailable' as const, onRetry: () => parts.onRetry(ownPart) } : {})} />;

  // The account form stays while it closes, as it last showed.
  const formShown = usePresence(form);
  const popover = layout === 'desktop' && formShown.value && (
    <section className="ui-popover ui-popover--end ui-settings__form ui-settings__form--desktop" role="dialog"
      aria-label="Tandem Source" {...formShown.exit}>
      <AccountForm saving={formShown.value === 'saving'} onSave={save} />
    </section>
  );

  const content = {
    root: <Root sync={sync} pump={pump} read={parts.pump} onOpen={setView} onToken={onToken} />,
    tandem: <TandemSource sync={sync} account={shownAccount} read={parts.account} form={popover}
      onUpdate={() => setForm('open')} />,
    profile: <PumpProfile pump={pump} read={parts.pump} />,
    glossary: <Glossary />,
  }[view];

  const barShown = usePresence(notSaved);
  const bar = barShown.value && (
    <div className="ui-settings__bar" {...barShown.exit}>
      <TransientBar kind="not_saved" onRetry={barShown.value.retry} layout={layout} />
    </div>
  );

  if (layout === 'phone') {
    return (
      <div ref={root} className="ui-settings ui-settings--phone">
        <div className="ui-settings__head" data-push={push}>{header}</div>
        <main className="ui-settings__main" data-scroll="page" data-push={push}>
          <div key={`${view}-body`} className="ui-settings__body ui-push">{content}</div>
        </main>
        {bar}
        <NavBar layout="tabbar" selected="settings" dayCount={dayCount()} {...nav} syncFailed={failed} />
        {formShown.value && view === 'tandem' && (
          <div className="ui-scrim ui-settings__scrim" onClick={close} {...formShown.exit}>
            <section className="ui-sheet ui-settings__form" role="dialog" aria-label="Tandem Source"
              onClick={(event) => event.stopPropagation()}>
              <span className="ui-sheet__grabber" aria-hidden="true" />
              <AccountForm saving={formShown.value === 'saving'} onSave={save} />
            </section>
          </div>
        )}
      </div>
    );
  }
  return (
    <div ref={root} className="ui-settings ui-settings--desktop">
      <NavBar layout="rail" selected="settings" dayCount={dayCount()} {...nav} syncFailed={failed} />
      <section className="ui-settings__pane" data-scroll="page" data-push={push}>
        {header}
        <div key={`${view}-body`} className="ui-settings__body ui-push">{content}</div>
        {bar}
      </section>
    </div>
  );
}
