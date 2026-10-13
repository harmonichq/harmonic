import type { Meta, StoryObj } from '@storybook/react-vite';
import { fixtures } from '../../fixtures';
import { Num } from '../../Num';
import {
  glossary, pumpProfile, tandemSource, type AccountState, type SyncState, type When,
} from '../../settings-model';
import type { ReactNode } from 'react';
import { ScreenHeader } from '../ScreenHeader/ScreenHeader';
import { ListGroup, ListRow, ListRowDense } from './ListRow';

// §4.2 ListRow, first in each of its states (navigable, read-only, with an
// alert, with a secondary button, and a Glossary term), then the Settings
// screens built from it (§1.3 and the brief's Settings section): the root
// list with sync OK and failed; Tandem Source synced, failed and with no
// account; the Pump profile with its dense segment table, and with none; the
// Glossary; and desktop. The account's email is masked by the generator, and
// every value is the simulated wearer's served answer. Each Settings
// sub-screen is a drill-down (§2.2): "‹ Settings" above its title.
const meta: Meta<typeof ListRow> = {
  title: 'ListRow',
  component: ListRow,
  parameters: { frame: { width: 390 } },
};
export default meta;

type Story = StoryObj<typeof ListRow>;

const failed = tandemSource('failed', 'set');
const profile = pumpProfile('wearer')!;
const lastAttempt = failed.lastAttempt!;
const DateTime = ({ at }: { at: When }) => <><Num value={at.date} /> <Num value={at.time} /></>;

export const Navigable: Story = { args: { label: 'Pump profile', value: profile.name, onOpen: () => {} } };
export const ReadOnly: Story = { args: { label: 'Last attempt', value: <DateTime at={lastAttempt} /> } };
export const WithAlert: Story = { args: { label: 'Tandem Source', value: 'Failed', alert: true, onOpen: () => {} } };
export const WithButton: Story = { args: { label: 'Password', value: 'Set', action: { label: 'Update' } } };
export const DisclosureClosed: Story = {
  args: { label: 'Pump profile', value: profile.name, disclosure: { expanded: false } },
};
export const DisclosureOpen: Story = {
  args: { label: 'Pump profile', value: profile.name, disclosure: { expanded: true } },
};
export const GlossaryTerm: Story = {
  render: () => {
    const entry = glossary().find((e) => e.term === 'Snooze')!;
    return <ListGroup glossary><ListRow label={entry.term} definition={entry.meaning} /></ListGroup>;
  },
};

function SettingsRoot({ sync }: { sync: SyncState }) {
  const source = tandemSource(sync, 'set');
  return (
    <ListGroup>
      <ListRow label="Tandem Source" value={source.failed ? 'Failed' : 'OK'} alert={Boolean(source.failed)} onOpen={() => {}} />
      <ListRow label="Pump profile" value={profile.name} onOpen={() => {}} />
      <ListRow label="Glossary" onOpen={() => {}} />
    </ListGroup>
  );
}

function TandemSource({ sync, account }: { sync: SyncState | null; account: AccountState }) {
  const source = tandemSource(sync, account);
  return (
    <>
      {(source.failed !== null || source.data) && (
        <ListGroup>
          {source.failed !== null && (
            <ListRow label="State" value={source.failed ? 'Failed' : 'OK'} alert={source.failed} />
          )}
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
        <ListRow label="Password" value={source.account.configured ? 'Set' : 'Not set'} action={{ label: 'Update' }} />
      </ListGroup>
    </>
  );
}

const setting = (parameter: string) =>
  fixtures.queue.wearer.guidance.candidates.find((c) => c.subject === `setting:${parameter}`)!;
// Column headers are the glossary's short forms (Basal, ISF, I:C) over the
// served units, so a header holds two short lines on a phone.
const Head = ({ parameter, label }: { parameter: string; label: string }) => (
  <span className="ui-caption">{label}<br /><span style={{ textTransform: 'none' }}>{setting(parameter).units}</span></span>
);

function PumpProfile({ store }: { store: 'wearer' | 'wearer-unsynced' }) {
  const data = pumpProfile(store);
  if (!data) return <ListGroup><ListRow label="No profile" /></ListGroup>;
  return (
    <>
      <ListGroup>
        <ListRow label={data.name} value={<Num value={data.fetched} />} />
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

/** A Settings screen: the root under its title, a sub-screen under "‹ Settings". */
function Screen({ title, child = true, children, layout = 'phone' }: {
  title: string; child?: boolean; children: ReactNode; layout?: 'phone' | 'desktop';
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <ScreenHeader title={title} layout={layout} back={child ? { label: 'Settings' } : undefined} />
      <div>{children}</div>
    </div>
  );
}

export const SettingsRootSynced: Story = { render: () => <Screen title="Settings" child={false}><SettingsRoot sync="synced" /></Screen> };
export const SettingsRootFailed: Story = { render: () => <Screen title="Settings" child={false}><SettingsRoot sync="failed" /></Screen> };
export const TandemSourceSynced: Story = { render: () => <Screen title="Tandem Source"><TandemSource sync="synced" account="set" /></Screen> };
export const TandemSourceFailed: Story = { render: () => <Screen title="Tandem Source"><TandemSource sync="failed" account="set" /></Screen> };
export const TandemSourceNotSet: Story = { render: () => <Screen title="Tandem Source"><TandemSource sync={null} account="unset" /></Screen> };
export const PumpProfileSegments: Story = { render: () => <Screen title="Pump profile"><PumpProfile store="wearer" /></Screen> };
export const PumpProfileNone: Story = { render: () => <Screen title="Pump profile"><PumpProfile store="wearer-unsynced" /></Screen> };
export const GlossaryPage: Story = { render: () => <Screen title="Glossary"><Glossary /></Screen> };
export const DesktopTandemSource: Story = {
  render: () => <Screen title="Tandem Source" layout="desktop"><TandemSource sync="failed" account="set" /></Screen>,
  parameters: { frame: { width: 720, padding: 32 } },
};
