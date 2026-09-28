## ADDED Requirements

### Requirement: A reassessment of an ended Trial reads evidence only up to its ending instant

A requested Retained context or Current policy reassessment of a Trial record
whose ending carries a kind SHALL be computed with its data cutoff at the
ending's effective instant, or at the read's own data instant if that is
earlier. Its Before and Trial periods SHALL NOT extend past that cutoff. A
Current policy reassessment SHALL capture its context from the pump read as of
that cutoff. A retained context that is available and whose source pump read
was captured after the cutoff, or that names no source pump read, SHALL answer
unavailable with reason `context_after_ending` through the comparison's own
unavailable envelope, for a saved ending and a Retained reassessment alike. A
reassessment of a record with no ending SHALL read to the data tail as before.

#### Scenario: A superseded record's reassessments stop at its ending

- **GIVEN** the `c4-ic` case, whose older carb-ratio record ended superseded at a
  later detected change
- **WHEN** that record is read with a Retained context and then a Current policy
  reassessment
- **THEN** each reassessment's Trial period ends at or before the record's ending
  instant

#### Scenario: A late-context record answers Current policy and refuses Retained

- **GIVEN** the `c4-isf-late-read` case, whose record's saved ending is
  unavailable with reason `context_after_ending`
- **WHEN** that record is read with each reassessment
- **THEN** the Current policy reassessment is available with both periods, its
  Trial period ends at or before the ending, and its context's source pump read
  was captured at or before the ending
- **AND** the Retained context reassessment is unavailable with reason
  `context_after_ending`

#### Scenario: An open record still reads to the data tail

- **GIVEN** a record with no ending
- **WHEN** it is read with a Retained context reassessment
- **THEN** its Trial period ends at the data tail

### Requirement: A retained comparison context stays readable across Harmonic updates

A retained comparison context SHALL carry its context version, the comparison's
policy stamp and the scenario configuration, and SHALL NOT carry a hash of the
installed source files. The comparison SHALL refuse a retained context with
reason `unsupported_retained_execution` only when its context version, policy
stamp or scenario configuration differs from the running comparison's. A
context saved with a source-file hash SHALL be read with that field ignored. The
store SHALL accept an available comparison context without a source-file hash.

#### Scenario: A context captured before an unrelated code change is read

- **GIVEN** a retained context whose source-file hash differs from what the
  running build would compute, or that carries none
- **WHEN** the record is read with a Retained context reassessment
- **THEN** the reassessment is available

#### Scenario: A changed comparison policy is still refused

- **GIVEN** a retained context whose policy stamp or scenario configuration
  differs from the running comparison's
- **WHEN** the record is read with a Retained context reassessment
- **THEN** it is unavailable with reason `unsupported_retained_execution`

### Requirement: A saved ending keeps its clock envelope

An ending the reconcile or a reader saves SHALL keep its comparison's clock bins
for both periods (`views.before.clock` and `views.after.clock`) on its saved
assessment, and SHALL keep no other part of the comparison's views. An ending
saved before this requirement SHALL keep what it saved.

#### Scenario: A reconciled ending saves both clock envelopes

- **GIVEN** a retained Trial record that a reconcile ends with an available
  assessment
- **WHEN** its saved ending is read back
- **THEN** its assessment carries the Before and Trial clock bins the comparison
  computed, and no other view

### Requirement: A delivery-detected change is dated at its new value's first observation

A Trial detected from dose-stamped boluses SHALL start at the first bolus of its
first settled day that carries the new value, and a basal slot Trial detected
from the delivery feed SHALL start at the first sample of its first settled day
that carries the new rate. The settled-day reduction SHALL be unchanged. A
delivery-detected change SHALL keep an existing retained record, its change time
and its id, only when the record's parameter, slot and block match, its before
and after values match wherever it carries them, and its change time equals, to
the second, the date the earlier dating gives the change: the first observation
of its first settled day, or for a whole-profile change the latest of its parts'
such dates, computed from the same data. Each retained record SHALL be kept by
one change at most. A record whose change time is a pump-read switch instant,
reverted switches included, SHALL NOT be kept by a delivery-detected change. A
kept record's comparison SHALL find its setting history, and its reversal SHALL
still be detected. A change a pump read supplies (an active-profile switch) SHALL
keep its read's instant. No retained record SHALL be rewritten. The analyzer's setting epochs SHALL be unchanged.

#### Scenario: A mid-morning edit is dated at the first bolus carrying it

- **GIVEN** a correction-factor and carb-ratio edit made mid-morning, where the
  day's first bolus carries the old values and later boluses the new ones
- **WHEN** the Trial is read
- **THEN** its change time is the first bolus carrying the new values

#### Scenario: Two whole-profile switches on one day are two records

- **GIVEN** a whole-profile switch recorded at 08:00 and a second whole-profile
  switch read at 18:00 the same day
- **WHEN** a reconcile runs
- **THEN** there are two records, one at each switch's read

#### Scenario: Two whole-profile changes seen only in delivery history on one day are two records

- **GIVEN** a whole-profile change seen only in delivery history recorded at
  06:00, and a second whole-profile change seen only in delivery history at
  20:00 the same day, derived by a later reconcile
- **WHEN** that reconcile runs
- **THEN** there are two records, at 06:00 and at 20:00, and the 06:00 record
  keeps its time and id

#### Scenario: An in-place edit after a reverted switch is a record of its own

- **GIVEN** a whole-profile switch recorded at 08:00 and walked back at 10:00, and
  an in-place edit of basal and target seen only in delivery history at 20:30
  the same day
- **WHEN** a later reconcile runs
- **THEN** the edit is a record of its own at 20:30, and the switch's record keeps
  its 08:00 time

#### Scenario: A record off the earlier dating's date is not kept

- **GIVEN** a retained correction-factor record dated at 09:00 on a day whose
  first bolus, at 08:00, still carried the old value, and a change first seen at
  12:30
- **WHEN** a reconcile runs
- **THEN** the change is a record of its own at 12:30, and the 09:00 record is
  unchanged

#### Scenario: A record saved under the old dating stays one record

- **GIVEN** a retained record dated at the day's first observation of its change
  day, before this requirement, which is exactly the date the earlier dating
  gives the change
- **WHEN** a reconcile runs and the record is read with a Retained context
  reassessment
- **THEN** there is still one record for the change, with its id and change time
  unchanged, and its reassessment does not answer
  `missing_continuous_setting_history`

### Requirement: A Trial matched to a Plan serves the Plan's decision

A Trial record whose reconciliation receipt names a Plan SHALL serve that Plan's
decision context as its original context when that context is available, and its
observed context otherwise.

#### Scenario: A matched Trial names its Plan's decision

- **GIVEN** a Trial record matched to a Plan whose decision context is available
- **WHEN** the record is read
- **THEN** its original context is the Plan's decision context, with its action
