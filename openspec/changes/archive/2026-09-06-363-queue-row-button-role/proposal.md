# Findings-queue rows keep their control role (#363)

## Why

Every findings-queue row is a real `<button>`, and each one is given
`role="listitem"` as it is painted. ARIA roles are not additive: `listitem`
replaces the implicit `button` role, so the row stops being exposed as a control
at all. Assistive technology announces the screen's primary interaction — the
drill into a finding's case file — as static text.

Measured against this repository's own declared safe start (the QA
copy-then-serve command in `AGENTS.md`, port 8765), with the 24 h preset:

```
BUTTON.qrow priced role=listitem :: Basal 03:00 to 04:00 · lower
P.qtier    role=null     :: Worth a look
BUTTON.qrow priced role=listitem :: Over-treated low
P.tailnote role=null     :: Not recurring often enough to rank yet.
BUTTON.qrow tail role=listitem :: Correction on active insulin
BUTTON.qrow tail role=listitem :: Meal bolus fell short

button.qrow in DOM: 4 | rows exposed as role=button inside .q: 0
getByRole('button', { name }) per row title: 0, 0, 0, 0
```

The one element in the queue that *is* announced as a button is the secondary
`Watching · N reads` toggle. Not one finding row is, so a reader navigating by
control never reaches the findings.

The rows remain focusable and still fire on Enter and Space — the DOM element is
a real button — so this is an announcement defect, not a functional one, which is
why no existing gate caught it. The queue's own test asserts on classes and text,
never on exposed roles, and its DOM stub discards both the tag name it is handed
and every attribute it is set.

The intent behind the `listitem` is visible in the module: the rank numeral is
`aria-hidden` because "the numeral restates the position a screen reader already
announces". That goal is real and worth keeping. It simply does not require
discarding the button role — a wrapper carrying the list semantics with the
button inside keeps both.

## What changes

- Each queue row button is enclosed by an element carrying `role="listitem"`
  inside the existing `role="list"` container. The row element itself carries no
  `role` override, so its implicit `button` role survives.
- The queue's three adjacent-sibling spacing rules move onto that wrapper, so the
  wrapper — now the flex item of `.dw .q` — carries the spacing the row used to
  carry, and the queue's rendered rows keep the vertical positions they have now.
- The queue's Node test gains a regression case through the module's public
  render function, asserting the painted row's tag and attributes rather than its
  classes. That test is the fast-gate half of the proof.
- The Diagnose workstation browser suite gains one case that re-runs the
  reproduction above against the built app: every `button.qrow` in the queue is
  exposed with the `button` role, and a query for a control by a row's own title
  matches that row. That case is the browser half, and it is what fails today.
- The frozen behaviour ledger gains one story, `C60`, recording that a reader
  navigating by control reaches a finding and activates it. Under the shipped
  surface's `revise` lifecycle an added behaviour owes a ledger entry and a
  replay function in the same change.

## Impact

- Rendered geometry, keyboard behaviour and every `.qrow` selector the shipped
  browser suites and behaviour replays locate are unchanged. This is an
  accessibility-exposure fix: no existing behaviour story moves, none is retired,
  and no visual state changes.
- The `surfaces` capability gains an explicit requirement for how a queue row is
  exposed. Its absence is why the regression was silent.
- The ledger's three inventory lines move, which is this change's one predictable
  conflict with the other children of sweep #350.
