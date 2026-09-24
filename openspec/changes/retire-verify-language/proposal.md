# #447 Verify leaves the live language, and the dock and Changes print one Trial day count

## Status

**Triage source for #447.** An ordinary ticket change in the #442–#457 release.
The desk's frozen behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and
its replay stay the contract. This change adds two app-only stories, S169 and
S170, in a dated `#447 amendment` section, and amends or retires no existing story.

## Why

#416 retired v1's Verify surface. Changes owns Trial and Focus progress under
ADR 397. Even so, the domain language document, the README, the product and
design documents, three living specifications, one Guide article the desk serves
to the reader, and about thirty code, test, script and CI comments still describe
Verify as a place the reader can go, or as the consumer of a fact.

Separately, the watch dock and Changes print different day counts for one served
Trial. The server serves one count for both: the Trial's data-days inside its
bounded 14-day period. A change made mid-day or at midnight spans 15 dates in
that period, so a completed Trial serves 15 of 14. The dock clamps what it prints
and reads "Ready to judge — 14 of 14 days". Changes prints the served count and
reads "15 days · 14 required". This was reproduced on the base (b03431d2) at node
level, through the backend's own test, and on the manufactured `c3-trial` case
store, which is the store the dock's existing story S139 already runs on.

## What changes

- **One Trial day count.** The dock prints the served count. While the Trial
  matures it keeps its words: "Maturing — ‹n› of ‹R› days since ‹MM-DD›". Once it
  is ready it reads "Ready to judge — ‹N› days since ‹MM-DD› · ‹R› required",
  which uses the words Changes already prints. Changes' Watch maturity figure
  keeps its locked words. It now picks its form from the served verdict instead
  of comparing two counts itself. One exported function in the follow-up module
  supplies both surfaces' count words. A clamp may shape Changes' progress bar,
  never a printed number.
- **The Guide.** The served "Reading the Diagnose surface" article's Cause-lever
  line stops sending the reader to "Focus / Verify". It now names a Focus
  followed in Changes.
- **The language and the specifications.** CONTEXT.md, the README, PRODUCT.md,
  two DESIGN.md bullets, the http-api Purpose, three surfaces requirements, one
  behavioral-layer requirement, and the code, test, script and CI comments that
  describe Verify as live are re-pointed at Changes and at the shipped desk. A
  concept whose only renderer was Verify says that nothing in the desk renders it.
  The decision record classifies every remaining mention of the word.
- **Evidence.** Two new desk ledger stories. S169 pins the dock and Changes
  printing one count on `c3-trial`. S170 pins the Guide article naming no Verify.
  A backend test pins that no authored article names Verify, and the node tests
  pin both printers over one served Trial. The pinned inventory literals move to
  173 issued · 154 active · 19 retired.
- **Generated artifacts.** The design exploration's `utilities.json` embeds the
  Guide articles. Its `focus.json` and `journey.json` carry a code version hashed
  over every backend source file. All three are regenerated.

## What does not change

- Every served payload and every backend rule. That covers `_maturing`, the
  readiness rule (`is_maturing` is `days_elapsed < days_required`), the 14-day
  window, the Trial's bounded period, the watch horizon, every analyzer and every
  staging predicate, cap and floor.
- Changes' locked Watch maturity strings, its clamped progress bar, and the Trial
  and Focus evidence-readiness arms. Those arms print the comparison period's own
  elapsed days, which is a separate served fact under HV2-24.
- Identifiers. These keep their names: the `/api/verify/*` routes,
  `fetchVerifyTrials`, `verify-workstation-chart.js`, the
  `verify-660-story.synthetic` fixture set, `.claude/qa/gen_verify_payload.py`,
  the `test_verify_*.py` files, and `/verify` in the retired-path lists.
- Records. That covers archived and unarchived OpenSpec changes, `docs/scope/`,
  the ledger's frozen blocks and dated amendment sections, the desk lock
  manifest, `mockups/INDEX.md` rows, the exploration's review documents, and
  ACCEPTANCE.md's measurement table.
- Locked prototype source and its runtime strings, and the Guide's locked
  preface ("Written for the v1 tabs: …").
- The qa-e2e-database migration requirement, which names a replay #416 deleted.
  It is a completed #319 migration contract. Its staleness is reported to the
  release coordinator as a finding.

## Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`.
It covers the dock's copy change, the Guide article's copy change, and the ledger
amendment that adds S169 and S170.

## Capabilities

- `surfaces`: ADDED "Changes follows a watched Trial or Focus through", "The watch
  dock and Changes print one Trial day count", and "No authored Guide article
  names Verify". REMOVED "Verify surface asks 'are my changes working?'".
- `behavioral-layer`: MODIFIED "Sequence findings are served coherently through
  existing finding interfaces". Only its two Verify phrases change.
- `http-api`: the Purpose paragraph is edited in place. A delta cannot carry
  Purpose prose, and no requirement changes.
