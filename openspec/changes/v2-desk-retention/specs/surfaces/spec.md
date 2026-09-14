## ADDED Requirements

### Requirement: Diagnose is retained across destination changes

The v2 desk SHALL keep the Diagnose workstation mounted across navigation to
Changes and Day, detaching and re-seating its root rather than tearing it down.
A return to Diagnose SHALL issue no served read and SHALL retain the reader's
selected window, drilled subject and reading scroll. The desk SHALL re-read only
on Retry, on a contextual entry naming a different subject, or when the server's
last written instant differs from the one read at the last Diagnose read. A
failed re-read SHALL replace the retained desk with the existing error frame and
SHALL NOT present the retained result as new.

#### Scenario: A tab round trip fires no read and keeps the window

- **GIVEN** Diagnose is open on the 24 h window with a drilled finding
- **WHEN** the reader opens Changes and returns to Diagnose
- **THEN** no served read is issued
- **AND** the 24 h window, the drilled finding and the reading scroll are as left

#### Scenario: A server write since the last read triggers one re-read

- **GIVEN** Diagnose was read before the hourly fetch wrote
- **WHEN** the reader returns to Diagnose
- **THEN** the desk issues one guidance read and shows the loading frame
- **AND** the retained result is not shown as current meanwhile

### Requirement: The trials roster read is bounded per record and serves episodes

The trials roster read SHALL read only the readings inside each retained
record's own window, once per record, and SHALL return the same maturity and
data-gap facts as an unbounded read. Every trial roster row SHALL carry a served
`episode` key, and the roster SHALL carry an `episodes` summary; records SHALL
chain into one episode when each change instant lies within the detector's
one-day profile tolerance of the previous record in time order. The roster SHALL
serve a reader word for each watch disposition beside its token.

#### Scenario: Two records one day apart share an episode; one minute past does not

- **GIVEN** three retained records whose change instants are 0, 24 h and 48 h 1 min
- **WHEN** the roster is read
- **THEN** the first two carry one episode key and the third another

### Requirement: Changes lists records by episode and names its loading

Changes SHALL list one entry per served episode with its member records beneath,
each member keeping its exact record route, ending and late conclusion. The
entry's Ended cell SHALL show the shared ending when every member agrees and the
member counts otherwise. The Still open cell SHALL print the served disposition
word, never the token. The loading frame SHALL name the roster read and a
reassessment while each is pending.

#### Scenario: An editing episode reads as one entry

- **GIVEN** a synthetic store with a two-day chain of per-slot records and one
  single record a week earlier
- **WHEN** the reader opens View change record
- **THEN** the roster shows two entries, the first with its member rows beneath
- **AND** opening a member opens that exact record
