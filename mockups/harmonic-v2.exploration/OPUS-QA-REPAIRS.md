# Cold-walkthrough repair pass — navigation and acknowledgment

The repair pass on the selected desktop exploration for #348, taken from baseline
`efabb5a7` after three independent cold walkthroughs. It is not a new concept
round and carries no round number of its own.

**Fable** leads this exploration and authored the direction and every frame
repaired here (`FABLE-LEAD.md`, `FABLE-REVIEW.md`). **Opus 5 (medium)** authored
this repair pass at Connor's explicit direction.

**Not a visual lock, and nothing here is approved.** The exploration stays
unlocked; exact final visual approval remains the user's.

## The hierarchy this pass settles

The desk already had a rule and kept it unevenly: **an outcome is acknowledged
on its own subject, and the subject does not change under the wearer.** Every
confirmed defect was a place that navigated away before the acknowledgment could
be read, or a level with no way back up.

* **Overview — the decision.** The stage keeps its comparison, glucose and
  figures. The reading pane carries the concern's own action, its progress when
  a change is underway, and one route named in the words Changes already uses
  (`Inspect nights` / `Inspect lows`). The brief exists because the original
  brief makes the current change and its progress lead.
* **Explore — the evidence.** The findings roster leads its pane; every level
  under it has a visible parent — the roster, the `Findings` crumb in the slot
  lane's head, the global Explore control, and Escape.
* **Changes — the record.** A finished Trial lands on its saved record, with its
  conclusion, before any other concern is offered.
* **Day — clinical content and context retained, navigation changed.** The five
  tracks, Episode Log, week ribbon, stats and the exact night/member return are
  untouched. What changed: a utility's Day entry now names its origin and
  returns to that utility, and arriving at Day places focus on the pane head.

## Accepted

| Finding | Change |
|---|---|
| A-01 / B-09 / C-031 Overview and Explore blur | Overview's pane is the decision plus one `Inspect …` route; Explore owns the roster and detail. The stage is identical on both, by intent. |
| A-05 / B-18 All basal slots has no parent | A `Findings` crumb in the lane's head; Escape steps night → figure → index. |
| A-05 Re-pressing Explore does nothing | The global Explore control, pressed while in Explore, returns to the index. Contextual returns do not come through it, so they keep their subject. |
| A-11 / B-12 Set aside moves subject silently | The concern stays in hand with `Set aside` and `Restore` on its own head, its reason, the roster's set-aside group, and the next ranked concern in one press. |
| B-11 Trial finish shows the next habit first | A finished setting change opens on its saved record in Changes, with `Findings` and `Inspect nights` as the ways on. |
| **Follow-up blocker: `Inspect nights` opened the current next finding** | The Trial's `Inspect nights` now opens the evidence that Trial was decided from — the slot lane at the original read, held on the slot the change moved — never the current read's first-ranked concern. |
| C-006 / C-010 Focus lost entering evidence and Day | Arriving at a destination focuses the reading pane's head unless the caller named its own target, so the existing precise return focus is unchanged. |
| C-022 Carb questions → Day returned to Explore | The entry names the question and its moment; the return reads `Return to Carb questions` and reopens that pane on the originating question. |
| C-030 Escape in Settings unpredictable | One Escape always leaves an open utility, from inside its fields too, and returns focus to its launcher. Unsaved edits stay in the page exactly as on Close — no automatic discard, no new confirmation. |
| B-08 `15 of 14 days` | Once the source's own readiness says the requirement is met: `15 days · 14 required`, bar full rather than overfilled — the rule the Trial nameplate already used. |
| B-04 Two competing recovery controls | The retry names its object: `Retry saving the draft` / `Retry recording the decision`. Neither control removed. |
| B-03 `3 / 16 segments` | `3 of 16 segments used`. 16 is the profile's segment **capacity**; the reviewer's proposed wording said the opposite and was not adopted. |

## Rejected

* **`Next in line` and the other tiers** — approved ranking vocabulary from the
  shipped findings queue.
* **Generic metric and card scaffolding on Overview** — dashboard furniture,
  hero numbers and decorative tiles. This is not a rejection of the current
  change and its progress leading, which the brief requires and the decision
  pane delivers.
* **`display:none` duplicates, empty month cells** — not demonstrated defects; C
  attributed both to naïve selectors in its own automation.
* **Automatic discard of an unsaved Settings draft, and a dirty-form
  confirmation** — the visible UI promises neither; retention is the contract.
* **Extra confirmation on Start Focus, new persistence, any new support, ranking
  or clinical rule** — out of scope by intent.
* **C-032's missing read-failure retry** — the toggle was never consumed by the
  control used, as C recorded. Unverified coverage, not a defect.

## Deferred

* **A-07 cohort controls beside the comparison legend.** The cohort rows sit in
  the reading pane under the roster; the chart key above them stays
  non-interactive. The shipped comparison legend was not edited and no cohort is
  hidden. Still open, honestly recorded rather than claimed.
* **The standalone source stories** are focused evidence examples. The shared
  journey carries the full findings roster and is the verified application
  navigation flow; the separate Late bolus story still shares its evidence frame
  across Overview and Explore.
* **Escape inside a native `<select>` in an open utility** now closes the
  utility rather than the dropdown.

**Closed by coordinator evidence:** set-aside visibility was in doubt when this
pass was written. It was verified at 1280×720 for both branches — header
`Restore`, the reason and set-aside group, and the next ranked row are all
visible without scrolling.

## Known prototype limits

Unchanged: no persistence across refresh, page memory only; the capture holds no
decision after the first, so a second change cannot stage in this history; the
following read shows the review time as its read time; review controls are
instrumentation, not product chrome. Mobile deferred. No production module,
fixture, generator or shipped renderer was edited.

## Verification — completed coordinator receipt

**The coordinator executed every browser run** in Chromium and supplied the
logs and renders. The author inspected those supplied PNGs with an image tool
and **never launched a browser**.

Syntax, after the route correction: `node --check` exited 0 with no diagnostics
on all six edited modules; `git diff --check` exited 0 with no diagnostics. The
generator check for this pass exited 0 — `harmonic-v2 design: current` — and no
generated input changed after it.

**Route verification, freshly loaded Chromium** (`final-route-browser.log`,
every command and assertion OK, no FAIL, `CONSOLE_ERRORS []`): the ready Trial's
`Inspect nights` selected and focused original basal cell 7 (03:30–04:00) with
all 48 cells present; `Findings` opened the current index; finishing showed the
exact saved conclusion; the record's `Inspect nights` returned to cell 7 under
`READ JUN 1, 2024 · 23:59 · VIEWED JUN 18, 2024 · 12:00`; May 4's Day entry and
the exact slot/night/focus return passed; Changes reopened the identical saved
conclusion. The origin line `From the Trial record` is accepted as concise
provenance on this original-read view.

**Follow-up walkthroughs** (Sol medium, separate pages, follow-up verification
rather than fresh cold assessments — not a human study and not clinical
validation):

* First-time-user: all 11 assigned criteria passed, including first-entry
  destination difference, all basal exits, the exact slot/night Day return,
  set-aside reasons with Restore and the next named concern inside the 1280×720
  viewport, and all three cohorts with occurrence navigation. Flow 5,
  navigation 4, evidence 4, recovery 5.
* Keyboard: all 11 reachable criteria passed; Settings `Clear` unverified
  because no credentials were saved. Flow 5, navigation 4, evidence 5,
  recovery 5.
* Analytical: save and read retry, the completed record with `Findings` and
  reopen, the full Focus ending and the July 4 preemption all passed. Its one
  failure was this `Inspect nights` route (FV-B-07). The same reviewer has since
  rechecked it against the final fresh-browser log and renders — ready and
  finished Trial to the original slot, current `Findings`, the exact Day return,
  the unchanged saved conclusion and the dropped Focus record all passing — and
  closed it. It reports no unresolved findings, retaining flow 4, navigation 4,
  evidence 5, recovery 5.

Exact final visual approval remains open and is the user's.
