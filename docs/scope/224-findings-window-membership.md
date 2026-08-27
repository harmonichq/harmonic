# Scope ledger — Finding window membership (#224)

## Decisions

- This is a backend consistency bug, not a new UI state. The existing UI correctly
  fails closed on `inconsistent_projection`.
- The fix reuses the existing Finding-relative `outcome_kind` rule in
  `finding_case_file.py`: select the latest matching High anchor and fall back to
  the eligible meal occurrence time. It adds no policy layer or schema.
- The frozen surface contract already covers a structured unavailable response
  and a settled sliced projection. Replay those stories unchanged; do not add a
  duplicate browser story for the backend calculation.
- The separate Over-treated low association gap found during grounding is #225 and
  is out of scope.

The behavioral-layer baseline already requires Finding-relative outcome time for
clock membership, so #224 needs no new ADR or baseline amendment.

## Open questions

None.

## Review

- Round 1 found and corrected two authoring errors: the preparation response does
  not contain occurrence rosters, and only the Diagnose behavior replay declares a
  story count.
- Round 2 found two `authoring` gaps: the worktree cleanliness precondition and the
  exact multiple-anchor/fallback rule. Both were added. Requests to add another UI
  story and publish private-snapshot output were refuted against the existing
  behavior ledger and the repository's private-data boundary. Its fresh cold pass
  then found two further `authoring` test gaps: exercise multiple matching High
  anchors, and require the aggregate probe to clear the nonfatal 08:00–12:00
  mismatch as well as the two failed preparations. Both are now explicit.
- Round 3 found two `authoring` interface gaps: the regression must compare the
  separate Findings queue endpoint with the retained case roster, and it must
  preserve maximum consequence time while several episodes coalesce into one meal
  occurrence. Both were added to the same regression. A request to append raw
  snapshot command/output evidence was rejected: the reproducible aggregate probe
  is tracked, the result is summarized in the order, and private-data evidence
  remains local.
