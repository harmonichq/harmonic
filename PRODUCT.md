# Product

## Register

product

## Users

A single user: a Tandem Control-IQ pump wearer analyzing their own pump/CGM
history, self-hosting this tool against their own local SQLite store. No
multi-tenant, no accounts beyond one optional API token. They arrive with one
job: find the one change most worth making, make it, and learn whether it
helped. The change is either a pump setting (basal, correction factor, carb
ratio) or a habit (bolus timing, carb counting, how a low is treated).
**Diagnose** ranks those changes by health impact, **Changes** shows whether
the committed change helped, and **Day** answers "what happened yesterday?"
and is where any claim can be checked against one real day. They're reading their own glucose/insulin data
under real stakes, often already tired or stressed from the condition itself —
not a casual analytics audience.

## Product Purpose

Reads off what Control-IQ actually delivered during clean windows to suggest
basal/ISF/I:C adjustments and surface behavioral coaching — strictly
**advisory**, never writes to the pump. Success is a user trusting a specific
number enough to bring it to their clinician, because the tool showed its
uncertainty and evidence rather than asserting a verdict.

**The loop is the product.** Find → commit one change (stage a setting, or start
a Focus on a habit) → see whether it helped. Habits are first-class: on most days
they cost more than settings do. A feature that serves no step of that loop is
not part of the product. (Settled 2026-09-25, after the product grew layer by
layer — settings tuner, habit tracker, day auditor, chart explorer — without
finishing one loop.)

See CONTEXT.md for
the full domain glossary and the twelve capability specifications under
`openspec/specs/` for what each part of the system is required to do, and why.

## Brand Personality

Clinical and trustworthy. Precise, calm, evidence-first — the interface reads
like a diagnostic instrument, not a wellness app. Uncertainty is shown, not
hidden (silence is a verdict, ADR 0009); nothing is asserted more confidently
than the underlying data supports. The existing teal/muted-terracotta palette
and restrained neutrals already carry this correctly — extend it, don't
soften it toward warmth or playfulness.

## Anti-references

- **Consumer health/wellness apps** (Apple Health, MyFitnessPal, gamified
  fitness trackers): no badges, streaks, cheerful mascots, or congratulatory
  copy. This is a clinical instrument the user consults to make a real
  decision, not a habit-gamification product.
- **Generic SaaS analytics dashboards**: no hero-KPI-tile templates, gradient
  accent cards, or stock chart-library defaults. Every visualization should be
  purpose-built to the domain data it's showing (see the existing chart
  builders in `frontend/*.js`).

## Design Principles

- **Advisory, never asserted.** No surface implies the tool changed or will
  change a pump setting; suggestions are always framed as suggestions with
  evidence attached.
- **Show uncertainty, don't hide it.** Thin data gets a wide confidence
  interval and its `n`, never a silent gap or a confident-looking number
  (ADR 0009, ADR 0011).
- **Two-tier disclosure.** Conclusion first, reasoning on expand, raw
  internals behind a dev flag (ADR 0024) — every surface, not just some.
  Don't make the default view dense with internals a first-time user doesn't
  need.
- **Job-shaped, not feature-shaped.** Organize around what the user came to
  do — Diagnose / Changes / Day (ADR 397) — not around which engineering
  milestone shipped a given analyzer (ADR 0027).
- **Charts are evidence, not destinations.** Every chart answers "why should I
  believe this item?" for one queue item or one day. Browsing every slot or meal
  for its own sake is not a job this product serves; Day is the one place for
  free browsing.
- **A queue item is something you can act on.** Each one carries a plain "what
  to do differently" and its action (stage, or Focus). What can't be acted on is
  context inside an item's evidence, not a row of its own.
- **Finish before adding.** A new surface or analyzer waits until the loop it
  serves works end to end.
- **Reuse the domain's own visual language.** Basal/ISF/I:C/behavioral
  evidence each have an established chart idiom in the shipped builders under
  `frontend/`; extend those rather than reaching for generic dashboard
  components.

## Accessibility & Inclusion

WCAG AA baseline (contrast, keyboard nav, reduced motion), with a stricter bar
on color: glucose high/low/in-range/target semantics must never rely on color
alone — pair with shape, position, or label redundancy (the existing
`--high`/`--low`/`--in-range`/`--on-target` tokens need a non-color tell
wherever they're the only signal, e.g. daily chart bands, evidence markers).
Single-user personal tool; no other known accessibility needs beyond this.

## #404 evidence and follow-up amendment

Readable destination paths preserve old links. A Focus action is shown only
when the backend admits it; a withholding reason and served parent route remain
visible otherwise. Local reconciliation after an existing input write or stale
startup never changes clinical policy, an immutable Trial ending, or a GET.
