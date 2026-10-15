import type { Meta, StoryObj } from '@storybook/react-vite';
import { Num } from '../../Num';
import { glossary, pumpProfile, tandemSource, type When } from '../../settings-model';
import { ListGroup, ListRow, ListRowDense } from './ListRow';

// §4.2 ListRow in each of its states: navigable, read-only, with an alert,
// with a secondary button, a served detail beneath the label, a Glossary term, the
// dense row of the Pump profile's segment table, and a form's field rows.
// Every value is the simulated wearer's served answer. The Settings screens
// built from these rows are Screens/Settings.
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
// Detail: the failed sync's Error row, its served label inline and its raw
// text beneath, wrapped inside the row.
export const Detail: Story = {
  args: { label: 'Error', value: <Num value={failed.error!.label} />, detail: <Num value={failed.error!.text} /> },
};
export const GlossaryTerm: Story = {
  render: () => {
    const entry = glossary().find((e) => e.term === 'Snooze')!;
    return <ListGroup glossary><ListRow label={entry.term} definition={entry.meaning} /></ListGroup>;
  },
};

// Dense: the Pump profile's segment table, its first three segments.
const profileSegments = profile.segments.slice(0, 3);
export const Dense: Story = {
  render: () => (
    <ListGroup columns="56px 1fr 1fr 1fr">
      <ListRowDense header cells={[<span className="ui-caption">Start</span>, <span className="ui-caption">Basal</span>,
        <span className="ui-caption">ISF</span>, <span className="ui-caption">I:C</span>]} />
      {profileSegments.map((segment) => (
        <ListRowDense key={segment.start.source} cells={[<Num value={segment.start} />, <Num value={segment.basal} />,
          <Num value={segment.isf} />, <Num value={segment.carbRatio} />]} />
      ))}
    </ListGroup>
  ),
};

// A form's rows: the account the engine takes, each label naming its input.
export const Field: Story = {
  render: () => (
    <ListGroup>
      <ListRow label="Email" field={{ kind: 'email', focused: true }} />
      <ListRow label="Password" field={{ kind: 'password' }} />
    </ListGroup>
  ),
};
