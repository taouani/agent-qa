---
"sf-agent-qa": patch
---

`debug` reads every error of a failed test, not only the first: on a test timeout, the error that names the waiting locator and its call log comes second. It shows the repo files those errors and their stacks point at (page objects, step definitions), and never the generated playwright-bdd specs in `.features-gen`, which git ignores. A failure's reason may be up to 1,000 characters.
