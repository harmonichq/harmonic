# Design — the graphite palette, second lock (#317)

## ADR 317 — Palette values are settled at the running app, with the operator

**Decision.** No palette value in this change is chosen headless. The
executing session serves the app through the declared safe entrypoint and
iterates it with the operator in UI Craft revise rounds; each ruling is
recorded below as a dated sanction (`Connor Griffin · <date> · "<quoted
reason>"`) before the value is committed. A value without its sanction entry is
a defect, not a draft. The executing session looks first and asks second: it
serves the app and inspects every surface itself before its first question,
and every question it does ask is rendered live as options with stated costs.

**Why.** #304's triage settled (Q1) that the finished palette is the operator's
call on the running app: the prototype was flagged as far from finished
design, and a worker cannot see what the eye rejects.

**Sanctions.** Appended by the executing session, one entry per ruling:

- High-glucose hue: _pending_.
- Verify ribbon tints: _pending_.
- Chrome bar on Plan and Day: _pending_.

## ADR 317 — Clinical attention and tappable affordance do not share a hue

**Decision.** `--high` leaves burnt orange for a hue of its own, chosen at the
app so that it is tellable at a glance from the action orange (`--primary`,
`--accent`, `--wk-signal`, `--ck-bar-signal`, `--manual-carb`), from low
(`--low`), from in-range (`--in-range`), and from the ambers already spent on
non-clinical meaning (`--warn`, `--wk-status-incomplete`, `--ck-manual`,
`--ck-meal`, `--inferred`). Orange stays the action and signal colour
everywhere. Every consumer that reads `--high` follows the token; no consumer
is re-pointed at a literal.

**Why.** Operator ruling, triage of #317, 2026-09-02: the high-glucose marks
move, not the controls; DESIGN.md and the prototype direction make burnt
orange the brand's one recurring action colour, and a high reading must never
look tappable.

## ADR 317 — The operator's eye outranks a pinned contrast floor, by sanction

**Decision.** Pinned colour literals in gates and tests re-base to the
sanctioned values freely. A pinned contrast floor (a minimum ratio a gate or
audit asserts) may move only with the operator's dated sanction recorded in
this file naming the floor, the pair it measures, the old and new bound, and
the reason the ratio measured the wrong thing. Absent that entry the floor
wins and the value is re-derived until it clears.

**Why.** Operator ruling, triage of #317, 2026-09-02 ("my eyeballs win"). UI
Craft revise already lets the eye outrank an area-blind ratio; #304's risk
contract forbids weakening a gate, and the sanction entry is what separates a
ruled re-settlement from a quiet weakening.

**Sanctioned floor changes.** None yet; appended by the executing session if
any.

## Moved tokens

The closed list of custom properties whose computed value differs between
base and revision, including tokens derived through `var()` from a moved one
(`--ck-bar-on-signal` follows `--ck-ground`, for instance); before and after
are the computed hexes. Filled by
the executing session as each ruling lands and read by the gate re-base and the
palette-only diff as their only authority. A token not listed here may not
differ between base and revision.

- _none yet_ (each entry: `--token · before `#xxxxxx` · after `#yyyyyy` · ruling`)

### Derived colour pairs

Colours that are not a moved token's own computed value but follow from one
(a `color-mix()` of `--high`, an alpha wash of it), listed as explicit
before → after pairs with the rule that derives each. The palette-only diff
admits a colour change only when its before → after pair is a moved token's
own pair or a pair listed here; a colour pair that appears in neither is an
unexplained difference and fails the run.

- _none yet_ (each entry: `before rgb(…) → after rgb(…) · derived by … · ruling`)

## Base story counts

Recorded by the executing session before the first value moves, read by the
gate re-base as the counts every leg must still report.

- `frontend/cockpit-shell.browser.test.mjs` on the base: _pending_.
- `frontend/diagnose-workstation-behavior.replay.mjs` on the base: _pending_.

## Rulings that stay narrow

- The chrome bar: on Diagnose and Verify the workstation's panes cover the
  page, so the bar already reads as its own material there. The round looks at
  Plan and Day, where cards sit on the page directly and the bar is flush with
  it, and moves the bar one step only if that reads wrong to the operator. If
  it moves, cockpit S6 amends with the sanction in the same commit; if it does
  not, S6 and its gate stay byte-identical and the "three materials" term in
  `frontend/theme.css` is amended to say the step is carried by the
  workstation. If the bar moves, the cockpit gate's chrome-surface check
  (`assertChromeSurfaces` in `frontend/cockpit-shell.browser.test.mjs`)
  keeps `shell === desk`, `footer === bar` and `control !== desk` unchanged,
  replaces `bar === desk` with `bar` pinned to the sanctioned literal and
  `bar !== desk`, raises its distinct-grounds count from 2 to 3 naming them
  (desk, bar, control), and re-points its deliberate "two grounds" mutation to
  a value that still drives that pair red; its two hairline pins stay
  byte-for-byte. That is the one structural re-base this change authorises,
  and it is the whole of it. In the same commit, S6 amends both its opening
  "exactly the desk/control ground vocabulary" phrase and its "the shell,
  stage, top bar and footer on one desk" clause quoting the sanction, and the
  gate's own rationale comment ("there are TWO grounds, not three") is swept
  to describe the ruled state.
- The Verify ribbon: 32%/18% and 20%/20% are rendered side by side on the
  same Trial and the operator picks; 32/18 is shown first as the documented
  intent. Neither committed synthetic database carries a Trial, so the render
  uses the Verify gate's fixture payload through the replay's request stub,
  from the committed opener `evidence/verify-trial-opener.mjs`, so the
  ribbon's before/after renders are evidence of record like every other
  ruling's. The ribbon fills are canvas, so the computed-style diff cannot see
  them; the renders and the Verify replay leg are their evidence.

## Safe start (UI Craft revise)

Declaration: `AGENTS.md` "The data boundary". Two permitted offline serves:
`uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite`
(the browser-gate database, `scripts/gen_revise_e2e_db.py`) and the QA
copy-then-serve block (`scripts/gen_qa_e2e_db.py`, served from a scratch
copy). A serve mutates the database it opens: the revise database is restored
from its committed bytes before any commit, and the QA database is only ever
served from a scratch copy. Base for the before/after evidence: the ticket
branch's merge-base with `origin/main`, served from a second worktree on a
distinct port.
