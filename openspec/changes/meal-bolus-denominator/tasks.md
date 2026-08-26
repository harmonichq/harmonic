# Tasks — unify lever evidence-population policy (#202)

Sliced into three serial chunks: the same fact lived in analyzer output, served
JSON, committed fixtures, a JS mirror and drift gates, which is too many lockstep
copies for one context.

## 1. The policy seam and meals recurrence

- [x] Build the per-lever evidence-population policy module, owning membership,
      noun, comparison population and name, anchor and comparison window,
      cross-population flag, and unique-occurrence identity.
- [x] Move the ADR 679 completed-meal predicate into the policy layer and have
      both the classifier and the event comparison consume it, so one surface
      cannot admit a row another rejects.
- [x] Carry the unique-meal occurrence identity through the pattern gate,
      occurrence lists, effect aggregation, ranking and the Explore association,
      with worst-episode severity and hero.
- [x] Make `k <= n` structural for this lever rather than a clamp, and record
      which levers still rely on their audited clamp, and why.
- [x] Rewire every recurrence-population consumer, or record why it stays an
      outcome-family consumer.
- [x] Record ADR 202 and the eight-lever audit table, plus a disposition row per
      consumer.

## 2. The served contracts

- [x] Replace the case-file comparison-policy branches and the comparison-name
      table with reads of the policy.
- [x] Derive the case header and finding-row denominators from the policy, so
      the lever serves a meals denominator with unique-meal occurrences in one
      occurrence-ID namespace.
- [x] Publish `population` and `cross_population` in the served case JSON.
- [x] Pin all eight levers' served family, noun, denominator, comparison name and
      cross-population flag against the audit table.

## 3. Generated evidence and its consumers

- [x] Regenerate every committed fixture whose shape these contracts changed,
      with its generator and drift gate moving together.
- [x] Update the JS projection mirror to the regenerated frozen answers.
- [x] Switch the browser validator off its lever-name derivation onto the served
      `cross_population` / `population` fields.

## Whole-diff review

Reviewing each chunk against its own slice missed defects that only the merged
result showed.

- [x] Source the demo fixture generator's rosters from the policy. It built each
      lever's roster from its Exposure family, so the shipped demo served Meal
      bolus fell short as ten meals over a roster of ten highs — the very defect
      this change exists to remove, reproduced in a generator.
- [x] Thread the scenario config through the policy, so the classifier and the
      trend account cannot measure membership against different carb thresholds
      and drive the structural guard into raising on a served path.
- [x] Consume the policy's comparison population in the case-file builder,
      rather than declaring comparison fields the code never read.
- [x] Move the meal recurrence identity and counting into the policy instead of
      an inline special case in the projection.
- [x] Restore the one-off shortfall to `1 of 1 meals`. Building the row only
      from occurrence groups had silently dropped it to `0 of 0`, because a
      single occurrence never reaches the pattern gate.
- [x] Prove the classifier and the event comparison admit the same rows, at a
      non-default meal floor.
- [x] Derive at least one lever's served shape from analyzer output built from
      synthetic events, rather than from injected members.

## Closing out

- [x] Compare the served case JSON whole against the regenerated fixtures,
      rather than stripping the new fields from one side only.
- [x] Retire the last two copies of the old ordinary-meal comparison label.
- [x] Fold this change into the baseline in the pull request that lands it.
