# Proposal — Diagnose Occurrence roster keys

## Why

A keyboard reader moves through a Finding case file's Occurrences in the order
they are drawn: top to bottom. Left and Right previously stepped that vertical
roster and let chart cursor keys double-fire into a selected Occurrence.

## What changes

- Up and Down step the selected Occurrence without wrapping.
- Left and Right no longer step the roster.
- The selected roster row regains focus after its asynchronous case-file render.
- Event-chart focus retains ownership of its own keys.

## Boundaries

This changes no finding population, case-file content, chart cursor behavior,
window, breadcrumb, advice, or pump-facing behavior.
