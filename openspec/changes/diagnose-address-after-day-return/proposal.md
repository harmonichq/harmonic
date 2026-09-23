# #428 Diagnose's address names the case the reader is on

## Status

**Triage source for #428.** An ordinary ticket change. The desk's frozen
behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay
(`frontend/desk-behavior.replay.mjs`) stay the contract; this change adds
fail-first app-only stories S136–S138 beside them under the operator's
2026-09-23 sanction for this release's checklists.

## Why

After **Return to Diagnose** from Day, the Diagnose address keeps the Day
entry's whole context for as long as the reader stays on Diagnose: date,
moment, subject, occurrence, window, lever, `from`, and a `focus` that is a
CSS selector (`.occ-foot button:last-child`). Choosing another clock window,
stepping back to Findings or picking a basal slot never rewrites it. A reload or
a shared link then re-opens the Finding and Occurrence the reader already left,
and the link exposes an internal selector.

The stale entry also defeats Diagnose retention (ADR 414). A later plain press
of Diagnose from Changes compares an empty entry with the stored Day context,
sees a difference, and re-reads everything, discarding the retained drill and
window, although ADR 414 re-reads only on a *contextual* entry that names a
different case.

## What changes

- Whenever the case on screen changes inside Diagnose, by any control, key or
  chart, the address is replaced in place with that case: its subject, its
  Occurrence while one is selected, and its window. At the Findings index it
  carries no case. No Day-entry key and no selector survives. This holds in every
  Diagnose session, not only after a Day visit, so a reload after any drill
  re-opens that case instead of the cold 24 h Findings arrival. While the desk is
  still restoring an entry it leaves the address alone.
- A plain return to Diagnose after a Day visit keeps the held case but not a
  Changes `from`, so "Return to Trial" does not reappear after a topbar press.
- The Day entry Diagnose writes names its return target by the Occurrence's
  served id, which it already carries; it carries no CSS selector. The return
  still lands on that Occurrence's own Open in Day control.
- A plain return to Diagnose after a Day visit is an ADR 414 retained return:
  one status read, the drill and window kept, and the address names the retained
  case.
- Reloading a case address re-opens that case, in its clock window when that
  window is one of the Window control's presets.

## Not in this change

The selector-shaped return targets that Changes and the carb utilities write
into their own Day addresses, and a utility-origin Day return into Diagnose
(drafted as a follow-up issue). Back and Forward stepping through in-Diagnose
case changes. Addressing a drawn window, an alignment, a chart-tile or sub-row
drill, or the Findings ranking's window. Analyzers, the findings projection,
case-file requests, caps, floors, admission and staging. No real-data read, no
vendor fetch, no normal serve.
