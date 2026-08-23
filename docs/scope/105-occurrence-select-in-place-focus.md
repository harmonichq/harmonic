# Scope — #105 selecting an Occurrence in place drops keyboard focus to BODY

Ticket: harmonichq/harmonic#105. Split out of #100's triage. Sibling keyboard
tickets: #100 (drill-in focus), #96 (Align focus), #101 (roster Up/Down + focus).

## Decisions

* **Route: nothing genuinely uncertain; no specialist interview.** The one open
  point — does #101's render-path focus restore already cover selection in place —
  is a fact about a branch that does not exist yet, measurable only on the
  integration tip. The order carries the measurement instead of guessing it.
  *inline*
* **Both triggers named in the ticket are ONE code path.**
  `renderCaseRoster` (frontend/diagnose-workstation.js:559-587) gives each
  `button.ev-row.case-occurrence` a single `click` listener
  (`button.addEventListener('click', () => onSelect(row.id))`, :578). A pointer
  click and Enter on a focused button both dispatch `click`, so both reach
  `selectOcc` (:1650-1654) → `requestCase` (:1443). There is no device
  distinction anywhere in the module (`git grep "ev.detail\|pointerType"` over
  `frontend/` returns nothing). So "pointer or Enter" is not two defects.
  *inline*
* **#101's mechanism is the same mechanism this ticket needs, so this ticket
  must not implement a second one.** #101's posted order, step 3, originates its
  focus flag at "the two origination points — a roster row activated, and an
  arrow step", and consumes it at the end of `paintLevel`'s case-file branch when
  `!f.loading && f.selectedId === <id>`. "A roster row activated" IS #105's
  trigger. Charter: one fact, one implementation. *inline*
* **The residual gap is evidence, not code.** #101's S73 asserts the focus
  restore after **Enter** and after an arrow step. Nothing asserts the pointer
  half, and #101's order explicitly decided the restore is unconditional with
  respect to input device — a decision with no test holding it honest. Measured:
  `grep -n activeElement frontend/diagnose-workstation-behavior.replay.mjs`
  returns only lines 2856/2862/2865, all in the #86 filter-menu probe; the
  ~14 stories that click `.ev-row`/`.case-occurrence` assert `aria-pressed`
  and crumb depth, never focus. *inline*
* **Deliverable is a pull request either way**, so classification is `code`:
  path A (already fixed) still ships the permanent absence-of-defect story;
  path B ships that story plus the minimal reuse of #101's flag. *inline*
* **No new ADR.** Path A records no decision; path B applies ADR 101's mechanism
  to a second origination point, which is not a new load-bearing decision. There
  is no `docs/adr/` tree in this repo and creating one fails CI. *inline*

### Risk contract

* **Must prevent:** running the app any way other than the declared `--no-fetch`
  command (a bare `harmonic serve` fires a live OAuth pull against the pump
  vendor and one person's real glucose and insulin history); committing
  `tconnect-data/` or `.env`; reporting a replay as passed without running it.
* **Must recover:** nothing automatic. A missing browser prerequisite is a clear
  stop.
* **Accepted failure:** browser prerequisites unavailable → open the pull request
  as a draft naming the missing evidence, rather than claiming a green gate.
* **Unsupported:** selecting an Occurrence that sits beyond `EVIDENCE_CAP` (5,
  :202) and so has no rendered button — focus is lost to `BODY`, ruled
  unsupported by #101 and not reopened here. The roster's own "N more" button
  loses focus on its repaint too; same defect class, different control,
  deliberately out of scope.
* **Evidence owed:** one permanent replay story asserting that activating a
  roster row **by pointer** leaves focus on that row.
* **Why:** a keyboard-accessibility fix on a synthetic-data-only surface; the
  only real hazard on this ticket is the data boundary, not the change.
* **Disposition:** copied into the work order.

## Open questions

* Does the integration tip actually carry #101's restore, and does the pointer
  path pass on it? Measured by execution, first thing, per the order's step 1.
  Both answers are handled; neither blocks drafting.

## Spawned tasks

None. No follow-up tickets filed from this triage.

## Plan-review rounds

Instrumented per the triage procedure. Every blocker is tagged `authoring`
(present since the draft) or `injected` (introduced by a prior fix round).

* **Round 1 — cold panel, one reviewer.** 4 blocking, 2 notes, all `authoring`.
  1. The probe's second precondition passed on the unfixed base (it matched any
     Arrow key in the window, including the pre-#101 Left/Right handler), so the
     premise gate had no discriminating power; the order and the probe header
     both misreported the base run. Reproduced by re-running the probe.
  2. A red with the WRONG row focused — the loading-paint trap #101's own order
     documents — fell through to "fix the story, do not touch product code",
     which would launder a live defect into a green ticket.
  3. PATH B named #101's `paintLevel`-tail restore as the consumer, but #100's
     order forbids focusing from `paintLevel` and puts the consumer at the end of
     `paint()`. The two orders conflict, so the tip is the only authority, and
     the prescribed edit was probably already present — leaving PATH B with no
     authorized action.
  4. The Done-when `git diff` allowlist excluded the two `docs/scope/` files this
     branch already carries, so the gate could not be met.
  Notes: `settle` is a sleep, not a state wait, so a slow response yields the
  same `BODY` as the defect; and the pointer-versus-keyboard framing contradicts
  the order's own finding that the two are one code path.
  All six accepted. The order was rewritten clean rather than patched, and the
  probe was rewritten to classify PRE-#101 / POST-#101 off an anchor #101 commits
  to keeping.
