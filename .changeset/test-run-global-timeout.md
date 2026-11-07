---
"sf-agent-qa": patch
---

Test runs (scripts, run-tests, debug) pass Playwright `--global-timeout` of 15 minutes, and Agent-QA's own kill limit for them is now 20 minutes. When tests hang until their own timeout, Playwright stops the run itself and still writes its report, so the failures so far come back, instead of a killed run with no report. A project's own `globalTimeout` is overridden by the 15 minutes.
