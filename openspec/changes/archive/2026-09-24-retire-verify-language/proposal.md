# #447 Verify leaves the live language, and the dock and Changes print one Trial day count

## Status

**Triage source for #447.** An ordinary ticket change in the #442–#457 release,
widened by the release coordinator's rulings Q1–Q4 and F1–F5. The desk's frozen
behavior ledger (`mockups/harmonic-v2-desktop.behavior.md`) and its replay stay
the contract. This change adds two app-only stories, S169 and S170, in a dated
`#447 amendment` section, and amends or retires no existing story. The work runs
as three serial sub-orders: the backend contract, the shipped surfaces, and the
language and records.

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

The sweep also found five pieces of #416 residue beside the Verify wording. The
coordinator ruled that each is fixed here:

- `watched_change.detect_trial` has no production caller (F1).
- `/api/outcomes/trend` serves nine fields of series that no desk surface reads
  (F2).
- The surfaces spec still describes the v1 Plan page (F3).
- The QA-database consumer requirement describes CI steps and replays #416
  removed (F4).
- ACCEPTANCE.md's timing table lists nine browser legs #416 deleted (F5).

## What changes

- **One Trial day count.** The dock prints the served count. While the Trial
  matures it keeps its words: "Maturing — ‹n› of ‹R› days since ‹MM-DD›". Once it
  is ready it reads "Ready to judge — ‹N› days since ‹MM-DD› · ‹R› required",
  which uses the words Changes already prints. Changes' Watch maturity figure
  keeps its locked words. It now picks its form from the served verdict instead
  of comparing two counts itself. One exported function in the follow-up module
  supplies both surfaces' count words. A clamp may shape Changes' progress bar,
  never a printed number.
- **The outcomes-trend route serves only the watched change.** It answers
  `{"watched_change": …}` through one function that `summarize_trend` also uses,
  so the dock's input stays byte-identical. The route takes no window, so neither
  its cache key nor the client carries one. The CLI's `outcomes-trend` keeps
  every series, because it is their production caller.
- **The legacy Trial detector is deleted.** That is `detect_trial` with the two
  private helpers only it called (`_profile_switch_diff` and `_candidate`), and
  the 31 tests that exist only to test it.
- **Changes' Trial outcome table leads with its served target.** A Trial's
  outcome table leads with the rows served for its served `target_metrics`,
  marked as its target, the way a Focus's mapped outcome is marked; the rest keep
  their served order (review ruling RR1). S169 checks it on `c3-trial`.
- **The Guide.** The served "Reading the Diagnose surface" article's Cause-lever
  line stops sending the reader to "Focus / Verify". It now names a Focus
  followed in Changes.
- **The language and the specifications.**
  - CONTEXT.md loses the Digest entry. Localized outcome, Confound triage,
    Tracked candidate and Candidate sweep stay, because `/api/pattern-sweep`
    still serves them, and each says the desk does not show it.
  - The README, PRODUCT.md, two DESIGN.md bullets, two spec Purposes, and the
    code, test, script and CI comments that describe Verify as live are
    re-pointed at Changes and at the shipped desk.
  - The v1 Plan requirement is retired in favour of Changes' Plan. The QA
    consumer requirement is rewritten to today's tree. ACCEPTANCE.md's timing
    table keeps only the legs CI still runs.
  - The decision record classifies every remaining mention of Verify.
- **Evidence.**
  - S169 pins the dock and Changes printing one count on `c3-trial`, and S170
    pins the Guide article naming no Verify.
  - Backend tests pin the narrowed route and the unchanged CLI trend, and a
    backend test pins that no authored article names Verify.
  - Node tests pin both printers over one served Trial.
  - The pinned inventory literals move to 173 issued · 154 active · 19 retired.
- **Generated artifacts.** The design exploration is regenerated. Its
  `focus.json` and `journey.json` carry a code version hashed over every backend
  source file, and its `utilities.json` embeds the Guide articles.

## What does not change

- The backend rules and the analyzers: `_maturing`, the readiness rule
  (`is_maturing` is `days_elapsed < days_required`), the 14-day window, the
  Trial's bounded period, the watch horizon, every analyzer and every staging
  predicate, cap and floor. The served `watched_change` and the CLI trend stay
  byte-identical.
- Changes' locked Watch maturity strings, its clamped progress bar, and the Trial
  and Focus evidence-readiness arms. Those arms print the comparison period's own
  elapsed days, a separate served fact under HV2-24 (ruling Q2).
- The desk glossary. It holds none of Digest, Localized outcome or Tracked
  candidate.
- Identifiers. These keep their names: the `/api/verify/*` routes,
  `fetchVerifyTrials`, `verify-workstation-chart.js`, the
  `verify-660-story.synthetic` fixture set, `.claude/qa/gen_verify_payload.py`,
  the `test_verify_*.py` files, and `/verify` in the retired-path lists.
- Records. That covers archived and unarchived OpenSpec changes (ruling Q3),
  `docs/scope/`, `docs/research/`, the ledger's frozen blocks and dated amendment
  sections, the desk lock manifest, `mockups/INDEX.md` rows, and the exploration's
  review documents.
- Locked prototype source and its runtime strings, and the Guide's locked
  preface ("Written for the v1 tabs: …").

## Sanction

`Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R447`,
with the coordinator's rulings Q1–Q4 and F1–F5 on #447 and the whole-diff review
rulings RR1–RR8. It covers the dock's copy change, the Guide article's copy
change, the Trial outcome table's target-first order, and the ledger amendment
that adds S169 and S170.

## Capabilities

- `surfaces`:
  - ADDED "Changes follows a watched Trial or Focus through", "The watch dock and
    Changes print one Trial day count", "No authored Guide article names Verify"
    and "Changes' Plan asks 'what will I program into my pump?'".
  - REMOVED "Verify surface asks 'are my changes working?'" and "Plan surface
    asks 'what will I program into my pump?'".
  - The Purpose paragraph is edited in place.
- `behavioral-layer`: MODIFIED "Sequence findings are served coherently through
  existing finding interfaces". Only its Verify phrases change.
- `http-api`: ADDED "The outcomes-trend route serves only the watched change",
  and the Purpose paragraph is edited in place.
- `outcomes`: MODIFIED "Trend series show rolling-window glycemic and behavioral
  movement, with documented uncertainty bounds." It now names the CLI payload.
- `qa-e2e-database`: MODIFIED "Remaining consumers migrate before revise-E2E
  retires". It is rewritten to the post-#416 tree, and its four scenario
  headers are kept.
