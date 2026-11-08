---
"sf-agent-qa": minor
---

`run-tests` and `debug` pick tests by several tags: `"@a @b"` (both), `"@a|@b"` (either), `"@a @b|@c"`. Playwright lists the selection first, then only the tests with the tags run, by file and line. `headed: true` shows the browser (not in CI). `debug` takes `testRun`, a run-tests run id, to debug the same tests.
