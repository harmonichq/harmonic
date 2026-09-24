# #445 and #444: Day links from Changes and the carb utilities name what they came from, and Log carbs reads the local clock

## Status

**Triage source for #445, with #444 folded in.** An ordinary ticket change, one
worktree and one decision record per issue in `design.md` (ADR 445, ADR 444).
The desk's frozen behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`)
and its replay (`frontend/desk-behavior.replay.mjs`) stay the contract; this
change adds fail-first app-only stories S162–S165 beside them under the
coordinator's Q3 sanction for this release (see `design.md`).

## Why

Three ways into Day still write a page selector into the Day address as the way
back: a supporting date of the active change and of a change record in Changes
(`focus=[data-day-date="<date>"]`), and the Log carbs and Carb questions
utilities (`focus=[data-utility-remove='<id>']`,
`focus=[data-question-card='<key>'] [data-action='day']`). A copied Day link
exposes page internals, and Day hands that raw selector from the address to the
page. ADR 428 already removed the Diagnose-origin selector; these are its
siblings.

A carb utility's Day return hands the whole utility entry to the destination it
was opened over. Its routing subject is the utility's display text, so a
retained Diagnose compares "Carb questions · Jun 26 13:55" with the case it
holds, re-reads everything, discards the drill ADR 414 kept, and then leaves the
utility's title and selector in the Diagnose address.

Separately, a Changes return from the active change's supporting date never
reaches the date's control at all: Changes re-reads on every arrival, and the
loading frame's heading takes the focus request first.

The Log carbs header ("at <date> · <HH:MM>") builds its date from the UTC clock
and its time from the local clock, so west of UTC in a local evening it prints
tomorrow's date beside tonight's time (#444).

## What changes

- A Changes supporting-date Day link names its return target by the date it
  opened, which the entry already carries. A carb utility's Day link names the
  item it came from: a Carb log entry by its served id, a Carb-log prompt by its
  detector and anchor time, as the entry's routing subject; the printed title is
  unchanged. No Day address carries a selector, and the address no longer has a
  return-focus key at all; an older link that still carries one is read without it.
- On return, the origin that owns the identity resolves it to its own control.
  Changes puts focus on that date's supporting-date control once the change's
  content has rendered. The reopened utility puts focus on that item's own Open
  Day control. When the item is gone, focus lands on the origin's heading.
- A carb utility's Day return is a plain return to the destination underneath,
  with the utility reopened over it. Over a retained Diagnose whose store has not
  moved since it last read, that is ADR 414's retained return: one status read,
  the drill kept, and the address names the retained case. After a carb was
  logged or a question answered, the store has moved, so Diagnose re-reads and
  restores the case it held, as ADR 414 requires. On both paths, focus lands on
  the pressed Open Day control: a Diagnose rebuild under a seated utility no
  longer sets its own focus default.
- The Log carbs header prints the reader's local date and time from one local
  wall-clock string.

## Not in this change

Diagnose's own Day link and return (ADR 428, unchanged). Which change or record
Changes opens, and whether Plan stays open on a plain arrival (#446). Any
analyzer, projection, served payload, cap, floor, admission or staging rule. No
real-data read, no vendor fetch, no normal serve.
