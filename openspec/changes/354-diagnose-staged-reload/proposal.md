# Diagnose keeps a staged setting change across a reload (#354)

## Why

A saved Plan draft persists across a page reload — `openspec/specs/plan/spec.md`
requires it — but the Diagnose workstation rebuilds its staged marks empty on
every mount. After a reload the watched-change dock reads "Nothing being watched
· No change staged" while the cockpit's Plan step still counts the same item, so
one object carries two claims on one screen, which is the defect lock term 47
exists to remove. The lane cell loses its accent underline and drilling the row
offers "Stage change" again, so the reader cannot un-stage from Diagnose the
change they staged there.

## What changes

- The workstation seeds its staged basal slots, I:C blocks and ISF value from the
  shell's existing Plan verdict when it boots, instead of starting empty.
- The app-only opener gains an opt-in stateful Plan-draft stub, so a browser story
  can carry a draft across a reload.
- A browser regression story pins the surviving staged marks and the un-stage path.
