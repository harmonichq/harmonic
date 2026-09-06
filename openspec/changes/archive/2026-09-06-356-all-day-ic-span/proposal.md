# Proposal — all-day carb-ratio block span

## Why

The Diagnose findings queue names the all-day carb-ratio block `I:C 00:00 to
24:00`, taken from the server's own row label. Opening that row prints
`00:00–00:00` in the panel head, and staging it prints `I:C 00:00–00:00 · 5.60 →
5.70 g/U` in the watch dock — a zero-length interval for a block that covers the
whole day, contradicting the queue row one click above it.

The workstation builds a block's span from a bare clock formatter that reduces
minutes modulo one day, so the block's exclusive end 1440 renders as midnight.
The server does not have this problem: its own span label names the day's far
edge `24:00`, not `00:00`. Neither does the rest of the workstation — the chart
module already exports one span formatter carrying exactly that rule, and the
workstation already imports it for committed clock windows. The block span is a
second, wrong copy of a fact the module already owns.

## What changes

- Name a carb-ratio block's interval with the chart module's existing
  day-edge-aware span formatter, so an all-day block reads `00:00–24:00`
  everywhere that span is printed: the panel head, the watch dock, the
  peak-hour link, the window chip and the wrap sentence.
- Pin it with a test through the module's public interface that fails first
  against the current string.

## Boundaries

This change does not alter carb-ratio analysis, the `ic_asserts_move` staging
predicate, any safety floor, cap or verdict, the server's findings projection,
or block geometry — `wraps` and the drawn `spans` are computed separately from
the block's own minutes and are already correct for an all-day block. It changes
the span string only.

The basal slot head and the basal staged descriptor build their own span strings
from the same bare formatter and have the same latent day-edge shape. Neither is
reported here and neither is touched.
