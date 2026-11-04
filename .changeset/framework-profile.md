---
"sf-agent-qa": minor
---

Framework profile (slice 2): the `profile` workflow and `agent-qa profile` read the repo's Playwright project (playwright-bdd steps, page objects, fixtures, features, locator style) without running it, and on the user's yes save `agent-qa.profile.json`, the only commands Agent-QA may run there. `agent-qa run` no longer needs a models section for workflows that never ask a model.
