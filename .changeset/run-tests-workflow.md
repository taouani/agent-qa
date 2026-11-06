---
"sf-agent-qa": minor
---

`run-tests` workflow (slice 3, S3-2): runs a chosen part of the repo's own Playwright suite, not only generated tests: spec or feature paths (a spec may name a line), a title text, a tag, a project, or the failed and flaky tests of an earlier JSON report (from CI too). It asks the person before anything runs and records the result as `test-run@1`, masked.
