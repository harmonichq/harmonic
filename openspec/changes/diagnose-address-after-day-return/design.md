# #428 design record

## ADR 428 — Diagnose's address names the case the reader is on

### Decision

Once the reader acts inside Diagnose, the address names the case the reader is
on, and the Day entry Diagnose writes names its return target by the
Occurrence's served id instead of a CSS selector.

1. **What the address names.** The *case address* carries exactly the keys the
   entry restoration already reads: `subject` (the rail row the drill came from —
   a Finding or Pattern id — or the basal slot, `basal:<start>`), `occurrence`
   (the selected Occurrence's served id, only while one is selected) and `window`
   (the open case file's served window as `<start>-<end>`, or the slot's span),
   written the same way the Day entry writes them today. It also keeps `from` when
   the entry's `from` names a destination other than Diagnose, because Diagnose
   itself renders that return (the Changes "Return to Trial" control reads
   `from=changes`). It carries no `date`, `moment`, `lever` or `focus`. At the
   Findings index there is no case, and the address is `/diagnose` with at most
   that `from`. The rule is `frontend/tab-routing.js`'s, as the address's one
   owner; its behaviour is spiked in `docs/scope/428-case-address.spike.mjs`.
2. **When it is written.** Every change to the case the workstation publishes
   (point 4) rewrites the address, whatever caused it, whenever no entry
   restoration is pending. The trigger is the published case, not a list of
   controls. A rail-row pick, an Occurrence selected, cleared or stepped with
   ↑/↓, a clock window chosen, drawn or cleared with Escape, a basal slot picked
   by pointer or arrow key, a chart tile that drills a different Finding, a step
   back by crumb or Backspace, and a case file re-scoped by a window choice
   answering are examples; a path not named here writes the same way.
   An entry restoration is pending from the read that applies a contextual entry
   until the named case, and its named Occurrence, are on screen, or until the
   reader's first trusted pointer press, or key press other than Tab or a bare
   modifier, anywhere on the page while Diagnose is current; that input ends the
   restoration, because the entry it was restoring is superseded. The
   restoration's own presses are untrusted and never end it, and its settling
   writes nothing by itself. So the address a Day return writes stays exactly as
   today until the case next changes (HV2-14's return context and the
   canonical-door browser test pin it). A Diagnose session with no contextual
   entry is addressed from its first case change, in every session and not only
   after a Day visit: a reload after any drill re-opens that case instead of
   #413's cold 24 h Findings arrival, which still holds for a bare `/diagnose`.
3. **How it is written.** In place: the router replaces its held context and the
   current history entry's address, with no new history entry, no navigation
   count, no render and no focus change. A pushed entry per change would make
   Back a full Diagnose re-read per step (a popstate is a navigation, and a
   navigation to an unparked Diagnose re-reads), and it would add history steps
   Diagnose never had; the history keeps exactly the entries it had before this
   change, each naming what its destination restores.
4. **One case, one projection.** The workstation owns the drill, so it publishes
   the case it has on screen, and both the address and the Day entry's
   `subject`, `occurrence` and `window` read that one publication. The Day entry
   stops deriving them from the Focus offer's selection (`caseContext`), which a
   window choice clears (`frontend/diagnose.js`, the capture click listener),
   and from the lane button's label. `date`, `moment` and `lever` still come from
   the Occurrence, as today.
5. **The return target is the Occurrence id.** The Diagnose-origin Day entry
   carries no `focus` key; its `occurrence` already names the control to return
   to, and a second key holding the same id would be one fact written twice. On
   return, Diagnose puts focus on that Occurrence's own Open in Day control, or on
   the Occurrence row when the control is absent, or on the crumb when the
   Occurrence is gone. This holds on both return paths: a return that re-reads
   (the entry restoration) and a retained return (below). A Changes entry into
   Diagnose drops its `focus: '#crumb-trail'`, which the restoration then no
   longer reads and which only ever named the default.
6. **A Day return to the held case is retained.** Because the address, and so the
   entry Diagnose holds, now names the case the reader drilled, a Day return that
   names the same subject, Occurrence and window compares equal under ADR 414 and
   is a retained return: one status read, no guidance or evidence read, the drill
   and scroll kept, and the return focus of point 5 placed when the root re-seats.
   Today every Day return re-reads, only because the held entry was empty.
7. **A return that names no case is retained.** A return into a parked Diagnose
   whose context names no case (no `subject`, `occurrence` or `window` — a plain
   Diagnose press from Changes or Day) is an ADR 414 retained return whatever
   entry the desk last held, and the address is then replaced with the retained
   case. The desk keeps the held case as its entry but not the held `from`: a
   direct entry invents neither a prior subject nor a return (`frontend/routes.js`
   `navigate`), so after a topbar press no `from=changes` is kept or re-added and
   "Return to Trial" does not reappear. A contextual entry naming a different
   case still re-reads, and a repeated press of Diagnose while on Diagnose still
   re-reads to the Findings index (S3). This conforms the code to ADR 414's own
   requirement, which re-reads on "a contextual entry whose subject, occurrence
   or window differs from the retained entry"; the requirement's text does not
   change.
8. **Restoration applies a preset window.** Reloading a case address re-opens it
   through the existing entry restoration. When a Finding's `window` equals one of
   the Window control's presets (Overnight, Morning, Afternoon, Evening, 24 h), the
   restoration presses that preset before opening the row. A Finding with no
   window keeps today's 24 h press; a Pattern keeps its 24 h press and its served
   window; a basal slot keeps today's lane restore.

### Authority

Connor Griffin, 2026-09-23, in the release coordinator's session, decision D2:
"once the reader acts inside Diagnose, the address names the case the reader is
on. The CSS-selector `focus` in the address becomes an occurrence id." The same
session recorded his standing sanction for this release's shipped-surface
revisions and behavior-ledger amendments (Q2): "Yes. I record your answer as the
approval for every change these 13 checklists call for, and write the wording in
CONTEXT.md terms." The coordinator ruled the `from` clause of point 7 in plan
review round 1. Points 2 to 8 are otherwise the triage worker's calls that make
D2 hold; each is reviewed with this change.

### Grounding

- `frontend/routes.js` writes the address only inside `navigate()`, which always
  pushes and bumps the navigation count; `startDesk` adopts the parsed address
  once and `subscribeRoute` re-adopts it on popstate.
- `frontend/day.js` `dayReturnContext` hands the whole Day entry, minus its memo
  key, to `navigate(back.destination, context)`, and sets the router's focus
  request from the entry's `focus`.
- `frontend/diagnose.js` builds the Day entry with
  `focus: '.occ-foot button:last-child'` and reads `entry.focus` in
  `restoreEntry`; its `mount` treats a return as a re-read unless the root is
  parked and `sameEntry(previous, next)` holds on subject, occurrence and window,
  so an empty entry differs from a stored Day context.
- The drill changes through more than clicks inside the Diagnose root: a
  document-level keydown in `frontend/diagnose-workstation.js` pops the drill on
  Backspace and steps the selected Occurrence or night on ↑/↓, another clears a
  drawn window on Escape, and a chart tile can drill a different Finding
  (`chartClickRoute` in `frontend/diagnose-canvas-state.js`). None of these reaches
  `frontend/diagnose.js`'s capture click listener, which is why the trigger is
  the published case.
- Every workstation drill frame carries the rail row it came from (`rowId`), a
  case frame its selected Occurrence and its served case file, and a slot frame
  its cell (`frontend/diagnose-workstation.js`).
- The workstation boots on the Overnight preset; `restoreEntry` presses 24 h only
  for a Pattern, a Finding with no window, or no subject, so a Finding in any
  other preset window re-opens on Overnight today, on a Day return or a reload.
- A C2 replay comment on S37b says "only a destination handoff publishes subject
  in the URL". No story asserts it; the comment is superseded by this decision.
  No existing story or browser test reloads after a Diagnose drill.
- Reproduced in process on origin/main a4d374a7 (scratch test, not committed):
  the Diagnose-origin Day entry's `focus` is the selector; the Day return writes
  every Day key into the Diagnose address; the router exports no in-place write;
  a `navigate()` from inside Diagnose is a new navigation; and a direct Diagnose
  return after a Day-return entry issues a full guidance read.

### Consequences

HV2-14 holds unchanged in substance: the Diagnose-origin Day entry still carries
a precise return target, named by the Occurrence id. ADR 414's requirement text
is unchanged; its retained return now also covers a plain return after a Day
visit and a Day return to the held case. A basal night's Day entry carries the
selected night's Occurrence id where it carried a date. The desk's router gains
one in-place write, the workstation one published case, and Diagnose one
page-level reader-input listener that ends a pending restoration; none adds a
request. The Changes and utility Day entries keep their own selector-shaped
return targets until their follow-up issue.

## Risk contract

- **Must prevent:** while no entry restoration is pending, a Diagnose address
  that names a case, Occurrence or window other than the one on screen (the
  drawn-window reload below excepted); a CSS selector in a Diagnose address once
  its case has changed, or in a Diagnose-origin Day address; a new history entry
  per in-Diagnose case change; a retained Diagnose shown as current after a store
  write or a failed re-read (ADR 414 and HV2-29 unchanged); secret exposure,
  irreversible loss of authoritative data, silent incorrect success.
- **Must recover:** none automatic beyond today's. A case address whose subject or
  Occurrence is no longer served restores as far as today's entry restoration
  does.
- **Accepted failure:** a case in a drawn clock window is named by that window,
  but a reload re-opens it on the Overnight preset (no public way exists to draw
  a window from an address), and the restored address keeps naming the drawn
  window until the case on screen next changes. The Findings index after a window
  choice is addressed as `/diagnose`, so a reload lands on the 24 h Findings
  (#413's cold arrival).
- **Unsupported:** Back and Forward stepping through in-Diagnose case changes; an
  alignment, chart-tile, carb-ratio block or correction-factor sub-drill in the
  address (the address names the rail row it came from); selector-shaped return
  targets in Changes and utility Day addresses; a utility-origin Day return into
  Diagnose.
- **Evidence owed:** the case-address rule and the in-place write through the
  routing owner's interface; Diagnose re-addresses on every published-case change
  while no restoration is pending, including one path outside the listed examples
  (↓ after a Day return and Backspace to Findings), and never during a pending
  restoration; the first reader input ends a pending restoration; the
  Diagnose-origin Day entry carries no `focus` and names its Occurrence;
  exact-return focus on both return paths; a plain return after a Day-return
  entry makes one status read, keeps the drill and drops the held `from`; a
  contextual entry naming a different case still re-reads; preset-window
  restoration; the failing-first browser test and stories S136–S138 at both
  desktop sizes, with S24, S26, S33, S35, S37, S61, S62, S108 and S109 still
  passing.

Why: the address and the retention return are one state machine whose failure
mode is a link or a return that silently shows a different case.
Disposition: copied into the #428 execution lock.
