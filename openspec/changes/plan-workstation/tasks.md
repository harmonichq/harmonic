# Tasks — Plan shares the Diagnose workstation composition (#344)

Triage (2026-09-05) already landed on this branch: the frozen Plan behavior
ledger, its replay (16 of 16 on base `aeb37c6a`), the parity guard, the
surface-ledger row, the wireframe renders and the base evidence set.

## 1. Recompose the Plan surface against the frozen ledger

- [ ] Add `frontend/plan-workstation.css`: a `.pw` host declared the way
      `frontend/verify-workstation.css` declares `.vw` — the same `--ck-*`
      token block value-for-value (pad 12, gap 10, radius 8, body 12.5px,
      micro 10px, data 12px mono), the `.main-content > div:has(.pw)` height
      chain, a `.plan-strip` on the shipped instrument-row values (14px inset,
      7px cap gap, micro-caps `.cap`, mono `.meta`, a right-aligned
      `.strip-note`), `.panes` as `minmax(0, 1fr) var(--side, 430px)`, `.pane`
      with `header` (micro-caps `h2`, mono `.meta`) and a scrolling `.body`,
      and the Plan furniture moved out of `frontend/index.html`'s style block:
      the active-profile reference, the accepted-chip row, the deliverable
      table (mono tabular cells, `input.plan-value`, provenance tints for
      `prov-accepted` and `prov-edited`, the `current →` hint, the new-break
      pill), the reconcile block, the history block. Below 760px the panes
      stack (schedule first) and the schedule table sits in an
      `overflow-x: auto` scrollport. Link the sheet in `frontend/index.html`
      after `verify-workstation.css` and before `theme.css`.
- [ ] Rewrite the Plan tab markup in `frontend/index.html` (keep the
      `<!-- ==== PLAN ==== -->` banner comment that `frontend/index.test.js`
      slices on) as `<div class="pw plan-surface">`: the strip (Profile cap,
      the profile name or `IDP n`, `DIA {h}h · max bolus {U}U · carb entry
      on|off`, the other-profiles `.pill.warn`, and a `.strip-note` reading the
      reconcile summary — pending, on-pump as-of, or mismatch count); the left
      `.pane` headed "Deliverable — pump-ready schedule" with the `{n} / 16
      segments` `.pill` (warn above 16) as its meta, the explanatory sentence,
      and the deliverable table exactly as shipped (same columns, same `Term`
      headers, same `td.deliverable-cell` classes, same `input.plan-value`
      change handler, same `new break` pill); the right `.pane` headed "Case
      file" holding, in order, the `.plan-review-guidance` banner when set,
      the "Accepted changes" block (count `.pill`, the "Nothing accepted yet"
      copy with its `.plan-diagnose-link`, the `.accepted-chip` row with
      `.chip-jump` and `.chip-remove`), the "Reconcile" block (the
      `.data-quality-banner` on-pump line with its confirm `.dqb-link`, the
      `.reconcile-mismatch` block with its `.reconcile-diff` table and
      `.reconcile-actions`, and the pending / matches-pump / nothing-to-deliver
      copy), the `details.active-profile-ref` reference exactly as shipped,
      and the "Apply history" block with its table when history is non-empty.
      The three no-profile states (error, loading, not configured) render in
      the left pane body. Every handler, computed and copy string is the
      shipped one; no new frontend gate, threshold or direction is derived.
- [ ] Extend `frontend/theme.css`'s role selectors from `:is(.dw, .vw)` to
      `:is(.dw, .vw, .pw)` for pane body, pane header rail and the instrument
      rail (adding `.pw .plan-strip` beside `.vw .verify-strip`), and update
      the file's role comment and `DESIGN.md`'s role note (lines 116–119) to
      name the third host. Nothing else in `theme.css` moves.
- [ ] Update the two drivers that pinned the old chrome:
      `frontend/plan-first-match.browser.mjs` locates the deliverable by its
      heading ("Deliverable — pump-ready") inside the `.pw` surface instead of
      `.card.full`, keeping every assertion; `frontend/cockpit-shell.browser.test.mjs`
      keeps `.active-profile-ref` as Plan's readiness selector unchanged.
- [ ] Register the replay: add a `Plan behaviour ledger` leg to the
      browser-gates matrix in `.github/workflows/ci.yml` (`vendor: true`,
      `TARGET=app node frontend/plan-behavior.replay.mjs`) and list the leg in
      `CLAUDE.md`'s browser-gate command block.
- [ ] Verification for this task, all green locally before handing back:
      `node --test 'frontend/**/*.test.js'`; `uv run python -m pytest`;
      `npx --yes @fission-ai/openspec@1 validate --all --strict`; the three
      `scripts/check_*.py` guards; `TARGET=app node frontend/plan-behavior.replay.mjs`
      reporting `16 of 16 stories passed` at 1440×900 and `ONLY=S3,S4,S10,S11`
      at 1024×768 and 390×844; `node frontend/plan-first-match.browser.mjs`;
      `node --test frontend/cockpit-shell.browser.test.mjs`. Browser legs run
      with escalated permissions (`AGENTS.md`, sandbox rule).

## 2. Live run, evidence and polish

- [ ] Serve the ticket worktree through the declared QA copy-then-serve
      command and a second worktree at base `aeb37c6a` on a distinct port
      from its own scratch copy of the same showcase. Capture Plan's
      nothing-staged state on both at 1440×900, 1024×768 and 390×844 into
      `evidence/revision/live/` and `evidence/base/live/`.
- [ ] Capture the stubbed-state renders on the revision:
      `PLAN_EVIDENCE_DIR=openspec/changes/plan-workstation/evidence/revision`
      at the same three viewports (S3, S4, S10, S11 narrow; the full set at
      1440×900).
- [ ] Run `/ui-craft audit` and `/ui-craft polish` against the revision in the
      running app: console clean, no unstubbed requests, keyboard path through
      the chips, inputs and reconcile buttons, contrast on every ink/ground
      pair the sheet introduces, no horizontal page overflow at 390px. Fix
      what the run exposes in the same task; re-run task 1's verification
      after every fix.
- [ ] Write `evidence/README.md` naming every capture pair (base ↔ revision),
      the story each evidences, the viewport, and the replay's raw output on
      the revision (`16 of 16`). Stamp every ledger story `replayed-pass on
      revision` in `mockups/plan.behavior.md`.
- [ ] Delete `wireframes/plan-arrangements.html`; keep `wireframes/shots/`.
      Update the Plan row in `mockups/INDEX.md` to name the evidence path.
- [ ] Verification for this task: everything in task 1's list, plus the
      evidence README present and every ledger story stamped.
