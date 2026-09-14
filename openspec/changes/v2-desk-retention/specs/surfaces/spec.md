## ADDED Requirements

### Requirement: Diagnose is retained across destination changes

The v2 desk SHALL keep the Diagnose workstation mounted across navigation to
Changes and Day, detaching and re-seating its root rather than tearing it down.
A return to Diagnose SHALL issue no guidance or evidence read and SHALL retain
the reader's selected window, drilled subject and reading scroll. The desk SHALL
re-read only on Retry, on a contextual entry whose subject, occurrence or window
differs from the retained entry, or when one status read on return shows
`/api/status.input_revision` differing from the `input_data_age.revision` the
retained analysis payload carried. That status read SHALL be the only request a
retained return issues. A
failed re-read SHALL replace the retained desk with the existing error frame and
SHALL NOT present the retained result as new.

#### Scenario: A tab round trip fires no read and keeps the window

- **GIVEN** Diagnose is open on the 24 h window with a drilled finding
- **WHEN** the reader opens Changes and returns to Diagnose
- **THEN** the only request issued is one status read
- **AND** the 24 h window, the drilled finding and the reading scroll are as left

#### Scenario: A store write since the last read triggers one re-read

- **GIVEN** Diagnose was read before a fetch or an in-app write (a finished
  Trial, an applied Plan) advanced the input revision
- **WHEN** the reader returns to Diagnose
- **THEN** the desk issues one guidance read and shows the loading frame
- **AND** the retained result is not shown as current meanwhile

### Requirement: The trials roster read is bounded per record and serves edits

The trials roster read SHALL read only the readings inside each retained
record's own window, once per record, and SHALL return the same maturity and
data-gap facts as an unbounded read. Every retained trial roster row SHALL carry
a served `edit` key, and the roster SHALL carry an `edits` summary (key, first
and last change instants, member count, and `parameters` as an ordered list of
`{parameter, count}`); retained records SHALL
chain into one edit when each change instant lies within the detector's one-day
profile tolerance of the previous retained record in time order.
Detected-but-unretained trial rows and Focus records SHALL carry no key. The
status endpoint SHALL serve `input_revision`, the store's input data revision.

#### Scenario: Two records one day apart share an edit; one minute past does not

- **GIVEN** three retained records whose change instants are 0, 24 h and 48 h 1 min
- **WHEN** the roster is read
- **THEN** the first two carry one edit key and the third another

### Requirement: Changes lists records by edit and names its loading

Changes SHALL list one entry per served edit of two or more members with its
member records beneath, each member keeping its exact record route, ending and
late conclusion. The entry SHALL be titled by its member count ("<count>
setting changes") with the served parameters rendered as setting names with
counts as its detail and the first-to-last change span as its stamp; its Ended
cell SHALL show the shared ending when every member agrees and "<n> ended ·
<m> open" otherwise. A one-member edit and every row with no served key SHALL
keep the flat row form in the same time order. The Still open cell SHALL print the status
word table's entry for the disposition, never the token. The loading frame SHALL name the roster read and a
reassessment while each is pending.

#### Scenario: A pass of edits on the pump reads as one entry

- **GIVEN** a synthetic store with a two-day chain of per-slot records and one
  single record a week earlier
- **WHEN** the reader opens View change record
- **THEN** the roster shows one entry titled by its member count with its member rows beneath, and one flat row for the lone record
- **AND** opening a member opens that exact record
