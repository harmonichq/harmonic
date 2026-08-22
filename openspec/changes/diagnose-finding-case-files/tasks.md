# Tasks — Diagnose Finding case files

## 1. Own the case-file population on the server

- [x] Add one deep preparation built inside one SQLite read snapshot. Publish an
      independently versioned case-file-ready queue plus an opaque `projection_id`
      from a new preparation endpoint, and require the id with the Finding,
      alignment, and optional Occurrence selection. The id owns the clock window.
- [x] Add one identity-bearing opportunity builder for meals, sub-70 runs,
      adjacent correction pairs, and >250 runs; make `_exposure_counts` derive
      lengths from it and let case files consume the same objects.
- [x] Associate every attributed Lever instance to one opportunity in its declared
      Exposure, including the caused-low split's rebound High back to its source
      Low; fail closed for an unresolvable association.
- [x] Wrap the authoritative Findings projection without forking its policy; keep
      ADR 22's future history/selection pass-through mandatory.
- [x] Implement ADR 79's exact schemas and bounded lease/version registry, including
      raw-query 400 mapping, lock-coupled commit/acquire, single-flight, capacity,
      concurrent-bump, pinning, expiry, and immediate-addressability tests.
- [x] Add the read-only HTTP route and preserve the ranked Findings endpoint's
      separate queue responsibility.
- [x] Implement ADR 79's declared-family algebra and fixed event table for
      correction clusters and Highs without changing classifier/support semantics
      or widening the legacy event-comparison HTTP endpoint.
- [x] Prove the four families, `claimed < fired`, snapshot invalidation, selection,
      adjacent-pair identity, near-low withholding, every request/recovery/lifetime
      row, and all population equations through the public interface.

## 2. Revise the shipped Diagnose consumer

- [x] Remove the title-keyed alignment family map and the browser-side
      `(family, ep_id, t)` population join from the Finding drill path.
- [x] Open every visible Finding through the server case-file response; render
      the response's counts, roster, selection, and clock/event projection
      without re-deriving membership or silently falling back.
- [x] Add correction-cluster and Highs rendering to the existing event surface,
      reusing its visual and accessibility grammar.
- [x] Amend and replay the frozen Finding-evidence behavior ledger against the
      base and revision apps using the declared no-fetch synthetic server.
- [x] Produce the exact 64-row render manifest: 52 image paths and the 12 declared
      base-recovery N/A cells, across both viewports and themes.

## 3. Close the regression hole

- [x] Generate production-shaped Finding and case-file responses from committed
      synthetic inputs. Serve them independently in the browser harness; do not
      inject one shared JavaScript population into both handlers.
- [x] Cover nonempty meal, correction-cluster, and Highs rosters; band/denominator
      reconciliation; persistent event alignment; Meal bolus fell short; visible
      row open; selected Occurrence chart rendering; failed and superseded
      requests.
- [x] Regenerate every affected fixture and mirror, run their drift checks, and
      keep synthetic provenance and contamination guards intact.
- [x] Run the full fast gate, every committed drift check, and all nine browser
      gate legs exactly as `AGENTS.md` documents. Use only the sanctioned
      no-fetch synthetic server command.
