---
"sf-agent-qa": minor
---

`xray.attachScreenshots` (off by default): a failed test in a recorded Test Execution gets Playwright's failure screenshot as evidence. Screenshots can't be masked, so this sends what the page showed as it is; the question and the audit log count them. The run folder keeps only a hash of each screenshot's path, never the path (it holds the test title).
