# Design — Unified browser exposure population (#64)

## ADR 64 — Browser fixtures derive identity and time from one exposure population

**Context.** The workstation fixture is generated in Python from a fixed seed.
The event-comparison capture is generated separately in JavaScript. #62 made
the JavaScript generator borrow five workstation meal pairs, repeated across
twenty comparison occurrences, but left lows independent. The result passes
both byte-drift checks while carrying no shared lows, meal dates outside the
event capture's source window, and additional low dates beyond that window.

The event-comparison projection selects by its server-owned opaque occurrence
id. Its published episode-and-time pair is only a join key: production permits
two occurrences to share that pair, and #62 deliberately preserved that rule.

**Decision.**

1. `.claude/qa/gen_synthetic_fixtures.py` selects one `browser_exposures`
   `{window, exposures}` object through its existing production-reader/fallback
   decision. Its two fields populate `explore-exposures.capture.json` beneath
   that file's existing `authorized` / `synthetic` / `why` provenance wrapper,
   and the two-field object is also written as `payload.json`'s `exposures`
   field beneath that file's `_generated_by` / `_note` wrapper.
   `payload.exposures` is the canonical committed browser input; provenance
   wrappers are not part of the equality claim and remain unchanged.
2. The event-comparison generator consumes `payload.exposures` and remains the
   owner of comparison-only cohort, verdict, trace, and support shapes. It does
   not manufacture a second identity or calendar.
3. `capture.source_window` is deep-equal to
   `payload.exposures.window`; the start and end are inclusive fixture dates.
   Every comparison occurrence date must lie within that closed interval, and
   every projected response republishes the same object.
4. Every comparison occurrence must resolve to a row in the shared exposure
   population. The episode-and-time pair remains a join key, never the
   selection address and never an assumed-unique key; the opaque comparison
   occurrence id remains authoritative.
5. `generate.mjs` becomes import-safe around one local interface that builds and
   validates a capture from a supplied workstation exposure object. Each source
   family must contain exactly the comparison plan's twenty rows, which are
   consumed by index without modulo recycling; removing a row is therefore a
   named incomplete-population failure. A deliberate repeated join pair lives
   in the source rows, not in the mapping algorithm. The CLI and dependency-free
   negative tests use that same interface; no validator-only mirror or new
   module is added.
6. Regeneration order is workstation fixture, event capture, then the real
   Python projection mirror in `frontend/__fixtures__/event-comparison-mirror.json`.
   Their existing checks remain the fail-closed drift boundary; no parallel
   hand-maintained mirror or new CI step is added.
7. The frozen browser ledger proves the relationship for both families through
   the visible roster-to-By event selection path. Stable story S40 observes the
   actual request URL's `occ` value as well as the selected response and drawn
   trace. Fixture-shape assertions alone are supporting checks, not a substitute
   for that public-interface proof.

**Consequences.**

- The synthetic exposure generator may need more manufactured meal and low rows
  to preserve the comparison fixture's support shapes without accidentally
  recycling five meal pairs four ways. At least one deliberate repeated pair
  remains so the existing browser story continues to prove that the join key is
  not a unique selection address. All rows remain fixed-seed and
  provenance-stamped.
- Fixture counts and dates may change, but production APIs, schemas, selection
  semantics, support thresholds, and rendered design do not.
- The #62 meal story is strengthened to observe the request it makes. S40 is its
  lows counterpart and closes the evidence gap that #64 exists to remove.
