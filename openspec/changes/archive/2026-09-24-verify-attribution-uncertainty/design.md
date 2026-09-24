# Design — verify-attribution-uncertainty

## ADR 136 — Verify presents per-block evidence and prices its differences by day

**Ruling.** Verify's watched-change switcher lists one entry per pump change,
never one entry per affected clock block. The selected change contains the
per-block content. An active-profile switch that moved several settings names its
stored destination profile, for example `Profile change → P0007`. A multi-setting
edit inside the profile already in use is not called a profile change; it names
what moved in the vocabulary the single-setting entries already use, for example
`Basal + carb ratio changed`.

Verify never names which setting moved an outcome. A change that moved several
settings presents each changed setting's evidence and lets the reader judge,
without an attribution verdict or a co-changed caveat line. The evidence-view
unit is each affected part of the day, not each setting: an I:C change that
touches morning and evening produces two charts and two verdicts. This supplies
the per-block response shape ADR 24 left open while preserving its rulings that
each block matures and is judged independently, a multi-setting change runs the
I:C evidence bar for its ratio part, ready to judge is not recommending, and only
evidence arriving after the change counts.

Uncertainty rides on the before-and-after difference itself, not on either
period's number. The headline difference is the only number that carries a range;
the before and after curves, their per-bin values, and every other number on the
surface carry none. A range that includes zero says the data cannot tell yet and
names no direction. A part of the day too thin to support a range shows no
difference at all and names what it lacks, for example `3 meals since the change`.
The range counts days rather than treating individual meals as independent, and
Verify uses the interval language Diagnose already uses. That last ruling governs
the words on the surface as well as the computed number.

**Context.** #136 asked how Verify should speak when one pump change moved several
settings and how honestly to price a before-and-after difference. Today
`watched_change.review_trials` returns one flat roster entry with one scalar state;
contemporaneous edits collapse into one profile candidate without per-setting
before and after values; and Verify prints bare median-per-bin differences without
an interval. Diagnose already has one interval idiom. ADR 24 separately settled
that a changed I:C block matures on its own post-change meal evidence and left the
response shape to this decision.

A read-only measurement of the operator's own history covered 190 days and 999
meals with post-meal coverage, or 5.26 meals per day. Within-day correlation of
post-meal peaks was 0.36, giving a design effect of 2.53 and an interval 1.59x
wider than independent-meal counting. On a half-history split, independent
counting returned -7.5 (-14.3 to -0.9), excluding zero, while day counting
returned -7.6 (-18.3 to +3.5), including zero. Part of the measured 0.36 is
time-of-day rather than a day effect, so it is an upper bound. The decision still
counts days: the narrower treatment made a directional claim the clustered
evidence did not earn.

**Consequences.**

- The switcher remains a list of changes the user made. Independent maturity is
  visible inside the selected change rather than multiplying one change into
  several switcher entries.
- A profile switch and an in-place multi-setting edit are distinct facts and
  receive distinct labels. Single-setting entries keep their existing vocabulary.
- A multi-setting change can expose several evidence views, and one changed
  setting can expose several part-of-day views. Neither shape grants causal
  attribution authority.
- Direction is a consequence of a range excluding zero. A zero-spanning range
  cannot be softened into directional copy.
- Withholding is complete when the evidence is thin: no ranged difference means
  no bare difference. The surface explains the missing evidence and waits.
- Day clustering is part of the interval contract, not an implementation detail.
  Counting meals independently would narrow the range below what the evidence
  earns.
- Diagnose's interval wording is shared application language. Verify does not
  introduce a competing uncertainty idiom.

### Risk contract

- **Must prevent:** naming a direction a range spanning zero cannot support; a
  range narrower than the evidence earns (independent-meal counting); any
  record-level real data reaching the tree.
- **Must recover:** nothing automatically.
- **Accepted failure:** a stretch of the day with too little data, or a range
  that cannot be computed, shows no difference and names what it lacks; recovery
  is waiting for data.
- **Unsupported:** attributing an outcome to one setting when several changed,
  and causal claims of any kind.
- **Evidence owed:** the interval is day-clustered; a range spanning zero yields
  the "cannot tell yet" wording and no direction; a thin stretch yields no
  difference and names what it lacks; the three roster labels (single setting,
  profile switch, in-place multi-setting edit) each render their own form.
- Why: advisory dosing guidance, one operator, every failure here is a wrong
  claim rather than data loss. Disposition: -> copied into the work order.

**Relationship to the glossary.** `CONTEXT.md` defines the shipped Trial and
Maturing model: a watched change carries one target metric and one scalar maturity
gate, and an active-profile switch is read as one Trial. That remains the shipped
definition and stays accurate until this record is implemented. This record keeps
one active watched change and one switcher entry, but prospectively gives a
multi-setting change child evidence views and independent part-of-day verdicts,
with day-clustered uncertainty on each headline difference. The build handoffs
update the glossary and the outcomes specification in the changes that ship this
behavior; until then, follow `CONTEXT.md` and `openspec/specs/outcomes/spec.md` for
what the app does today and this record for what was decided.

**Not built here.** This record is locked ahead of implementation deliberately.
#183 builds the per-part-of-day evidence shape and the three watched-change label
forms. #182 builds the day-clustered range, withholding behavior, and shared
interval wording. #135 re-locks the Diagnose canvas only, so neither Verify
handoff is waiting on it. This change does not edit the shipped outcomes
specification or glossary, does not implement any response or surface, and does
not reopen ADR 24.

Decision: harmonichq/harmonic#136, 2026-08-25. Evidence: scope ledger
`docs/scope/verify-attribution-uncertainty.md` and read-only measurement spike
`docs/scope/verify-attribution-uncertainty.spike.py`.
