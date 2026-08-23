# Issue 93 QA campaign

This directory consolidates five independent Diagnose-only cold QA passes. It
is an index and provenance record; the accepted bug inventory is in
[`BUGS.md`](BUGS.md).

## Scope and evidence boundary

The campaign covered the Diagnose workstation, its findings queue, case files,
event charts, alignment controls, drill-down traces, and keyboard traversal.
Only bugs reproduced in live interaction and accepted by the reporting
threshold are included in `BUGS.md`. Materially identical reports are merged,
except pointer and keyboard failures, which remain separate user interaction
failures.

The passes used authorized synthetic browser state. No personal health values,
dates or times, credentials, tokens, screenshots, payloads, database details,
or local snapshot paths are recorded here. The invalid early write lane was
discarded, and the temporary copy was restored before the affected reruns.

## Source ledgers

| Reviewer lane | Ledger | Result |
| --- | --- | --- |
| Findings queue | [`findings-queue.md`](findings-queue.md) | 1 accepted bug; 2 hypotheses not reproduced |
| Graphs and alignment | [`graphs-align.md`](graphs-align.md) | 2 accepted bugs |
| Keyboard and assistive interaction | [`keyboard.md`](keyboard.md) | 2 accepted bugs; 1 inconclusive hypothesis |
| Drill-down and trace | [`drilldown-trace.md`](drilldown-trace.md) | 1 accepted bug |
| App-snob cold pass | [`app-snob.md`](app-snob.md) | No accepted bugs; 1 route candidate discarded |

## Campaign totals

- Accepted reproduced bugs: **6** (all P2; no P0 or P1 reports).
- Tested hypotheses not reproduced: **3**.
- Inconclusive hypotheses: **1**.
- Discarded harness or route artifacts: **2**.

## YOLO votes

These are feature votes, not bugs or commitments.

| Reviewer | Vote |
| --- | --- |
| Findings queue | Compare two Diagnose windows side by side, retaining the same Sift selection and case-file links. |
| Graphs and alignment | A chart-side plain-language sentence for the selected cohort and hover position. |
| Keyboard and assistive interaction | A keyboard-accessible Diagnose walkthrough with focus announced and restored to the originating row. |
| Drill-down and trace | A persistent Diagnose trace handoff linking the selected occurrence and evidence context across case files. |
| App-snob cold pass | A read-only review trail for case files opened during the current Diagnose session. |
