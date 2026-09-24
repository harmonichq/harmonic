# Design — chrome-bar-signal

## ADR 47 — The chrome bar cannot share the sheet's accent

**Ruling.** The cockpit chrome bar carries its own signal, derived against its
own ground, in each theme: `--ck-bar-signal` `#F79D60` light / `#DC7B42` dark,
over a well `--ck-bar-signal-well` `#874928` / `#64361E`, inked with
`--ck-bar-on-signal` (the bar's own ground). `--ck-accent` and
`--ck-accent-soft` inside `.cockpit-topbar` / `.cockpit-footer` are aliases of
those. The bar's signal is **never** the sheet's `--wk-signal` / `--primary`,
and this record exists so that is not re-litigated at the next relight.

### Context

`--ck-accent` has four scopes. Three of them track the sheet correctly —
`:root` via `--wk-signal`, `.dw` via `--primary`, `.vw` via `--mk-primary`. The
fourth, the chrome bar's, carried two literals: `#B35B2E` light and `#D2743E`
dark, with `--ck-accent-soft: #8F4524`.

The light pair was a **verbatim copy of the pre-ADR-37 light primary ramp**.
Before that relight `--primary` was `#B35B2E` and `--primary-600` was `#8F4524`.
ADR 37 moved the ramp to `#A94F21` / `#87401A` to clear the new bone sheet. The
bar's copy did not move, because nothing connected them — and nothing could
have, because as the arithmetic below shows, nothing should.

Nine accent pairs failed on the light bar and five on the dark one. The focus
ring and the plan badge sat at 2.89:1 against a 3:1 floor; the "Log carbs" `+`
and the checked theme name at 2.22:1 against 4.5:1; the current-step disc at
1.46:1 against its own plate. In dark, white ink on the signal measured 3.33:1.

### The empty band

The obvious repair — point the bar at `--primary`, one orange everywhere — is
not merely undesirable. It is arithmetically impossible, and this is the part
worth keeping.

The light chrome bar is dark evergreen `#183326`. The light sheet is bone
`#FAF8F4`. A single accent would have to satisfy both at once:

| ground | role | requirement | in relative luminance |
| --- | --- | --- | --- |
| bone `#FAF8F4` (L .9399) | signal used as text | 4.5:1 | accent **L ≤ .1700** |
| evergreen `#183326` (L .0270) | signal used as a mark | 3:1 | accent **L ≥ .1811** |

`L ≤ .1700` and `L ≥ .1811` have no intersection. The band is empty by .0111,
and it is empty for a structural reason, not a tuning one: the two grounds sit
at opposite ends of the lightness range, so a value light enough to be seen on
one is too light to be read on the other.

This also explains both neighbouring values exactly. ADR 37 darkened `--primary`
to `#A94F21` (L .1414) **specifically** to clear bone, taking it from 4.45:1 to
5.17:1 — which is precisely what drove it below the bar's floor, where it
measures 2.48:1. The retired `#B35B2E` (L .1726) landed inside the gap and
cleared neither end: 4.45:1 on bone, 2.89:1 on the bar.

The consequence is counter-intuitive and worth stating plainly, because it is
what makes the aliasing instinct wrong: **light's chrome bar needs a *lighter*
signal than dark's does.** Light's bar panel is `#244638` (L .0504); dark's is
`#2B241D` (L .0186). The lighter ground is the more demanding one, so light's
bar floors at L .4018 and dark's at L .2589 — the opposite of how the sheet's
ramp moves between themes.

### Decision

Give the bar its own token, named for the ground it serves, and derive it from
the heaviest job it actually does.

That job is **text**, not marks: the `+` glyph in "Log carbs" and the checked
row in the theme menu are both accent-inked strings on `--ck-panel`. Clearing
4.5:1 there is the binding constraint, and every 3:1 mark on the ground or panel
follows from it for free. So the rule a future editor re-derives against is one
line: *the bar's signal clears 4.5:1 as text on `--ck-panel`.*

- Light `#F79D60` (L .4470) — 4.95:1 on the panel, 6.46:1 on the ground.
- Dark `#DC7B42` (L .2960) — 5.07:1 on the panel, 6.08:1 on the ground.

Both stay in the shipped family's hue and saturation trajectory (H 22–24,
S .61–.70); light's value is one step further along the same ramp that already
produced dark's `--primary-600` `#EF9459`. Dark's previous `#D2743E` did clear
its panel, but at 4.60:1 — 0.10 above the floor — and it was byte-identical to
the sheet's dark `--wk-signal`, an accidental identity that invites exactly the
aliasing this record forbids. It moves for margin and for independence.

A signal that light cannot carry white ink, so `--ck-bar-on-signal` is the bar's
own ground punched out of the disc (6.46:1 light, 6.08:1 dark). That replaces
the chrome block's `--on-primary: #ffffff` override, which was the last member
of the copied ramp and was already failing dark at 3.33:1. Removing the override
also stops the bar silently re-defining a global token for everything inside it.

The well deepens so the current-step disc reads against its own plate: light
`#874928` (L .1000), dark `#64361E` (L .0550), giving 3.30:1 and 3.33:1.

### Consequences

- Every accent pair on the bar clears its floor in both themes. Light goes from
  nine failures to none; dark from five to none.
- **The well's band is empty too, and the border resolves it.** A plate that
  sits 3:1 *under* the disc cannot also sit 3:1 *above* the bar: in dark the disc
  caps the well at L .0659 while the bar floors it at L .1216. The plate is
  therefore delineated by its border, which measures 7.54:1 light and 7.82:1
  dark against the bar, not by its fill (1.96:1 / 1.83:1). Both fills sat below
  3:1 before this change as well; they moved slightly further down to buy the
  disc its separation, which is the right trade because the disc has no border
  of its own against the plate and the plate does.
- The theme menu's hover row fill is likewise below 3:1 (1.50:1 / 1.52:1) and
  likewise not a WCAG failure: hover is transient, it carries no state the row
  does not otherwise show, and the row's own ink measures 5.17:1 / 6.03:1.
- `#B35B2E` now survives in exactly two places, the `.cockpit-mark` square and
  the favicon, which are one object. It stays there: the mark is identity rather
  than interaction, a logotype carries no contrast minimum, and the same square
  rides a dark chrome bar and a light browser tab strip — the empty band again,
  in miniature, where a constant is the only stable answer. `#A94F21` would help
  the tab strip (3.60 → 4.19) and hurt both bars (2.89 → 2.48). Lock #736 pins
  the mark as one constant object across themes and `frontend/index.test.js`
  pins that it does not read `--ck-accent`; neither is reopened here.
- No behaviour changes. No threshold, support floor, direction or staging
  predicate is touched.
- The mobile `.cockpit-drawer` is a sibling of the bar, not a descendant, so it
  keeps `:root`'s sheet-derived accent over its bone panel. That is correct and
  is left alone.
- Deliberately **not** done: the `/ui-craft` lock ceremony. Verification was
  contrast measurement over the shipped token set, compositing the real stack,
  plus the fast gate and the two browser suites that render this chrome.

Decision: harmonichq/harmonic#47, 2026-08-19.
