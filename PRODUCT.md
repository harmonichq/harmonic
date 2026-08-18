# Product

## Register

product

## Users

A single user: a Tandem Control-IQ pump wearer analyzing their own pump/CGM
history, self-hosting this tool against their own local SQLite store. No
multi-tenant, no accounts beyond one optional API token. They arrive with one
of three jobs (ADR 0027): **Diagnose** ("I've been going low after dinner" →
ranked levers to act on), **Verify** ("I changed settings last week, did it
help?" → outcome trends), or **Forensics** ("I crashed yesterday, what
happened?" → one day's chart). They're reading their own glucose/insulin data
under real stakes, often already tired or stressed from the condition itself —
not a casual analytics audience.

## Product Purpose

Reads off what Control-IQ actually delivered during clean windows to suggest
basal/ISF/I:C adjustments and surface behavioral coaching — strictly
**advisory**, never writes to the pump. Success is a user trusting a specific
number enough to bring it to their clinician, because the tool showed its
uncertainty and evidence rather than asserting a verdict. See CONTEXT.md for
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
  do — Diagnose / Verify / Day — not around which engineering milestone shipped
  a given analyzer (ADR 0027).
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
