---
"sf-agent-qa": patch
---

`debug` reads every error of a failed test, not only the first: on a test timeout, the error that names the waiting locator and its call log comes second. It shows the repo files those errors and their stacks point at (page objects, step definitions), and never the generated playwright-bdd specs in `.features-gen`, which git ignores. A failure's reason may be up to 1,000 characters (debug and the scripts run-and-fix loop). Since a test run's failure now holds every error and is placed at the innermost line of the repo's own code, `run-tests` results and Xray failure comments show those too.
