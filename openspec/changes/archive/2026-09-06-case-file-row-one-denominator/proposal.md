# One denominator per rendered Finding row (#353)

## Why

The Diagnose findings queue and the evidence canvas read the same array. The
Finding case-file preparation wraps every finding row it publishes: it replaces
the row's `appearances` and `episodes` with the prepared case file's own
counts — the population that owns the denominator — and leaves `headline`
exactly as the findings projection composed it, from the appearances that were
just replaced.

That produces two defects on one row.

**The counts and the sentence disagree.** The two numbers come from two
populations: the projection counts a family's in-window occurrences from the
exposures feed, the case file counts its own window-filtered roster. The queue
prints the case file's `1 of 6 lows` while the canvas nameplate, a few hundred
pixels away, prints the projection's `1 of 8 lows`.

**A finding in two families loses one of them.** The replacement publishes a
single-element `appearances` list, so the second family is dropped from the
rendered row entirely. That contradicts the frozen queue contract term 35 —
"A finding in two families keeps BOTH; never a merged total"
(`frontend/diagnose-findings-queue.js`, pinned by
`frontend/diagnose-findings-queue.test.js`). And because the projection sorts
appearances by family name, the surviving headline can name the family the case
file was *not* built from, understating a fifteen-occurrence habit as a
one-occurrence one.

The served sentence is a sanctioned template over `appearances[0]`, recorded
under `## Headline templates` in the archived `2026-09-03-left-column-pattern`
design record. A row whose `appearances[0]` no longer matches its own headline
breaks that template on the surface whose job is to say how often a habit
recurs. The frontend is not at fault: the queue prints `row.appearances`
verbatim and the focal seat prints `descriptor.headline` verbatim, which is
what both modules' contracts require.

## What Changes

- The case-file wrapper retains every family appearance the projection
  published for the finding, substitutes the case file's own claimed count,
  denominator and noun for the case file's family, and publishes that family
  first — so the sanctioned template, which reads `appearances[0]`, names the
  population that owns the denominator. Other families keep the counts the
  projection published.
- The wrapper then recomposes the row's `headline` from those same post-wrap
  fields, through the findings projection's existing headline composer, so the
  queue row, the case header summary and the served sentence are three
  printings of one fact.
- The findings projection payload the preparation carries alongside the
  rendered rows is untouched; it stays internally consistent on its own terms.
- The browser-gate preparation adapter, `frontend/browser-fixture-population.js`,
  mirrors the wrapped row faithfully — the full appearances list and the
  recomposed headline — so every browser gate and the component harness serve
  what the real endpoint serves. Left as it is, the adapter would keep serving
  the pre-fix sentence and the fix would ship with no browser coverage at all.
- The app-only replay's `servedRows` helper is repointed at the preparation's
  `rendered_rows`, the array the rail and the stage actually render, and the
  frozen behaviour ledger is amended to record that correction and to issue one
  new executable, C62, for the two-family case. That amendment is flagged
  **pending operator sanction at the #350 sweep pull request**.
- The wrap field-preservation test gains `headline` in its allowlist of fields
  the wrapper may change, and new regressions — one backend, one for the
  browser adapter — prove a two-family wrapped row keeps both families, leads
  with the case file's, and states the case file's own count in its headline.
- The committed synthetic Diagnose capture is regenerated, because its
  projection rows never ran the projection's headline pass and so carried no
  headline for the wrapper to preserve.

## Impact

Affected specs: `surfaces`.

Affected code: `ciq_autotune/finding_case_file.py`,
`tests/test_finding_case_file.py`, `mockups/findings-projection.mirror.mjs`,
`frontend/browser-fixture-population.js`,
`frontend/browser-fixture-population.test.js`,
`frontend/diagnose-workstation-behavior.replay.mjs`,
`mockups/finding-evidence-routing.behavior.md`, and the regenerated
`mockups/diagnose-workstation.synthetic/finding-case-files.json`.

No analyzer output, staging verdict, safety floor, cap, priority, rank,
denominator or population changes. No shipped frontend module changes: the
surface renders the served sentence verbatim before and after. No dose advice
changes.
