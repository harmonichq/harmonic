# #451 setting names, the correction factor's user form, and served words for ids and codes

## Status

**Triage source for #451.** An ordinary ticket change, triaged on 2026-09-23 as
part of the #442–#457 desk follow-up release. The inherited desk revise contract
(`mockups/harmonic-v2-desktop.behavior.md` and its replay) stays frozen. This
change adds three stories (S177–S179) in its own dated amendment section and
amends or retires none.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself from here"); coordinator ruling R451.
It covers R451 as corrected, the coordinator's widening of #451 on 2026-09-23,
and its plan review round 1 rulings (2026-09-24). Under the correction, the
correction factor takes CONTEXT.md's insulin-first form and the carb ratio keeps
"<value> g/U".

## Why

The desk still prints engine vocabulary and raw identifiers where the server
already has, or can serve, the reader's words. `CONTEXT.md` bans "ISF", "I:C"
and mg/dL/U from user copy. The correction factor's user label is "Correction
factor" and its user form is **1 U : 36 mg/dL**; the carb ratio's label is
"Carb ratio".

Reproduced on base b03431d2 through guidance's public read and through the
shipped desk modules. The coordinator's widening items were read from the
source; the repro scripts are `docs/scope/451-setting-concern-labels.repro.py`
and `docs/scope/451-setting-concern-labels.repro.mjs`.

- **Carb-ratio sentences.** The carb-ratio analyzer's served sentences say
  "I:C" ("relative to programmed I:C", "Held at the programmed I:C"), use prose
  em dashes, and call identifiable meals "clean-start".
- **Guidance titles.** Guidance titles every setting concern with the tuning
  lever's engine title ("ISF", "Carb ratio (I:C)", "Basal profile"). A set-aside
  subject the read no longer carries comes back with `title: null`, so Changes'
  set-aside list prints `setting:isf`, `habit:…` or `pattern:…`.
- **Changes' Action figure.** It prints a correction-factor value with
  mg/dL/U. A Pattern carrying its chosen setting's instruction serves no units,
  so its figure prints the value bare ("strengthen to 32 ", "lower to 9 ").
- **Changes' disposition.** Changes prints the raw guidance disposition code
  ("eligible_action", "guided_investigation") on its nameplate and Action
  heading.
- **What was known.** The Plan's "What was known" prints the recorded subject
  ids ("setting:isf") and the recorded value with mg/dL/U.
- **Diagnose finding titles.** Diagnose titles its setting findings "ISF ·
  <direction>" and "I:C <span> · <direction>". The correction-factor panel's
  heading, breadcrumb and scope sentence say "ISF". Its numbers, the queue's
  numbers, the watch dock and the staged title print mg/dL/U.
- **Dead writes.** The Diagnose workstation writes an "ISF … mg/dL/U" status
  line into `#status-src` and `#status-clock`, which no shipped markup renders.

## What changes

- **Setting concern titles.** Guidance serves every setting concern's `title`
  from its closed setting-label table: Basal, Carb ratio, Correction factor.
- **Carb-ratio sentences.** The carb-ratio analyzer's sentences pass every
  user-copy register rule: "carb ratio", no prose em dash, "identifiable meals".
  The annotation-register test holds them to the full rule set.
- **Set-aside subject names.** Guidance serves a name for every set-aside
  subject it lists, from the backend's own name sources: the setting-label
  table, the Lever title, the investigation's title. Pattern names come from
  the roster, which always serves every Pattern present. Changes lists a row
  with no name as "A concern no longer in this read", never by its id.
- **Recorded subject names.** The Plan history read serves the names beside
  each recorded Plan's subjects. The Plan's "What was known" prints those names,
  never an id.
- **Finding titles.** The findings projection titles setting findings by their
  user labels ("Correction factor · <direction>", "Carb ratio <span> ·
  <direction>"). Its JS mirror, frozen fixture, case-file fixture and QA
  finding-title literals move with it. Rows tied on every earlier sort key may
  reorder by their new titles; that is accepted.
- **One formatter.** One desk formatter prints a setting value in the wearer's
  words. A correction factor reads **1 U : <value> mg/dL** on every desk line,
  and no desk line prints mg/dL/U. A carb ratio keeps "<value> g/U" and gains
  its unit where a Pattern's figure printed none.
- **Status words.** Changes prints the served disposition in words, chosen
  from the served action's shape ("Ready to stage" for a setting change, "Ready
  to start a Focus" for a habit or Pattern action).
- **Diagnose panel copy.** The correction-factor panel's heading, breadcrumb and
  scope sentence say "Correction factor".
- **Watch dock.** The watch dock's one-line title names the change by its
  setting name, span and served direction, never "ISF" or "I:C". Its from→to
  values move to the wrapping detail line, so they are never truncated.
- **Dead writes deleted.** The dead status-strip writes are deleted.

## Not in this change

- The tuning lever's engine titles (`ciq_autotune/analyzers/tuning_priority.py`).
- Priority, Insulin currency, recommendation values, caps, floors,
  `asserts_move` and staging.
- The value sent to Plan and to the pump-profile schedule.
- Every served `units` field.
- Guidance's set-aside comparison and its return reasons.
- The carb ratio's printed form.
- Headline templates.
- Table heads and chart axes that name a unit over bare numbers.
- A record's recorded explanation, which prints as recorded.
- Identifiers in addresses, data attributes and routing.
- The engine report (`report`, `render`) and engine documentation.
- Focus names and reason words in `follow-up.js`/`history.js` (#449/#450).
- The event-comparison projection (`project.mjs`) and the meal-shaped
  manufactured rows (#454).
- Pump writes, real-data reads and vendor fetches.

## Impact

- **Backend:**
  - `ciq_autotune/guidance.py` (setting titles, set-aside names, one subject-name
    lookup);
  - `ciq_autotune/analyzers/ic.py` (carb-ratio sentences);
  - `ciq_autotune/api.py` (the Plan history read's served names);
  - `ciq_autotune/findings_projection.py` (setting finding titles).
- **Generated parity:**
  - `mockups/findings-projection.mirror.mjs`;
  - the regenerated `frontend/__fixtures__/findings-projection.json`,
    `frontend/__fixtures__/analysis.json`,
    `mockups/diagnose-workstation.synthetic/ic-history-events.capture.json` and
    `mockups/diagnose-workstation.synthetic/finding-case-files.json` (after
    retitling two hand-written literals in its generator);
  - the QA queue-row and finding-title literals in `scripts/qa_e2e_cases.py`,
    re-dumped by the coverage-era process.
- **Desk:**
  - `frontend/plan.js` (the one setting-value formatter);
  - `frontend/guidance.js` (disposition words);
  - `frontend/changes.js`, `frontend/plan-view.js`, `frontend/history.js`,
    `frontend/follow-up.js`, `frontend/utilities.js`;
  - `frontend/diagnose-findings-queue.js`, `frontend/diagnose-workstation.js`,
    `frontend/watched-change-dock.js`.
- **Docs:** a **Concern** entry in `CONTEXT.md`.
- **Ledger:** three new stories on the manufactured case store isf-strengthen.
  S177 joins the PR smoke slice.
