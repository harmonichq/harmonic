# #404 generated triage facts

These are complete, unedited outputs from the listed read-only commands. Source
reads establish code facts; they do not claim runtime behavior or a passing
implementation. Commands run at the ticket worktree.

## Fact 1

Command: `git rev-parse HEAD`

```text
56eb22467b0705c1516f51af06add59bb93979ce
```

Exit status: 0

## Fact 2

Command: `sed -n 194,205p ciq_autotune/findings_projection.py`

```text
    def project(
        self, query: WindowQuery, selected_id: Optional[str] = None, *,
        analysis_generation: str = "standalone:0",
    ) -> dict:
        rows = self._parameter_rows(query, scoped=query.scoped)
        rows += self._finding_rows(query)
        rows += self._history_rows(query)
        pattern_by_subject = {}
        if not query.scoped:
            pattern_rows, pattern_by_subject = self._pattern_rows(rows, query)
            rows += pattern_rows
        rows.sort(key=lambda row: _sort_key(row, pattern_by_subject))
```

Exit status: 0

## Fact 3

Command: `sed -n 92,98p frontend-v2/history.js`

```text
export function openRecord(kind, id) {
  memory.open = { kind, id: String(id) };
  memory.roster = null;
  navigate('changes', { subject: 'history', occurrence: `record:${kind}:${id}` });
  memory.mode = 'original';
  memory.record = null;
}
```

Exit status: 0

## Fact 4

Command: `sed -n 45,55p frontend-v2/focus-entry.js`

```text
    async start(subject) {
      if (saving) return null;
      const offered = candidate(subject);
      if (!offered || !source) return null;
      if (!attempt || attempt.subject !== subject) attempt = { subject, id: crypto.randomUUID() };
      saving = true; failure = null; changed();
      try {
        const saved = await api.pinFocus(null, { pattern_key: offered.key, subject: offered.subject,
          request_id: attempt.id, input_revision: roster.input_revision,
          analysis_generation: source.analysis_generation });
        attempt = null; roster = null; source = null;
```

Exit status: 0

## Fact 5

Command: `sed -n 66,71p frontend-v2/frame.js`

```text
export function loadingFrame(title) {
  return desk(
    `<section class="pane gf-stage" aria-label="${e(title)}"><div class="gf-loading" role="status" aria-label="Loading ${e(title)}"></div></section>`,
    `<aside class="pane gf-reading" aria-label="${e(title)}">${readingHeader(e(title))}<div class="gf-pane-body"></div></aside>`,
  );
}
```

Exit status: 0

## Fact 6

Command: `sed -n 2121,2132p frontend/diagnose-workstation.js`

```text
  const chartEntry = (descriptor) => DIAGNOSE_EVIDENCE_CHARTS
    .find((entry) => entry.kind === descriptor?.kind);
  /* Selection belongs to the standing case file, while descriptor data belongs
     to the tile's selection-free request. Present the active case without
     mutating fetch-owned state that an in-flight tile response can replace. */
  const tileCaseFile = (descriptor) => {
    const frame = top();
    return ['event-comparison', 'eating-sequence'].includes(descriptor.kind)
      && frame.k === 'factor' && frame.rowId === descriptor.chartId
      && frame.caseFile?.projection?.alignment === 'event'
      ? frame.caseFile : descriptor.data;
  };
```

Exit status: 0

## Fact 7

Command: `sed -n 80,93p frontend/diagnose-event-comparison.js`

```text
    silent: true, showSymbol: false, data: episode.glucose.map((point) => [point.minute, point.bg]),
    lineStyle: { color, type: STYLE[cohort.key].lineType, width: 1,
      opacity: selectedCohort ? (selectedCohort === cohort.key ? .72 : .18) : .42 }, z: 1,
  }));
}

function selectedSeries(surface, detail) {
  if (!detail) return [];
  return [{ id: 'selected:trace', name: 'Selected trace', type: 'line', silent: true,
    showSymbol: false, data: detail.glucose.map((point) => [point.minute, point.bg]),
    lineStyle: { color: css(surface, '--ec-focus'), width: 2.5 }, z: 6 }];
}

function legend(surface, caseFile, selected) {
```

Exit status: 0

## Fact 8

Command: `sed -n 158,177p ciq_autotune/analyzers/scenario/levers.py`

```text
# Where each lever's CONSEQUENCE lands — the anchor kind that answers "how did this
# end?", as opposed to the exposure above, which is the opportunity the lever is
# counted against (#730, lock term 39). Exploring by time means "how did I get here",
# so a finding belongs to the hours holding its outcome: an over-treated low is read
# in the window of the rebound it caused, never in the window of the low that
# triggered it. The values are scenario anchor kinds (``low`` / ``high`` / ``meal`` /
# ``correction``). A lever whose consequence *is* its own anchor still declares one,
# so the set stays closed and a new lever has to answer the question.
_OUTCOME_KIND = {
    Lever.HIGH_CARB_SEQUENCE: "sequence",
    Lever.REPEAT_EATING: "sequence",
    Lever.CARB_UNDERCOUNT: "high",       # the run-away high after the meal
    Lever.LATE_BOLUS: "high",            # the peak the late dose never caught
    Lever.MEAL_OVER_DELIVERY: "low",     # the drop the strong meal dose left behind
    Lever.OVER_TREATED_LOW: "high",      # the rebound, never the low that triggered it
    Lever.CORRECTION_STACKING: "low",    # the overshoot the stacked doses carried into
    Lever.CORRECTION_ON_IOB: "low",      # the low the doubled-up insulin reached
    Lever.MISSED_MEAL: "high",           # the un-bolused rise itself
    Lever.MEAL_BOLUS_SHORT: "high",      # the run-away the meal dose did not cover
}
```

Exit status: 0

## Fact 9

Command: `sed -n 87,119p ciq_autotune/window_membership.py`

```text
def outcome_minute(occurrence: dict, exposures_payload: dict) -> Optional[int]:
    """Return the clock minute where an occurrence's consequence landed."""
    anchors = _episode_anchors(exposures_payload.get("exposures") or {})
    return _outcome_minute(occurrence, anchors)


def _episode_anchors(families: dict) -> Dict[str, List[Tuple[int, str]]]:
    anchors: Dict[str, List[Tuple[int, str]]] = {}
    for family, payload in families.items():
        kind = _KIND_FOR_FAMILY.get(family, family)
        for occurrence in payload.get("occurrences") or []:
            anchors.setdefault(occurrence.get("ep_id"), []).append(
                (_minute_of(occurrence["t"]), occurrence.get("kind", kind)))
    return anchors


def _outcome_minute(occurrence: dict, anchors: Dict[str, List[Tuple[int, str]]]) -> Optional[int]:
    if occurrence.get("outcome_minute") is not None:
        return occurrence["outcome_minute"]
    kind = outcome_kind(occurrence.get("cause_lever"))
    if kind == "sequence":
        return None
    if kind is not None:
        landings = [minute for minute, anchor_kind
                    in anchors.get(occurrence.get("ep_id"), [])
                    if anchor_kind == kind]
        if landings:
            return max(landings)
    return _minute_of(occurrence["t"])
```

Exit status: 0

## Fact 10

Command: `sed -n 531,546p ciq_autotune/findings_projection.py`

```text
    # --- findings: outcome-anchored membership + window-local denominators -----

    def _finding_rows(self, query: WindowQuery) -> List[dict]:
        families = (self._exposures.get("exposures") or {})
        # Every occurrence, re-anchored to its finding's outcome, kept only where
        # that outcome lands inside the window. The family denominator is filtered
        # by the same anchor, so it can never be smaller than what it denominates.
        in_window: Dict[str, List[dict]] = {}
        all_occurrences: Dict[str, List[dict]] = {}
        for family, payload in families.items():
            all_occurrences[family] = list(payload.get("occurrences") or [])
            kept = [
                occurrence for occurrence in all_occurrences[family]
                if query.contains(outcome_minute(occurrence, self._exposures))
            ]
            in_window[family] = kept
```

Exit status: 0

## Fact 11

Command: `sed -n 386,397p ciq_autotune/follow_up_comparison.py`

```text
            if pattern_key:
                sources = {}
                for family, anchor_kind in (("meals", "meal"), ("lows", "low")):
                    owned = [{"t": anchor.t.strftime(_FMT)} for anchor in anchors
                             if anchor.kind.value == anchor_kind and lo <= anchor.t < hi]
                    sources[family] = {"n": len(owned), "occurrences": owned}
                criterion = opportunity_readiness(pattern_key, {}, {"exposures": sources})
                arm.update({
                    **criterion, "observed": criterion["count"], "required": criterion["gate"],
                    "criterion_met": criterion["verdict"] == "ready", "required_elapsed_days": None,
                })
            comparison["readiness"][name] = arm
```

Exit status: 0

## Fact 12

Command: `rg -n DEFAULT_OUTPUT scripts/gen_qa_e2e_db.py`

```text
16:DEFAULT_OUTPUT = REPO_ROOT / "mockups" / "qa-e2e.synthetic" / "harmonic.sqlite"
75:    output = (args.out or DEFAULT_OUTPUT).resolve()
```

Exit status: 0

## Fact 13

Command: `rg -n 'S101:|S100:' frontend-v2/replay-cases.mjs`

```text
15:  S101: 'showcase', S102: 'pattern-near-tie', S103: 'showcase', S104: 'showcase', S105: 'c3-trial',
16:  S100: 'showcase', R18: 'c4-history', R5: 'basal-lower', R8: 'behavioral-carb-undercount', R10: 'ic-lower', R17: 'c3-trial',
```

Exit status: 0

## Runtime receipts

The dated commands and raw replay locators in `docs/scope/404-v2-findings-ledger.md`
are the runtime evidence. New behavior is still prospective. The full base replay
and supplemental screenshot probes must be recorded before source admission;
structural validation alone does not satisfy those obligations.


## Structural validation receipt

Command: `npx --yes @fission-ai/openspec@1 validate v2-findings-ledger --strict`

```text
Change 'v2-findings-ledger' is valid
```

Exit status: 0

The complete base replay and targeted synthetic chart/geometry receipts are now
recorded in the scope ledger's Full base replay section. Its limitations remain
binding; these results do not claim an implementation pass or review verdict.

## Closed execution path inventory

Command: `git ls-files -- CONTEXT.md DESIGN.md PRODUCT.md ciq_autotune/analyzers/scenario/levers.py ciq_autotune/analyzers/scenario/outcome_patterns.py ciq_autotune/api.py ciq_autotune/event_comparison.py ciq_autotune/explore_exposures.py ciq_autotune/finding_case_file.py ciq_autotune/findings_projection.py ciq_autotune/follow_up_comparison.py ciq_autotune/result_cache.py ciq_autotune/store.py ciq_autotune/watched_change.py ciq_autotune/window_membership.py docs/scope/404-v2-findings-ledger.md frontend-v2/c4.replay.mjs frontend-v2/c4.replay.test.js frontend-v2/day.js frontend-v2/day.test.js frontend-v2/desk.css frontend-v2/diagnose-context.js frontend-v2/diagnose-context.test.js frontend-v2/diagnose.js frontend-v2/diagnose.test.js frontend-v2/focus-entry.js frontend-v2/focus-entry.test.js frontend-v2/follow-up.js frontend-v2/follow-up.test.js frontend-v2/frame.js frontend-v2/frame.test.js frontend-v2/history.js frontend-v2/history.test.js frontend-v2/plan-view.js frontend-v2/plan-view.test.js frontend-v2/replay-cases.mjs frontend/__fixtures__/findings-projection.json frontend/diagnose-event-comparison.js frontend/diagnose-event-comparison.test.js frontend/diagnose-evidence-charts.js frontend/diagnose-evidence-charts.test.js frontend/diagnose-workstation.css frontend/diagnose-workstation.js frontend/diagnose-workstation.test.js frontend/findings-projection-mirror.test.js frontend/harmonic-v2-desktop-behavior.replay.mjs frontend/occurrence-roster.js frontend/occurrence-roster.test.js mockups/INDEX.md mockups/findings-projection.mirror.mjs mockups/harmonic-v2-desktop.behavior.md mockups/qa-e2e.synthetic/harmonic.sqlite openspec/changes/diagnose-finding-case-files/design.md openspec/changes/harmonic-v2/contracts.md openspec/changes/harmonic-v2/design.md openspec/changes/harmonic-v2/journeys.md openspec/changes/v2-findings-ledger/design.md openspec/changes/v2-findings-ledger/proposal.md openspec/changes/v2-findings-ledger/specs/behavioral-layer/spec.md openspec/changes/v2-findings-ledger/specs/durable-follow-up/spec.md openspec/changes/v2-findings-ledger/specs/surfaces/spec.md openspec/changes/v2-findings-ledger/tasks.md openspec/changes/v2-findings-ledger/triage-facts.md scripts/gen_findings_projection_fixtures.py scripts/gen_qa_e2e_db.py scripts/qa_e2e_cases.py tests/test_durable_follow_up.py tests/test_event_comparison.py tests/test_explore_exposures.py tests/test_finding_case_file.py tests/test_finding_case_file_api.py tests/test_findings_projection.py tests/test_follow_up_comparison.py tests/test_follow_up_store.py tests/test_gen_qa_e2e_db.py tests/test_outcome_patterns.py tests/test_qa_e2e_cases.py tests/test_watched_change.py`

```text
CONTEXT.md
DESIGN.md
PRODUCT.md
ciq_autotune/analyzers/scenario/levers.py
ciq_autotune/analyzers/scenario/outcome_patterns.py
ciq_autotune/api.py
ciq_autotune/event_comparison.py
ciq_autotune/explore_exposures.py
ciq_autotune/finding_case_file.py
ciq_autotune/findings_projection.py
ciq_autotune/follow_up_comparison.py
ciq_autotune/result_cache.py
ciq_autotune/store.py
ciq_autotune/watched_change.py
ciq_autotune/window_membership.py
docs/scope/404-v2-findings-ledger.md
frontend-v2/c4.replay.mjs
frontend-v2/c4.replay.test.js
frontend-v2/day.js
frontend-v2/day.test.js
frontend-v2/desk.css
frontend-v2/diagnose-context.js
frontend-v2/diagnose-context.test.js
frontend-v2/diagnose.js
frontend-v2/diagnose.test.js
frontend-v2/focus-entry.js
frontend-v2/focus-entry.test.js
frontend-v2/follow-up.js
frontend-v2/follow-up.test.js
frontend-v2/frame.js
frontend-v2/frame.test.js
frontend-v2/history.js
frontend-v2/history.test.js
frontend-v2/plan-view.js
frontend-v2/plan-view.test.js
frontend-v2/replay-cases.mjs
frontend/__fixtures__/findings-projection.json
frontend/diagnose-event-comparison.js
frontend/diagnose-event-comparison.test.js
frontend/diagnose-evidence-charts.js
frontend/diagnose-evidence-charts.test.js
frontend/diagnose-workstation.css
frontend/diagnose-workstation.js
frontend/diagnose-workstation.test.js
frontend/findings-projection-mirror.test.js
frontend/harmonic-v2-desktop-behavior.replay.mjs
frontend/occurrence-roster.js
frontend/occurrence-roster.test.js
mockups/INDEX.md
mockups/findings-projection.mirror.mjs
mockups/harmonic-v2-desktop.behavior.md
mockups/qa-e2e.synthetic/harmonic.sqlite
openspec/changes/diagnose-finding-case-files/design.md
openspec/changes/harmonic-v2/contracts.md
openspec/changes/harmonic-v2/design.md
openspec/changes/harmonic-v2/journeys.md
openspec/changes/v2-findings-ledger/design.md
openspec/changes/v2-findings-ledger/proposal.md
openspec/changes/v2-findings-ledger/specs/behavioral-layer/spec.md
openspec/changes/v2-findings-ledger/specs/durable-follow-up/spec.md
openspec/changes/v2-findings-ledger/specs/surfaces/spec.md
openspec/changes/v2-findings-ledger/tasks.md
openspec/changes/v2-findings-ledger/triage-facts.md
scripts/gen_findings_projection_fixtures.py
scripts/gen_qa_e2e_db.py
scripts/qa_e2e_cases.py
tests/test_durable_follow_up.py
tests/test_event_comparison.py
tests/test_explore_exposures.py
tests/test_finding_case_file.py
tests/test_finding_case_file_api.py
tests/test_findings_projection.py
tests/test_follow_up_comparison.py
tests/test_follow_up_store.py
tests/test_gen_qa_e2e_db.py
tests/test_outcome_patterns.py
tests/test_qa_e2e_cases.py
tests/test_watched_change.py
```

Exit code: 0

## Registered revision stories

Command: `node --input-type=module -e 'import {REGISTRY} from '"'"'./frontend/harmonic-v2-desktop-behavior.replay.mjs'"'"'; console.log(JSON.stringify({issued:REGISTRY.length,active:REGISTRY.filter(([id])=>!id.startsWith('"'"'R'"'"')).length,retired:REGISTRY.filter(([id])=>id.startsWith('"'"'R'"'"')).length}));'`

```text
{"issued":137,"active":119,"retired":18}
```

Exit code: 0
