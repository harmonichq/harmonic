# ISF staging evidence

All evidence here comes from the committed synthetic Diagnose payload and the
generated `mockups/revise-e2e.synthetic/harmonic.sqlite` database. It contains no
patient data.

The before state is commit `21df720`, after the backend verdict existed but before
the shipped Diagnose and Plan consumers were changed. The revision state is the
ticket branch after those consumers were changed. The same rounded-strengthen row
has `asserts_move = false` in both states.

| Viewport and theme | Before | After |
|---|---|---|
| 1440×900 light | [render](before/false-drilled-1440x900-light.png) | [render](after/false-drilled-1440x900-light.png) |
| 1440×900 dark | [render](before/false-drilled-1440x900-dark.png) | [render](after/false-drilled-1440x900-dark.png) |
| 1280×800 light | [render](before/false-drilled-1280x800-light.png) | [render](after/false-drilled-1280x800-light.png) |
| 1280×800 dark | [render](before/false-drilled-1280x800-dark.png) | [render](after/false-drilled-1280x800-dark.png) |

Before, the direction-derived queue row still prints an action number and the new
regression fails on `nums: 1`. After, the row keeps its asserted register and all
evidence, but Recommended is empty and there is no action number or stage control.

Raw output:

- [historical regression](logs/before-regression.log)
- [revision browser suite](logs/revision-browser.log)
- [revision app replay under a hostile ambient source override](logs/revision-replay.log)
