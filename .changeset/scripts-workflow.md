---
"sf-agent-qa": minor
---

New `scripts` workflow: writes Playwright code (specs, or Gherkin scenarios and missing step definitions for playwright-bdd) for reviewed test cases, from the reviewed framework profile, the Salesforce pack and an optional exploration. The server checks the code and keeps it as `scripts-draft@1` for review; nothing is written to the repo yet.
