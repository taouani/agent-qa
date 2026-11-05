---
"sf-agent-qa": minor
---

`scripts` now ends with a review: you see every generated file whole, with the notes and the type check result, and on your own yes Agent-QA writes them to the repo through the policy layer (`policy.writes.testCode`). Files are only created, never replaced, all or none; `scripts-written@1` records what was written. In CI nothing is written (the pull request comes with the GitHub adapter).
