# Design — Diagnose keeps a staged setting change across a reload (#354)

## ADR 354 — Diagnose seeds its staged marks from the shell's Plan verdict

**Context.** `frontend/diagnose-workstation.js` keeps three in-memory staged
collections (`staged`, `icStaged`, `isfStaged`) built fresh in `boot()`. They are
the only input to `stagedDescriptor()` and therefore to the watched-change dock,
to the lane's staged underline, and to each parameter panel's
`Stage change` ⇄ `Staged · Undo` button. The Plan draft they mirror lives in the
local database and is restored by the shell on every load, which is why the
cockpit's Plan step still counts an item the workstation has forgotten.

The shell already owns the reverse mapping. `frontend/index.html` passes the
workstation a `isStaged` callback (`diagnoseIsStaged`), which answers "is this
parameter item in the Plan draft?" through `stageItemsFor` and the restored
`planItems`. The workstation has never called it.

**Decision.** The workstation seeds its three collections from that callback at
boot, once, before the first paint. It does not read the Plan draft itself, does
not fetch `/api/plan`, and does not keep its own persistence.

**Why not the alternatives.**

- *Have the workstation load the draft itself.* That would be a second reader of
  the Plan draft with its own idea of what a staged item is, and Plan-item
  identity (`planKeyOf`, the I:C fan-out across member start minutes, the ISF
  fan-out across programmed segments) lives in the shell. Two readers of one fact
  diverge.
- *Have the workstation re-derive eligibility.* Forbidden. `openspec/specs/plan/spec.md`
  puts the staging decision in the analysis layer, and AGENTS.md's safety
  invariants forbid a frontend gate that re-derives a backend verdict. Seeding
  through `isStaged` inherits `stageItemsFor`'s `asserts_move === true` test
  unchanged: a slot that does not assert a move yields no Plan items, so it can
  never be seeded as staged.
- *Repaint the dock from the shell.* The dock is the inspector's floor and is
  painted by the workstation at every level (lock terms 46–48). Pushing its state
  in from outside would split ownership of one pane's furniture.

**Consequence.** Seeding runs on every `boot()`, which is every `setData` and
every `?mode=` state change, so the marks are correct on a reload, on a return to
the Diagnose tab, and after a findings refresh — not only on the reload this
ticket reported. The `?mode=slot` and `?mode=icassert` demo states keep their
existing local pre-staging, which writes nothing to the Plan draft; seeding a set
they also add to is idempotent because both are sets.

This change amends no behaviour-ledger story. `mockups/finding-evidence-routing.behavior.md`'s
P39 already states that staging "writes to the Plan draft through the app's own
callback, updates the cockpit's Plan badge, and re-paints the dock's line with
what is staged"; the defect is a surface that stopped honouring it after a
reload, so the fix restores the frozen contract rather than changing it.
