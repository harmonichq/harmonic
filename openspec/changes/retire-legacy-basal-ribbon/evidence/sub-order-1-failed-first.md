# Sub-order 1 failed-first evidence

Issue #104, sub-order 1 recorded the required source-inventory red run before
deleting the unreachable basal ribbon block. The raw command output follows.

```text
✖ the unreachable basal ribbon inventory stays retired (#104) (0.827708ms)
✖ the live prompt-queue ribbon retains its explicit alias (#104) (0.402292ms)
ℹ tests 2
ℹ suites 0
ℹ pass 0
ℹ fail 2
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 47.747292

✖ failing tests:

test at frontend/retired-basal-ribbon.test.js:40:1
✖ the unreachable basal ribbon inventory stays retired (#104) (0.827708ms)
  AssertionError [ERR_ASSERTION]: basalTierMeta must stay retired
  
  true !== false
  
      at TestContext.<anonymous> (file:///Users/connor/worktrees/harmonic/104/frontend/retired-basal-ribbon.test.js:43:14)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1397:17)
      at startSubtestAfterBootstrap (node:internal/test_runner/harness:387:17) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at frontend/retired-basal-ribbon.test.js:50:1
✖ the live prompt-queue ribbon retains its explicit alias (#104) (0.402292ms)
  AssertionError [ERR_ASSERTION]: the retired chart-builder export must not be confused with the prompt-queue ribbon
  
  true !== false

      at TestContext.<anonymous> (file:///Users/connor/worktrees/harmonic/104/frontend/retired-basal-ribbon.test.js:53:10)
      at Test.runInAsyncScope (node:async_hooks:226:14)
      at Test.run (node:internal/test_runner/test:1397:25)
      at Test.processPendingSubtests (node:internal/test_runner/test:969:18)
      at Test.postRun (node:internal/test_runner/test:1457:19) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: true,
    expected: false,
    operator: 'strictEqual',
    diff: 'simple'
  }
```
