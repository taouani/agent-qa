---
"sf-agent-qa": patch
---

Test Executions in Xray: each test run now has its start and finish time, and dates are sent without milliseconds (`2026-11-07T20:00:13+00:00`), as Xray's JSON examples write them. A failed test's comment holds where it failed, the whole masked error with Playwright's call log, and the code around it (up to 4,000 characters), instead of the error's first line.
