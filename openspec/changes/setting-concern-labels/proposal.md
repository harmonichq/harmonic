# #451 setting concern labels and the correction factor's user form

## Status

**Triage source for #451.** An ordinary ticket change, triaged on 2026-09-23 as
part of the #442–#457 desk follow-up release. The inherited desk revise contract
(`mockups/harmonic-v2-desktop.behavior.md` and its replay) stays frozen; this
change adds three stories (S177–S179) in its own dated amendment section and
amends or retires none.

Sanction: Q3 delegation, Connor Griffin, 2026-09-23 ("figure it out yourself
from here"); coordinator ruling R451.

## Why

Guidance names a setting concern by the tuning lever's engine title ("ISF",
"Carb ratio (I:C)", "Basal profile"), and the desk prints a correction-factor
value with the engine unit mg/dL/U. `CONTEXT.md` bans both from user copy. Its
user label is "Correction factor" and its user form is **1 U : 36 mg/dL**. The
same concern's kicker already reads "Correction factor". A Pattern whose chosen
member is a setting carries that setting's instruction rows but serves no units
of its own, so its Action figure prints the value with no unit at all
("strengthen to 32 ").

Reproduced on base b03431d2 through guidance's public read and through the
shipped desk modules (`docs/scope/451-setting-concern-labels.repro.py`,
`docs/scope/451-setting-concern-labels.repro.mjs`):

- guidance serves `title` "ISF", "Carb ratio (I:C)" and "Basal profile" for the
  manufactured cases isf-strengthen, isf-held, ic-lower, ic-held and
  basal-lower, and `title: null` for a set-aside setting preference the read no
  longer carries, which Changes' set-aside list then prints as `setting:isf`;
- Changes' Action figure prints "strengthen to 32 " and "lower to 9 " for a
  Pattern carrying a correction-factor or carb-ratio instruction, and
  "strengthen to 32 mg/dL/U" for a setting concern;
- Diagnose's findings queue prints "now 30.0 mg/dL/U → 32.0 mg/dL/U" for an
  asserting correction-factor row, and its correction-factor inspector prints
  mg/dL/U beside every number;
- the watched-change dock titles a correction-factor Trial "ISF · 30.0 → 32.0
  mg/dL/U", and Diagnose's staged title reads "ISF · … mg/dL/U" or "I:C … g/U".

## What changes

- Guidance serves every setting concern's `title` from its closed setting-label
  table (Basal, Carb ratio, Correction factor). This includes a set-aside setting
  preference the read no longer carries. The tuning lever's title, the
  concern's Priority inputs, its served `units` and its set-aside comparison
  state are unchanged.
- One desk formatter prints a setting value in the wearer's words, moved into the
  leaf module every consumer can import. Changes' Action figure, the Plan's
  "What was known", Diagnose's findings queue, the correction-factor inspector,
  the watched-change dock and Diagnose's staged title all use it. The change
  record and the Trial follow-up keep using it.
- A correction-factor value reads **1 U : <value> mg/dL** on every desk line, and
  no desk line prints mg/dL/U.
- The watched-change dock and Diagnose's staged title name a setting as the desk
  names it everywhere else: Correction factor or Carb ratio, never ISF or I:C.

## Not in this change

- The tuning lever's engine titles (`ciq_autotune/analyzers/tuning_priority.py`).
- Priority, Insulin currency, recommendation values, caps, floors,
  `asserts_move` and staging.
- The value sent to Plan and to the pump-profile schedule.
- The served `units` of any action row.
- Guidance's set-aside comparison and its return reasons.
- The carb ratio's printed form: it keeps "<value> g/U" (design.md).
- Diagnose's finding titles and the correction-factor inspector's head. Both
  come from the findings projection's own title contract.
- Table heads and chart axes that name a unit over bare numbers.
- A record's recorded explanation.
- Pump writes, real-data reads and vendor fetches.

## Impact

- Backend: `ciq_autotune/guidance.py`, with its test.
- Desk: `frontend/plan.js` (the one setting-value formatter), `frontend/changes.js`,
  `frontend/plan-view.js`, `frontend/history.js`, `frontend/follow-up.js`,
  `frontend/utilities.js`, `frontend/diagnose-findings-queue.js`,
  `frontend/diagnose-workstation.js` and `frontend/watched-change-dock.js`, with
  their node tests.
- Ledger: three new stories (S177–S179) on the manufactured case store
  isf-strengthen. The story functions go in the desk replay registry, and S177
  joins the PR smoke slice so that store stays covered.
- No committed fixture carries a guidance setting concern's served title, so no
  fixture moves for the title change.
