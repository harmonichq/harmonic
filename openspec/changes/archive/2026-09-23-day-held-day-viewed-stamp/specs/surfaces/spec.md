## ADDED Requirements

### Requirement: The topbar's Day reopens the day last looked at until the page reloads

A direct Day entry SHALL open the day the reader last looked at on the current
page: the date a contextual entry carried, or the day last chosen with Day's own
controls. It SHALL name no prior subject and offer no return. A page on which no
day has been looked at yet, including a reloaded page, SHALL open the latest
recorded day. The plain `/day` address SHALL NOT carry the day shown. Reached
through the topbar, it shows the day last looked at; reloaded, it shows the
latest recorded day. This difference is accepted, and the desk SHALL NOT
reconcile it.

#### Scenario: A direct entry after a contextual one keeps that day

- **GIVEN** the reader opened Day from a Diagnose occurrence on a recorded day
  earlier than the latest recorded day
- **WHEN** the reader visits Diagnose, then Changes, then presses the topbar's Day
- **THEN** Day shows that earlier day
- **AND** Day names no Opened-from subject and offers no return

#### Scenario: A reload opens the latest recorded day

- **GIVEN** Day is showing a day earlier than the latest recorded day
- **WHEN** the page reloads at the plain `/day` address
- **THEN** Day shows the latest recorded day

#### Scenario: The plain address does not carry the day shown

- **WHEN** the topbar's Day shows the day last looked at
- **THEN** the address is `/day` with no query
- **AND** that is the accepted consequence of this requirement, not a defect

### Requirement: The Day desk's viewed stamp is the reader's local clock

The Day desk's viewed stamp SHALL name the reader's local wall-clock date and
time at render. It SHALL use the same `YYYY-MM-DD HH:MM:SS` wall-clock form as
the served read stamp it is compared with. When the served read stamp and the
reader's local clock fall in the same minute, the Day header SHALL show the
read stamp alone.

#### Scenario: A local evening keeps its own date

- **GIVEN** the reader's local time is 21:30 on a day whose UTC date has
  already moved on
- **WHEN** the Day desk renders with no served read stamp
- **THEN** the viewed stamp names the local date and 21:30
- **AND** it names neither the UTC date nor the UTC time

#### Scenario: A read in the reader's current minute shows alone

- **GIVEN** the served read stamp falls in the reader's current local minute
- **WHEN** the Day desk renders
- **THEN** the Day header shows the read stamp and no viewed stamp

#### Scenario: A later view shows both stamps

- **GIVEN** the served read stamp falls in an earlier minute
- **WHEN** the Day desk renders
- **THEN** the Day header shows the read stamp, then the viewed stamp in the
  reader's local date and time
