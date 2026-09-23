# #423 Episode Log claimed anchors

## Status

**Triage source for #423.** An ordinary ticket change. It is a shipped-surface
revision of the desk's Day Episode Log under the frozen desk behavior ledger
(`mockups/harmonic-v2-desktop.behavior.md`, replay
`frontend/desk-behavior.replay.mjs`). Implementation is based on the release
integration trunk after #426 lands: #426 serves each episode's cause title from
the backend and removes Day's partial cause-name tables, and this change reads
that served episode cause title rather than keeping any name table of its own.

## Why

In the Day Episode Log, an **outranked** anchor (CONTEXT.md, *Silence reason*:
its own behavior matched a Lever, but another Lever owns the episode, and the
anchor stays as evidence of that episode's Finding) is shown four wrong ways:

- its tier word is the raw engine state, `outranked`, which reads as "the app
  dismissed this low";
- its row names only the episode's Lever, so a low inside a meal over-delivery
  episode reads "Low · meal over-delivery", with no sign that the low is what
  that Finding is about, or of what the low matched on its own;
- it is painted in the warning hue on its tier word, ring and focus hairline,
  whatever its severity, so a claimed level-2 low looks less important than the
  Finding that claims it;
- the band caption `Findings · N` counts rows, so a day with one Finding and one
  claimed anchor says two.

The bands themselves (`Findings`, `Also checked`, `Quiet` and its clean /
explained / no-data counts) are explained nowhere a reader can find them.

Diagnose already words the same state "claimed by another factor"; *factor* is a
synonym CONTEXT.md lists to avoid for Lever.

## What changes

- An outranked anchor reads **claimed** on Day, and Diagnose's case-file word
  for the same state becomes "claimed by another finding". Both read one
  definition.
- A claimed row names the Finding that claimed it (the served episode cause
  title, from #426) and each Lever the anchor matched on its own. The model-view
  read serves that second name: a Lever title on every retained verdict, from
  the same one name source.
- A claimed anchor keeps its Finding's hue and marker size on the tier word,
  the ring and the focus hairline. The warning hue leaves the Episode Log.
- The Findings caption counts Findings, and names claimed anchors separately.
- The Glossary gains an Episode Log group, CONTEXT.md gains the Episode Log and
  Claimed terms, the Guide's "Reading a Day" article describes the bands, and
  each band caption opens the Glossary at that group.
- Two desk behavior stories (S121, S122) prove the revision in the built app.

## Not in this change

Which anchor drives an episode, and any classifier, attribution, precedence,
severity, cap, floor or staging rule. Serving the episode cause title and
deleting Day's cause-name tables (#426). Rebound-after-treated-low attribution
(#422). Pattern case-file counts, cohort words and whether a claimed meal sits
inside "not attributed" (#424, which consumes this change's claimed word if it
rewords the residue line). Design-token values in `frontend/theme.css`. Pump
writes, real-data reads, vendor fetches.
