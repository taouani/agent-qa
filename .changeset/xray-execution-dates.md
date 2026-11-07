---
"sf-agent-qa": minor
---

`xray.executionDates`: the Test Execution's own start and end date fields (Jira custom field ids), set when the execution is recorded, since Xray doesn't set them from the results. `xray.attachScreenshots` now sends a passed test's screenshot too (Playwright `screenshot: 'on'`), not only a failure's.
