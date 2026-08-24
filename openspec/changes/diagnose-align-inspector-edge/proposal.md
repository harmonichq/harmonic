# Diagnose ALIGN returns to the inspector edge (#106)

## Why

After Sift was removed, its unused grid track remained in the Diagnose instrument
rail. ALIGN then ended at the inspector boundary instead of beginning there, and
the WINDOW control clipped at tablet width.

## What changes

- Restore the rail's two tracks so ALIGN begins at the inspector edge.
- Add S77, which exercises the served factor case and compares the two rendered
  left edges.
- Record the regression history and paired synthetic evidence in the frozen
  behavior ledger.
