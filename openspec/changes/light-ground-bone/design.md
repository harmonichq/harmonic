# Design — light-ground-bone

## ADR 37 — The light ground is bone, not parchment

**Ruling.** Light's three grounds are `#FAF8F4` (sheet), `#F0EEE8` (rail) and
`#E7E4DC` (sunken field), divided by a `#C3BFB4` rule, over the unchanged
evergreen desk. This re-settles values inside the Harmonic theme lock (#736); it
does not reopen a term of it, and dark is untouched.

### Context

The locked light set was a parchment sheet: `#F3EADB` / `#EBE0CF` / `#E3D7C5`
over an `#AFA493` rule. Those three grounds sit within about 6% of each other in
lightness, and the rule that separates them is lighter than any of them is dark.
On a populated Diagnose surface nothing stood in front of anything — pane header
rail, sheet and table field resolved into one field of colour — so the
hierarchy the lock describes as three grounds was being carried by hue alone.

The warmth compounded it. At that chroma the family reads as beige rather than
as paper, so ink at the lock's own ratios looked faded rather than printed, and
the burnt orange that owns interaction (term 5) worked against a ground biased
toward its own hue.

### Decision

Keep the family; spend its chroma differently. Roughly 60% of the parchment
chroma comes out of the grounds, the rule darkens, and the saving is spent on
the ink ramp (`#141A15` / `#2F382F` / `#4A534A`), on the signal (`#A94F21` over
a lighter well), and on light's chart marks (`--mk-line`, `--mk-primary-soft`,
`--mk-warn`, `--mk-danger`), all re-tuned to the new grounds. Shadows lose a
little weight, because a lighter sheet needs less of them to lift.

Every term of #736 stands: the desk is evergreen, the sheet is warm and still a
sheet, the measured signal is forest, orange owns interaction and nothing else
(term 5), grounds keep warmth and give up saturation so only marks carry chroma
(term 11), and dark is derived rather than inverted (term 9).

### Consequences

- Term 4 — every text ink clears 4.5:1 on all three grounds — holds with more
  headroom: worst text ratio 5.68:1, against 4.64:1 under parchment.
- `--ok`, `--primary` and `--notindata` are marks, not text, and never met 4.5:1
  in the parchment set either. They improve from 2.77–3.32:1 to 3.94–4.32:1
  against the deepest ground and clear the 3:1 graphics bar everywhere. Reading
  term 4 as covering them is the misreading to avoid — it covers the ink ramp.
- No behaviour changes. No threshold, support floor, direction or staging
  predicate is touched.
- The word "parchment" survives in `frontend/theme.css`'s rationale comments,
  where it records what a measurement was taken against. Those read historically
  and are not restated here; `frontend/index.html`'s `:root` block and
  `frontend/theme.css` remain the one source of truth for a colour.
- Deliberately **not** done: the `/ui-craft` lock ceremony — a mockup re-settle
  with attached fidelity screenshots. Verification was contrast measurement over
  the shipped token set plus the full backend and frontend suites. A surface
  that looks wrong under the new grounds is therefore a live risk this record
  accepts rather than one it has ruled out.

Decision: harmonichq/harmonic#37, 2026-08-18.
