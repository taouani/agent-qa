---
"sf-agent-qa": minor
---

`test-cases` started from a key that an earlier run analyzed now asks first (`reuse` step) whether to reuse that analysis, but only when the issues are unchanged in Jira and the related feature files of the repo are the same; otherwise it analyzes again. `requirements@1` keeps the related files' paths and hashes (`related`) for this.
