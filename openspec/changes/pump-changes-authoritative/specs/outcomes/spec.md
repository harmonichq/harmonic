## ADDED Requirements

### Requirement: A change made on the pump is a Trial whether or not a Plan proposed it

Each pair of consecutive settings reads whose active profile differs SHALL be one
pump change: an active-profile switch, read as the outgoing profile in the later
read against the incoming one, or an in-place edit of the active profile, read
across the two reads. An edit to an inactive profile, and an in-place edit that
moves no value, SHALL NOT be a pump change.
A pump change confined to one setting SHALL be one targeted Trial per time block
it moved, each block's before and after read off the two reads; a block over the
whole day SHALL carry no slot. A carb-ratio Trial SHALL own its block's arc and
member starts, and a basal Trial its block's arc, as its identity and cohort. A pump change of two or more settings,
or one whose outgoing profile the later read no longer holds, SHALL be one
whole-profile Trial. Every such Trial SHALL be dated at the later read. An applied
Plan SHALL NOT be required; an applied Plan group that uniquely matches a
carb-ratio change SHALL only supply its member starts. A pump change whose
blocks exactly undo the preceding pump change's, inside the maturing window,
SHALL close both. No analyzer's staging verdict SHALL change.

#### Scenario: A carb-ratio block switch with no Plan is the active Trial

- **GIVEN** a synthetic store whose two reads switch to a profile that moves only
  the 12:00–15:00 carb ratio from 5.0 to 4.4, with no Plan recorded
- **WHEN** ingestion reconciliation runs
- **THEN** one carb-ratio Trial at 12:00, from 5.0 to 4.4 and dated at the later
  read, is the active watched change, bound to the 12:00–15:00 block

#### Scenario: An in-place edit of the active profile is a Trial

- **GIVEN** two reads of one active profile whose 06:00–09:00 basal rate moves
  from 0.6 to 0.75
- **WHEN** ingestion reconciliation runs
- **THEN** one basal Trial at 06:00 from 0.6 to 0.75, dated at the later read, is
  the active watched change

#### Scenario: A change of two settings is one whole-profile Trial

- **GIVEN** two reads, by switch or in-place edit, that move basal and the
  correction factor together
- **WHEN** ingestion reconciliation runs
- **THEN** one whole-profile Trial dated at the later read is the active watched
  change

#### Scenario: A pump change ends the active Trial

- **GIVEN** an active basal Trial and, five days later, a read whose in-place
  edit moves the 12:00 carb ratio
- **WHEN** ingestion reconciliation runs
- **THEN** the basal record ends `superseded`, effective at that read, and the
  carb-ratio Trial is the active watched change

#### Scenario: A pump change ends the active Focus

- **GIVEN** an active Focus and a later read whose in-place edit moves the 12:00
  carb ratio
- **WHEN** ingestion reconciliation runs
- **THEN** the Focus ends `trial_preempted`, effective at that read, and the
  carb-ratio Trial is the active watched change

#### Scenario: A walk-back still closes both

- **GIVEN** a carb-ratio block change recorded as the active Trial, by switch or
  in-place edit, and a read two days later that restores the earlier schedule
- **WHEN** ingestion reconciliation runs
- **THEN** the record ends `reverted`, effective at the restoring read, no second
  Trial is recorded, and no change is active

#### Scenario: A delivery observation of the change before its read is the same Trial

- **GIVEN** a delivery feed that carries a basal edit from 06:00, and the 09:00
  read that first shows it
- **WHEN** ingestion reconciliation runs
- **THEN** there is one Trial, dated at the 09:00 read

#### Scenario: A delivery observation outside the changed block stays its own Trial

- **GIVEN** a read that shows only the 06:00–09:00 basal block moving, and a
  delivery feed that also shows 18:00 moving by the same values
- **WHEN** ingestion reconciliation runs
- **THEN** the 18:00 movement is recorded apart from the 06:00 Trial

#### Scenario: A change already recorded from delivery is not recorded twice

- **GIVEN** an edit recorded at its first delivery observation by a reconcile
  without the read that shows it
- **WHEN** that read arrives and ingestion reconciliation runs
- **THEN** no further record is added

### Requirement: A basal Trial is measured across the whole block its change moved

A basal Trial whose pump change moved a block shorter than the whole day SHALL
read every comparison outcome (time in range, time below range, time above
range, Rest windows with a low), its readiness count of qualifying clean nights
per slot, and the setting history bounding its periods over every slot of that
block, across midnight when the block wraps, and not over its starting slot
alone. Its served Trial evidence SHALL read time in range and time below range
over the block's readings. Its id SHALL be the slotted id a basal pump change
already had. A retained basal record saved at a pump change without a block
SHALL keep its id, SHALL NOT be rewritten, and SHALL be measured over the block
the two settings reads either side of its own change show moving from its slot.
A basal Trial's maturity and meal context SHALL stay unchanged. A basal change
seen only in delivery history, a whole-day change and a whole-profile Trial
SHALL be read as before. Each served Trial SHALL carry the block it is measured
across as `block`, `[start_min, end_min]` (a retained record without one is served
with the block its two reads show), or null when it has none, so a reader can
tell a time block inside the Trial's block from one outside it rather than
comparing starting slots.

#### Scenario: Lows late in the block are read into the target metric

- **GIVEN** a synthetic store whose two reads lower the 02:00–05:00 basal rate,
  with readings low from 04:00 to 05:00 every night before the change and none
  after
- **WHEN** the Trial's comparison is read
- **THEN** time below range reads 33.3% before and 0% after, over every reading
  from 02:00 to 05:00
- **AND** readiness counts the six slots from 02:00 to 04:30

#### Scenario: A block across midnight is read on both sides of it

- **GIVEN** two reads that lower the 22:00–02:00 basal rate, with readings low
  from 01:00 to 02:00 every night before the change
- **WHEN** the Trial's comparison is read
- **THEN** time below range reads 25% before, and readiness counts the slots
  from 22:00 to 01:30

#### Scenario: A record saved without its block keeps its id and is read across it

- **GIVEN** a retained basal record at a pump change that carries no block
- **WHEN** a reconcile runs and the Trial's comparison is read
- **THEN** the record keeps its id and carries no block, and its comparison
  reads the block its two reads show moving

#### Scenario: The served Trial names its block

- **GIVEN** two reads that lower the 02:00–05:00 basal rate, or a retained record
  of that change saved without its block
- **WHEN** the Trials are read
- **THEN** the Trial is served with `block` `[120, 300]`, and a 22:00–02:00 change
  with `[1320, 120]`

## MODIFIED Requirements

### Requirement: Watching a change means auto-detecting a Trial or pinning a Focus, moving through phases until resolution.

The system SHALL satisfy the following:

A **Trial** is a pump-programmable setting (basal slot, ISF, I:C, target, or whole-profile) the user has changed and the system auto-detects from the settings reads or the dense feed. A change the settings reads show (an active-profile switch, or an in-place edit of the active profile) is a Trial whether or not a Plan proposed it, because a change made on the pump is authoritative (ADR 500). A detected pump change ends any open Trial outside its own Edit as `superseded` and any active Focus as `trial_preempted`, and becomes the active Trial. A **Focus** is a behavioral lever the user pins by hand. Both enter a *Maturing* phase while post-change data accrues, then *complete* and are ready to judge. The app enforces exactly one active watched change: a Trial takes precedence, and launching one mid-Focus preempts and drops the Focus (the drop is real — the user re-pins if the intent still holds). Resolution happens when the Trial completes post-data accrual or when the user resolves the Focus manually.

#### Scenario: Watching a change means auto-detecting a Trial or pinning a Focus, moving through phases until resolution.

- **WHEN** the capability evaluates the behavior described by this requirement
- **THEN** the stated behavior applies

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
one change at most. A record whose change time is a pump-read change instant,
reverted ones included, SHALL NOT be kept by a delivery-detected change. A
kept record's comparison SHALL find its setting history, and its reversal SHALL
still be detected. A change a pump read supplies (an active-profile switch or an
in-place edit of the active profile) SHALL keep its read's instant. A dose or
delivery observation of the same move after the read before that one is that
change, not a second one; a slotted observation is that change only inside the
block the reads show moving. A pump read SHALL NOT record a change a retained
record already holds under the delivery dating. No retained record SHALL be rewritten. The analyzer's setting epochs SHALL be unchanged.

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
