# Scope ledger — retire the legacy basal ribbon block (#104)

Split out of #102's triage. Two items travel together: a deletion question about
an inert basal block in the shell, and the findings-queue support noun that #102
explicitly left behind.

## Decisions

### D1 — The legacy basal block is dead at runtime, verified live

Decision: the basal-tier / basal-block / coverage-ribbon / evidence-strip cluster
in `frontend/index.html` cannot render, and the deletion is warranted.

Why: the root component is `createApp({...})` at `frontend/index.html:3786` with
no `template:` key, mounted at `:5855` onto `#app`. Its template is therefore the
in-DOM markup, which spans `frontend/index.html:1432-2323` and nothing else. Every
identifier the cluster exposes through the setup return at `:5790-5792`
(`basalTierMeta`, `activeBasalTiers`, `toggleBasalTier`, `basalTierCounts`,
`basalChangeCount`, `basalBlocks`, `visibleBasalBlocks`, `collapsedBlocks`,
`toggleBlock`, `basalSlotNote`, `ribbonEl`, `setEvidenceStripEl`) appears nowhere
in that range. No `ref="ribbonEl"` exists in the file, and no element carries
`.ribbon-card`, `.ribbon-chart` or `.ribbon-legend` — those class names occur only
in the stylesheet at `:355-359`. `renderRibbonChart` (`:4672`) returns at its first
guard because `ribbonEl.value` is permanently `null`, and `renderEvidenceStrips`
(`:4705`) iterates `evidenceStripEls`, which only `setEvidenceStripEl` ever
populates and which no markup calls.

Disposition: inline.

### D2 — Deletion boundary: the named cluster and its transitive orphans, nothing wider

Decision: delete the cluster plus the `chart-builders.js` exports it is the only
caller of, and stop there.

Why: `buildRibbonOption` (`frontend/chart-builders.js:552-686`), `ribbonYMax`
(`:540-548`) and `buildEvidenceStripOption` (`:690-763`) are reached only from the
dead cluster and from `frontend/chart-builders.test.js:270-289`. `basalTier`
(`:70-79`) is called at `:568`, `:585`, `:597` and `:623` — all inside
`buildRibbonOption` — and otherwise only from the dead cluster and that same test,
so it orphans with them. `fmt`, `direction` and `LANE_SPAN` are also imported at
`frontend/index.html:2355` but stay: `fmt` renders in the live template at
`:1781`, `:1818`, `:1819` and `:1856`, `direction` is used at `:5213`, and
`LANE_SPAN` at `:3322`.

The reachability sweep incidentally found that many other root-component exports
(`dashboardGroups`, `icFindings`, the whole `scn*` family, `backtest*`, `verify*`)
are likewise absent from the in-DOM template. That is a much larger and separate
question about how much of the shell is retired; it is explicitly out of this
ticket. In particular `frontend/index.html:4467`
(`'Not enough clean overnight-fasting steps yet.'`) belongs to `dashboardGroups`,
not to the basal block, even though #102's boundary list cites it — it is not
deleted here.

Disposition: inline.

### D3 — Item 1 changes no rendered surface, so it follows the staging-entry precedent

Decision: the deletion carries lifecycle `none`, a source-inventory regression
test, and an OpenSpec change record — but no behavior-ledger amendment and no
operator retirement sanction.

Why: the repo has two prior retirements and they differ on exactly this point.
`openspec/changes/retire-legacy-occurrences-popup/` retired a route a user could
still reach with a stale `#diagnose?modal=occurrences` bookmark, so it owed the
Cockpit shell ledger a permanent `R1` record carrying a named, dated, quoted
operator sanction (enforced at `frontend/cockpit-shell.browser.test.mjs:82-107`).
`openspec/changes/retire-staging-entry-rule/` retired an unreachable selector
family with no user-observable behavior, and owed only a closed source inventory
plus decision records — its `Impact` reads "No rendered surface … changes". The
ribbon block has no template binding, no route and no URL parameter, so nothing
user-observable is being retired and it matches the second precedent.

Disposition: inline. Recorded as an open decision on the work order, because it is
the one point a reviewer may reasonably contest.

### D4 — Item 2 is a shipped-surface revision

Decision: the findings-queue support noun carries lifecycle `revise`.

Why: `support.noun` is emitted by `ciq_autotune/findings_projection.py:337` and
painted verbatim by `frontend/diagnose-findings-queue.js:124` and `:255-257`, so a
queue row reads "19 clean nights" on screen today. The surface is
"Finding → evidence routing (Diagnose + Verify)", `shipped` in `mockups/INDEX.md`.
Its contract is the frozen ledger `mockups/finding-evidence-routing.behavior.md`
(★ FROZEN 2026-08-21) plus the app-only replay
`frontend/diagnose-workstation-behavior.replay.mjs`. The safe start is declared in
`AGENTS.md` under "The data boundary":
`uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`,
the database generated in full by `scripts/gen_revise_e2e_db.py` from seed 620;
the replay's deterministic API reads come from
`mockups/diagnose-workstation.synthetic/payload.json`, generated by
`.claude/qa/gen_synthetic_fixtures.py` from a fixed seed. The ledger constrains the
support line by shape, not by literal: line 753 requires "the support denominator
in that parameter's own noun". No ledger story, replay or browser gate asserts the
string "clean night" anywhere.

Disposition: inline.

### D5 — Refuted: the exploration does not fail when the violation disappears

Decision: the issue's claim that the design exploration "fails its build when the
violation disappears" is wrong, and the order must not carry it.

Why: `voiceProjection`
(`mockups/finding-evidence-routing.exploration/build.mjs:313-332`) throws only when
`touched === 0`, and `touched` counts title respellings as well as noun
respellings. Executed against the committed fixture, `windows.global` holds 8 rows,
of which 3 titles match the `RANGE` pattern and only 2 carry the `clean nights`
noun. With the noun corrected at source, `touched` is still 3 and the build does
not throw. The `STEADY_NOUN` map at `:286` simply stops matching, and the emitted
`data.json` is unchanged, because it already contains the respelled
"nights of steady data".

Consequence: `STEADY_NOUN` becomes a no-op once the source is fixed, which the
charter's no-dead-code rule says to remove. The surrounding `voiceProjection` pass
stays — it still does the rule-8 title work.

Disposition: inline.

### D6 — The exploration extracts the shell's stylesheet verbatim

Decision: deleting the ribbon CSS obliges an exploration rebuild in the same
change.

Why: `mockups/finding-evidence-routing.exploration/build.mjs:1441-1467` lifts every
`<style>` block out of `frontend/index.html` into `app-base.extracted.css`, and the
ribbon rules are present in the committed artifact at
`mockups/finding-evidence-routing.exploration/app-base.extracted.css:329-334`. CI
runs `node mockups/finding-evidence-routing.exploration/build.mjs --check` in the
frontend job, so an un-regenerated artifact fails the build. This is the exact
drift class `AGENTS.md` warns about.

Disposition: inline.

### D7 — Shape: two serial chunks

Decision: chunk 1 is the deletion, chunk 2 is the noun revision, serial after 1.

Why: the trait rubric fires four traits — multiple deliverable artifacts, live run
inside the ticket, split-path evidence (the Python projection and its JS mirror
held identical by test), and lockstep copies of one fact (source, mirror, fixture
generator, committed fixture, unit test, exploration map). Two or more traits mean
slice. The ticket sits between anchor rows 90 and F and takes the more conservative
reading of 90: serial chunks, not parallel. They must be serial rather than
parallel because both regenerate artifacts under
`mockups/finding-evidence-routing.exploration/` and both touch the OpenSpec change
folder. The deletion goes first so that chunk 2's base replay freeze is taken
against the final shell.

Disposition: inline.

### Risk contract

- **Must prevent:** deleting any source the running app can reach; changing any
  analyzer, safety predicate, recommendation, staging eligibility or Plan
  behavior; changing what a wearer is advised to do; publishing real health data.
- **Must recover:** nothing automatically.
- **Accepted failure:** none for the deletion — an inventory that cannot prove the
  removed identifiers are absent, or a replay that cannot prove the queue still
  renders, fails the change rather than degrading.
- **Unsupported:** a wider dead-code sweep of `frontend/index.html` beyond the
  named cluster; restoring the coverage ribbon or the evidence strips as a
  rendered surface; retiring "clean nights" anywhere `#102` owns
  (`frontend/diagnose-workstation.js`, `.claude/qa/gen_synthetic_fixtures.py`);
  engine docstrings and code comments, which `DESIGN.md` scopes out; verification
  against real pump data or a fetch-enabled server.
- **Evidence owed:** a source-inventory test that fails on the ticket base and
  passes after the deletion; the projection mirror held identical to the
  regenerated fixture window for window; every frozen story for the
  finding→evidence surface replaying green against the built branch; before/after
  renders of a findings-queue row carrying a basal support denominator; the fast
  gate and the public-tree leg green.

Why: both items are presentation-only and neither moves a number, but they sit on
the surface a wearer reads to judge advisory insulin-dosing guidance, and the
deletion's whole risk is over-deletion.

Disposition: copied unchanged into the work order posted on #104.

## Spike — both items executed in this worktree and reverted

Run at base `7cddfe9`. Every number below was measured, not estimated. The tree was
restored with `git checkout -- .` afterwards.

**Environment.** A fresh worktree fails one backend test with
`ModuleNotFoundError: No module named 'uvicorn'`
(`tests/test_cli.py::DbResolutionTest::test_serve_passes_resolved_path_to_app_factory`).
That is the venv, not the code: `uv sync --frozen --extra api --extra sync` clears
it. Baselines after the sync are **pytest 1965 passed / 1 skipped** and
**node --test 433 pass / 0 fail**.

**Item 1 — the deletion.** Removing `frontend/index.html:4508-4726` (the whole
`#57 Basal` block through its `watch`), the theme-toggle re-render at `:4119`, the
two resize lines at `:5586-5587`, the three setup-return lines at `:5790-5792`, and
narrowing the import at `:2354-2355` to `buildLanesOption` / `fmt` / `direction` /
`LANE_SPAN`; plus `frontend/chart-builders.js:535-763` (`ribbonYMax`,
`buildRibbonOption`, `buildEvidenceStripOption`) and `:68-79` (`basalTier` with its
comment), leaving that file at 523 lines; plus the two imports and two tests in
`frontend/chart-builders.test.js`. Result: **431 pass / 0 fail** — the 433 baseline
minus exactly the two deleted tests, with nothing else broken.

The dead stylesheet set was derived mechanically, not by eye: with every `<style>`
block stripped from `frontend/index.html`, none of these 43 class names occurs in
any markup or JavaScript under `frontend/`, and the remaining four (`tag-change`,
`tag-confirmed`, `tag-insufficient`, `tag-nodata`) occur exactly once each, in the
`TIER_TAG` table at `:4574-4579` that the deletion removes:

```
ribbon-card ribbon-chart ribbon-legend evidence-strip-chart basal-lede
sw-prog sw-solid sw-hatch sw-hollow sw-gap tier-toggle
diff-block diff-block-body diff-block-head diff-block-tag diff-block-title
diff-caret diff-range diff-cell diff-fold diff-n diff-note diff-rate diff-row
diff-time diff-gutter g-add g-context g-del g-nodata g-unver
r-add r-del r-unver hunk-actions hunk-detail hunk-head hunk-why
unver-why range-legend basal-block-row basal-block-actions basal-block-member
tag-change tag-confirmed tag-insufficient tag-nodata
```

Deleting every rule whose selector draws only on that closed set removes **59
rules**. The `#57` stylesheet region (`:349-568`) contains many other dead
selectors belonging to other retired features (`daily-*`, `fd-*`,
`finding-callout*`, `flag-*`, `glossary*`); they are deliberately left alone.

`node mockups/finding-evidence-routing.exploration/build.mjs --check` then fails
with `stale artifact: … app-base.extracted.css`, exactly as D6 predicts. Rebuilding
clears it, changes that artifact by **59 deletions and nothing else**, and leaves
`data.json` and `evidence-table.extracted.js` byte-identical.

Four stale comments survive the deletion and must be corrected in the same change:
`frontend/chart-builders.js:10` and `:17`, and `frontend/index.html:2348` and
`:2350` (line numbers before deletion), all of which still describe
`renderRibbonChart`/`renderEvidenceStrips`/`chartColors`/`ribbonYMax`.

**Item 2 — the noun.** Three literal edits — `ciq_autotune/findings_projection.py`
(`"noun": "clean nights"`), `mockups/findings-projection.mirror.mjs:214`
(`noun: 'clean nights'`) and `frontend/diagnose-findings-queue.test.js:199` — then
`uv run python scripts/gen_findings_projection_fixtures.py`. The regenerated
fixture's diff is **exactly 16 noun lines changed and nothing else**; its `--check`
then reports `findings-projection fixtures current`; `node --test` returns to
**433 pass / 0 fail**; and pytest stays at 1965 passed / 1 skipped.

The exploration's `--check` stays green across that change without any edit,
confirming D5.

**A trap found by executing it.** Removing the now-dead `STEADY_NOUN` map naively —
dropping the `support` re-assignment from `voiceProjection`'s returned row — makes
`data.json` stale, because the spread moves `support` to a different key position
and `JSON.stringify` preserves insertion order. The removal must keep the object's
shape, retaining `support: row.support ? { ...row.support, noun } : row.support`
and only dropping the `respelled` lookup. Done that way the artifact stays
byte-identical and `--check` stays green.

**Guards.** `check_adr_numbers` reports 26 ADRs in 19 design.md files;
`check_owned_identifiers` 30 rules passed; `check_public_allowlist` 334 cleared /
507 excluded; `check_public_links` 302 shipping documents, all resolving;
`scan_public_tree` 334 scanned, 18 stamped, 5 pinned, 160 acknowledged dose-ratio,
0 findings. Unchanged by either item.

## Open questions

- Whether the Cockpit shell's frozen ledger owes a permanent retirement record and
  an operator sanction for the ribbon block. D3 says no, on the
  `retire-staging-entry-rule` precedent. Carried to the work order as the single
  open decision.

## Spawned tasks

None.
