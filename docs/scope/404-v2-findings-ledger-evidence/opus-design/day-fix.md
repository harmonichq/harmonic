Implemented and committed the Day correction.

Commit: `c98f3464344cd49f3baeffe97b908134aec53018`

- Day retained reads now re-seat the existing chart from `memory.day` after route cleanup, preserving the same stage/navigator nodes and loading treatment.
- Browser regression proves chart series exist before request, while held, and after settlement at both sizes.
- Corrected the Filter selector comment to describe the real cascade.
- Renamed the v1 Filter capture to its actual size: [v1-filter-resting-1440x900.png](v1-filter-resting-1440x900.png).

Marker reuse disposition: no change. `mealMemberMarkers` accepts history-run payloads and deliberately falls back to its explicit history rail; selected Pattern markers accept singular case-file markers and must omit unknown glucose. Reusing it would change the missing-evidence contract, so separate implementations are correct.

Proof:

- Fail-first: [day-retained-fail-first.log](day-retained-fail-first.log) — both sizes failed with `chart:false, series:0` while held.
- Final: [day-retained-final.log](day-retained-final.log) — 2 passed.
- `npm run build` passed.
- Focused Node: 42 passed.
- Extraction drift check passed.

Corrected synthetic captures:

- [1280×720](day-retained-loading-1280x720.png)
- [1440×900](day-retained-loading-1440x900.png)

No full ledgers were run.
