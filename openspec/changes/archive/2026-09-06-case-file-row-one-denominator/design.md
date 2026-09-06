# Design

## ADR 353 — The wrapped Finding row keeps every family, leads with the case file's, and recomposes its sentence

**Context.** `finding_case_file.wrap` publishes `rendered_rows`, the array the
Diagnose queue and the evidence canvas both read. For each finding row it
replaced `appearances` with a **single-element** list built from the prepared
case file's summary, replaced `episodes`, and kept the findings projection's
`headline`.

Two populations answer the same question here. The projection counts a
family's in-window occurrences from the exposures feed; the case file counts
its own window-filtered roster, which `behavioral-layer`'s "One canonical
opportunity population owns every Finding case file" makes the owner of the
denominator, the attributed count and the roster. That requirement governs
*whose numbers* a family's counts are. It says nothing about *how many
families* a rendered row may carry, and the frozen queue contract term 35 —
"A finding in two families keeps BOTH; never a merged total"
(`frontend/diagnose-findings-queue.js`, pinned by
`frontend/diagnose-findings-queue.test.js`) — answers that separately. The two
rules are jointly satisfiable, and the pre-change wrapper satisfied neither
cleanly: it dropped the second family and it left a sentence composed from the
appearances it had just discarded.

**Decision.** The rendered row retains every family appearance the projection
published. The case file's own family carries the case file's claimed count,
denominator and noun; every other family keeps the counts the projection
published for it. The case file's family is published **first**, and the row's
`headline` is then recomposed from that list through the findings projection's
own headline composer.

Leading with the anchored family is the whole of the ordering decision, and it
is load-bearing. `findings_projection._finding_rows` sorts a row's appearances
by family name before publishing (`entry["appearances"].sort(key=lambda a:
a["family"])`), and `_finding_headline` composes from `appearances[0]`. On
`finding:carb_undercount` that sort puts `correction_clusters` ahead of the
case file's family, which is exactly how a fifteen-occurrence habit came to be
announced as a one-occurrence one. `wrap` therefore does **not** re-sort: it
places the anchored appearance at index 0 and appends the projection's other
families in the order the projection published them. Re-sorting the wrapped
list by family name would restore the defect verbatim.

Two alternatives were rejected.

*Stop replacing `appearances` and let the projection's counts stand.* Rejected:
it moves the queue's detail line, the crumb meta and the drill statline off the
population the behavioral-layer spec makes their owner, to fix a sentence.

*Keep the name sort and pass an explicit family into the composer.* Rejected:
it forks the sanctioned template into a second call shape and leaves
`appearances[0]` disagreeing with the sentence beside it — the very
contradiction this ticket removes.

Recomposing through the projection's composer rather than restating the
sentence keeps one implementation of the sanctioned template
(`{verdict}. Showed up in {appearances[0].n} of {appearances[0].m}
{appearances[0].noun} in this window.`, sanctioned 2026-09-03 under
`## Headline templates` in the archived `2026-09-03-left-column-pattern` design
record). No new template is served and no new operator sanction is owed for the
wording: the same sentence is composed from the row the reader is shown.

**Consequences.** The preparation's `findings` payload is deliberately left as
the projection composed it, so `GET /api/diagnose/findings` and the rendered
rows still report different denominators for the same finding. That is the
pre-existing two-population design, not a regression, and no shipped surface
renders both: the queue and the canvas read `rendered_rows` alone. The gate
consequence of that divergence is the subject of the second record below.

The committed synthetic Diagnose capture's projection rows never ran the
projection's headline pass, so they carried no headline for the wrapper to
preserve; recomposing gives them one and the capture is regenerated.

## ADR 353 — The browser-gate preparation adapter mirrors the wrapped row, and the replay reads what the surface renders

**Context.** `frontend/browser-fixture-population.js` is what every browser
gate and the `harness/` dev server serve as the preparation response. It
rebuilds `rendered_rows` from the freshly projected rows and copies seven
fields off the committed capture — `appearances`, `episodes`, `evidence`,
`verdict_counts`, `verdict_counts_by_family`, `event_chart`, `case_header` —
and **not** `headline`. It is a hand-written second implementation of `wrap`,
and AGENTS.md's standing rule about extracts binds it: a guard whose input has
gone stale reports zero failures while measuring the wrong thing.

Left alone, the adapter would keep composing nothing and every browser gate
would keep serving the pre-fix sentence: the fix would ship with zero browser
coverage of the behaviour it fixes.

**Decision.** The adapter mirrors the wrapped row faithfully — the full
appearances list in `wrap`'s order and the recomposed `headline` — and composes
through `findingHeadline`, newly **exported** from
`mockups/findings-projection.mirror.mjs` rather than restated in the adapter.
The mirror remains a transcription held identical to the Python projection by
`frontend/findings-projection-mirror.test.js` (decision record 735); exporting
a composer it already contains adds no second source of truth, where a third
copy of the sentence would.

The anchored family's counts come from the committed capture and the other
families' from the freshly re-run projection, because the capture is generated
for one fixed window while the gates request arbitrary ones. The case-file
population is what the capture holds; the other families' in-window counts are
window-dependent. That split is what the real `wrap` does with a live
`prepared`, which is why the adapter can mirror it.

**Consequence — S132, S130 and S139 move their source.** The replay's
`servedRows` helper fetches `/api/diagnose/findings`, and its own comment
claims that is "the projection the rail and the stage both consumed". That
claim is false: the rail and the stage read `rendered_rows`. The two agreed
before this change only because the adapter never copied `headline`, so the
gate was structurally blind to the defect it was best placed to catch.

After the fix they diverge on **every** finding row of the committed capture,
measured below — and the replay was run in that state to see which stories
actually notice. Exactly one does: **S132 fails**, on the Morning window, with
the stage showing the case file's `1 of 10 lows` against the endpoint's
`4 of 6 lows`. S130 and S139 pass either way, because S130 compares row
identity and S139 asserts a sentence's *absence* from the rail.

So the divergence is measured, not assumed, and it is S132 that forces the
move. `servedRows` is repointed at
`/api/diagnose/finding-case-file-preparation`'s `rendered_rows` and its comment
corrected. The helper moves whole rather than only S132's call, because the
comment is false for all three of its callers and because S139's
headline-absence check is otherwise left naming a string no surface prints —
a guard that passes for the wrong reason, which is the failure mode this whole
change is about. S130 and S139 were re-measured on the moved source rather than
assumed; the result is recorded below.

That moves the frozen behaviour ledger
`mockups/finding-evidence-routing.behavior.md`, whose S132 entry pins the stage
title to the served headline. The amendment is written and flagged **pending
operator sanction at the #350 sweep pull request**; it is not self-sanctioned
here, and no sanction line is written that the operator has not given. The
amendment issues exactly one new executable, **C62**, pinning in the browser
that a two-family rendered row keeps both families, leads with the case file's
own, and composes its stage headline from that lead. C58–C61 are reserved for
the sibling children of sweep #350; C62 is this ticket's.

The alternative — leave the adapter unfaithful and record the divergence as
accepted — was rejected because it ships a fix with no browser coverage and
leaves a documented extract stale, which is the failure mode AGENTS.md
describes as invisible to any amount of auditing the guard itself.

## Measured before drafting

Every block below is a command and its output, run in
`/Users/connor/worktrees/harmonic/353` at HEAD `abb85005`, with the spike
applied to `ciq_autotune/finding_case_file.py`,
`frontend/browser-fixture-population.js`,
`mockups/findings-projection.mirror.mjs` and the regenerated capture. No
operator snapshot was read; every reproduction is synthetic.

### The defect and the fix, side by side — no browser, no database

The script builds a `PreparedCases` from the existing test helpers, gives its
projection row two families in the projection's own family-name order, and
prints the projection row beside `wrap`'s rendered row.

```
$ uv run python .../measure/repro.py            # with the fix applied
projection appearances: [{'family': 'correction_clusters', 'noun': 'correction clusters', 'n': 2, 'm': 2}, {'family': 'meals', 'noun': 'meals', 'n': 3, 'm': 20}]
projection headline   : Ranks among this window's findings. Showed up in 2 of 2 correction clusters in this window.
rendered  appearances : [{'family': 'meals', 'noun': 'meals', 'n': 1, 'm': 1}, {'family': 'correction_clusters', 'noun': 'correction clusters', 'n': 2, 'm': 2}]
rendered  headline    : Ranks among this window's findings. Showed up in 1 of 1 meals in this window.

$ git stash push -- ciq_autotune/finding_case_file.py
$ uv run python .../measure/repro.py            # pre-change wrapper
projection appearances: [{'family': 'correction_clusters', 'noun': 'correction clusters', 'n': 2, 'm': 2}, {'family': 'meals', 'noun': 'meals', 'n': 3, 'm': 20}]
projection headline   : Ranks among this window's findings. Showed up in 2 of 2 correction clusters in this window.
rendered  appearances : [{'family': 'meals', 'noun': 'meals', 'n': 1, 'm': 1}]
rendered  headline    : Ranks among this window's findings. Showed up in 2 of 2 correction clusters in this window.
```

Both defects are in those four pre-change lines: `correction_clusters` is gone
from the rendered row, and the sentence beside `meals 1 of 1` announces
`2 of 2 correction clusters`. Post-change both families survive, `meals` leads
with the case file's counts, `correction_clusters` keeps the projection's, and
the sentence names the lead.

### The browser adapter, before and after — the S132 question

The script projects `mockups/diagnose-workstation.synthetic/payload.json`
through `mockups/findings-projection.mirror.mjs`, joins the committed capture
through `populateFindingCasePreparation`, and prints the projection row beside
the served row for both committed window presets.

```
$ node .../measure/browser-divergence.mjs
--- whole day ---
finding:over_treated_low
  projection appearances [{"family":"lows","noun":"lows","n":15,"m":20}]
  served    appearances [{"family":"lows","m":10,"n":1,"noun":"lows"}]
finding:correction_on_iob
  projection appearances [{"family":"correction_clusters","noun":"correction clusters","n":2,"m":2},{"family":"lows","noun":"lows","n":3,"m":20}]
  served    appearances [{"family":"lows","m":10,"n":1,"noun":"lows"},{"family":"correction_clusters","noun":"correction clusters","n":2,"m":2}]
finding:missed_meal
  projection appearances [{"family":"highs","noun":"highs","n":3,"m":4}]
  served    appearances [{"family":"highs","m":10,"n":1,"noun":"highs"}]
finding:late_bolus
  projection appearances [{"family":"meals","noun":"meals","n":2,"m":20}]
  served    appearances [{"family":"meals","m":10,"n":1,"noun":"meals"}]
--- Morning 360-720 ---
finding:over_treated_low
  projection appearances [{"family":"lows","noun":"lows","n":4,"m":6}]
  served    appearances [{"family":"lows","m":10,"n":1,"noun":"lows"}]
finding:correction_on_iob
  projection appearances [{"family":"correction_clusters","noun":"correction clusters","n":1,"m":1},{"family":"lows","noun":"lows","n":2,"m":6}]
  served    appearances [{"family":"lows","m":10,"n":1,"noun":"lows"},{"family":"correction_clusters","noun":"correction clusters","n":1,"m":1}]
finding:late_bolus
  projection appearances [{"family":"meals","noun":"meals","n":1,"m":4}]
  served    appearances [{"family":"meals","m":10,"n":1,"noun":"meals"}]
finding:missed_meal
  projection appearances [{"family":"highs","noun":"highs","n":1,"m":1}]
  served    appearances [{"family":"highs","m":10,"n":1,"noun":"highs"}]
```

Two facts settle S132. The adapter preserves both families on
`finding:correction_on_iob` with `lows` — the case file's family — leading at
the case file's `1 of 10`, and `correction_clusters` retaining the
projection's. And the served counts differ from the projection's on **every**
finding row in **both** committed window presets, so a headline composed from
each differs too. A story that renders `rendered_rows` and asserts against
`/api/diagnose/findings` cannot pass once the adapter is faithful. That is why
task 6 moves the source rather than accepting the divergence.

### The gate legs

```
$ uv run python -m pytest -q          # clean branch, before any edit
2227 passed, 1 skipped, 185 warnings, 120 subtests passed
```

```
$ uv run python -m pytest -q          # fix applied, capture NOT yet regenerated,
                                      # test allowlist NOT yet updated
FAILED tests/test_check_demo_fixtures.py::RealEndToEndTest::test_real_check_passes_on_unmodified_tree
FAILED tests/test_finding_case_file.py::test_named_field_wrapper_preserves_unknown_row_and_top_level_selection
2 failed, 2225 passed, 1 skipped, 185 warnings, 120 subtests passed in 848.27s (0:14:08)
```

```
$ uv run python -m pytest -q          # fix applied, capture regenerated,
                                      # test allowlist still NOT updated
FAILED tests/test_finding_case_file.py::test_named_field_wrapper_preserves_unknown_row_and_top_level_selection
1 failed, 2226 passed, 1 skipped, 185 warnings, 120 subtests passed in 1111.36s (0:18:31)
```

The surviving failure reports `Extra items in the left set: 'headline'` — it is
task 3 exactly. Regenerating the capture cleared the drift failure and nothing
else in 2226 tests moved, so the whole fix costs two known test edits and the
count returns to the 2227 baseline before task 1's own regression is added.

```
$ uv run python scripts/check_demo_fixtures.py     # after regenerating the capture
verify-660-story: current (mockups/verify-660-story.synthetic)
diagnose-workstation: current (mockups/diagnose-workstation.synthetic)
EXIT=0
```

Regenerating changed exactly one file by eight added lines — one headline per
finding row in `mockups/diagnose-workstation.synthetic/finding-case-files.json`.
The generator's other outputs were byte-identical. Adding the second family to
`wrap` moved no capture appearance, because the generator's own projection rows
carry a single family each.

```
$ node --test 'frontend/**/*.test.js'
ℹ tests 589
ℹ suites 2
ℹ pass 589
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

```
$ npx --yes @fission-ai/openspec@1 validate --all --strict
Totals: 73 passed, 0 failed (73 items)
EXIT=0

$ python3 scripts/check_adr_numbers.py
check-adr: 122 ADRs in 67 design.md files, all identities unique and issue-keyed.
EXIT=0

$ python3 scripts/check_owned_identifiers.py
check-owned-identifiers: 30 owned-identifier rules passed.
EXIT=0

$ python3 scripts/check_public_allowlist.py
check-public-allowlist: 398 tracked file(s) cleared to ship, 1545 excluded. Every tracked path dispositioned.
EXIT=0
```

Those four ran before this design record gained its second ADR; the ADR count
is one higher once it lands, which is what the order's expectation states.

```
$ eval "$(python3 scripts/ensure_browser_gate_env.py)"
$ PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
    node --test frontend/diagnose-workstation.browser.test.mjs
ℹ tests 60
ℹ suites 0
ℹ pass 60
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 250240.653416
```

```
$ scratch="${TMPDIR:-/tmp}/harmonic-qa-e2e-353.sqlite"
$ rm -f "$scratch" "$scratch-wal" "$scratch-shm" "$scratch.derived.sqlite"
$ cp mockups/qa-e2e.synthetic/harmonic.sqlite "$scratch"
$ uv run harmonic serve --no-fetch --token '' --db "$scratch" --port 8771   # second terminal
$ BASE_URL=http://127.0.0.1:8771 TARGET=app \
    PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
    node frontend/diagnose-workstation-behavior.replay.mjs
  ok S128
  ok S129
  ok S130
  ok S131
FAIL S132 — S132 the stage title and subtitle together are finding:over_treated_low's served headline, verbatim: expected "Not ranked in this window yet. Showed up in 4 of 6 lows in this window.", got "Not ranked in this window yet. Showed up in 1 of 10 lows in this window."
  ok S133
  ...
  ok S139
  ...
  ok S144
app: 162 of 163 stories passed
EXIT=1
```

That is the whole S132 question, measured rather than argued. With the adapter
faithful and `servedRows` still on `/api/diagnose/findings`, the stage prints
the case file's `1 of 10 lows` and the endpoint answers the projection's
`4 of 6 lows`. One story of 163 notices, and it is the one whose entire subject
is the served headline. The port here is 8771 only because another agent's
server held 8765; the command is otherwise the AGENTS.md safe start verbatim.

Repointing `servedRows` at the preparation's `rendered_rows` — the whole of
task 6, and nothing else changed — turns that run green:

```
$ BASE_URL=http://127.0.0.1:8771 TARGET=app \
    PAYLOAD=mockups/diagnose-workstation.synthetic/payload.json \
    node frontend/diagnose-workstation-behavior.replay.mjs
  ok S130
  ok S132
  ok S139
app: 163 of 163 stories passed
EXIT=0
```

So the move is sufficient as well as necessary, and S130 and S139 hold on the
new source rather than being assumed to. 163 is the story count before C62;
with C62 the same command reads 164 of 164.

Chromium launches in this environment; the sandbox failure mode AGENTS.md
documents did not occur, so no browser result here is a sandbox artifact.
