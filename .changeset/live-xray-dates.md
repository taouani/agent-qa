---
"sf-agent-qa": patch
---

`xray.executionDates` now really fills the Test Execution's start and end dates: Xray's import ignored them, so they are set with a Jira edit on the new execution right after the import, under the same yes. A failed edit is reported with the recorded execution, never imported again.
