# Tasks — event chart baseline populations (#180)

Handed to `/epic` to map and slice. The layering below is the recommendation
this decision settled, not a completed plan.

## 1. Reach a case file by factor and window

- [ ] Make case-file preparation answer a factor-and-window request, not only a
      finding that fired.
- [ ] Scope the attribution equations to finding-keyed requests, so a
      factor-and-window request is not measured against a claim it does not carry.
- [ ] Retire the standalone comparison projection, its vocabulary, its request
      coordinates, and its schema; move or retire every fixture, mirror and
      drift check that fed it.

## 2. Build the one comparison

- [ ] Assemble the three partitioning cohorts per the ADR's identity table.
- [ ] Take out only the occurrences this factor matched; leave in the ones
      another factor claimed.
- [ ] Anchor both cross-family pairs on a meal dose per the ADR.
- [ ] Serve the cohort counts, the not-comparable count, and the cohort names.
- [ ] Serve the thin-window state that draws the matched line alone.
- [ ] Cover each factor through the public interface: partition, counts
      reconciling against the population, near-misses drawn once, sparse
      occurrences counted not drawn, and no other-factor occurrence removed.

## 3. Render it

- [ ] Render the three lines plus the reader's selected trace, on the served
      names and counts.
- [ ] Amend the frozen behavior ledger and replay it against the built app.
- [ ] Regenerate every affected synthetic capture through its generator, with
      each `--check` preserved.

## 4. Fold into the baseline

- [ ] Update the two capability statements that assert the five event cohorts —
      `openspec/specs/surfaces/spec.md:55-57` and
      `openspec/specs/behavioral-layer/spec.md:39` — in the pull request that
      makes them false. Both are accurate until then, which is why the decision
      record alone does not touch them.
