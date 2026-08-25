# Tasks — event chart baseline populations (#180)

Handed to `/epic` as #181, to map and slice. The layering below is the
recommendation this decision settled, not a completed plan.

## 1. Reach a case file by lever and window

- [ ] Make case-file preparation answer a lever-and-window request, not only a
      Finding that fired.
- [ ] Scope the attribution equations to Finding-keyed requests, so a
      lever-and-window request is not measured against a claim it does not carry.
- [ ] Retire the standalone comparison projection, its vocabulary, its request
      coordinates, and its schema; move or retire every fixture, mirror and
      drift check that fed it.

## 2. Build the one comparison

- [ ] Assemble the three partitioning cohorts per the ADR's identity table.
- [ ] Take out only the Occurrences this lever matched; leave in the ones
      another lever claimed.
- [ ] Anchor both cross-Exposure pairs on a meal dose per the ADR.
- [ ] Serve the cohort counts, the not-comparable count, and the cohort names.
- [ ] Serve the state a Withheld comparison population produces: the matched line
      alone, saying the comparison is unavailable.
- [ ] Cover each lever through the public interface: partition, counts
      reconciling against the Exposure population, near-misses drawn once,
      Comparison support unchanged, and no Occurrence claimed by another lever
      removed from the comparison line.

## 3. Render it

- [ ] Render the three lines plus the reader's selected Occurrence trace, on the
      served names and counts.
- [ ] Amend the frozen behavior ledger and replay it against the built app.
- [ ] Regenerate every affected synthetic capture through its generator, with
      each `--check` preserved.

## 4. Fold into the baseline

- [ ] Update the two capability statements that assert five event cohorts, in
      the pull request that makes them false. Both are accurate until then,
      which is why the decision record alone does not touch them. Find them by
      their text, not by line number: the surfaces capability requires
      "authoritative counts, full roster, 12-bucket clock, five event cohorts,
      selection", and the behavioral-layer capability requires the drill-down to
      read "the five server-declared cohorts".
