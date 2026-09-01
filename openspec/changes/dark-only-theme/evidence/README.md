# Evidence — the Dark surface did not move (#304)

#304 retires Light. The claim this evidence has to carry is that retiring it
changed nothing a wearer sees: the shipped Dark surface before the change and
the single shipped surface after it must resolve to the same computed style,
everywhere, apart from the Theme control that is gone.

`identity-diff.mjs` proves that by opening both builds side by side and diffing
the complete `getComputedStyle` of every element, in every gated state, at every
viewport. The base is opened with localStorage `theme` set to `dark` — the
stored choice that used to select the shipped look. The revision is opened with
nothing stored, because #304 retired the key.

All renders use the generated synthetic database
(`mockups/revise-e2e.synthetic/harmonic.sqlite`, built by
`scripts/gen_revise_e2e_db.py`) served through the mandatory `--no-fetch` flag.
No personal or production health data appears here, and no live pull runs.

## Provenance

- **Base** — `a3fce27`, the merge-base of the ticket branch with `origin/main`,
  checked out at `/Users/connor/worktrees/harmonic/304-base`, served on port
  **8766**.
- **Revision** — the ticket branch at `24a36ea`, checked out at
  `/Users/connor/worktrees/harmonic/304`, served on port **8765**.
- Both servers answer from the same committed synthetic database, so every API
  read is identical on the two sides and any difference the diff reports is a
  styling difference.

## States and viewports

Each state is reached exactly as the shipped gate that owns it reaches it — the
path the router admits, and the rendered root that gate waits on:

| State | Address | Ready signal | Gate it follows |
|---|---|---|---|
| `shell` | `/` | `.cockpit-shell` | `frontend/cockpit-shell.browser.test.mjs` |
| `shell-drawer` | `/`, drawer opened | `.cockpit-shell` | as above; the second Theme control lived in this drawer |
| `diagnose` | `/diagnose` | `.dw` | `frontend/diagnose-workstation.browser.test.mjs` |
| `verify` | `/verify` | `.vw` | `frontend/verify-660-story-behavior.replay.mjs` |
| `day` | `/day` | `.ds-root` | `frontend/day-surface.browser.mjs` |

Viewports: 1440×900, 1280×800, 390×844 — fifteen state/viewport pairs in all.
Above the cockpit breakpoint the drawer trigger is `display: none`; the
`shell-drawer` state records that on both sides and leaves the drawer closed, so
the pair stays comparable rather than failing.

## How an element is keyed

Every element is keyed by a path of `tag#id.class.class` signatures, each
suffixed with its index among the siblings sharing that same signature — never a
bare position among all siblings. A bare position shifts for every sibling after
a deleted node, which would turn the one removed Theme button into a cascade of
false differences across the whole footer. Signature keying drops exactly the
deleted node's key and leaves every survivor's key untouched.

Head resources need more than a tag: a `<script>` in `<head>` carries no id and
no class, so a bare signature makes them all identical and keys them by
position — and position is exactly what a removal destroys. Deleting the
boot-time theme gate shifted the importmap and the echarts loader up one, so the
key that disappeared was the loader's rather than the gate's. Each element inside
`<head>` is therefore named by its `src` or `href` where it has one, and an
inline `<head>` `<script>` by a short hash of its text, so a removal drops its
own key and shifts nothing.

Two elements are deliberately left keyed by position, because their bytes are
precisely what this change rewrites: the two `<style>` blocks in `<head>` (same
count and order on both sides, neither removed) and the body's module script.
Hashing either would manufacture a difference between two elements that are the
same element.

The document element is the other exception: it is signed by its tag alone,
without its class list. That class list is the single intentional DOM difference
between the two builds — the base carries the `dark` class this change retired —
and every key on the page begins with the root, so admitting it would misalign
the whole tree and compare nothing at all. Signed as bare `html`, the two roots
line up and the root's own computed style is diffed like every other element's,
which is exactly where a theme token that failed to collapse would show up.

The computed style is enumerated in full, including the custom properties the
theme tokens live in. Nothing is filtered out, so nothing can be quietly
forgiven. Each state also asserts that it compared more than zero elements: a
diff that compared nothing must never read as agreement.

## What is sanctioned, and why

Every sanctioned difference is a direct consequence of deleting the Theme
control. **No rule forgives a colour, a font, a border or a spacing token** — if
Dark had moved, no rule here could hide it.

Three rules admit a removed **element** of the control itself:

1. the footer Theme button, `button#theme-menu-button.cockpit-theme`;
2. the footer Theme preference menu, `div.cockpit-utility-menu`, and its Light
   and Dark items;
3. the navigation drawer's `<button>` labelled `Theme`.

A fourth rule admits the machinery that read the stored choice:

4. **the boot-time theme gate script** — a `<script>` under `<head>` whose text
   contains `localStorage.getItem('theme')`. Before #304 this inline gate ran
   ahead of first paint and put the `dark` class on the root element; task 1.1
   removed it along with the key it read. It is matched on **what the script
   says**, never on its position among its siblings, because a head script's
   index is not a contract.

A fifth rule admits one **computed-style** consequence:

5. **the removed Theme button's container reflows.** The footer's utilities nav
   is narrower once the Theme button is no longer one of its children, and its
   auto margin absorbs the difference. `nav.cockpit-utilities` inside
   `footer.cockpit-footer.status` may therefore differ in `width`, `inline-size`,
   `margin-left`, `margin-inline-start`, `transform-origin` and
   `perspective-origin` — and only in a pair that also recorded the footer Theme
   button's removal, so the reflow can never be claimed where its cause is
   absent. Anything else on that node, and those six properties on any other
   node, stay unexplained. The nav's own colours, fonts, borders and every one
   of its surviving children are compared normally.

The reflow appears in the ten desktop pairs (1440×900 and 1280×800 across the
five states) and in none of the five 390×844 pairs. That is not a gap in
coverage: `frontend/shell.css` line 386 puts `.cockpit-utilities { display: none; }`
inside `@media (max-width: 760px)`, so below the cockpit breakpoint the footer
utilities are not rendered at all — the same block hands navigation to the
drawer by giving `.cockpit-menu-button` a `display: grid`. An element with no
layout box has no width to lose, so both sides resolve it identically.

The report prints the rule that admitted each difference, with its values. Any
other removed element, any added element, and any other differing computed
property is an unexplained difference and fails the run. Each class of
sanctioned difference is counted separately in the summary, never folded into
one number. A run that finds **no** Theme control on the base side also fails:
that would mean the base is not the base, and a diff of two revisions proves
nothing.

## Commands

Run in three terminals, from a session that can bind a port and launch Chromium.

**1 — serve the base (port 8766):**

```sh
cd /Users/connor/worktrees/harmonic/304-base
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8766
```

**2 — serve the revision (port 8765):**

```sh
cd /Users/connor/worktrees/harmonic/304
uv run harmonic serve --no-fetch --db mockups/revise-e2e.synthetic/harmonic.sqlite --port 8765
```

**3 — provision the browser-gate toolchain, then run the diff:**

```sh
cd /Users/connor/worktrees/harmonic/304-c3
eval "$(python3 scripts/ensure_browser_gate_env.py)"
BASE_URL_BASE=http://127.0.0.1:8766 \
BASE_URL_REVISION=http://127.0.0.1:8765 \
OUT_DIR=openspec/changes/dark-only-theme/evidence \
node openspec/changes/dark-only-theme/evidence/identity-diff.mjs
```

`ensure_browser_gate_env.py` exports `PLAYWRIGHT_MODULE` and `VENDOR_DIR`; the
script requires the driver through the first and routes the app's two CDN
modules through the second, exactly as the shipped browser suites do. Every
other origin is aborted, so the run touches no network.

The script writes `identity-diff.json` (the full structured diff) and
`identity-diff.report.txt` (the human-readable report) into `OUT_DIR`, and exits
0 only when every difference falls under one of the five sanctioned rules above:
the removed Theme control nodes, the removed boot-time theme gate script, and
the utilities nav reflowing around the removed button's box.

## Output

The run passed. Base `a3fce27` on port 8766, revision `24a36ea` — the ticket
branch — on port 8765.

- **`identity-diff.run.stdout.txt`** is the run's complete stdout, verbatim.
  **stderr was empty.**
- **`identity-diff.report.txt`** is the same report as the script wrote it, and
  **`identity-diff.json`** is the full structured diff: every sanctioned removal
  and every sanctioned reflow property, with its rule, its path and both values.

The summary block, verbatim:

```
## summary
states × viewports        15
elements compared         7274
computed properties read  4190688
sanctioned Theme removals 75
sanctioned gate removals  15
sanctioned reflow diffs   60
unexplained differences   0
states comparing nothing  0

PASS: the Dark surface is identical apart from the removed Theme control.
```

Read against the rules above: the 75 Theme removals are the five deleted nodes
across all fifteen state/viewport pairs, the 15 gate removals are the boot-time
script once per pair, and the 60 reflow differences are the six properties on
`nav.cockpit-utilities` across the ten desktop pairs only. **Nothing else
differed** — not a colour, not a font, not a border, not a spacing token, over
4.19 million computed properties.
