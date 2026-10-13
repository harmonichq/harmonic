# Rebuild the app as a recommendations-first component library (#481)

## Why

Harmonic's engine is sound, but its interface grew into an exploration
workstation through three generations. Diagnose canvases, workspaces, evidence
drill-downs and plan staging bury the one thing the user came for: the change
most worth making, whether the change they made is working, and how they are
doing. The operator stopped using it.

## What Changes

- The app becomes five tabs: Queue, Changes, Overview, Day and Settings. Each
  owns only its own content. The information architecture, glossary and draft
  lock live in `docs/design/recommendations-redesign.md`.
- The frontend is rebuilt as a React + TypeScript component library with
  Storybook, on the existing Vite setup. Screens are composed only from approved
  components.
- The interface carries no explanatory prose, no predictions, and no value the
  engine does not serve.
- The engine, HTTP API and backend are unchanged by this change.
