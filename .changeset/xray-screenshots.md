---
"sf-agent-qa": minor
---

`xray.attachScreenshots` (off by default): a failed test in a recorded Test Execution gets Playwright's failure screenshot as evidence. Screenshots can't be masked, so this sends what the page showed as it is; the audit log counts them.
