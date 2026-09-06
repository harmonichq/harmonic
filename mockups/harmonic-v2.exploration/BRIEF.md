# Harmonic v2 concept round

This round tests the hierarchy of one priority, evidence, and an active change.
It implements a synthetic design exploration for #348, not the application or
an approved visual lock. Product decisions live in
`openspec/changes/harmonic-v2/design.md`; the complete journeys live beside it.

## Shared decision

Can a wearer identify the next useful step, inspect where it comes from, and
follow one change to a recorded ending without being asked to interpret a
portfolio of charts? The first usable release must do this for both setting
and habit changes. The concept round compares hierarchy, not different rules.

An active change and its progress lead. Without one, a supported priority leads;
a real recurring concern without a supported action instead opens a guided look
at its episodes. The supplied late-bolus capture is the latter. Do not turn it
into a supported treatment recommendation.

## Three bets

- **Guided brief:** one readable recommendation or investigation, with evidence
  revealed in context and an explicit next action.
- **Glucose first:** the relevant trace is the main surface; a short guided
  sequence connects moments in it to the next useful decision.
- **Change journal:** a continuous account of the concern, decision, progress,
  and conclusion provides orientation and an enduring record.

Each concept uses the same material and inputs from `mockups/SCAFFOLD.md`.
Each demonstrates investigation, active follow-up, ready-to-judge, a historical
record, quiet, and ordinary error states, at desktop and narrow widths.
Show actual generated Trial progress when that case is selected. Historical
snapshots and new closure actions are explicitly illustrative in this round.
Do not imply the unrelated late-bolus and Trial captures describe one journey.

The shell utility buttons remain visible context only in this round. The
concepts must wire their own primary actions, evidence selection, conclusion,
and navigation; this is not yet a complete interaction lock or cutover proof.

## Material fidelity gate

Passed before concept fan-out on 2026-09-06. The empty shell and the shipped
Diagnose were rendered at 1280 × 720 and inspected side by side. Header,
footer, Inter, control material, and canvas match the shipped source. The
computed header was rgb(20, 18, 15), canvas rgb(15, 13, 11), header height 38px;
the browser reported no console errors. Inputs are generated from the exact
current source through `generate.py`, whose generation and --check passed.
The snapshots are session evidence; no claim of a completed v2 walkthrough or
approved visual lock follows from this empty-shell check.

## Setting-path preparation

The existing `setting-recommendation` QA recipe was also executed through
`qa_e2e_cases.execute_case` against its generated, read-only store. It yields
one asserting basal finding for 03:00–04:00, supported by 12 steady nights.
This is suitable source material for the selected concept's subsequent setting
choice and Plan walkthrough. The current concept round does not join that
case, the late-bolus investigation, and the Verify cases into a fictitious
continuous clinical history. Cross-candidate priority selection remains a
separate policy question; one asserting fixture row does not establish it.
