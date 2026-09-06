# Anchor the Diagnose window label inside the glucose strip's own ruler (#366)

## Why

The Diagnose glucose-by-time-of-day strip prints the selected window's name in a
reserved band at the top of the plot. When the name is wider than the window it
belongs to, the strip moves it into whichever margin has more room instead, and
the module's own contract promises nothing is lost — the insufficient-sample
notice in particular "is a safety statement and rides with the head wherever it
goes."

The moved label is anchored at a fixed glucose value of 296 mg/dL. The strip's
ruler is not fixed: it is derived from the pooled envelope, and its ceiling is the
larger of 200 and the envelope's own rounded maximum. On the synthetic databases
the sweep drives, that ceiling is 220 and 260. The moved label is therefore placed
above the plot ceiling and nothing is painted. The inside placement is switched off
in the same branch, so the text is lost rather than moved, silently and with no
console error.

The safety half is worse. A window whose thinnest bin falls below the support floor
forces the "INSUFFICIENT SAMPLE — thinnest bin holds N" tail onto the label, which
makes it longer and so guarantees the outside path at ordinary desktop widths. A
reader who selects a named window sees a median trace with no statement that the
window's sample is too thin to read a median from. That is a safety statement the
surface promises and does not deliver.

The same constant anchors the wrapped window's CONTINUES marker, which tells a
reader that a window crossing midnight continues on the other side of the plot.
It never renders either, for the same reason.

## What changes

- Derive the moved label's anchor from the strip's resolved field range rather
  than from a glucose constant, so it lands on the plot for every ruler the pooled
  data can produce, and retire the constant. Seat its text on the line the inside
  placement occupies, which a left/right placement does not do from the anchor
  alone.
- Anchor the wrapped window's CONTINUES marker the same way; it shares the
  constant and the defect.
- Add a fail-first test through the chart module's public render entry point that
  derives its ruler from the shipped range producer instead of choosing one, so
  the assertion cannot be made green by picking a friendly ruler.

## Risk contract

- **Must prevent:** a window name or an insufficient-sample notice emitted into
  the chart option but painted off the plot; any label anchored to a constant the
  ruler can move past; a frontend gate that re-derives the support floor or any
  other backend verdict; a change to which placement — inside or outside — is
  chosen; a reordering of the parked label's option data.
- **Must recover:** nothing; no request, cache, state or lifecycle behavior
  changes.
- **Accepted failure:** the fit estimate stays an estimate. This change guarantees
  the anchor is on the plot, not that a given ruler leaves the inside placement
  roomy.
- **Unsupported:** the fit/no-fit decision and its tail-shedding priority order,
  the label's wording, the support floor itself, the chart's interaction behavior,
  and every screen other than Diagnose.
- **Evidence owed:** a fail-first assertion over the emitted chart option covering
  the narrow-window, thin-sample and wrapped-window cases — the anchor equal to
  the axis maximum read back from that option, and the placement fields that seat
  both labels on the inside placement's line — plus the repository's six-command
  fast gate green.

Disposition: inline in this proposal; the execution lock pins this commit rather
than restating it.

## Impact

The change is confined to the Diagnose glucose strip's chart module, its node
test, and this OpenSpec record. It changes no API, stored data, analyzer,
recommendation, safety predicate, staging verdict, or pump setting, and it moves
no other screen.
