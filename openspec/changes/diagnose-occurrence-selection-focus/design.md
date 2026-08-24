# Design — In-place Occurrence selection focus (#105)

This change makes no new product or visual decision. ADR 101 in
`openspec/changes/diagnose-occurrence-roster-keys/design.md` already settles
the render-path focus restoration for an Occurrence request: the requested
rendered row regains focus after its asynchronous case-file render completes.

#105 measured that existing mechanism rather than adding another. The probe's
deciding output was:

```text
highest existing S id: S80 -> next free: S81
roster stepping handler: POST-#101 (Up/Down only) -> #101's KEYS have landed
roster focus restore: PRESENT
STORIES at tip: 98
```

S81 selects the second rendered Occurrence directly, waits for its selected
state, and asserts that the selected row holds focus with a case-file breadcrumb
depth of two. It passed under the existing #101 implementation, so #105 records
PATH A: a regression guard and frozen evidence record only. No new ADR is
warranted.
