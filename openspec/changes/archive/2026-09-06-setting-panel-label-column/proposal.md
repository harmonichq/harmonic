# Setting panel label column (#362)

## Why

Every setting detail panel in Diagnose labels its three numbers `CURRENT`,
`ESTIMATE` and `RECOMMENDED` in one fixed 88px column. The labels are uppercased
and letter-tracked, and `RECOMMENDED` needs 97px, so its final D lands on the
number beside it: the panel reads `RECOMMENDED0.48`. It is the same component for
a basal slot, an I:C block and the correction factor, so every setting finding on
every database shows it. The recommendation is the number a reader takes to a
clinician, and it is the one number the panel renders touching its own label.

The same 88px column serves the past-setting read, whose `PAST SETTING` label
does not fit either. Being two words it wraps instead of colliding, so that
panel silently renders a two-line label against its neighbour's one line.

No fixed width can serve both. `--ck-micro` is 11px inside the workstation and
14px for a past-setting read below 760px, and the labels are content, not
chrome — a constant re-derived for one of those bands is wrong in the other, and
wrong again the next time a label or the micro band moves.

## What changes

- Size the label column from the labels in a panel rather than from a constant,
  and keep every row of one panel on that single shared column so the numbers
  still line up.
- Group the label/value rows of the setting detail panel and of the past-setting
  read so each group carries its own column, and keep today's 88px as the floor
  so a panel of short labels is unmoved.
- Assert the geometry where it can be measured: the browser gate opens both
  panels already, so each label must fit its column on one line and every value
  in a panel must start at the same edge.

## Boundaries

Diagnose only. No queue, staging, safety verdict, analyzer, projection, fixture,
API or dosing behavior changes; no other screen is touched; the fast gate stays
browser-free. The frontend re-derives no backend verdict here — this restores
geometry the panel already promises, and moves no number.
