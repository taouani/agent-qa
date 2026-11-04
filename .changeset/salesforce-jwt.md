---
"sf-agent-qa": minor
---

Salesforce sign-in (slice 2): a `salesforce` section in agent-qa.yaml (login URL, consumer key, private key or key file, one user per role) and the JWT bearer flow of an External Client App. Each sign-in mints a single-use frontdoor URL; nothing is stored. `agent-qa doctor` signs in each role and explains OAuth errors.
