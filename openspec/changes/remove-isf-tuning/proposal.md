# Stop estimating and tuning the correction factor (#564)

## Why

Harmonic estimates ISF from fasting nights and advises moving the pump's
correction factor from that estimate. An investigation for #563 found that no
passive method identifies ISF under Control-IQ (ADR 564). Each direction the
advice can take is wrong in its own way:

- **Strengthen.** The pooled fasting estimate leans toward stronger
  corrections, which is the direction that can cause harm.
- **Weaken.** The recurring correction-lows signal is a habit, not a setting.
  Those lows cluster on corrections given over the calculator's insulin-on-board
  credit. The `correction_stacking`, `correction_on_iob` and `user_override`
  detectors already attribute that pattern to behaviour, so weakening the
  setting for it blames the setting for a pattern a habit already owns.

Since #563 (ADR 563), nothing converts glucose with the estimate. The meal's
dose-stamped ISF does that. What is left of the estimate is advice that should
not be given and a card that shows a number nobody should act on.

## What changes

- The analysis no longer runs the fasting ISF regression, and serves no ISF
  estimate: `/api/analyze` has no `isf` rows, and no ISF tuning lever, settling
  gate or setting-epoch caveat. The result schema version moves.
- Guidance serves no correction-factor concern, and the findings serve no
  correction-factor row. So the Queue has no ISF card, and Done can record no
  ISF Plan.
- The Overview has no ISF estimate card. Its estimates grid is revised under the
  redesign lock (`docs/design/recommendations-redesign.md`), and the Queue loses
  its queued-ISF card.
- What stays:
  - The programmed and dose-stamped ISF: the conversion input (ADR 563), the
    Settings pump-profile column, the deliverable profile's ISF column, and the
    Glossary term.
  - The habit detectors that own correction lows. They are unchanged.
  - The correction attribution of printed lows and pre-empted lows, which keeps
    a correction-driven low out of the carb-ratio arm.
- Durable state that names ISF still reads: a set-aside correction-factor
  preference, a recorded ISF Plan, and a retained or newly detected
  correction-factor Trial. A pump edit to the correction factor is still a
  Trial. Harmonic shows its outcomes before and after, as it does for a target
  edit, and advises nothing about the correction factor (ADR 564 rule 4).
- The QA ISF cases go: the four `isf-*` cases and
  `behavioral-carb-log-fasting-exclusion`, whose only proof was the ISF row's
  step count. Every remaining case's rest-window expectation (74 cases, 38 of
  them a non-empty set) is re-sourced from the rest-window detector, with its
  literal value unchanged. The contract test's `isf-strengthen` case and its CI
  run went in B1.
- Specs, `AGENTS.md`, `README.md`, `CONTEXT.md`, `PRODUCT.md` and `DESIGN.md`
  stop describing ISF estimation or ISF advice.

The work lands in three slices (tasks.md), each its own pull request:

- **A.** The app stops drawing the estimate.
- **B1.** The engine stops serving ISF advice.
- **B2.** The engine stops computing the estimate.

B1 merges after A, and B2 after both.

## Risk contract

- **Must prevent:**
  - Any served correction-factor recommendation, direction, stageable action or
    Queue card after B1, and any served ISF estimate after B2.
  - A change to any basal or carb-ratio staging verdict, estimate or Priority.
    The one allowed exception is a change that comes from the ISF lever leaving
    the shared ranking. It must be listed in ADR 564, with counts only.
  - A change to the habit detectors' verdicts.
  - Any change to the conversion input (`IsfSource`).
  - A read of existing durable state (preferences, Plan history, follow-up
    records, Trials) that raises or returns unavailable.
  - Silent incorrect success. Examples: a QA expectation re-derived from output
    at assertion time; a committed fixture changed without its generator.
  - Any real value committed.
- **Must recover:** nothing automatic. Results recompute from recorded data. No
  stored row is migrated or deleted.
- **Accepted failure:**
  - A correction factor set aside before #564 stays set aside. Guidance serves
    it as an absent row titled "Correction factor", but the Queue's Snoozed list
    leaves it out and counts only the rows it lists (lock §2.5, 2026-10-20 #564),
    so no screen offers to restore it. It acts on nothing, because no
    correction-factor concern is served. The Overview and Queue built before
    slice A keep their cached answers until the next read.
  - A correction-factor Trial retained before B2 reads its comparison over the
    whole of each period on its next read, as a target Trial does, so its
    outcome numbers can differ from the ones shown before B2. The stored record
    is not rewritten.
  - Between merges, main can show a state the next slice removes: after A, an
    engine that still stages an ISF row that no surface draws; after B1, an
    estimate that nothing reads.
- **Unsupported:**
  - Any replacement way to identify ISF, including an engine-assigned
    experiment (ADR 564 rule 2).
  - Advice on the correction factor from habit evidence.
  - Rewriting stored records.
- **Evidence owed:**
  - Through `analyze()`: no `isf` key, and basal and carb-ratio rows identical
    to the base commit on every QA case.
  - Through `build_guidance`: no `setting:isf` candidate, and a stored
    `setting:isf` preference served as an absent row named "Correction factor".
    Plan history still names a recorded ISF Plan.
  - A retained `isf-all-*` Trial record reads on the Trial roster,
    `/api/verify/trials` and the watched change.
  - A Trial comparison reads with the ISF analyzer module deleted.
  - The habit detectors' QA expectations unchanged.
  - The Overview's grid assertions rewritten for the locked layout, and the
    contract tests and the browser smoke green.
