---
"sf-agent-qa": patch
---

Test runs (scripts, run-tests, debug) pass Playwright `--global-timeout`, two minutes under Agent-QA's 15-minute kill limit. When tests hang until their own timeout, Playwright now stops the run itself and still writes its report, so the failures so far come back, instead of a killed run with no report.
