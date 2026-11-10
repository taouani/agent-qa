---
"sf-agent-qa": patch
---

Breaking: `playwright.testDir` and `playwright.profile` are removed from `agent-qa.yaml`. Nothing read them: the reviewed framework profile (`agent-qa.profile.json`) says where the tests are. A config that still has them is refused with the key's name; delete the two lines. Azure DevOps is now marked untested in the docs: it hasn't run against a real org yet.
